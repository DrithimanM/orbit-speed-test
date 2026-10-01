# Orbit launch review — 2 October 2026

**Decision: local release candidate improved; public launch remains conditional. Nothing has been pushed, committed, published or configured remotely.** Target launch: 12 October 2026. Baseline: `44bb1b8307c74f78928b7fe5ceea1fa357794c68`. This assessment covers the repository and local runtime, not an enterprise certification or a guarantee that every defect has been eliminated.

## Executive alignment and scope

Orbit is a free, anonymous, static browser speed test. Preserve its visual design, route selection, profiles, readiness explanations, diagnostics, PWA/offline shell, local history and JSON/CSV/Markdown/HTML/PDF exports. Improve measurement honesty, failure behavior, privacy boundaries, delivery controls and evidence. No paid API, application backend or deployed npm dependency was added.

Reviewed: all four original runtime boundaries (UI/coordinator/calculation/security), catalog, PWA, persistence, export formats, deployment workflow, development server, documentation, repository history and verification dependencies. Reviewed existing API dependencies with API Supermaster Wizard and applied Enterprise Operating System and Production Engineering Architect guidance. Test automation executes the actual browser application; bounded synthetic traffic makes those tests reproducible without consuming public operators' bandwidth.

Not established: provider permission for forecast volume, global capacity, production headers, CI execution on GitHub, branch/environment protection, independently calibrated measurement accuracy, real iOS/Android device behavior, WCAG AAA/manual accessibility, jurisdiction-specific legal compliance or operational ownership. These are explicit release gates below.

| Responsibility | Responsible (proposed) | Accountable | Consulted / informed |
| --- | --- | --- | --- |
| Product scope, free-service policy, launch decision | DrithimanM | DrithimanM | Intended users; provider operators |
| Code and local verification | Codex implementation; human reviewer needed | DrithimanM | Independent engineering reviewer |
| Security/privacy and release review | Named human security reviewer, pending | DrithimanM | Hosting/provider contacts |
| Hosting, deployment, monitoring, rollback | Named operator, pending | DrithimanM | Engineering reviewer |
| Accessibility and supported-device acceptance | Human QA owner, pending | DrithimanM | Assistive-technology users |
| Licensing, service terms, provider volume | Product/legal owner, pending | DrithimanM | RIPEstat and bandwidth operators |

These are proposed assignments, not recorded approvals. CODEOWNERS requests review from @DrithimanM; it does not itself enable required reviews or prohibit direct pushes.

## Fixed findings

| Priority | Finding and effect | Local correction / evidence |
| --- | --- | --- |
| P1 | Independent/operator selection could reinsert Cloudflare | Filter before probes and recovery; unreachable providers cannot be selected as a fabricated fallback. Behavioral and browser filter tests pass. |
| P1 | WebRTC/STUN latency had no remote peer and could not produce the claimed wire measurement | Removed broken transport probe. Ten complete selected-route HTTP GETs supply idle RTT; exposed Resource Timing supplies optional HTTP first-byte detail. Legacy wire fields remain readable. No pure-wire claim. |
| P1 | Idle measurement discarded slow tails and warm-up required HEAD | GET warm-up; ten ordered GET samples, no trimming; same GET/body method for loaded probes. Cancellation tested. |
| P1 | Incomplete phases and sparse loaded probes could produce misleading rates or grades | Retain partial data and explicit status; complete-flight export headlines remain blank; worst-direction grade requires at least three probes. Readiness stays a heuristic. |
| P1 | Transfer failures/retries could invalidate timing or continue excessively | Exact binary payload contracts, one shared phase clock, bounded retry/drain/budget, terminal 429 and no immediate provider recovery. Tests cover single/three workers, aborts and failed bytes. |
| P1 | Simultaneous tabs contaminate measurements | Origin-scoped Web Lock prevents cooperating Orbit tabs from testing concurrently where supported. Two-tab browser test passes. Other apps/devices remain outside this lock. |
| P1 | Failed/hung IndexedDB could strand the application or hide records | Three-second open/transaction bounds, late-open close, version-change close, failed-handle reset and exportable session fallback. Legacy null wire fields no longer cause valid history to disappear. |
| P1 | Deployment lacked substantive security/browser release gates | Pinned Actions; two Node versions; audit, SBOM, artifact checks, secret scan, Semgrep, CodeQL gate, three-browser QA, provenance and deployment dependencies. Configuration reviewed; real CI still pending. |
| P2 | Bufferbloat help/history/diagnostics could disagree with calculations | Shared median/delta and grade contract, accurate first-byte/protocol/ratio labels, negative deltas preserved. |
| P2 | Graph timing and explanatory text did not reflect current profiles | Quick/Sustained durations and one/three workers accurately described; graph domain follows profile and observed duration. |
| P2 | Markdown/partial exports and long PDF routes could mislead or render badly | HTML/Markdown escaping and single-line route handling; partial labels; PDF route wrapping, metric font fit and readiness panel layout. Synthetic PDFs parsed and rendered for inspection. |
| P2 | Geolocation permissions and documents did not match the GPS-free design | Geolocation denied in server/optional hosting headers; architecture, threat boundaries and deployment documents updated. |

New tests verify behavior rather than just matching implementation text. Source-harness tests execute app definitions; their VM coverage is not reported as full application branch coverage.

## Verification ledger

| Check | Result and practical limit |
| --- | --- |
| Syntax, public assets, cache fingerprint, integration | PASS on final local files. Public artifact contains only reviewed assets; digest recorded. |
| Unit/behavior tests | PASS: 65/65, including cancellation, request limits, rate limiting, provider recovery, storage and exports. |
| Shared-module coverage | PASS: 96.88% lines, 87.15% branches, 87.34% functions across core/security/telemetry. Telemetry alone: 75.95% branches. Coordinator/UI/PWA full branch coverage is not established. |
| Chromium, Firefox, WebKit | PASS: actual app with synthetic HTTP contracts, ten idle probes, history reload, filters, cancellation, tab locking and cached offline shell. Profile clock shortened for repeatability; no accuracy/scale claim. |
| Automated accessibility/layout | PASS: no axe WCAG A/AA violations in Overview/Telemetry/History in three engines; no horizontal overflow at 320/390/768/1440px. AAA, screen readers, touch and manual keyboard/device acceptance remain pending. |
| Browser errors | No unexpected page errors/unhandled rejections. WebKit may emit an expected handled CORS transport diagnostic when the test deliberately shuts down the server to exercise offline behavior. |
| Secret scans | PASS: Gitleaks across all 49 fetched commits and current files; redacted reports. Detectors cannot prove absence of every secret. |
| SAST | PASS: Semgrep 1.178.0, 68 JavaScript rules, 14 runtime/tooling files, zero findings. CodeQL configured, not executed locally. |
| Dependency audit/SBOM | PASS: clean npm lock, five dev-only components, zero deployed npm packages; npm audit reports zero known vulnerabilities at review time. New advisories remain possible. |
| Exports | PASS: structured and escaped export tests; ordinary and maximum-length route PDF fixtures parsed/rendered. PDF currently transliterates to ASCII; JSON/HTML preserve Unicode. Full international PDF typography remains an improvement. |
| Provider smoke | 24/27 browser GET checks succeeded from one network; four small binary download contracts passed. No sustained public load or upload capacity test. Network observation is not an SLA. |
| Git hygiene | Local changes only; no commit, push, pull request or deployment. Diff whitespace check passes. |

Provider smoke timestamp is recorded in UTC in the evidence. Helsinki/Hetzner, Novi Sad/E-CAPS.net and Tokyo/A573 failed the small GET check; neither permanence nor a specific cause is inferred. Their entries remain available for future successful discovery. The application performs its own shorter, 800 ms discovery probe, so its reachable shortlist can differ from the seven-second audit probe.

## RFC: measurement and trust decisions

Architecture and exact data contracts are in `docs/architecture.md`. No schema migration is required; record versions 1/2/3 are accepted. Current records are version 3. History keeps access-type enums and performance classes but excludes raw IP, ISP, ASN and location. Current identity metadata is displayed only in tab memory. Public operators necessarily observe the caller's network address.

Idle RTT is browser HTTP transaction time, not ICMP or calibrated propagation delay. Each direction schedules traffic for 5 or 15 seconds, with one or three workers and up to 20 seconds drain time. Successful payload bits are divided by full elapsed phase time. Planned traffic has an 8 GB shared safety cap, which is a ceiling rather than a promise that tests are cheap on metered connections. Browser scheduling, background tabs, TLS, endpoint capacity, proxying and multiplexing affect results. There is no way for a static browser application to eliminate these effects or verify every user's access link.

Preserve endpoints through an exact HTTPS allowlist; refuse redirects/credentials/referrers; enforce bounded responses and validated histories. Generated uploads contain no private files. Service worker caches only local shell assets; external requests and uploads bypass cache. Optional first-byte timing is shown only when browser Resource Timing actually exposes it. Baseline/sustained ratio is an observational diagnostic, not an efficiency guarantee.

GitHub project sites under one account share an origin. Same-origin code or a compromised extension can access convenience records. A dedicated project origin is the stronger production boundary. Local records are not signed or trusted billing/compliance evidence.

### STRIDE review

| Threat | Control in candidate | Residual risk / owner action |
| --- | --- | --- |
| Spoofing | Exact reviewed HTTPS endpoints, no arbitrary catalog URLs; metadata validation | DNS/operator/browser compromise remains; operator ownership and terms need approval. |
| Tampering | Record schema/size/order checks; bounded catalog; escaped DOM and exports | Same-origin scripts, extensions or user edits can fabricate measurements. No cryptographic attestation claim. |
| Repudiation | Attempt IDs, statuses, diagnostics and local export | No trusted server audit trail; acceptable for personal diagnostics, not regulated evidence. |
| Information disclosure | No stored/exported IP/ISP/ASN/location; no third-party analytics; no referrer/credentials; GPS denied | Hosting/operators observe network access; export files and device backups are user-controlled. Privacy notice and retention review pending. |
| Denial of service | Timeouts, size/budget bounds, cancellation, 429 stop, locks, retry limits, static hosting | Public operators have no contracted capacity; mass clients and same-origin malicious apps are not centrally rate-limited. |
| Elevation of privilege | CSP, no inline scripts/eval, exact origin/path boundaries, no deployed dependencies | GitHub Pages does not apply this repository's custom response header file. Dedicated hosting and production header validation pending. |

HTTPS/CSP reduce risk; they do not constitute a penetration test. No authentication, payment, server database, containers, Kubernetes or server-side authorization exists in the reviewed scope; their controls are not applicable until scope changes.

## Six-division release gates

| Division | Gate | Status |
| --- | --- | --- |
| Product/business | Preserve feature scope, free runtime, truthful method | PASS locally. Business eligibility for chosen host and support commitments PENDING. |
| Architecture/engineering | Bounded contracts, compatible history, reviewed source, automated behavior | PASS locally. Independent human review, measurement comparison and complete app coverage PENDING. |
| Security/privacy/compliance | Allowlist/CSP/redaction/secret scan/SAST/SCA | PASS for listed local controls. CodeQL, deployed headers, source/asset license, privacy/legal/provider acceptance PENDING. |
| Quality/accessibility | Three-engine functional/offline/layout and automated AA | PASS locally. AAA/manual assistive technology and real supported-device acceptance PENDING. |
| Platform/DevSecOps | Pinned workflow, SBOM, package-only-dist, gated deployment/provenance | CONFIGURED. Actual GitHub runs, artifact attestation, required checks/reviews/environment approval PENDING. |
| Operations/SRE | Failure bounds, export fallback, rollback/runbook | PASS locally for bounds. Named on-call/operator, deployed monitoring and operational rehearsal PENDING. |

No security or operational sign-off is inferred from this table. PCI/HIPAA/database backup/container registry/IaC/Kubernetes gates are NOT APPLICABLE to the reviewed anonymous static application, rather than silently marked passed.

## Free-provider and hosting decision

Existing dependencies can remain without paid additions, but free public endpoints do not grant unlimited capacity or a production SLA.

- RIPEstat: use the added `sourceapp=orbit-speed-test`. Its documentation asks regular clients above 1,000 requests/day to register and limits concurrency to eight per IP. Resolve expected traffic and intended commercial use with RIPE NCC before mass launch. One user discovery sequence makes multiple metadata calls. [RIPEstat API documentation](https://stat-ui.stat.ripe.net/docs/data-api/ripestat-data-api), [service overview](https://data.stat.ripe.net/docs/getting-started/what-is-ripestat).
- Cloudflare: current public download/upload contracts are documented in its speed-test project. Open-source client code licensing is not permission for unlimited endpoint use or a service guarantee. Obtain acceptable-use/volume confirmation. [Official speed-test project](https://github.com/cloudflare/speedtest).
- LibreSpeed: multiple independently operated endpoints; protocol compatibility does not establish each operator's permission, retention, quota or availability. No LibreSpeed source was vendored. Confirm operators for expected load and retain multi-provider fallback. [Official project](https://github.com/librespeed/speedtest).
- GitHub Pages: soft 100 GB/month bandwidth limit and restrictions relevant to commercial SaaS. Account/project eligibility must be checked against intended business use. Project-site origin isolation/custom response headers are limited. [Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).
- Optional Cloudflare Pages: offers a dedicated project origin and static header configuration. The repository includes an optional header profile, excluded from the GitHub Pages artifact. Free-plan limits include 500 builds/month, 20,000 files and 25 MiB per file; Orbit's shell fits those limits. It has not been configured or deployed, and no SLA is established. [Pages limits](https://developers.cloudflare.com/pages/platform/limits/), [static headers](https://developers.cloudflare.com/pages/configuration/headers/).

The five npm components exist only for development verification. Their license information is in the SBOM. The repository does not declare its own source license; the owner must choose rights for source/assets/brand before distribution. No inferred license was added.

## Delivery pipeline and approval boundary

`verify → browser/security/CodeQL → package/provenance → deploy`, with packaging depending on all four verification jobs. Two Node versions are configured. CodeQL SARIF rejects high/critical security results (severity ≥7) or error-level results; missing output also fails. Semgrep and Gitleaks fail on findings. The shared-module branch threshold is 80%; it is not a whole-application coverage guarantee. Browser artifact evidence uploads even on failure.

The deterministic distribution archive receives an attestation; GitHub packages the Pages artifact separately from the same checkout. The attestation is not a claim that the separate Pages archive has the same byte digest, and no SLSA level is asserted. Provenance and runner permissions must be exercised in actual CI. Semgrep's registry rules/transitive installation are external dependencies; rules are not a completely hermetic supply chain.

An approved push to main could trigger automatic deployment. The safer first remote action is an explicitly approved review branch/PR, then required checks, human approval and an approved merge. No such action has been taken. Branch protection and environment review must be configured by an authorized repository owner.

## SRE targets, release rings and rollback

These are proposed targets, not measured historical SLOs: shell availability ≥99.9% monthly; supported-browser smoke pass 100% per release; unexpected JavaScript errors zero in release QA; successful local history reload when storage is available; failure/cancellation settles within documented request/drain bounds. Public test-route availability should be measured separately and reported rather than included in an Orbit-owned SLA. Keep monitoring aggregate and privacy-preserving; no automatic result upload was added. Without production monitoring, do not advertise an availability guarantee.

| Ring | Audience and exit criterion |
| --- | --- |
| 0 | Local final evidence and human source review; no external deployment. |
| 1 | Dedicated preview origin; named testers; verify HTTPS/CSP/header policy, cache update, cancellation and every export on real devices. At least 20 deliberate flights across three network/device combinations, with provider permission; no stress traffic against public endpoints. |
| 2 | Small invited pilot over 24–48 hours; at least 30 completed attempts across the agreed support matrix, no lost-history defect, unexpected errors or known high security issue. Investigate route failures and deviations; sample counts are acceptance proposals, not statistical proof. |
| 3 | Public launch only after owner gate acceptance; watch shell/route failure signals and user reports, pause promotion for regression. No central feature flag or automatic traffic-percentage canary exists in this static design. |

Rollback: preserve/export local history before troubleshooting; disable workflow deployment if needed; choose the last known-good approved source/artifact and redeploy through verified delivery; confirm its shell fingerprint and headers; allow the normal waiting-worker activation after all Orbit tabs close; reopen and verify history, routes and a controlled flight. Caches are scope-specific. IndexedDB version is unchanged, so this candidate does not require a destructive migration. Do not clear browser storage as a routine rollback. Rehearse the procedure on preview; target recovery within 30 minutes after operator decision, not a verified recovery SLA. An old worker/tab can remain active until closed; static rollback is not instant session revocation.

## Ten-day launch plan

| Date (Dubai) | Required output |
| --- | --- |
| 2 Oct | Review this local candidate and evidence; confirm traffic forecast, business model, supported platforms and human owners. |
| 3 Oct | Independent code/security review; select a dedicated eligible free hosting origin; decide source/asset licensing. |
| 4 Oct | Confirm provider permissions/volumes and RIPEstat registration/contact; publish reviewed method/privacy wording in the intended release. |
| 5 Oct | After explicit push approval, run the new CI on a review branch; resolve CodeQL/workflow/runtime failures; configure required checks/review. |
| 6 Oct | Preview deployment and real response-header/CSP/HTTPS review; test fresh install and update from the existing release. |
| 7 Oct | Real iOS/Safari and Android/Chrome, desktop support matrix, keyboard/screen-reader/manual accessibility checks. |
| 8 Oct | Controlled comparison against a known reference on several network types; investigate consistent bias without asserting equal results across routes. |
| 9 Oct | Invited pilot and operational monitoring; establish support channel, owner and escalation; no public endpoint stress testing. |
| 10 Oct | Finish pilot, rollback rehearsal, history/exports and failure checks; record all pending gate decisions. |
| 11 Oct | Freeze approved release artifact, release notes, CI/provenance evidence and explicit go/no-go. |
| 12 Oct | Launch only if blocking gates pass; otherwise retain the candidate in preview and set a justified later date. |

## Owner decisions still required

1. Forecast peak active testers and daily flights; obtain appropriate provider acceptance instead of assuming public APIs are unlimited.
2. Confirm eligible free host and dedicated origin; verify real response headers and migration/update behavior.
3. Run and review actual GitHub CI/CodeQL and enable required reviews/deployment approval after explicit push authorization.
4. Assign operational, security and accessibility reviewers; complete real-device/manual acceptance and reference measurement checks.
5. Approve source/asset license, privacy/method wording, support promises and applicable legal requirements.

Use `npm ci --ignore-scripts`, `npm run check:release`, `npm run test:coverage`, Playwright browser installation and `npm run test:release` to reproduce the documented local checks. Security scans and the opt-in small live probe are documented in SECURITY.md and DEPLOY.md. No automated test suite substitutes for the outstanding human/provider/deployment gates.
