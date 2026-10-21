// 米PT の航過の射撃と終わり（v0.6.3 実機 2 回目。docs/02 §6.4、spec r2 §D.2-9）: core/pt-boats の stepPass をそのまま移した（pt-boats が 300 行を超えないため）。
// 撃つのは航過中の 1 隻だけ・予告から open_fire_s 後。航過は 最大秒・後ろへ抜けた・海域の縁 で終わる。
// v0.6.3 実機 2 回目（赤い線は危ない間だけ）: 撃ち切った航過（撃退で黙った PT は今どおり線のまま抜ける）と、open_fire_s の後に有効射程の外へ離れていく航過も終える。
// Phaser 非依存・確保しない。乱数は seed+18 の系列だけ（1 発 2 回。launchShell の散布）。使う側は core/pt-boats だけ（ここを import するのは pt-boats）。
import type { BoatState } from './boat-motion';
import type { PtParams } from './pt-data';
import { inDeadCone, nearEdge } from './pt-pass';
import { endPass } from './pt-pass-end';
import { PT_FATE_NONE, type PtBoatState, type PtCheck, type PtEvents, type PtSection } from './pt-state';
import type { SeededRng } from './rng';
import { findFreeShell, launchShell } from './shells';
import { losBlocked } from './smoke';
import { degToRad } from './units';

/**
 * 航過の 1 ステップ（操舵の後）: 撃つのは航過中の 1 隻だけ、予告から open_fire_s 後・捉えていて・艇が的で・煙幕に遮られず・残り弾あり・近すぎず・
 * 有効射程と視程の内・艇首尾の円錐の外。間隔は負の残りを繰り越す（barges と同じ）。1 発ごとに今の艇の速度で直線の見越し（乱数 2 回）。
 * 後ろへ抜けた（有効射程の外か艇尾の円錐）・最大秒・海域の縁で終わる。p.passEndsWhenSafe なら、撃ち切った（弾 0・撃った・結末なし）か
 * open_fire_s の後に有効射程の外で離れていく（艇の速度 − PT の速度が PT から艇への向きに正）ときも終わる（どちらも回数に数える航過。平方根なし）
 */
export function stepPass(q: PtSection, p: PtParams, c: PtCheck, b: PtBoatState, i: number, vpx: number, vpy: number, rng: SeededRng, feelDt: number, ev: PtEvents): void {
  const boat = c.boat;
  const g = p.gun;
  const eff2 = g.effectiveM * g.effectiveM;
  const dx = boat.x - b.x;
  const dy = boat.y - b.y;
  const d2 = dx * dx + dy * dy;
  const r = degToRad(b.headingDeg);
  const hx = Math.sin(r);
  const hy = -Math.cos(r);
  const cone = inDeadCone(hx, hy, dx, dy, d2, p.cosDead2);
  const cd = Math.max(b.cooldownS - feelDt, -feelDt);
  b.cooldownS = cd;
  const canFire = i === q.owner && b.timerS >= p.openFireS && q.detected && c.targetValid && b.roundsLeft > 0 && d2 >= p.minRange2 && d2 <= eff2 && d2 <= c.visRange2 && !cone && !smokeBlocked(c, b);
  if (!canFire) {
    if (cd < 0) b.cooldownS = 0;
  } else if (cd <= 0) {
    const s = findFreeShell(q.shells);
    if (s) {
      b.cooldownS = cd + 60 / (g.roundsPerMinPerGun * g.count);
      launchShell(s, b.x, b.y, boat.x, boat.y, vpx, vpy, g.shellSpeedMps, Math.max(p.spreadMinM, (g.dispersionM * Math.sqrt(d2)) / g.effectiveM), i, rng);
      b.roundsLeft--;
      if (b.firedThisPass === 0) q.minWarnS = Math.min(q.minWarnS, c.timeS - q.commitAtS);
      b.firedThisPass++;
      q.shots++;
      ev.onFire(i, b.x, b.y);
    }
  }
  // 後ろへ抜けたかは固めた針路で見る（v0.6.3 実機 1 回目の守りの直し: 今の針路だと、固めた線へ向き直る途中の PT が 1 ステップで航過を終えうる）。艇首尾の円錐は今の針路のまま
  const lr = degToRad(b.lockDeg);
  const dot = Math.sin(lr) * dx - Math.cos(lr) * dy;
  // 縁は海域の外へ出る手前（絵の半長）で終える（v0.6.3 レビュー: edge_margin_m で終えると、縁にいる艇へ固めた航過が撃つ前に終わった）
  // 危ない間だけ（v0.6.3 実機 2 回目）: 撃ち切った（撃退で黙った PT は線のまま抜ける）・open_fire_s の後に有効射程の外へ離れていく
  const spent = p.passEndsWhenSafe && b.roundsLeft === 0 && b.firedThisPass > 0 && b.fate === PT_FATE_NONE;
  const opening = p.passEndsWhenSafe && b.timerS >= p.openFireS && d2 > eff2 && dx * (vpx - hx * b.speedMps) + dy * (vpy - hy * b.speedMps) > 0;
  if (b.timerS >= p.passMaxS || spent || opening || (dot < 0 && (d2 > eff2 || cone)) || nearEdge(b.x, b.y, p.bounds, p.boundsMarginM)) endPass(q, p, b, i, ev);
}

/** PT と艇の間の線が煙幕に遮られている（煙幕の無い艇では常に false） */
export function smokeBlocked(c: PtCheck, b: BoatState): boolean {
  return c.smoke !== null && c.smokeParams !== null && losBlocked(c.smoke, c.smokeParams, b.x, b.y, c.boat.x, c.boat.y);
}
