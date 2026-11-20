const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const axios = require("axios");

const { createMetrics, instrumentAxios, readBuildInfo, targetOf } = require("../metrics");

const sample = async (metrics, name, labels) => {
  const metric = (await metrics.register.getMetricsAsJSON()).find((m) => m.name === name);
  const value = metric.values.find((v) =>
    Object.entries(labels).every(([key, expected]) => v.labels[key] === expected)
  );
  return value ? value.value : 0;
};

test("hosts map to targets and nothing else leaks into the label", () => {
  expect(targetOf("https://discord.com/api/webhooks/1/token")).toBe("discord");
  expect(targetOf("https://discordapp.com/api/webhooks/1/token")).toBe("discord");
  expect(targetOf("https://hooks.slack.com/services/T/B/token")).toBe("slack");
  expect(targetOf("https://example.com/whatever")).toBe("other");
  expect(targetOf("not a url")).toBe("other");
});

test("the placeholder build-info and a missing file both read as unknown", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "build-info-"));
  const file = path.join(dir, "build-info.json");
  fs.writeFileSync(
    file,
    JSON.stringify({ branch: "REPLACE_WITH_BRANCH", commit: "REPLACE_WITH_COMMIT" })
  );
  expect(readBuildInfo(file)).toEqual({ branch: "unknown", commit: "unknown" });

  fs.writeFileSync(file, JSON.stringify({ branch: "master", commit: "abc123" }));
  expect(readBuildInfo(file)).toEqual({ branch: "master", commit: "abc123" });

  expect(readBuildInfo(path.join(dir, "missing.json"))).toEqual({
    branch: "unknown",
    commit: "unknown",
  });
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("outgoing requests", () => {
  let server, url, nextStatus, client, metrics;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      req.resume();
      req.on("end", () => {
        res.statusCode = nextStatus;
        res.end("{}");
      });
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    url = `http://127.0.0.1:${server.address().port}/hook`;
  });

  afterAll(() => new Promise((resolve) => server.close(resolve)));

  beforeEach(() => {
    client = axios.create();
    metrics = createMetrics();
    instrumentAxios(client, metrics);
  });

  test("a delivered request is counted and timed by status", async () => {
    nextStatus = 204;
    await client.post(url, {});

    const labels = { target: "other", status: "204" };
    expect(await sample(metrics, "alertmanager_discord_webhook_requests_total", labels)).toBe(1);
    const histogram = (await metrics.register.getMetricsAsJSON()).find(
      (m) => m.name === "alertmanager_discord_webhook_request_duration_seconds"
    );
    const count = histogram.values.find(
      (v) => v.metricName.endsWith("_count") && v.labels.status === "204"
    );
    expect(count.value).toBe(1);
  });

  test("a 429 is counted, and the error still reaches the handler", async () => {
    nextStatus = 429;
    await expect(client.post(url, {})).rejects.toThrow("429");

    expect(
      await sample(metrics, "alertmanager_discord_webhook_requests_total", { status: "429" })
    ).toBe(1);
  });

  test("no response is counted as an error, without a status code", async () => {
    await expect(client.post("http://127.0.0.1:1/hook", {})).rejects.toThrow();

    expect(
      await sample(metrics, "alertmanager_discord_webhook_requests_total", { status: "error" })
    ).toBe(1);
  });

  test("instrumenting twice does not double-count", async () => {
    instrumentAxios(client, metrics);
    nextStatus = 200;
    await client.post(url, {});

    expect(
      await sample(metrics, "alertmanager_discord_webhook_requests_total", { status: "200" })
    ).toBe(1);
  });
});
