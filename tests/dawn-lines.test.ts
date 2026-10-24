// 夜明け（v0.6.1。spec §8・§10-6）の HUD と Result の文（ui/dawn-lines）、2 行目の優先順（ui/mission-mode の空襲の 2 つ）、
// 夜明けのテレメトリと Result の材料（systems/dawn-telemetry）、Result の見出し（ui/result-heading）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { FIXED_STEP_S } from '../src/config/step-config';
import {
  AS_RUN,
  AS_T_FALLING,
  AS_T_INBOUND,
  AS_T_NONE,
  AS_T_ORBIT,
  AS_T_REST,
  AS_T_RUN,
  airStrikeActive,
  createAirStrike,
  startAirStrike,
  stepAirStrike,
  strikePose,
  type AirStrikeCheck,
  type AirStrikeParams,
  type AirStrikeState,
} from '../src/core/air-strike';
import type { BoatState, BoatTelemetry } from '../src/core/boat-motion';
import { createPtTelemetry } from '../src/core/pt-boats';
import { createConvoyTelemetry } from '../src/core/convoy';
import { createEngineTelemetry } from '../src/core/engine-trouble';
import { DAWN_AIR_ENEMY, DAWN_AIR_NONE, DAWN_AIR_OWN, createDawnResult, createDawnTelemetry, type DawnResult, type DawnTelemetry } from '../src/core/dawn-air';
import { FF_IDLE, FF_OUT_NONE, type AircraftPose } from '../src/core/friendly';
import { GUN_SAFE } from '../src/core/gun-battery';
import { CALL_DAWN, CALL_EXPENDED, CALL_FUEL, CALL_SUNK } from '../src/core/mission-flow';
import { SeededRng } from '../src/core/rng';
import { SP_IDLE, SP_OUT_NONE } from '../src/core/seaplane';
import { SHALLOW_APPROACHING, SHALLOW_NONE } from '../src/core/shallows';
import { STORM_NEAR, STORM_NONE } from '../src/core/storm';
import { dawnResult, initDawnTelemetry, refreshDawnTelemetry, type DawnTelemetryWorld } from '../src/systems/dawn-telemetry';
import { WorldDawn, type DawnStrike, type DawnWorldView } from '../src/systems/world-dawn';
import { buildWorldSetup, type WorldSetup } from '../src/systems/world-setup';
import { STRIKE_DODGE_RULE_JA, airRaidTagJa, clockJa, clockKey, compass8Ja, dawnBannerLines, dawnCallLabel, dawnResultLine, strikeKey, strikeLine } from '../src/ui/dawn-lines';
import { escortHitLine } from '../src/ui/hud-lines';
import { HUD_COLOR_STRONG, HUD_COLOR_WARN } from '../src/config/hud-text-config';
import { MISSION_ADRIFT, MISSION_CALL, MISSION_ESCORT_LOST, MISSION_NORMAL, MISSION_STORM, MISSION_STRIKE, MISSION_STRIKE_REST, MISSION_WAITING, missionMode } from '../src/ui/mission-mode';
import { resultDawnSuffixS, resultHeadingJa } from '../src/ui/result-heading';

const S01 = buildWorldSetup(gameData, 'us_01');
const S02 = buildWorldSetup(gameData, 'us_02');
const S06 = buildWorldSetup(gameData, 'jp_06');

/** 2 行目の優先順と文が読む項目だけの中立のテレメトリ（夜明け前・何も起きていない） */
function tele(dawn: Partial<DawnTelemetry> = {}, over: Partial<BoatTelemetry> = {}): BoatTelemetry {
  return {
    timeLeftS: 100,
    homeWaiting: false,
    fuelEmpty: false,
    escortEnabled: false,
    escortSunk: false,
    escortDistM: 0,
    escortLagWarnM: 400,
    planePhase: SP_IDLE,
    planeLocked: false,
    planeOutcome: SP_OUT_NONE,
    planeDx: NaN,
    planeDy: NaN,
    friendlyPhase: FF_IDLE,
    friendlyOutcome: FF_OUT_NONE,
    shallowState: SHALLOW_NONE,
    shallowAheadM: 0,
    shallowSafeKt: 10,
    gunMission: false,
    gunStatus: GUN_SAFE,
    bargesSunk: 0,
    bargesBeached: 0,
    bargesTotal: 0,
    bargeEscapeS: NaN,
    enemySighted: false,
    batteryInArc: false,
    batteryAlerted: false,
    stormState: STORM_NONE,
    stormFast: false,
    stormSafeKt: 12,
    pt: createPtTelemetry(), // 米PT の無い任務（v0.6.3。enabled false）
    convoy: createConvoyTelemetry(), // 輸送隊の無い任務（v0.6.4。enabled false）
    engine: createEngineTelemetry(), // 機関の不調の無い任務（v0.6.5。on false）
    ...over,
    dawn: { ...createDawnTelemetry(), ...dawn },
  } as BoatTelemetry;
}

/** HUD の文の幅の見積もり px（Menlo の半角 0.602 em・全角 1 em。v0.6.1 レビューで実測と 1% 以内） */
function textWidthPx(s: string, px: number): number {
  let w = 0;
  for (const ch of s) w += (ch.charCodeAt(0) < 0x2000 ? 0.602 : 1) * px;
  return w;
}
/** 2 行目（上中央）の幅の上限: 論理幅の下限 1280 から左右の HUD_MARGIN 24 と右上の丸ボタン（直径 96）の列を引く */
const STRIKE_LINE_MAX_PX = 1280 - 2 * (24 + 96);

/** 夜明けの後・敵の制空下（us_01 の値） */
const ENEMY: Partial<DawnTelemetry> = { reached: true, caughtOutside: true, air: DAWN_AIR_ENEMY, strikeEnabled: true, count: 4, fromJa: '東', nameJa: '零式水上観測機', labelJa: '昼の空は敵（日本の水上機）', vip: true };
const OWN: Partial<DawnTelemetry> = { reached: true, caughtOutside: true, air: DAWN_AIR_OWN, labelJa: '昼の空は味方（ヘンダーソン基地）' };

describe('2 行目の時計と「帰投せよ」の理由（spec §8.1）', () => {
  it('夜明け前は「夜明けまで N 秒」（切り上げ）、夜明けの後は「夜明け後 N 秒」（切り捨て）', () => {
    expect(clockJa(tele({}, { timeLeftS: 12.3 }))).toBe('夜明けまで 13 秒');
    expect(clockJa(tele({}, { timeLeftS: 0.01 }))).toBe('夜明けまで 1 秒');
    expect(clockJa(tele({ ...ENEMY, daylightS: 0 }, { timeLeftS: 0 }))).toBe('夜明け後 0 秒');
    expect(clockJa(tele({ ...ENEMY, daylightS: 41.97 }, { timeLeftS: 0 }))).toBe('夜明け後 41 秒');
    expect(clockJa(tele({ ...OWN, daylightS: 7.2 }, { timeLeftS: 0 }))).toBe('夜明け後 7 秒');
  });
  it('clockKey は表示の秒が変わったときだけ変わり、夜明けの前後で重ならない', () => {
    expect(clockKey(tele({}, { timeLeftS: 12.3 }))).toBe(13);
    expect(clockKey(tele({}, { timeLeftS: 12.01 }))).toBe(13);
    expect(clockKey(tele({}, { timeLeftS: 0.01 }))).toBe(1);
    const after = (s: number): number => clockKey(tele({ ...ENEMY, daylightS: s }, { timeLeftS: 0 }));
    expect(after(0)).toBe(-1);
    expect(after(0.99)).toBe(-1);
    expect(after(1)).toBe(-2);
    expect(after(59.5)).toBe(-60);
    // 夜明け前の最後（1）と夜明けの最初（-1）は別のキー＝文が組み直される
    const seen = new Set<number>();
    for (let k = 0; k < 600; k++) {
      const ms = k * 100;
      seen.add(ms < 30000 ? clockKey(tele({}, { timeLeftS: (30000 - ms) / 1000 })) : after((ms - 30000) / 1000));
    }
    expect(seen.size).toBe(30 + 30);
  });
  it('平常の行: 夜明けの後・敵の制空下だけ行の頭に「空襲下」を付ける（v0.6.2 実機 2 回目から 2 行目に時計は出さない。左上の時計と重なる）', () => {
    const normal = (t: BoatTelemetry): string => `${airRaidTagJa(t)}命中 0`;
    expect(normal(tele({}, { timeLeftS: 99.5 }))).toBe('命中 0');
    expect(normal(tele({ ...ENEMY, daylightS: 12.4 }, { timeLeftS: 0 }))).toBe('空襲下 ・ 命中 0');
    expect(normal(tele({ ...OWN, daylightS: 12.4 }, { timeLeftS: 0 }))).toBe('命中 0');
    // 敵の制空下でも夜明け前は付けない
    expect(airRaidTagJa(tele({ air: DAWN_AIR_ENEMY, strikeEnabled: true }))).toBe('');
  });
  it('CALL_DAWN の理由: 夜明け前「夜明け近し」、夜明けの後は「空襲下」／「夜明け」。燃料少・撃沈・大発の文は変えない', () => {
    expect(dawnCallLabel(CALL_DAWN, false, DAWN_AIR_NONE)).toBe('夜明け近し ');
    expect(dawnCallLabel(CALL_DAWN, false, DAWN_AIR_ENEMY)).toBe('空襲下 ');
    expect(dawnCallLabel(CALL_DAWN, true, DAWN_AIR_OWN)).toBe('夜明け ');
    expect(dawnCallLabel(CALL_FUEL, false, DAWN_AIR_ENEMY)).toBe('燃料少 ');
    expect(dawnCallLabel(CALL_SUNK, false, DAWN_AIR_ENEMY)).toBe('撃沈！');
    expect(dawnCallLabel(CALL_SUNK, true, DAWN_AIR_OWN)).toBe('撃破！');
    expect(dawnCallLabel(CALL_EXPENDED, true, DAWN_AIR_NONE)).toBe('大発なし ');
    // 帰投せよの行（mission-line と同じ組み方。v0.6.2 実機 2 回目から時計は付けない）
    const t = tele({ ...ENEMY, daylightS: 3.2 }, { timeLeftS: 0 });
    expect(`${dawnCallLabel(CALL_DAWN, false, t.dawn.air)}帰投せよ  800 m`).toBe('空襲下 帰投せよ  800 m');
    const o = tele({ ...OWN, daylightS: 3.2 }, { timeLeftS: 0 });
    expect(`${dawnCallLabel(CALL_DAWN, false, o.dawn.air)}帰投せよ  800 m`).toBe('夜明け 帰投せよ  800 m');
    // 2 行目の文を組む所（mission-line）に時計の関数が残っていない
    expect(readFileSync('src/ui/mission-line.ts', 'utf8')).not.toMatch(/clockJa\(/);
  });
});

describe('夜明けの空襲の行（spec §8.2）', () => {
  it('段ごとの文と色（自艇・僚艇）', () => {
    const line = (d: Partial<DawnTelemetry>, over: Partial<BoatTelemetry> = {}): [string, string] => {
      const l = strikeLine(tele({ ...ENEMY, ...d }, over), 0, false, false);
      return [l.text, l.color];
    };
    expect(line({ threat: AS_T_FALLING })).toEqual(['爆弾投下！ 転舵！', HUD_COLOR_WARN]);
    // 狙いが旋回の弧の先（投下の瞬間に旋回していた）なら「旋回と逆へ」（同じ向きに切り続けると当たる。レビュー [11]）
    expect(line({ threat: AS_T_FALLING, fallingArc: true })).toEqual(['爆弾投下！ 旋回と逆へ転舵！', HUD_COLOR_WARN]);
    expect(line({ threat: AS_T_FALLING, toEscort: true, plane: 1 })).toEqual(['爆弾投下（僚艇へ）！ 転舵して連れて逃げよ', HUD_COLOR_WARN]);
    expect(line({ threat: AS_T_RUN, plane: 0 })).toEqual([`爆撃進路 ・ 1 番機 ・ ${STRIKE_DODGE_RULE_JA}`, HUD_COLOR_WARN]);
    expect(STRIKE_DODGE_RULE_JA).toBe('投下で転舵（旋回中は逆へ）');
    expect(line({ threat: AS_T_RUN, plane: 1, toEscort: true })).toEqual(['爆撃進路（僚艇へ） ・ 2 番機 ・ 投下で転舵', HUD_COLOR_WARN]);
    expect(line({ threat: AS_T_INBOUND, inboundDistM: 3601 })).toEqual(['空襲！ 敵機 4 機 ・ 東から 3700 m ・ 帰投を急げ', HUD_COLOR_WARN]);
    expect(line({ threat: AS_T_INBOUND, inboundDistM: 700 })).toEqual(['空襲！ 敵機 4 機 ・ 東から 700 m ・ 帰投を急げ', HUD_COLOR_WARN]);
    expect(line({ threat: AS_T_ORBIT, plane: 3, bombsLeft: 5 })).toEqual(['敵機 旋回 ・ 次は 4 番機 ・ 残り爆弾 5', HUD_COLOR_STRONG]);
    expect(line({ threat: AS_T_REST, restS: 27.2 })).toEqual(['敵機 去る ・ 次の空襲まで 28 秒 ・ 帰投を急げ', HUD_COLOR_STRONG]);
  });
  it('浅瀬・暴風の警告を後ろに付ける（hud-lines の withWarnings）', () => {
    expect(strikeLine(tele({ ...ENEMY, threat: AS_T_FALLING }, { shallowState: SHALLOW_APPROACHING, shallowAheadM: 140 }), 3, false, false).text).toBe('爆弾投下！ 転舵！ ・ 浅瀬 150 m 減速');
    expect(strikeLine(tele({ ...ENEMY, threat: AS_T_RUN, plane: 2 }), 0, true, false).text).toBe('爆撃進路 ・ 3 番機 ・ 投下で転舵（旋回中は逆へ） ・ 暴風 12 kt 以下');
  });
  it('僚艇が浮いていれば僚艇の HP（被弾の直後は「被弾！」で警告色）を警告の前に付ける。沈んだ・僚艇の無い任務は付けない（レビュー [13]）', () => {
    const vip: Partial<BoatTelemetry> = { escortEnabled: true, escortHp: 19.2, escortHpMax: 90 };
    const l = (d: Partial<DawnTelemetry>, over: Partial<BoatTelemetry>, hit: boolean, shallowStep = 0): [string, string] => {
      const x = strikeLine(tele({ ...ENEMY, ...d }, over), shallowStep, false, hit);
      return [x.text, x.color];
    };
    expect(l({ threat: AS_T_RUN, plane: 0 }, vip, false)).toEqual(['爆撃進路 ・ 1 番機 ・ 投下で転舵（旋回中は逆へ） ・ 僚艇 HP 20', HUD_COLOR_WARN]);
    expect(l({ threat: AS_T_RUN, plane: 0 }, { ...vip, shallowState: SHALLOW_APPROACHING, shallowAheadM: 140 }, true, 3)).toEqual(['爆撃進路 ・ 1 番機 ・ 投下で転舵（旋回中は逆へ） ・ 僚艇 被弾！ HP 20 ・ 浅瀬 150 m 減速', HUD_COLOR_WARN]);
    expect(l({ threat: AS_T_REST, restS: 27.2 }, vip, false)).toEqual(['敵機 去る ・ 次の空襲まで 28 秒 ・ 帰投を急げ ・ 僚艇 HP 20', HUD_COLOR_STRONG]);
    expect(l({ threat: AS_T_ORBIT, plane: 3, bombsLeft: 5 }, vip, true)).toEqual(['敵機 旋回 ・ 次は 4 番機 ・ 残り爆弾 5 ・ 僚艇 被弾！ HP 20', HUD_COLOR_WARN]);
    expect(l({ threat: AS_T_INBOUND, inboundDistM: 700 }, vip, false)[0]).toBe('空襲！ 敵機 4 機 ・ 東から 700 m ・ 帰投を急げ ・ 僚艇 HP 20');
    expect(l({ threat: AS_T_RUN, plane: 0 }, { ...vip, escortSunk: true }, false)[0]).toBe('爆撃進路 ・ 1 番機 ・ 投下で転舵（旋回中は逆へ）');
    expect(l({ threat: AS_T_RUN, plane: 0 }, {}, true)[0]).toBe('爆撃進路 ・ 1 番機 ・ 投下で転舵（旋回中は逆へ）');
  });
  it('僚艇の被弾の行: 夜明けの後の空襲の下は「転舵して連れて逃げよ」、夜・味方の制空下・空襲なしは「煙幕か光の外へ」（レビュー [13]）', () => {
    const vip: Partial<BoatTelemetry> = { escortEnabled: true, escortHp: 55, escortHpMax: 90 };
    expect(escortHitLine(tele({ ...ENEMY, threat: AS_T_REST }, vip))).toEqual({ text: '僚艇 被弾！ HP 55 / 90 ・ 転舵して連れて逃げよ', color: HUD_COLOR_WARN });
    expect(escortHitLine(tele({ air: DAWN_AIR_ENEMY, strikeEnabled: true }, vip)).text).toBe('僚艇 被弾！ HP 55 / 90 ・ 煙幕か光の外へ');
    expect(escortHitLine(tele({ ...OWN }, vip)).text).toBe('僚艇 被弾！ HP 55 / 90 ・ 煙幕か光の外へ');
    expect(escortHitLine(tele({ ...ENEMY, strikeEnabled: false }, vip)).text).toBe('僚艇 被弾！ HP 55 / 90 ・ 煙幕か光の外へ');
  });
  it('文の幅: 空襲の行は右上の丸ボタンの列にかからず（論理幅 1280）、夜明けの帯は画面に収まる（Menlo 0.602 em・全角 1 em の見積もり）', () => {
    // 最悪の組: 僚艇の被弾の直後・浅瀬の警告（3 桁 m。先読み 6 秒）・2 桁の秒と残り・接近は出現の距離
    const vip: Partial<BoatTelemetry> = { escortEnabled: true, escortHp: 90, escortHpMax: 90, shallowState: SHALLOW_APPROACHING, shallowAheadM: 940 };
    const sl = (d: Partial<DawnTelemetry>): string => strikeLine(tele({ ...ENEMY, ...d }, vip), 19, false, true).text;
    const worst = [
      sl({ threat: AS_T_RUN, plane: 3 }),
      sl({ threat: AS_T_RUN, plane: 3, toEscort: true }),
      sl({ threat: AS_T_FALLING, fallingArc: true }),
      sl({ threat: AS_T_FALLING, toEscort: true }),
      sl({ threat: AS_T_INBOUND, inboundDistM: S01.airStrike!.spawnM }),
      sl({ threat: AS_T_ORBIT, plane: 3, bombsLeft: 15 }),
      sl({ threat: AS_T_REST, restS: 99 }),
    ];
    for (const text of worst) expect(textWidthPx(text, 22), text).toBeLessThanOrEqual(STRIKE_LINE_MAX_PX);
    for (const p of [S01.airStrike!, S06.airStrike!]) {
      for (const l of dawnBannerLines(tele({ ...ENEMY, nameJa: p.nameJa, fromJa: '北西', count: p.planes }, { escortEnabled: true }))) expect(textWidthPx(l, 22), l).toBeLessThanOrEqual(1280 - 2 * 24);
    }
  });
  it('strikeKey は表示が変わるときだけ変わる（段・僚艇・番機・残り・秒・距離の刻み・浅瀬・暴風）', () => {
    const key = (d: Partial<DawnTelemetry>, over: Partial<BoatTelemetry> = {}): number => strikeKey(tele({ ...ENEMY, ...d }, over));
    const base = key({ threat: AS_T_RUN, plane: 0 });
    const variants = [
      key({ threat: AS_T_FALLING, plane: 0 }),
      key({ threat: AS_T_FALLING, plane: 0, fallingArc: true }),
      key({ threat: AS_T_RUN, plane: 0, toEscort: true }),
      key({ threat: AS_T_RUN, plane: 1 }),
      key({ threat: AS_T_RUN, plane: 0, bombsLeft: 1 }),
      key({ threat: AS_T_RUN, plane: 0 }, { shallowState: SHALLOW_APPROACHING, shallowAheadM: 140 }),
      key({ threat: AS_T_RUN, plane: 0 }, { shallowState: SHALLOW_APPROACHING, shallowAheadM: 90 }),
      key({ threat: AS_T_RUN, plane: 0 }, { stormState: STORM_NEAR, stormFast: true }),
    ];
    expect(new Set([base, ...variants]).size).toBe(variants.length + 1);
    // 接近は 100 m 刻み（切り上げ）、波の合間は 1 秒刻み（切り上げ）
    expect(key({ threat: AS_T_INBOUND, inboundDistM: 3550 })).toBe(key({ threat: AS_T_INBOUND, inboundDistM: 3510 }));
    expect(key({ threat: AS_T_INBOUND, inboundDistM: 3500 })).not.toBe(key({ threat: AS_T_INBOUND, inboundDistM: 3510 }));
    expect(key({ threat: AS_T_REST, restS: 27.9 })).toBe(key({ threat: AS_T_REST, restS: 27.1 }));
    expect(key({ threat: AS_T_REST, restS: 27 })).not.toBe(key({ threat: AS_T_REST, restS: 27.1 }));
    // 8 発以上を落としても重ならない（planeKey の 2 ビットとは別）。キーは正の 31 ビット
    expect(key({ threat: AS_T_ORBIT, plane: 0, bombsLeft: 8 })).not.toBe(key({ threat: AS_T_ORBIT, plane: 0, bombsLeft: 4 }));
    // 弧のビットは落下中だけ（ほかの段では文に出ない）。秒と距離は段で分かれる 1 つの欄（文に出ない方は見ない）
    expect(key({ threat: AS_T_RUN, plane: 0, fallingArc: true })).toBe(base);
    expect(key({ threat: AS_T_REST, restS: 27.2, inboundDistM: 3600 })).toBe(key({ threat: AS_T_REST, restS: 27.2 }));
    expect(key({ threat: AS_T_INBOUND, inboundDistM: 3600, restS: 12 })).toBe(key({ threat: AS_T_INBOUND, inboundDistM: 3600 }));
    const big = key({ threat: AS_T_FALLING, fallingArc: true, restS: 99, inboundDistM: 9999, plane: 3, bombsLeft: 99, toEscort: true }, { shallowState: 3, shallowAheadM: 5000, stormState: STORM_NEAR, stormFast: true });
    expect(big).toBeGreaterThan(0);
    expect(big).toBeLessThan(2 ** 31);
  });
});

describe('2 行目の優先順: 夜明けの空襲（ui/mission-mode。spec §8.2）', () => {
  it('空襲（接近〜落下）は燃料切れの下・僚艇の沈没の上。波の合間は帰投せよの上・暴風の情報の下。夜明け前と空襲の無い任務は前と同じ', () => {
    for (const th of [AS_T_INBOUND, AS_T_ORBIT, AS_T_RUN, AS_T_FALLING]) {
      expect(missionMode(tele({ ...ENEMY, threat: th }), CALL_DAWN, 0)).toBe(MISSION_STRIKE);
      expect(missionMode(tele({ ...ENEMY, threat: th }, { escortEnabled: true, escortSunk: true }), CALL_DAWN, 0)).toBe(MISSION_STRIKE);
      expect(missionMode(tele({ ...ENEMY, threat: th }, { fuelEmpty: true }), CALL_DAWN, 0)).toBe(MISSION_ADRIFT);
      expect(missionMode(tele({ ...ENEMY, threat: th }, { homeWaiting: true }), CALL_DAWN, 0)).toBe(MISSION_WAITING);
    }
    expect(missionMode(tele({ ...ENEMY, threat: AS_T_REST }), CALL_DAWN, 0)).toBe(MISSION_STRIKE_REST);
    expect(missionMode(tele({ ...ENEMY, threat: AS_T_REST }, { escortEnabled: true, escortSunk: true }), CALL_DAWN, 0)).toBe(MISSION_ESCORT_LOST);
    expect(missionMode(tele({ ...ENEMY, threat: AS_T_REST }, { stormState: STORM_NEAR }), CALL_DAWN, 0)).toBe(MISSION_STORM);
    expect(missionMode(tele({ ...ENEMY, threat: AS_T_NONE }), CALL_DAWN, 0)).toBe(MISSION_CALL);
    expect(missionMode(tele({ ...OWN }), CALL_DAWN, 0)).toBe(MISSION_CALL);
    expect(missionMode(tele(), 0, 0)).toBe(MISSION_NORMAL);
  });
});

describe('夜明けの帯（spec §8.3）', () => {
  it('敵の制空下は「夜明け — 空襲」と機・数・方角、us_01 は僚艇が浮いていれば 2 行目。味方の制空下と ?debug&nostrike は「夜明け」', () => {
    const p01 = S01.airStrike!;
    const p06 = S06.airStrike!;
    const enemy = (p: AirStrikeParams, vip: boolean, over: Partial<BoatTelemetry> = {}): readonly string[] =>
      dawnBannerLines(tele({ ...ENEMY, nameJa: p.nameJa, fromJa: p.fromJa, count: p.planes, vip }, over));
    expect(enemy(p01, true, { escortEnabled: true })).toEqual(['夜明け — 空襲', '零式水上観測機 4 機が東から来る ・ 投下で転舵（旋回中は逆へ）', '僚艇も狙われる ・ 自艇の転舵に僚艇が付いてくる']);
    expect(enemy(p01, true, { escortEnabled: true, escortSunk: true })).toEqual(['夜明け — 空襲', '零式水上観測機 4 機が東から来る ・ 投下で転舵（旋回中は逆へ）']);
    expect(enemy(p06, false)).toEqual(['夜明け — 空襲', '米艦載機（F6F 相当） 4 機が東から来る ・ 投下で転舵（旋回中は逆へ）']);
    // 帯と爆撃進路の行は同じ避け方の文
    expect(enemy(p06, false)[1]!.endsWith(STRIKE_DODGE_RULE_JA)).toBe(true);
    expect(dawnBannerLines(tele({ ...OWN }))).toEqual(['夜明け', '昼の空は味方（ヘンダーソン基地） ・ 敵機は来ない ・ 帰投せよ']);
    expect(dawnBannerLines(tele({ ...ENEMY, strikeEnabled: false }))).toEqual(['夜明け', '昼の空は敵（日本の水上機） ・ 敵機は来ない ・ 帰投せよ']);
  });
  it('compass8Ja は 8 方位', () => {
    expect([0, 44, 46, 90, 135, 180, 225, 270, 315, 359, -90].map(compass8Ja)).toEqual(['北', '北東', '北東', '東', '南東', '南', '南西', '西', '北西', '北', '西']);
  });
});

describe('Result の見出しと夜明けの行（spec §8.5）', () => {
  const res = (over: Partial<DawnResult>): DawnResult => ({ ...createDawnResult(), ...over });
  const strike = (over: Partial<NonNullable<DawnResult['strike']>> = {}): NonNullable<DawnResult['strike']> => ({
    waves: 2,
    bombs: 11,
    bombsAtEscort: 5,
    hitsPlayer: 2,
    hitsEscort: 1,
    damagePlayer: 70,
    dodgeS: [0.42, NaN, 0.61, 1.25, 0.3, NaN, 0.5, 0.71, 0.9],
    vip: true,
    ...over,
  });
  it('見出し: 夜明け前の帰投・夜明けの後の帰投・空襲で沈没・ほかの終わり（ハード・史実は後ろ）', () => {
    const head = (reason: Parameters<typeof resultHeadingJa>[0], returned: boolean, d: DawnResult, hard = false, hist = false): string => resultHeadingJa(reason, resultDawnSuffixS(returned, d), hard, hist);
    expect(head('returned', true, res({ timeLeftAtEndS: 40 }))).toBe('任務終了 — 帰投した');
    expect(head('returned', true, res({ reached: true, caughtOutside: false, daylightS: 3 }))).toBe('任務終了 — 帰投した');
    expect(head('returned', true, res({ reached: true, caughtOutside: true, daylightS: 41.6 }))).toBe('任務終了 — 帰投した（夜明け後 42 秒）');
    expect(head('air_strike', false, res({ reached: true, caughtOutside: true, daylightS: 63.2 }), true)).toBe('任務終了 — 夜明けの空襲で沈没（夜明け後 63 秒）（ハード）');
    expect(head('adrift', false, res({ reached: true, caughtOutside: true, daylightS: 300.4 }), false, true)).toBe('任務終了 — 燃料切れで漂流（夜明け後 300 秒）（史実）');
    expect(head('destroyed', false, res({ timeLeftAtEndS: 12 }))).toBe('任務終了 — 砲撃で沈没');
  });
  it('dawnResultLine: 敵の制空下（僚艇あり・なし）、味方の制空下、夜明け前の帰投、出さない場合', () => {
    const caught = { reached: true, caughtOutside: true, daylightS: 61.6, air: DAWN_AIR_ENEMY, labelJa: '昼の空は敵（日本の水上機）' };
    expect(dawnResultLine(res({ ...caught, strike: strike() }), true)).toBe('夜明け後 62 秒 ・ 空襲 2 波 ・ 爆弾 11 発（自艇 6・僚艇 5） ・ 命中 自艇 2・僚艇 1 ・ 転舵 0.4/—/0.6/1.3/0.3/—/0.5/0.7 秒');
    expect(dawnResultLine(res({ ...caught, strike: strike({ vip: false, bombsAtEscort: 0, hitsEscort: 0, bombs: 3, hitsPlayer: 1, waves: 1, dodgeS: [NaN, 0.34, 0.8] }) }), false)).toBe('夜明け後 62 秒 ・ 空襲 1 波 ・ 爆弾 3 発 ・ 命中 1 ・ 転舵 —/0.3/0.8 秒');
    // 自艇を狙った爆弾がまだ無い（最初の投下の前に帰った）は転舵を付けない
    expect(dawnResultLine(res({ ...caught, strike: strike({ vip: false, bombs: 0, bombsAtEscort: 0, hitsPlayer: 0, hitsEscort: 0, waves: 1, dodgeS: [] }) }), true)).toBe('夜明け後 62 秒 ・ 空襲 1 波 ・ 爆弾 0 発 ・ 命中 0');
    expect(dawnResultLine(res({ reached: true, caughtOutside: true, daylightS: 20.2, air: DAWN_AIR_OWN, labelJa: '昼の空は味方（ヘンダーソン基地）' }), true)).toBe('夜明け後 20 秒 ・ 昼の空は味方（ヘンダーソン基地）（敵機は来ない）');
    expect(dawnResultLine(res({ timeLeftAtEndS: 37.2 }), true)).toBe('夜明け: 前に帰投（残り 38 秒）');
    expect(dawnResultLine(res({ reached: true, caughtOutside: false, timeLeftAtEndS: 0 }), true)).toBe('夜明け: 前に帰投（残り 0 秒）');
    expect(dawnResultLine(res({ timeLeftAtEndS: 37.2 }), false)).toBeNull();
    expect(dawnResultLine(res({ reached: true, caughtOutside: false }), false)).toBeNull();
  });
});

// ---------- systems/dawn-telemetry（本物の core/air-strike の状態で） ----------

const DT = FIXED_STEP_S;
const fakeScene = { cameras: { main: { setBackgroundColor: () => undefined } } } as never;

/** 本物の AirStrikeState を持つ口（空襲の世界側の Phaser の部分だけを省く） */
function liveStrike(p: AirStrikeParams): DawnStrike & { state: AirStrikeState } {
  const state = createAirStrike(p);
  return {
    state,
    p,
    get active() {
      return airStrikeActive(state);
    },
    start: (player: BoatState) => startAirStrike(state, p, player),
    step: () => undefined,
    updateVisuals: () => undefined,
    destroy: () => undefined,
  };
}

function world(setup: WorldSetup): { w: DawnTelemetryWorld & { stepTimeS: number }; view: DawnWorldView & { stepTimeS: number }; strike: (DawnStrike & { state: AirStrikeState }) | null; player: BoatState } {
  const player: BoatState = { x: 5000, y: 5000, headingDeg: 0, speedMps: 0 };
  const strike = setup.airStrike ? liveStrike(setup.airStrike) : null;
  const dawn = new WorldDawn(fakeScene, setup, strike);
  const enemy = { shipsWithdrawn: 0, transportWithdrawn: false, bargesHidden: 0, bargesRunning: 0, allOut: false, shipDown: false, withdrawn: [] as number[], withdraw: (h: number): void => void enemy.withdrawn.push(h) };
  const view = { stepTimeS: 0, atHome: false, grounded: false, boat: { state: player, sinking: false }, escort: null, enemy };
  const w = { stepTimeS: 0, setup, dawn, enemy };
  return { w, view, strike, player };
}

describe('夜明けのテレメトリ（systems/dawn-telemetry）', () => {
  it('出発時: 任務の値（空の持ち主・空襲・機数・方角・機名・空の文・僚艇を狙う機）。夜明け前は空襲の段 NONE', () => {
    const d1 = initDawnTelemetry(world(S01).w);
    expect(d1).toMatchObject({ reached: false, air: DAWN_AIR_ENEMY, strikeEnabled: true, threat: AS_T_NONE, count: 4, fromJa: '東', nameJa: '零式水上観測機', labelJa: '昼の空は敵（日本の水上機）', vip: true, plane: -1 });
    expect(initDawnTelemetry(world(S06).w)).toMatchObject({ air: DAWN_AIR_ENEMY, strikeEnabled: true, count: 4, nameJa: '米艦載機（F6F 相当）', labelJa: '昼の空は敵（米艦載機）', vip: false });
    expect(initDawnTelemetry(world(S02).w)).toMatchObject({ air: DAWN_AIR_OWN, strikeEnabled: false, count: 0, nameJa: '', labelJa: '昼の空は味方（ヘンダーソン基地）', vip: false });
    const nostrike = buildWorldSetup(gameData, 'us_01', { strikeOff: true });
    expect(initDawnTelemetry(world(nostrike).w)).toMatchObject({ air: DAWN_AIR_ENEMY, strikeEnabled: false, count: 0 });
  });
  it('空襲の段ごとの材料と「敵機」の矢印（印の機の相対位置で上書き。水上機の値は印の機が無ければ残る）', () => {
    const { w, view, strike, player } = world(S06);
    const s = strike!.state;
    const p = strike!.p;
    const t = tele(initDawnTelemetry(w));
    const scratch: AircraftPose = { dx: 0, dy: 0, headingDeg: 0, alpha: 0 };
    refreshDawnTelemetry(t, w, scratch);
    expect(t.dawn.threat).toBe(AS_T_NONE);
    expect(t.planeDx).toBeNaN();
    // 夜明け: ラッチ（輪の外）→ 空襲が始まる
    w.stepTimeS = view.stepTimeS = S06.durationS + 0.5;
    w.dawn.latch(view);
    refreshDawnTelemetry(t, w, scratch);
    expect(t.dawn.reached).toBe(true);
    expect(t.dawn.caughtOutside).toBe(true);
    expect(t.dawn.daylightS).toBeCloseTo(0.5, 9);
    expect(t.dawn.threat).toBe(AS_T_INBOUND);
    expect(t.dawn.inboundDistM).toBe(p.spawnM);
    expect(t.planeDx).toBeCloseTo(p.spawnM * Math.sin(((p.fromBearingDeg + p.spawnOffsetsDeg[0]!) * Math.PI) / 180), 6);
    const c: AirStrikeCheck = { player, playerSinking: false, escort: null, escortAfloat: false, cancel: false };
    const rng = new SeededRng(7);
    const seen = new Set<number>();
    let restSeen = false;
    // 1 波の投下・波の合間（REST）を通り、2 波目の接近の途中（最初の進路の前）で止める（以前の 70 秒と同じ意味。秒は data から）
    const per = p.planes * p.bombsPerPlane;
    const wave2StartS = p.firstRunS + p.runS + (per - 1) * p.runGapS + p.waveRestS;
    for (let k = 0; k < Math.round((wave2StartS + p.firstRunS / 2) / DT); k++) {
      stepAirStrike(s, p, c, rng, DT);
      t.planeDx = NaN; // 水上機の段（来ていない）が毎フレーム NaN を書く
      t.planeDy = NaN;
      refreshDawnTelemetry(t, w, scratch);
      const d = t.dawn;
      seen.add(d.threat);
      if (d.threat === AS_T_RUN) {
        expect(s.planes[d.plane]!.phase).toBe(AS_RUN);
        const q = strikePose(s, p, d.plane, { dx: 0, dy: 0, headingDeg: 0, alpha: 0 });
        expect([t.planeDx, t.planeDy]).toEqual([q.dx, q.dy]);
      }
      if (d.threat === AS_T_ORBIT) {
        expect(d.plane).toBe(s.nextRun % p.planes);
        expect(d.bombsLeft).toBe(s.totalRuns - s.nextRun);
      }
      if (d.threat === AS_T_FALLING) expect(d.toEscort).toBe(false);
      if (d.threat === AS_T_REST) {
        restSeen = true;
        expect(d.restS).toBeGreaterThanOrEqual(0);
        expect(d.restS).toBeLessThanOrEqual(p.waveRestS);
        expect(d.plane).toBe(-1);
      } else expect(d.restS).toBeNaN();
      if (d.threat !== AS_T_INBOUND) expect(d.inboundDistM).toBeNaN();
      if (!airStrikeActive(s)) expect(t.planeDx).toBeNaN();
    }
    expect(restSeen).toBe(true);
    expect([...seen].sort()).toEqual([AS_T_INBOUND, AS_T_ORBIT, AS_T_RUN, AS_T_FALLING, AS_T_REST].sort());
    // Result の材料: 自艇を狙って着弾した爆弾の分だけ転舵の秒
    const r = dawnResult(w);
    expect(r).toMatchObject({ reached: true, caughtOutside: true, air: DAWN_AIR_ENEMY, labelJa: '昼の空は敵（米艦載機）', timeLeftAtEndS: 0 });
    expect(r.strike).not.toBeNull();
    expect(r.strike!.waves).toBe(s.waves);
    expect(r.strike!.bombs).toBe(p.planes * p.bombsPerPlane);
    expect(r.strike!.dodgeS.length).toBe(s.dodgeCount);
    expect(r.strike!.vip).toBe(false);
    expect(r.strike!.dodgeS).not.toBe(s.dodgeS);
  });
  it('us_01: 2・4 番機の爆撃進路と投下は僚艇へ（テレメトリ → 2 行目の文）、1・3 番機は自艇へ', () => {
    const { w, view, strike, player } = world(S01);
    const s = strike!.state;
    const p = strike!.p;
    const t = tele(initDawnTelemetry(w), { escortEnabled: true, escortHp: 90 });
    const scratch: AircraftPose = { dx: 0, dy: 0, headingDeg: 0, alpha: 0 };
    const escort: BoatState = { x: 5000, y: 5060, headingDeg: 0, speedMps: 0 };
    w.stepTimeS = view.stepTimeS = S01.durationS;
    w.dawn.latch(view);
    const c: AirStrikeCheck = { player, playerSinking: false, escort, escortAfloat: true, cancel: false };
    const rng = new SeededRng(3);
    const runs = new Map<number, string>();
    const falls = new Set<string>();
    for (let k = 0; k < Math.round(36 / DT); k++) {
      stepAirStrike(s, p, c, rng, DT);
      refreshDawnTelemetry(t, w, scratch);
      if (t.dawn.threat === AS_T_RUN) runs.set(t.dawn.plane, strikeLine(t, 0, false, false).text);
      if (t.dawn.threat === AS_T_FALLING) falls.add(strikeLine(t, 0, false, false).text);
    }
    expect([...runs.entries()].sort((a, b) => a[0] - b[0])).toEqual([
      [0, '爆撃進路 ・ 1 番機 ・ 投下で転舵（旋回中は逆へ） ・ 僚艇 HP 90'],
      [1, '爆撃進路（僚艇へ） ・ 2 番機 ・ 投下で転舵 ・ 僚艇 HP 90'],
      [2, '爆撃進路 ・ 3 番機 ・ 投下で転舵（旋回中は逆へ） ・ 僚艇 HP 90'],
      [3, '爆撃進路（僚艇へ） ・ 4 番機 ・ 投下で転舵 ・ 僚艇 HP 90'],
    ]);
    // 止まっている自艇（旋回率 0）への投下は直進の狙い＝「転舵！」
    expect([...falls].sort()).toEqual(['爆弾投下！ 転舵！ ・ 僚艇 HP 90', '爆弾投下（僚艇へ）！ 転舵して連れて逃げよ ・ 僚艇 HP 90'].sort());
    const r = dawnResult(w).strike!;
    expect([r.bombs, r.bombsAtEscort, r.vip]).toEqual([8, 4, true]);
    expect(r.dodgeS.length).toBe(4);
  });
  it('波ごとに方角が回る: 接近の行の「〜から」は 東 → 南 → 西 → 北 → 東（wave_rotate_deg 90°。画面外の矢印の機と同じ側。レビュー [10]）', () => {
    const { w, view, strike, player } = world(S06);
    const s = strike!.state;
    const p = strike!.p;
    const t = tele(initDawnTelemetry(w));
    const scratch: AircraftPose = { dx: 0, dy: 0, headingDeg: 0, alpha: 0 };
    w.stepTimeS = view.stepTimeS = S06.durationS;
    w.dawn.latch(view);
    refreshDawnTelemetry(t, w, scratch);
    expect(dawnBannerLines(t)[1]).toContain('東から来る'); // 帯は最初の波
    const c: AirStrikeCheck = { player, playerSinking: false, escort: null, escortAfloat: false, cancel: false };
    const rng = new SeededRng(5);
    const byWave = new Map<number, string>();
    // 5 波目（wave 4）の接近の途中まで。6 波目は来ない（以前の 270 秒と同じ意味。波の周期は data から）
    const per = p.planes * p.bombsPerPlane;
    const periodS = p.firstRunS + p.runS + (per - 1) * p.runGapS + p.waveRestS;
    for (let k = 0; k < Math.round((4 * periodS + p.firstRunS / 2) / DT) && s.wave < 5; k++) {
      stepAirStrike(s, p, c, rng, DT);
      refreshDawnTelemetry(t, w, scratch);
      if (t.dawn.threat !== AS_T_INBOUND) continue;
      const text = strikeLine(t, 0, false, false).text;
      expect(text).toContain(`・ ${t.dawn.fromJa}から `);
      // 画面外の矢印（印の機の相対位置）の方位も同じ側（機の散らばりは ±30° の中）
      const arrowDeg = (Math.atan2(t.planeDx, -t.planeDy) * 180) / Math.PI;
      const centreDeg = p.fromBearingDeg + s.wave * p.waveRotateDeg;
      expect(Math.abs((((arrowDeg - centreDeg) % 360) + 540) % 360 - 180)).toBeLessThanOrEqual(30 + 1e-6);
      if (!byWave.has(s.wave)) byWave.set(s.wave, t.dawn.fromJa);
      else expect(t.dawn.fromJa).toBe(byWave.get(s.wave));
    }
    expect([...byWave.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1])).toEqual(['東', '南', '西', '北', '東']);
  });
  it('投下の瞬間に旋回していれば落下中の行は「旋回と逆へ転舵！」（狙いの弧の判定は predictBoat と同じ: aim_turn_min_deg_s 未満は直進。レビュー [11]）', () => {
    const fallTexts = (yawDegPerGameS: number): Set<string> => {
      const { w, view, strike, player } = world(S06);
      const s = strike!.state;
      const p = strike!.p;
      const t = tele(initDawnTelemetry(w));
      const scratch: AircraftPose = { dx: 0, dy: 0, headingDeg: 0, alpha: 0 };
      player.speedMps = 10;
      w.stepTimeS = view.stepTimeS = S06.durationS;
      w.dawn.latch(view);
      const c: AirStrikeCheck = { player, playerSinking: false, escort: null, escortAfloat: false, cancel: false };
      const rng = new SeededRng(9);
      const out = new Set<string>();
      for (let k = 0; k < Math.round(40 / DT); k++) {
        player.headingDeg = (player.headingDeg + yawDegPerGameS * DT * p.timeScale + 360) % 360;
        stepAirStrike(s, p, c, rng, DT);
        refreshDawnTelemetry(t, w, scratch);
        if (t.dawn.threat !== AS_T_FALLING) {
          expect(t.dawn.fallingArc).toBe(false);
          continue;
        }
        const b = s.bombs.find((x) => x.active)!;
        expect(t.dawn.fallingArc).toBe(Math.abs(b.yawDegS) >= p.aimTurnMinDegS);
        out.add(strikeLine(t, 0, false, false).text);
      }
      return out;
    };
    const p = S06.airStrike!;
    expect([...fallTexts(12)]).toEqual(['爆弾投下！ 旋回と逆へ転舵！']);
    expect([...fallTexts(-12)]).toEqual(['爆弾投下！ 旋回と逆へ転舵！']);
    expect([...fallTexts(p.aimTurnMinDegS * 0.5)]).toEqual(['爆弾投下！ 転舵！']);
    expect([...fallTexts(0)]).toEqual(['爆弾投下！ 転舵！']);
  });
  it('夜明け前に終わった任務と空襲の無い任務の Result の材料', () => {
    const a = world(S01);
    a.w.stepTimeS = S01.durationS - 37.2;
    expect(dawnResult(a.w)).toMatchObject({ reached: false, caughtOutside: false, daylightS: 0, air: DAWN_AIR_ENEMY });
    expect(dawnResult(a.w).timeLeftAtEndS).toBeCloseTo(37.2, 9);
    expect(dawnResult(a.w).strike).toMatchObject({ waves: 0, bombs: 0, vip: true, dodgeS: [] });
    const b = world(S02);
    b.w.stepTimeS = b.view.stepTimeS = S02.durationS + 5;
    b.w.dawn.latch(b.view);
    expect(dawnResult(b.w)).toMatchObject({ reached: true, caughtOutside: true, daylightS: 5, air: DAWN_AIR_OWN, strike: null });
  });
});
