// jp_01 のハードの模擬（v0.6.6「日本ハードモード⑤：隼艇」。core/convoy-sim-gunboat・convoy-sim・systems/convoy-sim-setup・convoy-hard-calibration、spec-v066 §E.6 S3・§F.5・§F.6）: 組み立て・上書き・
// 乱数の系列（seed+22 は撃ったときだけ）・隼艇の被弾と動きは乱数を引かない・帯の表の形（速い検査だけ）。行の帯は tests/convoy-sim-hard-{a〜h}（tests/convoy-sim-hard-kit の HARD_FILES）。
// ノーマルの模擬の検査（tests/convoy-sim*.test.ts）は触らない。隼艇の無い表（ノーマル・GUNBOAT_OFF）が前と同じかは scripts の md5（ノーマル c564eabd…・HARD=1 GUNBOAT_OFF=1 は S1 の基準）で見る。
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { gameData } from '../src/config/game-data';
import { createConvoy } from '../src/core/convoy';
import { convoyNight, runConvoyTrial } from '../src/core/convoy-sim';
import { createConvoySimGunboat, fireConvoySimGunboat, gunboatContactFlash, hitConvoySimGunboat, stepConvoySimGunboat } from '../src/core/convoy-sim-gunboat';
import { createGunboat, stepGunboat, type GunboatCtx } from '../src/core/gunboat';
import { CONVOY_POLICIES } from '../src/core/convoy-sim-policy';
import { GUNBOAT_GUN_SEED_OFFSET, PT_RUN_IN, createPtSection, type PtCheck, type PtEvents, type PtHull, type PtSection } from '../src/core/pt-boats';
import { createPtTargetSet } from '../src/core/pt-target';
import { SeededRng } from '../src/core/rng';
import { enemyDetectRangeM, speedFactorForBand } from '../src/core/visibility';
import { CONVOY_HARD_CALIBRATION, CONVOY_HARD_OFFSCREEN, CONVOY_HARD_SAME_SCALE } from '../src/systems/convoy-hard-calibration';
import { convoySimSetup } from '../src/systems/convoy-sim-setup';
import { buildWorldSetup } from '../src/systems/world-setup';
import { HARD_FILES } from './convoy-sim-hard-kit';

const HARD = convoySimSetup(gameData, 'jp_01', { hard: true });
const NOOP: PtEvents = { onContact: () => {}, onCommit: () => {}, onFire: () => {}, onImpact: () => {}, onPassEnd: () => {}, onLeave: () => {}, onOut: () => {} };

describe('jp_01 のハードの模擬の組み立て（spec-v066 §F.6）', () => {
  it('ハードは米PT 3 隻・ノルマ 3・隼艇（world-setup の gunboat と同じ値）。ノーマルと GUNBOAT_OFF は gunboat の鍵ごと無い（GUNBOAT_OFF も米PT 3 隻・ノルマ 3）', () => {
    expect([HARD.pt.count, HARD.convoy.quota]).toEqual([3, 3]);
    expect(HARD.gunboat).toEqual(buildWorldSetup(gameData, 'jp_01', { hard: true }).gunboat);
    expect([HARD.gunboat!.boatId, HARD.gunboat!.targetRangeFactor, HARD.gunboat!.fireM, HARD.gunboat!.hullHp]).toEqual(['jp_h38_hayabusa', 0.5, 300, 60]);
    expect('catchupM' in HARD.gunboat! || 'slowToPlayer' in HARD.gunboat!).toBe(false); // 候補は data に無い（上書きのときだけ）
    const off = convoySimSetup(gameData, 'jp_01', { hard: true, gunboatOff: true });
    expect(['gunboat' in off, off.pt.count, off.convoy.quota]).toEqual([false, 3, 3]);
    const normal = convoySimSetup(gameData, 'jp_01');
    expect(['gunboat' in normal, normal.pt.count, normal.convoy.quota]).toEqual([false, 2, 2]);
  });

  it('上書き（PT3_OFF・GB_FACTOR・GB_CATCHUP・GB_SLOW2）は data の写しか setup の写しに当てる。data は変えない', () => {
    const pt2 = convoySimSetup(gameData, 'jp_01', { hard: true, pt3Off: true });
    expect([pt2.pt.count, pt2.convoy.quota, pt2.gunboat?.boatId]).toEqual([2, 3, 'jp_h38_hayabusa']);
    const f = convoySimSetup(gameData, 'jp_01', { hard: true, gbFactor: 0.67, gbCatchupM: 350, gbSlow2: true });
    expect([f.pt.count, f.gunboat!.targetRangeFactor, f.gunboat!.catchupM, f.gunboat!.slowToPlayer]).toEqual([3, 0.67, 350, true]);
    expect(() => convoySimSetup(gameData, 'jp_01', { hard: true, gbFactor: 0 })).toThrow(/target_range_factor/);
    expect(convoySimSetup(gameData, 'jp_01', { hard: true })).toEqual(HARD); // 上書きの後も data は同じ
  });

  it('候補の上書きの動き（core/gunboat の follow。入れていない候補で data に鍵は無い。レビュー data:D2）: GB_CATCHUP は脅威が無く定位置から catchupM より遠ければ巡航で定位置へ（脅威があれば静音のまま）、GB_SLOW2 は定位置の 60 m の内の速さを自艇の速さまで（自艇が止まれば隼艇も止まる）', () => {
    const at = (s: typeof HARD, gx: number, gy: number, playerMps: number, pts: { x: number; y: number; phase: number }[] = []): [number, number] => {
      const player = { ...s.start, speedMps: playerMps };
      const ctx: GunboatCtx = { player, convoy: createConvoy(s.convoy), convoyParams: s.convoy, pts: { boats: pts, owner: -1 } as unknown as PtSection, ring: s.ring, bounds: s.pt.bounds, visRange2: s.visRange2 };
      const g = createGunboat(s.gunboat!, s.start);
      Object.assign(g.boat, { x: gx, y: gy });
      stepGunboat(g, s.gunboat!, ctx, 0, false, 1 / 12);
      return [g.input.speed01 * s.gunboat!.boat.speedMaxMps, g.input.headingDeg];
    };
    const cand = convoySimSetup(gameData, 'jp_01', { hard: true, gbCatchupM: 350, gbSlow2: true });
    const gb = HARD.gunboat!;
    // 定位置 (1050, 2520)（自艇 (1200, 2400) 東向き）の北 400 m: 候補は巡航 20 kt で南へ、data の形と脅威のある夜は静音の上限 13 kt
    const [cruise, head] = at(cand, 1050, 2120, 0);
    expect(cruise).toBeCloseTo(gb.boat.speedCruiseMps, 9);
    expect(head).toBeCloseTo(180, 9);
    expect(at(cand, 1050, 2120, 0, [{ x: 1050, y: 1520, phase: PT_RUN_IN }])[0]).toBeCloseTo(gb.boat.silentMaxMps, 9);
    expect(at(HARD, 1050, 2120, 0)[0]).toBeCloseTo(gb.boat.silentMaxMps, 9);
    // 定位置の 30 m 東（脅威なし）: 候補は min(大発 7 kt, 自艇)、data の形は大発の 7 kt のまま（止まった自艇の脇で回る＝既知の動き）
    expect(at(cand, 1080, 2520, 2)[0]).toBeCloseTo(2, 9);
    expect(at(cand, 1080, 2520, 0)[0]).toBe(0);
    expect(at(HARD, 1080, 2520, 0)[0]).toBeCloseTo(HARD.convoy.speedMps, 9);
  });

  it('1 夜: 隼艇のある夜だけ記録に gunboat があり、同じ seed なら同じ夜。隼艇の撃退・撃沈は隊の数を超えない（最後の結末を決めた砲）', () => {
    const r = runConvoyTrial(HARD, 'shield_full', 7);
    expect(r.gunboat).toBeDefined();
    expect(runConvoyTrial(HARD, 'shield_full', 7)).toEqual(r);
    expect('gunboat' in runConvoyTrial(convoySimSetup(gameData, 'jp_01', { hard: true, gunboatOff: true }), 'shield_full', 7)).toBe(false);
    expect('gunboat' in runConvoyTrial(convoySimSetup(gameData, 'jp_01'), 'shield_full', 7)).toBe(false);
    let shots = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const t = runConvoyTrial(HARD, 'shield_full', seed);
      const g = t.gunboat!;
      shots += g.shots;
      expect(g.ptSunk, `seed ${seed}`).toBeLessThanOrEqual(t.ptSunk);
      expect(g.retired + g.ptSunk, `seed ${seed}`).toBeLessThanOrEqual(t.ptRetired + t.ptSunk);
      expect(g.hits, `seed ${seed}`).toBeLessThanOrEqual(t.gunHits);
      expect(g.watchS, `seed ${seed}`).toBeGreaterThan(0);
    }
    expect(shots).toBeGreaterThan(0);
  });
});

describe('乱数（spec-v066 §E.5・H12）', () => {
  it('seed+22 の系列は隼艇が撃ったときだけ引く: 引いた回数 = 2 × 発射 + 生きた PT への命中（1 発 2 回・命中 1 回）。隼艇なしの夜は引かない', () => {
    for (const [pol, seed] of [['shield_full', 3], ['follow_dodge', 5], ['none', 2]] as const) {
      const first = new SeededRng((seed + GUNBOAT_GUN_SEED_OFFSET) >>> 0).next();
      const spy = vi.spyOn(SeededRng.prototype, 'next');
      const r = runConvoyTrial(HARD, pol, seed);
      const counts = new Map<SeededRng, { n: number; first: number }>();
      spy.mock.contexts.forEach((ctx, i) => {
        const e = counts.get(ctx as SeededRng) ?? { n: 0, first: spy.mock.results[i]!.value as number };
        e.n++;
        counts.set(ctx as SeededRng, e);
      });
      spy.mockRestore();
      const gb = [...counts.values()].filter((e) => e.first === first);
      const g = r.gunboat!;
      expect(gb.length, pol).toBe(g.shots > 0 ? 1 : 0);
      expect(gb[0]?.n ?? 0, pol).toBe(2 * g.shots + g.hits);
    }
  });

  it('隼艇の動き・被弾・見つかる距離・閃光は乱数を引かない（HP だけ。沈んだら船体の valid と標的の targetValid を落とす）', () => {
    const { pt, convoy: cp } = convoyNight(HARD, 1);
    const q = createPtSection(pt, HARD.shellPoolSize);
    const f = createConvoy(cp);
    const player = { x: HARD.start.x, y: HARD.start.y, headingDeg: HARD.start.headingDeg, speedMps: 0 };
    const hulls: PtHull[] = [{ boat: player, halfLengthM: HARD.halfLengthM, halfBeamM: HARD.halfBeamM, valid: true }];
    for (const b of f.barges) hulls.push({ boat: b, halfLengthM: cp.halfLengthM, halfBeamM: cp.halfBeamM, valid: true });
    const spy = vi.spyOn(SeededRng.prototype, 'next');
    const sg = createConvoySimGunboat(HARD.gunboat!, { pt, q, f, cp, player, start: HARD.start, ring: HARD.ring, visRange2: HARD.visRange2, gunShellPoolSize: HARD.gunShellPoolSize }, hulls, 1, NOOP);
    expect([hulls.length, sg.hull, sg.g.boat.x, sg.g.boat.y]).toEqual([5, 4, 1050, 2520]); // 末尾の船体・自艇の出発点からの定位置
    const ts = createPtTargetSet(hulls);
    const c: PtCheck = { boat: player, boatHalfLengthM: 1, boatHalfBeamM: 1, detectOpenM: 0, smokeFactor: 1, smoke: null, smokeParams: null, targetValid: true, visRange2: HARD.visRange2, dawn: false, timeS: 0, targets: hulls };
    const dt = HARD.stepS * HARD.timeScale;
    for (let i = 0; i < 120; i++) {
      player.x += 3 * dt;
      stepConvoySimGunboat(sg, ts, c, false, HARD.stepS, dt);
      fireConvoySimGunboat(sg, q, pt, ts, HARD.rule, HARD.vis, HARD.visRange2, i * HARD.stepS, HARD.stepS, dt); // PT は遠い＝撃たない
    }
    expect(sg.g.held).toBe(false);
    expect(ts.detectM[4]).toBeCloseTo(0.5 * enemyDetectRangeM(pt.baseDetectM, speedFactorForBand(sg.g.band, HARD.vis.speedFactor), HARD.vis, false), 9);
    ts.current = 4;
    gunboatContactFlash(sg, ts, c);
    expect([c.flashM, c.flashX, c.flashY]).toEqual([0, sg.g.boat.x, sg.g.boat.y]); // 標的が隼艇: 閃光は隼艇から（撃っていないので 0）
    for (let k = 0; k < 14; k++) hitConvoySimGunboat(sg, ts, c, pt.hit.damage, 2);
    expect([sg.g.hp, sg.g.sunk, sg.hullRef.valid, c.targetValid]).toEqual([4, false, true, true]);
    hitConvoySimGunboat(sg, ts, c, pt.hit.damage, 2);
    expect([sg.g.hp, sg.g.sunk, sg.g.sunkS, sg.hullRef.valid, c.targetValid]).toEqual([0, true, 2, false, false]);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('ハードの帯の表（spec-v066 §F.5）', () => {
  it('9 行（§F.5 の表の順）・★ は shield_full・follow_full・none・どの行も隼艇の沈没 ≤ 1%・対の相手は隼艇なしかノーマル。HARD_FILES は 9 行を 1 回ずつ（1 ファイル 1 行。短い夜の dash_home だけ d に 2 行目＝1 ファイル 15 秒以内）', () => {
    expect(CONVOY_HARD_CALIBRATION.map((r) => r.policy)).toEqual(['shield_full', 'follow_full', 'shield_shoot', 'follow_shoot', 'far_full', 'shield_dodge', 'follow_dodge', 'none', 'dash_home']);
    expect(CONVOY_HARD_CALIBRATION.filter((r) => r.star).map((r) => r.policy)).toEqual(['shield_full', 'follow_full', 'none']);
    for (const r of CONVOY_HARD_CALIBRATION) {
      expect(r.design.gbSunkPct, r.policy).toEqual([0, 1]);
      expect(Object.keys(r.bands).sort(), r.policy).toEqual(['achievedPct', 'arrivedMean', 'gbHpLost', 'sunkPct']);
      for (const v of r.vs) expect(['off', 'normal'], r.policy).toContain(v[1]);
    }
    const files = Object.values(HARD_FILES) as readonly (readonly string[])[];
    expect(files.flat().sort()).toEqual(CONVOY_HARD_CALIBRATION.map((r) => r.policy).sort());
    for (const fl of files) expect(fl.length).toBe(fl.includes('dash_home') ? 2 : 1);
    for (const p of [...CONVOY_HARD_SAME_SCALE, ...CONVOY_HARD_OFFSCREEN]) expect(CONVOY_POLICIES).toContain(p);
  });
  it('設計の帯（design）と対の帯（vs）は spec-v066 §F.5 の値のまま（N 200 の回帰の帯では「易しすぎ」の向きを捉えられないので、閾値を黙って緩めない。対の帯の判定は scripts の HARD=1 TABLE=2。レビュー data:D1）', () => {
    const I = Infinity;
    const GB = { gbSunkPct: [0, 1] };
    const pin = Object.fromEntries(CONVOY_HARD_CALIBRATION.map((r) => [r.policy, { design: r.design, vs: r.vs }]));
    expect(pin).toEqual({
      shield_full: { design: { achievedPct: [50, 70], sunkPct: [4, 15], ...GB }, vs: [['achievedPct', 'off', 6, I], ['sunkPct', 'off', -I, -4], ['achievedPct', 'normal', -I, -8], ['sunkPct', 'normal', -3, I]] },
      follow_full: { design: { achievedPct: [25, 45], sunkPct: [0, 12], ...GB }, vs: [['sunkPct', 'off', -I, -4], ['sunkPct', 'normal', -3, I]] },
      shield_shoot: { design: { achievedPct: [45, 65], sunkPct: [32, 50], ...GB }, vs: [['sunkPct', 'off', -I, -8], ['achievedPct', 'normal', -I, -3], ['sunkPct', 'normal', 0, I]] },
      follow_shoot: { design: GB, vs: [['sunkPct', 'normal', -9, I]] },
      far_full: { design: GB, vs: [['sunkPct', 'normal', -3, I]] },
      shield_dodge: { design: GB, vs: [['sunkPct', 'normal', -9, I]] },
      follow_dodge: { design: GB, vs: [['sunkPct', 'normal', -9, I]] },
      none: { design: { achievedPct: [0, 18], sunkPct: [8, 18], ...GB }, vs: [['achievedPct', 'off', -1, 1], ['sunkPct', 'off', -1, 1]] },
      dash_home: { design: { achievedPct: [0, 0], sunkPct: [6, 15], ...GB }, vs: [['achievedPct', 'off', -1, 1], ['sunkPct', 'off', -1, 1]] },
    });
  });
  it('scripts/convoy-sim の TABLE=2 は ✗ が 1 つでもあれば終了コード 1（行の帯と不変・対の帯。関門で見落とさない。レビュー data:D1）', () => {
    const src = readFileSync('scripts/convoy-sim.ts', 'utf8');
    expect(src).toContain('if (rowMiss + pairMiss > 0) process.exitCode = 1;');
  });
});
