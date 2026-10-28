// v0.6.9 S6a（spec-v069 §5.1）: 揚陸の任務（jp_04）の 2 行目のモード 35（出来事）・36（輸送船への脅威）の優先順。
// 赤い線 > 13mm の出来事 > 輸送隊の出来事 > 揚陸の出来事（35）> 機関の出来事 > 航過の結果 > 機関の限界 > 射撃 > 接触（決着の後で呼びかけがあれば呼びかけ）> 輸送船への脅威（36。決着の前だけ）> 機関の状態 > … > 呼びかけ > 米PT の平常。
// 自艇の命（赤い線）がいつも勝ち、36 は自艇を狙う PT がいないときだけ。旗 128 は揚陸の任務だけがモードにする（ほかの任務は tests/landing-neutral）。
import { describe, expect, it } from 'vitest';
import { AS_T_INBOUND, AS_T_REST } from '../src/core/air-strike';
import { createDawnTelemetry } from '../src/core/dawn-air';
import { ENGINE_FINAL, createEngineTelemetry } from '../src/core/engine-trouble';
import { GUN_FIRING } from '../src/core/gun-battery';
import { LD_DONE, LD_SUNK } from '../src/core/landing';
import { CALL_DAWN, CALL_FUEL, CALL_SUNK } from '../src/core/mission-flow';
import { PT_PASS, PT_RUN_IN } from '../src/core/pt-boats';
import {
  MISSION_ADRIFT, MISSION_CALL, MISSION_CONVOY_EVENT, MISSION_ENGINE_EVENT, MISSION_ENGINE_FINAL, MISSION_ENGINE_STATUS, MISSION_LANDING_EVENT, MISSION_LANDING_THREAT, MISSION_PT, MISSION_PT_CONTACT, MISSION_PT_GUN,
  MISSION_PT_GUN_EVENT, MISSION_PT_PASS, MISSION_STRIKE, MISSION_STRIKE_REST, MISSION_WAITING, MODE_FLAG_CONVOY_EVENT, MODE_FLAG_ENGINE_EVENT, MODE_FLAG_LANDING_EVENT, MODE_FLAG_PT_GUN_EVENT, MODE_FLAG_PT_HOLD,
  MODE_FLAG_PT_RESULT, landingThreatShown, missionMode,
} from '../src/ui/mission-mode';
import { tl } from './landing-ui-kit';
import { tele } from './pt-ui-kit';

const EV = MODE_FLAG_LANDING_EVENT;
const QUIET = { alive: 2, detected: false, sighted: false, passing: false };
const REPORT = { reportSub: 1, reportI: 0, reportStep: 18, reportDirIdx: 1 };
const WAKES = { wakes: 3, wakeCpaS: 8 };
const DONE = { resolved: true, phase: LD_DONE, pct: 1, leftS: 0 };

describe('揚陸の 2 行目のモードの優先順（ui/mission-mode。spec §5.1）', () => {
  it('36 は報告か雷跡がある決着の前だけ（決着の後は呼びかけか平常）', () => {
    expect(missionMode(tl(REPORT, QUIET), 0, 0)).toBe(MISSION_LANDING_THREAT);
    expect(missionMode(tl(WAKES, QUIET), 0, 0)).toBe(MISSION_LANDING_THREAT);
    expect(missionMode(tl({}, QUIET), 0, 0)).toBe(MISSION_PT);
    expect(missionMode(tl({ ...DONE, ...WAKES }, QUIET), 0, 0)).toBe(MISSION_PT);
    expect(missionMode(tl({ ...DONE, ...WAKES }, QUIET), CALL_SUNK, 0)).toBe(MISSION_CALL);
    expect(missionMode(tl({ resolved: true, phase: LD_SUNK, ...REPORT }, QUIET), CALL_SUNK, 0)).toBe(MISSION_CALL);
    expect(landingThreatShown(tl({ ...DONE, ...REPORT }))).toBe(false);
    // 36 は呼びかけ（夜明け近し・燃料少の待ち）と米PT の平常より上
    expect(missionMode(tl(REPORT, QUIET), CALL_DAWN, 0)).toBe(MISSION_LANDING_THREAT);
    expect(missionMode(tl(WAKES, QUIET), CALL_FUEL, 0)).toBe(MISSION_LANDING_THREAT);
  });

  it('赤い線（航過・保つ間）・13mm の射撃・接触は 36 に勝つ（自艇の命が先）。機関の状態は 36 の下', () => {
    expect(missionMode(tl(REPORT, { ...QUIET, detected: true, passing: true, threatPhase: PT_PASS }), 0, 0)).toBe(MISSION_PT_PASS);
    expect(missionMode(tl(WAKES, QUIET), 0, MODE_FLAG_PT_HOLD)).toBe(MISSION_PT_PASS);
    expect(missionMode(tl(REPORT, { ...QUIET, detected: true, threatPhase: PT_RUN_IN }), 0, 0)).toBe(MISSION_PT_CONTACT);
    expect(missionMode(tl(WAKES, { ...QUIET, gunEnabled: true, gunStatus: GUN_FIRING }), 0, 0)).toBe(MISSION_PT_GUN);
    expect(missionMode(tl(WAKES, QUIET, { engine: { ...createEngineTelemetry(), on: true, stage: ENGINE_FINAL } }), 0, 0)).toBe(MISSION_LANDING_THREAT);
    expect(missionMode(tl({}, QUIET, { engine: { ...createEngineTelemetry(), on: true, stage: ENGINE_FINAL } }), 0, 0)).toBe(MISSION_ENGINE_STATUS);
    expect(missionMode(tl(WAKES, QUIET, { engine: { ...createEngineTelemetry(), on: true, stage: ENGINE_FINAL }, targetStep: 'full' }), 0, 0)).toBe(MISSION_ENGINE_FINAL);
  });

  it('35 は赤い線・13mm の出来事・輸送隊の出来事の下、機関の出来事・航過の結果・射撃・接触・36 の上', () => {
    expect(missionMode(tl(REPORT, QUIET), 0, EV)).toBe(MISSION_LANDING_EVENT);
    expect(missionMode(tl({}, { ...QUIET, passing: true, threatPhase: PT_PASS }), 0, EV)).toBe(MISSION_PT_PASS);
    expect(missionMode(tl({}, QUIET), 0, EV | MODE_FLAG_PT_HOLD)).toBe(MISSION_PT_PASS);
    expect(missionMode(tl({}, QUIET), 0, EV | MODE_FLAG_PT_GUN_EVENT)).toBe(MISSION_PT_GUN_EVENT);
    expect(missionMode(tl({}, QUIET), 0, EV | MODE_FLAG_CONVOY_EVENT)).toBe(MISSION_CONVOY_EVENT);
    expect(missionMode(tl({}, QUIET), 0, EV | MODE_FLAG_ENGINE_EVENT)).toBe(MISSION_LANDING_EVENT);
    expect(missionMode(tl({}, QUIET), 0, MODE_FLAG_ENGINE_EVENT)).toBe(MISSION_ENGINE_EVENT);
    expect(missionMode(tl({}, { ...QUIET, detected: true }), 0, EV | MODE_FLAG_PT_RESULT)).toBe(MISSION_LANDING_EVENT);
    expect(missionMode(tl({}, { ...QUIET, detected: true, threatPhase: PT_RUN_IN }), 0, EV)).toBe(MISSION_LANDING_EVENT);
    expect(missionMode(tl({}, { ...QUIET, gunEnabled: true, gunStatus: GUN_FIRING }), 0, EV)).toBe(MISSION_LANDING_EVENT);
    expect(missionMode(tl(DONE, QUIET), CALL_SUNK, EV)).toBe(MISSION_LANDING_EVENT); // 揚陸完了の出来事は呼びかけ「揚陸完了 ・ 帰投せよ」の前に出る
  });

  it('魚雷待ち・燃料切れ・夜明けの空襲は 35・36 の上（波の合間は 36 の下）。旗 128 は揚陸の任務だけがモードにする', () => {
    expect(missionMode(tl(REPORT, QUIET, { homeWaiting: true }), 0, EV)).toBe(MISSION_WAITING);
    expect(missionMode(tl(REPORT, QUIET, { fuelEmpty: true }), 0, EV)).toBe(MISSION_ADRIFT);
    const strike = { ...createDawnTelemetry(), reached: true, threat: AS_T_INBOUND };
    expect(missionMode(tl(REPORT, QUIET, { dawn: strike }), CALL_DAWN, EV)).toBe(MISSION_STRIKE);
    expect(missionMode(tl(WAKES, { ...QUIET, alive: 0 }, { dawn: { ...strike, threat: AS_T_REST } }), CALL_DAWN, 0)).toBe(MISSION_LANDING_THREAT);
    expect(missionMode(tl({}, { ...QUIET, alive: 0 }, { dawn: { ...strike, threat: AS_T_REST } }), CALL_DAWN, 0)).toBe(MISSION_STRIKE_REST);
    // ほかの任務（jp_05 の材料）は旗だけでは 35 にならない
    expect(missionMode(tele(QUIET), 0, EV)).toBe(MISSION_PT);
    expect(missionMode(tele({ ...QUIET, detected: true }), 0, EV)).toBe(MISSION_PT_CONTACT);
  });

  it('接触: 揚陸の決着の後に呼びかけがあれば呼びかけ（jp_01 の ux-4 と同じ）、決着の前は接触', () => {
    const fight = { ...QUIET, detected: true, threatPhase: PT_RUN_IN };
    expect(missionMode(tl(DONE, fight), CALL_SUNK, 0)).toBe(MISSION_CALL);
    expect(missionMode(tl(DONE, fight), 0, 0)).toBe(MISSION_PT_CONTACT);
    expect(missionMode(tl({ leftS: 30 }, fight), CALL_FUEL, 0)).toBe(MISSION_PT_CONTACT);
    expect(missionMode(tele(fight), CALL_SUNK, 0)).toBe(MISSION_PT_CONTACT); // 揚陸の無い jp_05 は前のまま
  });
});
