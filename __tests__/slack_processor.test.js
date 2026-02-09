const { processRawAlerts } = require("../slack_processor.js");
const bk = require("../block_kit.js");

it("should process simple alert", () => {
  const rawAlerts = [
    {
      status: "resolved",
      labels: {
        slack_mentions: "U100500",
      },
      annotations: {
        summary: "this is summary",
        description: "this is description",
      },
    },
  ];

  const result = processRawAlerts(rawAlerts);

  expect(result).toMatchSnapshot();
});

it("should process realistically alert", async () => {
  const rawAlerts = [
    {
      status: "resolved",
      labels: {
        slack_mentions: "U100500",
      },
      annotations: {
        emoji: "📥",
        summary: "Operators that missed block proposal in the last finalized epoch",
        resolved_summary: "Operators did not miss block proposal in the last finalized epoch.",
        description: "Number of validators per operator that missed block proposal.",
        resolved_description: "Number of recovered validators per operator.",
        field_name: "Best operator",
        field_value: "[1](https://grafana.com)|[Some other link](https://example.com)",
        footer_text: "Epoch • 120200202",
        footer_icon_url: "https://cryptologos.cc/logos/steth-steth-logo.png",
      },
    },
  ];

  const result = processRawAlerts(rawAlerts);

  expect(result).toMatchSnapshot();
});

it("should order alerts by status: resolved first", () => {
  const rawAlerts = [
    {
      status: "firing",
      annotations: {
        summary: "FIRING",
      },
    },
    {
      status: "resolved",
      annotations: {
        summary: "RESOLVED",
      },
    },
  ];

  const result = processRawAlerts(rawAlerts);

  expect(result).toHaveLength(2);
  expect(result[0]).toMatchObject({
    blocks: [{ elements: [{ elements: [{ text: "RESOLVED" }] }] }],
  });
  expect(result[1]).toMatchObject({
    blocks: [{ elements: [{ elements: [{ text: "FIRING" }] }] }],
  });
});

it("should filter malformed alerts", () => {
  const rawAlers = [
    {
      annotations: {
        summary: "Something happens",
      },
    },
    {
      annotations: {},
    },
    {
      annotations: "",
    },
    {
      annotations: 12,
    },
    {
      labels: [],
    },
  ];

  const result = processRawAlerts(rawAlers);

  expect(result).toMatchInlineSnapshot(`
    Array [
      Object {
        "blocks": Array [
          Object {
            "elements": Array [
              Object {
                "elements": Array [
                  Object {
                    "text": "Something happens",
                    "type": "text",
                  },
                ],
                "type": "rich_text_section",
              },
            ],
            "type": "rich_text",
          },
        ],
        "text": "",
      },
    ]
  `);
});

it("should group alerts if `field_name` and `field_value` exists", () => {
  const rawAlerts = [
    {
      annotations: {
        summary: "this is alert number 1",
        field_name: "name 1",
        field_value: "value 1",
      },
      labels: {
        slack_mentions: "U123,U456",
      },
    },
    {
      annotations: {
        summary: "this is alert number 2",
        field_name: "name 2",
        field_value: "value 2",
      },
      labels: {
        slack_mentions: "U789",
      },
    },
  ];

  const result = processRawAlerts(rawAlerts);

  expect(result).toHaveLength(1);
  const firstPayload = result[0];
  expect(firstPayload).toMatchObject({ text: "", blocks: expect.anything() });
  expect(Array.isArray(firstPayload.blocks)).toBe(true);
  const mentions = firstPayload.blocks[0];
  expect(mentions).toStrictEqual(bk.mrkdwnSection("<@U123> <@U456> <@U789>"));
});

it("should split long group of alers", () => {
  const MAX_ALERTS_PER_GROUP = 10;
  const EXTRA = 5;
  const MENTION_BASE = 100000;

  const rawAlers = Array.from({ length: MAX_ALERTS_PER_GROUP + EXTRA }).map((_, index) => ({
    labels: {
      slack_mentions: `U${MENTION_BASE + index}`,
    },
    annotations: {
      summary: `the summary of alert index ${index}`,
      field_name: `field name ${index}`,
      field_value: `field value ${index}`,
    },
  }));

  const result = processRawAlerts(rawAlers, {
    maxTableRows: MAX_ALERTS_PER_GROUP,
  });

  expect(result).toHaveLength(2);
  const firstPayload = result[0];
  const firstPayloadJson = JSON.stringify(firstPayload);
  for (let i = 0; i < MAX_ALERTS_PER_GROUP; i++) {
    expect(firstPayloadJson).toContain(`<@U${MENTION_BASE + i}`);
  }

  const secondPayload = result[1];
  const secondPayloadJson = JSON.stringify(secondPayload);
  for (let i = MAX_ALERTS_PER_GROUP; i < MAX_ALERTS_PER_GROUP + EXTRA; i++) {
    expect(secondPayloadJson).toContain(`<@U${MENTION_BASE + i}`);
  }
});
