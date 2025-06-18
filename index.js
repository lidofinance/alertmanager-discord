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

const configPath = "/etc/alertmanager-discord.yml";
const hookRegExp = new RegExp("https://discord(?:app)?.com/api/webhooks/[0-9]+/[a-zA-Z0-9_-]+");

if (require.main === module) {
  let config,
    routes = {},
    webhookTokens = [];

  try {
    config = yaml.load(fs.readFileSync(configPath));
  } catch (err) {
    console.error("Failed to read configuration file:", err.message);
  }

  const webhookSearchPattern = "/api/webhooks/";

  if (config !== undefined && config.hooks !== undefined && Array.isArray(config.hooks)) {
    for (let route of config.hooks) {
      if (!route.hook || !route.hook.startsWith || !hookRegExp.test(route.hook)) {
        console.warn("Not a valid discord web hook for slug =", route.slug);
        continue;
      }

      routes[route.slug] = route.hook;

      const webhookPatternIndex = route.hook.indexOf(webhookSearchPattern);
      const webhookToken = route.hook.substring(webhookPatternIndex + webhookSearchPattern.length);
      webhookTokens.push(webhookToken);
    }
  }

  const logFormatter = winston.format.combine(
    cleanSecrets({ secrets: webhookTokens }),
    winston.format.json(),
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

  if (strValue === '') {
    return null;
  }

  const numValue = Number(strValue);

  if (Number.isInteger(numValue)) {
    return numValue;
  }

  return null;
}
