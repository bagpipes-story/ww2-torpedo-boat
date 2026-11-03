// 味方の駆逐艦 卯月の世界側の配線（v0.6.10 S5a。systems/world-ally・entities/ally-destroyer・assets/ally-destroyer-placeholder・Boot・world-visuals。spec-v0610 R-U6・LD15）のソースの pin。
// 動き（世界と模擬が同じ）は scripts/headless/world-vs-sim の G7 で確かめる（CHANGELOG）。ここは Phaser を読まずに、作る所・乱数・順・§7（毎フレーム確保しない・setText・Graphics.clear なし）を見る。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const raw = (p: string): string => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
const code = (p: string): string => raw(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
/** クラスのメソッドの本体（次のメソッドの頭まで） */
const method = (src: string, head: string): string => {
  const i = src.indexOf(head);
  expect(i, head).toBeGreaterThanOrEqual(0);
  const rest = src.slice(i + head.length);
  const j = rest.search(/\n {2}(?:private |readonly |get |destroy\(|[a-zA-Z]+\()/);
  return j < 0 ? rest : rest.slice(0, j);
};

describe('systems/world-ally', () => {
  const s = code('systems/world-ally.ts');
  it('見張り seed+27・砲 seed+28 の SeededRng をここで 1 本ずつ作り、core の createAllyDestroyer に自分（AllyFx）を渡す', () => {
    expect(s.split('new SeededRng(').length).toBe(3);
    expect(s).toContain('new SeededRng((seed + ALLY_LOOKOUT_SEED_OFFSET) >>> 0)');
    expect(s).toContain('new SeededRng((seed + ALLY_GUN_SEED_OFFSET) >>> 0)');
    expect(s).toContain('this.a = createAllyDestroyer(p, pts.p, this.rng27, this.rng28, this);');
  });
  it('buildAlly: 卯月の無い setup（jp_04 以外・?debug&noally）・揚陸の無い任務・米PT の隊の無い世界は null（乱数も絵も作らない）', () => {
    const fn = s.slice(s.indexOf('export function buildAlly'));
    expect(fn).toMatch(/const p = s\.allyDestroyer;\s*if \(!p \|\| !s\.landing \|\| !pts\) return null;\s*return new WorldAlly\(scene, p, pts, seed,/);
  });
  it('hitPt の知らせは何もしない（jp_04 の 25mm の隊の知らせと模擬の ev と同じ）。外から去らせた PT の知らせは無い（v0.6.10 実機 1 回目: 照らされても去らない）', () => {
    expect(s).toMatch(/const NO_PT_EVENTS: PtEvents = \{ onContact: \(\) => \{\}, onLeave: \(\) => \{\}, onOut: \(\) => \{\}, onPassEnd: \(\) => \{\}, onFire: \(\) => \{\}, onCommit: \(\) => \{\}, onImpact: \(\) => \{\} \};/);
    expect(s).not.toContain('NO_LEAVE');
  });
  it('演出（AllyFx）は絵の閃光と水柱と結末の絵（v0.6.10 S5b。隊の fateVisual）だけ（乱数・状態に触らない）', () => {
    expect(method(s, '  onFire(')).toMatch(/^[^;]*\{\s*this\.view\.fired\(x, y\);\s*\}\s*$/);
    expect(method(s, '  onImpact(')).toMatch(/^[^;]*\{\s*this\.view\.impact\(x, y, hit\);\s*\}\s*$/);
    expect(method(s, '  onFate(')).toMatch(/^[^;]*\{\s*this\.pts\.fateVisual\(i, fate\);\s*\}\s*$/);
  });
});

describe('world-landing と world-visuals の配線', () => {
  it('buildLanding は卯月の世界を 1 回組み、WorldLanding に渡す（輸送船の字と同じ HUD の矩形）', () => {
    const s = code('systems/world-landing.ts');
    const fn = s.slice(s.indexOf('export function buildLanding'));
    expect(fn.split('buildAlly(').length).toBe(2);
    expect(fn).toContain('landingCaretRects(k), buildAlly(scene, s, pts, seed, hud));');
    expect(s).not.toMatch(/ALLY_(?:LOOKOUT|GUN)_SEED_OFFSET/);
  });
});

describe('entities/ally-destroyer（§7）', () => {
  const s = code('entities/ally-destroyer.ts');
  for (const head of ['  update(realDt: number', '  private updateBeam(', '  private placeLabel(', '  fired(', '  impact(']) {
    it(`${head.trim()} は確保しない・setText しない・Graphics を描き直さない`, () => {
      const m = method(s, head);
      for (const bad of ['new ', '.setText(', '.clear(', '.map(', '.filter(', '=> ', '[]']) expect(m, `${head}: ${bad}`).not.toContain(bad);
    });
  }
  it('絵は組み立てで 1 回: 艦・ラベル・扇・探照灯・閃光・砲弾のプール（卯月の砲弾のプールと同じ数）・水柱のプール。扇と探照灯の絵は Boot のテクスチャ', () => {
    const c = method(s, '  constructor(');
    expect(c).toContain('TEXTURE_KEYS.allyFan');
    expect(c).toContain('TEXTURE_KEYS.destroyerFriendly');
    expect(c).toContain('TEXTURE_KEYS.searchlight');
    expect(c).toContain('for (let i = 0; i < p.shellPoolSize; i++) this.shells.push(');
    expect(c).toContain('new SplashPool(scene, ALLY_SPLASH_POOL_SIZE');
    expect(s).not.toMatch(/scene\.add\.graphics|make\.graphics/);
  });
});

describe('Boot と絵', () => {
  it('Boot は卯月の検査の後に艦と扇のテクスチャを 1 回だけ作る（扇の形は entities と同じ allyFanFor）', () => {
    const b = raw('scenes/boot-scene.ts'); // 頭の注の「data/*.json」が code() の /* … */ の除き方で本文を食うので生のまま
    const i = b.indexOf('validateAllyDestroyerMissions(gameData');
    const j = b.indexOf('generateAllyDestroyerTextures(this,');
    expect(i).toBeGreaterThan(0);
    expect(j).toBeGreaterThan(i);
    expect(b.split('generateAllyDestroyerTextures(').length).toBe(2);
    expect(b.slice(j, b.indexOf('\n', j))).toContain('allyFanFor(ally, allyMission.coast !== null, allyMission.bounds.height)');
    expect(code('entities/ally-destroyer.ts')).toContain('allyFanFor(p, hasCoast, boundsHeight)');
  });
  it('テクスチャの鍵は新しい 2 つ（味方の駆逐艦・扇）で、ほかの鍵と重ならない', () => {
    const g = code('config/game-config.ts');
    const block = g.slice(g.indexOf('export const TEXTURE_KEYS = {'), g.indexOf('} as const;', g.indexOf('export const TEXTURE_KEYS = {')));
    const vals = [...block.matchAll(/:\s*'([^']+)'/g)].map((m) => m[1]);
    expect(vals).toContain('tex-destroyer-friendly');
    expect(vals).toContain('tex-ally-fan');
    expect(new Set(vals).size).toBe(vals.length);
  });
});
