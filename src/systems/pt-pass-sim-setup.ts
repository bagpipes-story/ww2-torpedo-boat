// 米PT の掃射の航過の模擬の組み立て（v0.6.3。spec §F）: data（enemies の us_pt_enemy・boats の艇・missions_seed の jp_05）から core/pt-pass-sim の設定を作り、
// 較正の帯（v0.6.3 実機 2 回目 spec r2 §H.2。tests/pt-sim-*.test.ts が N 200 で検査し、scripts/pt-pass-sim.ts が N 400 で表にする）を持つ。Phaser 非依存・window を読まない（ゲームは使わない）。
// 値は world-setup の buildWorldSetup と同じ（今夜の揺らぎは試行ごとに seed で rollNight。出撃の組み立てと同じ）。上書きは data の記録を写して getPtParams・getGunBatteryParams に通す（検査も通る）。
// 13mm を撃つ遊び方の帯は systems/pt-gun-calibration（spec r1 §G.4）。不変（ptInvariantMisses）はどちらの表も同じ。
import { getPrototypeMission, type GameData } from '../config/game-data';
import { PT_GUN_SHELL_POOL_SIZE, PT_SHELL_POOL_SIZE } from '../config/pt-config';
import { FIXED_STEP_S } from '../config/step-config';
import { PT_CHASE_KEYS, type PtChaseKey } from '../core/pt-chase-data';
import { isPtDataRecord } from '../core/pt-data';
import type { PtSimSetup } from '../core/pt-pass-sim';
import { runPtCell, type PtCell } from '../core/pt-sim-cell';
import type { PtBurstReact, PtNoGunPolicy, PtPolicy } from '../core/pt-sim-policy';
import { buildWorldSetup } from './world-setup';

/** 感度を見る上書き（無ければ data の値）。調整の順は spec r2 §H.2（data だけ。理由は source に） */
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
  /** v0.6.3 実機 2 回目: PT の砲の有効射程 m・1 命中の機関損傷の確率、航過は危ない間だけ（core/pt-fire）を切る・追撃（core/pt-chase）を切る（両方 true で f27b266 の動き。spec r2 §I.3-5） */
  effectiveM?: number; engineDamage?: number; passEndOff?: boolean; chaseOff?: boolean;
  /** 追撃の鍵の上書き（scripts の CH_<鍵>。data の chase に当てて検査を通す）、連射への反応（scripts の BREACT。反応の表） */
  chase?: Partial<Record<PtChaseKey, number>>; burstReact?: PtBurstReact;
}

export function ptSimSetup(data: GameData, missionId: string, o: PtSimOverrides = {}): PtSimSetup {
  const w = buildWorldSetup(withGunOverrides(withPtOverrides(data, missionId, o), missionId, o), missionId, { fuelGal: o.fuelGal ?? NaN, dawnS: o.dawnS ?? NaN });
  if (!w.ptBoats) throw new Error(`${missionId} に米PT の隊（v0_1_prototype.pt_boats）が無い`);
  const pt = o.passEndOff === true || o.chaseOff === true ? { ...w.ptBoats, passEndsWhenSafe: o.passEndOff !== true, chaseOn: o.chaseOff !== true } : w.ptBoats;
  const night = w.mission.night;
  const events = data.riskEvents.events as readonly Record<string, unknown>[];
  const hazardShares: Record<string, number> = {};
  for (const id of night ? night.optionalHazards : []) hazardShares[id] = events.find((e) => e['id'] === id)?.['share'] as number;
  return {
    pt, night, hazardShares, nightEnemyRolls: w.night.enemyOffsets.length, nightBatteries: w.night.batteryDx.length, shellPoolSize: PT_SHELL_POOL_SIZE, // pt は揺らぎなし（= getPtParams）。試行ごとに seed の夜を当てる
    boat: w.boatParams, start: w.playerStart, boundsMarginM: w.boundsMarginM, halfLengthM: w.boatHalfLengthM, halfBeamM: w.boatHalfBeamM,
    damage: w.damageParams, crew: w.crew, crewEffects: w.crewEffects, fuel: w.fuelCurve, fuelGal: w.fuelStartGal, vis: w.vis, visRange2: w.visRange2, ring: w.mission.returnPoint,
    durationS: w.durationS, timeScale: w.timeScale, stepS: FIXED_STEP_S, gun: w.guns, gunShellPoolSize: PT_GUN_SHELL_POOL_SIZE, ...(o.burstReact ? { burstReact: o.burstReact } : {}),
  };
}

/** 米PT の上書きを当てた data の写し（上書きが無ければそのまま）。世界と同じ getPtParams の検査を通す */
function withPtOverrides(data: GameData, missionId: string, o: PtSimOverrides): GameData {
  const keys = [o.detectM, o.damage, o.rounds, o.offsetM, o.passes, o.openFireS, o.commitTcpaS, o.runInKt, o.passGapS, o.wingmanDelayS, o.commitHeadingTolDeg, o.holdOffM, o.breakMaxS, o.breakOffM, o.stationM, o.retreatHp, o.casualty, o.fireChance, o.effectiveM, o.engineDamage];
  const ch = Object.entries(o.chase ?? {}).filter(([, v]) => v !== undefined);
  for (const [k] of ch) if (!(PT_CHASE_KEYS as readonly string[]).includes(k)) throw new Error(`追撃の上書き ${k} は chase の鍵ではない（${PT_CHASE_KEYS.join('・')}）`);
  if (keys.every((v) => v === undefined) && ch.length === 0) return data;
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
    tactics: { ...rec.tactics, station_m: o.stationM ?? rec.tactics.station_m }, chase: { ...rec.chase, ...Object.fromEntries(ch) },
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
/**
 * 較正の 1 行（spec §F.4・r2 §H.2）。帯は %・HP・m（端を含む。null は見ない）。passesMin・altMin は 1 夜の航過の平均・赤い線が前と反対の舷から来る割合の下限（NaN は見ない）。
 * proto は今の data の模擬の値 [発見 %, HP の平均, 沈没 %, 帰投 %]（N 400・seed 1〜400。目安で、検査はしない）
 */
export interface PtCalibrationRow {
  policy: PtNoGunPolicy;
  /** spec r2 §H.2 の ★（最小の組） */
  star: boolean;
  detectedPct: Band | null; sunkPct: Band | null; hpMean: Band | null; homePct: Band | null; homeBeforeDawnPct: Band | null; afterDawnPct: Band | null;
  firstDetectMedM: Band | null; adriftPct: Band; passesMin: number; altMin: number;
  proto: { detectedPct: number; hpMean: number; sunkPct: number; homePct: number };
}

/** 漂流 2% 以下（燃料は主因にならない。北の縁まで全速で逃げて待つ edge_flee は 10%）。v0.6.3 実機 2 回目: 「帰投 65% 以上」の床は外した（追撃で沈むのが設計） */
const ADRIFT: Band = [0, 2];
/**
 * 待つ PT（hold_off_m 550 m の外で待ち始めた）が艇へ寄ってよい最接近 m（spec r1 §G.5 の F9・r2 §E.1。既定の反応の表で測定 367 m）。
 * 連射への反応の表（away・full。艇が転舵して待つ PT へ寄る）は PT_HELD_MIN_REACT_M（測定 337 m）
 */
export const PT_HELD_MIN_M = 350;
export const PT_HELD_MIN_REACT_M = 300;
const row = (policy: PtNoGunPolicy, star: boolean, b: Partial<Omit<PtCalibrationRow, 'policy' | 'star' | 'proto'>>, proto: readonly [number, number, number, number]): PtCalibrationRow => ({
  policy, star, detectedPct: null, sunkPct: null, hpMean: null, homePct: null, homeBeforeDawnPct: null, afterDawnPct: null, firstDetectMedM: null, adriftPct: ADRIFT, passesMin: NaN, altMin: NaN, ...b,
  proto: { detectedPct: proto[0], hpMean: proto[1], sunkPct: proto[2], homePct: proto[3] },
});

/**
 * v0.6.3 実機 2 回目（「逃げるだけなら簡単。もっと執拗に追いかけ回して射撃して」）の帯（spec r2 §H.2）: 何もしないと沈む（巡航 32〜58%・静音 35〜62%）、
 * かわすだけ（HUD の転舵・線の間かわし続ける・全速でまっすぐ逃げる）も 8〜46% 沈み HP 24〜46 を失う、全速で逃げるだけでも 14〜40%、暗さに隠れるのは効く（5〜25%）。
 * 赤い線が前と反対の舷から来る割合（挟み撃ち）は巡航 0.6 以上・赤い線で全速の転舵 0.5 以上。漂流 2% 以下・打ち切り 0（不変）。撃ち返す行は systems/pt-gun-calibration
 */
export const PT_CALIBRATION: readonly PtCalibrationRow[] = [
  row('cruise', true, { detectedPct: [95, 100], sunkPct: [32, 58], hpMean: [40, 50], altMin: 0.6 }, [100, 44.7, 45.3, 54.8]),
  row('silent', true, { detectedPct: [65, 92], sunkPct: [35, 62] }, [78.3, 36.4, 48.5, 51.5]),
  row('full', false, { firstDetectMedM: [1500, Infinity], sunkPct: [14, 40] }, [100, 37.7, 26.0, 74.0]),
  row('zigzag', false, { sunkPct: [0, 80] }, [100, 47.5, 69.3, 30.8]),
  row('turn_cruise', true, { sunkPct: [18, 42], hpMean: [33, 46] }, [100, 40.5, 31.0, 69.0]),
  row('react_full', false, { sunkPct: [20, 44], hpMean: [32, 46], passesMin: 2.5, altMin: 0.5 }, [100, 39.5, 30.3, 69.8]),
  row('dodge_silent', true, { sunkPct: [10, 30], hpMean: [24, 36] }, [78.3, 29.9, 16.8, 83.3]),
  row('turn_silent', false, { sunkPct: [24, 46] }, [78.3, 33.4, 34.5, 65.5]),
  row('late_turn', true, { sunkPct: [32, 58] }, [100, 43.9, 45.5, 54.5]),
  row('turn_full', false, { sunkPct: [8, 30] }, [100, 32.6, 16.0, 83.8]),
  row('dark_stop', true, { detectedPct: [25, 55], sunkPct: [5, 25], homeBeforeDawnPct: [70, 100] }, [38.8, 12.0, 15.0, 85.0]),
  row('meet', false, { sunkPct: [24, 50] }, [100, 43.0, 38.3, 61.8]),
  row('stop_dawn', false, { detectedPct: [0, 5], homePct: [100, 100], afterDawnPct: [100, 100] }, [0, 0, 0, 100]),
  row('edge_flee', false, { hpMean: [40, 50], adriftPct: [0, 10] }, [100, 45.2, 61.5, 38.5]),
  row('hold_cruise', true, { sunkPct: [22, 46], hpMean: [34, 50] }, [100, 41.0, 34.0, 66.0]),
  row('hold_full', true, { sunkPct: [14, 36], hpMean: [30, 45] }, [100, 38.1, 24.3, 75.8]),
  row('mid_full', true, { sunkPct: [22, 46] }, [100, 41.0, 32.5, 67.5]),
  row('late_full', false, { sunkPct: [28, 52] }, [100, 43.0, 40.3, 59.8]),
  row('flee_full', true, { sunkPct: [8, 26], hpMean: [30, 50] }, [100, 33.7, 13.3, 86.8]),
  row('flee_dodge', false, { sunkPct: [5, 25] }, [100, 28.6, 12.0, 88.0]),
  row('flee_hold', false, { sunkPct: [4, 24] }, [100, 29.4, 10.8, 89.3]),
];

/** 帯（spec r2 §H.2）と不変（ptInvariantMisses）を外れた項目（空なら合格） */
export function ptCalibrationMisses(r: PtCalibrationRow, c: PtCell, s: PtSimSetup): string[] {
  const out: string[] = [];
  const bands: readonly (readonly [string, number, Band | null])[] = [
    ['発見 %', c.detectedPct, r.detectedPct], ['沈没 %', c.sunkPct, r.sunkPct], ['HP の平均', c.hpMean, r.hpMean], ['帰投 %', c.homePct, r.homePct], ['夜明け前の帰投 %', c.homeBeforeDawnPct, r.homeBeforeDawnPct],
    ['夜明け後の帰投 %', c.afterDawnPct, r.afterDawnPct], ['最初の発見の中央値 m', c.firstDetectMedM, r.firstDetectMedM], ['漂流 %', c.adriftPct, r.adriftPct],
  ];
  for (const [name, v, b] of bands) if (b && !(v >= b[0] && v <= b[1])) out.push(`${name} ${v.toFixed(1)}（帯 ${b[0]}〜${b[1]}）`);
  if (!Number.isNaN(r.passesMin) && !(c.passes >= r.passesMin)) out.push(`1 夜の航過 ${c.passes.toFixed(2)} 回（${r.passesMin} 回以上）`);
  if (!Number.isNaN(r.altMin) && !(c.alt >= r.altMin)) out.push(`前と反対の舷からの赤い線 ${c.alt.toFixed(2)}（${r.altMin} 以上）`);
  return [...out, ...ptInvariantMisses(c, s)];
}

/**
 * 不変（spec §F.4 の 7・r1 §G.5・r2 §E。どの遊び方も）: 予告から初弾 ≥ open_fire_s・撃つのは同時に 1 隻・射程と視程の外から撃たない・1 回の攻撃 ≤ 航過の弾数 で × 被害 < 艇の HP・
 * AI が終えた航過は予告から 2 ステップより長い（13mm で沈んで閉じた航過は onPassEnd を呼ばないので入らない）・待つ PT は hold_off_m の外で待ち始めたら PT_HELD_MIN_M
 * （連射への反応の表は PT_HELD_MIN_REACT_M）より内へ来ない・13mm は視程と射程の外へ撃たない・打ち切りなし。
 * 実機 2 回目: 連射の線は open_fire_s 以上（黙った連射も窓の終わりまで）・1 回の連射 ≤ burst_rounds・1 隻の撃った連射 ≤ max_bursts（制圧の 1 回分は数えない。撃っている連射が制圧されると
 * b.bursts は max_bursts + 1 になりうるがその PT は去る）・同じ PT の続けての連射（相方が撃てる距離）0（AI の partnerReady と同じ判定なので、門が外れたか時計が壊れたときだけ外れる。
 * 交互そのものの守りは tests/pt-chase-step の partnerReady と前と反対の舷の帯。レビュー F5）。
 * 「HP だけで沈む PT は無い」F11 は数えても外れようがないので数えない（レビュー R4。守りは pt-data の retreat_hp < hull_hp の検査と tests/pt-damage）
 */
export function ptInvariantMisses(c: PtCell, s: PtSimSetup): string[] {
  const out: string[] = [];
  const p = s.pt;
  const heldMin = (s.burstReact ?? 'keep') === 'keep' ? PT_HELD_MIN_M : PT_HELD_MIN_REACT_M;
  if (c.shots > 0 && !(c.minWarnS >= p.openFireS - 1e-9)) out.push(`予告から初弾 ${c.minWarnS.toFixed(2)} 秒（${p.openFireS} 秒以上）`);
  if (c.maxPassing > 1) out.push(`同時に撃つ攻撃 ${c.maxPassing} 隻`);
  if (c.beyondEff + c.beyondSight > 0) out.push(`射程の外 ${c.beyondEff} 発・視程の外 ${c.beyondSight} 発`);
  if (!(c.worstPassHits <= p.roundsPerPass && c.worstPassHits * p.hit.damage < s.damage.maxHp)) out.push(`1 回の攻撃の命中 ${c.worstPassHits} 発（${p.roundsPerPass} 発まで・HP ${s.damage.maxHp} 未満）`);
  if (c.passes > 0 && !(c.minPassS > 2 * s.stepS + 1e-9)) out.push(`予告から ${c.minPassS.toFixed(3)} 秒で終わった航過（2 ステップより長く）`);
  if (!(c.minBurstS >= p.openFireS - 1e-9)) out.push(`予告から ${c.minBurstS.toFixed(2)} 秒で終わった連射（${p.openFireS} 秒以上）`);
  if (!(c.worstBurstHits <= p.burstRounds && c.maxBoatBursts <= p.maxBursts)) out.push(`1 回の連射の命中 ${c.worstBurstHits} 発（${p.burstRounds} 発まで）・1 隻の連射 ${c.maxBoatBursts} 回（${p.maxBursts} 回まで）`);
  if (c.selfRepeats > 0) out.push(`相方が撃てる距離にいるのに同じ PT が続けて連射 ${c.selfRepeats} 回`);
  if (!(c.heldMinM >= heldMin)) out.push(`待つ PT の最接近 ${c.heldMinM.toFixed(0)} m（${heldMin} m 以上）`);
  if (c.gunBeyond > 0) out.push(`13mm が視程か射程の外へ ${c.gunBeyond} 回`);
  if (c.timeoutPct > 0) out.push(`打ち切り ${c.timeoutPct.toFixed(1)}%`);
  return out;
}

/** 較正の表を 1 回だけ回す口（tests と scripts の TABLE=1・2）: 遊び方ごとの集計は初めて読んだときに n 夜（seed は seedBase から）回して覚える（13mm の帯が読む撃たない行も同じ seed） */
export function ptCalibrationRun(data: GameData, missionId: string, n: number, seedBase: number, o: PtSimOverrides = {}): { setup: PtSimSetup; cell: (policy: PtPolicy) => PtCell } {
  const setup = ptSimSetup(data, missionId, o);
  const cells = new Map<PtPolicy, PtCell>();
  const cell = (policy: PtPolicy): PtCell => cells.get(policy) ?? cells.set(policy, runPtCell(setup, policy, n, seedBase)).get(policy)!;
  return { setup, cell };
}
