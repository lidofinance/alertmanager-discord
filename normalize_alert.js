/**
 * @typedef {Object} AlertAnnotations
 * @property {string=} summary
 * @property {string=} resolved_summary
 * @property {string=} description
 * @property {string=} resolved_description
 * @property {string=} footer_text
 * @property {string=} footer_icon_url
 * @property {string=} emoji
 * @property {string=} url
 * @property {string=} field_name
 * @property {string=} field_value
 */

/**
 * @typedef {Object} AlertLabels
 * @property {string=} mentions
 * @property {string=} slack_mentions
 */

/**
 * @typedef {Object} AlertInput
 * @property {string=} status
 * @property {AlertAnnotations=} annotations
 * @property {AlertLabels=} labels
 */

/**
 * @typedef {Object} NormalizedAlert
 * @property {boolean} isResolved
 * @property {string=} title
 * @property {string=} description
 * @property {string=} emoji
 * @property {string=} url
 * @property {{text?: string, icon_url?: string}=} footer
 * @property {{discord?: Set<string>, slack?: Set<string>}=} mentions
 * @property {{name: string, value: string}[]=} fields
 */

/**
 * Normalize Alertmanager alert annotations into a single, convenient structure.
 * Returns `null` when the alert is malformed or lacks any usable content.
 *
 * @param {AlertInput} alert
 * @returns {NormalizedAlert|null}
 */
function normalizeAlert(alert) {
  if (
    !alert ||
    typeof alert !== "object" ||
    !alert.annotations ||
    typeof alert.annotations !== "object" ||
    Array.isArray(alert.annotations)
  ) {
    return null;
  }

  const isResolved = alert.status === "resolved";
  const title = isResolved
    ? alert.annotations.resolved_summary ?? alert.annotations.summary
    : alert.annotations.summary;
  const description = isResolved
    ? alert.annotations.resolved_description ?? alert.annotations.description
    : alert.annotations.description;

  if (!title && !description) {
    return null;
  }

  const result = {
    isResolved,
    title,
    description,
  };

  if (alert.annotations["footer_text"] && typeof alert.annotations["footer_text"] === "string") {
    result.footer = {
      ...result.footer,
      text: alert.annotations["footer_text"],
    };
  }

  if (
    alert.annotations["footer_icon_url"] &&
    typeof alert.annotations["footer_icon_url"] === "string"
  ) {
    result.footer = { ...result.footer, icon_url: alert.annotations["footer_icon_url"] };
  }

  if (alert.annotations["emoji"]) {
    result.emoji = alert.annotations["emoji"];
  }

  if (alert.annotations["url"]) {
    result.url = alert.annotations["url"];
  }

  if (alert.labels?.mentions && typeof alert.labels.mentions === "string") {
    const formattedMentions = alert.labels.mentions
      .replace(/\s/g, "")
      .split(",")
      .filter(Boolean)
      .map((m) => `<@${m}>`);

    result.mentions = { ...result.mentions, discord: new Set(formattedMentions) };
  }

  if (alert.labels?.slack_mentions && typeof alert.labels.slack_mentions === "string") {
    const formattedMentions = alert.labels.slack_mentions
      .replace(/\s/g, "")
      .split(",")
      .map(formatSlackMention)
      .filter(Boolean);

    result.mentions = { ...result.mentions, slack: new Set(formattedMentions) };
  }

  if (alert.annotations["field_name"] && alert.annotations["field_value"]) {
    result.fields = [
      {
        name: alert.annotations["field_name"],
        value: alert.annotations["field_value"],
      },
    ];
  }

  return result;
}

/**
 * Union fields and mentions across multiple normalized alerts.
 * Assumes all other properties are identical and uses the first alert as a base.
 *
 * @param {NormalizedAlert[]} alerts
 * @returns {NormalizedAlert}
 * @throws {Error} When `alerts` is not a non-empty array.
 */
function combineNormalizedAlerts(alerts) {
  if (!Array.isArray(alerts) || alerts.length === 0) {
    throw new Error("alerts should be a non-empty array");
  }

  const [first] = alerts;
  const result = { ...first };
  const fields = [];
  const slackMentions = new Set();
  const discordMentions = new Set();

  for (const alert of alerts) {
    if (Array.isArray(alert.fields)) {
      fields.push(...alert.fields);
    }

    const mentions = alert.mentions;
    if (mentions?.slack) {
      mentions.slack.forEach((mention) => slackMentions.add(mention));
    }
    if (mentions?.discord) {
      mentions.discord.forEach((mention) => discordMentions.add(mention));
    }
  }

  if (fields.length) {
    result.fields = fields;
  } else {
    delete result.fields;
  }

  if (slackMentions.size || discordMentions.size) {
    result.mentions = {
      ...(slackMentions.size ? { slack: slackMentions } : {}),
      ...(discordMentions.size ? { discord: discordMentions } : {}),
    };
  } else {
    delete result.mentions;
  }

  return result;
}

function formatSlackMention(mention) {
  const trimmed = String(mention || "").trim();
  if (!trimmed) {
    return null;
  }

  const SPECIAL_MENTIONS = new Set(["@here", "@channel", "@everyone"]);

  if (SPECIAL_MENTIONS.has(trimmed)) {
    return trimmed;
  }

  if (/^<[^>]+>$/.test(trimmed)) {
    return trimmed;
  }

  return `<@${trimmed}>`;
}

module.exports = {
  normalizeAlert,
  combineNormalizedAlerts,
};
