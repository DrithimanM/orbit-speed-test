const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const context = vm.createContext({
  URL,
  OrbitSecurity: require("../dist/security.js"),
});
vm.runInContext(
  fs.readFileSync("dist/core.js", "utf8") +
    "\n" +
    fs.readFileSync("dist/telemetry.js", "utf8"),
  context,
);
const T = vm.runInContext("OrbitTelemetry", context);
const catalog = JSON.parse(fs.readFileSync("dist/servers.json", "utf8"));
const phase = {
  bytes: 1000000,
  durationMs: 22000,
  transferMs: 22000,
  mbps: 8 / 22,
  points: [
    { seconds: 1, mbps: 5 },
    { seconds: 2, mbps: 8 },
  ],
  loadedPings: [8, 12],
  requests: 2,
  retries: 0,
  probeFailures: 0,
};
const record = {
  id: "fixture",
  date: "2026-09-15T10:00:00.000Z",
  status: "complete",
  server: "Test route",
  serverId: "cloudflare",
  pings: [10, 20, 30, 40],
  download: phase,
  upload: { ...phase, loadedPings: [80, 100] },
  downloadMbps: 8 / 22,
  uploadMbps: 8 / 22,
  pingMs: 25,
  jitterMs: 10,
  streams: 4,
  measurementVersion: 2,
};
test("telemetry derives real percentiles and preserves negative loaded deltas", () => {
  const s = T.stats(record);
  assert.equal(s.idle.p50Ms, 25);
  assert.equal(s.idle.p95Ms, 38.5);
  assert.ok(Math.abs(s.idle.p99Ms - 39.7) < 1e-9);
  assert.equal(s.download.deltaMs, -15);
  assert.equal(s.upload.deltaMs, 65);
  assert.equal(s.idle.samples, 4);
  assert.equal(T.stats(null).idle.p50Ms, null);
  assert.equal(T.stats({ pings: [], download: phase }).download.deltaMs, null);
});
test("diagnostic URLs resolve only reviewed endpoints, never stored server text", () => {
  for (const server of catalog.servers) {
    const paths = T.endpoint(
      { ...record, serverId: "libre-" + server.id },
      catalog,
    );
    assert.ok(paths);
    for (const url of Object.values(paths))
      assert.ok(context.OrbitSecurity.approvedURL(url, "https://example.com/"));
  }
  assert.equal(
    T.endpoint(
      { ...record, serverId: "libre-999999", server: "https://evil.example" },
      catalog,
    ),
    null,
  );
  const hostile = {
    servers: [{ ...catalog.servers[0], server: "https://evil.example/" }],
  };
  assert.equal(
    T.endpoint(
      { ...record, serverId: "libre-" + catalog.servers[0].id },
      hostile,
    ),
    null,
  );
  const cmd = T.curl(record, catalog);
  assert.match(cmd, /--max-time 10/);
  assert.match(cmd, /bytes=0/);
  assert.doesNotMatch(cmd, /--data|__up/);
});
test("exports retain partial status without presenting partial rates as completed results", () => {
  const partial = {
    ...record,
    status: "failed",
    downloadMbps: undefined,
    uploadMbps: undefined,
  };
  const report = T.raw(partial, catalog);
  assert.equal(report.measurement.status, "failed");
  assert.equal(report.derived.download.bytes, 1000000);
  assert.match(T.csv([partial]), /"failed","",""/);
  assert.equal(Object.hasOwn(report, "ip"), false);
  assert.equal(Object.hasOwn(report, "isp"), false);
});
test("CSV quotes commas and newlines and neutralizes spreadsheet formulas", () => {
  assert.equal(T.csvCell('hello, "world"'), '"hello, ""world"""');
  for (const value of [
    '=HYPERLINK("bad")',
    " +formula",
    "\t@formula",
    "-formula",
  ])
    assert.ok(T.csvCell(value).startsWith("\"'"));
  assert.equal(T.csvCell(null), '""');
  assert.equal(T.csvCell(-15), '"-15"');
  assert.equal(T.csvCell("line\nbreak"), '"line\nbreak"');
  assert.match(T.csv([record]), /download_duration_ms/);
});
test("scrubbing returns measured samples only within the recorded range", () => {
  assert.equal(T.sampleAt(phase.points, 0.5), null);
  assert.equal(T.sampleAt(phase.points, 3), null);
  assert.equal(T.sampleAt(phase.points, 1.8).mbps, 8);
  assert.equal(T.sampleAt([], 1), null);
});
