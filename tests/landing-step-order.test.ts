// v0.6.9 S5a（spec-v069 §4.1・§9 の landing-step-order・D18）: 揚陸の任務（jp_04）の固定ステップの順のソースの pin。世界（systems/world-enemy-step）は 米PT の隊 → 揚陸の段 → 機関、
// 揚陸の段の中（systems/world-landing の stepAfterPts）は 雷撃（stepPtTorpedoes。seed+26）→ 敵の魚雷のプール → 揚陸の時計（tickLanding）、模擬（core/landing-sim）も同じ順。
// 揚陸の世界は MissionWorld の最後（兵装の後）に作り、seed+26 は buildLanding の中の setup.landing のある枝だけ（tests/landing-imports）。呼びかけ・撃ち尽くし・達成の配線も見る。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** コメントを除いたソース（コメントの中の名前で誤検出しない） */
const code = (p: string): string => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
/** 文字列の並びが text の中でこの順に（それぞれ 1 回目の位置で）出る */
function expectOrder(text: string, parts: readonly string[]): void {
  let at = -1;
  for (const p of parts) {
    const i = text.indexOf(p, at + 1);
    expect(i, `「${p}」が「${parts[parts.indexOf(p) - 1] ?? '先頭'}」の後に無い`).toBeGreaterThan(at);
    at = i;
  }
}

describe('揚陸の任務の固定ステップの順（ソースの pin）', () => {
  it('world-enemy-step: 米PT の隊 → 揚陸の段 → 機関 → 対空（揚陸の段は 1 回）', () => {
    const s = code('systems/world-enemy-step.ts');
    expectOrder(s, ['w.pts?.step(dt, feelDt, w, w.input.gunHeld);', 'w.landing?.stepAfterPts(w, dt, feelDt);', 'w.engine?.step(w, feelDt);', 'w.arms?.stepAir(']);
    expect(s.split('stepAfterPts').length).toBe(2);
  });
  it('world-landing の stepAfterPts: 時計を書く（R14 A3: 雷撃の前＝同じステップの斉射を足す）→ 雷撃（seed+26）→ 敵の魚雷のプール（沈み始めたら的なし・終わり際の当たりなし）→ 揚陸の時計（stepTimeS）', () => {
    const s = code('systems/world-landing.ts');
    const fn = s.slice(s.indexOf('  stepAfterPts(w: LandingWorldView'), s.indexOf('  get resolved()'));
    expectOrder(fn, [
      'const nowS = w.stepTimeS;',
      'this.link.nowS = nowS;',
      'stepPtTorpedoes(this.tst, this.tp, q, this.state, this.rng, w.dawn.reached, nowS, feelDt, this.link, NO_LEAVE);',
      'this.pool.step(dt, feelDt, this.state.out ? NO_HULLS : this.hulls, this.p.passRadius2, this.link);',
      'tickLanding(this.state, this.p, nowS);',
    ]);
    // 終わり際の当たりは見ない（TorpedoPool.step の nowS・settleS を渡さない＝NaN・0）
    expect(fn).not.toMatch(/this\.pool\.step\([^)]*,[^)]*,[^)]*,[^)]*,[^)]*,/);
  });
  it('模擬（core/landing-sim）も同じ順: 凍結の隊 → 時計 → 雷撃 → 敵の魚雷のプール（沈み始めたら的なし）→ 揚陸の時計', () => {
    const s = code('core/landing-sim.ts');
    expectOrder(s, ['stepPtSection(q, p, c, rng, realDt, dt, ev);', 'tor.link.nowS = t;', 'stepPtTorpedoes(st, tp, q, ld, trng, c.dawn, t, realDt, sink, NO_LEAVE);', 'tor.pool.step(dt, realDt, ld.out ? NO_HULLS : tor.shipHulls, lp.passRadius2, tor.ev);', 'tickLanding(ld, lp, t);', 'stepDamage(d, s.damage, realDt)']);
  });
  it('mission-world: 揚陸の世界は兵装の後（最後）に作る。stepFn は敵の側の段 → 火災（揚陸の段は敵の側の段の中）', () => {
    const s = code('systems/mission-world.ts');
    expectOrder(s, ['this.engine = s.engine ?', 'this.arms = buildArms(scene, this, data, seed, onSunk);', 'this.landing = buildLanding(scene, s, this.pts, seed, events, onSunk);', 'this.refreshShallowStatus();']);
    expect(s.split('buildLanding(').length).toBe(2);
    const fn = s.slice(s.indexOf('private readonly stepFn'), s.indexOf('constructor('));
    expect(fn).not.toContain('landing');
  });
  it('buildLanding: setup.landing と米PT の隊の無い任務は null（seed+26・プール・絵を作らない）、プールは PT の隻数 × salvo_count 本、seed+26 は 1 本', () => {
    const s = code('systems/world-landing.ts');
    const fn = s.slice(s.indexOf('export function buildLanding'));
    expectOrder(fn, ['if (!s.landing || !pts) return null;', 'new TorpedoPool(scene, ld.torpedo.torpedo, count * ld.torpedo.n, s.mission.bounds)', 'new SeededRng((seed + PT_TORPEDO_SEED_OFFSET) >>> 0)', 'return new WorldLanding(']);
    expect(s.split('new SeededRng(').length).toBe(2);
    expect(s.split('new TorpedoPool(').length).toBe(2);
  });
  it('配線: 呼びかけ（returnCallDone）は揚陸の決着が先、撃ち尽くしは揚陸の任務で立てない、達成は揚陸完了して帰投（米PT の隊の枝より先）', () => {
    const w = code('systems/mission-world.ts');
    expect(w).toMatch(/returnCallDone\(\)[^{]*\{\s*return this\.landing \? this\.landing\.resolved : this\.convoy \? this\.convoy\.resolved : this\.enemy\.objectiveDone;/);
    expect(w).toMatch(/noTargetsLeft\(\)[^{]*\{\s*return this\.landing \? false : this\.convoy \? false : this\.enemy\.noTargetsLeft;/);
    const o = code('systems/mission-objective.ts');
    expectOrder(o, ['if (w.landing) return endCountsAsReturn(reason) && w.landing.state.phase === LD_DONE;', 'return w.convoy ? convoyObjectiveDone(']);
  });
  it('テレメトリ（S5b）: 出発時に 1 回（createTelemetry の landing）、毎フレームは Scene の updateFrame（固定ステップと雷跡の数え）の後の refreshTelemetry の中で米PT・輸送隊の後に 1 回', () => {
    expectOrder(code('scenes/mission-scene.ts'), ['w.updateFrame(realDt);', 'this.refreshTelemetry();']);
    const v = code('systems/world-visuals.ts');
    expectOrder(v, ['w.landing?.updateVisuals(realDt);']);
    const m = code('systems/mission-telemetry.ts');
    expectOrder(m, ['refreshPtTelemetry(t.pt, w);', 'refreshConvoyTelemetry(t.convoy, w);', 'refreshLandingTelemetry(t.landing, w);', 'w.engine?.writeTelemetry(t.engine);']);
    expect(m.split('refreshLandingTelemetry(').length).toBe(2);
    const c = code('systems/telemetry-create.ts');
    expectOrder(c, ['arms: createArmsTelemetry(),', 'landing: initLandingTelemetry(w),']);
    expect(c.split('initLandingTelemetry(').length).toBe(2);
  });
  it('見た目: 敵の魚雷のプールは自艇の w.torpedoes でない（KPI・終わりの待ち・torpedoEventsFor に入らない）。world-visuals は最後に揚陸の絵と破棄', () => {
    const s = code('systems/world-landing.ts');
    for (const bad of ['w.torpedoes', 'torpedoEventsFor', 'w.shots', 'w.hits', 'launcher', 'resolveRemainingAsMisses']) expect(s, bad).not.toContain(bad);
    const v = code('systems/world-visuals.ts');
    expectOrder(v, ['w.arms?.updateVisuals(realDt, w);', 'w.landing?.updateVisuals(realDt);', 'w.boat.destroy();', 'w.landing?.destroy();']);
  });
});
