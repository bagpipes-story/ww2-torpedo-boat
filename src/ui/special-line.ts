// 上中央の 2 行目の「特別の行」の振り分け（v0.6.11 S5。spec-v0611-r2 §10.1 の M13: ui/mission-line の landingLine の呼び出しをこれに替えて差し引き 0 行）:
// 空襲下の退避（jp_03。モード MISSION_EVAC の中の行は ui/evac-lines）と、停泊して揚陸する輸送船（jp_04。ui/landing-lines。揚陸の無い任務とほかのモードは null）。
// 揚陸の 2 行目の末尾（landingPassTailJa）も mission-line の import の 1 行のままここから出し直す。Phaser・DOM を読まない（文を組むだけ）。
import type { BoatTelemetry } from '../core/boat-motion';
import { evacLine } from './evac-lines';
import type { HudLine } from './hud-lines';
import { landingLine, type LandingEventView } from './landing-lines';
import { MISSION_EVAC } from './mission-mode';

export { landingPassTailJa } from './landing-lines';

/** モードの文（空襲下の退避か揚陸。どちらでもなければ null）。clock は ui/pt-line-clock（揚陸の 2 行目の出来事の写し landingEv） */
export function specialLine(t: BoatTelemetry, mode: number, clock: { readonly landingEv: LandingEventView }): HudLine | null {
  return mode === MISSION_EVAC && t.evac.enabled ? evacLine(t.evac) : landingLine(t, mode, clock.landingEv);
}
