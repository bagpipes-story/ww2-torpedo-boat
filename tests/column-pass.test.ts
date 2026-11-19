// v0.8.2 IP1（実機 1 回目のユーザー「魚雷が船体の下を通ってしまうことが多くなった気がします」「戦艦と時雨、あと最上でも起こった」）: 片道の列（us_05）の通過の半径。
// 凍結の systems/torpedo-pool は、走る魚雷が最寄りの浮いている艦の中心から通過の半径の外へ遠ざかり始めたステップで外れに決め、以後は当たりを見ない。
// 道の違う列では、前の艦（時雨・前の戦艦）を通り過ぎた所で外れに決まった魚雷が、後ろの艦の絵の下を抜けた（ヘッドレスの測りで us_05 の 476 本のうち 100 本。
// 描いた船体を通って当たらなかった魚雷はみなこの形で、武装前・当たりのカプセルの外・円と絵のずれは 0）。片道の列だけ通過の半径を Infinity にする
// （systems/column-kits の columnPassRadius2。列の kits の無い任務は今のまま＝us_02・us_04 も同じ形があるのは CHANGELOG の IP1）。本物の TorpedoPool（絵は鎖の偽物）で回す。
import { describe, expect, it } from 'vitest';
import { gameData, getBoatTorpedoCount } from '../src/config/game-data';
import type { ColumnKit } from '../src/config/column-mission-data';
import { columnPassRadius2 } from '../src/systems/column-kits';
import { buildWorldSetup } from '../src/systems/world-setup';
import { DT, TorpedoPool, fakeShip, scene, spies } from './torpedo-free-kit';

/** 北から南へ 1 本: 前の小さい艦（中心の 150 m 東を通る＝当たらない）を通り過ぎてから、後ろの長い艦の船体を横切る */
function run(passRadius2: number): { hit: number; miss: number; target: number; resolvedBeforeB: boolean } {
  const s = buildWorldSetup(gameData, 'us_05');
  const pool = new TorpedoPool(scene, s.torpedoParams, getBoatTorpedoCount(gameData, s.mission.playerBoatId), s.mission.bounds);
  const a = fakeShip(3150, 1400); // 東西 100 m（時雨の代わり。魚雷は中心の西 150 m を通る）
  const b = fakeShip(3000, 1700); // 同じ形（戦艦の代わり。魚雷は中心を横切る）
  const ev = spies();
  let target = -1;
  const onHit = ev.onHit;
  ev.onHit = (i, x, y, st) => { target = i; onHit(i, x, y, st); };
  const t = pool.fire(3000, 1000, 180, false, false, 0, 700)!;
  let resolvedBeforeB = false;
  for (let k = 0; k < 2000 && t.active; k++) {
    pool.step(DT * s.timeScale, DT, [a, b], passRadius2, ev);
    if (t.active && t.y < 1690 && t.y > 1450 && t.resolved) resolvedBeforeB = true;
  }
  return { hit: ev.hit, miss: ev.miss, target, resolvedBeforeB };
}

describe('片道の列の通過の半径（v0.8.2 IP1）', () => {
  const base = (50 + 12) ** 2; // 偽の艦の半長 ＋ 幅（destroyer-setup の式と同じ形）
  it('今の任務の半径: 前の艦を通り過ぎた所で外れに決まり、後ろの艦の船体を横切っても当たらない（直す前の us_05 と同じ形）', () => {
    expect(columnPassRadius2(base, undefined)).toBe(base);
    expect(run(base)).toEqual({ hit: 0, miss: 1, target: -1, resolvedBeforeB: true });
  });
  it('片道の列（kits のある列）は Infinity: 前の艦を通り過ぎても決めず、後ろの艦に当たる', () => {
    const r2 = columnPassRadius2(base, [{} as ColumnKit]);
    expect(r2).toBe(Infinity);
    expect(run(r2)).toEqual({ hit: 1, miss: 0, target: 1, resolvedBeforeB: false });
  });
  it('us_05 の setup には列の kits があり、ほかの任務には無い（Infinity は us_05 だけ）', () => {
    for (const id of ['us_01', 'us_02', 'us_03', 'us_04', 'us_06', 'jp_04']) expect(buildWorldSetup(gameData, id).transit?.column, id).toBeUndefined();
    expect(buildWorldSetup(gameData, 'us_05').transit!.column!.length).toBe(7);
  });
});
