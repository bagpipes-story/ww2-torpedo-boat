// v0.6.8 S3（spec-v068 §5.1・§5.3・§6.1）: 兵装の固定ステップの順のソースの pin。敵の側（systems/world-enemy-step）は
// 艦への機銃 → 閃光 → 駆逐艦か大発 → 魚雷（駆逐艦のいない任務）→ 米PT（文はそのまま。tests/gunboat-target）→ 機関 → 対空（最後）。
// 艦への機銃は艦の被弾・沈没を呼ばない（効かない）。撃墜の順番の飛ばしは兵装（ArmsStep.stepAir）だけ: 夜明けの段・夜の哨戒の段は呼ばない（凍結の空中の core は 1 字も変えない）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const code = (p: string): string => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

describe('兵装の段の順（ソースの pin）', () => {
  it('world-enemy-step: stepShips < applyFlash < 駆逐艦 < 魚雷 < 米PT < 機関 < stepAir（それぞれ 1 回）', () => {
    const s = code('systems/world-enemy-step.ts');
    const parts = ['w.arms?.stepShips(', 'w.arms?.applyFlash(w);', 'if (g) stepDestroyerSide(', 'if (!g) stepFreeTorpedoes(', 'w.pts?.step(dt, feelDt, w, w.input.gunHeld);', 'w.engine?.step(w, feelDt);', 'w.arms?.stepAir('];
    const idx = parts.map((p) => s.indexOf(p));
    expect(idx.every((i) => i >= 0), idx.join(' ')).toBe(true);
    for (let k = 1; k < idx.length; k++) expect(idx[k - 1]!, parts[k]).toBeLessThan(idx[k]!);
    for (const p of parts) expect(s.split(p).length, p).toBe(2);
  });
  it('艦への機銃（ship-gun）は艦の被弾の数え・沈没の演出を呼ばない', () => {
    const s = readFileSync(new URL('../src/systems/ship-gun.ts', import.meta.url), 'utf8');
    expect(s).not.toContain('takeHit');
    expect(s).not.toContain('playSinking');
    expect(s).toContain('new SeededRng((seed + SHIP_GUN_SEED_OFFSET) >>> 0)');
  });
  it('撃墜の順番の飛ばし（skipDownedRuns）は兵装の stepAir だけ。夜明けの段・夜の哨戒の段は呼ばない', () => {
    expect(code('systems/world-dawn.ts')).not.toContain('skipDownedRuns');
    expect(code('systems/patrol-air-step.ts')).not.toContain('skipDownedRuns');
    const a = code('systems/arms-step.ts');
    const air = a.slice(a.indexOf('  stepAir(w: ArmsWorld'), a.indexOf('  private down('));
    // 撃墜が 1 機でもあれば押していなくても最初に飛ばす（レビュー F2）
    expect(air.trimStart().split('\n')[1]!.trim()).toBe('if (this.downs > 0) this.skipDowned(w);');
    expect(a).toContain('new SeededRng((kit.seed + AA_SEED_OFFSET) >>> 0)');
  });
  it('夜の哨戒の門番は兵装の閃光の距離を 7 つ目に渡す（模擬は 6 つ＝0）', () => {
    /** src の中の name( の呼び出しのそれぞれの引数の数（括弧の深さ 0 の , を数える） */
    const argCounts = (src: string, name: string): number[] => {
      const out: number[] = [];
      for (let at = src.indexOf(`${name}(`); at >= 0; at = src.indexOf(`${name}(`, at + 1)) {
        let depth = 0;
        let n = 1;
        for (let i = at + name.length; i < src.length; i++) {
          const ch = src[i];
          if (ch === '(') depth++;
          else if (ch === ')' && --depth === 0) break;
          else if (ch === ',' && depth === 1) n++;
        }
        out.push(n);
      }
      return out;
    };
    expect(code('systems/patrol-air-step.ts')).toContain('stepPatrolAir(s, this.gate, w.band, off, !this.pendingRestart && airSortieComplete(fl), feelDt, w.arms ? w.arms.flashM : 0);');
    expect(argCounts(code('systems/patrol-air-step.ts'), 'stepPatrolAir')).toEqual([7]);
    expect(argCounts(code('core/patrol-air-sim.ts'), 'stepPatrolAir')).toEqual([6]);
  });
});
