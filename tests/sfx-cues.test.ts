// v0.7.1 S4（spec-v0710 §3.2・§9.1）: 状態の合図の観測器（core/sfx-cues）を偽のテレメトリ（tests/sfx-loops-kit。凍らせる＝読むだけ）で固定する。
// - §3.2 の各行は立ち上がり（通し番号の変化）で 1 回だけ鳴る（同じ状態が続いても繰り返さない）・冷却の内の立ち上がりは捨てる・始めのフレームは鳴らさない。
// - 魚雷の発射は一斉でも 1 本ずつ 0.15 秒の間で。被弾は HP が 1 フレームに 0.5 より多く減った時だけ（火災の継続の被害では鳴らない）。jp_03 の［切替］のフレームは艇の値を写すだけ。
// - 冷却はゲームの時計（渡された dt の和）＝一時停止の間（update が呼ばれない）は進まない。鐘は同じフレームに 2 つ来ても 1 打。
import { describe, expect, it } from 'vitest';
import { SFX_CUE, SFX_KEYS, SFX_TABLE, type SfxKey } from '../src/config/sfx-config';
import { AS_T_FALLING, AS_T_RUN } from '../src/core/air-strike-state';
import { ENGINE_EV_FINAL, ENGINE_EV_LIMP, ENGINE_EV_RECOVER, ENGINE_EV_WARN } from '../src/core/engine-trouble';
import { FF_CHALLENGE, FF_OUT_IDENTIFIED, FF_STRAFE } from '../src/core/friendly';
import { LE_CALM, LE_DONE, LE_HIT, LE_HURRIED, LE_LIT_SALVO } from '../src/core/landing';
import { SHALLOW_APPROACHING, SHALLOW_GROUNDED } from '../src/core/shallows';
import { createSfxCueState, stepSfxCues, type SfxCueSink, type SfxCueState } from '../src/core/sfx-cues';
import { tel, type FakeOver } from './sfx-loops-kit';

const DT = 1 / 60;
type Heard = [key: SfxKey, gain: number, rate: number, delayS: number];

class Rec implements SfxCueSink {
  readonly heard: Heard[] = [];
  cue(key: SfxKey, gain: number, rate: number, delayS: number): void { this.heard.push([key, gain, rate, delayS]); }
  keys(): SfxKey[] { return this.heard.map((h) => h[0]); }
}

/** 観測器を作って、始めのフレーム base を見せる（鳴らない）。step で次のフレームを見せる */
function start(base: FakeOver = {}): { s: SfxCueState; r: Rec; step: (o: FakeOver, frames?: number, dt?: number) => Heard[] } {
  const s = createSfxCueState();
  const r = new Rec();
  stepSfxCues(s, tel(base), DT, r);
  expect(r.heard).toEqual([]);
  const step = (o: FakeOver, frames = 1, dt = DT): Heard[] => {
    const from = r.heard.length;
    for (let i = 0; i < frames; i++) stepSfxCues(s, tel(o), dt, r);
    return r.heard.slice(from);
  };
  return { s, r, step };
}

describe('状態の合図（core/sfx-cues。spec §3.2）', () => {
  it('始めのフレームは鳴らさない（火災・燃料切れ・照らされた・発見・夜明けのまま始まる夜でも）。同じ状態が続いても鳴らない', () => {
    const all: FakeOver = {
      onFire: true, fuelEmpty: true, illuminated: true, starLit: true, playerDetected: true, planeFlareOn: true, planeBombAir: true, smokeLeftS: 3, gunReloadLeftS: 2, callFlags: 1,
      shallowState: SHALLOW_GROUNDED, engineDamaged: true, friendlyPhase: FF_CHALLENGE, friendlyOutcome: FF_OUT_IDENTIFIED, dawn: { reached: true, threat: AS_T_FALLING },
      engine: { on: true, eventSeq: 3, lastEvent: ENGINE_EV_WARN }, evac: { enabled: true, annSeq: 2, seatSeq: 1, falling: true }, landing: { enabled: true, eventSeq: 5, eventKind: LE_CALM },
      arms: { torpedoesAboard: 1, reloadN: 3 },
    };
    const { step } = start(all);
    expect(step(all, 600)).toEqual([]);
  });
  it('魚雷の発射: 積んでいる魚雷が減った分を 1 本ずつ 0.15 秒の間で（一斉 2 本＝2 回）。増えても鳴らない', () => {
    const { step } = start({ arms: { torpedoesAboard: 4 } });
    const first = step({ arms: { torpedoesAboard: 2 } });
    expect(first).toEqual([['torp_launch', 1, 1, 0]]);
    expect(step({ arms: { torpedoesAboard: 2 } }, 8)).toEqual([]); // 0.133 秒
    expect(step({ arms: { torpedoesAboard: 2 } }, 2).map((h) => h[0])).toEqual(['torp_launch']);
    expect(step({ arms: { torpedoesAboard: 2 } }, 60)).toEqual([]);
    expect(step({ arms: { torpedoesAboard: 4 } }, 10)).toEqual([]);
  });
  it('発見された！: 偽 → 真で alarm（冷却 4 秒。消えてすぐまた見つかっても鳴らさない）', () => {
    const { step } = start();
    expect(step({ playerDetected: true })).toEqual([['alarm', 1, 1, 0]]);
    step({ playerDetected: false }, 30);
    expect(step({ playerDetected: true })).toEqual([]);
    step({ playerDetected: false }, Math.ceil(SFX_CUE.alarmCooldownS / DT));
    expect(step({ playerDetected: true })).toEqual([['alarm', 1, 1, 0]]);
  });
  it('探照灯: illuminated の立ち上がりで light_on（星弾の時は flare_pop だけ）。星弾・照明弾・味方機の識別で flare_pop（冷却 2 秒）', () => {
    const a = start();
    expect(a.step({ illuminated: true })).toEqual([['light_on', 1, 1, 0]]);
    const b = start();
    expect(b.step({ illuminated: true, starLit: true })).toEqual([['flare_pop', 1, 1, 0]]);
    expect(b.step({ illuminated: false, starLit: false, planeFlareOn: true })).toEqual([]); // 冷却の内
    b.step({}, Math.ceil(SFX_CUE.flareCooldownS / DT));
    expect(b.step({ planeFlareOn: true })).toEqual([['flare_pop', 1, 1, 0]]);
    b.step({}, Math.ceil(SFX_CUE.flareCooldownS / DT));
    expect(b.step({ friendlyOutcome: FF_OUT_IDENTIFIED })).toEqual([['flare_pop', 1, 1, 0]]);
  });
  it('被弾: HP が 1 フレームに 0.5 より多く減ったら hull_hit（冷却 2 秒＝S5。被弾の爆発の音は毎回）。火災の継続の被害（毎秒 2 HP）では鳴らない', () => {
    expect(SFX_CUE.hullCooldownS).toBe(2);
    const { step } = start({ hp: 100 });
    expect(step({ hp: 92 })).toEqual([['hull_hit', 1, 1, 0]]);
    expect(step({ hp: 84 })).toEqual([]); // 冷却の内
    let hp = 84;
    for (let i = 0; i < 120; i++) { hp -= 2 * DT; expect(step({ hp, onFire: i < 119 })).toEqual(i === 119 ? [['smoke', 1, SFX_CUE.extinguishRate, 0]] : []); }
    expect(step({ hp: hp - 4 })).toEqual([['hull_hit', 1, 1, 0]]);
  });
  it('火災が消えた（沈んでいない）: smoke を rate 1.6。沈んで消えた時は鳴らさない。煙幕の展開（残り 0 → 正）は smoke', () => {
    const a = start({ onFire: true });
    expect(a.step({ onFire: false })).toEqual([['smoke', 1, SFX_CUE.extinguishRate, 0]]);
    const b = start({ onFire: true, hp: 10 });
    expect(b.step({ onFire: false, hp: 0 }).map((h) => h[0])).toEqual(['hull_hit']);
    const c = start();
    expect(c.step({ smokeLeftS: 8 })).toEqual([['smoke', 1, 1, 0]]);
    expect(c.step({ smokeLeftS: 7 }, 30)).toEqual([]);
  });
  it('弾倉の交換: 始め（reloadN か大発の砲の残り秒が 0 → 正）は reload、終わりは別の鍵 reload_end（IP2。どちらも rate 1＝同じ音を 2 回鳴らさない。冷却 0.5 秒）', () => {
    const { step } = start();
    expect(step({ arms: { reloadN: 4 } })).toEqual([['reload', 1, 1, 0]]);
    expect(step({ arms: { reloadN: 3 } }, 60)).toEqual([]);
    expect(step({})).toEqual([['reload_end', 1, 1, 0]]);
    expect('reloadEndRate' in SFX_CUE).toBe(false);
    expect(step({ gunReloadLeftS: 3.2 })).toEqual([]); // 終わりから 0.5 秒の内
    step({}, 30);
    expect(step({ gunReloadLeftS: 3.2 })).toEqual([['reload', 1, 1, 0]]);
  });
  it('機関: 損傷で engine_cough・燃料切れで rate 0.7・jp_05 の不調は出来事の段で 1.0／0.9／0.8、回復は低いボタンの音', () => {
    const a = start();
    expect(a.step({ engineDamaged: true })).toEqual([['engine_cough', 1, 1, 0]]);
    expect(a.step({ engineDamaged: true, fuelEmpty: true })).toEqual([['engine_cough', 1, SFX_CUE.fuelEmptyRate, 0]]);
    const b = start({ engine: { on: true, eventSeq: 0 } });
    const evs = [ENGINE_EV_WARN, ENGINE_EV_FINAL, ENGINE_EV_LIMP, ENGINE_EV_RECOVER];
    const gap = Math.ceil(SFX_CUE.coughCooldownS / DT) + 1;
    const got = evs.map((ev, i) => b.step({ engine: { on: true, eventSeq: i + 1, lastEvent: ev } }, gap));
    expect(got).toEqual([[['engine_cough', 1, 1, 0]], [['engine_cough', 1, 0.9, 0]], [['engine_cough', 1, 0.8, 0]], [['ui_tap', SFX_CUE.recoverGain, SFX_CUE.recoverRate, 0]]]);
  });
  it('機関の咳は 8 秒に 1 回まで（S5。jp_05 の過熱・限界の繰り返し）。不調（LIMP）・損傷・燃料切れは冷却の内でも鳴らす（段が上がった知らせ）', () => {
    expect(SFX_CUE.coughCooldownS).toBe(8);
    const b = start({ engine: { on: true, eventSeq: 0 } });
    const ev = (seq: number, lastEvent: number, frames = 1): Heard[] => b.step({ engine: { on: true, eventSeq: seq, lastEvent } }, frames);
    expect(ev(1, ENGINE_EV_WARN)).toEqual([['engine_cough', 1, 1, 0]]);
    expect(ev(2, ENGINE_EV_FINAL, 60)).toEqual([]); // 冷却の内の限界は落とす
    expect(ev(3, ENGINE_EV_LIMP)).toEqual([['engine_cough', 1, 0.8, 0]]); // 不調は鳴らす
    expect(ev(4, ENGINE_EV_RECOVER)).toEqual([['ui_tap', SFX_CUE.recoverGain, SFX_CUE.recoverRate, 0]]);
    expect(ev(5, ENGINE_EV_WARN, Math.ceil(SFX_CUE.coughCooldownS / DT) - 30)).toEqual([]); // 不調から 8 秒の内
    expect(b.step({ engine: { on: true, eventSeq: 5, lastEvent: ENGINE_EV_WARN }, engineDamaged: true })).toEqual([['engine_cough', 1, 1, 0]]); // 損傷は鳴らす
  });
  it('座礁: 浅瀬が SHALLOW_GROUNDED になったら blast_s を rate 0.6・0.4 秒遅らせて（爆発の口の dud と同じフレームでも最小間隔に落とされない）', () => {
    const { step } = start({ shallowState: SHALLOW_APPROACHING });
    expect(step({ shallowState: SHALLOW_GROUNDED })).toEqual([['blast_s', 1, SFX_CUE.groundRate, SFX_CUE.groundDelayS]]);
    expect(SFX_CUE.groundDelayS).toBeGreaterThan(SFX_TABLE.blast_s.minIntervalS);
    expect(step({ shallowState: SHALLOW_GROUNDED }, 30)).toEqual([]);
  });
  it('鐘: 帰投せよ（callFlags 0 → 非 0）は 1 打・夜明けは rate 0.7・同じフレームに来たら 1 打（夜明けの方）・揚陸完了も 1 打', () => {
    const a = start();
    expect(a.step({ callFlags: 4 })).toEqual([['bell', 1, 1, 0]]);
    expect(a.step({ callFlags: 6 }, 10)).toEqual([]);
    const b = start();
    expect(b.step({ callFlags: 1, dawn: { reached: true } })).toEqual([['bell', 1, SFX_CUE.dawnBellRate, 0]]);
    const c = start({ landing: { enabled: true, eventSeq: 1, eventKind: LE_HIT } });
    expect(c.step({ landing: { enabled: true, eventSeq: 2, eventKind: LE_DONE } })).toEqual([['bell', 1, 1, 0]]);
  });
  it('爆弾が落ちてくる: 水上機の爆弾・夜明けの空襲・夜の出撃の落下・jp_03 の操作中の隊への落下で bomb_fall（冷却 0.6 秒）', () => {
    const { step } = start();
    expect(step({ planeBombAir: true })).toEqual([['bomb_fall', 1, 1, 0]]);
    expect(step({ planeBombAir: true, dawn: { threat: AS_T_FALLING } })).toEqual([]); // 冷却の内
    step({ dawn: { threat: AS_T_RUN } }, 40);
    expect(step({ dawn: { threat: AS_T_FALLING } })).toEqual([['bomb_fall', 1, 1, 0]]);
    step({}, 40);
    expect(step({ patrol: { enabled: true, threat: AS_T_FALLING } })).toEqual([['bomb_fall', 1, 1, 0]]);
    step({}, 40);
    expect(step({ patrol: { enabled: false, threat: AS_T_FALLING } })).toEqual([]);
    expect(step({ evac: { enabled: true, falling: true } })).toEqual([['bomb_fall', 1, 1, 0]]);
  });
  it('jp_03: 予告（annSeq）で alarm を rate 0.7（冷却 3 秒）・［切替］（seatSeq）でボタンの音。切替のフレームの HP・火災の差は鳴らさない', () => {
    const { step } = start({ evac: { enabled: true, annSeq: 0, seatSeq: 0 }, hp: 60, onFire: true });
    expect(step({ evac: { enabled: true, annSeq: 1 }, hp: 60, onFire: true })).toEqual([['alarm', 1, SFX_CUE.raidAlarmRate, 0]]);
    expect(step({ evac: { enabled: true, annSeq: 2 }, hp: 60, onFire: true })).toEqual([]);
    expect(step({ evac: { enabled: true, annSeq: 2, seatSeq: 1 }, hp: 20, onFire: false })).toEqual([['ui_tap', 1, 1, 0]]);
    expect(step({ evac: { enabled: true, annSeq: 2, seatSeq: 1 }, hp: 20 }, 30)).toEqual([]);
  });
  it('jp_04: 米PT の雷撃の報告（静かに・慌てて・照らされて）で torp_launch を音量 0.6。命中などの報告は鳴らさない', () => {
    const { step } = start({ landing: { enabled: true } });
    const kinds = [LE_CALM, LE_HURRIED, LE_HIT, LE_LIT_SALVO];
    const got = kinds.map((k, i) => step({ landing: { enabled: true, eventSeq: i + 1, eventKind: k } }));
    expect(got).toEqual([[['torp_launch', SFX_CUE.ptSalvoGain, 1, 0]], [['torp_launch', SFX_CUE.ptSalvoGain, 1, 0]], [], [['torp_launch', SFX_CUE.ptSalvoGain, 1, 0]]]);
  });
  it('味方機の識別の要求（FF_CHALLENGE に）: alarm を rate 1.3・音量 0.6。掃射へ移っても鳴らさない', () => {
    const { step } = start();
    expect(step({ friendlyPhase: FF_CHALLENGE })).toEqual([['alarm', SFX_CUE.friendlyAlarmGain, SFX_CUE.friendlyAlarmRate, 0]]);
    expect(step({ friendlyPhase: FF_STRAFE }, 30)).toEqual([]);
  });
  it('冷却はゲームの時計: 一時停止の間（update が呼ばれない・dt 0 のフレーム）は進まない', () => {
    const { step } = start();
    expect(step({ playerDetected: true }).length).toBe(1);
    step({ playerDetected: false }, 1000, 0);
    expect(step({ playerDetected: true })).toEqual([]);
  });
  it('鳴らす鍵はどれも SFX_KEYS にあり、rate は 0.5〜2 の内（L6）', () => {
    const c = SFX_CUE;
    for (const r of [c.extinguishRate, ...c.engineStageRate, c.recoverRate, c.fuelEmptyRate, c.groundRate, c.dawnBellRate, c.raidAlarmRate, c.friendlyAlarmRate]) {
      expect(r).toBeGreaterThanOrEqual(0.5);
      expect(r).toBeLessThanOrEqual(2);
    }
    expect(SFX_KEYS).toEqual(expect.arrayContaining(['torp_launch', 'alarm', 'light_on', 'flare_pop', 'hull_hit', 'smoke', 'reload', 'reload_end', 'engine_cough', 'blast_s', 'bell', 'bomb_fall', 'ui_tap']));
  });
});
