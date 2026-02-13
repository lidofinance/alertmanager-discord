const MAX_TEXT_LENGTH = 3000;
const MAX_HEADER_LENGTH = 150;
const MAX_TABLE_ROWS = 100;
const MAX_TABLE_COLUMNS = 20;

function mrkdwnSection(text) {
  if (text.length > MAX_TEXT_LENGTH) {
    throw new Error(`text length ${text.length} > ${MAX_TEXT_LENGTH}`);
  }
  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text,
    },
  };
}

function divider() {
  return {
    type: "divider",
  };
}

function header(text) {
  if (text.length > MAX_HEADER_LENGTH) {
    throw new Error(`text length ${text.length} > ${MAX_HEADER_LENGTH}`);
  }
  return {
    type: "header",
    text: {
      type: "plain_text",
      text: text,
    },
  };
}

function rawText(text) {
  return {
    type: "raw_text",
    text,
  };
}

function rich(...elements) {
  return {
    type: "rich_text",
    elements: elements ?? [],
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

function richLink(url, text, options = {}) {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error(`options should be an object, given ${typeof options}`);
  }
  if (!url && !text) {
    throw new Error("no url, no text");
  }
  const { unsafe, style } = options;
  const block = {
    type: "link",
    url,
    text,
  };

  if (style) {
    validateTextStyle(style);
    block.style = style;
  }

  if (typeof unsafe === "boolean") {
    block.unsafe = unsafe;
  }

  return block;
}

function richList(elements, options = {}) {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error(`options should be an object, given ${typeof options}`);
  }
  let { style, indent, offset, border } = options;
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

function validateTable(rows, columnSettings) {
  if (!Array.isArray(rows)) {
    throw new Error(`rows should be an array, given ${typeof rows}`);
  }

  if (rows.length > MAX_TABLE_ROWS) {
    throw new Error(`Slack table supports up to ${MAX_TABLE_ROWS} rows, but given: ${rows.length}`);
  }

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    if (!Array.isArray(row)) {
      throw new Error(`row at index ${rowIndex} should be an array, given ${typeof row}`);
    }
    if (row.length > MAX_TABLE_COLUMNS) {
      throw new Error(
        `Slack table supports up to ${MAX_TABLE_COLUMNS} columns, but at index ${rowIndex} given: ${row.length}`
      );
    }

    for (let cellIndex = 0; cellIndex < row.length; cellIndex += 1) {
      const cell = row[cellIndex];
      if (cell == null || typeof cell !== "object") {
        throw new Error(
          `cell at row ${rowIndex} column ${cellIndex} should be an object, given ${typeof cell}`
        );
      }
      if (cell.type !== "raw_text" && cell.type !== "rich_text") {
        throw new Error(
          `cell at row ${rowIndex} column ${cellIndex} should be raw_text or rich_text, given ${cell.type}`
        );
      }
      if (cell.type === "raw_text" && typeof cell.text !== "string") {
        throw new Error(
          `cell at row ${rowIndex} column ${cellIndex} should have text as a string, given ${cell.text}`
        );
      }
    }
  }

  if (columnSettings != null && !Array.isArray(columnSettings)) {
    throw new Error(`columnSettings should be an array, given ${typeof columnSettings}`);
  }

  if (columnSettings && columnSettings.length > MAX_TABLE_COLUMNS) {
    throw new Error(
      `Slack table supports up to ${MAX_TABLE_COLUMNS} column settings, but given: ${columnSettings.length}`
    );
  }

  const allowedAlign = ["left", "center", "right"];
  const allowedKeys = ["align", "is_wrapped"];

  if (columnSettings) {
    for (let index = 0; index < columnSettings.length; index += 1) {
      const settings = columnSettings[index];
      if (settings == null) {
        continue;
      }

      if (typeof settings !== "object") {
        throw new Error(`columnSettings[${index}] should be an object, given ${typeof settings}`);
      }

      for (const key of Object.keys(settings)) {
        if (!allowedKeys.includes(key)) {
          throw new Error(
            `columnSettings[${index}] allow only "${allowedKeys.join(",")}" key, given: ${key}`
          );
        }
      }

      if (settings.align != null && !allowedAlign.includes(settings.align)) {
        throw new Error(
          `columnSettings[${index}].align should be 'left', 'center', or 'right', given ${settings.align}`
        );
      }

      if (settings.is_wrapped != null && typeof settings.is_wrapped !== "boolean") {
        throw new Error(
          `columnSettings[${index}].is_wrapped should be boolean or unset, given ${settings.is_wrapped}`
        );
      }
    }
  }
}

function table(rows, columnSettings) {
  validateTable(rows, columnSettings);

  const table = {
    type: "table",
    rows: rows,
  };

  if (columnSettings && columnSettings.length) {
    table.column_settings = columnSettings;
  }

  return table;
}

function context(...elements) {
  return {
    type: "context",
    elements,
  };
}

function mrkdwn(text) {
  return {
    type: "mrkdwn",
    text,
  };
}

function image(url, altText) {
  if (!altText) {
    throw new Error("alt_text is required");
  }
  return {
    type: "image",
    image_url: url,
    alt_text: altText,
  };
}

module.exports = {
  MAX_TEXT_LENGTH,
  MAX_TABLE_ROWS,
  mrkdwnSection,
  header,
  divider,
  rich,
  richText,
  richSection,
  richLink,
  richList,
  richPreformatted,
  richQuote,
  table,
  rawText,
  context,
  mrkdwn,
  image,
};
