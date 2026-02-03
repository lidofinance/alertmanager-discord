const marked = require("marked");
const slack = require("./block_kit");

function unescapeHtml(text) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function translatePlainText(token) {
  if (token.tokens) {
    return token.tokens.flatMap(translatePlainText);
  }
  if (token.type === "image") {
    return [token.title ?? token.href];
  }
  return [token.raw];
}

function translateHeading(token) {
  const text = token.tokens.flatMap(translatePlainText).join("");
  return slack.richSection(slack.richText(text, { bold: true }));
}

const STYLE_MAP = { strong: "bold", em: "italic", del: "strike", codespan: "code" };

function hasStyles(styles) {
  return Object.keys(styles).length > 0;
}

function translateSection(token, styles = {}) {
  const styleProp = STYLE_MAP[token.type];
  const newStyles = styleProp ? { ...styles, [styleProp]: true } : styles;
  const styleArg = hasStyles(newStyles) ? newStyles : undefined;

  if (token.type === "link") {
    return [slack.richLink(token.href, token.text, false, styleArg)];
  }
  if (token.type === "codespan") {
    return [slack.richText(unescapeHtml(token.text), styleArg)];
  }
  if (token.tokens) {
    return token.tokens.flatMap((t) => translateSection(t, newStyles));
  }
  if (token.type === "text") {
    return [slack.richText(token.raw, styleArg)];
  }
  return [];
}

function translateParagraph(token) {
  return slack.richSection(...token.tokens.flatMap((t) => translateSection(t)));
}

function translateCode(token) {
  return slack.richPreformatted(slack.richText(token.text));
}

function translateBlockquote(token) {
  const elements = token.tokens
    .filter((child) => child.type === "paragraph")
    .flatMap((child) => child.tokens.flatMap(translateSection));
  return slack.richQuote(...elements);
}

function partitionTokens(tokens) {
  const lists = [];
  const other = [];
  for (const t of tokens) {
    if (t.type === "list") {
      lists.push(t);
    } else {
      other.push(t);
    }
  }
  return { lists, other };
}

function translateList(token, indent = 0) {
  const result = [];
  let currentListItems = [];
  const style = token.ordered ? "ordered" : "bullet";

  function flushCurrentList() {
    if (currentListItems.length > 0) {
      result.push(slack.richList(currentListItems, style, indent));
      currentListItems = [];
    }
  }

  for (const item of token.items) {
    const { lists, other } = partitionTokens(item.tokens);

    if (other.length > 0) {
      currentListItems.push(slack.richSection(...other.flatMap(translateSection)));
    }

    if (lists.length > 0) {
      flushCurrentList();
      for (const nested of lists) {
        result.push(...translateList(nested, indent + 1));
      }
    }
  }

  flushCurrentList();
  return result;
}

const TOKEN_HANDLERS = {
  heading: translateHeading,
  paragraph: translateParagraph,
  code: translateCode,
  blockquote: translateBlockquote,
  list: translateList,
};

function markdownToRich(markdown) {
  const tokens = new marked.Lexer().lex(markdown);
  const elements = tokens.flatMap((t) => TOKEN_HANDLERS[t.type]?.(t) ?? []);
  return slack.rich(...elements);
}

module.exports = {
  markdownToRich,
};
