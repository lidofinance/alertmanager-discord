const axios = require("axios");

const colors = { firing: 0xd50000, resolved: 0x00c853, default: 0x333333 };

function getMentions(alert) {
  const mentions = alert.labels["mentions"];
  if (!mentions) {
    return [];
  }

  return mentions
    .replace(/\s/g, "")
    .split(",")
    .filter(Boolean)
    .map((m) => `<@${m}>`);
}

async function handleHook(ctx) {
  ctx.status = 200;

  const hook = ctx.state.hook;

  if (ctx.request.body === undefined || !Array.isArray(ctx.request.body.alerts)) {
    ctx.status = 400;
    ctx.logger.error(`Unexpected request from Alertmanager: ${JSON.stringify(ctx.request.body)}`);
    return;
  }

  const objectsToSend = [];

  ctx.request.body.alerts.forEach((alert) => {
    try {
      const description = alert.annotations?.description;
      const summary = alert.annotations?.summary;
      if (!summary && !description) return;

      let body = {
        embeds: [
          {
            title: summary,
            description: description,
            color: colors[alert.status] || colors.default,
          },
        ],
      };

      const mentions = getMentions(alert);
      if (mentions.length) {
        body.allowed_mentions = { parse: ["users", "roles"] };
        body.content = mentions.join(" ");
      }

      objectsToSend.push(body);
    } catch (err) {
      ctx.logger.error(err.stack);
    }
  });

  if (!objectsToSend.length) {
    ctx.status = 400;
    ctx.logger.warn(
      `Nothing to send, all alerts has been filtered out. Received data: ${JSON.stringify(
        ctx.request.body.alerts
      )}`
    );
    return;
  }

  for (const body of objectsToSend) {
    await axios.post(hook, body, { params: ctx.query }).catch((err) => {
      ctx.status = 500;

      const errorConfig = err.config || {};
      const errorMessage =
        err.message +
        (errorConfig.method != null ? `; Method: ${errorConfig.method}` : "") +
        (errorConfig.data != null
          ? `; Request data length: ${errorConfig.data.length}; Request data: ${JSON.stringify(
              errorConfig.data
            )}`
          : "");

      ctx.logger.error(`Axios error in "handlers_default.js": ${errorMessage}`);
    });
  }

  ctx.logger.info(`${objectsToSend.length} objects have been sent to Discord`);
}

module.exports = {
  handleHook,
  getMentions,
};
