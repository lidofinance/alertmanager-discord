const slack = require("./block_kit");
const {
  markdownToRich,
  markdownToRichElements,
  markdownToPlainText,
} = require("./markdown_to_rich");

function buildTitleAndDescription(alert) {
  const elements = [];

  if (alert.title) {
    if (!alert.isResolved && alert.url) {
      // Unresolved alert with URL: title becomes a clickable link (markdown stripped)
      const plainTitle = markdownToPlainText(alert.title);
      const titleWithEmoji = alert.emoji ? `${alert.emoji} ${plainTitle}` : plainTitle;
      elements.push(slack.richSection(slack.richLink(alert.url, titleWithEmoji)));
    } else {
      // Resolved alert or no URL: title rendered with markdown formatting
      const titleElements = markdownToRichElements(alert.title);
      prependEmojiToFirstSection(titleElements, alert.emoji);
      elements.push(...titleElements);
    }
  }

  // Append description
  if (alert.description) {
    const descriptionElements = markdownToRichElements(alert.description);
    // If no title but has emoji, prepend emoji to description
    if (!alert.title && alert.emoji) {
      prependEmojiToFirstSection(descriptionElements, alert.emoji);
    }
    elements.push(...descriptionElements);
  }

  return slack.rich(...elements);
}

function prependEmojiToFirstSection(elements, emoji) {
  if (emoji && elements.length > 0 && elements[0].type === "rich_text_section") {
    elements[0].elements.unshift(slack.richText(`${emoji} `));
  }
}

function buildFieldsTable(fields) {
  const rows = fields.map((field, index) => [
    slack.rawText(String(index + 1)),
    markdownToRich(field.name),
    markdownToRich(field.value),
  ]);
  return slack.table(rows);
}

function buildFooter(footer) {
  const elements = [];
  if (footer.text) {
    elements.push(slack.mrkdwn(footer.text));
  }
  if (footer.icon_url) {
    elements.push(slack.image(footer.icon_url, "footer icon"));
  }
  return elements.length > 0 ? slack.context(...elements) : null;
}

function convertNormalizedAlertToBlockKit(alert) {
  const blocks = [];

  // 1. Mentions sections (if slack mentions exist)
  if (alert.mentions?.slack?.size > 0) {
    let current = "";
    for (const mention of alert.mentions.slack) {
      const candidate = current ? `${current} ${mention}` : mention;
      if (candidate.length > slack.MAX_TEXT_LENGTH) {
        blocks.push(slack.mrkdwnSection(current));
        current = mention;
      } else {
        current = candidate;
      }
    }
    if (current) {
      blocks.push(slack.mrkdwnSection(current));
    }
  }

  // 2. Title + Description rich block
  blocks.push(buildTitleAndDescription(alert));

  // 3. Fields table (if fields exist)
  if (alert.fields?.length > 0) {
    blocks.push(buildFieldsTable(alert.fields));
  }

  // 4. Footer context (if footer exists)
  if (alert.footer) {
    const footerBlock = buildFooter(alert.footer);
    if (footerBlock) {
      blocks.push(footerBlock);
    }
  }

  return { text: "", blocks };
}

module.exports = {
  convertNormalizedAlertToBlockKit,
};
