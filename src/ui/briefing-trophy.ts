// Briefing のトロフィー（v0.9.0 IP3。ユーザーの言葉 2026-11-27「史実　デフォルトで達成したシナリオには出撃前の説明画面にトロフィーが表示されたり」）: その任務を
// ハード × 史実モード × デフォルトの装備で達成していれば（v0.9.0 IP4。ユーザーの言葉 2026-11-28「達成条件をハード×史実 × デフォルトにしてください」）、任務名の行の右（「← 任務一覧」の左）に
// 金の杯と「ハード・史実で達成」。ハードの違いの無い任務（jp_02・jp_05）は史実 × デフォルトで「史実で達成」。達成していなければ何も作らない（今の Briefing と同じ画素）。
// 決めるのは systems/sortie-loadout の briefingTrophy（保存の記録 ＋ ?debug&achieved の形）。置き方と語は config/trophy-config。作るのは Briefing の create の 1 回だけ（§7）。
import type Phaser from 'phaser';
import { DEPTH } from '../config/game-config';
import { BRIEF_BACK_X, BRIEF_TITLE_PX, BRIEF_TITLE_Y } from '../config/menu-config';
import { BRIEF_TROPHY_LABEL_PX, BRIEF_TROPHY_PX, TROPHY_TEXT_COLOR, briefTrophyJa, briefTrophyLayout } from '../config/trophy-config';
import { hudTextStyle } from '../config/ui-config';
import { addTrophyImage } from '../assets/trophy-art';

export function addBriefingTrophy(scene: Phaser.Scene, trophy: { readonly hard: boolean } | null): void {
  if (!trophy) return;
  const l = briefTrophyLayout(BRIEF_BACK_X, BRIEF_TITLE_Y, BRIEF_TITLE_PX, trophy.hard);
  addTrophyImage(scene, l.iconX, l.iconY, BRIEF_TROPHY_PX, DEPTH.hud);
  scene.add.text(l.labelX, l.cy, briefTrophyJa(trophy.hard), hudTextStyle(BRIEF_TROPHY_LABEL_PX, TROPHY_TEXT_COLOR)).setOrigin(0, 0.5).setDepth(DEPTH.hud);
}
