// 夜明けに敵が退く（v0.6.2。docs/02 §6.7）: 艦の AI の退避、海域を出た判定と隊の数え方（core/dawn-withdraw）、大発の夜明けの逃走（core/barges）、
// v0_1_prototype.dawn_withdraw の data と遊べる任務の規則（config/dawn-data）。entities/destroyer・systems/destroyer-group は Phaser に依存するので、
// それらが使う core の関数（startRetire・updateShipAi・beyondBounds・sinkingCount・allShipsOut・allShipsSettled）を同じ手順で回して試す。
import { describe, expect, it, vi } from 'vitest';
import { gameData, getBargeParams, getPrototypeMission } from '../src/config/game-data';
import { checkPlayableDawn, getDawnAir } from '../src/config/dawn-data';
import type { BoatState, SeaBounds } from '../src/core/boat-motion';
import { BARGE_ALERT, BARGE_BEACHED, BARGE_CRUISE, BARGE_RUN, BARGE_SUNK, createFlotilla, stepFlotilla, type FlotillaCheck, type FlotillaEvents } from '../src/core/barges';
import { allShipsOut, allShipsSettled, beyondBounds, dawnWithdrawFromData, retireDirJa, retireHeadingDeg, sinkingCount, withdrawnCount, type ShipOutState } from '../src/core/dawn-withdraw';
import { SeededRng } from '../src/core/rng';
import { createShipAiState, startRetire, steerShip, turnRateFor, updateShipAi, type ShipAiParams } from '../src/core/ship-ai';
import { createTorpedoState, launchTorpedo, type TorpedoState } from '../src/core/torpedo';
import { buildWorldSetup } from '../src/systems/world-setup';

type Rec = Record<string, unknown>;
const clone = (): typeof gameData => JSON.parse(JSON.stringify(gameData)) as typeof gameData;
const byId = (d: typeof gameData, id: string): Rec => (d.missionsSeed.missions as unknown as Rec[]).find((m) => m['id'] === id)!;
const protoOf = (d: typeof gameData, id: string): Rec => byId(d, id)['v0_1_prototype'] as Rec;
const dawnAirOf = (d: typeof gameData, id: string): Rec => byId(d, id)['dawn_air'] as Rec;
const PLAYABLE = ['us_01', 'us_02', 'us_03', 'jp_01', 'jp_05', 'jp_06']; // v0.6.4: jp_01（米PT は夜明けのラッチで去る＝none）

const US02 = buildWorldSetup(gameData, 'us_02');
const DS = US02.destroyer!;
const P: ShipAiParams = { ...DS.shipAi, wakeSpotRatePerS: Infinity }; // 見張りの抽選を外す（見える距離に入った瞬間に気づく）
const SEA: SeaBounds = { width: 20000, height: 20000 };
const RNG = new SeededRng(1);
const far = (): BoatState => ({ x: 15000, y: 15000, headingDeg: 0, speedMps: 0 });
const ship = (x = 10000, y = 10000, h = 90): BoatState => ({ x, y, headingDeg: h, speedMps: P.cruiseSpeedMps });
const torpedoAt = (x: number, y: number, heading: number): TorpedoState => {
  const t = createTorpedoState();
  launchTorpedo(t, x, y, heading, false, false, 0, 800, 25);
  return t;
};

describe('ship-ai の退避（v0.6.2。夜明けのラッチで startRetire）', () => {
  it('作った直後は退いていない（retiring false・向き 0）。startRetire で立ち、向きは 0〜360 に丸める', () => {
    const ai = createShipAiState(135, P.cruiseSpeedMps);
    expect([ai.retiring, ai.retireHeadingDeg]).toEqual([false, 0]);
    startRetire(ai, -90);
    expect([ai.retiring, ai.retireHeadingDeg]).toEqual([true, 270]);
  });
  it('退避中: モード retire、退く向きへ最大速力、旋回率は通常', () => {
    const ai = createShipAiState(90, P.cruiseSpeedMps);
    startRetire(ai, 0);
    updateShipAi(ai, ship(), far(), 2500, 8, [], P, SEA, 0.1, RNG);
    expect(ai.mode).toBe('retire');
    expect(ai.desiredHeadingDeg).toBe(0);
    expect(ai.desiredSpeedMps).toBeCloseTo(P.maxSpeedMps, 9);
    expect(turnRateFor('retire', P)).toBe(P.turnRateDegS);
  });
  it('退避中は体当たりしない（発見済み・trigger_m の内でも）。発見そのものは続く（砲と探照灯は海域を出るまで）', () => {
    const ai = createShipAiState(90, P.cruiseSpeedMps);
    const player: BoatState = { x: 10000, y: 10200, headingDeg: 0, speedMps: 0 }; // 南 200 m
    updateShipAi(ai, ship(), player, 2500, 8, [], P, SEA, 0.1, RNG);
    expect(ai.mode).toBe('ram'); // 夜明け前は体当たり
    startRetire(ai, 0);
    for (let i = 0; i < 20; i++) updateShipAi(ai, ship(), player, 2500, 8, [], P, SEA, 0.1, RNG);
    expect(ai.mode).toBe('retire');
    expect(ai.desiredHeadingDeg).toBe(0);
    expect(ai.playerDetected).toBe(true);
  });
  it('退避中は海域の端で向き直さない（哨戒の針路も変えない）。退いていなければ同じ位置で向き直す', () => {
    const edge = ship(10000, P.edgeTurnMarginM / 2, 0); // 北の端の余白の内で北向き
    const night = createShipAiState(0, P.cruiseSpeedMps);
    updateShipAi(night, { ...edge }, far(), 2500, 8, [], P, SEA, 0.1, RNG);
    expect(night.desiredHeadingDeg).not.toBe(0);
    const dawn = createShipAiState(0, P.cruiseSpeedMps);
    startRetire(dawn, 0);
    updateShipAi(dawn, { ...edge }, far(), 2500, 8, [], P, SEA, 0.1, RNG);
    expect(dawn.desiredHeadingDeg).toBe(0);
    expect(dawn.patrolHeadingDeg).toBe(0);
  });
  it('回避は退避より優先（見た雷跡は避ける）。魚雷が去れば退く向きへ全速に戻る', () => {
    const ai = createShipAiState(90, P.cruiseSpeedMps);
    startRetire(ai, 0);
    const s = ship();
    const torps = [torpedoAt(10000, 10600, 0)]; // 南 600 m から北上
    for (let i = 0; i < Math.round(P.reactionDelayS / 0.1) + 2; i++) updateShipAi(ai, s, far(), 2500, 8, torps, P, SEA, 0.1, RNG);
    expect(ai.mode).toBe('evade');
    torps[0]!.active = false;
    updateShipAi(ai, s, far(), 2500, 8, torps, P, SEA, 0.1, RNG);
    expect(ai.mode).toBe('retire');
    expect(ai.desiredHeadingDeg).toBe(0);
    expect(ai.desiredSpeedMps).toBeCloseTo(P.maxSpeedMps, 9);
  });
});

describe('退く向きと海域を出た判定（core/dawn-withdraw）', () => {
  it('retireHeadingDeg: 北 0・南 180・東 90・西 270。左右反転の夜は東と西を入れ替え、北と南は変わらない', () => {
    expect((['north', 'south', 'east', 'west'] as const).map((e) => retireHeadingDeg(e, false))).toEqual([0, 180, 90, 270]);
    expect((['north', 'south', 'east', 'west'] as const).map((e) => retireHeadingDeg(e, true))).toEqual([0, 180, 270, 90]);
    // 方角の日本語（Briefing の条件・夜明けの帯・Result）は向きと同じ規則
    expect((['north', 'south', 'east', 'west'] as const).map((e) => retireDirJa(e, false))).toEqual(['北', '南', '東', '西']);
    expect((['north', 'south', 'east', 'west'] as const).map((e) => retireDirJa(e, true))).toEqual(['北', '南', '西', '東']);
  });
  it('beyondBounds: 縁の外へ余白より遠く出たときだけ（縁ちょうど・余白ちょうどは内）', () => {
    const b = { width: 6000, height: 3000 };
    expect(beyondBounds(3000, 1500, b, 50)).toBe(false);
    expect(beyondBounds(3000, 0, b, 50)).toBe(false);
    expect(beyondBounds(3000, -50, b, 50)).toBe(false);
    expect([beyondBounds(3000, -50.01, b, 50), beyondBounds(3000, 3050.01, b, 50), beyondBounds(-50.01, 1500, b, 50), beyondBounds(6050.01, 1500, b, 50)]).toEqual([true, true, true, true]);
  });
  it('us_02（ハード: 駆逐艦 2 隻＋輸送船）: 出発点から北へ退くと、全隻が北の縁の外（−boundsMarginM より先）へ抜ける。entities/destroyer と同じ手順（退避中は縁で止めない）', () => {
    const s = buildWorldSetup(gameData, 'us_02', { hard: true });
    const d = s.destroyer!;
    const t = s.transport!;
    const fleet = [...d.starts.map((st) => ({ st, ai: d.shipAi, margin: d.spec.boundsMarginM })), { st: t.start, ai: t.shipAi, margin: t.spec.boundsMarginM }];
    expect(fleet.length).toBe(3);
    const heading = retireHeadingDeg('north', s.night.mirrored);
    const realDt = 1 / 60;
    for (const f of fleet) {
      const p = { ...f.ai, wakeSpotRatePerS: Infinity };
      const st: BoatState = { ...f.st, speedMps: p.cruiseSpeedMps };
      const ai = createShipAiState(st.headingDeg, p.cruiseSpeedMps);
      startRetire(ai, heading);
      let steps = 0;
      while (!beyondBounds(st.x, st.y, s.mission.bounds, f.margin) && steps < 60 * 600) {
        updateShipAi(ai, st, far(), 0, 8, [], p, s.mission.bounds, realDt, RNG);
        steerShip(st, ai.desiredHeadingDeg, ai.desiredSpeedMps, turnRateFor(ai.mode, p), p.accelMps2, realDt * s.timeScale);
        steps++;
      }
      expect(st.y, `${f.st.x},${f.st.y}`).toBeLessThan(-f.margin); // 北から抜けた
      expect(st.x).toBeGreaterThan(0);
      expect(st.x).toBeLessThan(s.mission.bounds.width);
      expect(ai.mode).toBe('retire');
      expect(steps / 60).toBeLessThan(120); // 夜明け後 2 分以内に海域を出る
    }
  });
});

describe('隊の数え方（destroyer-group の sunkCount・withdrawnCount・allOut・allSettled）', () => {
  const S = (sinking: boolean, sunk: boolean, withdrawn: boolean): ShipOutState => ({ sinking, sunk, withdrawn });
  const AFLOAT = S(false, false, false);
  const SINKING = S(true, false, false);
  const SUNK = S(true, true, false);
  const GONE = S(false, false, true);
  it('退いた艦は撃沈に数えない（任務の達成・撃沈の表示）。退いた数は駆逐艦だけ（先頭 n 隻。輸送船は隊の transportWithdrawn）', () => {
    expect(sinkingCount([GONE, SINKING, GONE], 2)).toBe(1); // 先頭 2 隻が駆逐艦
    expect(sinkingCount([GONE, GONE, GONE], 2)).toBe(0);
    expect(withdrawnCount([GONE, SINKING, GONE], 2)).toBe(1);
    expect(withdrawnCount([GONE, GONE, GONE], 2)).toBe(2);
    expect(withdrawnCount([GONE, GONE, GONE], 3)).toBe(3);
    expect(withdrawnCount([AFLOAT, SUNK], 2)).toBe(0);
  });
  it('allOut（魚雷を撃てない・残りの一斉発射を捨てる）: 全隻が沈み始めたか退いた。1 隻でも海域に残れば撃てる', () => {
    expect(allShipsOut([GONE, SINKING])).toBe(true);
    expect(allShipsOut([GONE, GONE, GONE])).toBe(true);
    expect(allShipsOut([GONE, AFLOAT])).toBe(false);
    expect(allShipsOut([])).toBe(true);
  });
  it('allSettled（走っている魚雷を外れとして確定）: 沈没演出の最中の艦が残れば待つ', () => {
    expect(allShipsSettled([GONE, SINKING])).toBe(false);
    expect(allShipsSettled([GONE, SUNK])).toBe(true);
    expect(allShipsSettled([GONE, GONE])).toBe(true);
  });
  it('退く艦がいなければ v0.6.1 と同じ（allOut＝すべて沈み始めた、allSettled＝すべての演出が終わった）', () => {
    const cases: ShipOutState[][] = [[AFLOAT], [SINKING], [SUNK], [SUNK, AFLOAT], [SUNK, SINKING], [SUNK, SUNK], [SINKING, SINKING, AFLOAT]];
    for (const c of cases) {
      expect(allShipsOut(c)).toBe(c.every((s) => s.sinking));
      expect(allShipsSettled(c)).toBe(c.every((s) => s.sunk));
      expect(sinkingCount(c, c.length)).toBe(c.filter((s) => s.sinking).length);
    }
  });
});

describe('大発の夜明け（FlotillaCheck.dawn。hide の任務）', () => {
  const BP = getBargeParams(gameData, getPrototypeMission(gameData, 'us_03'))!;
  const DT = 1 / 60;
  const TS = BP.timeScale;
  const check = (boat: BoatState, over: Partial<FlotillaCheck> = {}): FlotillaCheck => ({ boat, boatHalfLengthM: 12.2, boatHalfBeamM: 3.15, detectOpenM: 288, smokeFactor: 0.3, smoke: null, smokeParams: null, flashM: 0, boatAfloat: true, ...over });
  const events = (log: string[] = []): FlotillaEvents => ({ onFire: () => log.push('fire'), onImpact: (_x, _y, hit) => log.push(hit ? 'hit' : 'miss'), onBeached: (i) => log.push(`beach${i}`) });
  const spied = (seed: number): { rng: SeededRng; calls: () => number } => {
    const rng = new SeededRng(seed);
    const spy = vi.spyOn(rng, 'next');
    return { rng, calls: () => spy.mock.calls.length };
  };

  it('夜明け前（dawn を省略・false）は v0.6.1 と同じ: 同じ seed で位置・段階・撃った数・乱数を引いた回数が一致する', () => {
    const boat = { x: 4250, y: 2300 - 280, headingDeg: 90, speedMps: 0 }; // 1 組目に気づかれて撃たれる距離
    const a = createFlotilla(BP, 16);
    const b = createFlotilla(BP, 16);
    const ra = spied(7);
    const rb = spied(7);
    const la: string[] = [];
    const lb: string[] = [];
    for (let i = 0; i < 60 * 20; i++) {
      stepFlotilla(a, BP, check(boat), ra.rng, DT, DT * TS, events(la));
      stepFlotilla(b, BP, check(boat, { dawn: false }), rb.rng, DT, DT * TS, events(lb));
    }
    expect(ra.calls()).toBeGreaterThan(0);
    expect(rb.calls()).toBe(ra.calls());
    expect(lb).toEqual(la);
    expect(b).toEqual(a);
    expect(a.barges.map((x) => x.phase)).toContain(BARGE_CRUISE); // 2 組目は気づかず岸沿いのまま
  });
  it('夜明け後: 岸沿いを進む大発すべてが最初のステップで岸へ逃げ（v0.6.2 実機 1 回目: 警戒と反応の遅れを飛ばす）、上陸する（気づいていないので撃たない＝乱数を引かない）。「大発なし」の条件（撃破＋上陸＝全隻）が立つ', () => {
    const f = createFlotilla(BP, 16);
    const { rng, calls } = spied(8);
    const log: string[] = [];
    const c = check(far(), { dawn: true });
    const y0 = f.barges.map((x) => x.y);
    stepFlotilla(f, BP, c, rng, DT, DT * TS, events(log));
    expect(f.barges.map((x) => x.phase)).toEqual([BARGE_RUN, BARGE_RUN, BARGE_RUN, BARGE_RUN]);
    expect(f.barges.every((x) => !x.detected && x.alertS === 0)).toBe(true);
    expect(f.running).toBe(4);
    expect(f.escapeLeftS).not.toBeNaN(); // HUD の「大発が岸へ逃げる ・ 上陸まで N 秒」がすぐ出る
    // 逃げる向き（南へ扇に開く）へ舵を切り、run_speed へ加速し始める（巡航の進路のままではない）
    for (let i = 0; i < 60; i++) stepFlotilla(f, BP, c, rng, DT, DT * TS, events(log));
    expect(f.barges.every((x, i) => x.y > y0[i]!)).toBe(true);
    let t = 61 * DT;
    for (let i = 0; i < 60 * 60 && f.beached < f.barges.length; i++) {
      stepFlotilla(f, BP, c, rng, DT, DT * TS, events(log));
      t += DT;
      expect(f.running + f.beached).toBe(4);
    }
    // 反応の遅れ（reaction_delay_s 5 秒）を待っていた v0.6.2 の初版より、全隻の上陸がその分早い（岸まで 160 m を run_speed で走る分だけ）
    expect(t).toBeLessThan(BP.reactionDelayS + 15);
    expect(f.running).toBe(0);
    expect(f.beached).toBe(4);
    expect(f.sunk + f.beached).toBe(f.barges.length);
    expect(f.barges.every((x) => x.phase === BARGE_BEACHED && x.y >= BP.beachY)).toBe(true);
    expect(log.filter((x) => x.startsWith('beach')).sort()).toEqual(['beach0', 'beach1', 'beach2', 'beach3']);
    expect(log).not.toContain('fire');
    expect(calls()).toBe(0);
  });
  it('夜明け後も、撃破した大発は沈んだまま・逃げている大発はそのまま逃げる・気づいて反応の遅れの途中の大発は遅れを続ける（段階を戻さない・飛ばさない）', () => {
    const f = createFlotilla(BP, 16);
    f.barges[0]!.phase = BARGE_SUNK;
    f.sunk = 1;
    f.barges[1]!.phase = BARGE_RUN;
    f.barges[2]!.phase = BARGE_ALERT;
    f.barges[2]!.alertS = 1;
    stepFlotilla(f, BP, check(far(), { dawn: true }), new SeededRng(9), DT, DT * TS, events());
    expect(f.barges.map((x) => x.phase)).toEqual([BARGE_SUNK, BARGE_RUN, BARGE_ALERT, BARGE_RUN]);
    expect(f.barges[2]!.alertS).toBeCloseTo(1 + DT, 9);
    expect(f.running).toBe(2);
    // 警戒中の大発は反応の遅れの残り（5 − 1 秒）の後に逃げる
    let n = 0;
    while (f.barges[2]!.phase === BARGE_ALERT && n < 1000) {
      stepFlotilla(f, BP, check(far(), { dawn: true }), new SeededRng(9), DT, DT * TS, events());
      n++;
    }
    expect((n + 1) * DT).toBeCloseTo(BP.reactionDelayS - 1, 1);
  });
  it('夜明け前（dawn 省略）は気づいた大発だけが警戒（反応の遅れ）に入る（v0.6.1 と同じ）。running は逃げている隻数', () => {
    const f = createFlotilla(BP, 16);
    const boat = { x: 4300, y: 2300 - 280, headingDeg: 90, speedMps: 0 }; // 1 組目の 2 隻の発見距離 288 m の内
    stepFlotilla(f, BP, check(boat), new SeededRng(7), DT, DT * TS, events());
    expect(f.barges.map((x) => x.phase)).toEqual([BARGE_ALERT, BARGE_ALERT, BARGE_CRUISE, BARGE_CRUISE]);
    expect(f.running).toBe(0);
  });
});

describe('data と遊べる任務の規則（v0_1_prototype.dawn_withdraw）', () => {
  it('us_02 は retire で北へ（retireEdge north）。us_01・us_03・jp_06 には dawn_withdraw が無い（retireEdge null）', () => {
    expect(protoOf(gameData, 'us_02')['dawn_withdraw']).toEqual({ retire_edge: 'north', force_ja: '東京急行', source: expect.stringContaining('design (v0.6.2') as unknown as string });
    expect(getDawnAir(gameData, 'us_02').retireForceJa).toBe('東京急行');
    for (const id of ['us_01', 'us_03', 'jp_06']) expect(getDawnAir(gameData, id).retireForceJa, id).toBe('');
    const want: Record<string, [string, string | null]> = { us_01: ['stay', null], us_02: ['retire', 'north'], us_03: ['hide', null], jp_01: ['none', null], jp_05: ['none', null], jp_06: ['stay', null] };
    for (const id of PLAYABLE) {
      const a = getDawnAir(gameData, id);
      expect([a.shipsAtDawn, a.retireEdge], id).toEqual(want[id]);
      expect(buildWorldSetup(gameData, id).dawnAir.retireEdge, id).toBe(want[id]![1]);
      if (id !== 'us_02') expect(protoOf(gameData, id)['dawn_withdraw'], id).toBeUndefined();
      expect(() => checkPlayableDawn(gameData, id)).not.toThrow();
    }
    // 遊べない任務は v0_1_prototype が無いので退く先は持たない
    expect(getDawnAir(gameData, 'us_04').retireEdge).toBeNull();
  });
  it('dawnWithdrawFromData: 形・知らないキー・縁・source の崩れは任務の id を付けて例外', () => {
    const ok = { retire_edge: 'west', force_ja: '東京急行', source: 'design (x)' };
    expect(dawnWithdrawFromData(ok, 'us_02')).toEqual({ retireEdge: 'west', forceJa: '東京急行' });
    const bad: [unknown, RegExp][] = [
      ['north', /object/],
      [['north'], /object/],
      [null, /object/],
      [{ ...ok, speed_kt: 30 }, /知らないキー/],
      [{ ...ok, retire_edge: 'up' }, /retire_edge/],
      [{ source: 'design', force_ja: '東京急行' }, /retire_edge/],
      [{ retire_edge: 'north', force_ja: '東京急行' }, /source/],
      [{ retire_edge: 'north', source: 'design (x)' }, /force_ja/],
      [{ ...ok, force_ja: ' ' }, /force_ja/],
      [{ ...ok, force_ja: 3 }, /force_ja/],
      [{ ...ok, source: 'v0.6.2' }, /source/],
    ];
    for (const [raw, re] of bad) {
      expect(() => dawnWithdrawFromData(raw, 'us_02'), JSON.stringify(raw)).toThrow(re);
      expect(() => dawnWithdrawFromData(raw, 'us_02'), JSON.stringify(raw)).toThrow(/us_02/);
    }
  });
  it('規則が崩れた data は任務の id を付けて例外（世界の組み立ても止まる）', () => {
    const withdraw = (): Rec => ({ retire_edge: 'north', force_ja: '東京急行', source: 'design (test)' });
    const cases: [string, (d: typeof gameData) => void, RegExp][] = [
      ['us_02', (d) => delete protoOf(d, 'us_02')['dawn_withdraw'], /dawn_withdraw/],
      ['us_02', (d) => ((protoOf(d, 'us_02')['dawn_withdraw'] as Rec)['retire_edge'] = 'up'), /retire_edge/],
      ['us_02', (d) => ((protoOf(d, 'us_02')['dawn_withdraw'] as Rec)['speed_kt'] = 30), /知らないキー/],
      ['us_02', (d) => (protoOf(d, 'us_02')['dawn_withdraw'] = 'north'), /object/],
      ['us_02', (d) => delete (protoOf(d, 'us_02')['dawn_withdraw'] as Rec)['source'], /source/],
      ['us_02', (d) => delete (protoOf(d, 'us_02')['dawn_withdraw'] as Rec)['force_ja'], /force_ja/],
      ['us_01', (d) => (protoOf(d, 'us_01')['dawn_withdraw'] = withdraw()), /dawn_withdraw/],
      ['jp_06', (d) => (protoOf(d, 'jp_06')['dawn_withdraw'] = withdraw()), /dawn_withdraw/],
      ['us_03', (d) => (protoOf(d, 'us_03')['dawn_withdraw'] = withdraw()), /dawn_withdraw/],
      ['us_02', (d) => (dawnAirOf(d, 'us_02')['enemy_ships_at_dawn'] = 'stay'), /dawn_withdraw/],
      ['us_02', (d) => (dawnAirOf(d, 'us_02')['enemy_ships_at_dawn'] = 'none'), /dawn_withdraw/],
      ['us_02', (d) => (dawnAirOf(d, 'us_02')['enemy_ships_at_dawn'] = 'hide'), /大発/],
      ['us_01', (d) => (dawnAirOf(d, 'us_01')['enemy_ships_at_dawn'] = 'hide'), /大発/],
      ['us_03', (d) => (dawnAirOf(d, 'us_03')['enemy_ships_at_dawn'] = 'retire'), /駆逐艦/],
      ['us_01', (d) => (dawnAirOf(d, 'us_01')['enemy_ships_at_dawn'] = 'retire'), /dawn_withdraw/],
    ];
    for (const [id, breakIt, re] of cases) {
      const d = clone();
      breakIt(d);
      expect(() => checkPlayableDawn(d, id), `${id} ${re}`).toThrow(re);
      expect(() => getDawnAir(d, id), `${id} ${re}`).toThrow(new RegExp(id));
      expect(() => buildWorldSetup(d, id), `${id} ${re}`).toThrow();
    }
    // retire の遊べる任務に縁があれば、どの縁でも通る（us_01 を retire にして縁を置く）
    for (const edge of ['north', 'south', 'east', 'west']) {
      const d = clone();
      dawnAirOf(d, 'us_01')['enemy_ships_at_dawn'] = 'retire';
      protoOf(d, 'us_01')['dawn_withdraw'] = { retire_edge: edge, force_ja: '敵', source: 'design (test)' };
      expect(getDawnAir(d, 'us_01').retireEdge).toBe(edge);
    }
  });
});
