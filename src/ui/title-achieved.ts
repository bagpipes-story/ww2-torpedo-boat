// Title の任務の行に達成の印を描く（v0.9.0 IP2。文と 2 段への分け方は ui/achieved-texts、語と字の大きさは config/achieved-config）。
// 達成していない行には何も作らない（保存が空の端末の行は v0.9.0 S1 と同じ画素）。作るのは Title の create の 1 回だけ（update は無い。§7）。場面の破棄で一緒に消える。
import type Phaser from 'phaser';
import { DEPTH } from '../config/game-config';
import { TITLE_ACHIEVED_PAD_X, TITLE_ACHIEVED_PAD_Y, TITLE_ACHIEVED_PAD_Y_COMPACT, TITLE_ACHIEVED_PX } from '../config/achieved-config';
import { HOME_COLOR_TEXT, hudTextStyle } from '../config/ui-config';
import { titleMarkLayout } from './achieved-texts';
import type { MenuButton } from './menu-ui';

/** 行（左上 x・y、幅 w、高さ h。compact は詰めた行）の右端に印の 2 段を右揃えで。味方の青（Result の「任務達成」・任務の行の達成と同じ色） */
export function addTitleAchievedMark(scene: Phaser.Scene, row: MenuButton, r: { x: number; y: number; w: number }, h: number, compact: boolean, mask: number): void {
  const l = titleMarkLayout(mask, r.x + r.w, row.titleRight, row.subRight);
  if (!l) return;
  const x = r.x + r.w - TITLE_ACHIEVED_PAD_X;
  const pad = compact ? TITLE_ACHIEVED_PAD_Y_COMPACT : TITLE_ACHIEVED_PAD_Y;
  const add = (text: string, y: number, oy: number, maxW: number): void => {
    if (text === '') return;
    const t = scene.add.text(x, y, text, hudTextStyle(TITLE_ACHIEVED_PX, HOME_COLOR_TEXT)).setOrigin(1, oy).setDepth(DEPTH.hud + 1);
    if (t.width > maxW && maxW > 0) t.setScale(maxW / t.width); // 収まらない段だけ作る時に 1 回縮める（Result の行と同じ作法）
  };
  add(l.top, r.y + pad, 0, l.topMaxW);
  add(l.bottom, r.y + h - pad, 1, l.bottomMaxW);
}
