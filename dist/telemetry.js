/* Pure presentation helpers. All rates come from measured records. */
const OrbitTelemetry = (() => {
  const present = (value) =>
    typeof value === "number" && Number.isFinite(value);
  const number = (value, digits = 1) =>
    present(value) ? value.toFixed(digits) : "—";
  const median = (values) => (values?.length ? SpeedCore.median(values) : null);
  const statusLabel = (status) =>
    ({
      complete: "Complete",
      failed: "Interrupted",
      cancelled: "Cancelled",
      running: "Unfinished",
    })[status] || "No flight yet";
  function stats(record) {
    const pings = record?.pings || [];
    const idle = median(pings);
    const phases = Object.fromEntries(
      ["download", "upload"].map((direction) => {
        const phase = record?.[direction],
          loaded = median(phase?.loadedPings);
        return [
          direction,
          {
            medianMs: loaded,
            deltaMs: loaded !== null && idle !== null ? loaded - idle : null,
            samples: phase?.loadedPings?.length || 0,
            bytes: phase?.bytes ?? null,
            durationMs: phase?.durationMs ?? null,
            requests: phase?.requests ?? null,
            retries: phase?.retries ?? null,
            probeFailures: phase?.probeFailures ?? null,
          },
        ];
      }),
    );
    return {
      idle: {
        p50Ms: idle,
        p95Ms: pings.length ? SpeedCore.percentile(pings, 0.95) : null,
        p99Ms: pings.length ? SpeedCore.percentile(pings, 0.99) : null,
        samples: pings.length,
      },
      ...phases,
    };
  }
  function endpoint(record, catalog) {
    if (!record) return null;
    if (record.serverId === "cloudflare")
      return {
        ping: "https://speed.cloudflare.com/__down?bytes=0",
        download: "https://speed.cloudflare.com/__down",
        upload: "https://speed.cloudflare.com/__up",
      };
    const id = /^libre-(\d+)$/.exec(record.serverId || "")?.[1];
    const server = catalog?.servers?.find(
      (server) =>
        String(server.id) === id && OrbitSecurity.approvedServer(server),
    );
    if (!server) return null;
    const base =
      (server.server.startsWith("//") ? "https:" : "") +
      server.server.replace(/\/?$/, "/");
    return Object.fromEntries(
      [
        ["ping", "pingURL"],
        ["download", "dlURL"],
        ["upload", "ulURL"],
      ].map(([kind, key]) => {
        const url = new URL(server[key], base);
        url.searchParams.set("cors", "true");
        return [
          kind,
          OrbitSecurity.approvedURL(url.href, "https://example.invalid/"),
        ];
      }),
    );
  }
  function raw(record, catalog) {
    if (!record) return null;
    return {
      schema: "orbit-observatory-report/1",
      measurement: record,
      derived: stats(record),
      endpoints: endpoint(record, catalog),
      endpointSource:
        "Reviewed catalog; per-request nonce and download size parameters omitted. Historical mappings may have changed.",
      method:
        "HTTP RTT, not ICMP. Parallel HTTP streams may share TCP/QUIC connections. Incomplete runs are partial measurements.",
    };
  }
  function curl(record, catalog) {
    const url = endpoint(record, catalog)?.ping;
    if (!url) return null;
    // Only a reviewed, bounded RTT probe; never execute anything in the browser.
    const quoted = "'" + url.replaceAll("'", "'\\''") + "'";
    return `# One HTTP RTT probe. Does not reproduce a sustained browser test.\ncurl --fail --silent --show-error --max-time 10 --output /dev/null --write-out 'HTTP %{http_code} | %{time_total}s\\n' -- ${quoted}`;
  }
  function csvCell(value) {
    let text = value === null || value === undefined ? "" : String(value);
    if (typeof value === "string" && /^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  }
  function csv(records) {
    const rows = [
      [
        "date",
        "server",
        "status",
        "download_mbps",
        "upload_mbps",
        "idle_p50_ms",
        "idle_p95_ms",
        "idle_p99_ms",
        "jitter_ms",
        "download_loaded_median_ms",
        "download_delta_ms",
        "upload_loaded_median_ms",
        "upload_delta_ms",
        "download_bytes",
        "upload_bytes",
        "download_duration_ms",
        "upload_duration_ms",
        "http_streams",
        "network_type",
        "network_source",
      ],
    ];
    for (const record of records) {
      const s = stats(record),
        complete = record.status === "complete";
      rows.push([
        record.date,
        record.server,
        record.status,
        complete ? record.downloadMbps : null,
        complete ? record.uploadMbps : null,
        s.idle.p50Ms,
        s.idle.p95Ms,
        s.idle.p99Ms,
        record.jitterMs,
        s.download.medianMs,
        s.download.deltaMs,
        s.upload.medianMs,
        s.upload.deltaMs,
        s.download.bytes,
        s.upload.bytes,
        s.download.durationMs,
        s.upload.durationMs,
        record.streams || 1,
        record.network?.type,
        record.network?.source,
      ]);
    }
    return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
  }
  function report(record) {
    if (!record) return null;
    const escape = (value) => String(value ?? "—").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[character]);
    const value = (measured, unit = "") => `${escape(present(measured) ? number(measured) : "—")}${unit ? `<em>${unit}</em>` : ""}`;
    const derived = stats(record);
    const ratings = SpeedCore.ratings(record);
    const metric = (name, number, unit, detail) => `<section class="metric"><span>${escape(name)}</span><strong>${value(number, unit)}</strong><small>${escape(detail)}</small></section>`;
    const rating = ({ name, grade, evidence, level }) => `<section class="rating ${escape(level)}"><span>${escape(name)}</span><strong>${escape(grade)}</strong><small>${escape(evidence)}</small></section>`;
    const date = new Date(record.finished || record.date);
    const timestamp = Number.isNaN(date.valueOf()) ? record.date : date.toLocaleString();
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Orbit flight report</title><style>
      :root{color-scheme:dark;print-color-adjust:exact;-webkit-print-color-adjust:exact}*{box-sizing:border-box;print-color-adjust:exact;-webkit-print-color-adjust:exact}body{margin:0;background:linear-gradient(135deg,#0b1426,#1c335e 32%,#050810);color:#fff;font:14px/1.5 -apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",sans-serif;font-variant-numeric:tabular-nums}.report{max-width:900px;margin:auto;padding:48px 28px 64px}.masthead,.card{border:1px solid rgba(227,186,140,.25);background:rgba(11,20,38,.75);box-shadow:inset 0 1px rgba(255,255,255,.04),0 20px 48px rgba(0,0,0,.18);border-radius:20px}.masthead{padding:28px;margin-bottom:18px}.mark{color:#e3ba8c;font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase}.masthead h1{margin:6px 0;font-size:30px;letter-spacing:-.04em}.muted{color:#899ebb}.pill{display:inline-block;margin-top:12px;padding:4px 9px;border-radius:99px;border:1px solid rgba(227,186,140,.3);color:#e3ba8c;font-size:11px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:18px 0}.metric,.rating{min-width:0;padding:18px;border:1px solid rgba(227,186,140,.22);border-radius:16px;background:rgba(5,8,16,.38)}.metric span,.rating span{display:block;color:#899ebb;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase}.metric strong,.rating strong{display:block;margin-top:8px;font-size:25px;letter-spacing:-.04em}.metric em{font-size:11px;font-style:normal;color:#e3ba8c;margin-left:4px}.metric small,.rating small{display:block;margin-top:5px;color:#899ebb}.section-title{margin:0 0 12px;font-size:16px}.card{padding:24px;margin-top:18px}.ratings{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.rating strong{font-size:17px}.rating.good strong{color:#e3ba8c}.rating.fair strong{color:#c8d6ee}.rating.poor strong{color:#f0aaa0}.detail{display:grid;grid-template-columns:1fr 1fr;gap:9px;color:#c8d6ee}.detail div{padding:10px 0;border-bottom:1px solid rgba(255,255,255,.08)}.detail b{display:block;color:#899ebb;font-size:10px;letter-spacing:.08em;text-transform:uppercase}@page{margin:12mm}@media print{html,body{background:#0b1426!important}.report{padding:0}.masthead,.card,.metric,.rating{break-inside:avoid}}@media(max-width:620px){.report{padding:20px 14px}.grid{grid-template-columns:repeat(2,1fr)}.ratings{grid-template-columns:1fr}.masthead h1{font-size:26px}}
      </style></head><body><main class="report"><header class="masthead"><div class="mark">Orbit Network Observatory</div><h1>Flight report</h1><div class="muted">${escape(record.server)} · ${escape(timestamp)}</div><span class="pill">${escape(statusLabel(record.status))} · ${escape(record.profile === "sustained" ? "Sustained Flight" : "Quick Probe")}</span></header><div class="grid">${metric("Download",record.downloadMbps,"Mbps","Sustained average")}${metric("Upload",record.uploadMbps,"Mbps","Sustained average")}${metric("Ping",record.pingMs,"ms","Idle HTTP RTT")}${metric("Jitter",record.jitterMs,"ms","Idle variance")}</div><section class="card"><h2 class="section-title">Mission readiness</h2><div class="ratings">${ratings.map(rating).join("")}</div></section><section class="card"><h2 class="section-title">Flight telemetry</h2><div class="detail"><div><b>Idle P50 / P95 / P99</b>${value(derived.idle.p50Ms," ms")} / ${value(derived.idle.p95Ms," ms")} / ${value(derived.idle.p99Ms," ms")}</div><div><b>HTTP streams</b>${escape(record.streams || 1)}</div><div><b>Download loaded RTT</b>${value(derived.download.medianMs," ms")} · Δ ${value(derived.download.deltaMs," ms")}</div><div><b>Upload loaded RTT</b>${value(derived.upload.medianMs," ms")} · Δ ${value(derived.upload.deltaMs," ms")}</div><div><b>Payload transferred</b>${value(((derived.download.bytes || 0) + (derived.upload.bytes || 0)) / 1e6," MB")}</div><div><b>Access type</b>${escape(SpeedCore.networkLabel(record.network))}</div></div></section><p class="muted" style="margin:18px 4px 0;font-size:12px">Browser-based HTTP measurement. Public IP, ISP, ASN, and location are excluded from this report.</p></main></body></html>`;
  }
  function pdf(record) {
    if (!record) return null;
    const clean = (value) => String(value ?? "—").normalize("NFKD").replace(/[^\x20-\x7e]/g, " ").replace(/[\\()]/g, "\\$&");
    const rgb = (hex, stroke = false) => `${[1, 3, 5].map((offset) => (parseInt(hex.slice(offset, offset + 2), 16) / 255).toFixed(3)).join(" ")} ${stroke ? "RG" : "rg"}`;
    const commands = ["q", rgb("#0b1426"), "0 0 612 792 re f"];
    const rectangle = (x, y, width, height, fill = "#0b1426") => commands.push(rgb(fill), `${x} ${y} ${width} ${height} re f`, rgb("#e3ba8c", true), "0.55 w", `${x} ${y} ${width} ${height} re S`);
    const text = (x, y, size, value, color = "#ffffff", bold = false) => commands.push("BT", `/${bold ? "F2" : "F1"} ${size} Tf`, rgb(color), `1 0 0 1 ${x} ${y} Tm`, `(${clean(value)}) Tj`, "ET");
    const derived = stats(record), ratings = SpeedCore.ratings(record);
    rectangle(34, 642, 544, 114, "#0d1930");
    text(56, 724, 10, "ORBIT NETWORK OBSERVATORY", "#e3ba8c", true);
    text(56, 688, 27, "Flight report", "#ffffff", true);
    const date = new Date(record.finished || record.date);
    text(56, 668, 11, `${record.server}  |  ${Number.isNaN(date.valueOf()) ? record.date : date.toLocaleString()}`, "#9aacc8");
    text(56, 650, 10, `${statusLabel(record.status)}  |  ${record.profile === "sustained" ? "Sustained Flight" : "Quick Probe"}`, "#e3ba8c");
    const metrics = [["DOWNLOAD", record.downloadMbps, "Mbps", "Sustained average"], ["UPLOAD", record.uploadMbps, "Mbps", "Sustained average"], ["PING", record.pingMs, "ms", "Idle HTTP RTT"], ["JITTER", record.jitterMs, "ms", "Idle variance"]];
    metrics.forEach(([label, measured, unit, detail], index) => {
      const x = 34 + index * 138;
      rectangle(x, 552, 130, 72, "#090f1e");
      text(x + 12, 604, 8, label, "#9aacc8", true);
      text(x + 12, 578, 20, `${number(measured)} ${unit}`, "#ffffff", true);
      text(x + 12, 562, 8, detail, "#9aacc8");
    });
    rectangle(34, 318, 544, 214, "#0d1930");
    text(56, 505, 16, "Mission readiness", "#ffffff", true);
    ratings.forEach((rating, index) => {
      const x = 56 + (index % 2) * 260, y = 390 - Math.floor(index / 2) * 76;
      rectangle(x, y, 240, 62, "#090f1e");
      text(x + 12, y + 45, 8, rating.name.toUpperCase(), "#9aacc8", true);
      text(x + 12, y + 27, 13, rating.grade, rating.level === "poor" ? "#f0aaa0" : "#e3ba8c", true);
      text(x + 12, y + 12, 8, rating.evidence, "#9aacc8");
    });
    rectangle(34, 104, 544, 190, "#0d1930");
    text(56, 267, 16, "Flight telemetry", "#ffffff", true);
    const rows = [["IDLE P50 / P95 / P99", `${number(derived.idle.p50Ms)} / ${number(derived.idle.p95Ms)} / ${number(derived.idle.p99Ms)} ms`], ["HTTP STREAMS", record.streams || 1], ["DOWNLOAD LOADED RTT", `${number(derived.download.medianMs)} ms  |  Delta ${number(derived.download.deltaMs)} ms`], ["UPLOAD LOADED RTT", `${number(derived.upload.medianMs)} ms  |  Delta ${number(derived.upload.deltaMs)} ms`], ["PAYLOAD TRANSFERRED", `${number(((derived.download.bytes || 0) + (derived.upload.bytes || 0)) / 1e6)} MB`], ["ACCESS TYPE", SpeedCore.networkLabel(record.network)]];
    rows.forEach(([label, value], index) => {
      const column = index % 2, row = Math.floor(index / 2), x = 56 + column * 260, y = 226 - row * 45;
      text(x, y, 8, label, "#9aacc8", true);
      text(x, y - 16, 10, value, "#d4e0f5");
    });
    text(38, 72, 8, "Browser-based HTTP measurement. Public IP, ISP, ASN, and location are excluded from this report.", "#9aacc8");
    commands.push("Q");
    const stream = commands.join("\n");
    const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>", `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"];
    let output = "%PDF-1.4\n", offsets = [0];
    objects.forEach((object, index) => { offsets.push(output.length); output += `${index + 1} 0 obj\n${object}\nendobj\n`; });
    const xref = output.length;
    output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return output;
  }
  function sampleAt(points, seconds) {
    if (
      !points?.length ||
      seconds < points[0].seconds ||
      seconds > points.at(-1).seconds
    )
      return null;
    return points.reduce((nearest, point) =>
      Math.abs(point.seconds - seconds) < Math.abs(nearest.seconds - seconds)
        ? point
        : nearest,
    );
  }
  return {
    number,
    present,
    statusLabel,
    stats,
    endpoint,
    raw,
    curl,
    csvCell,
    csv,
    report,
    pdf,
    sampleAt,
  };
})();
if (typeof module !== "undefined") module.exports = OrbitTelemetry;
