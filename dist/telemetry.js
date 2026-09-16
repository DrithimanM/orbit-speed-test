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
    sampleAt,
  };
})();
if (typeof module !== "undefined") module.exports = OrbitTelemetry;
