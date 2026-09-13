# Publish on GitHub Pages

This repository is ready for a public GitHub Pages project site. The workflow verifies the code before deploying only `dist`. No API keys or repository secrets are required.

1. Create an empty GitHub repository named `orbit-speed-test` (or another name). Public source works with GitHub Free; private-repository Pages availability depends on your plan.
2. Upload the contents of this folder, keeping `dist`, `scripts`, `tests`, and `.github` in place. Use `main` as the default branch.
3. In **Settings → Pages → Build and deployment**, choose **GitHub Actions**.
4. In **Actions**, run **Test and publish Orbit**, or push another change to `main`. Wait for both verification and deployment to finish.
5. Open the URL shown by the deployment. In Pages settings, keep **Enforce HTTPS** enabled. Location access requires HTTPS outside localhost.

After publishing, test server discovery from the deployed URL. A provider may accept localhost but block another browser origin. Disabled servers should remain unavailable; do not relax CORS or the allowlist to bypass that behavior.

The existing localhost history will not appear on the GitHub URL because browser storage is per origin. Export local history first if you want a backup.

## Updating

Edit the source, run `npm run cache:version`, `npm run check` and `npm test`, then push to `main`. The workflow publishes only if verification succeeds. Dependabot proposes updates to pinned GitHub Actions. Review code and endpoint changes before merging.

The manifest and worker use relative paths, so installation works at `/orbit-speed-test/` as well as localhost. Deploy the entire `dist` directory, including manifest, worker, icons and shell assets. The fingerprint check prevents publishing changed assets under an unchanged offline cache version.

Existing installations download a new shell in the background. They show an update notice, then activate it after every Orbit tab/app window is closed. Reopening a tab without closing the other Orbit windows may keep the previous version. No forced reload or mid-test activation occurs. A failed precache leaves the previous installation usable.

## Hosting limitations

The app includes a meta content policy and a framing guard. GitHub Pages does not expose a custom-response-header configuration for this project; see `SECURITY.md` for the remaining header and shared-origin limitations. Use a configurable proxy/custom domain if response-header anti-framing and permissions restrictions are mandatory.

Official instructions: [custom Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) and [HTTPS](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https).
