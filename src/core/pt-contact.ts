// 敵の米PT の隊の接触（spec §C.5 の 1。v0.6.4 で core/pt-boats の stepPtSection から切り出し。中身はそのまま）: どれか 1 隻が見れば隊が捉え、最後に見た位置と速度（lk*）を残す。
// 艇の 13mm の閃光（c.flashM）でも見つける。みな去れば捉えるのをやめる（見失わせたに数えない）。乱数は引かない・毎ステップ確保しない。
// pt-boats だけが呼ぶ（stepPtSection の 1。目標の推定・夜明け・PT ごとの段階はそのまま pt-boats）。
import type { BoatState } from './boat-motion';
import type { PtParams } from './pt-data';
import { smokeBlocked } from './pt-fire';
import { ptFighting, type PtCheck, type PtEvents, type PtSection } from './pt-state';

/** 接触（隊で 1 つ）: q の seen・detected・holdLeftS・lk*・closest2・firstDetectM・flashFirst・lostContacts を書き、捉えた・見失った瞬間に ev.onContact。boat は c.boat、vpx・vpy はその速度（m/s）、feelDt は体感秒 */
export function stepPtContact(q: PtSection, p: PtParams, c: PtCheck, boat: BoatState, vpx: number, vpy: number, feelDt: number, ev: PtEvents): void {
  const boats = q.boats;
  // 1. 接触: どれか 1 隻が見れば隊が捉える（最後に見た位置と速度を残す）。艇の 13mm を撃ったステップは閃光の距離（c.flashM）でも見つける（煙幕は無関係）
  let anySeen = false;
  let anyLive = false;
  let anyNormal = false;
  let near2 = Infinity;
  const fl = c.flashM ?? 0;
  const fl2 = fl * fl;
  for (let i = 0; i < boats.length; i++) {
    const b = boats[i]!;
    if (ptFighting(b.phase)) anyLive = true;
    const live = ptFighting(b.phase) && c.targetValid;
    const d2 = (boat.x - b.x) * (boat.x - b.x) + (boat.y - b.y) * (boat.y - b.y);
    const r = live && smokeBlocked(c, b) ? c.detectOpenM * c.smokeFactor : c.detectOpenM;
    const normal = live && c.timeS >= p.detectFromS && d2 <= r * r;
    if (normal) anyNormal = true;
    q.seen[i] = normal || (live && c.timeS >= p.detectFromS && d2 <= fl2) ? 1 : 0;
    if (q.seen[i] === 1) anySeen = true;
    if (live && d2 < near2) near2 = d2;
  }
  if (near2 < q.closest2) q.closest2 = near2;
  if (anySeen) {
    const gained = !q.detected;
    if (Number.isNaN(q.firstDetectM)) {
      q.firstDetectM = Math.sqrt(near2);
      q.flashFirst = !anyNormal; // 最初に見つかったのが閃光だけ（Result の「閃光」）
    }
    q.detected = true;
    q.holdLeftS = p.detectHoldS;
    q.lkX = boat.x;
    q.lkY = boat.y;
    q.lkVx = vpx;
    q.lkVy = vpy;
    q.lkHeadingDeg = boat.headingDeg;
    q.lkAgeS = 0;
    if (gained) ev.onContact(true);
  } else if (q.detected && !anyLive) {
    // みな去る（max_passes か夜明け）: 見る PT がいないので捉えるのをやめる（見失わせたには数えない。3 行目の「発見された！」も消える）
    q.detected = false;
    ev.onContact(false);
  } else if (q.detected) {
    q.holdLeftS -= feelDt;
    q.lkAgeS += feelDt;
    if (q.holdLeftS <= 0) {
      q.detected = false;
      if (c.targetValid) q.lostContacts++; // 沈み始め・輪の中で切れたのは見失わせたではない
      ev.onContact(false);
    }
  }
}
