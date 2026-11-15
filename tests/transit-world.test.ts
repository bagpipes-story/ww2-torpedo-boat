// v0.8.0 S2（spec-v0800 §4.4・§4.5・§6 の S2・§8 R2、brief L10・L11）: 列の通過の世界の配線（systems/destroyer-transit・destroyer-group・destroyer-step・entities/destroyer）を
// Phaser なしの小さな世界（tests/transit-world-kit。mission-world の固定ステップの順）で回す:
// - 往路・ビラ・復路・去るの時刻と道（入りの秒・8 秒おき・縁の x・揚陸 40 秒・復路の道と針路）。護衛は復路の最初の艦が現れたステップに西へ退き、縁の外で退いた（今の作り）。
// - 海域の外の列の艦（まだ来ない・ビラ・去った）は out。退いた（withdrawn）は去った艦だけ（ビラ・まだ来ないは退いた・撃沈のどちらでもない）。
// - R2: 列がビラにいる間は allOut・allSettled が偽（走っている魚雷を外れで確定する core の式は真になるので destroyer-step が戻りの残りで止める）。最後の艦が去ったら真。
// - 夜明けの後はビラの艦は戻らず、まだ来ない艦は入らない（戻りの残り 0）＝海域の中の艦が出れば allOut。
// - L11: 往路の間の命中スローで復路の現れる順・道・針路が変わらない（往路の間隔 m も変わらない）。
// - 配線の文（destroyer-step の順と戻りの残りの門・隊の allOut の枝・world-enemies の砲の添字・Destroyer の goAway・reappear と kit の写し）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { remainingTorpedoesSettled, type TorpedoTarget } from '../src/core/torpedo-targets';
import { TRANSIT_AWAY, TRANSIT_GONE, TRANSIT_IN, TRANSIT_OUT, TRANSIT_WAIT } from '../src/core/ship-transit';
import { kitStep, kitWorld, phases, type KitWorld } from './transit-world-kit';

const code = (p: string): string => readFileSync(`src/${p}`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

interface Ev { t: number; i: number; from: number; to: number; x: number; y: number; h: number }

/** until 秒まで回し、列の艦の段階が変わるたびに記録（slowFrom〜slowTo の実秒は命中スロー） */
function run(w: KitWorld, until: number, slowFrom = Infinity, slowTo = -Infinity): Ev[] {
  const ev: Ev[] = [];
  const prev = Array.from(w.transit.state.phase);
  while (w.stepTimeS < until) {
    kitStep(w, w.stepTimeS >= slowFrom && w.stepTimeS < slowTo);
    const ph = w.transit.state.phase;
    for (let i = 0; i < w.transit.state.ships; i++) {
      if (ph[i] === prev[i]) continue;
      const s = w.transit.column[i]!.state as { x: number; y: number; headingDeg: number };
      ev.push({ t: w.stepTimeS, i, from: prev[i]!, to: ph[i]!, x: s.x, y: s.y, h: s.headingDeg });
      prev[i] = ph[i]!;
    }
  }
  return ev;
}

describe('列の通過の時刻と道（ノーマル・揺らぎなし）', () => {
  const w = kitWorld();
  const tr = w.setup.transit!;
  const ev = run(w, 250);
  const at = (i: number, to: number): Ev => ev.find((e) => e.i === i && e.to === to)!;
  it('入りは体感の時計で enter_s ＋ 8 秒 × i、現れる点は西の縁の内 150 m・往路の道・090°（作った時はまだ来ない＝海域の外）', () => {
    expect([tr.ships, tr.enterS, tr.spacingS, tr.inbound.appearX, tr.inbound.laneY, tr.outbound.appearX, tr.outbound.laneY]).toEqual([3, 18, 8, 150, 1500, 5850, 2300]);
    for (let i = 0; i < 3; i++) {
      const e = at(i, TRANSIT_IN);
      expect(e.t).toBeGreaterThanOrEqual(tr.enterS + tr.spacingS * i - 1e-6);
      expect(e.t).toBeLessThan(tr.enterS + tr.spacingS * i + 1 / 60 + 1e-6);
      expect([e.x, e.y, e.h]).toEqual([150, 1500, 90]);
    }
  });
  it('東の縁の外 150 m を越えたステップにビラ（AWAY）、そこから揚陸 40 秒（固定ステップの時計）で東の縁の内 150 m・復路の道・270° に現れ、西の縁の外 150 m で去る', () => {
    for (let i = 0; i < 3; i++) {
      const a = at(i, TRANSIT_AWAY);
      const o = at(i, TRANSIT_OUT);
      const g = at(i, TRANSIT_GONE);
      expect(a.x).toBeGreaterThanOrEqual(tr.inbound.goneX);
      expect(a.x - tr.inbound.goneX).toBeLessThan(tr.speedMps * w.setup.timeScale / 60 + 1e-6);
      expect(o.t - a.t).toBeGreaterThanOrEqual(tr.unloadS - 1e-6);
      expect(o.t - a.t).toBeLessThan(tr.unloadS + 1 / 60 + 1e-6);
      expect([o.x, o.y, o.h]).toEqual([5850, 2300, 270]);
      expect(g.x).toBeLessThanOrEqual(tr.outbound.goneX);
      // 渡りの秒（道の端から端＝海域の幅）は crossS（30 kt・time_scale 込み）に 1 ステップの内で合う（加速なし＝現れた時から列の速さ）
      expect(Math.abs(a.t - at(i, TRANSIT_IN).t - tr.crossS)).toBeLessThan(2 / 60);
      expect(Math.abs(g.t - o.t - tr.crossS)).toBeLessThan(2 / 60);
    }
    expect(ev.map((e) => `${e.i}${e.to}`)).toEqual(['01', '11', '21', '02', '12', '22', '03', '13', '23', '04', '14', '24']);
    expect(phases(w)).toBe('444');
  });
  it('護衛は復路の最初の艦が現れたステップに西（復路の針路 270°）へ退き始め、西の縁の外 118 m で退いた（今の縁の外の退き終わり）。列の艦は退いた（去った）3 隻', () => {
    const cover = w.ships[0]!;
    expect(cover.ai.retiring).toBe(true);
    expect(cover.ai.retireHeadingDeg).toBe(270);
    expect(cover.withdrawn).toBe(true);
    expect(cover.transitShip).toBe(false);
    expect(w.transit.column.every((s) => s.withdrawn && !s.offMap && !s.sinking && s.transitShip)).toBe(true);
    expect([w.transit.allOut, w.transit.allSettled, w.transit.pending]).toEqual([true, true, 0]);
  });
  it('海域の外の列の艦は out（まだ来ない・ビラ）で、退いた・撃沈のどちらにも数えない。海域の中（往路・復路）の艦だけ out でない', () => {
    const v = kitWorld();
    const seen = new Set<string>();
    while (v.stepTimeS < 250) {
      kitStep(v);
      v.transit.column.forEach((s, i) => {
        const ph = v.transit.state.phase[i]!;
        const onMap = ph === TRANSIT_IN || ph === TRANSIT_OUT;
        expect(s.out, `${ph}`).toBe(!onMap);
        expect(s.withdrawn, `${ph}`).toBe(ph === TRANSIT_GONE);
        expect(s.offMap, `${ph}`).toBe(ph === TRANSIT_WAIT || ph === TRANSIT_AWAY);
        expect(s.sinking).toBe(false);
        seen.add(String(ph));
      });
    }
    expect([...seen].sort()).toEqual(['0', '1', '2', '3', '4']);
  });
});

describe('R2: 列がビラにいる間は「すべて出た」にしない（tests/transit-world の要＝spec §6 の S2）', () => {
  it('護衛が沈み、列の 3 隻がみなビラにいる間: core の「走っている魚雷を外れで確定してよい」は真になるが、戻りの残りが 3 なので allOut・allSettled は偽。最後の艦が去ったら真', () => {
    const w = kitWorld();
    const cover = w.ships[0]!;
    cover.sinking = true; // 沈み始めて演出も終わった（魚雷の当たりの窓も閉じた＝下の写しの sinkStartS 0）
    cover.sunk = true;
    while (phases(w) !== '222') kitStep(w);
    const targets = w.ships.map((s) => ({ circles: [], state: s.state, out: s.out, sinking: s.sinking, sunk: s.sunk, sinkStartS: 0 })) as TorpedoTarget[];
    expect(remainingTorpedoesSettled(targets, w.stepTimeS, 5)).toBe(true); // 隊の艦はみな out（海域の外）＝門が無ければ外れにしてしまう
    expect([w.transit.pending, w.transit.allOut, w.transit.allSettled]).toEqual([3, false, false]);
    let leftAllOut = 0;
    while (w.stepTimeS < 250) if (kitStep(w) && w.transit.allOut) leftAllOut++;
    expect(phases(w)).toBe('444');
    expect([w.transit.pending, w.transit.allOut, w.transit.allSettled, leftAllOut]).toEqual([0, true, true, 1]); // 最後の艦が去ったステップに 1 回だけ（一斉発射を捨てる）
  });
  it('destroyer-step: 艦の段 → 列の段階（艦が出たら left）→ 一斉発射の破棄 → 戻りの残りが 0 の時だけ外れの確定 → 魚雷。隊の allOut・allSettled は列の通過があればその式', () => {
    const s = code('systems/destroyer-step.ts');
    const order = ['for (const d of g.ships) if (d.step(', 'if (g.transit?.step(w, feelDt)) left = true;', 'if (left && g.allOut) w.launcher.clearQueue();', 'if (g.pendingReturns === 0 && remainingTorpedoesSettled(g.ships, w.stepTimeS, settleS)) w.resolveRemainingAsMisses();', 'w.torpedoes.step('];
    const idx = order.map((p) => s.indexOf(p));
    expect(idx.every((i, k) => i >= 0 && (k === 0 || i > idx[k - 1]!)), idx.join(' ')).toBe(true);
    const g = code('systems/destroyer-group.ts');
    expect(g).toContain('return this.transit ? this.transit.allOut : allShipsOut(this.ships);');
    expect(g).toContain('return this.transit ? this.transit.allSettled : allShipsSettled(this.ships);');
    expect(g).toContain('return this.transit ? this.transit.pending : 0;');
    expect(g).toContain('this.transit = transit ? new DestroyerTransit(this.ships, ds.starts.length, transit) : null;');
    // 列の艦の砲は護衛と同じ（駆逐艦の添字は隊の destroyerCount。列の無い任務は ds.starts の隻数と同じ）
    const we = code('systems/world-enemies.ts');
    expect(we.split('i < destroyers.destroyerCount ? ds!.gunnery : s.transport!.gunnery').length - 1).toBe(2);
    expect(we).not.toContain('ds!.starts.length');
  });
});

describe('夜明け（列の途中で夜明け。ビラの艦は戻らない・まだ来ない艦は入らない）', () => {
  it('1 隻目がビラ・2 隻目と 3 隻目が往路の時に夜明け: ビラの艦は戻らず（退いた・撃沈に数えない）、往路の 2 隻は西へ退くか東へ抜けて出る。戻りの残りは 0、海域の中が空になれば allOut', () => {
    const w = kitWorld({ dawnS: 100 });
    while (!w.dawn.reached) kitStep(w);
    expect(phases(w)).toBe('211');
    expect(w.transit.pending).toBe(0);
    while (w.stepTimeS < 260) kitStep(w);
    const ph = phases(w);
    expect(ph[0]).toBe(String(TRANSIT_AWAY));
    for (const c of ph.slice(1)) expect([String(TRANSIT_AWAY), String(TRANSIT_GONE)]).toContain(c);
    expect(w.transit.column[0]!.withdrawn).toBe(false);
    expect(w.transit.state.outCount).toBe(0);
    expect(w.ships[0]!.withdrawn).toBe(true); // 護衛は夜明けに西へ退いた
    expect([w.transit.allOut, w.transit.allSettled]).toEqual([true, true]);
  });
  it('夜明けが列の入りの前: 誰も入らず、護衛が退けば allOut', () => {
    const w = kitWorld({ dawnS: 5 });
    while (w.stepTimeS < 200) kitStep(w);
    expect([phases(w), w.transit.state.inCount, w.transit.pending, w.transit.allOut]).toEqual(['000', 0, 0, true]);
  });
});

describe('L11: 往路の間の命中スローで復路の現れる順・道は変わらない', () => {
  for (const [hard, seed] of [[false, undefined], [false, 1], [true, 2]] as const) {
    it(`${hard ? 'ハード' : 'ノーマル'} seed ${seed ?? 'なし'}: スロー（往路の全艦が海域の中の 3 実秒）の有無で、ビラに着く順・復路に現れる順・現れる点と針路・往路の間隔 m が同じ（時刻だけ遅れる）`, () => {
      const a = kitWorld({ hard, seed });
      const b = kitWorld({ hard, seed });
      const tr = a.setup.transit!;
      const allIn = tr.enterS + tr.spacingS * (tr.ships - 1) + 1;
      const ea = run(a, 260);
      const eb = run(b, 260, allIn, allIn + 3);
      const order = (e: Ev[], to: number): number[] => e.filter((x) => x.to === to).map((x) => x.i);
      for (const to of [TRANSIT_IN, TRANSIT_AWAY, TRANSIT_OUT, TRANSIT_GONE]) expect(order(eb, to), String(to)).toEqual(order(ea, to));
      expect(order(ea, TRANSIT_OUT)).toEqual(Array.from({ length: tr.ships }, (_, i) => i));
      const outs = (e: Ev[]): number[][] => e.filter((x) => x.to === TRANSIT_OUT).map((x) => [x.x, x.y, x.h]);
      expect(outs(eb)).toEqual(outs(ea));
      expect(outs(ea).every(([x, y, h]) => x === tr.outbound.appearX && y === tr.outbound.laneY && h === tr.outbound.headingDeg)).toBe(true);
      // スローの分だけ遅れる（ビラに着くのは位置＝スローで遅れた分だけ後）
      const firstAway = (e: Ev[]): number => e.find((x) => x.to === TRANSIT_AWAY)!.t;
      expect(firstAway(eb)).toBeGreaterThan(firstAway(ea) + 1.5);
      // 往路の間隔 m: スローの前後とも列の速さ × 間隔の秒（8 秒 × 77 m/秒 ≈ 617 m）の内で同じ
      const gapAt = (w: KitWorld): number => w.transit.column[0]!.state.x - w.transit.column[1]!.state.x;
      const c = kitWorld({ hard, seed });
      const d = kitWorld({ hard, seed });
      run(c, allIn + 10);
      run(d, allIn + 10, allIn, allIn + 3);
      const want = tr.speedMps * c.setup.timeScale * tr.spacingS;
      expect(Math.abs(gapAt(c) - want)).toBeLessThan(tr.speedMps * c.setup.timeScale / 60 + 1e-6);
      expect(Math.abs(gapAt(d) - want)).toBeLessThan(tr.speedMps * c.setup.timeScale / 60 + 1e-6);
    });
  }
});

describe('Destroyer の列の通過の口（kit はその写し）', () => {
  const d = code('entities/destroyer.ts');
  const body = (name: string): string => {
    const i = d.indexOf(`  ${name}(`);
    const open = d.indexOf('{', i);
    let depth = 1;
    let j = open + 1;
    for (; depth > 0; j++) depth += d[j] === '{' ? 1 : d[j] === '}' ? -1 : 0;
    return d.slice(open + 1, j - 1).split('\n').map((l) => l.trim()).filter((l) => l !== '').join(' ');
  };
  it('out に offMap を入れ、列の艦は縁の外の退き終わりを自分で立てない。goAway は海域の外へ（去ったなら withdrawn）＋絵を隠す＋発見と雷跡の覚えを解く、reappear は置き直して海域の中へ', () => {
    expect(d).toContain('return this.sinking || this.withdrawn || this.offMap;');
    expect(d).toContain('else if (!this.transitShip && beyondBounds(this.state.x, this.state.y, this.bounds, this.spec.boundsMarginM)) {');
    expect(body('goAway')).toBe('if (gone) this.withdrawn = true; else this.offMap = true; this.sprite.setVisible(false); this.sighted = false; const ai = this.ai; ai.playerDetected = false; ai.detectHoldLeftS = 0; ai.wakeSpotted = false; ai.wakeSeenForS = -1;');
    expect(body('reappear')).toBe('const s = this.state; s.x = x; s.y = y; s.headingDeg = headingDeg; s.speedMps = speedMps; this.offMap = false; this.refreshHull();');
    const k = readFileSync('tests/transit-world-kit.ts', 'utf8');
    expect(k).toContain('if (gone) this.withdrawn = true;\n    else this.offMap = true;\n    const ai = this.ai;\n    ai.playerDetected = false;\n    ai.detectHoldLeftS = 0;\n    ai.wakeSpotted = false;\n    ai.wakeSeenForS = -1;');
    expect(k).toContain('else if (!this.transitShip && beyondBounds(this.state.x, this.state.y, bounds, this.marginM)) {');
  });
});
