// Simple Discord webhook proxy for Alertmanager

const Koa = require("koa");
const yaml = require("js-yaml");
const fs = require("fs");
const winston = require("winston");

const { router } = require("./router");
const { cleanSecrets } = require("./secrets");

const port = toInteger(process.env.PORT) || 5001;

let maxEmbedsLength = toInteger(process.env.MAX_EMBEDS_LENGTH) || 10;
if (maxEmbedsLength <= 0 || maxEmbedsLength > 10) {
  maxEmbedsLength = 10;
}

let maxFieldsLength = toInteger(process.env.MAX_FIELDS_LENGTH) || 25;
if (maxFieldsLength <= 0 || maxFieldsLength > 25) {
  maxFieldsLength = 25;
}

let maxTableRows = toInteger(process.env.MAX_TABLE_ROWS) || 50;
if (maxTableRows <= 0) {
  maxTableRows = 50;
}
if (maxTableRows > 70) {
  maxTableRows = 70;
}

const configPath = "/etc/alertmanager-discord.yml";
const discordHookRegExp = new RegExp(
  "^https://discord(?:app)?\\.com/api/webhooks/[0-9]+/[a-zA-Z0-9_-]+$"
);
const slackHookRegExp = new RegExp("^https://hooks\\.slack\\.com/services/[^/]+/[^/]+/[^/]+$");

if (require.main === module) {
  let config,
    routes = {},
    webhookTokens = [];

  try {
    config = yaml.load(fs.readFileSync(configPath));
  } catch (err) {
    console.error("Failed to read configuration file:", err.message);
  }

  if (config !== undefined && config.hooks !== undefined && Array.isArray(config.hooks)) {
    try {
      ({ routes, webhookTokens } = parseRoutes(config.hooks, {
        discordHookRegExp,
        slackHookRegExp,
      }));
    } catch (err) {
      console.error(`Invalid configuration: ${err.message}`);
      process.exit(1);
    }
  }

  const logFormatter = winston.format.combine(
    cleanSecrets({ secrets: webhookTokens }),
    winston.format.json()
  );
  const transport = new winston.transports.Console({
    format: logFormatter,
  });
  const logger = winston.createLogger({
    transports: [transport],
  });

  const app = new Koa();

  app.context.routes = routes;
  app.context.logger = logger;
  app.context.messageParams = {
    maxEmbedsLength,
    maxFieldsLength,
    maxTableRows,
  };
  app.use(router.routes());

  app.listen(port, (err) => {
    if (err) {
      logger.error(err.stack);
      return;
    }

    logger.info("Listening on port " + port);
  });
}

function toInteger(value) {
  if (value == null) {
    return null;
  }

  const strValue = value.toString().trim();

  if (strValue === "") {
    return null;
  }

  const numValue = Number(strValue);

  if (Number.isInteger(numValue)) {
    return numValue;
  }

  return null;
}

function parseRoutes(hooks, { discordHookRegExp, slackHookRegExp }) {
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
