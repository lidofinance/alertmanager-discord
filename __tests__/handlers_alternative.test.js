const axios = require("axios");
jest.mock("axios");

const { handleHook } = require("../handlers_alternative");

test("hook works", async () => {
  const getAlert = (i) => {
    return {
      status: "resolved",
      labels: { alertname: "activate" },
      annotations: {
        description: "cinema",
        summary: "donor" + String(i).padStart(2, "0"),
      },
    };
  };
  // mock
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
    },
    params: { slug: "test" },
    request: {
      body: {
        alerts: Array.from({ length: 11 }, (_, i) => getAlert(i)),
      },
    },
  };

  axios.post.mockResolvedValue(null);

  await handleHook(ctx);

  expect(ctx.status).toBe(200);
  expect(axios.post.mock.calls.length).toBe(2);
  expect(axios.post.mock.calls).toMatchSnapshot();
});

test("balval features are correct", async () => {
  const getAlert = (i) => {
    return {
      status: i % 2 === 0 ? "resolved" : "fired", // resolved should be first
      labels: { alertname: "activate" },
      annotations: {
        description: "common description",
        resolved_description: "common resolved description",
        summary: "common summary with count",
        resolved_summary: "common resolved summary with count",
        field_name: "name" + String(i).padStart(2, "0"),
        field_value: "value" + String(i).padStart(2, "0"),
        url: `https://ya-${i % 2 === 0 ? "resolved" : "fired"}.ru`, // only last fired should have the same url
      },
    };
  };
  // mock
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
    },
    params: { slug: "test" },
    request: {
      body: {
        alerts: Array.from({ length: 26 }, (_, i) => getAlert(i)),
      },
    },
  };

  axios.post.mockResolvedValue(null);

  await handleHook(ctx);

  expect(ctx.status).toBe(200);
  expect(axios.post.mock.calls.length).toBe(1);
  expect(axios.post.mock.calls).toMatchSnapshot();
});

test("mention works", async () => {
  const getAlert = (i) => {
    return {
      status: "resolved",
      labels: {
        alertname: "activate",
        mentions: i % 2 === 0 ? `mention-${i}, another-mention-${i}` : "",
      },
      annotations: {
        description: "cinema",
        summary: "donor" + String(i).padStart(2, "0"),
      },
    };
  };
  // mock
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
    },
    params: { slug: "test" },
    request: {
      body: {
        alerts: Array.from({ length: 11 }, (_, i) => getAlert(i)),
      },
    },
  };

  axios.post.mockResolvedValue(null);

  await handleHook(ctx);

  expect(ctx.status).toBe(200);
  expect(axios.post.mock.calls.length).toBe(2);
  expect(axios.post.mock.calls).toMatchSnapshot();
});
