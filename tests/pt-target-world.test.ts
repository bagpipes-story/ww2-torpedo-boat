// 米PT の標的スロットの世界側（v0.6.4。systems/pt-target の PtTargets）・輸送隊のテレメトリ（systems/convoy-telemetry）・上陸の得点（core/scoring の arrivals）。spec §C.6・§D.3・§D.5・§E.2。
// Phaser を import しない systems だけ（systems/convoy・mission-world の配線はヘッドレスの smoke で確かめる）。輸送隊は core/convoy の状態で立て替える（Convoy の hit と同じ hitConvoyBarge）。
import { describe, expect, it } from 'vitest';
import scoring from '../data/scoring.json';
import { gameData, getScoringParams } from '../src/config/game-data';
import type { BoatState } from '../src/core/boat-motion';
import { CV_ARRIVED, CV_SAILING, CV_SUNK, createConvoy, createConvoyTelemetry, hitConvoyBarge, stepConvoy, type ConvoyEvents, type ConvoyState } from '../src/core/convoy';
import { PT_LEAVE, PT_PATROL, PT_RUN_IN, createPtSection, type PtCheck, type PtSection } from '../src/core/pt-boats';
import { computeScore, isScoringDataRecord, scoringParamsFromData, type ScoreInput, type ScoringDataRecord } from '../src/core/scoring';
import { enemyDetectRangeM, speedFactorForBand } from '../src/core/visibility';
import { convoyResult, initConvoyTelemetry, refreshConvoyTelemetry, type ConvoyTelemetryWorld } from '../src/systems/convoy-telemetry';
import { PtTargets, type PtTargetConvoy } from '../src/systems/pt-target';
import { initPtTelemetry, ptResult, refreshPtTelemetry } from '../src/systems/pt-telemetry';
import { buildWorldSetup } from '../src/systems/world-setup';
import { ptWorld } from './pt-ui-kit';

const S = buildWorldSetup(gameData, 'jp_01');
const CV = S.convoy!;
const PT = S.ptBoats!;
const DAMAGE = PT.hit.damage;
const BARGE_DETECT_M = enemyDetectRangeM(PT.baseDetectM, speedFactorForBand(CV.detectBand, S.vis.speedFactor), S.vis, false);
const noEv: ConvoyEvents = { onArrived: () => {}, onSunk: () => {} };

/** Phaser 無しの輸送隊（systems/convoy の Convoy と同じ口） */
function fakeConvoy(): PtTargetConvoy & { state: ConvoyState } {
  const state = createConvoy(CV.params);
  return { state, p: CV.params, rule: CV.rule, detectM: BARGE_DETECT_M, hit: (i, dmg, now) => hitConvoyBarge(state, i, dmg, now, noEv) };
}

/** 自艇（出発点）と標的スロット、手空きの隊（PT0 だけ戦う）と PtCheck */
function world(): { player: BoatState; cv: ReturnType<typeof fakeConvoy>; t: PtTargets; q: PtSection; c: PtCheck } {
  const player: BoatState = { ...S.playerStart, speedMps: 0 };
  const cv = fakeConvoy();
  const q = createPtSection(PT, 24);
  const t = new PtTargets(player, S.boatHalfLengthM, S.boatHalfBeamM, cv, q);
  Object.assign(q.boats[1]!, { phase: PT_LEAVE });
  const c: PtCheck = { boat: player, boatHalfLengthM: S.boatHalfLengthM, boatHalfBeamM: S.boatHalfBeamM, detectOpenM: 0, smokeFactor: 1, smoke: null, smokeParams: null, targetValid: true, visRange2: S.visRange2, dawn: false, timeS: 10, targets: t.hulls };
  return { player, cv, t, q, c };
}

describe('PtTargets（systems/pt-target。spec §C.2・§C.4・§E.2）', () => {
  it('出撃時: 船体は自艇 + 大発 3 隻、大発の発見距離は停止の帯 480 m（新月）、標的は自艇（targetKind 0）。規則は data（0.64・1 秒・1 秒）', () => {
    const { t, cv } = world();
    expect(t.hulls.length).toBe(4);
    expect(t.hulls[0]!.boat).toBe(t.hulls[0]!.boat);
    expect(t.hulls[1]!.boat).toBe(cv.state.barges[0]!);
    expect([t.set.detectM[1], t.set.detectM[2], t.set.detectM[3], BARGE_DETECT_M]).toEqual([480, 480, 480, 480]);
    expect([t.set.current, t.targetKind, t.playerValid, t.lastPassTargetKind, t.firstDetectKind]).toEqual([0, 0, true, 0, 0]);
    expect(t.rule).toEqual({ keepRatio2: 0.8 * 0.8, lockS: 1, flashHoldS: 1 });
    expect([t.hulls[1]!.halfLengthM, t.hulls[1]!.halfBeamM]).toEqual([CV.params.halfLengthM, CV.params.halfBeamM]);
  });
  it('begin: 自艇の帯の発見距離と有効、大発は航行中だけ有効（上陸・沈没で的でなくなる）', () => {
    const { t, cv } = world();
    cv.state.barges[1]!.phase = CV_ARRIVED;
    cv.state.barges[2]!.phase = CV_SUNK;
    t.begin(600, false);
    expect(t.set.detectM[0]).toBe(600);
    expect(t.hulls.map((h) => h.valid)).toEqual([false, true, false, false]);
    expect(t.playerValid).toBe(false);
  });
  it('apply: 手空きの隊が自艇（停止 480 m・遠い）より近い大発を選ぶと check.boat は大発・detectOpenM は大発の帯・targetKind 1。自艇に戻せば自艇の帯', () => {
    const { t, q, c, cv, player } = world();
    const b0 = cv.state.barges[0]!;
    Object.assign(q.boats[0]!, { x: b0.x + 300, y: b0.y, phase: PT_RUN_IN });
    player.x = b0.x + 1500;
    t.begin(480, true);
    t.apply(q, c, 0, 10);
    expect([t.set.current, t.targetKind, c.boat, c.detectOpenM, c.boatHalfLengthM, c.targetValid]).toEqual([1, 1, b0, 480, CV.params.halfLengthM, true]);
    // 自艇が閃光（1,200 m）で撃って PT から 500 m なら自艇へ戻る（点数 500²/1200² = 0.17 < 大発 300²/480² × 0.64 = 0.25。ロック 1 秒の後）
    player.x = b0.x + 800;
    t.begin(600, true);
    t.apply(q, c, 1200, 12);
    expect([t.set.current, c.boat, c.detectOpenM, c.boatHalfLengthM]).toEqual([0, player, 600, S.boatHalfLengthM]);
  });
  it('大発への命中: HP −4 ずつ、5 発目で沈没＝同じステップで valid と（標的なら）targetValid を落とし true。隊の命中は数えず（core）自艇の被弾も増えない', () => {
    const { t, q, c, cv } = world();
    t.begin(480, true);
    t.set.current = 1;
    c.targetValid = true;
    for (let k = 0; k < 4; k++) expect(t.bargeHit(q, c, 1, DAMAGE, 20 + k)).toBe(false);
    expect([cv.state.barges[0]!.hp, cv.state.barges[0]!.phase, t.hulls[1]!.valid, c.targetValid, t.bargeHits, t.playerHits]).toEqual([4, CV_SAILING, true, true, 4, 0]);
    expect(t.bargeHit(q, c, 1, DAMAGE, 24)).toBe(true);
    expect([cv.state.barges[0]!.phase, cv.state.sunk, t.hulls[1]!.valid, c.targetValid, t.bargeHits]).toEqual([CV_SUNK, 1, false, false, 5]);
    // 標的でない大発が沈んでも targetValid は触らない
    t.set.current = 0;
    c.targetValid = true;
    for (let k = 0; k < 5; k++) t.bargeHit(q, c, 2, DAMAGE, 30 + k);
    expect([t.hulls[2]!.valid, c.targetValid, cv.state.sunk]).toEqual([false, true, 2]);
  });
  it('自艇への命中: 被弾を数え、沈み始めたら自艇の船体を落とす（標的が自艇なら targetValid も。標的が大発なら触らない）', () => {
    const { t, q, c } = world();
    t.begin(480, true);
    t.playerHit(q, c, false);
    expect([t.playerHits, t.hulls[0]!.valid, c.targetValid]).toEqual([1, true, true]);
    t.set.current = 1;
    t.playerHit(q, c, true);
    expect([t.playerHits, t.hulls[0]!.valid, c.targetValid]).toEqual([2, false, true]);
    t.set.current = 0;
    c.targetValid = true;
    t.playerHit(q, c, true);
    expect(c.targetValid).toBe(false);
  });
  it('攻撃の数え: 自艇への攻撃だけ撃った／無傷に数え、最後の攻撃の標的の船体への命中は後から落ちた弾も戻す（無傷を取り消す）。大発への航過は分母に入らず attacksOnBarges に（core が数えた航過＝q.passes が増えたとき）', () => {
    const { t, q, c } = world();
    t.begin(480, true);
    // 自艇への航過: 固めて 2 発当たって終わる
    q.owner = 0;
    t.onCommit(0);
    expect([t.attackKind, t.attackHits]).toEqual([0, 0]);
    t.playerHit(q, c, false);
    t.bargeHit(q, c, 1, DAMAGE, 10); // 自艇の航過中に大発へ逸れた弾は標的の命中に数えない
    t.playerHit(q, c, false);
    q.owner = -1;
    q.passes++; // core の endPass が数えた（撃った航過）
    t.onPassEnd(true);
    expect([t.firedPassesOnPlayer, t.cleanPassesOnPlayer, t.lastAttackTargetHits, t.lastPassTargetKind, t.attacksOnBarges]).toEqual([1, 0, 2, 0, 0]);
    // 無傷の航過 → 後から 1 発落ちた: 無傷を取り消し、最後の攻撃の命中 1
    q.owner = 0;
    t.onCommit(0);
    q.owner = -1;
    q.passes++;
    t.onPassEnd(true);
    expect([t.firedPassesOnPlayer, t.cleanPassesOnPlayer, t.lastAttackTargetHits]).toEqual([2, 1, 0]);
    t.playerHit(q, c, false);
    expect([t.cleanPassesOnPlayer, t.lastAttackTargetHits, t.playerHits]).toEqual([0, 1, 3]);
    // 大発への航過: 固めて大発に 3 発 → 分母は増えず、最後の攻撃の標的は大発・命中 3
    t.set.current = 2;
    q.owner = 1;
    t.onCommit(1);
    for (let k = 0; k < 3; k++) t.bargeHit(q, c, 2, DAMAGE, 20 + k);
    t.playerHit(q, c, false); // 大発への航過中に自艇へ逸れた弾
    q.owner = -1;
    q.passes++;
    t.onPassEnd(true);
    expect([t.firedPassesOnPlayer, t.cleanPassesOnPlayer, t.lastAttackTargetHits, t.lastPassTargetKind, t.attacksOnBarges, t.targetKind]).toEqual([2, 0, 3, 1, 1, 1]);
    // 撃たずに終わった航過（標的を失った）は撃った数に入らない
    t.set.current = 0;
    q.owner = 0;
    t.onCommit(0);
    q.owner = -1;
    t.onPassEnd(false);
    expect([t.firedPassesOnPlayer, t.cleanPassesOnPlayer, t.lastAttackTargetHits, t.lastPassTargetKind]).toEqual([2, 0, 0, 0]);
  });
  it('25mm で沈んだ PT の攻撃（core の dropOwner。onPassEnd 無し）は dropAttack で閉じる。開いていない・別の PT なら何もしない', () => {
    const { t, q, c } = world();
    t.begin(480, true);
    q.owner = 0;
    t.onCommit(0);
    t.playerHit(q, c, false);
    q.owner = -1;
    t.dropAttack(1, true);
    expect([t.firedPassesOnPlayer, t.lastAttackTargetHits]).toEqual([0, 0]);
    t.dropAttack(0, true);
    expect([t.firedPassesOnPlayer, t.cleanPassesOnPlayer, t.lastAttackTargetHits]).toEqual([1, 0, 1]);
    t.dropAttack(0, true);
    expect(t.firedPassesOnPlayer).toBe(1);
  });
  it('最初に捉えた標的（firstDetectKind）は最初の立ち上がりの標的で固まる', () => {
    const { t } = world();
    t.onContact(false);
    t.set.current = 2;
    t.onContact(true);
    t.set.current = 0;
    t.onContact(true);
    expect(t.firstDetectKind).toBe(1);
  });
  it('§7: 毎ステップの関数（begin・apply・afterStep・playerHit・bargeHit・onCommit・onPassEnd・onLeave）に new・[]・{}・=> が無い', () => {
    for (const fn of [PtTargets.prototype.begin, PtTargets.prototype.apply, PtTargets.prototype.afterStep, PtTargets.prototype.playerHit, PtTargets.prototype.bargeHit, PtTargets.prototype.onCommit, PtTargets.prototype.onPassEnd, PtTargets.prototype.onLeave]) {
      const src = fn.toString();
      expect(src, src).not.toMatch(/\bnew\b|\[\]|\{\}|=>/);
    }
  });
});

describe('米PT のテレメトリと Result に標的スロットを重ねる（systems/pt-telemetry。spec §C.6・§D.3）', () => {
  it('jp_05（targets 無し）は core の値のまま: targetKind 0・lastPassHits は隊の値・gunLabel は 13mm・passesOnBarges 0', () => {
    const w = ptWorld();
    const t = initPtTelemetry(w);
    w.pts.section.lastPassHits = 3;
    refreshPtTelemetry(t, w);
    expect([t.targetKind, t.lastPassTargetKind, t.lastPassHits]).toEqual([0, 0, 3]);
    const r = ptResult(w)!;
    expect([r.passesOnBarges, r.firstDetectKind, r.gunLabel]).toEqual([0, 0, '13mm']);
  });
  it('targets あり: 被弾・撃った・無傷は自艇への攻撃だけ、HUD の被弾は最後の攻撃の標的の船体への命中、終わる瞬間の攻撃は標的が自艇のときだけ数える', () => {
    const { t, q } = world();
    const base = ptWorld();
    const w = { ...base, pts: { ...base.pts, section: q, p: PT, targets: t } };
    q.hits = 9;
    q.firedPasses = 5;
    q.cleanPasses = 2;
    q.lastPassHits = 4;
    t.playerHits = 3;
    t.firedPassesOnPlayer = 2;
    t.cleanPassesOnPlayer = 1;
    t.lastAttackTargetHits = 1;
    t.lastPassTargetKind = 1;
    t.attacksOnBarges = 3;
    t.firstDetectKind = 1;
    t.set.current = 2;
    const tele = initPtTelemetry(w);
    refreshPtTelemetry(tele, w);
    expect([tele.targetKind, tele.lastPassTargetKind, tele.lastPassHits]).toEqual([1, 1, 1]);
    let r = ptResult(w)!;
    expect([r.hits, r.firedPasses, r.cleanPasses, r.passesOnBarges, r.firstDetectKind, r.gunLabel]).toEqual([3, 2, 1, 3, 1, '13mm']);
    // 終わる瞬間に撃っていた攻撃: 標的が大発なら自艇の分母に入らない、自艇なら入る（無傷なら無傷も）
    q.owner = 0;
    q.boats[0]!.phase = PT_RUN_IN;
    q.boats[0]!.firedThisPass = 2;
    t.attackKind = 1;
    r = ptResult(w)!;
    expect([r.firedPasses, r.cleanPasses]).toEqual([2, 1]);
    t.attackKind = 0;
    t.attackHits = 0;
    r = ptResult(w)!;
    expect([r.firedPasses, r.cleanPasses]).toEqual([3, 2]);
    t.attackHits = 1;
    expect(ptResult(w)!.cleanPasses).toBe(1);
    q.boats[0]!.phase = PT_PATROL;
  });
});

describe('輸送隊のテレメトリと Result の材料（systems/convoy-telemetry。spec §D.2・§D.3）', () => {
  function cw(cv: ReturnType<typeof fakeConvoy> | null, player: BoatState): ConvoyTelemetryWorld {
    return { convoy: cv, boat: { state: player }, setup: { playerStart: S.playerStart, enemyFrom: S.enemyFrom } };
  }
  it('輸送隊の無い任務は enabled false のまま（createConvoyTelemetry と同じ）。Result の材料は null', () => {
    const w = cw(null, { ...S.playerStart, speedMps: 0 });
    expect(initConvoyTelemetry(w)).toEqual(createConvoyTelemetry());
    expect(convoyResult(w)).toBeNull();
  });
  it('jp_01 の出撃時: 3 隻・上陸 0・浜まで 3,040（最後尾 x 960 → 4,000）・最寄りは先頭（150 m 北の自艇から dy +150）・米PT は「東」から', () => {
    const player: BoatState = { ...S.playerStart, speedMps: 0 };
    const cv = fakeConvoy();
    const t = initConvoyTelemetry(cw(cv, player));
    expect([t.enabled, t.total, t.afloat, t.arrived, t.sunk, t.resolved, t.leftM, t.fromDirJa]).toEqual([true, 3, 3, 0, 0, false, 3040, '東']);
    expect([t.nearestDx, t.nearestDy, t.nearestM]).toEqual([0, 150, 150]);
  });
  it('進む・上陸・沈没: 浜までは最も遅れた航行中の大発から、最寄りは航行中の大発だけ、決着でみな上陸か沈没。Result の材料は隻数・上陸・沈没・ノルマ 2・被弾', () => {
    const player: BoatState = { ...S.playerStart, speedMps: 0 };
    const cv = fakeConvoy();
    const w = cw(cv, player);
    const t = initConvoyTelemetry(w);
    for (let k = 0; k < 600; k++) stepConvoy(cv.state, cv.p, (1 / 60) * 5, noEv); // 10 秒 ≈ 180 m
    refreshConvoyTelemetry(t, w);
    expect(t.leftM).toBeCloseTo(3040 - 180.04, 0);
    expect(t.nearestM).toBeGreaterThan(150);
    for (let k = 0; k < 5; k++) hitConvoyBarge(cv.state, 0, DAMAGE, 30, noEv); // 先頭が沈む → 最後尾は変わらず、最寄りは航行中の 2 隻のうち近い方（3 隻目: 自艇 x 1200 の西 59.96 m < 2 隻目の東 60.04 m）
    refreshConvoyTelemetry(t, w);
    expect([t.afloat, t.sunk, t.arrived, t.resolved]).toEqual([2, 1, 0, false]);
    expect(t.nearestDx).toBeCloseTo(cv.state.barges[2]!.x - player.x, 6);
    expect(Math.abs(t.nearestDx)).toBeLessThan(Math.abs(cv.state.barges[1]!.x - player.x));
    cv.state.barges[1]!.phase = CV_ARRIVED;
    cv.state.barges[2]!.phase = CV_ARRIVED;
    cv.state.arrived = 2;
    refreshConvoyTelemetry(t, w);
    expect([t.afloat, t.arrived, t.resolved, t.leftM, t.nearestM]).toEqual([0, 2, true, 0, NaN]);
    expect(convoyResult(w)).toEqual({ total: 3, arrived: 2, sunk: 1, quota: 2, hitsTaken: 5 });
  });
});

describe('上陸の得点（core/scoring の arrivals。spec §B.5・§D.5）', () => {
  const P = getScoringParams(gameData);
  const base: ScoreInput = { returned: true, objectiveDone: true, missionType: 'escort_convoy', bands: [], kills: 0, killEnemyId: 'us_pt_enemy', fuelLeftPct: 58, crewAlive: 7, crewTotal: 7 };
  it('data: escort_convoy の達成 300・上陸 1 隻 100。arrivals を省けば 0（既存の呼び手は不変）、回避の点は無い', () => {
    expect(P.objectiveByType['escort_convoy']).toBe(300);
    expect(P.convoyArrivalPoints).toBe(100);
    expect(P.evadeByType['escort_convoy']).toBeUndefined();
    expect(computeScore(base, P).deliveries).toBe(0);
    expect(computeScore({ ...base, arrivals: 2 }, P)).toEqual({ survival: 700, objective: 300, hits: 0, kills: 0, evade: 0, fuel: 58, crew: 100, deliveries: 200, crewHalf: false, total: 1358 });
  });
  it('§D.5 の順: 3/3 帰投 1458 > 2/3 帰投 1358 > 1/3 帰投（達成なし）800 > 0/3 帰投 700 > 3/3 届けて沈没（PT 2 隻撃沈）580', () => {
    const s = (over: Partial<ScoreInput>): number => computeScore({ ...base, ...over }, P).total;
    expect(s({ arrivals: 3 })).toBe(1458);
    expect(s({ arrivals: 2 })).toBe(1358);
    expect(s({ arrivals: 1, objectiveDone: false })).toBe(800);
    expect(s({ arrivals: 0, objectiveDone: false })).toBe(700);
    expect(s({ arrivals: 3, returned: false, objectiveDone: false, kills: 2, crewAlive: 0 })).toBe(580);
  });
  it('convoy の鍵が無い data でも読め（上陸 0）、鍵があれば points_per_arrival は 0 以上の数', () => {
    const rec = scoring as unknown as ScoringDataRecord;
    expect(isScoringDataRecord(rec)).toBe(true);
    const { convoy: _c, ...noConvoy } = rec;
    expect(isScoringDataRecord(noConvoy)).toBe(true);
    const kpi = gameData.hitRateModel.kpi_by_range.map((b) => b.band);
    const p0 = scoringParamsFromData(noConvoy as ScoringDataRecord, kpi);
    expect(p0.convoyArrivalPoints).toBe(0);
    expect(computeScore({ ...base, arrivals: 3 }, p0).total).toBe(computeScore({ ...base, arrivals: 3 }, p0).total - 0);
    expect(computeScore({ ...base, arrivals: 3 }, p0).total).toBe(1158);
    expect(isScoringDataRecord({ ...rec, convoy: { points_per_arrival: -1 } })).toBe(false);
    expect(isScoringDataRecord({ ...rec, convoy: { points_per_arrival: 'x' } })).toBe(false);
  });
});
