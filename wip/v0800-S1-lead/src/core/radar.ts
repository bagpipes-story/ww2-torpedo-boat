// レーダー（v0.8.0 S1。spec-v0800 §3.2 の D-R1〜D-R12・§3.5・§5.2・§7）の純粋な規則。目とは別の感覚（D-R1・lead の L7）: 読むのは艦艇の位置と、呼ぶ側が渡す
// 「小さい艇か・機か・浮いているか」だけ。発見（detectRangeM・enemySighted）・自艇の視程・AI の状態・見越し点マーカーは読まない（tests/radar が import と名前を固定）。
// 掃引（D-R7）: 固定ステップの時計（世界の stepTimeS）で sweep_s ごとに 1 回（最初は出撃の最初のステップ。以後 sweep_s の倍数の秒）、全部の輝点を一度に置き直す。間は動かない。
// 映る物: 浮いていて海域の内（0〜幅・0〜高さ）で、艦は ship_range_m・小さい艇（大発・PT・駆潜艇＝kind で渡す。D-R5）は small_range_m の内（境界は含む）。
// 映らない物: 機（aircraft が false＝D-R3）・沈み始めた艦と海域の外の艦（揚陸で抜けた・退いた。次の掃引で消える）・陸から land_clutter_m の内（D-R4。core/strait-geometry の
// 岸の線。境界は映る。水道の切れ目の上は両端の陸から遠ければ映る）。位置は position_step_m の格子に丸め（乱数なし）、同じ格子の物は 1 つ、自艇から近い順に固定長 16。
// 輝点の記録は丸めた位置と置いた掃引の秒だけ（lead の L6。針路・速さ・種類・発見・どの艦かの欄は無い＝D-R2）。
// 出来事（HUD の 2 行目と Result＝S4）は数えて残すだけ（1 フレームに固定ステップが何回あっても読み落とさない）: 夜の最初の接触（秒・一番近い輝点・その時の自艇）、
// 接触の数が増えた時（新しい接触＝前の掃引の輝点から一番遠い輝点）・減った時（消えた接触＝今の輝点から一番遠い前の輝点）。一番近い接触の距離は掃引ごとに平方根 1 本。
// Phaser 非依存・乱数なし。作る（createRadarState・createRadarTargets）は起動時に 1 回、ほかは確保しない。
import type { RadarParams } from './radar-data';
import { landDist2, type LandLine } from './strait-geometry';

/** 輝点の固定長（spec §5.2。S2 の radar-view の Image も 16） */
export const RADAR_BLIP_CAPACITY = 16;
/** 映す物の種類（呼ぶ側が渡す。輝点には残らない）: 艦（駆逐艦・輸送船）・小さい艇（大発・PT・駆潜艇）・機（水上機・空襲・哨戒機） */
export const RADAR_KIND_SHIP = 0;
export const RADAR_KIND_SMALL = 1;
export const RADAR_KIND_AIR = 2;
/** 掃引の時刻の比べの許し（固定ステップの時計は 1/60 秒の和の丸めを持つ） */
const RADAR_TIME_EPS_S = 1e-6;

/** 輝点（L6: 鍵はちょうど x・y・atS） */
export interface RadarBlip {
  /** 丸めた位置 m（使っていない枠は NaN） */
  x: number;
  y: number;
  /** 置いた掃引の秒（固定ステップの時計。薄れ方＝S2 の radar-view。使っていない枠は NaN） */
  atS: number;
}

/** 掃引に渡す物（呼ぶ側が掃引の時だけ 0〜n − 1 を書く）: 位置・種類（RADAR_KIND_*）・浮いているか（1＝海の上。0＝沈み始めた・まだ来ない・去った） */
export interface RadarTargets {
  n: number;
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly kind: Uint8Array;
  readonly afloat: Uint8Array;
}

/** 海域の大きさと岸の線（起動時に 1 回。岸の無い任務は land が空） */
export interface RadarGeometry {
  readonly width: number;
  readonly height: number;
  readonly land: readonly LandLine[];
}

export interface RadarState {
  /** 輝点の枠（長さ RADAR_BLIP_CAPACITY。0〜n − 1 が今の輝点で近い順） */
  readonly blips: readonly RadarBlip[];
  n: number;
  /** 次の掃引の秒・掃引の回数・最後の掃引の秒（NaN は未だ） */
  nextSweepS: number; sweeps: number; lastSweepS: number;
  /** 最後の掃引の自艇の位置と、そこから一番近い輝点（blips[0]）までの m（輝点が無ければ NaN） */
  fromX: number; fromY: number; nearestM: number;
  /** 夜の最初の接触: 秒（NaN は未だ）・一番近い輝点・その時の自艇 */
  firstS: number; firstX: number; firstY: number; firstFromX: number; firstFromY: number;
  /** 接触の数が増えた回数（最初の接触は数えない）と最後の新しい接触の輝点 */
  newCount: number; newX: number; newY: number;
  /** 接触の数が減った回数と最後に消えた接触の前の輝点 */
  lostCount: number; lostX: number; lostY: number;
  /** 中の作業: 前の掃引の輝点と、今の輝点の自艇からの 2 乗の距離（近い順の差し込み） */
  prevN: number;
  readonly prevX: Float64Array;
  readonly prevY: Float64Array;
  readonly d2: Float64Array;
}

export function createRadarState(): RadarState {
  const blips: RadarBlip[] = [];
  for (let k = 0; k < RADAR_BLIP_CAPACITY; k++) blips.push({ x: NaN, y: NaN, atS: NaN });
  const cap = RADAR_BLIP_CAPACITY;
  return {
    blips, n: 0, nextSweepS: 0, sweeps: 0, lastSweepS: NaN, fromX: NaN, fromY: NaN, nearestM: NaN,
    firstS: NaN, firstX: NaN, firstY: NaN, firstFromX: NaN, firstFromY: NaN, newCount: 0, newX: NaN, newY: NaN, lostCount: 0, lostX: NaN, lostY: NaN,
    prevN: 0, prevX: new Float64Array(cap), prevY: new Float64Array(cap), d2: new Float64Array(cap),
  };
}

/** 掃引に渡す物の枠（capacity はその任務の艦艇の数の上限） */
export function createRadarTargets(capacity: number): RadarTargets {
  return { n: 0, x: new Float64Array(capacity), y: new Float64Array(capacity), kind: new Uint8Array(capacity), afloat: new Uint8Array(capacity) };
}

/** このステップ（固定ステップの時計 nowS）が掃引の時か（呼ぶ側はこれが真の時だけ RadarTargets を書けばよい） */
export function radarSweepDue(s: RadarState, nowS: number): boolean {
  return nowS >= s.nextSweepS - RADAR_TIME_EPS_S;
}

/**
 * 1 ステップ: 掃引の時でなければ何もせず false。掃引の時は (fromX, fromY)（自艇）から t の 0〜n − 1 を見て輝点を全部置き直し、出来事を数えて true。
 * 次の掃引は sweep_s の次の倍数の秒（1 ステップに 1 回まで）
 */
export function stepRadar(s: RadarState, p: RadarParams, geo: RadarGeometry, nowS: number, fromX: number, fromY: number, t: RadarTargets): boolean {
  if (!radarSweepDue(s, nowS)) return false;
  const b = s.blips;
  for (let k = 0; k < s.n; k++) {
    s.prevX[k] = b[k]!.x;
    s.prevY[k] = b[k]!.y;
  }
  s.prevN = s.n;
  s.n = 0;
  const clutter2 = p.landClutterM * p.landClutterM;
  const step = p.positionStepM;
  for (let i = 0; i < t.n; i++) {
    const kind = t.kind[i]!;
    if (t.afloat[i] !== 1 || (kind === RADAR_KIND_AIR && !p.aircraft)) continue;
    const x = t.x[i]!;
    const y = t.y[i]!;
    if (!(x >= 0 && x <= geo.width && y >= 0 && y <= geo.height)) continue;
    const dx = x - fromX;
    const dy = y - fromY;
    if (dx * dx + dy * dy > (kind === RADAR_KIND_SMALL ? p.smallRange2 : p.shipRange2)) continue;
    if (clutter2 > 0 && landDist2(geo.land, x, y) < clutter2) continue;
    const rx = Math.round(x / step) * step;
    const ry = Math.round(y / step) * step;
    insertBlip(s, rx, ry, (rx - fromX) * (rx - fromX) + (ry - fromY) * (ry - fromY));
  }
  for (let k = 0; k < RADAR_BLIP_CAPACITY; k++) {
    const q = b[k]!;
    if (k < s.n) q.atS = nowS;
    else q.x = q.y = q.atS = NaN;
  }
  s.sweeps++;
  s.lastSweepS = nowS;
  s.fromX = fromX;
  s.fromY = fromY;
  s.nearestM = s.n > 0 ? Math.sqrt(s.d2[0]!) : NaN;
  if (s.n > 0 && Number.isNaN(s.firstS)) {
    s.firstS = nowS;
    s.firstX = b[0]!.x;
    s.firstY = b[0]!.y;
    s.firstFromX = fromX;
    s.firstFromY = fromY;
  } else if (s.n > s.prevN) {
    const k = newestBlip(s);
    s.newCount++;
    s.newX = b[k]!.x;
    s.newY = b[k]!.y;
  } else if (s.n < s.prevN) {
    const j = lostBlip(s);
    s.lostCount++;
    s.lostX = s.prevX[j]!;
    s.lostY = s.prevY[j]!;
  }
  s.nextSweepS = (Math.floor((nowS + RADAR_TIME_EPS_S) / p.sweepS) + 1) * p.sweepS;
  return true;
}

/** 輝点の薄れの進み（0＝置いたばかり・1＝掃引の間が過ぎた。使っていない枠は NaN）。見た目の曲線と段は S2 の config/radar-art-config */
export function radarAge01(atS: number, nowS: number, sweepS: number): number {
  const a = (nowS - atS) / sweepS;
  return a < 0 ? 0 : a > 1 ? 1 : a;
}

/** 近い順に差し込む（同じ格子はもうあれば足さない。16 で満ちていれば一番遠いものより近い時だけ入れ替える。等しい距離は先に来た物が前） */
function insertBlip(s: RadarState, x: number, y: number, d2: number): void {
  const b = s.blips;
  for (let k = 0; k < s.n; k++) if (b[k]!.x === x && b[k]!.y === y) return;
  let k = s.n;
  if (k < RADAR_BLIP_CAPACITY) s.n++;
  else if (d2 < s.d2[RADAR_BLIP_CAPACITY - 1]!) k = RADAR_BLIP_CAPACITY - 1;
  else return;
  for (; k > 0 && s.d2[k - 1]! > d2; k--) {
    b[k]!.x = b[k - 1]!.x;
    b[k]!.y = b[k - 1]!.y;
    s.d2[k] = s.d2[k - 1]!;
  }
  b[k]!.x = x;
  b[k]!.y = y;
  s.d2[k] = d2;
}

/** 今の輝点のうち、前の掃引の一番近い輝点までが一番遠いもの（前が無ければ 0＝一番近い輝点） */
function newestBlip(s: RadarState): number {
  let best = 0;
  let bestD2 = -1;
  for (let k = 0; k < s.n; k++) {
    const q = s.blips[k]!;
    let m = Infinity;
    for (let j = 0; j < s.prevN; j++) {
      const dx = q.x - s.prevX[j]!;
      const dy = q.y - s.prevY[j]!;
      if (dx * dx + dy * dy < m) m = dx * dx + dy * dy;
    }
    if (m > bestD2) {
      bestD2 = m;
      best = k;
    }
  }
  return best;
}

/** 前の掃引の輝点のうち、今の一番近い輝点までが一番遠いもの（今が無ければ 0） */
function lostBlip(s: RadarState): number {
  let best = 0;
  let bestD2 = -1;
  for (let j = 0; j < s.prevN; j++) {
    let m = Infinity;
    for (let k = 0; k < s.n; k++) {
      const dx = s.blips[k]!.x - s.prevX[j]!;
      const dy = s.blips[k]!.y - s.prevY[j]!;
      if (dx * dx + dy * dy < m) m = dx * dx + dy * dy;
    }
    if (m > bestD2) {
      bestD2 = m;
      best = j;
    }
  }
  return best;
}
