// Up & Down the River service worker.
// Network-first with a cache fallback: online you get the newest deploy, at a
// kitchen table with no signal you get the last version you loaded. The scores
// themselves are in localStorage and never depend on this at all.
//
// BUMP THE CACHE NAME whenever any shell file below changes, or devices keep
// serving the copy they already have and the fix never lands.

const CACHE = "river-v3";

const SHELL = [
  "./",
  "index.html",
  "manifest.json",
  "css/style.css",
  "lib/gk-base.css",
  "lib/gk-util.js",
  "lib/gk-audio.js",
  "lib/gk-ui.js",
  "lib/gk-pwa.js",
  "js/scoring.js",
  "js/game.js",
  "js/stats.js",
  "js/roast.js",
  "js/store.js",
  "js/main.js",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true }).then(
          (hit) => hit || (req.mode === "navigate" ? caches.match("index.html") : Response.error())
        )
      )
  );
});
