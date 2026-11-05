// v0.6.11 S4（spec-v0611-r2 §8）: 空襲下の退避の固定ステップの順のソースの pin（tests/patrol-step-order・landing-step-order の作法）。世界（systems/mission-world の stepFn）は
// 時計 → 夜明けのラッチ → 乗員の倍率 → 自艇の運動 → 隊の動き（evac.stepBoats）→ 帯 → 敵の側（兵装の対空はこの中の最後）→ 座席の火災 → 味方機 → 港の空襲（evac.stepAir）→ 夜明けの空襲、
// フレームの入力（systems/world-input）は 沈没の確かめ → ［切替］と latch（evac.frameInput）→ 魚雷 → 消火。模擬（core/evac-sim）も同じ順。
// 順そのものが同じ結果になることは tests/evac-world（node の小さな世界と模擬の突き合わせ）と scripts/headless/world-vs-sim（EVAC=1）が確かめる。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

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

describe('空襲下の退避の固定ステップの順（ソースの pin）', () => {
  it('mission-world の stepFn: ラッチ → 自艇 → 隊 → 帯 → 敵の側 → 火災 → 味方機 → 港の空襲 → 夜明けの空襲（evac はそれぞれ 1 回）', () => {
    const s = code('systems/mission-world.ts');
    const fn = s.slice(s.indexOf('private readonly stepFn'), s.indexOf('constructor('));
    expectOrder(fn, ['this.stepTimeS += realDt;', 'this.dawn.latch(this);', 'setPerformance(', 'stepPlayerBoat(this, dt);', 'this.evac?.stepBoats(dt, feelDt);', 'this.band = nextSpeedBand', 'stepEnemySide(', 'stepDamage(', 'this.friendly?.step(feelDt, this);', 'this.evac?.stepAir(feelDt);', 'this.dawn.step(feelDt, this);']);
    expect(fn.split('this.evac?.').length).toBe(3);
  });
  it('mission-world の生成: 空襲下の退避は揚陸の後＝最後（+29〜+43 はここだけ）、座席の振り替えは自艇の BoatDamage へ', () => {
    const s = code('systems/mission-world.ts');
    expectOrder(s, ['this.arms = buildArms(scene, this, data, seed, onSunk);', 'this.landing = buildLanding(', 'this.evac = buildEvac(scene, this, seed, hit, this.boatDamage);', 'this.refreshShallowStatus();']);
    expect(s.split('buildEvac(').length).toBe(2);
    const fl = code('systems/evac-flights.ts');
    expect(fl).toContain('if (!ev) return null;');
    expect(fl.split('new AirStrikeFlight(').length).toBe(2);
    const we = code('systems/world-evac.ts');
    expect(we).toContain('new SeededRng((seed + EVAC_AI_SEED_OFFSET) >>> 0)');
    expect(we.split('new SeededRng(').length).toBe(2);
    expect(we).toContain('damage.divert = () => evacSinkLeader(sq, seat, sq.control, w.stepTimeS, this.air.hooks);');
    // S6: ラッチは決着の時の写し（Result の時の行。隊・段階・隠れ場所を読むだけ）を取ってから「中」を返す
    const hl = we.slice(we.indexOf('w.dawn.homeAtLatch = () => {'));
    expectOrder(hl, ['this.settleSnap.group = sq.control;', 'this.settleSnap.phase = g.phase;', 'this.settleSnap.shelter = g.shelter;', 'return evacSeatHome(sq, seat, true);']);
  });
  it('world-input: 沈没の確かめ → ［切替］と latch → 魚雷 → 消火（模擬のフレームの頭と同じ）', () => {
    const s = code('systems/world-input.ts');
    const fn = s.slice(s.indexOf('export function consumeFrameInput'));
    expectOrder(fn, ['if (w.boat.sinking) return;', 'w.evac?.frameInput();', 'consumeTorpedoFire(w);', 'consumeSmokeInput(']);
    const we = code('systems/world-evac.ts');
    const fi = we.slice(we.indexOf('  frameInput(): void'), we.indexOf('  command('));
    expectOrder(fi, ['w.input.switchTap = false;', 'evacFrameInput(this.sq, this.seat, w.input, tap, this.air.hooks);', 'w.crewLostNow = crewLost(']);
  });
  it('world-evac の段 3・段 5 と world-boat: 隊の動き → 帰投（ラッチのステップは中）、港の空襲、座席の入力と燃料の秒', () => {
    const we = code('systems/world-evac.ts');
    const sb = we.slice(we.indexOf('  stepBoats(dt: number'), we.indexOf('  stepAir('));
    expectOrder(sb, ['const latchStep = w.dawn.reached && !this.latchSeen;', 'if (w.boat.sinking) return;', 'stepEvacBoats(this.sq, this.seat, w.input, this.aiRng, w.stepTimeS, dt, realDt);', 'w.atHome = evacSeatHome(this.sq, this.seat, latchStep);']);
    expect(we).toContain('stepEvacAir(a, this.w.stepTimeS, feelDt, feelDt, this.w.arms ? this.w.arms.flashM : 0);');
    // S5: 段 5 の後にそのステップの出来事を HUD へ積む（plan と repass は読むだけ＝世界と模擬の突き合わせの物を書かない）
    const sa = we.slice(we.indexOf('  stepAir(feelDt: number)'), we.indexOf('  updateVisuals('));
    expectOrder(sa, ['stepEvacAir(a,', 'f.lost |= p.evLost;', 'f.found |= p.evFound;', 'f.repass |= a.repass.ev;', 'if (p.evWave >= 0) f.wave = p.evWave;', 'if (p.evSettle) {', 'f.settle = true;', 'this.settleSnap.survivors = evacSurvivors(this.sq);']);
    const wb = code('systems/world-boat.ts');
    expect(wb).toContain('w.engine ? w.engine.input(w) : w.evac ? w.evac.command(w.input) : w.input');
    expect(wb).toContain('if (!w.evac || w.stepTimeS >= w.evac.fuelFreeUntilS - EVAC_TIME_EPS_S) stepFuel(w.fuel, w.fuelCurve, boat.speedMps, dt);');
  });
  it('模擬（core/evac-sim）も同じ順: 台本 → ［切替］と latch → 消火 → 時計とラッチ → 乗員 → 座席の運動 → 燃料 → 隊 → 帰投 → 帯 → 対空 → 座席の火災 → 港の空襲 → §2 の 4 機', () => {
    const s = code('core/evac-sim.ts');
    const fn = s.slice(s.indexOf('export function runEvacTrial'));
    expectOrder(fn, ['evacDriverFrame(', 'evacFrameInput(sq, seat, stick, fo.switchTap, air.hooks)', 'crewExtinguishFactor(', 'm.t += realDt;', 'dawnReached(s.durationS, t)', 'setPerformance(', 'evacSeatCommand(sq, stick, cmd);', 'stepBoat(seat.state,', 'stepFuel(', 'stepEvacBoats(', 'atHome = evacSeatHome(sq, seat, latchStep);', 'nextSpeedBand(', 'stepEvacSimAa(', 'stepDamage(seat.damage', 'stepEvacAir(', 'stepAirStrike(dawn,']);
    expect(fn).toContain('if (t >= s.fuelFreeUntilS - TIME_EPS_S) stepFuel(');
    expect(s).toContain('const TIME_EPS_S = EVAC_TIME_EPS_S;');
  });
  it('対空: 隊の砲と港の空襲の機は兵装の stepAir の中だけ（撃墜は evacDownPlane・順番の飛ばしはその編隊）。世界の空襲の段（world-evac）は対空を呼ばない', () => {
    const sl = code('systems/aa-slots.ts');
    expect(sl).toContain('if (ev) addEvacPlanes(t, ev.plan, boat, ev.aaOrder, ev.aaD2, pose);');
    expectOrder(sl, ['if (!evacDownPlane(fl, i % EVAC_AA_PLANE_STRIDE)) return -1;', 'skipDownedRuns(fl.port.state, fl.p);', 'ev.lastDownFlight = fl.index;']);
    expect(sl).not.toContain('downStrikePlane(fl.');
    const sim = code('core/evac-sim-aa.ts');
    expect(sim).toContain('addEvacPlanes(t, plan, boat, a.order, a.d2, a.pose);');
    expect(code('systems/world-evac.ts')).not.toContain('stepAaFire');
  });
});
