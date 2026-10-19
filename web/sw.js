// Service Worker: Offline-Betrieb ("Zum Home-Bildschirm").
// Seiten (HTML) zuerst aus dem Netz – so kommt jede neue Version sofort an –, ohne Netz aus dem Cache.
// Übrige Dateien (Icons, Manifeste) aus dem Cache. Beim Installieren alles frisch vom Server holen
// (cache: "reload"), sonst landet eine noch im Browser zwischengespeicherte alte Version im neuen Cache.
const CACHE = "ameisen-986f8d83dc";
const FILES = ["./", "index.html", "viewer.html", "manifest.webmanifest", "manifest-viewer.webmanifest", "icon-180.png", "icon-512.png"];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: "reload" })))));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const isPage = req.mode === "navigate" || req.url.endsWith(".html") || req.url.endsWith("/");
  if (isPage) {
    e.respondWith(fetch(req, { cache: "no-store" }).then((r) => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return r;
    }).catch(() => caches.match(req, { ignoreSearch: true })));
  } else {
    e.respondWith(caches.match(req, { ignoreSearch: true }).then((r) => r || fetch(req)));
  }
});
