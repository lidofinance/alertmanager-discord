const Router = require("@koa/router");
const bodyParser = require("koa-bodyparser");

const { handleHook: handleHookDiscord } = require("./handlers_default");
const { handleHook: handleHookDiscordAlt } = require("./handlers_alternative");
const { handleHook: handleHookSlack } = require("./handlers_slack_default");
const { handleHook: handleHookSlackAlt } = require("./handlers_slack_alternative");
const { handleHealthcheck } = require("./healthcheck");

const getHandler = (route, workingMode) => {
  if (!route) {
    return null;
  }

  if (route.type === "slack") {
    return workingMode === "alternative" ? handleHookSlackAlt : handleHookSlack;
  }

  return workingMode === "alternative" ? handleHookDiscordAlt : handleHookDiscord;
};

const router = new Router();

router
  .post(
    "/hook/:slug",
    bodyParser({
      enableTypes: ["json"],
      extendTypes: {
        json: ["*/*"],
      },
      onerror: (err, ctx) => {
        ctx.logger.warn(
          `Status: ${err.status}; Body length: ${
            err.body != null ? err.body.length : 0
          }; Body: ${JSON.stringify(err.body)}; Error stack: ${err.stack}`
        );
        ctx.throw(400);
      },
    }),
    async (ctx) => {
      const route = ctx.routes[ctx.params.slug];
      if (!route) {
        ctx.status = 404;
        ctx.logger.warn(`Slug "${ctx.params.slug}" was not found in routes`);
        return;
      }

      const handler = getHandler(route, process.env.WORKING_MODE);
      if (!handler) {
        ctx.status = 500;
        ctx.logger.error(`No handler found for slug "${ctx.params.slug}"`);
        return;
      }

      await handler(ctx);
    }
  )
  .get("/health", handleHealthcheck);

module.exports = {
  router,
};
