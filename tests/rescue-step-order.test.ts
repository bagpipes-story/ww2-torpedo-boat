// v0.8.5 S2（spec-v0850 §4.0・§6）: 救助の任務の固定ステップの順と、毎ステップ・毎フレームの本体に確保が無いこと（ソースの走査。tests/sfx-rules・core-rules-kit のやり方）。
// 順: 自艇 → 米PT の隊の段（凍結の stepPtSection＝pt-squadron）→ S ボートの退き（world-rescue の stepCover）→ 砲台（shore-guns）→ 生存者 → 機雷（world-rescue の step の中で stepRescue → stepMines）
// → 揚陸の段（jp_04）→ 機関の不調。ほかの任務の段の順は変えない（w.rescue・w.shoreGuns が null の任務は何もしない）。
import { describe, expect, it } from 'vitest';
import { ALLOC_PATTERNS, code } from './core-rules-kit';

/** クラスのメソッド・getter の本体（名前の行の最初の中かっこから数える） */
function methodBody(src: string, head: RegExp): string {
  const m = head.exec(src);
  if (!m) throw new Error(`見つからない: ${head}`);
  const open = src.indexOf('{', m.index + m[0].length - 1);
  let j = open + 1;
  for (let depth = 1; j < src.length && depth > 0; j++) depth += src[j] === '{' ? 1 : src[j] === '}' ? -1 : 0;
  return src.slice(open + 1, j - 1);
}
const allocs = (body: string): string[] => ALLOC_PATTERNS.filter((re) => re.test(body)).map(String);

describe('固定ステップの順（world-enemy-step）', () => {
  it('米PT の隊 → S ボートの退き → 沿岸砲 → 生存者と機雷 → 揚陸 → 機関の不調', () => {
    const s = code('src/systems/world-enemy-step.ts');
    const at = (x: string): number => {
      const i = s.indexOf(x);
      expect(i, x).toBeGreaterThan(0);
      return i;
    };
    const order = ['w.pts?.step(', 'w.rescue?.stepCover(w, feelDt);', 'w.shoreGuns?.step(w, feelDt, dt);', 'w.rescue?.step(w, feelDt);', 'w.landing?.stepAfterPts(', 'w.engine?.step('].map(at);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
  it('world-rescue の step: 時間の終わり → 拾う・移す → 機雷 → 触雷の被害（hitBoat は stepMines の後）', () => {
    const b = methodBody(code('src/systems/world-rescue.ts'), /\n {2}step\(/);
    const order = ['rescueTimeUp(', 'stepRescue(', 'stepMines(', 'this.hitBoat('].map((x) => b.indexOf(x));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, c) => a - c));
  });
  it('沿岸砲の着弾は群を奪う（ShoreBattery の onImpact の後に onLand）・us_03 の大発の狩りは onLand を渡さない', () => {
    expect(code('src/systems/shore-battery.ts')).toContain('this.onLand?.(x, y, gunIndex === SURVIVOR_SHELL_GUN);'); // v0.8.5 IP2: 生存者の海へ撃った弾か
    expect(code('src/systems/barge-hunt.ts')).toContain("(spec, rng, x, y) => onBoatHit(spec, rng, x, y, 'shore_battery')));");
  });
});

describe('毎ステップ・毎フレームの本体に確保なし（§7）', () => {
  it('world-rescue（stepCover・onShell・step）・shore-guns（step と読み口）・rescue-view（refresh・update）', () => {
    const wr = code('src/systems/world-rescue.ts');
    const sg = code('src/systems/shore-guns.ts');
    const rv = code('src/systems/rescue-view.ts');
    const bodies: [string, string][] = [
      ['stepCover', methodBody(wr, /\n {2}stepCover\(/)],
      ['onShell', methodBody(wr, /\n {2}onShell\(/)],
      ['step', methodBody(wr, /\n {2}step\(/)],
      ['guns.step', methodBody(sg, /\n {2}step\(/)],
      ['shoreInArc', methodBody(sg, /get shoreInArc\(/)],
      ['shoreAlerted', methodBody(sg, /get shoreAlerted\(/)],
      ['view.refresh', methodBody(rv, /\n {2}private refresh\(/)],
      ['view.update', methodBody(rv, /\n {2}update\(/)],
    ];
    const bad = bodies.flatMap(([n, b]) => allocs(b).filter((a) => !(n === 'view.refresh' && a.includes('`'))).map((a) => `${n} ${a}`));
    expect(bad).toEqual([]);
  });
  it('rescue-view の refresh のテンプレート文字列は人数が変わった時だけ（shownLeft と比べた後）', () => {
    const b = methodBody(code('src/systems/rescue-view.ts'), /\n {2}private refresh\(/);
    expect(b.indexOf('if (left === this.shownLeft[i]) continue;')).toBeGreaterThan(-1);
    expect(b.indexOf('if (left === this.shownLeft[i]) continue;')).toBeLessThan(b.indexOf('`'));
  });
  it('rescue-telemetry の毎フレームの写し（refreshRescueTelemetry）', () => {
    const src = code('src/systems/rescue-telemetry.ts');
    const b = methodBody(src, /function refreshRescueTelemetry\(/);
    expect(allocs(b)).toEqual([]);
  });
});
