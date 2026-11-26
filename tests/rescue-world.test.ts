// v0.8.5 S2（spec-v0850 §4.0〜§4.4・§7 S2、lead の決め 1〜3）: 救助・機雷原・フィッチの砲火・大発の無い任務の沿岸砲の世界の配線を、Phaser なしの偽の場面で確かめる。
// - 組み立て: systems/rescue-field-setup の rescueFieldOf は core/rescue-field の rollRescueField そのもの（seed+47 の 88 回）。救助の無い任務は null（系列も作らない）。
// - 触雷: 置いた機雷に船体が触れたステップに世界の hitBoat を 1 回（終了理由 'mine'・被害は mine.params・乱数は seed+47 の続き＝組み立ての rng そのもの）。水柱も 1 回。
// - 砲台の着弾（onShell）は群から 1 名・救助の時間の終わり（夜明けのラッチ）は残りを他艦へ・終わり（finish）は帰投で乗せている分を渡した・沈没で失った・漂流で乗せたまま（決め 3）。
// - 沿岸砲の持ち主: us_07（大発なし）は world-enemies が ShoreGuns（seed+8〜）を作り、us_03（大発あり）は大発の狩りの中のまま（ShoreGuns は null）。ほかの任務は null。
// - 固定ステップの順（tests/rescue-step-order と同じ並び）・PT の隊の絵の鍵と名（config/pt-look-data）・達成（mission-objective）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { hasHardVariant } from '../src/config/mission-data';
import { rescueFieldSite } from '../src/config/minefield-mission-data';
import { PT_LOOK_DEFAULT, SBOAT_TEXTURE_KEY, ptLookOf } from '../src/config/pt-look-data';
import { PT_BOAT_TEXTURE_KEY } from '../src/config/pt-config';
import type { BoatState } from '../src/core/boat-motion';
import type { HitSpec } from '../src/core/gunnery';
import type { MissionEndReason } from '../src/core/mission-flow';
import { MINE_BLOWN, MINE_HIDDEN } from '../src/core/minefield';
import { rollRescueField } from '../src/core/rescue-field';
import { RESCUE_FIELD_SEED_OFFSET } from '../src/core/rescue';
import { SeededRng } from '../src/core/rng';
import { FIXED_STEP_S } from '../src/config/step-config';
import { objectiveDoneOf, type ObjectiveWorld } from '../src/systems/mission-objective';
import { rescueFieldOf } from '../src/systems/rescue-field-setup';
import { ptNamesPart, rescueTelemetryPart } from '../src/systems/rescue-telemetry';
import { rescueResultPart } from '../src/systems/rescue-result-part';
import { WorldRescue } from '../src/systems/world-rescue';
import { setupOf } from './column-world-kit';
import { chain } from './torpedo-free-kit';

type BuildEnemies = (...a: unknown[]) => { hunt: unknown; shoreGuns: { shores: { p: { baseDetectM: number } }[] } | null; pts: { look: { texKey: string } } | null };
const { buildEnemies } = (await import(/* @vite-ignore */ ['..', 'src', 'systems', 'world-enemies'].join('/'))) as { buildEnemies: BuildEnemies };
const PROTO_IDS = (gameData.missionsSeed.missions as unknown as Record<string, unknown>[]).filter((m) => m['v0_1_prototype']).map((m) => m['id'] as string);
const fakeScene = (): unknown => ({ add: { image: () => chain, text: () => chain, graphics: () => chain }, tweens: { add: () => chain }, textures: { exists: () => true, get: () => ({ customData: {} }) } });

interface Rig {
  r: WorldRescue;
  boat: { state: BoatState; sinking: boolean };
  w: { boat: { state: BoatState; sinking: boolean }; dawn: { reached: boolean }; pts: null; stepTimeS: number };
  hits: { spec: HitSpec; rng: SeededRng; reason: MissionEndReason }[];
  splashes: number;
  rng: SeededRng;
}
function rig(seed = 1, hard = false): Rig {
  const s = setupOf('us_07', hard, seed);
  const f = rescueFieldOf(s, seed)!;
  const boat = { state: { x: 0, y: 0, headingDeg: 0, speedMps: 0 } as BoatState, sinking: false };
  const w = { boat, dawn: { reached: false }, pts: null, stepTimeS: 0 };
  const out: Rig = { r: null as unknown as WorldRescue, boat, w, hits: [], splashes: 0, rng: f.rng };
  const splashes = { splash: (): void => { out.splashes++; } };
  out.r = new WorldRescue(s, f, splashes, (spec, rng, _x, _y, reason) => out.hits.push({ spec, rng, reason }));
  return out;
}
const steps = (g: Rig, n: number): void => {
  for (let i = 0; i < n; i++) {
    g.w.stepTimeS += FIXED_STEP_S;
    g.r.step(g.w, FIXED_STEP_S);
  }
};

describe('組み立て（lead の決め 2）', () => {
  it('rescueFieldOf は rollRescueField そのもの（同じ seed で同じ群のずれと機雷の置き方・seed+47）。ノーマルもハードも', () => {
    for (const hard of [false, true]) for (const seed of [1, 2, 7]) {
      const s = setupOf('us_07', hard, seed);
      const a = rescueFieldOf(s, seed)!;
      const b = rollRescueField(seed, s.rescue!, s.minefield!, rescueFieldSite(s.mission, s.rescue!), s.boatHalfLengthM);
      expect([Array.from(a.rescue.gx), Array.from(a.rescue.gy), Array.from(a.mines!.x), Array.from(a.mines!.state)]).toEqual([Array.from(b.rescue.gx), Array.from(b.rescue.gy), Array.from(b.mines!.x), Array.from(b.mines!.state)]);
      const c = new SeededRng((seed + RESCUE_FIELD_SEED_OFFSET) >>> 0);
      for (let i = 0; i < 2 * (s.rescue!.groups.length + s.minefield!.maxCount); i++) c.next();
      expect(a.rng.next()).toBe(c.next()); // 返す rng は 88 回の後の続き
    }
  });
  it('救助の無い任務（ハードも）は null', () => {
    for (const id of PROTO_IDS.filter((x) => x !== 'us_07')) for (const hard of hasHardVariant(gameData, id) ? [false, true] : [false]) expect(rescueFieldOf(setupOf(id, hard), 1), id).toBeNull();
  });
});

describe('拾う・砲撃・時間の終わり・終わり（決め 3）', () => {
  it('群の中心で止まっていれば体感 0.8 秒ごとに 1 名。着弾は 1 名。夜明けのラッチで残りは他艦へ', () => {
    const g = rig();
    const st = g.r.state;
    g.boat.state.x = st.gx[0]!;
    g.boat.state.y = st.gy[0]!;
    steps(g, Math.round(g.r.rules.perPersonS / FIXED_STEP_S) * 3);
    expect(st.aboard).toBe(3);
    const before = st.left[1]!;
    g.r.onShell(st.gx[1]!, st.gy[1]!);
    expect([st.left[1], st.lostShell]).toEqual([before - 1, 1]);
    const water = Array.from(st.left).reduce((a, x) => a + x, 0);
    g.w.dawn.reached = true;
    steps(g, 1);
    expect([st.timeUp, st.byOthers, Array.from(st.left).every((x) => x === 0)]).toEqual([true, water, true]);
  });
  it('finish: 帰投は乗せている分も渡した・沈没は失った・漂流と座礁は乗せたまま。2 回目は何もしない', () => {
    for (const [reason, del, lost, aboard] of [['returned', 2, 0, 0], ['destroyed', 0, 2, 0], ['mine', 0, 2, 0], ['adrift', 0, 0, 2], ['grounded', 0, 0, 2]] as const) {
      const g = rig();
      g.r.state.aboard = 2;
      g.r.finish(reason);
      g.r.finish('returned');
      expect([g.r.state.delivered, g.r.state.lostSunk, g.r.state.aboard], reason).toEqual([del, lost, aboard]);
    }
  });
});

describe('触雷（決め 1）', () => {
  it('置いた機雷に触れたステップに hitBoat を 1 回（mine・被害 60・乱数は組み立ての続き）と水柱。同じ機雷は 2 度目に爆発しない', () => {
    const g = rig(3);
    const m = g.r.mines!;
    const k = Array.from(m.state).findIndex((x) => x === MINE_HIDDEN);
    g.boat.state.x = m.x[k]!;
    g.boat.state.y = m.y[k]!;
    steps(g, 1);
    expect(g.hits.length).toBe(1);
    expect([g.hits[0]!.reason, g.hits[0]!.spec.damage, g.hits[0]!.rng === g.rng, m.state[k], g.splashes]).toEqual(['mine', g.r.field!.mine.damage, true, MINE_BLOWN, 1]);
    steps(g, 5);
    expect(g.hits.length).toBe(1);
  });
  it('沈み始めた艇は触れない・見つけない', () => {
    const g = rig(3);
    const m = g.r.mines!;
    const k = Array.from(m.state).findIndex((x) => x === MINE_HIDDEN);
    g.boat.state.x = m.x[k]!;
    g.boat.state.y = m.y[k]!;
    g.boat.sinking = true;
    steps(g, 3);
    expect([g.hits.length, m.seen]).toEqual([0, 0]);
  });
});

describe('沿岸砲の持ち主・PT の絵と名', () => {
  it('us_07 は ShoreGuns（大発の狩りなし・3 門＝隊 1 つ・210 mm の base_detect_m）、us_03 は大発の狩りの中（ShoreGuns なし）、ほかの任務は null', () => {
    for (const id of PROTO_IDS) {
      const s = setupOf(id, false, 4);
      const boat = { x: 0, y: 0, headingDeg: 0, speedMps: 0 } as BoatState;
      const e = buildEnemies(fakeScene(), s, 4, boat, chain, {}, () => undefined, () => undefined, { stepTimeS: 0 }, null, gameData, null);
      if (id === 'us_07') {
        expect(e.hunt).toBeNull();
        expect(e.shoreGuns!.shores.map((x) => x.p.baseDetectM)).toEqual([6000]);
        expect(e.pts!.look.texKey).toBe(SBOAT_TEXTURE_KEY);
      } else expect(e.shoreGuns, id).toBeNull();
      if (id === 'us_03') expect(e.hunt).not.toBeNull();
      if (e.pts && id !== 'us_07') expect(e.pts.look.texKey, id).toBe(PT_BOAT_TEXTURE_KEY);
    }
  });
  it('米PT の鍵の写し（config/pt-config）は game-config の TEXTURE_KEYS.ptBoat と同じ字', () => {
    expect(/ptBoat: '([^']+)'/.exec(readFileSync('src/config/game-config.ts', 'utf8'))![1]).toBe(PT_BOAT_TEXTURE_KEY);
  });
  it('pt-look-data: 米PT は今の鍵・名・言葉で named false、S ボートは tex-sboat・「Sボート」・ディーゼルの「炎上」', () => {
    expect(ptLookOf(gameData, 'us_pt_enemy')).toEqual(PT_LOOK_DEFAULT);
    expect(ptLookOf(gameData, 'de_sboat_enemy')).toEqual({ texKey: SBOAT_TEXTURE_KEY, nameJa: 'Sボート', sunkJa: '炎上', named: true });
    expect(ptNamesPart({ pts: { look: PT_LOOK_DEFAULT } })).toEqual({});
    expect(ptNamesPart({ pts: null })).toEqual({});
    expect(ptNamesPart({ pts: { look: ptLookOf(gameData, 'de_sboat_enemy') } })).toEqual({ ptNames: { nameJa: 'Sボート', sunkJa: '炎上' } });
  });
});

describe('達成・テレメトリ・Result の材料', () => {
  it('達成は帰投と同じに数える終わりで渡した ≥ 40（米PT の隊の枝より先）。呼びかけの元は objectiveReached', () => {
    const g = rig();
    const base = { landing: null, convoy: null, escort: null, pts: {}, patrol: null, enemy: { objectiveDone: false }, detect: { count: 0 } };
    const w = { ...base, rescue: g.r } as unknown as ObjectiveWorld;
    g.r.state.delivered = 39;
    expect(objectiveDoneOf('returned', w)).toBe(false);
    g.r.state.delivered = 40;
    expect([objectiveDoneOf('returned', w), objectiveDoneOf('cleared', w), objectiveDoneOf('adrift', w), objectiveDoneOf('mine', w)]).toEqual([true, true, false, false]);
  });
  it('テレメトリは救助の任務だけ鍵が出る・写す（海に残る・一番近い群・フィッチ）。Result の材料も', () => {
    const g = rig();
    const w = { rescue: g.r, boat: g.boat, pts: null, shoreGuns: null };
    const t = rescueTelemetryPart(w).rescue!;
    expect([t.capacity, t.objective, t.total, t.onWater, t.fitchJa, t.corryJa, t.nearCount > 0]).toEqual([20, 40, 60, 60, 'フィッチ', 'コリー', true]);
    expect(rescueTelemetryPart({ rescue: null, boat: g.boat, pts: null })).toEqual({});
    g.r.state.delivered = 41;
    g.r.finish('returned');
    expect(rescueResultPart(w).rescue!).toMatchObject({ total: 60, objective: 40, delivered: 41, minesBlown: 0, sboats: 0, batteryShots: 0 });
    expect(rescueResultPart({ rescue: null, pts: null, shoreGuns: null })).toEqual({});
  });
});
