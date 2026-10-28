// 米の艇の機銃の弾倉（v0.6.8 実機 1 回目。spec-ip1 §4 D3・D4）の兵装と HUD: us_01・us_02 は艦への機銃と対空が systems/arms-step の自分の弾倉を分け合い（交換は ArmsStep が進める）、
// us_03 の対空は大発への砲の弾倉を借りる（jp_01 が米PT の砲の弾倉を借りるのと同じ。交換は BargeHunt が進め、交換中は機へ撃たない）。
// 2 行目（ui/hud-lines の gunLine・ui/mission-line の bargeKey の bit 27〜29）の「弾倉交換 ・ あと N 秒 ・ 撃破 …」、機銃ボタンの「弾倉交換\nN」（gunButtonReloadN）。
// 偽の世界は tests/arms-step と同じ形（世界の順: stepShips → applyFlash →（敵）→ stepAir → 空襲）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { gameData, getPrototypeMission } from '../src/config/game-data';
import { HUD_COLOR_STRONG } from '../src/config/hud-text-config';
import { getLoadout } from '../src/config/loadout-data';
import { FIXED_STEP_S } from '../src/config/step-config';
import { AA_BUSY, AA_FIRING, AA_RELOAD } from '../src/core/aa-fire';
import { AS_ORBIT, createAirStrike, startAirStrike, stepAirStrike, type AirStrikeCheck } from '../src/core/air-strike';
import { ST_RELOAD, ST_SHIP, createArmsTelemetry } from '../src/core/arms-cue';
import type { BoatState, BoatTelemetry } from '../src/core/boat-motion';
import { GUN_FIRING, GUN_NO_TARGET, GUN_SAFE } from '../src/core/gun-battery';
import { createInputState } from '../src/core/input-state';
import { createMagazine, magazineTick, type MagazineState } from '../src/core/magazine';
import { PT_GUN_RELOAD } from '../src/core/pt-gun';
import { SHALLOW_INSIDE } from '../src/core/shallows';
import { SeededRng } from '../src/core/rng';
import { ArmsStep, type ArmsWorld } from '../src/systems/arms-step';
import { refreshArmsTelemetry } from '../src/systems/arms-telemetry';
import { buildWorldSetup } from '../src/systems/world-setup';
import { armsCueJa } from '../src/ui/arms-lines';
import { GUN_DISTANCE_STEP_M, gunLine, gunReloadStep } from '../src/ui/hud-lines';
import { MISSION_GUN, missionMode } from '../src/ui/mission-mode';
import { gunButtonLabel, gunButtonReloadN } from '../src/ui/pt-gun-lines';
import { tele, textWidthPx } from './pt-ui-kit';

const DT = FIXED_STEP_S;

type Hunt = { battery: { status: number }; mag: MagazineState | null };
interface W extends ArmsWorld {
  input: ReturnType<typeof createInputState>;
  boat: { state: BoatState; sinking: boolean };
  band: 'stop';
  atHome: boolean;
  grounded: boolean;
  stepTimeS: number;
  detectRangeM: number;
  hunt: Hunt | null;
  pts: null;
}

/** 任務 id の艇の兵装と、海域の真ん中に止まった自艇（北向き）。ship: 東 400 m の駆逐艦（真横）。strike: 夜明けの空襲。hunt: 大発の砲の偽物（data の弾倉を持つ。標的なし） */
function rig(id: string, o: { ship?: boolean; strike?: boolean; hunt?: boolean } = {}) {
  const s = buildWorldSetup(gameData, id);
  const lo = getLoadout(gameData, getPrototypeMission(gameData, id));
  const boat: BoatState = { x: s.mission.bounds.width / 2, y: s.mission.bounds.height / 2, headingDeg: 0, speedMps: 0 };
  const st = o.strike && s.airStrike ? createAirStrike(s.airStrike) : null;
  const w: W = {
    input: createInputState(), boat: { state: boat, sinking: false }, band: 'stop', atHome: false, grounded: false, stepTimeS: 0, detectRangeM: 500, visRange2: 4000 * 4000, smoke: null, smokeParams: null,
    hunt: o.hunt ? { battery: { status: GUN_NO_TARGET }, mag: createMagazine(lo.gun!.magazine!) } : null,
    pts: null,
    destroyers: o.ship ? { ships: [{ state: { x: boat.x + 400, y: boat.y, headingDeg: 0, speedMps: 0 }, out: false, spec: s.destroyer!.spec }] } : null,
    dawn: { strike: st && s.airStrike ? { state: st, p: s.airStrike } : null },
    patrol: null, seaplane: null,
  };
  const arms = new ArmsStep('noship', { gun: lo.gun, aa: { ...lo.aa, hitChancePerRound: 1e-9 }, seed: 11, world: w });
  const rng = new SeededRng((11 + 19) >>> 0);
  const c: AirStrikeCheck = { player: boat, playerSinking: false, escort: null, escortAfloat: false, cancel: false };
  if (st && s.airStrike) startAirStrike(st, s.airStrike, boat);
  const magP = lo.gun!.magazine!;
  return {
    w, arms, st, magP,
    /** 1 固定ステップ（世界の順）。hunt があれば BargeHunt の弾倉の段の代わり（交換 → 押していて交換中なら PT_GUN_RELOAD。標的は無い） */
    step(): void {
      w.stepTimeS += DT;
      arms.stepShips(w, w.destroyers, DT * s.timeScale, DT);
      arms.applyFlash(w);
      const h = w.hunt;
      if (h && h.mag) h.battery.status = magazineTick(h.mag, magP, DT) && w.input.gunHeld ? PT_GUN_RELOAD : w.input.gunHeld ? GUN_NO_TARGET : GUN_SAFE;
      arms.stepAir(w, DT * s.timeScale, DT);
      if (st && s.airStrike) stepAirStrike(st, s.airStrike, c, rng, DT);
    },
  };
}
type Rig = ReturnType<typeof rig>;

/** 武器の HUD のテレメトリ（arms だけ。兵装の上の 1 行とボタンが読む） */
function armsTele(r: Rig): BoatTelemetry {
  const t = { aaFiring: false, gunReloadLeftS: 0, pt: { gunEnabled: false, reloadLeftS: 0 }, arms: createArmsTelemetry() } as unknown as BoatTelemetry;
  refreshArmsTelemetry(t, { arms: r.arms, torpedoes: { remaining: 4 }, atHome: false, boat: { sinking: false } });
  return t;
}

describe('us_02・us_01: 艦への機銃は自分の弾倉（ArmsStep が交換を進める）', () => {
  for (const [id, rounds, startStep] of [['us_02', 120, 675], ['us_01', 50, 441]] as const) {
    it(`${id}: 東 400 m の駆逐艦へ押し続けると ${rounds} 発で交換（${(startStep / 60).toFixed(2)} 秒）、3.2 秒は撃たず reloadN 4→3→2→1・兵装の上の 1 行は「弾倉交換 ・ あと N 秒」・ボタンは「弾倉交換\\nN」、済めばまた撃つ`, () => {
      const r = rig(id, { ship: true });
      expect(r.arms.mag).not.toBeNull();
      r.w.input.gunHeld = true;
      let k = 0;
      for (; k < 60 * 20 && r.arms.mag!.reloadLeftS === 0; k++) r.step();
      expect([k - 1, r.arms.shipRounds, r.arms.mag!.magLeft, r.arms.mag!.reloadLeftS]).toEqual([startStep, rounds, 0, 3.2]);
      const ns: number[] = [];
      const cues: string[] = [];
      const labels = new Set<string>();
      let steps = 0;
      let refillShots = -1;
      while (r.arms.mag!.reloadLeftS > 0) {
        const before = r.arms.shipRounds;
        r.step();
        steps++;
        if (r.arms.mag!.reloadLeftS === 0) {
          refillShots = r.arms.shipRounds - before;
          break;
        }
        expect(r.arms.shipRounds).toBe(before); // 交換中は撃たない
        expect(r.arms.shipGun!.battery.status).toBe(PT_GUN_RELOAD);
        if (ns.at(-1) !== r.arms.reloadN) ns.push(r.arms.reloadN);
        const t = armsTele(r);
        if (t.arms.stCode === ST_RELOAD) cues.push(armsCueJa(t.arms.stCode, t.arms.stN).text);
        else expect(t.arms.stCode).toBe(ST_SHIP); // 撃ち終わりの 0.6 秒は「艦に効かず閃光で見つかる」のまま
        labels.add(gunButtonLabel(Math.max(gunButtonReloadN(t), t.arms.reloadN)));
      }
      expect(steps).toBe(193);
      expect(ns).toEqual([4, 3, 2, 1]);
      expect([...new Set(cues)]).toEqual(['弾倉交換 ・ あと 3 秒', '弾倉交換 ・ あと 2 秒', '弾倉交換 ・ あと 1 秒']);
      expect([...labels]).toEqual(['弾倉交換\n4', '弾倉交換\n3', '弾倉交換\n2', '弾倉交換\n1']);
      // 満ちた同じステップから撃つ（組ごとに 1 発: Elco 80 は 2 組、Elco 77 は 1 組）
      expect([refillShots, r.arms.mag!.magLeft, r.arms.shipGun!.battery.status, r.arms.reloadN]).toEqual([r.arms.shipGun!.g.groups.length, rounds - refillShots, GUN_FIRING, 0]);
      const after = r.arms.shipRounds;
      for (let i = 0; i < 30; i++) r.step();
      expect(r.arms.shipRounds).toBeGreaterThan(after);
    });
  }
  it('us_01 は艦への機銃と対空が 1 つの弾倉を分け合う（作るのは 1 つ・借りない）: 艦へ撃った残りから機へ撃つ', () => {
    const r = rig('us_01', { ship: true, strike: true });
    expect(r.arms.shipGun).not.toBeNull();
    expect(r.arms.aa).not.toBeNull();
    expect(r.arms.mag).toEqual({ magLeft: 50, reloadLeftS: 0 });
    for (let i = 0; i < 60 / DT && !r.st!.planes.some((p) => p.phase === AS_ORBIT); i++) r.step();
    r.w.input.gunHeld = true;
    for (let i = 0; i < 60; i++) r.step(); // 艦が先（対空は AA_BUSY）
    expect([r.arms.shipRounds > 0, r.arms.aaRounds, r.arms.aa!.status]).toEqual([true, 0, AA_BUSY]);
    (r.w.destroyers!.ships[0] as { out: boolean }).out = true; // 艦が去る → 機へ
    for (let i = 0; i < 90 && r.arms.aaRounds < 5; i++) r.step();
    expect(r.arms.aaRounds).toBeGreaterThanOrEqual(5);
    expect(r.arms.mag!.magLeft).toBe(50 - r.arms.shipRounds - r.arms.aaRounds);
  });
});

describe('us_03: 対空は大発への砲の弾倉を借りる（交換は BargeHunt。jp_01 の米PT の砲と同じ形）', () => {
  it('借りた弾倉（hunt.mag）が 1 発ごとに減り、空で交換が始まる。交換の 3.2 秒は機へ撃たない（大発の砲が PT_GUN_RELOAD なら AA_BUSY、そうでなくても AA_RELOAD）。ArmsStep は交換を進めない', () => {
    const r = rig('us_03', { strike: true, hunt: true });
    const mag = r.w.hunt!.mag!;
    expect(r.arms.mag).toBe(mag);
    for (let i = 0; i < 60 / DT && !r.st!.planes.some((p) => p.phase === AS_ORBIT); i++) r.step();
    mag.magLeft = 6; // 6 発残りから（機が射程にいる間に撃ち切る）
    r.w.input.gunHeld = true;
    for (let i = 0; i < 10 / DT && mag.reloadLeftS === 0; i++) {
      r.step();
      if (mag.reloadLeftS === 0) expect(mag.magLeft).toBe(6 - r.arms.aaRounds);
    }
    expect([r.arms.aaRounds, mag.magLeft, mag.reloadLeftS]).toEqual([6, 0, 3.2]);
    const ns: number[] = [];
    let steps = 0;
    while (mag.reloadLeftS > 0) {
      r.step();
      steps++;
      if (mag.reloadLeftS === 0) break;
      expect([r.arms.aaRounds, r.w.hunt!.battery.status, r.arms.aa!.status]).toEqual([6, PT_GUN_RELOAD, AA_BUSY]);
      if (ns.at(-1) !== r.arms.reloadN) ns.push(r.arms.reloadN);
    }
    expect(steps).toBe(193); // 交換を進めたのは偽の BargeHunt の 1 回だけ（ArmsStep も進めたら 97 ステップで済む）
    const again = r.arms.aaRounds - 6; // 満ちた同じステップから撃つ（組ごとに 1 発まで）
    expect(again).toBeLessThanOrEqual(2);
    expect(mag.magLeft).toBe(120 - again);
    expect(ns).toEqual([4, 3, 2, 1]);
    // 大発の砲の状態を書かない世界でも、借りた弾倉が交換中なら撃たない（AA_RELOAD）
    const q = rig('us_03', { strike: true, hunt: true });
    for (let i = 0; i < 60 / DT && !q.st!.planes.some((p) => p.phase === AS_ORBIT); i++) q.step();
    q.w.hunt!.mag!.magLeft = 0;
    q.w.hunt!.mag!.reloadLeftS = 3.2;
    q.w.hunt = { battery: { status: GUN_NO_TARGET }, mag: null }; // 状態は書かない（弾倉は ArmsStep が借りたまま）
    q.w.input.gunHeld = true;
    for (let i = 0; i < 30; i++) q.step();
    expect([q.arms.aaRounds, q.arms.aa!.status]).toEqual([0, AA_RELOAD]);
  });
  it('交換が済めばまた機へ撃つ（AA_FIRING）', () => {
    const r = rig('us_03', { strike: true, hunt: true });
    for (let i = 0; i < 60 / DT && !r.st!.planes.some((p) => p.phase === AS_ORBIT); i++) r.step();
    r.w.input.gunHeld = true;
    for (let i = 0; i < 10 / DT && r.arms.aa!.status !== AA_FIRING; i++) r.step();
    expect(r.arms.aa!.status).toBe(AA_FIRING);
    expect(r.w.hunt!.mag!.magLeft).toBe(120 - r.arms.aaRounds);
  });
});

describe('us_03 の 2 行目（gunLine・bargeKey）と機銃ボタン', () => {
  const g = buildWorldSetup(gameData, 'us_03').guns!;
  const hunt = (over: Partial<BoatTelemetry>): BoatTelemetry =>
    tele({ enabled: false, gunEnabled: false }, { gunMission: true, gunStatus: PT_GUN_RELOAD, gunReloadLeftS: 3.2, gunEffectiveM: g.effectiveM, gunRangeM: g.rangeM, bargesSunk: 1, bargesQuota: 3, bargesTotal: 4, ...over });
  it('弾倉交換: 「弾倉交換 ・ あと N 秒 ・ 撃破 1/3」（強い白。逃げていれば上陸までの秒、沿岸砲・浅瀬は後ろ）。2 行目のモードは MISSION_GUN（大発が残り、機を撃っていない）', () => {
    expect(gunLine(hunt({}), 0, 0, 0)).toEqual({ text: '弾倉交換 ・ あと 4 秒 ・ 撃破 1/3', color: HUD_COLOR_STRONG });
    expect(gunLine(hunt({ gunReloadLeftS: 2.5 }), 0, 12, 0).text).toBe('弾倉交換 ・ あと 3 秒 ・ 撃破 1/3 ・ 上陸まで 12 秒');
    expect(gunLine(hunt({ gunReloadLeftS: 0.4, batteryInArc: true, batteryAlerted: true, shallowState: SHALLOW_INSIDE, shallowSafeKt: 15 }), 0, 7, 0).text).toBe('弾倉交換 ・ あと 1 秒 ・ 撃破 1/3 ・ 上陸まで 7 秒 ・ 沿岸砲！ ・ 浅瀬 15 kt 以下');
    expect(missionMode(hunt({}), 0, 0)).toBe(MISSION_GUN);
    // 一番長い交換の行は、tests/dawn-clock が幅を見た射撃中の一番長い行より短い
    const longest = gunLine(hunt({ bargesSunk: 2, batteryInArc: true, batteryAlerted: true, shallowState: SHALLOW_INSIDE, shallowSafeKt: 15 }), 0, 31, 19).text;
    const firing = gunLine(hunt({ gunStatus: GUN_FIRING, bargesSunk: 2, batteryInArc: true, batteryAlerted: true, shallowState: SHALLOW_INSIDE, shallowSafeKt: 15 }), Math.ceil(g.rangeM / GUN_DISTANCE_STEP_M), 99, 19).text;
    expect(textWidthPx(longest, 22)).toBeLessThan(textWidthPx(firing, 22));
  });
  it('残り秒（gunReloadStep）: 交換中だけ切り上げを 1〜7 に（押していない＝状態が弾倉交換でなければ 0）。3.2 秒の交換で 4→3→2→1 と 1 秒ごとに変わる＝bargeKey の bit 27〜29 が変わり、文を組み直す', () => {
    expect([3.2, 3, 2.01, 2, 0.01, 0, 9].map((s) => gunReloadStep(hunt({ gunReloadLeftS: s })))).toEqual([4, 3, 3, 2, 1, 1, 7]);
    expect(gunReloadStep(hunt({ gunStatus: GUN_SAFE }))).toBe(0);
    expect(gunReloadStep(hunt({ gunStatus: GUN_FIRING }))).toBe(0);
    const seq: number[] = [];
    let changes = 0;
    let last = -1;
    for (let left = 3.2; left > 0; left -= DT) {
      const key = gunReloadStep(hunt({ gunReloadLeftS: left })) << 27;
      if (key !== last) {
        changes++;
        seq.push(key >> 27);
        last = key;
      }
    }
    expect([seq, changes]).toEqual([[4, 3, 2, 1], 4]);
    // ui/mission-line の bargeKey: ほかの欄は bit 26 まで、交換の秒は bit 27〜29（3 ビット＝7 まで）。最大でも 2^30 − 1 で正の 31 ビットに収まる
    const src = readFileSync(new URL('../src/ui/mission-line.ts', import.meta.url), 'utf8');
    const expr = src.slice(src.indexOf('const bargeKey = t.gunMission'), src.indexOf(': 0;', src.indexOf('const bargeKey = t.gunMission')));
    expect(expr.split('(gunReloadStep(t) << 27)').length).toBe(2);
    const shifts = [...expr.matchAll(/<< (\d+)/g)].map((m) => Number(m[1]));
    expect(Math.max(...shifts.filter((n) => n !== 27))).toBe(26);
    expect((7 << 27) | ((1 << 27) - 1)).toBe(2 ** 30 - 1);
  });
  it('機銃ボタン（gunButtonReloadN）: 米PT への砲と大発への砲の交換の大きい方（切り上げ）。交換していなければ 0', () => {
    const t = (pt: number, barge: number): BoatTelemetry => tele({ gunEnabled: pt > 0, reloadLeftS: pt }, { gunReloadLeftS: barge });
    expect([gunButtonReloadN(t(0, 3.2)), gunButtonReloadN(t(0, 0.01)), gunButtonReloadN(t(0, 0)), gunButtonReloadN(t(2.5, 1.2)), gunButtonReloadN(t(0.5, 2.5))]).toEqual([4, 1, 0, 3, 3]);
    expect(gunButtonLabel(gunButtonReloadN(t(0, 3.2)))).toBe('弾倉交換\n4');
  });
});

describe('ソースの pin（systems/arms-step・systems/mission-telemetry）', () => {
  it('借りる弾倉は米PT の砲か大発の砲（hunt.mag）。大発の砲の弾倉交換中は機へ撃たない（busy）', () => {
    const s = readFileSync(new URL('../src/systems/arms-step.ts', import.meta.url), 'utf8');
    expect(s).toContain('const borrowed = (w && w.pts && w.pts.gun ? w.pts.gun.state : null) ?? (w && w.hunt ? w.hunt.mag : null);');
    expect(s).toContain('(w.hunt !== null && w.hunt.battery.status === PT_GUN_RELOAD)');
    expect(s).toContain('this.ownsMag = used && borrowed === null && this.magP !== null;');
  });
  it('us_03 の交換の残り秒は大発の砲の弾倉から写す（無いと 2 行目が「あと 1 秒」のまま・bargeKey の bit 27〜29 が変わらない。レビュー mag-2）', () => {
    const s = readFileSync(new URL('../src/systems/mission-telemetry.ts', import.meta.url), 'utf8');
    expect(s).toContain('t.gunReloadLeftS = h.mag ? h.mag.reloadLeftS : 0;');
  });
});
