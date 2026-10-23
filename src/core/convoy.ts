// 味方の大発の輸送隊（v0.6.4。jp_01「夜の輸送護衛」。docs/02 §6.4、spec §C.7）: 先頭の出発点から針路のまま 7 kt の単縦陣で進み、中心が上陸線（landingX）を針路の先へ越えたら上陸（到達）。
// v0.6.4 実機 1 回目（「何もない海の真ん中で消えていく」）: 浜（ConvoyParams.beach）のある隊は、転舵の x から自分の上陸地点へ向かい、浜の線に着いたら上陸して浜に残る（opt-in。無ければ上陸線のまま）。
// 散らない・撃ち返さない・岸へ逃げない・夜明け後も進む（v0.6.4）。被害は HP だけ（火災・機関は持たない）: 米PT の掃射の着弾は core/pt-boats が PtCheck.targets で船体に当て、世界が hitConvoyBarge を呼ぶ。
// 敵の大発（core/barges。us_03）とは別の段階＝航行中・上陸・沈没の 3 つだけ。Phaser 非依存・毎ステップ確保しない・乱数を引かない（先頭の揺らぎは core/night の bargeLeadDx）。data の読み出しと検査は convoy-data.ts。
import type { BoatState } from './boat-motion';
import { bearingDeg, steerShip } from './ship-ai';
import { degToRad } from './units';

export const CV_SAILING = 0;
export const CV_ARRIVED = 1;
export const CV_SUNK = 2;

export interface ConvoyBarge extends BoatState {
  phase: number;
  hp: number;
  /** 受けた命中の数（Result の「大発の被弾」は ConvoyState.hitsTaken） */
  hits: number;
  /** 浜（ConvoyParams.beach）のある隊だけ: 0 航路を進む・1 浜の上陸地点へ向かう（浜の無い隊は 0 のまま） */
  leg: number;
}

/** 浜へ上陸する隊（v0.6.4 実機 1 回目。opt-in: 無ければ上陸線 landingX を越えた所で上陸＝v0.6.4 のまま）: 隻ごとの上陸地点 (x[i], y) と、航路から浜へ向かう転舵の x（turnX[i]）、転舵から浜までの道のり m */
export interface ConvoyBeach {
  x: readonly number[];
  y: number;
  /** 岸の線（海域の南の縁。上陸地点の印を描く） */
  shoreY: number;
  turnX: readonly number[];
  runInM: number;
}

export interface ConvoyParams {
  count: number;
  /** 1 隻の HP（missions_seed の convoy.barge_hp。PT の砲の damage 4 で 12 なら 3 発） */
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
  /** 上陸線の x（beach が無いとき。針路の先＝東向きなら東へ中心が越えたら上陸）／上陸地点の中心の x（beach があるとき） */
  landingX: number;
  /** 上陸のノルマ（任務の達成に要る隻数） */
  quota: number;
  /** 浜（無ければ landingX の線で上陸） */
  beach?: ConvoyBeach;
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

/** HUD に渡す輸送隊の状態（systems/convoy-telemetry が毎フレーム中身だけ書く。輸送隊の無い任務は enabled false のまま。core/pt-state の PtTelemetry と同じ形） */
export interface ConvoyTelemetry {
  enabled: boolean;
  /** 隻数・航行中・上陸・沈没、決着（みな上陸か沈没） */
  total: number; afloat: number; arrived: number; sunk: number; resolved: boolean;
  /** 最も遅れた航行中の大発から浜（上陸地点）まで m。浜の無い隊は上陸線までの x の差（無ければ 0。「浜まで N m」） */
  leftM: number;
  /** 自艇から最寄りの航行中の大発へ（m。無ければ NaN）とその距離 m（端の矢印・離脱の尾。平方根は 1 フレーム 1 回） */
  nearestDx: number; nearestDy: number; nearestM: number;
  /** 米PT の来る方角（出撃時に 1 回。Briefing の敵と同じ「東」） */
  fromDirJa: string;
}

export function createConvoyTelemetry(): ConvoyTelemetry {
  return { enabled: false, total: 0, afloat: 0, arrived: 0, sunk: 0, resolved: false, leftM: 0, nearestDx: NaN, nearestDy: NaN, nearestM: NaN, fromDirJa: '' };
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
    barges.push({ x: p.leadX - Math.sin(h) * off, y: p.leadY + Math.cos(h) * off, headingDeg: p.headingDeg, speedMps: p.speedMps, phase: CV_SAILING, hp: p.hp, hits: 0, leg: 0 });
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
  if (p.beach) {
    stepConvoyBeach(f, p, p.beach, ux, dt, ev);
    return;
  }
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

/** 浜のある隊: 航路を針路のまま進み、転舵の x を越えたら自分の上陸地点へ向かい（atan2 は向かう間だけ 1 隻 1 回）、浜の線（beach.y）に着いたら上陸。南の縁が岸なのは convoy-data の検査が持つ */
function stepConvoyBeach(f: ConvoyState, p: ConvoyParams, bp: ConvoyBeach, ux: number, dt: number, ev: ConvoyEvents): void {
  for (let i = 0; i < f.barges.length; i++) {
    const b = f.barges[i]!;
    if (b.phase !== CV_SAILING) continue;
    if (b.leg === 0 && (b.x - bp.turnX[i]!) * ux >= 0) b.leg = 1;
    steerShip(b, b.leg === 1 ? bearingDeg(b.x, b.y, bp.x[i]!, bp.y) : p.headingDeg, p.speedMps, p.turnRateDegS, p.accelMps2, dt);
    if (b.leg === 1 && b.y >= bp.y) {
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

/** 最も遅れた航行中の大発から浜（上陸地点）までの道のり m（HUD の「浜まで N m」の元。航行中の大発が無ければ 0）。浜の無い隊は上陸線までの航路に沿った x の差（平方根なし） */
export function convoyLeftM(f: ConvoyState, p: ConvoyParams): number {
  if (p.beach) return convoyBeachLeftM(f, p, p.beach);
  const i = convoyTailIndex(f, p);
  if (i < 0) return 0;
  const left = (p.landingX - f.barges[i]!.x) * alongSign(p);
  return left > 0 ? left : 0;
}

/** 浜のある隊: 航行中の大発のうち浜までの道のりが最も長いもの m（航路の上は転舵までの x の差 + 転舵から浜、浜へ向かっている大発は上陸地点までの直線＝平方根は向かっている隻だけ） */
function convoyBeachLeftM(f: ConvoyState, p: ConvoyParams, bp: ConvoyBeach): number {
  const ux = alongSign(p);
  let worst = 0;
  for (let i = 0; i < f.barges.length; i++) {
    const b = f.barges[i]!;
    if (b.phase !== CV_SAILING) continue;
    let left: number;
    if (b.leg === 0) left = Math.max(0, (bp.turnX[i]! - b.x) * ux) + bp.runInM;
    else {
      const dx = bp.x[i]! - b.x;
      const dy = bp.y - b.y;
      left = Math.sqrt(dx * dx + dy * dy);
    }
    if (left > worst) worst = left;
  }
  return worst;
}
