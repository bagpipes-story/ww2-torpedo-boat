// v0.8.5 IP3（実機 1 回目のユーザー「40人救助してまだまだ漂流してるのに見捨てて帰投するのが納得感ありません。40人救助達成したら帰投水域の方から味方の艇が救助応援に駆けつける演出にする？」）:
// - 味方の艇（core/friendly-boats・config/rescue-friendly-data の V-F・systems/world-rescue）: 渡した数が達成に届いた時（海に人が残り救助の時間の内）1 回だけ count 隻が帰投の輪から出て、
//   掃海された水路の点を通り、群で自艇と同じ 1 名の秒で拾い、満ちるか海が空けばフィッチの輪で降ろす。拾った人は自艇の渡した・点に数えない。乱数なし・毎ステップ確保なし（§7）。
//   艇が出ていれば救助の時間の終わりに海を空けず（他艦へ数えない）艇が拾い続ける（自艇は拾わない）。
// - HUD・Result: 40 名を渡した出来事の文に「 ・ 味方の艇 2 隻が救助に来る」・Result の「味方の艇 2 隻が拾った N 名」（0 なら出さない）・帰投で海に残った人は「味方の艇に任せた」。
import { describe, expect, it } from 'vitest';
import { gameData, type GameData } from '../src/config/game-data';
import { getPrototypeMission } from '../src/config/mission-data';
import { getRescueParams } from '../src/config/rescue-mission-data';
import { FRIENDLY_SPEED_PLAYER_FULL, RESCUE_FRIENDLY_KEYS, checkFriendlyRoute, segHitsRect } from '../src/config/rescue-friendly-data';
import { validateMinefieldMissions } from '../src/config/minefield-mission-data';
import { FIXED_STEP_S } from '../src/config/step-config';
import type { BoatState } from '../src/core/boat-motion';
import {
  FRIENDLY_BACK, FRIENDLY_GO, FRIENDLY_IDLE, FRIENDLY_OUT, FRIENDLY_PICK, FRIENDLY_UNLOAD, FRIENDLY_WAIT,
  createFriendlyBoats, dispatchFriendlyBoats, friendlyAboard, friendlyVisible, stepFriendlyBoats, type FriendlyState,
} from '../src/core/friendly-boats';
import { createRescueState, rescueOnWater, rescueTimeUp, stepRescue, type RescueState } from '../src/core/rescue';
import type { RescueResult } from '../src/core/rescue-telemetry';
import { rescueFieldOf } from '../src/systems/rescue-field-setup';
import { rescueResultPart } from '../src/systems/rescue-result-part';
import { rescueTelemetryPart } from '../src/systems/rescue-telemetry';
import { WorldRescue } from '../src/systems/world-rescue';
import { rescueBannerLines, rescueObjectiveFriendlyJa } from '../src/ui/rescue-texts';
import type { BoatTelemetry } from '../src/core/boat-telemetry';
import { rescueFriendlyLineJa, rescueSurvivorLineJa } from '../src/ui/rescue-result';
import { setupOf } from './column-world-kit';
import { code, scanAllocations } from './core-rules-kit';
import { LINE2_MAX_PX, tele, textWidthPx } from './pt-ui-kit';

type Rec = Record<string, unknown>;
const clone = (): GameData => JSON.parse(JSON.stringify(gameData)) as GameData;
const rescueOf = (d: GameData): Rec => ((d.missionsSeed.missions as unknown as Rec[]).find((m) => m['id'] === 'us_07')!['v0_1_prototype'] as Rec)['rescue'] as Rec;
const fb = (d: GameData): Rec => rescueOf(d)['friendly_boats'] as Rec;
const build = (f: (d: GameData) => void, hard = false): (() => unknown) => {
  const d = clone();
  f(d);
  return () => getRescueParams(d, getPrototypeMission(d, 'us_07', hard));
};
const S = setupOf('us_07');
const R = S.rescue!;
const F = R.friendly!;
const TS = S.timeScale;
const FEEL = FIXED_STEP_S;

describe('data（us_07。v0.8.5 IP3）', () => {
  it('2 隻・自艇の全速（39 kt。v0.8.5 IP4 で 20 kt → speed_kt "player_full"）・1 隻 10 名・2 隻目は 3 秒遅れ・群の中心から 20 m・道は帰投の輪 → フィッチ → 水路の角 2 つ → 水路の端（ノーマル・ハードとも）', () => {
    expect([F.count, F.speedKt, F.capacity, F.staggerS, F.parkOffsetM, F.fitchIdx, F.labelJa]).toEqual([2, 39, 10, 3, 20, 1, '味方の艇']);
    expect([fb(gameData)['speed_kt'], FRIENDLY_SPEED_PLAYER_FULL, F.speedKt]).toEqual(['player_full', 'player_full', gameData.boats.boats.find((b) => b.id === getPrototypeMission(gameData, 'us_07').playerBoatId)!.speed_max_kt]); // 数を二重に持たない＝自艇の boats.json の speed_max_kt
    expect(F.route).toEqual([[3750, 750], [3750, 1450], [3250, 1400], [2700, 1850], [2550, 2300]]); // v0.8.5 IP4 で水路の角を内へ
    expect(setupOf('us_07', true).rescue!.friendly).toEqual(F);
    expect(RESCUE_FRIENDLY_KEYS).toEqual(['count', 'speed_kt', 'capacity', 'stagger_s', 'park_offset_m', 'route_m', 'label_ja', 'source']);
    expect(F.speedMps * TS).toBeCloseTo(100.31, 1); // 世界の m/s（帰投の輪から水路の端まで約 2.4 km ＝ 約 24 秒。IP3 の 20 kt は約 52 秒）
  });
  it('出典: source は史実（救ったのはフィッチ・ホブソン・バトラーと PT 1 隻）と設計（ゲームの描き方・艦名を付けない）を書き分けた', () => {
    const src = String(fb(gameData)['source']);
    expect(src).toMatch(/^historical \(docs\/01 §13: コリーの生存者を救ったのは駆逐艦フィッチ・ホブソン・バトラーと初期の Higgins の PT 1 隻/);
    expect(src).toMatch(/\/ design \(v0\.8\.5 IP3。実機 1 回目のユーザー「40人救助してまだまだ漂流してるのに見捨てて帰投するのが納得感ありません。/);
  });
});

describe('起動時の検査 V-F（config/rescue-friendly-data）', () => {
  it('V-F1: 鍵・隻数 1〜4・速さ・乗せる数・秒とずれ・名と source・道は 3 点以上。null は艇なし', () => {
    expect(build((d) => (fb(d)['extra'] = 1))).toThrow(/rescue\.friendly_boats の鍵はちょうど count・speed_kt・capacity・stagger_s・park_offset_m・route_m・label_ja・source（.*extra）（V-F1・spec-v0850 §4）/);
    expect(build((d) => (fb(d)['count'] = 5))).toThrow(/count は 1〜4 の整数（5）（V-F1/);
    expect(build((d) => (fb(d)['count'] = 1.5))).toThrow(/V-F1/);
    expect(build((d) => (fb(d)['speed_kt'] = 0))).toThrow(/speed_kt は正の数か "player_full"（自艇の全速）（V-F1/);
    expect(build((d) => (fb(d)['speed_kt'] = 'full'))).toThrow(/speed_kt は正の数か "player_full"（自艇の全速）（V-F1/);
    expect((build((d) => (fb(d)['speed_kt'] = 20))() as { friendly: { speedKt: number } }).friendly.speedKt).toBe(20); // 数も書ける（IP3 の形）
    expect(build((d) => (fb(d)['capacity'] = 0))).toThrow(/capacity は 1 以上の整数（V-F1/);
    expect(build((d) => (fb(d)['stagger_s'] = -1))).toThrow(/stagger_s は 0 以上（V-F1/);
    expect(build((d) => (fb(d)['label_ja'] = ''))).toThrow(/label_ja・source は空でない文字列（V-F1/);
    expect(build((d) => (fb(d)['route_m'] = [[3750, 750], [3750, 1450]]))).toThrow(/route_m は \[x, y\] の 3 点以上の配列（V-F1/);
    const d = clone();
    rescueOf(d)['friendly_boats'] = null;
    expect(getRescueParams(d, getPrototypeMission(d, 'us_07'))!.friendly).toBeNull();
  });
  it('V-F2: 止まる所のずれは拾える距離の内。V-F3: 出る所は帰投の輪の内・フィッチの輪の点の後に 1 点以上・海域の中', () => {
    expect(build((d) => (fb(d)['park_offset_m'] = 41))).toThrow(/park_offset_m（41 m）は rescue\.pickup_m（40 m）以下（群の拾える所で止まる）（V-F2/);
    expect(build((d) => ((fb(d)['route_m'] as number[][])[0] = [3750, 1100]))).toThrow(/route_m\[0\]（3750, 1100）は帰投の輪（3750, 750・半径 250）の内（帰投の輪から出る）（V-F3/);
    expect(build((d) => (fb(d)['route_m'] = [[3750, 750], [3750, 1100], [3100, 1250]]))).toThrow(/2 番目から後のどれかはフィッチの輪（半径 180 m・止まる所のずれ 20 m 込み）の内（降ろす所）（V-F3/);
    expect(build((d) => (fb(d)['route_m'] = [[3750, 750], [3750, 1100], [3750, 1450]]))).toThrow(/フィッチの輪の点の後に 1 点以上（水路の端へ）（V-F3/);
    expect(build((d) => ((fb(d)['route_m'] as number[][])[4] = [2550, 3900]))).toThrow(/route_m\[4\]（2550, 3900）は海域の中で浅瀬の外（V-F3/);
  });
  it('V-F4（Boot）: 道の線分はどれも 1 本の水路の帯の内・水路の端から群へは機雷原の区画を通らない', () => {
    expect(() => validateMinefieldMissions(gameData)).not.toThrow();
    const d = clone();
    (fb(d)['route_m'] as number[][]).splice(2, 1); // フィッチから西の角へ真っ直ぐ（北西の角を切る）
    expect(() => validateMinefieldMissions(d)).toThrow(/us_07\.v0_1_prototype\.rescue\.friendly_boats\.route_m\[1\]→\[2\] は掃海された水路（minefield\.lanes）の 1 本の帯の内（V-F4/);
    const m = setupOf('us_07').minefield!;
    expect(() => checkFriendlyRoute({ id: 'us_07' }, { ...F, route: [...F.route.slice(0, 4), [2550, 1900]] }, m, [{ x: 3400, y: 2600 }], 0)).toThrow(/への真っ直ぐは機雷原の区画を通らない（V-F4/);
    expect(segHitsRect(0, 0, 10, 10, { x: 4, y: -5, w: 1, h: 30 })).toBe(true);
    expect(segHitsRect(0, 0, 3, 3, { x: 4, y: -5, w: 1, h: 30 })).toBe(false);
  });
});

/** 群の台（data の群・ずれなし）と艇 */
function rig(): { st: FriendlyState; rs: RescueState } {
  const rs = createRescueState(R, S.boatHalfLengthM);
  return { st: createFriendlyBoats(F), rs };
}
/** 1 ステップ（体感 1/60 秒） */
const step = (st: FriendlyState, rs: RescueState, n = 1): void => {
  for (let k = 0; k < n; k++) stepFriendlyBoats(st, F, R, rs, FEEL * TS, FEEL);
};

describe('動き（core/friendly-boats）', () => {
  it('組み立て: 出る前は海域に出ていない（絵も無い）。出すのは海に人が残り救助の時間の内の 1 回だけ。2 隻目は 3 秒遅れて出る所に現れる', () => {
    const { st, rs } = rig();
    expect([st.phase[0], st.phase[1], friendlyVisible(st, 0), st.x[0], st.y[0]]).toEqual([FRIENDLY_OUT, FRIENDLY_OUT, false, 3750, 750]);
    // 群のそばで止まる所は群の北側の扇（北西・北東に 20 m。群の札は群の下・艇の札は艇の上）
    expect([st.ox[0]!, st.oy[0]!, st.ox[1]!, st.oy[1]!].map((v) => Math.round(v * 10) / 10)).toEqual([-14.1, -14.1, 14.1, -14.1]);
    step(st, rs, 600);
    expect([st.x[0], st.y[0], st.picked]).toEqual([3750, 750, 0]); // 出していなければ動かない
    expect(dispatchFriendlyBoats(st, F, rs)).toBe(true);
    expect(dispatchFriendlyBoats(st, F, rs)).toBe(false);
    expect([st.seq, st.phase[0], st.phase[1]]).toEqual([1, FRIENDLY_WAIT, FRIENDLY_WAIT]);
    step(st, rs, 1);
    expect([st.phase[0], st.phase[1], friendlyVisible(st, 1)]).toEqual([FRIENDLY_GO, FRIENDLY_WAIT, false]);
    step(st, rs, 3 * 60 - 1);
    expect(st.phase[1]).toBe(FRIENDLY_GO);
    const a = rig();
    rescueTimeUp(a.rs);
    expect(dispatchFriendlyBoats(a.st, F, a.rs)).toBe(false);
    const b = rig();
    b.rs.left.fill(0);
    expect(dispatchFriendlyBoats(b.st, F, b.rs)).toBe(false);
  });
  it('水路の点を順に通って（どの点もそのまま踏む）水路の端から群へ。拾う 1 名は自艇と同じ 0.8 秒・1 隻 10 名で満ちれば戻ってフィッチの輪で降ろす（自艇の渡したに数えない）', () => {
    const { st, rs } = rig();
    dispatchFriendlyBoats(st, F, rs);
    const seen: number[] = [];
    let firstPickK = -1;
    for (let k = 0; k < 120 * 60 && st.phase[1] !== FRIENDLY_BACK; k++) {
      step(st, rs);
      for (let w = 1; w < F.route.length; w++) if (st.x[0] === F.route[w]![0] && st.y[0] === F.route[w]![1] && !seen.includes(w)) seen.push(w);
      if (firstPickK < 0 && st.aboard[0]! > 0) firstPickK = k;
    }
    expect(seen).toEqual([1, 2, 3, 4]);
    expect(firstPickK / 60).toBeGreaterThan(22);
    expect(firstPickK / 60).toBeLessThan(30); // 約 2.5 km（水路 ＋ 群まで。v0.8.5 IP4 で角を内へ）を世界の 100.3 m/s（自艇の全速）＋ 0.8 秒
    expect([st.aboard[0], st.aboard[1], rs.delivered, rs.aboard]).toEqual([10, 10, 0, 0]);
    expect(st.picked).toBe(20);
    expect(rescueOnWater(rs)).toBe(R.total - 20);
    // 満ちたら水路の端 → 角 → フィッチの輪で降ろす（1 名 0.25 秒）。海に残りがあればまた出る
    for (let k = 0; k < 120 * 60 && st.phase[0] !== FRIENDLY_UNLOAD; k++) step(st, rs);
    expect(st.phase[0]).toBe(FRIENDLY_UNLOAD);
    expect(Math.hypot(st.x[0]! - R.fitch.x, st.y[0]! - R.fitch.y)).toBeLessThanOrEqual(R.fitch.ringM);
    step(st, rs, 10 * 15);
    expect([st.phase[0], st.wp[0], st.unloaded >= 10]).toEqual([FRIENDLY_GO, F.fitchIdx + 1, true]);
  });
  it('救助の時間の終わり: 艇が出ていれば海は空けず（他艦へ数えない）艇が拾い続け、自艇はもう拾わない。海が空けば戻って降ろしてフィッチのそばで止まる。決まった動き（2 回で同じ）', () => {
    const run = (): number[] => {
      const { st, rs } = rig();
      dispatchFriendlyBoats(st, F, rs);
      step(st, rs, 70 * 60);
      rescueTimeUp(rs, true);
      expect([rs.byOthers, rescueOnWater(rs)]).toEqual([0, R.total - st.picked]);
      // 自艇は群の真上で止まっていても拾わない（拾うのは救助の時間の内だけ）
      stepRescue(rs, R, rs.gx[11]!, rs.gy[11]!, 0, true, 10);
      expect(rs.aboard).toBe(0);
      step(st, rs, 600 * 60);
      return [st.phase[0]!, st.phase[1]!, st.picked, st.unloaded, friendlyAboard(st), rescueOnWater(rs), Math.round(st.x[0]!), Math.round(st.y[0]!)];
    };
    const a = run();
    expect(a.slice(0, 2)).toEqual([FRIENDLY_IDLE, FRIENDLY_IDLE]);
    expect([a[2], a[3], a[4], a[5]]).toEqual([R.total, R.total, 0, 0]);
    expect(run()).toEqual(a);
    // 艇が出ていなければ今のまま（残りは他艦へ）
    const b = rig();
    rescueTimeUp(b.rs);
    expect([b.rs.byOthers, rescueOnWater(b.rs)]).toEqual([R.total, 0]);
    const { st, rs } = rig();
    rs.left.fill(0);
    rs.left[0] = 3;
    dispatchFriendlyBoats(st, F, rs);
    step(st, rs, 150 * 60);
    expect([st.picked, rescueOnWater(rs), st.phase[0], st.phase[1]]).toEqual([3, 0, FRIENDLY_IDLE, FRIENDLY_IDLE]);
  });
  it('拾っている群が空けば次の群へ（ほかの艇が狙っていない群を先に）。2 隻は別の群へ向かう', () => {
    const { st, rs } = rig();
    dispatchFriendlyBoats(st, F, rs);
    let k = 0;
    for (; k < 120 * 60 && !(st.phase[0] === FRIENDLY_PICK && st.phase[1] === FRIENDLY_PICK); k++) step(st, rs);
    expect(st.target[0]).not.toBe(st.target[1]);
    const g = st.target[0]!;
    rs.left[g] = 0; // 自艇か砲撃が空けた
    step(st, rs, 1);
    expect(st.target[0]).not.toBe(g);
  });
  it('§7: 毎ステップの本体に確保なし・Phaser と Math.random なし', () => {
    const a = scanAllocations('src/core/friendly-boats.ts', ['createFriendlyBoats']);
    expect(a.bad).toEqual([]);
    expect(code('src/core/friendly-boats.ts')).not.toMatch(/Math\.random|from 'phaser'|SeededRng/);
  });
});

describe('世界・テレメトリ・Result（systems/world-rescue）', () => {
  const world = (): { r: WorldRescue; w: { boat: { state: BoatState; sinking: boolean }; dawn: { reached: boolean }; pts: null; stepTimeS: number } } => {
    const f = rescueFieldOf(S, 1)!;
    const boat = { state: { x: 0, y: 0, headingDeg: 0, speedMps: 0 } as BoatState, sinking: false };
    return { r: new WorldRescue(S, f, { splash: () => {} }, () => {}), w: { boat, dawn: { reached: false }, pts: null, stepTimeS: 0 } };
  };
  it('渡した数が達成に届いたステップに出す（届く前は出さない）。テレメトリは出た通し番号と隻数・拾った数、Result は隻数と拾った数（渡したの外）', () => {
    const { r, w } = world();
    const t = rescueTelemetryPart({ rescue: r, boat: w.boat, pts: null }).rescue!;
    expect([t.friendlySeq, t.friendlyCount, t.friendlyPicked, t.friendlyJa]).toEqual([0, 0, 0, '味方の艇']);
    r.step(w, FEEL);
    expect(r.friendly!.dispatched).toBe(false);
    r.state.objectiveReached = true;
    r.state.delivered = 40;
    for (let k = 0; k < 90 * 60; k++) r.step(w, FEEL);
    expect(r.friendly!.dispatched).toBe(true);
    const t2 = rescueTelemetryPart({ rescue: r, boat: w.boat, pts: null }).rescue!;
    expect([t2.friendlySeq, t2.friendlyCount, t2.friendlyPicked > 0, t2.delivered]).toEqual([1, 2, true, 40]);
    const res = rescueResultPart({ rescue: r, pts: null, shoreGuns: null }).rescue!;
    expect([res.friendlyBoats, res.friendlyPicked, res.delivered, res.friendlyJa]).toEqual([2, r.friendly!.picked, 40, '味方の艇']);
    expect(res.onWater).toBe(R.total - r.friendly!.picked);
  });
  it('救助の時間の終わり（夜明けのラッチ）: 艇が出ていれば海に置いたまま・出ていなければ今のまま他艦へ。帯の文も「残りは味方の艇が拾う」', () => {
    const a = world();
    a.r.state.objectiveReached = true;
    a.r.step(a.w, FEEL);
    a.w.dawn.reached = true;
    a.r.step(a.w, FEEL);
    expect([a.r.state.timeUp, a.r.state.byOthers, rescueOnWater(a.r.state) > 0]).toEqual([true, 0, true]);
    const b = world();
    b.w.dawn.reached = true;
    b.r.step(b.w, FEEL);
    expect([b.r.state.timeUp, b.r.state.byOthers, rescueOnWater(b.r.state)]).toEqual([true, R.total, 0]);
    const t = (fc: number): BoatTelemetry => tele({ enabled: false }, { hp: 100, callFlags: 0, rescue: { ...rescueTelemetryPart({ rescue: a.r, boat: a.w.boat, pts: null }).rescue!, friendlyCount: fc } });
    expect(rescueBannerLines(t(2))[1]).toBe('残りは味方の艇が拾う');
    expect(rescueBannerLines(t(0))[1]).toBe('残りはホブソンとバトラーの内火艇が拾う');
  });
  it('味方の艇の無い任務（data で null）は世界に艇を作らない', () => {
    const d = clone();
    rescueOf(d)['friendly_boats'] = null;
    expect(getRescueParams(d, getPrototypeMission(d, 'us_07'))!.friendly).toBeNull();
    const s = { ...S, rescue: { ...R, friendly: null } };
    expect(new WorldRescue(s, rescueFieldOf(s, 1)!, { splash: () => {} }, () => {}).friendly).toBeNull();
  });
});

describe('文（22 px・840 px の内）と Result の行', () => {
  const rr = (o: Partial<RescueResult> = {}): RescueResult => ({
    total: 60, objective: 40, delivered: 40, deliveredAtReturn: 0, lostShell: 0, byOthers: 0, lostSunk: 0, aboard: 0, onWater: 0, minesPlaced: 48, minesSeen: 0, minesBlown: 0, sboats: 2, sboatRetreated: 0,
    batteryShots: 0, batteryHits: 0, fitchJa: 'フィッチ', sboatWave2: 0, batterySeaShots: 0, friendlyBoats: 0, friendlyPicked: 0, friendlyJa: '味方の艇', ...o,
  });
  it('40 名を渡した出来事: 「40 名を渡した ・ 帰投すれば達成 ・ 味方の艇 2 隻が救助に来る」（幅の内）', () => {
    const s = rescueObjectiveFriendlyJa(R.objectiveDelivered, F.labelJa, F.count);
    expect(s).toBe('40 名を渡した ・ 帰投すれば達成 ・ 味方の艇 2 隻が救助に来る');
    expect(textWidthPx(s, 22)).toBeLessThanOrEqual(LINE2_MAX_PX);
  });
  it('Result: 拾った数が 0 なら行を出さない・帰投で海に残った人は艇が出ていれば「味方の艇に任せた」（出ていなければ今の「他艦に任せた」）', () => {
    expect(rescueFriendlyLineJa(rr())).toBeNull();
    expect(rescueFriendlyLineJa(rr({ friendlyBoats: 2, friendlyPicked: 12 }))).toBe('味方の艇 2 隻が拾った 12 名（自艇の渡したに数えない）');
    expect(textWidthPx(rescueFriendlyLineJa(rr({ friendlyBoats: 4, friendlyPicked: 59 }))!, 20)).toBeLessThanOrEqual(1232);
    expect(rescueSurvivorLineJa(rr({ onWater: 9, friendlyBoats: 2 }), true)).toBe('生存者: フィッチへ 40 名 ・ 味方の艇に任せた 9 名');
    expect(rescueSurvivorLineJa(rr({ onWater: 9 }), true)).toBe('生存者: フィッチへ 40 名 ・ 他艦に任せた 9 名');
  });
});
