// T-14 の 13mm が米PT に当たったとき（v0.6.3 実機 1 回目。docs/02 §6.4、enemies.json の us_pt_enemy.under_fire）: 撃退と撃沈。
// 1 命中ごとに呼ぶ側が seed+20 の系列（PT_GUN_SEED_OFFSET）から 1 回引いて u で渡す: u < fire_chance は引火で沈む（PT が沈む唯一の道）、
// その上の casualty_chance は死傷で去る、どれでもなく HP が retreat_hp 以下なら穴だらけで去る。HP だけでは沈まない（retreat_hp < HP は pt-data の検査）。
// 航過中に撃退された PT は撃つのをやめ、固めた針路のまま抜けてから去る（赤い線は消えない。endPass が去るへ）。航過中に沈んだ PT の航過は dropOwner で閉じる。
// v0.6.3 実機 2 回目（制圧。spec r2 §D.2-8）: 結末の無い命中のうち、追撃中か連射中の PT への命中を数え、chase.suppress_hits で追撃をやめさせる（連射 1 回分を使う。
// 撃っている PT は黙って窓の終わりまで線を残し、待っている PT は艇から離れる向きへ離脱）。今の命中の出来事を使う（乱数を足さない）。
// 標的の判定（ptLive・ptNeverBlocked）は gun-battery の本体に渡す module の関数（毎ステップ閉包を作らない）。Phaser 非依存・確保しない。AI は乱数を引かない。
import type { PtParams } from './pt-data';
import { dropOwner } from './pt-pass-end';
import { PT_BREAK, PT_CHASE, PT_FATE_CREW, PT_FATE_HULL, PT_FATE_NONE, PT_FATE_SUNK, PT_LEAVE, PT_PASS, PT_SUNK, ptFighting, type PtBoatState, type PtEvents, type PtSection } from './pt-state';
import { bearingDeg } from './ship-ai';

/** 13mm の出来事（PtSection.gunEvent。HUD の 2 行目「米PT 撃退！」「米PT 撃沈！」）: 値は結末（PT_FATE_*）と同じ。制圧（追撃をやめて離れる。v0.6.3 実機 2 回目）は 4 */
export const PT_GUN_EV_CREW = PT_FATE_CREW;
export const PT_GUN_EV_HULL = PT_FATE_HULL;
export const PT_GUN_EV_SUNK = PT_FATE_SUNK;
export const PT_GUN_EV_SUPPRESS = 4;

/** 13mm の標的にできる PT（去っていない・沈んでいない＝まだ戦う段階 ptFighting。去る・海域の外・沈んだ PT に落ちた弾は外れ） */
export function ptLive(b: PtBoatState): boolean {
  return ptFighting(b.phase);
}

/** T-14 に煙幕は無い（PT への線はいつも遮られない） */
export function ptNeverBlocked(_b: PtBoatState): boolean {
  return false;
}

/**
 * 生きた PT i への 1 命中（呼ぶ側は ptLive の PT にだけ呼ぶ）。damage は 13mm の 1 発、u は seed+20 の 1 回（0〜1）。結末（PT_FATE_*）を返す。
 * 撃沈: 航過中なら航過を閉じ（onPassEnd なし）、その場に止まる（PT_SUNK）。撃退: 航過中なら弾を 0 にして航過を続け（終わりで去る）、そうでなければすぐ去る（onLeave）。
 * 結末は 1 回だけ（撃退された PT に当たっても引火の他は何も起きない）。結末の無い命中は追撃中・連射中なら制圧に数える（suppressChaser）
 */
export function hitPt(q: PtSection, p: PtParams, i: number, damage: number, u: number, ev: PtEvents): number {
  const b = q.boats[i]!;
  b.hp -= damage;
  b.hitsTaken++;
  q.gunHits++;
  const owner = q.owner === i && b.phase === PT_PASS;
  if (u < p.fireChance) {
    // ガソリンに引火: PT が沈む唯一の道
    dropOwner(q, p, b, i);
    b.phase = PT_SUNK;
    b.speedMps = 0;
    b.fate = PT_FATE_SUNK;
    q.sunk++;
    gunEvent(q, PT_GUN_EV_SUNK, i);
    return PT_FATE_SUNK;
  }
  if (b.fate !== PT_FATE_NONE) return b.fate; // もう撃退された（航過を抜けるところ）
  const f = u < p.fireChance + p.casualtyChance ? PT_FATE_CREW : b.hp <= p.retreatHp ? PT_FATE_HULL : PT_FATE_NONE;
  if (f === PT_FATE_NONE) {
    suppressChaser(q, p, b, i, owner); // 木の船体に穴が開いただけ（火花のみ）。追撃の PT は数える
    return f;
  }
  b.fate = f;
  q.retired++;
  if (owner) b.roundsLeft = 0; // 黙る: 固めた針路のまま抜け、endPass が去るへ（赤い線は消えない）
  else {
    b.phase = PT_LEAVE;
    b.timerS = 0;
    ev.onLeave(i);
  }
  gunEvent(q, f === PT_FATE_CREW ? PT_GUN_EV_CREW : PT_GUN_EV_HULL, i);
  return f;
}

/**
 * 制圧（v0.6.3 実機 2 回目）: 追撃中か連射中の、まだ制圧されていない PT への結末の無い命中を数え、chase.suppress_hits で追撃をやめさせる（連射 1 回分を使う・HUD の出来事）。
 * 連射中なら黙る（弾 0。赤い線は窓の終わりまで残り、終わりで離脱。core/pt-chase の endBurst）、待っているなら最後に見た艇の位置から離れる向きへすぐ離脱（離脱の後は突撃＝また追撃になりうる）
 */
function suppressChaser(q: PtSection, p: PtParams, b: PtBoatState, i: number, owner: boolean): void {
  if (b.suppressed || !(b.phase === PT_CHASE || (owner && b.burst))) return;
  if (++b.chaseHits < p.chaseSuppressHits) return;
  b.suppressed = true;
  b.chaseHits = 0;
  b.bursts++;
  q.suppressions++;
  q.suppressSeq++;
  if (owner) b.roundsLeft = 0;
  else {
    b.phase = PT_BREAK;
    b.lockDeg = bearingDeg(q.lkX, q.lkY, b.x, b.y);
    b.timerS = 0;
  }
  gunEvent(q, PT_GUN_EV_SUPPRESS, i);
}

/** 出来事を記す（HUD は通し番号が増えたら 2.5 秒出す） */
function gunEvent(q: PtSection, kind: number, i: number): void {
  q.gunEvent = kind;
  q.gunEventBoat = i;
  q.gunEventSeq++;
}
