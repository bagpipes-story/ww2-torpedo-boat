// 米PT の標的スロットの隼艇（v0.6.6。systems/pt-target の PtTargets・systems/pt-telemetry。spec-v066 §C.4 #1〜#12・#24・#25・§G）: Phaser を import しない systems だけ。
// 隼艇は core/gunboat の状態で立て替える（systems/gunboat の Gunboat と同じ口: 末尾の船体と hit＝hitGunboat。沈めば船体を落とす）。jp_01 のハードの本物の値。
// 世界の配線（PtSquadron が隼艇の 25mm の後に setGunboatDetect・接触の閃光は隼艇から・mission-world の段の順）はソースで見る（絵と砲はヘッドレスの smoke）。
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { gameData } from '../src/config/game-data';
import type { BoatState } from '../src/core/boat-motion';
import { createConvoy, hitConvoyBarge, type ConvoyEvents } from '../src/core/convoy';
import { createGunboat, hitGunboat } from '../src/core/gunboat';
import { PT_LEAVE, PT_PASS, PT_RUN_IN, createPtSection, createPtTelemetry, type PtCheck, type PtHull } from '../src/core/pt-boats';
import { SeededRng } from '../src/core/rng';
import { enemyDetectRangeM, speedFactorForBand } from '../src/core/visibility';
import { createGunboatCredit } from '../src/systems/gunboat-credit';
import { PtTargets, type PtTargetConvoy, type PtTargetGunboat } from '../src/systems/pt-target';
import { ptResult, refreshPtTelemetry, type PtTelemetryWorld } from '../src/systems/pt-telemetry';
import { buildWorldSetup } from '../src/systems/world-setup';

const H = buildWorldSetup(gameData, 'jp_01', { hard: true });
const N = buildWorldSetup(gameData, 'jp_01');
const GB = H.gunboat!;
const CV = H.convoy!;
const PT = H.ptBoats!;
const DAMAGE = PT.hit.damage;
const noEv: ConvoyEvents = { onArrived: () => {}, onSunk: () => {} };
const strip = (code: string): string => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

afterEach(() => vi.restoreAllMocks());

/** 自艇（出発点）・輸送隊・隼艇（定位置）と標的スロット、手空きの隊（PT0 だけ戦う）と PtCheck。gunboat が偽なら隼艇の無い PtTargets（ノーマルと同じ口） */
function world(gunboat = true) {
  const S = gunboat ? H : N;
  const player: BoatState = { ...S.playerStart, speedMps: 0 };
  const state = createConvoy(S.convoy!.params);
  const bargeDetectM = enemyDetectRangeM(S.ptBoats!.baseDetectM, speedFactorForBand(S.convoy!.detectBand, S.vis.speedFactor), S.vis, false);
  const cv: PtTargetConvoy = { state, p: S.convoy!.params, rule: S.convoy!.rule, detectM: bargeDetectM, hit: (i, dmg, now) => hitConvoyBarge(state, i, dmg, now, noEv) };
  const g = createGunboat(GB, player);
  const hull: PtHull = { boat: g.boat, halfLengthM: GB.halfLengthM, halfBeamM: GB.halfBeamM, valid: true };
  const gb: PtTargetGunboat = {
    hull,
    hit: (dmg, now) => {
      if (!hitGunboat(g, dmg, now)) return false;
      hull.valid = false;
      return true;
    },
  };
  const q = createPtSection(S.ptBoats!, 24);
  const t = new PtTargets(player, S.boatHalfLengthM, S.boatHalfBeamM, cv, q, gunboat ? gb : null);
  for (let i = 1; i < q.boats.length; i++) q.boats[i]!.phase = PT_LEAVE;
  const c: PtCheck = { boat: player, boatHalfLengthM: S.boatHalfLengthM, boatHalfBeamM: S.boatHalfBeamM, detectOpenM: 0, smokeFactor: 1, smoke: null, smokeParams: null, targetValid: true, visRange2: S.visRange2, dawn: false, timeS: 10, targets: t.hulls };
  return { S, player, cv, g, hull, t, q, c };
}

/** pt-telemetry が読む世界（標的スロットと隼艇の手柄） */
function teleWorld(w: ReturnType<typeof world>, credit = createGunboatCredit(w.q.boats.length)): PtTelemetryWorld {
  return { pts: { section: w.q, p: w.S.ptBoats!, firstDetectBand: '', enemyId: 'us_pt_enemy', gun: null, targets: w.t, gunboat: { credit } }, boat: { state: w.player }, params: w.S.boatParams, visRange2: w.S.visRange2, damageParams: w.S.damageParams };
}

describe('PtTargets の隼艇（systems/pt-target。spec-v066 §C.4）', () => {
  it('船体は自艇 + 大発 3 隻 + 末尾に隼艇（nb + 1 = 4。隼艇の船体そのもの）。隼艇の見つかる距離は PtSquadron が書くまで 0、setGunboatDetect で末尾だけ。隼艇の無い任務は −1 で何もしない', () => {
    const { t, hull, q } = world();
    expect([t.hulls.length, t.nb, t.gunboatHull, q.boats.length]).toEqual([5, 3, 4, 3]);
    expect(t.hulls[4]).toBe(hull);
    expect([t.hulls[4]!.halfLengthM, t.hulls[4]!.halfBeamM]).toEqual([GB.halfLengthM, GB.halfBeamM]);
    expect(t.set.detectM.length).toBe(5);
    expect(t.set.detectM[4]).toBe(0);
    t.setGunboatDetect(300);
    expect(Array.from(t.set.detectM)).toEqual([0, 600, 600, 600, 300]);
    const n = world(false).t;
    expect([n.hulls.length, n.gunboatHull, n.attacksOnGunboat, n.gunboatLosses]).toEqual([4, -1, 0, 0]);
    n.setGunboatDetect(300);
    expect(Array.from(n.set.detectM)).toEqual([0, 600, 600, 600]);
  });
  it('隼艇の無い PtTargets は省略と null で同じ（ノーマルの jp_01 の欄は v0.6.5 のまま＋隼艇の 3 欄が −1・0・0）', () => {
    const S = N;
    const player: BoatState = { ...S.playerStart, speedMps: 0 };
    const mk = (withNull: boolean): PtTargets => {
      const state = createConvoy(S.convoy!.params);
      const cv: PtTargetConvoy = { state, p: S.convoy!.params, rule: S.convoy!.rule, detectM: 600, hit: () => false };
      const q = createPtSection(S.ptBoats!, 24);
      return withNull ? new PtTargets(player, S.boatHalfLengthM, S.boatHalfBeamM, cv, q, null) : new PtTargets(player, S.boatHalfLengthM, S.boatHalfBeamM, cv, q);
    };
    expect(JSON.stringify(mk(true))).toBe(JSON.stringify(mk(false)));
  });
  it('選ぶ・選ばない境: 点数 = PT までの d² ÷ 見つかる距離²（今の標的の点数 × 0.8² より小さいときだけ替える）。自艇が PT から 1,000 m（帯 600 m: 2.78）なら隼艇（×0.5 の静音 300 m）は 390 m で選ばれ（1.69 < 1.78）410 m で選ばれない（1.87）。標的が隼艇なら targetKind 2・aimedBarge −1', () => {
    for (const [dM, want] of [[390, 4], [410, 0]] as const) {
      const { t, q, c, g, player } = world();
      const b = q.boats[0]!;
      // 大発は PT から遠く（出発の位置＝4 km 以上西）、自艇は PT の西 1,000 m、隼艇は PT の北 dM
      Object.assign(b, { x: 6000, y: 1000, phase: PT_RUN_IN });
      Object.assign(player, { x: 5000, y: 1000 });
      Object.assign(g.boat, { x: 6000, y: 1000 - dM });
      t.begin(600, true);
      t.setGunboatDetect(300);
      t.apply(q, c, 0, 10);
      expect(t.set.current, `${dM} m`).toBe(want);
      if (want === 4) {
        expect([t.targetKind, t.aimedBarge, c.boat, c.detectOpenM, c.boatHalfLengthM, c.targetValid]).toEqual([2, -1, g.boat, 300, GB.halfLengthM, true]);
        // 狙われている隼艇: 隊が捉えているか攻撃中だけ
        expect(t.aimedGunboat).toBe(false);
        q.detected = true;
        expect(t.aimedGunboat).toBe(true);
        t.hulls[4]!.valid = false;
        expect(t.aimedGunboat).toBe(false);
      } else expect([t.targetKind, t.aimedGunboat]).toEqual([0, false]);
    }
  });
  it('着弾の振り分け（hullHit）: 0 と無しは自艇（false）、1..nb は大発、nb+1 は隼艇の HP だけ（乱数を引かない）。15 発目で沈み、同じステップで船体（標的なら targetValid も）を落とす。沈んだ後は当たらない', () => {
    const next = vi.spyOn(SeededRng.prototype, 'next');
    const { t, q, c, g, cv } = world();
    expect([t.hullHit(q, c, undefined, DAMAGE, 1), t.hullHit(q, c, 0, DAMAGE, 1)]).toEqual([false, false]);
    expect(t.hullHit(q, c, 1, DAMAGE, 1)).toBe(true);
    expect([t.bargeHits, cv.state.barges[0]!.hp, g.hp]).toEqual([1, CV.params.hp - DAMAGE, GB.hullHp]);
    t.set.current = 4;
    c.targetValid = true;
    for (let k = 0; k < 14; k++) expect(t.hullHit(q, c, 4, DAMAGE, 20 + k)).toBe(true);
    expect([g.hp, g.hitsTaken, g.sunk, t.hulls[4]!.valid, c.targetValid, t.bargeHits, t.playerHits]).toEqual([4, 14, false, true, true, 1, 0]);
    expect(t.gunboatHit(q, c, DAMAGE, 40)).toBe(true);
    expect([g.hp, g.sunk, g.sunkS, t.hulls[4]!.valid, c.targetValid]).toEqual([0, true, 40, false, false]);
    expect(t.gunboatHit(q, c, DAMAGE, 41)).toBe(false);
    expect(g.hitsTaken).toBe(15);
    expect(next).not.toHaveBeenCalled();
  });
  it('攻撃の数え: 隼艇を狙って固めた攻撃（航過＋連射）は attacksOnGunboat、命中は最後の攻撃の標的の命中に。自艇の「撃った・無傷」と大発への航過には入らない', () => {
    const { t, q, c } = world();
    t.begin(480, true);
    t.set.current = 4;
    q.owner = 0;
    t.onCommit(0);
    expect([t.attackKind, t.attacksOnGunboat]).toEqual([2, 1]);
    for (let k = 0; k < 3; k++) t.hullHit(q, c, 4, DAMAGE, 10 + k);
    t.playerHit(q, c, false); // 隼艇への航過中に自艇へ逸れた弾
    q.owner = -1;
    q.passes++;
    t.onPassEnd(true);
    expect([t.lastPassTargetKind, t.lastAttackTargetHits, t.firedPassesOnPlayer, t.cleanPassesOnPlayer, t.attacksOnBarges]).toEqual([2, 3, 0, 0, 0]);
    // 連射も数える（core の q.passes が増えなくても）
    q.owner = 1;
    q.boats[1]!.burst = true;
    t.onCommit(1);
    q.owner = -1;
    t.onPassEnd(false);
    expect([t.attacksOnGunboat, t.lastAttackTargetHits, t.lastPassTargetKind]).toEqual([2, 0, 2]);
  });
  it('隼艇が標的の間に切れた接触は gunboatLosses（受け継ぎと重ねない）。Result の「見失わせた」から引く。自艇が標的の見失いは引かない', () => {
    const w = world();
    const { t, q } = w;
    t.set.current = 4;
    q.lostContacts = 1;
    t.afterStep(0);
    expect([t.gunboatLosses, t.inheritedLosses]).toEqual([1, 0]);
    t.set.current = 0;
    q.lostContacts = 2;
    t.afterStep(1);
    expect([t.gunboatLosses, t.inheritedLosses]).toEqual([1, 0]);
    expect(ptResult(teleWorld(w))!.lostContacts).toBe(1);
  });
  it('テレメトリ: HUD の「命中 計」は自艇の分（隊の命中 − 隼艇の分）、航過中に標的の隼艇が的でなくなれば passTargetLost、今の標的の種類 2', () => {
    const w = world();
    const credit = createGunboatCredit(3);
    w.q.gunHits = 5;
    credit.hits = 3;
    const pt = createPtTelemetry();
    w.t.set.current = 4;
    w.q.owner = 0;
    w.q.boats[0]!.phase = PT_PASS;
    refreshPtTelemetry(pt, teleWorld(w, credit));
    expect([pt.gunHits, pt.targetKind, pt.passTargetLost]).toEqual([2, 2, false]);
    w.t.hulls[4]!.valid = false;
    refreshPtTelemetry(pt, teleWorld(w, credit));
    expect(pt.passTargetLost).toBe(true);
  });
  it('§7: gunboatHit・hullHit・aimedGunboat・setGunboatDetect・afterStep に確保を書かない（new・[]・{}・=>）', () => {
    const src = strip(readFileSync('src/systems/pt-target.ts', 'utf8'));
    for (const [from, to] of [['hullHit(q: PtSection', 'bargeHit(q: PtSection'], ['gunboatHit(q: PtSection', 'private countHit'], ['get aimedGunboat()', 'onContact(gained'], ['afterStep(lostBefore', 'playerSeen(): boolean']] as const) {
      const body = src.slice(src.indexOf(from), src.indexOf(to));
      expect(body.length, from).toBeGreaterThan(60);
      for (const s of ['new ', '[]', '{}', '=>']) expect(body, `${from} ${s}`).not.toContain(s);
    }
  });
  it('配線（ソース）: PtSquadron は自艇の 25mm の後・標的の選択の前に隼艇の 25mm（setGunboatDetect は Gunboat.fire の中）、標的が隼艇なら接触の閃光は隼艇から。mission-world は輸送隊の直後に隼艇の段', () => {
    const sq = strip(readFileSync('src/systems/pt-squadron.ts', 'utf8'));
    const step = sq.slice(sq.indexOf('step(dt: number, feelDt: number'));
    const idx = ['this.gun.step(w.band', 'this.gunboat.fire(t, q, c.timeS', 't.apply(q, c', 'c.flashM = ptContactFlashM(', 'this.gunboat.contactFlash(c, gbFired)', 'stepPtSection(q'].map((s) => step.indexOf(s));
    expect(idx.every((i) => i > 0), idx.join(' ')).toBe(true);
    for (let k = 1; k < idx.length; k++) expect(idx[k - 1]!).toBeLessThan(idx[k]!);
    expect(step).toContain('if (this.gunboat && t.set.current === t.gunboatHull) this.gunboat.contactFlash(c, gbFired);');
    const gb = strip(readFileSync('src/systems/gunboat.ts', 'utf8'));
    expect(gb).toContain('t.setGunboatDetect(this.p.targetRangeFactor * Math.max(bandM, ptHeldFlashM(nowS, this.lastFireS, t.rule.flashHoldS, this.p.gun.flashRevealM)));');
    expect(gb).toContain('c.flashM = fired ? this.p.gun.flashRevealM : 0;');
    expect(gb).toContain("{ seedOffset: GUNBOAT_GUN_SEED_OFFSET, tint: GUNBOAT_TRACER_TINT, ring: false }");
    const mw = strip(readFileSync('src/systems/mission-world.ts', 'utf8'));
    const fn = mw.slice(mw.indexOf('stepFn'));
    // 米PT の段は v0.6.7 S0 から systems/world-enemy-step の stepEnemySide の中（mission-world はその段を隼艇の後に呼ぶ）
    const [cvI, gbI, ptI] = [fn.indexOf('this.convoy?.step(dt);'), fn.indexOf('this.gunboat?.step(dt,'), fn.indexOf('stepEnemySide(this, g, dt, feelDt, boat);')];
    expect(strip(readFileSync('src/systems/world-enemy-step.ts', 'utf8'))).toContain('w.pts?.step(dt, feelDt, w, w.input.gunHeld);');
    expect([cvI, gbI, ptI].every((i) => i > 0)).toBe(true);
    expect(cvI).toBeLessThan(gbI);
    expect(gbI).toBeLessThan(ptI);
  });
});
