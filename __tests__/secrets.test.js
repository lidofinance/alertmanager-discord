const winston = require("winston");
const { SECRET_PATTERNS, cleanSecrets } = require("../secrets");

const MESSAGE = Symbol.for("message");

const scrub = (info, secrets = []) => {
  const format = winston.format.combine(
    cleanSecrets({ secrets, regex: SECRET_PATTERNS }),
    winston.format.json()
  );
  return format.transform({ level: "error", ...info })[MESSAGE];
};

test("a webhook URL that is not in the config is still removed", () => {
  const line = scrub({
    message: 'Discord said: {"url":"https://discord.com/api/webhooks/42/unknown-token"}',
  });
  expect(line).not.toContain("unknown-token");
  expect(line).toContain("<removed>");
});

test("Slack hooks and bearer tokens are removed", () => {
  const line = scrub({
    message:
      "posting to https://hooks.slack.com/services/T0/B0/slack-secret with Bearer abc.def-123",
  });
  expect(line).not.toContain("slack-secret");
  expect(line).not.toContain("abc.def-123");
});

test("values under secret-looking keys are removed whatever they look like", () => {
  const line = scrub({
    message: "error body",
    body: { error: "rate limited", token: "plain-value", headers: { Authorization: "x" } },
  });
  expect(line).not.toContain("plain-value");
  expect(line).toContain("rate limited");
  expect(JSON.parse(line).body.headers.Authorization).toBe("<removed>");
});
