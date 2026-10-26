// jp_02 の夜を世界の順で回す（v0.6.7 S3。tests/patrol-night-kit。夜明けの空襲・燃料・乗員の効きは省く）で、spec-v067 §C.6 の不変を core の門番と出撃で確かめる:
// F1（目の発見の予告 ≥ 8 秒。v0.6.7 実機 1 回目の 4,200 m で 14.5 から）・F3（攻撃できる機 ≤ 2・空中の爆弾 ≤ 1）・F5（着弾点の輪から離れれば当たらない）・F6（+23 の回数）・F8（1 回の発見に 1 波）・
// F9（1 発では沈まない・消火すれば火災でも沈まない）・F10（HUD どおりなら夜明け前に帰れる）・F12（再出撃は遅れない）。
// 帯（N 400 × 2 組）と回帰は本物の模擬（S4。core/patrol-air-sim）。ここは seed 1〜100／200 の決まった夜で、帯より緩い線だけを置く。
import { describe, expect, it } from 'vitest';
import { applyShellHit, createDamageState, stepDamage, type HitOutcome } from '../src/core/gunnery';
import { SeededRng } from '../src/core/rng';
import { DT } from './patrol-air-kit';
import { W, nights, share, type NightOptions, type NightResult } from './patrol-night-kit';

const sum = (rs: readonly NightResult[], f: (r: NightResult) => number): number => rs.reduce((a, r) => a + f(r), 0);

describe('F1・F3・F6・F8・F12: どの遊び方でも全夜で（seed 1〜100）', () => {
  it.each([
    ['hud~（HUD どおり）', { pol: 'hud', reactS: 'jitter' }],
    ['run~（逃げるだけ）', { pol: 'run', reactS: 'jitter' }],
    ['run_straight（転舵しない）', { pol: 'run_straight', reactS: 0.5 }],
    ['quiet~（14 kt と止まる）', { pol: 'quiet', reactS: 'jitter' }],
  ] as [string, NightOptions][])('%s: 攻撃できる機 ≤ 2・空中の爆弾 ≤ 1・+23 = 2 × 投下 + 命中の抽選・来た波 = 発見・再出撃の false 0・目の発見の予告 ≥ 8 秒・1 波 6 発まで', (_n, o) => {
    const perSortie = W.patrolAir!.sortie.planes * W.patrolAir!.sortie.bombsPerPlane;
    expect(perSortie).toBe(6); // 2 機 × 3 発（v0.6.7 実機 1 回目に 1 機 2 → 3 発）
    const rs = nights(100, o);
    expect(sum(rs, (r) => r.finds)).toBeGreaterThanOrEqual(100); // 毎夜レーダーの 1 回は必ず
    for (const r of rs) {
      expect(r.maxAttack).toBeLessThanOrEqual(2);
      expect(r.maxBombsAir).toBeLessThanOrEqual(1);
      expect(r.draws).toBe(r.expectedDraws);
      expect(r.waves).toBe(r.finds);
      expect(r.restartFalse).toBe(0);
      expect(r.finds - r.findsVisual).toBe(1);
      expect(r.minWarnS).toBeGreaterThanOrEqual(8); // 予告 (4,200 − 1,500)/308.64 = 8.75 秒・F1 の hud_stop_margin_s 3 + 5
      expect(r.bombs).toBeLessThanOrEqual(perSortie * r.finds);
    }
  });
});

describe('F5: 当たらなくできる（着弾点の輪から離れる側へ全速で切る）と、転舵しない対照', () => {
  it('run_ring は 1 発の命中 ≤ 2%（seed 1〜100）。まっすぐ走ると 0.40〜0.55', () => {
    const ring = nights(100, { pol: 'run_ring', reactS: 0.5 });
    const straight = nights(100, { pol: 'run_straight', reactS: 0.5 });
    const rate = (rs: NightResult[]): number => sum(rs, (r) => r.hits) / sum(rs, (r) => r.bombs);
    expect(sum(ring, (r) => r.bombs)).toBeGreaterThan(400);
    expect(rate(ring)).toBeLessThanOrEqual(0.02);
    expect(rate(straight)).toBeGreaterThanOrEqual(0.4);
    expect(rate(straight)).toBeLessThanOrEqual(0.55);
  });
});

describe('F9: 1 発では沈まない（消火すれば）', () => {
  it('jp_02 の T-14: 1 発 35 < HP 50。火災が付いても 2 秒後に消せば残り、放っておけば火災で沈む（消火の長押しが要る）', () => {
    const sp = W.patrolAir!.sortie.bombHit;
    const hit: HitOutcome = { destroyed: false, startedFire: false, engineHit: false };
    const fire = { ...sp, fireChance: 1, engineDamageChance: 0 };
    for (const putOut of [true, false]) {
      const d = createDamageState(W.damageParams);
      applyShellHit(d, fire, W.damageParams, new SeededRng(1), hit);
      expect([hit.destroyed, hit.startedFire, d.hp]).toEqual([false, true, W.damageParams.maxHp - sp.damage]);
      let sunk = false;
      for (let k = 0; k < Math.round(W.damageParams.fireDurationS / DT) + 10 && !sunk; k++) {
        if (putOut && k === Math.round(2 / DT)) d.fireLeftS = 0;
        sunk = stepDamage(d, W.damageParams, DT);
      }
      expect(sunk).toBe(!putOut);
    }
    expect(sp.damage).toBeLessThan(W.damageParams.maxHp);
  });
  it('夜（消火は火災の 2 秒後）: 沈んだ夜はどれも 2 発以上当たっている（seed 1〜100・3 つの遊び方）', () => {
    for (const o of [{ pol: 'hud', reactS: 'jitter' }, { pol: 'run', reactS: 'jitter' }, { pol: 'run_straight', reactS: 0.5 }] as NightOptions[]) {
      const rs = nights(100, o);
      for (const r of rs) if (r.sunk) expect(r.hits, o.pol).toBeGreaterThanOrEqual(2);
      expect(share(rs, (r) => r.sunk)).toBeGreaterThan(0);
    }
  });
});

describe('F10: HUD どおりなら夜明け前に帰れる（seed 1〜200。帯は S4 の N 400 × 2 組）', () => {
  it('全速＋捜索で止まる（hud~）: 夜明け前の帰投 ≥ 80%・目の発見 0（秒読み 0 の 0.3 秒後に止まれば見つからない）', () => {
    const rs = nights(200, { pol: 'hud', reactS: 'jitter' });
    expect(share(rs, (r) => r.homeBeforeDawn)).toBeGreaterThanOrEqual(0.8);
    expect(sum(rs, (r) => r.findsVisual)).toBe(0);
  });
  it('14 kt＋止まる（quiet~）: 夜明け前の帰投 ≥ 65%・目の発見 0', () => {
    const rs = nights(200, { pol: 'quiet', reactS: 'jitter' });
    expect(share(rs, (r) => r.homeBeforeDawn)).toBeGreaterThanOrEqual(0.65);
    expect(sum(rs, (r) => r.findsVisual)).toBe(0);
  });
});
