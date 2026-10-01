# Publish on GitHub Pages

This repository contains a public GitHub Pages workflow; launch approval remains gated by [the readiness report](docs/launch-readiness.md). The workflow verifies the code before deploying only `dist`. No API keys or repository secrets are required.

1. Create an empty GitHub repository named `orbit-speed-test` (or another name). Public source works with GitHub Free; private-repository Pages availability depends on your plan.
2. Upload the contents of this folder, keeping `dist`, `scripts`, `tests`, and `.github` in place. Use `main` as the default branch.
3. In **Settings → Pages → Build and deployment**, choose **GitHub Actions**.
4. In **Actions**, run **Test and publish Orbit**, or push another change to `main`. Wait for both verification and deployment to finish.
5. Open the URL shown by the deployment. In Pages settings, keep **Enforce HTTPS** enabled. Orbit does not request location access; HTTPS is required for installation/offline support outside localhost.

After publishing, test server discovery from the deployed URL. A provider may accept localhost but block another browser origin. Disabled servers should remain unavailable; do not relax CORS or the allowlist to bypass that behavior.

The existing localhost history will not appear on the GitHub URL because browser storage is per origin. Export local history first if you want a backup.

## Updating

Edit the source, run `npm run cache:version`, `npm run check:release`, and `npm run test:release`. After explicit owner authorization, push a review branch; merge into `main` only after required checks and launch approval. The workflow publishes only if verification succeeds. Dependabot proposes updates to pinned GitHub Actions and verification packages. The workflow runs on Node 22/24 and requires browser, secret/SAST/SCA and CodeQL checks before packaging. The archive provenance and protection settings must be verified after the first approved CI run. Review code and endpoint changes before merging.

The manifest and worker use relative paths, so installation works at `/orbit-speed-test/` as well as localhost. Deploy the entire `dist` directory, including manifest, worker, icons and shell assets. The fingerprint check prevents publishing changed assets under an unchanged offline cache version.

Existing installations download a new shell in the background. They show an update notice, then activate it after every Orbit tab/app window is closed. Reopening a tab without closing the other Orbit windows may keep the previous version. No forced reload or mid-test activation occurs. A failed precache leaves the previous installation usable.

## Hosting limitations

The app includes a meta content policy and a framing guard. GitHub Pages does not expose a custom-response-header configuration for this project; see `SECURITY.md` for the remaining header and shared-origin limitations. Use a configurable proxy/custom domain if response-header anti-framing and permissions restrictions are mandatory.

Official instructions: [custom Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) and [HTTPS](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https).

## Enterprise release gate

Do not push this local review until the owner confirms. Pushing main can deploy automatically after verification; GitHub environment reviewer requirements and branch rules must be configured by the owner, and are not set by files in this repository. For review before publication, prefer a feature branch and PR after explicit push authorization.

Plain GitHub Pages cannot supply the app's full response-header policy and shares an origin with other owner project sites. A free Cloudflare Pages subdomain is an optional hosting alternative with per-project origin and static response-header support. The reviewed profile is `deploy/cloudflare-pages.headers`; copy it to `_headers` in a separate hosting package if that host is selected. It is excluded from the strict GitHub Pages public-asset inventory, and no hosting change or account creation has been made. Update/fingerprint the full app shell if the hosted assets change. Verify response headers from the real HTTPS URL after deployment.

GitHub Pages currently documents a 100 GB/month soft asset-bandwidth limit and restrictions on commercial SaaS use. Public speed-test payloads bypass the hosting platform. Free plans and public endpoints do not provide an Orbit-controlled throughput SLA; see provider terms and scale gates in the readiness report.
