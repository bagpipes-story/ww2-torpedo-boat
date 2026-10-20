// 夜明けに敵が退く（v0.6.2）の世界側と文: 夜明けのラッチが敵を退かせる（systems/world-dawn）、テレメトリと Result の材料（systems/dawn-telemetry）、
// 夜明けの帯と Result の行（ui/dawn-lines）を遊べる 4 任務の本物の setup で。退く艦・大発の動きそのものは tests/dawn-withdraw.test.ts。
// v0.6.2 レビューの直し: 帯は退く相手と残弾で 2 行目を決める、HUD の 3 行目「…へ去った ・ 狙う艦なし」、Result の艦の行（ui/result-heading）、ラッチの後に決着した魚雷の KPI（core/dawn-withdraw）。
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { airStrikeActive, createAirStrike, startAirStrike, type AirStrikeParams } from '../src/core/air-strike';
import type { BoatState, BoatTelemetry } from '../src/core/boat-motion';
import { DAWN_AIR_ENEMY, DAWN_AIR_OWN, createDawnResult, type DawnResult } from '../src/core/dawn-air';
import { shotKpiTarget } from '../src/core/dawn-withdraw';
import { dawnResult, initDawnTelemetry, refreshDawnTelemetry, type DawnTelemetryWorld } from '../src/systems/dawn-telemetry';
import { WorldDawn, type DawnStrike, type DawnWorldView } from '../src/systems/world-dawn';
import { buildWorldSetup, type WorldSetup } from '../src/systems/world-setup';
import { STRIKE_DODGE_RULE_JA, dawnBannerLines, dawnResultLine, shipsGoneStatusJa } from '../src/ui/dawn-lines';
import { resultShipsJa } from '../src/ui/result-heading';

const fakeScene = { cameras: { main: { setBackgroundColor: () => undefined } } } as never;
const STEP_S = 1 / 60;

interface FakeEnemy {
  shipsWithdrawn: number;
  transportWithdrawn: boolean;
  bargesHidden: number;
  bargesRunning: number;
  allOut: boolean;
  shipDown: boolean;
  /** withdraw に渡された向き（呼ばれた順） */
  calls: number[];
  withdraw(h: number): void;
}

function fakeEnemy(): FakeEnemy {
  const e: FakeEnemy = { shipsWithdrawn: 0, transportWithdrawn: false, bargesHidden: 0, bargesRunning: 0, allOut: false, shipDown: false, calls: [], withdraw: (h) => void e.calls.push(h) };
  return e;
}

/** 本物の core/air-strike の状態を持つ口（空襲の世界側の Phaser の部分だけを省く。tests/dawn-lines と同じ） */
function liveStrike(p: AirStrikeParams): DawnStrike {
  const state = createAirStrike(p);
  return {
    state,
    p,
    get active() {
      return airStrikeActive(state);
    },
    start: (player: BoatState) => startAirStrike(state, p, player),
    step: () => undefined,
    updateVisuals: () => undefined,
    destroy: () => undefined,
  };
}

/** 空襲は本物の状態で動かさない口（ラッチの順序と敵の退き方だけを見る）。MissionWorld.stepFn と同じく view と telemetry の world は同じ時計と敵 */
function world(setup: WorldSetup): { dawn: WorldDawn; view: DawnWorldView & { stepTimeS: number; atHome: boolean; grounded: boolean; boat: { state: BoatState; sinking: boolean } }; w: DawnTelemetryWorld & { stepTimeS: number }; enemy: FakeEnemy } {
  const dawn = new WorldDawn(fakeScene, setup, setup.airStrike ? liveStrike(setup.airStrike) : null);
  const enemy = fakeEnemy();
  const view = { stepTimeS: 0, atHome: false, grounded: false, boat: { state: { x: 0, y: 0, headingDeg: 0, speedMps: 0 } as BoatState, sinking: false }, escort: null, enemy };
  const w = { stepTimeS: 0, setup, dawn, enemy };
  return { dawn, view, w, enemy };
}

/** 夜明けの前後を固定ステップで進める（latch → step。stepFn と同じ順） */
function runTo(x: ReturnType<typeof world>, untilS: number, before?: () => void): void {
  while (x.view.stepTimeS < untilS) {
    x.view.stepTimeS += STEP_S;
    x.w.stepTimeS = x.view.stepTimeS;
    before?.();
    x.dawn.latch(x.view);
    x.dawn.step(STEP_S, x.view);
  }
}

const S01 = buildWorldSetup(gameData, 'us_01');
const S02 = buildWorldSetup(gameData, 'us_02');
const S03 = buildWorldSetup(gameData, 'us_03');
const S06 = buildWorldSetup(gameData, 'jp_06');

describe('夜明けのラッチが敵を退かせる（systems/world-dawn。v0.6.2）', () => {
  it('us_02（retire）: 夜明けの最初のステップで 1 回だけ、北（0°）へ。夜明け前は呼ばない', () => {
    const x = world(S02);
    runTo(x, S02.durationS - 0.5);
    expect(x.enemy.calls).toEqual([]);
    expect(x.dawn.reached).toBe(false);
    runTo(x, S02.durationS + 30);
    expect(x.enemy.calls).toEqual([0]);
    expect([x.dawn.ships, x.dawn.retireHeadingDeg, x.dawn.retireJa]).toEqual(['retire', 0, '北']);
  });
  it('us_03（hide）: 1 回だけ NaN（駆逐艦は退かない・大発は岸へ）。us_01・jp_06（stay）は呼ばない', () => {
    const x = world(S03);
    runTo(x, S03.durationS + 30);
    expect(x.enemy.calls.length).toBe(1);
    expect(x.enemy.calls[0]).toBeNaN();
    expect([x.dawn.ships, x.dawn.retireJa]).toEqual(['hide', '']);
    expect(x.dawn.retireHeadingDeg).toBeNaN();
    for (const [id, s] of [['us_01', S01], ['jp_06', S06]] as const) {
      const y = world(s);
      runTo(y, s.durationS + 30);
      expect(y.dawn.reached).toBe(true);
      expect(y.enemy.calls, id).toEqual([]);
      expect(y.dawn.ships, id).toBe('stay');
    }
  });
  it('左右反転の夜（出撃の seed）でも us_02 は北（反転は東西だけ）', () => {
    let mirrored = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = buildWorldSetup(gameData, 'us_02', { hard: true, sortie: { missionId: 'us_02', seed, raid: false, choice: 0, stayHit: false, hard: true, historical: false } });
      if (s.night.mirrored) mirrored++;
      const x = world(s);
      runTo(x, s.durationS + STEP_S * 2);
      expect(x.enemy.calls, `seed ${seed}`).toEqual([0]);
    }
    expect(mirrored).toBeGreaterThan(0);
  });
  it('東西の縁は反転の夜に入れ替わる（data を east にした us_02）', () => {
    const plain = { ...S02, dawnAir: { ...S02.dawnAir, retireEdge: 'east' as const }, night: { ...S02.night, mirrored: false } };
    const flip = { ...plain, night: { ...plain.night, mirrored: true } };
    const a = world(plain);
    const b = world(flip);
    runTo(a, plain.durationS + STEP_S * 2);
    runTo(b, flip.durationS + STEP_S * 2);
    expect([a.enemy.calls, a.dawn.retireJa]).toEqual([[90], '東']);
    expect([b.enemy.calls, b.dawn.retireJa]).toEqual([[270], '西']);
  });
  it('夜明けに沈没中・座礁中ならラッチしないので退かせない（v0.6.1 の規則のまま）', () => {
    for (const k of ['sinking', 'grounded'] as const) {
      const x = world(S02);
      runTo(x, S02.durationS + 10, () => {
        if (k === 'sinking') x.view.boat.sinking = true;
        else x.view.grounded = true;
      });
      expect(x.dawn.reached, k).toBe(false);
      expect(x.enemy.calls, k).toEqual([]);
    }
  });
});

describe('夜明けのテレメトリと Result の材料（systems/dawn-telemetry。v0.6.2）', () => {
  it('出発時: 夜明けの敵艦・退く方角・呼び名（retire だけ）', () => {
    expect(initDawnTelemetry(world(S02).w)).toMatchObject({ ships: 'retire', retireJa: '北', forceJa: '東京急行' });
    expect(initDawnTelemetry(world(S03).w)).toMatchObject({ ships: 'hide', retireJa: '', forceJa: '' });
    expect(initDawnTelemetry(world(S01).w)).toMatchObject({ ships: 'stay', retireJa: '', forceJa: '' });
    expect(initDawnTelemetry(world(S06).w)).toMatchObject({ ships: 'stay', retireJa: '', forceJa: '' });
  });
  it('HUD: 夜明けの後に岸へ逃げている・隠れた大発の数を毎フレーム写す（v0.6.2 実機 1 回目。空襲の行の「大発 岸へ N 隻」）', () => {
    const x = world(S03);
    const d = initDawnTelemetry(x.w);
    expect([d.bargesRunning, d.bargesHidden]).toEqual([0, 0]);
    runTo(x, S03.durationS + 1);
    x.enemy.bargesRunning = 3;
    x.enemy.bargesHidden = 1;
    const t = { dawn: d, planeDx: NaN, planeDy: NaN } as unknown as BoatTelemetry;
    refreshDawnTelemetry(t, x.w, { dx: 0, dy: 0, headingDeg: 0, alpha: 0 });
    expect([t.dawn.bargesRunning, t.dawn.bargesHidden]).toEqual([3, 1]);
    x.enemy.bargesRunning = 0;
    x.enemy.bargesHidden = 4;
    refreshDawnTelemetry(t, x.w, { dx: 0, dy: 0, headingDeg: 0, alpha: 0 });
    expect([t.dawn.bargesRunning, t.dawn.bargesHidden]).toEqual([0, 4]);
  });
  it('Result: 退いた駆逐艦の数・輸送船・方角、隠れた大発の数を写す', () => {
    const x = world(S02);
    runTo(x, S02.durationS + 20);
    x.enemy.shipsWithdrawn = 2;
    x.enemy.transportWithdrawn = true;
    expect(dawnResult(x.w)).toMatchObject({ reached: true, caughtOutside: true, air: DAWN_AIR_OWN, shipsWithdrawn: 2, transportWithdrawn: true, retireJa: '北', bargesHidden: 0 });
    const y = world(S03);
    runTo(y, S03.durationS + 20);
    y.enemy.bargesHidden = 4;
    expect(dawnResult(y.w)).toMatchObject({ air: DAWN_AIR_ENEMY, shipsWithdrawn: 0, transportWithdrawn: false, retireJa: '', bargesHidden: 4 });
  });
});

/** 帯が読む項目だけのテレメトリ（夜明けのラッチの後）。既定は敵がすべて浮いていて魚雷 4 本（over で全艦撃沈・残弾 0・大発の撃破と上陸を入れる） */
function bannerOf(setup: WorldSetup, escort = false, over: Partial<BoatTelemetry> = {}): readonly string[] {
  const x = world(setup);
  const d = initDawnTelemetry(x.w);
  d.reached = true;
  d.caughtOutside = true;
  const bargesTotal = setup.barges ? setup.barges.count : 0;
  return dawnBannerLines({ dawn: d, escortEnabled: escort, escortSunk: false, destroyerSunk: false, torpedoesLeft: 4, bargesSunk: 0, bargesBeached: 0, bargesTotal, ...over } as BoatTelemetry);
}

/** HUD の文の幅の見積もり px（Menlo の半角 0.602 em・全角 1 em。tests/dawn-lines と同じ） */
function textWidthPx(s: string, px: number): number {
  let w = 0;
  for (const ch of s) w += (ch.charCodeAt(0) < 0x2000 ? 0.602 : 1) * px;
  return w;
}

describe('夜明けの帯（ui/dawn-lines。v0.6.2 の 2 行目）', () => {
  it('遊べる 4 任務: us_02 は「東京急行は北へ退く」、us_03 は「大発は岸へ隠れる」。us_01（僚艇）・jp_06 は v0.6.1 のまま', () => {
    expect(bannerOf(S02)).toEqual(['夜明け', '昼の空は味方（ヘンダーソン基地） ・ 敵機は来ない', '東京急行は北へ退く ・ 追うか帰投か']);
    expect(bannerOf(S03)).toEqual(['夜明け — 空襲', `二式水上戦闘機 4 機が西から来る ・ ${STRIKE_DODGE_RULE_JA}`, '大発は岸へ隠れる ・ 帰投せよ']);
    expect(bannerOf(S01, true)).toEqual(['夜明け — 空襲', `零式水上観測機 4 機が東から来る ・ ${STRIKE_DODGE_RULE_JA}`, '僚艇も狙われる ・ 自艇の転舵に僚艇が付いてくる']);
    expect(bannerOf(S06)).toEqual(['夜明け — 空襲', `米艦載機（F6F 相当） 4 機が東から来る ・ ${STRIKE_DODGE_RULE_JA}`]);
    for (const s of [S01, S02, S03, S06]) for (const l of bannerOf(s, true)) expect(textWidthPx(l, 22), l).toBeLessThanOrEqual(1280 - 2 * 24);
  });
  it('?debug&nostrike の us_03 は「夜明け」と「敵機は来ない」、2 行目は大発', () => {
    const s = buildWorldSetup(gameData, 'us_03', { strikeOff: true });
    expect(bannerOf(s)).toEqual(['夜明け', '昼の空は争奪（日本機の昼の空襲） ・ 敵機は来ない', '大発は岸へ隠れる ・ 帰投せよ']);
  });
  it('退く相手が残っていなければ v0.6.1 の帯（レビュー: 全艦を沈めた夜に「追うか帰投か」と出ていた）', () => {
    // us_02: 夜明けまでに駆逐艦・輸送船（ハードは 2 隻＋輸送船）をすべて沈めた＝destroyerSunk（輸送船込み）
    expect(bannerOf(S02, false, { destroyerSunk: true, torpedoesLeft: 0 })).toEqual(['夜明け', '昼の空は味方（ヘンダーソン基地） ・ 敵機は来ない ・ 帰投せよ']);
    const hard = buildWorldSetup(gameData, 'us_02', { hard: true });
    expect(bannerOf(hard, false, { destroyerSunk: true, torpedoesLeft: 0 })).toEqual(['夜明け', '昼の空は味方（ヘンダーソン基地） ・ 敵機は来ない ・ 帰投せよ']);
    // us_03: 4 隻とも撃破か上陸（3 撃破＋1 上陸、全部上陸）
    const strike = ['夜明け — 空襲', `二式水上戦闘機 4 機が西から来る ・ ${STRIKE_DODGE_RULE_JA}`];
    expect(bannerOf(S03, false, { bargesSunk: 3, bargesBeached: 1 })).toEqual(strike);
    expect(bannerOf(S03, false, { bargesBeached: 4 })).toEqual(strike);
    expect(bannerOf(S03, false, { bargesSunk: 3 })[2]).toBe('大発は岸へ隠れる ・ 帰投せよ'); // 1 隻でも岸沿いに残れば出す
    const nostrike = buildWorldSetup(gameData, 'us_03', { strikeOff: true });
    expect(bannerOf(nostrike, false, { bargesSunk: 4 })).toEqual(['夜明け', '昼の空は争奪（日本機の昼の空襲） ・ 敵機は来ない ・ 帰投せよ']);
  });
  it('us_02 で艦は残っているが魚雷を撃ち尽くした（輪の中も残弾 0）なら「追うか」ではなく「帰投せよ」', () => {
    expect(bannerOf(S02, false, { torpedoesLeft: 0 })).toEqual(['夜明け', '昼の空は味方（ヘンダーソン基地） ・ 敵機は来ない', '東京急行は北へ退く ・ 帰投せよ']);
    expect(bannerOf(S02, false, { torpedoesLeft: 1 })[2]).toBe('東京急行は北へ退く ・ 追うか帰投か');
  });
});

describe('夜明けに退いて狙う艦がいなくなった後の HUD の 3 行目（v0.6.2 レビュー）', () => {
  it('shipsGone は「すべて沈み始めたか退いた」で「すべて沈み始めた」ではないときだけ。夜明け前（退く艦なし）と大発の任務は false', () => {
    const x = world(S02);
    expect(initDawnTelemetry(x.w).shipsGone).toBe(false);
    x.enemy.allOut = true;
    x.enemy.shipDown = true; // すべて沈めた（撃沈の「駆逐艦を撃沈」が出る）
    expect(initDawnTelemetry(x.w).shipsGone).toBe(false);
    x.enemy.shipDown = false; // 退いた艦がある（駆逐艦を沈めて輸送船が退いた、も同じ）
    const d = initDawnTelemetry(x.w);
    expect(d.shipsGone).toBe(true);
    expect(shipsGoneStatusJa(d)).toBe('東京急行は北へ去った ・ 狙う艦なし');
    const y = world(S03);
    expect(initDawnTelemetry(y.w).shipsGone).toBe(false);
  });
});

describe('Result の艦の行（ui/result-heading の resultShipsJa。v0.6.2 レビュー）', () => {
  const r = (over: { shipsTotal?: number; shipsSunk?: number; transportEnabled?: boolean; transportSunk?: boolean; shipsWithdrawn?: number; transportWithdrawn?: boolean }) => ({
    shipsTotal: over.shipsTotal ?? 1,
    shipsSunk: over.shipsSunk ?? 0,
    transportEnabled: over.transportEnabled ?? true,
    transportSunk: over.transportSunk ?? false,
    dawn: { shipsWithdrawn: over.shipsWithdrawn ?? 0, transportWithdrawn: over.transportWithdrawn ?? false },
  });
  it('1 隻の任務は沈めた駆逐艦の数で「撃沈」（輸送船が退いても・浮いていても。main から「健在」と出ていた）', () => {
    expect(resultShipsJa(r({ shipsSunk: 1, transportWithdrawn: true }))).toBe('駆逐艦: 撃沈 ・ 輸送船: 退いた');
    expect(resultShipsJa(r({ shipsSunk: 1 }))).toBe('駆逐艦: 撃沈 ・ 輸送船: 健在');
    expect(resultShipsJa(r({ shipsSunk: 1, transportSunk: true }))).toBe('駆逐艦: 撃沈 ・ 輸送船: 撃沈');
    expect(resultShipsJa(r({ shipsWithdrawn: 1, transportSunk: true }))).toBe('駆逐艦: 退いた ・ 輸送船: 撃沈');
    expect(resultShipsJa(r({}))).toBe('駆逐艦: 健在 ・ 輸送船: 健在');
    expect(resultShipsJa(r({ transportEnabled: false, shipsSunk: 1 }))).toBe('駆逐艦: 撃沈');
  });
  it('複数隻は「撃沈 N/M」、駆逐艦のいない任務は「健在」のまま', () => {
    expect(resultShipsJa(r({ shipsTotal: 2, shipsSunk: 1, shipsWithdrawn: 1, transportWithdrawn: true }))).toBe('駆逐艦: 撃沈 1/2 ・ 輸送船: 退いた');
    expect(resultShipsJa(r({ shipsTotal: 0, transportEnabled: false }))).toBe('駆逐艦: 健在');
  });
});

describe('夜明けに走っていた魚雷の KPI（core/dawn-withdraw の shotKpiTarget。v0.6.2 レビュー）', () => {
  it('艦が退く us_02 だけ、ラッチの後に決着した魚雷は通算の命中率に入れない。夜明け前と退かない任務は kpiTarget のまま', () => {
    const x = world(S02);
    runTo(x, S02.durationS - 0.5);
    expect(shotKpiTarget(true, x.dawn.reached, x.dawn.retireHeadingDeg)).toBe(true);
    runTo(x, S02.durationS + STEP_S * 2);
    expect(shotKpiTarget(true, x.dawn.reached, x.dawn.retireHeadingDeg)).toBe(false);
    expect(shotKpiTarget(false, x.dawn.reached, x.dawn.retireHeadingDeg)).toBe(false);
    for (const [id, s] of [['us_01', S01], ['us_03', S03], ['jp_06', S06]] as const) {
      const y = world(s);
      runTo(y, s.durationS + STEP_S * 2);
      expect(y.dawn.reached, id).toBe(true);
      expect(shotKpiTarget(true, y.dawn.reached, y.dawn.retireHeadingDeg), id).toBe(true);
      expect(shotKpiTarget(false, y.dawn.reached, y.dawn.retireHeadingDeg), id).toBe(false);
    }
  });
});

describe('Result の夜明けの行の後ろ（ui/dawn-lines。v0.6.2）', () => {
  const res = (over: Partial<DawnResult>): DawnResult => ({ ...createDawnResult(), ...over });
  const own = { reached: true, caughtOutside: true, daylightS: 20.2, air: DAWN_AIR_OWN, labelJa: '昼の空は味方（ヘンダーソン基地）', retireJa: '北' };
  it('駆逐艦は北へ退いた（N 隻）。輸送船も出たら「＋輸送船」、輸送船だけなら「輸送船は北へ退いた」。退いた艦が無ければ v0.6.1 のまま', () => {
    expect(dawnResultLine(res({ ...own, shipsWithdrawn: 2, transportWithdrawn: true }), true)).toBe('夜明け後 20 秒 ・ 昼の空は味方（ヘンダーソン基地）（敵機は来ない） ・ 駆逐艦は北へ退いた（2 隻＋輸送船）');
    expect(dawnResultLine(res({ ...own, shipsWithdrawn: 1 }), false)).toBe('夜明け後 20 秒 ・ 昼の空は味方（ヘンダーソン基地）（敵機は来ない） ・ 駆逐艦は北へ退いた（1 隻）');
    expect(dawnResultLine(res({ ...own, transportWithdrawn: true }), true)).toBe('夜明け後 20 秒 ・ 昼の空は味方（ヘンダーソン基地）（敵機は来ない） ・ 輸送船は北へ退いた');
    expect(dawnResultLine(res({ ...own }), true)).toBe('夜明け後 20 秒 ・ 昼の空は味方（ヘンダーソン基地）（敵機は来ない）');
    // 夜明けに輪の中で、決着待ちの間に退いた
    expect(dawnResultLine(res({ reached: true, caughtOutside: false, retireJa: '北', shipsWithdrawn: 1 }), true)).toBe('夜明け: 前に帰投（残り 0 秒） ・ 駆逐艦は北へ退いた（1 隻）');
    expect(dawnResultLine(res({ reached: true, caughtOutside: false, shipsWithdrawn: 1 }), false)).toBeNull();
  });
  it('大発は岸に隠れた（N 隻）は空襲の集計の後ろ（us_03）', () => {
    const strike = { waves: 1, bombs: 3, bombsAtEscort: 0, hitsPlayer: 1, hitsEscort: 0, damagePlayer: 35, dodgeS: [NaN, 0.34, 0.8], vip: false };
    const caught = { reached: true, caughtOutside: true, daylightS: 61.6, air: DAWN_AIR_ENEMY, labelJa: '昼の空は争奪（日本機の昼の空襲）', strike };
    expect(dawnResultLine(res({ ...caught, bargesHidden: 4 }), true)).toBe('夜明け後 62 秒 ・ 空襲 1 波 ・ 爆弾 3 発 ・ 命中 1 ・ 転舵 —/0.3/0.8 秒 ・ 大発は岸に隠れた（4 隻）');
    expect(dawnResultLine(res({ ...caught }), true)).toBe('夜明け後 62 秒 ・ 空襲 1 波 ・ 爆弾 3 発 ・ 命中 1 ・ 転舵 —/0.3/0.8 秒');
  });
});
