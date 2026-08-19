const fs = require("fs");
const os = require("os");
const path = require("path");

const { ConfigWatcher, describeRouteChanges } = require("../config");

const hookUrl = (token) => `https://discord.com/api/webhooks/123/${token}`;

let dir, configPath, renders;

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

const configWith = (token) => `hooks:\n  - slug: alpha\n    hook: ${hookUrl(token)}\n`;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "alertmanager-discord-"));
  configPath = path.join(dir, "alertmanager-discord.yml");
  renders = 0;
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const watcherFor = (onChange, onError) =>
  new ConfigWatcher({ path: configPath, intervalInSeconds: 10, onChange, onError });

test("a rename over the path is picked up", () => {
  render(configWith("first"));
  const onChange = jest.fn();
  const onError = jest.fn();
  const watcher = watcherFor(onChange, onError);

  expect(watcher.checkOnce()).toBe(false);

  render(configWith("second"));

  expect(watcher.checkOnce()).toBe(true);
  expect(onChange.mock.calls[0][0].routes.alpha.hook).toBe(hookUrl("second"));
  expect(onChange.mock.calls[0][0].webhookTokens).toEqual(["123/second"]);
  expect(onError).not.toHaveBeenCalled();
});

test("unparseable YAML is not applied and is reported once", () => {
  render(configWith("first"));
  const onChange = jest.fn();
  const onError = jest.fn();
  const watcher = watcherFor(onChange, onError);

  render("hooks: [\n  - slug");

  expect(watcher.checkOnce()).toBe(false);
  expect(watcher.checkOnce()).toBe(false);
  expect(onChange).not.toHaveBeenCalled();
  expect(onError).toHaveBeenCalledTimes(1);
});

test("an invalid hook URL is not applied", () => {
  render(configWith("first"));
  const onChange = jest.fn();
  const onError = jest.fn();
  const watcher = watcherFor(onChange, onError);

  render("hooks:\n  - slug: alpha\n    hook: https://example.com/nope\n");

  expect(watcher.checkOnce()).toBe(false);
  expect(onChange).not.toHaveBeenCalled();
  expect(onError).toHaveBeenCalledTimes(1);
});

test("a config without usable hooks is not applied", () => {
  render(configWith("first"));
  const onChange = jest.fn();
  const onError = jest.fn();
  const watcher = watcherFor(onChange, onError);

  render("hooks: []\n");

  expect(watcher.checkOnce()).toBe(false);
  expect(onChange).not.toHaveBeenCalled();
  expect(onError).toHaveBeenCalledTimes(1);
});

test("a deleted file is not applied", () => {
  render(configWith("first"));
  const onChange = jest.fn();
  const onError = jest.fn();
  const watcher = watcherFor(onChange, onError);

  fs.rmSync(configPath);

  expect(watcher.checkOnce()).toBe(false);
  expect(onChange).not.toHaveBeenCalled();
  expect(onError).not.toHaveBeenCalled();
});

test("stop clears the poll timer", () => {
  render(configWith("first"));
  const watcher = watcherFor(jest.fn(), jest.fn());

  watcher.start();
  expect(watcher.timer).not.toBeNull();

  watcher.stop();
  expect(watcher.timer).toBeNull();
});

test("changes are described by slug", () => {
  const previous = {
    alpha: { type: "discord", hook: hookUrl("first") },
    gone: { type: "discord", hook: hookUrl("gone") },
  };
  const next = {
    alpha: { type: "discord", hook: hookUrl("second") },
    fresh: { type: "discord", hook: hookUrl("fresh") },
  };

  const changes = describeRouteChanges(previous, next);

  expect(changes).toBe("added fresh; removed gone; re-pointed alpha");
  expect(changes).not.toContain("first");
  expect(changes).not.toContain("second");
  expect(describeRouteChanges(previous, previous)).toBeNull();
});
