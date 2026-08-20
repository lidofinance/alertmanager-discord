// Simple Discord webhook proxy for Alertmanager

const Koa = require("koa");
const winston = require("winston");

const { router } = require("./router");
const { cleanSecrets } = require("./secrets");
const { MAX_TABLE_ROWS } = require("./block_kit");
const {
  ConfigWatcher,
  DEFAULT_CONFIG_PATH,
  DEFAULT_POLL_INTERVAL_IN_SECONDS,
  describeRouteChanges,
  parseRoutes,
  readConfig,
} = require("./config");

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
if (maxTableRows > MAX_TABLE_ROWS) {
  maxTableRows = 100;
}

// Configurable, because a secrets manager that writes the file may not be able to write into /etc.
const configPath = process.env.CONFIG_PATH || DEFAULT_CONFIG_PATH;

const pollIntervalInSeconds =
  toInteger(process.env.SECRETS_POLL_INTERVAL_IN_SECONDS) || DEFAULT_POLL_INTERVAL_IN_SECONDS;
const shutdownTimeoutInSeconds = toInteger(process.env.SHUTDOWN_TIMEOUT_IN_SECONDS) || 10;

function start() {
  let config,
    routes = {},
    webhookTokens = [];

  try {
    config = readConfig(configPath);
  } catch (err) {
    console.error("Failed to read configuration file:", err.message);
  }

  if (config !== undefined && config.hooks !== undefined && Array.isArray(config.hooks)) {
    try {
      ({ routes, webhookTokens } = parseRoutes(config.hooks));
    } catch (err) {
      console.error(`Invalid configuration: ${err.message}`);
      process.exit(1);
    }
  }

  // winston keeps this options object by reference and reads `secrets` on every line, so the
  // scrubber only follows a rotation if new tokens are assigned into it instead of into a copy.
  const secretsOptions = { secrets: webhookTokens };
  const logFormatter = winston.format.combine(cleanSecrets(secretsOptions), winston.format.json());
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

  const watcher = new ConfigWatcher({
    path: configPath,
    intervalInSeconds: pollIntervalInSeconds,
    onChange: (loaded) => {
      const changes = describeRouteChanges(app.context.routes, loaded.routes);
      // Assign, never mutate in place: a request resolving a slug must not see a half-built map.
      app.context.routes = loaded.routes;
      secretsOptions.secrets = loaded.webhookTokens;

      if (changes !== null) {
        logger.info(`Configuration reloaded: ${changes}`);
      }
    },
    onError: (message) => logger.error(message),
  });
  watcher.start();

  const server = app.listen(port, (err) => {
    if (err) {
      logger.error(err.stack);
      return;
    }

    logger.info("Listening on port " + port);
  });

  let shuttingDown = false;

  function shutdown(signal) {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    // One line, so a pod that went away on purpose is distinguishable from one that was killed.
    logger.info(`Shutting down on ${signal}`);
    watcher.stop();

    const deadline = setTimeout(() => process.exit(0), shutdownTimeoutInSeconds * 1000);
    server.close(() => {
      clearTimeout(deadline);
      process.exit(0);
    });
    // Alertmanager keeps connections alive between alerts, and an idle one holds server.close()
    // open until the deadline.
    server.closeIdleConnections();
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  return { app, logger, server, shutdown, watcher };
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

module.exports = {
  start,
};

if (require.main === module) {
  start();
}
