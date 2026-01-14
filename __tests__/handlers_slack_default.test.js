const axios = require("axios");
jest.mock("axios");

const { handleHook } = require("../handlers_slack_default");

test("hook works (mentions, table, markdown)", async () => {
  const ctx = {
    state: { hook: "/dev/null" },
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
    params: { slug: "test" },
    query: {},
    request: {
      body: {
        alerts: [
          {
            status: "resolved",
            labels: {
              alertname: "activate",
              slack_mentions: "U123, @here, <@U456>,U123",
            },
            annotations: {
              summary: "**Bold summary**",
              description: "See [link](https://example.com)",
              inline_fields: ["- **field**", "- [value](https://example.com/path)"].join("\n"),
              footer_text: "Footer **bold**",
              footer_icon_url: "https://example.com/icon.png",
            },
          },
        ],
      },
    },
  };

  axios.post.mockResolvedValue({ status: 200 });

  await handleHook(ctx);

  expect(ctx.status).toBe(200);
  expect(axios.post.mock.calls.length).toBe(1);
  expect(axios.post.mock.calls).toMatchSnapshot();
});
