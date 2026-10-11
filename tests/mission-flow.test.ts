import { describe, expect, it } from 'vitest';
import {
  CALL_DAWN,
  CALL_EXPENDED,
  CALL_FUEL,
  CALL_SUNK,
  decideMissionEnd,
  insideRing,
  isReturnPointDataRecord,
  returnPointFromData,
  ringEdgeDistM,
  topCall,
  updateReturnCalls,
  type EndCheck,
  type ReturnPoint,
} from '../src/core/mission-flow';

const RP: ReturnPoint = { x: 5400, y: 600, radiusM: 250, callMargin: 1.5, torpedoSettleMaxS: 10 };
const P = { torpedoSettleMaxS: 10, adriftDelayS: 1.5 };

function check(over: Partial<EndCheck>): EndCheck {
  return {
    boatSinking: false,
    atHome: false,
    torpedoesRunning: false,
    waitS: 0,
    timeLeftS: 100,
    destroyerSinkPlaying: false,
    fuelEmpty: false,
    stopped: false,
    ...over,
  };
}

describe('任務の流れ（docs/02 §6.7、v0.3.0）', () => {
  it('輪: 半径ちょうどは中、少し外は外。縁までの距離は中なら 0', () => {
    expect(insideRing(RP, 5400 + 250, 600)).toBe(true);
    expect(insideRing(RP, 5400 + 250.01, 600)).toBe(false);
    expect(ringEdgeDistM(RP, 5400, 600)).toBe(0);
    expect(ringEdgeDistM(RP, 5400, 600 + 1250)).toBeCloseTo(1000, 9);
  });
  it('呼びかけ: 4 つのしきい値（等号は立つ）、一度立ったら消えない、表示は 燃料 > 夜明け > 撃沈 > 撃ち尽くし', () => {
    expect(updateReturnCalls(0, false, false, 100, 10, 100, 10, 1.5)).toBe(0);
    expect(updateReturnCalls(0, false, true, 100, 10, 100, 10, 1.5)).toBe(CALL_EXPENDED);
    expect(updateReturnCalls(0, true, false, 100, 10, 100, 10, 1.5)).toBe(CALL_SUNK);
    expect(updateReturnCalls(0, false, false, 100, 10, 15, 10, 1.5)).toBe(CALL_DAWN); // 15 ≤ 10 × 1.5
    expect(updateReturnCalls(0, false, false, 100, 10, 15.01, 10, 1.5)).toBe(0);
    expect(updateReturnCalls(0, false, false, 15, 10, 100, 10, 1.5)).toBe(CALL_FUEL); // 15 ≤ 10 × 1.5
    expect(updateReturnCalls(0, false, false, 15.01, 10, 100, 10, 1.5)).toBe(0);
    // ラッチ: 条件が戻っても消えない
    let f = updateReturnCalls(0, false, false, 15, 10, 100, 10, 1.5);
    f = updateReturnCalls(f, false, false, 100, 10, 100, 10, 1.5);
    expect(f).toBe(CALL_FUEL);
    expect(topCall(CALL_FUEL | CALL_DAWN | CALL_SUNK | CALL_EXPENDED)).toBe(CALL_FUEL);
    expect(topCall(CALL_DAWN | CALL_SUNK | CALL_EXPENDED)).toBe(CALL_DAWN);
    expect(topCall(CALL_SUNK | CALL_EXPENDED)).toBe(CALL_SUNK);
    expect(topCall(CALL_EXPENDED)).toBe(CALL_EXPENDED);
    expect(topCall(0)).toBe(0);
  });
  it('終了判定の分岐表', () => {
    // 自艇の沈没中は何も決めない
    expect(decideMissionEnd(check({ boatSinking: true, atHome: true }), P)).toBeNull();
    expect(decideMissionEnd(check({ boatSinking: true, timeLeftS: 0 }), P)).toBeNull();
    expect(decideMissionEnd(check({ boatSinking: true, fuelEmpty: true, stopped: true, waitS: 5 }), P)).toBeNull();
    // 輪の中で魚雷が無ければ帰投（撃沈演出中でも、燃料 0 でも）
    expect(decideMissionEnd(check({ atHome: true }), P)).toBe('returned');
    expect(decideMissionEnd(check({ atHome: true, destroyerSinkPlaying: true }), P)).toBe('returned');
    expect(decideMissionEnd(check({ atHome: true, fuelEmpty: true, stopped: true }), P)).toBe('returned');
    // 輪の中で魚雷が走っていれば待つ。10 秒か夜明けで帰投
    expect(decideMissionEnd(check({ atHome: true, torpedoesRunning: true, waitS: 9.9 }), P)).toBeNull();
    expect(decideMissionEnd(check({ atHome: true, torpedoesRunning: true, waitS: 10 }), P)).toBe('returned');
    expect(decideMissionEnd(check({ atHome: true, torpedoesRunning: true, timeLeftS: 0 }), P)).toBe('returned');
    // 輪の中で魚雷を待つ間に燃料が尽きて止まっても漂流にしない（待ち切れば帰投）。レビューで判明
    expect(decideMissionEnd(check({ atHome: true, torpedoesRunning: true, fuelEmpty: true, stopped: true, waitS: 5 }), P)).toBeNull();
    expect(decideMissionEnd(check({ atHome: true, torpedoesRunning: true, fuelEmpty: true, stopped: true, waitS: 10 }), P)).toBe('returned');
    expect(decideMissionEnd(check({ atHome: true, torpedoesRunning: true, fuelEmpty: true, stopped: true, timeLeftS: 0 }), P)).toBe('returned');
    // 撃沈演出中で夜明けなら null、演出が終われば dawn（撃沈後に夜明けが来なくなる罠の回帰）
    expect(decideMissionEnd(check({ destroyerSinkPlaying: true, timeLeftS: 0 }), P)).toBeNull();
    expect(decideMissionEnd(check({ destroyerSinkPlaying: false, timeLeftS: 0 }), P)).toBe('dawn');
    // 夜明け: 燃料ありは dawn、0 は adrift
    expect(decideMissionEnd(check({ timeLeftS: 0, fuelEmpty: true }), P)).toBe('adrift');
    // 燃料 0: 動いていれば null、止まって 1.4 秒は null、1.5 秒で adrift
    expect(decideMissionEnd(check({ fuelEmpty: true, stopped: false, waitS: 5 }), P)).toBeNull();
    expect(decideMissionEnd(check({ fuelEmpty: true, stopped: true, waitS: 1.4 }), P)).toBeNull();
    expect(decideMissionEnd(check({ fuelEmpty: true, stopped: true, waitS: 1.5 }), P)).toBe('adrift');
    expect(decideMissionEnd(check({}), P)).toBeNull();
  });
  it('巡航で帰る実秒: 2,580 m は 43.6 秒（time_scale 5、23 kt）', () => {
    const cruiseMps = 23 * 0.5144;
    expect(2580 / (cruiseMps * 5)).toBeCloseTo(43.6, 1);
  });
  it('data の読み出し: 検査', () => {
    const rec = { x_m: 5400, y_m: 600, radius_m: 250, call_margin: 1.5, torpedo_settle_max_s: 10 };
    const bounds = { width: 6000, height: 4000 };
    expect(isReturnPointDataRecord(rec)).toBe(true);
    expect(isReturnPointDataRecord({ ...rec, radius_m: 'x' })).toBe(false);
    expect(returnPointFromData(rec, bounds)).toEqual(RP);
    expect(() => returnPointFromData({ ...rec, radius_m: 0 }, bounds)).toThrow();
    expect(() => returnPointFromData({ ...rec, call_margin: 0.99 }, bounds)).toThrow();
    expect(() => returnPointFromData({ ...rec, torpedo_settle_max_s: -1 }, bounds)).toThrow();
    expect(() => returnPointFromData({ ...rec, y_m: 100 }, bounds)).toThrow(); // 輪が上端からはみ出す
    expect(() => returnPointFromData({ ...rec, x_m: 5900 }, bounds)).toThrow();
  });
});
