// 静音と倍速（v0.8.3。core/control-toggles・systems/world-boat・systems/mission-world の updateFrame・core/input-state・config/control-toggle-config）:
// - 静音: 切れていれば w.input そのもの（同じ object＝v0.8.2 と同じ演算）。入っていればスティックいっぱいで艇の静音の上限（縮める＝倒し量の全部で 0〜上限）。機関の不調・燃料切れとの組み合わせ。
// - 倍速: boostedFrames の回数（命中スローの間は 1 回）。倍速の N フレームは 1 倍の 2N フレームと 1 ステップずつ同じ世界（固定ステップ・乱数・命中スローの時計・自艇の運動の小さな世界で）。
//   mission-world の updateFrame がその形（boostedFrames に 1 回分＝入力の消費 → 固定ステップ → 命中スローの時計 → 浅瀬）であることは源の文で確かめる。
// - 入り切りは一時停止（resetInput）で残り、任務の始まり（startMissionInput）で切れる。ボタンの置き方は tests/hud-layout。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TIME_BOOST_FACTOR } from '../src/config/control-toggle-config';
import { gameData } from '../src/config/game-data';
import { FIXED_STEP_S, MAX_STEPS_PER_FRAME } from '../src/config/step-config';
import { type BoatState } from '../src/core/boat-motion';
import { SilentThrottle, boostedFrames } from '../src/core/control-toggles';
import { FixedStepper } from '../src/core/fixed-stepper';
import { createFuelState } from '../src/core/fuel';
import { createInputState, resetInput, startMissionInput, type InputState } from '../src/core/input-state';
import { SeededRng } from '../src/core/rng';
import { EngineTrouble } from '../src/systems/engine-trouble';
import { stepPlayerBoat, type PlayerBoatWorld } from '../src/systems/world-boat';
import { buildWorldSetup } from '../src/systems/world-setup';

const ROOT = join(__dirname, '..');
const DT = FIXED_STEP_S;

/** 自艇の運動の世界（tests/engine-trouble-world と同じ鍵）。silent を渡せば静音を通す */
function boatWorld(missionId: string, input: InputState, opts: { silent?: boolean; engine?: boolean } = {}) {
  const S = buildWorldSetup(gameData, missionId);
  const boat: BoatState = { x: S.playerStart.x, y: S.playerStart.y, headingDeg: S.playerStart.headingDeg, speedMps: 0 };
  const w: PlayerBoatWorld & { boat: { state: BoatState; sinking: boolean }; fuel: { gal: number; empty: boolean }; stepTimeS: number } = {
    boat: { state: boat, sinking: false },
    setup: S,
    params: { ...S.boatParams },
    input,
    fuel: createFuelState(S.fuelStartGal),
    fuelCurve: S.fuelCurve,
    returnPoint: S.mission.returnPoint,
    grounded: false,
    atHome: false,
    events: { onGrounded: () => {} },
    engine: opts.engine && S.engine ? new EngineTrouble(S.engine) : null,
    stepTimeS: 0,
    ...(opts.silent ? { silent: new SilentThrottle() } : {}),
  };
  return { S, w, boat };
}

describe('静音（SilentThrottle）', () => {
  const p = { silentMaxMps: 5, speedMaxMps: 20 };

  it('切れていれば input そのもの（同じ object・書き換えない）。入っていれば同じ写しに針路を写し、速さは speed01 × 静音の上限 / 全速（縮める）', () => {
    const t = new SilentThrottle();
    const input = createInputState();
    input.headingDeg = 135;
    input.speed01 = 1;
    expect(t.command(input, p)).toBe(input);
    input.silentOn = true;
    const a = t.command(input, p);
    expect(a).not.toBe(input);
    expect([a.headingDeg, a.speed01]).toEqual([135, 0.25]);
    expect([input.headingDeg, input.speed01]).toEqual([135, 1]); // InputState は倒した量のまま
    // 半分倒せば上限の半分（切らずに縮める＝細かく操れる）。針路 NaN も写す。写しは毎回同じ object（確保なし）
    input.speed01 = 0.5;
    input.headingDeg = NaN;
    const b = t.command(input, p);
    expect(b).toBe(a);
    expect(b.speed01).toBe(0.125);
    expect(Number.isNaN(b.headingDeg)).toBe(true);
    // 全速が静音の上限より落ちれば比は 1（engineCap01）
    input.speed01 = 0.8;
    expect(t.command(input, { silentMaxMps: 5, speedMaxMps: 4 }).speed01).toBe(0.8);
    // silentOn の無い素の BoatInput は切れている扱い
    const plain = { headingDeg: 10, speed01: 1 };
    expect(t.command(plain, p)).toBe(plain);
  });

  it('us_02 の Elco 80: 静音でスティックいっぱいを 30 秒続けると静音の上限で止まる（超えない）。切ると全速まで上がる', () => {
    const input = createInputState();
    const { S, w, boat } = boatWorld('us_02', input, { silent: true });
    input.headingDeg = 90;
    input.speed01 = 1;
    input.silentOn = true;
    let max = 0;
    for (let k = 0; k < 30 * 60; k++) {
      w.stepTimeS += DT;
      stepPlayerBoat(w, DT * S.timeScale);
      max = Math.max(max, boat.speedMps);
    }
    expect(max).toBeLessThanOrEqual(S.boatParams.silentMaxMps * (1 + 1e-12));
    expect(boat.speedMps).toBeCloseTo(S.boatParams.silentMaxMps, 9);
    input.silentOn = false;
    for (let k = 0; k < 20 * 60; k++) stepPlayerBoat(w, DT * S.timeScale);
    expect([w.grounded, w.fuel.empty]).toEqual([false, false]);
    expect(boat.speedMps).toBeCloseTo(S.boatParams.speedMaxMps, 9);
  });

  it('切っている間は静音の無い世界と 1 ビットも違わない（同じ入力で 30 秒・針路と速さを変えながら）', () => {
    const ia = createInputState();
    const ib = createInputState();
    const a = boatWorld('jp_05', ia, { silent: true, engine: true });
    const b = boatWorld('jp_05', ib, { engine: true });
    for (let k = 0; k < 30 * 60; k++) {
      for (const i of [ia, ib]) {
        i.headingDeg = (k * 0.7) % 360;
        i.speed01 = (k % 400) / 400;
      }
      for (const x of [a, b]) {
        x.w.stepTimeS += DT;
        stepPlayerBoat(x.w, DT * x.S.timeScale);
      }
      expect(a.boat).toEqual(b.boat);
    }
    expect(a.w.fuel).toEqual(b.w.fuel);
  });

  it('機関の不調（jp_05）と一緒: 不調の上限は同じ静音の上限なので、静音の指令はそのまま通る（min）。燃料切れの漂流が先', () => {
    const input = createInputState();
    const { S, w } = boatWorld('jp_05', input, { silent: true, engine: true });
    const e = w.engine!;
    input.headingDeg = 30;
    input.speed01 = 0.6;
    input.silentOn = true;
    const cmd = w.silent!.command(w.input, w.params);
    expect(cmd.speed01).toBeCloseTo(0.6 * (S.boatParams.silentMaxMps / S.boatParams.speedMaxMps), 12);
    expect(e.input(w, cmd)).toBe(cmd); // 不調でなければ縮めた指令そのもの
    e.state.limp = true;
    const lim = e.input(w, cmd);
    expect(lim.speed01).toBe(cmd.speed01); // 不調の上限（静音 / 全速）より小さい＝そのまま
    expect(lim.headingDeg).toBe(30);
    expect(e.input(w)).not.toBe(cmd); // 既定は今までどおり w.input
  });
});

describe('倍速（boostedFrames）', () => {
  it('切れていれば 1 回、入っていれば TIME_BOOST_FACTOR（2）回。命中スローが残っている間と、1 回目の中で始まった命中スローの後は 2 回目を回さない', () => {
    expect(TIME_BOOST_FACTOR).toBe(2);
    const w = { slowMoLeftS: 0 };
    const log: number[] = [];
    const sub = (dt: number): void => {
      log.push(dt);
    };
    expect(boostedFrames(false, 2, w, sub, 0.016)).toBe(1);
    expect(boostedFrames(true, 2, w, sub, 0.016)).toBe(2);
    expect(log).toEqual([0.016, 0.016, 0.016]);
    w.slowMoLeftS = 0.5;
    expect(boostedFrames(true, 2, w, sub, 0.016)).toBe(1);
    w.slowMoLeftS = 0;
    let k = 0;
    const startSlow = (): void => {
      if (k++ === 0) w.slowMoLeftS = 1.2;
    };
    expect(boostedFrames(true, 2, w, startSlow, 0.016)).toBe(1);
    expect(boostedFrames(true, 3, { slowMoLeftS: NaN }, sub, 0.01)).toBe(3); // NaN は残りなし扱い（> 0 が偽）
  });

  /**
   * mission-world の 1 回分と同じ順の小さな世界: 入力の消費（打つたびに乱数を 1 回）→ 固定ステップ（命中スローの倍率・時計・自艇・乱数で命中→命中スロー）→ 命中スローの時計 → 浅瀬の代わりの写し。
   * 1 ステップごとに状態の文字列を記録する。frames はフレームごとの倍速の入り切り
   */
  function miniNight(fast: (f: number) => boolean, frames: number, realDt: number): { steps: string[]; game: number } {
    const input = createInputState();
    const { S, w, boat } = boatWorld('us_02', input, { silent: true });
    const rng = new SeededRng(77);
    const stepper = new FixedStepper(FIXED_STEP_S, MAX_STEPS_PER_FRAME);
    const world = { slowMoLeftS: 0, stepTimeS: 0, fired: 0 };
    const steps: string[] = [];
    const stepFn = (dt: number): void => {
      const factor = world.slowMoLeftS > 0 ? S.slowMoFactor : 1;
      world.stepTimeS += dt;
      w.stepTimeS = world.stepTimeS;
      stepPlayerBoat(w, dt * factor * S.timeScale);
      if (rng.next() < 0.001) world.slowMoLeftS = S.slowMoSeconds; // 命中（命中スロー）
      steps.push(JSON.stringify([world.stepTimeS, boat.x, boat.y, boat.headingDeg, boat.speedMps, w.fuel.gal, world.slowMoLeftS, world.fired]));
    };
    const sub = (dt: number): void => {
      const n = steps.length;
      input.headingDeg = (n * 1.3) % 360; // 入力はステップの数だけで決まる（倍速でも 1 倍でも同じステップに同じ入力）
      input.speed01 = 0.3 + 0.7 * ((n % 300) / 300);
      input.silentOn = n % 900 < 300;
      if (n % 97 === 0) world.fired += rng.next() < 0.5 ? 1 : 0;
      stepper.advance(dt, stepFn);
      if (world.slowMoLeftS > 0) world.slowMoLeftS -= dt;
    };
    let game = 0;
    for (let f = 0; f < frames; f++) game += boostedFrames(fast(f), TIME_BOOST_FACTOR, world, sub, realDt) * realDt;
    return { steps, game };
  }

  it('倍速の N フレームは 1 倍の 2N フレームと 1 ステップずつ同じ（命中スローを含む 60 fps・30 fps。途中で入り切りしても）。ゲームの秒はステップの数 × 幅', () => {
    for (const realDt of [1 / 60, 1 / 30]) {
      const one = miniNight(() => false, 2 * 3000, realDt);
      const two = miniNight(() => true, 3000, realDt);
      const mixed = miniNight((f) => f % 700 < 350, 4500, realDt);
      expect(two.steps.length).toBeGreaterThan(one.steps.length * 0.8); // 命中スローの間は 1 回なので 1 倍の 2N より少し短い
      expect(one.steps.some((s) => JSON.parse(s)[6] > 0)).toBe(true); // 命中スローが起きている
      for (const r of [two, mixed]) {
        const n = Math.min(r.steps.length, one.steps.length);
        expect(n).toBeGreaterThan(2000);
        for (let i = 0; i < n; i++) if (r.steps[i] !== one.steps[i]) expect(`step ${i}: ${r.steps[i]}`).toBe(`step ${i}: ${one.steps[i]}`);
      }
      expect(Math.abs(two.game - two.steps.length * FIXED_STEP_S)).toBeLessThanOrEqual(FIXED_STEP_S + 1e-9);
    }
  });

  it('30 fps の倍速は 1 フレームに 4 ステップ（2 回 × 上限 4 の中で）＝倍速は低いフレームレートでも 2 倍のまま', () => {
    const r = miniNight(() => true, 1, 1 / 30);
    expect(r.steps.length).toBe(4);
    expect(r.game).toBeCloseTo(2 / 30, 12);
  });

  it('mission-world の updateFrame は boostedFrames に 1 回分（入力の消費 → 固定ステップ → 命中スローの時計 → 浅瀬）を渡し、見た目は実秒・戻りはゲームの秒。Mission はそれで時計と帰投の待ちを数える', () => {
    const src = readFileSync(join(ROOT, 'src/systems/mission-world.ts'), 'utf8');
    expect(src).toContain('const n = boostedFrames(this.input.fastOn, TIME_BOOST_FACTOR, this, this.subFrame, realDt);\n    updateWorldVisuals(this, realDt);');
    expect(src).toContain('return n * realDt;');
    expect(src).toMatch(/private readonly subFrame = \(realDt: number\): void => \{\n {4}consumeFrameInput\(this, realDt\);\n {4}this\.stepper\.advance\(realDt, this\.stepFn\);\n {4}if \(this\.slowMoLeftS > 0\) this\.slowMoLeftS -= realDt;\n {4}refreshShallowStatus\(this\);\n {2}\};/);
    expect(src.match(/this\.stepper\.advance\(/g)?.length).toBe(1);
    const scene = readFileSync(join(ROOT, 'src/scenes/mission-scene.ts'), 'utf8');
    expect(scene).toContain('const gameDt = w.updateFrame(delta / 1000);');
    expect(scene).toContain('this.elapsedS += gameDt;');
    expect(scene).toContain('this.refreshReturnState(gameDt);');
    expect(scene).toContain('this.waitS += gameDt;');
    expect(scene).not.toMatch(/realDt/);
    expect(scene).toContain('startMissionInput(this.inputState);');
  });
});

describe('入り切りの持ち方（core/input-state）', () => {
  it('作るときは切れている。一時停止（resetInput）では残り、任務の始まり（startMissionInput）で切れる（ほかの入力も戻す）', () => {
    const s = createInputState();
    expect([s.silentOn, s.fastOn]).toEqual([false, false]);
    s.silentOn = true;
    s.fastOn = true;
    s.speed01 = 0.7;
    resetInput(s);
    expect([s.silentOn, s.fastOn, s.speed01]).toEqual([true, true, 0]);
    s.fireTap = true;
    startMissionInput(s);
    expect(s).toEqual(createInputState());
  });
});
