/* View state, accessible controls and measured-data rendering. The engine lives in app.js. */
const OrbitUI = (() => {
  const $ = (id) => document.getElementById(id);
  const T = OrbitTelemetry;
  let api,
    catalog,
    displayed,
    completeRecord,
    graphRecord,
    infoTrigger,
    view = "overview";
  let activeScrub = null;
  const infos = {
    measurement: [
      "Sustained, not a burst",
      "Each transfer direction runs for at least 22 seconds. The result divides completed payload by total elapsed phase time, including stalls and retries. A full flight takes roughly a minute.",
      "Tests can consume substantial data. The shared safety budget is up to 8 GB of planned payload; metadata and protocol overhead are additional. Use one stream for lower concurrency.",
    ],
    latency: [
      "HTTP round-trip time",
      "Ping measures a complete HTTP request and response to the test endpoint. It includes browser, transport and server scheduling. It is not ICMP ping or latency to every internet service.",
    ],
    jitter: [
      "How steady is the response?",
      "Jitter is the mean absolute difference between consecutive idle HTTP RTT samples. Lower variation is generally better for interactive applications. UDP jitter and packet loss are not measured.",
    ],
    bufferbloat: [
      "Latency under load",
      "The delta compares median HTTP RTT during each transfer with the idle median. A large increase suggests queueing on this route, but browser scheduling and the endpoint also contribute. Negative deltas are retained rather than clamped.",
      "This is a browser-based queueing indicator, not an isolated router bufferbloat diagnosis.",
    ],
    percentiles: [
      "The shape of your latency",
      "P50 is the median. P95 and P99 are interpolated percentiles of the idle sample set. A standard flight records 10 idle samples, so tail estimates are coarse; they do not establish long-term reliability.",
    ],
    streams: [
      "HTTP concurrency ≠ TCP connections",
      "Orbit runs 1 or 4 concurrent HTTP transfer workers. The browser manages TCP/QUIC connections and may multiplex multiple requests over one connection. Connection counts, congestion control and transport protocol are not reliably exposed.",
      "Clouvider uploads are capped at 1 MB per request. Small requests on a long route may limit single-stream results.",
    ],
    endpoints: [
      "Reviewed endpoint paths",
      "These URLs resolve the flight’s server ID against the reviewed catalog. Nonce and variable payload-size parameters are omitted. Older flights may map to a newer catalog entry.",
      "Copy cURL prepares one small HTTP probe. It does not run a command or reproduce the browser’s sustained measurement.",
    ],
    network: [
      "What the browser can identify",
      "An exposed interface type can identify Wi-Fi, Ethernet or cellular. Cellular generations are manual labels because browsers do not reliably expose 3G, 4G or 5G.",
      "“4G-like” is a browser estimate of recent performance and can appear on Wi-Fi or Ethernet. It never determines your access type.",
    ],
    privacy: [
      "Connection metadata & privacy",
      "Cloudflare and RIPEstat identify the public IP and registered network holder on load. RIPEstat receives your public IP. A VPN or upstream operator may appear instead of your retail ISP.",
      "IP, ISP, ASN and precise location are excluded from saved flights and exports. Location stays in this tab and only guides the server shortlist.",
    ],
    history: [
      "Your local flight recorder",
      "Flights are stored in IndexedDB in this browser, including interrupted and cancelled attempts. Private browsing, clearing site data, uninstalling a browser or storage limits can remove them. Export a copy to retain your records.",
      "Unfinished means the flight was interrupted or is running in another tab. Older unsaved tests cannot be recovered.",
    ],
    readiness: [
      "Route-specific estimates",
      "These badges use measured bandwidth, idle RTT and jitter to estimate suitability. They do not test actual game, video-call or streaming service routes, UDP packet loss, or a sustained application session.",
      "4K guidance uses 15 Mbps per Netflix stream. There is no universal 8K bitrate; compare your service’s codec and bitrate requirements with the measured throughput.",
    ],
    providers: [
      "Different servers, different paths",
      "Orbit uses reviewed public LibreSpeed endpoints from Clouvider, Sharktech and community/research hosts, plus Cloudflare’s routed edge. Reachability and public capacity vary.",
      "Speedtest uses Ookla’s host network. Fast.com tests against Netflix servers. Those independent services are useful comparisons; their servers and private APIs are not Orbit endpoints.",
    ],
  };
  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const svgEl = (tag, attrs, text) => {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
    if (text !== undefined) node.textContent = text;
    return node;
  };
  function selectView(next, focus = false, updateHash = true) {
    if (!["overview", "telemetry", "history"].includes(next)) next = "overview";
    view = next;
    for (const tab of document.querySelectorAll("[data-view]")) {
      const selected = tab.dataset.view === next;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      $("view-" + tab.dataset.view).hidden = !selected;
      if (selected && focus) tab.focus();
    }
    if (updateHash)
      history.replaceState(
        null,
        "",
        next === "history" ? "#history-section" : "#" + next,
      );
    if (next === "telemetry") drawThroughput(graphRecord);
    closeInfo(false);
  }
  function closeInfo(restore = true) {
    if (!infoTrigger) return;
    const trigger = infoTrigger;
    infoTrigger = null;
    $("info-popover").hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    if (restore && trigger.isConnected) trigger.focus();
  }
  function openInfo(trigger, lines) {
    if (infoTrigger === trigger) {
      closeInfo();
      return;
    }
    closeInfo(false);
    infoTrigger = trigger;
    const pop = $("info-popover");
    // Put the popover inside an open dialog so it remains in that dialog's top layer.
    (trigger.closest("dialog") || document.body).append(pop);
    trigger.setAttribute("aria-expanded", "true");
    trigger.setAttribute("aria-controls", "info-popover");
    $("info-title").textContent = lines[0];
    $("info-content").replaceChildren(
      ...lines.slice(1).map((text) => el("p", text)),
    );
    if (trigger.dataset.info === "providers") {
      for (const [name, url] of [
        ["LibreSpeed", "https://librespeed.org/"],
        ["Clouvider", "https://as62240.net/speedtest"],
        ["Speedtest", "https://www.speedtest.net/"],
        ["Fast.com", "https://fast.com/"],
      ]) {
        const link = el("a", name + " ↗");
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        $("info-content").append(link);
      }
    }
    pop.hidden = false;
    const rect = trigger.getBoundingClientRect(),
      bounds = pop.getBoundingClientRect();
    pop.style.left =
      Math.max(
        14,
        Math.min(innerWidth - bounds.width - 14, rect.right - bounds.width),
      ) + "px";
    pop.style.top =
      Math.max(
        14,
        Math.min(innerHeight - bounds.height - 14, rect.bottom + 10),
      ) + "px";
    $("close-info").focus();
  }
  function summary(record) {
    if (record?.status === "complete") completeRecord = record;
    if (!completeRecord) return;
    $("summary-state").textContent = "Complete";
    $("summary-state").className = "status-pill complete";
    $("summary-title").textContent =
      `${T.number(completeRecord.downloadMbps)} down. ${T.number(completeRecord.uploadMbps)} up.`;
    $("summary-detail").textContent =
      `Mbps sustained · ${completeRecord.server}`;
    $("summary-time").textContent = new Date(
      completeRecord.date,
    ).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  function renderRatings(record) {
    const ready = record?.status === "complete";
    const ratings = ready
      ? SpeedCore.ratings(record)
      : ["Online gaming", "Video streaming", "Cloud gaming", "Video calls"].map(
          (name) => ({
            name,
            grade: "Awaiting test",
            detail: "Complete a flight to estimate suitability on this route.",
          }),
        );
    const icons = ["⌘", "▷", "☁", "◉"];
    $("ratings").replaceChildren();
    ratings.forEach((rating, index) => {
      const chip = el(
        "button",
        undefined,
        "readiness-chip" + (rating.grade === "Limited" ? " limited" : ""),
      );
      chip.type = "button";
      chip.setAttribute("aria-expanded", "false");
      const label = el("span");
      label.append(el("strong", rating.name), el("small", rating.grade));
      const icon = el("span", icons[index], "readiness-icon");
      icon.setAttribute("aria-hidden", "true");
      chip.append(icon, label);
      chip.addEventListener("click", () =>
        openInfo(chip, [
          rating.name,
          rating.detail,
          "Estimate for this endpoint. Actual service latency and UDP packet loss are not measured.",
        ]),
      );
      $("ratings").append(chip);
    });
    $("overall").textContent = ready
      ? `${T.number(record.pingMs)} ms idle · ${T.number(record.jitterMs)} ms jitter · route-specific estimates`
      : "Complete a flight to unlock readiness estimates.";
    summary(record);
  }
  function plot(svg, record, height) {
    svg.replaceChildren();
    const width = Math.max(
      280,
      Math.min(
        900,
        svg.getBoundingClientRect().width ||
          $("test-deck").getBoundingClientRect().width - 50,
      ),
    );
    if (width < 600) height = svg.id === "telemetry-chart" ? 230 : 190;
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    const series = [
      record?.download?.points || [],
      record?.upload?.points || [],
    ];
    const maxX = Math.max(22, ...series.flat().map((p) => p.seconds)),
      maxY = Math.max(10, ...series.flat().map((p) => p.mbps)) * 1.12;
    const left = 38,
      right = width - 14,
      top = 16,
      bottom = height - 28;
    const x = (value) => left + (value / maxX) * (right - left),
      y = (value) => bottom - (value / maxY) * (bottom - top);
    const desc = svgEl(
      "desc",
      {},
      record
        ? `${T.statusLabel(record.status)} flight. Download ${T.number(record.downloadMbps)} and upload ${T.number(record.uploadMbps)} Mbps. ${series[0].length} download samples, ${series[1].length} upload samples.`
        : "No measurement samples yet.",
    );
    svg.append(desc);
    for (let i = 0; i <= 4; i++) {
      const gy = top + ((bottom - top) * i) / 4;
      svg.append(
        svgEl("line", {
          x1: left,
          y1: gy,
          x2: right,
          y2: gy,
          class: "plot-grid",
        }),
      );
      svg.append(
        svgEl(
          "text",
          { x: left - 10, y: gy + 3, "text-anchor": "end" },
          Math.round(maxY * (1 - i / 4)),
        ),
      );
      svg.append(
        svgEl(
          "text",
          {
            x: x((maxX * i) / 4),
            y: height - 6,
            "text-anchor": i === 4 ? "end" : "middle",
          },
          `${T.number((maxX * i) / 4, 0)}s`,
        ),
      );
    }
    series.forEach((points, index) => {
      if (!points.length) return;
      const color = index ? "#b5a6ff" : "#79efd5";
      const coords = points
        .map((p) => `${x(p.seconds)},${y(p.mbps)}`)
        .join(" ");
      svg.append(
        svgEl("polygon", {
          points: `${x(points[0].seconds)},${bottom} ${coords} ${x(points.at(-1).seconds)},${bottom}`,
          fill: color,
          "fill-opacity": 0.035,
        }),
      );
      svg.append(
        svgEl("polyline", {
          points: coords,
          stroke: color,
          class: "plot-line",
        }),
      );
      if (points.length === 1)
        svg.append(
          svgEl("circle", {
            cx: x(points[0].seconds),
            cy: y(points[0].mbps),
            r: 3,
            fill: color,
          }),
        );
    });
    if (!series.flat().length)
      svg.append(
        svgEl(
          "text",
          { x: (left + right) / 2, y: height / 2, "text-anchor": "middle" },
          width < 500
            ? "Awaiting your first flight"
            : "No samples yet · launch your first flight",
        ),
      );
    return { maxX, x, y, bottom, top };
  }
  function drawThroughput(record) {
    if (graphRecord?.id !== record?.id) {
      activeScrub = null;
      $("chart-tooltip").hidden = true;
      $("scrubber-value").textContent = "Choose a time";
    }
    graphRecord = record;
    plot($("speed-chart"), record, 220);
    plot($("telemetry-chart"), record, 270);
    const all = [
      ...(record?.download?.points || []),
      ...(record?.upload?.points || []),
    ];
    $("chart-scrubber").disabled = !all.length;
    $("chart-scrubber").max = String(
      Math.max(22, ...all.map((p) => p.seconds)),
    );
    $("trace-status").textContent = record
      ? `${all.length} interval samples · ${record.status === "complete" ? "complete flight" : "live / partial flight"} · Mbps`
      : "No measured samples yet";
    $("overview-trace-label").textContent = record
      ? `${record.server} · ${record.status === "complete" ? "completed flight" : "live / partial trace"}`
      : "Your next flight, plotted in real time.";
    if (activeScrub !== null && all.length) scrub(activeScrub);
  }
  function scrub(seconds) {
    activeScrub = seconds;
    const svg = $("telemetry-chart"),
      maxX = Number($("chart-scrubber").max),
      box = svg.viewBox.baseVal,
      x = 38 + (seconds / maxX) * (box.width - 52);
    svg.querySelector(".scrubber-line")?.remove();
    svg.append(
      svgEl("line", {
        x1: x,
        x2: x,
        y1: 16,
        y2: box.height - 28,
        class: "scrubber-line",
      }),
    );
    const describe = (direction) => {
      const p = T.sampleAt(graphRecord?.[direction]?.points, seconds);
      return p ? `${T.number(p.mbps)} Mbps @ ${T.number(p.seconds)}s` : "—";
    };
    const label = `${T.number(seconds)}s · ↓ ${describe("download")} · ↑ ${describe("upload")}`;
    $("chart-scrubber").value = String(seconds);
    $("scrubber-value").textContent = label;
    $("chart-scrubber").setAttribute("aria-valuetext", label);
    $("chart-tooltip").textContent =
      `${T.number(seconds)}s · nearest recorded sample\n↓ ${describe("download")}\n↑ ${describe("upload")}`;
  }
  function renderTelemetry(record) {
    displayed = record;
    const s = T.stats(record);
    for (const [id, key] of [
      ["diag-p50", "p50Ms"],
      ["diag-p95", "p95Ms"],
      ["diag-p99", "p99Ms"],
    ])
      $(id).textContent =
        s.idle[key] === null ? "—" : `${T.number(s.idle[key])} ms`;
    $("percentile-count").textContent = s.idle.samples
      ? `${s.idle.samples} idle samples · interpolated percentiles`
      : "No samples recorded";
    const deltas = [s.download.deltaMs, s.upload.deltaMs].filter(T.present);
    $("bufferbloat-summary").textContent = deltas.length
      ? `Largest median increase: ${Math.max(...deltas) >= 0 ? "+" : ""}${T.number(Math.max(...deltas))} ms${record.status === "complete" ? "" : " · partial measurement"}`
      : "Median loaded RTT compared with idle.";
    for (const direction of ["download", "upload"]) {
      const phase = s[direction];
      $(
        "diag-" + (direction === "download" ? "down" : "up") + "-size",
      ).textContent =
        phase.bytes === null
          ? "—"
          : `${T.number(phase.bytes / 1e6)} MB · ${T.number(phase.durationMs / 1000)} s`;
    }
    const paths = T.endpoint(record, catalog);
    $("diag-endpoint").textContent = paths
      ? `RTT  ${paths.ping}\n↓    ${paths.download}\n↑    ${paths.upload}`
      : record
        ? "Endpoint not available in the reviewed catalog"
        : "Available after a flight starts";
    $("diag-state").textContent = record
      ? record.status === "running"
        ? "Live / partial"
        : T.statusLabel(record.status)
      : "Waiting for samples";
    $("diag-state").className = "status-pill " + (record?.status || "");
    for (const id of ["copy-stats", "export-json", "export-csv"])
      $(id).disabled = !record;
    $("copy-curl").disabled = !paths;
    $("view-context").textContent = record
      ? record.status === "running"
        ? "FLIGHT IN PROGRESS"
        : "RECORDED FLIGHT"
      : "LIVE OBSERVATORY";
    summary(record);
  }
  function setCatalog(value) {
    catalog = value;
    if (displayed) renderTelemetry(displayed);
  }
  function updateRoute(servers, selectedId) {
    const server =
      servers.find((s) => s.id === selectedId) ||
      servers.find((s) => s.available);
    const short = server?.name
      .split(",")[0]
      .replace(" · automatic edge", " edge");
    $("route-badge").textContent = server
      ? `${selectedId === "auto" ? "Auto · " : ""}${short}`
      : navigator.onLine === false
        ? "Auto · offline"
        : "Auto · choose route";
    $("open-routes").title = server
      ? `${server.name} · ${T.number(server.latency, 0)} ms`
      : "Choose a test route";
  }
  function sparkline(record) {
    const svg = svgEl("svg", {
      viewBox: "0 0 80 28",
      class: "sparkline",
      role: "img",
      "aria-label": `${record.download?.points?.length || 0} download and ${record.upload?.points?.length || 0} upload samples`,
    });
    const series = [record.download?.points || [], record.upload?.points || []];
    const maxX = Math.max(22, ...series.flat().map((p) => p.seconds)),
      maxY = Math.max(1, ...series.flat().map((p) => p.mbps));
    series.forEach((points, index) => {
      if (points.length)
        svg.append(
          svgEl("polyline", {
            points: points
              .map(
                (p) =>
                  `${1 + (p.seconds / maxX) * 78},${26 - (p.mbps / maxY) * 24}`,
              )
              .join(" "),
            fill: "none",
            stroke: index ? "#b5a6ff" : "#79efd5",
            "stroke-width": 1.3,
          }),
        );
    });
    return svg;
  }
  function renderHistory(records) {
    const query = ($("history-search").value || "").trim().toLowerCase();
    const sorted = [...records].sort((a, b) => b.date.localeCompare(a.date));
    const latest = sorted.find((r) => r.status === "complete");
    if (!completeRecord && latest) summary(latest);
    const rows = sorted.filter((r) =>
      `${r.server} ${r.status} ${T.statusLabel(r.status)} ${new Date(r.date).toLocaleString()}`
        .toLowerCase()
        .includes(query),
    );
    $("history").replaceChildren();
    $("history-count").textContent = String(records.length);
    $("export").disabled = !records.length;
    $("history-empty").hidden = rows.length > 0;
    $("history-empty").querySelector("h3").textContent = records.length
      ? "No matching flights."
      : "Your flight recorder is ready.";
    $("history-empty").querySelector("p").textContent = records.length
      ? "Try another server name, date or status."
      : "Completed, interrupted and cancelled tests appear here.";
    // Render in pages to avoid blocking the UI on a large local archive.
    const page = rows.slice(0, Number($("history").dataset.limit || 50));
    for (const record of page) {
      const tr = el("tr"),
        date = new Date(record.date),
        complete = record.status === "complete";
      const when = el(
        "td",
        date.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
      );
      when.append(
        el(
          "small",
          date.toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
          }),
        ),
      );
      tr.append(when);
      const server = el("td", record.server, "route-cell");
      server.title = record.server;
      server.append(
        el(
          "small",
          record.network
            ? SpeedCore.networkLabel(record.network)
            : "Access type not recorded",
        ),
      );
      tr.append(server);
      for (const [value, color] of [
        [record.downloadMbps, "cyan"],
        [record.uploadMbps, "violet"],
      ])
        tr.append(el("td", complete ? T.number(value) : "—", color));
      tr.append(
        el(
          "td",
          complete
            ? `${T.number(record.pingMs)} / ${T.number(record.jitterMs)} ms`
            : "—",
        ),
      );
      const trace = el("td");
      trace.append(sparkline(record));
      tr.append(trace);
      const status = el("td");
      status.append(
        el(
          "span",
          T.statusLabel(record.status),
          "status-pill " + record.status,
        ),
      );
      tr.append(status);
      const cell = el("td"),
        button = el("button", "↗", "history-view");
      button.type = "button";
      button.setAttribute(
        "aria-label",
        `Inspect ${record.server}, ${date.toLocaleString()}`,
      );
      button.addEventListener("click", () => {
        if (api.selectRecord(record) !== false) {
          selectView("telemetry");
          $("tab-telemetry").focus();
          $("view-telemetry").scrollIntoView({
            behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
              ? "instant"
              : "smooth",
          });
        }
      });
      cell.append(button);
      tr.append(cell);
      $("history").append(tr);
    }
    if (rows.length > page.length) {
      const tr = el("tr"),
        td = el("td"),
        more = el(
          "button",
          `Show more (${rows.length - page.length} remaining)`,
          "secondary",
        );
      td.colSpan = 8;
      more.addEventListener("click", () => {
        $("history").dataset.limit = String(page.length + 50);
        renderHistory(records);
      });
      td.append(more);
      tr.append(td);
      $("history").append(tr);
    }
  }
  function download(text, type, name) {
    const url = URL.createObjectURL(new Blob([text], { type })),
      link = el("a");
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function copy(text, label) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      $("export-status").textContent = label + " copied.";
    } catch {
      $("copy-output").value = text;
      $("copy-dialog").showModal();
      $("copy-output").focus();
      $("copy-output").select();
      $("export-status").textContent = "Select and copy the prepared text.";
    }
  }
  function init(callbacks) {
    api = callbacks;
    document.querySelectorAll("[data-view]").forEach((tab) => {
      tab.addEventListener("click", () => selectView(tab.dataset.view));
      tab.addEventListener("keydown", (event) => {
        const tabs = [...document.querySelectorAll("[data-view]")],
          index = tabs.indexOf(tab);
        const target =
          event.key === "ArrowRight"
            ? (index + 1) % 3
            : event.key === "ArrowLeft"
              ? (index + 2) % 3
              : event.key === "Home"
                ? 0
                : event.key === "End"
                  ? 2
                  : null;
        if (target !== null) {
          event.preventDefault();
          selectView(tabs[target].dataset.view, true);
        }
      });
    });
    const fromHash = () =>
      selectView(
        location.hash === "#history-section"
          ? "history"
          : location.hash.slice(1),
        false,
        false,
      );
    window.addEventListener("hashchange", fromHash);
    fromHash();
    updateRoute([], "auto");
    $("open-routes").addEventListener("click", () =>
      $("route-dialog").showModal(),
    );
    for (const button of document.querySelectorAll("[data-close-dialog]"))
      button.addEventListener("click", () =>
        $(button.dataset.closeDialog).close(),
      );
    document
      .querySelectorAll("dialog")
      .forEach((dialog) =>
        dialog.addEventListener("close", () => closeInfo(false)),
      );
    document.addEventListener("click", (event) => {
      const trigger = event.target.closest("[data-info]");
      if (trigger) {
        openInfo(trigger, infos[trigger.dataset.info]);
        return;
      }
      if (
        infoTrigger &&
        !$("info-popover").contains(event.target) &&
        !infoTrigger.contains(event.target)
      )
        closeInfo(false);
    });
    $("close-info").addEventListener("click", () => closeInfo());
    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape" && infoTrigger) {
          event.preventDefault();
          event.stopPropagation();
          closeInfo();
        }
      },
      true,
    );
    window.addEventListener("resize", () => {
      closeInfo(false);
      drawThroughput(graphRecord);
    });
    document.addEventListener("scroll", () => closeInfo(false), true);
    $("open-telemetry").addEventListener("click", () =>
      selectView("telemetry", true),
    );
    $("inspect-flight").addEventListener("click", () => {
      if (completeRecord && api.selectRecord(completeRecord) === false) return;
      selectView("telemetry", true);
    });
    $("inspect-connection").addEventListener("click", () => {
      selectView("telemetry", true);
      $("connection-inspector").scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
    });
    const chart = $("telemetry-chart");
    chart.addEventListener("pointermove", (event) => {
      if ($("chart-scrubber").disabled) return;
      const rect = chart.getBoundingClientRect();
      scrub(
        Math.max(
          0,
          Math.min(
            1,
            (((event.clientX - rect.left) / rect.width) *
              chart.viewBox.baseVal.width -
              38) /
              (chart.viewBox.baseVal.width - 52),
          ),
        ) * Number($("chart-scrubber").max),
      );
      $("chart-tooltip").hidden = false;
    });
    chart.addEventListener("pointerleave", () => {
      $("chart-tooltip").hidden = true;
    });
    $("chart-scrubber").addEventListener("input", (event) =>
      scrub(Number(event.target.value)),
    );
    $("history-search").addEventListener("input", () => {
      $("history").dataset.limit = "50";
      renderHistory(api.getHistory());
    });
    $("export").addEventListener("click", () =>
      download(
        JSON.stringify(api.getHistory(), null, 2),
        "application/json",
        `orbit-history-${new Date().toISOString().slice(0, 10)}.json`,
      ),
    );
    $("copy-curl").addEventListener("click", () =>
      copy(T.curl(displayed, catalog), "Diagnostic cURL"),
    );
    $("copy-stats").addEventListener("click", () =>
      copy(JSON.stringify(T.raw(displayed, catalog), null, 2), "Raw stats"),
    );
    $("export-json").addEventListener("click", () => {
      if (displayed)
        download(
          JSON.stringify(T.raw(displayed, catalog), null, 2),
          "application/json",
          "orbit-flight.json",
        );
    });
    $("export-csv").addEventListener("click", () => {
      if (displayed)
        download(
          T.csv([displayed]),
          "text/csv;charset=utf-8",
          "orbit-flight.csv",
        );
    });
    api
      .getCatalog()
      .then(setCatalog)
      .catch(() => {});
  }
  return {
    init,
    selectView,
    renderHistory,
    renderRatings,
    renderTelemetry,
    drawThroughput,
    setCatalog,
    updateRoute,
  };
})();
