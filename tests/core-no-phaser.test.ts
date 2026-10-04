// CLAUDE.md §4: src/core は phaser を import しない。import したらこのテストが落ちる。
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const CORE_DIR = join(__dirname, '..', 'src', 'core');

describe('src/core は Phaser 非依存', () => {
  it('phaser を import / require しているファイルが無い', () => {
    const files = readdirSync(CORE_DIR).filter((f) => f.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(0);
    const offenders = files.filter((f) => {
      const src = readFileSync(join(CORE_DIR, f), 'utf8');
      return /from\s+['"]phaser['"]|require\(\s*['"]phaser['"]\s*\)/.test(src);
    });
    expect(offenders).toEqual([]);
  });
});
