// 自動生成（vite.config.ts の serviceWorker プラグイン）。中身は src/pwa/service-worker.ts
'use strict';
const PREFIX = "night-hunters-";
const CACHE = PREFIX + "main@e9d80ea 2026-11-16T19:10:28.981Z";
const PRECACHE = ["assets/index-rpMFEaA8.js","icons/apple-touch-icon.png","icons/icon-192.png","icons/icon-512.png","icons/icon-maskable-512.png","index.html","manifest.webmanifest"];
const SCOPE = self.registration.scope;
const INDEX = new URL('index.html', SCOPE).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((p) => new Request(new URL(p, SCOPE).href, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function page(request) {
  try {
    const res = await fetch(request.url, { cache: 'no-cache', credentials: 'same-origin' });
    // 転送された応答はそのまま返さず、転送先へ行き直させる（Safari は転送済みの応答をページとして受け付けない）
    return res.redirected ? Response.redirect(res.url, 302) : res;
  } catch (e) {
    const hit = await caches.match(INDEX, { cacheName: CACHE });
    return hit || Response.error();
  }
}

async function asset(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok && res.type === 'basic') await cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(request.mode === 'navigate' ? page(request) : asset(request));
});
