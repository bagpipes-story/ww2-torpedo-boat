// CLAUDE.md §4: src/core は phaser を import しない。import したらこのテストが落ちる。
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const CORE_DIR = join(__dirname, '..', 'src', 'core');

// from 'phaser' / import 'phaser' / import('phaser') / require('phaser') / 'phaser/…' サブパス、型のみ import も含めて検出する
const PHASER_IMPORT = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]phaser(?:\/[^'"]*)?['"]/;

describe('src/core は Phaser 非依存', () => {
  it('検出パターンは代表的な import 形を拾い、無関係な文字列は拾わない', () => {
    const shouldMatch = [
      "import Phaser from 'phaser';",
      'import * as Phaser from "phaser";',
      "import type { Scene } from 'phaser';",
      "import 'phaser';",
      "const P = await import('phaser');",
      "const P = require('phaser');",
      "import { Vector2 } from 'phaser/src/math/Vector2';",
    ];
    const shouldNotMatch = [
      "import { ktToMps } from './units';",
      "// phaser という単語がコメントにあるだけ",
      "const name = 'phaser';",
    ];
    for (const s of shouldMatch) expect(PHASER_IMPORT.test(s), s).toBe(true);
    for (const s of shouldNotMatch) expect(PHASER_IMPORT.test(s), s).toBe(false);
  });

  it('phaser を import / require しているファイルが無い', () => {
    const files = readdirSync(CORE_DIR).filter((f) => f.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(0);
    const offenders = files.filter((f) => PHASER_IMPORT.test(readFileSync(join(CORE_DIR, f), 'utf8')));
    expect(offenders).toEqual([]);
  });
});
