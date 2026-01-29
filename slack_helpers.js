const { Lexer } = require("marked");

const SPECIAL_MENTIONS = new Set(["@here", "@channel", "@everyone"]);

const formatSlackMessageContext = (messageContext) => {
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
};

const logSlackResponse = (ctx, response, messageContext) => {
  const contextSuffix = formatSlackMessageContext(messageContext);
  ctx.logger.info(`Slack webhook responded with status ${response.status}${contextSuffix}`);
};

const logSlackError = (ctx, err, messageContext) => {
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
};

const collectPlainText = (tokens) => {
  if (!tokens || !tokens.length) {
    return "";
  }

  return tokens
    .map((token) => {
      if (token.type === "text" || token.type === "escape") {
        return token.text;
      }
      if (token.type === "strong" || token.type === "em" || token.type === "del") {
        return collectPlainText(token.tokens || []);
      }
      if (token.type === "link") {
        return collectPlainText(token.tokens || []) || token.text || "";
      }
      if (token.type === "codespan") {
        return token.text;
      }
      if (token.type === "br") {
        return "\n";
      }
      return token.text || token.raw || "";
    })
    .join("");
};

const renderSlackMrkdwn = (tokens) => {
  if (!tokens || !tokens.length) {
    return "";
  }

  return tokens
    .map((token) => {
      if (token.type === "text" || token.type === "escape") {
        return token.text;
      }
      if (token.type === "strong") {
        return `*${renderSlackMrkdwn(token.tokens || [])}*`;
      }
      if (token.type === "em") {
        return `_${renderSlackMrkdwn(token.tokens || [])}_`;
      }
      if (token.type === "del") {
        return `~${renderSlackMrkdwn(token.tokens || [])}~`;
      }
      if (token.type === "codespan") {
        return `\`${token.text}\``;
      }
      if (token.type === "link") {
        const linkText = collectPlainText(token.tokens || []) || token.text || "";
        return `<${token.href}|${linkText}>`;
      }
      if (token.type === "br") {
        return "\n";
      }
      return token.text || token.raw || "";
    })
    .join("");
};

const convertMarkdownToSlack = (text) => {
  if (!text) {
    return "";
  }

  const tokens = Lexer.lexInline(String(text));
  return renderSlackMrkdwn(tokens);
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

  const tokens = Lexer.lexInline(content);
  const elements = tokens
    .map((token) => {
      if (token.type === "text" || token.type === "escape") {
        return { type: "text", text: token.text };
      }
      if (token.type === "strong") {
        return { type: "text", text: collectPlainText(token.tokens || []), style: { bold: true } };
      }
      if (token.type === "em") {
        return {
          type: "text",
          text: collectPlainText(token.tokens || []),
          style: { italic: true },
        };
      }
      if (token.type === "del") {
        return {
          type: "text",
          text: collectPlainText(token.tokens || []),
          style: { strike: true },
        };
      }
      if (token.type === "codespan") {
        return { type: "text", text: token.text, style: { code: true } };
      }
      if (token.type === "link") {
        return {
          type: "link",
          url: token.href,
          text: collectPlainText(token.tokens || []) || token.text || "",
        };
      }
      if (token.type === "br") {
        return { type: "text", text: "\n" };
      }
      return { type: "text", text: token.text || token.raw || "" };
    })
    .filter((element) => element.text !== "" || element.type !== "text");

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

const buildRichTextListBlock = (items) => {
  return {
    type: "rich_text",
    elements: [
      {
        type: "rich_text_list",
        style: "bullet",
        elements: items.map((item) => ({
          type: "rich_text_section",
          elements: parseRichTextElements(item),
        })),
      },
    ],
  };
};

const buildTableBlock = (rows) => {
  return {
    type: "table",
    rows: rows.map((row, index) => {
      return [
        buildRichTextCell(String(index + 1)),
        buildRichTextCell(row.field_name),
        buildRichTextCell(row.field_value),
      ];
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
  buildRichTextListBlock,
  buildSectionBlock,
  buildTableBlock,
  convertMarkdownToSlack,
  getSlackMentions,
  logSlackError,
  logSlackResponse,
};
