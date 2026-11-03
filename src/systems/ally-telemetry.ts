// 味方の駆逐艦 卯月（v0.6.10 S6。jp_04。docs/02 §6.11、spec-v0610 part 2 の S6・リードの決定 LD3・LD4・LD8）の HUD 向けテレメトリ（core/ally-telemetry の BoatTelemetry.ally）。
// mission-telemetry から呼ぶ（landing-telemetry と同じ形）。initAllyTelemetry は createTelemetry で 1 回（呼び名・帰投の輪の呼びかけ・平常の行の末尾＝出撃で決まる値）、
// refreshAllyTelemetry は毎フレーム 1 回（最後の砲の出来事が卯月か。比べるだけ＝§7: 確保しない）。卯月の無い任務・?debug&noally（揚陸の世界の ally が null）は enabled false のまま何も書かない。
// 世界は構造の型 AllyTelemetryWorld で読む（MissionWorld がそのまま満たす。MissionWorld・WorldAlly を import すると Phaser がテストの node 型検査に入るため）。
// 卯月の手柄（core/ally-destroyer の AllyCredit）は core だけが書く（LD8）。ここは読むだけ。
// v0.6.10 S7: Result の材料 allyResult（終了時に 1 回。systems/landing-telemetry の landingResultPart が LandingResult.ally に置く。構造の型 AllyResultWorld で読む）。
import type { AllyCredit } from '../core/ally-destroyer';
import { createAllyTelemetry, type AllyTelemetry } from '../core/ally-telemetry';
import { PT_OUT, type PtSection } from '../core/pt-boats';
import type { AllyResult } from '../ui/result-types';
import { FATE_BY_ALLY, gunboatFates } from './gunboat-credit';

/** テレメトリが読む世界の部分 */
export interface AllyTelemetryWorld {
  /** 揚陸の世界（systems/world-landing）の卯月（systems/world-ally の WorldAlly。core の 1 夜の状態 a の値と手柄）。卯月の無い任務・&noally は null */
  readonly landing: { readonly ally: { readonly a: { readonly p: { readonly labelJa: string; readonly ringCallBeforeDawn: boolean }; readonly credit: AllyCredit; readonly lit: Uint8Array } } | null } | null;
  readonly pts: { readonly section: PtSection } | null;
  /** 難易度（LD4: ハードは平常の行の末尾を付けない） */
  readonly setup: { readonly hard: boolean };
}

/** Result の材料が読む卯月（systems/world-ally の WorldAlly。core の 1 夜の数えと手柄） */
export interface AllyResultSource {
  readonly a: {
    readonly p: { readonly labelJa: string };
    readonly litPts: number; readonly litSalvos: number; readonly shells: number; readonly chaseShells: number;
    readonly credit: AllyCredit;
  };
}

/**
 * 終了時に 1 回だけ（v0.6.10 S7）: 卯月の Result の材料。撃退・撃沈は卯月の砲が結末を決めた PT（gunboatFates の FATE_BY_ALLY＝模擬 core/landing-trial の allyFate と同じ数え。隊の撃退・撃沈の内）、
 * 命中・制圧は手柄（hitPt の前後の差）、追って撃った弾（v0.6.10 F）は core の chaseShells。卯月の無い夜（null）は null
 */
export function allyResult(al: AllyResultSource | null | undefined, q: PtSection): AllyResult | null {
  if (!al) return null;
  const a = al.a;
  const cr = a.credit;
  const f = gunboatFates(q, cr, FATE_BY_ALLY);
  const byAlly: boolean[] = [];
  for (let i = 0; i < q.boats.length; i++) byAlly.push(cr.fateBy[i] === FATE_BY_ALLY);
  return { labelJa: a.p.labelJa, lit: a.litPts, litSalvo: a.litSalvos, shells: a.shells, chase: a.chaseShells, hits: cr.hits, retired: f.retired, sunk: f.sunk, suppressions: cr.suppressions, byAlly };
}

/** 出撃時の ally（卯月の無い任務は enabled false のまま） */
export function initAllyTelemetry(w: AllyTelemetryWorld): AllyTelemetry {
  const t = createAllyTelemetry();
  const al = w.landing ? w.landing.ally : null;
  if (!al || !w.pts) return t;
  t.enabled = true;
  t.labelJa = al.a.p.labelJa;
  t.ringCall = al.a.p.ringCallBeforeDawn;
  t.runHint = !w.setup.hard;
  refreshAllyTelemetry(t, w);
  return t;
}

/**
 * 毎フレーム 1 回（refreshPtTelemetry の後）: 隊の最後の砲の出来事（gunEventSeq）は卯月の砲が起こしたか（隼艇の gunEventByGunboat と同じ比べ方）と、
 * 卯月が照らして描いている PT がいるか（v0.6.10 F。PtSquadron.updateVisuals の「照らしている・海域の内（PT_OUT の前＝沈んだ PT は除く）」と同じ条件。数えるだけ＝確保しない）
 */
export function refreshAllyTelemetry(t: AllyTelemetry, w: AllyTelemetryWorld): void {
  if (!t.enabled) return;
  const al = w.landing ? w.landing.ally : null;
  if (!al || !w.pts) return;
  const q = w.pts.section;
  const seq = q.gunEventSeq;
  t.gunEvent = seq > 0 && al.a.credit.eventSeq === seq;
  const lit = al.a.lit;
  let shown = false;
  for (let i = 0; i < q.boats.length; i++) if (lit[i] === 1 && q.boats[i]!.phase < PT_OUT) shown = true;
  t.litShown = shown;
}
