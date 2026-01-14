const SPECIAL_MENTIONS = new Set(["@here", "@channel", "@everyone"]);

const convertMarkdownToSlack = (text) => {
  if (!text) {
    return "";
  }

  return text.replace(/\*\*(.+?)\*\*/g, "*$1*").replace(/\[([^\]]+)\]\(([^)]+)\)/g, "<$2|$1>");
};

const formatSlackMention = (mention) => {
  const trimmed = String(mention || "").trim();
  if (!trimmed) {
    return null;
  }

  if (SPECIAL_MENTIONS.has(trimmed)) {
    return trimmed;
  }

  if (/^<[^>]+>$/.test(trimmed)) {
    return trimmed;
  }

  return `<@${trimmed}>`;
};

const getSlackMentions = (labels) => {
  const rawMentions = labels?.slack_mentions;
  if (!rawMentions) {
    return [];
  }

  const mentions = rawMentions.split(",").map(formatSlackMention).filter(Boolean);

  return [...new Set(mentions)];
};

const parseRichTextElements = (text) => {
  const content = String(text || "");
  if (!content) {
    return [{ type: "text", text: "" }];
  }

  const elements = [];
  const tokenPattern = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match;

  while ((match = tokenPattern.exec(content)) !== null) {
    if (match.index > lastIndex) {
      elements.push({ type: "text", text: content.slice(lastIndex, match.index) });
    }

    const token = match[0];
    if (token.startsWith("**")) {
      elements.push({ type: "text", text: token.slice(2, -2), style: { bold: true } });
    } else {
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (linkMatch) {
        elements.push({ type: "link", url: linkMatch[2], text: linkMatch[1] });
      } else {
        elements.push({ type: "text", text: token });
      }
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < content.length) {
    elements.push({ type: "text", text: content.slice(lastIndex) });
  }

  return elements.length ? elements : [{ type: "text", text: "" }];
};

const buildRichTextCell = (text) => {
  return {
    type: "rich_text",
    elements: [
      {
        type: "rich_text_section",
        elements: parseRichTextElements(text),
      },
    ],
  };
};

const buildTableBlock = (rows) => {
  return {
    type: "table",
    rows: rows.map((row, index) => {
      return {
        type: "table_row",
        cells: [
          { type: "raw_text", text: String(index + 1) },
          { type: "raw_text", text: row.field_name || "" },
          buildRichTextCell(row.field_value || ""),
        ],
      };
    }),
  };
};

const buildSectionBlock = (text) => {
  if (!text) {
    return null;
  }

  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text,
    },
  };
};

const buildContextBlock = (footerText, footerIconUrl) => {
  if (!footerText && !footerIconUrl) {
    return null;
  }

  const elements = [];
  if (footerIconUrl) {
    elements.push({
      type: "image",
      image_url: footerIconUrl,
      alt_text: "footer icon",
    });
  }
  if (footerText) {
    elements.push({
      type: "mrkdwn",
      text: convertMarkdownToSlack(footerText),
    });
  }

  return {
    type: "context",
    elements,
  };
};

module.exports = {
  buildContextBlock,
  buildRichTextCell,
  buildSectionBlock,
  buildTableBlock,
  convertMarkdownToSlack,
  getSlackMentions,
};
