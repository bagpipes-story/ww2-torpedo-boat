// 揚陸の任務の import と書き込みの境（v0.6.9 S2。spec-v069 §9 の landing-imports・D17・D18・R8/F9）: 米PT の雷撃は決まった所からだけ使われ、PT の段階を外から書くのは
// 決まったファイルだけ、seed+26 は jp_04 の組み立てだけ（乱数の系列の番号は重ならない・+21/+27/+28 は予約）。新しい core は Phaser にも config にも依らない。
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PT_TORPEDO_SEED_OFFSET } from '../src/core/pt-torpedo';

const SRC = join(__dirname, '..', 'src');
const FILES = readdirSync(SRC, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.ts')).map((f) => relative(SRC, join(SRC, f)).split('\\').join('/')).sort();
const read = (f: string): string => readFileSync(join(SRC, f), 'utf8');
/** コメントを除いたソース（コメントの中の名前で誤検出しない） */
const code = (f: string): string => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const using = (re: RegExp): string[] => FILES.filter((f) => re.test(code(f)));
const subsetOf = (got: readonly string[], allowed: readonly string[]): void => {
  expect(got.filter((f) => !allowed.includes(f))).toEqual([]);
};

describe('米PT の雷撃（core/pt-torpedo）を使う所', () => {
  it('core/pt-torpedo を import するのは systems/world-landing と core/landing-sim だけ（今は無い。S3・S5 で足す）', () => {
    const got = using(/from\s+['"][./]*(?:core\/)?pt-torpedo['"]/);
    subsetOf(got, ['systems/world-landing.ts', 'core/landing-sim.ts']);
  });
  it('PT_TORPEDO_SEED_OFFSET を使うのは core/pt-torpedo・systems/world-landing・core/landing-sim だけ', () => {
    const got = using(/\bPT_TORPEDO_SEED_OFFSET\b/);
    expect(got).toContain('core/pt-torpedo.ts');
    subsetOf(got, ['core/pt-torpedo.ts', 'systems/world-landing.ts', 'core/landing-sim.ts']);
  });
  it('new SeededRng(… PT_TORPEDO_SEED_OFFSET …) は systems/world-landing の buildLanding（setup.landing のある任務の枝）と core/landing-sim だけ', () => {
    const re = /new\s+SeededRng\([^;]*PT_TORPEDO_SEED_OFFSET/;
    const got = using(re);
    subsetOf(got, ['systems/world-landing.ts', 'core/landing-sim.ts']);
    if (got.includes('systems/world-landing.ts')) {
      const s = code('systems/world-landing.ts');
      const fn = s.indexOf('function buildLanding');
      expect(fn).toBeGreaterThanOrEqual(0);
      const at = s.search(re);
      expect(at).toBeGreaterThan(fn);
      expect(s.slice(fn, at)).toMatch(/\.landing\b[^\n]*\)\s*return null|if\s*\(!\s*\w+\.landing\)/);
    }
  });
});

describe('PT の段階を外から書く所（R8/F9）', () => {
  // F9 の正規表現。`=== PT_LEAVE`（比べるだけ）は書き込みではないので = の次が = のものは除く（(?!=)。書き込みはどれも拾う）
  const WRITE = /\.phase\s*=(?!=)[^;]*PT_LEAVE/;
  const ALLOWED = ['core/pt-boats.ts', 'core/pt-damage.ts', 'core/pt-pass-end.ts', 'core/pt-chase.ts', 'core/pt-torpedo.ts'];
  it('「.phase = … PT_LEAVE」があるのは pt-boats・pt-damage・pt-pass-end・pt-chase・pt-torpedo だけ（pt-torpedo は書く）', () => {
    const got = using(WRITE);
    subsetOf(got, ALLOWED);
    expect(got).toEqual(expect.arrayContaining(['core/pt-boats.ts', 'core/pt-damage.ts', 'core/pt-pass-end.ts', 'core/pt-chase.ts', 'core/pt-torpedo.ts']));
  });
  it('正規表現は三項の書き込みも拾い、比べるだけは拾わない', () => {
    for (const s of ['b.phase = PT_LEAVE;', 'b.phase = b.passes >= p.maxPasses || b.fate !== PT_FATE_NONE ? PT_LEAVE : PT_BREAK;', 'q.boats[i]!.phase=PT_LEAVE']) expect(WRITE.test(s), s).toBe(true);
    for (const s of ['if (b.phase === PT_LEAVE) ev.onLeave(i);', 'b.phase == PT_LEAVE', 'b.phase < PT_LEAVE', 'st.prevPhase[i] = b.phase;']) expect(WRITE.test(s), s).toBe(false);
  });
  it('core/pt-torpedo が書く PT の欄は phase と timerS だけ（owner・held・追撃・航過の状態に触らない）', () => {
    const s = code('core/pt-torpedo.ts');
    const writes = [...s.matchAll(/\bb\.(\w+)\s*=(?!=)/g)].map((m) => m[1]);
    expect([...new Set(writes)].sort()).toEqual(['phase', 'timerS']);
    expect(s).not.toMatch(/\bq\.(owner|held|detected|passes|gapLeftS|lastPassBoat)\s*=(?!=)/);
  });
});

describe('乱数の系列（D18）', () => {
  it('*_SEED_OFFSET の番号は重ならず、+26 は米PT の雷撃、+21・+27・+28 はどの定数も使わない（予約）', () => {
    const offsets = new Map<number, string>();
    for (const f of FILES) {
      for (const m of code(f).matchAll(/export const (\w+_SEED_OFFSET)\s*=\s*(\d+)/g)) {
        const n = Number(m[2]);
        expect(offsets.has(n), `${m[1]} と ${offsets.get(n)} が ${n}`).toBe(false);
        offsets.set(n, m[1]!);
      }
    }
    expect(offsets.get(26)).toBe('PT_TORPEDO_SEED_OFFSET');
    expect(PT_TORPEDO_SEED_OFFSET).toBe(26);
    for (const n of [21, 27, 28]) expect(offsets.has(n), `+${n}`).toBe(false);
  });
  it('core/night の系列の一覧（コメント）に +26（v0.6.9 の米PT の雷撃）がある', () => {
    expect(read('core/night.ts')).toMatch(/\+26 は v0\.6\.9 の米PT の雷撃/);
  });
});

describe('新しい core（pt-torpedo・landing・landing-torpedoes）', () => {
  it.each(['core/pt-torpedo.ts', 'core/landing.ts', 'core/landing-torpedoes.ts'])('%s は phaser・config・systems・ui を import しない', (f) => {
    const imports = [...code(f).matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!);
    expect(imports.length).toBeGreaterThan(0);
    for (const m of imports) expect(m, `${f}: ${m}`).toMatch(/^\.\/[\w-]+$/);
  });
  it('core/landing・core/landing-torpedoes は core/pt-torpedo を import しない（斉射の数えと船は構造の型で受ける）', () => {
    for (const f of ['core/landing.ts', 'core/landing-torpedoes.ts']) expect(code(f)).not.toMatch(/from\s+['"]\.\/pt-torpedo['"]/);
  });
});
