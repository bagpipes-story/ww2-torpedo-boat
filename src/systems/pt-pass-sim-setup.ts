// 米PT の掃射の航過の模擬の組み立て（v0.6.3。spec §F）: data（enemies の us_pt_enemy・boats の艇・missions_seed の jp_05）から core/pt-pass-sim の設定を作り、
// 較正の帯（spec §F.4、v0.6.3 実機 1 回目 spec r1 §G.3。tests/pt-pass-sim*.test.ts が N 200 で検査し、scripts/pt-pass-sim.ts が N 400 で表にする）を持つ。Phaser 非依存・window を読まない（ゲームは使わない）。
// 値は world-setup の buildWorldSetup と同じ（今夜の揺らぎは試行ごとに seed で rollNight。出撃の組み立てと同じ）。上書きは data の記録を写して getPtParams・getGunBatteryParams に通す（検査も通る）。
// 13mm を撃つ遊び方の帯は systems/pt-gun-calibration（spec r1 §G.4）。不変（ptInvariantMisses）はどちらの表も同じ。
import { getPrototypeMission, type GameData } from '../config/game-data';
import { PT_GUN_SHELL_POOL_SIZE, PT_SHELL_POOL_SIZE } from '../config/pt-config';
import { FIXED_STEP_S } from '../config/step-config';
import { isPtDataRecord } from '../core/pt-data';
import type { PtSimSetup } from '../core/pt-pass-sim';
import { runPtCell, type PtCell } from '../core/pt-sim-cell';
import type { PtNoGunPolicy, PtPolicy } from '../core/pt-sim-policy';
import { buildWorldSetup } from './world-setup';

/** 感度を見る上書き（無ければ data の値）。調整の順は spec r1 §G.6（data だけ。理由は source に） */
export interface PtSimOverrides {
  detectM?: number; damage?: number; rounds?: number; offsetM?: number; passes?: number; openFireS?: number;
  commitTcpaS?: number; runInKt?: number; passGapS?: number; wingmanDelayS?: number;
  /** 航過を固める針路の差の上限 deg・航過を待つ PT が寄らない距離 m（v0.6.3 の直し）、離脱の最大秒と距離 m・待つ PT の位置取りの距離 m（v0.6.3 実機 1 回目） */
  commitHeadingTolDeg?: number; holdOffM?: number; breakMaxS?: number; breakOffM?: number; stationM?: number;
  /** 13mm を受けた PT（under_fire）: 去る HP・死傷・引火の確率 */
  retreatHp?: number; casualty?: number; fireChance?: number;
  /** T-14 の 13mm（boats.json の自艇の gun_battery）: 散布 m・発射速度 発/分・艇首尾の円錐 deg・弾倉の発数・交換の秒 */
  gunDisp?: number; gunRpm?: number; gunCone?: number; magRounds?: number; reloadS?: number;
  /** 任務の燃料 gal・夜明けまでの実秒（buildWorldSetup の fuelGal・dawnS） */
  fuelGal?: number; dawnS?: number;
  /** v0.6.3 実機 2 回目: PT の砲の有効射程 m・1 命中の機関損傷の確率、航過は危ない間だけ（core/pt-fire）を切る（true で f27b266 の航過の終わり。spec r2 §I.3-5） */
  effectiveM?: number; engineDamage?: number; passEndOff?: boolean;
}

export function ptSimSetup(data: GameData, missionId: string, o: PtSimOverrides = {}): PtSimSetup {
  const w = buildWorldSetup(withGunOverrides(withPtOverrides(data, missionId, o), missionId, o), missionId, { fuelGal: o.fuelGal ?? NaN, dawnS: o.dawnS ?? NaN });
  if (!w.ptBoats) throw new Error(`${missionId} に米PT の隊（v0_1_prototype.pt_boats）が無い`);
  const pt = o.passEndOff === true ? { ...w.ptBoats, passEndsWhenSafe: false } : w.ptBoats;
  const night = w.mission.night;
  const events = data.riskEvents.events as readonly Record<string, unknown>[];
  const hazardShares: Record<string, number> = {};
  for (const id of night ? night.optionalHazards : []) hazardShares[id] = events.find((e) => e['id'] === id)?.['share'] as number;
  return {
    pt, night, hazardShares, nightEnemyRolls: w.night.enemyOffsets.length, nightBatteries: w.night.batteryDx.length, shellPoolSize: PT_SHELL_POOL_SIZE, // pt は揺らぎなし（= getPtParams）。試行ごとに seed の夜を当てる
    boat: w.boatParams, start: w.playerStart, boundsMarginM: w.boundsMarginM, halfLengthM: w.boatHalfLengthM, halfBeamM: w.boatHalfBeamM,
    damage: w.damageParams, crew: w.crew, crewEffects: w.crewEffects, fuel: w.fuelCurve, fuelGal: w.fuelStartGal, vis: w.vis, visRange2: w.visRange2, ring: w.mission.returnPoint,
    durationS: w.durationS, timeScale: w.timeScale, stepS: FIXED_STEP_S, gun: w.guns, gunShellPoolSize: PT_GUN_SHELL_POOL_SIZE,
  };
}

/** 米PT の上書きを当てた data の写し（上書きが無ければそのまま）。世界と同じ getPtParams の検査を通す */
function withPtOverrides(data: GameData, missionId: string, o: PtSimOverrides): GameData {
  const keys = [o.detectM, o.damage, o.rounds, o.offsetM, o.passes, o.openFireS, o.commitTcpaS, o.runInKt, o.passGapS, o.wingmanDelayS, o.commitHeadingTolDeg, o.holdOffM, o.breakMaxS, o.breakOffM, o.stationM, o.retreatHp, o.casualty, o.fireChance, o.effectiveM, o.engineDamage];
  if (keys.every((v) => v === undefined)) return data;
  const id = getPrototypeMission(data, missionId).enemyId;
  const rec: unknown = data.enemies.enemies.find((e) => e.id === id);
  if (!isPtDataRecord(rec)) throw new Error(`${missionId}: enemies.json の ${id} は米PT の記録ではない`);
  const a = rec.attack;
  const g = rec.guns[0]!;
  const u = rec.under_fire;
  const r = {
    ...rec, detection: { ...rec.detection, base_detect_m: o.detectM ?? rec.detection.base_detect_m }, guns: [{ ...g, damage: o.damage ?? g.damage, effective_night_m: o.effectiveM ?? g.effective_night_m, engine_damage_chance: o.engineDamage ?? g.engine_damage_chance }],
    attack: {
      ...a, rounds_per_pass: o.rounds ?? a.rounds_per_pass, pass_offset_m: o.offsetM ?? a.pass_offset_m, max_passes: o.passes ?? a.max_passes, open_fire_s: o.openFireS ?? a.open_fire_s,
      commit_tcpa_s: o.commitTcpaS ?? a.commit_tcpa_s, run_in_speed_kt: o.runInKt ?? a.run_in_speed_kt, pass_gap_s: o.passGapS ?? a.pass_gap_s, wingman_delay_s: o.wingmanDelayS ?? a.wingman_delay_s,
      commit_heading_tol_deg: o.commitHeadingTolDeg ?? a.commit_heading_tol_deg, hold_off_m: o.holdOffM ?? a.hold_off_m, break_max_s: o.breakMaxS ?? a.break_max_s, break_off_m: o.breakOffM ?? a.break_off_m,
    },
    tactics: { ...rec.tactics, station_m: o.stationM ?? rec.tactics.station_m },
    under_fire: { retreat_hp: o.retreatHp ?? u.retreat_hp, casualty_chance: o.casualty ?? u.casualty_chance, fire_chance: o.fireChance ?? u.fire_chance },
  };
  const enemies = data.enemies.enemies.map((e) => (e.id === id ? (r as unknown as typeof e) : e));
  return { ...data, enemies: { ...data.enemies, enemies } } as GameData;
}

/** 13mm の上書きを当てた data の写し（自艇の boats.json の gun_battery。上書きが無ければそのまま）。世界と同じ getGunBatteryParams の検査を通す */
function withGunOverrides(data: GameData, missionId: string, o: PtSimOverrides): GameData {
  if ([o.gunDisp, o.gunRpm, o.gunCone, o.magRounds, o.reloadS].every((v) => v === undefined)) return data;
  const id = getPrototypeMission(data, missionId).playerBoatId;
  type GunRec = { dead_cone_deg: number; groups: Record<string, unknown>[]; magazine?: { rounds: number; reload_s: number } };
  const boats = data.boats.boats.map((b) => {
    const g = b.id === id ? ((b as Record<string, unknown>)['gun_battery'] as GunRec | undefined) : undefined;
    if (!g) return b;
    const g0 = g.groups[0]!;
    const groups = [{ ...g0, dispersion_m: o.gunDisp ?? g0['dispersion_m'], rounds_per_min: o.gunRpm ?? g0['rounds_per_min'] }, ...g.groups.slice(1)];
    const magazine = g.magazine ? { rounds: o.magRounds ?? g.magazine.rounds, reload_s: o.reloadS ?? g.magazine.reload_s } : undefined;
    return { ...b, gun_battery: { ...g, dead_cone_deg: o.gunCone ?? g.dead_cone_deg, groups, ...(magazine ? { magazine } : {}) } } as unknown as typeof b;
  });
  return { ...data, boats: { ...data.boats, boats } } as GameData;
}

type Band = readonly [number, number];
/** 較正の 1 行（spec §F.4）。帯は %・HP・m（端を含む）。hpVsCruise は巡航（cruise）の HP の平均に掛ける上限、passesMin・altMin は 1 夜の航過の平均・赤い線が前と反対の舷から来る割合の下限（NaN は見ない）。proto は今の data の模擬の値（N 400。目安で、検査はしない） */
export interface PtCalibrationRow {
  policy: PtNoGunPolicy;
  /** spec §F.3 の ★（最小の組） */
  star: boolean;
  detectedPct: Band | null; sunkPct: Band | null; hpMean: Band | null; hpVsCruise: number; homePct: Band; homeBeforeDawnPct: Band | null; afterDawnPct: Band | null;
  firstDetectMedM: Band | null; adriftPct: Band; passesMin: number; altMin: number;
  proto: { detectedPct: number; hpMean: number; sunkPct: number; homePct: number };
}

/**
 * どの遊び方も帰投 65% 以上（罠にしない）・漂流 1% 以下（燃料は脅威ではない。全速で逃げ回る turn_full は 8%・北の縁まで全速で逃げて待つ edge_flee は 10%）。
 * v0.6.3 実機 1 回目（「簡単すぎる」）から、何もしない巡航・静音は 50%・35% 以上（何もしないと沈むのが設計）、縁へ逃げる edge_flee は床なし（縁に逃げ場は無い＝分かっている罠）
 */
const HOME_MIN: Band = [65, 100];
const ADRIFT: Band = [0, 1];
/** 待つ PT（hold_off_m 500 m の外で待ち始めた）が艇へ寄ってよい最接近 m（spec r1 §G.5 の F9。試作の最小 362 m） */
export const PT_HELD_MIN_M = 350;
const row = (policy: PtNoGunPolicy, star: boolean, b: Partial<Omit<PtCalibrationRow, 'policy' | 'star' | 'proto'>>, proto: readonly [number, number, number, number]): PtCalibrationRow => ({
  policy, star, detectedPct: null, sunkPct: null, hpMean: null, hpVsCruise: NaN, homePct: HOME_MIN, homeBeforeDawnPct: null, afterDawnPct: null, firstDetectMedM: null, adriftPct: ADRIFT, passesMin: NaN, altMin: NaN, ...b,
  proto: { detectedPct: proto[0], hpMean: proto[1], sunkPct: proto[2], homePct: proto[3] },
});

/**
 * spec §F.4: 1 何もしないと痛い、2 転舵で助かる、3 遅い反応でも効く、4 暗さが効く、5 罠にしない、6 燃料は脅威ではない（7 の不変は ptInvariantMisses がどの行にも見る）。
 * v0.6.3 実機 1 回目（「簡単すぎる・PT が執拗でない・単調」）の帯（spec r1 §G.3）: 何もしないと沈む（巡航 18〜40%・静音 30〜60%）・HUD どおりの転舵は HP 12〜24 で沈まない・
 * 航過は 1 夜 4.5 回以上・2 秒遅れの転舵は 4〜22% 沈む。赤い線が前と反対の舷から来る割合（挟み撃ち）は巡航 0.75 以上・赤い線で全速の転舵 0.65 以上（レビュー F2: 0.5 は挟み撃ちを
 * 外しても通った。seed 1〜200 で 位置取りなし → あり が 巡航 0.49 → 0.88・全速の転舵 0.56 → 0.74）。proto は [発見 %, HP の平均, 沈没 %, 帰投 %]（N 400・seed 1〜400）
 */
export const PT_CALIBRATION: readonly PtCalibrationRow[] = [
  row('cruise', true, { detectedPct: [95, 100], sunkPct: [18, 40], hpMean: [35, 46], homePct: [50, 100], altMin: 0.75 }, [100, 40.5, 26.3, 74]),
  row('silent', true, { detectedPct: [65, 92], sunkPct: [30, 60], hpMean: [28, 42], homePct: [35, 100] }, [78, 36.1, 45.0, 55]),
  row('full', false, { firstDetectMedM: [1500, Infinity], sunkPct: [0, 8] }, [100, 24.0, 3.3, 97]),
  row('zigzag', false, {}, [100, 35.1, 19.3, 81]),
  row('turn_cruise', true, { sunkPct: [0, 6], hpVsCruise: 0.6 }, [100, 20.9, 1.8, 98]),
  row('react_full', false, { sunkPct: [0, 4], hpMean: [12, 24], passesMin: 4.5, altMin: 0.65 }, [100, 18.6, 1.5, 99]),
  row('dodge_silent', true, { sunkPct: [0, 5], hpMean: [12, 24], passesMin: 4.5 }, [78, 18.2, 1.0, 99]),
  row('turn_silent', false, {}, [78, 23.5, 13.5, 87]),
  row('late_turn', true, { sunkPct: [4, 22], hpMean: [26, 40] }, [100, 33.0, 10.3, 90]),
  row('turn_full', false, { adriftPct: [0, 8] }, [100, 5.8, 0, 97]),
  row('dark_stop', true, { detectedPct: [25, 55], sunkPct: [0, 10], homeBeforeDawnPct: [75, 100] }, [39, 9.2, 5.3, 95]),
  row('meet', false, { sunkPct: [0, 15] }, [100, 30.2, 3.5, 97]),
  row('stop_dawn', false, { detectedPct: [0, 5], homePct: [100, 100], afterDawnPct: [100, 100] }, [0, 0, 0, 100]),
  row('edge_flee', false, { hpMean: [40, 50], adriftPct: [0, 10], homePct: [0, 100] }, [100, 47.3, 70.8, 29]),
];

/** 帯（spec §F.4・r1 §G.3）と不変（ptInvariantMisses）を外れた項目（空なら合格） */
export function ptCalibrationMisses(r: PtCalibrationRow, c: PtCell, s: PtSimSetup, cruiseHpMean: number): string[] {
  const out: string[] = [];
  const bands: readonly (readonly [string, number, Band | null])[] = [
    ['発見 %', c.detectedPct, r.detectedPct], ['沈没 %', c.sunkPct, r.sunkPct], ['HP の平均', c.hpMean, r.hpMean], ['帰投 %', c.homePct, r.homePct], ['夜明け前の帰投 %', c.homeBeforeDawnPct, r.homeBeforeDawnPct],
    ['夜明け後の帰投 %', c.afterDawnPct, r.afterDawnPct], ['最初の発見の中央値 m', c.firstDetectMedM, r.firstDetectMedM], ['漂流 %', c.adriftPct, r.adriftPct],
  ];
  for (const [name, v, b] of bands) if (b && !(v >= b[0] && v <= b[1])) out.push(`${name} ${v.toFixed(1)}（帯 ${b[0]}〜${b[1]}）`);
  if (!Number.isNaN(r.hpVsCruise) && !(c.hpMean <= r.hpVsCruise * cruiseHpMean)) out.push(`HP の平均 ${c.hpMean.toFixed(1)}（巡航 ${cruiseHpMean.toFixed(1)} の ${r.hpVsCruise} 倍以下）`);
  if (!Number.isNaN(r.passesMin) && !(c.passes >= r.passesMin)) out.push(`1 夜の航過 ${c.passes.toFixed(2)} 回（${r.passesMin} 回以上）`);
  if (!Number.isNaN(r.altMin) && !(c.alt >= r.altMin)) out.push(`前と反対の舷からの赤い線 ${c.alt.toFixed(2)}（${r.altMin} 以上）`);
  return [...out, ...ptInvariantMisses(c, s)];
}

/**
 * 不変（spec §F.4 の 7・r1 §G.5。どの遊び方も）: 予告から初弾 ≥ open_fire_s・航過は同時に 1 隻・射程と視程の外から撃たない・1 回の航過 ≤ 弾数 で × 被害 < 艇の HP・
 * AI が終えた航過は予告から 2 ステップより長い（v0.6.3 の直し。13mm で沈んで閉じた航過は onPassEnd を呼ばないので入らない）・
 * 待つ PT は hold_off_m の外で待ち始めたら PT_HELD_MIN_M より内へ来ない・13mm は視程と射程の外へ撃たない（v0.6.3 実機 1 回目。「HP だけで沈む PT は無い」F11 は数えても外れようがないので数えない＝レビュー R4。守りは pt-data の retreat_hp < hull_hp の検査と tests/pt-damage）
 */
export function ptInvariantMisses(c: PtCell, s: PtSimSetup): string[] {
  const out: string[] = [];
  const p = s.pt;
  if (c.shots > 0 && !(c.minWarnS >= p.openFireS - 1e-9)) out.push(`予告から初弾 ${c.minWarnS.toFixed(2)} 秒（${p.openFireS} 秒以上）`);
  if (c.maxPassing > 1) out.push(`同時に航過 ${c.maxPassing} 隻`);
  if (c.beyondEff + c.beyondSight > 0) out.push(`射程の外 ${c.beyondEff} 発・視程の外 ${c.beyondSight} 発`);
  if (!(c.worstPassHits <= p.roundsPerPass && c.worstPassHits * p.hit.damage < s.damage.maxHp)) out.push(`1 回の航過の命中 ${c.worstPassHits} 発（${p.roundsPerPass} 発まで・HP ${s.damage.maxHp} 未満）`);
  if (c.passes > 0 && !(c.minPassS > 2 * s.stepS + 1e-9)) out.push(`予告から ${c.minPassS.toFixed(3)} 秒で終わった航過（2 ステップより長く）`);
  if (!(c.heldMinM >= PT_HELD_MIN_M)) out.push(`待つ PT の最接近 ${c.heldMinM.toFixed(0)} m（${PT_HELD_MIN_M} m 以上）`);
  if (c.gunBeyond > 0) out.push(`13mm が視程か射程の外へ ${c.gunBeyond} 回`);
  return out;
}

/** 較正の表を 1 回だけ回す口（tests と scripts の TABLE=1・2）: 遊び方ごとの集計は初めて読んだときに n 夜（seed は seedBase から）回して覚える（13mm の帯が読む撃たない行も同じ seed） */
export function ptCalibrationRun(data: GameData, missionId: string, n: number, seedBase: number, o: PtSimOverrides = {}): { setup: PtSimSetup; cell: (policy: PtPolicy) => PtCell } {
  const setup = ptSimSetup(data, missionId, o);
  const cells = new Map<PtPolicy, PtCell>();
  const cell = (policy: PtPolicy): PtCell => cells.get(policy) ?? cells.set(policy, runPtCell(setup, policy, n, seedBase)).get(policy)!;
  return { setup, cell };
}
