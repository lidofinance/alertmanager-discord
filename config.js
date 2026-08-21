// Reading the hooks config, and noticing when it changes.
//
// The file is replaced by a rename, which gives it a new inode, so this polls the path with stat()
// instead of using fs.watch: a watch bound to the file goes silent after the first replacement.
// Picking a change up matters because a webhook stays valid until someone deletes it, so a config
// that was never re-read looks like a healthy service.

const fs = require("fs");
const yaml = require("js-yaml");

const DEFAULT_CONFIG_PATH = "/etc/alertmanager-discord.yml";
const DEFAULT_POLL_INTERVAL_IN_SECONDS = 10;

const discordHookRegExp = new RegExp(
  "^https://discord(?:app)?\\.com/api/webhooks/[0-9]+/[a-zA-Z0-9_-]+$"
);
const slackHookRegExp = new RegExp("^https://hooks\\.slack\\.com/services/[^/]+/[^/]+/[^/]+$");

function readConfig(path) {
  return yaml.load(fs.readFileSync(path));
}

function parseRoutes(hooks) {
  const routes = {};
  const webhookTokens = [];
  const validTypes = new Set(["discord", "slack"]);
  const webhookSearchPatterns = {
    discord: "/api/webhooks/",
    slack: "/services/",
  };

  for (const route of hooks) {
    const type = (route.type || "discord").toLowerCase();
    if (!validTypes.has(type)) {
      throw new Error(`Unsupported hook type "${route.type}" for slug "${route.slug}"`);
    }

    if (!route.slug) {
      throw new Error("Hook entry is missing slug");
    }

    if (!route.hook || typeof route.hook !== "string") {
      throw new Error(`Hook entry for slug "${route.slug}" is missing hook URL`);
    }

    const hookMatches =
      type === "discord" ? discordHookRegExp.test(route.hook) : slackHookRegExp.test(route.hook);

    if (!hookMatches) {
      throw new Error(`Invalid ${type} webhook URL for slug "${route.slug}"`);
    }

    if (routes[route.slug]) {
      throw new Error(`Duplicate slug "${route.slug}"`);
    }

    routes[route.slug] = { type, hook: route.hook };

    const webhookPatternIndex = route.hook.indexOf(webhookSearchPatterns[type]);
    if (webhookPatternIndex !== -1) {
      const webhookToken = route.hook.substring(
        webhookPatternIndex + webhookSearchPatterns[type].length
      );
      webhookTokens.push(webhookToken);
    }
  }

  return { routes, webhookTokens };
}

// Throws on an unreadable file, unparseable YAML, or an invalid hook entry.
function loadRoutes(path) {
  const config = readConfig(path);

  if (config == null || !Array.isArray(config.hooks)) {
    return { routes: {}, webhookTokens: [] };
  }

  return parseRoutes(config.hooks);
}

// One line naming what actually changed, or null when the file changed but the routes did not.
// Slugs only: the URLs are the secret.
function describeRouteChanges(previous, next) {
  const added = Object.keys(next).filter((slug) => previous[slug] === undefined);
  const removed = Object.keys(previous).filter((slug) => next[slug] === undefined);
  const repointed = Object.keys(next).filter(
    (slug) =>
      previous[slug] !== undefined &&
      (previous[slug].hook !== next[slug].hook || previous[slug].type !== next[slug].type)
  );

  const parts = [];
  if (added.length > 0) {
    parts.push(`added ${added.join(", ")}`);
  }
  if (removed.length > 0) {
    parts.push(`removed ${removed.join(", ")}`);
  }
  if (repointed.length > 0) {
    parts.push(`re-pointed ${repointed.join(", ")}`);
  }

  return parts.length > 0 ? parts.join("; ") : null;
}

function readMtime(path) {
  try {
    // Nanoseconds: two renders can land inside the same millisecond.
    return fs.statSync(path, { bigint: true }).mtimeNs;
  } catch {
    return null;
  }
}

class ConfigWatcher {
  constructor({ path, intervalInSeconds, onChange, onError }) {
    this.path = path;
    this.intervalInSeconds = intervalInSeconds;
    this.onChange = onChange;
    this.onError = onError;
    this.mtime = readMtime(path);
    this.timer = null;
  }

  // True if a change was seen and applied. Separate from the timer so the behaviour is testable
  // without waiting on an interval.
  checkOnce() {
    const mtime = readMtime(this.path);
    if (mtime === null || mtime === this.mtime) {
      return false;
    }

    // A bad render is not applied over working routes. The mtime is remembered anyway: otherwise
    // one broken template would report the same error every interval, forever.
    let loaded;
    try {
      loaded = loadRoutes(this.path);
    } catch (err) {
      this.mtime = mtime;
      this.onError(`Failed to reload ${this.path}, keeping the previous routes: ${err.message}`);
      return false;
    }

    if (Object.keys(loaded.routes).length === 0) {
      this.mtime = mtime;
      this.onError(`${this.path} changed but has no valid hooks, keeping the previous routes`);
      return false;
    }

    this.mtime = mtime;
    try {
      this.onChange(loaded);
    } catch (err) {
      this.onError(`Failed to apply ${this.path}, keeping the previous routes: ${err.message}`);
      return false;
    }

    return true;
  }

  start() {
    if (this.timer !== null) {
      return;
    }

    this.timer = setInterval(() => this.checkOnce(), this.intervalInSeconds * 1000);
    // The poll must not be what keeps the process alive during a shutdown.
    this.timer.unref();
  }

  stop() {
    if (this.timer === null) {
      return;
    }

    clearInterval(this.timer);
    this.timer = null;
  }
}

module.exports = {
  ConfigWatcher,
  DEFAULT_CONFIG_PATH,
  DEFAULT_POLL_INTERVAL_IN_SECONDS,
  describeRouteChanges,
  loadRoutes,
  parseRoutes,
  readConfig,
};
