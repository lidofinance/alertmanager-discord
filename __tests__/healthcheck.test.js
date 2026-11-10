const { handleHealthcheck } = require("../healthcheck");

test("healthcheck works", () => {
  const ctx = {
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
    routes: { alpha: { type: "slack", hook: "https://hooks.slack.com/services/a/b/c" } },
    configLoadedAt: "2026-08-21T10:00:00.000Z",
  };

  handleHealthcheck(ctx);

  expect(ctx.status).toBe(200);
  expect(ctx.body.status).toBe("ok");
  expect(ctx.body.uptime).toBeDefined();
  expect(ctx.body.routes).toBe(1);
  expect(ctx.body.configLoadedAt).toBe("2026-08-21T10:00:00.000Z");
});

test("a process that loaded no routes says so, while still answering 200", () => {
  const ctx = { routes: {} };

  handleHealthcheck(ctx);

  expect(ctx.status).toBe(200);
  expect(ctx.body.routes).toBe(0);
});
