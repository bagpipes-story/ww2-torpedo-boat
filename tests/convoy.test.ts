// 味方の大発の輸送隊（v0.6.4。core/convoy・convoy-data、spec §C.7・§E.5・§G.2）: 置き方（先頭＋offsets・揺らぎ・西向き）、7 kt で針路のまま、到達線で上陸（止まる・arrived・onArrived 1 回）、
// 掃射の命中（HP → 沈没・onSunk 1 回・沈んだ／上陸した大発に当たらない）、決着、最寄り・最後尾・先頭、浜までの距離、data の検査（§E.5 の各項目が任務の id 付きで例外）、乱数を引かない・確保なし。
// jp_01 の v0_1_prototype.convoy は段 4 で data に入るので、ここでは spec §B.2 の値を直書きした block を使う（大発の record は enemies.json の daihatsu_barge、砲の damage は us_pt_enemy）。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { isBargeDataRecord, type BargeDataRecord } from '../src/core/barge-data';
import {
  CV_ARRIVED, CV_SAILING, CV_SUNK, convoyAfloat, convoyLeadIndex, convoyLeftM, convoyResolved, convoyTailIndex, createConvoy, hitConvoyBarge, nearestConvoyBarge, stepConvoy,
  type ConvoyEvents, type ConvoyParams, type ConvoyState,
} from '../src/core/convoy';
import { CONVOY_RING_CLEAR_M, convoyParamsFromData, isConvoyMissionBlock, ptTargetRuleFromData, type ConvoyMissionBlock, type ConvoyMissionContext } from '../src/core/convoy-data';
import { ktToMps } from '../src/core/units';
import { CountingRng } from './pt-kit';

const DT = 1 / 60;
const TS = gameData.hitRateModel.world.time_scale;
const W = { hitScale: gameData.hitRateModel.world.hit_scale, spriteScale: gameData.hitRateModel.world.sprite_scale };
/** jp_01 の海域（spec §B.2 bounds_m） */
const B = { width: 6000, height: 3000 };
/** spec §B.2 の jp_01 の convoy（data は段 4 で入る） */
const BLOCK: ConvoyMissionBlock = {
  lead_start: { x_m: 1200, y_m: 2550, heading_deg: 90 }, offsets_m: [0, 120, 240], landing_x_m: 4000, arrive_quota: 2, barge_hp: 20,
  detect_band: 'stop', target_keep_ratio: 0.8, target_switch_hold_s: 1.0, flash_hold_s: 1.0, source: 'design (tests/convoy。spec §B.2 の写し)',
};
/** jp_01 の周り: night.barge_lead_jitter_m 250・帰投の輪 (4500, 2250) r 250 */
const CTX: ConvoyMissionContext = { missionId: 'jp_01', leadJitterM: 250, ring: { x: 4500, y: 2250, radiusM: 250 } };
const recRaw = gameData.enemies.enemies.find((e) => e.id === 'daihatsu_barge');
if (!isBargeDataRecord(recRaw)) throw new Error('enemies.json の daihatsu_barge が大発の record でない');
const REC: BargeDataRecord = recRaw;
/** 米PT の砲の 1 発（us_pt_enemy。jp_05 と共有で変えない） */
const DAMAGE = (gameData.enemies.enemies.find((e) => e.id === 'us_pt_enemy') as { guns: { damage: number }[] }).guns[0]!.damage;
const P = convoyParamsFromData(REC, BLOCK, 3, W, B, CTX);
const SPEED = ktToMps(7);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const params = (over: Partial<ConvoyParams> = {}): ConvoyParams => ({ ...P, ...over });
const west = (): ConvoyParams => params({ headingDeg: 270, leadX: 4800, landingX: 2000 });

function events(log: string[] = []): ConvoyEvents {
  return { onArrived: (i) => log.push(`arrive${i}`), onSunk: (i) => log.push(`sunk${i}`) };
}
/** 実秒 realS ぶん固定ステップで回す（dt は game 秒＝× time_scale） */
function run(f: ConvoyState, p: ConvoyParams, realS: number, ev: ConvoyEvents = events()): void {
  const n = Math.round(realS / DT);
  for (let i = 0; i < n; i++) stepConvoy(f, p, DT * TS, ev);
}
/** 大発 i に n 発当てる。沈んだ命中で true */
function hits(f: ConvoyState, i: number, n: number, ev: ConvoyEvents = events(), nowS = 100): boolean {
  let sunk = false;
  for (let k = 0; k < n; k++) sunk = hitConvoyBarge(f, i, DAMAGE, nowS + k, ev) || sunk;
  return sunk;
}
const xs = (f: ConvoyState): number[] => f.barges.map((b) => Math.round(b.x * 100) / 100);
const bad = (over: Partial<ConvoyMissionBlock>, ctx: ConvoyMissionContext = CTX, count = 3, rec: BargeDataRecord = REC): (() => void) => () => convoyParamsFromData(rec, { ...clone(BLOCK), ...over }, count, W, B, ctx);

describe('jp_01 の値と置き方（spec §B.2・§C.7）', () => {
  it('3 隻・HP 20・半長 7.45・半幅 1.7・余白 14.9・7 kt・旋回 8°/s・加速 0.4・先頭 (1200, 2550) 東向き・後ろへ 0/120/240・上陸線 4000・ノルマ 2。規則は keep 0.8²・ロック 1 秒・閃光の記憶 1 秒', () => {
    expect([P.count, P.hp, P.quota, P.landingX, P.leadX, P.leadY, P.headingDeg]).toEqual([3, 20, 2, 4000, 1200, 2550, 90]);
    expect(P.offsetsM).toEqual([0, 120, 240]);
    expect(P.halfLengthM).toBeCloseTo(7.45, 9);
    expect(P.halfBeamM).toBeCloseTo(1.7, 9);
    expect(P.boundsMarginM).toBeCloseTo(14.9, 9);
    expect(P.speedMps).toBeCloseTo(SPEED, 12);
    expect([P.turnRateDegS, P.accelMps2]).toEqual([8, 0.4]);
    expect(DAMAGE).toBe(4);
    const rule = ptTargetRuleFromData(BLOCK);
    expect(rule.keepRatio2).toBeCloseTo(0.64, 12);
    expect([rule.lockS, rule.flashHoldS]).toEqual([1, 1]);
  });
  it('置き方: 先頭から針路の後ろへ 120 m ずつ（1200/1080/960、y 2550、7 kt・航行中・HP 20）。先頭が +250 揺らげば 1450/1330/1210。西向き（270）は後ろが x の大きい側', () => {
    const f = createConvoy(P);
    expect(xs(f)).toEqual([1200, 1080, 960]);
    expect(f.barges.map((b) => [b.y, b.headingDeg, b.phase, b.hp, b.hits])).toEqual([[2550, 90, CV_SAILING, 20, 0], [2550, 90, CV_SAILING, 20, 0], [2550, 90, CV_SAILING, 20, 0]]);
    for (const b of f.barges) expect(b.speedMps).toBeCloseTo(SPEED, 12);
    expect([f.arrived, f.sunk, f.hitsTaken, Number.isNaN(f.firstHitS)]).toEqual([0, 0, 0, true]);
    expect(xs(createConvoy(params({ leadX: 1200 + 250 })))).toEqual([1450, 1330, 1210]);
    const w = createConvoy(west());
    expect(xs(w)).toEqual([4800, 4920, 5040]);
    expect(w.barges.map((b) => b.y)).toEqual([2550, 2550, 2550]);
  });
});

describe('運動と上陸（spec §C.7。7 kt＝18 m/秒の体感）', () => {
  it('7 kt で針路のまま東へ: 10 秒（50 game 秒）で 180.04 m（1200 → 1380.04）。y・針路・速力は変わらない。西向きなら同じだけ西へ', () => {
    const f = createConvoy(P);
    run(f, P, 10);
    for (let i = 0; i < 3; i++) {
      expect(f.barges[i]!.x).toBeCloseTo(1200 - 120 * i + SPEED * 50, 6);
      expect(f.barges[i]!.y).toBeCloseTo(2550, 9);
      expect(f.barges[i]!.headingDeg).toBe(90);
      expect(f.barges[i]!.speedMps).toBeCloseTo(SPEED, 12);
    }
    const w = createConvoy(west());
    run(w, west(), 10);
    expect(w.barges[0]!.x).toBeCloseTo(4800 - SPEED * 50, 6);
    expect(w.barges[2]!.x).toBeCloseTo(5040 - SPEED * 50, 6);
  });
  it('到達線で上陸: 先頭は 2,800 m を 155.5 秒で越えて止まる（phase ARRIVED・speed 0・afloat false・arrived 1・onArrived(0) 1 回）。後続は 120 m＝6.7 秒ずつ遅れ、170 秒でみな上陸。上陸後は進まず再び数えない', () => {
    const log: string[] = [];
    const f = createConvoy(P);
    run(f, P, 155, events(log));
    expect([f.arrived, log.length]).toEqual([0, 0]);
    expect(f.barges[0]!.x).toBeLessThan(4000);
    run(f, P, 2, events(log));
    expect([f.arrived, f.barges[0]!.phase, f.barges[0]!.speedMps, convoyAfloat(f.barges[0]!), f.barges[1]!.phase]).toEqual([1, CV_ARRIVED, 0, false, CV_SAILING]);
    expect(log).toEqual(['arrive0']);
    expect(f.barges[0]!.x).toBeGreaterThanOrEqual(4000);
    const stopped = f.barges[0]!.x;
    run(f, P, 8, events(log)); // 165 秒
    expect([f.arrived, log]).toEqual([2, ['arrive0', 'arrive1']]);
    expect(f.barges[0]!.x).toBe(stopped);
    run(f, P, 5, events(log)); // 170 秒
    expect([f.arrived, f.sunk, log]).toEqual([3, 0, ['arrive0', 'arrive1', 'arrive2']]);
    expect(f.barges.map((b) => b.phase)).toEqual([CV_ARRIVED, CV_ARRIVED, CV_ARRIVED]);
    run(f, P, 30, events(log));
    expect([f.arrived, log.length]).toEqual([3, 3]);
  });
  it('西向き（4800 → 2000）も針路の先の上陸線で止まる（上陸線を越える向きは sin(針路) で決める）', () => {
    const log: string[] = [];
    const p = west();
    const f = createConvoy(p);
    run(f, p, 157, events(log));
    expect([f.arrived, log]).toEqual([1, ['arrive0']]);
    expect(f.barges[0]!.x).toBeLessThanOrEqual(2000);
    expect(f.barges[1]!.phase).toBe(CV_SAILING);
  });
});

describe('掃射の命中（spec §C.7。1 命中 HP −4・barge_hp 20 → 5 発）', () => {
  it('4 発で浮く（hp 4・hits 4・hitsTaken 4・firstHitS は最初の命中の秒）、5 発目で沈没（true・SUNK・speed 0・sunk 1・onSunk(1) 1 回）。沈んだ大発には当たらない（false・数えない）', () => {
    const log: string[] = [];
    const f = createConvoy(P);
    expect(hits(f, 1, 4, events(log), 100)).toBe(false);
    expect([f.barges[1]!.hp, f.barges[1]!.hits, f.hitsTaken, f.firstHitS, f.sunk, f.barges[1]!.phase]).toEqual([4, 4, 4, 100, 0, CV_SAILING]);
    expect(hitConvoyBarge(f, 1, DAMAGE, 104, events(log))).toBe(true);
    expect([f.barges[1]!.hp, f.barges[1]!.phase, f.barges[1]!.speedMps, convoyAfloat(f.barges[1]!), f.sunk, f.hitsTaken, f.firstHitS]).toEqual([0, CV_SUNK, 0, false, 1, 5, 100]);
    expect(log).toEqual(['sunk1']);
    expect(hitConvoyBarge(f, 1, DAMAGE, 105, events(log))).toBe(false);
    expect([f.barges[1]!.hits, f.hitsTaken, f.sunk, log]).toEqual([5, 5, 1, ['sunk1']]);
    // 隣の大発は無傷
    expect([f.barges[0]!.hp, f.barges[2]!.hp]).toEqual([20, 20]);
  });
  it('barge_hp 24 なら 6 発（HP は 4 の倍数でしか効かない: 22 も 6 発）', () => {
    const f24 = createConvoy(params({ hp: 24 }));
    expect(hits(f24, 0, 5)).toBe(false);
    expect(hits(f24, 0, 1)).toBe(true);
    const f22 = createConvoy(params({ hp: 22 }));
    expect(hits(f22, 0, 5)).toBe(false);
    expect(hits(f22, 0, 1)).toBe(true);
  });
  it('沈んだ大発は進まない。上陸した大発には当たらない（false・HP そのまま）', () => {
    const f = createConvoy(P);
    hits(f, 2, 5);
    const x = f.barges[2]!.x;
    run(f, P, 10);
    expect(f.barges[2]!.x).toBe(x);
    expect(f.barges[0]!.x).toBeGreaterThan(1200);
    run(f, P, 160);
    expect(f.barges[0]!.phase).toBe(CV_ARRIVED);
    expect(hitConvoyBarge(f, 0, DAMAGE, 170, events())).toBe(false);
    expect([f.barges[0]!.hp, f.barges[0]!.hits, f.hitsTaken]).toEqual([20, 0, 5]);
  });
});

describe('決着・最寄り・最後尾・先頭・浜まで（spec §D.2 の HUD の元）', () => {
  it('convoyResolved: 航行中が 1 隻でもあれば false、2 隻上陸＋1 隻沈没で true', () => {
    const f = createConvoy(P);
    hits(f, 1, 5);
    expect(convoyResolved(f)).toBe(false);
    run(f, P, 170);
    expect([f.arrived, f.sunk, convoyResolved(f)]).toEqual([2, 1, true]);
  });
  it('nearestConvoyBarge: 航行中だけ（沈んだ・上陸した大発は飛ばす）。距離は二乗で比べる。無ければ −1', () => {
    const f = createConvoy(P);
    expect(nearestConvoyBarge(f, 1000, 2400)).toBe(2);
    expect(nearestConvoyBarge(f, 1150, 2700)).toBe(0);
    expect(nearestConvoyBarge(f, 1100, 2550)).toBe(1);
    hits(f, 2, 5);
    expect(nearestConvoyBarge(f, 1000, 2400)).toBe(1);
    hits(f, 1, 5);
    hits(f, 0, 5);
    expect(nearestConvoyBarge(f, 1200, 2550)).toBe(-1);
  });
  it('convoyTailIndex / convoyLeadIndex: 東向きは最後尾 2・先頭 0。2 が沈めば最後尾 1、0 が上陸すれば先頭 1。西向きは x の大きい側が最後尾。無ければ −1', () => {
    const f = createConvoy(P);
    expect([convoyTailIndex(f, P), convoyLeadIndex(f, P)]).toEqual([2, 0]);
    hits(f, 2, 5);
    expect([convoyTailIndex(f, P), convoyLeadIndex(f, P)]).toEqual([1, 0]);
    run(f, P, 157);
    expect([f.barges[0]!.phase, convoyTailIndex(f, P), convoyLeadIndex(f, P)]).toEqual([CV_ARRIVED, 1, 1]);
    run(f, P, 10);
    expect([convoyResolved(f), convoyTailIndex(f, P), convoyLeadIndex(f, P)]).toEqual([true, -1, -1]);
    const p = west();
    const w = createConvoy(p);
    expect([convoyTailIndex(w, p), convoyLeadIndex(w, p)]).toEqual([2, 0]);
  });
  it('convoyLeftM: 出撃時は最後尾 960 から 4000 まで 3,040（HUD の「浜まで 3100 m」の元）。最後尾が沈めば 1080 から 2,920。10 秒進めば −180.04。みな決着で 0。西向きも同じ', () => {
    const f = createConvoy(P);
    expect(convoyLeftM(f, P)).toBe(3040);
    hits(f, 2, 5);
    expect(convoyLeftM(f, P)).toBe(2920);
    run(f, P, 10);
    expect(convoyLeftM(f, P)).toBeCloseTo(2920 - SPEED * 50, 6);
    run(f, P, 160);
    expect([convoyResolved(f), convoyLeftM(f, P)]).toEqual([true, 0]);
    const p = west();
    expect(convoyLeftM(createConvoy(p), p)).toBe(3040);
  });
});

describe('data の検査（spec §E.5。壊れた data は jp_01 の id 付きで例外＝Boot で止まる）', () => {
  const ID = /^jp_01\.v0_1_prototype\.convoy: /;
  it('isConvoyMissionBlock: §B.2 の block は通り、鍵の欠け・offsets_m に数でないもの・detect_band の綴り・source なし・lead_start の欠けは通さない', () => {
    expect(isConvoyMissionBlock(BLOCK)).toBe(true);
    const { landing_x_m: _l, ...noLanding } = BLOCK;
    expect(isConvoyMissionBlock(noLanding)).toBe(false);
    expect(isConvoyMissionBlock({ ...BLOCK, offsets_m: [0, 'a', 240] })).toBe(false);
    expect(isConvoyMissionBlock({ ...BLOCK, detect_band: 'fast' })).toBe(false);
    const { source: _s, ...noSource } = BLOCK;
    expect(isConvoyMissionBlock(noSource)).toBe(false);
    expect(isConvoyMissionBlock({ ...BLOCK, lead_start: { x_m: 1200, y_m: 2550 } })).toBe(false);
    expect(isConvoyMissionBlock(null)).toBe(false);
  });
  it('隻数と offsets_m: 数が allies の大発の数と違う・[0] が 0 でない・順に増えない（同じ値も）・大発 0 隻', () => {
    expect(bad({}, CTX, 2)).toThrow(/offsets_m は 2 個/);
    expect(bad({ offsets_m: [10, 120, 240] })).toThrow(/offsets_m/);
    expect(bad({ offsets_m: [0, 240, 120] })).toThrow(/offsets_m/);
    expect(bad({ offsets_m: [0, 120, 120] })).toThrow(/offsets_m/);
    expect(bad({ offsets_m: [0, 120, 240] }, CTX, 0)).toThrow(/1 隻以上/);
    expect(bad({ offsets_m: [10, 120, 240] })).toThrow(ID);
  });
  it('ノルマ・HP・帯・規則: arrive_quota 0／4／1.5、barge_hp 0、detect_band の綴り、target_keep_ratio 0／1.2、target_switch_hold_s −1、flash_hold_s −1、barge_lead_jitter_m −1', () => {
    for (const q of [0, 4, 1.5]) expect(bad({ arrive_quota: q })).toThrow(/arrive_quota は 1〜3/);
    expect(bad({ barge_hp: 0 })).toThrow(/barge_hp/);
    expect(bad({ detect_band: 'fast' as ConvoyMissionBlock['detect_band'] })).toThrow(/detect_band/);
    for (const r of [0, 1.2]) expect(bad({ target_keep_ratio: r })).toThrow(/target_keep_ratio/);
    expect(bad({ target_switch_hold_s: -1 })).toThrow(/target_switch_hold_s/);
    expect(bad({ flash_hold_s: -1 })).toThrow(/flash_hold_s/);
    expect(bad({}, { ...CTX, leadJitterM: -1 })).toThrow(/barge_lead_jitter_m/);
    expect(bad({ barge_hp: 0 })).toThrow(ID);
  });
  it('航路: 針路は 90 か 270、先頭〜最後尾（揺らぎ ±250 込み）は海域の縁から絵の半長 14.9 の内、y は縁の内で岸（南の縁 − 2 × 半長）より海側', () => {
    expect(bad({ lead_start: { x_m: 1200, y_m: 2550, heading_deg: 45 } })).toThrow(/heading_deg は 90/);
    expect(bad({ lead_start: { x_m: 500, y_m: 2550, heading_deg: 90 } })).toThrow(/海域の縁/); // 最後尾 500 − 240 − 250 = 10 < 14.9
    expect(bad({ lead_start: { x_m: 5990, y_m: 2550, heading_deg: 90 }, landing_x_m: 5995 })).toThrow(/海域の縁/);
    expect(bad({ lead_start: { x_m: 1200, y_m: 2980, heading_deg: 90 } })).toThrow(/岸/);
    expect(bad({ lead_start: { x_m: 1200, y_m: 10, heading_deg: 90 } })).toThrow(/航路の y/);
    // 505 なら最後尾 15 ≥ 14.9 で通る
    expect(bad({ lead_start: { x_m: 505, y_m: 2550, heading_deg: 90 } })).not.toThrow();
  });
  it('上陸線と輪: landing_x_m は海域の中で針路の先（先頭から最後尾の距離 240 ＋ 揺らぎ 250 より遠く）、輪の中心は上陸線の側、到達線上の航路の点から輪の縁まで 300 m 以上（(4300, 2350) は 111 m で落ちる。jp_01 は 333 m）', () => {
    expect(bad({ landing_x_m: 6100 })).toThrow(/landing_x_m は海域の中/);
    expect(bad({ landing_x_m: 1690 })).toThrow(/針路の先/); // 490 ≤ 240 + 250
    expect(bad({ landing_x_m: 1000 })).toThrow(/針路の先/);
    expect(bad({ landing_x_m: 1691, arrive_quota: 2 }, { ...CTX, ring: { x: 2200, y: 2250, radiusM: 250 } })).not.toThrow();
    expect(bad({}, { ...CTX, ring: { x: 3900, y: 2250, radiusM: 250 } })).toThrow(/輪の中心は上陸線の側/);
    expect(bad({}, { ...CTX, ring: { x: 4300, y: 2350, radiusM: 250 } })).toThrow(/300 m 以上/);
    expect(bad({}, { ...CTX, ring: { x: 4300, y: 2350, radiusM: 250 } })).toThrow(ID);
    expect(CONVOY_RING_CLEAR_M).toBe(300);
    expect(Math.hypot(4500 - 4000, 2250 - 2550) - 250).toBeCloseTo(333.1, 1);
    // 西向きは鏡: 先頭 4800・上陸線 2000・輪は西側
    expect(bad({ lead_start: { x_m: 4800, y_m: 2550, heading_deg: 270 }, landing_x_m: 2000 }, { ...CTX, ring: { x: 1500, y: 2250, radiusM: 250 } })).not.toThrow();
    expect(bad({ lead_start: { x_m: 4800, y_m: 2550, heading_deg: 270 }, landing_x_m: 2000 }, { ...CTX, ring: { x: 2100, y: 2250, radiusM: 250 } })).toThrow(/輪の中心は上陸線の側/);
  });
  it('enemies.json の大発の寸法・速さ・旋回・加速が正でなければ例外（任務の id 付き）', () => {
    const r = clone(REC);
    r.speed_typical_kt = 0;
    expect(bad({}, CTX, 3, r)).toThrow(/enemies\.json の大発/);
    expect(bad({}, CTX, 3, r)).toThrow(ID);
  });
});

describe('乱数を引かない・確保なし（CLAUDE.md §7、spec §E.6・§E.7）', () => {
  const stripComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const noAlloc = (src: string): boolean[] => [src.includes('new '), src.includes('[]'), src.includes('{}'), src.includes('=>')];
  it('core/convoy は rng を受け取らず Math.random も書かない: 出撃から決着（上陸 2・沈没 1）まで回しても CountingRng は 0 回', () => {
    const rng = new CountingRng(16);
    const f = createConvoy(P);
    hits(f, 1, 5);
    run(f, P, 170);
    expect([convoyResolved(f), f.arrived, f.sunk, rng.draws]).toEqual([true, 2, 1, 0]);
    const src = stripComments(readFileSync(join(__dirname, '..', 'src', 'core', 'convoy.ts'), 'utf8'));
    expect(/\brng\b|Math\.random|SeededRng/.test(src)).toBe(false);
  });
  it('毎ステップ・毎命中の関数（stepConvoy・hitConvoyBarge・nearestConvoyBarge・最後尾／先頭・convoyLeftM）に new・[]・{}・=> が無い（確保は createConvoy だけ）', () => {
    for (const fn of [stepConvoy, hitConvoyBarge, nearestConvoyBarge, convoyTailIndex, convoyLeadIndex, convoyLeftM]) expect(noAlloc(fn.toString()), fn.name).toEqual([false, false, false, false]);
    const src = stripComments(readFileSync(join(__dirname, '..', 'src', 'core', 'convoy.ts'), 'utf8'));
    const helper = /function convoyEndIndex[\s\S]*?\n}/.exec(src)?.[0] ?? 'missing';
    expect(helper).not.toBe('missing');
    expect(noAlloc(helper)).toEqual([false, false, false, false]);
  });
});
