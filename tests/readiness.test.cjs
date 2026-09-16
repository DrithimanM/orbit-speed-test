const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const context = vm.createContext({});
vm.runInContext(fs.readFileSync("dist/core.js", "utf8"), context);
const rate = vm.runInContext("SpeedCore.ratings", context);
const record = (overrides = {}) => ({
  status: "complete",
  downloadMbps: 100,
  uploadMbps: 20,
  pingMs: 25,
  jitterMs: 3,
  ...overrides,
});
const grades = (result) => Array.from(rate(result), (r) => r.grade);

test("fast, responsive connections get four useful activity-specific results", () => {
  assert.deepEqual(grades(record()), [
    "Responsive",
    "4K streaming",
    "1440p · responsive",
    "1080p calls",
  ]);
  for (const r of rate(record())) {
    assert.equal(r.level, "good");
    assert.ok(
      r.evidence.length > 0 && r.detail.length > 0 && r.advice.length > 0,
    );
  }
});
test("a fast distant route retains streaming and call bandwidth capability", () => {
  const r = record({
    downloadMbps: 127,
    uploadMbps: 105.4,
    pingMs: 160.3,
    jitterMs: 12.6,
  });
  assert.deepEqual(grades(r), [
    "High latency",
    "4K streaming",
    "High input delay",
    "1080p calls · some delay",
  ]);
  assert.match(rate(r)[0].evidence, /160 ms RTT/);
  assert.match(rate(r)[1].evidence, /≈8 × 4K/);
  assert.match(rate(r)[2].evidence, /1440p bandwidth/);
  assert.equal(rate(r)[3].level, "fair");
});
test("download and upload limitations affect only the appropriate activities", () => {
  assert.deepEqual(grades(record({ downloadMbps: 4, uploadMbps: 2 })), [
    "Bandwidth constrained",
    "720p streaming",
    "More bandwidth needed",
    "720p one-to-one",
  ]);
  const asymmetric = rate(record({ uploadMbps: 0.5 }));
  assert.equal(asymmetric[0].grade, "Bandwidth constrained");
  assert.equal(asymmetric[1].grade, "4K streaming");
  assert.equal(asymmetric[3].grade, "Audio-first calls");
  assert.match(asymmetric[3].evidence, /0.5 ↑ Mbps/);
});
test("high jitter produces timing warnings instead of a blanket bandwidth downgrade", () => {
  const r = rate(record({ jitterMs: 45 }));
  assert.deepEqual(
    Array.from(r, (item) => item.grade),
    [
      "Unstable timing",
      "4K streaming",
      "Uneven response",
      "1080p calls · choppy timing",
    ],
  );
  assert.match(r[2].evidence, /45 ms jitter/);
});
test("loaded delay uses a median, requires three valid probes, and preserves streaming capability", () => {
  const r = record({
    download: { loadedPings: [140, 150, 130] },
    upload: { loadedPings: [35, 40, 45] },
  });
  assert.deepEqual(grades(r), [
    "Lag under load",
    "4K streaming",
    "Lag under load",
    "1080p calls · lag under load",
  ]);
  assert.match(rate(r)[0].evidence, /\+115 ms during download/);
  assert.match(rate(r)[0].detail, /median of 3 probes/);
  for (const loadedPings of [
    [9999],
    [9999, 9999],
    [10, 20, 9999],
    [10, 20, 25],
    [NaN, Infinity, -1, 9999],
  ]) {
    assert.equal(
      rate(record({ download: { loadedPings } }))[0].grade,
      "Responsive",
    );
  }
  assert.equal(
    rate(record({ upload: { loadedPings: [105, 105, 105] } }))[0].grade,
    "Lag under load",
  );
  assert.equal(
    rate(record({ upload: { loadedPings: [104, 104, 104] } }))[0].grade,
    "Responsive",
  );
});
test("streaming resolution changes at documented thresholds, independent of idle timing", () => {
  for (const [d, grade] of [
    [0.99, "Buffering likely"],
    [1, "Lower-resolution video"],
    [2.99, "Lower-resolution video"],
    [3, "720p streaming"],
    [4.99, "720p streaming"],
    [5, "1080p streaming"],
    [14.99, "1080p streaming"],
    [15, "4K streaming"],
  ]) {
    assert.equal(
      rate(record({ downloadMbps: d, pingMs: 500, jitterMs: 99 }))[1].grade,
      grade,
    );
  }
});
test("cloud gaming bandwidth and RTT boundaries remain distinct", () => {
  for (const [d, grade] of [
    [14.99, "More bandwidth needed"],
    [15, "720p · responsive"],
    [24.99, "720p · responsive"],
    [25, "1080p · responsive"],
    [35, "1440p · responsive"],
  ]) {
    assert.equal(rate(record({ downloadMbps: d }))[2].grade, grade);
  }
  assert.equal(rate(record({ pingMs: 79.9 }))[2].grade, "1440p · some lag");
  assert.equal(rate(record({ pingMs: 80 }))[2].grade, "High input delay");
});
test("calls use directional bandwidth requirements and retain their tier with delay", () => {
  for (const [d, u, grade] of [
    [0, 0, "Call dropouts likely"],
    [0.1, 0.1, "Audio-first calls"],
    [0.6, 1, "Basic video calls"],
    [1.2, 1.2, "720p one-to-one"],
    [1.8, 2.6, "720p group calls"],
    [3, 3.8, "1080p calls"],
    [3, 3.79, "720p group calls"],
  ]) {
    assert.equal(
      rate(record({ downloadMbps: d, uploadMbps: u }))[3].grade,
      grade,
    );
  }
  assert.equal(
    rate(record({ pingMs: 300 }))[3].grade,
    "1080p calls · high delay",
  );
});
test("incomplete, missing and invalid data stay neutral; zero rates remain real constraints", () => {
  for (const invalid of [
    null,
    undefined,
    {},
    record({ status: "failed" }),
    record({ status: "cancelled" }),
    record({ status: "running" }),
    record({ pingMs: NaN }),
    record({ jitterMs: -1 }),
    record({ uploadMbps: Infinity }),
    record({ downloadMbps: "100" }),
  ]) {
    assert.equal(rate(invalid).length, 4);
    assert.ok(rate(invalid).every((r) => r.level === "neutral"));
  }
  assert.deepEqual(grades(record({ downloadMbps: 0, uploadMbps: 0 })), [
    "Bandwidth constrained",
    "Buffering likely",
    "More bandwidth needed",
    "Call dropouts likely",
  ]);
  assert.equal(rate(record({ status: undefined }))[0].grade, "Responsive");
});
test("legacy records need no migration and interface labels never change ratings", () => {
  const base = JSON.stringify(rate(record()));
  for (const type of ["wifi", "ethernet", "3g", "4g", "5g"]) {
    assert.equal(
      JSON.stringify(rate(record({ network: { type, source: "manual" } }))),
      base,
    );
  }
});
