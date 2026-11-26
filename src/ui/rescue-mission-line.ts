// 救助の任務（v0.8.5 IP5。us_07）の上中央 4 行目「任務の行」: 乗せている・渡した・海に の数を、2 行目の出来事・呼びかけに替えられずにいつも出す（実機 2 回目のユーザー
// 「救助している最中の人数とフィッチに渡している時の人数の表示が他のメッセージが出ると見えなくなってしまう」「成否判定に関わる任務メッセージと通常メッセージは段落分けて表示」）。
// 置き場所は 3 行目（敵影と発見）の下の固定の段（config/rescue-hud-config の RESCUE_MISSION_LINE_*。根拠は tests/rescue-mission-line）: 上中央は左上の HP・燃料の箱・右の技能の列・
// 一時停止の塊・上の縁の端の印（y 170 から下）の間で空いている。左上の箱の下（y 162〜178）は一時停止の衛星と端の印の上端に挟まれて 1 行の高さが無い。
// 見分け: 暗い板に生存者の橙の縁と字（2 行目・3 行目は板なし）。達成の数に届けば縁と字を味方の青に。文は ui/rescue-texts の rescueMissionLineJa。
// §7: キー（数）が変わった時だけ setText・板の大きさと倍率（幅の上限に収める）を直す。毎フレームは数を比べるだけ。救助の無い任務は作らない（scenes/hud-scene）。
import Phaser from 'phaser';
import { DEPTH, GAME_WIDTH, HUD_MARGIN } from '../config/game-config';
import { HOME_COLOR_TEXT } from '../config/hud-text-config';
import { SURVIVOR_LABEL_COLOR, SURVIVOR_VEST_COLOR } from '../config/rescue-art-config';
import {
  RESCUE_MISSION_LINE_DY, RESCUE_MISSION_LINE_FILL, RESCUE_MISSION_LINE_FILL_ALPHA, RESCUE_MISSION_LINE_PAD_X, RESCUE_MISSION_LINE_PAD_Y, RESCUE_MISSION_LINE_PX, RESCUE_MISSION_LINE_SIDE_KEEP_PX,
  RESCUE_MISSION_LINE_RADIUS, RESCUE_MISSION_LINE_STROKE_W,
} from '../config/rescue-hud-config';
import { HOME_COLOR, HUD_STATUS_OFFSET_Y, hudTextStyle } from '../config/ui-config';
import type { RescueTelemetry } from '../core/rescue-telemetry';
import { rescueMissionLineJa, rescueMissionLineKey, statusFitScale } from './rescue-texts';

/** 任務の行の字の上端 y（3 行目の上端 ＋ 段） */
export const RESCUE_MISSION_LINE_Y = HUD_MARGIN + HUD_STATUS_OFFSET_Y + RESCUE_MISSION_LINE_DY;
/** 字の幅の上限 px（論理幅 − 左右の避け。板の余白は外） */
export const rescueMissionLineMaxPx = (w: number): number => w - 2 * RESCUE_MISSION_LINE_SIDE_KEEP_PX;

export class RescueMissionLine {
  private readonly plate: Phaser.GameObjects.Rectangle;
  private readonly text: Phaser.GameObjects.Text;
  private lastKey = -1;
  private lastDone = false;

  constructor(scene: Phaser.Scene) {
    this.plate = scene.add
      .rectangle(GAME_WIDTH / 2, RESCUE_MISSION_LINE_Y - RESCUE_MISSION_LINE_PAD_Y, 1, 1, RESCUE_MISSION_LINE_FILL, RESCUE_MISSION_LINE_FILL_ALPHA)
      .setOrigin(0.5, 0)
      .setStrokeStyle(RESCUE_MISSION_LINE_STROKE_W, SURVIVOR_VEST_COLOR)
      .setRounded(RESCUE_MISSION_LINE_RADIUS)
      .setDepth(DEPTH.hud);
    this.text = scene.add.text(GAME_WIDTH / 2, RESCUE_MISSION_LINE_Y, '', hudTextStyle(RESCUE_MISSION_LINE_PX, SURVIVOR_LABEL_COLOR)).setOrigin(0.5, 0).setDepth(DEPTH.hud);
  }

  /** 毎フレーム（数が変わった時だけ組み直す） */
  refresh(r: RescueTelemetry): void {
    const key = rescueMissionLineKey(r);
    if (key === this.lastKey) return;
    this.lastKey = key;
    const tx = this.text.setText(rescueMissionLineJa(r));
    const done = r.delivered >= r.objective;
    if (done !== this.lastDone) {
      this.lastDone = done;
      tx.setColor(done ? HOME_COLOR_TEXT : SURVIVOR_LABEL_COLOR);
      this.plate.setStrokeStyle(RESCUE_MISSION_LINE_STROKE_W, done ? HOME_COLOR : SURVIVOR_VEST_COLOR);
    }
    const k = statusFitScale(tx.width, rescueMissionLineMaxPx(GAME_WIDTH));
    if (k !== tx.scaleX) tx.setScale(k);
    this.plate.setSize(tx.width * k + 2 * RESCUE_MISSION_LINE_PAD_X, tx.height * k + 2 * RESCUE_MISSION_LINE_PAD_Y);
  }

  destroy(): void {
    this.plate.destroy();
    this.text.destroy();
  }
}
