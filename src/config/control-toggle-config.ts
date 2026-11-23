// 静音と倍速の切り替え（v0.8.3。ユーザーの要望 2026-11-23。docs/02 §5）の見せ方と時間の倍率。ゲームの強さの値ではない（data/*.json には置かない）。何も import しない（tests が node で読む）。
// 置き場所: 左の「一時停止」（中心 x 60・y 270・R36＝丸ボタン R48 の 3/4）の右に同じ大きさで横に並べる（静音 → 倍速）。燃料計の下端 166・スティックの当たりの上端 403 から離れ、
// ビルド番号・2 行目・3 行目（y ≤ 104）・HP と燃料の箱（x ≤ 342・y ≤ 166）に触れない（tests/control-toggles・tests/hud-layout）。一時停止と同じく小さい（当たり約 76 px。ユーザー「小さいボタンで構いません」）。

/** 倍速の倍率: 1 フレームに世界を進める回数（固定ステップの幅は同じ＝1 ステップの物理と乱数は 1 倍と同じ）。命中スローの間は 1 */
export const TIME_BOOST_FACTOR = 2;

export type ControlToggleKind = 'silent' | 'fast';

/** 丸の倍率（一時停止の PAUSE_BUTTON_SIZE_SCALE と同じ 0.75）と、丸の半径（丸ボタンのテクスチャ R48 × 0.75）、文字 px（右端の技能と同じ 20） */
export const CONTROL_TOGGLE_SCALE = 0.75;
export const CONTROL_TOGGLE_R = 36;
export const CONTROL_TOGGLE_FONT_PX = 20;
/** 一時停止の中心（ui-config の PAUSE_BUTTON_X・PAUSE_BUTTON_Y の値。tests/control-toggles が照らし合わせる）と、中心の間（丸の縁と縁の間 24） */
export const CONTROL_TOGGLE_PAUSE_X = 60;
export const CONTROL_TOGGLE_Y = 270;
export const CONTROL_TOGGLE_STEP_X = 96;
/** 文字（切っているとき・入れているとき。倍速は入れている間「2×」を足す） */
export const CONTROL_TOGGLE_LABELS: Readonly<Record<ControlToggleKind, { off: string; on: string }>> = {
  silent: { off: '静音', on: '静音' },
  fast: { off: '倍速', on: '倍速\n2×' },
};
/** 入れている間の丸の色と濃さ（切っているときは無色・丸ボタンの濃さ 0.55）。静音は青緑（帰投の輪の色に寄せない）、倍速は琥珀 */
export const CONTROL_TOGGLE_TINT: Readonly<Record<ControlToggleKind, number>> = { silent: 0x7fe0d0, fast: 0xffc060 };
export const CONTROL_TOGGLE_ON_ALPHA = 0.9;
/** 静音を入れている間のスティックの台座の色（台座の輪＝静音の上限が外側の限界になる印。テクスチャは同じ） */
export const STICK_SILENT_TINT = 0x7fe0d0;

export interface ControlToggleSpot {
  kind: ControlToggleKind;
  x: number;
  y: number;
  r: number;
}

/** 左から 静音・倍速（一時停止の右に CONTROL_TOGGLE_STEP_X ずつ）。どの任務・どの幅でも同じ */
export function controlToggleLayout(): ControlToggleSpot[] {
  return (['silent', 'fast'] as const).map((kind, i) => ({ kind, x: CONTROL_TOGGLE_PAUSE_X + CONTROL_TOGGLE_STEP_X * (i + 1), y: CONTROL_TOGGLE_Y, r: CONTROL_TOGGLE_R }));
}
