// 曲の試聴の場（v0.7.2 S1。?sfxlab）の矩形と語。Phaser・DOM なし（tests/music-lab が論理幅の全部で測る）。scenes/music-lab-scene の create で 1 回だけ呼ぶ。
// 行・行の名前・左下の「戻る」は v0.7.1 の効果音の試聴の場（ui/sound-lab-layout）の矩形をそのまま使う（同じ割り付け）。ここは下の段の 2 つ目のボタン（曲の場の「効果音の試聴へ」と
// 効果音の場の「曲の試聴へ」。「戻る」の右）と、候補のボタンの題・2 行目。
import { MUSIC_LAB_DEFAULT_MARK_JA } from '../config/music-lab-config';
import { SOUND_LAB_BACK_H, SOUND_LAB_BACK_W, SOUND_LAB_COL_GAP } from '../config/sound-lab-config';
import type { SoundLabFrame, SoundLabRect } from './sound-lab-layout';

/** 行 0（タイトルの曲）のボタンの数: 候補 3 つと「止める」 */
export const MUSIC_LAB_ROW0_COLS = 4;
/** v0.7.2 S2: 行 1（任務の曲）＝段 3 つ・「自動」・「止める」、行 2（効果音と一緒に）＝台本 3 つ・「止める」（S3 で「命中＋スロー」を足して 5） */
export const MUSIC_LAB_ROW1_COLS = 5;
export const MUSIC_LAB_ROW2_COLS = 4;

/** 下の段の 2 つ目のボタン: 「戻る」の右に列の間を空けて同じ大きさ（右下の状態の一文とは論理幅 1280 でも重ならない＝tests/music-lab） */
export function musicLabSideRect(f: SoundLabFrame): SoundLabRect {
  return { x: f.margin + SOUND_LAB_BACK_W + SOUND_LAB_COL_GAP, y: f.gameHeight - f.margin - SOUND_LAB_BACK_H, w: SOUND_LAB_BACK_W, h: SOUND_LAB_BACK_H };
}

/** 候補のボタンの題: 「記号 名前」。ゲームの曲（既定）は「記号（今）」だけ（v0.7.1 IP4 と同じ。論理幅 1280 の 4 列のボタンに収める） */
export function musicLabButtonTitle(letter: string, name: string, isDefault: boolean): string {
  return isDefault ? `${letter}${MUSIC_LAB_DEFAULT_MARK_JA}` : `${letter} ${name}`;
}

/** 候補のボタンの 2 行目: ゲームの曲は名前（題に名前が無いので）、ほかは一言 */
export function musicLabButtonSub(name: string, note: string, isDefault: boolean): string {
  return isDefault ? name : note;
}
