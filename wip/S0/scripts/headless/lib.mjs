// ヘッドレスの道具の共通部分（v0.6.10 S5a で作り直した。v0.6.9 の scratchpad の道具はコンテナの作り直しで失われた）。ゲームは import しない（開発の道具だけ）。
// - serve(dir): ビルドした site（VITE_BASE=/ww2-torpedo-boat/ npm run build の出力）を http://127.0.0.1:<port>/ww2-torpedo-boat/ で配る。
// - openGame(browser, base, query, opts): ページを開き、requestAnimationFrame を止めて（Phaser の loop は回らない＝偽の時計）、window.__game が起動するまで待つ。
//   以後は page 側の __hl.frame(deltaMs) が game.headlessStep(time, delta) を 1 回呼ぶ（描画しない。描くのは __hl.render() の game.step(time, 0) だけ）。
//   ?debug は自動で付ける（window.__game の公開）。Service Worker は &nosw で入れない。
// - 起動の直後は delta 0 のフレームで Mission の world ができるまで進める（固定ステップを 1 つも回さない＝記録の前にステップが走らない）。
// 実行: 各道具の頭の注を見る（node scripts/headless/<tool>.mjs）。Playwright は入っている require('playwright') を使う。
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
export const { chromium } = require('playwright');

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
export const BASE_PATH = '/ww2-torpedo-boat/';
/** 1 フレームの ms（固定ステップ 1/60 秒と同じ） */
export const FRAME_MS = 1000 / 60;
/** iPhone 15（論理幅 1560）・iPhone SE（1280）の横向きの CSS px */
export const VIEWPORTS = { 1560: { width: 852, height: 393 }, 1280: { width: 667, height: 375 } };

/**
 * site を配る（戻りは base の URL と close）。opts.isolate は COOP・COEP の見出しを付ける（v0.6.11 S7 の evac-perf。crossOriginIsolated で performance.now が
 * 100 μs ではなく 5 μs 刻みになる。省けば今のまま）
 */
export async function serve(dir, opts = {}) {
  const iso = opts.isolate ? { 'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'require-corp' } : {};
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      let p = decodeURIComponent(url.pathname);
      if (!p.startsWith(BASE_PATH)) { res.writeHead(404); res.end(); return; }
      p = p.slice(BASE_PATH.length) || 'index.html';
      const file = normalize(join(dir, p));
      if (!file.startsWith(normalize(dir))) { res.writeHead(403); res.end(); return; }
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store', ...iso });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return { base: `http://127.0.0.1:${port}${BASE_PATH}`, close: () => new Promise((r) => server.close(r)) };
}

/** ページの中の道具（addInitScript で入れる）: rAF を止め、__hl に 1 フレーム進める口・描く口・世界と入力の読み口を置く */
function pageInit() {
  window.requestAnimationFrame = () => 0;
  window.cancelAnimationFrame = () => {};
  const hl = {
    t: 0,
    game() { return window.__game; },
    mission() { const g = window.__game; return g ? g.scene.getScene('Mission') : null; },
    world() { const m = hl.mission(); return m ? m.world : null; },
    active(key) { const g = window.__game; return g ? g.scene.isActive(key) : false; },
    frame(delta) { hl.t += delta; window.__game.headlessStep(hl.t, delta); },
    render() { window.__game.step(hl.t, 0); },
    /** 自艇の入力（スティックの代わり。stickActive でキーボードの上書きを止める） */
    steer(headingDeg, speed01) { const w = hl.world(); const i = w.input; i.stickActive = true; i.headingDeg = headingDeg; i.speed01 = speed01; },
    bearing(x0, y0, x1, y1) { return ((Math.atan2(x1 - x0, -(y1 - y0)) * 180) / Math.PI + 360) % 360; },
    /** HUD（と Result）の物: 文・大きさ・色・位置・原点・α・見えるか（type ごと） */
    objects(key) {
      const g = window.__game;
      const s = g.scene.getScene(key);
      if (!s || !g.scene.isActive(key)) return [];
      const out = [];
      for (const o of s.children.list) {
        const r = { type: o.type, x: o.x, y: o.y, ox: o.originX, oy: o.originY, a: o.alpha, v: o.visible, sx: o.scaleX, sy: o.scaleY, d: o.depth };
        if (o.type === 'Text') { r.text = o.text; r.size = o.style.fontSize; r.color = o.style.color; r.w = o.width; r.h = o.height; }
        else if (o.type === 'Image' || o.type === 'Sprite') { r.tex = o.texture ? o.texture.key : ''; r.tint = o.tintTopLeft; r.ang = o.angle; }
        out.push(r);
      }
      return out;
    },
    texts(key) { return hl.objects(key).filter((o) => o.type === 'Text').map((o) => o.text); },
    fnv(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0; return h; },
  };
  window.__hl = hl;
}

/**
 * ゲームを開く: query は ?debug の後ろ（例 'mission=jp_04&seed=3&hard'）。opts.width（論理幅 1560 か 1280）。戻りは { page, errors }。
 * v0.7.0 S0（tex-ab）: opts.viewport（CSS px の { width, height }。VIEWPORTS の代わり。例 1560×720 dpr 2＝RENDER_SCALE 2）・opts.init（pageInit の後に入れる init script の関数）
 */
export async function openGame(browser, base, query, opts = {}) {
  const vp = opts.viewport ?? VIEWPORTS[opts.width ?? 1560];
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: opts.dpr ?? 1, hasTouch: true, isMobile: false });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message ? e.message : e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  await page.addInitScript(pageInit);
  if (opts.init) await page.addInitScript(opts.init);
  await page.goto(`${base}?debug&nosw${query ? `&${query}` : ''}`);
  await page.waitForFunction(() => window.__game && window.__game.isBooted, null, { timeout: 60000 });
  // delta 0 のフレームで Boot → Mission（と Hud）まで（固定ステップは回らない）
  await page.evaluate(() => {
    for (let i = 0; i < 50 && !(window.__hl.world() && window.__hl.active('Hud')); i++) window.__hl.frame(0);
    if (!window.__hl.world()) throw new Error('Mission の world ができない');
  });
  return { page, ctx, errors };
}

/** FNV-1a 32 ビット（フレームの写しの文字列の指紋） */
export function fnv(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

/** 環境変数の数（無ければ既定） */
export function envNum(k, d) {
  const v = process.env[k];
  return v === undefined || v === '' ? d : Number(v);
}

/** 並べて回す（同時に k 本まで） */
export async function pool(items, k, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(k, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}
