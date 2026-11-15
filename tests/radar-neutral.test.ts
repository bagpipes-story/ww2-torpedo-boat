// v0.8.0 S2（spec-v0800 §3.2 の D-R1・D-R8・D-R11・§3.5「tests/radar-neutral」、brief L9 の (a)）: レーダーは目とは別の感覚で、世界を何も変えない。
// - ソースの走査: レーダーの層（systems/world-radar・radar-view・radar-telemetry・assets/radar-art）の代入の左辺は自分（this と this から取った別名）・手元の数・
//   自分のテレメトリの塊（radar-telemetry の t）だけ。世界・自艇・艦・AI・視程・発見を書き換える口（startRetire・setSighted など）も呼ばない。import も固定。
// - core/radar は視程・発見・AI・乱数を import しない（tests/radar の import の固定と同じ）。音の層（sfx-*）はレーダーを import しない（D-R11 の下ごしらえ。S4 で曲の段も固定）。
// - Phaser なしの小さな世界（tests/transit-world-kit。艦の AI に自艇の発見も回す）をレーダーあり・なしで 260 秒回し、毎ステップ艦の状態・AI・列の段階が同じ。
// - setup: レーダーを切った夜（?debug&noradar の radarOff）は radar の鍵が無いだけで、ほかの数（視程・発見・艦・列・乱数の回数）は同じ。
// ヘッドレスの A/B（scripts/headless/ab-replay の NORADAR=1。B だけ &noradar）は全部のフレーム（HUD の文も）を比べる（brief L9 の (b)。結果は CHANGELOG）。
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { gameData } from '../src/config/game-data';
import { SeededRng } from '../src/core/rng';
import { directSortie } from '../src/core/sortie';
import { buildWorldSetup } from '../src/systems/world-setup';
import { code, imports } from './core-rules-kit';
import { SFX, SRC } from './sfx-rules-kit';
import { kitStep, kitWorld, type KitWorld } from './transit-world-kit';

const RADAR_FILES = ['src/systems/world-radar.ts', 'src/systems/radar-view.ts', 'src/systems/radar-telemetry.ts', 'src/assets/radar-art.ts'] as const;
const ID = '[A-Za-z_$][\\w$]*';
const LV = `${ID}(?:\\s*(?:\\.\\s*${ID}|\\[[^\\]]*\\]|!))*`;

/** 宣言の頭（const・let・var の名前と型・分割・クラスの欄の名前と型）を消した source（宣言そのものは代入に数えない。初めの値の式は残す） */
function withoutDeclHeads(src: string): string {
  return src
    .replace(new RegExp(`\\b(?:const|let|var)\\s+${ID}(?:\\s*:[^=;]+)?\\s*=(?!=)`, 'g'), ' ')
    .replace(/\b(?:const|let|var)\s+\{[^}]*\}\s*=(?!=)/g, ' ')
    .replace(new RegExp(`^(\\s*)(?:(?:private|public|protected|readonly)\\s+)+${ID}(?:\\s*:[^=;]+)?\\s*=(?!=)`, 'gm'), '$1');
}

/** 代入の左辺（= ・ op= ・ ++ ・ --。比べる・矢印・宣言の頭は除く）の一覧 */
function assignTargets(raw: string): string[] {
  const src = withoutDeclHeads(raw);
  const out: string[] = [];
  for (const m of src.matchAll(new RegExp(`(${LV})\\s*(?:[-+*/%&|^]|\\*\\*|<<|>>>?|\\?\\?|&&|\\|\\|)?=(?![=>])`, 'g'))) out.push(m[1]!.replace(/\s+/g, ''));
  for (const m of src.matchAll(new RegExp(`(${LV})\\s*(?:\\+\\+|--)`, 'g'))) out.push(m[1]!.replace(/\s+/g, ''));
  for (const m of src.matchAll(new RegExp(`(?:\\+\\+|--)\\s*(${LV})`, 'g'))) out.push(m[1]!.replace(/\s+/g, ''));
  return out;
}

/** 手元の名前（const・let）と、その初めの値の根（this から取った別名は 'this'） */
function locals(src: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of src.matchAll(new RegExp(`\\b(?:const|let)\\s+(${ID})(?:\\s*:[^=;]+)?\\s*=\\s*([^;\\n]*)`, 'g'))) {
    const root = /^(this)\b/.test(m[2]!.trim()) ? 'this' : 'value';
    out.set(m[1]!, root);
  }
  for (const m of src.matchAll(new RegExp(`\\b(?:const|let)\\s+\\{([^}]*)\\}\\s*=`, 'g'))) for (const n of m[1]!.split(',')) out.set(n.trim(), 'value');
  for (const m of src.matchAll(new RegExp(`\\bfor\\s*\\(\\s*(?:const|let)\\s+(${ID})`, 'g'))) out.set(m[1]!, 'value');
  return out;
}

/** 書いてよい左辺か: this と this の別名のどこでも・手元の名前そのもの（性質でなく名前の付け直し）・テレメトリの塊 t（radar-telemetry だけ）・クラスの欄の初めの値 */
function badTargets(file: string): string[] {
  const src = code(file);
  const loc = locals(src);
  const fields = new Set([...src.matchAll(new RegExp(`^\\s*(?:(?:private|public|protected|readonly)\\s+)+(${ID})`, 'gm'))].map((m) => m[1]!));
  const bad: string[] = [];
  for (const lv of assignTargets(src)) {
    const root = lv.match(new RegExp(`^${ID}`))![0];
    const bare = lv === root;
    if (root === 'this' || fields.has(root)) continue;
    if (bare && loc.has(root)) continue;
    if (!bare && loc.get(root) === 'this') continue;
    if (!bare && root === 't' && file.endsWith('radar-telemetry.ts')) continue;
    bad.push(lv);
  }
  return bad;
}

describe('レーダーの層は読むだけ（ソースの走査）', () => {
  it.each(RADAR_FILES)('%s: 代入の左辺は自分・手元・自分のテレメトリの塊だけ。世界を書き換える口を呼ばない', (f) => {
    expect(badTargets(f)).toEqual([]);
    const s = code(f);
    expect(s).not.toMatch(/\b(startRetire|setSighted|sinkBoat|hitBoat|takeHit|playSinking|goAway|reappear|clearQueue|resolveRemainingAsMisses|withdraw|latch|setPerformance|updateShipAi|steerShip)\s*\(/);
    expect(s).not.toMatch(/\b(enemySighted|visRange2|detectRangeM|playerDetected|detectHoldS|illuminated|hiddenBySmoke|lookout\w*|gunRng)\b/);
    expect(s).not.toMatch(/Math\.random|new SeededRng/);
  });
  it('走査が効く（世界を書く形を見つける）', () => {
    const fake = 'const b = w.boat.state; b.x = 1; w.detectRangeM = 0; this.n++; let k = 0; k++; t.sweeps = 1; d.ai.playerDetected = true; const tg = this.targets; tg.x[0] = 1;';
    const loc = locals(fake);
    const lv = assignTargets(fake);
    expect(lv).toEqual(['b.x', 'w.detectRangeM', 't.sweeps', 'd.ai.playerDetected', 'tg.x[0]', 'this.n', 'k']);
    expect(assignTargets('class A {\n  private n = 0;\n  readonly s: RadarState = make();\n  f(): void {\n    const t: RadarTelemetry = { a: 1 };\n    for (let i = 0; i < 2; i++) this.n += i;\n  }\n}')).toEqual(['this.n', 'i']);
    expect([loc.get('b'), loc.get('tg'), loc.get('k')]).toEqual(['value', 'this', 'value']);
  });
  it('import: world-radar は岸の型・core/radar・radar-data（型）・strait-geometry だけ、テレメトリは型だけ。core/radar は視程・発見・AI・乱数を import しない', () => {
    expect(imports(code('src/systems/world-radar.ts'))).toEqual(['../config/shores-mission-data', '../core/radar', '../core/radar-data', '../core/strait-geometry']);
    expect(imports(code('src/systems/radar-telemetry.ts'))).toEqual(['../core/boat-telemetry', '../core/radar']);
    expect(code('src/systems/radar-telemetry.ts')).toContain("import type { RadarState } from '../core/radar';");
    expect(imports(code('src/systems/radar-view.ts'))).toEqual(['phaser', '../assets/radar-art', '../config/game-config', '../config/radar-art-config', '../core/radar', './world-radar', './world-setup', './world-radar']);
    expect(imports(code('src/core/radar.ts'))).toEqual(['./radar-data', './strait-geometry']);
  });
  it('レーダーを import するのはレーダーの層と mission-world（作る）だけ。音の層（sfx-*）は import しない', () => {
    const users = (re: RegExp): string[] => SRC.filter((f) => imports(code(f)).some((p) => re.test(p))).sort();
    expect(users(/\/(world-radar|radar-view|radar-telemetry|radar-art|radar-art-config)$/)).toEqual(['src/assets/radar-art.ts', 'src/systems/mission-telemetry.ts', 'src/systems/mission-world.ts', 'src/systems/radar-view.ts', 'src/systems/telemetry-create.ts']);
    for (const f of SFX) expect(imports(code(f)).filter((p) => /radar|ship-transit|strait-geometry|destroyer-transit/.test(p)), f).toEqual([]);
  });
});

describe('小さな世界でレーダーあり・なしが毎ステップ同じ（Phaser なし）', () => {
  const snap = (w: KitWorld): string => JSON.stringify({ t: w.stepTimeS, ships: w.ships.map((d) => [d.state, d.ai, d.sinking, d.withdrawn, d.offMap]), tr: [Array.from(w.transit.state.phase), Array.from(w.transit.state.awayAtS), w.transit.state.feelS, w.transit.state.inCount, w.transit.state.outCount, w.transit.state.goneCount] });
  for (const [hard, seed] of [[false, 1], [true, 2], [false, 12345]] as const) {
    it(`${hard ? 'ハード' : 'ノーマル'} seed ${seed}（艦は自艇を見つけ・体当たりを狙う AI のまま）: 260 秒の全ステップで艦・AI・列の段階が同じ、レーダーは掃引していた`, () => {
      const a = kitWorld({ hard, seed, detect: true });
      const b = kitWorld({ hard, seed, detect: true, radar: false });
      let diff = -1;
      for (let k = 0; diff < 0 && a.stepTimeS < 260; k++) {
        kitStep(a);
        kitStep(b);
        if (snap(a) !== snap(b)) diff = k;
      }
      expect(diff).toBe(-1);
      expect(a.radar!.state.sweeps).toBeGreaterThan(80);
      expect(a.ships.some((d) => d.ai.playerDetected) || a.ships.some((d) => d.ai.mode === 'ram') || a.ships[0]!.ai.retiring).toBe(true);
    });
  }
});

describe('setup: レーダーを切った夜は radar の鍵だけが無い（?debug&noradar）', () => {
  afterEach(() => vi.restoreAllMocks());
  for (const [hard, seed] of [[false, 1], [true, 12345]] as const) {
    it(`${hard ? 'ハード' : 'ノーマル'} seed ${seed}: 視程・発見・艦・列・今夜の乱数の回数が同じ`, () => {
      const build = (radarOff: boolean): { s: Record<string, unknown>; draws: number } => {
        const spy = vi.spyOn(SeededRng.prototype, 'next');
        const s = buildWorldSetup(gameData, 'us_04', { sortie: directSortie('us_04', seed, 'none', hard, false), hard, radarOff }) as unknown as Record<string, unknown>;
        const draws = spy.mock.calls.length;
        spy.mockRestore();
        return { s, draws };
      };
      const on = build(false);
      const off = build(true);
      expect('radar' in on.s).toBe(true);
      expect('radar' in off.s).toBe(false);
      const { radar: _r, ...rest } = on.s;
      expect(JSON.stringify(rest)).toBe(JSON.stringify(off.s));
      expect([on.draws, off.draws]).toEqual([10, 10]);
    });
  }
});
