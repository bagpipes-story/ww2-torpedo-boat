// 曲の試聴の場（v0.7.2 S1。?sfxlab）の矩形と語。Phaser・DOM なし（tests/music-lab が論理幅の全部で測る）。scenes/music-lab-scene の create で 1 回だけ呼ぶ。
// 行・行の名前・左下の「戻る」は v0.7.1 の効果音の試聴の場（ui/sound-lab-layout）の矩形をそのまま使う（同じ割り付け）。ここは下の段の 2 つ目のボタン（曲の場の「効果音の試聴へ」と
// 効果音の場の「曲の試聴へ」。「戻る」の右）と、候補のボタンの題・2 行目。
// v0.7.2 S3: 行 3「命中スロー」（案 A・B・C の 3 つ。押すたびに鳴らす＝「止める」なし）と、ボタンの題と 2 行目の引き（場のシーンから移した＝シーンを 250 行以下に保つ）。
import {
  MUSIC_LAB_AUTO_JA, MUSIC_LAB_AUTO_SUB_JA, MUSIC_LAB_DEFAULT_MARK_JA, MUSIC_LAB_DEMO_SUBS_JA, MUSIC_LAB_DEMO_TITLES_JA, MUSIC_LAB_LETTERS, MUSIC_LAB_MOOD_SUBS_JA, MUSIC_LAB_MOOD_TITLES_JA,
  MUSIC_LAB_NAMES_JA, MUSIC_LAB_NOTES_JA, MUSIC_LAB_SLOW_LETTERS, MUSIC_LAB_SLOW_NAMES_JA, MUSIC_LAB_SLOW_NOTES_JA, MUSIC_LAB_STOP_JA, MUSIC_LAB_STOP_SUB_JA,
} from '../config/music-lab-config';
import { SOUND_LAB_BACK_H, SOUND_LAB_BACK_W, SOUND_LAB_COL_GAP } from '../config/sound-lab-config';
import type { SoundLabFrame, SoundLabRect } from './sound-lab-layout';

/** 行 0（タイトルの曲）のボタンの数: 候補 3 つと「止める」 */
export const MUSIC_LAB_ROW0_COLS = 4;
/** v0.7.2 S2: 行 1（任務の曲）＝段 3 つ・「自動」・「止める」、行 2（効果音と一緒に）＝台本 4 つ（S3 で「命中＋スロー」を足した）・「止める」 */
export const MUSIC_LAB_ROW1_COLS = 5;
export const MUSIC_LAB_ROW2_COLS = 5;
/** v0.7.2 S3: 行 3（命中スロー）＝案 A・B・C（「止める」なし） */
export const MUSIC_LAB_ROW3_COLS = 3;
/** 行の番号（行 0 タイトルの曲・行 1 任務の曲・行 2 効果音と一緒に・行 3 命中スロー）と行ごとの列の数 */
export const MUSIC_LAB_ROW_TITLE = 0;
export const MUSIC_LAB_ROW_MOOD = 1;
export const MUSIC_LAB_ROW_DEMO = 2;
export const MUSIC_LAB_ROW_SLOW = 3;
export const MUSIC_LAB_ROW_COLS: readonly number[] = [MUSIC_LAB_ROW0_COLS, MUSIC_LAB_ROW1_COLS, MUSIC_LAB_ROW2_COLS, MUSIC_LAB_ROW3_COLS];

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

/** 行に「止める」があるか（行 3 の命中スローは押すたびに鳴らすだけ） */
export function musicLabHasStop(row: number): boolean {
  return row !== MUSIC_LAB_ROW_SLOW;
}

/**
 * ボタンの題と 2 行目（場の create だけ）: 行 0 はゲームの曲（titleDefault 番）を「記号（今）」・行 1 は段と自動・行 2 は台本・行 3 はゲームの命中スローの案（slowDefault 番）を
 * 「記号（今）」。「止める」のある行の最後は「止める」
 */
export function musicLabLabel(row: number, col: number, titleDefault: number, slowDefault: number): [string, string] {
  if (musicLabHasStop(row) && col === MUSIC_LAB_ROW_COLS[row]! - 1) return [MUSIC_LAB_STOP_JA, MUSIC_LAB_STOP_SUB_JA];
  if (row === MUSIC_LAB_ROW_TITLE) {
    const d = col === titleDefault;
    return [musicLabButtonTitle(MUSIC_LAB_LETTERS[col]!, MUSIC_LAB_NAMES_JA[col]!, d), musicLabButtonSub(MUSIC_LAB_NAMES_JA[col]!, MUSIC_LAB_NOTES_JA[col]!, d)];
  }
  if (row === MUSIC_LAB_ROW_MOOD) return col === MUSIC_LAB_MOOD_TITLES_JA.length ? [MUSIC_LAB_AUTO_JA, MUSIC_LAB_AUTO_SUB_JA] : [MUSIC_LAB_MOOD_TITLES_JA[col]!, MUSIC_LAB_MOOD_SUBS_JA[col]!];
  if (row === MUSIC_LAB_ROW_DEMO) return [MUSIC_LAB_DEMO_TITLES_JA[col]!, MUSIC_LAB_DEMO_SUBS_JA[col]!];
  const d = col === slowDefault;
  return [musicLabButtonTitle(MUSIC_LAB_SLOW_LETTERS[col]!, MUSIC_LAB_SLOW_NAMES_JA[col]!, d), musicLabButtonSub(MUSIC_LAB_SLOW_NAMES_JA[col]!, MUSIC_LAB_SLOW_NOTES_JA[col]!, d)];
}
