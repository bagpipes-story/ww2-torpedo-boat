// F11（v0.6.7 S3。spec-v067 §C.6）: 転舵の反応で崖が無い。HUD どおり（全速・捜索で止まる）で投下から転舵までの秒 r を決めて回し（帰投の向きへ戻すのは 0.6〜1.4 秒の揺らぎ）、
// どの r も沈没 ≤ 20%・隣の r との差 ≤ 10 点。ここは seed 1〜200 の 3 点（0.35・0.5・0.7。spec §G.1 の S4 のテストと同じ点）。0.05 刻みの掃きは S4 の scripts/patrol-air-sim.ts（TABLE=3）。
import { describe, expect, it } from 'vitest';
import { nights, share } from './patrol-night-kit';

describe('F11: 転舵の反応の秒で沈没が跳ばない', () => {
  it('r 0.35・0.5・0.7 秒: どれも沈没 ≤ 20%、隣との差 ≤ 10 点、遅いほど当たりやすい', () => {
    const sunk = [0.35, 0.5, 0.7].map((r) => share(nights(200, { pol: 'hud', reactS: r }), (x) => x.sunk));
    for (const x of sunk) expect(x).toBeLessThanOrEqual(0.2);
    for (let i = 1; i < sunk.length; i++) expect(Math.abs(sunk[i]! - sunk[i - 1]!)).toBeLessThanOrEqual(0.1);
    expect(sunk[0]!).toBeLessThan(sunk[2]!);
  });
});
