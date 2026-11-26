// 上中央の 4 行目「任務の行」（v0.8.5 IP7。IP5 の ui/rescue-mission-line を任務ごとの文の差し替えで全シナリオへ）: 成否に関わる数（救助の数・残存・上陸・揚陸・撃破・報告・僚艇の HP）を、
// 2 行目の出来事・呼びかけに替えられずにいつも出す（実機 2 回目「成否判定に関わる任務メッセージと通常メッセージは段落分けて表示」・実機 3 回目「シナリオの任務メッセージはDday同様に分けて表示」）。
// 板（囲い・塗り）は無し（実機 3 回目「文字の色はそのままで良いですが、囲いと塗りつぶしは不要です」）。2 行目・3 行目と同じ板なしの字で、色だけ任務の橙（達成で青・未達で警告の色）。
// 置き場所と色は config/objective-hud-config、任務ごとの文とキーは ui/objective-specs（救助は ui/rescue-texts）。成否の数の無い任務（沈めて帰る・生きて帰る）は Hud が作らない＝HUD は今のまま。
// §7: 毎フレームは spec.key（数を詰めた整数。確保しない）を前の値と比べるだけ。キーが変わった時だけ文を組んで setText・色（変わった時だけ）・倍率（幅の上限に収める）を直す。
import Phaser from 'phaser';
import { DEPTH, GAME_WIDTH, HUD_MARGIN } from '../config/game-config';
import { HOME_COLOR_TEXT, HUD_COLOR_WARN } from '../config/hud-text-config';
import { OBJECTIVE_LINE_COLOR, OBJECTIVE_LINE_DY, OBJECTIVE_LINE_PX, OBJECTIVE_LINE_SIDE_KEEP_PX } from '../config/objective-hud-config';
import { HUD_STATUS_OFFSET_Y, hudTextStyle } from '../config/ui-config';
import type { BoatTelemetry } from '../core/boat-telemetry';
import { OBJ_TONE_DONE, OBJ_TONE_WARN, type ObjectiveSpec } from './objective-specs';
import { statusFitScale } from './rescue-texts';

/** 任務の行の字の上端 y（3 行目の上端 ＋ 段） */
export const OBJECTIVE_LINE_Y = HUD_MARGIN + HUD_STATUS_OFFSET_Y + OBJECTIVE_LINE_DY;
/** 字の幅の上限 px（論理幅 − 左右の避け） */
export const objectiveLineMaxPx = (w: number): number => w - 2 * OBJECTIVE_LINE_SIDE_KEEP_PX;
/** 色の段（ui/objective-specs の OBJ_TONE_*）の字の色 */
export const objectiveToneColor = (tone: number): string => (tone === OBJ_TONE_DONE ? HOME_COLOR_TEXT : tone === OBJ_TONE_WARN ? HUD_COLOR_WARN : OBJECTIVE_LINE_COLOR);

export class ObjectiveLine {
  private readonly text: Phaser.GameObjects.Text;
  private lastKey = -1;
  private lastTone = -1;

  constructor(scene: Phaser.Scene, private readonly spec: ObjectiveSpec) {
    this.text = scene.add.text(GAME_WIDTH / 2, OBJECTIVE_LINE_Y, '', hudTextStyle(OBJECTIVE_LINE_PX, OBJECTIVE_LINE_COLOR)).setOrigin(0.5, 0).setDepth(DEPTH.hud);
  }

  /** 毎フレーム（数が変わった時だけ組み直す） */
  refresh(t: BoatTelemetry): void {
    const key = this.spec.key(t);
    if (key === this.lastKey) return;
    this.lastKey = key;
    const tx = this.text.setText(this.spec.text(t));
    const tone = this.spec.tone(t);
    if (tone !== this.lastTone) {
      this.lastTone = tone;
      tx.setColor(objectiveToneColor(tone));
    }
    const k = statusFitScale(tx.width, objectiveLineMaxPx(GAME_WIDTH));
    if (k !== tx.scaleX) tx.setScale(k);
  }

  destroy(): void {
    this.text.destroy();
  }
}
