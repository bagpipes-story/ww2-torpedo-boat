// 卯月の表（scripts/landing-sim の TABLE=4。v0.6.10 S3b。spec-v0610 §6.2・レビュー H1・M2・L4・G-A7）の n 夜の集計。Phaser 非依存。表に 1 回（毎ステップではない）なので配列を作ってよい。
// 遊び方ごとに: 照らした夜 %・1 夜の照らされた斉射・卯月の砲の撃退・撃沈・弾・命中・去る PT を追って撃った弾、卯月が見張る線（guard_legs＝東）の PT の結末の分け方
// （気づかれていない斉射・自艇と戦って撃った斉射（慌てた・戦いながら）・照らされた斉射・卯月の砲・自艇の 25mm・夜明け・ほか。その PT の数あたり %。斉射が先。v0.6.10 実機 1 回目に
// 撃たずに去った（litAway）の列を外した＝照らされても PT は去らない）、自艇の 25mm が撃退か撃沈した PT（1 夜。撃った後の PT も数える＝隊の数 − 卯月の分。G-A7）・自艇の沈没 %・夜明けの前の帰投 %、卯月の船体の下を通る魚雷（斉射の種類ごとに撃った本数あたり %。照らされた斉射は慌てたに入る）、
// seed+27・+28 の 1 夜の回数、夜明け近しの帰投の輪の呼びかけ（決着の前に立った・そのとき見えなかった＝H1・見えた・聞いた夜 %）、出来事ごとの最初の seed（S5 の一致の夜を選ぶ。L4）。
import { OUT_CALM, OUT_DAWN, OUT_ENGAGED, OUT_HURRIED, OUT_LIT_HURRIED, OUT_RETIRED, OUT_SUNK, PT_SALVO_CALM, PT_SALVO_ENGAGED, PT_SALVO_HURRIED, type LandingTrial } from './landing-sim';
import type { LandingPolicy } from './landing-sim-policy';

/** 見張る線の PT の結末の分け方（表の列の順） */
export const ALLY_EAST_FATES = ['calm', 'fight', 'litSalvo', 'ally', 't38', 'dawn', 'other'] as const;
export type AllyEastFate = (typeof ALLY_EAST_FATES)[number];
/** 最初の seed を見る出来事（S5 の一致の夜。spec §7） */
export const ALLY_FIRST_EVENTS = ['retire', 'sink', 'litSalvo', 'chase'] as const;
export type AllyFirstEvent = (typeof ALLY_FIRST_EVENTS)[number];

export interface LandingAllyCell {
  policy: LandingPolicy; trials: number;
  /** 照らした夜 %、1 夜の照らされた斉射・卯月の砲の撃退・撃沈・弾・生きた PT への命中・去る PT を追って撃った弾 */
  litNightPct: number; litSalvos: number; allyRetired: number; allySunk: number; shells: number; hits: number; chaseShells: number;
  /** 見張る線の PT の結末 %（その PT の数あたり。見張る線が無ければ NaN） */
  east: Record<AllyEastFate, number>;
  /** 自艇の 25mm が撃退か撃沈した PT（1 夜）・自艇の沈没 %・夜明けの前の帰投 % */
  t38Off: number; ownSunkPct: number; homeBeforeDawnPct: number;
  /** 卯月の船体の下を通る魚雷（斉射の種類ごとに撃った本数あたり %。斉射が無ければ NaN） */
  thruCalmPct: number; thruHurriedPct: number; thruEngagedPct: number;
  /** seed+27・+28 から引いた 1 夜の回数 */
  draws27: number; draws28: number;
  /** 夜明け近しの帰投の輪の呼びかけ: 決着の前に立った・立ったとき見えなかった（接触・報告・雷跡）・見えた・聞いた夜 % */
  callPct: number; callHiddenPct: number; callShownPct: number; callObeyPct: number;
  /** 出来事ごとの最初の seed（無ければ NaN） */
  first: Record<AllyFirstEvent, number>;
}

/** 見張る線の PT i の結末 */
function eastFate(r: LandingTrial, i: number): AllyEastFate {
  const o = r.outcome[i]!;
  if (o === OUT_CALM) return 'calm';
  if (o === OUT_HURRIED || o === OUT_ENGAGED) return 'fight';
  if (o === OUT_LIT_HURRIED) return 'litSalvo';
  if (o === OUT_RETIRED || o === OUT_SUNK) return r.allyFate[i] === 1 ? 'ally' : 't38';
  if (o === OUT_DAWN) return 'dawn';
  return 'other';
}

/** rs は seedBase から順の夜、guardLegs は卯月が見張る線（卯月がいなければ空）、n は 1 斉射の本数 */
export function landingAllyCell(policy: LandingPolicy, rs: readonly LandingTrial[], seedBase: number, guardLegs: readonly number[], n: number): LandingAllyCell {
  const N = rs.length;
  const mean = (fn: (r: LandingTrial) => number): number => rs.reduce((a, r) => a + fn(r), 0) / N;
  const pct = (fn: (r: LandingTrial) => boolean): number => mean((r) => (fn(r) ? 100 : 0));
  const east = Object.fromEntries(ALLY_EAST_FATES.map((k) => [k, 0])) as Record<AllyEastFate, number>;
  let eastN = 0;
  for (const r of rs) {
    for (const i of guardLegs) {
      if (i >= r.outcome.length) continue;
      east[eastFate(r, i)]++;
      eastN++;
    }
  }
  for (const k of ALLY_EAST_FATES) east[k] = eastN > 0 ? (100 * east[k]) / eastN : NaN;
  const thru = (kind: number): number => {
    let fired = 0;
    let through = 0;
    for (const r of rs) {
      for (let i = 0; i < r.kind.length; i++) {
        if (r.kind[i] !== kind) continue;
        fired += n;
        through += r.torpThroughAlly[i]!;
      }
    }
    return fired > 0 ? (100 * through) / fired : NaN;
  };
  const t38 = (r: LandingTrial): number => r.ptRetired + r.ptSunk - r.allyRetired - r.allySunk;
  const firstOf = (fn: (r: LandingTrial) => boolean): number => {
    const k = rs.findIndex(fn);
    return k >= 0 ? seedBase + k : NaN;
  };
  return {
    policy, trials: N,
    litNightPct: pct((r) => r.allyLitPts > 0), litSalvos: mean((r) => r.litSalvos), allyRetired: mean((r) => r.allyRetired), allySunk: mean((r) => r.allySunk),
    shells: mean((r) => r.allyShells), hits: mean((r) => r.allyHits), chaseShells: mean((r) => r.chaseShells),
    east, t38Off: mean(t38), ownSunkPct: pct((r) => r.end === 'sunk'), homeBeforeDawnPct: pct((r) => r.end === 'home' && !r.dawn),
    thruCalmPct: thru(PT_SALVO_CALM), thruHurriedPct: thru(PT_SALVO_HURRIED), thruEngagedPct: thru(PT_SALVO_ENGAGED),
    draws27: mean((r) => r.draws27), draws28: mean((r) => r.draws28),
    callPct: pct((r) => !Number.isNaN(r.ringCallS)), callHiddenPct: pct((r) => r.ringCallHidden), callShownPct: pct((r) => !Number.isNaN(r.ringShownS)), callObeyPct: pct((r) => !Number.isNaN(r.ringObeyS)),
    first: {
      retire: firstOf((r) => r.allyRetired > 0), sink: firstOf((r) => r.allySunk > 0), litSalvo: firstOf((r) => r.litSalvos > 0), chase: firstOf((r) => r.chaseShells > 0),
    },
  };
}
