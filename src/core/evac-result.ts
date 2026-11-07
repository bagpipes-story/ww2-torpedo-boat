// 空襲下の退避（v0.6.11 S6。jp_03。spec-v0611-r2 §10.6・§3.10）の Result の材料（evacResultPart）: 任務の終わりに 1 回だけ、隊（core/evac-squadron）・段取り（core/evac-plan）・
// もう一度来る編隊（core/evac-repass）と決着の時の写し（systems/world-evac が夜明けのラッチのステップに取る）から数える。文は ui/evac-result、点は core/scoring。
// 残存は座席の艇を含む 18 中（r2 L2）。編隊の数は 1 回ごと（S3b の U7: 予告し直した回も数える＝模擬の表 core/evac-sim-cell と同じ数え方。分母は「狙われた回」＝目標の無い編隊は数えない＝r2 L1）。
// Phaser 非依存・乱数なし。配列は作る時の 1 回だけ（毎フレームの処理は無い）。
import { AA_SRC_DAWN } from './aa-fire';
import { G_ENTERING, G_HAULING, G_HIDDEN, SHELTER_COVER } from './evac-data';
import { EO_LOST, EO_LOST_EARLY, EO_NO_TARGET, type EvacPlan } from './evac-plan';
import type { EvacRepass } from './evac-repass';
import { evacSurvivors, type EvacSquadron } from './evac-squadron';

/** 決着（240 秒）の時の操作中の隊のいる所: 決着の前に終わった（18 隻すべてが沈んだ）・隠れ場所の中・入っている途中・レールで上げている途中・外 */
export const EVR_NONE = 0;
export const EVR_HIDDEN = 1;
export const EVR_ENTERING = 2;
export const EVR_HAULING = 3;
export const EVR_OUTSIDE = 4;

/** 決着の時の写し（systems/world-evac が夜明けのラッチのステップに書く。決着の前に終われば group −1） */
export interface EvacSettleSnap {
  group: number;
  phase: number;
  shelter: number;
  /** 決着の時の残存（第 1 次の空襲が去って確定した数。2 行目の「残存 8 で確定」と同じ。決着の前に終われば NaN） */
  survivors: number;
  /** 全艇が隠れて 240 秒を待たずに決着した（v0.6.11 IP1 の U8。core/evac-early） */
  early: boolean;
}

export function createEvacSettleSnap(): EvacSettleSnap {
  return { group: -1, phase: -1, shelter: -1, survivors: NaN, early: false };
}

/** Result の材料（MissionResult.evac。jp_03 だけ） */
export interface EvacResult {
  /** 隻数（18）・達成の隻数（6）・史実の残存（5） */
  total: number;
  quota: number;
  historical: number;
  /** 終わりの時の残存（座席の艇を含む） */
  survivors: number;
  /** 座席の艇（操作中の隊長艇）が浮いて終わった（帰投・漂流）。残った艇の点は座席を除く＝survivors − 1（scoring.json の evac） */
  seatAfloat: boolean;
  /** 終わりの時の残存の内訳: 壕に上げた艇・陰に隠れた隊の艇・それ以外（入っている・上げている途中の艇も外） */
  cave: number;
  cover: number;
  outside: number;
  /** 隊ごとの残存（第1隊から） */
  byGroup: number[];
  /** 編隊（1 回ごと）: 隊を狙った回（予告し直しを含む）・そのうち予告し直した回・見失わせた回（始める前と途中）・爆撃に来た回（始めた）・撃墜した機 */
  aimed: number;
  again: number;
  lost: number;
  came: number;
  downed: number;
  /** 240 秒の後の追撃（§2 の敵機 4 機）で撃墜した機（v0.6.11 S8。兵装の行の「撃墜 N 機」は全部の機を数えるので、3 行目は downed ＋ これで同じ数にして内訳を出す） */
  chaseDowned: number;
  /** 投下した爆弾・艇への命中（巻き添えを含む） */
  bombs: number;
  boatHits: number;
  /** ［切替］で操る隊を替えた回数・隊長艇の交代 */
  switches: number;
  promotions: number;
  /** 決着の時（EVR_*）・その時の操作中の隊と隠れ場所の呼び名（無ければ ''）・確定した残存（決着の前に終われば NaN） */
  settlePlace: number;
  settleGroupJa: string;
  settleShelterJa: string;
  settleSurvivors: number;
  /** 全艇が隠れて空襲を待たずに決着した（v0.6.11 IP1 の U8。時の行は「全艇が隠れた ・ 空襲を待たずに退避完了（残り M:SS）」） */
  settleEarly: boolean;
}

/** 読む物（systems/world-evac の WorldEvac がそのまま満たす。tests は core の部品で組む） */
export interface EvacResultSource {
  readonly sq: EvacSquadron;
  readonly plan: EvacPlan;
  readonly air: { readonly repass: EvacRepass };
  readonly settleSnap: EvacSettleSnap;
}

function popcount(bits: number): number {
  let n = 0;
  for (let b = bits; b !== 0; b &= b - 1) n++;
  return n;
}

/** 決着の時の段階 → EVR_* */
function settlePlaceOf(s: EvacSettleSnap): number {
  if (s.group < 0) return EVR_NONE;
  return s.phase === G_HIDDEN ? EVR_HIDDEN : s.phase === G_ENTERING ? EVR_ENTERING : s.phase === G_HAULING ? EVR_HAULING : EVR_OUTSIDE;
}

/** 任務の終わりに 1 回（mission-telemetry の buildMissionResult。systems/mission-result-extras の evacResultPart）。seatAfloat は座席が沈んでいない（世界の boat.sinking の逆）、chaseDowned は追撃の撃墜 */
export function evacResultOf(ev: EvacResultSource, seatAfloat: boolean, chaseDowned = 0): EvacResult {
  const { sq, plan } = ev;
  const rp = ev.air.repass;
  const raid = plan.raid;
  const shelters = sq.p.shelters;
  let cave = 0;
  let cover = 0;
  const byGroup = sq.groups.map(() => 0);
  for (const b of sq.boats) {
    if (b.sunk) continue;
    byGroup[b.group]!++;
    const g = sq.groups[b.group]!;
    if (b.up) cave++;
    else if (g.phase === G_HIDDEN && g.shelter >= 0 && shelters[g.shelter]!.kind === SHELTER_COVER) cover++;
  }
  const survivors = evacSurvivors(sq);
  // 1 回ごと: 最初の予告（予告した波の編隊）＋ 予告し直し − 目標なし（最初の予告だけが目標なしになる＝予告し直しは狙いのある時だけ）。見失いは閉じた回と最後の回
  let announced = rp.again;
  let noTarget = 0;
  let lost = rp.closed[EO_LOST]! + rp.closed[EO_LOST_EARLY]!;
  let downed = 0;
  for (const fl of plan.flights) {
    if (fl.wave < plan.nextWave) announced++;
    if (fl.outcome === EO_NO_TARGET) noTarget++;
    if (fl.outcome === EO_LOST || fl.outcome === EO_LOST_EARLY) lost++;
    downed += popcount(fl.downed);
  }
  const s = ev.settleSnap;
  const place = settlePlaceOf(s);
  return {
    total: raid.survivorsTotal,
    quota: raid.survivorQuota,
    historical: raid.historicalSurvivors,
    survivors,
    seatAfloat: seatAfloat && survivors > 0,
    cave,
    cover,
    outside: survivors - cave - cover,
    byGroup,
    aimed: announced - noTarget,
    again: rp.again,
    lost,
    came: plan.came,
    downed,
    chaseDowned,
    bombs: plan.releases,
    boatHits: plan.boatHits,
    switches: sq.switches,
    promotions: sq.promotions,
    settlePlace: place,
    settleGroupJa: s.group >= 0 ? sq.p.groups[s.group]!.labelJa : '',
    settleShelterJa: place !== EVR_NONE && place !== EVR_OUTSIDE && s.shelter >= 0 ? shelters[s.shelter]!.labelJa : '',
    settleSurvivors: s.survivors,
    settleEarly: s.early && place !== EVR_NONE,
  };
}

/**
 * 任務の終わりの材料（systems/mission-telemetry の buildMissionResult が広げる。jp_03 だけ evac の鍵＝本文の頭の 4 行・時の行・残った艇の点。無い任務は鍵ごと無い＝ほかの任務の Result は同じ）。
 * 世界は構造の型で読む（MissionWorld がそのまま満たす。systems/mission-result-extras に置くと、Result の型を読む tests の node の型検査に Phaser と DOM が入る＝systems/mission-objective の前例）
 */
export function evacResultPart(w: {
  readonly evac: EvacResultSource | null;
  readonly boat: { readonly sinking: boolean };
  readonly arms?: { readonly downsBy: readonly number[] } | null;
}): { evac?: EvacResult } {
  return w.evac ? { evac: evacResultOf(w.evac, !w.boat.sinking, w.arms?.downsBy[AA_SRC_DAWN] ?? 0) } : {};
}

/** 残った艇の点の隻数（座席の艇は帰投の 700 で数えるので除く。scoring.json の evac.points_per_survivor × これ。spec §3.10） */
export function evacScoredBoats(e: EvacResult): number {
  return Math.max(0, e.survivors - (e.seatAfloat ? 1 : 0));
}
