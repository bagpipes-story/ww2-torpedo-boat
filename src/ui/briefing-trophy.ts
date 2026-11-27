// Briefing のトロフィー（v0.9.0 IP3。ユーザーの言葉 2026-11-27「史実　デフォルトで達成したシナリオには出撃前の説明画面にトロフィーが表示されたり」）: その任務を史実モード × デフォルトの装備で
// 達成していれば、任務名の行の右（「← 任務一覧」の左）に金の杯と「史実で達成」（ハードでも達成していれば「史実で達成（ハード）」）。達成していなければ何も作らない（今の Briefing と同じ画素）。
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
