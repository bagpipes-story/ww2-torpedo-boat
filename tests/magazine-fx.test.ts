// v0.8.2 S2b（spec-v0820 §4.11 D-A4・§9 の 8、lead の L31・L33）: 弾薬庫の誘爆（轟沈）の見た目の持ち主 systems/magazine-fx（絵だけ。Phaser に依らない＝爆発のプールは偽物）。
// - 作るのは隊に弾薬庫のある世界だけ（MagazineFx.of。world-art の 1 行。弾薬庫が付く任務は us_05 だけ＝tests/magazine-world）。誘爆が無ければ何も予約しない・何も呼ばない。
// - 1 回の誘爆: 0 秒に艦の中央の大きい爆発 1 つ（大きさ MAGAZINE_BLAST_SIZE）・0.25 秒と 0.5 秒に艦首の向きへ ±0.3 L の 2 次の爆発（magazineSecondary＝2 段目の大きい版の途中の枠を飛ばす今の secondary）。回した艦でも位置が合う。
// - 時計は見た目の実秒（予定の秒に一番近いフレーム）。同じ誘爆は 2 度見せない。2 隻同時でも枠（4）に収まる。
// - 作法: 毎フレームの口（update）と誘爆の口（showNew・schedule）に確保の形が無い（tests/core-rules-kit の ALLOC_PATTERNS）・音は explosion-fx の今の呼び方だけ（新しい音の id なし）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MAGAZINE_BLAST_SIZE, MAGAZINE_FX_PENDING, MAGAZINE_SECONDARY_AT, MAGAZINE_SECONDARY_DELAY_S, MAGAZINE_SINK_SCALE } from '../src/config/capital-art-config';
import { MagazineFx, type MagazineBlastPool, type MagazineFxWorldView } from '../src/systems/magazine-fx';
import { ALLOC_PATTERNS, code } from './core-rules-kit';

type Call = [string, number, number, ...unknown[]];
/** 呼ばれた順を残す偽の爆発のプール（ExplosionFx の play・secondary の形） */
function poolOf(): MagazineBlastPool & { calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    play: (x, y, dud, torpedo, size) => void calls.push(['play', x, y, dud, torpedo, size]),
    magazineSecondary: (x, y) => void calls.push(['secondary', x, y]),
  };
}
const L_FUSO = 425.5;
/** 7 隻の隊（5・6 が戦艦。絵の長さは displayHeight）と弾薬庫の記録 */
function worldOf(heading = 90): { w: MagazineFxWorldView; mag: { detonations: number; log: { n: number; detonatedAtS: Float64Array } }; ships: { state: { x: number; y: number; headingDeg: number }; sprite: { displayHeight: number } }[] } {
  const ships = Array.from({ length: 7 }, (_, i) => ({ state: { x: 1000 + i * 100, y: 2000, headingDeg: heading }, sprite: { displayHeight: i >= 5 ? L_FUSO : 236 } }));
  const mag = { detonations: 0, log: { n: 7, detonatedAtS: new Float64Array(7).fill(NaN) } };
  return { w: { destroyers: { magazine: mag, ships } }, mag, ships };
}
const detonate = (o: ReturnType<typeof worldOf>, i: number, atS = 12.5): void => {
  o.mag.log.detonatedAtS[i] = atS;
  o.mag.detonations++;
};

describe('作るのは弾薬庫のある世界だけ（L31）', () => {
  it('隊が無い・弾薬庫が null か無い世界は null（world-art は毎フレーム何もしない）。ある世界だけ作る', () => {
    const pool = poolOf();
    expect(MagazineFx.of(pool, { destroyers: null })).toBeNull();
    expect(MagazineFx.of(pool, { destroyers: { magazine: null, ships: [] } })).toBeNull();
    expect(MagazineFx.of(pool, { destroyers: { ships: [] } })).toBeNull();
    expect(MagazineFx.of(pool, worldOf().w)).toBeInstanceOf(MagazineFx);
  });
  it('world-art: 爆発のプールの後に 1 回作り（弾薬庫が無ければ null）、爆発の更新の後・沈没の段の前に進める', () => {
    const wa = code('src/systems/world-art.ts');
    expect(wa).toContain('this.magazine = MagazineFx.of(this.explosions, w);');
    expect(wa.indexOf('this.explosions = new ExplosionFx(')).toBeLessThan(wa.indexOf('this.magazine = MagazineFx.of('));
    expect(wa).toContain('this.magazine?.update(realDt);');
    expect(wa.indexOf('this.explosions.update(realDt);')).toBeLessThan(wa.indexOf('this.magazine?.update(realDt);'));
    expect(wa.indexOf('this.magazine?.update(realDt);')).toBeLessThan(wa.indexOf('this.sink.update(realDt);'));
  });
});

describe('誘爆の見た目（D-A4）', () => {
  it('誘爆が無ければ何も予約せず何も呼ばない（600 フレーム）', () => {
    const pool = poolOf();
    const fx = MagazineFx.of(pool, worldOf().w)!;
    for (let k = 0; k < 600; k++) fx.update(1 / 60);
    expect(pool.calls).toEqual([]);
    expect(fx.pendingCount).toBe(0);
  });
  it.each([90, 30, 225])('針路 %i°: 0 秒に中央の大きい爆発 1 つ・0.25 秒に +0.3 L・0.5 秒に −0.3 L の 2 次の爆発。以後は何も呼ばない', (h) => {
    const pool = poolOf();
    const o = worldOf(h);
    const fx = MagazineFx.of(pool, o.w)!;
    fx.update(1 / 64);
    detonate(o, 5);
    fx.update(1 / 64); // 誘爆の後の最初の描画のフレーム＝0 秒
    expect(pool.calls).toEqual([['play', 1500, 2000, false, false, MAGAZINE_BLAST_SIZE]]);
    expect(fx.pendingCount).toBe(2);
    const at = (k: number): [number, number] => {
      const a = MAGAZINE_SECONDARY_AT[k]! * L_FUSO;
      return [1500 + Math.sin((h * Math.PI) / 180) * a, 2000 - Math.cos((h * Math.PI) / 180) * a];
    };
    const when: number[] = [];
    for (let f = 1; f <= 64 * 3; f++) {
      const before = pool.calls.length;
      fx.update(1 / 64);
      if (pool.calls.length > before) when.push(f / 64);
    }
    expect(when).toEqual([...MAGAZINE_SECONDARY_DELAY_S]); // 1/64 秒の刻みで 0.25・0.5 秒ちょうど
    expect(pool.calls.length).toBe(3);
    for (const k of [0, 1]) {
      const c = pool.calls[k + 1]!;
      expect(c[0]).toBe('secondary');
      expect(c[1]).toBeCloseTo(at(k)[0], 9);
      expect(c[2]).toBeCloseTo(at(k)[1], 9);
    }
    expect(fx.pendingCount).toBe(0);
  });
  it('60 fps の刻みでも予定の秒に一番近いフレーム（15・30 フレーム目）に出す', () => {
    const pool = poolOf();
    const o = worldOf();
    const fx = MagazineFx.of(pool, o.w)!;
    detonate(o, 6);
    fx.update(1 / 60);
    const frames: number[] = [];
    for (let f = 1; f <= 120; f++) {
      const before = pool.calls.length;
      fx.update(1 / 60);
      if (pool.calls.length > before) frames.push(f);
    }
    expect(frames).toEqual([15, 30]);
  });
  it('同じ誘爆は 2 度見せない。2 隻が同じフレームに誘爆しても大きい爆発 2 つ・2 次 4 つ（枠 4 に収まる）。後の誘爆は後の艦だけ', () => {
    const pool = poolOf();
    const o = worldOf();
    const fx = MagazineFx.of(pool, o.w)!;
    detonate(o, 5);
    detonate(o, 6);
    fx.update(1 / 60);
    expect(pool.calls.filter((c) => c[0] === 'play').map((c) => c[1])).toEqual([1500, 1600]);
    expect(fx.pendingCount).toBe(4);
    for (let k = 0; k < 120; k++) fx.update(1 / 60);
    expect(pool.calls.filter((c) => c[0] === 'secondary')).toHaveLength(4);
    expect(MAGAZINE_FX_PENDING).toBeGreaterThanOrEqual(4);
    pool.calls.length = 0;
    o.mag.detonations++; // 数だけ増えても、記録に新しい艦が無ければ何も見せない
    for (let k = 0; k < 60; k++) fx.update(1 / 60);
    expect(pool.calls).toEqual([]);
  });
});

describe('作法（§7・§9 の 8）と定数', () => {
  /** クラスのメソッドの本体（中かっこを数えて取り出す） */
  const method = (src: string, name: string): string => {
    const i = src.indexOf(`  ${name}(`);
    const open = src.indexOf('{', src.indexOf(')', i));
    let j = open + 1;
    for (let d = 1; d > 0; j++) d += src[j] === '{' ? 1 : src[j] === '}' ? -1 : 0;
    return src.slice(open + 1, j - 1);
  };
  it('毎フレームの口と誘爆の口に確保の形が無い（待つ 2 次の爆発は固定長の型付き配列）。乱数・Math.random・音の層の import なし・300 行以下', () => {
    const s = code('src/systems/magazine-fx.ts');
    for (const name of ['update', 'showNew', 'schedule']) {
      const body = method(s, name);
      expect(body.length, name).toBeGreaterThan(20);
      for (const re of ALLOC_PATTERNS) expect(body, `${name} ${re}`).not.toMatch(re);
    }
    expect(s).toMatch(/new Float64Array\(MAGAZINE_FX_PENDING\)/);
    expect(s).not.toMatch(/Math\.random|SeededRng|sfx|tweens|scene\.add/);
    expect(readFileSync('src/systems/magazine-fx.ts', 'utf8').split('\n').length - 1).toBeLessThanOrEqual(300);
  });
  it('音は explosion-fx の今の呼び方だけ（大きい版 blast_l・2 次 blast_s・0.5 秒の内は重ねない）。ExplosionLook と mission-effects は変えない（新しい見た目の種類なし）', () => {
    const ef = code('src/systems/explosion-fx.ts');
    expect(ef).toContain("sfxAt(dud ? 'blast_s' : torpedo ? 'torp_hit' : 'blast_l', x, y);");
    expect(ef).toContain("sfxAt('blast_s', x, y, SFX_SECONDARY_BLAST.gain, 1, SFX_SECONDARY_BLAST.minIntervalS);");
    expect(code('src/systems/world-events.ts')).toContain("export type ExplosionLook = 'blast' | 'torpedo';");
    expect(code('src/systems/mission-effects.ts')).toContain("explosions?.play(x, y, dud, look === 'torpedo');");
  });
  it('定数（見た目。強さの値ではない）: 2 次の遅れ 0.25・0.5 秒・±0.3 L・大きい爆発は今の大きい版より大きい・沈む長さ 0.5 倍', () => {
    expect([...MAGAZINE_SECONDARY_DELAY_S]).toEqual([0.25, 0.5]);
    expect([...MAGAZINE_SECONDARY_AT]).toEqual([0.3, -0.3]);
    expect(MAGAZINE_BLAST_SIZE).toBeGreaterThan(1);
    expect(MAGAZINE_SINK_SCALE).toBe(0.5);
  });
});
