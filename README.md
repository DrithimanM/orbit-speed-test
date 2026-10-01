# Orbit Network Observatory

A dependency-free network dashboard with an Apple-inspired dark interface, a circular flight gauge, sustained measurements, route discovery, and local test history. Built with semantic HTML, CSS and vanilla JavaScript. Developed by HigherIyer.

## Architecture

[Architecture diagram and source map](docs/architecture.md) · [SVG](docs/orbit-architecture.svg) · [PNG](docs/orbit-architecture.png) · [Editable Mermaid](docs/orbit-architecture.mmd)

## Run

From this folder:

```bash
npm start
```

Open **http://localhost:8000**. Stop the server with **Ctrl+C**. Node.js 22+ and a modern browser are all you need. There are no runtime packages to install and no build step. Browser verification uses pinned development-only dependencies; see the release checks below. The local server includes security headers and serves only public assets.

## Install as an app

Open [the live HTTPS site](https://drithimanm.github.io/orbit-speed-test/) in a regular Chrome or Edge window and choose **Install app** in Orbit’s header. If your browser does not expose the direct prompt, Orbit shows instructions. In Chrome, use **⋮ → Cast, save, and share → Install page as app**; in Edge, use its address-bar install icon or **Apps → Install this site as an app**. The installed Orbit appears in your system launcher and opens in its own window. Embedded browsers may not support installation. Installation always requires your browser’s confirmation.

On Android, use Chrome’s **Add to home screen → Install**. On iPhone/iPad, use Safari’s **Share → Add to Home Screen** (enable **Open as Web App** if offered). On macOS Sonoma 14+, Safari offers **File → Add to Dock**. Browser/version support varies.

After one successful online load, the app shell is saved for offline use. Reopen Orbit offline to review graphs and export saved history. Fresh measurements, ISP information and server discovery require internet. The service worker never intercepts or caches external requests or uploads; full speed tests always require Launch Test.

History remains local to the browser’s storage context and origin. Chrome/Edge installations using the same profile normally share the site’s history. Safari web apps and other browser profiles can use separate storage: export important history before switching. Clearing site data can remove both history and the offline shell. Installing the GitHub site is convenient for daily use; a localhost installation still needs the local server online for initial setup and updates.

Installed windows retain an **App info** button in the header. Open it to check offline readiness, get installation help, or choose **Check for updates**. Manual update checks wait until tests/server searches finish and require connectivity. Failed offline setup and update downloads show a retry message.

Updates download in the background and wait while any Orbit tab or app window is open. After finishing a test, close all Orbit windows and reopen to activate the update. Orbit never forces a reload during a test.

## Linux launcher icons

The site supplies PNG app icons, a 48 px PNG favicon fallback, a 180 px Apple touch icon and icons for the Flight history shortcut. If a Flatpak browser installs Orbit but the desktop icon is missing, inspect the exported `.desktop` file: its `Icon=` path must resolve on the host. A sandbox-only path can be wrong even when the browser downloaded the correct icons. Correct the launcher to reference the matching exported host icon; preserve its app ID and launch arguments. Desktop entries use double quotes for quoted `Exec` arguments. Validate the repaired entry with `desktop-file-validate`. A website manifest cannot fix a path exported incorrectly by a browser package.

## Use

1. On load, Orbit looks up the network holder and probes a small reviewed server shortlist in parallel. It never requests device location. No full speed test starts automatically.
2. Open the **Auto / route pill** to inspect edge RTT, filter operators, rescan, or choose a reachable endpoint. Three HTTP streams are the default; use the adjacent pill to switch to one.
3. Select **Quick Probe** (5 seconds per direction) or **Sustained Flight** (15 seconds per direction), then choose **Launch Test**. The visible data-use notice links to the shared 8 GB safety budget explanation. Cancel at any time.
4. **Overview** shows the most recently inspected completed flight, readiness estimates, and the current/selected throughput trace. An interrupted flight keeps its partial trace and never receives a quality rating.
5. **Telemetry & Nerd Stats** shows loaded RTT deltas, P50/P95/P99 idle latency, payload sizes, request/retry counters, access-type source, and reviewed endpoint paths. Hover the graph or use its keyboard/touch time slider to inspect actual samples. Lines connect measured intervals; they do not interpolate missing measurements.
6. Use **Copy cURL** for one bounded HTTP RTT probe, **Copy Raw Stats**, or **Export JSON / CSV** for the inspected flight. cURL is copied, never executed. A selectable text dialog is available when clipboard access fails. Exports exclude public IP/ISP/ASN/location.
7. **Flight History** has status badges, miniature traces, search and JSON archive export. The table initially renders 50 rows; **Show more** exposes the rest without limiting stored history. The app shortcut opens this view directly, including offline.

Click the ISP near the page title to inspect current IP/ASN and set a manual Wi-Fi, Ethernet, cellular, 3G, 4G/LTE or 5G label. Current connection metadata is explicitly separate from historical flights. Info buttons explain browser limits, privacy, data use and heuristic ratings without crowding the dashboard.

The segmented control supports Left/Right, Home and End keys. Dialogs and info popovers support Escape and return focus. Charts include text descriptions and an accessible time slider. The layout adapts to phones, tablets and desktop screens, respects reduced motion, and includes safe-area padding for installed iOS web apps.

## Measurements and server discovery

- The app measures ten complete bounded HTTP GET ping samples after a GET warm-up, retaining every observed tail sample. Optional Resource Timing first-byte latency is shown only when the selected endpoint exposes detailed timing; it is not a pure wire or ICMP measurement. Ping is the median, and jitter is the mean absolute difference between consecutive samples. It is not ICMP ping.
- Download and upload schedule transfers for **5 seconds** each in Quick Probe or **15 seconds** each in Sustained Flight. In-flight work can extend a phase; a shared deadline bounds the drain to a nominal 20 additional seconds, subject to browser scheduling. Final Mbps = successfully completed payload bits / full elapsed phase time / 1,000,000. Time spent waiting or retrying remains in the denominator. Results are sustained averages, not peaks. Three streams share a phase clock; their rates are never added independently.
- The trace updates from completed transfer data approximately every 100 ms. Browser scheduling, server load, transport overhead, Wi-Fi, VPNs and distance affect it; it is not a packet-level link-rate capture.
- An independent HTTP request samples latency with a 200 ms pause between probes **during** each transfer phase. Median loaded RTT, its difference from idle median, idle P50/P95/P99, jitter, sample counts, retry counts and transferred payload are shown. These are end-to-end browser HTTP measurements including server scheduling. Missed probes are reported as missed HTTP probes, never as UDP packet loss. Actual game-server RTT and UDP packet loss are not measured.
- Three concurrent HTTP transfers may multiplex over one HTTP/2 or HTTP/3 connection. They do not guarantee three distinct TCP connections or saturation of every connection. Compare modes on the same endpoint for useful results.
- Data use can reach several GB. Each Launch Test invocation has a shared **8 GB planned-payload safety budget**, including transfer retries and recovery attempts. Startup discovery, metadata, headers and other transport overhead are outside that counter; it is not a billing guarantee. Cloudflare downloads are capped at **8,000,000 bytes per request**, below a reproduced 16 MB rejection. Other reviewed download endpoints retain a 16 MB request cap (LibreSpeed rounds to MiB); uploads cap at 8 MB, except **Clouvider uploads at 1,000,000 bytes** after a reproduced HTTP 413 above 1 MiB on Ashburn. Small HTTP payloads can constrain single-stream throughput on high-latency routes; compare 3-stream mode and other operators. Responses remain limited to 17 MiB. Every phase allows at most 1,000 transfer request attempts and 100 loaded-RTT outcomes.
- Discovery uses the bundled reviewed catalog and Cloudflare fallback only. It sends one bounded edge-RTT request to each shortlisted candidate concurrently, with an 800 ms timeout (up to eight candidates normally, or all reviewed candidates up to 40 in expanded mode), then ranks reachable endpoints by that RTT. **Server network** filters candidates before probing, including an option to exclude Cloudflare from measurements.
- Cloudflare is an additional automatically routed endpoint and has no fixed distance. Its data-center code is displayed when exposed in response headers. Unavailable or browser-blocked servers are disabled.
- Launch Test performs a larger preflight before timing. A failed transfer retries once at a smaller payload on the same endpoint. In **Automatic** mode, a failed attempt can restart the whole test on one other reachable endpoint. The UI announces the change and each attempt has its own history entry; results are never combined across endpoints. A manually selected endpoint never switches automatically. **Try another route** offers explicit recovery after a failure. Cancellation, HTTP 429 rate limits and safety-budget stops do not trigger automatic recovery. Authentication/permission failures, missing endpoints and rate limits are not immediately retried. A Web Locks guard prevents concurrent tests in cooperating tabs on supported browsers.

## Privacy and history

- Orbit does not use the Geolocation API or request location permission. A route preference is a local, manual label only; it is never sent in requests or saved in history.
- Page load automatically retrieves the server catalog and performs bounded discovery probes. This is separate from the sustained, potentially multi-GB test, which starts only when you press Launch Test. Timezone suggestions may be far from your actual location; the route dialog labels them explicitly and allows correction.
- IP and ISP discovery runs on startup, manual refresh, and before a test when older than one minute. It uses Cloudflare response metadata with RIPEstat's [What's My IP](https://stat.ripe.net/docs/data-api/api-endpoints/whats-my-ip.html) fallback, followed by network-info and as-overview. Missing names and failed lookups have explicit states; refreshing clears stale identity. No API keys are required. RIPEstat requests include the sourceapp identifier orbit-speed-test and validate the API status envelope. Your public IP is sent to RIPEstat to identify the registered network holder. A VPN or upstream network may be shown instead of a retail ISP brand. Missing metadata does not prevent a test.
- Test endpoints, the catalog host, and RIPEstat receive normal network request information including your public IP. Upload payloads are generated bytes, not personal files. No analytics are included.
- IndexedDB saves each attempt when it starts and updates it on completion, failure, or cancellation. A tab closed mid-test leaves an unfinished entry. There is no arbitrary history-count limit, but browser storage quota/eviction still applies. Storage errors are shown with an export reminder.
- History includes timestamps, server, status, measurements, graphs, and the access-type snapshot and source at test start; it does **not** store your location, public IP, ISP name or SSID. Tests taken before history was added are not recoverable. Clearing browser site data removes the saved history. Use export for a durable backup; history is specific to this browser and origin.

## Access type and comparing services

The [Network Information API](https://wicg.github.io/netinfo/) exposes an interface type only in some browsers. Orbit reports Wi-Fi, Ethernet or generic cellular when available; it never guesses technology from Mbps, latency, ASN, device name or user agent. The API's `effectiveType` is a recent performance class and may say `4g` on Wi-Fi or Ethernet. It does not identify LTE or 5G. A manual 3G/4G/5G label is always marked **user labelled** and stored with its source in that test's history. Automatic labels react to supported browser network-change events. The snapshot describes the connection at test start; a handover during a test is not guaranteed to be detected. Manual choices reset to automatic on reload.

| Service | Test route | Useful comparison |
| --- | --- | --- |
| Orbit | Reviewed public LibreSpeed hosts and Cloudflare's routed edge | Select operator, endpoint and 1/3 HTTP streams; inspect sustained wall-time throughput and loaded RTT. |
| Speedtest by Ookla | Speedtest's host network, with nearby latency-based selection and manual choice | Compare an ISP-hosted route with independent paths. [Server selection](https://speedtest.zendesk.com/hc/en-us/articles/203845410-How-does-the-Begin-Test-button-select-a-server-) |
| Fast.com | Downloads and uploads to Netflix servers | Compare your route to Netflix; Show more info includes loaded and unloaded latency. [Fast.com FAQ](https://fast.com/) |

The in-app comparison links to the official services. They run separately; Orbit does not integrate their private tokens, APIs or server clients. Run comparisons sequentially on the same device and access type. Different paths, server capacity and test methodology can produce different results without proving ISP throttling.

## Connection ratings

Each readiness card shows a specific capability or bottleneck, its measured evidence, and practical advice when tapped. Ratings recalculate for saved completed flights; no history migration or new test is required. Invalid or interrupted measurements remain unrated. Access-type labels (Wi-Fi/5G/etc.) do not influence the assessment.

These are transparent heuristics for the selected HTTP test route, not certified scores or tests against actual game/video-call services. Delay and bandwidth are assessed separately: a high-latency route can still have ample bandwidth for 4K streaming or HD calls.

| Activity | Capability and limiting factors |
| --- | --- |
| Online gaming | 5 Mbps down / 1 Mbps up allowance. Responsive: idle RTT <40 ms and jitter <10 ms. Otherwise playable, with specific timing warnings at RTT ≥80 ms or jitter ≥15 ms; high latency at ≥150 ms, unstable timing at ≥30 ms jitter. These are Orbit heuristics for typical gameplay, not every game’s requirements. |
| Video streaming | 4K ≥15 Mbps, 1080p ≥5 Mbps, 720p ≥3 Mbps, following [Netflix guidance](https://help.netflix.com/en/node/306). Below 3 Mbps, lower-resolution video; below 1 Mbps, buffering risk. Estimated stream counts exclude overhead and competing traffic. High RTT alone does not downgrade buffered-video bandwidth. |
| Cloud gaming | Browser bandwidth tiers: 720p ≥15 Mbps, 1080p ≥25 Mbps, 1440p ≥35 Mbps, following [GeForce NOW](https://www.nvidia.com/en-gb/geforce-now/system-reqs/). RTT ≥80 ms flags input delay; jitter ≥20 ms flags uneven response. Responsive uses RTT <40 ms and jitter <10 ms; intermediate timing indicates some lag. NVIDIA’s actual datacenter RTT is not measured. |
| Video calls | [Zoom guidance](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0058323): 1080p needs ≥3 Mbps down / 3.8 up; 720p group ≥1.8 / 2.6; 720p one-to-one ≥1.2 / 1.2; basic group video ≥0.6 / 1. Below that, audio-first; below 0.1 Mbps either way, dropout risk. The bandwidth tier remains visible alongside timing warnings: some delay at RTT ≥150 ms or jitter ≥20 ms; high delay ≥300 ms or choppy timing ≥40 ms jitter. Timing cutoffs are Orbit heuristics. |

For interactive activities, a median loaded RTT rise of **≥80 ms** in either phase adds a **lag under load** warning when that phase has at least three valid probes. A stronger bandwidth/idle-timing constraint takes priority on the card, with load information in its popover. Missing or sparse loaded samples never imply a clean bill of health; older tests can still be assessed from their recorded bandwidth, idle RTT and jitter. Loaded HTTP latency includes endpoint scheduling and does not prove router bufferbloat. Streaming tiers estimate bandwidth, not packet-level stability or guaranteed resolution.

## Files and extension points

- `dist/index.html`: accessible page structure.
- `dist/styles.css`: dark space theme, responsive layout, and motion; respects reduced-motion preferences.
- `dist/higheriyer.png`: HigherIyer footer logo.
- `dist/core.js`: statistics, provider request caps, distance, ratings, gauge scale, and local city suggestions.
- `dist/manifest.webmanifest`, `dist/pwa.js`, `dist/sw.js`: installation, offline shell and safe update lifecycle.
- `dist/icon.svg`, `dist/icon-192.png`, `dist/icon-512.png`: launcher artwork.
- `scripts/version-shell.mjs`: fingerprints app assets for cache updates.
- `dist/app.js`: discovery, the measurement engine, IP redaction, and IndexedDB persistence.
- `dist/ui.js`: view state, route dialog, popovers, graphs/scrubber, history rendering and export controls.
- `dist/telemetry.js`: pure percentile/delta helpers, reviewed endpoint resolution, raw reports and CSV serialization.
- `tests/telemetry.test.cjs`: derived values, incomplete records, export escaping, reviewed URLs and scrubber bounds.
- `dist/servers.json`: fallback public catalog and city-center coordinate mapping.

Change the profile durations, request sizes, or rating thresholds to experiment. Update data-use notices when changing measurement duration. Add reviewed endpoints to `servers.json` for new catalog locations.

## Security and publishing

UI changes do not change the measurement schema or erase old history. CSV cells are quoted and formula-like strings are neutralized. Endpoint URLs for old flights are resolved from the current reviewed catalog, with variable request parameters omitted.

After editing app assets, run `npm run cache:version`, then `npm run check` and `npm test` before publishing. Verification rejects an outdated shell fingerprint. Checks include the Cloudflare size regression, aggregate parallel throughput, loaded RTT, bounded retries, endpoint recovery, history compatibility, and cancellation. See [the security review](SECURITY.md) for controls and remaining limitations and [GitHub Pages deployment](DEPLOY.md) for setup. The app is hardened against the checked cases; it is not guaranteed immune to penetration testing.

## Optional browser UI checks

`npm test` requires only Node. For the browser suite, install Playwright in a separate tools directory (or make it available to Node), install its Chromium browser, start Orbit locally, then run `npm run test:browser`. If Playwright is installed elsewhere, set `ORBIT_PLAYWRIGHT_MODULE` to its module path. `ORBIT_TEST_URL` defaults to `http://localhost:8000`. The suite creates a fresh browser profile, blocks public endpoint traffic, seeds synthetic flights, and checks responsive layouts, keyboard navigation, exports, history and popovers. Screenshots go to a temporary directory. No test fixtures are written into your normal browser profile.

## History compatibility

New records use `measurementVersion: 2` and store the selected stream count, loaded RTT samples and diagnostic counters. Earlier records still load, are labelled as legacy single-flow measurements, and do not invent missing loaded-latency data. `transferMs` remains in exports for compatibility; in version 2 it contains elapsed phase wall time. No location or IP fields are added to records.

## Release verification (2 October 2026)

The local readiness audit and remaining launch gates are in [docs/launch-readiness.md](docs/launch-readiness.md). Preserve the dependency-free static runtime; development verification packages are never deployed.

```bash
npm ci --ignore-scripts
npm run check:release
npm run test:coverage
npx --no-install playwright install chromium firefox webkit
npm run test:release
npm audit --audit-level=high
npm run sbom
```

Browser release tests start an isolated local server, mock all public traffic, exercise the real engine, and cover three browser engines, offline history, tab locking, cancellation, mobile layouts and automated WCAG AA checks. Profile clocks are shortened in synthetic tests; physical-device timing and AAA accessibility still need manual verification. The targeted coverage gate measures the shared calculation, telemetry and validation modules, not complete browser/UI branch coverage.

`node scripts/probe-endpoints.cjs --live` is an explicit, small GET-only CORS and download-contract smoke test from the configured origin. It never performs a full sustained test or upload and is never run in CI. Use only for ordinary endpoint checks; never load-test public operators.

Measurement version 3 retains the existing history database and accepts versions 1/2, including unavailable legacy wire latency. Existing 4-stream history remains valid; current controls offer 1/3 streams. Old measurements are not silently relabelled as the new method.
