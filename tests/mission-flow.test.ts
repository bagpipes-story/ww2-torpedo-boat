import { describe, expect, it } from 'vitest';
import { SeededRng } from '../src/core/rng';
import { REASON_LABEL, resultDawnSuffixS, resultEvadePartJa, resultHeadingJa } from '../src/ui/result-heading';
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
  type MissionEndReason,
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
    grounded: false,
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
    // 座礁: 1.4 秒は null、1.5 秒で grounded。夜明けや撃沈演出より先。自艇の沈没中は null（砲撃で沈めば destroyed）
    expect(decideMissionEnd(check({ grounded: true, waitS: 1.4 }), P)).toBeNull();
    expect(decideMissionEnd(check({ grounded: true, waitS: 1.5 }), P)).toBe('grounded');
    expect(decideMissionEnd(check({ grounded: true, waitS: 1.5, timeLeftS: 0 }), P)).toBe('grounded');
    expect(decideMissionEnd(check({ grounded: true, waitS: 1.5, destroyerSinkPlaying: true }), P)).toBe('grounded');
    expect(decideMissionEnd(check({ grounded: true, waitS: 5, boatSinking: true }), P)).toBeNull();
    // 撃沈演出中で夜明けなら null、演出が終わっても夜明けでは終わらない（v0.6.1。夜明けは状態）
    expect(decideMissionEnd(check({ destroyerSinkPlaying: true, timeLeftS: 0 }), P)).toBeNull();
    expect(decideMissionEnd(check({ destroyerSinkPlaying: false, timeLeftS: 0 }), P)).toBeNull();
    // 夜明け後に燃料 0: 動いていれば続く、止まって 1.5 秒で adrift（夜明け前と同じ規則。v0.6.1）
    expect(decideMissionEnd(check({ timeLeftS: 0, fuelEmpty: true }), P)).toBeNull();
    expect(decideMissionEnd(check({ timeLeftS: 0, fuelEmpty: true, stopped: true, waitS: 1.5 }), P)).toBe('adrift');
    // 燃料 0: 動いていれば null、止まって 1.4 秒は null、1.5 秒で adrift
    expect(decideMissionEnd(check({ fuelEmpty: true, stopped: false, waitS: 5 }), P)).toBeNull();
    expect(decideMissionEnd(check({ fuelEmpty: true, stopped: true, waitS: 1.4 }), P)).toBeNull();
    expect(decideMissionEnd(check({ fuelEmpty: true, stopped: true, waitS: 1.5 }), P)).toBe('adrift');
    expect(decideMissionEnd(check({}), P)).toBeNull();
  });
  it('v0.6.1 夜明けでは終わらない: 夜明け後（timeLeftS ≤ 0）の判定は夜明け前（1 秒）と同じ。違うのは輪の中で魚雷を待つときだけ（待たずに帰投）', () => {
    const rng = new SeededRng(20261018);
    const flag = (): boolean => rng.next() < 0.5;
    let differ = 0;
    for (let n = 0; n < 500; n++) {
      const c = check({ boatSinking: rng.next() < 0.1, atHome: flag(), torpedoesRunning: flag(), waitS: rng.next() * 12, destroyerSinkPlaying: rng.next() < 0.2, fuelEmpty: flag(), stopped: flag(), grounded: rng.next() < 0.2 });
      const k = Math.floor(rng.next() * 300);
      const before = decideMissionEnd({ ...c, timeLeftS: 1 }, P);
      const after = decideMissionEnd({ ...c, timeLeftS: -k }, P);
      if (c.atHome && c.torpedoesRunning) {
        if (!c.boatSinking) expect(after).toBe('returned');
        if (after !== before) differ++;
      } else expect(after).toBe(before);
      expect(after).not.toBe('dawn');
    }
    expect(differ).toBeGreaterThan(0); // 輪の中で魚雷を待つ場合を実際に通った
  });
  it('v0.6.1 終了理由: air_strike（夜明けの空襲で沈没）が増え、dawn（夜明け — 帰投できず）は無い', () => {
    const reasons = Object.keys(REASON_LABEL) as MissionEndReason[];
    expect(reasons).toContain('air_strike');
    expect(reasons).not.toContain('dawn');
    expect(REASON_LABEL.air_strike).toBe('夜明けの空襲で沈没');
    expect(REASON_LABEL.bombed).toBe('敵機の爆撃で沈没'); // 夜の水上機とは別
    // @ts-expect-error 'dawn' は終了理由ではない（型で戻らないようにする）
    const dawn: MissionEndReason = 'dawn';
    expect(reasons).not.toContain(dawn);
  });
  it('v0.6.1 Result の見出し: 夜明け後に終わった任務だけ「（夜明け後 N 秒）」を理由の直後、ハード・史実の前に', () => {
    const before = { reached: false, caughtOutside: false, daylightS: 0 };
    const caught = { reached: true, caughtOutside: true, daylightS: 41.6 };
    const homeAtDawn = { reached: true, caughtOutside: false, daylightS: 0.02 };
    expect(resultDawnSuffixS(true, before)).toBeNaN();
    expect(resultDawnSuffixS(false, before)).toBeNaN();
    expect(resultDawnSuffixS(true, homeAtDawn)).toBeNaN();
    expect(resultDawnSuffixS(true, caught)).toBe(41.6);
    expect(resultDawnSuffixS(false, caught)).toBe(41.6);
    expect(resultDawnSuffixS(false, homeAtDawn)).toBe(0.02);
    expect(resultHeadingJa('returned', resultDawnSuffixS(true, before), false, false)).toBe('任務終了 — 帰投した');
    expect(resultHeadingJa('returned', resultDawnSuffixS(true, caught), false, false)).toBe('任務終了 — 帰投した（夜明け後 42 秒）');
    expect(resultHeadingJa('air_strike', resultDawnSuffixS(false, caught), false, false)).toBe('任務終了 — 夜明けの空襲で沈没（夜明け後 42 秒）');
    expect(resultHeadingJa('adrift', resultDawnSuffixS(false, caught), true, false)).toBe('任務終了 — 燃料切れで漂流（夜明け後 42 秒）（ハード）');
    expect(resultHeadingJa('destroyed', NaN, true, false)).toBe('任務終了 — 砲撃で沈没（ハード）');
    expect(resultHeadingJa('returned', 30.4, true, true)).toBe('任務終了 — 帰投した（夜明け後 30 秒）（ハード）（史実）');
  });
  it('v0.6.1 Result の「回避 N」: 回避に点のある任務だけ。夜明けだけが理由の 0 は「回避 0（夜明け後）」、見つかった・届けていない・帰投していない 0 には付けない', () => {
    const r = (over: Partial<{ returned: boolean; objectiveDone: boolean; detections: number; caughtOutside: boolean }> = {}) => {
      const o = { returned: true, objectiveDone: true, detections: 0, caughtOutside: true, ...over };
      return { returned: o.returned, objectiveDone: o.objectiveDone, detections: o.detections, dawn: { caughtOutside: o.caughtOutside } };
    };
    expect(resultEvadePartJa(undefined, 0, r())).toBe('');
    expect(resultEvadePartJa(400, 400, r({ caughtOutside: false }))).toBe(' ・ 回避 400');
    expect(resultEvadePartJa(400, 0, r())).toBe(' ・ 回避 0（夜明け後）');
    expect(resultEvadePartJa(400, 0, r({ detections: 2 }))).toBe(' ・ 回避 0');
    expect(resultEvadePartJa(400, 0, r({ objectiveDone: false }))).toBe(' ・ 回避 0');
    expect(resultEvadePartJa(400, 0, r({ returned: false }))).toBe(' ・ 回避 0');
    expect(resultEvadePartJa(400, 0, r({ caughtOutside: false, detections: 1 }))).toBe(' ・ 回避 0');
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
