// 卯月の手柄の分けと結末の絵の口（v0.6.10 S5b。spec-v0610 part 2・リードの決定 LD8）: core/ally-destroyer の AllyFx.onFate（見せるだけ）、systems/pt-squadron の setAlly・fateVisual・
// 照らされた印、systems/world-ally の配線、systems/pt-telemetry の「命中 計 N」（卯月の分を引く）と ptResult（頭の行・得点の撃退・撃沈は隼艇と同じく隊の数＝卯月が沈めた PT も得点に入る）。
// 規則は卯月の台（tests/ally-kit）で回し、Phaser の組み立ては動かさずにソースで見る（tests/gunboat-credit・world-ally と同じ作法）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PT_FATE_CREW, PT_FATE_HULL, PT_FATE_NONE, PT_FATE_SUNK, PT_PASS, PT_RUN_IN, createPtTelemetry } from '../src/core/pt-boats';
import { hitPt } from '../src/core/pt-damage';
import { FATE_BY_ALLY, FATE_BY_PLAYER, createGunboatCredit, gunboatFates } from '../src/systems/gunboat-credit';
import { ptResult, refreshPtTelemetry, type PtTelemetryWorld } from '../src/systems/pt-telemetry';
import { allyBench, atAlly, EXACT, FixedRng, stepAlly, stepUntil, type AllyBench } from './ally-kit';
import { P, S0 } from './landing-kit';

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

/** 卯月の東寄り（方位 95°）に止まった航過の PT を気づいた PT として置く（owner なら撃退されても航過のまま抜ける＝まだ当たる。ほかは撃退で去る） */
function passing(b: AllyBench, distM: number, owner: boolean): void {
  atAlly(b, 0, distM, 95, 0, 0, PT_PASS);
  b.a.spotted[0] = 1;
  if (owner) b.q.owner = 0;
}

/** 結末の知らせを呼ばれた時の手柄と一緒に記録する（fateBy は呼ぶ前に書いた＝LD8） */
function recordFates(b: AllyBench): [number, number, number][] {
  const seen: [number, number, number][] = [];
  b.fx.onFate = (i: number, fate: number): void => {
    seen.push([i, fate, b.a.credit.fateBy[i]!]);
  };
  return seen;
}

function teleWorld(b: AllyBench, ally: boolean): PtTelemetryWorld {
  return {
    pts: { section: b.q, p: P, firstDetectBand: '', enemyId: 'us_pt_enemy', gun: null, targets: null, gunboat: null, ally: ally ? b.a : null },
    boat: { state: { ...S0.playerStart, speedMps: 0 } }, params: S0.boatParams, visRange2: S0.visRange2, damageParams: S0.damageParams,
  };
}

describe('AllyFx.onFate（見せるだけの結末の口。LD8）', () => {
  it.each([[0.05, PT_FATE_SUNK], [0.11, PT_FATE_CREW], [0.5, PT_FATE_HULL]] as const)('12 cm の 1 命中（u = %f）で結末 %i に変わった時だけ 1 回。呼ぶ時には手柄の fateBy は FATE_BY_ALLY', (u, fate) => {
    const b = allyBench({ p: EXACT, rng28: new FixedRng(u) });
    const seen = recordFates(b);
    passing(b, 1300, false); // 25 mm の有効射程の外: 12 cm だけ
    expect(stepUntil(b, () => b.a.liveHits === 1)).toBeGreaterThan(0);
    expect(seen).toEqual([[0, fate, FATE_BY_ALLY]]);
    stepAlly(b, 120); // 沈んだ PT・去る PT には当たらない（知らせは増えない）
    expect(seen.length).toBe(1);
  });
  it('結末の変わらない命中（25 mm の u 0.05 は結末なし）では呼ばない。その後の 12 cm の撃沈で 1 回', () => {
    const b = allyBench({ p: EXACT, rng28: new FixedRng(0.05) });
    const seen = recordFates(b);
    passing(b, 600, true);
    stepUntil(b, () => b.a.liveHits === 1);
    expect([b.q.boats[0]!.fate, seen]).toEqual([PT_FATE_NONE, []]);
    stepUntil(b, () => b.q.boats[0]!.fate !== PT_FATE_NONE);
    expect(seen).toEqual([[0, PT_FATE_SUNK, FATE_BY_ALLY]]);
  });
  it('演出の有無で状態も乱数も変わらない（模擬は null。見せるだけ）', () => {
    const run = (fx: boolean): string => {
      const b = allyBench({ p: EXACT, fx });
      passing(b, 600, true);
      stepAlly(b, 900);
      return JSON.stringify([b.q.boats, b.q.gunHits, b.q.gunEventSeq, b.a.credit.hits, Array.from(b.a.credit.fateBy), b.a.shells, b.a.liveHits, b.rng28.draws, b.rng27.draws]);
    };
    expect(run(false)).toBe(run(true));
  });
});

describe('手柄（卯月は core だけが書く。PtSquadron.onFate は卯月の手柄に書かない＝模擬 core/landing-trial の allyFate と同じ数え）', () => {
  it('卯月が撃退した航過の PT を自艇の 25mm が沈めても卯月の手柄のまま（自艇の撃沈 0・卯月の撃沈 1）。結末の絵の知らせは卯月の命中の 1 回だけ', () => {
    const b = allyBench({ p: EXACT, rng28: new FixedRng(0.5) });
    const seen = recordFates(b);
    passing(b, 1300, true);
    stepUntil(b, () => b.a.liveHits === 1);
    const boat = b.q.boats[0]!;
    expect([boat.fate, boat.phase, b.a.credit.fateBy[0]]).toEqual([PT_FATE_HULL, PT_PASS, FATE_BY_ALLY]);
    expect(hitPt(b.q, P, 0, 4, P.fireChance / 2, b.ev)).toBe(PT_FATE_SUNK); // 自艇の 25mm（PtGun → PtSquadron.onFate。jp_04 は隼艇が無いので fateBy を書く先が無い）
    const r = ptResult(teleWorld(b, true))!;
    const ally = gunboatFates(b.q, b.a.credit, FATE_BY_ALLY);
    expect([r.retired, r.sunk, ally.retired, ally.sunk, r.sunk - ally.sunk]).toEqual([0, 1, 0, 1, 0]);
    expect(seen).toEqual([[0, PT_FATE_HULL, FATE_BY_ALLY]]);
  });
  it('自艇が撃退した PT を卯月が沈めれば卯月の撃沈（最後に結末を決めた砲）。自艇の分 = 隊の数 − 卯月の分', () => {
    const b = allyBench({ p: EXACT, rng28: new FixedRng(0.05) });
    passing(b, 1300, true);
    expect(hitPt(b.q, P, 0, 4, 0.02, b.ev)).toBe(PT_FATE_CREW);
    stepUntil(b, () => b.a.liveHits === 1);
    const r = ptResult(teleWorld(b, true))!;
    expect([r.retired, r.sunk, gunboatFates(b.q, b.a.credit, FATE_BY_ALLY)]).toEqual([0, 1, { retired: 0, sunk: 1 }]);
    expect(b.a.credit.fateBy[0]).not.toBe(FATE_BY_PLAYER);
  });
  it('得点の撃沈（Result の computeScore の kills = ptResult の sunk）は隼艇と同じく隊の数: 卯月が沈めた PT も入る', () => {
    const b = allyBench({ p: EXACT, rng28: new FixedRng(0.05) });
    passing(b, 1300, false);
    stepUntil(b, () => b.a.sunk === 1);
    expect([ptResult(teleWorld(b, true))!.sunk, ptResult(teleWorld(b, false))!.sunk, b.q.sunk]).toEqual([1, 1, 1]);
    const rs = code('scenes/result-scene.ts');
    expect(rs).toContain('kills: h ? h.sunk : r.pt ? r.pt.sunk :');
  });
});

describe('HUD の「命中 計 N」（PtTelemetry.gunHits）', () => {
  it('卯月の命中を引いた自艇の分。卯月の無い任務・&noally（ally なし）は隊の数のまま', () => {
    const b = allyBench({ p: EXACT });
    passing(b, 600, true);
    expect(stepUntil(b, () => b.a.liveHits === 3)).toBeGreaterThan(0);
    b.q.boats[1]!.phase = PT_RUN_IN; // 自艇の 25mm の 2 発は別の PT へ（結末なし）
    hitPt(b.q, P, 1, 4, 0.999, b.ev);
    hitPt(b.q, P, 1, 4, 0.999, b.ev);
    const t = createPtTelemetry();
    refreshPtTelemetry(t, teleWorld(b, true));
    expect([t.gunHits, b.q.gunHits, b.a.credit.hits]).toEqual([2, 5, 3]);
    refreshPtTelemetry(t, teleWorld(b, false));
    expect(t.gunHits).toBe(5);
    expect(t.gunEventByGunboat).toBe(false); // 卯月の砲の出来事は隼艇の砲ではない（名は S6）
    const w = teleWorld(b, true);
    const gb = createGunboatCredit(P.count);
    gb.hits = 1;
    refreshPtTelemetry(t, { ...w, pts: { ...w.pts!, gunboat: { credit: gb } } }); // 両方あっても両方引く（今の任務には無い組み合わせ）
    expect(t.gunHits).toBe(1);
  });
});

describe('配線（ソース）', () => {
  const sq = code('systems/pt-squadron.ts');
  it('PtSquadron.onFate: 隼艇の手柄 → 沈んだら標的スロットの数えを閉じる → fateVisual。卯月の手柄（ally）には書かない', () => {
    const body = method(sq, '  private onFate(i: number, fate: number, by: number): void {');
    expect(body).toMatch(/^\s*if \(this\.gunboat\) this\.gunboat\.credit\.fateBy\[i\] = by;\s*if \(fate === PT_FATE_SUNK\) this\.targets\?\.dropAttack\(i, this\.section\.lastPassFired\);\s*this\.fateVisual\(i, fate\);\s*\}\s*$/);
  });
  it('fateVisual は見せるだけ（手柄・標的スロット・乱数に触らない）: 撃退は灰色、撃沈は沈み込みの tween と世界の onSunk', () => {
    const body = method(sq, '  fateVisual(i: number, fate: number): void {');
    for (const bad of ['fateBy', 'credit', 'this.targets', 'rng', 'section.boats[i]!.fate', 'new ']) expect(body, bad).not.toContain(bad);
    expect(body).toContain('img.setTint(PT_RETIRED_TINT);');
    expect(body).toContain('this.scene.tweens.add(');
    expect(body).toContain('this.onSunk(b.x, b.y);');
  });
  it('卯月の印と手柄は setAlly だけが書く（1 回）。毎フレームの PT の表示は視程の内か照らされている間（lit）', () => {
    expect(sq.split('this.ally =').length).toBe(2);
    expect(method(sq, '  setAlly(')).toMatch(/\): void \{\s*this\.ally = a;\s*\}\s*$/);
    const uv = method(sq, '  updateVisuals(realDt: number, visRange2: number): void {');
    expect(uv).toContain('const lit = this.ally ? this.ally.lit : null;');
    expect(uv).toContain('<= visRange2 || (lit !== null && lit[i] === 1));');
  });
  it('world-ally: 組み立てで setAlly を 1 回（core の AllyDestroyer をそのまま）、AllyFx.onFate は隊の fateVisual だけ。core は fateBy を書いてから onFate', () => {
    const wa = code('systems/world-ally.ts');
    expect(wa.split('setAlly(').length).toBe(3); // AllyPts の型と組み立ての呼び 1 回
    expect(method(wa, '  constructor(')).toContain('this.a = createAllyDestroyer(p, pts.p, this.rng27, this.rng28, this);\n    pts.setAlly(this.a);');
    expect(method(wa, '  onFate(')).toMatch(/^[^;]*\{\s*this\.pts\.fateVisual\(i, fate\);\s*\}\s*$/);
    const core = code('core/ally-destroyer.ts');
    const hit = core.slice(core.indexOf('private hitLive('), core.indexOf('export function createAllyDestroyer'));
    expect(hit.indexOf('cr.fateBy[t] = FATE_BY_ALLY;')).toBeGreaterThan(0);
    expect(hit.indexOf('if (this.fx) this.fx.onFate(t, b.fate);')).toBeGreaterThan(hit.indexOf('cr.fateBy[t] = FATE_BY_ALLY;'));
    expect(core.split('.onFate(').length).toBe(2);
  });
  it('FATE_BY_ALLY を書くのは core/ally-destroyer だけ（src のどこも = FATE_BY_ALLY を持たない）', () => {
    const files = ['systems/pt-squadron.ts', 'systems/world-ally.ts', 'systems/pt-telemetry.ts', 'systems/gunboat.ts', 'systems/gunboat-credit.ts', 'core/ally-destroyer.ts', 'core/landing-sim.ts', 'core/landing-trial.ts'];
    for (const f of files) expect(code(f).match(/[^=!<>]= FATE_BY_ALLY/g)?.length ?? 0, f).toBe(f === 'core/ally-destroyer.ts' ? 1 : 0);
  });
});
