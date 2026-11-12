// v0.7.0 S0（アートと音①：コードで描く絵。spec-v0700 §3.1・§6・§7.2・R30）: 絵と演出のファイルの作法を source で確かめる（陰の tests/evac-terrain-art の作法）。
// 対象: src/assets/*-art.ts（起動時・任務の開始に 1 回描く絵）、src/systems/*-fx.ts と world-art.ts（演出の持ち主・プール）。S0 では陰の evac-terrain-art だけ
// （S1〜S3c で増えるとここに自動で入る）。
// - 乱数は絵だけの SeededRng（種は *ART_SEED*）で、Math.random もゲームの乱数の系列（gunRng・lookoutRng など・setup の seed）も使わない＝ゲームの系列の引く回数を変えない。
// - update の本体で new・.map(・.filter(・tween を作らない、Graphics.clear で描き直さない（CLAUDE.md §7）。
// - 世界の絵は論理の状態を読むだけで書かない（.state.〜 =・speedMps・headingDeg・hp・phase・船体の x・y への代入なし）。
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function artFiles(): string[] {
  const out: string[] = [];
  for (const f of readdirSync('src/assets')) if (f.endsWith('-art.ts')) out.push(join('src/assets', f));
  for (const f of readdirSync('src/systems')) if (f.endsWith('-fx.ts') || f === 'world-art.ts') out.push(join('src/systems', f));
  return out.sort();
}

/** コメント（// と /* *\/）を除いた source（注の中の言葉で引っかからないように） */
function code(file: string): string {
  return readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/** update・updateFrame・step・tick という名前のメソッド・関数の本体（中かっこを数えて取り出す） */
function updateBodies(src: string): string[] {
  const out: string[] = [];
  const re = /\b(update\w*|step\w*|tick\w*)\s*\([^)]*\)\s*(?::\s*[\w<>[\]|. ]+)?\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let depth = 1;
    let i = re.lastIndex;
    for (; i < src.length && depth > 0; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') depth--;
    }
    out.push(src.slice(re.lastIndex, i - 1));
  }
  return out;
}

const FILES = artFiles();

describe('絵と演出のファイルの作法（v0.7.0 S0。R30）', () => {
  it('対象のファイルがある（S0 は陰の evac-terrain-art。空の検査にしない）', () => {
    expect(FILES).toContain('src/assets/evac-terrain-art.ts');
  });
  it.each(FILES)('%s: 乱数は絵だけの SeededRng（種は *ART_SEED*）で、Math.random もゲームの乱数の系列も使わない', (f) => {
    const s = code(f);
    expect(s).not.toMatch(/Math\.random/);
    expect(s).not.toMatch(/\b(gunRng|lookoutRng|nightRng|aiRng|rngFor|seedFor)\b/);
    expect(s).not.toMatch(/\b(setup|sortie|mission|world|w)\.seed\b/);
    const seeds = [...s.matchAll(/new SeededRng\(([^)]*)\)/g)].map((m) => m[1]!.trim());
    for (const a of seeds) expect(a, f).toMatch(/^[A-Z_]*ART_SEED[A-Z_0-9]*(\s*\+\s*\d+)?$/);
  });
  it.each(FILES)('%s: update の本体で new・.map(・.filter(・tween を作らず、Graphics を clear して描き直さない', (f) => {
    const s = code(f);
    expect(s).not.toMatch(/\.clear\(\)/);
    for (const b of updateBodies(s)) {
      expect(b, f).not.toMatch(/\bnew\s/);
      expect(b, f).not.toMatch(/\.(map|filter)\(/);
      expect(b, f).not.toMatch(/tweens\.add|\.tween\(/);
      expect(b, f).not.toMatch(/\{\s*\w+\s*:/); // オブジェクトのリテラル
    }
  });
  it.each(FILES)('%s: 世界の絵は論理の状態へ代入しない', (f) => {
    const s = code(f);
    expect(s).not.toMatch(/\.state\.\w+\s*[-+*/]?=(?!=)/);
    expect(s).not.toMatch(/\.(speedMps|headingDeg|hp|phase|fireLeftS|sinking|sighted)\s*[-+*/]?=(?!=)/);
    expect(s).not.toMatch(/\b(state|boat|ship|hull|barge|leader)\.(x|y)\s*[-+*/]?=(?!=)/);
  });
  it('検査の取り出しが効く（update の本体の new・代入を見つける）', () => {
    const bad = 'class A { update(dt: number): void { const p = new Foo(); this.w.boat.state.x = 1; } }';
    expect(updateBodies(bad)).toHaveLength(1);
    expect(updateBodies(bad)[0]).toMatch(/\bnew\s/);
    expect(bad).toMatch(/\.state\.\w+\s*[-+*/]?=(?!=)/);
  });
});
