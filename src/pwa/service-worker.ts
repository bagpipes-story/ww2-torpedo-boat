// Service Worker の中身（v0.5.1。PWA）: ビルドごとの版と事前キャッシュの一覧を埋め込んだ sw.js の文字列を作る（vite.config.ts のプラグインが dist に書く）。
// 方針（CLAUDE.md §3: 実機は Pages の最新ビルドで確かめる → 古いキャッシュで迷わない。docs/04 §4）:
// - ページ本体（navigate）はネットワーク優先。HTTP キャッシュ（Pages は 10 分）も通さず取りに行き、取れないとき（オフライン）だけ事前キャッシュの index.html。
//   ネットから取ったページはキャッシュに入れない（キャッシュの index.html と JS は必ず同じビルドの組にする。組がずれるとオフラインで真っ白になる）
// - それ以外の同じオリジンの GET（名前にハッシュの付いた JS・アイコン・manifest）はキャッシュ優先。無ければネットから取って入れる
// - install で同じビルドのファイルをすべて事前キャッシュ（HTTP キャッシュを通さない）→ すぐ有効に（skipWaiting）。activate で古い版のキャッシュを消し、開いている画面を引き取る
// Phaser 非依存・DOM 非依存（テストは Node の vm で動かす。tests/pwa.test.ts）。

/** キャッシュ名の接頭辞（これで始まり今の版でないキャッシュは activate で消す） */
export const SW_CACHE_PREFIX = 'night-hunters-';

/** version はビルド番号と時刻（ビルドごとに sw.js の中身が変わり、更新として拾われる）。precache は出力ディレクトリからの相対パス（sw.js 自身は含めない） */
export function serviceWorkerSource(version: string, precache: readonly string[]): string {
  return `// 自動生成（vite.config.ts の serviceWorker プラグイン）。中身は src/pwa/service-worker.ts
'use strict';
const PREFIX = ${JSON.stringify(SW_CACHE_PREFIX)};
const CACHE = PREFIX + ${JSON.stringify(version)};
const PRECACHE = ${JSON.stringify(precache)};
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
`;
}
