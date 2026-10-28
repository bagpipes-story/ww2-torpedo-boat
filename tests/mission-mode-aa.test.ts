// v0.6.8 S3（spec-v068 §3.3・§4.4）: 機銃で機を撃っている間（t.aaFiring）は 2 行目の主兵装の砲の行を出さない: 大発の任務の射撃の行（MISSION_GUN）と
// 米PT の 13mm/25mm の行（ptGunShown）。aaFiring が false・無い（tests の偽物の telemetry）なら今まで通り。
import { describe, expect, it } from 'vitest';
import type { BoatTelemetry } from '../src/core/boat-motion';
import { GUN_FIRING, GUN_NO_TARGET, GUN_OUT_OF_RANGE } from '../src/core/gun-battery';
import { MISSION_GUN, MISSION_PT_GUN, missionMode, ptGunShown } from '../src/ui/mission-mode';
import { tele } from './pt-ui-kit';

/** 大発の任務で射撃を押していて撃てる大発がいない（射程外） */
const barge = (aa?: boolean): BoatTelemetry => {
  const t = tele({ enabled: false }, { gunMission: true, gunStatus: GUN_OUT_OF_RANGE, bargesTotal: 8, bargesSunk: 1, bargesBeached: 0 });
  if (aa !== undefined) t.aaFiring = aa;
  return t;
};
/** 米PT の任務で 13mm を押していて生きた PT がいる（標的なし・見つかっている） */
const pt = (aa?: boolean, status = GUN_NO_TARGET): BoatTelemetry => {
  const t = tele({ enabled: true, gunEnabled: true, gunStatus: status, alive: 3, detected: true, threatPhase: 0 });
  if (aa !== undefined) t.aaFiring = aa;
  return t;
};

describe('対空の間は主兵装の砲の行を出さない', () => {
  it('大発の任務: aaFiring で MISSION_GUN を出さない。false・無いなら出す', () => {
    expect(missionMode(barge(), 0, 0)).toBe(MISSION_GUN);
    expect(missionMode(barge(false), 0, 0)).toBe(MISSION_GUN);
    expect(missionMode(barge(true), 0, 0)).not.toBe(MISSION_GUN);
  });
  it('米PT の任務: aaFiring で ptGunShown は false（MISSION_PT_GUN を出さない）。false・無いなら今まで通り', () => {
    for (const status of [GUN_NO_TARGET, GUN_FIRING]) {
      expect(ptGunShown(pt(undefined, status)), `${status}`).toBe(true);
      expect(ptGunShown(pt(false, status)), `${status}`).toBe(true);
      expect(ptGunShown(pt(true, status)), `${status}`).toBe(false);
    }
    expect(missionMode(pt(false), 0, 0)).toBe(MISSION_PT_GUN);
    expect(missionMode(pt(true), 0, 0)).not.toBe(MISSION_PT_GUN);
  });
});
