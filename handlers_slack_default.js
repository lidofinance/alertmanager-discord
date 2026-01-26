const axios = require("axios");
const { compileTitle, compileDescr } = require("./templating");
const { getFields } = require("./handlers_default");
const {
  buildContextBlock,
  buildRichTextListBlock,
  buildSectionBlock,
  convertMarkdownToSlack,
  getSlackMentions,
  logSlackError,
  logSlackResponse,
} = require("./slack_helpers");

const buildBlocks = (alert, logger) => {
  const description = alert.annotations?.description;
  const summary = alert.annotations?.summary;
  if (!summary && !description) {
    return null;
  }

  const blocks = [];
  const title = convertMarkdownToSlack(compileTitle(alert) || summary || "");
  const descr = convertMarkdownToSlack(compileDescr(alert) || description || "");

  const mentions = getSlackMentions(alert.labels || {});
  if (mentions.length) {
    blocks.push(buildSectionBlock(mentions.join(" ")));
  }

  const titleBlock = buildSectionBlock(title);
  if (titleBlock) {
    blocks.push(titleBlock);
  }

  const descrBlock = buildSectionBlock(descr);
  if (descrBlock) {
    blocks.push(descrBlock);
  }

  const fields = getFields(alert, logger);
  if (fields.length) {
    const listItems = fields.map((field) => String(field.value || "")).filter((value) => value);
    if (listItems.length) {
      blocks.push(buildRichTextListBlock(listItems));
    }
  }

  const footerBlock = buildContextBlock(
    alert.annotations?.footer_text,
    alert.annotations?.footer_icon_url
  );
  if (footerBlock) {
    blocks.push(footerBlock);
  }

  return blocks;
};

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
      const blocks = buildBlocks(alert, ctx.logger);
      if (!blocks || !blocks.length) {
        return;
      }

      objectsToSend.push({ text: "", blocks });
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
    await axios
      .post(hook, body, { params: ctx.query })
      .then((response) => logSlackResponse(ctx, response))
      .catch((err) => logSlackError(ctx, err));
  }

  ctx.logger.info(`${objectsToSend.length} objects have been sent`);
}

module.exports = {
  handleHook,
};
