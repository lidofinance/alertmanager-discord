const MAX_TEXT_LENGTH = 3000;
const MAX_HEADER_LENGTH = 150;

function section(text) {
  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text: text.slice(0, MAX_TEXT_LENGTH),
    },
  };
}

function divider() {
  return {
    type: "divider",
  };
}

function header(text) {
  return {
    type: "header",
    text: {
      type: "plain_text",
      text: text.slice(0, MAX_HEADER_LENGTH),
    },
  };
}

function rich(...elements) {
  return {
    type: "rich_text",
    elements,
  };
}

function richSection(...elements) {
  if (!Array.isArray(elements)) {
    throw new Error(`elements should be an array, given ${typeof elements}`);
  }
  return {
    type: "rich_text_section",
    elements,
  };
}

function richText(text, style) {
  const block = {
    type: "text",
    text,
  };

  if (style) {
    validateTextStyle(style);
    block.style = style;
  }

  return block;
}

function richLink(url, text, unsafe, style) {
  const block = {
    type: "link",
    url,
    text,
  };

  if (style) {
    validateTextStyle(style);
    block.style = style;
  }

  return block;
}

function richList(elements, style, indent, offset, border) {
  if (!Array.isArray(elements)) {
    throw new Error(`elements should be an array, given ${typeof elements}`);
  }
  style ??= "bullet";
  if (style !== "bullet" && style !== "ordered") {
    throw new Error(`style should be 'bullet' or 'ordered', given '${style}'`);
  }
  indent ??= 0;
  offset ??= 0;
  border ??= 0;
  validateNumber(indent, "indent");
  validateNumber(offset, "offset");
  validateNumber(border, "border");

  return {
    type: "rich_text_list",
    style,
    indent,
    offset,
    border,
    elements,
  };
}

function validateTextStyle(style) {
  if (typeof style !== "object") {
    throw new Error(`style should be an object, given ${typeof style}`);
  }

  const allowedKeys = ["bold", "italic", "strike", "code"];

  for (const key of Object.keys(style)) {
    if (!allowedKeys.includes(key)) {
      throw new Error(`style allow only "${allowedKeys.join(",")}" key, given: ${key}`);
    }
    if (typeof style[key] !== "boolean") {
      throw new Error(`style.${key} should be boolean or unset, given ${style[key]}`);
    }
  }
}

function validateNumber(value, name) {
  if (typeof value !== "number") {
    throw new Error(`${name} should be a number, given ${value}`);
  }
}

function richPreformatted(...elements) {
  if (!Array.isArray(elements)) {
    throw new Error(`elements should be an array, given ${typeof elements}`);
  }
  return {
    type: "rich_text_preformatted",
    elements,
  };
}

function richQuote(...elements) {
  if (!Array.isArray(elements)) {
    throw new Error(`elements should be an array, given ${typeof elements}`);
  }
  return {
    type: "rich_text_quote",
    elements,
  };
}

function simpleList(elements) {
  if (!Array.isArray(elements)) {
    throw new Error(`elements should be an array, given ${typeof elements}`);
  }
  if (!elements.every((item) => typeof item === "string")) {
    throw new Error(`each element should be a string`);
  }

  return rich(richList(elements.map((text) => richSection(richText(text)))));
}

module.exports = {
  MAX_TEXT_LENGTH,
  section,
  header,
  divider,
  rich,
  richText,
  richSection,
  richLink,
  richList,
  richPreformatted,
  richQuote,
  simpleList,
};
