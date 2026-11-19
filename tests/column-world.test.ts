// v0.8.2 S2（spec-v0820 §4.2 D-C3〜D-C7・§8 の S2「column-world」、lead の L19・L20・L26）: 片道の列の世界の配線（systems/column-kits・destroyer-group・column-roles・destroyer-step・
// entities/destroyer の setAiParams）を、本物の DestroyerGroup と本物の destroyer-step の小さな世界（tests/column-world-kit。Phaser なし）で確かめる:
// - kits: us_05 の艦ごとの寸法・列の AI・砲・KPI の旗・レーダーの種類・絵の鍵（S2 は既定の駆逐艦の絵）・艦種。ハードは見張りの駆逐艦が 8 隻目。
// - ほかの任務（ハードも）の隊は今の値の同じ物（gunneryAt・kpiAt＝0 ≤ i < destroyerCount・radarKindAt・絵の鍵＝作った絵の鍵・寸法と AI の物）。見張り・弾薬庫・艦種は無い。
// - 片道: 入りの秒と道のずれ・東の縁の外で去って戻らない・夜明けの前にみな去って allOut。
// - 見張り: 時雨が自艇を見つけたステップに離れ（見張りの AI・退く旗を下ろす・哨戒の針路 090）、見失って体感 40 秒で戻る（列の AI・東へ退く）。命中スローで延びる。夜明けに離れていれば
//   夜明けのステップに戻り、夜明けの退く向きのまま東へ去る。見張りでない艦の AI は替わらない。
// - 乱数: 砲 seed+1・見張り seed+17 の 2 つの系列を艦の順に引く（2 回回して同じ・引いた回数も同じ）。
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { hasHardVariant } from '../src/config/mission-data';
import { SHIP_ART_DEFAULT_KEY } from '../src/config/ship-art-config';
import { RADAR_KIND_SHIP, RADAR_KIND_SMALL } from '../src/core/radar';
import { TRANSIT_GONE, TRANSIT_IN, TRANSIT_WAIT } from '../src/core/ship-transit';
import { ShipMagazine } from '../src/systems/ship-magazine';
import { initStraitTelemetry, refreshStraitTelemetry } from '../src/systems/strait-telemetry';
import { aiParamsOf, boatAt, colPhases, colRun, colStep, colWorld, groupOf, setupOf, type ColWorld } from './column-world-kit';
import { code, imports } from './core-rules-kit';
import { SRC } from './sfx-rules-kit';

const SHIGURE = 4;
const { hit_slowmo_factor: SLOW_F, hit_slowmo_seconds: SLOW_S } = gameData.hitRateModel.feel;
const PROTO_IDS = (gameData.missionsSeed.missions as unknown as Record<string, unknown>[]).filter((m) => m['v0_1_prototype']).map((m) => m['id'] as string);
const SHIP_TEX = /^tex-(destroyer|transport|subchaser|battleship|cruiser)/;

describe('kits（L19）: us_05 の列の艦ごとの記録', () => {
  it('ノーマル 7 隻: 寸法・列の AI・砲は kits の同じ物、KPI の旗は駆逐艦の記録だけ、レーダーはみな艦、絵の鍵は記録の id から（S2b から戦艦・重巡の絵）、艦種は記録の ship_class', () => {
    const s = setupOf('us_05');
    const keys: string[] = [];
    const g = groupOf(s, undefined, undefined, keys);
    const kits = s.transit!.column!;
    expect([g.total, g.destroyerCount, g.objectiveSinks, g.transportIndex, g.picketIndex]).toEqual([7, 7, 7, -1, -1]);
    expect(kits.map((k) => k.enemyId)).toEqual(['ijn_destroyer', 'ijn_destroyer', 'ijn_destroyer', 'ijn_cruiser_mogami', 'ijn_destroyer', 'ijn_battleship_fuso', 'ijn_battleship_fuso']);
    g.ships.forEach((d, i) => {
      expect(d.spec, `${i}`).toBe(kits[i]!.spec);
      expect(aiParamsOf(d), `${i}`).toBe(kits[i]!.lineAi);
      expect(g.gunneryAt(i), `${i}`).toBe(kits[i]!.gunnery);
    });
    expect(g.ships.map((d) => [d.spec.lengthM, d.spec.hitsToSink])).toEqual([[118, 2], [118, 2], [118, 2], [200.6, 3], [118, 2], [212.75, 6], [212.75, 6]]);
    expect([-1, 0, 1, 2, 3, 4, 5, 6, 7].map((i) => g.kpiAt(i))).toEqual([false, true, true, true, false, true, false, false, false]);
    expect(Array.from(g.kits.radarKind)).toEqual(Array(7).fill(RADAR_KIND_SHIP));
    // v0.8.2 S2b で直した（S2 は 7 隻とも既定の駆逐艦の絵の代用＝当たりと絵の大きさが食い違った）: 戦艦・重巡は記録 × sprite_scale の新しい絵（D-A1・D-A2）、駆逐艦 4 隻は陽炎型のまま
    const want = ['tex-destroyer', 'tex-destroyer', 'tex-destroyer', 'tex-cruiser-mogami', SHIP_ART_DEFAULT_KEY, 'tex-battleship-fuso', 'tex-battleship-fuso'];
    expect(g.kits.artKeys).toEqual(want);
    expect(keys.filter((k) => SHIP_TEX.test(k))).toEqual(want);
    expect(g.kits.classes).toEqual(['destroyer', 'destroyer', 'destroyer', 'heavy_cruiser', 'destroyer', 'battleship', 'battleship']);
    // v0.8.2 IP1: 片道の列は通り過ぎで外れに決めない（Infinity。systems/column-kits の columnPassRadius2）。S2〜S4 は艦の通過の半径の最大（戦艦の kits[5]）だった
    expect(g.passRadius2).toBe(Infinity);
    expect(kits[5]!.passRadius2).toBe(Math.max(s.destroyer!.passRadius2, ...kits.map((k) => k.passRadius2)));
    // 列の AI は最大速力だけ列の速さ（18 kt）・見張りの AI は記録の値そのまま（時雨だけ）
    expect(kits.map((k) => k.screenAi !== null)).toEqual([false, false, false, false, true, false, false]);
    expect(kits[SHIGURE]!.screenAi!.ramEnabled && kits[SHIGURE]!.screenAi!.maxSpeedMps > kits[SHIGURE]!.lineAi.maxSpeedMps).toBe(true);
    expect(g.roles!.plan).toEqual({ mask: 1 << SHIGURE, rejoinS: 40, chaseS: s.transit!.screenChaseS, cooldownS: s.transit!.screenCooldownS }); // 鎖は v0.8.2 S3b
  });
  it('ハード 8 隻: 8 隻目は見張りの駆逐艦（KPI に数える・見張りの役）。役は時雨と 8 隻目', () => {
    const s = setupOf('us_05', true);
    const g = groupOf(s);
    expect([g.total, g.destroyerCount, g.objectiveSinks]).toEqual([8, 8, 8]);
    expect(g.kpiAt(7)).toBe(true);
    expect(g.roles!.plan.mask).toBe((1 << SHIGURE) | (1 << 7));
    expect(aiParamsOf(g.ships[7]!)).toBe(s.transit!.column![7]!.lineAi);
  });
});

describe('kits（L19）: ほかの任務の隊は今の値の同じ物', () => {
  const cases: [string, boolean][] = PROTO_IDS.flatMap((id) => (hasHardVariant(gameData, id) ? [[id, false], [id, true]] : [[id, false]]) as [string, boolean][]);
  it('駆逐艦の隊のある任務（ハードも）: gunneryAt・kpiAt・radarKindAt・絵の鍵・寸法と AI は v0.8.1 の式の値（同じ物）。見張り・艦種・弾薬庫は無い', () => {
    let groups = 0;
    for (const [id, hard] of cases) {
      const s = setupOf(id, hard);
      if (!s.destroyer || s.transit?.column) continue;
      groups++;
      const keys: string[] = [];
      const g = groupOf(s, undefined, undefined, keys);
      const tag = `${id}${hard ? '&hard' : ''}`;
      const ds = s.destroyer;
      const first = ds.starts.length;
      for (let i = 0; i < g.total; i++) {
        const want = i < g.destroyerCount ? ds.gunnery : i === g.transportIndex ? s.transport!.gunnery : s.pickets!.gunnery;
        expect(g.gunneryAt(i), `${tag} ${i}`).toBe(want);
        expect(g.radarKindAt(i), `${tag} ${i}`).toBe(g.picketIndex >= 0 && i >= g.picketIndex ? RADAR_KIND_SMALL : RADAR_KIND_SHIP);
        const d = g.ships[i]!;
        const [spec, ai] = i < first ? [ds.spec, ds.shipAi] : i < g.destroyerCount ? [ds.spec, s.transit!.shipAi] : i === g.transportIndex ? [s.transport!.spec, s.transport!.shipAi] : [s.pickets!.spec, s.pickets!.shipAi];
        expect(d.spec, `${tag} ${i}`).toBe(spec);
        expect(aiParamsOf(d), `${tag} ${i}`).toBe(ai);
      }
      for (let i = -1; i <= g.total; i++) expect(g.kpiAt(i), `${tag} ${i}`).toBe(i >= 0 && i < g.destroyerCount);
      expect(g.kits.artKeys, tag).toEqual(keys.filter((k) => SHIP_TEX.test(k)));
      expect([g.kits.classes, g.roles, g.magazine], tag).toEqual([null, null, null]);
      expect(ShipMagazine.of(s.transit?.column, first, g.total, 1), tag).toBeNull();
      expect(g.passRadius2, tag).toBe(Math.max(ds.passRadius2, s.transport ? s.transport.passRadius2 : 0, s.pickets ? s.pickets.passRadius2 : 0));
    }
    expect(groups).toBeGreaterThanOrEqual(8); // us_01・us_02・us_04・us_06・jp_06 とそのハード
  });
});

describe('片道（揺らぎなし・見つからない夜）', () => {
  it('入りの秒（kits）と道のずれ・090°・東の縁の外 150 m で去って戻らない。最後の扶桑が去った後は戻りの残り 0・allOut（夜明けの 270 秒の前）', () => {
    const w = colWorld();
    const tr = w.setup.transit!;
    const g = w.destroyers;
    const entered: number[] = Array(7).fill(NaN);
    const gone: number[] = Array(7).fill(NaN);
    const ys: number[] = Array(7).fill(NaN);
    colRun(w, 268, (ww) => {
      const ph = ww.destroyers.transit!.state.phase;
      for (let i = 0; i < 7; i++) {
        if (ph[i] === TRANSIT_IN && Number.isNaN(entered[i]!)) [entered[i], ys[i]] = [ww.stepTimeS, ww.destroyers.ships[i]!.state.y];
        if (ph[i] === TRANSIT_GONE && Number.isNaN(gone[i]!)) gone[i] = ww.stepTimeS;
      }
    });
    entered.forEach((t, i) => expect(Math.abs(t - tr.enterAtS![i]!), `${i}`).toBeLessThanOrEqual(2 / 60));
    expect(ys).toEqual(tr.laneDyM!.map((dy) => tr.inbound.laneY + dy));
    gone.forEach((t, i) => expect(Math.abs(t - (tr.enterAtS![i]! + (tr.inbound.goneX - tr.inbound.appearX) / (tr.speedMps * w.setup.timeScale))), `${i}`).toBeLessThan(0.1));
    expect(colPhases(w)).toBe(String(TRANSIT_GONE).repeat(7));
    expect([g.transit!.pending, g.allOut, g.sunkCount, g.ships.every((d) => d.withdrawn)]).toEqual([0, true, 0, true]);
    expect(Math.max(...gone)).toBeLessThan(w.setup.durationS - 20);
    expect(g.roles!.st.leaves[SHIGURE]).toBe(0); // 見つからない夜は離れない
  });
  it('出撃の前（0 秒）は 7 隻ともまだ来ない（海域の外＝out）', () => {
    const w = colWorld();
    expect(colPhases(w)).toBe(String(TRANSIT_WAIT).repeat(7));
    expect(w.destroyers.ships.every((d) => d.out)).toBe(true);
  });
});

/** 自艇を時雨の北 450 m（体当たりの 400 m の外・ほかの道から 1,000 m 以上）について回らせ（時雨が海域に入る前は時雨の道の北 450 m の x 2,000）、見つける距離 500 m。farAtS から北東の隅へ */
function follow(w: ColWorld, farAtS: number): void {
  const sh = w.destroyers.ships[SHIGURE]!;
  const tr = w.setup.transit!;
  if (w.stepTimeS >= farAtS) boatAt(w, 6300, 200);
  else if (sh.out) boatAt(w, 2000, tr.inbound.laneY + tr.laneDyM![SHIGURE]! - 450);
  else boatAt(w, sh.state.x, sh.state.y - 450);
}
function screenNight(o: { farAtS: number; untilS: number; dawnS?: number; leash?: boolean; slow?: (w: ColWorld) => boolean }): { w: ColWorld; leftT: number; rejoinT: number; lostT: number } {
  const w = colWorld({ dawnS: o.dawnS, leash: o.leash ?? false }); // S2 の規則（鎖なし）を見る。鎖のある世界は下の S3b の 1 件
  w.detectRangeM = 500;
  colRun(w, o.untilS, (ww) => follow(ww, o.farAtS), o.slow);
  const r = w.destroyers.roles!;
  return { w, leftT: r.leftAtS[SHIGURE]!, rejoinT: r.rejoinedAtS[SHIGURE]!, lostT: o.farAtS + w.setup.vis.detectHoldS };
}

describe('見張り（時雨）: 離れる・戻る（L20）', () => {
  it('見つけたステップに離れる（海域に入ったステップ）。見失って体感 40 秒で戻り、列の AI で東へ退いて去る。ほかの艦の AI は列の AI のまま', () => {
    const { w, leftT, rejoinT, lostT } = screenNight({ farAtS: 150, untilS: 268 });
    const tr = w.setup.transit!;
    const kits = tr.column!;
    const sh = w.destroyers.ships[SHIGURE]!;
    expect(w.destroyers.roles!.st.leaves[SHIGURE]).toBe(1);
    expect(Math.abs(leftT - tr.enterAtS![SHIGURE]!)).toBeLessThanOrEqual(2 / 60);
    expect(Math.abs(rejoinT - (lostT + 40))).toBeLessThanOrEqual(3 / 60);
    expect(aiParamsOf(sh)).toBe(kits[SHIGURE]!.lineAi);
    expect([sh.ai.retiring, sh.ai.retireHeadingDeg]).toEqual([true, 90]);
    for (const i of [0, 1, 2, 3, 5, 6]) expect(aiParamsOf(w.destroyers.ships[i]!), `${i}`).toBe(kits[i]!.lineAi);
    expect(colPhases(w)).toBe(String(TRANSIT_GONE).repeat(7));
    expect(sh.withdrawn).toBe(true);
  });
  it('離れている間: 見張りの AI（記録の値）・退いていない・哨戒の針路 090・列の速さより速い（巡航 25 kt）', () => {
    const w = colWorld();
    const tr = w.setup.transit!;
    w.detectRangeM = 500;
    const sh = w.destroyers.ships[SHIGURE]!;
    const r = w.destroyers.roles!;
    while (r.st.left === 0) {
      follow(w, Infinity);
      colStep(w);
    }
    expect([r.st.away[SHIGURE], sh.ai.retiring, sh.ai.patrolHeadingDeg]).toEqual([1, false, 90]); // 離れたステップ（次のステップから見張りの AI。西の縁の内 700 m では端で中へ向き直す）
    expect(aiParamsOf(sh)).toBe(tr.column![SHIGURE]!.screenAi);
    colRun(w, 120, (ww) => follow(ww, Infinity));
    expect(r.st.away[SHIGURE]).toBe(1);
    expect([sh.ai.retiring, sh.ai.mode]).toEqual([false, 'cruise']);
    expect(Math.abs(sh.ai.patrolHeadingDeg - 90)).toBeLessThan(10);
    expect(sh.state.speedMps).toBeCloseTo(tr.column![SHIGURE]!.screenAi!.cruiseSpeedMps, 6);
    expect(sh.state.speedMps).toBeGreaterThan(tr.speedMps + 0.5);
  });
  it('命中スロー: 見失っている間のスロー 1 回で戻りは体感の時計の分だけ遅い（離れた秒は同じ）', () => {
    const a = screenNight({ farAtS: 150, untilS: 230 });
    const slowFrom = a.lostT + 5;
    const b = screenNight({ farAtS: 150, untilS: 230, slow: (w) => w.stepTimeS >= slowFrom && w.stepTimeS < slowFrom + SLOW_S });
    expect(a.leftT).toBe(b.leftT);
    expect(Math.abs(b.rejoinT - a.rejoinT - SLOW_S * (1 - SLOW_F))).toBeLessThanOrEqual(2 / 60);
  });
  it('夜明け: 離れていた時雨は夜明けのステップに戻った扱い（列の AI・夜明けの退く向き 090 のまま）。夜明けの後は離れない。みな東へ去る', () => {
    const dawnS = 140;
    const { w, rejoinT } = screenNight({ farAtS: Infinity, untilS: 268, dawnS });
    expect(Math.abs(rejoinT - dawnS)).toBeLessThanOrEqual(1 / 60 + 1e-9);
    const sh = w.destroyers.ships[SHIGURE]!;
    expect(aiParamsOf(sh)).toBe(w.setup.transit!.column![SHIGURE]!.lineAi);
    expect(sh.ai.retireHeadingDeg).toBe(90);
    expect(w.destroyers.roles!.st.leaves[SHIGURE]).toBe(1);
    expect(w.destroyers.ships.every((d) => d.out)).toBe(true);
    expect(w.destroyers.ships.filter((d) => d.state.x < w.setup.transit!.inbound.appearX).length).toBe(0); // 西へは退かない（片道・戻らない）
  });
});

describe('見張りの鎖（v0.8.2 S3b・lead の L37。us_05 の data の screen_chase_s・screen_cooldown_s）', () => {
  it('ついて回る自艇を見続けても、離れて chaseS たてば列の AI に戻って東へ退き、戻ってから cooldownS は離れない。その後まだ見ていればまた離れる', () => {
    const w = colWorld({ leash: true });
    const tr = w.setup.transit!;
    w.detectRangeM = 500;
    const [chase, cool] = [tr.screenChaseS!, tr.screenCooldownS!];
    const r = w.destroyers.roles!;
    const sh = w.destroyers.ships[SHIGURE]!;
    let back = NaN, again = NaN;
    colRun(w, 268, (ww) => {
      follow(ww, Infinity);
      if (Number.isNaN(back) && r.st.rejoined !== 0) back = ww.stepTimeS;
      if (!Number.isNaN(back) && Number.isNaN(again) && r.st.left !== 0) again = ww.stepTimeS;
    });
    const left0 = tr.enterAtS![SHIGURE]!;
    expect(Math.abs(back - (left0 + chase))).toBeLessThanOrEqual(3 / 60);
    if (back + cool < 268) expect(again - back).toBeGreaterThanOrEqual(cool - 2 / 60);
    expect(r.st.leaves[SHIGURE]!).toBeGreaterThanOrEqual(1);
    expect(sh.ai.retireHeadingDeg).toBe(90);
  });
});

describe('乱数（L20・§7.1）: 砲 seed+1・見張り seed+17 を艦の順に', () => {
  it('同じ夜を 2 回回すと艦の位置・針路・AI の段と、2 つの系列の引いた回数が同じ。見つかって撃たれる夜は砲の系列を引く', () => {
    const night = (): string => {
      const w = colWorld({ seed: 7 });
      w.detectRangeM = 900;
      colRun(w, 180, (ww) => follow(ww, 160));
      return JSON.stringify([w.destroyers.ships.map((d) => [d.state.x, d.state.y, d.state.headingDeg, d.ai.mode, d.ai.retiring]), w.gunRng.draws, w.lookoutRng.draws, Array.from(w.destroyers.roles!.leftAtS)]);
    };
    const a = night();
    expect(night()).toBe(a);
    expect((JSON.parse(a) as unknown[])[1]).toBeGreaterThan(0);
  });
});

describe('配線の文（L20・§9 の 2）', () => {
  it('destroyer-step: 列の段階の直後に隊の roles（止まった艦の段の前）。setAiParams を呼ぶのは systems/column-roles だけ・退く旗を外から下ろすのも column-roles だけ', () => {
    const s = code('src/systems/destroyer-step.ts');
    const order = ['if (g.transit?.step(w, feelDt)) left = true;', 'g.roles?.step(w, feelDt);', 'g.anchors?.step(w, feelDt);'];
    const idx = order.map((p) => s.indexOf(p));
    expect(idx.every((i, k) => i >= 0 && (k === 0 || i > idx[k - 1]!)), idx.join(' ')).toBe(true);
    expect(SRC.filter((f) => /\.setAiParams\(/.test(code(f)))).toEqual(['src/systems/column-roles.ts']);
    expect(SRC.filter((f) => /\bai\.retiring\s*=[^=]/.test(code(f)))).toEqual(['src/core/ship-ai.ts', 'src/systems/column-roles.ts']); // ラッチを立てるのは core の startRetire・外から下ろすのは見張りだけ
    expect(code('src/entities/destroyer.ts')).toContain('setAiParams(p: ShipAiParams): void {');
    expect(code('src/core/ship-ai.ts')).not.toMatch(/screen|column/);
  });
  it('column-roles・column-kits の import（core と config の型・ship-art-config・core/radar だけ。Phaser・DOM を読まない）。column-roles の step の本体に確保の形が無い', () => {
    expect(imports(code('src/systems/column-roles.ts')).sort()).toEqual(['../config/transit-mission-data', '../core/column-screen', '../core/ship-ai', '../core/ship-transit']);
    expect(imports(code('src/systems/column-kits.ts')).sort()).toEqual(['../config/column-mission-data', '../config/ship-art-config', '../core/gunnery', '../core/radar', '../core/ship-ai', './destroyer-setup']);
    const r = code('src/systems/column-roles.ts');
    const body = r.slice(r.indexOf('step(w: RolesWorldView'), r.lastIndexOf('}'));
    expect(body).not.toMatch(/\bnew\s|\.(map|filter|slice|push|forEach)\(|=>|`|\.\.\./);
  });
  it('使った艦（列の 7 隻）は step のたびに作り直さない: 1 回の夜で隊の ships は同じ物', () => {
    const w = colWorld();
    const before = [...w.destroyers.ships];
    colStep(w);
    colRun(w, 30);
    expect(w.destroyers.ships.every((d, i) => d === before[i])).toBe(true);
  });
});

describe('衝突の危険の名詞（L24。systems/strait-telemetry）', () => {
  it('us_05: 一番近い危険な艦の艦種の名詞（戦艦・重巡・駆逐艦）。危険が無ければ空。us_04（往復の列）・us_06 は鍵ごと無い（駆逐艦・駆潜艇の文のまま）', () => {
    const w = colWorld();
    colRun(w, 110);
    const g = w.destroyers;
    const view = (b: { x: number; y: number }) => ({ visRange2: w.setup.visRange2, boat: { state: b }, destroyers: g as never, radar: w.radar });
    const t = initStraitTelemetry(view({ x: 0, y: 0 }));
    expect([t.enabled, t.bowOnNounJa]).toEqual([true, '']);
    const nounAt = (i: number): string | undefined => {
      const d = g.ships[i]!.state; // 艦首の前 300 m（針路 090＝東）
      refreshStraitTelemetry(t, view({ x: d.x + 300, y: d.y }));
      return t.bowOnNounJa;
    };
    expect([nounAt(5), nounAt(3), nounAt(0)]).toEqual(['戦艦', '重巡', '駆逐艦']);
    refreshStraitTelemetry(t, view({ x: 0, y: 0 }));
    expect(t.bowOnNounJa).toBe('');
    for (const id of ['us_04', 'us_06']) {
      const o = colWorld({ mission: id });
      expect('bowOnNounJa' in initStraitTelemetry({ visRange2: o.setup.visRange2, boat: o.boat, destroyers: o.destroyers as never, radar: o.radar }), id).toBe(false);
    }
  });
});
