// Update this fingerprint with npm run cache:version after changing app assets.
const CACHE_VERSION = 'f7ac727734ad3d330aa3';
const SHELL_FILES = [
  "index.html", "styles.css", "security.js", "core.js", "app.js", "pwa.js",
  "servers.json", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png",
  "rocket.png", "higheriyer.png"
];
const ROOT = new URL('./', self.location.href);
const CACHE_PREFIX = `orbit-shell:${ROOT.pathname}:`;
const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;
const SHELL_URLS = new Set(SHELL_FILES.map(file => new URL(file, ROOT).href));

self.addEventListener('install', event => {
  // addAll is atomic. An incomplete download cannot replace the working shell.
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(
    [...SHELL_URLS].map(url => new Request(url, {cache:'reload', credentials:'omit', redirect:'error'}))
  )));
  // Normal lifecycle: updates wait until all Orbit windows are closed.
  // Never force a reload or replace a worker during a measurement.
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(names => Promise.all(
    names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map(name => caches.delete(name))
  )));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  // Do not intercept speed traffic, ISP lookups, remote catalogs, uploads or other apps.
  if (request.method !== 'GET' || url.origin !== ROOT.origin) return;
  url.search = ''; url.hash = '';
  if (url.href === ROOT.href) url.pathname += 'index.html';
  if (!SHELL_URLS.has(url.href)) return;
  event.respondWith(caches.open(CACHE_NAME).then(async cache =>
    (await cache.match(url.href)) || fetch(request)
  ));
});
