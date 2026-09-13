(() => {
  'use strict';
  if (window.self !== window.top) return;
  const button = document.getElementById('install-app');
  const dialog = document.getElementById('install-dialog');
  const status = document.getElementById('install-status');
  const offline = document.getElementById('offline-notice');
  const display = window.matchMedia('(display-mode: standalone)');
  let promptEvent = null;
  let installed = false;
  const updateButton = () => { button.hidden = installed || display.matches || navigator.standalone === true; };
  const updateConnection = () => { offline.hidden = navigator.onLine !== false; };
  display.addEventListener?.('change', updateButton);
  window.addEventListener('online', updateConnection);
  window.addEventListener('offline', updateConnection);
  document.getElementById('close-install').addEventListener('click', () => dialog.close());
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); promptEvent = event; updateButton();
  });
  window.addEventListener('appinstalled', () => {
    installed = true; promptEvent = null; updateButton();
    status.textContent = 'Orbit is installed. Find it in your system’s app launcher.';
  });
  button.addEventListener('click', async () => {
    if (!promptEvent) { dialog.showModal(); return; }
    const event = promptEvent; promptEvent = null; button.disabled = true;
    try {
      // Must stay in this click handler: the browser requires a user gesture.
      await event.prompt();
      const choice = await event.userChoice;
      status.textContent = choice.outcome === 'accepted'
        ? 'Installation accepted. Your browser will finish adding Orbit.'
        : 'Installation dismissed. You can try again from your browser’s menu.';
    } catch {
      status.textContent = 'Use your browser’s installation menu to add Orbit.';
      dialog.showModal();
    } finally { button.disabled = false; updateButton(); }
  });
  updateButton(); updateConnection();

  if (!('serviceWorker' in navigator) || !window.isSecureContext) {
    status.textContent = 'Offline support requires HTTPS or localhost and a browser that supports service workers.';
    return;
  }
  async function prepareOffline() {
    try {
      const workerURL = new URL('sw.js', document.baseURI).href;
      // The only Trusted Types script URL this app permits is its own worker.
      const policy = window.trustedTypes?.createPolicy('orbit-worker', {
        createScriptURL(value) {
          if (value !== workerURL) throw new TypeError('Unapproved service worker');
          return value;
        }
      });
      const registration = await navigator.serviceWorker.register(
        policy ? policy.createScriptURL(workerURL) : workerURL,
        {scope:'./', updateViaCache:'none'}
      );
      const showUpdate = () => {
        if (registration.waiting) document.getElementById('app-update').hidden = false;
      };
      showUpdate();
      registration.addEventListener('updatefound', () => {
        registration.installing?.addEventListener('statechange', showUpdate);
      });
      await navigator.serviceWorker.ready;
      status.textContent = 'Offline history is ready. Reopen Orbit to use the saved app when offline.';
    } catch {
      status.textContent = 'Offline setup could not finish. Reopen Orbit online to retry; the speed test still works online.';
    }
  }
  prepareOffline();
})();
