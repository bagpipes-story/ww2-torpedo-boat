// Title の任務の行に達成の印を描く（v0.9.0 IP2。IP3 で「✓ 達成」の 1 段と、史実 × デフォルトの行だけ左に小さなトロフィー。文と置き方は ui/achieved-texts、語と大きさは config/achieved-config）。
// 達成していない行には何も作らない（保存が空の端末の行は v0.9.0 S1 と同じ画素）。作るのは Title の create の 1 回だけ（update は無い。§7）。場面の破棄で一緒に消える。
import type Phaser from 'phaser';
import { DEPTH } from '../config/game-config';
import { TITLE_ACHIEVED_PAD_X, TITLE_ACHIEVED_PAD_Y, TITLE_ACHIEVED_PAD_Y_COMPACT, TITLE_ACHIEVED_PX, TITLE_TROPHY_GAP, TITLE_TROPHY_PX } from '../config/achieved-config';
import { HOME_COLOR_TEXT, hudTextStyle } from '../config/ui-config';
import { addTrophyImage } from '../assets/trophy-art';
import { titleMarkLayout } from './achieved-texts';
import type { MenuButton } from './menu-ui';

/** 行（左上 x・y、幅 w。compact は詰めた行）の右端の上に印を右揃えで。味方の青（Result の「任務達成」・任務の行の達成と同じ色） */
export function addTitleAchievedMark(scene: Phaser.Scene, row: MenuButton, r: { x: number; y: number; w: number }, compact: boolean, mask: number): void {
  const l = titleMarkLayout(mask, r.x + r.w, row.titleRight);
  if (!l) return;
  const x = r.x + r.w - TITLE_ACHIEVED_PAD_X;
  const y = r.y + (compact ? TITLE_ACHIEVED_PAD_Y_COMPACT : TITLE_ACHIEVED_PAD_Y);
  const t = scene.add.text(x, y, l.text, hudTextStyle(TITLE_ACHIEVED_PX, HOME_COLOR_TEXT)).setOrigin(1, 0).setDepth(DEPTH.hud + 1);
  if (t.width > l.maxW && l.maxW > 0) t.setScale(l.maxW / t.width); // 収まらなければ作る時に 1 回縮める（Result の行と同じ作法）
  if (l.trophy) addTrophyImage(scene, x - t.displayWidth - TITLE_TROPHY_GAP - TITLE_TROPHY_PX, y + (t.displayHeight - TITLE_TROPHY_PX) / 2, TITLE_TROPHY_PX, DEPTH.hud + 1); // 史実 × デフォルト（v0.9.0 IP3）
}
