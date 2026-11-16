// 迎撃の模擬（v0.8.0 S3。us_04。spec-v0800 §4.11、lead の L17）の台本のレーダーの読み方: 人が PPI（平面位置表示器）を読むように、掃引ごとの輝点
// （core/radar の状態そのまま＝丸めた位置だけ・どの艦かは無い）を前の掃引の航跡の予測の位置と突き合わせて自分の航跡（位置・速さ・見た回数・生まれた縁）を作る。
// 列は「出撃の後に PPI の縁（海域の縁か射程の縁）の西半分に現れて東へ速く動く輝点」（往路）・「東半分に現れて西へ」（復路）と読む（護衛は最初の掃引から映っている輝点）。近づいて近くを通る輝点
// （最接近の点が avoidM の内・avoidS 秒の内）から離れる針路も航跡だけから。艦の AI・発見・段階・本当の位置は読まない（tests/intercept-sim-a が import と名前を走査する）。
// 数は人の読み方の目安（design。ゲームの強さの値ではない）。確保は作る時（createInterceptTracks）だけ。Phaser 非依存。
import type { BoatState } from './boat-motion';
import type { RadarState } from './radar';
import { radToDeg, wrapDeg360 } from './units';

/**
 * 航跡の読み方の目安: 突き合わせの門 m・PPI の縁とみなす m・列とみなす東西の速さ（画面の m/s）・通り過ぎた m・よけ始める最接近 m・よけ終える最接近 m・
 * 近い脅威の m・見る秒・全速で急ぐ m と秒
 */
export const TRACK_READ = { gateM: 350, edgeM: 600, columnVx: 30, passedM: 300, avoidM: 700, clearM: 900, closeM: 1000, avoidS: 30, avoidFullM: 300, avoidFullS: 10 } as const;
const TRACKS = 16;

export interface InterceptTracks {
  /** 海域の幅とレーダーの艦の射程（Briefing の「レーダー 4000 m」） */
  readonly width: number;
  readonly rangeM: number;
  n: number;
  readonly x: Float64Array; readonly y: Float64Array; readonly vx: Float64Array; readonly vy: Float64Array;
  /** 見た掃引の回数（255 で止める）・生まれた側（−1 西半分・1 東半分＝出撃の後に現れた。0＝最初の掃引から映っていた）・最後に見た掃引の秒・この掃引で合った印 */
  readonly seen: Uint8Array; readonly born: Int8Array; readonly at: Float64Array; readonly hit: Uint8Array;
  /** 読んだ掃引の回数と、復路の列を一度でも読んだか */
  sweeps: number; outSeen: boolean;
}

export function createInterceptTracks(width: number, rangeM: number): InterceptTracks {
  const f = (): Float64Array => new Float64Array(TRACKS);
  return { width, rangeM, n: 0, x: f(), y: f(), vx: f(), vy: f(), seen: new Uint8Array(TRACKS), born: new Int8Array(TRACKS), at: f(), hit: new Uint8Array(TRACKS), sweeps: -1, outSeen: false };
}

/** 往路の列の航跡（後から西半分に現れて東へ）・復路の列の航跡（後から東半分に現れて西へ）。2 回以上見た航跡だけ */
export const isInTrack = (k: InterceptTracks, j: number): boolean => k.seen[j]! >= 2 && k.born[j] === -1 && k.vx[j]! > TRACK_READ.columnVx;
export const isOutTrack = (k: InterceptTracks, j: number): boolean => k.seen[j]! >= 2 && k.born[j] === 1 && k.vx[j]! < -TRACK_READ.columnVx;

/** 掃引が変わったら輝点を突き合わせる: 予測の位置から gateM の内の一番近い航跡（輝点は近い順）。合わない輝点は新しい航跡、見えなくなった航跡は消す */
export function updateTracks(k: InterceptTracks, r: RadarState): void {
  if (r.sweeps === k.sweeps) return;
  k.sweeps = r.sweeps;
  const now = r.lastSweepS;
  const g2 = TRACK_READ.gateM * TRACK_READ.gateM;
  k.hit.fill(0, 0, k.n);
  const n0 = k.n;
  for (let b = 0; b < r.n; b++) {
    const bx = r.blips[b]!.x;
    const by = r.blips[b]!.y;
    let best = -1;
    let bestD2 = g2;
    for (let j = 0; j < n0; j++) {
      if (k.hit[j] === 1) continue;
      const dt = now - k.at[j]!;
      const ex = bx - (k.x[j]! + k.vx[j]! * dt);
      const ey = by - (k.y[j]! + k.vy[j]! * dt);
      if (ex * ex + ey * ey <= bestD2) {
        bestD2 = ex * ex + ey * ey;
        best = j;
      }
    }
    if (best >= 0) {
      const dt = now - k.at[best]!;
      const w = k.seen[best] === 1 ? 1 : 0.5;
      k.vx[best] = k.vx[best]! * (1 - w) + ((bx - k.x[best]!) / dt) * w;
      k.vy[best] = k.vy[best]! * (1 - w) + ((by - k.y[best]!) / dt) * w;
      k.x[best] = bx;
      k.y[best] = by;
      k.at[best] = now;
      k.hit[best] = 1;
      if (k.seen[best]! < 255) k.seen[best]!++;
    } else if (k.n < TRACKS) {
      const j = k.n++;
      k.x[j] = bx; k.y[j] = by; k.vx[j] = 0; k.vy[j] = 0; k.seen[j] = 1; k.at[j] = now; k.hit[j] = 1;
      // 出撃の最初の掃引から映っている輝点（護衛）と、海域の中ほどで切れてまた映った輝点は列ではない。後から PPI の縁（海域の東西の縁か
      // レーダーの射程の縁）に現れた輝点は、現れた側（海域の西半分か東半分）で読む
      const e = TRACK_READ.edgeM;
      const rim = bx < e || bx > k.width - e || (bx - r.fromX) ** 2 + (by - r.fromY) ** 2 > (k.rangeM - e) ** 2;
      k.born[j] = r.sweeps <= 1 || !rim ? 0 : bx < k.width / 2 ? -1 : 1;
    }
  }
  let m = 0;
  for (let j = 0; j < k.n; j++) {
    if (k.hit[j] !== 1) continue;
    k.x[m] = k.x[j]!; k.y[m] = k.y[j]!; k.vx[m] = k.vx[j]!; k.vy[m] = k.vy[j]!; k.seen[m] = k.seen[j]!; k.born[m] = k.born[j]!; k.at[m] = k.at[j]!; k.hit[m] = 1;
    if (isOutTrack(k, m)) k.outSeen = true;
    m++;
  }
  k.n = m;
}

/** 列の道の y（その向きの航跡の平均）と先頭の添字（往路は一番東・復路は一番西）。無ければ y NaN・lead −1 */
export function trackLane(k: InterceptTracks, out: boolean, o: { y: number; lead: number }): void {
  let s = 0;
  let c = 0;
  o.lead = -1;
  for (let j = 0; j < k.n; j++) {
    if (!(out ? isOutTrack(k, j) : isInTrack(k, j))) continue;
    s += k.y[j]!;
    c++;
    if (o.lead < 0 || (out ? k.x[j]! < k.x[o.lead]! : k.x[j]! > k.x[o.lead]!)) o.lead = j;
  }
  o.y = c > 0 ? s / c : NaN;
}

/** (x, y) の matchM の内に kind（1 往路・2 復路・0 どれでも）の航跡がある（今の秒へ速さで進めた位置）。目で見えた艦が列の艦か、の人の読み */
export function trackNear(k: InterceptTracks, x: number, y: number, t: number, kind: number, matchM: number): boolean {
  for (let j = 0; j < k.n; j++) {
    if ((kind === 1 && !isInTrack(k, j)) || (kind === 2 && !isOutTrack(k, j))) continue;
    const age = t - k.at[j]!;
    const dx = k.x[j]! + k.vx[j]! * age - x;
    const dy = k.y[j]! + k.vy[j]! * age - y;
    if (dx * dx + dy * dy <= matchM * matchM) return true;
  }
  return false;
}

/** 一番近い航跡までの 2 乗の m（無ければ Infinity）。帰り道を静音にするかの人の読み */
export function trackNearest2(k: InterceptTracks, b: BoatState, t: number): number {
  let best = Infinity;
  for (let j = 0; j < k.n; j++) {
    const age = t - k.at[j]!;
    const dx = k.x[j]! + k.vx[j]! * age - b.x;
    const dy = k.y[j]! + k.vy[j]! * age - b.y;
    if (dx * dx + dy * dy < best) best = dx * dx + dy * dy;
  }
  return best;
}

/** 復路の列が自艇の西へ passedM 過ぎた（東に復路の航跡が残っていない） */
export function columnPassed(k: InterceptTracks, b: BoatState): boolean {
  for (let j = 0; j < k.n; j++) if (isOutTrack(k, j) && k.x[j]! > b.x - TRACK_READ.passedM) return false;
  return true;
}

/**
 * 近づく航跡から離れる針路（無ければ h NaN）。2 つの読み（自艇は止まっているとして読む＝人が「あの接触は今の自艇のどれだけ近くを通るか」を見る形。自艇の動きで脅威が点滅しない）:
 * 道の脅威＝最接近が limitM の内で avoidS 秒の内（最接近の点から自艇への向き＝道から直角に離れる。真っ直ぐ来るなら航跡の向きの直角）、
 * 近い脅威＝closeM の内で近づいている（接触から真っ直ぐ離れる。向きを変えている護衛は直線の最接近では読めない）。一番急ぐ（会うまでの秒が短い）物を選ぶ。
 * skip: 0 なし・1 往路の列・2 復路の列は数えない。t は今の秒（航跡は最後の掃引から速さで進める）。full は急ぐ時（会うまで avoidFullS 秒の内で avoidFullM の内）
 */
export function trackAvoid(k: InterceptTracks, b: BoatState, t: number, skip: number, limitM: number, o: { h: number; full: boolean }): void {
  const R = TRACK_READ;
  let bestT: number = R.avoidS;
  o.h = NaN;
  o.full = false;
  for (let j = 0; j < k.n; j++) {
    if (k.seen[j]! < 2 || (skip === 1 && isInTrack(k, j)) || (skip === 2 && isOutTrack(k, j))) continue;
    const age = t - k.at[j]!;
    const rx = k.x[j]! + k.vx[j]! * age - b.x;
    const ry = k.y[j]! + k.vy[j]! * age - b.y;
    const vx = k.vx[j]!;
    const vy = k.vy[j]!;
    const v2 = vx * vx + vy * vy;
    const r2 = rx * rx + ry * ry;
    const tc = v2 > 1 ? -(rx * vx + ry * vy) / v2 : -1;
    if (!(tc > 0)) continue;
    const cx = rx + vx * tc;
    const cy = ry + vy * tc;
    const c2 = cx * cx + cy * cy;
    const path = tc < bestT && c2 < limitM * limitM;
    const close = r2 < R.closeM * R.closeM;
    if (!path && !close) continue;
    // 会うまでの秒: 道の脅威は最接近の秒、近い脅威は距離 ÷ 近づく速さ
    const meet = path ? tc : r2 / -(rx * vx + ry * vy);
    if (!(meet < bestT)) continue;
    bestT = meet;
    o.full = meet < R.avoidFullS && (path ? c2 : r2) < R.avoidFullM * R.avoidFullM;
    o.h = path && c2 > 1 ? wrapDeg360(radToDeg(Math.atan2(-cx, cy))) : close ? wrapDeg360(radToDeg(Math.atan2(-rx, ry))) : wrapDeg360(radToDeg(Math.atan2(vy, vx)));
  }
}
