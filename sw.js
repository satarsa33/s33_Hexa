/* S33 - Hexa: funziona anche offline. Dopo ogni aggiornamento cambia VERSIONE. */
const VERSIONE = "s33-hexa-1.0.1";
const FILES = ["./", "./index.html", "./manifest.webmanifest", "./icons/icon.svg", "./icons/icon-192.png", "./icons/icon-512.png",
  "./icons/icon-maskable-512.png", "./icons/apple-touch-icon.png", "./icons/favicon-32.png"];
/* all'installazione scarica sempre i file freschi, non dalla cache HTTP del browser */
self.addEventListener("install", e=>{ e.waitUntil(caches.open(VERSIONE).then(c=>c.addAll(FILES.map(f=>new Request(f, {cache:"reload"}))))); self.skipWaiting(); });
self.addEventListener("activate", e=>{ e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x.startsWith("s33-hexa") && x !== VERSIONE).map(x=>caches.delete(x))))); self.clients.claim(); });
self.addEventListener("fetch", e=>{
  if(e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  /* la pagina: prima dalla rete (così una nuova versione si vede subito), dalla cache solo offline */
  if(e.request.mode === "navigate" || /\/(index\.html)?$/.test(new URL(e.request.url).pathname)){
    e.respondWith(caches.open(VERSIONE).then(c=>fetch(e.request, {cache:"no-cache"}).then(r=>{ if(r && r.ok) c.put(e.request, r.clone()); return r; })
      .catch(()=>c.match(e.request).then(hit=>hit || c.match("./index.html")))));
    return;
  }
  /* il resto (icone, manifest): dalla cache subito, e intanto si aggiorna in background */
  e.respondWith(caches.open(VERSIONE).then(c=>c.match(e.request).then(hit=>{
    const net = fetch(e.request).then(r=>{ if(r && r.ok) c.put(e.request, r.clone()); return r; }).catch(()=>hit);
    return hit || net;
  })));
});
