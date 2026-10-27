// 兵装の新しい道の Result（v0.6.8 S5。spec-v068 §4.7）: systems/arms-telemetry の armsResultPart（使わなかった夜は鍵ごと無い）、ui/result-body が
// どの枝の後ろにも 1 行（20 px・KPI の色）を足す・魚雷の枝の「未発射」から狙う艦の無い魚雷を除く、ui/hud-lines の水上機の行の「撃墜」、mission-telemetry の配線（ソース）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HUD_FONT_STATUS_PX } from '../src/config/hud-text-config';
import { HUD_COLOR_KPI } from '../src/config/result-text-config';
import { AA_SRC_DAWN, AA_SRC_SEAPLANE, AA_SRC_SORTIE } from '../src/core/aa-fire';
import type { BandSummary } from '../src/core/hit-rate';
import { SP_OUT_BOMBED, SP_OUT_CANCELLED } from '../src/core/seaplane';
import { ArmsStep } from '../src/systems/arms-step';
import { armsResultPart } from '../src/systems/arms-telemetry';
import { armsResultLineJa } from '../src/ui/arms-lines';
import { seaplaneResultLine } from '../src/ui/hud-lines';
import { resultBodyLines, type ResultBodySource } from '../src/ui/result-body';
import type { ArmsResult, BargeResult, PatrolResult, PtResult } from '../src/ui/result-types';

const bands = (shots: readonly number[]): BandSummary[] => ['<=400yd', '400-800yd', '800-1200yd', '1200-2000yd', '>=2000yd'].map((band, i) => ({ band, shots: shots[i]!, hits: 0, duds: 0 }));
const base = (o: Partial<ResultBodySource>): ResultBodySource => ({
  hunt: null, pt: null, convoy: null, engine: null, gunboat: null, detections: 0, returned: true, objectiveDone: false,
  shots: [], capacity: 4, hits: 0, duds: 0, misses: 0, bands: bands([0, 0, 0, 0, 0]), kpi: null, sortie: { historical: false },
  ...o,
});
const HUNT: BargeResult = {
  enemyId: 'ijn_daihatsu', total: 4, sunk: 3, beached: 0, quota: 3, shots: 80, hits: 20, firstShotM: 300, firstShotBand: 'silent', firstDetectM: NaN, flashFirst: false,
  killMinM: 150, killMaxM: 290, mgHits: 0, mgDamage: 0, batteryEnabled: false, batteryInArcS: 0, batteryShots: 0, batteryHits: 0, batteryDamage: 0,
};
const PT: PtResult = {
  enemyId: 'us_pt_enemy', total: 2, out: 0, alive: 2, leftAtDawn: false, passes: 1, maxPasses: 4, firedPasses: 1, cleanPasses: 1, shots: 6, hits: 0, damagePerHit: 6, hpMax: 50,
  firstDetectM: NaN, firstDetectBand: '', lostContacts: 0, closestM: 300, minWarnS: Infinity, gunEnabled: true, gunShots: 0, gunHits: 0, retired: 0, sunk: 0, flashFirst: false,
  bursts: 0, suppressions: 0, passesOnBarges: 0, firstDetectKind: 0, gunLabel: '13mm',
};
const PATROL: PatrolResult = { passes: 2, passesWake: 1, hides: 1, finds: 1, findsVisual: 0, bombs: 3, hits: 0, damage: 0, dodgeS: [1.2, NaN, 0.8], restartDelayed: 0 };
const NONE: ArmsResult = { shipRounds: 0, shipHits: 0, aaRounds: 0, downs: 0, downsSeaplane: 0, downsSortie: 0, blindTorpedoes: 0, blindKind: 'noship' };

describe('armsResultPart（systems/arms-telemetry。buildMissionResult が終わりに 1 回だけ広げる）', () => {
  it('兵装の無い世界・何も使わなかった夜は {}（arms の鍵ごと無い＝v0.6.7 の Result のまま）', () => {
    expect(armsResultPart({ arms: null })).toEqual({});
    const a = new ArmsStep('barge');
    const part = armsResultPart({ arms: a });
    expect(part).toEqual({});
    expect('arms' in part).toBe(false);
  });
  it('狙う艦の無い魚雷・撃墜（出どころごと）を写す', () => {
    const a = new ArmsStep('pt');
    a.noteBlindTorpedo();
    a.noteBlindTorpedo();
    expect(armsResultPart({ arms: a })).toEqual({ arms: { ...NONE, blindTorpedoes: 2, blindKind: 'pt' } });
    const b = new ArmsStep('noship');
    b.aaRounds = 260;
    b.downs = 3;
    b.downsBy[AA_SRC_DAWN] = 2;
    b.downsBy[AA_SRC_SORTIE] = 1;
    expect(armsResultPart({ arms: b }).arms).toEqual({ ...NONE, aaRounds: 260, downs: 3, downsSortie: 1 });
    const c = new ArmsStep('noship');
    c.aaRounds = 40;
    c.downs = 1;
    c.downsBy[AA_SRC_SEAPLANE] = 1;
    expect(armsResultPart({ arms: c }).arms).toEqual({ ...NONE, aaRounds: 40, downs: 1, downsSeaplane: 1 });
  });
});

describe('Result の本文の兵装の行（ui/result-body）', () => {
  const ARMS: ArmsResult = { ...NONE, shipRounds: 30, shipHits: 4, aaRounds: 45, downs: 1 }; // 狙う艦の無い魚雷は下の「未発射」の it で
  const want = { text: armsResultLineJa(ARMS), px: HUD_FONT_STATUS_PX, color: HUD_COLOR_KPI, sectionAfter: false };
  it('どの枝（大発・米PT・夜の哨戒機・魚雷）でも最後に 1 行足すだけ。前の行は arms の無い材料と同じ', () => {
    for (const o of [{ hunt: HUNT }, { pt: PT }, { patrol: PATROL }, { shots: [{}], misses: 1, bands: bands([0, 1, 0, 0, 0]) }] as Partial<ResultBodySource>[]) {
      const before = resultBodyLines(base(o), false);
      const after = resultBodyLines(base({ ...o, arms: ARMS }), false);
      expect(after.slice(0, -1)).toEqual(before);
      expect(after[after.length - 1]).toEqual(want);
    }
  });
  it('魚雷の枝の「未発射」は狙う艦の無い魚雷を除く（駆逐艦がみな出た後の魚雷。レビューの「未発射 N」の矛盾）', () => {
    const first = (r: ResultBodySource): string => resultBodyLines(r, false)[0]!.text;
    expect(first(base({ capacity: 4 }))).toBe('命中 0 / 発射 0（不発 0、外れ 0、未発射 4）');
    expect(first(base({ capacity: 4, arms: { ...NONE, blindTorpedoes: 4 } }))).toBe('命中 0 / 発射 0（不発 0、外れ 0）');
    expect(first(base({ capacity: 4, shots: [{}], misses: 1, bands: bands([0, 1, 0, 0, 0]), arms: { ...NONE, blindTorpedoes: 2 } }))).toBe('命中 0 / 発射 1（不発 0、外れ 1、未発射 1）');
  });
});

describe('水上機の Result の行（ui/hud-lines の seaplaneResultLine）', () => {
  const r = { seaplaneOutcome: SP_OUT_CANCELLED, seaplaneAttacked: true, seaplaneSorties: 1, seaplaneLost: 0, seaplaneSlowReactS: NaN, seaplaneFlareLitS: 3.2, seaplaneShellsUnderFlare: 4, seaplaneBombs: 1, seaplaneBombHits: 0, seaplaneDodgeS: [1.4] };
  it('撃墜した夜は「敵機: … 撃墜（爆弾 N 発 命中 N）」（結果の鍵は打ち切りのまま。爆撃の枝より先）。撃墜の鍵が無ければ v0.6.7 の文', () => {
    expect(seaplaneResultLine({ ...r, seaplaneDowned: true })).toBe('敵機: 撃墜（爆弾 1 発 命中 0）');
    expect(seaplaneResultLine({ ...r, seaplaneOutcome: SP_OUT_BOMBED, seaplaneDowned: true })).toBe('敵機: 撃墜（爆弾 1 発 命中 0）');
    expect(seaplaneResultLine({ ...r, seaplaneLost: 1, seaplaneSlowReactS: 2.25, seaplaneDowned: true })).toBe('敵機: 見失わせた 1 回（減速まで 2.3 秒） → 撃墜（爆弾 1 発 命中 0）');
    expect(seaplaneResultLine(r)).toBe('敵機: 攻撃の途中で終了（爆弾 1 発 命中 0）');
    expect(seaplaneResultLine({ ...r, seaplaneSorties: 0, seaplaneDowned: true })).toBe('敵機: 来ず');
  });
});

describe('配線（ソース）', () => {
  it('buildMissionResult は兵装の記録と水上機の撃墜を使った夜だけ鍵で足す。達成の行（objectiveDone）はそのまま', () => {
    const src = readFileSync(new URL('../src/systems/mission-telemetry.ts', import.meta.url), 'utf8');
    expect(src).toContain('...armsResultPart(w),');
    expect(src).toContain('...(w.arms?.seaplaneDowned ? { seaplaneDowned: true } : {}),');
    expect(src).toContain('objectiveDone: objectiveDoneOf(reason, w),');
    const body = readFileSync(new URL('../src/ui/result-body.ts', import.meta.url), 'utf8');
    expect(body).toContain('if (r.arms) line(armsResultLineJa(r.arms), HUD_FONT_STATUS_PX, HUD_COLOR_KPI);');
    expect(body).toContain('const unfired = r.capacity - fired - (r.arms?.blindTorpedoes ?? 0);');
    const scene = readFileSync(new URL('../src/scenes/result-scene.ts', import.meta.url), 'utf8');
    expect(scene).toContain('if (r.seaplaneEnabled) line(seaplaneResultLine(r), HUD_FONT_HEADING_PX);');
  });
});
