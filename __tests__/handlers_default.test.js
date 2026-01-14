const axios = require("axios");
jest.mock("axios");

const { handleHook, getMentions, getFields } = require("../handlers_default");

function getAlert(i) {
  return {
    status: "resolved",
    labels: { alertname: "activate" },
    annotations: {
      description: "cinema",
      summary: "donor" + String(i).padStart(2, "0"),
    },
  };
}

test("hook works (no mentions)", async () => {
  // mock
  const ctx = {
    state: { hook: "/dev/null" },
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
    params: { slug: "test" },
    query: { q: "42" },

    request: {
      body: {
        alerts: Array.from({ length: 11 }, (_, i) => getAlert(i)),
      },
    },
  };

  axios.post.mockResolvedValue(null);

  await handleHook(ctx, () => {});

  expect(ctx.status).toBe(200);
  expect(axios.post.mock.calls.length).toBe(11);
  expect(axios.post.mock.calls).toMatchSnapshot();
});

test("hook works (missing annotations subfield)", async () => {
  // mock
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
            labels: { alertname: "activate" },
            annotations: {
              summary: "here was no description",
            },
          },
          {
            status: "resolved",
            labels: { alertname: "activate" },
            annotations: {
              description: "here was no summary",
            },
          },
        ],
      },
    },
  };

  axios.post.mockResolvedValue(null);

  await handleHook(ctx, () => {});

  expect(ctx.status).toBe(200);
  expect(axios.post.mock.calls.length).toBe(2);
  expect(axios.post.mock.calls).toMatchSnapshot();
});

test("hook works (mentions)", async () => {
  // mock
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
        alerts: Array.from({ length: 11 }, (_, i) => {
          const body = getAlert(i);
          body.labels.mentions = `user${i},42,`;
          return body;
        }),
      },
    },
  };

  axios.post.mockResolvedValue(null);

  await handleHook(ctx, () => {});

  expect(ctx.status).toBe(200);
  expect(axios.post.mock.calls.length).toBe(11);
  expect(axios.post.mock.calls).toMatchSnapshot();
});

test("hook works (fields)", async () => {
  // mock
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
            labels: { alertname: "activate" },
            annotations: {
              summary: "Obi-Wan Kenobi says",
              inline_fields: ["- **hello**", "- there"].join("\n\n"),
            },
          },
        ],
      },
    },
  };

  axios.post.mockResolvedValue(null);

  await handleHook(ctx, () => {});

  expect(ctx.status).toBe(200);
  expect(axios.post.mock.calls).toMatchSnapshot();
});

test("getMentions works (no label)", () => {
  const mentions = getMentions({
    labels: {},
  });

  expect(mentions.length).toBe(0);
});

test("getMentions works (valid label's value)", () => {
  const mentions = getMentions({
    labels: {
      mentions: "123,456,",
    },
  });

  expect(mentions).toStrictEqual(["<@123>", "<@456>"]);
});

test("getFields works (no inline_fields)", () => {
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  const fields = getFields(
    {
      annotations: {},
    },
    logger
  );

  expect(fields.length).toBe(0);
});

test("getFields works (not a list)", () => {
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  const fields = getFields(
    {
      annotations: {
        inline_fields: "**hm**",
      },
    },
    logger
  );

  expect(fields.length).toBe(0);
});

test("getFields works (valid list)", () => {
  const fields = getFields({
    annotations: {
      inline_fields: "- **hm**",
    },
  });

  expect(fields.length).toBe(1);
});

test("getFields works (nested list)", () => {
  const fields = getFields({
    annotations: {
      inline_fields: "- **hm**\n\t+ **hmmm**",
    },
  });

  expect(fields.length).toBe(1);
});
