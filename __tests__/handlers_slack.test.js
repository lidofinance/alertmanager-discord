const axios = require("axios");
jest.mock("axios");

const { handleHook } = require("../handlers_slack");

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

test("hook works (table chunking, resolved first)", async () => {
  const makeAlert = (status, i, slackMentions) => ({
    status,
    labels: { alertname: "activate", slack_mentions: slackMentions },
    annotations: {
      summary: "Summary",
      resolved_summary: "Resolved Summary",
      description: "Description",
      resolved_description: "Resolved Description",
      field_name: `name${i}`,
      field_value: `value${i}`,
      url: "https://example.com/fire",
      footer_text: "Footer",
      footer_icon_url: "https://example.com/icon.png",
    },
  });

  const ctx = {
    state: { hook: "/dev/null" },
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
    messageParams: {
      maxTableRows: 2,
    },
    params: { slug: "test" },
    request: {
      body: {
        alerts: [
          makeAlert("resolved", 1, "U1,U2"),
          makeAlert("resolved", 2, "U2,@here"),
          makeAlert("resolved", 3, ""),
          makeAlert("firing", 4, "U3"),
          makeAlert("firing", 5, "U3,<@U4>"),
        ],
      },
    },
  };

  axios.post.mockResolvedValue({ status: 200 });

  await handleHook(ctx);

  expect(ctx.status).toBe(200);
  expect(axios.post.mock.calls.length).toBe(3);
  expect(axios.post.mock.calls).toMatchSnapshot();
});
