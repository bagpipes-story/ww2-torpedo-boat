// v0.6.9 S0（spec-v069 §6 S0・R3）: systems/mission-world の updateFrame の見た目の同期と destroy() の中身を systems/world-visuals へ移した。
// 下の 2 つの表は main 2ad122b の mission-world.ts:218-233 と :263-277 の行（this を w に読み替えただけ）。world-visuals.ts はこれを同じ順で 1 行ずつ持ち、
// mission-world.ts はもう見た目の同期も破棄も持たない（updateFrame は 入力 → 固定ステップ → 命中スローの残り → 浅瀬 → 見た目、の順のまま）。
// 動いた絵が同じかはヘッドレスの画面の A/B（main と S0 のビルドで同じ seed・同じ操作の世界の screenshot。scratchpad v069/impl/S0）で見た。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', 'src', 'systems');
const read = (f: string): string => readFileSync(join(ROOT, f), 'utf8');

/** 2ad122b の mission-world.ts:218-233（updateFrame の後半。g は同じ関数の頭の const g = destroyers） */
const VISUALS = [
  'w.storm?.updateVisuals(realDt, w.boat.state);',
  'w.boat.syncSprite(w.storm ? w.storm.rollDeg : 0);',
  'w.escort?.syncSprite();',
  'g?.syncSprites();',
  'w.torpedoes.updateVisuals(realDt);',
  'g?.updateVisuals(realDt);',
  'w.hunt?.updateVisuals(realDt, w.visRange2);',
  'w.pts?.updateVisuals(realDt, w.visRange2);',
  'w.convoy?.updateVisuals(w.boat.state, w.visRange2, w.pts?.targets ? w.pts.targets.aimedBarge : -1);',
  'w.splashes.updateVisuals(realDt);',
  'if (w.smokeScreen && w.smoke && w.smokeParams) w.smokeScreen.updateVisuals(w.smoke, w.smokeParams);',
  'w.friendly?.updateVisuals(realDt, w);',
  'w.seaplane?.updateVisuals(w.boat.state);',
  'w.patrol?.updateVisuals(w.boat.state, w.escort ? w.escort.state.boat : null);',
  'w.dawn.updateVisuals(w);',
  'w.arms?.updateVisuals(realDt, w);',
];
/** 2ad122b の mission-world.ts:263-277（destroy() の中身） */
const DESTROY = [
  'w.storm?.destroy();', 'w.seaplane?.destroy();', 'w.patrol?.destroy();', 'w.dawn.destroy();', 'w.arms?.destroy();', 'w.friendly?.destroy();', 'w.torpedoes.destroy();',
  'w.hunt?.destroy();', 'w.pts?.destroy();', 'w.convoy?.destroy();', 'w.escort?.destroy();', 'w.splashes.destroy();', 'w.smokeScreen?.destroy();', 'w.destroyers?.destroy();', 'w.boat.destroy();',
];

/** 関数 name の本体の文（字下げを除いた行。空行・注は除く） */
function bodyLines(src: string, name: string): string[] {
  const i = src.indexOf(`export function ${name}(`);
  expect(i, name).toBeGreaterThanOrEqual(0);
  const open = src.indexOf('{\n', i);
  const close = src.indexOf('\n}\n', open);
  return src.slice(open + 2, close).split('\n').map((l) => l.trim()).filter((l) => l !== '' && !l.startsWith('//'));
}

describe('systems/world-visuals（v0.6.9 S0: mission-world の見た目の同期と破棄の切り出し）', () => {
  // v0.6.9 S5a: 揚陸（systems/world-landing。jp_04 だけ。ほかの任務は w.landing が null）の 1 行ずつを最後に足した。2ad122b の行とその順は変えない
  it('updateWorldVisuals は 2ad122b の updateFrame の 16 行を同じ順で持つ（頭は const g = w.destroyers だけ）。最後に揚陸の 1 行（v0.6.9 S5a）', () => {
    expect(bodyLines(read('world-visuals.ts'), 'updateWorldVisuals')).toEqual(['const g = w.destroyers;', ...VISUALS, 'w.landing?.updateVisuals(realDt); // 味方の輸送船と敵の魚雷（v0.6.9 S5a。jp_04 だけ。最後に足した＝ほかの絵の順は v0.6.8 のまま）']);
  });
  it('destroyWorldVisuals は 2ad122b の destroy() の 15 行を同じ順で持つ。最後に揚陸の 1 行（v0.6.9 S5a）', () => {
    expect(bodyLines(read('world-visuals.ts'), 'destroyWorldVisuals')).toEqual([...DESTROY, 'w.landing?.destroy(); // v0.6.9 S5a（jp_04 だけ。最後に足した）']);
  });
  it('mission-world の updateFrame は 入力 → 固定ステップ → 命中スローの残り → 浅瀬 → 見た目 の順、destroy は world-visuals だけ。見た目の同期・破棄はもう持たない', () => {
    const src = read('mission-world.ts');
    const at = (s: string): number => {
      const i = src.indexOf(s);
      expect(i, s).toBeGreaterThan(0);
      return i;
    };
    const order = ['consumeFrameInput(this, realDt);', 'this.stepper.advance(realDt, this.stepFn);', 'if (this.slowMoLeftS > 0) this.slowMoLeftS -= realDt;', 'this.refreshShallowStatus();\n    updateWorldVisuals(this, realDt);'].map(at);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(src).toMatch(/destroy\(\): void \{\n {4}destroyWorldVisuals\(this\);[^\n]*\n {2}\}/);
    expect(src.includes('.updateVisuals(')).toBe(false);
    expect(src.includes('.syncSprite')).toBe(false);
    expect(src.split('.destroy()').length - 1).toBe(0);
    // world-visuals が読むために private から出したのは smokeScreen だけ
    expect(src).toContain('  readonly smokeScreen: SmokeScreen | null;');
  });
});
