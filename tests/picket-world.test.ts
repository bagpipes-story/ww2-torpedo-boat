// v0.8.1 S2b（spec-v0810 §3.2 D-S8・§3.4 D-R3・§3.6 D-A2、lead の L40〜L46）: ハードの駆潜艇の世界の配線（systems/destroyer-group の並び・picketIndex・gunneryAt・radarKindAt、
// systems/destroyer-anchor の計画、systems/world-enemies の命中の手）を、本物の DestroyerGroup（絵は鎖の偽物＝tests/torpedo-free-kit の作法・文字列を組んだ動的 import）と
// Phaser なしの小さな世界（tests/anchor-world-kit。艦の段は本物の destroyer-step・止まった艦は本物の destroyer-anchor）で確かめる:
// - 並び: ハードは卯月 → 空知丸 → 駆潜艇 2（picketIndex 2・picketCount 2）、ノーマルは 2 隻（−1・0）。駆潜艇は記録の寸法・砲・AI と絵の鍵 tex-subchaser・今夜の揺らぎ込みの出発点。
// - 止まった規則: 駆潜艇も速さ 0 で止まり当たりの円のまま・卯月が気づいてから警報 4 秒で気づき体感 4 秒で動き出す（命中スローで延びる）・夜明けは遅れなしで東へ退いて海域を出る。
// - 数え方: 駆逐艦 1・達成 1。1 本で沈む駆潜艇は撃沈 n/m・達成・輸送船の加点に入らない。駆潜艇へ狙った 1 本は止まっていても動いていても通算の命中率の外（駆逐艦でない）。
// - 砲とレーダー: gunneryAt は駆潜艇に記録の 76 mm・13 mm、ほかの任務の艦には今の式の値（同じ物）。命中の手は gunneryAt を読む。radarKindAt は駆潜艇だけ小さい艇（kit も同じ式）。
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { getKpiMinTargetSpeedMps } from '../src/config/kpi-data';
import { hasHardVariant } from '../src/config/mission-data';
import { shipArtKey } from '../src/config/ship-art-config';
import { ANCHOR_ALERT, ANCHOR_ASLEEP, ANCHOR_REASON_ALARM, ANCHOR_REASON_DAWN, ANCHOR_REASON_SEEN, ANCHOR_UNDERWAY } from '../src/core/anchored-ship';
import type { BoatState } from '../src/core/boat-motion';
import type { GunneryParams, HitSpec } from '../src/core/gunnery';
import type { ShotRecord } from '../src/core/hit-rate';
import { RADAR_KIND_SHIP, RADAR_KIND_SMALL } from '../src/core/radar';
import { SeededRng } from '../src/core/rng';
import { directSortie } from '../src/core/sortie';
import type { TorpedoState } from '../src/core/torpedo';
import type { AnchorSetup } from '../src/config/anchor-mission-data';
import type { DestroyerAnchor } from '../src/systems/destroyer-anchor';
import { torpedoEventsFor } from '../src/systems/torpedo-hits';
import { consumeTorpedoFire, stepLauncher, type FreeTorpedoWorld } from '../src/systems/torpedo-free';
import type { WorldEvents } from '../src/systems/world-events';
import { buildWorldSetup, type DestroyerSpec, type WorldSetup } from '../src/systems/world-setup';
import { anchorKit, anchorStep, runUntil, type AnchorKitWorld } from './anchor-world-kit';
import { code } from './core-rules-kit';
import { DT, chain, kit } from './torpedo-free-kit';

/** 本物の DestroyerGroup の読む部分（Phaser を引くので型検査に入れない＝動的 import） */
interface GroupShip { readonly spec: DestroyerSpec; readonly state: BoatState; readonly circles: unknown; readonly out: boolean; anchored: boolean; sinking: boolean; hitsTaken: number; takeHit(): boolean; playSinking(nowS: number, onDone: () => void): void }
interface Group {
  readonly ships: GroupShip[];
  readonly fires: { onHit(gunIndex: number, x: number, y: number): void }[];
  readonly destroyerCount: number; readonly transportIndex: number; readonly picketIndex: number; readonly picketCount: number; readonly objectiveSinks: number; readonly passRadius2: number;
  readonly total: number; readonly sunkCount: number; readonly objectiveSinking: boolean; readonly transportSunk: boolean; readonly allOut: boolean; readonly allSettled: boolean;
  anchors: DestroyerAnchor | null;
  gunneryAt(i: number): GunneryParams;
  radarKindAt(i: number): number;
  setAnchors(a: AnchorSetup): void;
  nearestAfloatIndex(x: number, y: number): number;
}
type GroupCtor = new (...a: unknown[]) => Group;
const { DestroyerGroup } = (await import(/* @vite-ignore */ ['..', 'src', 'systems', 'destroyer-group'].join('/'))) as { DestroyerGroup: GroupCtor };
type BuildEnemies = (...a: unknown[]) => { destroyers: Group | null };
const { buildEnemies } = (await import(/* @vite-ignore */ ['..', 'src', 'systems', 'world-enemies'].join('/'))) as { buildEnemies: BuildEnemies };

const STEP = DT;
const MIN = getKpiMinTargetSpeedMps(gameData);
const near = (a: number, b: number, tol = STEP * 1.01): boolean => Math.abs(a - b) <= tol;
const setupOf = (id: string, hard: boolean, seed = 1): WorldSetup => buildWorldSetup(gameData, id, { sortie: directSortie(id, seed, 'none', hard, false), hard });
/** 絵の偽物の場面（作った Image の鍵を keys に残す。沈む tween も鎖） */
const sceneOf = (keys: string[] = []): unknown => ({ add: { image: (_x: number, _y: number, key: string) => (keys.push(key), chain) }, tweens: { add: () => chain } });
/** world-enemies と同じ引数で隊を作る（見張り seed+17・砲 seed+1 の系列は数だけ） */
const groupOf = (s: WorldSetup, keys?: string[]): Group =>
  new DestroyerGroup(sceneOf(keys), s.destroyer!, s.transport, s.transit ?? null, s.mission.bounds, new SeededRng(2), new SeededRng(18), {}, shipArtKey(s.mission.enemyId), s.pickets ?? null);
const SHIP_TEX = /^tex-(destroyer|transport|subchaser)/;
const anchors = (w: AnchorKitWorld): DestroyerAnchor => w.destroyers.anchors!;

/** 1 本撃って（タップ）、撃った魚雷を返す（tests/kpi-world と同じ） */
function fireOne(w: FreeTorpedoWorld): TorpedoState {
  w.input.fireTap = true;
  consumeTorpedoFire(w);
  const pool = w.torpedoes as unknown as { remaining: number; capacity: number; states: TorpedoState[] };
  for (let i = 0; i < 30; i++) {
    const before = pool.remaining;
    stepLauncher(w, DT);
    if (pool.remaining < before) return pool.states[pool.capacity - before]!;
  }
  throw new Error('撃てなかった');
}

describe('隊の並び（L41）', () => {
  it('ハードは卯月 → 空知丸 → 駆潜艇 2 の 4 隻（picketIndex 2・picketCount 2）、ノーマルは 2 隻（−1・0）。駆潜艇は記録の寸法・沈む本数・絵の鍵 tex-subchaser・今夜の揺らぎ込みの出発点', () => {
    for (const seed of [1, 7, 12345]) {
      const s = setupOf('us_06', true, seed);
      const keys: string[] = [];
      const g = groupOf(s, keys);
      expect([g.total, g.destroyerCount, g.transportIndex, g.picketIndex, g.picketCount, g.objectiveSinks]).toEqual([4, 1, 1, 2, 2, 1]);
      expect(g.ships.map((d) => [d.spec.lengthM, d.spec.hitsToSink])).toEqual([[102.7, 2], [120, 1], [51, 1], [51, 1]]);
      expect(keys.filter((k) => SHIP_TEX.test(k))).toEqual(['tex-destroyer-mutsuki', 'tex-transport', 'tex-subchaser', 'tex-subchaser']);
      expect([g.ships[2]!.spec, g.ships[3]!.spec]).toEqual([s.pickets!.spec, s.pickets!.spec]);
      expect(g.ships.slice(2).map((d) => [d.state.x, d.state.y, d.state.headingDeg])).toEqual(s.pickets!.starts.map((p) => [p.x, p.y, p.headingDeg]));
      expect(g.passRadius2).toBe(Math.max(s.destroyer!.passRadius2, s.transport!.passRadius2, s.pickets!.passRadius2));
      expect(s.pickets!.shipAi.ramEnabled).toBe(false);
      // 小さな世界（kit）も同じ並び・同じ出発点
      const w = anchorKit({ hard: true, seed });
      expect(w.destroyers.ships.map((d) => [d.state.x, d.state.y, d.state.headingDeg])).toEqual(g.ships.map((d) => [d.state.x, d.state.y, d.state.headingDeg]));
      expect([w.destroyers.picketIndex, w.destroyers.picketCount]).toEqual([2, 2]);
    }
    const n = groupOf(setupOf('us_06', false), []);
    expect([n.total, n.destroyerCount, n.transportIndex, n.picketIndex, n.picketCount]).toEqual([2, 1, 1, -1, 0]);
  });
  it('setAnchors: 本物の隊はハードの 4 隻をみな止める（速さ 0・anchored）。計画は [3, null, 4, 4]', () => {
    const s = setupOf('us_06', true);
    const g = groupOf(s);
    g.setAnchors(s.anchors!);
    expect(g.ships.map((d) => [d.anchored, d.state.speedMps])).toEqual([[true, 0], [true, 0], [true, 0], [true, 0]]);
    expect(g.anchors!.plan.underwayS).toEqual([3, null, 4, 4]);
  });
});

describe('止まった駆潜艇（ハード・揺らぎなし。tests/anchor-world-kit）', () => {
  const PK = [2, 3] as const;
  it('作る時に止まり、自艇が遠ければ 60 秒たっても位置・針路・当たりの円は作った時のまま・誰も気づかない', () => {
    const w = anchorKit({ hard: true });
    const ships = w.destroyers.ships;
    expect(PK.map((i) => [ships[i]!.state.x, ships[i]!.state.y, ships[i]!.state.headingDeg, ships[i]!.state.speedMps])).toEqual([[2300, 2050, 90, 0], [3200, 1500, 270, 0]]); // 2 隻目は v0.8.1 S3 の探りの帯 H1・H2 で (4300, 2200) から
    const before = PK.map((i) => JSON.stringify([ships[i]!.state, ships[i]!.circles]));
    runUntil(w, 60);
    expect(PK.map((i) => JSON.stringify([ships[i]!.state, ships[i]!.circles]))).toEqual(before);
    expect(Array.from(anchors(w).state.stage)).toEqual([ANCHOR_ASLEEP, ANCHOR_ASLEEP, ANCHOR_ASLEEP, ANCHOR_ASLEEP]);
  });
  it('卯月が自艇を見つけると、駆潜艇は警報の 4 秒で気づき、体感 4 秒で動き出す（速さ 0 から加速）', () => {
    const w = anchorKit({ hard: true });
    runUntil(w, 10);
    const u = w.destroyers.ships[0]!.state;
    Object.assign(w.boat.state, { x: u.x, y: u.y - 300 }); // 卯月の真北 300 m（停止の 480 m の内）。駆潜艇から 1,320 m・716 m（外）
    runUntil(w, 30);
    const a = anchors(w);
    const t0 = a.log.noticedAtS[0]!;
    expect(a.state.reason[0]).toBe(ANCHOR_REASON_SEEN);
    for (const i of PK) {
      expect([a.state.reason[i], a.state.stage[i], w.destroyers.ships[i]!.anchored], `駆潜艇 ${i}`).toEqual([ANCHOR_REASON_ALARM, ANCHOR_UNDERWAY, false]);
      expect(near(a.log.noticedAtS[i]! - t0, 4), `駆潜艇 ${i} 警報`).toBe(true);
      expect(near(a.log.underwayAtS[i]! - a.log.noticedAtS[i]!, 4), `駆潜艇 ${i} 動き出す`).toBe(true);
      expect(w.destroyers.ships[i]!.state.speedMps).toBeGreaterThan(0);
    }
    expect(near(a.log.underwayAtS[0]! - t0, 3)).toBe(true); // 卯月は 3 秒（destroyer_underway_s。v0.8.1 S3 で 6 → 3）
  });
  it('体感の時計: 駆潜艇が気づいた後に命中スローがあれば、動き出すのは固定ステップの時計で遅れる', () => {
    const w = anchorKit({ hard: true });
    w.destroyers.ships[0]!.hitsTaken = 1; // 卯月の被雷 → 警報
    while (anchors(w).state.stage[2] !== ANCHOR_ALERT) anchorStep(w);
    const n = Math.round(w.setup.slowMoSeconds / STEP);
    for (let k = 0; k < n; k++) anchorStep(w, true);
    runUntil(w, w.stepTimeS + 8);
    const a = anchors(w);
    const lost = w.setup.slowMoSeconds * (1 - w.setup.slowMoFactor);
    for (const i of PK) expect(near(a.log.underwayAtS[i]! - a.log.noticedAtS[i]!, 4 + lost, STEP * 2), `駆潜艇 ${i}`).toBe(true);
  });
  it('夜明け: 遅れなしで動き出し、東へ退いて海域を出る（退いたにはなるが撃沈・駆逐艦の退いた数には入らない）。空知丸が残るので allOut は偽のまま', () => {
    const w = anchorKit({ hard: true, dawnS: 30 });
    runUntil(w, 30 + STEP / 2);
    const a = anchors(w);
    for (const i of PK) {
      expect([a.state.reason[i], w.destroyers.ships[i]!.anchored]).toEqual([ANCHOR_REASON_DAWN, false]);
      expect(a.log.underwayAtS[i]).toBe(a.log.noticedAtS[i]);
    }
    runUntil(w, 90);
    for (const i of PK) {
      const d = w.destroyers.ships[i]!;
      expect([d.ai.mode, Math.abs(d.state.headingDeg - 90) < 1]).toEqual(['retire', true]);
    }
    runUntil(w, 600);
    expect(PK.map((i) => w.destroyers.ships[i]!.withdrawn)).toEqual([true, true]);
    expect([w.destroyers.ships[0]!.withdrawn, w.destroyers.ships[1]!.withdrawn, w.destroyers.allOut]).toEqual([true, false, false]);
  });
});

describe('数え方と魚雷（L41・D-S8）', () => {
  it('1 本で沈む駆潜艇（本物の TorpedoPool の 1 本）: 狙った 1 本は KPI の外で止まった艦への魚雷に数え、沈んでも撃沈 n/m・達成・輸送船の撃沈に入らない', () => {
    const s = setupOf('us_06', true);
    const g = groupOf(s);
    g.setAnchors(s.anchors!);
    const k = kit('us_06', g as never);
    const w: FreeTorpedoWorld = { ...k.w, kpiMinTargetSpeedMps: MIN };
    const p = g.ships[3]!.state;
    Object.assign(w.boat.state, { x: p.x, y: p.y - 600, headingDeg: 180 }); // 駆潜艇の真北 600 m（船体は東西＝真横）
    expect(g.nearestAfloatIndex(w.boat.state.x, w.boat.state.y)).toBe(3);
    const t = fireOne(w);
    Object.assign(t, { dud: false, erratic: false }); // 発射の乱数で決まる不発・蛇行は外して当たりだけを見る
    expect([t.kpiTarget, g.anchors!.log.heldShots]).toEqual([false, 1]);
    const hw = { shots: [] as ShotRecord[], hits: 0, slowMoLeftS: 0, setup: { slowMoSeconds: 1 }, destroyers: g, launcher: k.w.launcher, dawn: { reached: false, retireHeadingDeg: NaN }, stepTimeS: 0 };
    const ev = torpedoEventsFor(hw as never, { onTorpedoHit: () => undefined, onDestroyerSunk: () => undefined } as unknown as WorldEvents);
    for (let i = 0; hw.shots.length === 0 && i < 60 * 30; i++) {
      hw.stepTimeS += DT;
      k.w.torpedoes.step(DT * s.timeScale, DT, g.ships as never, g.passRadius2, ev, hw.stepTimeS, s.mission.returnPoint.torpedoEndSettleS);
    }
    expect(hw.shots.map((r) => [r.hit, r.kpiTarget])).toEqual([[true, false]]);
    expect([hw.hits, g.ships[3]!.hitsTaken, g.ships[3]!.sinking, g.anchors!.log.heldHits]).toEqual([1, 1, true, 1]);
    expect([g.sunkCount, g.objectiveSinking, g.transportSunk, g.allOut]).toEqual([0, false, false, false]);
    // 残りの駆潜艇も沈めても同じ。卯月を 2 本で沈めれば達成（撃沈 1/1）
    for (const i of [2, 0, 0]) ev.onHit(i, 0, 0, { ...t, dud: false } as TorpedoState);
    expect([g.ships[2]!.sinking, g.sunkCount, g.objectiveSinking, g.transportSunk, g.allOut]).toEqual([true, 1, true, false, false]);
  });
  it('動き出して 5 kt 以上の駆潜艇へ狙った 1 本も KPI の外（駆逐艦でない）。同じ時の卯月（5 kt 以上）への 1 本は今の規則のまま数える', () => {
    const aw = anchorKit({ hard: true });
    const g = aw.destroyers;
    g.ships[0]!.hitsTaken = 1; // 卯月の被雷 → みな気づいて動き出す
    while (g.ships[2]!.state.speedMps < MIN || g.ships[0]!.state.speedMps < MIN) anchorStep(aw);
    const k = kit('us_06', g);
    const w: FreeTorpedoWorld = { ...k.w, kpiMinTargetSpeedMps: MIN };
    // 自艇は艦の外側 500 m（駆潜艇は西・卯月は東。v0.8.1 S3 で 2 隻目を (3200, 1500) へ移したので、北 500 m では動いた卯月より 2 隻目が近い夜がある）
    for (const [i, want, dx, h] of [[2, false, -500, 90], [0, true, 500, 270]] as const) {
      const p = g.ships[i]!.state;
      Object.assign(w.boat.state, { x: p.x + dx, y: p.y, headingDeg: h });
      expect(g.nearestAfloatIndex(w.boat.state.x, w.boat.state.y)).toBe(i);
      expect(fireOne(w).kpiTarget, `艦 ${i}`).toBe(want);
    }
    expect(g.anchors!.log.heldShots).toBe(0); // どちらも動いている＝止まった艦への魚雷ではない
  });
});

describe('砲とレーダー（L42・L44）', () => {
  it('gunneryAt: us_06 のハードの駆潜艇（2・3）は記録の 76 mm・13 mm。ほかの任務（ハードも）のどの艦も今の式（駆逐艦か輸送船）の同じ物', () => {
    const seen: string[] = [];
    for (const m of gameData.missionsSeed.missions as unknown as Record<string, unknown>[]) {
      const id = m['id'] as string;
      if (!m['v0_1_prototype']) continue;
      for (const hard of hasHardVariant(gameData, id) ? [false, true] : [false]) {
        const s = setupOf(id, hard, 3);
        if (!s.destroyer) continue;
        seen.push(`${id}${hard ? 'h' : ''}`);
        const g = groupOf(s);
        for (let i = 0; i < g.total; i++) {
          const want = s.pickets && i >= g.picketIndex ? s.pickets.gunnery : i < g.destroyerCount ? s.destroyer.gunnery : s.transport!.gunnery;
          expect(g.gunneryAt(i), `${id} ${hard} ${i}`).toBe(want);
        }
        expect(!!s.pickets, id).toBe(id === 'us_06' && hard);
      }
    }
    expect(seen).toEqual(['us_01', 'us_01h', 'us_02', 'us_02h', 'us_04', 'us_04h', 'us_06', 'us_06h', 'jp_06', 'jp_06h']);
    const g = groupOf(setupOf('us_06', true));
    expect([2, 3].map((i) => g.gunneryAt(i).guns.map((x) => [x.id, x.count]))).toEqual([[['aa_76mm', 1], ['aa_13mm', 2]], [['aa_76mm', 1], ['aa_13mm', 2]]]);
    expect(g.gunneryAt(2)).not.toBe(g.gunneryAt(1));
  });
  it('命中の手（world-enemies）は gunneryAt: 駆潜艇の砲弾は駆潜艇の 76 mm・13 mm、卯月と空知丸は今の値（ほかの任務も同じ物）', () => {
    for (const [id, hard] of [['us_06', true], ['us_06', false], ['us_02', true], ['us_04', false]] as const) {
      const s = setupOf(id, hard, 5);
      const got: HitSpec[] = [];
      const e = buildEnemies(sceneOf(), s, 5, { x: 0, y: 0, headingDeg: 0, speedMps: 0 }, {}, {}, (spec: HitSpec) => got.push(spec), () => undefined, { stepTimeS: 0 }, null);
      const g = e.destroyers!;
      for (let i = 0; i < g.total; i++) {
        const want = s.pickets && i >= g.picketIndex ? s.pickets.gunnery : i < g.destroyerCount ? s.destroyer!.gunnery : s.transport!.gunnery;
        for (let gi = 0; gi < want.guns.length; gi++) {
          g.fires[i]!.onHit(gi, 1, 2);
          expect(got.pop(), `${id} ${i} ${gi}`).toBe(want.guns[gi]);
        }
      }
    }
    expect(code('src/systems/world-enemies.ts').split('destroyers.gunneryAt(i).guns[').length - 1).toBe(2); // 自艇と僚艇の 2 つの手
  });
  it('radarKindAt: 駆潜艇だけ小さい艇（us_06 のハード）。ノーマル・us_04 はみな艦。kit（tests/anchor-world-kit）は隊と同じ式', () => {
    const kinds = (g: Group): number[] => Array.from({ length: g.total }, (_, i) => g.radarKindAt(i));
    expect(kinds(groupOf(setupOf('us_06', true)))).toEqual([RADAR_KIND_SHIP, RADAR_KIND_SHIP, RADAR_KIND_SMALL, RADAR_KIND_SMALL]);
    expect(kinds(groupOf(setupOf('us_06', false)))).toEqual([RADAR_KIND_SHIP, RADAR_KIND_SHIP]);
    expect(new Set(kinds(groupOf(setupOf('us_04', true))))).toEqual(new Set([RADAR_KIND_SHIP]));
    const line = 'radarKindAt(i: number): number { return this.picketIndex >= 0 && i >= this.picketIndex ? RADAR_KIND_SMALL : RADAR_KIND_SHIP; }';
    expect(code('src/systems/destroyer-group.ts')).toContain(line);
    expect(code('tests/anchor-world-kit.ts')).toContain(line);
    expect(code('src/systems/world-radar.ts')).toContain('tg.kind[n] = g.radarKindAt ? g.radarKindAt(i) : RADAR_KIND_SHIP;');
  });
});
