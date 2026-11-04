// 記録した入力の再生の口（v0.6.10 S5a。core/landing-replay・core/landing-sim の rp。scripts/headless/world-vs-sim の G7）: 渡さなければ模擬は前と同じ（md5 は scripts/headless/g2.sh の G6・ALLY）。
// 渡すと台本の代わりに入力と体感の倍率を 1 ステップずつ読み、begin は 1 回・after はステップごとに 1 回。止まったままの入力の再生は、出発点で止まったままの遊び方 hide の夜と同じ
// （帰投の輪の呼びかけの 4 鍵を除く: 再生は lure の台本の組み立てを借りるので呼びかけを数える）。倍率 0.25 は PT の動きを遅くする（世界の命中スローと同じ掛け方）。
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import type { LandingReplay, LandingReplayView } from '../src/core/landing-replay';
import { runLandingTrial, type LandingTrial } from '../src/core/landing-sim';
import { landingSimSetup } from '../src/systems/landing-sim-setup';

const RING = ['ringCallS', 'ringCallHidden', 'ringShownS', 'ringObeyS'];
const json = (t: LandingTrial): string => JSON.stringify(t, (k, v: unknown) => (RING.includes(k) ? undefined : ArrayBuffer.isView(v) ? Array.from(v as Uint8Array) : v));

/** 揚陸の決着までに決まる欄（hide は決着の後に帰投の輪へ動くので、その前だけ比べる。結末 outcome は決着の後に PT が去って決まることがあるので見ない） */
const PICK = ['phase', 'hits', 'duds', 'resolvedS', 'reportS', 'nearReportS', 'contacts', 'detectS', 'kind', 'launchS', 'launchM', 'arrived', 'arrivedHits', 'potHits', 'draws26', 'drawsWant', 'allySpotted', 'allyLitPts', 'allyShells', 'draws27', 'draws28'] as const;
const pick = (t: LandingTrial): LandingTrial => Object.fromEntries(PICK.map((k) => [k, t[k]])) as unknown as LandingTrial;

/** 止まったままの入力（max ステップで打ち切り）。after の k と、begin の参照を書き残す */
function stopReplay(max: number, feel = 1, log: { ks: number[]; begins: number; v: LandingReplayView | null } = { ks: [], begins: 0, v: null }): LandingReplay {
  return {
    begin(v) { log.begins++; log.v = v; },
    step(k, input, o) {
      if (k >= max) return false;
      input.headingDeg = NaN;
      input.speed01 = 0;
      o.held = false;
      o.feel = feel;
      return true;
    },
    after(k) { log.ks.push(k); },
  };
}

describe('core/landing-sim の再生の口', () => {
  for (const hard of [false, true]) {
    for (const allyOff of [false, true]) {
      it(`${hard ? 'ハード' : 'ノーマル'}${allyOff ? '・卯月なし' : ''}: 止まったままの入力の再生は、出発点で止まって待つ hide の夜と揚陸の決着まで同じ（seed 1〜3）`, () => {
        const s = landingSimSetup(gameData, 'jp_04', { hard, ...(allyOff ? { allyOff: true } : {}) });
        for (let seed = 1; seed <= 3; seed++) {
          const h = runLandingTrial(s, 'hide', seed);
          expect(Number.isFinite(h.resolvedS)).toBe(true);
          const r = runLandingTrial(s, 'lure', seed, undefined, stopReplay(Math.round(h.resolvedS * 60)));
          expect(json(pick(r))).toBe(json(pick(h)));
        }
      });
    }
  }
  it('begin は 1 回（隊・揚陸・雷撃・敵の魚雷・卯月・自艇・被害・燃料・乱数の参照）、after はステップ 0 から順に 1 回ずつ、step が false で終わる', () => {
    const s = landingSimSetup(gameData, 'jp_04', {});
    const log = { ks: [] as number[], begins: 0, v: null as LandingReplayView | null };
    const tr = runLandingTrial(s, 'lure', 2, undefined, stopReplay(300, 1, log));
    expect(log.begins).toBe(1);
    expect(log.ks).toEqual(Array.from({ length: 300 }, (_, i) => i));
    expect(tr.end).toBe('timeout');
    const v = log.v!;
    expect(v.q.boats.length).toBe(2);
    expect(v.ally).not.toBeNull();
    expect(v.torps.length).toBe(2 * s.torpedo.n);
    for (const r of [v.rng, v.gunRng, v.trng, v.a27, v.a28]) expect(typeof (r as unknown as { state: number }).state).toBe('number');
  });
  it('体感の倍率: 0.25 で回すと PT の進みは 1 のときより短い（同じ 300 ステップ）', () => {
    const s = landingSimSetup(gameData, 'jp_04', {});
    const at = (steps: number, feel: number): { x: number; y: number } => {
      const log = { ks: [] as number[], begins: 0, v: null as LandingReplayView | null };
      runLandingTrial(s, 'lure', 1, undefined, stopReplay(steps, feel, log));
      const b = log.v!.q.boats[0]!;
      return { x: b.x, y: b.y };
    };
    const p0 = at(0, 1);
    const moved = (p: { x: number; y: number }): number => Math.hypot(p.x - p0.x, p.y - p0.y);
    expect(moved(at(300, 1))).toBeGreaterThan(0);
    expect(moved(at(300, 0.25))).toBeLessThan(moved(at(300, 1)) * 0.5);
  });
});
