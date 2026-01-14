const { handleHealthcheck } = require("../healthcheck");

test("healthcheck works", () => {
  const ctx = {
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
  };

  handleHealthcheck(ctx);

  expect(ctx.status).toBe(200);
  expect(ctx.body.status).toBe("ok");
  expect(ctx.body.uptime).toBeDefined();
});
