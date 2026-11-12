// v0.7.0 IP4: 隊の中の「他の艦の光」は自分で点けた光だけ（core/own-light）。2 隻が互いの illuminated を読むと灯りが消えても照らされたままになる輪の再現と、その直し。
import { describe, expect, it } from 'vitest';
import enemies from '../data/enemies.json';
import type { BoatState } from '../src/core/boat-motion';
import { createGunneryState, gunneryParamsFromData, isEnemyGunneryDataRecord, updateIllumination, type GunneryParams, type GunneryState } from '../src/core/gunnery';
import { litByOwnLight } from '../src/core/own-light';

const rawEnemy: unknown = enemies.enemies.find((e) => e.id === 'us_destroyer');
if (!isEnemyGunneryDataRecord(rawEnemy)) throw new Error('enemy gunnery');
const GP: GunneryParams = gunneryParamsFromData(rawEnemy);
const REAL = 1 / 60;

/** 艦 0（駆逐艦。北向き）と艦 1（輸送船。自分では見つけない）。艇は艦 0 の真北 500 m に止まっている（近づかない＝星弾は撃たない） */
function world(): { ships: BoatState[]; g: GunneryState[]; player: BoatState } {
  const ships: BoatState[] = [
    { x: 0, y: 0, headingDeg: 0, speedMps: 0 },
    { x: 300, y: 200, headingDeg: 0, speedMps: 0 },
  ];
  return { ships, g: ships.map((s) => createGunneryState(GP, 8, s.headingDeg)), player: { x: 0, y: -500, headingDeg: 90, speedMps: 0 } };
}

/** 世界の順（destroyer-step）で 1 ステップ: 艦の順に、他の艦の光を externalLit に渡して照射を更新する。own=false は直す前（他の艦の illuminated を読む） */
function step(w: ReturnType<typeof world>, detected0: boolean, own: boolean): void {
  for (let i = 0; i < w.g.length; i++) {
    let lit = false;
    for (let k = 0; k < w.g.length; k++) if (k !== i && (own ? litByOwnLight(w.g[k]!) : w.g[k]!.illuminated)) lit = true;
    updateIllumination(w.g[i]!, w.ships[i]!, w.player, i === 0 && detected0, GP, REAL, false, lit);
  }
}

/** 艦 0 の探照灯が艇を捉えるまで発見中で回す（点灯の遅れ＋艦首からの掃引）。捉えたステップ数を返す */
function lightUp(w: ReturnType<typeof world>, own: boolean): number {
  for (let n = 1; n <= 60 * 10; n++) {
    step(w, true, own);
    if (w.g[0]!.light.illuminating) return n;
  }
  return -1;
}

describe('litByOwnLight（v0.7.0 IP4）', () => {
  it('探照灯の扇か自分の星弾なら true。他の艦の光・照明弾（externalLit）だけでは false', () => {
    const g = createGunneryState(GP, 8, 0);
    expect(litByOwnLight(g)).toBe(false);
    g.illuminated = true; // externalLit だけで照らされた扱い
    expect(litByOwnLight(g)).toBe(false);
    g.light.illuminating = true;
    expect(litByOwnLight(g)).toBe(true);
    g.light.illuminating = false;
    g.star.illuminating = true;
    expect(litByOwnLight(g)).toBe(true);
  });

  it('駆逐艦の探照灯が艇を照らしている間は輸送船も照らされた扱い（v0.4.7 のまま）', () => {
    const w = world();
    expect(lightUp(w, true)).toBeGreaterThan(0);
    step(w, true, true);
    expect([w.g[0]!.light.illuminating, w.g[1]!.illuminated]).toEqual([true, true]);
  });

  it('2 隻の輪: 他の艦の illuminated を読むと灯りが消えても両方が照らされたまま。自分の光だけを読めば、灯りが消えたステップで両方 false', () => {
    const before = world();
    expect(lightUp(before, false)).toBeGreaterThan(0);
    step(before, true, false);
    for (let n = 0; n < 60 * 30; n++) step(before, false, false); // 見失って 30 秒
    expect([before.g[0]!.light.on, before.g[0]!.light.illuminating, before.g[0]!.star.illuminating]).toEqual([false, false, false]);
    expect([before.g[0]!.illuminated, before.g[1]!.illuminated]).toEqual([true, true]); // 直す前の輪（実機 3 回目の後の報告）

    const after = world();
    expect(lightUp(after, true)).toBeGreaterThan(0);
    step(after, true, true);
    expect([after.g[0]!.illuminated, after.g[1]!.illuminated]).toEqual([true, true]);
    step(after, false, true); // 見失ったステップ: 探照灯が消える
    expect([after.g[0]!.light.illuminating, after.g[0]!.illuminated, after.g[1]!.illuminated]).toEqual([false, false, false]);
    for (let n = 0; n < 60 * 30; n++) step(after, false, true);
    expect([after.g[0]!.illuminated, after.g[1]!.illuminated]).toEqual([false, false]);
  });

  it('隊の読み手（destroyer-group の othersOwnLit）は他の艦の illuminated を読まない', async () => {
    const { readFileSync } = await import('node:fs');
    const s = readFileSync(new URL('../src/systems/destroyer-group.ts', import.meta.url), 'utf8');
    expect(s).toContain('litByOwnLight(this.fires[k]!.state)');
    expect(s).not.toContain('othersIlluminated');
    const st = readFileSync(new URL('../src/systems/destroyer-step.ts', import.meta.url), 'utf8');
    expect(st).toContain('const lit = w.flareLit || g.othersOwnLit(i);');
  });
});
