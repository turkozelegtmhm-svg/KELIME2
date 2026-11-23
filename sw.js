/* YÖKDİL Sosyal Kelime: çevrimdışı önbellek ve hatırlatma bildirimi */
const VER = "202611232102";
const CACHE = 'yk-' + VER;
const PRECACHE = ["./fonts/fonts.css","./fonts/ibm-plex-mono-latin-400-normal.woff2","./fonts/ibm-plex-mono-latin-500-normal.woff2","./fonts/ibm-plex-mono-latin-ext-400-normal.woff2","./fonts/ibm-plex-mono-latin-ext-500-normal.woff2","./fonts/ibm-plex-sans-latin-400-normal.woff2","./fonts/ibm-plex-sans-latin-500-normal.woff2","./fonts/ibm-plex-sans-latin-600-normal.woff2","./fonts/ibm-plex-sans-latin-ext-400-normal.woff2","./fonts/ibm-plex-sans-latin-ext-500-normal.woff2","./fonts/ibm-plex-sans-latin-ext-600-normal.woff2","./fonts/source-serif-4-latin-400-normal.woff2","./fonts/source-serif-4-latin-600-normal.woff2","./fonts/source-serif-4-latin-ext-400-normal.woff2","./fonts/source-serif-4-latin-ext-600-normal.woff2","./icons/apple-touch-icon.png","./icons/badge-96.png","./icons/icon-192.png","./icons/icon-512.png","./icons/icon-maskable-512.png","./","./manifest.webmanifest","./index.html"];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('yk-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Önce önbellek (internetsiz açılır), yoksa ağ; ağdan gelen yeni dosyalar önbelleğe eklenir.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      if (req.mode === 'navigate') { const idx = await cache.match('./index.html'); if (idx) return idx; }
      return new Response('Çevrimdışı', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});

/* Hatırlatma: uygulama arka plan senkronu (Chrome, kurulu uygulama) ile uyanırsa saati kontrol eder */
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('yk-kv', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
const kvGet = (k) => idb().then((db) => new Promise((res) => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(null); }));
const kvSet = (k, v) => idb().then((db) => new Promise((res) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = res; tx.onerror = res; }));

async function remind() {
  const d = await kvGet('remind');
  if (!d || !d.on || !d.times || !d.times.length || !(d.due > 0)) return;
  const now = new Date(), t = now.getTime();
  let latest = 0;
  for (const x of d.times) { const s = new Date(); const p = x.split(':'); s.setHours(+p[0], +p[1], 0, 0); if (s.getTime() <= t && s.getTime() > latest) latest = s.getTime(); }
  if (!latest || (d.last || 0) >= latest || t - latest > 6 * 3600000) return;
  const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (open.some((c) => c.visibilityState === 'visible')) return;
  d.last = latest; await kvSet('remind', d);
  await self.registration.showNotification('Kelime tekrarı zamanı', {
    body: d.due + ' kelime seni bekliyor. Hızlı tekrar için dokun.', icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', tag: 'yk-remind',
    data: { url: './#hatirlat' }, actions: [{ action: 'go', title: 'Başla' }, { action: 'later', title: 'Sonra' }]
  });
}
self.addEventListener('periodicsync', (e) => { if (e.tag === 'yk-remind') e.waitUntil(remind()); });

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  if (e.action === 'later') return;
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of list) { try { await c.focus(); c.postMessage({ type: 'go', hash: '#hatirlat' }); return; } catch (err) {} }
    await self.clients.openWindow('./#hatirlat');
  })());
});
