// 画面の枠と論理幅の計算（v0.5.1 実機 1 回目）。Phaser・DOM 非依存（測った値を受け取って計算するだけ。DOM を読むのは config/screen-fit.ts）。
// 論理座標は高さ 720 で固定し、幅を端末の横持ちの縦横比に合わせて広げる（16:9 より細長い iPhone で、横に黒帯を出さず海を広く見せる）。
// HUD は GAME_WIDTH からの位置で並んでいるので、幅が変わっても右端・中央に付いてくる。

/** safe-area（CSS px）。左右はノッチと角丸、上はステータスバー、下はホームバー */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** ゲームの枠（CSS px。fixed の左上と大きさ） */
export interface ScreenBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * 今の向きの枠: 画面（innerWidth × innerHeight）から左右と上の safe-area を引く。下（ホームバー）は引かない
 * （海はホームバーの下まで描く。下端の操作はタップと中央寄りのスティックだけで、上向きのスワイプから始まらない）。
 */
export function screenBoxFor(innerWidth: number, innerHeight: number, ins: Insets): ScreenBox {
  return {
    left: ins.left,
    top: ins.top,
    width: Math.max(1, innerWidth - ins.left - ins.right),
    height: Math.max(1, innerHeight - ins.top),
  };
}

/**
 * 横持ちにしたときの枠の幅と高さ（論理幅を決めるため）。縦持ちで起動したとき（ホーム画面は縦）は、
 * 横にしたときの左右の safe-area を縦の上の safe-area（ノッチ・Dynamic Island の幅。iPhone では横の左右と同じ値）と見なして見積もる。
 */
export function landscapeSize(innerWidth: number, innerHeight: number, ins: Insets): { width: number; height: number } {
  if (innerWidth >= innerHeight) {
    const b = screenBoxFor(innerWidth, innerHeight, ins);
    return { width: b.width, height: b.height };
  }
  return { width: Math.max(1, innerHeight - ins.top * 2), height: Math.max(1, innerWidth) };
}

/**
 * 論理幅: 高さ logicalHeight のまま横持ちの縦横比に合わせる。step 刻みに切り捨て（枠より少しでも横長にしない＝上下がはみ出さない）、
 * [minWidth, maxWidth] に収める（16:9 より太い画面は従来どおり 1280 で左右に黒帯）
 */
export function logicalWidthFor(width: number, height: number, logicalHeight: number, minWidth: number, maxWidth: number, step: number): number {
  const long = Math.max(width, height);
  const short = Math.max(1, Math.min(width, height));
  const raw = Math.floor((logicalHeight * long) / short / step) * step;
  return Math.min(maxWidth, Math.max(minWidth, raw));
}
