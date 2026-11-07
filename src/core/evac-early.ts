// 空襲下の退避（v0.6.11 IP1。jp_03）の早い決着（ユーザーの U8「残存する全ての艇が避難所に入って敵機が捕捉しなくなった場合、プレイヤーがやることがなくなるので
// その時点で残り時間があってもゲームクリアにしてください」）: 240 秒の前に、浮いている艇のある隊がみな隠れ（G_HIDDEN。入っている・上げている・外・見つかった陰の隊が無い）、
// 予告した・飛んでいる・爆弾が空中の編隊が無い（どの編隊ももう誰も捕まえられない）、そして陰（波の予告ごとに見つかることがある）に隠れた隊が無いか
// もう予告が残っていない（案 B。「敵機が捕捉しなくなった」＝陰はまだ見つかりうる。壕は安全）と、その秒を sq.earlyS に書く（core/evac-air の段の最後）。
// 次のステップの決着のラッチ（世界の WorldDawn.latch・模擬の夜明けのラッチ・core/evac-air の evacSettle）は evacSettleDue で 240 秒と同じに立つ＝今までの決着の道のまま
// （残存はそこで確定・達成は残存 ≥ 6、操作中の隊は隠れているので帰投で終わる）。まだ来ていない波は来ない。Phaser 非依存・乱数なし・確保しない。
import { dawnReached } from './dawn-air';
import { G_GONE, G_HIDDEN, SHELTER_COVER } from './evac-data';
import { EF_ANNOUNCED, evacFlightLive, type EvacPlan } from './evac-plan';
import type { EvacSquadron } from './evac-squadron';

/** 浮いている艇のある隊がみな隠れていて（全滅の隊は数えない）、隠れた隊が 1 つ以上ある */
export function evacAllHidden(sq: EvacSquadron): boolean {
  let hidden = 0;
  for (let gi = 0; gi < sq.groups.length; gi++) {
    const ph = sq.groups[gi]!.phase;
    if (ph === G_GONE) continue;
    if (ph !== G_HIDDEN) return false;
    hidden++;
  }
  return hidden > 0;
}

/** 予告した・飛んでいる（中断して去る途中も）・爆弾が空中の編隊が無い（まだ来ていない波・済み・目標なし・見失った後に去り終えた編隊は数えない） */
export function evacSkyClear(plan: EvacPlan): boolean {
  for (let i = 0; i < plan.flights.length; i++) {
    const fl = plan.flights[i]!;
    if (fl.phase === EF_ANNOUNCED || evacFlightLive(fl)) return false;
  }
  return true;
}

/** 陰に隠れた隊があり、まだ予告（陰を見つける引き）が残っている（見つける見込み 0 なら数えない） */
export function evacCoverAtRisk(plan: EvacPlan): boolean {
  if (plan.nextWave >= plan.raid.waves.length || !(plan.raid.coverRevealChance > 0)) return false;
  const sq = plan.sq;
  for (let gi = 0; gi < sq.groups.length; gi++) {
    const g = sq.groups[gi]!;
    if (g.phase === G_HIDDEN && g.shelter >= 0 && sq.p.shelters[g.shelter]!.kind === SHELTER_COVER) return true;
  }
  return false;
}

/** core/evac-air の段の最後（毎ステップ）: 決着の前で、まだ立っていなくて、全艇が隠れて空が空いたら、その秒を書く */
export function evacEarlyCheck(plan: EvacPlan, stepTimeS: number): void {
  const sq = plan.sq;
  if (sq.settled || !Number.isNaN(sq.earlyS) || dawnReached(sq.cfg.durationS, stepTimeS)) return;
  if (evacAllHidden(sq) && evacSkyClear(plan) && !evacCoverAtRisk(plan)) sq.earlyS = stepTimeS;
}

/** 決着のラッチが立つか（240 秒＝dawnReached と同じ式、または早い決着が前のステップまでに立った） */
export function evacSettleDue(sq: EvacSquadron, stepTimeS: number): boolean {
  return dawnReached(sq.cfg.durationS, stepTimeS) || !Number.isNaN(sq.earlyS);
}

/** 早い決着で終わった（決着が 240 秒より前） */
export function evacSettledEarly(sq: EvacSquadron): boolean {
  return !Number.isNaN(sq.earlyS);
}
