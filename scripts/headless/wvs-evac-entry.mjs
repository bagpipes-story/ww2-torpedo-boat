// 世界と模擬の突き合わせ（v0.6.11 S4。jp_03「運天港・空襲下の退避」。spec-v0611-r2 §12.1）のページの中の半分。world-vs-sim.mjs（EVAC=1）が esbuild で 1 本の IIFE に束ね、
// ヘッドレスで開いた jp_03 のページに入れる（ゲームは import しない）。模擬 core/evac-sim の runEvacTrial を台本（core/evac-sim-policy の seq・seq_shoot・stay ほか）で回し、
// その mirror（core/evac-replay）が: frame で模擬の台本の入力（針路・速さ・［切替］・消火の長押し・機銃）を世界の InputState に書いて 1 フレーム（固定ステップ 1 つ）進め、
// after で両方の状態（18 隻の記録と隊・座席・編隊の段と終わり方と凍結の空襲の状態・もう一度来る編隊・§2 の 4 機・対空・燃料・乱数 +19・+24・+29・+30・+31・+32〜+43・
// 帰投・ラッチ・沈没・消火の長押し）を同じ歩き方で平らにして比べる（数は |差| ≤ 1e-6、真偽と文字は同じ）。違ったステップを数え、最初の違いの欄を返す。
// 模擬の値（data）は束ねた時の repo の data/*.json（比べる site は同じ木のビルドにする）。smokeRun は台本なしの 1 夜（S4 の煙の門: 240 秒 ＋ 落ち着くまでページのエラー 0）。
// S5: ［切替］は HUD の右端の識別の段のボタン（ui/weapon-panel の switchButton。HoldButton の押下）を押して入れる（ボタンの道＝InputState.switchTap を直に書かない）。
import { gameData } from '../../src/config/game-data';
import { runEvacTrial } from '../../src/core/evac-sim';
import { evacSimSetup } from '../../src/systems/evac-sim-setup';

const TOL = 1e-6;
/** 歩かない鍵（作る側の値・世界だけの絵の印・別に見る物） */
const SKIP = new Set(['cfg', 'p', 'drawn', 'sq', 'raid', 'flights', 'view', 'port', 'base', 'rng']);

function flat(roots) {
  const paths = [];
  const vals = [];
  const seen = new Set();
  const walk = (o, path, depth) => {
    if (o === null || o === undefined) { paths.push(path); vals.push(o === null ? 'null' : 'undef'); return; }
    const t = typeof o;
    if (t === 'number' || t === 'boolean' || t === 'string') { paths.push(path); vals.push(o); return; }
    if (t === 'function' || depth > 8 || seen.has(o)) return;
    seen.add(o);
    if (ArrayBuffer.isView(o) || Array.isArray(o)) { for (let i = 0; i < o.length; i++) walk(o[i], `${path}[${i}]`, depth + 1); return; }
    for (const k of Object.keys(o)) if (!SKIP.has(k)) walk(o[k], `${path}.${k}`, depth + 1);
  };
  for (const [k, v] of roots) walk(v, k, 0);
  return { paths, vals };
}

/** HUD の［切替］のボタンを 1 回押して離す（押下で InputState.switchTap。ポインタの番号は台本の指と重ならない 97） */
export function pressSwitch() {
  const hud = window.__game.scene.getScene('Hud');
  const b = hud && hud.panel ? hud.panel.switchButton : null;
  if (!b) throw new Error('HUD に［切替］のボタンが無い');
  const ptr = { id: 97 };
  b.button.emit('pointerdown', ptr);
  hud.input.emit('pointerup', ptr);
}

function same(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return (Number.isNaN(a) && Number.isNaN(b)) || a === b || Math.abs(a - b) <= TOL;
  return a === b;
}

/** 編隊の比べる欄（段・終わり方・狙い・済み・始める秒・回数・撃墜のビット・偽の view・中心の艇の番号・系列・SortieBase・凍結の空襲の状態） */
function flightPick(sq, fl) {
  return {
    phase: fl.phase, outcome: fl.outcome, target: fl.target, complete: fl.complete, startS: fl.startS, passes: fl.passes, downed: fl.downed,
    vSink: fl.view.boat.sinking, vHome: fl.view.atHome, center: sq.boats.findIndex((b) => b.state === fl.view.boat.state), rs: fl.rng.state, sb: fl.base, st: fl.port.state,
  };
}

/** 世界と模擬の同じ形の根（seat は座席、aa は対空、fl はフラグ） */
function roots(v) {
  const r = [['sq', v.sq], ['seat', v.seat], ['plan', v.plan], ['rv', v.plan.reveal.state], ['fls', v.plan.flights.map((f) => flightPick(v.sq, f))], ['repass', v.repass], ['dawn', v.dawn], ['aa', v.aa], ['fuel', v.fuel],
    ['ai', v.aiRng.state], ['dodge', v.dodge.state], ['dawnRng', v.dawnRng.state], ['fl', v.flags]];
  return r;
}

/** 世界の側の同じ物（MissionWorld・WorldEvac・兵装・夜明け）。対空は枠（押していない時に世界は埋めない）を除く */
function worldView(w) {
  const ev = w.evac;
  const a = w.arms;
  const ds = w.dawn.strike;
  return {
    sq: ev.sq, plan: ev.plan, repass: ev.air.repass, dawn: ds.state, fuel: w.fuel, aiRng: ev.aiRng, dodge: ev.air.dodge, dawnRng: ds.rng,
    get seat() { return { state: w.boat.state, damage: w.damage, params: w.params, band: w.band }; },
    get aa() { return a && a.aa ? { st: a.aa, mag: a.mag, downs: a.downs, rounds: a.aaRounds, flashUntilS: a.flashUntilS, rs: a.aaRng.state } : null; },
    get flags() { return { t: w.stepTimeS, atHome: w.atHome, latched: w.dawn.reached, sinking: w.boat.sinking, caughtOutside: w.dawn.caughtOutside, extHeldS: w.extinguishHeldS }; },
  };
}

/** 模擬の側（mirror.begin の値。対空は EvacSimAa から同じ欄） */
function simView(v) {
  return {
    sq: v.sq, plan: v.plan, repass: v.repass, dawn: v.dawn, fuel: v.fuel, aiRng: v.aiRng, dodge: v.dodge, dawnRng: v.dawnRng,
    seat: { state: v.seat.state, damage: v.seat.damage, params: v.seat.params, get band() { return v.seat.band; } },
    get aa() { const a = v.aa; return a ? { st: a.st, mag: a.mag, downs: a.downs, rounds: a.rounds, flashUntilS: a.flashUntilS, rs: a.rng.state } : null; },
    flags: v.flags,
  };
}

/**
 * 1 回を突き合わせる（ページは openGame で jp_03 を seed・hard で開いた直後。固定ステップはまだ 0）。o: { seed, hard, policy, maxSteps, frameMs }。
 * 戻り: 比べたステップ・違ったステップ・最初の違い・模擬の終わり・切替・交代・撃墜・消火・予告し直し・機銃の発
 */
export function runEvacVsSim(o) {
  const hl = window.__hl;
  const w = hl.world();
  if (!w.evac) throw new Error('空襲下の退避の任務ではない');
  const s = evacSimSetup(gameData, o.hard);
  if (s.raid.flights !== w.evac.plan.raid.flights || s.sorties.length !== w.setup.evac.sorties.length) throw new Error('同時の編隊・編隊の値が世界と模擬で違う');
  let steps = 0;
  const orig = w.stepFn;
  w.stepFn = (dt) => { orig(dt); steps++; };
  const wv = worldView(w);
  let sv = null;
  let diffSteps = 0;
  let first = null;
  let compared = 0;
  let worldEnded = '';
  const inp = w.input;
  const mirror = {
    begin(v) { sv = simView(v); },
    frame(k, fo) {
      if (k >= o.maxSteps) throw new Error(`maxSteps ${o.maxSteps} に達した`);
      if (!hl.active('Mission')) { worldEnded = worldEnded || `mission-ended@${k}`; return; }
      inp.stickActive = true;
      inp.headingDeg = fo.headingDeg;
      inp.speed01 = fo.speed01;
      inp.gunHeld = fo.gunHeld;
      inp.extinguishHeld = fo.extHeld;
      if (fo.switchTap) pressSwitch();
      const before = steps;
      hl.frame(o.frameMs);
      if (steps !== before + 1) throw new Error(`フレーム ${k} の固定ステップが ${steps - before}（1 のはず）`);
    },
    after(k) {
      compared++;
      const a = flat(roots(wv));
      const b = flat(roots(sv));
      let bad = a.paths.length !== b.paths.length;
      let at = -1;
      // 座席が沈み始めたステップ（模擬の最後のステップ）は、世界の沈没（systems/boat-damage の sink と entities/player-boat の playSinking）が HP・火災・速さを 0 にする
      // （空襲の段の最後の座席の被害を記録へ写す evacStoreSeatDamage で、沈んだ隊長艇の記録の HP・火災にも写る）。模擬は沈没の動きを持たずその回を終えるので、
      // その欄だけ比べない（v0.6.10 の jp_04 の突き合わせと同じ）
      const g = w.evac.sq.groups[w.evac.sq.control];
      const rec = `sq.groups[${w.evac.sq.control}].boats[${g.leader}].damage`;
      const skip = w.boat.sinking ? new Set(['seat.state.speedMps', 'seat.damage.hp', 'seat.damage.fireLeftS', `${rec}.hp`, `${rec}.fireLeftS`]) : null;
      for (let i = 0; !bad && i < a.vals.length; i++) {
        if (a.paths[i] !== b.paths[i] || (!(skip && skip.has(a.paths[i])) && !same(a.vals[i], b.vals[i]))) { bad = true; at = i; }
      }
      if (!bad) return;
      diffSteps++;
      if (first) return;
      const fields = [];
      if (at < 0) fields.push({ path: '(形)', world: a.paths.length, sim: b.paths.length, wOnly: a.paths.filter((p) => !b.paths.includes(p)).slice(0, 5), sOnly: b.paths.filter((p) => !a.paths.includes(p)).slice(0, 5) });
      else for (let i = at; i < a.vals.length && fields.length < 6; i++) if (a.paths[i] !== b.paths[i] || (!(skip && skip.has(a.paths[i])) && !same(a.vals[i], b.vals[i]))) fields.push({ path: a.paths[i], spath: b.paths[i], world: a.vals[i], sim: b.vals[i] });
      first = { step: k, t: (k + 1) / 60, fields };
    },
  };
  const tr = runEvacTrial(s, o.policy, o.seed, null, mirror);
  w.stepFn = orig;
  const sq = w.evac.sq;
  return {
    steps: compared, diffSteps, first, simEnd: tr.end, simT: tr.timeS, survivors: tr.survivors, worldEnded,
    switches: sq.switches, promotions: sq.promotions, autoSwitches: sq.autoSwitches, downsEvac: w.arms ? w.arms.downsBy[3] : 0, downs: tr.downs, extinguished: tr.extinguished,
    again: w.evac.air.repass.again, passes2: w.evac.plan.flights.filter((f) => f.passes >= 2).length, rounds: tr.rounds, seatHits: tr.seatHits,
  };
}

/**
 * 煙の門（S4）: 台本なし（スティック中立・押さない）で secs 秒回し（10 秒ごとに 1 回描く）、その後は Mission が終わって Result が出るまで（沈没の絵は Phaser の tween＝
 * 壁時計で進むので、偽の時計のまま壁時計で最大 15 秒）回して Result を 1 回描く。終わり・残存・物の数を返す（ページのエラーは node が数える）
 */
export function smokeRun(o) {
  const hl = window.__hl;
  const w = hl.world();
  if (!w.evac) throw new Error('空襲下の退避の任務ではない');
  const n = Math.round(o.secs * 60);
  const sq = w.evac.sq;
  const plan = w.evac.plan;
  let k = 0;
  let children = 0;
  for (; k < n && hl.active('Mission'); k++) {
    hl.steer(NaN, 0);
    if (k % 600 === 0) {
      hl.render();
      children = Math.max(children, hl.mission().children.list.length);
    }
    hl.frame(o.frameMs);
  }
  let alive = 0;
  for (const b of sq.boats) if (!b.sunk) alive++;
  const t = w.stepTimeS;
  const until = performance.now() + 15000;
  while (hl.active('Mission') && performance.now() < until) { hl.steer(NaN, 0); hl.frame(o.frameMs); }
  for (let i = 0; i < 30 && hl.active('Result'); i++) hl.frame(o.frameMs);
  if (hl.active('Result')) hl.render();
  return { frames: k, t, mission: hl.active('Mission'), result: hl.active('Result'), resultLines: hl.texts('Result').length, survivors: alive, settled: sq.settled, came: plan.came, impacts: plan.impacts, children };
}

/**
 * HUD の画面写しの台（S5。evac-hud.mjs）: 模擬の台本の入力を世界へ写して進め、テレメトリの予告し直し（t.evac.annKind 2）の始まりから afterS 秒のフレームで止める
 * （終わりの lookS 秒は見張りを押したまま＝ズーム 0.5 へ。999 以上は始めからずっと）。止めた所の HUD の文・地図の上の字と輪の画面の大きさを返す（ページはそのまま＝node が撮る）
 */
export function hudProbe(o) {
  const hl = window.__hl;
  const w = hl.world();
  if (!w.evac) throw new Error('空襲下の退避の任務ではない');
  const tm = window.__game.registry.get('boatTelemetry');
  const s = evacSimSetup(gameData, o.hard);
  const inp = w.input;
  let stopK = -1;
  let found = -1;
  const mirror = {
    begin() {},
    frame(k, fo) {
      if (stopK >= 0 && k >= stopK) throw new Error('stop');
      if (!hl.active('Mission')) throw new Error('mission-ended');
      inp.stickActive = true;
      inp.headingDeg = fo.headingDeg;
      inp.speed01 = fo.speed01;
      inp.gunHeld = fo.gunHeld;
      inp.extinguishHeld = fo.extHeld;
      inp.lookout = o.lookS > 0 && (o.lookS >= 999 || (stopK >= 0 && k >= stopK - Math.round(o.lookS * 60)));
      if (fo.switchTap) pressSwitch();
      hl.frame(o.frameMs);
    },
    after(k) {
      if (found < 0 && tm.evac.annKind === 2) {
        found = k;
        stopK = k + Math.max(1, Math.round(o.afterS * 60));
      }
      if (found < 0 && k > o.maxSteps) throw new Error('予告し直しが来ない');
    },
  };
  try {
    runEvacTrial(s, o.policy, o.seed, null, mirror);
  } catch (e) {
    if (!(e instanceof Error) || e.message !== 'stop') throw e;
  }
  hl.render();
  const m = hl.mission();
  const z = m.cameras.main.zoom / window.__game.scene.getScene('Hud').cameras.main.zoom; // 論理ズーム（Hud のカメラのズームは RENDER_SCALE）
  const world = m.children.list.filter((x) => x.visible && (x.type === 'Text' || (x.type === 'Image' && x.texture && x.texture.key === 'tex-evac-ring')));
  return {
    phases: w.evac.sq.groups.map((g) => g.phase), targeted: Array.from(w.evac.sq.targeted), control: w.evac.sq.control,
    t: w.stepTimeS, zoom: z, repassAtS: (found + 1) / 60, annKind: tm.evac.annKind, event: tm.evac.event,
    hud: hl.objects('Hud').filter((x) => x.type === 'Text' && x.v && x.text !== ''),
    marks: world.map((x) => (x.type === 'Text' ? { text: x.text, px: parseFloat(x.style.fontSize) * x.scaleY * z, h: x.displayHeight * z, w: x.displayWidth * z, color: x.style.color, bold: x.style.fontStyle === 'bold' } : { ring: true, r: (x.displayWidth / 2) * z, tint: x.tintTopLeft })),
  };
}

/**
 * Result の台（S6。brief-result.mjs の EVAC=1）: 模擬の台本の入力を世界へ写して模擬の終わりまで進める。模擬の終わり・残存を返す（Result が出るまでの残りは
 * node が 30 フレームずつ・100 ms おきに回す＝沈む絵の tween は壁時計で進むので、ページの中で回し続けると偽の時計だけが進んで経過の秒が膨らむ）
 */
export function resultRun(o) {
  const hl = window.__hl;
  const w = hl.world();
  if (!w.evac) throw new Error('空襲下の退避の任務ではない');
  const s = evacSimSetup(gameData, o.hard);
  const inp = w.input;
  const mirror = {
    begin() {},
    frame(k, fo) {
      if (!hl.active('Mission')) return;
      if (k >= o.maxSteps) throw new Error(`maxSteps ${o.maxSteps} に達した`);
      inp.stickActive = true;
      inp.headingDeg = fo.headingDeg;
      inp.speed01 = fo.speed01;
      inp.gunHeld = fo.gunHeld;
      inp.extinguishHeld = fo.extHeld;
      if (fo.switchTap) pressSwitch();
      hl.frame(o.frameMs);
    },
    after() {},
  };
  const tr = runEvacTrial(s, o.policy, o.seed, null, mirror);
  return { simEnd: tr.end, simT: tr.timeS, survivors: tr.survivors, achieved: tr.achieved, t: w.stepTimeS };
}

window.__wvsEvac = { runEvacVsSim, smokeRun, hudProbe, resultRun };
