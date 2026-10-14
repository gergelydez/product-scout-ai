// Service worker minimal: face aplicația instalabilă și păstrează pagina principală pentru pornire offline.
const CACHE = "scout-v1";
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(["/", "/icon-192.png"]))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).pathname.startsWith("/api/")) return; // datele live merg mereu la server
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put("/", copy)); return res; }).catch(() => caches.match("/")));
  }
});
