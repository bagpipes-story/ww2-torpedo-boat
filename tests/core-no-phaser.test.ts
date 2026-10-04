// CLAUDE.md §4: src/core は phaser を import しない。import したらこのテストが落ちる。
// グローバル名前空間 `Phaser.` の型だけの参照も「依存」とみなして落とす（phaser.d.ts はグローバル宣言を持つため、import 無しで書けてしまう）。
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const CORE_DIR = join(__dirname, '..', 'src', 'core');

// from 'phaser' / import 'phaser' / import('phaser') / require('phaser') / 'phaser/…' サブパス、型のみ import、export * from も含めて検出する
const PHASER_IMPORT = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]phaser(?:\/[^'"]*)?['"]/;
// グローバル名前空間の参照（Phaser.Math など）
const PHASER_GLOBAL = /\bPhaser\s*\./;

/** コメントを除いたソース。コメント内の「Phaser」という単語で誤検出しないため */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function listTsFilesRecursive(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.ts'))
    .map((f) => join(dir, f));
}

function dependsOnPhaser(src: string): boolean {
  const code = stripComments(src);
  return PHASER_IMPORT.test(code) || PHASER_GLOBAL.test(code);
}

describe('src/core は Phaser 非依存', () => {
  it('検出パターンは代表的な依存の形を拾い、無関係なものは拾わない', () => {
    const shouldMatch = [
      "import Phaser from 'phaser';",
      'import * as Phaser from "phaser";',
      "import type { Scene } from 'phaser';",
      "import 'phaser';",
      "const P = await import('phaser');",
      "const P = require('phaser');",
      "import { Vector2 } from 'phaser/src/math/Vector2';",
      "export * from 'phaser';",
      'import Phaser from\n  "phaser";',
      'function f(v: Phaser.Types.Math.Vector2Like) {}',
      'const z = Phaser.Math.Clamp(1, 0, 2);',
    ];
    const shouldNotMatch = [
      "import { ktToMps } from './units';",
      '// Phaser 非依存の純粋関数。Phaser.Math は使わない',
      '/* import Phaser from "phaser" はここでは禁止 */',
      "const name = 'phaser';",
      'const phaserLike = 1;',
    ];
    for (const s of shouldMatch) expect(dependsOnPhaser(s), s).toBe(true);
    for (const s of shouldNotMatch) expect(dependsOnPhaser(s), s).toBe(false);
  });

  it('src/core 配下（サブフォルダ含む）に phaser に依存するファイルが無い', () => {
    const files = listTsFilesRecursive(CORE_DIR);
    expect(files.length).toBeGreaterThan(0);
    const offenders = files.filter((f) => dependsOnPhaser(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
