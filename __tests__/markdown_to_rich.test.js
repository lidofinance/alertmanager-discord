const { markdownToRich } = require("../markdown_to_rich");
const slack = require("../block_kit");

it("should translate paragraph to rich text block", () => {
  const markdown = `simple line`;

  const blocks = markdownToRich(markdown);

  expect(blocks).toStrictEqual(slack.rich(slack.richSection(slack.richText("simple line"))));
});

it("should translate bold", () => {
  const markdown = `**bold**`;

  const blocks = markdownToRich(markdown);

  expect(blocks).toStrictEqual(
    slack.rich(slack.richSection(slack.richText("bold", { bold: true })))
  );
});

it("should translate other bold", () => {
  const markdown = `__bold__`;

  const blocks = markdownToRich(markdown);

  expect(blocks).toStrictEqual(
    slack.rich(slack.richSection(slack.richText("bold", { bold: true })))
  );
});

it("should translate italic", () => {
  const markdown = `_italic_`;

  const blocks = markdownToRich(markdown);

  expect(blocks).toStrictEqual(
    slack.rich(slack.richSection(slack.richText("italic", { italic: true })))
  );
});

it("should translate codespan", () => {
  const markdown = "`php`";

  const blocks = markdownToRich(markdown);

  expect(blocks).toStrictEqual(
    slack.rich(slack.richSection(slack.richText("php", { code: true })))
  );
});

it("should translate strike", () => {
  const markdown = "~~php~~";

  const blocks = markdownToRich(markdown);

  expect(blocks).toStrictEqual(
    slack.rich(slack.richSection(slack.richText("php", { strike: true })))
  );
});

it("should translate link", () => {
  const markdown = "[link](https://example.com)";

  const blocks = markdownToRich(markdown);

  expect(blocks).toStrictEqual(
    slack.rich(slack.richSection(slack.richLink("https://example.com", "link")))
  );
});

it("should translate nested markdown", () => {
  const markdown = "**_bolditalic_**";

  const blocks = markdownToRich(markdown);

  expect(blocks).toStrictEqual(
    slack.rich(slack.richSection(slack.richText("bolditalic", { bold: true, italic: true })))
  );
});

it("should translate complex nested markdown", () => {
  const markdown = "~~**_bolditalicstrike_**~~";

  const blocks = markdownToRich(markdown);

  expect(blocks).toStrictEqual(
    slack.rich(
      slack.richSection(
        slack.richText("bolditalicstrike", { bold: true, italic: true, strike: true })
      )
    )
  );
});

it("should translate nested markdown with text", () => {
  const markdown = "normal **bold _bolditalic_ bold** normal";

  const blocks = markdownToRich(markdown);

  expect(blocks).toStrictEqual(
    slack.rich(
      slack.richSection(
        slack.richText("normal "),
        slack.richText("bold ", { bold: true }),
        slack.richText("bolditalic", { bold: true, italic: true }),
        slack.richText(" bold", { bold: true }),
        slack.richText(" normal")
      )
    )
  );
});

it("should translate link with styles", () => {
  const markdown = "**[link](https://example.com)**";

  const blocks = markdownToRich(markdown);

  expect(blocks).toStrictEqual(
    slack.rich(
      slack.richSection(slack.richLink("https://example.com", "link", false, { bold: true }))
    )
  );
});

it("should translate multiline", () => {
  const markdown = "line 1\nline2\nline 3";

  const blocks = markdownToRich(markdown);

  expect(blocks).toStrictEqual(
    slack.rich(slack.richSection(slack.richText("line 1\nline2\nline 3")))
  );
});

it("should translate multiple paragraph", () => {
  const markdown = "line 1\n\nline 2";

  const blocks = markdownToRich(markdown);

  expect(blocks).toStrictEqual(
    slack.rich(
      slack.richSection(slack.richText("line 1")),
      slack.richSection(slack.richText("line 2"))
    )
  );
});

it("should translate unordered list", () => {
  const markdown = "- item 1\n- item 2";

  const blocks = markdownToRich(markdown);

  expect(blocks).toStrictEqual(
    slack.rich(
      slack.richList([
        slack.richSection(slack.richText("item 1")),
        slack.richSection(slack.richText("item 2")),
      ])
    )
  );
});

it("should translate unordered list preserving formatting", () => {
  const markdown = "- **item 1**\n- _item 2_";

  const blocks = markdownToRich(markdown);

  expect(blocks).toStrictEqual(
    slack.rich(
      slack.richList([
        slack.richSection(slack.richText("item 1", { bold: true })),
        slack.richSection(slack.richText("item 2", { italic: true })),
      ])
    )
  );
});

it("should translate ordered list", () => {
  const markdown = "1) item 1\n2) item 2";

  const blocks = markdownToRich(markdown);

  expect(blocks).toStrictEqual(
    slack.rich(
      slack.richList(
        [slack.richSection(slack.richText("item 1")), slack.richSection(slack.richText("item 2"))],
        "ordered"
      )
    )
  );
});

it("should translate ordered list preserving formatting", () => {
  const markdown = "1) **item 1**\n2) _item 2_";

  const blocks = markdownToRich(markdown);

  expect(blocks).toStrictEqual(
    slack.rich(
      slack.richList(
        [
          slack.richSection(slack.richText("item 1", { bold: true })),
          slack.richSection(slack.richText("item 2", { italic: true })),
        ],
        "ordered"
      )
    )
  );
});

it("should translate nested list", () => {
  const markdown = "* one\n* two\n    1) sub two 1\n    2) sub two 2\n* three";

  const blocks = markdownToRich(markdown);

  expect(blocks).toStrictEqual(
    slack.rich(
      slack.richList([
        slack.richSection(slack.richText("one")),
        slack.richSection(slack.richText("two")),
      ]),
      slack.richList(
        [
          slack.richSection(slack.richText("sub two 1")),
          slack.richSection(slack.richText("sub two 2")),
        ],
        "ordered",
        1
      ),
      slack.richList([slack.richSection(slack.richText("three"))])
    )
  );
});

it("should translate code block to preformatted", () => {
  const markdown = "```\nhello world\n```";

  const blocks = markdownToRich(markdown);

  expect(blocks).toStrictEqual(slack.rich(slack.richPreformatted(slack.richText("hello world"))));
});

it("should translate code block with language to preformatted", () => {
  const markdown = "```javascript\nconst x = 1;\n```";

  const blocks = markdownToRich(markdown);

  expect(blocks).toStrictEqual(slack.rich(slack.richPreformatted(slack.richText("const x = 1;"))));
});

it("should translate blockquote to rich_text_quote", () => {
  const markdown = "> this is a quote";

  const blocks = markdownToRich(markdown);

  expect(blocks).toStrictEqual(slack.rich(slack.richQuote(slack.richText("this is a quote"))));
});

it("should translate blockquote with formatting", () => {
  const markdown = "> **bold** and _italic_";

  const blocks = markdownToRich(markdown);

  expect(blocks).toStrictEqual(
    slack.rich(
      slack.richQuote(
        slack.richText("bold", { bold: true }),
        slack.richText(" and "),
        slack.richText("italic", { italic: true })
      )
    )
  );
});

it("should translate heading to bold text", () => {
  const markdown = "# Heading 1";

  const blocks = markdownToRich(markdown);

  expect(blocks).toStrictEqual(
    slack.rich(slack.richSection(slack.richText("Heading 1", { bold: true })))
  );
});

it("should translate h2 heading to bold text", () => {
  const markdown = "## Heading 2";

  const blocks = markdownToRich(markdown);

  expect(blocks).toStrictEqual(
    slack.rich(slack.richSection(slack.richText("Heading 2", { bold: true })))
  );
});

it("should translate heading with nested formatting", () => {
  const markdown = "# **Bold** Heading";

  const blocks = markdownToRich(markdown);

  expect(blocks).toStrictEqual(
    slack.rich(slack.richSection(slack.richText("Bold Heading", { bold: true })))
  );
});

it("should translate heading with image", () => {
  const markdown = "# Image ![alt text](https://example.com/img.png)";

  const blocks = markdownToRich(markdown);

  expect(blocks).toStrictEqual(
    slack.rich(
      slack.richSection(slack.richText("Image https://example.com/img.png", { bold: true }))
    )
  );
});

it("should translate heading with image title", () => {
  const markdown = '# ![alt](https://example.com/img.png "Image Title")';

  const blocks = markdownToRich(markdown);

  expect(blocks).toStrictEqual(
    slack.rich(slack.richSection(slack.richText("Image Title", { bold: true })))
  );
});

it("should translate heading with html as text", () => {
  const markdown = "# Hello<br>World";

  const blocks = markdownToRich(markdown);

  expect(blocks).toStrictEqual(
    slack.rich(slack.richSection(slack.richText("Hello<br>World", { bold: true })))
  );
});

it("should ignore image in paragraph", () => {
  const markdown = "text ![alt](https://example.com/img.png) more";

  const blocks = markdownToRich(markdown);

  expect(blocks).toStrictEqual(
    slack.rich(slack.richSection(slack.richText("text "), slack.richText(" more")))
  );
});

it("should not escape special characters", () => {
  const markdown = "foo & bar < baz > qux";

  const blocks = markdownToRich(markdown);

  expect(blocks).toStrictEqual(
    slack.rich(slack.richSection(slack.richText("foo & bar < baz > qux")))
  );
});

it("should not escape special characters in codespan", () => {
  const markdown = "`a < b && b > c`";

  const blocks = markdownToRich(markdown);

  expect(blocks).toStrictEqual(
    slack.rich(slack.richSection(slack.richText("a < b && b > c", { code: true })))
  );
});

it("should not escape quotes in codespan", () => {
  const markdown = "`\"hello\" and 'world'`";

  const blocks = markdownToRich(markdown);

  expect(blocks).toStrictEqual(
    slack.rich(slack.richSection(slack.richText("\"hello\" and 'world'", { code: true })))
  );
});
