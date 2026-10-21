// T-14 の 13mm が米PT に当たったとき（v0.6.3 実機 1 回目。docs/02 §6.4、enemies.json の us_pt_enemy.under_fire）: 撃退と撃沈。
// 1 命中ごとに呼ぶ側が seed+20 の系列（PT_GUN_SEED_OFFSET）から 1 回引いて u で渡す: u < fire_chance は引火で沈む（PT が沈む唯一の道）、
// その上の casualty_chance は死傷で去る、どれでもなく HP が retreat_hp 以下なら穴だらけで去る。HP だけでは沈まない（retreat_hp < HP は pt-data の検査）。
// 航過中に撃退された PT は撃つのをやめ、固めた針路のまま抜けてから去る（赤い線は消えない。endPass が去るへ）。航過中に沈んだ PT の航過は dropOwner で閉じる。
// 標的の判定（ptLive・ptNeverBlocked）は gun-battery の本体に渡す module の関数（毎ステップ閉包を作らない）。Phaser 非依存・確保しない。AI は乱数を引かない。
import type { PtParams } from './pt-data';
import { dropOwner } from './pt-pass-end';
import { PT_BREAK, PT_FATE_CREW, PT_FATE_HULL, PT_FATE_NONE, PT_FATE_SUNK, PT_LEAVE, PT_PASS, PT_SUNK, type PtBoatState, type PtEvents, type PtSection } from './pt-state';

/** 13mm の出来事（PtSection.gunEvent。HUD の 2 行目「米PT 撃退！」「米PT 撃沈！」）: 値は結末（PT_FATE_*）と同じ */
export const PT_GUN_EV_CREW = PT_FATE_CREW;
export const PT_GUN_EV_HULL = PT_FATE_HULL;
export const PT_GUN_EV_SUNK = PT_FATE_SUNK;

/** 13mm の標的にできる PT（去っていない・沈んでいない＝段階が離脱まで。去る・海域の外・沈んだ PT に落ちた弾は外れ） */
export function ptLive(b: PtBoatState): boolean {
  return b.phase <= PT_BREAK;
}

/** T-14 に煙幕は無い（PT への線はいつも遮られない） */
export function ptNeverBlocked(_b: PtBoatState): boolean {
  return false;
}

/**
 * 生きた PT i への 1 命中（呼ぶ側は ptLive の PT にだけ呼ぶ）。damage は 13mm の 1 発、u は seed+20 の 1 回（0〜1）。結末（PT_FATE_*）を返す。
 * 撃沈: 航過中なら航過を閉じ（onPassEnd なし）、その場に止まる（PT_SUNK）。撃退: 航過中なら弾を 0 にして航過を続け（終わりで去る）、そうでなければすぐ去る（onLeave）。
 * 結末は 1 回だけ（撃退された PT に当たっても引火の他は何も起きない）
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
  if (f === PT_FATE_NONE) return f; // 木の船体に穴が開いただけ（火花のみ）
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

/** 出来事を記す（HUD は通し番号が増えたら 2.5 秒出す） */
function gunEvent(q: PtSection, kind: number, i: number): void {
  q.gunEvent = kind;
  q.gunEventBoat = i;
  q.gunEventSeq++;
}
