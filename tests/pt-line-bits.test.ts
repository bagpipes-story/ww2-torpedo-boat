// 2 行目のキャッシュのキーのビットの表（v0.6.6 の準備。spec-v066 §D.7。表と検査の本体は tests/pt-line-bits-kit）: v0.6.5（main 55efa4d）の変種について、
// (1) 同じ変種の欄は重ならない、(2) 1 つの値を動かすとその欄のビットだけが変わり、キーは変種の欄の内に収まる、(3) 同じモードの違う変種は種類のビット（下 3 ビット）か
// K_BURST・K_SILENCED・K_TARGET で区別される、(4) 値は 0 < key < 2³¹、(5) v0.6.5 の値を数で pin する（標的の種類 0 自艇・1 大発。隼艇の欄を足しても変わらない＝S5 の関門）。
// 隼艇の変種（v0.6.6 の S5）は tests/pt-line-bits-gunboat。
import { describe, expect, it } from 'vitest';
import { PINNED, VARIANTS, bit, expectDistinct, expectFields, keysOf } from './pt-line-bits-kit';

describe('2 行目のキーのビットの表（v0.6.6 の準備。spec-v066 §D.7）', () => {
  it.each(VARIANTS.map((v) => [v.name, v] as const))('%s: 欄は重ならず、値を動かすとその欄だけ変わり、キーは欄の内で 0 < key < 2³¹', (_n, v) => {
    expectFields(v);
  });

  it('同じモードの違う変種は種類のビット（下 3 ビット）か K_BURST・K_SILENCED・K_TARGET で区別される（ほかの変種の印を持たない）', () => {
    expectDistinct(VARIANTS);
  });

  it('v0.6.5（main 55efa4d）の値と同じ（標的の種類 0 自艇・1 大発）。航過・接触のキーに隼艇の印（bit 30）、出来事のキーに隼艇の砲の印（bit 15）は立たない', () => {
    const got: Record<string, number[]> = {};
    for (const v of VARIANTS) got[v.name] = keysOf(v);
    expect(got).toEqual(PINNED);
    for (const v of VARIANTS) {
      if (v.group === 'pass' || v.group === 'contact') for (const k of got[v.name]!) expect(k & bit(30), `${v.name} ${k}`).toBe(0);
      if (v.group === 'event') for (const k of got[v.name]!) expect(k & bit(15), `${v.name} ${k}`).toBe(0);
    }
  });
});
