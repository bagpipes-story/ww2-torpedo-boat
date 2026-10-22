// 味方の大発の輸送隊（v0.6.4。jp_01「夜の輸送護衛」。docs/02 §6.4、spec §C.7）: 先頭の出発点から針路のまま 7 kt の単縦陣で進み、中心が上陸線（landingX）を針路の先へ越えたら上陸（到達）。
// 散らない・撃ち返さない・岸へ逃げない・夜明け後も進む（v0.6.4）。被害は HP だけ（火災・機関は持たない）: 米PT の掃射の着弾は core/pt-boats が PtCheck.targets で船体に当て、世界が hitConvoyBarge を呼ぶ。
// 敵の大発（core/barges。us_03）とは別の段階＝航行中・上陸・沈没の 3 つだけ。Phaser 非依存・毎ステップ確保しない・乱数を引かない（先頭の揺らぎは core/night の bargeLeadDx）。data の読み出しと検査は convoy-data.ts。
import type { BoatState } from './boat-motion';
import { steerShip } from './ship-ai';
import { degToRad } from './units';

export const CV_SAILING = 0;
export const CV_ARRIVED = 1;
export const CV_SUNK = 2;

export interface ConvoyBarge extends BoatState {
  phase: number;
  hp: number;
  /** 受けた命中の数（Result の「大発の被弾」は ConvoyState.hitsTaken） */
  hits: number;
}

export interface ConvoyParams {
  count: number;
  /** 1 隻の HP（missions_seed の convoy.barge_hp。PT の砲の damage 4 で 20 なら 5 発） */
  hp: number;
  /** 当たり判定の半長・半幅（実寸 × hit_scale）と、海域の縁からの余白（表示の半長。convoy-data の検査が使う） */
  halfLengthM: number;
  halfBeamM: number;
  boundsMarginM: number;
  /** 進む速さ（speed_typical_kt。game m/s）・旋回率・加速度 */
  speedMps: number;
  turnRateDegS: number;
  accelMps2: number;
  /** 先頭の出発点と針路（90 東か 270 西）、隻ごとの先頭から航路の後ろへの距離（index 順。[0] は 0） */
  leadX: number;
  leadY: number;
  headingDeg: number;
  offsetsM: readonly number[];
  /** 上陸線の x。針路の先（東向きなら東）へ中心が越えたら上陸 */
  landingX: number;
  /** 上陸のノルマ（任務の達成に要る隻数） */
  quota: number;
}

export interface ConvoyState {
  barges: ConvoyBarge[];
  arrived: number;
  sunk: number;
  /** 隊が受けた命中の合計と、最初に当たった体感秒（NaN は無し） */
  hitsTaken: number;
  firstHitS: number;
}

/** 呼ぶ側への知らせ（引数は index だけ） */
export interface ConvoyEvents {
  onArrived(i: number): void;
  onSunk(i: number): void;
}

/** 航行中（上陸も沈没もしていない）＝的になり、HUD の「大発 N 隻」に数える */
export function convoyAfloat(b: ConvoyBarge): boolean {
  return b.phase === CV_SAILING;
}

/** 出撃時に 1 回。先頭 (leadX, leadY) から針路の後ろへ offsetsM[i] ずつ（core/barges の createFlotilla と同じ置き方） */
export function createConvoy(p: ConvoyParams): ConvoyState {
  const barges: ConvoyBarge[] = [];
  const h = degToRad(p.headingDeg);
  for (let i = 0; i < p.count; i++) {
    const off = p.offsetsM[i]!;
    barges.push({ x: p.leadX - Math.sin(h) * off, y: p.leadY + Math.cos(h) * off, headingDeg: p.headingDeg, speedMps: p.speedMps, phase: CV_SAILING, hp: p.hp, hits: 0 });
  }
  return { barges, arrived: 0, sunk: 0, hitsTaken: 0, firstHitS: NaN };
}

/** 針路の先の向き（+1 東・−1 西。sin(90°) = 1・sin(270°) = −1 は丸めなしの値） */
function alongSign(p: ConvoyParams): number {
  return Math.sin(degToRad(p.headingDeg));
}

/** 固定ステップ（dt は game 秒＝time_scale 込み）: 航行中の大発を針路のまま進め、中心が上陸線を越えたら上陸（止まる・onArrived 1 回） */
export function stepConvoy(f: ConvoyState, p: ConvoyParams, dt: number, ev: ConvoyEvents): void {
  const ux = alongSign(p);
  for (let i = 0; i < f.barges.length; i++) {
    const b = f.barges[i]!;
    if (b.phase !== CV_SAILING) continue;
    steerShip(b, p.headingDeg, p.speedMps, p.turnRateDegS, p.accelMps2, dt);
    if ((b.x - p.landingX) * ux >= 0) {
      b.phase = CV_ARRIVED;
      b.speedMps = 0;
      f.arrived++;
      ev.onArrived(i);
    }
  }
}

/** 掃射の 1 命中（damage は PT の砲の damage）。航行中でなければ当たらない（false）。HP が尽きた命中で沈没（止まる・onSunk 1 回）＝true */
export function hitConvoyBarge(f: ConvoyState, i: number, damage: number, nowS: number, ev: ConvoyEvents): boolean {
  const b = f.barges[i]!;
  if (b.phase !== CV_SAILING) return false;
  b.hits++;
  f.hitsTaken++;
  if (Number.isNaN(f.firstHitS)) f.firstHitS = nowS;
  b.hp -= damage;
  if (b.hp > 0) return false;
  b.hp = 0;
  b.phase = CV_SUNK;
  b.speedMps = 0;
  f.sunk++;
  ev.onSunk(i);
  return true;
}

/** 決着（みな上陸か沈没）。帰投の呼びかけ「大発 上陸 k/n ・ 帰投せよ」の条件 */
export function convoyResolved(f: ConvoyState): boolean {
  return f.arrived + f.sunk >= f.barges.length;
}

/** 航行中の大発のうち (x, y) に最も近いもの（距離の二乗で比較。無ければ −1） */
export function nearestConvoyBarge(f: ConvoyState, x: number, y: number): number {
  let best = -1;
  let best2 = Infinity;
  for (let i = 0; i < f.barges.length; i++) {
    const b = f.barges[i]!;
    if (b.phase !== CV_SAILING) continue;
    const d2 = (b.x - x) * (b.x - x) + (b.y - y) * (b.y - y);
    if (d2 < best2) {
      best2 = d2;
      best = i;
    }
  }
  return best;
}

/** 航行中の大発の端（針路に沿った位置が最小＝最後尾、最大＝先頭）の index。無ければ −1 */
function convoyEndIndex(f: ConvoyState, p: ConvoyParams, tail: boolean): number {
  const ux = tail ? alongSign(p) : -alongSign(p);
  let best = -1;
  let bestAlong = Infinity;
  for (let i = 0; i < f.barges.length; i++) {
    const b = f.barges[i]!;
    if (b.phase !== CV_SAILING) continue;
    const along = b.x * ux;
    if (along < bestAlong) {
      bestAlong = along;
      best = i;
    }
  }
  return best;
}

/** 航行中の最後尾（最も遅れた大発）の index。無ければ −1 */
export function convoyTailIndex(f: ConvoyState, p: ConvoyParams): number {
  return convoyEndIndex(f, p, true);
}

/** 航行中の先頭の index。無ければ −1 */
export function convoyLeadIndex(f: ConvoyState, p: ConvoyParams): number {
  return convoyEndIndex(f, p, false);
}

/** 最も遅れた航行中の大発から上陸線までの航路に沿った距離 m（x の差だけ＝平方根なし。HUD の「浜まで N m」の元。航行中の大発が無ければ 0） */
export function convoyLeftM(f: ConvoyState, p: ConvoyParams): number {
  const i = convoyTailIndex(f, p);
  if (i < 0) return 0;
  const left = (p.landingX - f.barges[i]!.x) * alongSign(p);
  return left > 0 ? left : 0;
}
