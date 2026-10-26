// v0.6.7 S5（spec-v067 §C.3・§D.3・レビュー R14・R17・F12）: 夜の哨戒機のテレメトリ（systems/patrol-telemetry）と世界側の段（systems/patrol-air-step）。
// 「敵機」の矢印（t.planeDx/Dy）は機が画面にいる段だけ書く（捜索の 1 番機・出撃の印の機）。NaN は書かない（水上機のテレメトリの値のまま）。夜明けの空襲が来れば夜明けの機に替わる。
// 再出撃が空中の爆弾で遅れれば restartDelayed を数え、通るまで出撃は始まらず門番は出撃の段のまま（R17）。hud-markers の矢印は patrol.enabled でも作る（ソースの pin）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { strikeFocusPlane, strikePose } from '../src/core/air-strike';
import type { AircraftPose } from '../src/core/friendly';
import { PA_HUNT, PA_LEAVE, PA_OFF, PA_ORBIT, PA_PASS, PA_SORTIE, patrolPose } from '../src/core/patrol-air';
import { initPatrolTelemetry, patrolResult, refreshPatrolTelemetry } from '../src/systems/patrol-telemetry';
import { DT, S02, driveUntil, makeKit, type Kit } from './patrol-world-kit';

const pose = (): AircraftPose => ({ dx: 0, dy: 0, headingDeg: 0, alpha: 0 });
const G = S02.patrolAir!.gate;
const SP = S02.patrolAir!.sortie;

describe('夜の哨戒機の「敵機」の矢印（R14）', () => {
  it('レーダーの前（哨戒）は書かない（水上機のテレメトリの値のまま。NaN も既の値も上書きしない）', () => {
    const k = makeKit(11);
    k.step();
    expect(k.t.patrol.phase).toBe(PA_HUNT);
    expect(k.t.planeDx).toBeNaN();
    k.t.planeDx = 123;
    k.t.planeDy = -45;
    refreshPatrolTelemetry(k.t, k.w, pose());
    expect([k.t.planeDx, k.t.planeDy]).toEqual([123, -45]);
  });
  it('接近（レーダーの捜索）は捜索の 1 番機（方位 56° + 隊形のずれ・距離）', () => {
    const k = makeKit(11);
    expect(k.runUntil((x) => x.t.patrol.phase === PA_PASS)).toBe(true);
    k.step();
    const q = patrolPose(k.pa.state, G, SP.spawnOffsetsDeg[0]!, pose());
    expect([k.t.planeDx, k.t.planeDy]).toEqual([q.dx, q.dy]);
    expect(Math.hypot(k.t.planeDx, k.t.planeDy)).toBeCloseTo(k.pa.state.r, 6);
    expect(k.t.patrol.radar).toBe(true);
    expect(k.t.patrol.bearingDeg).toBeCloseTo(56, 6);
  });
  it('出撃中は出撃の印の機（strikeFocusPlane）', () => {
    const k = makeKit(11);
    expect(driveUntil(k, (x) => x.t.patrol.phase === PA_SORTIE && x.t.patrol.threat === 2, 'hud', 60)).toBe(true);
    const i = strikeFocusPlane(k.flight.state, SP);
    expect(i).toBeGreaterThanOrEqual(0);
    const q = strikePose(k.flight.state, SP, i, pose());
    expect([k.t.planeDx, k.t.planeDy]).toEqual([q.dx, q.dy]);
  });
  it('夜明けのラッチで捜索の機は外向きに薄くなって去り（矢印は残る）、夜明けの 4 機が来ると夜明けの印の機に替わる', () => {
    // 2 回目の捜索（航跡で来る）の接近の途中で夜明けにする
    const probe = makeKit(11);
    expect(driveUntil(probe, (x) => x.pa.state.k === 2 && x.t.patrol.phase === PA_PASS, 'hud', 80)).toBe(true);
    const latchS = probe.w.stepTimeS + 2;
    const k = makeKit(11, latchS);
    expect(driveUntil(k, (x) => x.dawn.reached, 'hud', 80)).toBe(true);
    expect(k.t.patrol.phase).toBe(PA_OFF);
    const q = k.pa.searchPose(0, pose());
    expect(q.alpha).toBeGreaterThan(0.9);
    // 夜明けの 4 機（接近）が来ている: 矢印は夜明けの印の機
    const ds = k.dawn.strike!;
    expect(ds.p.planes).toBe(4);
    const j = strikeFocusPlane(ds.state, ds.p);
    const d = strikePose(ds.state, ds.p, j, pose());
    expect([k.t.planeDx, k.t.planeDy]).toEqual([d.dx, d.dy]);
    // 捜索の機は leave_s で消える
    for (let i = 0; i < (G.leaveS + 0.1) / DT; i++) k.step();
    expect(k.pa.searchPose(0, pose()).alpha).toBe(0);
  });
});

describe('再出撃の遅れ（R17・F12）と結果の行の秒', () => {
  /** 1 回目の出撃が終わり、2 回目の捜索が発見の少し手前まで来た夜（run: 止まらない） */
  function beforeSecondFind(): Kit {
    const k = makeKit(11);
    expect(driveUntil(k, (x) => x.pa.state.k === 2 && x.t.patrol.phase === PA_PASS && x.pa.state.r < G.lockM + 50, 'run', 120)).toBe(true);
    return k;
  }
  it('ふだんの夜は遅れ 0（発見の瞬間に空中の爆弾は無い）', () => {
    const k = beforeSecondFind();
    expect(driveUntil(k, (x) => x.pa.state.finds === 2, 'run', 5)).toBe(true);
    expect(k.pa.restartDelayed).toBe(0);
    expect(k.flight.state.waves).toBe(2);
  });
  it('発見の瞬間に空中の爆弾があれば出撃は始めず（波は増えない・門番は出撃の段のまま）、落ちてから始め、遅れたステップを数える', () => {
    const k = beforeSecondFind();
    const b = k.flight.state.bombs[0]!;
    Object.assign(b, { active: true, leftS: 0.5, aimX: 0, aimY: 0, fromX: 0, fromY: 0, plane: 0, toEscort: false, hitPlayer: false, hitEscort: false });
    expect(driveUntil(k, (x) => x.pa.state.finds === 2, 'run', 5)).toBe(true);
    expect(k.pa.state.phase).toBe(PA_SORTIE);
    expect(k.flight.state.waves).toBe(1);
    expect(k.pa.restartDelayed).toBeGreaterThan(0);
    expect(driveUntil(k, (x) => x.flight.state.waves === 2, 'run', 2)).toBe(true);
    expect(k.pa.state.phase).toBe(PA_SORTIE);
    const delayed = k.pa.restartDelayed;
    expect(delayed).toBeGreaterThan(5);
    expect(k.t.patrol.restartDelayed).toBe(delayed);
    expect(patrolResult(k.w)!.restartDelayed).toBe(delayed);
  });
  it('見つけられずに去る捜索の結果の行は去り始めから PATROL_RESULT_SHOW_S（2.5 秒）、出撃が去る行は出撃の終わりから 2.5 秒', () => {
    const k = makeKit(11);
    expect(driveUntil(k, (x) => x.t.patrol.phase === PA_LEAVE, 'hud', 120)).toBe(true);
    expect(k.t.patrol.resultKind).toBe(1);
    expect(k.t.patrol.resultLeftS).toBeCloseTo(2.5, 6);
    const k2 = makeKit(11);
    expect(driveUntil(k2, (x) => x.flight.state.waves === 1 && x.t.patrol.phase === PA_HUNT, 'hud', 60)).toBe(true);
    expect(k2.t.patrol.resultKind).toBe(2);
    for (let i = 0; i < 2.5 / DT + 2; i++) k2.step();
    expect(k2.t.patrol.resultKind).toBe(0);
  });
  it('出発時のテレメトリ（任務の値）と、哨戒の無い世界では enabled false のまま', () => {
    const k = makeKit(11);
    const d = initPatrolTelemetry(k.w);
    expect([d.enabled, d.planes, d.quietKt, d.wakeDetectM, d.lockM, d.nearM, d.phase]).toEqual([true, 2, 14, 4200, 1500, 900, PA_HUNT]);
    expect(initPatrolTelemetry({ patrol: null, band: 'stop' }).enabled).toBe(false);
    expect(patrolResult({ patrol: null, band: 'stop' })).toBeNull();
    expect([PA_ORBIT, PA_LEAVE]).toEqual([2, 3]);
  });
});

describe('ソースの pin', () => {
  it('画面外の「敵機」の矢印は水上機・夜明けの空襲・夜の哨戒機のどれかがある任務で作る（?debug&nostrike の jp_02 でも夜の機）', () => {
    const src = readFileSync(new URL('../src/ui/hud-markers.ts', import.meta.url), 'utf8');
    expect(src).toContain('if (telemetry.seaplaneEnabled || telemetry.dawn.strikeEnabled || telemetry.patrol.enabled) this.planeMarker');
  });
  it('テレメトリの順: 水上機 → 夜の哨戒 → 夜明け（夜明けは来ているときだけ上書き）', () => {
    const src = readFileSync(new URL('../src/systems/mission-telemetry.ts', import.meta.url), 'utf8');
    const a = src.indexOf('refreshSeaplaneTelemetry(t, w, scratchPose)');
    const b = src.indexOf('refreshPatrolTelemetry(t, w, scratchPose)');
    const c = src.indexOf('refreshDawnTelemetry(t, w, scratchPose)');
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });
});
