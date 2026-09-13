# Security review — September 13, 2026

Orbit is a static browser application. This review and its regression tests reduce specific risks; they are not an independent penetration-test certification or a promise of zero vulnerabilities.

## Controls checked or added

- Remote catalogs can only select exact HTTPS endpoints in `dist/security.js`. New hosts or paths require a reviewed code change. Credentials, arbitrary ports, private addresses, unexpected paths, and cross-origin server paths are rejected; fetch redirects fail closed.
- The HTML content security policy permits only local scripts/styles and reviewed connection origins. Inline scripts, eval, plugins, forms, frames created by Orbit, and workers are disabled. Trusted Types protects script injection sinks in supporting browsers. All external text is rendered as text, not HTML.
- JSON responses are limited to 1 MiB before parsing. Binary responses are streamed and discarded after counting, capped at 17 MiB per response. Tests also have request, phase-duration, sample-count, and approximate 8 GB payload safety stops. They are not a bandwidth-billing guarantee.
- IP/ASN/edge metadata and saved history are validated before use. Unknown history fields, oversized arrays, invalid dates, and non-finite/extreme measurements are rejected. Bad records are ignored without deleting stored data. History never intentionally includes IP, location, credentials, or personal files.
- The app makes no third-party requests or location prompts merely on page load. Scanning, location, and tests require a user action. Credentials and referrers are omitted from test requests.
- When embedded, the app refuses network operations and does not load history. This is a fallback, not a replacement for a `frame-ancestors` response header.
- The local server binds to loopback, accepts only approved Host/Origin values, serves a fixed asset list, and refuses uploads, directory listings, and non-GET/HEAD methods. It supplies CSP including `frame-ancestors 'none'`, DENY framing, nosniff, a restricted Permissions Policy, no-referrer, and same-origin isolation headers.
- GitHub Actions use immutable commit pins, no persisted checkout credentials, read-only verification permissions, and deployment-only Pages/OIDC permissions. Pull requests are tested but cannot deploy. Only `dist` becomes the Pages artifact; no local records or development files are published.

## Verification

Run `npm run check` and `npm test` on Node 22+. Tests cover destination and catalog injection, large/malformed responses, unsafe history, malicious metadata, CSP, deployment pins, local path traversal, host/origin spoofing, security headers, timing/math, manual server selection, cancellation, and storage errors. Functional integration tests use synthetic traffic; they do not attack public speed-test providers.

## Limits and deployment decisions

- GitHub Pages serves HTTPS, but this repository cannot set arbitrary response headers there. Meta CSP works for supported directives; `frame-ancestors`, Permissions-Policy and X-Content-Type-Options need host/proxy response headers. Do not assume a `_headers` file or meta tag configures them on Pages. Recheck actual production headers after publishing. For stronger header control, a custom domain with a configurable edge proxy can be added later.
- The fallback anti-framing check is weaker than browser-enforced anti-framing headers. Treat response-header clickjacking protection on plain Pages as a hosting limitation, not a closed finding.
- GitHub project sites under the same `owner.github.io` origin share browser trust/storage boundaries. Only host mutually trusted apps on that origin; a dedicated custom domain provides a separate origin. History is local convenience data, not authenticated evidence. Another script with same-origin access or a malicious browser extension can tamper with it.
- An allowlisted third-party operator may be unavailable, compromised, or change its DNS. Browser/private-network restrictions still matter. Orbit has no server-side fetch/proxy route, but client-side allowlists do not constrain someone who edits their own browser code. Never treat browser controls as backend authorization.
- The account, GitHub Actions platform, browser, TLS, upstream hosts, and network are separate trust boundaries. No application code can guarantee those remain secure. Public provider terms and capacity still apply.
- GitHub is hosting the app assets only. Large test payloads go directly to speed-test operators, not through Pages or a repository API.

## Reporting

Use the repository's private vulnerability reporting feature if enabled. Avoid posting credentials, public-IP logs, precise locations, or exploit details in public issues. Test Orbit locally or on an explicitly authorized deployment; public test-server operators are not included in that authorization.
