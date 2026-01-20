const axios = require("axios");
const {
  buildContextBlock,
  buildSectionBlock,
  buildTableBlock,
  convertMarkdownToSlack,
  getSlackMentions,
  logSlackError,
  logSlackResponse,
} = require("./slack_helpers");

const groupBy = (array, func) => {
  return array.reduce((group, item) => {
    const groupName = func(item);
    group[groupName] = group[groupName] ?? [];
    group[groupName].push(item);
    return group;
  }, {});
};

const buildTitle = (alert, isResolved) => {
  if (!alert?.annotations) {
    return "";
  }

  return isResolved
    ? alert.annotations.resolved_summary ?? alert.annotations.summary
    : alert.annotations.summary;
};

const buildDescription = (alert, isResolved) => {
  if (!alert?.annotations) {
    return "";
  }

  return isResolved
    ? alert.annotations.resolved_description ?? alert.annotations.description
    : alert.annotations.description;
};

const formatTitle = (title, url, isResolved) => {
  if (!title) {
    return "";
  }

  const converted = convertMarkdownToSlack(title);
  if (!isResolved && url) {
    return `<${url}|${converted}>`;
  }

  return converted;
};

async function handleHook(ctx) {
  ctx.status = 200;

  const hook = ctx.state.hook;

  if (ctx.request.body === undefined || !Array.isArray(ctx.request.body.alerts)) {
    ctx.status = 400;
    ctx.logger.error(`Unexpected request from Alertmanager: ${JSON.stringify(ctx.request.body)}`);
    return;
  }

  const alertsCount = ctx.request.body.alerts.length;
  ctx.logger.info(`Received ${alertsCount} alert(s) from Alertmanager`);

  const units = [];
  const grouped = groupBy(ctx.request.body.alerts, (alert) => alert.status);

  for (const byStatus of Object.values(grouped)) {
    const [first] = byStatus;
    if (!first?.annotations) {
      continue;
    }

    const isResolved = first.status === "resolved";
    const titleSeed = buildTitle(first, isResolved);
    const descrSeed = buildDescription(first, isResolved);
    const hasContent = Boolean(titleSeed || descrSeed);
    if (!hasContent) {
      continue;
    }

    const emojiPrefix = first.annotations.emoji ? `${first.annotations.emoji} ` : "";
    const footerText = first.annotations.footer_text ?? "";
    const footerIconUrl = first.annotations.footer_icon_url ?? "";
    const url = !isResolved ? first.annotations.url ?? "" : "";

    if (first.annotations.field_name && first.annotations.field_value) {
      const alertsCopy = [...byStatus];
      let chunk = [];

      while ((chunk = alertsCopy.splice(0, ctx.messageParams.maxTableRows)) && chunk.length) {
        const baseTitle = buildTitle(first, isResolved);
        const fullTitle = baseTitle
          ? `${emojiPrefix}${chunk.length} ${baseTitle}`.trim()
          : `${emojiPrefix}${chunk.length}`.trim();
        const titleBlock = buildSectionBlock(formatTitle(fullTitle, url, isResolved));
        const descrBlock = buildSectionBlock(convertMarkdownToSlack(descrSeed || ""));

        const mentions = new Set();
        chunk.forEach((alert) => {
          getSlackMentions(alert.labels || {}).forEach((mention) => mentions.add(mention));
        });

        const blocks = [];
        if (titleBlock) {
          blocks.push(titleBlock);
        }
        if (descrBlock) {
          blocks.push(descrBlock);
        }
        if (mentions.size) {
          blocks.push(buildSectionBlock([...mentions].join(" ")));
        }

        const rows = chunk.map((alert) => ({
          field_name: alert.annotations.field_name || "",
          field_value: alert.annotations.field_value || "",
        }));
        blocks.push(buildTableBlock(rows));

        const footerBlock = buildContextBlock(footerText, footerIconUrl);
        if (footerBlock) {
          blocks.push(footerBlock);
        }

        units.push({ type: "table", status: first.status, blocks });
      }
    } else {
      byStatus.forEach((alert) => {
        const baseTitle = buildTitle(alert, isResolved);
        const titleText = `${emojiPrefix}${baseTitle || ""}`.trim();
        const titleBlock = buildSectionBlock(formatTitle(titleText, url, isResolved));
        const descrBlock = buildSectionBlock(
          convertMarkdownToSlack(buildDescription(alert, isResolved))
        );
        const footerBlock = buildContextBlock(footerText, footerIconUrl);

        const blocks = [];
        if (titleBlock) {
          blocks.push(titleBlock);
        }
        if (descrBlock) {
          blocks.push(descrBlock);
        }
        if (footerBlock) {
          blocks.push(footerBlock);
        }

        units.push({
          type: "plain",
          status: first.status,
          blocks,
          mentions: getSlackMentions(alert.labels || {}),
        });
      });
    }
  }

  if (!units.length) {
    ctx.status = 400;
    ctx.logger.warn("No data to write to Slack blocks");
    return;
  }

  const statusWeight = (status) => (status === "resolved" ? 0 : 1);
  units.sort((a, b) => statusWeight(a.status) - statusWeight(b.status));

  const messages = [];
  let current = null;

  const flushCurrent = () => {
    if (!current) {
      return;
    }

    if (current.mentions.size) {
      current.blocks.push(buildSectionBlock([...current.mentions].join(" ")));
    }
    messages.push({ blocks: current.blocks });
    current = null;
  };

  for (const unit of units) {
    if (unit.type === "table") {
      flushCurrent();
      messages.push({ blocks: unit.blocks });
      continue;
    }

    if (!current) {
      current = { blocks: [], mentions: new Set(), units: 0 };
    }

    const nextMentions = new Set([...current.mentions, ...(unit.mentions || [])]);
    const mentionBlockCount = nextMentions.size ? 1 : 0;
    if (
      current.units >= ctx.messageParams.maxEmbedsLength ||
      current.blocks.length + unit.blocks.length + mentionBlockCount > 50
    ) {
      flushCurrent();
      current = { blocks: [], mentions: new Set(), units: 0 };
    }

    current.blocks.push(...unit.blocks);
    (unit.mentions || []).forEach((mention) => current.mentions.add(mention));
    current.units += 1;
  }

  flushCurrent();

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    const messageContext = {
      messageIndex: i,
      totalMessages: messages.length,
      blocksCount: message.blocks.length,
      alertsCount,
    };

    try {
      const response = await axios.post(hook, {
        text: "",
        blocks: message.blocks,
      });
      logSlackResponse(ctx, response, messageContext);
    } catch (err) {
      logSlackError(ctx, err, messageContext);
    }
  }

  ctx.logger.info(
    `${messages.length} message(s) sent from ${units.length} unit(s), ${alertsCount} alert(s)`
  );
}

module.exports = {
  handleHook,
};
