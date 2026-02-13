const { MAX_TABLE_ROWS } = require("./block_kit.js");
const { normalizeAlert, combineNormalizedAlerts } = require("./normalize_alert.js");
const { convertNormalizedAlertToBlockKit } = require("./convert_normalized_alert_to_block_kit.js");
const { chunks } = require("./utils.js");

/**
 * Processes a group of normalized alerts with the same status.
 * Alerts with fields are merged in chunks before conversion; otherwise each
 * alert is converted separately.
 *
 * @param {Array<object>} group
 * @param {number} maxTableRows
 * @returns {Array<{text: string, blocks: Array<object>}>}
 */
function processGroup(group, maxTableRows) {
  const [first] = group;

  if (first.fields && first.fields.length) {
    return chunks(group, maxTableRows)
      .map(combineNormalizedAlerts)
      .map(convertNormalizedAlertToBlockKit);
  } else {
    return group.map(convertNormalizedAlertToBlockKit);
  }
}

/**
 * Normalizes raw Alertmanager alerts, groups them by status, and converts each
 * group to one or more Slack webhook payloads.
 *
 * @param {Array<object>} input
 * @param {{maxTableRows?: number}=} options
 * @returns {Array<{text: string, blocks: Array<object>}>}
 */
function processRawAlerts(input, options) {
  const { maxTableRows = MAX_TABLE_ROWS } = options ?? {};
  const normalizedAlerts = input.map(normalizeAlert).filter(Boolean);
  return Map.groupBy(normalizedAlerts, (x) => x.isResolved)
    .entries()
    .toArray()
    .toSorted(([a], [b]) => Number(b) - Number(a))
    .flatMap(([_isResolved, group]) => processGroup(group, maxTableRows));
}

module.exports = {
  processRawAlerts,
};
