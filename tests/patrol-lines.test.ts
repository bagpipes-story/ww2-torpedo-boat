// v0.6.7 S5（spec-v067 §D.1〜D.3・§G.1）: 夜の哨戒機の 2 行目（モード 31〜34）と 3 行目の文・色・幅、優先順（STRIKE > 31 > 32 > 33 > CALL > 34。夜の爆弾の落下は夜明けの接近・旋回より上＝R6）、
// 3 行目のレーダーの状態（R4）、「今すぐ止まれ！」の帯ごとの距離（R18）、無効の t.patrol で今のモードが同じ（N7）、人物名なし。最後に本物の門番と夜の出撃で回した夜の 2 行目の並び。
import { describe, expect, it } from 'vitest';
import { HOME_COLOR_TEXT as HOME, HUD_COLOR_STRONG as STRONG, HUD_COLOR_WARN as WARN } from '../src/config/hud-text-config';
import { AS_T_FALLING, AS_T_INBOUND, AS_T_NONE, AS_T_ORBIT, AS_T_REST, AS_T_RUN } from '../src/core/air-strike';
import type { BoatTelemetry, SpeedStep } from '../src/core/boat-motion';
import { createDawnTelemetry, type DawnTelemetry } from '../src/core/dawn-air';
import { CALL_DAWN, CALL_FUEL } from '../src/core/mission-flow';
import { PA_HUNT, PA_LEAVE, PA_OFF, PA_ORBIT, PA_PASS, PA_SORTIE, createPatrolTelemetry, type PatrolTelemetry } from '../src/core/patrol-air-state';
import { strikeFallJa, strikeOrbitJa, strikeRunJa } from '../src/ui/dawn-lines';
import {
  MISSION_ADRIFT, MISSION_CALL, MISSION_NORMAL, MISSION_PATROL, MISSION_PATROL_ATTACK, MISSION_PATROL_PASS, MISSION_PATROL_RESULT, MISSION_STRIKE, MISSION_STRIKE_REST, missionMode,
} from '../src/ui/mission-mode';
import {
  PATROL_STATUS_DAWN, PATROL_STATUS_HIDDEN, PATROL_STATUS_HULL, PATROL_STATUS_RADAR, PATROL_STATUS_SORTIE, PATROL_STATUS_WAKE, patrolLine, patrolModeOf, patrolStatusLine, patrolStatusOf,
} from '../src/ui/patrol-lines';
import { PERSON_DENYLIST, RANK_RE } from './person-denylist';
import { DT, driveUntil, makeKit } from './patrol-world-kit';
import { LINE2_MAX_PX, tele, textWidthPx } from './pt-ui-kit';

/** jp_02 の出撃時の t.patrol（機 2・静音の上限 14 kt・航跡 4,200（v0.6.7 実機 1 回目に 6,000 から）・発見 1,500・動く船体 900 m）に o を重ねる */
const P0: PatrolTelemetry = { ...createPatrolTelemetry(), enabled: true, planes: 2, quietKt: 14, wakeDetectM: 4200, lockM: 1500, nearM: 900, passes: 1, phase: PA_HUNT };
const tp = (o: Partial<PatrolTelemetry>, band: SpeedStep = 'full', dawn: Partial<DawnTelemetry> = {}, over: Partial<BoatTelemetry> = {}): BoatTelemetry =>
  tele({ enabled: false }, { targetStep: band, ...over, dawn: { ...createDawnTelemetry(), ...dawn }, patrol: { ...P0, ...o } });
type Row = [number, string, string];
const row = (t: BoatTelemetry, call = 0): Row => {
  const mode = missionMode(t, call, 0);
  if (!patrolModeOf(mode)) return [mode, '', ''];
  const l = patrolLine(t, mode);
  return [mode, l.text, l.color];
};

/** spec §D.2 の表の行（場面・テレメトリ・帯 → モード・文・色） */
const CASES: [string, Partial<PatrolTelemetry>, SpeedStep, Row][] = [
  ['34 レーダーの前', { passes: 0, bearingDeg: 56, nextPassS: 2.4 }, 'stop', [MISSION_PATROL, 'レーダーに捉えられている ・ 敵機 2 機が北東から来る', WARN]],
  ['34 捜索中', { nextPassS: 11.2, wakeLeftS: NaN, bearingDeg: 146 }, 'silent', [MISSION_PATROL, '敵機は捜索中 ・ 次の捜索まで 12 秒 ・ 14 kt を超えると航跡で早く来る', STRONG]],
  ['34 航跡を数えている', { nextPassS: 8, wakeLeftS: 2.4, bearingDeg: 146 }, 'full', [MISSION_PATROL, '航跡が出ている ・ あと 3 秒で敵機が寄ってくる（14 kt 以下で消える）', WARN]],
  // レビュー ux:ux-1: 14 kt 以下へ落として数えが減っている間（N が増えて見えた）と、定時の捜索が先に来る間は「次の捜索まで」
  ['34 航跡の数えが減っている（静音）', { nextPassS: 8, wakeLeftS: 1.2, bearingDeg: 146 }, 'silent', [MISSION_PATROL, '敵機は捜索中 ・ 次の捜索まで 8 秒 ・ 14 kt を超えると航跡で早く来る', STRONG]],
  ['34 航跡の数えが減っている（停止）', { nextPassS: 8, wakeLeftS: 1.2, bearingDeg: 146 }, 'stop', [MISSION_PATROL, '敵機は捜索中 ・ 次の捜索まで 8 秒 ・ 14 kt を超えると航跡で早く来る', STRONG]],
  ['34 定時の捜索が先（全速）', { nextPassS: 1, wakeLeftS: 2.5, bearingDeg: 146 }, 'full', [MISSION_PATROL, '敵機は捜索中 ・ 次の捜索まで 1 秒 ・ 14 kt を超えると航跡で早く来る', STRONG]],
  ['32 レーダーの捜索', { phase: PA_PASS, passes: 1, radar: true, bearingDeg: 56, distM: 4200, countdownS: 6 }, 'stop', [MISSION_PATROL_PASS, 'レーダーで捉えられた！ 敵機 2 機 ・ 北東 4200 m ・ 止まっても見つかる', WARN]],
  ['32 航跡で来た', { phase: PA_PASS, passes: 2, viaWake: true, bearingDeg: 146, distM: 4200, countdownS: 6 }, 'full', [MISSION_PATROL_PASS, '航跡を見られた！ 敵機 南東 4200 m ・ あと 6 秒で止まれ', WARN]],
  ['32 定時の捜索', { phase: PA_PASS, passes: 2, bearingDeg: 146, distM: 4200, countdownS: 6 }, 'silent', [MISSION_PATROL_PASS, '敵機の捜索 南東 4200 m ・ あと 6 秒で止まれ（止まれば見えない）', STRONG]],
  ['32 今すぐ（航跡）', { phase: PA_PASS, passes: 2, viaWake: true, bearingDeg: 146, distM: 2350, countdownS: 0 }, 'full', [MISSION_PATROL_PASS, '今すぐ止まれ！ 敵機 南東 2400 m ・ 航跡は 1500 m で見つかる', WARN]],
  ['32 今すぐ（静音）', { phase: PA_PASS, passes: 2, viaWake: true, bearingDeg: 146, distM: 1150, countdownS: 0 }, 'silent', [MISSION_PATROL_PASS, '今すぐ止まれ！ 敵機 南東 1200 m ・ 動く船体は 900 m で見つかる', WARN]],
  ['32 止まって待つ', { phase: PA_PASS, passes: 2, viaWake: true, bearingDeg: 146, distM: 1800, countdownS: 0 }, 'stop', [MISSION_PATROL_PASS, '止まったまま待て ・ 敵機 南東 1800 m ・ 止まっていれば見えない', STRONG]],
  ['32 付近の捜索', { phase: PA_ORBIT, passes: 2, bearingDeg: 200, distM: 900, orbitLeftS: 5.3 }, 'stop', [MISSION_PATROL_PASS, '敵機が付近を捜索 ・ 止まったまま あと 6 秒（動けば見つかる）', STRONG]],
  ['31 発見（レーダー）', { phase: PA_SORTIE, radar: true, threat: AS_T_INBOUND, bearingDeg: 56, distM: 1499.6 }, 'full', [MISSION_PATROL_ATTACK, 'レーダーで発見！ 敵機 2 機 ・ 北東 1500 m ・ 全速で走り 投下で転舵', WARN]],
  ['31 発見（目で）', { phase: PA_SORTIE, passes: 4, threat: AS_T_INBOUND, bearingDeg: 326, distM: 1500 }, 'silent', [MISSION_PATROL_ATTACK, '発見された！ 敵機 2 機 ・ 北西 1500 m ・ 全速で走り 投下で転舵', WARN]],
  ['31 旋回', { phase: PA_SORTIE, threat: AS_T_ORBIT, plane: 1, bombsLeft: 3 }, 'full', [MISSION_PATROL_ATTACK, strikeOrbitJa(1, 3), STRONG]],
  ['31 爆撃進路', { phase: PA_SORTIE, threat: AS_T_RUN, plane: 0 }, 'full', [MISSION_PATROL_ATTACK, strikeRunJa(0), WARN]],
  ['31 落下', { phase: PA_SORTIE, threat: AS_T_FALLING, plane: 0 }, 'full', [MISSION_PATROL_ATTACK, strikeFallJa(false), WARN]],
  ['31 落下（旋回中）', { phase: PA_SORTIE, threat: AS_T_FALLING, plane: 1, fallingArc: true }, 'full', [MISSION_PATROL_ATTACK, strikeFallJa(true), WARN]],
  ['33 見つけられずに去る', { phase: PA_LEAVE, passes: 2, resultKind: 1, resultLeftS: 2 }, 'stop', [MISSION_PATROL_RESULT, '敵機は見つけられずに去る ・ また捜しに来る', HOME]],
  ['33 出撃が去る', { phase: PA_SORTIE, threat: AS_T_REST, resultKind: 2, sortieBombs: 6, sortieHits: 1, sortieDamage: 35 }, 'full', [MISSION_PATROL_RESULT, '敵機 去る ・ 爆弾 6 発 命中 1（HP −35） ・ また捜しに来る', STRONG]],
  ['33 出撃が去る（命中なし）', { phase: PA_HUNT, resultKind: 2, resultLeftS: 1, sortieBombs: 6 }, 'full', [MISSION_PATROL_RESULT, '敵機 去る ・ 爆弾 6 発 命中 0 ・ また捜しに来る', STRONG]],
  // レビュー ux:ux-4: 出撃の後の哨戒で航跡を数え始めたら、結果の残りより航跡の行（全速の人に 14 kt の選び方を 3 秒見せる）。減っている間・止まっている間は結果のまま
  ['34 出撃の後に航跡', { phase: PA_HUNT, resultKind: 2, resultLeftS: 2, sortieBombs: 6, nextPassS: 11.6, wakeLeftS: 2.6 }, 'full', [MISSION_PATROL, '航跡が出ている ・ あと 3 秒で敵機が寄ってくる（14 kt 以下で消える）', WARN]],
  ['33 出撃の後に航跡が減っている', { phase: PA_HUNT, resultKind: 2, resultLeftS: 2, sortieBombs: 6, nextPassS: 11.6, wakeLeftS: 2.6 }, 'silent', [MISSION_PATROL_RESULT, '敵機 去る ・ 爆弾 6 発 命中 0 ・ また捜しに来る', STRONG]],
  ['33 つまみ 1 機 3 発', { phase: PA_SORTIE, threat: AS_T_REST, resultKind: 2, sortieBombs: 6, sortieHits: 2, sortieDamage: 70 }, 'full', [MISSION_PATROL_RESULT, '敵機 去る ・ 爆弾 6 発 命中 2（HP −70） ・ また捜しに来る', STRONG]],
];

describe('夜の哨戒機の 2 行目（ui/patrol-lines・ui/mission-mode。spec §D.1・§D.2）', () => {
  it.each(CASES)('%s', (_name, o, band, want) => {
    const r = row(tp(o, band));
    expect(r).toEqual(want);
    expect(textWidthPx(r[1], 22), r[1]).toBeLessThanOrEqual(LINE2_MAX_PX);
    for (const name of PERSON_DENYLIST) expect(r[1]).not.toContain(name);
    expect(r[1]).not.toMatch(RANK_RE);
  });
  it('「今すぐ止まれ！」は帯で分かれる: 航跡の帯（巡航・全速）は航跡の発見距離、静音は動く船体の距離（R18）', () => {
    const o = { phase: PA_PASS, passes: 2, viaWake: true, bearingDeg: 146, distM: 2000, countdownS: 0 };
    expect(row(tp(o, 'cruise'))[1]).toContain('航跡は 1500 m で見つかる');
    expect(row(tp(o, 'full'))[1]).toContain('航跡は 1500 m で見つかる');
    expect(row(tp(o, 'silent'))[1]).toContain('動く船体は 900 m で見つかる');
  });
  it('旋回・進路・落下は夜明けの空襲と同じ字（ui/dawn-lines の句）', () => {
    expect(strikeOrbitJa(1, 3)).toBe('敵機 旋回 ・ 次は 2 番機 ・ 残り爆弾 3');
    expect(strikeRunJa(0)).toBe('爆撃進路 ・ 1 番機 ・ 投下で転舵（旋回中は逆へ）');
    expect([strikeFallJa(false), strikeFallJa(true)]).toEqual(['爆弾投下！ 転舵！', '爆弾投下！ 旋回と逆へ転舵！']);
  });
});

describe('優先順（STRIKE > 31 > 32 > 33 > CALL > 34。R6: 夜の爆弾の落下は夜明けの接近・旋回より上）', () => {
  it('夜明けの空襲の進路・落下は夜の出撃より上、夜の落下は夜明けの接近・旋回より上', () => {
    const fall = { phase: PA_OFF, threat: AS_T_FALLING, plane: 0 };
    expect(missionMode(tp(fall, 'full', { threat: AS_T_INBOUND }), 0, 0)).toBe(MISSION_PATROL_ATTACK);
    expect(missionMode(tp(fall, 'full', { threat: AS_T_ORBIT }), 0, 0)).toBe(MISSION_PATROL_ATTACK);
    expect(missionMode(tp(fall, 'full', { threat: AS_T_RUN }), 0, 0)).toBe(MISSION_STRIKE);
    expect(missionMode(tp(fall, 'full', { threat: AS_T_FALLING }), 0, 0)).toBe(MISSION_STRIKE);
    // 夜の出撃の接近・旋回・進路は夜明けの空襲（脅威があれば）の下
    for (const th of [AS_T_INBOUND, AS_T_ORBIT, AS_T_RUN]) expect(missionMode(tp({ phase: PA_SORTIE, threat: th }, 'full', { threat: AS_T_INBOUND }), 0, 0)).toBe(MISSION_STRIKE);
  });
  it('31 > 32 > 33 > 帰投せよ > 34、燃料切れはその上、夜明けの空襲の合間は 33 の下・帰投せよの上', () => {
    expect(missionMode(tp({ phase: PA_PASS, threat: AS_T_INBOUND }), 0, 0)).toBe(MISSION_PATROL_ATTACK);
    expect(missionMode(tp({ phase: PA_PASS, resultKind: 1 }), CALL_DAWN, 0)).toBe(MISSION_PATROL_PASS);
    expect(missionMode(tp({ phase: PA_HUNT, resultKind: 1 }), CALL_DAWN, 0)).toBe(MISSION_PATROL_RESULT);
    expect(missionMode(tp({ phase: PA_HUNT }), CALL_DAWN, 0)).toBe(MISSION_CALL);
    expect(missionMode(tp({ phase: PA_HUNT }), 0, 0)).toBe(MISSION_PATROL);
    expect(missionMode(tp({ phase: PA_PASS }, 'full', {}, { fuelEmpty: true }), CALL_FUEL, 0)).toBe(MISSION_ADRIFT);
    expect(missionMode(tp({ phase: PA_OFF }, 'full', { threat: AS_T_REST }), CALL_DAWN, 0)).toBe(MISSION_STRIKE_REST);
    expect(missionMode(tp({ phase: PA_HUNT, resultKind: 2 }, 'full', { threat: AS_T_REST }), 0, 0)).toBe(MISSION_PATROL_RESULT);
  });
  it('無効の t.patrol（哨戒の無い任務）では、どの値でも今のモードのまま（N7）', () => {
    const odd: Partial<PatrolTelemetry> = { enabled: false, phase: PA_PASS, threat: AS_T_FALLING, resultKind: 2, radar: true, countdownS: 0 };
    for (const call of [0, CALL_DAWN]) {
      for (const dawn of [{}, { threat: AS_T_INBOUND }, { threat: AS_T_REST }]) {
        const plain = tele({ enabled: false }, { dawn: { ...createDawnTelemetry(), ...dawn } });
        expect(missionMode(tp(odd, 'full', dawn), call, 0)).toBe(missionMode(plain, call, 0));
      }
    }
    expect(missionMode(tele({ enabled: false }, {}), 0, 0)).toBe(MISSION_NORMAL);
    expect(patrolStatusOf({ ...P0, enabled: false }, 'stop')).toBe(-1);
    expect(patrolStatusOf({ ...P0, enabled: false, phase: PA_OFF }, 'full', true)).toBe(-1); // 夜明けの空襲の状態も哨戒の任務だけ
  });
});

describe('3 行目（空からの見え方。spec §D.3・R4）', () => {
  const status = (o: Partial<PatrolTelemetry>, band: SpeedStep, dawnRaid?: boolean): [number, string, boolean] => {
    const p = { ...P0, ...o };
    const s = patrolStatusOf(p, band, dawnRaid);
    if (s < 0) return [s, '', false];
    const l = patrolStatusLine(p, s);
    return [s, l.text, l.warn];
  };
  it('出撃中 > レーダー（レーダーの前と、レーダーの捜索）> 帯。OFF（夜明けの後など）は今の 3 行目', () => {
    expect(status({ phase: PA_SORTIE }, 'full')).toEqual([PATROL_STATUS_SORTIE, '発見された ・ 全速で走り 投下で転舵', true]);
    // v0.6.7 実機 1 回目: 「（止まっても）」は 2 行目の「止まっても見つかる」と被るので消した
    expect(status({ phase: PA_HUNT, passes: 0 }, 'stop')).toEqual([PATROL_STATUS_RADAR, '空から ・ レーダーで見えている', true]);
    expect(status({ phase: PA_PASS, radar: true }, 'stop')).toEqual([PATROL_STATUS_RADAR, '空から ・ レーダーで見えている', true]);
    expect(status({ phase: PA_PASS }, 'full')).toEqual([PATROL_STATUS_WAKE, '空から ・ 航跡は 4200 m で見える', true]);
    expect(status({ phase: PA_HUNT }, 'cruise')).toEqual([PATROL_STATUS_WAKE, '空から ・ 航跡は 4200 m で見える', true]);
    expect(status({ phase: PA_ORBIT }, 'silent')).toEqual([PATROL_STATUS_HULL, '空から ・ 動く船体は 900 m で見える', false]);
    expect(status({ phase: PA_LEAVE }, 'stop')).toEqual([PATROL_STATUS_HIDDEN, '空から ・ 止まっていて見えない', false]);
    expect(status({ phase: PA_OFF }, 'stop')[0]).toBe(-1);
  });
  it('夜明けの後（OFF）は空襲があれば「夜明けの空襲（止まっても見える）」、空襲の無い OFF（沈没・?debug&nostrike）は今の 3 行目（レビュー ai・ux:ux-3）', () => {
    for (const band of ['stop', 'silent', 'cruise', 'full'] as SpeedStep[]) {
      expect(status({ phase: PA_OFF }, band, true)).toEqual([PATROL_STATUS_DAWN, '空から ・ 夜明けの空襲（止まっても見える）', true]);
      expect(status({ phase: PA_OFF }, band, false)[0]).toBe(-1);
    }
    // 夜明けの前の段は dawnRaid に関わらず今の状態
    expect(status({ phase: PA_PASS }, 'full', true)[0]).toBe(PATROL_STATUS_WAKE);
  });
  it('出撃の機が爆弾を落とし切って去る間（脅威 REST）は帯の状態（2 行目「敵機 去る」の下で「全速で走り」と言わない。レビュー ux:ux-4）', () => {
    expect(status({ phase: PA_SORTIE, threat: AS_T_REST }, 'full')).toEqual([PATROL_STATUS_WAKE, '空から ・ 航跡は 4200 m で見える', true]);
    expect(status({ phase: PA_SORTIE, threat: AS_T_REST }, 'stop')).toEqual([PATROL_STATUS_HIDDEN, '空から ・ 止まっていて見えない', false]);
    for (const th of [AS_T_NONE, AS_T_INBOUND, AS_T_ORBIT, AS_T_RUN, AS_T_FALLING]) expect(status({ phase: PA_SORTIE, threat: th }, 'stop')[0]).toBe(PATROL_STATUS_SORTIE);
  });
  it('レーダーの前とレーダーの捜索では、止まっていても 3 行目が「見えない」と言わない（2 行目「止まっても見つかる」と食い違わない。F7）', () => {
    for (const o of [{ phase: PA_HUNT, passes: 0 }, { phase: PA_PASS, radar: true }] as Partial<PatrolTelemetry>[]) {
      for (const band of ['stop', 'silent', 'cruise', 'full'] as SpeedStep[]) expect(status(o, band)[1]).not.toContain('見えない');
    }
  });
  it('3 行目の文は 20 px で 2 行目の上限の内・人物名なし', () => {
    for (const s of [PATROL_STATUS_SORTIE, PATROL_STATUS_RADAR, PATROL_STATUS_WAKE, PATROL_STATUS_HULL, PATROL_STATUS_HIDDEN, PATROL_STATUS_DAWN]) {
      const l = patrolStatusLine(P0, s).text;
      expect(textWidthPx(l, 20)).toBeLessThanOrEqual(LINE2_MAX_PX);
      for (const name of PERSON_DENYLIST) expect(l).not.toContain(name);
    }
  });
});

describe('本物の門番と夜の出撃で回した jp_02 の夜（seed 11・HUD どおり。systems/patrol-air-step）', () => {
  it('3 秒にレーダーの捜索、約 11.8 秒に「レーダーで発見！」、6 発の「爆弾投下！」、止まると「見つけられずに去る」、目の発見 0（v0.6.7 実機 1 回目の 4,200 m・1 機 3 発）', () => {
    const k = makeKit(11);
    const seen: [number, string][] = [];
    let last = '';
    driveUntil(k, (x) => {
      const mode = missionMode(x.t, 0, 0);
      const text = patrolModeOf(mode) ? patrolLine(x.t, mode).text : String(mode);
      if (text !== last) seen.push([Math.round(x.w.stepTimeS * 100) / 100, (last = text)]);
      return x.w.atHome;
    }, 'hud', 200);
    const first = (re: RegExp): number => seen.find(([, s]) => re.test(s))?.[0] ?? NaN;
    expect(first(/^レーダーで捉えられた！ 敵機 2 機 ・ 北東 4200 m/)).toBeCloseTo(3, 1);
    expect(first(/^レーダーで発見！ 敵機 2 機 ・ 北東 1500 m/)).toBeCloseTo(11.8, 0);
    expect(seen.filter(([, s]) => s === '爆弾投下！ 転舵！' || s === '爆弾投下！ 旋回と逆へ転舵！').length).toBe(6);
    expect(first(/^航跡を見られた！ 敵機 南東 4200 m ・ あと 6 秒で止まれ/)).toBeGreaterThan(35);
    expect(first(/^敵機は見つけられずに去る/)).toBeGreaterThan(first(/^止まったまま待て/));
    expect(k.pa.state.findsVisual).toBe(0);
    expect(k.pa.state.hides).toBeGreaterThanOrEqual(1);
    expect([k.flight.state.bombsDropped, k.flight.state.waves, k.pa.restartDelayed]).toEqual([6, 1, 0]);
    expect(k.w.stepTimeS).toBeLessThan(k.w.setup.durationS);
    expect(DT).toBeCloseTo(1 / 60, 9);
    expect(missionMode(k.t, 0, 0)).not.toBe(MISSION_PATROL_ATTACK);
    expect(k.t.patrol.threat).toBe(AS_T_NONE);
  });
});
