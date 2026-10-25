// v0.6.7 S0 の純粋な移動の確かめ（spec-v067 §E.2）: ui/mission-line から ui/mission-line-air へ移した水上機・夜明けの空襲のモード・キー・文の呼び出しが、
// 746884c の mission-line の式（tests/air-lines-neutral と同じ写し）と、乱数で作った 4,000 通りのテレメトリですべて同じ。ui/dawn-lines から切り出した 3 つの句も同じ字。
import { describe, expect, it } from 'vitest';
import { PLANE_DISTANCE_STEP_M } from '../src/config/hud-text-config';
import { AS_T_FALLING, AS_T_INBOUND, AS_T_NONE, AS_T_ORBIT, AS_T_REST, AS_T_RUN } from '../src/core/air-strike';
import type { BoatTelemetry } from '../src/core/boat-motion';
import { DAWN_AIR_ENEMY } from '../src/core/dawn-air';
import { SeededRng } from '../src/core/rng';
import { SP_APPROACH, SP_FLARE_PASS, SP_IDLE, SP_LEAVING, SP_ORBIT, SP_OUT_BOMBED, SP_OUT_LOST, SP_OUT_NONE, SP_RUN } from '../src/core/seaplane';
import { STRIKE_DODGE_RULE_JA, strikeFallJa, strikeKey, strikeLine, strikeOrbitJa, strikeRunJa } from '../src/ui/dawn-lines';
import { seaplaneLine } from '../src/ui/hud-lines';
import { airLine, planeKeyOf, planeModeOf, strikeKeyOf, strikeModeOf } from '../src/ui/mission-line-air';
import { MISSION_PLANE, MISSION_PLANE_ATTACK, MISSION_PLANE_RESULT, MISSION_STRIKE, MISSION_STRIKE_REST, missionMode, stormWarning } from '../src/ui/mission-mode';
import { tele } from './pt-ui-kit';

/** 746884c の mission-line.ts:134-139・:161-162 の写し */
const planeMode746 = (mode: number): boolean => mode === MISSION_PLANE_ATTACK || mode === MISSION_PLANE || mode === MISSION_PLANE_RESULT;
const planeStep746 = (t: BoatTelemetry): number => (t.planePhase === SP_APPROACH ? Math.ceil(t.planeDistM / PLANE_DISTANCE_STEP_M) : 0);
const planeKey746 = (t: BoatTelemetry, planeMode: boolean, planeStep: number): number =>
  planeMode ? t.planePhase | (t.planeLocked ? 8 : 0) | (t.planeWake ? 16 : 0) | (t.planeFlareOn ? 32 : 0) | (t.planeBombAir ? 64 : 0) | (t.planeBombsDropped << 7) | (t.planeOutcome << 9) | (t.destroyerSunk ? 2048 : 0) | (t.planeBombsHit << 12) | (planeStep << 14) : 0;

const pick = <T>(rng: SeededRng, xs: readonly T[]): T => xs[Math.floor(rng.next() * xs.length)]!;
function randomTele(rng: SeededRng): BoatTelemetry {
  const t = tele({ enabled: false }, {
    planePhase: pick(rng, [SP_IDLE, SP_APPROACH, SP_FLARE_PASS, SP_ORBIT, SP_RUN, SP_LEAVING]), planeLocked: rng.next() < 0.5, planeWake: rng.next() < 0.5, planeWakeKt: pick(rng, [13, 14, 18]),
    planeFlareOn: rng.next() < 0.5, planeBombsDropped: Math.floor(rng.next() * 3), planeBombAir: rng.next() < 0.3, planeBombsHit: Math.floor(rng.next() * 3),
    planeOutcome: pick(rng, [SP_OUT_NONE, SP_OUT_LOST, SP_OUT_BOMBED]), planeDistM: rng.next() * 6000, destroyerSunk: rng.next() < 0.3,
    shallowState: Math.floor(rng.next() * 3), shallowAheadM: rng.next() * 900, stormState: Math.floor(rng.next() * 4), stormFast: rng.next() < 0.5,
    escortEnabled: rng.next() < 0.5, escortSunk: rng.next() < 0.2, escortHp: rng.next() * 90,
  });
  t.dawn = { ...t.dawn, reached: true, air: DAWN_AIR_ENEMY, strikeEnabled: true, count: 4, fromJa: '東', threat: pick(rng, [AS_T_NONE, AS_T_INBOUND, AS_T_ORBIT, AS_T_RUN, AS_T_FALLING, AS_T_REST]),
    toEscort: rng.next() < 0.3, fallingArc: rng.next() < 0.5, plane: Math.floor(rng.next() * 5) - 1, bombsLeft: Math.floor(rng.next() * 9), restS: rng.next() * 30, inboundDistM: rng.next() * 6000 };
  return t;
}

describe('ui/mission-line-air（v0.6.7 S0 の移動。746884c の mission-line と同じ）', () => {
  it('モード・キー・文が 4,000 通りのテレメトリですべて 746884c の式と同じ', () => {
    const rng = new SeededRng(67);
    let air = 0;
    for (let i = 0; i < 4000; i++) {
      const t = randomTele(rng);
      const mode = missionMode(t, 0, 0);
      const shallowStep = Math.ceil(t.shallowAheadM / 50);
      const pm = planeMode746(mode);
      const sm = mode === MISSION_STRIKE || mode === MISSION_STRIKE_REST;
      expect([planeModeOf(mode), strikeModeOf(mode)]).toEqual([pm, sm]);
      expect(planeKeyOf(t, pm)).toBe(planeKey746(t, pm, planeStep746(t)));
      expect(strikeKeyOf(t, sm)).toBe(sm ? strikeKey(t) : 0);
      const escortHit = rng.next() < 0.3;
      const landed = rng.next() < 0.3;
      if (sm) expect(airLine(t, true, shallowStep, stormWarning(t), escortHit, landed)).toEqual(strikeLine(t, shallowStep, stormWarning(t), escortHit, landed));
      if (pm) expect(airLine(t, false, shallowStep, stormWarning(t), escortHit, landed)).toEqual(seaplaneLine(t, planeStep746(t), shallowStep, stormWarning(t)));
      if (sm || pm) air++;
    }
    expect(air).toBeGreaterThan(1500); // 空の行のモードを十分に通った
  });
  it('ui/dawn-lines の 3 つの句（旋回・進路・落下）は strikeLine の中の字と同じ', () => {
    expect(strikeOrbitJa(1, 6)).toBe('敵機 旋回 ・ 次は 2 番機 ・ 残り爆弾 6');
    expect(strikeRunJa(0)).toBe(`爆撃進路 ・ 1 番機 ・ ${STRIKE_DODGE_RULE_JA}`);
    expect([strikeFallJa(false), strikeFallJa(true)]).toEqual(['爆弾投下！ 転舵！', '爆弾投下！ 旋回と逆へ転舵！']);
  });
});
