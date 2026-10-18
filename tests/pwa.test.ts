import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { SW_CACHE_PREFIX, serviceWorkerSource } from '../src/pwa/service-worker';

// Service Worker（v0.5.1）を Node の vm で動かす。caches・fetch・self は最小の作り物（ブラウザの API と同じ形で使う部分だけ）
const ORIGIN = 'https://example.test';
const SCOPE = `${ORIGIN}/ww2-torpedo-boat/`;
const PRECACHE = ['assets/index-abc.js', 'icons/icon-192.png', 'index.html', 'manifest.webmanifest'];
const VERSION = 'claude/v0.5.1@abc1234 2026-10-17T00:00:00.000Z';
const CACHE = SW_CACHE_PREFIX + VERSION;

type Res = { ok: boolean; type: string; redirected?: boolean; url?: string; body: string; clone(): Res };
const res = (body: string, o: Partial<Res> = {}): Res => ({ ok: true, type: 'basic', body, clone() { return res(body, o); }, ...o });
type Req = { url: string; method: string; mode: string; cache?: string };

function swEnv(fetchImpl: (input: Req | string, init?: { cache?: string }) => Promise<Res>) {
  const listeners: Record<string, (e: unknown) => void> = {};
  const store = new Map<string, Map<string, Res>>();
  const precached: { url: string; cache: string }[] = [];
  const keyOf = (r: Req | string): string => (typeof r === 'string' ? r : r.url);
  const cacheOf = (name: string) => {
    let m = store.get(name);
    if (!m) store.set(name, (m = new Map()));
    const map = m;
    return {
      addAll: async (reqs: { url: string; cache: string }[]) => {
        for (const r of reqs) {
          precached.push({ url: r.url, cache: r.cache });
          map.set(r.url, res(`cached ${r.url}`));
        }
      },
      match: async (r: Req | string) => map.get(keyOf(r))?.clone(),
      put: async (r: Req | string, v: Res) => void map.set(keyOf(r), v),
    };
  };
  const caches = {
    open: async (name: string) => cacheOf(name),
    keys: async () => [...store.keys()],
    delete: async (name: string) => store.delete(name),
    match: async (url: string, o?: { cacheName?: string }) => (o?.cacheName ? store.get(o.cacheName)?.get(url)?.clone() : undefined),
  };
  const fetch = vi.fn(fetchImpl);
  const self = {
    registration: { scope: SCOPE },
    location: { origin: ORIGIN },
    addEventListener: (t: string, fn: (e: unknown) => void) => void (listeners[t] = fn),
    skipWaiting: vi.fn(async () => undefined),
    clients: { claim: vi.fn(async () => undefined) },
  };
  const Response = { redirect: (url: string, status: number) => ({ redirectTo: url, status }), error: () => ({ error: true }) };
  // new Request(url, { cache }) は url と cache だけ持てばよい
  class Request {
    constructor(
      readonly url: string,
      readonly init: { cache: string },
    ) {}
    get cache(): string {
      return this.init.cache;
    }
  }
  vm.runInNewContext(serviceWorkerSource(VERSION, PRECACHE), { self, caches, fetch, Request, Response, URL, Promise });
  const run = async (type: string, extra: Record<string, unknown> = {}): Promise<unknown> => {
    let waited: Promise<unknown> | undefined;
    let responded: Promise<unknown> | undefined;
    listeners[type]!({ ...extra, waitUntil: (p: Promise<unknown>) => void (waited = p), respondWith: (p: Promise<unknown>) => void (responded = p) });
    if (waited) await waited;
    return responded ? await responded : undefined;
  };
  const get = (url: string, mode = 'no-cors'): Req => ({ url, method: 'GET', mode });
  return { store, precached, fetch, self, run, get };
}

const offline = (): Promise<Res> => Promise.reject(new TypeError('offline'));

describe('Service Worker（v0.5.1。src/pwa/service-worker）', () => {
  it('install: 同じビルドのファイルをすべて HTTP キャッシュを通さず（reload）事前キャッシュし、すぐ有効に（skipWaiting）。キャッシュ名は版ごと', async () => {
    const e = swEnv(offline);
    await e.run('install');
    expect(e.precached).toEqual(PRECACHE.map((p) => ({ url: SCOPE + p, cache: 'reload' })));
    expect([...e.store.keys()]).toEqual([CACHE]);
    expect(e.self.skipWaiting).toHaveBeenCalledTimes(1);
  });
  it('activate: 古い版（同じ接頭辞）のキャッシュだけ消し、ほかのアプリのキャッシュは残す。開いている画面を引き取る（clients.claim）', async () => {
    const e = swEnv(offline);
    await e.run('install');
    e.store.set(`${SW_CACHE_PREFIX}old-build`, new Map());
    e.store.set('other-app', new Map());
    await e.run('activate');
    expect([...e.store.keys()].sort()).toEqual([CACHE, 'other-app'].sort());
    expect(e.self.clients.claim).toHaveBeenCalledTimes(1);
  });
  it('ページ（navigate）はネットワーク優先: HTTP キャッシュを通さず（no-cache）取り、キャッシュには入れない（index.html と JS の組がずれない）', async () => {
    const e = swEnv(async () => res('fresh page'));
    await e.run('install');
    const before = e.store.get(CACHE)!.get(`${SCOPE}index.html`)!.body;
    const r = (await e.run('fetch', { request: e.get(`${SCOPE}?debug`, 'navigate') })) as Res;
    expect(r.body).toBe('fresh page');
    expect(e.fetch).toHaveBeenCalledWith(`${SCOPE}?debug`, { cache: 'no-cache', credentials: 'same-origin' });
    expect(e.store.get(CACHE)!.get(`${SCOPE}index.html`)!.body).toBe(before);
  });
  it('ページ: オフラインなら事前キャッシュの index.html（クエリ付きの URL でも）。事前キャッシュも無ければエラー応答', async () => {
    const e = swEnv(offline);
    await e.run('install');
    const r = (await e.run('fetch', { request: e.get(`${SCOPE}?debug&seed=7`, 'navigate') })) as Res;
    expect(r.body).toBe(`cached ${SCOPE}index.html`);
    const empty = swEnv(offline);
    expect(await empty.run('fetch', { request: empty.get(SCOPE, 'navigate') })).toEqual({ error: true });
  });
  it('ページ: 転送された応答（末尾の / なし等）は返さず、転送先へ 302 で行き直させる（Safari は転送済みの応答をページとして受け付けない）', async () => {
    const e = swEnv(async () => res('page', { redirected: true, url: SCOPE }));
    expect(await e.run('fetch', { request: e.get(`${ORIGIN}/ww2-torpedo-boat`, 'navigate') })).toEqual({ redirectTo: SCOPE, status: 302 });
  });
  it('JS・アイコン等はキャッシュ優先: あればネットに出ない。無ければネットから取ってキャッシュに入れる（同じオリジンの成功した応答だけ）', async () => {
    const e = swEnv(async () => res('from network'));
    await e.run('install');
    const hit = (await e.run('fetch', { request: e.get(`${SCOPE}assets/index-abc.js`) })) as Res;
    expect(hit.body).toBe(`cached ${SCOPE}assets/index-abc.js`);
    expect(e.fetch).not.toHaveBeenCalled();
    const miss = (await e.run('fetch', { request: e.get(`${SCOPE}assets/index-new.js`) })) as Res;
    expect(miss.body).toBe('from network');
    expect(e.store.get(CACHE)!.get(`${SCOPE}assets/index-new.js`)!.body).toBe('from network');
    const failed = swEnv(async () => res('not found', { ok: false }));
    await failed.run('fetch', { request: failed.get(`${SCOPE}assets/x.js`) });
    expect(failed.store.get(CACHE)?.get(`${SCOPE}assets/x.js`)).toBeUndefined();
  });
  it('GET 以外とほかのオリジンには手を出さない（respondWith を呼ばない）', async () => {
    const e = swEnv(async () => res('x'));
    expect(await e.run('fetch', { request: { url: `${SCOPE}index.html`, method: 'POST', mode: 'navigate' } })).toBeUndefined();
    expect(await e.run('fetch', { request: e.get('https://cdn.example.com/x.js') })).toBeUndefined();
    expect(e.fetch).not.toHaveBeenCalled();
  });
});

/** PNG の幅と高さ（IHDR） */
function pngSize(path: string): [number, number] {
  const b = readFileSync(path);
  expect(b.subarray(1, 4).toString('ascii')).toBe('PNG');
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

describe('manifest とアイコン（v0.5.1。public/）', () => {
  it('manifest: 開始とスコープは置いた場所（/ww2-torpedo-boat/）、全画面（standalone）・横向き。アイコンは public にあり、書いた大きさの PNG', () => {
    const m = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf-8')) as { start_url: string; scope: string; display: string; orientation: string; short_name: string; icons: { src: string; sizes: string; purpose?: string }[] };
    expect([m.start_url, m.scope, m.display, m.orientation]).toEqual(['./', './', 'standalone', 'landscape']);
    expect(m.short_name.length).toBeLessThanOrEqual(13);
    expect(m.icons.some((i) => i.purpose === 'maskable')).toBe(true);
    for (const i of m.icons) {
      const [w, h] = i.sizes.split('x').map(Number);
      expect(pngSize(`public/${i.src}`), i.src).toEqual([w, h]);
    }
  });
  it('index.html: manifest と iOS 用アイコン（180×180）を読み、Service Worker の登録を main.ts と別に読む。ゲームの枠は JS が safe-area の内側に合わせる（v0.5.1 実機 1 回目）', () => {
    const html = readFileSync('index.html', 'utf-8');
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
    expect(html).toContain('<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />');
    expect(html).toContain('<script type="module" src="/src/pwa/register-sw.ts"></script>');
    expect(html).toMatch(/#game \{[^}]*position: fixed;/);
    expect(readFileSync('src/config/screen-fit.ts', 'utf-8')).toContain('env(safe-area-inset-left,0px)');
    expect(existsSync('public/icons/apple-touch-icon.png')).toBe(true);
    expect(pngSize('public/icons/apple-touch-icon.png')).toEqual([180, 180]);
  });
});
