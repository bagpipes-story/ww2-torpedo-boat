// 夜明けの空襲（v0.6.1）の読み出し: 機の姿勢（自艇からの相対）、HUD の脅威と印の機、波の合間の秒、艇の見越し（直進か円弧）。
// core/air-strike から分けた（300 行を超えないため）。Phaser 非依存・確保しない。使う側は core/air-strike から import する。
import type { BoatState } from './boat-motion';
import type { AircraftPose } from './friendly';
import { AIR_STRIKE_FADE_S, AS_DONE, AS_IDLE, AS_INBOUND, AS_LEAVING, AS_ORBIT, AS_OUTBOUND, AS_RUN, AS_T_FALLING, AS_T_INBOUND, AS_T_NONE, AS_T_ORBIT, AS_T_REST, AS_T_RUN, type AirStrikeParams, type AirStrikeState } from './air-strike-state';
import { degToRad, wrapDeg360 } from './units';

/** 全機が終わった（去り終えた） */
export function allDone(s: AirStrikeState): boolean {
  for (let i = 0; i < s.planes.length; i++) if (s.planes[i]!.phase !== AS_DONE) return false;
  return true;
}

/** 落下中の爆弾がある */
export function bombInAir(s: AirStrikeState): boolean {
  for (let i = 0; i < s.bombs.length; i++) if (s.bombs[i]!.active) return true;
  return false;
}

/** 機が来ている（どれかが接近〜去る途中）か爆弾が空中（味方機を同時に来させない） */
export function airStrikeActive(s: AirStrikeState): boolean {
  if (!s.started) return false;
  for (let i = 0; i < s.planes.length; i++) {
    const ph = s.planes[i]!.phase;
    if (ph !== AS_IDLE && ph !== AS_DONE) return true;
  }
  return bombInAir(s);
}

/** HUD の脅威（AS_T_*） */
export function strikeThreat(s: AirStrikeState): number {
  if (!s.started) return AS_T_NONE;
  if (bombInAir(s)) return AS_T_FALLING;
  for (let i = 0; i < s.planes.length; i++) if (s.planes[i]!.phase === AS_RUN) return AS_T_RUN;
  for (let i = 0; i < s.planes.length; i++) if (s.planes[i]!.phase === AS_INBOUND) return AS_T_INBOUND;
  if (s.cancelled) return AS_T_NONE;
  return s.nextRun < s.totalRuns ? AS_T_ORBIT : AS_T_REST;
}

/** 「敵機」の印の機: 爆撃進路の機、無ければ次の順番の機（来ていれば）、無ければ -1（距離で選ばない） */
export function strikeFocusPlane(s: AirStrikeState, p: AirStrikeParams): number {
  for (let i = 0; i < s.planes.length; i++) if (s.planes[i]!.phase === AS_RUN) return i;
  if (!s.started || s.nextRun >= s.totalRuns) return -1;
  const i = s.nextRun % p.planes;
  const ph = s.planes[i]!.phase;
  return ph !== AS_IDLE && ph !== AS_DONE ? i : -1;
}

/** 次の波までの秒（全部落とした後だけ。それ以外は NaN） */
export function strikeRestLeftS(s: AirStrikeState, p: AirStrikeParams): number {
  if (!s.started || s.cancelled || s.nextRun < s.totalRuns || Number.isNaN(s.lastReleaseT)) return NaN;
  const left = s.lastReleaseT + p.waveRestS - s.waveT;
  return left > 0 ? left : 0;
}

/** 機 i の自艇からの相対位置・向き・濃さ（out に書いて返す。確保しない） */
export function strikePose(s: AirStrikeState, p: AirStrikeParams, i: number, out: AircraftPose): AircraftPose {
  const pl = s.planes[i]!;
  const R = p.runRadiusM;
  const ph = pl.phase;
  out.alpha = 1;
  if (ph === AS_INBOUND || ph === AS_ORBIT || ph === AS_LEAVING) {
    const b = degToRad(pl.bearingDeg);
    const r = ph === AS_ORBIT ? R : pl.r;
    out.dx = r * Math.sin(b);
    out.dy = -r * Math.cos(b);
    if (ph === AS_INBOUND) {
      out.headingDeg = wrapDeg360(pl.bearingDeg + 180);
      out.alpha = Math.min(1, pl.timerS / AIR_STRIKE_FADE_S);
    } else if (ph === AS_ORBIT) {
      out.headingDeg = wrapDeg360(pl.bearingDeg + 90);
    } else {
      out.headingDeg = pl.bearingDeg;
      out.alpha = Math.max(0, 1 - pl.timerS / p.leaveS);
    }
    return out;
  }
  if (ph === AS_RUN || ph === AS_OUTBOUND) {
    let u = pl.timerS / p.runS;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    const b = degToRad(pl.runDeg);
    const sx = R * Math.sin(b);
    const sy = -R * Math.cos(b);
    // 爆撃進路: 始点 S（旋回の位置）→ 目標（自艇 0 か僚艇）。抜ける: 投下点 E0 → 反対側の旋回の位置（−S）
    const fx = ph === AS_RUN ? sx : pl.e0x;
    const fy = ph === AS_RUN ? sy : pl.e0y;
    const tx = ph === AS_RUN ? (pl.toEscort ? s.escRelX : 0) : -sx;
    const ty = ph === AS_RUN ? (pl.toEscort ? s.escRelY : 0) : -sy;
    out.dx = fx + (tx - fx) * u;
    out.dy = fy + (ty - fy) * u;
    out.headingDeg = wrapDeg360(pl.runDeg + 180);
    return out;
  }
  out.dx = 0;
  out.dy = 0;
  out.headingDeg = 0;
  out.alpha = 0;
  return out;
}

/**
 * 艇の tGameS 後の位置（out に書く）。旋回率 |yaw| が minYawDegS 未満なら直進、以上なら今の旋回を続けた円弧
 * （w = yaw [rad/game 秒]、h1 = h + w·t: x + (s/w)(cos h − cos h1), y − (s/w)(sin h1 − sin h)）
 */
export function predictBoat(b: BoatState, yawDegS: number, tGameS: number, minYawDegS: number, out: { x: number; y: number }): void {
  const h = degToRad(b.headingDeg);
  const sp = b.speedMps;
  if (yawDegS === 0 || Math.abs(yawDegS) < minYawDegS) {
    out.x = b.x + Math.sin(h) * sp * tGameS;
    out.y = b.y - Math.cos(h) * sp * tGameS;
    return;
  }
  const w = degToRad(yawDegS);
  const h1 = h + w * tGameS;
  out.x = b.x + (sp / w) * (Math.cos(h) - Math.cos(h1));
  out.y = b.y - (sp / w) * (Math.sin(h1) - Math.sin(h));
}
