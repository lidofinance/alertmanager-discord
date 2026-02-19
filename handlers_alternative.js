const axios = require("axios");

const colors = { firing: 0xd50000, resolved: 0x00c853 };

const groupBy = (array, func) => {
  return array.reduce((group, item) => {
    const groupName = func(item);
    group[groupName] = group[groupName] ?? [];
    group[groupName].push(item);
    return group;
  }, {});
};
const getMentions = (alerts) => {
  return [...alerts].reduce((mentions, alert) => {
    if (alert.labels["mentions"]) {
      alert.labels["mentions"]
        .replace(/ /g, "")
        .split(",")
        .forEach((m) => mentions.push(`<@${m}>`));
    }
    return mentions;
  }, []);
};

async function handleHook(ctx) {
  const hook = ctx.state.hook;

  if (ctx.request.body && Array.isArray(ctx.request.body.alerts)) {
    const raws = [];
    const groupByStatus = groupBy(ctx.request.body.alerts, (alert) => alert.status);
    for (const byStatus of Object.values(groupByStatus)) {
      const [first] = byStatus;
      if (first.annotations && (first.annotations.summary || first.annotations.description)) {
        const statusColor = first.status === "resolved" ? colors.resolved : colors.firing;
        const title = (a) =>
          a.status === "resolved"
            ? a.annotations["resolved_summary"] ?? a.annotations.summary
            : a.annotations.summary;
        const desc = (a) =>
          a.status === "resolved"
            ? a.annotations["resolved_description"] ?? a.annotations.description
            : a.annotations.description;
        if (first.annotations["field_name"] && first.annotations["field_value"]) {
          let chunk = [];
          while ((chunk = byStatus.splice(0, ctx.messageParams.maxFieldsLength)) && chunk.length) {
            raws.push({
              mentions: getMentions(chunk),
              embed: {
                title: `${first.annotations["emoji"] ? first.annotations.emoji + " " : ""}${
                  chunk.length
                } ${title(first)}`,
                url: statusColor === colors.firing ? first.annotations["url"] ?? "" : "",
                description: desc(first),
                color: statusColor,
                fields: chunk.map((a) => ({
                  name: a.annotations.field_name,
                  value: a.annotations.field_value,
                  inline: true,
                })),
                footer: {
                  text: first.annotations.footer_text ?? "",
                  icon_url: first.annotations.footer_icon_url ?? "",
                },
              },
            });
          }
        } else {
          byStatus.forEach((a) => {
            raws.push({
              mentions: getMentions([a]),
              embed: {
                title: `${first.annotations["emoji"] ? first.annotations.emoji + " " : ""}${title(
                  a
                )}`,
                url: statusColor === colors.firing ? first.annotations["url"] ?? "" : "",
                description: desc(a),
                color: statusColor,
                footer: {
                  text: first.annotations.footer_text ?? "",
                  icon_url: first.annotations.footer_icon_url ?? "",
                },
              },
            });
          });
        }
      }
    }
    raws.sort((a) => (a.embed.color === colors.resolved ? -1 : 1));
    if (!raws.length) {
      ctx.status = 400;
      ctx.logger.warn("No data to write to embeds");
      return;
    }

    let chunk = [];
    while ((chunk = raws.splice(0, ctx.messageParams.maxEmbedsLength)) && chunk.length) {
      // Discord displays only one embed if several embeds have the same url in one message.
      // Then only one (last fired) embed will have URL in each chunk
      chunk.forEach((e) =>
        chunk.filter((a) => a.embed.url === e.embed.url).length > 1 ? (e.embed.url = "") : undefined
      );
      const mentions = [...new Set(chunk.map((c) => c.mentions).flat())].join(" ");
      const payload = { embeds: chunk.map((c) => c.embed) };
      if (mentions.length !== 0) {
        payload.content = mentions;
        payload.allowed_mentions = { parse: ["users", "roles"] };
      }
      await axios
        .post(hook, payload)
        .then(() => {
          ctx.status = 200;
          ctx.logger.info(chunk.length + " embeds sent");
        })
        .catch((err) => {
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

          ctx.logger.error(`Axios error in "handlers_alternative.js": ${errorMessage}`);
        });
    }
  } else {
    ctx.status = 400;
    ctx.logger.error(`Unexpected request from Alertmanager: ${JSON.stringify(ctx.request.body)}`);
  }
}

module.exports = {
  handleHook,
};
