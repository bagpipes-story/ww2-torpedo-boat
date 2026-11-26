// v0.8.5 S0（spec-v0850 §4.1・§4.4・§4.5）: 生存者の救助の任務の読み出しと、data だけで決まる起動時の検査 V-Q1〜V-Q8・V-D1〜V-D2・V-U1（config/rescue-mission-data）と setup の鍵（rescue）。
// 既定の data（us_07）が通り、壊した data は鍵を名指す日本語の文で止まる。rescue の無い任務は鍵ごと出ない。S0 では世界は rescue を読まない（海の色の昼＝setupDayStart だけ）。
import { describe, expect, it } from 'vitest';
import { gameData, getVisibilityParams, type GameData } from '../src/config/game-data';
import { getPrototypeMission } from '../src/config/mission-data';
import { getPtParams } from '../src/config/pt-mission-data';
import { RESCUE_CORRY_KEYS, RESCUE_DAYLIGHT_KEYS, RESCUE_DAYLIGHT_RANGE, RESCUE_FITCH_KEYS, RESCUE_GROUPS_MAX, RESCUE_KEYS, RESCUE_MISSION_TYPE, getRescueParams, rescueMoonFactor, rescueSetupPart, validateRescueMissions } from '../src/config/rescue-mission-data';
import { setupDayStart } from '../src/core/dawn-air';
import { playerVisRangeM } from '../src/core/visibility';
import { directSortie } from '../src/core/sortie';
import { buildWorldSetup } from '../src/systems/world-setup';

type Rec = Record<string, unknown>;
const clone = (): GameData => JSON.parse(JSON.stringify(gameData)) as GameData;
const missionOf = (d: GameData, id: string): Rec => (d.missionsSeed.missions as unknown as Rec[]).find((m) => m['id'] === id)!;
const protoOf = (d: GameData, id: string): Rec => missionOf(d, id)['v0_1_prototype'] as Rec;
const rescueOf = (d: GameData): Rec => protoOf(d, 'us_07')['rescue'] as Rec;
const fitchOf = (d: GameData): Rec => (rescueOf(d)['ships'] as Rec)['fitch'] as Rec;
const corryOf = (d: GameData): Rec => (rescueOf(d)['ships'] as Rec)['corry'] as Rec;
const build = (f: (d: GameData) => void, id = 'us_07', hard = false): (() => unknown) => {
  const d = clone();
  f(d);
  return () => getRescueParams(d, getPrototypeMission(d, id, hard));
};
const PROTO_IDS = (gameData.missionsSeed.missions as unknown as Rec[]).filter((m) => m['v0_1_prototype']).map((m) => m['id'] as string);

describe('既定の data（us_07。spec §3・§4.1）', () => {
  it('コリーの 300 m の内に 12 群・60 名、乗せられるのは 20 名・40 名で達成、拾うのは 40 m の内で 5 kt 以下、フィッチの輪 180 m・砲火 1,700 m（IP1 で 1,200 → 1,550、IP4 で 1,700）に 4 秒、昼の倍率 1.8', () => {
    for (const hard of [false, true]) {
      const p = getRescueParams(gameData, getPrototypeMission(gameData, 'us_07', hard))!;
      expect([p.groups.length, p.total, p.capacity, p.objectiveDelivered, p.pickupM, p.pickupMaxKt, p.perPersonS, p.transferPerPersonS, p.shellKillM, p.shellKill2, p.groupJitterM, p.moonFactor]).toEqual([12, 60, 20, 40, 40, 5, 0.8, 0.25, 30, 900, 40, 1.8]); // shell_kill_m は v0.8.5 IP2 で 20 → 30
      expect(p.fitch).toEqual({ x: 3750, y: 1450, ringM: 180, ring2: 32400, headingDeg: 45, coverM: 1700, cover2: 2_890_000, coverS: 4, labelJa: 'フィッチ' });
      // IP1 の目安は cover_m ≈ コリーまでの距離（1,699 m）− 約 150 m。IP4: 群の場をほぼ覆う（コリーまでの距離 ＋ 約 1 m。S ボートの線の終わりを西へ 200〜250 m 下げて V-D2 を保つ）
      expect(Math.round(Math.hypot(p.fitch.x - p.corry.x, p.fitch.y - p.corry.y) - p.fitch.coverM)).toBe(-1);
      expect(p.corry).toEqual({ x: 2600, y: 2700, headingDeg: 30, labelJa: 'コリー' });
      for (const g of p.groups) {
        expect(Math.hypot(g.x - p.corry.x, g.y - p.corry.y)).toBeLessThanOrEqual(300);
        expect(g.count >= 3 && g.count <= 7).toBe(true);
      }
    }
    expect(validateRescueMissions(gameData)?.total).toBe(60);
    expect([RESCUE_KEYS.length, RESCUE_FITCH_KEYS, RESCUE_CORRY_KEYS, RESCUE_DAYLIGHT_KEYS, RESCUE_GROUPS_MAX, RESCUE_MISSION_TYPE, RESCUE_DAYLIGHT_RANGE]).toEqual([
      15, ['x_m', 'y_m', 'ring_m', 'heading_deg', 'cover_m', 'cover_s', 'label_ja'], ['x_m', 'y_m', 'heading_deg', 'label_ja'], ['moon_factor', 'source'], 16, 'rescue', [1, 3],
    ]); // 鍵は v0.8.5 IP2 で shelling・sboat_wave2 を足して 12 → 14、IP3 で friendly_boats を足して 15
  });
  it('setup の鍵: us_07 だけ rescue（ノーマル・ハード）。ほかの任務は鍵ごと出ない。昼から始まるのは jp_03（evac の day_start）と us_07（rescue）だけ', () => {
    for (const id of PROTO_IDS) {
      for (const hard of [false, true]) {
        const s = buildWorldSetup(gameData, id, { sortie: directSortie(id, 3, 'none', hard, false), hard });
        expect('rescue' in s, id).toBe(id === 'us_07');
        expect(setupDayStart(s), id).toBe(id === 'us_07' || id === 'jp_03');
        if (id !== 'us_07') expect(rescueSetupPart(gameData, getPrototypeMission(gameData, id, hard)), id).toEqual({});
      }
    }
    expect([setupDayStart({}), setupDayStart({ evac: { dayStart: false }, rescue: {} }), setupDayStart({ rescue: {} })]).toEqual([false, false, true]);
  });
  it('V-U1: 昼の倍率は us_07 だけ月の係数の代わり（視程 2,700 m）。moon_factor.day 1.0（jp_03 も読む）は変えない。S ボートは昼の倍率でも史実モードでも出発で見つからない', () => {
    const m = getPrototypeMission(gameData, 'us_07');
    expect([rescueMoonFactor(gameData, m), rescueMoonFactor(gameData, getPrototypeMission(gameData, 'jp_03'))]).toEqual([1.8, undefined]);
    expect(gameData.hitRateModel.visibility.moon_factor.day).toBe(1);
    expect(playerVisRangeM(getVisibilityParams(gameData, 'day', false, 1.8))).toBeCloseTo(2700, 9);
    expect(getVisibilityParams(gameData, 'day', false)).toEqual(getVisibilityParams(gameData, 'day', false, undefined));
    expect(buildWorldSetup(gameData, 'us_07').vis.moonFactor).toBe(1.8);
    expect(buildWorldSetup(gameData, 'jp_03').vis.moonFactor).toBe(1);
    for (const hard of [false, true]) expect(getPtParams(gameData, getPrototypeMission(gameData, 'us_07', hard), 5)!.count).toBe(hard ? 3 : 2);
    // 倍率を上げすぎると今の検査（出発で見つからない）が止める＝この値で回っている
    const d = clone();
    ((rescueOf(d)['daylight'] as Rec)['moon_factor'] = 3);
    expect(() => getPtParams(d, getPrototypeMission(d, 'us_07'), 5)).toThrow(/出発で見つかる/);
  });
});

describe('起動時の検査（V-Q1〜V-Q8・V-D1〜V-D2・V-U1・V-U2 の射界）', () => {
  it('V-Q1: 鍵の閉じた集合・群は 1〜16 の [x, y, 人数]・合計 ≥ 達成の数・数の範囲・出典', () => {
    expect(build((d) => (rescueOf(d)['boats'] = 1))).toThrow(/us_07\.v0_1_prototype\.rescue の鍵はちょうど groups・.*（.*boats）（V-Q1・spec-v0850 §4）/);
    expect(build((d) => delete rescueOf(d)['source'])).toThrow(/rescue の鍵はちょうど/);
    expect(build((d) => (rescueOf(d)['groups'] = []))).toThrow(/rescue\.groups は 1〜16 群の配列（V-Q1/);
    expect(build((d) => (rescueOf(d)['groups'] = new Array(17).fill([2700, 2600, 3])))).toThrow(/rescue\.groups は 1〜16 群の配列/);
    expect(build((d) => ((rescueOf(d)['groups'] as unknown[])[3] = [2650, 2480, 0]))).toThrow(/rescue\.groups\[3\] は \[x, y, 人数\]（人数は 1 以上の整数）（V-Q1/);
    expect(build((d) => ((rescueOf(d)['groups'] as unknown[])[3] = [2650, 2480, 2.5]))).toThrow(/rescue\.groups\[3\] は/);
    expect(build((d) => (rescueOf(d)['groups'] = [[2700, 2600, 39]]))).toThrow(/rescue\.groups の人数の合計（39）は objective_delivered（40）以上（V-Q1/);
    expect(build((d) => (rescueOf(d)['groups'] = [[2700, 2600, 40]]))).not.toThrow();
    expect(build((d) => (rescueOf(d)['objective_delivered'] = 0))).toThrow(/rescue\.objective_delivered は 1 以上の整数（0）/);
    expect(build((d) => (rescueOf(d)['pickup_m'] = 0))).toThrow(/rescue\.pickup_m は正（V-Q1/);
    expect(build((d) => (rescueOf(d)['per_person_s'] = -1))).toThrow(/rescue\.per_person_s は正/);
    expect(build((d) => (rescueOf(d)['group_jitter_m'] = -1))).toThrow(/rescue\.group_jitter_m は 0 以上/);
    expect(build((d) => (rescueOf(d)['shell_kill_m'] = -1))).toThrow(/rescue\.shell_kill_m は 0 以上/);
    expect(build((d) => (fitchOf(d)['range_m'] = 1))).toThrow(/rescue\.ships\.fitch の鍵はちょうど x_m・y_m・ring_m・heading_deg・cover_m・cover_s・label_ja/);
    expect(build((d) => delete corryOf(d)['label_ja'])).toThrow(/rescue\.ships\.corry の鍵はちょうど/);
    expect(build((d) => (fitchOf(d)['ring_m'] = 0))).toThrow(/rescue\.ships\.fitch の ring_m・cover_s は正/);
    expect(build((d) => (corryOf(d)['label_ja'] = ' '))).toThrow(/rescue\.ships の label_ja は空でない文字列/);
  });
  it('V-Q2: 群（ずれ込み）・フィッチの輪・コリーは海域の中で浅瀬の外（浅瀬は y 3,750〜）', () => {
    expect(build((d) => ((rescueOf(d)['groups'] as unknown[])[0] = [2700, 3711, 7]))).toThrow(/rescue\.groups\[0\]（2700, 3711・ずれ ±40）は海域の中で浅瀬の外（V-Q2/);
    expect(build((d) => ((rescueOf(d)['groups'] as unknown[])[0] = [2700, 3709, 7]))).not.toThrow();
    expect(build((d) => ((rescueOf(d)['groups'] as unknown[])[0] = [30, 2600, 7]))).toThrow(/rescue\.groups\[0\]（30, 2600・ずれ ±40）は海域の中/);
    expect(build((d) => (fitchOf(d)['y_m'] = 170))).toThrow(/rescue\.ships\.fitch の輪（3750, 170・半径 180）は海域の中で浅瀬の外（V-Q2/);
    expect(build((d) => (corryOf(d)['y_m'] = 3800))).toThrow(/rescue\.ships\.corry（2600, 3800）は海域の中で浅瀬の外（V-Q2/);
  });
  it('V-Q3: 乗せられる数は 1 以上で達成の数未満（1 往復では達成しない）', () => {
    expect(build((d) => (rescueOf(d)['capacity'] = 40))).toThrow(/rescue\.capacity は 1 以上の整数で objective_delivered（40）未満（1 往復では達成しない。40）（V-Q3/);
    expect(build((d) => (rescueOf(d)['capacity'] = 0))).toThrow(/rescue\.capacity は 1 以上の整数/);
    expect(build((d) => (rescueOf(d)['capacity'] = 39))).not.toThrow();
  });
  it('V-Q4: フィッチの輪は帰投の輪（3750, 750・半径 250。v0.8.5 S3 で寄せ、S3b でフィッチの真北へ、IP1 でフィッチと一緒に北へ）に重ならない', () => {
    expect(build((d) => Object.assign(fitchOf(d), { x_m: 3750, y_m: 1180 }))).toThrow(/rescue\.ships\.fitch の輪は帰投の輪に重ならない（V-Q4/); // 中心の間 430 ＝ 180 ＋ 250（ちょうどは重なる）
    expect(build((d) => Object.assign(fitchOf(d), { x_m: 3750, y_m: 1181 }))).not.toThrow(/V-Q4/);
  });
  it('V-Q5・V-U2: フィッチの輪は砲台（1600, 4600・射界 2,600 m）の外、コリーは射界の内', () => {
    expect(build((d) => Object.assign(fitchOf(d), { x_m: 3200, y_m: 2400 }))).toThrow(/rescue\.ships\.fitch の輪は砲台（1600, 4600）の射界 2600 m の外（V-Q5/);
    expect(build((d) => Object.assign(corryOf(d), { x_m: 5000, y_m: 2600 }))).toThrow(/rescue\.ships\.corry はどれかの砲台の射界（shore_battery\.params\.gun\.effective_night_m）の内（砲撃の下の救助）（V-U2/);
    // 砲台の今夜の揺らぎも見る（IP1 の地図でフィッチの輪の縁まで約 3,634 m。揺らぎ 1,400 m で 2,234 ≤ 2,600）
    expect(build((d) => ((protoOf(d, 'us_07')['night'] as Rec)['shore_battery_jitter_m'] = 1400))).toThrow(/V-Q5/);
  });
  it('V-Q6: 拾える速さは自艇の静音の上限（Higgins 18 kt）以下', () => {
    expect(build((d) => (rescueOf(d)['pickup_max_kt'] = 18.5))).toThrow(/rescue\.pickup_max_kt（18\.5 kt）は自艇（us_higgins78）の静音の上限 18 kt 以下（V-Q6/);
    expect(build((d) => (rescueOf(d)['pickup_max_kt'] = 18))).not.toThrow();
  });
  it('V-Q7: scoring.json の objective_by_type.rescue と rescue.points_per_survivor', () => {
    expect(build((d) => delete (d.scoring.objective_by_type as Rec)['rescue'])).toThrow(/scoring\.json の objective_by_type に rescue が無い（V-Q7/);
    expect(build((d) => delete (d.scoring as unknown as Rec)['rescue'])).toThrow(/scoring\.json の rescue\.points_per_survivor（0 以上の数）が無い（V-Q7/);
    expect([(gameData.scoring.objective_by_type as Rec)['rescue'], ((gameData.scoring as unknown as Rec)['rescue'] as Rec)['points_per_survivor'], (gameData.scoring.kill.points_by_enemy as Rec)['de_sboat_enemy']]).toEqual([300, 8, 70]);
  });
  it('V-Q8: rescue は type rescue の任務だけ・type rescue には要る・1 任務だけ', () => {
    expect(build((d) => (missionOf(d, 'us_07')['type'] = 'patrol_and_evade'))).toThrow(/us_07\.v0_1_prototype\.rescue は type rescue の任務だけ（patrol_and_evade）（V-Q8/);
    expect(build((d) => delete protoOf(d, 'us_07')['rescue'])).toThrow(/us_07\.v0_1_prototype\.rescue は type rescue の任務に要る（生存者の群と渡す先）（V-Q8/);
    const d = clone();
    missionOf(d, 'us_06')['type'] = 'rescue';
    protoOf(d, 'us_06')['rescue'] = { ...(JSON.parse(JSON.stringify(rescueOf(d))) as Rec), shelling: null, sboat_wave2: null, friendly_boats: null }; // 砲台・S ボートの無い任務は null（v0.8.5 IP2 の V-H2・V-W2）・味方の艇の道は us_07 の水路（v0.8.5 IP3 の V-F3）
    expect(() => getRescueParams(d, getPrototypeMission(d, 'us_06'))).not.toThrow();
    expect(() => validateRescueMissions(d)).toThrow(/missions_seed\.json の v0_1_prototype\.rescue は 1 任務だけ（us_06・us_07。V-Q8・spec-v0850 §4）/);
  });
  it('V-U1: 昼の倍率は 1〜3・鍵の閉じた集合・出典', () => {
    expect(build((d) => ((rescueOf(d)['daylight'] as Rec)['moon_factor'] = 0.9))).toThrow(/rescue\.daylight\.moon_factor は 1〜3（0\.9）（V-U1/);
    expect(build((d) => ((rescueOf(d)['daylight'] as Rec)['moon_factor'] = 3.1))).toThrow(/moon_factor は 1〜3（3\.1）/);
    expect(build((d) => ((rescueOf(d)['daylight'] as Rec)['vis_m'] = 1))).toThrow(/rescue\.daylight の鍵はちょうど moon_factor・source/);
    expect(build((d) => ((rescueOf(d)['daylight'] as Rec)['source'] = ''))).toThrow(/rescue\.daylight\.source は空でない文字列（V-U1/);
  });
  it('V-D1: フィッチの砲火の距離は S ボートの砲の有効射程（600 m）より遠い。V-D2: 輪の縁から最寄りの線（揺らぎ込み）まで cover_m より遠い（ハードの 3 本目も）', () => {
    expect(build((d) => (fitchOf(d)['cover_m'] = 600))).toThrow(/rescue\.ships\.fitch\.cover_m（600 m）は S ボート（de_sboat_enemy）の砲の有効射程 600 m より遠い（フィッチの内で航過を固めない）（V-D1/);
    expect(build((d) => (fitchOf(d)['cover_m'] = 601))).not.toThrow();
    expect(build((d) => (fitchOf(d)['cover_m'] = 1853))).toThrow(/rescue\.ships\.fitch の輪の縁から pt_boats の線 0（今夜の揺らぎ ±224 m 込み）まで 1852 m は cover_m（1853 m）より遠い（出発で退かない）（V-D2/); // IP4: 線 0 の終わり (1550, 1950)（IP1 は (1800, 1950) で 1,609 m）
    expect(build((d) => (fitchOf(d)['cover_m'] = 1852))).not.toThrow();
    expect(build((d) => ((((protoOf(d, 'us_07')['hard'] as Rec)['extra_pt_legs_m'] as number[][])[0] = [200, 2400, 3500, 1800])), 'us_07', true)).toThrow(/pt_boats の線 2/);
    expect(build((d) => ((((protoOf(d, 'us_07')['hard'] as Rec)['extra_pt_legs_m'] as number[][])[0] = [200, 2400, 3500, 1800])), 'us_07', false)).not.toThrow();
  });
});
