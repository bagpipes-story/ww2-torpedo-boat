// v0.6.2 実機 1 回目: 制空権下で敵艦隊がいなくなれば任務終了（cleared。us_02 の fleet_gone_clears）と、終わり際の魚雷待ち（torpedo_end_settle_s）。
// core/mission-flow の decideMissionEnd・stepEndSettle・endCountsAsReturn、systems/mission-end（世界の形だけを受ける）、Result の見出しと得点、config/dawn-data の検査。
import { describe, expect, it } from 'vitest';
import hitRateModel from '../data/hit_rate_model.json';
import scoring from '../data/scoring.json';
import { checkPlayableDawn, getDawnAir } from '../src/config/dawn-data';
import { gameData, getPrototypeMission } from '../src/config/game-data';
import { createDawnResult } from '../src/core/dawn-air';
import { createInputState } from '../src/core/input-state';
import { createEndSettle, decideMissionEnd, endCountsAsReturn, promoteAdriftToCleared, stepEndSettle, type EndCheck, type MissionEndReason } from '../src/core/mission-flow';
import { computeScore, isScoringDataRecord, scoringParamsFromData, type ScoreInput } from '../src/core/scoring';
import { MissionEnd, type MissionEndWorld } from '../src/systems/mission-end';
import { buildWorldSetup } from '../src/systems/world-setup';
import { dawnResultLine } from '../src/ui/dawn-lines';
import { REASON_LABEL, resultDawnSuffixS, resultHeadingJa, resultReturnJa } from '../src/ui/result-heading';

type Rec = Record<string, unknown>;
const clone = (): typeof gameData => JSON.parse(JSON.stringify(gameData)) as typeof gameData;
const byId = (d: typeof gameData, id: string): Rec => (d.missionsSeed.missions as unknown as Rec[]).find((m) => m['id'] === id)!;
const protoOf = (d: typeof gameData, id: string): Rec => byId(d, id)['v0_1_prototype'] as Rec;
const PLAYABLE = ['us_01', 'us_02', 'us_03', 'jp_01', 'jp_02', 'jp_05', 'jp_06']; // v0.6.4: jp_01 も（魚雷を撃たないが return_point の形は同じ）。v0.6.7: jp_02 も（同じ）
const P = { torpedoSettleMaxS: 10, adriftDelayS: 1.5, endSettleS: 3 };
const SINKS: MissionEndReason[] = ['rammed', 'destroyed', 'friendly_fire', 'storm', 'bombed', 'air_strike', 'barge_fire', 'shore_battery', 'pt_fire'];

function check(over: Partial<EndCheck>): EndCheck {
  return { boatSinking: false, atHome: false, torpedoesRunning: false, waitS: 0, timeLeftS: 100, destroyerSinkPlaying: false, fuelEmpty: false, stopped: false, grounded: false, fleetGone: false, ...over };
}

describe('decideMissionEnd の cleared（v0.6.2 実機 1 回目）', () => {
  it('敵艦隊なしは cleared（夜明けの前でも後でも）。撃沈の演出中は待つ。沈没中は何も決めない', () => {
    expect(decideMissionEnd(check({ fleetGone: true }), P)).toBe('cleared');
    expect(decideMissionEnd(check({ fleetGone: true, timeLeftS: 0 }), P)).toBe('cleared');
    expect(decideMissionEnd(check({ fleetGone: true, timeLeftS: -40 }), P)).toBe('cleared');
    expect(decideMissionEnd(check({ fleetGone: true, destroyerSinkPlaying: true }), P)).toBeNull();
    expect(decideMissionEnd(check({ fleetGone: true, boatSinking: true }), P)).toBeNull();
    // 走っている魚雷があっても理由は決まる（待つのは stepEndSettle）
    expect(decideMissionEnd(check({ fleetGone: true, torpedoesRunning: true }), P)).toBe('cleared');
  });
  it('優先: 輪の中（帰投）と座礁が先、漂流より先', () => {
    expect(decideMissionEnd(check({ fleetGone: true, atHome: true }), P)).toBe('returned');
    expect(decideMissionEnd(check({ fleetGone: true, atHome: true, torpedoesRunning: true }), P)).toBeNull();
    expect(decideMissionEnd(check({ fleetGone: true, grounded: true, waitS: 1.5 }), P)).toBe('grounded');
    expect(decideMissionEnd(check({ fleetGone: true, grounded: true, waitS: 1 }), P)).toBeNull();
    expect(decideMissionEnd(check({ fleetGone: true, fuelEmpty: true, stopped: true, waitS: 5 }), P)).toBe('cleared');
  });
  it('fleetGone が false なら v0.6.2 と同じ（乱数の 500 通り。夜明け後の輪の中の待ちだけが違う）', () => {
    let seed = 7;
    const r = (): number => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
    const old = (c: EndCheck): MissionEndReason | null => {
      if (c.boatSinking) return null;
      if (c.atHome && (!c.torpedoesRunning || c.waitS >= P.torpedoSettleMaxS || c.timeLeftS <= 0)) return 'returned';
      if (c.atHome) return null;
      if (c.grounded) return c.waitS >= P.adriftDelayS ? 'grounded' : null;
      if (c.destroyerSinkPlaying) return null;
      if (c.fuelEmpty && c.stopped && c.waitS >= P.adriftDelayS) return 'adrift';
      return null;
    };
    for (let n = 0; n < 500; n++) {
      const c = check({ boatSinking: r() < 0.1, atHome: r() < 0.5, torpedoesRunning: r() < 0.5, waitS: r() * 12, timeLeftS: r() < 0.5 ? 50 : -r() * 100, destroyerSinkPlaying: r() < 0.2, fuelEmpty: r() < 0.5, stopped: r() < 0.5, grounded: r() < 0.2 });
      const afterDawnWait = c.atHome && c.torpedoesRunning && c.timeLeftS <= 0 && !c.boatSinking;
      if (afterDawnWait) expect(decideMissionEnd(c, P)).toBe(c.waitS >= P.endSettleS ? 'returned' : null);
      else expect(decideMissionEnd(c, P)).toBe(old(c));
    }
  });
});

describe('stepEndSettle（終わり際の魚雷待ち。v0.6.2 実機 1 回目）', () => {
  it('自艇の沈没: 沈み始めて窓を開け、沈没の演出が終わるまでは終えない。魚雷が無ければ演出の完了で終える', () => {
    const s = createEndSettle();
    expect(stepEndSettle(s, 10, true, null, null, false, 3)).toBeNull();
    expect([s.sinking, s.openedAtS]).toEqual([true, 10]);
    expect(stepEndSettle(s, 11.9, true, null, null, false, 3)).toBeNull();
    expect(s.openedAtS).toBe(10); // 窓は動かない
    expect(stepEndSettle(s, 12, true, 'destroyed', null, false, 3)).toBe('destroyed');
  });
  it('自艇の沈没: 魚雷が走っていれば、演出の完了と「決着か 3 秒」の遅い方', () => {
    for (const reason of SINKS) {
      const s = createEndSettle();
      stepEndSettle(s, 10, true, null, null, true, 3);
      expect(stepEndSettle(s, 12, true, reason, null, true, 3), reason).toBeNull(); // 演出は終わったが魚雷が走っている
      expect(stepEndSettle(s, 12.99, true, reason, null, true, 3), reason).toBeNull();
      expect(stepEndSettle(s, 13, true, reason, null, true, 3), reason).toBe(reason); // 沈み始めて 3 秒
      const t = createEndSettle();
      stepEndSettle(t, 10, true, null, null, true, 3);
      expect(stepEndSettle(t, 12.5, true, reason, null, false, 3), reason).toBe(reason); // 決着した
    }
    // 演出が 3 秒より長くても、演出の完了まで待つ
    const u = createEndSettle();
    stepEndSettle(u, 0, true, null, null, true, 3);
    expect(stepEndSettle(u, 5, true, null, null, false, 3)).toBeNull();
    expect(stepEndSettle(u, 5.1, true, 'rammed', null, true, 3)).toBe('rammed');
  });
  it('returned はすぐ終える（輪の中の待ちは decideMissionEnd）。cleared・adrift・grounded は理由が決まってから「決着か 3 秒」', () => {
    expect(stepEndSettle(createEndSettle(), 50, false, null, 'returned', true, 3)).toBe('returned');
    for (const reason of ['cleared', 'adrift', 'grounded'] as MissionEndReason[]) {
      expect(stepEndSettle(createEndSettle(), 50, false, null, reason, false, 3), reason).toBe(reason); // 魚雷が無ければその場で
      const s = createEndSettle();
      expect(stepEndSettle(s, 50, false, null, reason, true, 3), reason).toBeNull();
      expect(s.openedAtS).toBe(50);
      // 理由は固定（輪に入っても・判定が外れても変えない）
      expect(stepEndSettle(s, 51, false, null, 'returned', true, 3), reason).toBeNull();
      expect(stepEndSettle(s, 52, false, null, null, true, 3), reason).toBeNull();
      expect(stepEndSettle(s, 52.99, false, null, null, true, 3), reason).toBeNull();
      expect(stepEndSettle(s, 53, false, null, null, true, 3), reason).toBe(reason);
      const t = createEndSettle();
      stepEndSettle(t, 50, false, null, reason, true, 3);
      expect(stepEndSettle(t, 51.2, false, null, null, false, 3), reason).toBe(reason); // 命中か外れで決着
    }
  });
  it('窓の間に自艇が沈み始めたら沈没の窓に替える（理由は沈没、窓は沈み始めてから）', () => {
    const s = createEndSettle();
    expect(stepEndSettle(s, 50, false, null, 'cleared', true, 3)).toBeNull();
    expect(stepEndSettle(s, 51, true, null, null, true, 3)).toBeNull();
    expect([s.reason, s.openedAtS, s.sinking]).toEqual([null, 51, true]);
    expect(stepEndSettle(s, 53, true, 'bombed', null, true, 3)).toBeNull();
    expect(stepEndSettle(s, 54, true, 'bombed', null, true, 3)).toBe('bombed');
  });
  it('決まった入力の列なら同じ結果（乱数なし）。settleS 0 なら待たない', () => {
    const run = (): (MissionEndReason | null)[] => {
      const s = createEndSettle();
      const out: (MissionEndReason | null)[] = [];
      for (let i = 0; i < 300; i++) out.push(stepEndSettle(s, i / 60, i >= 30, i >= 150 ? 'air_strike' : null, i === 10 ? 'cleared' : null, i < 200, 3));
      return out;
    };
    const a = run();
    expect(run()).toEqual(a);
    // cleared の窓（i=10）は沈み始め（i=30）で沈没の窓に替わる。演出の完了 i=150、沈み始めて 3 秒は i=210、魚雷の決着 i=200 → 200 で終わる
    expect(a.indexOf('air_strike')).toBe(200);
    expect(a.slice(0, 200).every((x) => x === null)).toBe(true);
    expect(stepEndSettle(createEndSettle(), 0, false, null, 'adrift', true, 0)).toBe('adrift');
  });
});

/** 世界の形だけ（systems/mission-end の MissionEndWorld） */
function fakeWorld(over: Partial<{ sinking: boolean; atHome: boolean; grounded: boolean; unresolved: number; queued: number; sinkPlaying: boolean; allOut: boolean; fuelEmpty: boolean; band: string; t: number }> = {}) {
  const o = { sinking: false, atHome: false, grounded: false, unresolved: 0, queued: 0, sinkPlaying: false, allOut: false, fuelEmpty: false, band: 'cruise', t: 0, ...over };
  const w = {
    o,
    get boat() {
      return { sinking: o.sinking };
    },
    get atHome() {
      return o.atHome;
    },
    get grounded() {
      return o.grounded;
    },
    get torpedoesRunning() {
      return o.unresolved > 0 || o.queued > 0;
    },
    get torpedoes() {
      return { unresolvedCount: o.unresolved };
    },
    get enemy() {
      return { sinkPlaying: o.sinkPlaying, allOut: o.allOut };
    },
    get fuel() {
      return { empty: o.fuelEmpty };
    },
    get band() {
      return o.band;
    },
    get stepTimeS() {
      return o.t;
    },
  };
  return w satisfies MissionEndWorld;
}

const RP_US02 = getPrototypeMission(gameData, 'us_02').returnPoint;
/** 終わり際の魚雷待ち（data。v0.6.2 実機 2 回目で 3 → 5 秒） */
const S = RP_US02.torpedoEndSettleS;

describe('systems/mission-end（v0.6.2 実機 1 回目で mission-scene から切り出し）', () => {
  const RP = RP_US02;
  it('us_02（fleet_gone_clears）: 駆逐艦・輸送船がすべて沈み始めたか退いたら、撃沈の演出の後に cleared。fleet_gone_clears の無い任務は終わらない', () => {
    const e = new MissionEnd(RP, 1.5, true);
    const w = fakeWorld({ allOut: true, sinkPlaying: true, t: 40 });
    expect(e.step(w, 0, 100)).toBeNull();
    w.o.sinkPlaying = false;
    expect(e.step(w, 0, 100)).toBe('cleared');
    const off = new MissionEnd(RP, 1.5, false);
    expect(off.step(fakeWorld({ allOut: true, t: 40 }), 0, 100)).toBeNull();
    expect(off.step(fakeWorld({ allOut: true, t: 40 }), 0, -20)).toBeNull(); // 夜明け後も
  });
  it('cleared の窓: 走っている魚雷を最大 torpedo_end_settle_s（5 秒）待つ', () => {
    const e = new MissionEnd(RP, 1.5, true);
    const w = fakeWorld({ allOut: true, unresolved: 1, t: 40 });
    expect(e.step(w, 0, 100)).toBeNull();
    w.o.t = 40 + S - 0.1;
    expect(e.step(w, 0, 100)).toBeNull();
    w.o.t = 40 + S;
    expect(e.step(w, 0, 100)).toBe('cleared');
  });
  it('自艇の沈没: 沈没の演出の完了（boatSunk）で、魚雷が無ければすぐ、走っていれば沈み始めて torpedo_end_settle_s まで待つ。発射待ちは数えない（沈んだ艇からは撃たない）', () => {
    const e = new MissionEnd(RP, 1.5, false);
    const w = fakeWorld({ sinking: true, unresolved: 2, t: 10 });
    expect(e.step(w, 0, 100)).toBeNull(); // 沈み始め（窓を開ける）
    w.o.t = 12;
    expect(e.boatSunk(w, 'destroyed')).toBeNull();
    w.o.t = 12.5;
    expect(e.step(w, 0, 100)).toBeNull();
    w.o.unresolved = 0; // 命中か外れで決着
    expect(e.step(w, 0, 100)).toBe('destroyed');
    const q = new MissionEnd(RP, 1.5, false);
    const wq = fakeWorld({ sinking: true, queued: 2, t: 10 });
    expect(q.step(wq, 0, 100)).toBeNull();
    wq.o.t = 12;
    expect(q.boatSunk(wq, 'rammed')).toBe('rammed');
  });
  it('夜明け後に輪の中: 走っている魚雷を輪に入ってから torpedo_end_settle_s（5 秒）待つ（夜明け前は 10 秒）', () => {
    const e = new MissionEnd(RP, 1.5, false);
    const w = fakeWorld({ atHome: true, unresolved: 1, band: 'stop', t: 200 });
    expect(e.step(w, S - 0.1, -10)).toBeNull();
    expect(e.step(w, S, -10)).toBe('returned');
    expect(new MissionEnd(RP, 1.5, false).step(w, S, 10)).toBeNull();
    expect(new MissionEnd(RP, 1.5, false).step(w, 10, 10)).toBe('returned');
  });
  it('漂流・座礁: 理由が決まってから torpedo_end_settle_s（5 秒）まで待つ', () => {
    const e = new MissionEnd(RP, 1.5, false);
    const w = fakeWorld({ fuelEmpty: true, band: 'stop', unresolved: 1, t: 90 });
    expect(e.step(w, 1.5, 50)).toBeNull();
    w.o.t = 90 + S - 0.1;
    expect(e.step(w, 1.5 + S - 0.1, 50)).toBeNull();
    w.o.t = 90 + S;
    expect(e.step(w, 1.5 + S, 50)).toBe('adrift');
    const g = new MissionEnd(RP, 1.5, false);
    const wg = fakeWorld({ grounded: true, band: 'stop', t: 90 });
    expect(g.step(wg, 1.5, 50)).toBe('grounded');
  });
});

describe('レビューの直し: 漂流の窓の間に敵艦隊がいなくなれば cleared（promoteAdriftToCleared）', () => {
  it('core: 漂流の窓だけを上げる。撃沈の演出の間は待ち（true）、上げたら窓を開け直す。座礁・沈没・cleared・窓なしは変えない', () => {
    const s = createEndSettle();
    expect(stepEndSettle(s, 50, false, null, 'adrift', true, 3)).toBeNull();
    expect(promoteAdriftToCleared(s, 51, false, false, false)).toBe(false); // 艦隊はまだいる
    expect([s.reason, s.openedAtS]).toEqual(['adrift', 50]);
    expect(promoteAdriftToCleared(s, 51, false, true, true)).toBe(true); // 撃沈の演出中は終えない
    expect([s.reason, s.openedAtS]).toEqual(['adrift', 50]);
    expect(promoteAdriftToCleared(s, 53, false, true, false)).toBe(false);
    expect([s.reason, s.openedAtS]).toEqual(['cleared', 53]);
    for (const reason of ['grounded', 'cleared'] as MissionEndReason[]) {
      const t = createEndSettle();
      stepEndSettle(t, 50, false, null, reason, true, 3);
      expect(promoteAdriftToCleared(t, 52, false, true, true), reason).toBe(false);
      expect([t.reason, t.openedAtS], reason).toEqual([reason, 50]);
    }
    expect(promoteAdriftToCleared(createEndSettle(), 1, false, true, true)).toBe(false); // 窓なし（decideMissionEnd が待つ）
    const k = createEndSettle();
    stepEndSettle(k, 50, false, null, 'adrift', true, 3);
    expect(promoteAdriftToCleared(k, 51, true, true, true)).toBe(false); // 沈み始めた（沈没の窓に替わる）
  });
  it('mission-end: 漂流の窓が開いた後に走っていた魚雷が最後の艦を沈めると、撃沈の演出の後に cleared（帰投と同じに数える）。fleet_gone_clears の無い任務は漂流のまま', () => {
    for (const clears of [true, false]) {
      const e = new MissionEnd(RP_US02, 1.5, clears);
      const w = fakeWorld({ fuelEmpty: true, band: 'stop', unresolved: 1, t: 90 });
      expect(e.step(w, 1.5, 50), String(clears)).toBeNull(); // 漂流の窓を開ける（90）
      w.o.t = 90.7; // 命中で最後の艦が沈み始める
      Object.assign(w.o, { unresolved: 0, allOut: true, sinkPlaying: true });
      if (!clears) {
        expect(e.step(w, 2.2, 50)).toBe('adrift');
        continue;
      }
      expect(e.step(w, 2.2, 50)).toBeNull();
      w.o.t = 90 + S + 0.2;
      expect(e.step(w, 1.5 + S + 0.2, 50)).toBeNull(); // 窓を開けて torpedo_end_settle_s を過ぎても演出の間は待つ
      w.o.sinkPlaying = false;
      expect(e.step(w, 4.3, 50)).toBe('cleared');
      expect(endCountsAsReturn('cleared')).toBe(true);
    }
  });
  it('mission-end: 上げた cleared の窓は上げたときから最大 torpedo_end_settle_s（終わり際の当たりの魚雷を待つ）', () => {
    const e = new MissionEnd(RP_US02, 1.5, true);
    const w = fakeWorld({ fuelEmpty: true, band: 'stop', unresolved: 2, t: 90 });
    expect(e.step(w, 1.5, 50)).toBeNull();
    Object.assign(w.o, { t: 92.5, unresolved: 1, allOut: true, sinkPlaying: false });
    expect(e.step(w, 4, 50)).toBeNull(); // 92.5 から開け直し（漂流の窓のままなら 90 + S で終わる）
    w.o.t = 90 + S + 0.2;
    expect(e.step(w, 1.5 + S + 0.2, 50)).toBeNull();
    w.o.t = 92.5 + S;
    expect(e.step(w, 4 + S, 50)).toBe('cleared');
  });
});

describe('レビューの直し: 窓（cleared・漂流・座礁）の間は新しい魚雷を撃たない（holdFire）', () => {
  const fireWorld = (): { input: ReturnType<typeof createInputState>; launcher: { cleared: number; clearQueue(): void } } => {
    const launcher = { cleared: 0, clearQueue: () => void launcher.cleared++ };
    return { input: createInputState(), launcher };
  };
  const tap = (f: ReturnType<typeof fireWorld>): void => {
    f.input.fireTap = true;
    f.input.fireSalvoSpreadDeg = 4;
    f.input.fireSalvoCount = 2;
  };
  it('窓が開くまでは触らない（窓より前の世界は同じ）。漂流・座礁の窓が開いたら発射の要求と残りの一斉発射を捨てる', () => {
    for (const grounded of [false, true]) {
      const e = new MissionEnd(RP_US02, 1.5, false);
      const f = fireWorld();
      const w = fakeWorld(grounded ? { grounded: true, band: 'stop', unresolved: 1, t: 90 } : { fuelEmpty: true, band: 'stop', unresolved: 1, t: 90 });
      tap(f);
      expect(e.step(w, 1.4, 50)).toBeNull(); // まだ窓は開いていない（1.5 秒の前）
      e.holdFire(f);
      expect([f.input.fireTap, f.input.fireSalvoCount, f.launcher.cleared], String(grounded)).toEqual([true, 2, 0]);
      expect(e.step(w, 1.5, 50)).toBeNull(); // 窓が開く
      e.holdFire(f);
      expect([f.input.fireTap, Number.isNaN(f.input.fireSalvoSpreadDeg), f.input.fireSalvoCount, f.launcher.cleared], String(grounded)).toEqual([false, true, 0, 1]);
    }
  });
  it('沈没の窓の間は何もしない（沈み始めた艇は world-input が撃たない）', () => {
    const e = new MissionEnd(RP_US02, 1.5, false);
    const f = fireWorld();
    expect(e.step(fakeWorld({ sinking: true, unresolved: 1, t: 10 }), 0, 50)).toBeNull();
    tap(f);
    e.holdFire(f);
    expect([f.input.fireTap, f.launcher.cleared]).toEqual([true, 0]);
  });
});

describe('cleared の Result と得点（帰投と同じに数える）', () => {
  it('endCountsAsReturn は returned と cleared だけ', () => {
    const all = Object.keys(REASON_LABEL) as MissionEndReason[];
    expect(all).toContain('cleared');
    expect(all.filter(endCountsAsReturn)).toEqual(['returned', 'cleared']);
  });
  it('見出し「任務終了 — 敵艦隊なし（制空権下・帰投不要）」に夜明け後・ハード・史実が付く。帰投は「不要」、夜明けの行は「前に敵艦隊なし」', () => {
    const before = { reached: false, caughtOutside: false, daylightS: 0 };
    const caught = { reached: true, caughtOutside: true, daylightS: 41.6 };
    expect(resultHeadingJa('cleared', resultDawnSuffixS(true, before), false, false)).toBe('任務終了 — 敵艦隊なし（制空権下・帰投不要）');
    expect(resultHeadingJa('cleared', resultDawnSuffixS(true, caught), true, true)).toBe('任務終了 — 敵艦隊なし（制空権下・帰投不要）（夜明け後 42 秒）（ハード）（史実）');
    expect([resultReturnJa('cleared', true), resultReturnJa('returned', true), resultReturnJa('destroyed', false)]).toEqual(['不要', 'あり', 'なし']);
    const d = { ...createDawnResult(), timeLeftAtEndS: 60.2 };
    expect(dawnResultLine(d, true, true)).toBe('夜明け: 前に敵艦隊なし（残り 61 秒）');
    expect(dawnResultLine(d, true)).toBe('夜明け: 前に帰投（残り 61 秒）');
  });
  it('得点は帰投と同じ（cleared が「沈めて帰投」を上回らない）。夜明けに輪の外なら帰投点 × after_dawn_factor', () => {
    if (!isScoringDataRecord(scoring)) throw new Error('scoring data');
    const sp = scoringParamsFromData(scoring, hitRateModel.kpi_by_range.map((b) => b.band));
    const base = (reason: MissionEndReason, over: Partial<ScoreInput> = {}): ScoreInput => ({
      returned: endCountsAsReturn(reason),
      objectiveDone: true,
      missionType: 'intercept_destroyer',
      bands: [{ band: '800-1200yd', hits: 2, duds: 0 }],
      kills: 1,
      killEnemyId: 'ijn_transport',
      fuelLeftPct: 40,
      crewAlive: 12,
      crewTotal: 14,
      detections: 0,
      ...over,
    });
    for (const afterDawn of [false, true]) {
      expect(computeScore(base('cleared', { afterDawn }), sp), String(afterDawn)).toEqual(computeScore(base('returned', { afterDawn }), sp));
    }
    expect(computeScore(base('cleared', { afterDawn: true }), sp).survival).toBe(Math.round(sp.returnedPoints * sp.afterDawnFactor));
    // 艦隊が退いただけ（撃沈なし）の cleared は、沈めて帰投より低い
    const withdrew = computeScore(base('cleared', { objectiveDone: false, bands: [], kills: 0, afterDawn: true }), sp).total;
    expect(withdrew).toBeLessThan(computeScore(base('returned'), sp).total);
    expect(withdrew).toBe(Math.round(sp.returnedPoints * sp.afterDawnFactor));
    // 沈没（帰投なし）は帰投点・燃料・乗員が 0
    expect(computeScore(base('destroyed'), sp).survival).toBe(0);
  });
});

describe('data: fleet_gone_clears（us_02）と torpedo_end_settle_s', () => {
  it('us_02 だけが fleet_gone_clears。理由はユーザーの言葉', () => {
    for (const id of PLAYABLE) expect(getDawnAir(gameData, id).fleetGoneClears, id).toBe(id === 'us_02');
    expect(buildWorldSetup(gameData, 'us_02').dawnAir.fleetGoneClears).toBe(true);
    expect(String(protoOf(gameData, 'us_02')['fleet_gone_clears_source'])).toContain('帰投は必須ではない');
    expect(getDawnAir(gameData, 'us_04').fleetGoneClears).toBe(false); // 遊べない任務
  });
  it('遊べる 5 任務の帰投地点に torpedo_end_settle_s 5 秒（design。実機 1 回目「3秒ほど待ってほしい」→ 2 回目「5秒にしましょう」）', () => {
    for (const id of PLAYABLE) {
      expect(getPrototypeMission(gameData, id).returnPoint.torpedoEndSettleS, id).toBe(5);
      const src = String((protoOf(gameData, id)['return_point'] as Rec)['torpedo_end_settle_s_source']);
      expect(src, id).toContain('design (v0.6.2 実機 2 回目');
      expect(src, id).toContain('5秒にしましょう');
      expect(src, id).toContain('3秒ほど待ってほしい');
    }
  });
  it('検査: 制空権下（play_as own）で駆逐艦のいる任務だけ。値は真偽、source（design）が要る。崩れたら任務の id を付けて例外', () => {
    const SRC = 'design (テスト)';
    const cases: [string, (d: typeof gameData) => void, RegExp][] = [
      ['us_01', (d) => Object.assign(protoOf(d, 'us_01'), { fleet_gone_clears: true, fleet_gone_clears_source: SRC }), /us_01.*own/],
      ['jp_06', (d) => Object.assign(protoOf(d, 'jp_06'), { fleet_gone_clears: false, fleet_gone_clears_source: SRC }), /jp_06.*own/],
      ['us_02', (d) => (protoOf(d, 'us_02')['fleet_gone_clears'] = 'yes'), /us_02.*true か false/],
      ['us_02', (d) => delete protoOf(d, 'us_02')['fleet_gone_clears_source'], /us_02.*fleet_gone_clears_source/],
      ['us_02', (d) => (protoOf(d, 'us_02')['fleet_gone_clears_source'] = 'historical'), /us_02.*design/],
      ['us_02', (d) => delete protoOf(d, 'us_02')['fleet_gone_clears'], /us_02.*fleet_gone_clears_source だけ/],
      [
        'us_03',
        (d) => {
          // 制空権下にした大発の任務（駆逐艦がいない）
          Object.assign(byId(d, 'us_03')['dawn_air'] as Rec, { control: 'own', play_as: 'own' });
          const p = protoOf(d, 'us_03');
          delete p['dawn_strike'];
          p['hazards'] = (p['hazards'] as string[]).filter((h) => h !== 'dawn_air_strike');
          Object.assign(p, { fleet_gone_clears: true, fleet_gone_clears_source: SRC });
        },
        /us_03.*駆逐艦/,
      ],
    ];
    for (const [id, breakIt, re] of cases) {
      const d = clone();
      breakIt(d);
      expect(() => getDawnAir(d, id), `${id} ${re}`).toThrow(re);
      expect(() => checkPlayableDawn(d, id), `${id} ${re}`).toThrow(re);
      expect(() => buildWorldSetup(d, id), `${id} ${re}`).toThrow();
    }
    // false は制空権下の駆逐艦の任務なら置ける（終わらない）
    const off = clone();
    protoOf(off, 'us_02')['fleet_gone_clears'] = false;
    expect(getDawnAir(off, 'us_02').fleetGoneClears).toBe(false);
  });
});
