// tests の共通の材料（v0.6.3。tests/jp05-mission・tests/pt-gun-ui が使う）: jp_05 の世界の値、米PT の隊と T-14 の 13mm だけの世界（systems/pt-telemetry が読む部分）、
// 2 行目の優先順と文が読む項目だけの中立のテレメトリ、モード・文・色を返す row、文の幅の見積もり。
// ui-config・game-config は DOM を読むので使わない（色は hud-text-config、文の幅は tests/dawn-clock と同じ見積もり）。
import { gameData } from '../src/config/game-data';
import { PT_GUN_SHELL_POOL_SIZE, PT_SHELL_POOL_SIZE } from '../src/config/pt-config';
import type { BoatState, BoatTelemetry } from '../src/core/boat-motion';
import { createConvoyTelemetry } from '../src/core/convoy';
import { createDawnTelemetry } from '../src/core/dawn-air';
import { createEngineTelemetry } from '../src/core/engine-trouble';
import { createGunboatTelemetry } from '../src/core/gunboat';
import { createLandingTelemetry } from '../src/core/landing';
import { createPatrolTelemetry } from '../src/core/patrol-air-state';
import { createPtSection, type PtSection, type PtTelemetry } from '../src/core/pt-boats';
import { createPtGun, type PtGunState } from '../src/core/pt-gun';
import { initPtTelemetry, type PtTelemetryWorld } from '../src/systems/pt-telemetry';
import { buildWorldSetup } from '../src/systems/world-setup';
import { MISSION_PT, MISSION_PT_CONTACT, MISSION_PT_GUN, MISSION_PT_GUN_EVENT, MISSION_PT_PASS, missionMode } from '../src/ui/mission-mode';
import { ptKey, ptLine } from '../src/ui/pt-lines';

/** HUD の文の幅の見積もり px（Menlo の半角 0.602 em・全角 1 em。tests/dawn-clock と同じ） */
export function textWidthPx(str: string, px: number): number {
  let w = 0;
  for (const ch of str) w += (ch.charCodeAt(0) < 0x2000 ? 0.602 : 1) * px;
  return w;
}
/** 2 行目（22 px）が縮まない幅: 論理幅 1280 − 左右の時計の避け 220（HUD_MARGIN 24 + 時計 184 + 隙間 12） */
export const LINE2_MAX_PX = 1280 - 2 * 220;

export const S05 = buildWorldSetup(gameData, 'jp_05');

/** ptWorld の型（隊と 13mm を直に書き換えるテストのため null でない形） */
export type PtWorld = PtTelemetryWorld & { boat: { state: BoatState }; pts: { section: PtSection; gun: { state: PtGunState } | null } };

/** 米PT の隊と自艇（出発点）だけの世界。gun が false なら砲の無い米PT の任務（main_weapon none の形） */
export function ptWorld(gun = true): PtWorld {
  const p = S05.ptBoats!;
  const g = S05.guns!;
  return {
    pts: { section: createPtSection(p, PT_SHELL_POOL_SIZE), p, firstDetectBand: '', enemyId: 'us_pt_enemy', gun: gun ? { state: createPtGun(g, PT_GUN_SHELL_POOL_SIZE), g } : null },
    boat: { state: { ...S05.playerStart, speedMps: 0 } },
    params: S05.boatParams,
    visRange2: S05.visRange2,
    damageParams: S05.damageParams,
  };
}
/** jp_05 の出撃時の米PT（initPtTelemetry。13mm あり） */
export const PT0 = initPtTelemetry(ptWorld());

/** 2 行目の優先順と文が読む項目だけの中立のテレメトリ（tests/dawn-lines と同じ形）に、jp_05 の出撃時の米PT を重ねる */
export function tele(pt: Partial<PtTelemetry> = {}, over: Partial<BoatTelemetry> = {}): BoatTelemetry {
  return {
    timeLeftS: 100, homeWaiting: false, fuelEmpty: false, escortEnabled: false, escortSunk: false, escortDistM: 0, escortLagWarnM: 400,
    planePhase: 0, planeLocked: false, planeOutcome: 0, planeDx: NaN, planeDy: NaN, friendlyPhase: 0, friendlyOutcome: 0,
    shallowState: 0, shallowAheadM: 0, shallowSafeKt: 10, gunMission: false, gunStatus: 0, bargesSunk: 0, bargesBeached: 0, bargesTotal: 0, bargeEscapeS: NaN,
    enemySighted: false, batteryInArc: false, batteryAlerted: false, stormState: 0, stormFast: false, stormSafeKt: 12,
    targetStep: 'silent', detectRangeM: 600, homeEdgeM: 1950,
    ...over,
    dawn: { ...createDawnTelemetry(), ...(over.dawn ?? {}) },
    pt: { ...PT0, ...pt },
    convoy: over.convoy ?? createConvoyTelemetry(), // 輸送隊の無い任務（v0.6.4。enabled false）。jp_01 のテストは over.convoy で渡す
    engine: over.engine ?? createEngineTelemetry(), // 機関の不調はまだ起きていない（v0.6.5。on false）。機関の行のテストは over.engine で渡す
    gunboat: over.gunboat ?? createGunboatTelemetry(), // 隼艇のいない任務（v0.6.6。enabled false）。隼艇の行のテストは over.gunboat で渡す
    patrol: over.patrol ?? createPatrolTelemetry(), // 夜の哨戒機の無い任務（v0.6.7。enabled false）。夜の哨戒の行のテストは over.patrol で渡す
    landing: over.landing ?? createLandingTelemetry(), // 揚陸の無い任務（v0.6.9。enabled false）。jp_04 の行のテストは over.landing で渡す
  } as BoatTelemetry;
}

/** 米PT の 5 つのモード（ui/pt-lines が文を組む） */
export function isPtMode(mode: number): boolean {
  return mode === MISSION_PT_PASS || mode === MISSION_PT_CONTACT || mode === MISSION_PT || mode === MISSION_PT_GUN || mode === MISSION_PT_GUN_EVENT;
}

/** モード・文・色（call は topCall の値、flags は MODE_FLAG_*）。米PT のモードでなければ文と色は '' */
export function row(t: BoatTelemetry, call = 0, flags = 0): [number, string, string] {
  const mode = missionMode(t, call, flags);
  if (!isPtMode(mode)) return [mode, '', ''];
  const l = ptLine(t, mode, ptKey(t, mode, flags));
  return [mode, l.text, l.color];
}

/** そのフレームのキー（mission-line と同じ: モードを決めてから ptKey） */
export function keyOf(t: BoatTelemetry, call = 0, flags = 0): number {
  return ptKey(t, missionMode(t, call, flags), flags);
}
