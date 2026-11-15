// Title の任務の行の矩形（v0.6.7。spec-v067 §D.6）。Phaser・DOM なし（tests/title-grid が論理幅の全部で測る）。Title の create で行ごとに 1 回だけ呼ぶ。
// 行が TITLE_GRID_FROM 未満（v0.7.2 までの米PT の 3 行）は 1 列（x TITLE_ROW_X・w TITLE_ROW_W。v0.6.6 までと同じ）。以上（日本ハードモードの 4〜6 任務・v0.8.0 から米PT の 4 任務）は 2 列の格子:
// 列 TITLE_GRID_COL_W・間 TITLE_TOGGLE_GAP（計 1,218 を画面の中央に）、行優先（order 順に 左上・右上・左下・右下）。段の y と高さは 1 列と同じ。
import { TITLE_GRID_COL_W, TITLE_GRID_FROM, TITLE_ROW_GAP, TITLE_ROW_H, TITLE_ROW_TOP, TITLE_ROW_W, TITLE_ROW_X, TITLE_TOGGLE_GAP } from '../config/title-layout-config';

export interface TitleRowRect {
  /** 左上と幅（高さは TITLE_ROW_H） */
  x: number;
  y: number;
  w: number;
}

/** 格子の幅（2 列と間） */
export const TITLE_GRID_W = 2 * TITLE_GRID_COL_W + TITLE_TOGGLE_GAP;

/** n 行のタブを 2 列の格子にするか */
export function titleGridOn(n: number): boolean {
  return n >= TITLE_GRID_FROM;
}

/**
 * 格子の行の副題（v0.8.0 S5。lead の L59）: 最初の「（」か最初の「→」の、先に来る方の前まで（trim）。どちらも無ければそのまま。
 * 列 597 px に状態「出撃準備 →」と並べて収める（us_01「1942年3月11日 ・ コレヒドール→ミンダナオ（フィリピン）」→「1942年3月11日 ・ コレヒドール」）。
 * core/briefing の shortLabelJa（「（」だけ。Briefing の敵・危険の語も使う）は変えない。日本のタブの副題は「→」を持たないので shortLabelJa と同じ（tests/title-grid）
 */
export function titleGridSubJa(sub: string): string {
  const p = sub.indexOf('（');
  const a = sub.indexOf('→');
  const i = p < 0 ? a : a < 0 ? p : Math.min(p, a);
  return i > 0 ? sub.slice(0, i).trim() : sub;
}

/** n 行のタブの i 番目（0 から、order 順）の行の矩形。gameWidth は論理幅（GAME_WIDTH） */
export function titleRowRect(i: number, n: number, gameWidth: number): TitleRowRect {
  if (!titleGridOn(n)) return { x: TITLE_ROW_X, y: TITLE_ROW_TOP + i * (TITLE_ROW_H + TITLE_ROW_GAP), w: TITLE_ROW_W };
  const col = i % 2;
  const row = (i - col) / 2;
  return { x: gameWidth / 2 - TITLE_GRID_W / 2 + col * (TITLE_GRID_COL_W + TITLE_TOGGLE_GAP), y: TITLE_ROW_TOP + row * (TITLE_ROW_H + TITLE_ROW_GAP), w: TITLE_GRID_COL_W };
}
