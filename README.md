# Orbit — network speed test

A local, dependency-free web app with sustained measurements, location-aware server selection, live graphs, a rocket animation, connection ratings, and test history. Developed by HigherIyer.

## Run

From this folder:

```bash
npm start
```

Open **http://localhost:8000**. Stop the server with **Ctrl+C**. Node.js 22+ and a modern browser are all you need. There are no packages to install and no build step. The local server includes security headers and serves only public assets.

## Use

1. Orbit requests device location on launch and automatically checks nearby servers. Allow the browser prompt to use a device fix. If permission is denied or detection times out, a **clearly labelled timezone-based city suggestion** is used when available; otherwise servers are compared without a distance filter.
2. The location bar shows the current search area and how it was chosen. **Change location** lets you select a city, choose **No location filter**, or retry **Use device location**. City centers are approximate; choosing a city does not change your IP or network route. A manual selection takes priority over a delayed device response.
3. Keep **Automatic** to use the lowest-latency reachable candidate, or select another server from the cards/dropdown. **Scan servers** refreshes the measurements.
4. Press the circular **Start Test** dial. Allow about a minute, or cancel whenever needed. The dial shows actual measured values on a labelled 0–1,000 Mbps scale (milliseconds during ping); values above the dial range remain visible numerically.
5. Review activity estimates and graphs. Saved flights can be reopened with **View**, or downloaded with **Export history**.

## Measurements and server discovery

- The app measures ten HTTP ping samples after a warm-up. Ping is the median, and jitter is the mean absolute difference between consecutive samples. It is not ICMP ping.
- Download and upload each run back-to-back requests for at least **22 seconds of request time**. The last transfer finishes before the phase ends. Final Mbps = total payload bits / full elapsed wall time / 1,000,000. Graphs show completed-transfer sample throughput, with time reset at the start of each direction. The headline values are sustained averages, not peak samples.
- These are single-stream HTTP estimates. Request/server overhead, Wi-Fi, VPNs, traffic, and browser scheduling can affect the results. Packet loss and latency under load are not measured.
- Data use can reach several GB per run. A safety stop is checked at about **8 GB of test payload**, with at most one final request beyond that threshold. For example, 22 seconds at 500 Mbps consumes about 1.375 GB in that direction alone. Per-request sizes are capped at 16 MB download and 8 MB upload, apart from LibreSpeed's rounding to 1 MiB chunks. Requests time out after 20 seconds; each phase also stops after 90 seconds plus any final in-flight request, or 1,000 samples.
- Discovery loads the [LibreSpeed public catalog](https://github.com/librespeed/speedtest/blob/master/server-list.json), falling back to `servers.json` when unavailable. The bundled snapshot comes from [LibreSpeed's server list](https://librespeed.org/backend-servers/servers.php), dated September 12, 2026. Coordinates are approximate city centers; new/unrecognized cities have no distance estimate. Only exact endpoints in the reviewed `security.js` allowlist are eligible; a live catalog cannot introduce new destinations.
- Candidate servers receive one warm-up, three latency probes, a small download, and a 1 KB upload. Requests include LibreSpeed's documented `cors` and `ckSize` parameters. Reachable servers are ranked by median latency. The winner is the lowest among the tested shortlist, not necessarily the fastest or geographically closest server worldwide.
- Cloudflare is an additional automatically routed endpoint and has no fixed distance. Its data-center code is displayed when exposed in response headers. Unavailable or browser-blocked servers are disabled. A selected server never silently changes mid-test.

## Privacy and history

- Device coordinates and selected cities remain in memory in this tab. They are used for local distance calculations, never sent in requests or saved in history. A built-in city list supplies approximate area labels without a reverse-geocoding service. Location is requested once on each page load and when you choose **Use device location**; the browser controls permission. A 15-second fallback prevents a dismissed prompt from blocking the app.
- Page load automatically retrieves the server catalog and performs bounded discovery probes. This is separate from the sustained, potentially multi-GB test, which starts only when you press the launch dial. Timezone suggestions may be far from your actual location; the location bar labels them explicitly and allows correction.
- IP and ISP discovery uses Cloudflare and RIPEstat. Your public IP is sent to RIPEstat to identify the registered network holder. A VPN or upstream network may be shown instead of a retail ISP brand. Missing metadata does not prevent a test.
- Test endpoints, the catalog host, and RIPEstat receive normal network request information including your public IP. Upload payloads are generated bytes, not personal files. No analytics are included.
- IndexedDB saves each attempt when it starts and updates it on completion, failure, or cancellation. A tab closed mid-test leaves an unfinished entry. There is no arbitrary history-count limit, but browser storage quota/eviction still applies. Storage errors are shown with an export reminder.
- History includes timestamps, server, status, measurements, and graphs; it does **not** store your location or public IP. Tests taken before history was added are not recoverable. Clearing browser site data removes the saved history. Use export for a durable backup; history is specific to this browser and origin.

## Connection ratings

Ratings are transparent heuristics, not certified scores or tests against actual game/video-call services:

| Activity | Higher rating criteria |
| --- | --- |
| Online gaming | Excellent: ping <40 ms, jitter <10 ms, download ≥10 Mbps, upload ≥3 Mbps. Good: ping <80 ms, jitter <20 ms, download ≥5 Mbps, upload ≥1 Mbps. |
| Video streaming | 4K ≥15 Mbps, 1080p ≥5 Mbps, 720p ≥3 Mbps, following [Netflix guidance](https://help.netflix.com/en/node/306). Estimated simultaneous streams ignore overhead and competing traffic. |
| Cloud gaming | Promising: download ≥25 Mbps, ping <40 ms, jitter <10 ms. Fair: ≥15 Mbps, <80 ms, <20 ms. Based loosely on [GeForce NOW requirements](https://www.nvidia.com/en-gb/geforce-now/system-reqs/); actual latency to NVIDIA is not measured. |
| Video calls | Excellent: download ≥10 Mbps, upload ≥5 Mbps, ping <100 ms, jitter <20 ms. Good: ≥3 Mbps each way, <150 ms, <30 ms. Practical estimates for one call. |

## Files and extension points

- `dist/index.html`: accessible page structure.
- `dist/styles.css`: dark space theme, responsive layout, and motion; respects reduced-motion preferences.
- `dist/rocket.png`: transparent rocket artwork.
- `dist/higheriyer.png`: HigherIyer footer logo.
- `dist/core.js`: median, jitter, distance, ratings, dial scale, and local city suggestions.
- `dist/app.js`: discovery, permission handling, measurements, graph rendering, and IndexedDB history.
- `dist/servers.json`: fallback public catalog and city-center coordinate mapping.

Change `MEASURE_MS`, request sizes, or rating thresholds to experiment. Update data-use notices when changing measurement duration. Add city centers to `servers.json` for new catalog locations.

## Security and publishing

Run `npm run check` and `npm test` before publishing. See [the security review](SECURITY.md) for controls and remaining limitations and [GitHub Pages deployment](DEPLOY.md) for setup. The app is hardened against the checked cases; it is not guaranteed immune to penetration testing.
