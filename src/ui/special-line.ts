// 上中央の 2 行目の「特別の行」の振り分け（v0.6.11 S5。spec-v0611-r2 §10.1 の M13: ui/mission-line の landingLine の呼び出しをこれに替えて差し引き 0 行）:
// 空襲下の退避（jp_03。モード MISSION_EVAC の中の行は ui/evac-lines）と、停泊して揚陸する輸送船（jp_04。ui/landing-lines。揚陸の無い任務とほかのモードは null）。
// 揚陸の 2 行目の末尾（landingPassTailJa）も mission-line の import の 1 行のままここから出し直す。Phaser・DOM を読まない（文を組むだけ）。
// v0.8.0 S4: 海峡の夜（us_04）のレーダーの出来事と衝突の危険（モード 39・40。文は ui/strait-lines、時計は pt-line-clock の strait＝ui/strait-line-clock。ほかの任務にこのモードは無い）。v0.8.1 S4: 止まった艦の出来事（41。ui/anchor-lines）。v0.8.2 S4: 報告の任務の出来事と常の文（42・43。ui/recon-texts）。
import type { BoatTelemetry } from '../core/boat-motion';
import { evacLine } from './evac-lines';
import type { HudLine } from './hud-lines';
import { landingLine, type LandingEventView } from './landing-lines';
import { MISSION_ANCHOR_EVENT, MISSION_BARRAGE_EVENT, MISSION_BOW_ON, MISSION_EVAC, MISSION_RADAR_EVENT, MISSION_RECON, MISSION_RECON_EVENT, MISSION_UNDER_EVENT } from './mission-mode';
import { UNDER_LINE } from './under-lines';
import { BARRAGE_LINE } from './barrage-lines';
import { reconLine } from './recon-texts';
import { anchorLine } from './anchor-lines';
import { straitLine, type StraitLineView } from './strait-lines';

export { landingPassTailJa } from './landing-lines';

/** モードの文（空襲下の退避か揚陸か海峡の夜。どれでもなければ null）。clock は ui/pt-line-clock（揚陸の 2 行目の出来事の写し landingEv・海峡の夜の時計 strait） */
export function specialLine(t: BoatTelemetry, mode: number, clock: { readonly landingEv: LandingEventView; readonly strait?: StraitLineView }): HudLine | null {
  if (mode === MISSION_RADAR_EVENT || mode === MISSION_BOW_ON) return clock.strait ? straitLine(mode, clock.strait) : null;
  if (mode === MISSION_ANCHOR_EVENT) return clock.strait?.anchor ? anchorLine(clock.strait.anchor) : null; // 止まった艦の任務の出来事（v0.8.1 S4。us_06。時計は strait-line-clock の anchor）
  if (mode === MISSION_UNDER_EVENT) return UNDER_LINE; // 近すぎて船体の下を通過（v0.8.2 IP1。全任務。ui/under-lines）
  if (mode === MISSION_BARRAGE_EVENT) return BARRAGE_LINE; // 煙の中へ乱射されている（v0.8.4。史実モードだけ。ui/barrage-lines）
  if (mode === MISSION_RECON_EVENT || mode === MISSION_RECON) return reconLine(t, mode === MISSION_RECON, clock.strait?.recon); // 報告の任務の出来事と常の文（v0.8.2 S4。us_05。ui/recon-texts）
  return mode === MISSION_EVAC && t.evac.enabled ? evacLine(t.evac) : landingLine(t, mode, clock.landingEv);
}
