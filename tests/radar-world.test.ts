// v0.8.0 S2（spec-v0800 §3.2 の D-R2〜D-R7・§4.5・§5.2・§6 の S2「tests/radar-world」）: レーダーの世界の配線（systems/world-radar）を Phaser なしの素の値で確かめる:
// - 順: 敵の側の段の最後（world-enemy-step の最後の行）・mission-world は論理の後・絵の前に 1 つ作るだけ（固定ステップからは直接呼ばない）・見た目は world-visuals（世界の絵の前）。
// - 掃引の時刻: 固定ステップの時計で最初のステップと、以後 sweep_s（3 秒）の倍数を越えた最初のステップ。間は輝点が動かない。
// - 輝点: 掃引ごとに、海域の中の艦（out でない）のうち射程 4,000 m の内・陸から 400 m の外を 50 m に丸めた位置（隠れた列の艦・沈み始めた艦は映らない）。
// - spec §4.5 の流れ: 出撃してすぐ護衛（北西 2,280 m）が輝点に・列が西から入ると接触が増え・ビラへ抜けると減り・復路に現れるとまた増える。テレメトリは数をそのまま写す。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { landDist2, landLinesFromShores } from '../src/core/strait-geometry';
import { initRadarTelemetry, refreshRadarTelemetry } from '../src/systems/radar-telemetry';
import { kitStep, kitWorld, phases, type KitWorld } from './transit-world-kit';

const code = (p: string): string => readFileSync(`src/${p}`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const lines = (s: string): string[] => s.split('\n').map((l) => l.trim()).filter((l) => l !== '');

/** 掃引の時の輝点を別に計算する（射程・陸の反射・丸め・同じ格子は 1 つ・近い順） */
function expectBlips(w: KitWorld): number[][] {
  const p = w.setup.radar!;
  const { width, height } = w.setup.mission.bounds;
  const land = landLinesFromShores(w.setup.shores!, width, height);
  const b = w.boat.state;
  const out: number[][] = [];
  for (const d of w.ships) {
    const { x, y } = d.state;
    if (d.out || x < 0 || y < 0 || x > width || y > height) continue;
    if ((x - b.x) ** 2 + (y - b.y) ** 2 > p.shipRange2) continue;
    if (landDist2(land, x, y) < p.landClutterM ** 2) continue;
    const q = [Math.round(x / p.positionStepM) * p.positionStepM, Math.round(y / p.positionStepM) * p.positionStepM];
    if (!out.some((o) => o[0] === q[0] && o[1] === q[1])) out.push(q);
  }
  return out.sort((a, c) => (a[0]! - b.x) ** 2 + (a[1]! - b.y) ** 2 - ((c[0]! - b.x) ** 2 + (c[1]! - b.y) ** 2));
}

describe('レーダーの段の順と作る所（ソース）', () => {
  it('world-enemy-step の最後の行が w.radar?.step(w)（対空の後）。mission-world は buildRadar を退避の後・世界の絵の前に 1 回、stepFn からは呼ばない', () => {
    const e = lines(code('systems/world-enemy-step.ts'));
    const end = e.lastIndexOf('}');
    expect(e.slice(end - 2, end)).toEqual(['w.arms?.stepAir(w, dt, feelDt);', 'w.radar?.step(w);']);
    const m = code('systems/mission-world.ts');
    const i = m.indexOf('this.evac = buildEvac(');
    const j = m.indexOf('this.radar = buildRadar(scene, this);');
    const k = m.indexOf('this.art = new WorldArt(scene, this);');
    expect(i > 0 && j > i && k > j).toBe(true);
    expect(m.split('buildRadar(').length - 1).toBe(1);
    const fn = m.slice(m.indexOf('private readonly stepFn'), m.indexOf('constructor('));
    expect(fn).not.toContain('radar');
    const v = code('systems/world-visuals.ts');
    expect(v.indexOf('w.radar?.updateVisuals(w.stepTimeS);')).toBeLessThan(v.indexOf('w.art.update(realDt, w);'));
    expect(v.indexOf('w.radar?.destroy();')).toBeLessThan(v.indexOf('w.art.destroy();'));
    expect(v.indexOf('w.radar?.updateVisuals(')).toBeGreaterThan(0);
  });
  it('buildRadar は setup.radar の任務だけ作る（無ければ null＝絵も絵の鍵も作らない）。WorldRadar は掃引の時でなければ何もしない', () => {
    const rv = code('systems/radar-view.ts');
    // v0.8.1 S2: 陸の反射に今の岸（coast の南）も渡す（us_06。両岸の us_04 は両岸の線のまま＝core/strait-geometry の landLinesOf）
    expect(rv).toContain('return p ? new WorldRadar(p, w.setup.mission.bounds, w.setup.shores, w.destroyers ? w.destroyers.total : 0, new RadarView(scene), eastJa, w.setup.mission.coast !== null) : null;');
    expect(rv).toContain("const eastJa = tr && tr.outbound !== null && tr.outbound.edge === 'east' ? tr.vilaLabelJa : '';"); // v0.8.0 S4: 東の縁の向こうの揚陸の地の名（2 行目の「東（ビラ）へ消えた」）。v0.8.2 S0: 片道の列（outbound null）は ''（片道の文は S4）
    const wr = code('systems/world-radar.ts');
    const step = wr.slice(wr.indexOf('  step(w: RadarWorldView): void {'));
    expect(lines(step).slice(0, 3)).toEqual(['step(w: RadarWorldView): void {', 'const r = this.state;', 'if (!radarSweepDue(r, w.stepTimeS)) return;']);
  });
});

describe('掃引の時刻と輝点（us_04 ノーマル・揺らぎなし・自艇は出発点で止まっている）', () => {
  const w = kitWorld();
  const sweepsAt: number[] = [];
  const blipsOk: boolean[] = [];
  const moved: number[] = [];
  let prevSweeps = 0;
  let prevBlips = '';
  const counts: number[] = [];
  const tele = initRadarTelemetry(w);
  while (w.stepTimeS < 250) {
    kitStep(w);
    const s = w.radar!.state;
    const now = JSON.stringify(s.blips.slice(0, s.n).map((b) => [b.x, b.y, b.atS]));
    if (s.sweeps !== prevSweeps) {
      sweepsAt.push(w.stepTimeS);
      blipsOk.push(JSON.stringify(s.blips.slice(0, s.n).map((b) => [b.x, b.y])) === JSON.stringify(expectBlips(w)));
      counts.push(s.n);
      prevSweeps = s.sweeps;
    } else if (now !== prevBlips) moved.push(w.stepTimeS);
    prevBlips = now;
  }
  refreshRadarTelemetry(tele, w);
  it('最初の掃引は最初の固定ステップ、以後は 3 秒の倍数を越えた最初のステップ（固定ステップの時計）。掃引の間は輝点が動かない', () => {
    expect(sweepsAt[0]).toBeCloseTo(1 / 60, 9);
    for (let k = 1; k < sweepsAt.length; k++) {
      expect(sweepsAt[k]!).toBeGreaterThanOrEqual(3 * k - 1e-6);
      expect(sweepsAt[k]!).toBeLessThan(3 * k + 1 / 60 + 1e-6);
    }
    expect(sweepsAt.length).toBe(1 + Math.floor((250 - 1e-9) / 3));
    expect(moved).toEqual([]);
  });
  it('どの掃引の輝点も、海域の中の艦（out でない）の 4,000 m の内・陸から 400 m の外を 50 m に丸めた位置（近い順・同じ格子は 1 つ）', () => {
    expect(blipsOk.every(Boolean)).toBe(true);
    expect(blipsOk.length).toBe(sweepsAt.length);
  });
  it('spec §4.5 の流れ: 最初の掃引で護衛 1（2,280 m・北西）→ 列が入って増え（最大 4）→ ビラへ抜けて減り → 復路で増え → みな去って 0。テレメトリは数をそのまま写す', () => {
    expect(counts[0]).toBe(1);
    expect(Math.max(...counts)).toBe(4);
    expect(counts[counts.length - 1]).toBe(0);
    const s = w.radar!.state;
    expect(s.firstS).toBeCloseTo(1 / 60, 9);
    expect(Math.round(Math.hypot(s.firstX - s.firstFromX, s.firstY - s.firstFromY) / 100) * 100).toBe(2300);
    expect(s.firstX < s.firstFromX && s.firstY < s.firstFromY).toBe(true);
    expect(s.newCount).toBeGreaterThanOrEqual(5); // 往路の 3 隻と復路の…（同じ掃引に 2 隻増えれば 1 回）
    expect(s.lostCount).toBeGreaterThanOrEqual(3);
    expect(phases(w)).toBe('444');
    expect([tele.enabled, tele.shipRangeM, tele.sweeps, tele.contacts, tele.firstS, tele.newCount, tele.lostCount]).toEqual([true, 4000, s.sweeps, s.n, s.firstS, s.newCount, s.lostCount]);
  });
  it('隠れた列の艦（まだ来ない・ビラ・去った）と沈み始めた艦は映らない', () => {
    const v = kitWorld();
    while (phases(v) !== '111') kitStep(v);
    v.ships[0]!.sinking = true;
    const n0 = v.radar!.state.sweeps;
    while (v.radar!.state.sweeps === n0) kitStep(v);
    expect(v.radar!.state.n).toBe(3);
    while (phases(v) !== '222') kitStep(v);
    const n1 = v.radar!.state.sweeps;
    while (v.radar!.state.sweeps === n1) kitStep(v);
    expect(v.radar!.state.n).toBe(0);
  });
});

describe('レーダーのテレメトリ（systems/radar-telemetry）', () => {
  it('レーダーの無い世界は enabled false のまま何も書かない', () => {
    const none = { radar: null, boat: { state: { x: 1, y: 2 } } }; // v0.8.0 S4: 自艇の位置も読む（レーダーの無い世界は写さない）
    const t = initRadarTelemetry(none);
    expect([t.enabled, t.shipRangeM, t.sweeps, t.contacts, t.blips.length, t.eastJa]).toEqual([false, 0, 0, 0, 0, '']);
    const before = JSON.stringify(t);
    refreshRadarTelemetry(t, none);
    expect(JSON.stringify(t)).toBe(before);
  });
});
