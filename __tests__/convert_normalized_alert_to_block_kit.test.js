const { convertNormalizedAlertToBlockKit } = require("../convert_normalized_alert_to_block_kit");
const slack = require("../block_kit");

it("should convert simple alert", () => {
  const alert = {
    isResolved: true,
    emoji: "📈📝❌",
    title: "**Bold** and normal, and maybe just a little _italic_",
    description: "See [link](https://example.com) it's **really** god!",
    footer: {
      text: "from Lido with Love",
      icon_url: "https://pbs.twimg.com/profile_images/625633822235693056/lNGUneLX_400x400.jpg",
    },
    fields: [
      {
        name: "Operator 1",
        value: "[Operator 1](http://example.com)|[Grafana](https://grafana.com/)",
      },
    ],
    mentions: {
      slack: new Set(["<@U100500>", "<@ULALA>"]),
    },
  };

  const result = convertNormalizedAlertToBlockKit(alert);

  expect(result).toStrictEqual({
    text: "",
    blocks: [
      slack.mrkdwnSection("<@U100500> <@ULALA>"),
      slack.rich(
        slack.richSection(
          slack.richText("📈📝❌ "),
          slack.richText("Bold", { bold: true }),
          slack.richText(" and normal, and maybe just a little "),
          slack.richText("italic", { italic: true })
        ),
        slack.richSection(
          slack.richText("See "),
          slack.richLink("https://example.com", "link"),
          slack.richText(" it's "),
          slack.richText("really", { bold: true }),
          slack.richText(" god!")
        )
      ),
      slack.table([
        [
          slack.rawText("1"),
          slack.rich(slack.richSection(slack.richText("Operator 1"))),
          slack.rich(
            slack.richSection(
              slack.richLink("http://example.com", "Operator 1"),
              slack.richText("|"),
              slack.richLink("https://grafana.com/", "Grafana")
            )
          ),
        ],
      ]),
      slack.context(
        slack.mrkdwn("from Lido with Love"),
        slack.image(
          "https://pbs.twimg.com/profile_images/625633822235693056/lNGUneLX_400x400.jpg",
          "footer icon"
        )
      ),
    ],
  });
});

it("should handle alert with only description (no title)", () => {
  const alert = {
    isResolved: false,
    description: "This alert has no title",
  };

  const result = convertNormalizedAlertToBlockKit(alert);

  expect(result).toHaveProperty("blocks");
  expect(result.blocks.length).toBeGreaterThan(0);
});

it("should split mentions into multiple sections when exceeding MAX_TEXT_LENGTH", () => {
  // 400 unique mentions → ~4400 chars of "<@U10000> <@U10001> ..." — well over 3000
  const mentions = new Set(
    Array.from({ length: 400 }, (_, i) => `<@U${10000 + i}>`)
  );
  const alert = {
    isResolved: false,
    title: "test",
    mentions: { slack: mentions },
  };

  const result = convertNormalizedAlertToBlockKit(alert);

  const mentionBlocks = result.blocks.filter(
    (b) => b.type === "section" && b.text.text.includes("<@U")
  );
  // Must produce more than one section to stay under the limit
  expect(mentionBlocks.length).toBeGreaterThan(1);
  // Every section must respect the 3000-char limit
  for (const block of mentionBlocks) {
    expect(block.text.text.length).toBeLessThanOrEqual(3000);
  }
  // All mentions must be present across all sections
  const allText = mentionBlocks.map((b) => b.text.text).join(" ");
  for (const mention of mentions) {
    expect(allText).toContain(mention);
  }
});

it("should produce valid context block when footer has icon_url but no text", () => {
  const alert = {
    isResolved: false,
    description: "_ _",
    footer: {
      icon_url: "http://a.aa",
    },
  };

  const result = convertNormalizedAlertToBlockKit(alert);

  expect(result).toStrictEqual({
    text: "",
    blocks: [
      slack.rich(slack.richSection(slack.richText("_ _"))),
      slack.context(slack.image("http://a.aa", "footer icon")),
    ],
  });
});

it("should make title clickable for unresolved alert", () => {
  const alert = {
    isResolved: false,
    emoji: "📈📝❌",
    title: "**Bold** and normal, and maybe just a little _italic_",
    url: "https://example.com",
    description: "description",
  };

  const result = convertNormalizedAlertToBlockKit(alert);

  expect(result).toStrictEqual({
    text: "",
    blocks: [
      slack.rich(
        slack.richSection(
          slack.richLink(
            "https://example.com",
            "📈📝❌ Bold and normal, and maybe just a little italic"
          )
        ),
        slack.richSection(slack.richText("description"))
      ),
    ],
  });
});
