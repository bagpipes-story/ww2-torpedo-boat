// 米PT の掃射の航過の模擬の組み立て（v0.6.3。spec §F）: data（enemies の us_pt_enemy・boats の艇・missions_seed の jp_05）から core/pt-pass-sim の設定を作り、
// 較正の帯（spec §F.4。tests/pt-pass-sim.test.ts が N 200 で検査し、scripts/pt-pass-sim.ts が N 400 で表にする）を持つ。Phaser 非依存・window を読まない（ゲームは使わない）。
// 値は world-setup の buildWorldSetup と同じ（今夜の揺らぎは試行ごとに seed で rollNight。出撃の組み立てと同じ）。米PT の上書きは data の記録を写して getPtParams に通す（検査 1〜10 も通る）。
import { getPrototypeMission, type GameData } from '../config/game-data';
import { PT_SHELL_POOL_SIZE } from '../config/pt-config';
import { FIXED_STEP_S } from '../config/step-config';
import { isPtDataRecord } from '../core/pt-data';
import { runPtCell, type PtCell, type PtPolicy, type PtSimSetup } from '../core/pt-pass-sim';
import { buildWorldSetup } from './world-setup';

/** 感度を見る上書き（無ければ data の値）。調整の順は guns.damage → rounds_per_pass → pass_offset_m → max_passes → base_detect_m → open_fire_s（spec §F.4） */
export interface PtSimOverrides {
  detectM?: number; damage?: number; rounds?: number; offsetM?: number; passes?: number; openFireS?: number;
  commitTcpaS?: number; runInKt?: number; passGapS?: number; wingmanDelayS?: number;
  /** 航過を固める針路の差の上限 deg・航過を待つ PT が寄らない距離 m（v0.6.3 の直し） */
  commitHeadingTolDeg?: number; holdOffM?: number;
  /** 任務の燃料 gal・夜明けまでの実秒（buildWorldSetup の fuelGal・dawnS） */
  fuelGal?: number; dawnS?: number;
}

export function ptSimSetup(data: GameData, missionId: string, o: PtSimOverrides = {}): PtSimSetup {
  const w = buildWorldSetup(withPtOverrides(data, missionId, o), missionId, { fuelGal: o.fuelGal ?? NaN, dawnS: o.dawnS ?? NaN });
  if (!w.ptBoats) throw new Error(`${missionId} に米PT の隊（v0_1_prototype.pt_boats）が無い`);
  const night = w.mission.night;
  const events = data.riskEvents.events as readonly Record<string, unknown>[];
  const hazardShares: Record<string, number> = {};
  for (const id of night ? night.optionalHazards : []) hazardShares[id] = events.find((e) => e['id'] === id)?.['share'] as number;
  return {
    pt: w.ptBoats, night, hazardShares, nightEnemyRolls: w.night.enemyOffsets.length, nightBatteries: w.night.batteryDx.length, shellPoolSize: PT_SHELL_POOL_SIZE, // pt は揺らぎなし（= getPtParams）。試行ごとに seed の夜を当てる
    boat: w.boatParams, start: w.playerStart, boundsMarginM: w.boundsMarginM, halfLengthM: w.boatHalfLengthM, halfBeamM: w.boatHalfBeamM,
    damage: w.damageParams, crew: w.crew, crewEffects: w.crewEffects, fuel: w.fuelCurve, fuelGal: w.fuelStartGal, vis: w.vis, visRange2: w.visRange2, ring: w.mission.returnPoint,
    durationS: w.durationS, timeScale: w.timeScale, stepS: FIXED_STEP_S,
  };
}

/** 米PT の上書きを当てた data の写し（上書きが無ければそのまま）。世界と同じ getPtParams の検査を通す */
function withPtOverrides(data: GameData, missionId: string, o: PtSimOverrides): GameData {
  const keys = [o.detectM, o.damage, o.rounds, o.offsetM, o.passes, o.openFireS, o.commitTcpaS, o.runInKt, o.passGapS, o.wingmanDelayS, o.commitHeadingTolDeg, o.holdOffM];
  if (keys.every((v) => v === undefined)) return data;
  const id = getPrototypeMission(data, missionId).enemyId;
  const rec: unknown = data.enemies.enemies.find((e) => e.id === id);
  if (!isPtDataRecord(rec)) throw new Error(`${missionId}: enemies.json の ${id} は米PT の記録ではない`);
  const a = rec.attack;
  const g = rec.guns[0]!;
  const r = {
    ...rec, detection: { ...rec.detection, base_detect_m: o.detectM ?? rec.detection.base_detect_m }, guns: [{ ...g, damage: o.damage ?? g.damage }],
    attack: {
      ...a, rounds_per_pass: o.rounds ?? a.rounds_per_pass, pass_offset_m: o.offsetM ?? a.pass_offset_m, max_passes: o.passes ?? a.max_passes, open_fire_s: o.openFireS ?? a.open_fire_s,
      commit_tcpa_s: o.commitTcpaS ?? a.commit_tcpa_s, run_in_speed_kt: o.runInKt ?? a.run_in_speed_kt, pass_gap_s: o.passGapS ?? a.pass_gap_s, wingman_delay_s: o.wingmanDelayS ?? a.wingman_delay_s,
      commit_heading_tol_deg: o.commitHeadingTolDeg ?? a.commit_heading_tol_deg, hold_off_m: o.holdOffM ?? a.hold_off_m,
    },
  };
  const enemies = data.enemies.enemies.map((e) => (e.id === id ? (r as unknown as typeof e) : e));
  return { ...data, enemies: { ...data.enemies, enemies } } as GameData;
}

type Band = readonly [number, number];
/** 較正の 1 行（spec §F.4）。帯は %・HP・m（端を含む）。hpVsCruise は巡航（cruise）の HP の平均に掛ける上限。proto は今の data の模擬の値（N 400。目安で、検査はしない） */
export interface PtCalibrationRow {
  policy: PtPolicy;
  /** spec §F.3 の ★（最小の組） */
  star: boolean;
  detectedPct: Band | null; sunkPct: Band | null; hpMean: Band | null; hpVsCruise: number; homePct: Band; homeBeforeDawnPct: Band | null; afterDawnPct: Band | null;
  firstDetectMedM: Band | null; adriftPct: Band;
  proto: { detectedPct: number; hpMean: number; sunkPct: number; homePct: number };
}

/** どの遊び方も帰投 65% 以上（罠にしない）・漂流 1% 以下（燃料は脅威ではない。全速で逃げ回る turn_full は 8%・北の縁まで全速で逃げて待つ edge_flee は 10%） */
const HOME_MIN: Band = [65, 100];
const ADRIFT: Band = [0, 1];
const row = (policy: PtPolicy, star: boolean, b: Partial<Omit<PtCalibrationRow, 'policy' | 'star' | 'proto'>>, proto: readonly [number, number, number, number]): PtCalibrationRow => ({
  policy, star, detectedPct: null, sunkPct: null, hpMean: null, hpVsCruise: NaN, homePct: HOME_MIN, homeBeforeDawnPct: null, afterDawnPct: null, firstDetectMedM: null, adriftPct: ADRIFT, ...b,
  proto: { detectedPct: proto[0], hpMean: proto[1], sunkPct: proto[2], homePct: proto[3] },
});

/**
 * spec §F.4: 1 何もしないと痛い、2 転舵で助かる、3 遅い反応でも効く、4 暗さが効く、5 罠にしない、6 燃料は脅威ではない（7 の不変は ptCalibrationMisses がどの行にも見る）。
 * proto は [発見 %, HP の平均, 沈没 %, 帰投 %]（v0.6.3 レビューの直し（縁の航過・回数の数え方・出発点 150 m 北・線 200 m 南）と再調整（ずらし 155 → 140 m）の後、N 400・seed 1〜400）。
 * 沈没の帯は 200 夜 1 組のぶれ（seed 1〜1200 の 6 組: 巡航 7〜11%・静音 23〜29%）より広く、その平均（9%・26%）を真ん中に置いた（v0.6.3 レビュー: 前の帯の端に 1 組の値が乗っていた）。
 * 「何もしないと痛い」は HP の平均（巡航・静音とも 31〜32）でも見る。縁へ逃げる（edge_flee）は、縁で航過が撃たずに終わる抜け道が無い＝HP は巡航並み
 */
export const PT_CALIBRATION: readonly PtCalibrationRow[] = [
  row('cruise', true, { detectedPct: [95, 100], sunkPct: [3, 25], hpMean: [25, 42] }, [100, 30.6, 7.5, 92.5]),
  row('silent', true, { detectedPct: [65, 95], sunkPct: [12, 40], hpMean: [25, 42] }, [78.3, 32.2, 23.3, 76.8]),
  row('full', false, { firstDetectMedM: [1500, Infinity] }, [100, 18.6, 0.5, 99.5]),
  row('zigzag', false, {}, [100, 31.5, 11.5, 88.5]),
  row('turn_cruise', true, { sunkPct: [0, 3], hpVsCruise: 0.6 }, [100, 14.7, 0, 100]),
  row('react_full', false, { sunkPct: [0, 2], hpMean: [0, 16] }, [100, 8.8, 0, 100]),
  row('dodge_silent', true, { sunkPct: [0, 2], hpMean: [0, 16] }, [78.3, 8.6, 0, 100]),
  row('turn_silent', false, {}, [78.3, 17.3, 0.3, 99.8]),
  row('late_turn', true, { sunkPct: [0, 6], hpMean: [0, 30] }, [100, 25.2, 1.5, 98.5]),
  row('turn_full', false, { adriftPct: [0, 8] }, [100, 6.2, 0, 95.8]),
  row('dark_stop', true, { detectedPct: [25, 55], sunkPct: [0, 2], homeBeforeDawnPct: [90, 100] }, [38.8, 6.0, 0, 100]),
  row('meet', false, { sunkPct: [0, 5] }, [100, 26.9, 1.5, 98.5]),
  row('stop_dawn', false, { detectedPct: [0, 5], homePct: [100, 100], afterDawnPct: [100, 100] }, [0, 0, 0, 100]),
  row('edge_flee', false, { hpMean: [20, 50], adriftPct: [0, 10] }, [100, 32.7, 5.3, 89]),
];

/**
 * 帯と不変（spec §F.4 の 7: 予告から初弾 ≥ open_fire_s・航過は同時に 1 隻・射程と視程の外から撃たない・1 回の航過 ≤ 弾数 × 被害。
 * v0.6.3 の直しで、予告から 2 ステップ以内に終わる航過（赤い線が 1 フレームだけ出て「かわした！」になる）が無いことも）を外れた項目（空なら合格）
 */
export function ptCalibrationMisses(r: PtCalibrationRow, c: PtCell, s: PtSimSetup, cruiseHpMean: number): string[] {
  const out: string[] = [];
  const bands: readonly (readonly [string, number, Band | null])[] = [
    ['発見 %', c.detectedPct, r.detectedPct], ['沈没 %', c.sunkPct, r.sunkPct], ['HP の平均', c.hpMean, r.hpMean], ['帰投 %', c.homePct, r.homePct], ['夜明け前の帰投 %', c.homeBeforeDawnPct, r.homeBeforeDawnPct],
    ['夜明け後の帰投 %', c.afterDawnPct, r.afterDawnPct], ['最初の発見の中央値 m', c.firstDetectMedM, r.firstDetectMedM], ['漂流 %', c.adriftPct, r.adriftPct],
  ];
  for (const [name, v, b] of bands) if (b && !(v >= b[0] && v <= b[1])) out.push(`${name} ${v.toFixed(1)}（帯 ${b[0]}〜${b[1]}）`);
  if (!Number.isNaN(r.hpVsCruise) && !(c.hpMean <= r.hpVsCruise * cruiseHpMean)) out.push(`HP の平均 ${c.hpMean.toFixed(1)}（巡航 ${cruiseHpMean.toFixed(1)} の ${r.hpVsCruise} 倍以下）`);
  const p = s.pt;
  if (c.shots > 0 && !(c.minWarnS >= p.openFireS - 1e-9)) out.push(`予告から初弾 ${c.minWarnS.toFixed(2)} 秒（${p.openFireS} 秒以上）`);
  if (c.maxPassing > 1) out.push(`同時に航過 ${c.maxPassing} 隻`);
  if (c.beyondEff + c.beyondSight > 0) out.push(`射程の外 ${c.beyondEff} 発・視程の外 ${c.beyondSight} 発`);
  if (!(c.worstPassHits <= p.roundsPerPass && c.worstPassHits * p.hit.damage < s.damage.maxHp)) out.push(`1 回の航過の命中 ${c.worstPassHits} 発（${p.roundsPerPass} 発まで・HP ${s.damage.maxHp} 未満）`);
  if (c.passes > 0 && !(c.minPassS > 2 * s.stepS + 1e-9)) out.push(`予告から ${c.minPassS.toFixed(3)} 秒で終わった航過（2 ステップより長く）`);
  return out;
}

/** 較正の表を 1 回だけ回す口（tests と scripts の TABLE=1）: 遊び方ごとの集計は初めて読んだときに n 夜（seed は seedBase から）回して覚える */
export function ptCalibrationRun(data: GameData, missionId: string, n: number, seedBase: number, o: PtSimOverrides = {}): { setup: PtSimSetup; cell: (policy: PtPolicy) => PtCell } {
  const setup = ptSimSetup(data, missionId, o);
  const cells = new Map<PtPolicy, PtCell>();
  const cell = (policy: PtPolicy): PtCell => cells.get(policy) ?? cells.set(policy, runPtCell(setup, policy, n, seedBase)).get(policy)!;
  return { setup, cell };
}
