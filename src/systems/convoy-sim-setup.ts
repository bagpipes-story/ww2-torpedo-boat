// 味方の大発を守る模擬の組み立て（v0.6.4。spec §F.1・§F.4）: data（jp_01 の v0_1_prototype.convoy・jp_t38 の 25mm・us_pt_enemy）から core/convoy-sim の設定を作り、較正の帯（CONVOY_CALIBRATION。
// tests/convoy-sim-*.test.ts が N 200 で検査し、scripts/convoy-sim.ts が N 400 で表にする）を持つ。Phaser 非依存・window を読まない。値は world-setup の buildWorldSetup と同じ（ptSimSetup を流用）。
// 上書きは data の写しに当てて検査（convoy-data・pt-mission-data）を通す（jp_05 の pt-pass-sim-setup は触らない）。
import { getPrototypeMission, type GameData } from '../config/game-data';
import type { SpeedStep } from '../core/boat-motion';
import type { ConvoySimSetup } from '../core/convoy-sim';
import { runConvoyCell, type ConvoyCell } from '../core/convoy-sim-cell';
import type { ConvoyPolicy } from '../core/convoy-sim-policy';
import { ptSimSetup, type PtSimOverrides } from './pt-pass-sim-setup';
import { buildWorldSetup } from './world-setup';

/** 感度を見る上書き（無ければ data の値）: 大発の HP・大発が見つかる帯・標的の keep 比・切り替えのロック秒・閃光の記憶の秒・25mm の 1 発の被害と散布の最小半径・射撃ボタンを押す距離。残りは pt-pass-sim-setup の上書き（GRPM・GMAG・GDISP・ALLOT・DAWN…） */
export interface ConvoySimOverrides extends PtSimOverrides {
  bargeHp?: number; detectBand?: SpeedStep; keepRatio?: number; holdS?: number; flashHoldS?: number; gunDamage?: number;
  /** 25mm の散布の最小半径 m（艇の gun_battery.min_spread_m の上書き。0 で外したのと同じ）・射撃ボタンを押す距離 m（模擬の台本の上書き。data は変えない） */
  gunFloorM?: number; fireRangeM?: number;
}

export function convoySimSetup(data: GameData, missionId: string, o: ConvoySimOverrides = {}): ConvoySimSetup {
  const d = withConvoyOverrides(data, missionId, o);
  const base = ptSimSetup(d, missionId, o);
  const w = buildWorldSetup(d, missionId); // 揺らぎなし（= getConvoyParams）。試行ごとに seed の夜を当てる（convoy-sim の convoyNight）
  if (!w.convoy) throw new Error(`${missionId} に味方の大発の輸送隊（v0_1_prototype.convoy）が無い`);
  return { ...base, convoy: w.convoy.params, detectBand: w.convoy.detectBand, rule: w.convoy.rule, ...(o.fireRangeM !== undefined ? { fireRangeM: o.fireRangeM } : {}) };
}

/** 輸送隊と 25mm の被害・最小散布の上書きを当てた data の写し（上書きが無ければそのまま）。世界と同じ検査を通す */
function withConvoyOverrides(data: GameData, missionId: string, o: ConvoySimOverrides): GameData {
  if ([o.bargeHp, o.detectBand, o.keepRatio, o.holdS, o.flashHoldS, o.gunDamage, o.gunFloorM].every((v) => v === undefined)) return data;
  type Rec = Record<string, unknown>;
  const missions = (data.missionsSeed.missions as readonly Rec[]).map((m) => {
    if (m['id'] !== missionId) return m;
    const proto = m['v0_1_prototype'] as Rec;
    const cv = proto['convoy'] as Rec;
    const convoy = { ...cv, barge_hp: o.bargeHp ?? cv['barge_hp'], detect_band: o.detectBand ?? cv['detect_band'], target_keep_ratio: o.keepRatio ?? cv['target_keep_ratio'], target_switch_hold_s: o.holdS ?? cv['target_switch_hold_s'], flash_hold_s: o.flashHoldS ?? cv['flash_hold_s'] };
    return { ...m, v0_1_prototype: { ...proto, convoy } };
  });
  const boatId = getPrototypeMission(data, missionId).playerBoatId;
  const boats = (data.boats.boats as readonly Rec[]).map((b) => {
    const g = b['id'] === boatId && (o.gunDamage !== undefined || o.gunFloorM !== undefined) ? (b['gun_battery'] as { groups: Rec[] } | undefined) : undefined;
    if (!g) return b;
    const groups = o.gunDamage !== undefined ? [{ ...g.groups[0], damage: o.gunDamage }, ...g.groups.slice(1)] : g.groups;
    return { ...b, gun_battery: { ...g, groups, ...(o.gunFloorM !== undefined ? { min_spread_m: o.gunFloorM } : {}) } };
  });
  return { ...data, missionsSeed: { ...data.missionsSeed, missions }, boats: { ...data.boats, boats } } as unknown as GameData;
}

type Band = readonly [number, number];
/** 帯を掛ける列（ConvoyCell の名前）と表の名前 */
const METRICS = {
  arrivedMean: '到達/3', arrived3Pct: '3 隻の夜 %', arrived2Pct: '2 隻以上の夜 %', bargesSunkMean: '沈んだ大発', sunkPct: '自艇の沈没 %', homePct: '帰投 %', afterDawnPct: '夜明け後の帰投 %',
  hpMean: '失った HP', retiredPct: '撃退の夜 %', retiredMean: '撃退/夜', passesBarge: '大発への航過', passesPlayer: '自艇への航過',
} as const;
type Metric = keyof typeof METRICS;
/** 対の帯: [列, 相手の遊び方, 差の下限, 上限]（この行 − 相手。端を含む。相手は同じ seed） */
type Vs = readonly [Metric, ConvoyPolicy, number, number];

export interface ConvoyCalibrationRow {
  policy: ConvoyPolicy;
  /** spec §F.4 の ★（lead の難しさの帯を当てる主な行） */
  star: boolean;
  bands: Partial<Record<Metric, Band>>;
  vs: readonly Vs[];
  /** 漂流 % の上限（不変。囮は輪に入った瞬間に終わるが 3 まで） */
  adriftMax: number;
  /** 今の data の模擬の値（N 400・seed 1〜400 と 401〜800 の範囲。目安で、検査はしない）: [到達/3, 自艇の沈没 %] */
  proto: readonly [string, string];
}

/** 漂流 % の上限（燃料は主因にならない）、夜明け後の決着 % の上限（到達は夜明けの前に終わる） */
export const CONVOY_ADRIFT_MAX = 2;
export const CONVOY_RESOLVED_AFTER_DAWN_MAX = 5;
const row = (policy: ConvoyPolicy, star: boolean, bands: Partial<Record<Metric, Band>>, vs: readonly Vs[], proto: ConvoyCalibrationRow['proto'], adriftMax: number = CONVOY_ADRIFT_MAX): ConvoyCalibrationRow => ({ policy, star, bands, vs, adriftMax, proto });

/**
 * 回帰の帯（spec §F.4。lead の難しさの帯ではない）: 今の data で測った値のまわりに置き、data や core が動いて遊びが変わったら落ちる。根拠は N 200 × 4 組（seed 1・201・401・601）の
 * 最小〜最大に N 200 の揺らぎ（到達 ±0.1・% ±4・HP ±4・撃退/夜 ±0.08）を足したもの。端を含む。設計の目標（v0.6.4 実機 1 回目）は HUD どおり（shield_full・follow_full）で
 * 到達 2.0〜2.5 隻・3 隻の夜 30〜55%・自艇の沈没 8〜15%・2 隻以上の夜 75% 以上。測った値（N 400 × 2 組）は shield_full 2.40〜2.41 隻・52〜53%・10.5〜11.8%、follow_full 2.17〜2.21 隻・36〜38%・9.5〜11.2%。
 * 3 隻の夜の上の端 58 は簡単側への揺れを捕まえる: barge_hp を 1 段上げる（12 → 16）と seed 1〜200 で shield_full 61.5% になり落ちる（tests/convoy-sim-g）。
 * 行ごと: HUD どおり（shield_full: 寄って撃って転舵）は 2.3〜2.52 隻・3 隻の夜 47〜58%・自艇の沈没 6〜17%・2 隻以上 84% 以上・撃退/夜 0.44〜0.70（25mm の最小散布。外すと上の端を越える）、
 * 撃たずに転舵するだけ（shield_dodge）より到達 0.15 隻以上多い（砲が効く）。後ろに付いて撃って転舵（follow_full）は 2.0〜2.4 隻・3 隻の夜 29〜44%。
 * 隠れる（none）と 0.7〜1.1 隻（守らなければ約 2 隻沈む）で、決着が早く夜明けの前に帰り道へ出て 30〜43% 沈む（夜明け後の帰投は 25〜37%）。撃つだけで転舵しないと 18〜31% 沈む
 * （転舵の効きが正: follow_full より 8 点以上）、遠くから撃つだけも逃れられない（follow_shoot − 1 以上）。付くだけ・間に入るだけは 20〜32%・38〜49% 沈む（大発が 600 m で見つかるので、撃たない艇は狙われにくい）。
 * 囮は到達 0 で帰投 700 点だけ、見捨てると 0 隻で帰り道に 3〜13% 沈む（輪が浜の近く）。lead_shoot・shield_dodge の行は表だけ
 */
export const CONVOY_CALIBRATION: readonly ConvoyCalibrationRow[] = [
  row('none', true, { arrivedMean: [0.7, 1.1], sunkPct: [30, 43], afterDawnPct: [25, 37], passesBarge: [2.5, Infinity], passesPlayer: [0, 2.2] }, [], ['0.88〜0.89', '36.2〜38.2']),
  row('follow', false, { sunkPct: [20, 32] }, [], ['1.49〜1.52', '24.8〜26.8']),
  row('follow_shoot', true, { arrivedMean: [1.85, 2.2], sunkPct: [18, 31], bargesSunkMean: [0, 0.9] }, [['sunkPct', 'follow_full', 8, Infinity]], ['1.98〜2.02', '24.5']),
  row('follow_dodge', false, { arrivedMean: [1.55, 1.95], sunkPct: [7, 20] }, [], ['1.70〜1.74', '12.5〜14.5']),
  row('follow_full', true, { arrivedMean: [2.0, 2.4], sunkPct: [3, 18], arrived3Pct: [29, 44], arrived2Pct: [77, 91], afterDawnPct: [0, 6] }, [], ['2.17〜2.21', '9.5〜11.2']),
  row('shield', false, { sunkPct: [38, 49] }, [], ['1.84〜1.85', '42.5〜45.0']),
  row('shield_shoot', false, { arrivedMean: [2.0, 2.4], sunkPct: [26, 37] }, [], ['2.20〜2.24', '31.2〜32.0']),
  row('shield_dodge', false, {}, [], ['2.04〜2.09', '14.8〜17.8']),
  row('shield_full', true, { arrivedMean: [2.3, 2.52], sunkPct: [6, 17], arrived3Pct: [47, 58], arrived2Pct: [84, 100], hpMean: [30, 40], retiredPct: [42, 100], retiredMean: [0.44, 0.7], afterDawnPct: [0, 5] }, [['arrivedMean', 'shield_dodge', 0.15, Infinity]], ['2.40〜2.41', '10.5〜11.8']),
  row('far_shoot', false, { arrivedMean: [1.45, 1.9], sunkPct: [26, 40] }, [['sunkPct', 'follow_shoot', -1, Infinity]], ['1.68〜1.71', '30.2〜33.2']),
  row('far_full', false, { arrivedMean: [1.92, 2.25], sunkPct: [11, 22], afterDawnPct: [0, 8] }, [], ['2.08', '15.2〜16.2']),
  row('lead', false, { arrivedMean: [0, 0.25], sunkPct: [13, 26] }, [], ['0.09〜0.10', '19.2〜19.5'], 3),
  row('lead_shoot', false, {}, [], ['0.09', '13.8〜16.0'], 3),
  row('dash_home', false, { arrivedMean: [0, 0], sunkPct: [3, 13] }, [], ['0.00', '8.2〜8.8']),
];

/**
 * 近くまで待って撃つ人の型（v0.6.4 実機 1 回目のユーザー: 間に入って止まり気味に 200 m 以内で撃ち、転舵しない。1 夜 60 発 27 命中＝45%・撃退 2）の帯: 25mm の命中 %（gunHits / gunShots）と
 * 撃退/夜（N 200・seed 1。tests/convoy-sim-h）。N 200 × 4 組（seed 1・201・401・601）の実測は命中 21.4〜22.45%・撃退 0.60〜0.69（seed 1 は 22.45%・0.69）。最小散布を外すと seed 1 の命中は 55.5%・撃退 1.68
 */
export const CONVOY_CLOSE_FIRE = { policy: 'shield_shoot', fireRangeM: 200, hitPct: [19, 25], retiredMean: [0.5, 0.8] } as const;

/** 行の帯（対の帯は cell で相手の行を読む。同じ seed）と不変を外れた項目（空なら合格） */
export function convoyCalibrationMisses(r: ConvoyCalibrationRow, cell: (policy: ConvoyPolicy) => ConvoyCell, s: ConvoySimSetup): string[] {
  const c = cell(r.policy);
  const out: string[] = [];
  for (const [k, b] of Object.entries(r.bands) as [Metric, Band][]) if (!(c[k] >= b[0] && c[k] <= b[1])) out.push(`${METRICS[k]} ${c[k].toFixed(2)}（帯 ${b[0]}〜${b[1]}）`);
  for (const [k, other, lo, hi] of r.vs) {
    const o = cell(other)[k];
    const dv = c[k] - o;
    if (!(dv >= lo && dv <= hi)) out.push(`${METRICS[k]} ${c[k].toFixed(1)}（${other} ${o.toFixed(1)} との差 ${dv.toFixed(1)} が ${lo}〜${hi} の外）`);
  }
  return [...out, ...convoyInvariantMisses(c, s, r.adriftMax)];
}

/**
 * 不変（spec §F.4 の最終行。どの遊び方も）: 予告から初弾 ≥ open_fire_s・撃つのは同時に 1 隻・射程と視程（標的から）の外から撃たない・1 回の攻撃の命中 ≤ 弾数（自艇は × damage < HP）・
 * 大発への連射 0（追撃中は標的を替えない）・打ち切り 0・漂流 ≤ adriftMax・夜明け後の決着 ≤ 5%
 */
export function convoyInvariantMisses(c: ConvoyCell, s: ConvoySimSetup, adriftMax: number = CONVOY_ADRIFT_MAX): string[] {
  const out: string[] = [];
  const p = s.pt;
  if (!(c.minWarnS >= p.openFireS - 1e-9)) out.push(`予告から初弾 ${c.minWarnS.toFixed(2)} 秒（${p.openFireS} 秒以上）`);
  if (c.maxPassing > 1) out.push(`同時に撃つ攻撃 ${c.maxPassing} 隻`);
  if (c.beyond > 0) out.push(`射程か視程（標的から）の外 ${c.beyond} 発`);
  if (!(c.worstBarge <= p.roundsPerPass)) out.push(`大発への 1 回の攻撃の命中 ${c.worstBarge} 発（${p.roundsPerPass} 発まで）`);
  if (!(c.worstPlayer <= p.roundsPerPass && c.worstPlayer * p.hit.damage < s.damage.maxHp)) out.push(`自艇への 1 回の攻撃の命中 ${c.worstPlayer} 発（${p.roundsPerPass} 発まで・HP ${s.damage.maxHp} 未満）`);
  if (c.burstsBarge > 0) out.push(`大発への連射 ${c.burstsBarge} 回`);
  if (c.timeoutPct > 0) out.push(`打ち切り ${c.timeoutPct.toFixed(1)}%`);
  if (!(c.adriftPct <= adriftMax)) out.push(`漂流 ${c.adriftPct.toFixed(1)}%（${adriftMax} まで）`);
  if (!(c.resolvedAfterDawnPct <= CONVOY_RESOLVED_AFTER_DAWN_MAX)) out.push(`夜明け後の決着 ${c.resolvedAfterDawnPct.toFixed(1)}%（${CONVOY_RESOLVED_AFTER_DAWN_MAX} まで）`);
  return out;
}

/** 較正の表を 1 回だけ回す口（tests と scripts）: 遊び方ごとの集計は初めて読んだときに n 夜（seed は seedBase から）回して覚える（対の帯が読む相手も同じ seed） */
export function convoyCalibrationRun(data: GameData, missionId: string, n: number, seedBase: number, o: ConvoySimOverrides = {}): { setup: ConvoySimSetup; cell: (policy: ConvoyPolicy) => ConvoyCell } {
  const setup = convoySimSetup(data, missionId, o);
  const cells = new Map<ConvoyPolicy, ConvoyCell>();
  const cell = (policy: ConvoyPolicy): ConvoyCell => cells.get(policy) ?? cells.set(policy, runConvoyCell(setup, policy, n, seedBase)).get(policy)!;
  return { setup, cell };
}
