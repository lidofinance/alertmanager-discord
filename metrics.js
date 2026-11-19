// Prometheus metrics. Webhook URLs carry their token, so outgoing requests are labelled by target
// (discord, slack) and never by URL.

const fs = require("fs");
const path = require("path");
const client = require("prom-client");

const { version } = require("./package.json");

const DEFAULT_BUILD_INFO_PATH = path.join(__dirname, "build-info.json");
const UNKNOWN = "unknown";

function createMetrics({ buildInfoPath = DEFAULT_BUILD_INFO_PATH } = {}) {
  const register = new client.Registry();
  client.collectDefaultMetrics({ register });

  const webhookRequests = new client.Counter({
    name: "alertmanager_discord_webhook_requests_total",
    help: "Webhook requests sent, by target and HTTP status (or timeout/error when no response came back)",
    labelNames: ["target", "status"],
    registers: [register],
  });

  const webhookRequestDuration = new client.Histogram({
    name: "alertmanager_discord_webhook_request_duration_seconds",
    help: "Webhook request duration, by target and HTTP status",
    labelNames: ["target", "status"],
    buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [register],
  });

  const buildInfo = new client.Gauge({
    name: "build_info",
    help: "Build information",
    labelNames: ["version", "commit", "branch"],
    registers: [register],
  });
  buildInfo.set({ version, ...readBuildInfo(buildInfoPath) }, 1);

  return { register, webhookRequests, webhookRequestDuration };
}

// The build pipeline rewrites build-info.json before the image is built; the committed placeholder
// reads as "unknown".
function readBuildInfo(filePath) {
  let parsed = {};
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    // Missing or unreadable: both labels stay unknown.
  }

  const field = (value) =>
    typeof value === "string" && value !== "" && !value.startsWith("REPLACE_WITH_")
      ? value
      : UNKNOWN;

  return { commit: field(parsed.commit), branch: field(parsed.branch) };
}

function targetOf(url) {
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    return "other";
  }

  if (host === "discord.com" || host === "discordapp.com") {
    return "discord";
  }
  if (host === "hooks.slack.com") {
    return "slack";
  }
  return "other";
}

function statusOf(err) {
  if (err.response) {
    return String(err.response.status);
  }
  if (err.code === "ECONNABORTED" || err.code === "ETIMEDOUT") {
    return "timeout";
  }
  return "error";
}

const instrumented = Symbol("alertmanager-discord-metrics");

// Every handler posts through the module-level axios, so one pair of interceptors covers all
// send paths.
function instrumentAxios(axios, { webhookRequests, webhookRequestDuration }) {
  if (axios[instrumented]) {
    return;
  }
  axios[instrumented] = true;

  const observe = (config, status) => {
    const labels = { target: targetOf(config.url), status };
    webhookRequests.inc(labels);
    if (config.startedAt !== undefined) {
      webhookRequestDuration.observe(
        labels,
        Number(process.hrtime.bigint() - config.startedAt) / 1e9
      );
    }
  };

  axios.interceptors.request.use((config) => {
    config.startedAt = process.hrtime.bigint();
    return config;
  });

  axios.interceptors.response.use(
    (response) => {
      observe(response.config, String(response.status));
      return response;
    },
    (err) => {
      if (err.config) {
        observe(err.config, statusOf(err));
      }
      return Promise.reject(err);
    }
  );
}

module.exports = {
  createMetrics,
  instrumentAxios,
  readBuildInfo,
  targetOf,
};
