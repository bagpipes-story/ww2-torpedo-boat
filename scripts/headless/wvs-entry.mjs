// 世界と模擬の突き合わせ（G7）のページの中の半分（v0.6.10 S5a）。world-vs-sim.mjs が esbuild で 1 本の IIFE に束ね、ヘッドレスで開いた jp_04 のページに入れる（ゲームは import しない）。
// 模擬 core/landing-sim の runLandingTrial を記録した入力の再生（core/landing-replay）で回し、その rp.step が世界を 1 固定ステップずつ進める（同じページ・同じ JS エンジンで歩調を合わせる）:
//   世界: 台本（下の POLICIES。毎フレーム自艇の入力を書く）→ __hl.frame → stepFn の包みがそのステップの入力（針路・速力・射撃ボタン）と命中スローの倍率を写す。
//   模擬: その入力と倍率でステップ k を進め、rp.after(k) で世界と模擬の状態（米PT の隊・揚陸・雷撃・敵の魚雷・卯月・自艇・被害・燃料・乱数 seed+18・+20・+26・+27・+28 の内部の値）を
//   同じ歩き方で平らにして比べる（数は |差| ≤ 1e-6、真偽と文字は同じ）。違ったステップを数え、最初の違いの欄を返す。
// 模擬の値（data）は束ねた時の repo の data/*.json（比べる site は同じ木のビルドにする）。
import { gameData } from '../../src/config/game-data';
import { runLandingTrial } from '../../src/core/landing-sim';
import { PT_LEAVE } from '../../src/core/pt-state';
import { landingSimSetup } from '../../src/systems/landing-sim-setup';

/** 歩かない鍵（作る側の値・演出・他の根で見る物の参照）。nextWakeAtM は世界の雷跡の点の絵だけの値（core/landing-torpedoes の写しは置かない＝他に読まれない） */
const SKIP = new Set(['fx', 'ptEv', 'q', 'rng27', 'rng28', 'p', 'pt', 'pHit', 'nextWakeAtM']);
const TOL = 1e-6;

/** 平らにする（根の順は固定。配列・型付き配列・素の物を深さ 5 まで。関数は飛ばす） */
function flat(v) {
  const paths = [];
  const vals = [];
  const seen = new Set();
  const walk = (o, path, depth) => {
    if (o === null || o === undefined) { paths.push(path); vals.push(o === null ? 'null' : 'undef'); return; }
    const t = typeof o;
    if (t === 'number' || t === 'boolean' || t === 'string') { paths.push(path); vals.push(o); return; }
    if (t === 'function' || depth > 5 || seen.has(o)) return;
    seen.add(o);
    if (ArrayBuffer.isView(o) || Array.isArray(o)) { for (let i = 0; i < o.length; i++) walk(o[i], `${path}[${i}]`, depth + 1); return; }
    for (const k of Object.keys(o)) if (!SKIP.has(k)) walk(o[k], `${path}.${k}`, depth + 1);
  };
  walk(v.q, 'q', 0); walk(v.ld, 'ld', 0); walk(v.st, 'st', 0); walk(v.torps, 'torps', 0); walk(v.ally, 'ally', 0);
  walk(v.boat, 'boat', 0); walk(v.d, 'd', 0); walk(v.fuel, 'fuel', 0);
  for (const k of ['rng', 'gunRng', 'trng', 'a27', 'a28']) { paths.push(`${k}.state`); vals.push(v[k] ? v[k].state : -1); }
  return { paths, vals };
}

function same(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return (Number.isNaN(a) && Number.isNaN(b)) || a === b || Math.abs(a - b) <= TOL;
  return a === b;
}

/** 世界の側の同じ物（MissionWorld）。卯月の無い夜は ally・a27・a28 が null */
function worldView(w) {
  const L = w.landing;
  const A = L.ally;
  return { q: w.pts.section, ld: L.state, st: L.tst, torps: L.pool.states, ally: A ? A.a : null, boat: w.boat.state, d: w.damage, fuel: w.fuel, rng: w.pts.rng, gunRng: w.pts.gun.rng, trng: L.rng, a27: A ? A.rng27 : null, a28: A ? A.rng28 : null };
}

const d2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
/** 生きた（去っていない）PT のうち点 (x, y) に最も近いもの（無ければ null） */
function nearestLive(q, x, y) {
  let best = null;
  let bd = Infinity;
  for (const b of q.boats) {
    if (b.phase >= PT_LEAVE) continue;
    const d = d2(b.x, b.y, x, y);
    if (d < bd) { bd = d; best = b; }
  }
  return best ? { b: best, d: Math.sqrt(bd) } : null;
}

/** 世界の台本（毎フレーム。hl.steer と input.gunHeld を書く）。どれも乱数を引かない（seed は夜を選ぶだけ） */
const POLICIES = {
  /** 出発点で止まったまま */
  hide: (hl, w) => { hl.steer(NaN, 0); w.input.gunHeld = false; },
  /** 帰投の輪へ巡航して止まる */
  home: (hl, w) => goHome(hl, w),
  /** 輸送船の北 350 m で止まり、近い PT（800 m）へ向いて撃つ */
  near: (hl, w) => {
    const b = w.boat.state;
    const L = w.landing.state;
    const n = nearestLive(w.pts.section, b.x, b.y);
    if (w.landing.resolved) return goHome(hl, w);
    const sx = L.x;
    const sy = L.y - 350;
    if (n && n.d < 800) { hl.steer(hl.bearing(b.x, b.y, n.b.x, n.b.y), 0.5); w.input.gunHeld = true; return; }
    w.input.gunHeld = false;
    if (d2(b.x, b.y, sx, sy) > 60 * 60) hl.steer(hl.bearing(b.x, b.y, sx, sy), 0.6);
    else hl.steer(NaN, 0);
  },
  /** 近い PT へ寄って 1,100 m で背を向けて走る（引きつける）。700 m の内は撃つ。決着か PT がいなければ帰る */
  lure: (hl, w) => lure(hl, w, 0),
  /** 輸送船と卯月の間（輸送船の北東 350 m）で待ち、900 m の内の PT へ向かって撃つ（東の PT を卯月の扇へ走らせる） */
  east: (hl, w) => {
    const b = w.boat.state;
    if (w.landing.resolved) return goHome(hl, w);
    const L = w.landing.state;
    const n = nearestLive(w.pts.section, b.x, b.y);
    if (n && n.d < 900) { hl.steer(hl.bearing(b.x, b.y, n.b.x, n.b.y), 0.8); w.input.gunHeld = n.d < 700; return; }
    w.input.gunHeld = false;
    const sx = L.x + 250;
    const sy = L.y - 250;
    if (d2(b.x, b.y, sx, sy) > 60 * 60) hl.steer(hl.bearing(b.x, b.y, sx, sy), 0.6);
    else hl.steer(NaN, 0);
  },
  /** PT が輸送船の 1,500 m の内に入るまで待ってから lure */
  late: (hl, w) => lure(hl, w, 1500),
};

function goHome(hl, w) {
  const b = w.boat.state;
  const r = w.returnPoint;
  w.input.gunHeld = false;
  if (d2(b.x, b.y, r.x, r.y) > (r.radiusM * 0.5) ** 2) hl.steer(hl.bearing(b.x, b.y, r.x, r.y), 0.6);
  else hl.steer(NaN, 0);
}

function lure(hl, w, waitM) {
  const b = w.boat.state;
  const q = w.pts.section;
  if (w.landing.resolved) return goHome(hl, w);
  const n = nearestLive(q, b.x, b.y);
  if (!n) return goHome(hl, w);
  const L = w.landing.state;
  if (waitM > 0 && !hl.__late) {
    const t = nearestLive(q, L.x, L.y);
    if (!t || t.d > waitM) { hl.steer(NaN, 0); w.input.gunHeld = false; return; }
    hl.__late = true;
  }
  w.input.gunHeld = n.d < 700;
  if (q.detected && n.d < 1100) hl.steer(hl.bearing(n.b.x, n.b.y, b.x, b.y), 1);
  else hl.steer(hl.bearing(b.x, b.y, n.b.x, n.b.y), 0.75);
}

/**
 * 1 夜を突き合わせる（ページは openGame で jp_04 を seed・hard で開いた直後。固定ステップはまだ 0）。o: { seed, hard, policy, maxSteps, frameMs, allyOff }。
 * 戻り: ステップ数・違ったステップ数・最初の違い（ステップ・欄・世界・模擬）・模擬の終わり・卯月の数え
 */
export function runWorldVsSim(o) {
  const hl = window.__hl;
  const w = hl.world();
  if (!w.landing || !w.pts) throw new Error('揚陸の任務ではない');
  const s = landingSimSetup(gameData, 'jp_04', { hard: o.hard, ...(o.allyOff ? { allyOff: true } : {}) });
  if (!!s.allyDestroyer !== !!w.landing.ally) throw new Error('卯月の有無が世界と模擬で違う');
  const pol = POLICIES[o.policy];
  if (!pol) throw new Error(`台本 ${o.policy} は無い`);
  hl.__late = false;
  // 世界の stepFn を包む: ステップの前に入力と倍率を写し、数える
  const rec = { k: -1, h: NaN, s: 0, held: false, feel: 1 };
  let steps = 0;
  let slowSteps = 0;
  const orig = w.stepFn;
  w.stepFn = (dt) => {
    rec.k = steps;
    rec.h = w.input.headingDeg;
    rec.s = w.input.speed01;
    rec.held = w.input.gunHeld;
    rec.feel = w.slowMoLeftS > 0 ? w.setup.slowMoFactor : 1;
    if (rec.feel !== 1) slowSteps++;
    orig(dt);
    steps++;
  };
  const wv = worldView(w);
  let sv = null;
  let diffSteps = 0;
  let first = null;
  let compared = 0;
  let worldEnded = '';
  const replay = {
    begin(v) { sv = { ...v, a27: v.ally ? v.a27 : null, a28: v.ally ? v.a28 : null }; },
    step(k, input, ro) {
      if (k >= o.maxSteps) return false;
      let guard = 0;
      while (steps <= k) {
        if (!hl.active('Mission')) { worldEnded = 'mission-ended'; return false; }
        pol(hl, w);
        hl.frame(o.frameMs);
        if (++guard > 8) throw new Error(`世界がステップ ${k} に進まない`);
      }
      if (steps !== k + 1 || rec.k !== k) throw new Error(`歩調がずれた（世界 ${steps}・模擬 ${k}）`);
      input.headingDeg = rec.h;
      input.speed01 = rec.s;
      ro.held = rec.held;
      ro.feel = rec.feel;
      return true;
    },
    after(k) {
      compared++;
      const a = flat(wv);
      const b = flat(sv);
      let bad = a.paths.length !== b.paths.length;
      let at = -1;
      for (let i = 0; !bad && i < a.vals.length; i++) {
        if (a.paths[i] !== b.paths[i] || !same(a.vals[i], b.vals[i])) { bad = true; at = i; }
      }
      if (!bad) return;
      diffSteps++;
      if (first) return;
      const fields = [];
      if (at < 0) fields.push({ path: '(形)', world: a.paths.length, sim: b.paths.length, wOnly: a.paths.filter((p) => !b.paths.includes(p)).slice(0, 5), sOnly: b.paths.filter((p) => !a.paths.includes(p)).slice(0, 5) });
      else for (let i = at; i < a.vals.length && fields.length < 6; i++) if (a.paths[i] !== b.paths[i] || !same(a.vals[i], b.vals[i])) fields.push({ path: a.paths[i], spath: b.paths[i], world: a.vals[i], sim: b.vals[i] });
      first = { step: k, t: k / 60, fields };
    },
  };
  const tr = runLandingTrial(s, 'lure', o.seed, undefined, replay);
  w.stepFn = orig;
  const A = w.landing.ally ? w.landing.ally.a : null;
  return {
    steps: compared, diffSteps, first, simEnd: tr.end, worldEnded, landing: w.landing.state.phase, hits: w.landing.state.hits,
    ally: A ? { spots: A.spots, litPts: A.litPts, shells: A.shells, liveHits: A.liveHits, retired: A.retired, sunk: A.sunk, litSalvos: A.litSalvos, litAways: A.litAways, chaseShells: A.chaseShells } : null,
    salvos: w.landing.tst.salvos, slowSteps, playerSunk: w.boat.sinking,
  };
}

/**
 * jp04-probe.mjs の 1 区切り: 台本で進め、まだ撮っていない出来事（卯月が気づく・探照灯・砲・撃たずに去らせた・卯月の命中・斉射・揚陸の決着）が起きたら止めて返す（撮るのは node）。
 * 2 行目のいちばん広い文（表示の幅 px）と出来事の秒も数える。o: { policy, maxSteps, frameMs }。st はページに持つ（__probe）
 */
export function probeRun(o) {
  const hl = window.__hl;
  const w = hl.world();
  const pol = POLICIES[o.policy];
  if (!pol) throw new Error(`台本 ${o.policy} は無い`);
  const p = (window.__probe ??= { steps: 0, events: {}, widest: { w: 0, text: '', t: 0 }, shot: {} });
  const hud = window.__game.scene.getScene('Hud');
  const line = hud && hud.boatHud ? hud.boatHud.missionLine.missionText : null;
  const A = w.landing && w.landing.ally ? w.landing.ally.a : null;
  const mark = (k, cond) => { if (cond && p.events[k] === undefined) p.events[k] = w.stepTimeS; };
  while (p.steps < o.maxSteps) {
    if (!hl.active('Mission')) return { done: true, reason: 'ended', p };
    pol(hl, w);
    hl.frame(o.frameMs);
    p.steps++;
    if (line && line.visible && line.displayWidth > p.widest.w) p.widest = { w: line.displayWidth, text: line.text, t: w.stepTimeS };
    if (A) {
      mark('spotted', A.spots > 0); mark('beam', A.g.light.on); mark('shot', A.shells > 0); mark('litAway', A.litAways > 0);
      mark('hit', A.liveHits > 0); mark('retired', A.retired > 0); mark('sunkPt', A.sunk > 0); mark('litSalvo', A.litSalvos > 0);
    }
    mark('salvo', w.landing.tst.salvos > 0); mark('resolved', w.landing.resolved); mark('dawn', w.dawn.reached);
    for (const k of o.shots) if (p.events[k] !== undefined && !p.shot[k]) { p.shot[k] = true; return { done: false, reason: k, p }; }
  }
  return { done: true, reason: 'maxSteps', p };
}

window.__wvs = { runWorldVsSim, probeRun, POLICIES };
