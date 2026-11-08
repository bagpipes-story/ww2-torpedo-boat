// 絵の性能の計測（v0.7.0 S0。spec-v0700 §5.7・§7.2「art-perf」）のページの中の半分。art-perf.mjs が esbuild で 1 本の IIFE に束ね、ヘッドレスで開いた任務のページに入れる
// （ゲームは import しない。jp_03 の台本だけ模擬 core/evac-sim の runEvacTrial を使う＝perf-evac-entry.mjs の run03 と同じ写し方）。
// 1 夜: 窓の前は描かず壁時計にも合わせずに速く進め（warm）、窓（o.win 秒）の間はフレームを壁時計の 1/60 秒に合わせて進め（tween は壁時計で進む）、o.every フレームに 1 回描いて、
// 描いたフレームの（進める＋描く）の壁時計と、そのフレームで見えている Mission の物の数（visible で α > 0）を記録する。
// 窓の始まり（o.start）: 'starshell'＝星弾・照明弾の絵が見えたら（us_02 ハード。R20）・'planes'＝敵機が飛んでいたら（夜明けの空襲・夜の哨戒機）・数＝その秒。どれも o.maxWarm 秒までに来なければその秒から。
// o.sync（既定 true）: 描いた後に WebGL の 1 画素を読んで描画の工程が終わるのを待つ（SwiftShader の塗りの秒も（進める＋描く）に入れる＝全面の層の重さが見える）。
// 台本（o.script）: 既定は ab-replay の台本（最寄りの敵へ向かい、主兵装を間隔で撃つ）、'standoff' は敵から 3,300 m の外を全速で寄せて内に入れば全速で背を向ける
//   （駆逐艦の星弾は探照灯の射程 3,000 m の外で近づく艇に撃つ＝us_02 ハードの星弾の窓。seed 1 で t 42 秒）。
import { gameData } from '../../src/config/game-data';
import { runEvacTrial } from '../../src/core/evac-sim';
import { evacSimSetup } from '../../src/systems/evac-sim-setup';
import { pressSwitch } from './wvs-evac-entry.mjs';

const flying = (st) => { let n = 0; for (const p of st.planes) if (p.phase >= 1 && p.phase <= 5) n++; return n; };

/** 窓を始めるか（世界と Mission の物を読むだけ） */
function startNow(o, w, m) {
  const t = w.stepTimeS;
  if (t >= o.maxWarm) return true;
  if (typeof o.start === 'number') return t >= o.start;
  if (o.start === 'starshell') {
    for (const c of m.children.list) if (c.visible && c.alpha > 0 && c.texture && c.texture.key === 'tex-starshell') return true;
    return false;
  }
  if (o.start === 'planes') {
    const ds = w.dawn && w.dawn.strike ? w.dawn.strike.state : null;
    if (ds && ds.started && flying(ds) > 0) return true;
    for (const c of m.children.list) if (c.visible && c.alpha > 0 && c.texture && c.texture.key === 'tex-aircraft-enemy') return true;
    return false;
  }
  return true;
}

function recorder(o) {
  const hl = window.__hl;
  const out = { frame: [], vis: [], all: [], t0: NaN, t1: NaN, ended: '', reason: '' };
  let inWin = false;
  let k0 = 0;
  let wall0 = 0;
  let k = 0;
  const gl = window.__game.renderer.gl;
  const px = new Uint8Array(4);
  /** 1 フレーム進める（窓の内なら壁時計に合わせて描いて記録）。戻りは続けるか */
  const step = () => {
    const w = hl.world();
    const m = hl.mission();
    if (!inWin && startNow(o, w, m)) {
      inWin = true; k0 = k; wall0 = performance.now(); out.t0 = w.stepTimeS;
      out.reason = typeof o.start !== 'number' && w.stepTimeS >= o.maxWarm ? `${o.start} が来ない・maxWarm ${o.maxWarm}` : String(o.start);
    }
    if (inWin) {
      const kk = k - k0;
      if (kk >= o.win * 60) return false;
      if (o.pace) while (performance.now() < wall0 + kk * o.frameMs);
      const a = performance.now();
      hl.frame(o.frameMs);
      if (!hl.active('Mission')) { out.ended = `mission-ended@${w.stepTimeS.toFixed(1)}`; return false; }
      if (kk % o.every === 0) {
        hl.render();
        if (o.sync && gl) gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const b = performance.now();
        let vis = 0;
        const list = hl.mission().children.list;
        for (const c of list) if (c.visible && c.alpha > 0) vis++;
        out.frame.push(b - a); out.vis.push(vis); out.all.push(list.length);
      }
      out.t1 = hl.world().stepTimeS;
    } else {
      hl.frame(o.frameMs);
      if (!hl.active('Mission')) { out.ended = `mission-ended-before-window@${w.stepTimeS.toFixed(1)}`; return false; }
    }
    k++;
    return true;
  };
  return { out, step };
}

/** ab-replay の台本（最寄りの敵へ向かい、主兵装を間隔で撃つ）で窓の終わりまで */
export function runScript(o) {
  const hl = window.__hl;
  const w = hl.world();
  const rec = recorder(o);
  let lastTorp = -1;
  for (let guard = 0; guard < 60 * 600; guard++) {
    const t = w.stepTimeS;
    const b = w.boat.state;
    const f = w.enemy.focus(b.x, b.y);
    const dist = f ? Math.hypot(f.x - b.x, f.y - b.y) : Infinity;
    const near = o.script === 'standoff' ? 3300 : 600;
    if (t < 2) hl.steer(NaN, 0);
    else if (f && dist < near) hl.steer(hl.bearing(f.x, f.y, b.x, b.y), o.script === 'standoff' ? 1 : 0.8);
    else if (f) hl.steer(hl.bearing(b.x, b.y, f.x, f.y), o.script === 'standoff' ? 1 : dist > 1800 ? 0.6 : 0.4);
    else hl.steer((90 + t * 2) % 360, 0.5);
    const main = w.setup.mainWeapon;
    const slot = Math.floor(t / 12);
    if (main === 'torpedo' && t > 8 && slot !== lastTorp && dist < 2500) { w.input.fireTap = true; lastTorp = slot; }
    w.input.gunHeld = main === 'guns' && t % 8 < 3 && dist < 1500;
    w.input.extinguishHeld = w.damage.fireLeftS > 0;
    if (!rec.step()) break;
  }
  return rec.out;
}

/** jp_03: 模擬の台本（遊び方:seed）で窓の終わりまで */
export function runEvac(o) {
  const hl = window.__hl;
  const w = hl.world();
  if (!w.evac) throw new Error('空襲下の退避の任務ではない');
  const rec = recorder(o);
  const s = evacSimSetup(gameData, o.hard);
  const inp = w.input;
  const mirror = {
    begin() {},
    frame(_k, fo) {
      inp.stickActive = true;
      inp.headingDeg = fo.headingDeg;
      inp.speed01 = fo.speed01;
      inp.gunHeld = fo.gunHeld;
      inp.extinguishHeld = fo.extHeld;
      if (fo.switchTap) pressSwitch();
      if (!rec.step()) throw new Error('stop');
    },
    after() {},
  };
  try {
    runEvacTrial(s, o.policy, o.seed, null, mirror);
  } catch (e) {
    if (!(e instanceof Error) || e.message !== 'stop') throw e;
  }
  return rec.out;
}

window.__artPerf = { runScript, runEvac };
