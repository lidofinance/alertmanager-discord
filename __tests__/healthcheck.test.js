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

const { handleReadiness } = require("../healthcheck");

test("ready with routes loaded", () => {
  const ctx = { routes: { alpha: {} }, shuttingDown: false };
  handleReadiness(ctx);
  expect(ctx.status).toBe(200);
  expect(ctx.body).toEqual({ status: "ready", routes: 1 });
});

test("not ready without routes or while shutting down", () => {
  const empty = { routes: {} };
  handleReadiness(empty);
  expect(empty.status).toBe(503);
  expect(empty.body.status).toBe("no routes");

  const stopping = { routes: { alpha: {} }, shuttingDown: true };
  handleReadiness(stopping);
  expect(stopping.status).toBe(503);
  expect(stopping.body.status).toBe("shutting down");
});
