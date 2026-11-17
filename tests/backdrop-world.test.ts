// v0.8.1 S2（spec-v0810 §3.3 D-B1・D-B4〜D-B6・§6 の S2「tests/backdrop-world」、lead の L34）: 暗い岸を背に（systems/shore-backdrop）の世界の配線を小さな世界（tests/anchor-world-kit。
// 艦の段は本物の destroyer-step）で確かめる: 艦から自艇への線の向こう behind_m の内に陸の岸があるときだけ、その艦の見つける距離 × detect_factor（0.6）。照らされている間は掛けない。
// 下限は機銃の閃光（1,200 m。閃光の間だけ）と照明弾＝世界の距離に入っている上書きを係数で切らない。煙幕は世界の距離に入っている＝掛け算。?debug&nobackdrop は block ごと無い（世界の距離のまま）。
// HUD の 3 行目（D-B5）は最寄りの浮いている艦に最後に渡した値、AnchorLog は最寄りの艦に対して効いていた秒を数える。
import { describe, expect, it } from 'vitest';
import { gameData, getBoatRecord } from '../src/config/game-data';
import { enemyDetectRangeM, speedFactorForBand } from '../src/core/visibility';
import { anchorKit, anchorStep, runUntil, type AnchorKitWorld } from './anchor-world-kit';
import { code } from './core-rules-kit';

const UZ = 0;
const SM = 1;
const FLASH_M = (getBoatRecord(gameData, 'us_elco80') as unknown as { gun_battery: { muzzle_flash_reveal_m: number } }).gun_battery.muzzle_flash_reveal_m;
/** 自艇を (x, y) に置き、世界の距離 base m で 1 ステップ回して、艦ごとに d.step に渡った距離 */
function ranges(w: AnchorKitWorld, x: number, y: number, base: number): number[] {
  Object.assign(w.boat.state, { x, y });
  w.detectRangeM = base;
  anchorStep(w);
  return w.destroyers.ships.map((d) => d.lastDetectM);
}

describe('背に岸の距離（us_06・揺らぎなし。卯月 (3620, 2380)・空知丸 (3000, 2760)・南の岸 y 3,000）', () => {
  const p = anchorKit().setup.backdrop!;
  it('data の値: detect_factor 0.6・behind_m 2,000（X² で比べる）。閃光は Elco 80 の 1,200 m', () => {
    expect([p.detectFactor, p.behindM, p.behindM2, FLASH_M]).toEqual([0.6, 2000, 4_000_000, 1200]);
  });
  it('背に岸の時だけ 0.6 倍: 卯月から浜沿い (4400, 2850) は背に岸・空知丸からは無し、北 (3620, 1500) はどちらも無し（巡航の 1,200 m）', () => {
    const w = anchorKit();
    expect(ranges(w, 4400, 2850, 1200)).toEqual([1200 * 0.6, 1200]);
    expect(w.destroyers.backdrop!.behindMask).toBe(0b01);
    expect(ranges(w, 3620, 1500, 1200)).toEqual([1200, 1200]);
    expect(w.destroyers.backdrop!.behindMask).toBe(0);
    expect(ranges(w, 3620, 2900, 480)).toEqual([480 * 0.6, 480 * 0.6]); // 卯月の真南の浜は両方から背に岸（停止の 480 → 288 m）
  });
  it('機銃の閃光の間（世界の距離は閃光の 1,200 m 以上）は係数で 1,200 m を切らない。閃光が無ければ 0.6 倍', () => {
    const w = anchorKit();
    w.arms = { flashM: FLASH_M };
    expect(ranges(w, 4400, 2850, Math.max(480, FLASH_M))).toEqual([FLASH_M, FLASH_M]); // 停止で撃った: 世界の距離は 1,200 m・背に岸でも 1,200 m
    expect(ranges(w, 4400, 2850, 1920)).toEqual([FLASH_M, 1920]); // 全速（1,920 m）× 0.6 ＝ 1,152 m は閃光の 1,200 m の下 → 1,200 m
    w.arms = { flashM: 0 }; // 閃光が消えた（hold_s の後）
    expect(ranges(w, 4400, 2850, 1920)).toEqual([1920 * 0.6, 1920]);
    expect(ranges(w, 4400, 2850, 2496)).toEqual([2496 * 0.6, 2496]); // 史実モードの全速 × 0.6 ＝ 1,497.6 m は閃光より上
  });
  it('照らされている（探照灯・星弾・照明弾）間は掛けない（光の中では背景が効かない）。ビットも立たない', () => {
    const w = anchorKit();
    w.enemy.illuminated = true;
    expect(ranges(w, 4400, 2850, 1200)).toEqual([1200, 1200]);
    expect(w.destroyers.backdrop!.behindMask).toBe(0);
    w.enemy.illuminated = false;
    expect(ranges(w, 4400, 2850, 1200)[UZ]).toBe(720);
  });
  it('水上機の照明弾の光の中なら下限は照明弾の距離（v0.8.1 IP2 から us_06 に夜の水上機＝照明弾の 6,000 m。S2〜IP1 は水上機が無く 0＝720 m だった。照らされていれば係数なし）', () => {
    const w = anchorKit();
    const flareM = w.setup.seaplane!.flareRevealM;
    expect(flareM).toBe(6000);
    w.flareLit = true;
    expect(ranges(w, 4400, 2850, 1200)[UZ]).toBe(flareM);
    w.flareLit = false;
    expect(ranges(w, 4400, 2850, 1200)[UZ]).toBe(720);
  });
  it('煙幕と掛け算: 世界の距離（煙幕込み）× 0.6', () => {
    const w = anchorKit();
    const s = w.setup;
    const smoke = enemyDetectRangeM(s.baseDetectM, speedFactorForBand('cruise', s.vis.speedFactor), s.vis, true);
    const open = enemyDetectRangeM(s.baseDetectM, speedFactorForBand('cruise', s.vis.speedFactor), s.vis, false);
    expect(smoke).toBeLessThan(open);
    expect(ranges(w, 4400, 2850, smoke)).toEqual([smoke * 0.6, smoke]);
  });
  it('?debug&nobackdrop（backdropOff）: 背に岸の block が無く、どの艦も世界の距離のまま（止まった艦はそのまま）', () => {
    const w = anchorKit({ backdropOff: true });
    expect([w.setup.backdrop, w.destroyers.backdrop]).toEqual([undefined, null]);
    expect(w.destroyers.anchors).not.toBe(null);
    const r = ranges(w, 4400, 2850, 1200);
    expect(r).toEqual([1200, 1200]);
    for (const d of w.destroyers.ships) expect(Object.is(d.lastDetectM, w.detectRangeM)).toBe(true);
  });
  it('HUD の 3 行目（D-B5）: 最寄りの浮いている艦に最後に渡した値（無ければ世界の値）。背に岸の秒は最寄りの艦に対して効いていた間（AnchorLog）', () => {
    const w = anchorKit();
    ranges(w, 4400, 2850, 480);
    const bd = w.destroyers.backdrop!;
    const g = w.destroyers;
    expect(g.nearestAfloatIndex(4400, 2850)).toBe(UZ);
    expect(bd.rangeAt(g.nearestAfloatIndex(4400, 2850), 480)).toBe(288);
    expect(bd.rangeAt(SM, 480)).toBe(480);
    expect(bd.rangeAt(-1, 480)).toBe(480);
    const log = g.anchors!.log;
    runUntil(w, 10);
    expect(log.backdropOn).toBe(true);
    expect(log.backdropS).toBeCloseTo(10, 6);
    Object.assign(w.boat.state, { x: 3620, y: 1500 });
    runUntil(w, 12);
    expect(log.backdropOn).toBe(false);
    expect(log.backdropS).toBeCloseTo(10, 6); // 背に岸の無い間は増えない
    const mt = code('src/systems/mission-telemetry.ts');
    expect(mt).toContain('if (g && g.backdrop) t.detectRangeM = g.backdrop.rangeAt(g.nearestAfloatIndex(s.x, s.y), w.detectRangeM);');
  });
  it('AI に効く: 卯月から 589 m の浜寄り（背に岸）の自艇は、停止（480 → 288 m）なら見つからず止まったまま、巡航（1,200 → 720 m）なら見つかる', () => {
    const w = anchorKit();
    Object.assign(w.boat.state, { x: 3620 + 450, y: 2380 + 380 }); // 卯月から 589 m・南東の浜寄り（背に岸）
    w.detectRangeM = 480;
    runUntil(w, 20);
    expect(w.destroyers.ships[UZ]!.ai.playerDetected).toBe(false);
    expect(w.destroyers.anchors!.state.stage[UZ]).toBe(0);
    w.detectRangeM = 1200; // 巡航なら 720 m の内
    runUntil(w, 21);
    expect(w.destroyers.ships[UZ]!.ai.playerDetected).toBe(true);
  });
});

describe('source（L34・§7）', () => {
  it('shore-backdrop は landBehind（2 乗の比べ）で、平方根・atan2・hypot を使わない。destroyer-step の背に岸の無い道は世界の距離そのもの', () => {
    const s = code('src/systems/shore-backdrop.ts');
    expect(s).toContain('landBehind(this.lines, ship.x, ship.y, boat.x, boat.y, this.p.behindM2)');
    expect(s).toContain('if (!w.enemy.illuminated && landBehind(');
    expect(s).not.toMatch(/Math\.(sqrt|hypot|atan2)/);
    expect(code('src/systems/destroyer-step.ts')).toContain('const bd = g.backdrop;');
  });
});
