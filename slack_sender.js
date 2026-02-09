const axios = require("axios");

/**
 * Sends Slack webhook messages and logs per-message context.
 *
 * @param {object} ctx
 * @param {string} hook
 * @param {Array<{blocks?: Array}>} messages
 * @param {number} alertsCount
 * @returns {Promise<{sent: number, total: number}>}
 */
async function sendSlackMessages(ctx, hook, messages, alertsCount) {
  let sent = 0;

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    const messageContext = {
      messageIndex: i,
      totalMessages: messages.length,
      blocksCount: message.blocks?.length,
      alertsCount,
    };

    try {
      const response = await axios.post(hook, message);
      logSlackResponse(ctx, response, messageContext);
      sent += 1;
    } catch (err) {
      logSlackError(ctx, err, messageContext);
    }
  }

  return { sent, total: messages.length };
}

function logSlackResponse(ctx, response, messageContext) {
  const contextSuffix = formatSlackMessageContext(messageContext);
  ctx.logger.info(`Slack webhook responded with status ${response.status}${contextSuffix}`);
}

function logSlackError(ctx, err, messageContext) {
  const contextSuffix = formatSlackMessageContext(messageContext);

  const status = err.response?.status;
  if (status != null) {
    const body = err.response?.data;
    ctx.logger.error(
      `Slack webhook responded with status ${status}${
        body != null ? `; Body: ${JSON.stringify(body)}` : ""
      }${contextSuffix}`
    );
    ctx.status = 500;
    return;
  }

  ctx.status = 500;
  ctx.logger.error(`Slack webhook error: ${err.message}${contextSuffix}`);
}

function formatSlackMessageContext(messageContext) {
  if (!messageContext) {
    return "";
  }

  const { messageIndex, totalMessages, blocksCount, alertsCount } = messageContext;
  const parts = [];

  if (messageIndex != null && totalMessages != null) {
    parts.push(`message ${messageIndex + 1}/${totalMessages}`);
  }
  if (blocksCount != null) {
    parts.push(`${blocksCount} blocks`);
  }
  if (alertsCount != null) {
    parts.push(`${alertsCount} alert(s)`);
  }

  return parts.length ? ` (${parts.join(", ")})` : "";
}

module.exports = {
  sendSlackMessages,
};
