// 標的スロットの世界側の数え（v0.6.4 レビューの直し。systems/pt-target の PtTargets と systems/pt-telemetry の ptResult）: core の本物の commitPass・endPass・stepPtSection と、
// PtSquadron と同じ配線（onCommit・onPassEnd・onLeave・onImpact、隊の前の begin・apply と後の afterStep）で回す。
// ai:R1 夜明けの latch（onPassEnd 無し）で切れた攻撃も閉じる、ai:R2 「（大発へ M）」は core が航過に数えたものだけ、ai:R4 標的が沈んだための切り替えで受け継いだ接触が切れたのは「見失わせた」に入れない。
// 輸送隊は core/convoy の状態で立て替える（tests/pt-target-world と同じ）。PtSquadron そのもの（Phaser）の配線はヘッドレスの smoke で確かめる。
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import type { BoatState } from '../src/core/boat-motion';
import { CV_ARRIVED, CV_SUNK, createConvoy, hitConvoyBarge, type ConvoyEvents } from '../src/core/convoy';
import { PT_ALERT, PT_LEAVE, PT_RUN_IN, createPtSection, stepPtSection, type PtCheck, type PtEvents, type PtSection } from '../src/core/pt-boats';
import { commitPass, endPass } from '../src/core/pt-pass-end';
import { SeededRng } from '../src/core/rng';
import { enemyDetectRangeM, speedFactorForBand } from '../src/core/visibility';
import { PtTargets, type PtTargetConvoy } from '../src/systems/pt-target';
import { ptResult } from '../src/systems/pt-telemetry';
import { buildWorldSetup } from '../src/systems/world-setup';
import type { PtResult } from '../src/ui/result-types';
import { ptWorld } from './pt-ui-kit';

const S = buildWorldSetup(gameData, 'jp_01');
const CV = S.convoy!;
const PT = S.ptBoats!;
const DAMAGE = PT.hit.damage;
const BARGE_DETECT_M = enemyDetectRangeM(PT.baseDetectM, speedFactorForBand(CV.detectBand, S.vis.speedFactor), S.vis, false);
/** 自艇の停止の帯の発見距離（新月 480 m。大発と同じ） */
const STOP_M = 480;
const FEEL = 1 / 60;
const noEv: ConvoyEvents = { onArrived: () => {}, onSunk: () => {} };

interface Rig { player: BoatState; cv: PtTargetConvoy & { state: ReturnType<typeof createConvoy> }; t: PtTargets; q: PtSection; c: PtCheck; ev: PtEvents; rng: SeededRng }

/** 自艇・輸送隊・隊（PT1 は去った）・標的スロットと、PtSquadron と同じ配線の events。arrivedFrom 以降の大発は上陸済み（的でない） */
function rig(arrivedFrom = 3): Rig {
  const player: BoatState = { ...S.playerStart, speedMps: 0 };
  const state = createConvoy(CV.params);
  for (let k = arrivedFrom; k < state.barges.length; k++) state.barges[k]!.phase = CV_ARRIVED;
  const cv = { state, p: CV.params, rule: CV.rule, detectM: BARGE_DETECT_M, hit: (i: number, dmg: number, now: number) => hitConvoyBarge(state, i, dmg, now, noEv) };
  const q = createPtSection(PT, 24);
  const t = new PtTargets(player, S.boatHalfLengthM, S.boatHalfBeamM, cv, q);
  Object.assign(q.boats[1]!, { phase: PT_LEAVE });
  const c: PtCheck = { boat: player, boatHalfLengthM: S.boatHalfLengthM, boatHalfBeamM: S.boatHalfBeamM, detectOpenM: 0, smokeFactor: 1, smoke: null, smokeParams: null, targetValid: true, visRange2: S.visRange2, dawn: false, timeS: 10, targets: t.hulls };
  const ev: PtEvents = {
    onContact: (g) => t.onContact(g),
    onCommit: (i) => t.onCommit(i),
    onFire: () => {},
    onImpact: (_x, _y, hit, hull) => {
      if (!hit) return;
      if (hull !== undefined && hull > 0) t.bargeHit(q, c, hull, DAMAGE, c.timeS);
      else t.playerHit(q, c, false);
    },
    onPassEnd: (_i, fired) => t.onPassEnd(fired),
    onLeave: (i) => t.onLeave(i),
    onOut: () => {},
  };
  return { player, cv, t, q, c, ev, rng: new SeededRng(1) };
}

/** PtSquadron.step の順（25mm は無し）: begin → apply → 隊（dt 0 なら運動と弾は止めて時計だけ）→ afterStep */
function step(r: Rig, dt: number): void {
  r.t.begin(STOP_M, true);
  r.t.apply(r.q, r.c, 0, r.c.timeS);
  r.c.flashM = 0;
  const lost0 = r.q.lostContacts;
  stepPtSection(r.q, PT, r.c, r.rng, FEEL, dt, r.ev);
  r.t.afterStep(lost0);
  r.c.timeS += FEEL;
}

/** ptResult の世界（隊と標的スロットを差し替えた ptWorld） */
function result(r: Rig): PtResult {
  const base = ptWorld();
  return ptResult({ ...base, pts: { ...base.pts, section: r.q, p: PT, targets: r.t } })!;
}

/** core の本物の航過: 固めて（onCommit）、撃った弾数と秒を書いて終える（endPass が数える・onPassEnd） */
function pass(r: Rig, fired: number, timerS: number, end = true): void {
  const b = r.q.boats[0]!;
  commitPass(r.q, r.c, b, 0, 270, PT.passMinMps, PT.roundsPerPass);
  r.ev.onCommit(0, 270, r.q.dodge);
  b.firedThisPass = fired;
  b.timerS = timerS;
  if (end) endPass(r.q, PT, b, 0, r.ev);
}

describe('夜明けで切れた攻撃（core/pt-boats の latch は onPassEnd を呼ばない。レビュー ai:R1）', () => {
  it('撃った自艇への攻撃が夜明けで切れ、その弾が後から自艇に落ちる: かわした 1/2（core と同じ 2/2/1）。前の攻撃の無傷を取り消さない', () => {
    const r = rig(0); // 大発はみな上陸（標的は自艇だけ）
    Object.assign(r.q.boats[0]!, { x: r.player.x + 200, y: r.player.y, phase: PT_RUN_IN });
    r.t.begin(STOP_M, true);
    pass(r, 3, 3); // 前の攻撃: 撃って無傷
    expect([r.q.passes, r.q.firedPasses, r.q.cleanPasses, r.t.firedPassesOnPlayer, r.t.cleanPassesOnPlayer]).toEqual([1, 1, 1, 1, 1]);
    pass(r, 2, 3, false); // 2 回目: 撃った後に夜明け（開いたまま）。その 1 発が次のステップで自艇に落ちる
    Object.assign(r.q.shells[0]!, { active: true, x: r.player.x, y: r.player.y, vx: 0, vy: 0, leftS: 1e-4, impactX: r.player.x, impactY: r.player.y, gunIndex: 0 });
    r.c.dawn = true;
    step(r, FEEL * PT.timeScale);
    expect([r.q.owner, r.q.passes, r.q.firedPasses, r.q.cleanPasses, r.q.hits]).toEqual([-1, 2, 2, 1, 1]);
    expect([r.t.firedPassesOnPlayer, r.t.cleanPassesOnPlayer, r.t.playerHits, r.t.lastAttackTargetHits]).toEqual([2, 1, 1, 1]);
    const res = result(r);
    expect([res.passes, res.firedPasses, res.cleanPasses, res.hits]).toEqual([2, 2, 1, 1]);
    r.t.dropAttack(0, true); // 閉じた攻撃は二度数えない
    expect(r.t.firedPassesOnPlayer).toBe(2);
  });
  it('撃たずに夜明けで切れた攻撃は数えない（撃ったかはその PT の firedThisPass。core の lastPassFired は前の攻撃の true のまま）', () => {
    const r = rig(0);
    Object.assign(r.q.boats[0]!, { x: r.player.x + 200, y: r.player.y, phase: PT_RUN_IN });
    r.t.begin(STOP_M, true);
    pass(r, 3, 3);
    pass(r, 0, 1, false);
    r.c.dawn = true;
    step(r, FEEL * PT.timeScale);
    expect([r.q.passes, r.q.firedPasses, r.q.cleanPasses, r.q.lastPassFired]).toEqual([1, 1, 1, true]);
    expect([r.t.firedPassesOnPlayer, r.t.cleanPassesOnPlayer]).toEqual([1, 1]);
    r.t.dropAttack(0, true); // 夜明けで閉じている
    expect(r.t.firedPassesOnPlayer).toBe(1);
  });
});

describe('「航過 N 回（大発へ M）」の M は core が航過に数えたものだけ（レビュー ai:R2・ux:ux-8）', () => {
  it('open_fire_s 前に撃たずに終わった大発への航過は数えない・撃たずに open_fire_s 経てば数える・終わる瞬間に撃っていれば数える・夜明けで切れた撃った航過も数える。いつも M ≤ N', () => {
    const r = rig(1); // 大発は先頭だけ航行中
    const b0 = r.cv.state.barges[0]!;
    Object.assign(r.q.boats[0]!, { x: b0.x + 300, y: b0.y, phase: PT_RUN_IN });
    r.player.x = 3500;
    r.player.y = 1000;
    r.t.begin(STOP_M, true);
    r.t.apply(r.q, r.c, 0, 10);
    expect([r.t.targetKind, r.c.boat]).toEqual([1, b0]);
    const nm = (): number[] => {
      const res = result(r);
      return [res.passes, res.passesOnBarges];
    };
    pass(r, 0, PT.openFireS - 1); // 大発が上陸した直後などで撃たずに後ろへ抜けた
    expect([r.q.passes, r.t.attacksOnBarges, ...nm()]).toEqual([0, 0, 0, 0]);
    pass(r, 0, PT.openFireS); // 撃たないまま open_fire_s 経った
    expect([r.q.passes, r.t.attacksOnBarges, ...nm()]).toEqual([1, 1, 1, 1]);
    pass(r, 2, 3, false); // 終わる瞬間に撃っていた（ptResult の open）
    expect(nm()).toEqual([2, 2]);
    r.c.dawn = true;
    step(r, 0); // 夜明けの latch が数えて onLeave で閉じる
    expect([r.q.owner, r.q.passes, r.t.attacksOnBarges, r.t.firedPassesOnPlayer, ...nm()]).toEqual([-1, 2, 2, 0, 2, 2]);
  });
});

describe('受け継いだ接触が切れたのは「見失わせた」ではない（レビュー ai:R4。core の q.lostContacts と模擬は変えない）', () => {
  /** PT0 を大発の先頭の東 300 m に反応待ち（ALERT。航過を固めない）で置き、自艇を (x, y) に。大発は先頭だけ航行中 */
  function setUp(px: number, py: number): Rig {
    const r = rig(1);
    const b0 = r.cv.state.barges[0]!;
    Object.assign(r.q.boats[0]!, { x: b0.x + 300, y: b0.y, phase: PT_ALERT, timerS: 1e6 });
    r.player.x = px;
    r.player.y = py;
    return r;
  }
  /** 隊が捉えなくなるまで（detect_hold_s + 余裕）時計だけ進める */
  function runUntilLost(r: Rig): void {
    for (let k = 0; r.q.detected && k < (PT.detectHoldS + 2) / FEEL; k++) step(r, 0);
    expect(r.q.detected).toBe(false);
  }
  it('大発を捉えていて沈む → 見えていない自艇へ替わり、残りの秒が切れる: core は 1 回数えるが Result は 0 回', () => {
    const r = setUp(3500, 1000);
    step(r, 0);
    expect([r.t.targetKind, r.q.detected, r.q.seen[0]]).toEqual([1, true, 1]);
    r.cv.state.barges[0]!.phase = CV_SUNK;
    step(r, 0);
    expect([r.t.targetKind, r.q.detected, r.q.seen[0]]).toEqual([0, true, 0]);
    runUntilLost(r);
    expect([r.q.lostContacts, r.t.inheritedLosses, result(r).lostContacts]).toEqual([1, 1, 0]);
  });
  it('替わった先の自艇を PT が見れば受け継ぎは終わり、その後に自艇が離れて切れたのは見失わせた 1 回', () => {
    const r = setUp(0, 0);
    r.player.x = r.q.boats[0]!.x;
    r.player.y = r.q.boats[0]!.y + 400; // 自艇 400 m（点数 0.69）より大発 300 m（0.39）が近い
    step(r, 0);
    expect(r.t.targetKind).toBe(1);
    r.cv.state.barges[0]!.phase = CV_SUNK;
    step(r, 0);
    expect([r.t.targetKind, r.q.seen[0]]).toEqual([0, 1]);
    r.player.x = 3500;
    r.player.y = 1000;
    runUntilLost(r);
    expect([r.q.lostContacts, r.t.inheritedLosses, result(r).lostContacts]).toEqual([1, 0, 1]);
  });
  it('自艇を捉えていて自艇が離れて切れたのは見失わせた 1 回（替わっていない）', () => {
    const r = setUp(0, 0);
    r.cv.state.barges[0]!.phase = CV_ARRIVED;
    r.player.x = r.q.boats[0]!.x;
    r.player.y = r.q.boats[0]!.y + 300;
    step(r, 0);
    expect([r.t.targetKind, r.q.detected]).toEqual([0, true]);
    r.player.x = 3500;
    r.player.y = 1000;
    runUntilLost(r);
    expect([r.q.lostContacts, r.t.inheritedLosses, result(r).lostContacts]).toEqual([1, 0, 1]);
  });
});
