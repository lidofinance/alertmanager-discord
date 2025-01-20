// Simple Discord webhook proxy for Alertmanager

const Koa = require("koa");
const yaml = require("js-yaml");
const fs = require("fs");
const winston = require("winston");

const { router } = require("./router");
const { cleanSecrets } = require("./secrets");

const port = process.env.PORT || 5001;
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
  app.use(router.routes());

  app.listen(port, (err) => {
    if (err) {
      logger.error(err.stack);
      return;
    }

    logger.info("Listening on port " + port);
  });
}
