(() => {
  'use strict';
  if (window.self !== window.top) return;
  const $ = id => document.getElementById(id);
  const button = $('install-app');
  const dialog = $('install-dialog');
  const status = $('install-status');
  const updateButton = $('check-app-update');
  const display = window.matchMedia('(display-mode: standalone), (display-mode: minimal-ui)');
  let promptEvent = null, installed = false, registration = null, checking = false;
  const watched = new WeakSet();
  const inApp = () => installed || display.matches || navigator.standalone === true;
  function showMode() {
    $('install-label').textContent = inApp() ? 'App info' : 'Install app';
    $('app-mode').textContent = inApp() ? 'Installed app' : 'Browser tab';
  }
  const showConnection = () => { $('offline-notice').hidden = navigator.onLine !== false; };
  display.addEventListener?.('change', showMode);
  window.addEventListener('online', showConnection);
  window.addEventListener('offline', showConnection);
  $('close-install').addEventListener('click', () => dialog.close());
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); promptEvent = event; showMode();
  });
  window.addEventListener('appinstalled', () => {
    installed = true; promptEvent = null; showMode();
    $('install-feedback').hidden = false;
    $('install-feedback').textContent = 'Orbit is installed. Find it in your system’s app launcher.';
  });
  function openInfo() {
    $('install-help').open = !inApp();
    dialog.showModal();
  }
  button.addEventListener('click', async () => {
    if (inApp() || !promptEvent) { openInfo(); return; }
    const event = promptEvent; promptEvent = null; button.disabled = true;
    try {
      // The browser's installation prompt must be invoked from a user gesture.
      await event.prompt();
      const choice = await event.userChoice;
      $('install-feedback').hidden = false;
      $('install-feedback').textContent = choice.outcome === 'accepted'
        ? 'Installation accepted. Your browser will finish adding Orbit.'
        : 'Installation dismissed. You can try again from your browser’s menu.';
    } catch {
      $('install-feedback').hidden = false;
      $('install-feedback').textContent = 'Use your browser’s installation menu to add Orbit.';
      openInfo();
    } finally { button.disabled = false; showMode(); }
  });
  showMode(); showConnection();
  if (!('serviceWorker' in navigator) || !window.isSecureContext) {
    status.textContent = 'Offline support requires HTTPS or localhost and a browser that supports service workers.';
    updateButton.disabled = true;
    return;
  }
  function showWorkerState(checked = false) {
    if (!registration) return;
    $('app-update').hidden = !registration.waiting;
    if (registration.waiting) {
      status.textContent = 'Update downloaded. Finish your test, close all Orbit windows, then reopen to update.';
    } else if (registration.installing) {
      status.textContent = registration.active ? 'Downloading an app update…' : 'Saving the app for offline history…';
    } else if (registration.active?.state === 'activated') {
      status.textContent = checked ? 'App is up to date. Offline history is ready.' : 'Offline history is ready. Reopen Orbit to use the saved app when offline.';
    } else {
      status.textContent = 'Offline setup is not ready. Reconnect and choose Check for updates to retry.';
    }
    for (const worker of [registration.installing, registration.waiting, registration.active]) {
      if (!worker || watched.has(worker)) continue;
      watched.add(worker);
      worker.addEventListener('statechange', () => {
        if (worker.state === 'redundant') {
          status.textContent = registration.active
            ? 'The update could not finish. Your existing offline app is still available; retry when connected.'
            : 'Offline setup could not finish. Reconnect and choose Check for updates to retry.';
        } else { showWorkerState(); }
      });
    }
  }
  async function prepareOffline() {
    const workerURL = new URL('sw.js', document.baseURI).href;
    const policy = window.trustedTypes?.createPolicy('orbit-worker', {
      createScriptURL(value) {
        if (value !== workerURL) throw new TypeError('Unapproved service worker');
        return value;
      }
    });
    // Keep the single approved script URL for retries without creating another policy.
    const scriptURL = policy ? policy.createScriptURL(workerURL) : workerURL;
    async function registerWorker() {
      registration = await navigator.serviceWorker.register(scriptURL, {scope:'./', updateViaCache:'none'});
      registration.addEventListener('updatefound', () => showWorkerState());
      showWorkerState();
    }
    updateButton.addEventListener('click', async () => {
      if (checking) return;
      if (navigator.onLine === false) { status.textContent = 'Reconnect to check for updates. Saved history is still available.'; return; }
      if (document.body.classList.contains('running') || document.body.classList.contains('preparing')) {
        status.textContent = 'Finish the current test or server search before checking for an update.'; return;
      }
      checking = true; updateButton.disabled = true; status.textContent = 'Checking for an app update…';
      try {
        if (!registration || (!registration.active && !registration.installing && !registration.waiting)) await registerWorker();
        else await registration.update();
        showWorkerState(true);
      } catch {
        status.textContent = 'Could not check for updates. Reconnect and try again; saved history is unchanged.';
      } finally { checking = false; updateButton.disabled = false; }
    });
    try { await registerWorker(); }
    catch { status.textContent = 'Offline setup could not finish. Reconnect and choose Check for updates to retry.'; }
  }
  prepareOffline().catch(() => {
    status.textContent = 'Offline support could not start in this browser. The online app remains available.';
    updateButton.disabled = true;
  });
})();
