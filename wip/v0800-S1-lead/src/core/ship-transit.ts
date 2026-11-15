// 列の通過（v0.8.0 S1。us_04「ブラケット海峡の夜」の東京急行。spec-v0800 §4.4・§4.5・§6 の S1）の純粋な規則。列の艦ごとの段階:
// WAIT（まだ来ない）→ IN（往路・海域の中）→ AWAY（揚陸の地＝ビラ・海域の外）→ OUT（復路・海域の中）→ GONE（海域を去った）。IN・OUT で沈み始めた艦は SUNK（戻らない）。
// どの時計で進むか（命中スローで列が崩れない。brief の S0 の注）:
//   WAIT → IN: 体感の時計（命中スロー込みの実秒 feelDt の和）が enterS ＋ 間隔 × i に届いたステップ。海域の中の艦は dt（＝feelDt × time_scale）で進むので、同じ時計で
//              入れると列の間隔（m）がスローの間も縮まない（固定ステップの時計で入れると、スローで遅れた前の艦に後ろの艦が寄る）。
//   IN → AWAY・OUT → GONE: 時計でなく位置。艦の x が道の goneX を越えたステップ（スロー・雷跡の回避で遅れても、着くのは縁の外へ出た時）。
//   AWAY → OUT: 固定ステップの時計（世界の stepTimeS。スローで遅れない＝夜明けの時計と同じ）で、着いたステップから unloadS。艦は海域の外で動かないので位置はずれない。
// 夜明け（世界の夜明けのラッチを dawn で渡す。一度立てば消えない）: WAIT は入らず、AWAY は戻らない（ビラに残った＝揚陸で残った扱い）。IN・OUT の艦は世界が退かせ、
// 縁の外へ出れば GONE。IN の艦が来た縁の外へ出ても、OUT の艦が来た縁の外へ戻っても GONE（海域を出た艦は戻らない）。今夜の揺らぎは plan（TransitSetup）に入っている。
// 世界（S2 の systems/destroyer-transit）との約束: entered・returned の印が立ったステップのうちに、その艦を道の現れる点（appearX・laneY・headingDeg）へ置く
// （次の stepShipTransit がその x を読む）。WAIT・AWAY の艦の x と sinking は読まない。Phaser 非依存・乱数なし。作る（createShipTransit）は起動時に 1 回、ほかは確保しない。
import { TRANSIT_MAX_SHIPS } from './transit-data';

/** 艦ごとの段階 */
export const TRANSIT_WAIT = 0;
export const TRANSIT_IN = 1;
export const TRANSIT_AWAY = 2;
export const TRANSIT_OUT = 3;
export const TRANSIT_GONE = 4;
export const TRANSIT_SUNK = 5;
/** 時計の比べの許し（固定ステップの 1/60 秒の和の丸め） */
const TRANSIT_TIME_EPS_S = 1e-6;

/** 道 1 本（config/transit-mission-data の TransitLeg が形で満たす）: 現れる x・去ったとみなす x（向こうの縁の外）・道の y・針路 */
export interface TransitLegPlan {
  readonly appearX: number;
  readonly goneX: number;
  readonly laneY: number;
  readonly headingDeg: number;
}

/** 列の時刻表（config/transit-mission-data の TransitSetup が形で満たす。今夜の揺らぎ・ハードの艦の数込み） */
export interface TransitPlan {
  readonly ships: number;
  readonly spacingS: number;
  readonly enterS: number;
  readonly unloadS: number;
  readonly inbound: TransitLegPlan;
  readonly outbound: TransitLegPlan;
  readonly coverLeavesWithOutbound: boolean;
}

/** 世界の列の艦（entities/destroyer の Destroyer が形で満たす。読むのは IN・OUT の艦の x と沈み始めたかだけ） */
export interface TransitShipView {
  readonly state: { readonly x: number };
  readonly sinking: boolean;
}

export interface ShipTransitState {
  readonly ships: number;
  /** 艦ごとの段階（TRANSIT_*）と揚陸の地に着いた固定ステップの時計の秒（NaN は未だ）。長さ TRANSIT_MAX_SHIPS */
  readonly phase: Uint8Array;
  readonly awayAtS: Float64Array;
  /** 体感の時計（命中スロー込みの実秒の和）と、夜明けを過ぎたか */
  feelS: number;
  dawn: boolean;
  /** このステップに段階が変わった艦（bit i＝艦 i）: 往路に入った・揚陸の地に着いた・復路に戻った・去った・沈んだ */
  entered: number; arrived: number; returned: number; gone: number; sunk: number;
  /** このステップに復路の最初の艦が現れ、護衛も退く（plan.coverLeavesWithOutbound が真の時だけ）と、その固定ステップの時計の秒（NaN は未だ） */
  coverLeaves: boolean;
  firstOutS: number;
  /** 通算: 往路に現れた・揚陸の地に着いた・復路に現れた・去った・沈んだ艦の数 */
  inCount: number; arrivedCount: number; outCount: number; goneCount: number; sunkCount: number;
}

/** 起動時に 1 回。艦の数は 1〜TRANSIT_MAX_SHIPS（V-T1。固定長の枠） */
export function createShipTransit(p: TransitPlan): ShipTransitState {
  if (!(Number.isInteger(p.ships) && p.ships >= 1 && p.ships <= TRANSIT_MAX_SHIPS)) throw new Error(`列の艦の数（${p.ships}）は 1〜${TRANSIT_MAX_SHIPS}（core/ship-transit）`);
  return {
    ships: p.ships,
    phase: new Uint8Array(TRANSIT_MAX_SHIPS),
    awayAtS: new Float64Array(TRANSIT_MAX_SHIPS).fill(NaN),
    feelS: 0, dawn: false, entered: 0, arrived: 0, returned: 0, gone: 0, sunk: 0, coverLeaves: false, firstOutS: NaN,
    inCount: 0, arrivedCount: 0, outCount: 0, goneCount: 0, sunkCount: 0,
  };
}

/** 艦 i（0 始まり）が往路に現れる体感の時計の秒（入りの時刻） */
export function transitEnterAtS(p: TransitPlan, i: number): number {
  return p.enterS + p.spacingS * i;
}

/** その段階の艦が現れる道（IN は往路・OUT は復路・ほかは null）。現れる点は道の appearX・laneY・headingDeg */
export function transitAppearLeg(p: TransitPlan, phase: number): TransitLegPlan | null {
  return phase === TRANSIT_IN ? p.inbound : phase === TRANSIT_OUT ? p.outbound : null;
}

/**
 * 1 固定ステップ（世界は艦を動かした後に呼ぶ）。feelDtS は命中スロー込みの実秒、nowS は固定ステップの時計（stepTimeS）、dawn は夜明けを過ぎたか。
 * ships は列の艦（0〜ships − 1）。艦ごとに 1 ステップ 1 段まで進め、変わった艦を entered・arrived・returned・gone・sunk の印に、通算を …Count に書く
 */
export function stepShipTransit(s: ShipTransitState, p: TransitPlan, feelDtS: number, nowS: number, dawn: boolean, ships: readonly TransitShipView[]): void {
  s.entered = s.arrived = s.returned = s.gone = s.sunk = 0;
  s.coverLeaves = false;
  s.feelS += feelDtS;
  if (dawn) s.dawn = true;
  const inSign = p.inbound.goneX > p.inbound.appearX ? 1 : -1;
  const outSign = p.outbound.goneX > p.outbound.appearX ? 1 : -1;
  for (let i = 0; i < s.ships; i++) {
    const ph = s.phase[i]!;
    const bit = 1 << i;
    if (ph === TRANSIT_IN || ph === TRANSIT_OUT) {
      const v = ships[i]!;
      if (v.sinking) {
        s.phase[i] = TRANSIT_SUNK;
        s.sunk |= bit;
        s.sunkCount++;
        continue;
      }
      const pastLanding = (v.state.x - p.inbound.goneX) * inSign >= 0; // 揚陸の地の側の縁の外
      const pastOrigin = (v.state.x - p.outbound.goneX) * outSign >= 0; // 来た側の縁の外
      if (ph === TRANSIT_IN && pastLanding) {
        s.phase[i] = TRANSIT_AWAY;
        s.awayAtS[i] = nowS;
        s.arrived |= bit;
        s.arrivedCount++;
      } else if (pastLanding || pastOrigin) {
        s.phase[i] = TRANSIT_GONE;
        s.gone |= bit;
        s.goneCount++;
      }
    } else if (ph === TRANSIT_WAIT) {
      if (s.dawn || s.feelS < transitEnterAtS(p, i) - TRANSIT_TIME_EPS_S) continue;
      s.phase[i] = TRANSIT_IN;
      s.entered |= bit;
      s.inCount++;
    } else if (ph === TRANSIT_AWAY) {
      if (s.dawn || nowS < s.awayAtS[i]! + p.unloadS - TRANSIT_TIME_EPS_S) continue;
      s.phase[i] = TRANSIT_OUT;
      s.returned |= bit;
      s.outCount++;
      if (Number.isNaN(s.firstOutS)) {
        s.firstOutS = nowS;
        s.coverLeaves = p.coverLeavesWithOutbound;
      }
    }
  }
}

/** 残りの戻り: これから海域に現れる艦の数（WAIT と AWAY。夜明けの後は 0＝もう来ない・戻らない）。隊の「敵艦隊なし」はこれが 0 の時だけ（S2 の destroyer-group） */
export function transitPending(s: ShipTransitState): number {
  if (s.dawn) return 0;
  let k = 0;
  for (let i = 0; i < s.ships; i++) if (s.phase[i] === TRANSIT_WAIT || s.phase[i] === TRANSIT_AWAY) k++;
  return k;
}

/** 段階 phase にいる艦の数（Result の「ビラに残った」は AWAY） */
export function transitCount(s: ShipTransitState, phase: number): number {
  let k = 0;
  for (let i = 0; i < s.ships; i++) if (s.phase[i] === phase) k++;
  return k;
}

/** 艦 i が海域の中（IN か OUT）＝見える・撃てる・狙える・レーダーに映りうる */
export function transitOnMap(s: ShipTransitState, i: number): boolean {
  const ph = s.phase[i];
  return ph === TRANSIT_IN || ph === TRANSIT_OUT;
}
