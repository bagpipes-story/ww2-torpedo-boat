// v0.6.7 S5（spec-v067 §C.3・§G.1）: 固定ステップの順のソースの pin。世界（systems/mission-world の stepFn）は 水上機 → 夜の哨戒 → 敵の側 → 火災 → 味方機 → 夜明けの空襲、
// 夜の哨戒の中（systems/patrol-air-step）は 門番 → 発見なら再出撃 → 夜の出撃。模擬（core/patrol-air-sim）も同じ順。+23 の系列は哨戒のある任務だけで作る（N5。systems/world-hazards）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = (p: string): string => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
/** 文字列の並びが src の中でこの順に（それぞれ 1 回目の位置で）出る */
function expectOrder(text: string, parts: readonly string[]): void {
  let at = -1;
  for (const p of parts) {
    const i = text.indexOf(p, at + 1);
    expect(i, `「${p}」が「${parts[parts.indexOf(p) - 1] ?? '先頭'}」の後に無い`).toBeGreaterThan(at);
    at = i;
  }
}

describe('固定ステップの順（ソースの pin）', () => {
  it('mission-world の stepFn: 速力帯 → 水上機 → 夜の哨戒 → 発見距離 → 敵の側 → 火災 → 味方機 → 夜明けの空襲', () => {
    const s = src('systems/mission-world.ts');
    const fn = s.slice(s.indexOf('private readonly stepFn'), s.indexOf('constructor('));
    expectOrder(fn, ['this.dawn.latch(this)', 'stepPlayerBoat(this, dt)', 'this.band = nextSpeedBand', 'this.seaplane?.step(feelDt, this)', 'this.patrol?.step(feelDt, this)', 'this.detectRangeM = enemyDetectRangeM', 'stepEnemySide(', 'stepDamage(', 'this.friendly?.step(feelDt, this)', 'this.dawn.step(feelDt, this)']);
    expect(fn.split('this.patrol?.step').length).toBe(2);
  });
  it('夜の哨戒の中: 門番 → 発見なら再出撃 → 夜の出撃（同じステップ）', () => {
    const s = src('systems/patrol-air-step.ts');
    const fn = s.slice(s.indexOf('  step(feelDt: number, w: PatrolWorldView)'), s.indexOf('  private showResult'));
    expectOrder(fn, ['stepPatrolAir(s, this.gate, w.band, off,', 'restartAirSortie(fl, this.sortie, w.boat.state, s.findBearingDeg, s.findR, this.base)', 'this.flight.step(feelDt, this.view)']);
  });
  it('模擬（core/patrol-air-sim）も同じ順: 帯 → 門番 → 再出撃 → 夜の出撃 → 火災 → 夜明けの空襲', () => {
    const s = src('core/patrol-air-sim.ts');
    expectOrder(s, ['band = nextSpeedBand(', 'stepPatrolAir(gate, s.gate, band,', 'restartAirSortie(night, s.sortie, boat,', 'stepAirStrike(night, s.sortie, cN, nightRng, realDt)', 'stepDamage(d, s.damage, realDt)', 'stepAirStrike(dawn, s.dawn, cD, dawnRng, realDt)']);
  });
  it('+23 の系列は setup.patrolAir のある任務だけで作る（N5）、自艇への命中は「敵機の爆撃で沈没」（bombed）', () => {
    const s = src('systems/world-hazards.ts');
    expect(s).toContain('const patrolRng = pa ? new SeededRng((seed + PATROL_AIR_SEED_OFFSET) >>> 0) : null;');
    expect(s).toContain("hit(pa.sortie.bombHit, patrolRng, x, y, 'bombed')");
  });
});
