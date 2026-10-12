// 敵の水上機の照明弾と落下中の爆弾（v0.4.1。seaplane.ts から分けた）。段階と独立に毎ステップ進む（機が去った後も着弾・照明は続く）。
// 狙いは爆撃進路に入った瞬間の艇の速度で決める（進入から着弾までの見越し点 ＋ 一様円盤の散布。gunnery の dispersion と同じ模型。乱数は seed+5 の系列）。
// 進入の後に転舵か減速をすれば外れる（「爆撃進路！ 転舵でかわせ」）。投下の後でも 1 秒以内の転舵なら外れる。確保しない。
import type { BoatState } from './boat-motion';
import { pointNearBoat } from './gunnery';
import type { SeededRng } from './rng';
import type { SeaplaneParams } from './seaplane-data';
import { degToRad, wrapDeg180 } from './units';

/** 転舵の KPI: 投下時の針路からこれだけ変われば「転舵した」 */
export const DODGE_TURN_DEG = 20;

export interface BombState {
  active: boolean;
  fromX: number;
  fromY: number;
  aimX: number;
  aimY: number;
  leftS: number;
  hit: boolean;
  /** 狙いを決めた（爆撃進路に入った）ときの艇の針路、それからの秒、転舵（DODGE_TURN_DEG）までの秒（しなければ NaN）。KPI */
  aimed: boolean;
  aimHeadingDeg: number;
  aimedS: number;
  dodgeReactS: number;
}

export interface FlareState {
  leftS: number;
  x: number;
  y: number;
  /** 燃えていて艇が光の中 */
  lit: boolean;
  litS: number;
  /** 光の中にいる間に駆逐艦が撃った砲弾の数（KPI） */
  shellsUnderFlare: number;
}

export interface Ordnance {
  bombsLeft: number;
  bombsDropped: number;
  bombsHit: number;
  bombDamage: number;
  bombs: BombState[];
  /** 直近に着弾した爆弾の index */
  lastImpact: number;
  flare: FlareState;
  lastShellsFired: number;
}

export function createOrdnance(p: SeaplaneParams): Ordnance {
  const bombs: BombState[] = [];
  for (let i = 0; i < p.bombCount; i++)
    bombs.push({
      active: false,
      fromX: 0,
      fromY: 0,
      aimX: 0,
      aimY: 0,
      leftS: 0,
      hit: false,
      aimed: false,
      aimHeadingDeg: 0,
      aimedS: 0,
      dodgeReactS: NaN,
    });
  return {
    bombsLeft: p.bombCount,
    bombsDropped: 0,
    bombsHit: 0,
    bombDamage: 0,
    bombs,
    lastImpact: -1,
    flare: { leftS: 0, x: 0, y: 0, lit: false, litS: 0, shellsUnderFlare: 0 },
    lastShellsFired: 0,
  };
}

/** 照明弾を艇の位置に置く */
export function dropFlare(o: Ordnance, p: SeaplaneParams, boat: BoatState): void {
  o.flare.x = boat.x;
  o.flare.y = boat.y;
  o.flare.leftS = p.flareDurationS;
}

/** 爆撃進路に入った: 次の爆弾の狙点を決める（艇の今の速度 × bombLeadGameS の見越し点 ＋ 散布。rng から 2 回） */
export function aimBomb(o: Ordnance, p: SeaplaneParams, boat: BoatState, rng: SeededRng): void {
  const b = o.bombs[o.bombsDropped]!;
  const h = degToRad(boat.headingDeg);
  const r = p.bombScatterM * Math.sqrt(rng.next());
  const th = 2 * Math.PI * rng.next();
  b.aimX = boat.x + Math.sin(h) * boat.speedMps * p.bombLeadGameS + r * Math.cos(th);
  b.aimY = boat.y - Math.cos(h) * boat.speedMps * p.bombLeadGameS + r * Math.sin(th);
  b.aimed = true;
  b.aimHeadingDeg = boat.headingDeg;
  b.aimedS = 0;
  b.dodgeReactS = NaN;
}

/** 爆弾の投下（真上。bombsLeft > 0 のとき。狙点は aimBomb で決めてある） */
export function releaseBomb(o: Ordnance, p: SeaplaneParams, boat: BoatState): void {
  const b = o.bombs[o.bombsDropped]!;
  b.active = true;
  b.fromX = boat.x;
  b.fromY = boat.y;
  b.leftS = p.bombFallFeelS;
  b.hit = false;
  o.bombsDropped++;
  o.bombsLeft--;
}

/** 照明弾: 燃えていて艇が光の中なら lit。その間の砲撃数（shellsFired の累計の差分）を数える */
export function stepFlare(o: Ordnance, p: SeaplaneParams, boat: BoatState, shellsFired: number, dt: number): void {
  const f = o.flare;
  if (f.leftS > 0) {
    f.leftS -= dt;
    const dx = boat.x - f.x;
    const dy = boat.y - f.y;
    f.lit = f.leftS > 0 && dx * dx + dy * dy <= p.flareRadius2;
    if (f.lit) {
      f.litS += dt;
      f.shellsUnderFlare += shellsFired - o.lastShellsFired;
    }
  } else {
    f.lit = false;
  }
  o.lastShellsFired = shellsFired;
}

/** 狙いを決めてから着弾までの転舵の KPI と、落下中の爆弾の着弾（艇が沈没中なら当てない）。着弾があれば true（lastImpact にその index） */
export function stepBombs(o: Ordnance, p: SeaplaneParams, boat: BoatState, boatSinking: boolean, dt: number): boolean {
  let impact = false;
  for (let i = 0; i < o.bombs.length; i++) {
    const b = o.bombs[i]!;
    if (b.aimed) {
      b.aimedS += dt;
      if (Number.isNaN(b.dodgeReactS) && Math.abs(wrapDeg180(boat.headingDeg - b.aimHeadingDeg)) >= DODGE_TURN_DEG) b.dodgeReactS = b.aimedS;
    }
    if (!b.active) continue;
    b.leftS -= dt;
    if (b.leftS > 0) continue;
    b.active = false;
    b.aimed = false;
    b.hit = !boatSinking && pointNearBoat(b.aimX, b.aimY, boat, p.boatHalfLengthM, p.bombHitRadiusM);
    if (b.hit) {
      o.bombsHit++;
      o.bombDamage += p.bombHit.damage;
    }
    o.lastImpact = i;
    impact = true;
  }
  return impact;
}

export function bombInAir(o: Ordnance): boolean {
  for (let i = 0; i < o.bombs.length; i++) if (o.bombs[i]!.active) return true;
  return false;
}
