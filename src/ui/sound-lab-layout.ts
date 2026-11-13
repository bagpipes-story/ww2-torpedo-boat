// 音の試聴の場（v0.7.1 IP2・IP3。?sfxlab）の矩形と語。Phaser・DOM なし（tests/sound-lab が論理幅の全部で測る）。scenes/sound-lab-scene の create で 1 回だけ呼ぶ。
// 行は上から 弾倉の始め・弾倉の終わり・魚雷の発射（A〜D）・魚雷の発射（新。E〜I）・続けて聞く、列は案（左から。行ごとに 4 つか 5 つ）。左端は行の名前、下の左端は「戻る」、下の右は状態の一文。
import {
  SOUND_LAB_BACK_H, SOUND_LAB_BACK_W, SOUND_LAB_COL_GAP, SOUND_LAB_DEFAULT_MARK_JA, SOUND_LAB_LABEL_W, SOUND_LAB_ROW_GAP, SOUND_LAB_ROW_H, SOUND_LAB_ROW_TOP,
} from '../config/sound-lab-config';

export interface SoundLabRect {
  x: number;
  y: number;
  w: number;
  h: number;
}
/** 画面の端の余白（game-config の HUD_MARGIN と同じ 24。DOM を引かないよう引数で受ける） */
export interface SoundLabFrame {
  gameWidth: number;
  gameHeight: number;
  margin: number;
}

/** 行 row の名前の矩形（左端） */
export function soundLabLabelRect(row: number, f: SoundLabFrame): SoundLabRect {
  return { x: f.margin, y: SOUND_LAB_ROW_TOP + row * (SOUND_LAB_ROW_H + SOUND_LAB_ROW_GAP), w: SOUND_LAB_LABEL_W, h: SOUND_LAB_ROW_H };
}

/** 行 row・列 col（0 から）のボタンの矩形: 行の名前の右から画面の右の余白まで cols 個を等しく */
export function soundLabButtonRect(row: number, col: number, cols: number, f: SoundLabFrame): SoundLabRect {
  const left = f.margin + SOUND_LAB_LABEL_W + SOUND_LAB_COL_GAP;
  const w = (f.gameWidth - f.margin - left - (cols - 1) * SOUND_LAB_COL_GAP) / cols;
  return { x: left + col * (w + SOUND_LAB_COL_GAP), y: SOUND_LAB_ROW_TOP + row * (SOUND_LAB_ROW_H + SOUND_LAB_ROW_GAP), w, h: SOUND_LAB_ROW_H };
}

/** 左下の「戻る」 */
export function soundLabBackRect(f: SoundLabFrame): SoundLabRect {
  return { x: f.margin, y: f.gameHeight - f.margin - SOUND_LAB_BACK_H, w: SOUND_LAB_BACK_W, h: SOUND_LAB_BACK_H };
}

/** ボタンの題: 記号（IP3: 型 kind があれば「記号 型」。既定の案は「（今）」を付ける） */
export function soundLabButtonTitle(id: string, isDefault: boolean, kind = ''): string {
  const t = kind === '' ? id : `${id} ${kind}`;
  return isDefault ? `${t}${SOUND_LAB_DEFAULT_MARK_JA}` : t;
}
