// v0.7.1 S3（アートと音②：合成の効果音。spec-v0710 §5・§9.1・D5）: ループ 5 本の目標を決める純粋な観測器 core/sfx-loops を、偽のテレメトリで確かめる（spec §5 の表の行ごと）。
// 偽のテレメトリ（tests/sfx-loops-kit）は凍らせる（書き込めば投げる＝読むだけの証）。観測器が読む欄だけを持つ（ほかの欄に触れば undefined で数が狂う＝読む欄を固定する）。
// - engine: 速力帯で音量・速さの割合で rate・損傷と機関の不調で 3 Hz の揺れ・燃料切れと沈没は 0。 sea: 速さと暴風。 fire: 立ち上がり 0.3 秒・戻り 0.5 秒・始めのフレームはすぐ。 rain: 暴風の帯。
// - drone: 水上機・味方機・夜明けの空襲・夜の哨戒機と出撃・港の空襲（jp_03）の最大。HUD が機を知らせていない段（見つける前の哨戒・中断で去る・レーダーの前）は 0（D5）。
// 一時停止で 0 にするのは再生の側（ループの束。tests/sfx-engine-loops）＝観測器は一時停止を知らない（Hud が止まれば呼ばれない）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SFX_BAND_MAX_M, SFX_KEYS, SFX_LOOP_DRONE, SFX_LOOP_ENGINE, SFX_LOOP_FIRE, SFX_LOOP_RAIN, SFX_LOOP_RATE_MAX, SFX_LOOP_RATE_MIN, SFX_LOOP_SEA, SFX_TABLE } from '../src/config/sfx-config';
import { AS_T_FALLING, AS_T_INBOUND, AS_T_NONE, AS_T_ORBIT, AS_T_REST, AS_T_RUN } from '../src/core/air-strike-state';
import type { BoatTelemetry } from '../src/core/boat-telemetry';
import { ENGINE_FINAL, ENGINE_LIMP, ENGINE_OK, ENGINE_WARN } from '../src/core/engine-trouble';
import { EVA_NONE, EVA_REPASS, EVA_WAVE } from '../src/core/evac-telemetry';
import { FF_CHALLENGE, FF_DONE, FF_IDLE, FF_LEAVING, FF_STRAFE } from '../src/core/friendly';
import { PA_HUNT, PA_LEAVE, PA_OFF, PA_ORBIT, PA_PASS, PA_SORTIE } from '../src/core/patrol-air-state';
import { SP_APPROACH, SP_DONE, SP_FLARE_PASS, SP_IDLE, SP_LEAVING, SP_ORBIT, SP_OUT_BOMBED, SP_OUT_CANCELLED, SP_OUT_LOST, SP_OUT_NONE, SP_PATROL, SP_RUN } from '../src/core/seaplane';
import { LOOP_DRONE, LOOP_ENGINE, LOOP_FIRE, LOOP_RAIN, LOOP_SEA, SFX_LOOP_COUNT, SFX_LOOP_IDS, createSfxLoopState, createSfxLoopTargets, stepSfxLoops } from '../src/core/sfx-loops';
import { STORM_AHEAD, STORM_INSIDE, STORM_NEAR, STORM_NONE } from '../src/core/storm';
import { tel, type FakeTelemetry as Fake } from './sfx-loops-kit';

const MAX = 20; // 艇の最大の速さ m/s（試験の値）
const DT = 1 / 60;
/** 1 フレームだけ見た目標（始めのフレーム） */
function once(t: BoatTelemetry): { gain: number[]; rate: number[] } {
  const out = createSfxLoopTargets();
  stepSfxLoops(createSfxLoopState(MAX), t, DT, out);
  return { gain: Array.from(out.gain), rate: Array.from(out.rate) };
}
const drone = (t: BoatTelemetry): number => once(t).gain[LOOP_DRONE]!;
const D = SFX_LOOP_DRONE;

describe('ループの並びと始めの値', () => {
  it('5 本は SFX_KEYS のループと同じ順。目標は音量 0・rate 1 から。作るのは 1 回（step は同じ配列に書く）', () => {
    expect([...SFX_LOOP_IDS]).toEqual(SFX_KEYS.filter((k) => SFX_TABLE[k].loop));
    expect([LOOP_ENGINE, LOOP_SEA, LOOP_FIRE, LOOP_RAIN, LOOP_DRONE].map((i) => SFX_LOOP_IDS[i])).toEqual(['engine', 'sea', 'fire', 'rain', 'drone']);
    const out = createSfxLoopTargets();
    expect([Array.from(out.gain), Array.from(out.rate)]).toEqual([[0, 0, 0, 0, 0], [1, 1, 1, 1, 1]]);
    const { gain, rate } = out;
    stepSfxLoops(createSfxLoopState(MAX), tel(), DT, out);
    expect(out.gain).toBe(gain);
    expect(out.rate).toBe(rate);
    expect(gain.length).toBe(SFX_LOOP_COUNT);
  });
  it('静かな夜（止まっている・何も来ていない）: エンジンは停止の音量・海は一番小さく・火と雨と機は 0', () => {
    const r = once(tel());
    expect(r.gain).toEqual([SFX_LOOP_ENGINE.gainStop, SFX_LOOP_SEA.gainBase, 0, 0, 0]);
    expect(r.rate).toEqual([SFX_LOOP_ENGINE.rateBase, 1, 1, 1, D.rateMin]);
  });
});

describe('engine（spec §5）', () => {
  it('速力帯で音量: 停止 0.10・静音 0.16・巡航 0.38・全速 0.60（静音が本当に静か）', () => {
    const g = (step: string): number => once(tel({ targetStep: step })).gain[LOOP_ENGINE]!;
    expect([g('stop'), g('silent'), g('cruise'), g('full')]).toEqual([0.1, 0.16, 0.38, 0.6]);
    expect(g('silent') / g('full')).toBeLessThan(0.3);
  });
  it('rate ＝ 0.75 ＋ 0.75 ×（速さ ÷ 艇の最大）。割合は 0〜1 に収める。艇の最大が 0 でも落ちない', () => {
    const r = (v: number): number => once(tel({ speedMps: v })).rate[LOOP_ENGINE]!;
    expect([r(0), r(MAX / 2), r(MAX), r(MAX * 3), r(-5)]).toEqual([0.75, 1.125, 1.5, 1.5, 0.75]);
    const out = createSfxLoopTargets();
    stepSfxLoops(createSfxLoopState(0), tel({ speedMps: 10 }), DT, out);
    expect([out.rate[LOOP_ENGINE], out.gain[LOOP_SEA]]).toEqual([0.75, SFX_LOOP_SEA.gainBase]);
  });
  it('燃料切れ（漂流）と沈没（HP 0）は音量 0', () => {
    expect(once(tel({ targetStep: 'full', fuelEmpty: true })).gain[LOOP_ENGINE]).toBe(0);
    expect(once(tel({ targetStep: 'cruise', hp: 0 })).gain[LOOP_ENGINE]).toBe(0);
    expect(once(tel({ targetStep: 'cruise', hp: 1 })).gain[LOOP_ENGINE]).toBe(SFX_LOOP_ENGINE.gainCruise);
    // 止まったエンジンは rate を揺らさない（聞こえない値を 10 Hz で書き続けない）
    const s = createSfxLoopState(MAX);
    const out = createSfxLoopTargets();
    const rates = new Set<number>();
    for (let i = 0; i < 60; i++) { stepSfxLoops(s, tel({ speedMps: 3, hp: 0, engineDamaged: true, engine: { on: true, stage: ENGINE_LIMP } }), DT, out); rates.add(out.rate[LOOP_ENGINE]!); }
    expect([...rates]).toEqual([SFX_LOOP_ENGINE.rateBase + (SFX_LOOP_ENGINE.rateSpan * 3) / MAX]);
  });
  it('機関の損傷は rate を ±6%・3 Hz で揺らす。機関の不調（jp_05）の WARN・FINAL・LIMP は ±4・8・12%（大きい方）。不調の無い任務（on 偽）は段を見ない', () => {
    const swing = (t: BoatTelemetry): { lo: number; hi: number; flips: number } => {
      const s = createSfxLoopState(MAX);
      const out = createSfxLoopTargets();
      let lo = Infinity, hi = -Infinity, flips = 0, prev = 0;
      for (let i = 0; i < 120; i++) { // 2 秒
        stepSfxLoops(s, t, DT, out);
        const d = out.rate[LOOP_ENGINE]! - 1.125;
        lo = Math.min(lo, d); hi = Math.max(hi, d);
        if (prev !== 0 && Math.sign(d) !== Math.sign(prev)) flips++;
        if (d !== 0) prev = d;
      }
      return { lo: lo / 1.125, hi: hi / 1.125, flips };
    };
    const half = { speedMps: MAX / 2 };
    expect(swing(tel(half))).toEqual({ lo: 0, hi: 0, flips: 0 });
    const dmg = swing(tel({ ...half, engineDamaged: true }));
    expect(dmg.hi).toBeCloseTo(SFX_LOOP_ENGINE.damagedWobble, 2);
    expect(dmg.lo).toBeCloseTo(-SFX_LOOP_ENGINE.damagedWobble, 2);
    expect(Math.abs(dmg.flips - 2 * SFX_LOOP_ENGINE.wobbleHz * 2)).toBeLessThanOrEqual(1); // 3 Hz＝2 秒に 12 回 0 をまたぐ（端の丸めで ±1）
    const stage = (st: number, damaged = false): number => swing(tel({ ...half, engineDamaged: damaged, engine: { on: true, stage: st } })).hi;
    expect(stage(ENGINE_OK)).toBe(0);
    expect(stage(ENGINE_WARN)).toBeCloseTo(0.04, 2);
    expect(stage(ENGINE_FINAL)).toBeCloseTo(0.08, 2);
    expect(stage(ENGINE_LIMP)).toBeCloseTo(0.12, 2);
    expect(stage(ENGINE_WARN, true)).toBeCloseTo(0.06, 2); // 損傷の方が大きい
    expect(stage(ENGINE_LIMP, true)).toBeCloseTo(0.12, 2);
    expect(swing(tel({ ...half, engine: { on: false, stage: ENGINE_LIMP } })).hi).toBe(0);
  });
  it('rate は 0.5〜2 の内（全速で一番大きい揺れでも）', () => {
    const s = createSfxLoopState(MAX);
    const out = createSfxLoopTargets();
    for (const v of [0, MAX]) {
      for (let i = 0; i < 200; i++) {
        stepSfxLoops(s, tel({ speedMps: v, engineDamaged: true, engine: { on: true, stage: ENGINE_LIMP } }), DT, out);
        expect(out.rate[LOOP_ENGINE]).toBeGreaterThanOrEqual(SFX_LOOP_RATE_MIN);
        expect(out.rate[LOOP_ENGINE]).toBeLessThanOrEqual(SFX_LOOP_RATE_MAX);
      }
    }
  });
});

describe('sea・rain・fire（spec §5）', () => {
  it('sea ＝ 0.10 ＋ 0.14 × 速さの割合。暴風の帯の中は ＋0.10（近く・前方は足さない）。rate は 1', () => {
    const g = (v: number, storm = STORM_NONE): number => once(tel({ speedMps: v, stormState: storm })).gain[LOOP_SEA]!;
    expect(g(0)).toBeCloseTo(0.1, 9);
    expect(g(MAX / 2)).toBeCloseTo(0.17, 9);
    expect(g(MAX)).toBeCloseTo(0.24, 9);
    expect(g(MAX, STORM_INSIDE)).toBeCloseTo(0.34, 9);
    expect(g(MAX, STORM_NEAR)).toBeCloseTo(0.24, 9);
    expect(g(0, STORM_AHEAD)).toBeCloseTo(0.1, 9);
    expect(once(tel({ speedMps: MAX, stormState: STORM_INSIDE })).rate[LOOP_SEA]).toBe(1);
  });
  it('rain: 暴風の帯の中 0.40・近く 0.15・ほかは 0', () => {
    const g = (storm: number): number => once(tel({ stormState: storm })).gain[LOOP_RAIN]!;
    expect([g(STORM_INSIDE), g(STORM_NEAR), g(STORM_AHEAD), g(STORM_NONE)]).toEqual([SFX_LOOP_RAIN.gainInside, SFX_LOOP_RAIN.gainNear, 0, 0]);
    expect([SFX_LOOP_RAIN.gainInside, SFX_LOOP_RAIN.gainNear]).toEqual([0.4, 0.15]);
  });
  it('fire: 火が付くと 0.3 秒で 0.35 へ・消えると 0.5 秒で 0 へ（行き過ぎない）', () => {
    const s = createSfxLoopState(MAX);
    const out = createSfxLoopTargets();
    const run = (onFire: boolean, secs: number): number => { for (let i = 0; i < Math.round(secs * 60); i++) stepSfxLoops(s, tel({ onFire }), DT, out); return out.gain[LOOP_FIRE]!; };
    expect(run(false, 0.1)).toBe(0);
    expect(run(true, 0.15)).toBeCloseTo(SFX_LOOP_FIRE.gain / 2, 2);
    expect(run(true, 0.16)).toBe(SFX_LOOP_FIRE.gain);
    expect(run(true, 1)).toBe(SFX_LOOP_FIRE.gain);
    expect(run(false, 0.25)).toBeCloseTo(SFX_LOOP_FIRE.gain / 2, 2);
    expect(run(false, 0.26)).toBe(0);
    expect(run(false, 1)).toBe(0);
    expect([SFX_LOOP_FIRE.gain, SFX_LOOP_FIRE.riseS, SFX_LOOP_FIRE.fallS]).toEqual([0.35, 0.3, 0.5]);
  });
  it('始めのフレーム: 火災つきで出撃する夜は立ち上がりを待たずにその音量（ループは鳴る）。2 フレーム目からは立ち上がり・戻りの速さ', () => {
    expect(once(tel({ onFire: true })).gain[LOOP_FIRE]).toBe(SFX_LOOP_FIRE.gain);
    const s = createSfxLoopState(MAX);
    const out = createSfxLoopTargets();
    stepSfxLoops(s, tel(), DT, out);
    stepSfxLoops(s, tel({ onFire: true }), DT, out);
    expect(out.gain[LOOP_FIRE]).toBeCloseTo((SFX_LOOP_FIRE.gain / SFX_LOOP_FIRE.riseS) * DT, 9);
  });
});

describe('drone（spec §5・D5: HUD が機を知らせている段だけ）', () => {
  it('何も来ていなければ 0。距離の帯は単発と同じ境（400・1,500・4,000 m）で 0.40・0.30・0.20、それより遠くは 0.10', () => {
    expect(drone(tel())).toBe(0);
    const g = (d: number): number => drone(tel({ planePhase: SP_APPROACH, planeDistM: d }));
    expect([g(100), g(400), g(401), g(1500), g(1501), g(4000), g(4001), g(9000)]).toEqual([0.4, 0.4, 0.3, 0.3, 0.2, 0.2, 0.1, 0.1]);
    expect([...D.gainByBand, D.gainFar]).toEqual([D.gainNear, 0.3, 0.2, 0.1]);
    expect(D.gainByBand.length).toBe(SFX_BAND_MAX_M.length - 1);
  });
  it('水上機: 接近は距離の帯・照明弾の航過と旋回 0.40・爆撃進路 0.45・去る 0.20（見失った・爆撃した時だけ）。見つける前の哨戒・中断で去る・済みは 0', () => {
    expect(drone(tel({ planePhase: SP_FLARE_PASS }))).toBe(D.gainNear);
    expect(drone(tel({ planePhase: SP_ORBIT }))).toBe(D.gainNear);
    expect(drone(tel({ planePhase: SP_RUN }))).toBe(D.gainAttack);
    expect(drone(tel({ planePhase: SP_LEAVING, planeOutcome: SP_OUT_LOST }))).toBe(D.gainFriendlyLeaving);
    expect(drone(tel({ planePhase: SP_LEAVING, planeOutcome: SP_OUT_BOMBED }))).toBe(D.gainFriendlyLeaving);
    expect(drone(tel({ planePhase: SP_LEAVING, planeOutcome: SP_OUT_CANCELLED }))).toBe(0);
    expect(drone(tel({ planePhase: SP_PATROL, planeDistM: 100 }))).toBe(0);
    expect(drone(tel({ planePhase: SP_DONE }))).toBe(0);
  });
  it('味方機: 識別の要求・掃射 0.40、去る 0.20、済みは 0', () => {
    const g = (ph: number): number => drone(tel({ friendlyPhase: ph }));
    expect([g(FF_CHALLENGE), g(FF_STRAFE), g(FF_LEAVING), g(FF_DONE), g(FF_IDLE)]).toEqual([0.4, 0.4, 0.2, 0, 0]);
  });
  it('夜明けの空襲: 接近は距離の帯・旋回と突入と投下 0.45・波の合間 0.10・無ければ 0', () => {
    const g = (threat: number, d = NaN): number => drone(tel({ dawn: { threat, inboundDistM: d } }));
    expect([g(AS_T_INBOUND, 5000), g(AS_T_INBOUND, 1200), g(AS_T_INBOUND, 300)]).toEqual([0.1, 0.3, 0.4]);
    expect([g(AS_T_ORBIT), g(AS_T_RUN), g(AS_T_FALLING), g(AS_T_REST), g(AS_T_NONE)]).toEqual([0.45, 0.45, 0.45, 0.1, 0]);
    expect(g(AS_T_INBOUND)).toBe(D.gainFar); // 距離が数でなければ遠い扱い
  });
  it('夜の哨戒機（jp_02）: 捜索の接近・付近の捜索は距離の帯、去る間（結果の行）は 0.20、出撃は空襲と同じ。哨戒の間（レーダーの前・次の捜索まで）は 0。無い任務は見ない', () => {
    const g = (p: Partial<Fake['patrol']>): number => drone(tel({ patrol: { enabled: true, ...p } }));
    expect([g({ phase: PA_PASS, distM: 5000 }), g({ phase: PA_PASS, distM: 1000 }), g({ phase: PA_ORBIT, distM: 350 })]).toEqual([0.1, 0.3, 0.4]);
    expect(g({ phase: PA_HUNT, distM: NaN })).toBe(0);
    expect(g({ phase: PA_OFF })).toBe(0);
    expect([g({ phase: PA_LEAVE, distM: 900, resultKind: 1 }), g({ phase: PA_LEAVE, distM: 900, resultKind: 0 })]).toEqual([D.gainFriendlyLeaving, 0]);
    expect([g({ phase: PA_SORTIE, threat: AS_T_INBOUND, distM: 1200 }), g({ phase: PA_SORTIE, threat: AS_T_RUN }), g({ phase: PA_SORTIE, threat: AS_T_FALLING }), g({ phase: PA_SORTIE, threat: AS_T_REST })]).toEqual([0.3, 0.45, 0.45, 0.1]);
    expect(drone(tel({ patrol: { enabled: false, phase: PA_PASS, distM: 100 } }))).toBe(0);
  });
  it('港の空襲（jp_03）: 波の予告だけの間は 0.10・操作中の隊を狙う編隊がいれば 0.45・ほかの隊だけなら 0.25・予告し直しだけなら 0.10。決着の後と evac の無い任務は見ない', () => {
    const g = (e: Partial<Fake['evac']>): number => drone(tel({ evac: { enabled: true, control: 2, ...e } }));
    expect(g({})).toBe(0);
    expect(g({ annKind: EVA_WAVE, targetedMask: 0b000101 })).toBe(D.gainFar); // 予告の間は狙いのビットも立つ（まだ遠い）
    expect(g({ targetedMask: 0b000100 })).toBe(D.gainAttack);
    expect(g({ targetedMask: 0b100101 })).toBe(D.gainAttack);
    expect(g({ targetedMask: 0b100001 })).toBe(D.gainEvacOther);
    expect(g({ annKind: EVA_REPASS, targetedMask: 0b000001 })).toBe(D.gainEvacOther); // 戻ってくる編隊は近くにいる
    expect(g({ annKind: EVA_REPASS })).toBe(D.gainFar);
    expect(g({ settled: true, targetedMask: 0b000100 })).toBe(0);
    expect(drone(tel({ evac: { enabled: false, targetedMask: 0b000100, control: 2 } }))).toBe(0);
    expect(D.gainEvacOther).toBe(0.25);
    // 決着の後の敵機 4 機は夜明けの空襲の側で鳴る
    expect(drone(tel({ evac: { enabled: true, settled: true }, dawn: { threat: AS_T_RUN } }))).toBe(D.gainAttack);
  });
  it('出どころの最大を取る。rate は音量に比例して 0.9〜1.15（一番大きい 0.45 で 1.15）', () => {
    expect(drone(tel({ planePhase: SP_APPROACH, planeDistM: 3000, friendlyPhase: FF_STRAFE }))).toBe(0.4);
    expect(drone(tel({ friendlyPhase: FF_LEAVING, dawn: { threat: AS_T_RUN } }))).toBe(0.45);
    const r = (t: BoatTelemetry): number => once(t).rate[LOOP_DRONE]!;
    expect(r(tel())).toBe(D.rateMin);
    expect(r(tel({ dawn: { threat: AS_T_FALLING } }))).toBeCloseTo(D.rateMax, 9);
    expect(r(tel({ friendlyPhase: FF_LEAVING }))).toBeCloseTo(D.rateMin + ((D.rateMax - D.rateMin) * 0.2) / 0.45, 9);
    expect([D.rateMin, D.rateMax, D.gainAttack]).toEqual([0.9, 1.15, 0.45]);
  });
});

describe('観測器の作法（読むだけ・確保しない）', () => {
  it('凍らせたテレメトリで全部の出どころを通しても投げない（どの欄にも書かない）', () => {
    const s = createSfxLoopState(MAX);
    const out = createSfxLoopTargets();
    const busy = tel({
      speedMps: 12, targetStep: 'cruise', engineDamaged: true, onFire: true, stormState: STORM_INSIDE, planePhase: SP_RUN, friendlyPhase: FF_STRAFE,
      engine: { on: true, stage: ENGINE_FINAL }, dawn: { threat: AS_T_INBOUND, inboundDistM: 800 }, patrol: { enabled: true, phase: PA_SORTIE, threat: AS_T_ORBIT }, evac: { enabled: true, targetedMask: 3 },
    });
    expect(() => { for (let i = 0; i < 30; i++) stepSfxLoops(s, busy, DT, out); }).not.toThrow();
    for (let i = 0; i < SFX_LOOP_COUNT; i++) { expect(out.gain[i]).toBeGreaterThan(0); expect(out.gain[i]).toBeLessThanOrEqual(1); }
  });
  it('source: 口の本体は確保しない・テレメトリの型だけを読む・乱数と時計の口を使わない', () => {
    const src = readFileSync('src/core/sfx-loops.ts', 'utf8').replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
    const body = src.slice(src.indexOf('export function stepSfxLoops'));
    expect(body).not.toMatch(/\bnew\s|=>|\.(map|filter|slice|concat)\(|\{\s*\w+\s*:/);
    expect(src).not.toMatch(/Math\.random|SeededRng|Date\.now|performance/);
    expect(src).toContain("import type { BoatTelemetry } from './boat-telemetry';");
    // テレメトリへの代入が無い（t.・ev.・pa. の欄に書かない）
    expect(src).not.toMatch(/\b(t|ev|pa)\.[\w.]+\s*(?:[-+*/|&]?=(?!=)|\+\+|--)/);
  });
});
