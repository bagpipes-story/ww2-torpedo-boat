// テクスチャの A/B（v0.7.0 S0。spec-v0700 §7.2・D1・R21・R28）: ビルド A（基準 main f5563ab）と B（今の木）で全任務を開き、game.textures の鍵ごとの幅・高さ、
// GPU（幅×高さ×4 B）と CPU の canvas（generateTexture・createCanvas の絵）の MB、Mission の Image・Sprite の鍵ごとの原点、Boot の create の壁時計を比べる。
// - 既存の鍵（A にある鍵）の幅・高さが B で同じ＝門（違えば ✗）。A にあって B に無い鍵も ✗。B だけの鍵は「新しい鍵」として並べる。
// - TileSprite・Text の UUID の形の鍵と、__ で始まる Phaser の鍵は除く（R21）。tex-aircraft-enemy は S2b から任務ごとに描き直すので任務ごとに読む（鍵×任務で比べる）。
// - k 1.09（W 1560 の横持ち 852×393 CSS・dpr 2）と k 2（1560×720 CSS・dpr 2＝iPad・PC の大画面）。MB の差の門は k 1.09 で ≤ +24 MB（IP1a の U3 の予算。S0〜S4 は +12。k 2 は報告）。
//   tex-debug-ring（?debug だけ。4.6 MB）は合計から外して別に出す。jp_03 の岩の絵（初めて使う時に 1 回）は jp_03 の行に入る。
// - Boot の create の壁時計（SceneManager.create を init script で包む）: 任務ごとの中央値を A/B で（+200 ms 以内を目安・報告。R28）。
// CHECK=1（spec §3.5 の tex-check）: 描き直す鍵の canvas の画素から、覆い（α ≥ 0.5 の画素）・平均の明るさ（α で重みを付けた luma）・平均の色の色相と彩度・夜の海 #0b1020 と
//   昼の海 #3b5670 との明るさの比（WCAG）・tint を掛けた版の比（僚艇と隼艇 ESCORT_TINT・jp_03 の隠れた艇 EVAC_HIDDEN_TINT α 0.45・去った米PT・座礁の大発）・
//   艦の幅（長さの 20〜85% で ≥ 0.92 × 幅）と艦首の 0 行目・艦尾の 98%（R22）・魚雷の黄の面積・煙幕の半径の帯の α（R32）・星弾の 92% の内の α・探照灯の先端の行と扇の内の α（R2）・
//   機の翼幅（≥ 箱の 0.8）。A（placeholder）と比べる門と、色の意味の絶対の門。B だけの鍵（例 tex-destroyer-us）は A の対の鍵（PAIR）と比べる。
// 実行: A=<site A> B=<site B> [MISSIONS=us_01,...] [K2=0] [CHECK=1] [JOBS=3] [OUT=<json>] node scripts/headless/tex-ab.mjs
import { writeFileSync } from 'node:fs';
import { chromium, envNum, openGame, pool, serve } from './lib.mjs';

const MISSIONS = (process.env.MISSIONS ?? 'us_01,us_02,us_03,jp_01,jp_02,jp_03,jp_04,jp_05,jp_06').split(',');
const SCALES = [{ name: 'k1.09', width: 1560 }, ...(process.env.K2 === '0' ? [] : [{ name: 'k2', viewport: { width: 1560, height: 720 } }])];
const CHECK = process.env.CHECK === '1';
const MB = 1048576;
const SEA_NIGHT = 0x0b1020;
const SEA_DAY = 0x3b5670;
// ui-config・evac-config・pt-config・hunt-config の tint（値は src。ここは比べる道具の写し）
const ESCORT_TINT = 0x9ad0ff;
const EVAC_HIDDEN_TINT = 0x8796a8;
const EVAC_HIDDEN_ALPHA = 0.45;
const PT_RETIRED_TINT = 0x8a8a8a;
const BARGE_BEACHED_TINT = 0x8a8a8a;
/** 鍵ごとの検査: side＝色の系統（player 彩度 < 0.12・enemy 色相 330〜20°・ally 190〜220°・torpedo 黄）、tints＝掛けて比べる tint（[名前, 色, α, 海]）、ship＝艦の形 */
const SPEC = {
  'tex-boat-us_elco80': { side: 'player' },
  'tex-boat-us_elco77': { side: 'player', tints: [['escort', ESCORT_TINT, 1, SEA_NIGHT]] },
  'tex-boat-jp_t38': { side: 'player', day: true, tints: [['evac-hidden', EVAC_HIDDEN_TINT, EVAC_HIDDEN_ALPHA, SEA_DAY]] },
  'tex-boat-jp_t14': { side: 'player' },
  'tex-boat-jp_h38_hayabusa': { side: 'player', tints: [['escort', ESCORT_TINT, 1, SEA_NIGHT]] },
  'tex-destroyer': { side: 'enemy', ship: true },
  'tex-destroyer-us': { side: 'enemy', ship: true, pair: 'tex-destroyer' },
  'tex-transport': { side: 'enemy', ship: true },
  'tex-transport-friendly': { side: 'ally', ship: true },
  'tex-destroyer-friendly': { side: 'ally', ship: true },
  'tex-barge': { side: 'enemy', tints: [['beached', BARGE_BEACHED_TINT, 1, SEA_NIGHT]] },
  'tex-barge-friendly': { side: 'ally' },
  'tex-pt-boat': { side: 'enemy', tints: [['retired', PT_RETIRED_TINT, 1, SEA_NIGHT]] },
  'tex-aircraft': { side: 'ally', plane: true },
  'tex-aircraft-enemy': { side: 'enemy', plane: true, day: true },
  'tex-torpedo': { side: 'torpedo' },
  'tex-smoke-puff': { kind: 'smoke' },
  'tex-starshell': { kind: 'starshell' },
  'tex-searchlight': { kind: 'searchlight' },
};

/** init script: Boot・Mission の create の壁時計（SceneManager.create を game ができた時に包む） */
function bootTimer() {
  Object.defineProperty(window, '__game', {
    configurable: true,
    set(g) {
      const sm = g.scene;
      const orig = sm.create;
      sm.create = function (scene) {
        const t = performance.now();
        const r = orig.call(this, scene);
        (window.__createMs ||= {})[scene.sys.settings.key] = performance.now() - t;
        return r;
      };
      Object.defineProperty(window, '__game', { value: g, writable: true, configurable: true });
    },
  });
}

/** ページの中: テクスチャの一覧と原点、CHECK なら鍵ごとの画素の数 */
function collect(o) {
  const g = window.__game;
  const hl = window.__hl;
  for (let i = 0; i < 5; i++) hl.render();
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/;
  const lin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const relLum = (r, gg, b) => 0.2126 * lin(r) + 0.7152 * lin(gg) + 0.0722 * lin(b);
  const hsv = (r, gg, b) => {
    const mx = Math.max(r, gg, b); const mn = Math.min(r, gg, b); const d = mx - mn;
    let h = 0;
    if (d > 0) h = mx === r ? ((gg - b) / d) % 6 : mx === gg ? (b - r) / d + 2 : (r - gg) / d + 4;
    return { h: (h * 60 + 360) % 360, s: mx === 0 ? 0 : d / mx };
  };
  const metrics = (img, spec) => {
    const w = img.width; const h = img.height;
    const d = img.getContext('2d').getImageData(0, 0, w, h).data;
    let opaque = 0; let aSum = 0; let rS = 0; let gS = 0; let bS = 0; let lumaS = 0; let yellow = 0;
    const rowOpaque = new Array(h).fill(0);
    const rowAny = new Array(h).fill(0);
    const cx = w / 2; const cy = h / 2; const R = Math.min(w, h) / 2;
    const band = [[0, 0], [0, 0], [0, 0]]; // 半径の帯 0〜0.4・0.4〜0.7・0.7〜1.0 の α の和と数
    let in92 = 0; let in92n = 0; let cone = 0; let conen = 0; let tip = 0; let tipn = 0;
    const halfW = w / 2 - 1; // 探照灯: placeholder の幅＝ceil(2·halfW)+2
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const a = d[i + 3] / 255;
        if (a > 0) rowAny[y]++;
        if (a >= 0.5) { opaque++; rowOpaque[y]++; const c = hsv(d[i], d[i + 1], d[i + 2]); if (c.h >= 38 && c.h <= 62 && c.s >= 0.35) yellow++; }
        aSum += a; rS += d[i] * a; gS += d[i + 1] * a; bS += d[i + 2] * a; lumaS += ((0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255) * a;
        const rr = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / R;
        if (rr < 1) band[rr < 0.4 ? 0 : rr < 0.7 ? 1 : 2][0] += a, band[rr < 0.4 ? 0 : rr < 0.7 ? 1 : 2][1]++;
        if (rr < 0.92) { in92 += a; in92n++; }
        if (spec.kind === 'searchlight') {
          const inside = Math.abs(x + 0.5 - cx) <= (halfW * (h - (y + 0.5))) / h;
          if (inside) { cone += a; conen++; if (y === 0) { tip += a; tipn++; } }
        }
      }
    }
    const mean = aSum > 0 ? [rS / aSum, gS / aSum, bS / aSum] : [0, 0, 0];
    const c = hsv(mean[0], mean[1], mean[2]);
    const lumOf = (rgb) => relLum(rgb[0], rgb[1], rgb[2]);
    const ratio = (l1, l2) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const seaL = (s) => relLum((s >> 16) & 255, (s >> 8) & 255, s & 255);
    const tints = {};
    for (const [name, tint, alpha, sea] of spec.tints ?? []) {
      const t = [(tint >> 16) & 255, (tint >> 8) & 255, tint & 255];
      const s = [(sea >> 16) & 255, (sea >> 8) & 255, sea & 255];
      const col = mean.map((v, j) => ((v * t[j]) / 255) * alpha + s[j] * (1 - alpha));
      tints[name] = ratio(lumOf(col), seaL(sea));
    }
    let first = -1; let last = -1;
    for (let y = 0; y < h; y++) if (rowAny[y] > 0) { if (first < 0) first = y; last = y; }
    let minMid = Infinity;
    for (let y = Math.floor(h * 0.2); y <= Math.floor(h * 0.85); y++) minMid = Math.min(minMid, rowOpaque[y]);
    return {
      w, h, opaque, luma: aSum > 0 ? lumaS / aSum : 0, hue: c.h, sat: c.s, night: ratio(lumOf(mean), seaL(0x0b1020)), day: ratio(lumOf(mean), seaL(0x3b5670)), tints,
      firstRow: first, lastRowShare: (last + 1) / h, midMinShare: minMid / w, spanShare: Math.max(...rowOpaque) / w, yellowShare: opaque > 0 ? yellow / opaque : 0,
      bands: band.map(([s, n]) => (n > 0 ? s / n : 0)), in92: in92n > 0 ? in92 / in92n : 0, cone: conen > 0 ? cone / conen : 0, tip: tipn > 0 ? tip / tipn : 0,
    };
  };
  const tex = {};
  for (const key of g.textures.getTextureKeys()) {
    if (key.startsWith('__') || uuid.test(key)) continue;
    const src = g.textures.get(key).source[0];
    const img = src.image;
    const isCanvas = typeof HTMLCanvasElement !== 'undefined' && img instanceof HTMLCanvasElement;
    tex[key] = { w: src.width, h: src.height, canvas: isCanvas };
    if (o.check && isCanvas && o.spec[key]) tex[key].m = metrics(img, o.spec[key]);
  }
  const origins = {};
  for (const ch of hl.mission().children.list) {
    if ((ch.type !== 'Image' && ch.type !== 'Sprite') || !ch.texture) continue;
    if (uuid.test(ch.texture.key)) continue;
    (origins[ch.texture.key] ||= new Set()).add(`${ch.originX},${ch.originY}`);
  }
  return {
    tex,
    origins: Object.fromEntries(Object.entries(origins).map(([k, v]) => [k, [...v].sort()])),
    createMs: window.__createMs ?? {},
    k: g.scene.getScene('Hud').cameras.main.zoom,
  };
}

async function oneSide(browser, base, mission, sc) {
  const { page, ctx, errors } = await openGame(browser, base, `mission=${mission}&seed=1`, { width: sc.width, viewport: sc.viewport, dpr: 2, init: bootTimer });
  try {
    const r = await page.evaluate(collect, { check: CHECK && sc.name === 'k1.09', spec: SPEC });
    return { ...r, errors };
  } finally {
    await ctx.close();
  }
}

const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '—');
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
/** 鍵ごとの検査の門（B の数を A＝placeholder の数と比べる。B だけの鍵は A の対の鍵と） */
function checkKey(key, a, b) {
  const sp = SPEC[key];
  const out = [];
  const ok = (cond, msg) => out.push(`${cond ? '✓' : '✗'} ${msg}`);
  ok(b.opaque >= a.opaque * 0.85, `覆い ${b.opaque}/${a.opaque} px（≥ 85%）`);
  if (sp.kind === undefined) ok(b.luma >= a.luma * 0.9 && b.luma <= a.luma * 1.15, `明るさ ${f2(b.luma)}／${f2(a.luma)}（−10%〜+15%）`);
  if (sp.side === 'player') ok(b.sat < 0.12, `彩度 ${f2(b.sat)}（< 0.12）`);
  if (sp.side === 'enemy') ok(b.hue >= 330 || b.hue <= 20, `色相 ${b.hue.toFixed(0)}°（330〜20）`);
  if (sp.side === 'ally') ok(b.hue >= 190 && b.hue <= 220, `色相 ${b.hue.toFixed(0)}°（190〜220）`);
  if (sp.side) ok(b.night >= 4.5 || b.night >= a.night, `夜の海との比 ${f2(b.night)}（≥ 4.5 か A 以上）`);
  if (sp.day) ok(b.day >= 3 || b.day >= a.day, `昼の海との比 ${f2(b.day)}（≥ 3 か A ${f2(a.day)} 以上。placeholder の敵の赤は 2.97）`);
  for (const [name] of sp.tints ?? []) ok(b.tints[name] >= a.tints[name] * 0.85, `${name} の tint の比 ${f2(b.tints[name])}／${f2(a.tints[name])}（≥ 0.85 倍）`);
  if (sp.ship) {
    ok(b.midMinShare >= 0.92 || b.midMinShare >= a.midMinShare, `長さの 20〜85% の最小の幅 ${f2(b.midMinShare)}（≥ 0.92 か A ${f2(a.midMinShare)} 以上）`);
    ok(b.firstRow <= Math.max(0, a.firstRow), `艦首の先の行 ${b.firstRow}（A ${a.firstRow}）`);
    ok(b.lastRowShare >= 0.98, `艦尾 ${f2(b.lastRowShare)}（≥ 0.98）`);
  }
  if (sp.plane) ok(b.spanShare >= 0.8, `翼幅 ${f2(b.spanShare)}（≥ 0.8）`);
  if (sp.side === 'torpedo') { ok(b.yellowShare >= 0.85, `黄の面積 ${f2(b.yellowShare)}（≥ 0.85）`); ok(b.luma >= a.luma * 0.95, `明るさ ${f2(b.luma)}／${f2(a.luma)}（≥ 0.95 倍）`); }
  if (sp.kind === 'smoke') ok(b.bands.every((v, i) => Math.abs(v - a.bands[i]) <= a.bands[i] * 0.1), `帯の α ${b.bands.map(f2).join('・')}／${a.bands.map(f2).join('・')}（±10%）`);
  if (sp.kind === 'starshell') ok(b.in92 >= 0.6, `半径 92% の内の α ${f2(b.in92)}（≥ 0.6）`);
  if (sp.kind === 'searchlight') { ok(b.tip >= 0.6, `先端の行の α ${f2(b.tip)}（≥ 0.6）`); ok(b.cone >= 0.85, `扇の内の α ${f2(b.cone)}（≥ 0.85）`); }
  return out;
}

async function main() {
  if (!process.env.A || !process.env.B) throw new Error('A=<基準の site> B=<今の site> が要る');
  const sa = await serve(process.env.A);
  const sb = await serve(process.env.B);
  const browser = await chromium.launch();
  const jobs = [];
  for (const sc of SCALES) for (const m of MISSIONS) jobs.push({ sc, m });
  const res = await pool(jobs, envNum('JOBS', 3), async (j) => ({ ...j, a: await oneSide(browser, sa.base, j.m, j.sc), b: await oneSide(browser, sb.base, j.m, j.sc) }));
  await browser.close();
  await sa.close();
  await sb.close();
  let bad = 0;
  const report = {};
  for (const sc of SCALES) {
    const rows = res.filter((r) => r.sc.name === sc.name);
    const dimsBad = [];
    const missing = [];
    const added = new Set();
    const originBad = [];
    const mb = { a: { gpu: [], cpu: [] }, b: { gpu: [], cpu: [] } };
    let errs = 0;
    for (const r of rows) {
      errs += r.a.errors.length + r.b.errors.length;
      for (const [key, ta] of Object.entries(r.a.tex)) {
        const tb = r.b.tex[key];
        if (!tb) missing.push(`${key}@${r.m}`);
        else if (ta.w !== tb.w || ta.h !== tb.h) dimsBad.push(`${key}@${r.m} ${ta.w}x${ta.h} → ${tb.w}x${tb.h}`);
      }
      for (const key of Object.keys(r.b.tex)) if (!r.a.tex[key]) added.add(`${key} ${r.b.tex[key].w}x${r.b.tex[key].h}`);
      for (const [key, oa] of Object.entries(r.a.origins)) if (r.b.origins[key] && JSON.stringify(oa) !== JSON.stringify(r.b.origins[key])) originBad.push(`${key}@${r.m} ${oa} → ${r.b.origins[key]}`);
      for (const side of ['a', 'b']) {
        let gpu = 0;
        let cpu = 0;
        for (const [key, t] of Object.entries(r[side].tex)) { if (key === 'tex-debug-ring') continue; gpu += t.w * t.h * 4; if (t.canvas) cpu += t.w * t.h * 4; }
        mb[side].gpu.push(gpu / MB);
        mb[side].cpu.push(cpu / MB);
      }
    }
    const k = rows[0]?.b.k;
    console.log(`== ${sc.name}（Hud のカメラのズーム＝RENDER_SCALE ${f2(k)}・${rows.length} 任務）`);
    console.log(`  既存の鍵の寸法: ${dimsBad.length === 0 ? '✓ すべて同じ' : `✗ ${dimsBad.length} 件: ${dimsBad.join(' / ')}`}`);
    console.log(`  B に無い鍵: ${missing.length === 0 ? '✓ なし' : `✗ ${missing.join(' / ')}`}`);
    console.log(`  新しい鍵（B だけ）: ${added.size === 0 ? 'なし' : [...added].sort().join(' / ')}`);
    console.log(`  Mission の絵の原点: ${originBad.length === 0 ? '✓ 鍵ごとに同じ' : `✗ ${originBad.join(' / ')}`}`);
    const gate = 24; // v0.7.0 IP1a: U3（「もっと派手な演出、数でも大丈夫」）で lead が GPU ≤ +24 MB に（S0〜S4 は k 1.09 で ≤ +12・k 2 は報告だけ）
    const dGpu = Math.max(...rows.map((_, i) => mb.b.gpu[i] - mb.a.gpu[i]));
    const dCpu = Math.max(...rows.map((_, i) => mb.b.cpu[i] - mb.a.cpu[i]));
    for (let i = 0; i < rows.length; i++) console.log(`    ${rows[i].m}: GPU ${f2(mb.a.gpu[i])} → ${f2(mb.b.gpu[i])} MB・CPU の canvas ${f2(mb.a.cpu[i])} → ${f2(mb.b.cpu[i])} MB（tex-debug-ring を除く）・Boot の create ${f2(rows[i].a.createMs.Boot)} → ${f2(rows[i].b.createMs.Boot)} ms・Mission の create ${f2(rows[i].a.createMs.Mission)} → ${f2(rows[i].b.createMs.Mission)} ms`);
    const bootA = med(rows.map((r) => r.a.createMs.Boot));
    const bootB = med(rows.map((r) => r.b.createMs.Boot));
    console.log(`  GPU の差の最大 ${f2(dGpu)} MB（≤ +${gate} ${dGpu <= gate ? '✓' : '✗'}）・CPU の canvas の差の最大 ${f2(dCpu)} MB・Boot の create の中央値 ${f2(bootA)} → ${f2(bootB)} ms（差 ${f2(bootB - bootA)}。+200 以内が目安）・page errors ${errs}`);
    if (dimsBad.length || missing.length || originBad.length || errs || (sc.name === 'k1.09' && dGpu > gate)) bad++;
    report[sc.name] = { dimsBad, missing, added: [...added], originBad, mb, bootA, bootB, errs };
  }
  if (CHECK) {
    console.log('== tex-check（k 1.09。spec §3.5）');
    const keys = new Set();
    for (const r of res) if (r.sc.name === 'k1.09') for (const [key, t] of Object.entries(r.b.tex)) if (t.m) keys.add(key);
    for (const key of [...keys].sort()) {
      const per = key === 'tex-aircraft-enemy' ? res.filter((r) => r.sc.name === 'k1.09') : [res.find((r) => r.sc.name === 'k1.09')];
      for (const r of per) {
        const b = r.b.tex[key]?.m;
        const a = r.a.tex[SPEC[key].pair ?? key]?.m;
        if (!a || !b) continue;
        const lines = checkKey(key, a, b);
        if (lines.some((l) => l.startsWith('✗'))) bad++;
        console.log(`  ${key}${per.length > 1 ? `@${r.m}` : ''}: ${lines.join('・')}`);
      }
    }
    report.check = Object.fromEntries(res.filter((r) => r.sc.name === 'k1.09').map((r) => [r.m, { a: Object.fromEntries(Object.entries(r.a.tex).filter(([, t]) => t.m).map(([k2, t]) => [k2, t.m])), b: Object.fromEntries(Object.entries(r.b.tex).filter(([, t]) => t.m).map(([k2, t]) => [k2, t.m])) }]));
  }
  console.log(`tex-ab ${bad === 0 ? 'OK' : `NG ${bad}`}`);
  if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify(report, null, 1));
  process.exitCode = bad === 0 ? 0 : 1;
}

await main();
