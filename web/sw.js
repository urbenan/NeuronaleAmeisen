// Service Worker: alle Dateien beim ersten Besuch speichern, danach offline aus dem Cache
const CACHE = "ameisen-1f1d8e7243";
const FILES = ["./", "index.html", "viewer.html", "manifest.webmanifest", "manifest-viewer.webmanifest", "icon-180.png", "icon-512.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", (e) => {
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((r) => r || fetch(e.request)));
});
