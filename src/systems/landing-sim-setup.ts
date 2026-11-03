// 停泊して揚陸する輸送船を守る模擬の組み立て（v0.6.9 S3・S4a・S4。jp_04。spec-v069 §6 S3・§8・R1・R2・R4・R7・R12・R13）: data（jp_04 の v0_1_prototype.landing・us_pt_enemy.torpedo_attack・jp_t38）から
// core/landing-sim の設定を作り、較正の帯（LANDING_CALIBRATION・LANDING_PAIRS・LANDING_SALVO_BANDS）と不変（I1〜I6）を持つ。scripts/landing-sim.ts が N 400 × 2 組で表にする（S4 で調整済み。tests/landing-balance が N 60 で回帰を見る）。
// Phaser 非依存・window を読まない。値は world-setup の buildWorldSetup と同じ（米PT・艇・燃料・視界は pt-pass-sim-setup の ptSimSetup を流用）。上書きは data の写しに当てて、世界と同じ検査
// （config/landing-mission-data の V1〜V13・core/pt-torpedo-data の V11）を通す＝R7: V8・V10・V13 を破る組み合わせは例外で止まる。data は変えない。
// v0.6.10 S3a（spec-v0610 §6.1・LD9）: 卯月（world-setup の allyDestroyer）を模擬へ渡す。allyOff（scripts の ALLY_OFF=1）は鍵ごと渡さない＝S0b と同じ夜。不変に I7・I8・I10・I11、
// I9（卯月の効かない遊び方は同じ seed の卯月の無い夜と同じ記録）は LandingRun.i9Misses。
// v0.6.10 S3b: 卯月のつまみと夜明け（systems/ally-sim-knobs。範囲の外は例外・data の写しに当てて V-A1〜V-A6 を通す）。
// v0.6.10 S4（D9）: ここの行の帯は S0b の帯＝卯月を切った夜（ALLY_OFF=1）の *_NO_ALLY。卯月のいる帯・得の対・照らした夜・ハードの段は systems/ally-sim-bands（得は LandingRun.allyGain）。
import { getPrototypeMission, type GameData } from '../config/game-data';
import { LANDING_WARN_MIN_S } from '../config/landing-config';
import type { LandingSimSetup } from '../core/landing-sim';
import { landingCell, runLandingTrials, salvoStats, type LandingCell, type SalvoKindStats, type SalvoStats } from '../core/landing-sim-cell';
import { LANDING_HUMAN_POLICIES, type LandingPolicy } from '../core/landing-sim-policy';
import { allyFatedBeforeSalvo, LANDING_TRIAL_GUN_KEYS, landingTrialBase, type LandingTrial } from '../core/landing-trial';
import { checkAllyKnobs, withAllyOverrides, withoutAllyKnobs, type AllySimOverrides } from './ally-sim-knobs';
import { ptSimSetup } from './pt-pass-sim-setup';
import { buildWorldSetup } from './world-setup';

/** 感度を見る上書き（無ければ data の値。spec §6 S3 の UNLOAD・LOOKOUT・HITS・AIM・SPACING・HURRIED・HFACTOR・REACQ・ALLOT と R12 の EFACTOR）と難易度ハード、卯月のつまみと夜明け（v0.6.10 S3b） */
export interface LandingSimOverrides extends AllySimOverrides {
  unloadS?: number; lookoutM?: number; hitsToSink?: number;
  aimDeg?: number; spacingDeg?: number; hurriedM?: number; hurriedFactor?: number; engagedFactor?: number; reacquireS?: number;
  fuelGal?: number; hard?: boolean;
  /** 卯月を切る（v0.6.10。scripts の ALLY_OFF=1。見出しに出さない＝LD9） */
  allyOff?: boolean;
}

/** I9 の遊び方（卯月の効かない遊び方: 動きが lure でなく見つからない＝走る PT が扇に入らない。spec-v0610 §6.1） */
export const LANDING_I9_POLICIES: readonly LandingPolicy[] = ['hide', 'circle_start', 'home_early'];

export function landingSimSetup(data: GameData, missionId: string, o: LandingSimOverrides = {}): LandingSimSetup {
  checkAllyKnobs(o, o.allyOff === true);
  const d = withAllyOverrides(withLandingOverrides(data, missionId, o), missionId, o);
  const base = ptSimSetup(d, missionId, { fuelGal: o.fuelGal, hard: o.hard });
  const w = buildWorldSetup(d, missionId, { hard: o.hard, fuelGal: o.fuelGal ?? NaN, allyOff: o.allyOff });
  if (!w.landing) throw new Error(`${missionId} に停泊して揚陸する輸送船（v0_1_prototype.landing）が無い`);
  return { ...base, landing: w.landing.params, torpedo: w.landing.torpedo, ...(w.allyDestroyer ? { allyDestroyer: w.allyDestroyer } : {}) };
}

/** 揚陸と雷撃の上書きを当てた data の写し（上書きが無ければそのまま） */
function withLandingOverrides(data: GameData, missionId: string, o: LandingSimOverrides): GameData {
  type Rec = Record<string, unknown>;
  const land = [o.unloadS, o.lookoutM, o.hitsToSink].some((v) => v !== undefined);
  const torp = [o.aimDeg, o.spacingDeg, o.hurriedM, o.hurriedFactor, o.engagedFactor, o.reacquireS].some((v) => v !== undefined);
  if (!land && !torp) return data;
  const missions = (data.missionsSeed.missions as readonly Rec[]).map((m) => {
    if (!land || m['id'] !== missionId) return m;
    const proto = m['v0_1_prototype'] as Rec;
    const l = proto['landing'] as Rec;
    return { ...m, v0_1_prototype: { ...proto, landing: { ...l, unload_s: o.unloadS ?? l['unload_s'], lookout_m: o.lookoutM ?? l['lookout_m'], torpedo_hits_to_sink: o.hitsToSink ?? l['torpedo_hits_to_sink'] } } };
  });
  const enemyId = getPrototypeMission(data, missionId, o.hard).enemyId;
  const enemies = (data.enemies.enemies as readonly Rec[]).map((e) => {
    if (!torp || e['id'] !== enemyId) return e;
    const a = e['torpedo_attack'] as Rec;
    return {
      ...e, torpedo_attack: {
        ...a, aim_error_deg: o.aimDeg ?? a['aim_error_deg'], salvo_spacing_deg: o.spacingDeg ?? a['salvo_spacing_deg'], hurried_max_m: o.hurriedM ?? a['hurried_max_m'],
        hurried_error_factor: o.hurriedFactor ?? a['hurried_error_factor'], engaged_error_factor: o.engagedFactor ?? a['engaged_error_factor'], reacquire_s: o.reacquireS ?? a['reacquire_s'],
      },
    };
  });
  return { ...data, missionsSeed: { ...data.missionsSeed, missions }, enemies: { ...data.enemies, enemies } } as unknown as GameData;
}

type Band = readonly [number, number];
/** 帯を掛ける列（LandingCell の名前）と表の名前 */
export const LANDING_METRICS = {
  objPct: '達成 %', ownSunkPct: '自艇の沈没 %', adriftPct: '漂流 %', homeBeforeDawnPct: '夜明けの前の帰投 %', fuelCallPct: '決着の前の燃料少 %', ringEarlyPct: '決着の前に輪 %',
} as const;
export type LandingMetric = keyof typeof LANDING_METRICS;

/** 行の帯（組ごと。端を含む）。帯の無い行（picket・shoot_near・circle_start など）は表だけ */
export interface LandingBandRow {
  policy: LandingPolicy;
  bands: Partial<Record<LandingMetric, Band>>;
}

/** 対の帯（組を合わせた夜。相手は同じ seed）: name の列の 自分 − 相手 が [lo, hi]（端を含む） */
export interface LandingPairRow {
  policy: LandingPolicy;
  other: LandingPolicy;
  name: string;
  value: (c: LandingCell) => number;
  lo: number;
  hi: number;
}

const obj = (c: LandingCell): number => c.objPct;
const lost = (c: LandingCell): number => c.ownSunkPct + c.adriftPct;

/**
 * 設計の帯（spec §8 の帯を R12 で置き換え、R13 で対を 1 つ替えたもの（R2 のノーマルの帯は捨てた）。ノーマル、N 400 × 2 組）: hide ≤ 15%（自艇の沈没 ≤ 3%）・lure 70〜88%（自艇の沈没 ≤ 18%・
 * 漂流 ≤ 3%・夜明けの前の帰投 ≥ 80%・決着の前の燃料少 ≤ 10%・決着の前に輪 ≤ 10%（R4））。lure_noshoot は表だけ（25mm は T-38 の戦い方＝jp_01 と同じ）。
 * 対の帯: circle_start ≤ hide + 10（R1）・lure ≥ lure_near + 10（R13: 輸送船から離れて戦えば得。輸送船のそばで戦う lure_near と比べる）・lure_late ≤ lure − 10 かつ ≥ hide + 20（R2）・
 * picket ≤ lure − 20・kite ≤ lure + 5 で自艇の沈没 + 漂流 ≥ lure + 5（引きつけ続けが得にならない）。lure_away は表だけ（R13: S3 の lure がもう見つかっている間は輸送船から離れるので
 * lure と同じに遊ぶ。R12 の lure_away ≥ lure + 3 は開かない）。picket・shoot_near・circle_start・lure_near は行の帯なし。S4 の値（engaged_error_factor 2.0）で全部 ✓。
 * R14 の lure_cue（HUD の「輸送船が射線に入る！ 離れて戦え」の間だけ離れる）と home_early（すぐ帰投の輪へ行って待つ）は表だけ。
 * v0.6.9 実機 1 回目（撃った PT は 3 種類の斉射とも去る）の後もノーマルは帯を変えずに全部 ✓（lure 87.3 / 87.0%・kite の沈没 + 漂流は lure より ＋31.4 点）。
 * 人に近い遊び方（face・human・human_face。v0.6.9 実機 1 回目）はここに無い＝表だけ（帯も ✓/✗ も無い。数の合わせは味方の駆逐艦の後の v0.6.10 で使う物差し）。
 * v0.6.10 S4: 卯月を切った夜（ALLY_OFF=1）の帯（*_NO_ALLY＝S0b のまま。D9・G6）。卯月のいる夜の帯は systems/ally-sim-bands の LANDING_CALIBRATION_ALLY
 */
export const LANDING_CALIBRATION_NO_ALLY: readonly LandingBandRow[] = [
  { policy: 'hide', bands: { objPct: [0, 15], ownSunkPct: [0, 3] } },
  { policy: 'circle_start', bands: {} },
  { policy: 'picket', bands: {} },
  // v0.6.10 S0b: 夜明けの前の帰投（homeBeforeDawnPct 80〜100）の帯を外した。ユーザーの選択「jp_04 の夜明けだけ 160 秒」で揚陸の 20 秒後に夜明けになり、ほとんどの夜は夜明けの後に帰る（手本 15.8%）。
  // 模擬は夜明けの空襲を持たないので、達成 % は夜明けの後の帰投も数える（v0.6.10 の駆逐艦の較正で空襲の扱いを決める）
  { policy: 'lure', bands: { objPct: [70, 88], ownSunkPct: [0, 18], adriftPct: [0, 3], fuelCallPct: [0, 10], ringEarlyPct: [0, 10] } },
  { policy: 'lure_away', bands: {} },
  { policy: 'lure_near', bands: {} },
  { policy: 'lure_cue', bands: {} },
  { policy: 'lure_noshoot', bands: {} },
  { policy: 'lure_late', bands: {} },
  { policy: 'kite', bands: {} },
  { policy: 'shoot_near', bands: {} },
  { policy: 'home_early', bands: {} },
];
export const LANDING_PAIRS: readonly LandingPairRow[] = [
  { policy: 'circle_start', other: 'hide', name: '達成 %', value: obj, lo: -Infinity, hi: 10 },
  { policy: 'lure', other: 'lure_near', name: '達成 %', value: obj, lo: 10, hi: Infinity },
  { policy: 'lure_late', other: 'lure', name: '達成 %', value: obj, lo: -Infinity, hi: -10 },
  { policy: 'lure_late', other: 'hide', name: '達成 %', value: obj, lo: 20, hi: Infinity },
  { policy: 'picket', other: 'lure', name: '達成 %', value: obj, lo: -Infinity, hi: -20 },
  { policy: 'kite', other: 'lure', name: '達成 %', value: obj, lo: -Infinity, hi: 5 },
  { policy: 'kite', other: 'lure', name: '沈没 + 漂流 %', value: lost, lo: 5, hi: Infinity },
];
/**
 * ハード（R12: lure 45〜70%・自艇の沈没 ≤ 30%、hide ≤ 8%。外れたら S4 で hard block ごと外す）。v0.6.9 実機 1 回目: lure は 45〜75%。撃った PT が（戦いながらの斉射でも）去るので
 * +6.0 / +11.2 点（67.0 / 63.8% → 73.0 / 75.0%。N 400 × 2 組。組 2 は帯の端ちょうど＝端を含むので ✓）。数の合わせは味方の駆逐艦の後（v0.6.10）で人に近い遊び方の行も使う。
 * PT は 3 隻のまま（ユーザー「ハードモードは敵PTが3隻に増えるようにしてください」＝もう 3 隻。tests/setup-jp04）
 */
export const LANDING_HARD_CALIBRATION_NO_ALLY: readonly LandingBandRow[] = [
  { policy: 'hide', bands: { objPct: [0, 8] } },
  // v0.6.10 S0b: 45〜75 → 45〜78（ユーザーの選択「jp_04 の夜明けだけ 160 秒」で、夜明けのラッチが米PT を早く去らせ、組 2 が 75.0 → 75.3%。上に 2 点以上の余裕。数の合わせは駆逐艦の段）
  { policy: 'lure', bands: { objPct: [45, 78], ownSunkPct: [0, 30] } },
];
/**
 * 斉射の 1 本の命中率（spec §8: 気づかれていない 0.30〜0.50・慌てた 0.08〜0.25。戦いながら（R12）は帯なし＝表だけ）。帯は影の船体（いつも浮いている）への当たりうる本数あたり（不発を除く）: 撃った本数あたりは
 * 沈んだ後に着いた魚雷を外れに数えて低く（S2 の 0.327）、浮いている間に決着した本数あたりは沈めた斉射の残りの外れが抜けて高く出る（2 本で沈めば 3 本目は分母に入らない）
 */
export const LANDING_SALVO_BANDS: Readonly<Record<'calm' | 'hurried', Band>> = { calm: [0.3, 0.5], hurried: [0.08, 0.25] };

/** 行の帯を外れた項目（空なら合格） */
export function landingBandMisses(r: LandingBandRow, c: LandingCell): string[] {
  const out: string[] = [];
  for (const [k, b] of Object.entries(r.bands) as [LandingMetric, Band][]) if (!(c[k] >= b[0] && c[k] <= b[1])) out.push(`${LANDING_METRICS[k]} ${c[k].toFixed(1)}（帯 ${b[0]}〜${b[1]}）`);
  return out;
}

/** 不変（spec §8 の I1〜I6。どの遊び方も・どの夜も）を外れた項目 */
export function landingInvariantMisses(c: LandingCell, s: LandingSimSetup): string[] {
  const out: string[] = [];
  if (!(c.i1MinS >= LANDING_WARN_MIN_S)) out.push(`I1 報告から気づかれていない斉射 ${c.i1MinS.toFixed(2)} 秒（${LANDING_WARN_MIN_S} 秒以上）`);
  if (!(c.i2MinS >= s.torpedo.reacquireS - 1e-6)) out.push(`I2 見失いから斉射 ${c.i2MinS.toFixed(2)} 秒（${s.torpedo.reacquireS} 秒以上）`);
  if (c.afterDawn > 0) out.push(`I3 夜明けの後の斉射 ${c.afterDawn}`);
  if (c.maxSalvosPerPt > 1) out.push(`I4 1 隻の斉射 ${c.maxSalvosPerPt}`);
  if (c.drawMiss > 0) out.push(`I5 seed+26 の回数が合わない夜 ${c.drawMiss}`);
  if (c.unresolvedAtDawn > 0) out.push(`I6 夜明けに未決着 ${c.unresolvedAtDawn} 夜`);
  if (c.i7Miss > 0) out.push(`I7 seed+27 の回数が卯月の見張りの候補と合わない夜 ${c.i7Miss}`);
  if (c.i8Bad > 0) out.push(`I8 条件の外の照らされた斉射 ${c.i8Bad}`);
  if (c.i10Miss > 0) out.push(`I10 seed+28 の回数が 2 × 弾 + 命中と合わない夜 ${c.i10Miss}`);
  if (c.i11Viol > 0) out.push(`I11 owner の PT が航過でないステップ ${c.i11Viol}`);
  return out;
}

/** 斉射の帯を外れた項目 */
export function landingSalvoMisses(st: SalvoStats): string[] {
  const out: string[] = [];
  for (const k of ['calm', 'hurried'] as const) {
    const s: SalvoKindStats = st[k];
    const r = s.fired > 0 ? s.potHits / s.fired : NaN;
    const b = LANDING_SALVO_BANDS[k];
    if (s.salvos > 0 && !(r >= b[0] && r <= b[1])) out.push(`${k === 'calm' ? '気づかれていない' : '慌てた'}斉射の当たりうる 1 本 ${r.toFixed(3)}（帯 ${b[0]}〜${b[1]}）`);
  }
  return out;
}

export interface LandingRun {
  setup: LandingSimSetup;
  /**
   * 組ごとの夜（blocks 組。組 b は seed seedBase + b × n から n 夜）・その組の斉射・全部の組を合わせた斉射（期待値の分布）。斉射を合わせる遊び方は salvoPolicies: 回した中の較正の遊び方だけ
   * （v0.6.9 実機 1 回目: 人に近い遊び方（LANDING_HUMAN_POLICIES）は表だけで入れない＝斉射の数え・帯・R2 の期待値が動かない）。回したのが人に近い遊び方だけなら、それを合わせる（帯は見ない）
   */
  trials: (policy: LandingPolicy, block: number) => readonly LandingTrial[];
  salvo: (block: number) => SalvoStats;
  pooledSalvo: SalvoStats;
  salvoPolicies: readonly LandingPolicy[];
  /** 組ごとの集計と、組を合わせた集計（対の帯） */
  cell: (policy: LandingPolicy, block: number) => LandingCell;
  pooled: (policy: LandingPolicy) => LandingCell;
  /**
   * I9（v0.6.10）: LANDING_I9_POLICIES の組 b の夜のうち、同じ seed の卯月の無い夜（allyOff）と記録（卯月の欄と隊の砲の数え LANDING_TRIAL_GUN_KEYS を除く）が違うか、
   * 卯月の砲が斉射の前の PT の結末を決めた夜の数。卯月のいない表・ほかの遊び方は 0（初めて聞いたときに卯月の無い夜を回す）。v0.6.10 実機 1 回目（撃っても去らない）までは
   * 隊の砲の数えも比べ、卯月が 1 発でも撃てば外れだった（撃った PT は去ったので、この遊び方では卯月は撃たなかった）。今は撃った後に泊地のそばに残る東の PT を卯月が撃つ夜がある
   */
  i9Misses: (policy: LandingPolicy, block: number) => number;
  /** 卯月の得（v0.6.10 S4）: 組を合わせた夜の達成 % の 卯月あり − 同じ seed・夜明け・上書きの卯月の無い夜（つまみを除く）。卯月のいない表は 0（初めて聞いたときに卯月の無い夜を回す） */
  allyGain: (policy: LandingPolicy) => number;
}

/** 表を 1 回だけ回す口（tests と scripts）: policies を blocks 組ずつ回し、期待値の分布は salvoPolicies（回した中の較正の遊び方。人に近い遊び方は入れない）の全部の夜から */
export function landingCalibrationRun(data: GameData, missionId: string, policies: readonly LandingPolicy[], n: number, seedBase: number, blocks: number, o: LandingSimOverrides = {}): LandingRun {
  const setup = landingSimSetup(data, missionId, o);
  const count = setup.pt.count;
  const nn = setup.torpedo.n;
  const runs = new Map<LandingPolicy, LandingTrial[][]>();
  for (const pol of policies) runs.set(pol, Array.from({ length: blocks }, (_, b) => runLandingTrials(setup, pol, n, seedBase + b * n)));
  const get = (pol: LandingPolicy): LandingTrial[][] => {
    const r = runs.get(pol);
    if (!r) throw new Error(`遊び方 ${pol} はこの表で回していない（POL）`);
    return r;
  };
  const calibrated = policies.filter((p) => !LANDING_HUMAN_POLICIES.includes(p));
  const salvoPolicies = calibrated.length > 0 ? calibrated : [...policies];
  const bySalvo = Array.from({ length: blocks }, (_, b) => salvoStats(salvoPolicies.flatMap((p) => get(p)[b]!), count, nn));
  const pooledSalvo = salvoStats(salvoPolicies.flatMap((p) => get(p).flat()), count, nn);
  const cells = new Map<string, LandingCell>();
  const memo = (key: string, make: () => LandingCell): LandingCell => cells.get(key) ?? cells.set(key, make()).get(key)!;
  const i9 = new Map<string, number>();
  let off: LandingSimSetup | null = null;
  const offSetup = (): LandingSimSetup => (off ??= landingSimSetup(data, missionId, { ...withoutAllyKnobs(o), allyOff: true }));
  const offRuns = new Map<string, LandingTrial[]>();
  /** 同じ seed の卯月の無い夜（組 b。I9 と得で同じ夜を使う） */
  const offTrials = (pol: LandingPolicy, b: number): LandingTrial[] => {
    const key = `${pol}/${b}`;
    if (!offRuns.has(key)) offRuns.set(key, runLandingTrials(offSetup(), pol, n, seedBase + b * n));
    return offRuns.get(key)!;
  };
  const i9Misses = (pol: LandingPolicy, b: number): number => {
    if (!setup.allyDestroyer || !LANDING_I9_POLICIES.includes(pol)) return 0;
    const key = `${pol}/${b}`;
    if (!i9.has(key)) {
      const rs0 = offTrials(pol, b);
      i9.set(key, get(pol)[b]!.filter((r, k) => allyFatedBeforeSalvo(r) || landingTrialBase(r, LANDING_TRIAL_GUN_KEYS) !== landingTrialBase(rs0[k]!, LANDING_TRIAL_GUN_KEYS)).length);
    }
    return i9.get(key)!;
  };
  const pooled = (pol: LandingPolicy): LandingCell => memo(`${pol}/all`, () => landingCell(setup, pol, get(pol).flat(), pooledSalvo));
  const allyGain = (pol: LandingPolicy): number => {
    if (!setup.allyDestroyer) return 0;
    const rs0 = Array.from({ length: blocks }, (_, b) => offTrials(pol, b)).flat();
    return pooled(pol).objPct - landingCell(offSetup(), pol, rs0, pooledSalvo).objPct;
  };
  return {
    setup, pooledSalvo, salvoPolicies, i9Misses, allyGain,
    trials: (pol, b) => get(pol)[b]!,
    salvo: (b) => bySalvo[b]!,
    cell: (pol, b) => memo(`${pol}/${b}`, () => landingCell(setup, pol, get(pol)[b]!, pooledSalvo)),
    pooled,
  };
}
