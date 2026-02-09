const { processRawAlerts } = require("./slack_processor");
const { sendSlackMessages } = require("./slack_sender");

async function handleHook(ctx) {
  ctx.status = 200;

  const hook = ctx.state.hook;

  if (ctx.request.body === undefined || !Array.isArray(ctx.request.body.alerts)) {
    ctx.status = 400;
    ctx.logger.error(`Unexpected request from Alertmanager: ${JSON.stringify(ctx.request.body)}`);
    return;
  }

  const alertsCount = ctx.request.body.alerts.length;
  const messages = processRawAlerts(ctx.request.body.alerts, {
    maxTableRows: ctx.messageParams?.maxTableRows,
  });

  if (!messages.length) {
    ctx.status = 400;
    ctx.logger.warn(
      `Nothing to send, all alerts have been filtered out. Received data: ${JSON.stringify(
        ctx.request.body.alerts
      )}`
    );
    return;
  }

  const { sent, total } = await sendSlackMessages(ctx, hook, messages, alertsCount);
  ctx.logger.info(`${sent}/${total}/${alertsCount} objects have been sent`);
}

module.exports = {
  handleHook,
};
