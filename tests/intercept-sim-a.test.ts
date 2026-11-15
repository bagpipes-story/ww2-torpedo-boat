// 迎撃の模擬（v0.8.0 S3。us_04「ブラケット海峡の夜」。spec-v0800 §4.11、lead の L17〜L19・L23）: 決定性（同じ seed で同じ 1 夜・同じ表）、漏らさない（L17: 台本の 2 本のファイルの
// import と名前の走査・台本が読む物の鍵・目は世界と同じ規則）、乱数（模擬だけの系列はゲームの seed〜seed+43 に触らない）、世界の写しの突き合わせ（艦・列の通過・レーダーは
// tests/transit-world-kit の本物の DestroyerTransit・WorldRadar と、魚雷のプールと発射管制は本物の TorpedoPool・TorpedoLauncher とステップごとに同じ）、見た目の定数、ファイルの大きさ。
// 帯は tests/intercept-sim-b（軽い組）と scripts/headless/g2.sh の US04=1（N 400 × 2 組）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { fillInterceptEye, runInterceptTrial, type InterceptSimSetup } from '../src/core/intercept-sim';
import { interceptCellOf, type InterceptCell } from '../src/core/intercept-sim-cell';
import { interceptBandChecks } from '../src/systems/intercept-calibration';
import { INTERCEPT_HUMAN_SEED_ADD, INTERCEPT_HUMAN_SEED_MUL, INTERCEPT_POLICIES, type InterceptView } from '../src/core/intercept-sim-policy';
import { SimLauncher, SimTorpedoPool } from '../src/core/intercept-sim-torpedoes';
import { SeededRng } from '../src/core/rng';
import { TorpedoLauncher } from '../src/systems/torpedo-launcher';
import { INTERCEPT_SIM_ADRIFT_DELAY_S, INTERCEPT_SIM_SHELL_POOL, INTERCEPT_SIM_SINK_S, interceptNightSetup } from '../src/systems/intercept-sim-setup';
import { buildWorldSetup } from '../src/systems/world-setup';
import { directSortie } from '../src/core/sortie';
import type { TorpedoEvents } from '../src/core/torpedo-targets';
import { kitStep, kitWorld } from './transit-world-kit';
import { TorpedoPool, fakeShip, scene, type FakeShip } from './torpedo-free-kit';

const code = (p: string): string => readFileSync(`src/${p}`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const importsOf = (p: string): string[] => [...readFileSync(`src/${p}`, 'utf8').matchAll(/^import[^;]*from '([^']+)';/gm)].map((m) => m[1]!);

describe('決定性（L19）', () => {
  it('同じ seed・同じ遊び方なら同じ 1 夜（ノーマル・ハード・どの遊び方も）', () => {
    for (const hard of [false, true]) {
      for (const p of [...INTERCEPT_POLICIES, 'radar_ambush_full', 'stay'] as const) {
        for (const seed of [3, 1007]) expect(runInterceptTrial(interceptNightSetup(gameData, seed, hard), p, seed)).toEqual(runInterceptTrial(interceptNightSetup(gameData, seed, hard), p, seed));
      }
    }
  });

  it('同じ seed の組なら同じ表（radar_ambush の軽い組 N 50 × 2＝seed 151〜200・1151〜1200。tests/intercept-sim-b と同じ組）、seed が違えば夜が変わる', () => {
    const seeds = [...Array.from({ length: 50 }, (_, i) => 151 + i), ...Array.from({ length: 50 }, (_, i) => 1151 + i)];
    const cell = (): ReturnType<typeof interceptCellOf> => interceptCellOf(seeds.map((seed) => runInterceptTrial(interceptNightSetup(gameData, seed, false), 'radar_ambush', seed)), 1);
    const a = cell();
    expect(a.n).toBe(100);
    expect(cell()).toEqual(a);
    expect(runInterceptTrial(interceptNightSetup(gameData, 1, false), 'charge', 1)).not.toEqual(runInterceptTrial(interceptNightSetup(gameData, 2, false), 'charge', 2));
  });

  it('人の揺らぎの系列（seed × MUL ＋ ADD）は、同じ夜のゲームの系列（seed〜seed+43）のどれとも違う値（seed 1〜1400・ハードの組も）', () => {
    for (let seed = 1; seed <= 1400; seed++) {
      const h = (seed * INTERCEPT_HUMAN_SEED_MUL + INTERCEPT_HUMAN_SEED_ADD) >>> 0;
      expect(h - seed > 43 || h < seed).toBe(true);
    }
  });
});

describe('漏らさない（L17）', () => {
  it('台本の 2 本は、隠れた状態を持つ物を import しない（レーダーの状態・自艇・乱数・解き方・単位・航跡だけ）', () => {
    expect(importsOf('core/intercept-sim-policy.ts')).toEqual(['./boat-motion', './intercept-sim-tracks', './radar', './rng', './torpedo-solver', './units']);
    expect(importsOf('core/intercept-sim-tracks.ts')).toEqual(['./boat-motion', './radar', './units']);
    for (const p of ['core/intercept-sim-policy.ts', 'core/intercept-sim-tracks.ts']) {
      const c = code(p);
      for (const bad of ['playerDetected', 'detectRange', 'visRange2', 'ShipAi', 'phase', 'transit', 'ships', 'withdrawn', 'offMap', 'sinking', 'hitsTaken', 'gunnery', 'illuminat', 'lookout', 'SimShip', 'TorpedoState', 'Math.random']) expect(c, `${p}: ${bad}`).not.toContain(bad);
      expect(c, `${p}: .ai`).not.toMatch(/\.ai\b/);
    }
  });

  it('台本が読む物の鍵はちょうど 時計・自艇・残りの魚雷・輪の中・レーダーの状態・目の位置・マーカーの方位（艦の添字・速さ・AI は無い）', () => {
    const v: InterceptView = { t: 0, boat: { x: 0, y: 0, headingDeg: 0, speedMps: 0 }, torpedoes: 4, atHome: false, radar: null, eyeX: NaN, eyeY: NaN, markerDeg: NaN };
    expect(Object.keys(v).sort()).toEqual(['atHome', 'boat', 'eyeX', 'eyeY', 'markerDeg', 'radar', 't', 'torpedoes']);
    expect(code('core/intercept-sim-policy.ts')).toMatch(/export interface InterceptView \{\s*t: number;\s*readonly boat: BoatState;\s*torpedoes: number;\s*atHome: boolean;\s*radar: RadarState \| null;\s*eyeX: number; eyeY: number; markerDeg: number;\s*\}/);
  });

  it('目は世界の規則（一番近い浮いている艦が setup.visRange2＝buildWorldSetup の視程の 2 乗の内）。外なら位置もマーカーも NaN', () => {
    const s = interceptNightSetup(gameData, 5, false);
    expect(s.visRange2).toBe(buildWorldSetup(gameData, 'us_04', { sortie: directSortie('us_04', 5, 'none', false, false), hard: false }).visRange2);
    const v: InterceptView = { t: 0, boat: { x: 0, y: 0, headingDeg: 0, speedMps: 0 }, torpedoes: 4, atHome: false, radar: null, eyeX: 0, eyeY: 0, markerDeg: 0 };
    const vel = { x: 0, y: 0 };
    const r = Math.sqrt(s.visRange2);
    const ship = (x: number, out = false): { state: { x: number; y: number; headingDeg: number; speedMps: number }; out: boolean } => ({ state: { x, y: 0, headingDeg: 270, speedMps: 15 }, out });
    fillInterceptEye(v, v.boat, [ship(r + 1)], s.visRange2, s.torpedo.speedMps, vel);
    expect([v.eyeX, v.markerDeg]).toEqual([NaN, NaN]);
    fillInterceptEye(v, v.boat, [ship(r - 1)], s.visRange2, s.torpedo.speedMps, vel);
    expect(v.eyeX).toBe(r - 1);
    expect(Number.isFinite(v.markerDeg)).toBe(true);
    // 沈み始めた・海域の外（out）の艦は見えない（近くても）。見えるのは一番近い浮いている艦だけ
    fillInterceptEye(v, v.boat, [ship(100, true), ship(r + 5)], s.visRange2, s.torpedo.speedMps, vel);
    expect(v.eyeX).toBeNaN();
  });
});

describe('世界の写しの突き合わせ（L18）', () => {
  /** 模擬（止まったままの stay）と小さな世界（本物の DestroyerTransit・WorldRadar。艦は自艇を同じ停止の距離で見つける）を同じステップで回し、艦・段階・輝点が同じ */
  function compare(seed: number, hard: boolean, start: { x: number; y: number } | null): number {
    const s0 = interceptNightSetup(gameData, seed, hard);
    const s: InterceptSimSetup = start ? { ...s0, start: { ...start, headingDeg: 270 } } : s0;
    const k = kitWorld({ hard, seed, detect: true });
    if (start) Object.assign(k.boat.state, start);
    let steps = 0;
    let diff = '';
    runInterceptTrial(s, 'stay', seed, (w) => {
      if (diff || w.sinking) return;
      kitStep(k);
      steps++;
      for (let i = 0; i < w.ships.length; i++) {
        const a = w.ships[i]!;
        const b = k.ships[i]!;
        if (a.state.x !== b.state.x || a.state.y !== b.state.y || a.state.headingDeg !== b.state.headingDeg || a.state.speedMps !== b.state.speedMps || a.out !== b.out || a.ai.mode !== b.ai.mode) diff = `ステップ ${steps} 艦 ${i}`;
      }
      const ra = w.radar!;
      const rb = k.radar!.state;
      if (ra.sweeps !== rb.sweeps || ra.n !== rb.n || !Object.is(ra.firstS, rb.firstS)) diff = `ステップ ${steps} 掃引`;
      for (let j = 0; j < ra.n; j++) if (ra.blips[j]!.x !== rb.blips[j]!.x || ra.blips[j]!.y !== rb.blips[j]!.y || ra.blips[j]!.atS !== rb.blips[j]!.atS) diff = `ステップ ${steps} 輝点 ${j}`;
      if (w.transit.state.phase.join() !== k.transit.state.phase.join() || w.transit.pending !== k.transit.pending || w.transit.allOut !== k.transit.allOut) diff = `ステップ ${steps} 段階`;
    });
    expect(diff).toBe('');
    return steps;
  }

  it.each([[1, false], [2, false], [4, true], [9, true]] as const)('海域の南東の隅で止まった艇（見つからない）の一晩: seed %i ハード %s の全ステップ（夜明けの退きを含む）', (seed, hard) => {
    expect(compare(seed, hard, { x: 5900, y: 3900 })).toBeGreaterThanOrEqual((interceptNightSetup(gameData, seed, hard).durationS + 60) * 60 - 1);
  });

  it.each([[2, false], [3, true]] as const)('出発点で止まった艇（護衛が見つけて体当たり・砲）: seed %i ハード %s は沈み始めるまで同じ', (seed, hard) => {
    expect(compare(seed, hard, null)).toBeGreaterThan(600);
  });

  it('魚雷のプールと発射管制は本物（TorpedoPool・TorpedoLauncher）と同じ発射・同じ知らせの順・同じ状態（扇 4 本 × 2 回・動く船体 2 隻・1 隻は途中で沈む）', () => {
    const s = interceptNightSetup(gameData, 1, false);
    const bounds = s.bounds;
    const run = (sim: boolean): string[] => {
      const log: string[] = [];
      const ships: FakeShip[] = [fakeShip(3000, 1500), fakeShip(3400, 1900)];
      const rng = new SeededRng(77);
      const pool = sim ? new SimTorpedoPool(s.torpedo, 8, bounds) : new TorpedoPool(scene, s.torpedo, 8, bounds);
      const launcher = sim ? new SimLauncher(pool as SimTorpedoPool, rng, s.reliability, s.jitterDeg, s.launchOffsetM, s.salvoIntervalS, s.torpedo.speedMps) : new TorpedoLauncher(pool as never, rng, s.reliability, s.jitterDeg, s.launchOffsetM, s.salvoIntervalS, s.torpedo.speedMps);
      const at = (st: { x: number; y: number }): string => `${st.x.toFixed(9)},${st.y.toFixed(9)}`;
      const ev: TorpedoEvents = {
        onHit: (i, x, y, t) => { log.push(`hit ${i} ${x} ${y} ${t.leadErrDeg}`); ships[i]!.out = ships[i]!.sinking = true; ships[i]!.sinkStartS = 1; },
        onLateHit: (i, x, y) => log.push(`late ${i} ${x} ${y}`),
        onMiss: (t) => log.push(`miss ${at(t)} ${t.rangeAtLaunchM}`),
      };
      const boat = { x: 3200, y: 2800, headingDeg: 350, speedMps: 0 };
      for (let k = 0; k < 2400; k++) {
        if (k === 0 || k === 900) launcher.queueFan(boat, 4, 12);
        const tgt = ships.find((x) => !x.out) ?? null;
        const ts = launcher.update(s.stepS, boat, tgt ? tgt.state : null, tgt !== null);
        if (ts) log.push(`fire ${at(ts)} ${ts.headingDeg} ${ts.dud} ${ts.erratic} ${ts.leadErrDeg} ${ts.kpiTarget}`);
        for (const x of ships) if (!x.out) x.state.x += 1.5;
        pool.step(s.stepS * s.timeScale, s.stepS, ships, s.passRadius2, ev, k * s.stepS, 5);
        boat.headingDeg = (boat.headingDeg + 0.05) % 360;
      }
      for (const t of pool.states) log.push(`state ${at(t)} ${t.active} ${t.resolved} ${t.runM}`);
      return log;
    };
    const a = run(false);
    expect(a.filter((l) => l.startsWith('fire')).length).toBe(8);
    expect(run(true)).toEqual(a);
  });

  it('見た目の定数は config/ui-config と同じ（砲弾の枠・沈没の演出・漂流で終えるまで）', () => {
    const ui = readFileSync('src/config/ui-config.ts', 'utf8');
    const n = (k: string): number => Number(new RegExp(`export const ${k} = (\\d+);`).exec(ui)![1]);
    expect([INTERCEPT_SIM_SHELL_POOL, INTERCEPT_SIM_SINK_S * 1000, INTERCEPT_SIM_ADRIFT_DELAY_S * 1000]).toEqual([n('SHELL_POOL_SIZE'), n('SINK_DURATION_MS'), n('MISSION_END_DELAY_MS')]);
  });
});

describe('帯の読み（lead の S3 の門の前の直し）', () => {
  it('漂流 D は自艇が沈まない夜が 20% 以上の行を見る（燃料が尽きて帰れない行は外れない・ほぼ毎夜沈む行は外れる）', () => {
    const base = interceptCellOf([runInterceptTrial(interceptNightSetup(gameData, 1, true), 'radar_dodge', 1)], 1);
    const at = (o: Partial<InterceptCell>): InterceptCell => ({ ...base, ...o });
    const cells = new Map([['radar_ambush', at({ homePct: 97, ownSunkPct: 2, adriftPct: 0 })], ['radar_twice', at({ homePct: 15, ownSunkPct: 5, adriftPct: 80 })], ['idle_lane', at({ homePct: 0, ownSunkPct: 99, adriftPct: 1 })]] as const);
    const d = interceptBandChecks(cells, true, null).find((x) => x.id === 'D')!;
    expect(d.ok).toBe(false);
    expect(d.text).toContain('2 行');
    expect(d.text).toContain('radar_twice 80.0%');
  });
});

describe('ファイル', () => {
  it('新しい模擬のファイルはどれも 300 行の内（道具は 150 行の内）・模型の識別子（claude-<名>-<版>）を書かない', () => {
    const files = ['core/intercept-sim.ts', 'core/intercept-sim-world.ts', 'core/intercept-sim-torpedoes.ts', 'core/intercept-sim-tracks.ts', 'core/intercept-sim-policy.ts', 'core/intercept-sim-cell.ts', 'systems/intercept-sim-setup.ts', 'systems/intercept-calibration.ts'].map((f) => `src/${f}`);
    const tools = ['scripts/intercept-sim.ts', 'scripts/headless/strait-probe.mjs'];
    for (const f of [...files, ...tools, 'tests/intercept-sim-a.test.ts', 'tests/intercept-sim-b.test.ts', 'tests/intercept-sim-c.test.ts', 'tests/intercept-sim-d.test.ts', 'tests/intercept-sim-kit.ts', 'scripts/headless/g2.sh']) {
      const src = readFileSync(f, 'utf8');
      expect(src.split('\n').length - 1, f).toBeLessThanOrEqual(tools.includes(f) ? 150 : 300);
      expect(src, f).not.toMatch(/claude-[a-z]+-\d/i);
    }
  });
});
