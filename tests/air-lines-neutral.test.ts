// v0.6.7 S0 の先に書く pin（spec-v067 D19・§E.2）: 今の敵の水上機（us_02）と夜明けの空襲（us_01・jp_06・jp_01）の 2 行目の [モード, 文, 色, キー] を、決まったテレメトリの組で literal に固める。
// S0 の移動（ui/mission-line の空の行を ui/mission-line-air へ・ui/dawn-lines の句の切り出し）と S5 の夜の哨戒機の足し算で、ほかの任務の字が 1 字も変わらない証拠（N7）。
// 水上機のキーは 746884c の ui/mission-line.ts:134-139 の式の写し（そこでしか組んでいなかった）。空襲のキーは ui/dawn-lines の strikeKey。浅瀬の刻みは mission-line:142 と同じ式。
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { HUD_COLOR_STRONG as STRONG, HUD_COLOR_WARN as WARN, HOME_COLOR_TEXT as HOME, PLANE_DISTANCE_STEP_M, SHALLOW_WARN_STEP_M } from '../src/config/hud-text-config';
import { AS_T_FALLING, AS_T_INBOUND, AS_T_ORBIT, AS_T_REST, AS_T_RUN } from '../src/core/air-strike';
import type { BoatTelemetry } from '../src/core/boat-motion';
import { DAWN_AIR_ENEMY, type DawnTelemetry } from '../src/core/dawn-air';
import { SP_APPROACH, SP_FLARE_PASS, SP_LEAVING, SP_ORBIT, SP_OUT_BOMBED, SP_OUT_LOST, SP_RUN } from '../src/core/seaplane';
import { SHALLOW_APPROACHING } from '../src/core/shallows';
import { buildWorldSetup } from '../src/systems/world-setup';
import { strikeKey, strikeLine } from '../src/ui/dawn-lines';
import { seaplaneLine } from '../src/ui/hud-lines';
import { MISSION_PLANE, MISSION_PLANE_ATTACK, MISSION_PLANE_RESULT, MISSION_STRIKE, MISSION_STRIKE_REST, missionMode, stormWarning } from '../src/ui/mission-mode';
import { tele } from './pt-ui-kit';

type Row = [number, string, string, number];
/** 746884c の mission-line の水上機のキー（段階・確定・航跡・照明弾・爆弾・落とした数・結果・撃沈・命中・距離の刻み） */
const planeKey746 = (t: BoatTelemetry, planeStep: number): number =>
  t.planePhase | (t.planeLocked ? 8 : 0) | (t.planeWake ? 16 : 0) | (t.planeFlareOn ? 32 : 0) | (t.planeBombAir ? 64 : 0) | (t.planeBombsDropped << 7) | (t.planeOutcome << 9) | (t.destroyerSunk ? 2048 : 0) | (t.planeBombsHit << 12) | (planeStep << 14);
/** mission-line と同じ順（モード → 刻み → 文とキー）。空の行のモードでなければ文・色・キーは空 */
function row(t: BoatTelemetry): Row {
  const mode = missionMode(t, 0, 0);
  const shallowStep = Math.ceil(t.shallowAheadM / SHALLOW_WARN_STEP_M);
  if (mode === MISSION_PLANE_ATTACK || mode === MISSION_PLANE || mode === MISSION_PLANE_RESULT) {
    const step = t.planePhase === SP_APPROACH ? Math.ceil(t.planeDistM / PLANE_DISTANCE_STEP_M) : 0;
    const l = seaplaneLine(t, step, shallowStep, stormWarning(t));
    return [mode, l.text, l.color, planeKey746(t, step)];
  }
  if (mode === MISSION_STRIKE || mode === MISSION_STRIKE_REST) {
    const l = strikeLine(t, shallowStep, stormWarning(t), false, false);
    return [mode, l.text, l.color, strikeKey(t)];
  }
  return [mode, '', '', 0];
}
const S02 = buildWorldSetup(gameData, 'us_02');
const PLANE0: Partial<BoatTelemetry> = { planePhase: SP_APPROACH, planeLocked: false, planeWake: false, planeWakeKt: S02.seaplane!.wakeThresholdKt, planeFlareOn: false, planeBombsDropped: 0, planeBombAir: false, planeBombsHit: 0, planeOutcome: 0, planeDistM: 0, destroyerSunk: false };
const plane = (o: Partial<BoatTelemetry>): Row => row(tele({ enabled: false }, { ...PLANE0, ...o }));
/** 夜明けの後・敵の制空下の dawn（任務の値は本物の setup の空襲から: 機数・方角・機名・空の文・僚艇を狙う機） */
function dawnOf(id: string): Partial<DawnTelemetry> {
  const S = buildWorldSetup(gameData, id);
  const p = S.airStrike!;
  return { reached: true, caughtOutside: true, air: DAWN_AIR_ENEMY, strikeEnabled: true, count: p.planes, fromJa: p.fromJa, nameJa: p.nameJa, labelJa: S.dawnAir.labelJa, vip: p.escortPlanes.includes(true) };
}
const strike = (id: string, d: Partial<DawnTelemetry>, over: Partial<BoatTelemetry> = {}): Row => {
  const t = tele(id === 'jp_01' ? {} : { enabled: false }, over); // jp_01 は米PT のいる任務（空襲の行は米PT の段の上。波の合間は米PT の平常の上）
  t.dawn = { ...t.dawn, ...dawnOf(id), ...d };
  return row(t);
};
const STRIKE_CASES: readonly [string, Partial<DawnTelemetry>, Partial<BoatTelemetry>?][] = [
  ['inbound', { threat: AS_T_INBOUND, inboundDistM: 3601 }],
  ['orbit', { threat: AS_T_ORBIT, plane: 1, bombsLeft: 6 }],
  ['run', { threat: AS_T_RUN, plane: 2, bombsLeft: 5 }],
  ['falling', { threat: AS_T_FALLING, plane: 2, bombsLeft: 4 }],
  ['fallingArc', { threat: AS_T_FALLING, plane: 3, bombsLeft: 3, fallingArc: true }],
  ['rest', { threat: AS_T_REST, restS: 12.3 }],
  ['runShallow', { threat: AS_T_RUN, plane: 0, bombsLeft: 8 }, { shallowState: SHALLOW_APPROACHING, shallowAheadM: 140 }],
];

describe('空の行の pin（746884c の字・色・キー）', () => {
  it('us_02 の水上機: 未確定の接近（航跡あり／なし）・発見・照明弾・爆撃進路・投下・旋回・結果（見失った／爆撃）', () => {
    const got = {
      wake: plane({ planeWake: true, planeDistM: 2345 }),
      quiet: plane({ planeDistM: 1501 }),
      locked: plane({ planeLocked: true, planeDistM: 1499 }),
      lockedShallow: plane({ planeLocked: true, planeDistM: 1200, shallowState: SHALLOW_APPROACHING, shallowAheadM: 140 }),
      flare: plane({ planePhase: SP_FLARE_PASS, planeLocked: true, planeFlareOn: true }),
      flareSunk: plane({ planePhase: SP_FLARE_PASS, planeLocked: true, planeFlareOn: true, destroyerSunk: true }),
      run: plane({ planePhase: SP_RUN, planeLocked: true, planeFlareOn: true, planeBombsDropped: 1 }),
      bombAir: plane({ planePhase: SP_RUN, planeLocked: true, planeBombAir: true, planeBombsDropped: 1 }),
      orbit: plane({ planePhase: SP_ORBIT, planeLocked: true, planeBombsDropped: 1, planeBombsHit: 1 }),
      lost: plane({ planePhase: SP_LEAVING, planeOutcome: SP_OUT_LOST }),
      bombed: plane({ planePhase: SP_LEAVING, planeOutcome: SP_OUT_BOMBED, planeBombsDropped: 2, planeBombsHit: 1 }),
    };
    expect(got).toEqual(PIN_PLANE);
  });
  it.each(['us_01', 'jp_06', 'jp_01'])('%s の夜明けの空襲: 接近・旋回・進路・落下（直線／弧）・波の合間・浅瀬の警告', (id) => {
    const got = Object.fromEntries(STRIKE_CASES.map(([k, d, o]) => [k, strike(id, d, o)]));
    expect(got).toEqual(PIN_STRIKE[id]);
  });
  it('us_01 の僚艇: 僚艇を狙う進路・落下と、僚艇の HP の後ろ書き', () => {
    const vip: Partial<BoatTelemetry> = { escortEnabled: true, escortSunk: false, escortHp: 63.4 };
    expect([
      strike('us_01', { threat: AS_T_RUN, plane: 1, bombsLeft: 7, toEscort: true }, vip),
      strike('us_01', { threat: AS_T_FALLING, plane: 1, bombsLeft: 6, toEscort: true }, vip),
      strike('us_01', { threat: AS_T_ORBIT, plane: 2, bombsLeft: 6 }, vip),
    ]).toEqual(PIN_VIP);
  });
});

const PIN_PLANE: Record<string, Row> = {
  wake: [10, '敵機 2400 m ・ 航跡を見られた ・ 18 kt 以下に減速！', WARN, 393233],
  quiet: [10, '敵機 1600 m ・ 航跡なし ・ 静音を保て', STRONG, 262145],
  locked: [9, '敵機に発見された！ 1500 m ・ 照明弾と爆弾に備えよ', WARN, 245769],
  lockedShallow: [9, '敵機に発見された！ 1200 m ・ 照明弾と爆弾に備えよ ・ 浅瀬 150 m 減速', WARN, 196617],
  flare: [9, '照明弾！ 駆逐艦に見えている ・ 光の外へ／煙幕', WARN, 42],
  flareSunk: [9, '照明弾！ ・ 爆撃が来る ・ 転舵の用意', WARN, 2090],
  run: [9, '爆撃進路！ 転舵か減速でかわせ', WARN, 172],
  bombAir: [9, '爆弾投下！ 転舵！', WARN, 204],
  orbit: [9, '敵機 旋回 ・ 次の爆撃進路で転舵', WARN, 4235],
  lost: [11, '敵機は見失った ・ 去る', HOME, 517],
  bombed: [11, '敵機 去る ・ 爆弾 2 発 命中 1', STRONG, 5381],
};
/** 3 任務とも 4 機・東から（機名と空の文は夜明けの帯にだけ出る。tests/dawn-withdraw-wiring）なので行は同じ */
const STRIKE_ROWS: Record<string, Row> = {
  inbound: [20, '空襲！ 敵機 4 機 ・ 東から 3700 m ・ 帰投を急げ', WARN, 75777],
  orbit: [20, '敵機 旋回 ・ 次は 2 番機 ・ 残り爆弾 6', STRONG, 802],
  run: [20, '爆撃進路 ・ 3 番機 ・ 投下で転舵（旋回中は逆へ）', WARN, 691],
  falling: [20, '爆弾投下！ 転舵！', WARN, 564],
  fallingArc: [20, '爆弾投下！ 旋回と逆へ転舵！', WARN, 33554884],
  rest: [21, '敵機 去る ・ 次の空襲まで 13 秒 ・ 帰投を急げ', STRONG, 26629],
  runShallow: [20, '爆撃進路 ・ 1 番機 ・ 投下で転舵（旋回中は逆へ） ・ 浅瀬 150 m 減速', WARN, 1704979],
};
const PIN_STRIKE: Record<string, Record<string, Row>> = { us_01: STRIKE_ROWS, jp_06: STRIKE_ROWS, jp_01: STRIKE_ROWS };
const PIN_VIP: Row[] = [
  [20, '爆撃進路（僚艇へ） ・ 2 番機 ・ 投下で転舵 ・ 僚艇 HP 64', WARN, 939],
  [20, '爆弾投下（僚艇へ）！ 転舵して連れて逃げよ ・ 僚艇 HP 64', WARN, 812],
  [20, '敵機 旋回 ・ 次は 3 番機 ・ 残り爆弾 6 ・ 僚艇 HP 64', STRONG, 818],
];
