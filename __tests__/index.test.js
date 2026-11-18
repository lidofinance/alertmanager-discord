const fs = require("fs");
const os = require("os");
const path = require("path");

const MESSAGE = Symbol.for("message");

const hookUrl = (token) => `https://discord.com/api/webhooks/123/${token}`;
const configWith = (...slugs) =>
  ["hooks:"]
    .concat(slugs.map((slug) => `  - slug: ${slug}\n    hook: ${hookUrl(slug)}`))
    .join("\n");

let dir, configPath, renders, service;

// Renders a temp file and renames it over the path, the way the OpenBao agent does. The mtime is
// bumped explicitly so the test does not depend on the filesystem's timestamp resolution.
const render = (body) => {
  const temp = `${configPath}.temp`;
  fs.writeFileSync(temp, body);
  fs.renameSync(temp, configPath);
  renders += 1;
  const later = new Date(Date.now() + renders * 1000);
  fs.utimesSync(configPath, later, later);
};

const start = (env = {}) => {
  jest.resetModules();
  process.env.CONFIG_PATH = configPath;
  Object.assign(process.env, env);

  service = require("../index").start();
  return service;
};

// The line as the transport writes it, so the assertion sees what the scrubber produced.
const nextLoggedLine = (logger, contains) =>
  new Promise((resolve) => {
    logger.transports[0].on("logged", (info) => {
      if (info[MESSAGE].includes(contains)) {
        resolve(info[MESSAGE]);
      }
    });
  });

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "alertmanager-discord-"));
  configPath = path.join(dir, "alertmanager-discord.yml");
  renders = 0;
  service = null;
});

afterEach(async () => {
  if (service) {
    service.watcher.stop();
    // Awaited: the next test binds the same port.
    await new Promise((resolve) => service.server.close(resolve));
  }
  process.removeAllListeners("SIGTERM");
  process.removeAllListeners("SIGINT");
  jest.restoreAllMocks();
  delete process.env.CONFIG_PATH;
  fs.rmSync(dir, { recursive: true, force: true });
});

test("CONFIG_PATH is read instead of the default path", () => {
  render(configWith("alpha"));

  const { app } = start();

  expect(app.context.routes).toEqual({ alpha: { type: "discord", hook: hookUrl("alpha") } });
});

test("a rotated config replaces the route map without a restart", () => {
  render(configWith("alpha"));
  const { app, logger, watcher } = start();
  const info = jest.spyOn(logger, "info");
  const before = app.context.routes;

  render(configWith("alpha", "beta").replace(hookUrl("alpha"), hookUrl("alpha-rotated")));

  expect(watcher.checkOnce()).toBe(true);
  expect(app.context.routes.alpha.hook).toBe(hookUrl("alpha-rotated"));
  expect(app.context.routes.beta.hook).toBe(hookUrl("beta"));
  // Swapped, not mutated: the map a request is already reading stays as it was.
  expect(before.alpha.hook).toBe(hookUrl("alpha"));
  expect(before.beta).toBeUndefined();
  expect(info).toHaveBeenCalledWith("Configuration reloaded: added beta; re-pointed alpha");
});

test("a bad render keeps the previous routes and is logged once", () => {
  render(configWith("alpha"));
  const { app, logger, watcher } = start();
  const error = jest.spyOn(logger, "error");

  render("hooks: [\n  - slug");

  expect(watcher.checkOnce()).toBe(false);
  expect(watcher.checkOnce()).toBe(false);
  expect(app.context.routes.alpha.hook).toBe(hookUrl("alpha"));
  expect(error).toHaveBeenCalledTimes(1);
});

test("the log scrubber follows a rotation", async () => {
  render(configWith("alpha"));
  const { logger, watcher } = start();

  render(configWith("alpha").replace(hookUrl("alpha"), hookUrl("rotated-token")));
  expect(watcher.checkOnce()).toBe(true);

  const line = nextLoggedLine(logger, "Failed to post");
  logger.info(`Failed to post to ${hookUrl("rotated-token")}`);

  expect(await line).not.toContain("rotated-token");
  expect(await line).toContain("<removed>");
});

// Lines the logger wrote to stdout before start() returned, parsed.
const captureStdout = () => {
  const write = jest.spyOn(process.stdout, "write").mockImplementation(() => true);
  return () =>
    write.mock.calls
      .map(([chunk]) => String(chunk))
      .filter((line) => line.startsWith("{"))
      .map((line) => JSON.parse(line));
};

test("a config that loads no hooks exits instead of serving 404s, logging through the logger", () => {
  render("hooks: []");
  const exit = jest.spyOn(process, "exit").mockImplementation(() => {});
  const lines = captureStdout();

  start();

  expect(exit).toHaveBeenCalledWith(1);
  expect(lines()).toContainEqual(
    expect.objectContaining({
      level: "error",
      message: expect.stringContaining("every alert would be answered with 404"),
    })
  );
});

test("a broken config at startup is logged without the hook URLs its YAML error quotes", () => {
  render(`hooks:\n  - slug: alpha\n    hook: ${hookUrl("leaked-token")}\n  - slug: [`);
  const exit = jest.spyOn(process, "exit").mockImplementation(() => {});
  const lines = captureStdout();

  start();

  expect(exit).toHaveBeenCalledWith(1);
  const output = JSON.stringify(lines());
  expect(output).toContain("Failed to read configuration file");
  expect(output).not.toContain("leaked-token");
});

test("startup logs the effective settings with slugs, not hook URLs", () => {
  render(configWith("alpha"));
  const lines = captureStdout();

  start({ PORT: "5001" });

  const starting = lines().find((line) => line.message === "Starting");
  expect(starting).toMatchObject({ port: 5001, configPath, routes: { alpha: "discord" } });
  expect(JSON.stringify(lines())).not.toContain(hookUrl("alpha"));
});

test("the health body reports the routes in force and moves on with a rotation", () => {
  render(configWith("alpha"));
  const { app, watcher } = start();
  const first = app.context.configLoadedAt;

  expect(Object.keys(app.context.routes)).toEqual(["alpha"]);
  expect(first).toBeDefined();

  render(configWith("alpha", "beta"));
  expect(watcher.checkOnce()).toBe(true);

  expect(Object.keys(app.context.routes).sort()).toEqual(["alpha", "beta"]);
  expect(Date.parse(app.context.configLoadedAt)).toBeGreaterThanOrEqual(Date.parse(first));
});

test("SIGTERM closes the server and stops the poll", async () => {
  render(configWith("alpha"));
  const { logger, server, watcher } = start();
  const info = jest.spyOn(logger, "info");
  const exit = jest.spyOn(process, "exit").mockImplementation(() => {});
  await new Promise((resolve) => server.once("listening", resolve));

  process.emit("SIGTERM");
  await new Promise((resolve) => server.once("close", resolve));

  expect(server.listening).toBe(false);
  expect(watcher.timer).toBeNull();
  expect(exit).toHaveBeenCalledWith(0);
  expect(info).toHaveBeenCalledWith("Shutting down on SIGTERM");
});

// The real axios, not a mock: these requests go to the service under test.
const get = (server, route) =>
  require("axios").get(`http://127.0.0.1:${server.address().port}${route}`, {
    validateStatus: () => true,
    // Every test binds the same port; a kept-alive socket would outlive its server.
    headers: { Connection: "close" },
  });

test("/ready answers 503 once shutdown begins, while /health stays 200", async () => {
  render(configWith("alpha"));
  const { app, server } = start();
  await new Promise((resolve) => server.once("listening", resolve));

  expect((await get(server, "/ready")).status).toBe(200);

  app.context.shuttingDown = true;
  const ready = await get(server, "/ready");
  expect(ready.status).toBe(503);
  expect(ready.data).toEqual({ status: "shutting down", routes: 1 });
  expect((await get(server, "/health")).status).toBe(200);
});

test("/metrics serves runtime metrics and build_info", async () => {
  render(configWith("alpha"));
  const { server } = start();
  await new Promise((resolve) => server.once("listening", resolve));

  const response = await get(server, "/metrics");

  expect(response.status).toBe(200);
  expect(response.data).toContain("process_cpu_seconds_total");
  expect(response.data).toMatch(/build_info\{version="[^"]+",commit="[^"]+",branch="[^"]+"\} 1/);
});
