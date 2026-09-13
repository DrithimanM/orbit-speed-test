# Orbit — network speed test

A local, dependency-free web app with sustained measurements, location-aware server selection, live graphs, an animated rocket flight deck, loaded-latency diagnostics, connection ratings, and test history. Developed by HigherIyer.

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
4. Select **4 streams · capacity** (default) or **1 stream · path**, then press **Start Test**. Four simultaneous HTTP transfers help fill a fast connection; one flow helps compare a single-request path. Allow about a minute, or cancel whenever needed. The readout is measured speed; the ruler caps visually at 1,000 while larger values remain visible numerically.
5. Review activity estimates and graphs. Saved flights can be reopened with **View**, or downloaded with **Export history**.

## Measurements and server discovery

- The app measures ten HTTP ping samples after a warm-up. Ping is the median, and jitter is the mean absolute difference between consecutive samples. It is not ICMP ping.
- Download and upload each run for at least **22 seconds of elapsed wall time**. Requests already in flight are allowed to finish (20-second request timeout). Final Mbps = successfully completed payload bits / full elapsed phase time / 1,000,000. Time spent waiting or retrying remains in the denominator. Results are sustained averages, not peaks. Four streams share a phase clock; their rates are never added independently.
- The trace plots aggregate completed bytes per sampling interval (about 500 ms), separately for download and upload. Requests finish in batches, so a trace can be bursty; it is not a packet-level link-rate capture. Browser scheduling, server load, transport overhead, Wi-Fi, VPNs and distance affect results.
- An independent HTTP request samples latency about once per second **during** each transfer phase. Median loaded RTT, its difference from idle median, idle p95 (linear percentile interpolation), jitter, sample counts, retry counts and transferred payload are shown. These are end-to-end browser HTTP measurements including server scheduling. Missed probes are reported as missed HTTP probes, never as UDP packet loss. Actual game-server RTT and UDP packet loss are not measured.
- Four concurrent HTTP transfers may multiplex over one HTTP/2 or HTTP/3 connection. They do not guarantee four distinct TCP connections or saturation of every connection. Compare modes on the same endpoint for useful results.
- Data use can reach several GB. Each Start Test invocation has a shared **8 GB planned-payload safety budget**, including transfer retries and recovery attempts. Startup discovery, metadata, headers and other transport overhead are outside that counter; it is not a billing guarantee. Cloudflare downloads are capped at **8,000,000 bytes per request**, below a reproduced 16 MB rejection. Other reviewed download endpoints retain a 16 MB request cap (LibreSpeed rounds to MiB); uploads cap at 8 MB. Responses remain limited to 17 MiB. Every phase allows at most 1,000 transfer request attempts and 100 loaded-RTT outcomes.
- Discovery loads the [LibreSpeed public catalog](https://github.com/librespeed/speedtest/blob/master/server-list.json), falling back to `servers.json` when unavailable. The bundled snapshot comes from [LibreSpeed's server list](https://librespeed.org/backend-servers/servers.php), dated September 12, 2026. Coordinates are approximate city centers; new/unrecognized cities have no distance estimate. Only exact endpoints in the reviewed `security.js` allowlist are eligible; a live catalog cannot introduce new destinations.
- Candidate servers receive one warm-up, three latency probes, a small download, and a 1 KB upload. Requests include LibreSpeed's documented `cors` and `ckSize` parameters. Reachable servers are ranked by median latency. The winner is the lowest among the tested shortlist, not necessarily the fastest or geographically closest server worldwide.
- Cloudflare is an additional automatically routed endpoint and has no fixed distance. Its data-center code is displayed when exposed in response headers. Unavailable or browser-blocked servers are disabled.
- Start Test performs a larger preflight before timing. A failed transfer retries once at a smaller payload on the same endpoint. In **Automatic** mode, a failed attempt can restart the whole test on one other reachable endpoint. The UI announces the change and each attempt has its own history entry; results are never combined across endpoints. A manually selected endpoint never switches automatically. **Try next reachable server** offers explicit recovery after a failure. Cancellation and safety-budget stops do not trigger automatic recovery.

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
- `dist/core.js`: statistics, provider request caps, distance, ratings, ruler scale, and local city suggestions.
- `dist/app.js`: discovery, permission handling, measurements, graph rendering, and IndexedDB history.
- `dist/servers.json`: fallback public catalog and city-center coordinate mapping.

Change `MEASURE_MS`, request sizes, or rating thresholds to experiment. Update data-use notices when changing measurement duration. Add city centers to `servers.json` for new catalog locations.

## Security and publishing

Run `npm run check` and `npm test` before publishing. Checks include the Cloudflare size regression, aggregate parallel throughput, loaded RTT, bounded retries, endpoint recovery, history compatibility, and cancellation. See [the security review](SECURITY.md) for controls and remaining limitations and [GitHub Pages deployment](DEPLOY.md) for setup. The app is hardened against the checked cases; it is not guaranteed immune to penetration testing.

## History compatibility

New records use `measurementVersion: 2` and store the selected stream count, loaded RTT samples and diagnostic counters. Earlier records still load, are labelled as legacy single-flow measurements, and do not invent missing loaded-latency data. `transferMs` remains in exports for compatibility; in version 2 it contains elapsed phase wall time. No location or IP fields are added to records.
