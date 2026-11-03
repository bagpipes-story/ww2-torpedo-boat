// 味方の駆逐艦 卯月（v0.6.10 S6。jp_04。docs/02 §6.11、spec-v0610 part 2 の S6・リードの決定 LD3・LD4・LD8）の HUD 向けテレメトリ（core/ally-telemetry の BoatTelemetry.ally）。
// mission-telemetry から呼ぶ（landing-telemetry と同じ形）。initAllyTelemetry は createTelemetry で 1 回（呼び名・帰投の輪の呼びかけ・平常の行の末尾＝出撃で決まる値）、
// refreshAllyTelemetry は毎フレーム 1 回（最後の砲の出来事が卯月か。比べるだけ＝§7: 確保しない）。卯月の無い任務・?debug&noally（揚陸の世界の ally が null）は enabled false のまま何も書かない。
// 世界は構造の型 AllyTelemetryWorld で読む（MissionWorld がそのまま満たす。MissionWorld・WorldAlly を import すると Phaser がテストの node 型検査に入るため）。
// 卯月の手柄（core/ally-destroyer の AllyCredit）は core だけが書く（LD8）。ここは読むだけ。
import type { AllyCredit } from '../core/ally-destroyer';
import { createAllyTelemetry, type AllyTelemetry } from '../core/ally-telemetry';
import type { PtSection } from '../core/pt-boats';

/** テレメトリが読む世界の部分 */
export interface AllyTelemetryWorld {
  /** 揚陸の世界（systems/world-landing）の卯月（systems/world-ally の WorldAlly。core の 1 夜の状態 a の値と手柄）。卯月の無い任務・&noally は null */
  readonly landing: { readonly ally: { readonly a: { readonly p: { readonly labelJa: string; readonly ringCallBeforeDawn: boolean }; readonly credit: AllyCredit } } | null } | null;
  readonly pts: { readonly section: PtSection } | null;
  /** 難易度（LD4: ハードは平常の行の末尾を付けない） */
  readonly setup: { readonly hard: boolean };
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

/** 毎フレーム 1 回（refreshPtTelemetry の後）: 隊の最後の砲の出来事（gunEventSeq）は卯月の砲が起こしたか（隼艇の gunEventByGunboat と同じ比べ方） */
export function refreshAllyTelemetry(t: AllyTelemetry, w: AllyTelemetryWorld): void {
  if (!t.enabled) return;
  const al = w.landing ? w.landing.ally : null;
  if (!al || !w.pts) return;
  const seq = w.pts.section.gunEventSeq;
  t.gunEvent = seq > 0 && al.a.credit.eventSeq === seq;
}
