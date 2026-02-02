const axios = require("axios");
const {
  buildContextBlock,
  getSlackMentions,
  logSlackError,
  logSlackResponse,
} = require("./slack_helpers");
const blockKit = require("./block_kit");
const { markdownToRich } = require("./markdown_to_rich");

async function handleHook(ctx) {
  ctx.status = 200;

  const hook = ctx.state.hook;

  if (ctx.request.body === undefined || !Array.isArray(ctx.request.body.alerts)) {
    ctx.status = 400;
    ctx.logger.error(`Unexpected request from Alertmanager: ${JSON.stringify(ctx.request.body)}`);
    return;
  }

  const objectsToSend = ctx.request.body.alerts.flatMap((alert, index) => {
    try {
      const description = alert.annotations?.description;
      const summary = alert.annotations?.summary;

      if (!summary && !description) {
        ctx.logger.warn(`Skip alert with index ${index}: empty 'summary' and 'description'`);
        return [];
      }

      const mentions = getSlackMentions(alert.labels || {}).join(" ");
      const allMarkdown = [summary, description, alert.annotations?.inline_fields]
        .filter(Boolean)
        .join("\n");
      const footerBlock = buildContextBlock(
        alert.annotations?.footer_text,
        alert.annotations?.footer_icon_url
      );

      const blocks = [
        mentions.length > 0 && blockKit.section(mentions),
        markdownToRich(allMarkdown),
        footerBlock,
      ].filter(Boolean);

      return [{ text: "", blocks }];
    } catch (err) {
      ctx.logger.error(`Skip alert with index ${index}: ${err.message}`);
      ctx.logger.error(err.stack);
      return [];
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

  let sent = 0;
  for (const body of objectsToSend) {
    try {
      const response = await axios.post(hook, body);
      logSlackResponse(ctx, response);
      sent += 1;
    } catch (err) {
      logSlackError(ctx, err);
    }
  }

  ctx.logger.info(
    `${sent}/${objectsToSend.length}/${ctx.request.body.alerts.length} objects have been sent`
  );
}

module.exports = {
  handleHook,
};
