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
