// 性能の計測（v0.6.11 S7。spec-v0611-r2 §11）のページの中の半分。evac-perf.mjs が esbuild で 1 本の IIFE に束ね、ヘッドレスで開いた jp_03（か基準の jp_04）のページに入れる
// （ゲームは import しない）。フレームを壁時計の 1/60 秒に合わせて進め（偽の時計のまま。Phaser の tween は壁時計で進む＝爆発の絵がゲームと同じ長さで消える）、o.every フレームに 1 回描いて
// （ヘッドレスの WebGL は CPU のラスタ（SwiftShader）で 1 枚 数十 ms かかり、毎フレーム描くと壁時計に合わせられない）、
// フレームごとに: 進める（__hl.frame＝game.headlessStep）・その中の世界の updateFrame と固定ステップ（stepFn）・描く（__hl.render。描いたフレームだけ）の壁時計・壁時計からの遅れ、Mission の children の数、
// 全部の Scene の Text.setText の呼ばれた回数（同じ文で呼んだ回も）と文が変わった回数、飛んでいる機（凍結の空襲の AirPlane の段 1〜5）・動く編隊・動く 2 回目の編隊の数を記録する。
// run03: 模擬 core/evac-sim の runEvacTrial を台本で回し、その mirror の frame で台本の入力（針路・速さ・［切替］はボタンの道・消火・機銃）を世界へ写して 1 フレーム進める
//   （模擬の計算はどの秒にも入らない。wvs-evac-entry.mjs の resultRun と同じ写し方）。
// run04: jp_04 の基準の台本: 夜明けまでスティック中立（米PT は輸送船へ）、夜明けの後は全速で、投下のたびに 0.35 秒後に 90° 転舵（向きは交互）・火災は消火を押す
//   （模擬 core/air-strike-sim の react 0.35 の手。夜明けの空襲の第 2 波まで浮くため）。
import { gameData } from '../../src/config/game-data';
import { runEvacTrial } from '../../src/core/evac-sim';
import { evacSimSetup } from '../../src/systems/evac-sim-setup';
import { pressSwitch } from './wvs-evac-entry.mjs';

/** 計測の包みを 1 回だけ入れる（世界の updateFrame と stepFn・Text の setText の原型）。戻りは記録の入れ物 */
function install(w) {
  const pr = { uf: 0, steps: [], calls: 0, changed: 0 };
  const uf = w.updateFrame.bind(w);
  w.updateFrame = (dt) => { const a = performance.now(); uf(dt); pr.uf += performance.now() - a; };
  const sf = w.stepFn;
  w.stepFn = (dt) => { const a = performance.now(); sf(dt); pr.steps.push(performance.now() - a); };
  let proto = null;
  for (const key of ['Hud', 'Mission']) {
    for (const o of window.__game.scene.getScene(key).children.list) if (o.type === 'Text') { proto = Object.getPrototypeOf(o); break; }
    if (proto) break;
  }
  if (!proto) throw new Error('Text が見つからない');
  while (proto && !Object.prototype.hasOwnProperty.call(proto, 'setText')) proto = Object.getPrototypeOf(proto);
  const st = proto.setText;
  proto.setText = function (v) { pr.calls++; if (String(v ?? '') !== this._text) pr.changed++; return st.call(this, v); };
  const out = { upd: [], uf: [], stepSum: [], stepN: [], stepMax: [], render: [], lag: [], children: [], planes: [], live: [], again: [], wave: [], calls: [], changed: [], t: [], iso: window.crossOriginIsolated === true, ended: '' };
  return { pr, out };
}

const flying = (st) => { let n = 0; for (const p of st.planes) if (p.phase >= 1 && p.phase <= 5) n++; return n; };

/** 1 フレーム: 壁時計に合わせて待ち、進めて描いて記録する。戻りは任務がまだ続くか */
function frameOnce(hl, rec, k, t0, o) {
  const { pr, out } = rec;
  if (o.pace) while (performance.now() < t0 + k * o.frameMs);
  const lag = performance.now() - (t0 + k * o.frameMs);
  const w = hl.world();
  const c0 = pr.calls;
  const g0 = pr.changed;
  pr.uf = 0;
  pr.steps.length = 0;
  const a = performance.now();
  hl.frame(o.frameMs);
  const b = performance.now();
  if (!hl.active('Mission')) { out.ended = `mission-ended@${k}`; return false; }
  const draw = k % o.every === 0;
  if (draw) hl.render();
  const c = performance.now();
  let ss = 0;
  let sm = 0;
  for (const x of pr.steps) { ss += x; if (x > sm) sm = x; }
  out.upd.push(b - a); out.uf.push(pr.uf); out.stepSum.push(ss); out.stepN.push(pr.steps.length); out.stepMax.push(sm); out.render.push(draw ? c - b : NaN); out.lag.push(lag);
  out.children.push(hl.mission().children.list.length); out.calls.push(pr.calls - c0); out.changed.push(pr.changed - g0); out.t.push(w.stepTimeS);
  let planes = 0;
  let live = 0;
  let again = 0;
  let wave = -1;
  if (w.evac) {
    for (const fl of w.evac.plan.flights) {
      const st = fl.port.state;
      if (!st.started || st.cancelled) continue;
      const n = flying(st);
      if (n === 0) continue;
      planes += n;
      live++;
      if (fl.passes >= 2) again++;
      if (fl.wave > wave) wave = fl.wave;
    }
  }
  const ds = w.dawn.strike ? w.dawn.strike.state : null;
  if (ds && ds.started && !ds.cancelled) {
    const n = flying(ds);
    planes += n;
    if (n > 0) live++;
    if (!w.evac) wave = ds.waves;
  }
  out.planes.push(planes); out.live.push(live); out.again.push(again); out.wave.push(wave);
  return true;
}

/** jp_03: 模擬の台本で secs 秒まで（模擬が先に終われば、そこまで） */
export function run03(o) {
  const hl = window.__hl;
  const w = hl.world();
  if (!w.evac) throw new Error('空襲下の退避の任務ではない');
  const rec = install(w);
  const s = evacSimSetup(gameData, o.hard);
  const inp = w.input;
  let t0 = 0;
  const mirror = {
    begin() { t0 = performance.now(); },
    frame(k, fo) {
      if (k >= o.secs * 60) throw new Error('stop');
      inp.stickActive = true;
      inp.headingDeg = fo.headingDeg;
      inp.speed01 = fo.speed01;
      inp.gunHeld = fo.gunHeld;
      inp.extinguishHeld = fo.extHeld;
      if (fo.switchTap) pressSwitch();
      if (!frameOnce(hl, rec, k, t0, o)) throw new Error('stop');
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

/** jp_04: 基準の台本で secs 秒まで */
export function run04(o) {
  const hl = window.__hl;
  const w = hl.world();
  const rec = install(w);
  const t0 = performance.now();
  let dropped = 0;
  let turnAt = Infinity;
  let side = 1;
  let heading = 0;
  for (let k = 0; k < o.secs * 60; k++) {
    const t = w.stepTimeS;
    const ds = w.dawn.strike ? w.dawn.strike.state : null;
    if (w.dawn.reached && ds) {
      if (ds.bombsDropped > dropped) { dropped = ds.bombsDropped; turnAt = t + 0.35; }
      if (t >= turnAt) { heading = (w.boat.state.headingDeg + 90 * side + 360) % 360; side = -side; turnAt = Infinity; }
      hl.steer(heading, 1);
    } else {
      heading = w.boat.state.headingDeg;
      hl.steer(NaN, 0);
    }
    w.input.gunHeld = false;
    w.input.extinguishHeld = w.damage.fireLeftS > 0;
    if (!frameOnce(hl, rec, k, t0, o)) break;
  }
  return rec.out;
}

window.__perfEvac = { run03, run04 };
