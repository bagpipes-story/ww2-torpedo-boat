// 米PT の追撃の data（v0.6.3 実機 2 回目。core/pt-chase-data・config/pt-mission-data、spec r2 §C.2・§I.1）: ちょうど 19 鍵（余分・欠けは任務の id を付けて例外）、
// 各検査の境目（止まる値と通る値）、source（史料は WebSearch の抜粋のみ・本文未読）。追撃の AI はまだ読まない（数値だけ PtParams に入る）。
import { describe, expect, it } from 'vitest';
import { gameData, getPrototypeMission } from '../src/config/game-data';
import { getPtParams } from '../src/config/pt-mission-data';
import { PT_CHASE_KEYS, isChaseRecord } from '../src/core/pt-chase-data';
import type { PtParams } from '../src/core/pt-data';
import { degToRad, ktToMps } from '../src/core/units';

type Rec = Record<string, unknown>;
const clone = (): typeof gameData => JSON.parse(JSON.stringify(gameData)) as typeof gameData;
const ptRec = (d: typeof gameData): Rec => (d.enemies.enemies as unknown as Rec[]).find((e) => e['id'] === 'us_pt_enemy')!;
const chaseOf = (d: typeof gameData): Rec => ptRec(d)['chase'] as Rec;
const TS = gameData.hitRateModel.world.time_scale;
const params = (d: typeof gameData): PtParams | null => getPtParams(d, getPrototypeMission(d, 'jp_05'), TS);
/** chase の 1 鍵（と要れば他の鍵）を変えた写しで getPtParams を呼ぶ */
const withChase = (over: Rec, extra?: (d: typeof gameData) => void): (() => PtParams | null) => {
  const d = clone();
  Object.assign(chaseOf(d), over);
  extra?.(d);
  return () => params(d);
};

describe('米PT の追撃の data（us_pt_enemy.chase）', () => {
  it('jp_05 の値（固定。tests/pt-data から移した）: 追撃と連射と、航過は危ない間だけ（core/pt-fire。data からはいつも有効）。1 回の連射では沈まない（24 < HP 50）', () => {
    const p = params(gameData)!;
    expect([p.chaseMps, p.chaseMinMps, p.chaseStationM, p.chaseRelDeg, p.chaseHeldM, p.chaseHeldRelDeg, p.chaseHeldGuard2, p.chaseCommit2]).toEqual([ktToMps(39), ktToMps(10), 170, 135, 350, 150, 150 ** 2, 350 ** 2]);
    expect([p.burstRounds, p.burstMaxS, p.maxBursts, p.burstBowRofFactor, p.burstConeQuitS, p.chaseGapS, p.chaseSelfGapS, p.chaseSlowExitS, p.chaseSuppressHits, p.passEndsWhenSafe]).toEqual([6, 3, 6, 0.4, 2, 2, 3, 2, 3, true]);
    expect(p.chaseCosAft2).toBeCloseTo(Math.cos(degToRad(75)) ** 2, 12);
    expect(p.chaseCosExit2).toBeCloseTo(Math.cos(degToRad(45)) ** 2, 12);
    expect(p.burstRounds * p.hit.damage).toBe(24);
  });
  it('ちょうど 19 鍵（data の並びと同じ）、どれも数。余分・欠け・文字・配列は形が違う', () => {
    const c = chaseOf(gameData);
    expect(PT_CHASE_KEYS.length).toBe(19);
    expect(Object.keys(c)).toEqual([...PT_CHASE_KEYS]);
    expect(isChaseRecord(c)).toBe(true);
    expect(isChaseRecord({ ...c, start_m: 900 })).toBe(false); // 試作だけの鍵（spec r2 §C.2）
    const missing = { ...c };
    delete missing['suppress_hits'];
    expect(isChaseRecord(missing)).toBe(false);
    expect(isChaseRecord({ ...c, burst_rounds: '6' })).toBe(false);
    expect(isChaseRecord({ ...c, gap_s: Infinity })).toBe(false);
    expect(isChaseRecord([])).toBe(false);
    expect(isChaseRecord(null)).toBe(false);
  });

  it('余分・欠け・無い chase は起動時に例外（jp_05 と chase の名前入り）', () => {
    expect(withChase({ lookahead_m: 150 })).toThrow(/jp_05.*chase/);
    const d = clone();
    delete chaseOf(d)['cone_quit_s'];
    expect(() => params(d)).toThrow(/jp_05.*chase/);
    const none = clone();
    delete ptRec(none)['chase'];
    expect(() => params(none)).toThrow(/jp_05.*chase/);
  });

  it('source: chase は design で、史料は「WebSearch の抜粋のみ・本文未読」。attack・guns・tactics にも実機 2 回目の理由', () => {
    const s = ptRec(gameData)['source'] as Rec;
    expect(String(s['chase'])).toMatch(/^design（v0\.6\.3 実機 2 回目/);
    expect(String(s['chase'])).toContain('WebSearch の抜粋のみ・本文未読');
    expect(String(s['guns'])).toContain('engine_damage_chance 0.02 → 0.15');
    for (const k of ['attack', 'guns', 'tactics']) expect(String(s[k]), k).toContain('v0.6.3 実機 2 回目');
  });

  // 境目: 止まる値（任務の id と chase の句か、他の記録が要る検査の文）と、そのすぐ内側の通る値
  const stops: [string, Rec, RegExp][] = [
    ['speed_kt 31（自艇の最大 31 kt と同じ＝振り切れる）', { speed_kt: 31 }, /jp_05.*chase\.speed_kt.*振り切れない/],
    ['speed_kt 39.5（boat_ref の最大 39 kt より速い）', { speed_kt: 39.5 }, /jp_05.*chase: 0 < speed_kt/],
    ['min_target_kt 0', { min_target_kt: 0 }, /chase: min_target_kt/],
    ['start_aft_deg 0', { start_aft_deg: 0 }, /chase: 0 < start_aft_deg < 90/],
    ['start_aft_deg 90', { start_aft_deg: 90 }, /chase: 0 < start_aft_deg < 90/],
    ['station_m 60（= attack.min_range_m）', { station_m: 60 }, /chase: attack\.min_range_m < station_m < commit_m/],
    ['station_m 350（= commit_m）', { station_m: 350 }, /chase: attack\.min_range_m < station_m < commit_m/],
    ['commit_m 450（= 有効射程）', { commit_m: 450 }, /chase: commit_m < guns\.effective_night_m/],
    ['station_rel_deg 90', { station_rel_deg: 90 }, /chase: 90 < station_rel_deg/],
    ['held_rel_deg 134（< station_rel_deg 135）', { held_rel_deg: 134 }, /chase: 90 < station_rel_deg ≤ held_rel_deg/],
    ['held_rel_deg 180', { held_rel_deg: 180 }, /held_rel_deg < 180/],
    ['held_station_m 550（= attack.hold_off_m）', { held_station_m: 550 }, /chase: 0 < held_guard_m < held_station_m < attack\.hold_off_m/],
    ['held_guard_m 350（= held_station_m）', { held_guard_m: 350 }, /held_guard_m < held_station_m/],
    ['held_guard_m 0', { held_guard_m: 0 }, /held_guard_m/],
    ['burst_rounds 13（13 × 4 = 52 ≥ HP 50）', { burst_rounds: 13 }, /jp_05.*burst_rounds × damage（52）.*1 回の連射では砲だけで沈まない/],
    ['burst_rounds 2.5', { burst_rounds: 2.5 }, /chase: burst_rounds は 1 以上の整数/],
    ['burst_rounds 0', { burst_rounds: 0 }, /chase: burst_rounds/],
    ['max_bursts 0', { max_bursts: 0 }, /chase: max_bursts は 1 以上の整数/],
    ['suppress_hits 1.5', { suppress_hits: 1.5 }, /chase: suppress_hits は 1 以上の整数/],
    ['burst_max_s 0', { burst_max_s: 0 }, /chase: burst_max_s・slow_exit_s は正/],
    ['slow_exit_s 0', { slow_exit_s: 0 }, /chase: burst_max_s・slow_exit_s は正/],
    ['gap_s 負', { gap_s: -1 }, /chase: gap_s・self_gap_s は 0 以上/],
    ['self_gap_s 負', { self_gap_s: -0.1 }, /chase: gap_s・self_gap_s は 0 以上/],
    ['exit_fwd_deg 0', { exit_fwd_deg: 0 }, /chase: 0 < exit_fwd_deg < 90/],
    ['exit_fwd_deg 90', { exit_fwd_deg: 90 }, /chase: 0 < exit_fwd_deg < 90/],
    ['bow_rof_factor 0', { bow_rof_factor: 0 }, /chase: 0 < bow_rof_factor ≤ 1/],
    ['bow_rof_factor 1.1', { bow_rof_factor: 1.1 }, /chase: 0 < bow_rof_factor ≤ 1/],
    ['cone_quit_s 0', { cone_quit_s: 0 }, /chase: 0 < cone_quit_s/],
    // 実機 2 回目のレビュー R5: 円錐の秒は open_fire_s の後だけ数えるので、burst_max_s 3 以上（前の上限 5.5 の手前 3〜5.4 も）はいつまでも効かない
    ['cone_quit_s 3（= burst_max_s）', { cone_quit_s: 3 }, /chase: 0 < cone_quit_s < burst_max_s（3。艇首の円錐の秒は open_fire_s の後だけ数える）/],
    ['cone_quit_s 5.4（前の上限 burst_max_s + open_fire_s の内）', { cone_quit_s: 5.4 }, /chase: 0 < cone_quit_s < burst_max_s/],
  ];
  it.each(stops)('止まる: %s', (_name, over, msg) => {
    expect(withChase(over)).toThrow(msg);
  });

  it('通る: speed_kt 31.5・39、start_aft_deg 89、station_m 61・349、commit_m 449、station_rel_deg = held_rel_deg 150、held_station_m 549、held_guard_m 349、burst_rounds 12（48 < 50）、gap 0、bow_rof_factor 1、cone_quit_s 2.9', () => {
    const ok: Rec[] = [
      { speed_kt: 31.5 }, { speed_kt: 39 }, { start_aft_deg: 89 }, { station_m: 61 }, { station_m: 349 }, { commit_m: 449 }, { station_rel_deg: 150, held_rel_deg: 150 },
      { held_station_m: 549 }, { held_guard_m: 349 }, { burst_rounds: 12 }, { gap_s: 0, self_gap_s: 0 }, { bow_rof_factor: 1 }, { cone_quit_s: 2.9 },
    ];
    for (const o of ok) expect(withChase(o), JSON.stringify(o)).not.toThrow();
  });

  it('他の鍵とつながる検査: 有効射程を 350 m に下げると commit_m 350 で止まる、hold_off_m を 451 m に下げても held_station_m 350 は内（通る）', () => {
    const gun = (d: typeof gameData): Rec => (ptRec(d)['guns'] as Rec[])[0]!;
    const attack = (d: typeof gameData): Rec => ptRec(d)['attack'] as Rec;
    const tactics = (d: typeof gameData): Rec => ptRec(d)['tactics'] as Rec;
    expect(withChase({}, (d) => {
      gun(d)['effective_night_m'] = 350;
      attack(d)['hold_off_m'] = 450;
      tactics(d)['station_m'] = 500;
    })).toThrow(/chase: commit_m < guns\.effective_night_m（350 < 350/);
    expect(withChase({}, (d) => {
      attack(d)['hold_off_m'] = 451;
      tactics(d)['station_m'] = 451.5;
    })).not.toThrow();
  });
});
