// 揚陸の任務の import と書き込みの境（v0.6.9 S2。spec-v069 §9 の landing-imports・D17・D18・R8/F9）: 米PT の雷撃は決まった所からだけ使われ、PT の段階を外から書くのは
// 決まったファイルだけ、seed+26 は jp_04 の組み立てだけ（乱数の系列の番号は重ならない・+21 は予約）。新しい core は Phaser にも config にも依らない。
// v0.6.10 S2（spec-v0610 §4 の RNG と import の pin・レビュー M6）: +27・+28 は卯月の見張り・砲（core/ally-destroyer の定数だけ）で、その SeededRng を作るのは systems/world-ally と
// core/landing-sim だけ、ptLitReact を呼ぶのは core/ally-destroyer だけ、createAllyDestroyer・stepAllyDestroyer を使うのは systems/world-ally と core/landing-sim だけ（S3・S5 で配線）。
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALLY_GUN_SEED_OFFSET, ALLY_LOOKOUT_SEED_OFFSET } from '../src/core/ally-destroyer';
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
  it('core/pt-torpedo を import するのは systems/world-landing と core/landing-sim だけ（雷撃を回す所）と core/ally-destroyer（照らされた PT の反応。v0.6.10）。Result の 2 つ（S7）は結末の番号（OUT_*）と ptTorpedoOutcome だけを読む', () => {
    const re = /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s+['"][./]*(?:core\/)?pt-torpedo['"]/;
    const got = using(/from\s+['"][./]*(?:core\/)?pt-torpedo['"]/);
    const RESULT_READERS = ['systems/landing-telemetry.ts', 'ui/landing-result.ts'];
    subsetOf(got, ['systems/world-landing.ts', 'core/landing-sim.ts', 'core/ally-destroyer.ts', ...RESULT_READERS]);
    for (const f of RESULT_READERS.filter((x) => got.includes(x))) {
      const names = re.exec(code(f))![1]!.split(',').map((x) => x.trim()).filter((x) => x.length > 0);
      for (const n of names) expect(/^OUT_[A-Z_]+$/.test(n) || n === 'ptTorpedoOutcome', `${f}: ${n}`).toBe(true);
    }
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
  it('*_SEED_OFFSET の番号は重ならず、+26 は米PT の雷撃、+27・+28 は卯月の見張り・砲（v0.6.10）、+21 はどの定数も使わない（予約）', () => {
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
    expect([offsets.get(27), offsets.get(28), ALLY_LOOKOUT_SEED_OFFSET, ALLY_GUN_SEED_OFFSET]).toEqual(['ALLY_LOOKOUT_SEED_OFFSET', 'ALLY_GUN_SEED_OFFSET', 27, 28]);
    expect(using(/export const \w+_SEED_OFFSET\s*=\s*2[78]\b/)).toEqual(['core/ally-destroyer.ts']);
    expect(offsets.has(21), '+21').toBe(false);
  });
  it('core/night の系列の一覧（コメント）に +26（v0.6.9 の米PT の雷撃）と +27・+28（v0.6.10 の卯月）がある', () => {
    expect(read('core/night.ts')).toMatch(/\+26 は v0\.6\.9 の米PT の雷撃/);
    expect(read('core/night.ts')).toMatch(/\+27・\+28 は v0\.6\.10 の味方の駆逐艦 卯月の見張り・砲/);
  });
  it('new SeededRng(… ALLY_LOOKOUT_SEED_OFFSET / ALLY_GUN_SEED_OFFSET …) は systems/world-ally と core/landing-sim だけ（core/ally-destroyer は渡された系列を使うだけ）', () => {
    const got = using(/new\s+SeededRng\([^;]*ALLY_(?:LOOKOUT|GUN)_SEED_OFFSET/);
    subsetOf(got, ['systems/world-ally.ts', 'core/landing-sim.ts']);
    expect(code('core/ally-destroyer.ts')).not.toMatch(/new\s+SeededRng\b/);
    subsetOf(using(/\bALLY_(?:LOOKOUT|GUN)_SEED_OFFSET\b/), ['core/ally-destroyer.ts', 'systems/world-ally.ts', 'core/landing-sim.ts']);
  });
});

describe('卯月（core/ally-destroyer。v0.6.10 S2）を使う所', () => {
  it('ptLitReact を呼ぶのは core/ally-destroyer だけ（照らされた PT の反応は卯月の段だけ）', () => {
    expect(using(/\bptLitReact\s*\(/)).toEqual(['core/ally-destroyer.ts', 'core/pt-torpedo.ts']);
    expect(code('core/pt-torpedo.ts').match(/\bptLitReact\s*\(/g)).toHaveLength(1); // 定義だけ（pt-torpedo の中では呼ばない）
  });
  it('createAllyDestroyer・stepAllyDestroyer・new AllyDestroyer を使うのは systems/world-ally と core/landing-sim だけ（と定義の core/ally-destroyer）', () => {
    subsetOf(using(/\b(?:createAllyDestroyer|stepAllyDestroyer)\b/), ['core/ally-destroyer.ts', 'systems/world-ally.ts', 'core/landing-sim.ts']);
    expect(using(/new\s+AllyDestroyer\b/)).toEqual(['core/ally-destroyer.ts']);
  });
  it('stepPtTorpedoes は卯月の印（litSalvo・litAway）を読まない（卯月の無い夜は前のまま。LD5）', () => {
    const s = code('core/pt-torpedo.ts');
    const body = s.slice(s.indexOf('export function stepPtTorpedoes'), s.indexOf('function hurriedReach'));
    expect(body.length).toBeGreaterThan(500);
    expect(body).not.toMatch(/litSalvo|litAway|ptLitReact/);
  });
  it('FATE_BY_ALLY は FATE_BY_PLAYER・FATE_BY_GUNBOAT の隣（core/convoy-sim-gunboat。リードの決定 LD8・レビュー M6）', () => {
    expect(using(/export const FATE_BY_\w+\s*=/)).toEqual(['core/convoy-sim-gunboat.ts']);
    expect(code('core/convoy-sim-gunboat.ts')).toMatch(/FATE_BY_PLAYER = 1;\s*export const FATE_BY_GUNBOAT = 2;\s*export const FATE_BY_ALLY = 3;/);
  });
});

describe('新しい core（pt-torpedo・landing・landing-torpedoes・ally-destroyer）', () => {
  it.each(['core/pt-torpedo.ts', 'core/landing.ts', 'core/landing-torpedoes.ts', 'core/ally-destroyer.ts'])('%s は phaser・config・systems・ui を import しない', (f) => {
    const imports = [...code(f).matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!);
    expect(imports.length).toBeGreaterThan(0);
    for (const m of imports) expect(m, `${f}: ${m}`).toMatch(/^\.\/[\w-]+$/);
  });
  it('core/landing・core/landing-torpedoes は core/pt-torpedo を import しない（斉射の数えと船は構造の型で受ける）', () => {
    for (const f of ['core/landing.ts', 'core/landing-torpedoes.ts']) expect(code(f)).not.toMatch(/from\s+['"]\.\/pt-torpedo['"]/);
  });
});
