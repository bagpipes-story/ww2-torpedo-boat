// 揚陸の任務（v0.6.9 S6a。jp_04）の HUD のテストの共通の材料: jp_04 の世界の値の米PT（25mm あり）と揚陸の出撃時のテレメトリ（systems の本物の init）、
// それを重ねた 2 行目のテレメトリ（tests/pt-ui-kit の tele の形）と、ui/mission-line と同じ順の 1 フレーム（旗 → モード → キー → 文）。
// ui-config・game-config は DOM を読むので使わない（色は hud-text-config）。
import { gameData } from '../src/config/game-data';
import { PT_GUN_SHELL_POOL_SIZE, PT_SHELL_POOL_SIZE } from '../src/config/pt-config';
import { HOME_MARKER_DISTANCE_STEP_M } from '../src/config/hud-text-config';
import type { BoatTelemetry } from '../src/core/boat-motion';
import { createLanding, createLandingWakes, type LandingTelemetry } from '../src/core/landing';
import { topCall } from '../src/core/mission-flow';
import { createPtSection, type PtTelemetry } from '../src/core/pt-boats';
import { createPtGun } from '../src/core/pt-gun';
import { createPtTorpedoState } from '../src/core/pt-torpedo';
import { initLandingTelemetry } from '../src/systems/landing-telemetry';
import { initPtTelemetry } from '../src/systems/pt-telemetry';
import { buildWorldSetup } from '../src/systems/world-setup';
import { callLineText } from '../src/ui/dawn-lines';
import { landingEventLine, landingThreatLine } from '../src/ui/landing-lines';
import { composeLineKeys, createLineKeys, type LineKeys } from '../src/ui/mission-line-keys';
import { MISSION_CALL, MISSION_LANDING_EVENT, MISSION_LANDING_THREAT, missionMode } from '../src/ui/mission-mode';
import { ptLine } from '../src/ui/pt-lines';
import { tele } from './pt-ui-kit';

export const S04 = buildWorldSetup(gameData, 'jp_04');
export const S04H = buildWorldSetup(gameData, 'jp_04', { hard: true });

/** 出撃時の jp_04 の米PT（initPtTelemetry。25mm あり） */
export const PT04: PtTelemetry = initPtTelemetry({
  pts: { section: createPtSection(S04.ptBoats!, PT_SHELL_POOL_SIZE), p: S04.ptBoats!, firstDetectBand: '', enemyId: 'us_pt_enemy', gun: { state: createPtGun(S04.guns!, PT_GUN_SHELL_POOL_SIZE), g: S04.guns! } },
  boat: { state: { ...S04.playerStart, speedMps: 0 } },
  params: S04.boatParams,
  visRange2: S04.visRange2,
  damageParams: S04.damageParams,
});

/** 出撃時の jp_04 の揚陸（initLandingTelemetry。hard なら 3 隻・北・東・北東） */
export function landing0(hard = false): LandingTelemetry {
  const s = hard ? S04H : S04;
  const ld = s.landing!;
  const section = createPtSection(s.ptBoats!, PT_SHELL_POOL_SIZE);
  return initLandingTelemetry({
    landing: { state: createLanding(ld.params), tst: createPtTorpedoState(section.boats.length, ld.torpedo.n), wakes: createLandingWakes(), p: ld.params, tp: ld.torpedo },
    pts: { section },
    boat: { state: { ...s.playerStart, speedMps: 0 } },
    stepTimeS: 0,
    visRange2: s.visRange2,
  });
}
export const L0 = landing0();

/** jp_04 の 2 行目のテレメトリ: 出撃時の揚陸に l を、jp_04 の米PT に pt を重ねる（over は tests/pt-ui-kit の tele と同じ） */
export function tl(l: Partial<LandingTelemetry> = {}, pt: Partial<PtTelemetry> = {}, over: Partial<BoatTelemetry> = {}, hard = false): BoatTelemetry {
  return tele({ ...PT04, ...pt }, { ...over, landing: { ...(hard ? landing0(true) : L0), ...l } });
}

/** 1 フレームの結果（ui/mission-line と同じ: モード → キー → 文） */
export interface Frame { mode: number; text: string; color: string; keys: LineKeys }

const KEYS = createLineKeys();

/** ui/mission-line と同じ順でモード・キー・文（揚陸の 2 つ・米PT の 5 つ・呼びかけだけ。ほかのモードの文は ''）。call は topCall の値（省けば t.callFlags から） */
export function frame(t: BoatTelemetry, call = topCall(t.callFlags ?? 0), flags = 0, lastPtKey = 0, merge = 0): Frame {
  const mode = missionMode(t, call, flags);
  const keys = { ...composeLineKeys(KEYS, t, mode, flags, lastPtKey, merge, 0) };
  let l = { text: '', color: '' };
  if (mode === MISSION_LANDING_EVENT) l = landingEventLine(t);
  else if (mode === MISSION_LANDING_THREAT) l = landingThreatLine(t);
  else if (keys.ptMode) l = ptLine(t, mode, keys.pKey);
  else if (mode === MISSION_CALL) l = { text: callLineText(t, call, Math.ceil(t.homeEdgeM / HOME_MARKER_DISTANCE_STEP_M)), color: '' };
  return { mode, text: l.text, color: l.color, keys };
}
