const { chromium } = require(
  process.env.ORBIT_PLAYWRIGHT_MODULE || "playwright",
);
const fs = require("node:fs/promises");
const assert = require("node:assert/strict");
// This suite uses a fresh browser profile and fixtures; all public endpoint traffic is blocked.
(async () => {
  const base = process.env.ORBIT_TEST_URL || "http://localhost:8000";
  const output = await fs.mkdtemp(
    require("node:path").join(require("node:os").tmpdir(), "orbit-ui-qa-"),
  );
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (
      m.type() === "error" &&
      /Content Security Policy|Refused/.test(m.text())
    )
      errors.push(m.text());
  });
  await context.route("https://**/*", (r) => r.abort());
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "onLine", { get: () => false });
  });
  await page.goto(base);
  await page.waitForFunction(
    () => document.querySelector("#ratings")?.children.length === 4,
  );
  await page.screenshot({
    path: output + "/orbit-empty-desktop.png",
    fullPage: true,
  });
  const phase = (base, load) => ({
    bytes: (base * 22000 * 1000) / 8,
    durationMs: 22000,
    transferMs: 22000,
    mbps: base,
    points: Array.from({ length: 44 }, (_, i) => ({
      seconds: (i + 1) / 2,
      mbps: base * (0.85 + Math.sin(i * 0.75) * 0.1 + i / 200),
    })),
    loadedPings: [load, load + 6, load - 2, load + 4],
    requests: 40,
    retries: 1,
    probeFailures: 0,
  });
  const record = {
    id: "qa-complete",
    date: "2026-09-15T10:00:00.000Z",
    finished: "2026-09-15T10:01:00.000Z",
    status: "complete",
    server: "Frankfurt, Germany · Clouvider",
    serverId: "libre-11",
    pings: [16, 19, 18, 22, 17, 24, 20, 17, 18, 19],
    download: phase(486.4, 38),
    upload: phase(128.7, 49),
    downloadMbps: 486.4,
    uploadMbps: 128.7,
    pingMs: 18.5,
    jitterMs: 3.9,
    streams: 4,
    measurementVersion: 2,
    network: {
      type: "wifi",
      source: "manual",
      effectiveType: "4g",
      saveData: false,
    },
  };
  const records = [
    record,
    {
      ...record,
      id: "qa-cancel",
      date: "2026-09-14T10:00:00.000Z",
      status: "cancelled",
      download: phase(200, 60),
      upload: null,
      downloadMbps: undefined,
      uploadMbps: undefined,
    },
    {
      ...record,
      id: "qa-failed",
      date: "2026-09-13T10:00:00.000Z",
      status: "failed",
      server: "<img src=x onerror=alert(1)>",
      download: null,
      upload: null,
      downloadMbps: undefined,
      uploadMbps: undefined,
    },
  ];
  await page.evaluate(async (records) => {
    await new Promise((resolve, reject) => {
      const q = indexedDB.open("orbit-speed-test", 1);
      q.onsuccess = () => {
        const db = q.result,
          tx = db.transaction("tests", "readwrite");
        for (const r of records) tx.objectStore("tests").put(r);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  }, records);
  await page.reload();
  await page.waitForFunction(
    () => document.querySelector("#history-count").textContent === "3",
  );
  assert.equal(await page.locator("#download").innerText(), "486.4");
  await page.screenshot({
    path: output + "/orbit-complete-desktop.png",
    fullPage: true,
  });
  await page.getByRole("tab", { name: "Overview", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(
    await page.locator("#tab-telemetry").getAttribute("aria-selected"),
    "true",
  );
  assert.equal(await page.locator("#diag-p99").innerText(), "23.8 ms");
  await page.locator("#chart-scrubber").focus();
  await page.keyboard.press("ArrowRight");
  assert.match(await page.locator("#scrubber-value").innerText(), /0.1s/);
  const graph = await page.locator("#telemetry-chart").boundingBox();
  await page.mouse.move(graph.x + graph.width * 0.5, graph.y + 80);
  assert.equal(await page.locator("#chart-tooltip").isVisible(), true);
  await page.screenshot({
    path: output + "/orbit-telemetry-desktop.png",
    fullPage: true,
  });
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV", exact: true }).click();
  const file = await dl;
  assert.match(await fs.readFile(await file.path(), "utf8"), /486.4/);
  await page.locator("#tab-telemetry").focus();
  await page.keyboard.press("End");
  assert.equal(await page.locator("#view-history").isVisible(), true);
  assert.equal(await page.locator("#history tr").count(), 3);
  assert.equal(await page.locator("#history img").count(), 0);
  await page.screenshot({
    path: output + "/orbit-history-desktop.png",
    fullPage: true,
  });
  await page.getByRole("searchbox").fill("interrupted");
  assert.equal(await page.locator("#history tr").count(), 1);
  await page.getByRole("button", { name: /Inspect <img/ }).click();
  assert.equal(await page.locator("#download").innerText(), "—");
  assert.equal(await page.locator("#diag-state").innerText(), "Interrupted");
  await page.goto(base + "/#history-section");
  await page.waitForFunction(
    () => !document.querySelector("#view-history").hidden,
  );
  assert.equal(await page.locator("#view-history").isVisible(), true);
  await page.getByRole("tab", { name: "Overview", exact: true }).click();
  await page
    .getByRole("button", { name: "About readiness estimates", exact: true })
    .click();
  assert.equal(await page.locator("#info-popover").isVisible(), true);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#info-popover").isVisible(), false);
  assert.equal(
    await page
      .getByRole("button", { name: "About readiness estimates", exact: true })
      .evaluate((e) => e === document.activeElement),
    true,
  );
  await page.locator("#open-routes").click();
  assert.equal(await page.locator("#route-dialog").isVisible(), true);
  await page.getByRole("button", { name: "About these networks ⓘ" }).click();
  assert.equal(await page.locator("#info-popover").isVisible(), true);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#route-dialog").isVisible(), true);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.reload();
  await page.waitForFunction(
    () => document.querySelector("#download").textContent === "486.4",
  );
  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole("tab", { name: "Overview", exact: true }).click();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `overflow ${width}`,
    );
    await page.screenshot({
      path: `${output}/orbit-overview-${width}.png`,
      fullPage: true,
    });
    await page.locator("#tab-telemetry").click();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `telemetry overflow ${width}`,
    );
    await page.screenshot({
      path: `${output}/orbit-telemetry-${width}.png`,
      fullPage: true,
    });
    await page.locator("#tab-history").click();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `history overflow ${width}`,
    );
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS: populated/empty desktop, tablet, 390/320 mobile, keyboard tabs, PWA history deep link, CSV download, history search/partial states, escaped record text, scrubbing, popover focus/Escape and dialog top layer. No JS/CSP errors.",
  );
  console.log("Screenshots: " + output);
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
