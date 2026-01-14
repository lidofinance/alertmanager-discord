const axios = require("axios");
jest.mock("axios");

const { handleHook } = require("../handlers_slack_alternative");

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
      maxEmbedsLength: 10,
      maxFieldsLength: 25,
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
