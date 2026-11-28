// Result の杯（v0.9.0 IP5。ユーザーの言葉 2026-11-28「「ハード・史実・装備デフォルトで達成」と表示されるようにしてください。（任務終了時の画面も同じ）」）: この出撃が
// 頑張った証の形（ハードの違いのある任務はハード × 史実 × デフォルト、jp_02・jp_05 は史実 × デフォルト）で達成した時だけ、見出しのすぐ下に Briefing と同じ文と金の杯。
// 決めるのは core/achieved-record の sortieTrophy、文と置き方は config/trophy-config。作るのは Result の create の 1 回だけ（§7）。未達・ほかの形では何も作らない（今の Result と同じ画素）。
import type Phaser from 'phaser';
import { DEPTH } from '../config/game-config';
import { RESULT_TROPHY_PX, briefTrophyJa, resultTrophyLayout } from '../config/trophy-config';
import { sortieTrophy } from '../core/achieved-record';
import type { Sortie } from '../core/sortie';
import { addTrophyImage } from '../assets/trophy-art';

/** Result の杯の文（無ければ ''）。hardVariant はその任務にハードの違いがあるか（config/mission-data の hasHardVariant。出撃のハードは sortie.hard） */
export function resultTrophyJa(achieved: boolean, sortie: Sortie, hardVariant: boolean): string {
  const t = sortieTrophy(achieved, { hard: sortie.hard, historical: sortie.historical, custom: sortie.custom !== undefined }, hardVariant);
  return t ? briefTrophyJa(t.hard) : '';
}

/** 行を縮め・持ち上げた後に 1 回: 字を右へ寄せ、左に杯（杯と字の組を行の中央 tx.x にそろえる） */
export function addResultTrophyCup(scene: Phaser.Scene, tx: Phaser.GameObjects.Text): void {
  const l = resultTrophyLayout(tx.x, tx.displayWidth);
  tx.setX(l.textCx);
  addTrophyImage(scene, l.iconX, tx.y + (tx.displayHeight - RESULT_TROPHY_PX) / 2, RESULT_TROPHY_PX, DEPTH.hud);
}
