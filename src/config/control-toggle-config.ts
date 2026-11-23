// 静音と倍速の切り替え（v0.8.3。ユーザーの要望 2026-11-23。docs/02 §5）の見せ方と時間の倍率。ゲームの強さの値ではない（data/*.json には置かない）。何も import しない（tests が node で読む）。
// 置き場所（v0.8.3 IP1。実機 1 回目のユーザー「三つのボタンの配置がダサいので一時停止の周りに半円？円形？で配置するUIで、大きさは一時停止よりも一段小さくしてもらって構いません。
// ボタンは今後も増える可能性があります。」）: 一時停止（中心 x 60・y 270・R36）の右半分の弧に衛星のように並べる（controlToggleRing。N 個を弧ごとに上から詰め、弧が満ちれば外の弧へ）。
// 丸は一段小さい R27.84（丸ボタン R48 × 0.58）、当たりは丸より大きい円 R40.5（直径 81＝hud-layout の当たりの下限）。当たりの円は一時停止の当たり（円 R37.8）・互いに 12 px 以上離し、
// 燃料計の箱の下端 166・スティックの当たりの上端 403 から 12 px 以上離す（tests/hud-layout）。

/** 倍速の倍率: 1 フレームに世界を進める回数（固定ステップの幅は同じ＝1 ステップの物理と乱数は 1 倍と同じ）。命中スローの間は 1 */
export const TIME_BOOST_FACTOR = 2;

export type ControlToggleKind = 'silent' | 'fast';

/** 一時停止（ui-config の PAUSE_BUTTON_X・PAUSE_BUTTON_Y・R48 × 0.75。tests/hud-layout が照らし合わせる）と、その当たりの円の半径（丸 + 1.8＝今までの当たりの枠の内接円。v0.8.3 IP1 で四角から円に） */
export const CONTROL_TOGGLE_PAUSE_X = 60;
export const CONTROL_TOGGLE_PAUSE_Y = 270;
export const CONTROL_TOGGLE_PAUSE_R = 36;
export const PAUSE_HIT_R = 37.8;
/** 衛星の丸の倍率（丸ボタン R48 の 0.58＝一時停止 0.75 の一段下）・丸の半径・当たりの円の半径（直径 81＝hud-layout の MIN_HIT）・文字 px（「倍速\n2×」の 2 行が丸に収まる 16） */
export const CONTROL_TOGGLE_SCALE = 0.58;
export const CONTROL_TOGGLE_R = 27.84;
export const CONTROL_TOGGLE_HIT_R = 40.5;
export const CONTROL_TOGGLE_FONT_PX = 16;
/** 当たりの間（hud-layout と同じ 12）と、当たりの中心が入ってよい y の帯（燃料計の箱の下端 166 + 12 + 40.5 から、スティックの当たりの上端 403 − 12 − 40.5 まで） */
export const CONTROL_TOGGLE_GAP = 12;
export const CONTROL_TOGGLE_Y_MIN = 166 + 12 + 40.5;
export const CONTROL_TOGGLE_Y_MAX = 403 - 12 - 40.5;
/** 弧の半径の始まり（一時停止の当たり + 間 + 衛星の当たり＝90.3）と弧の間（衛星の当たりの直径 + 間＝93）。弧の開きの上限（右の真横から上下に） */
export const CONTROL_TOGGLE_RING0 = PAUSE_HIT_R + CONTROL_TOGGLE_GAP + CONTROL_TOGGLE_HIT_R;
export const CONTROL_TOGGLE_RING_STEP = 2 * CONTROL_TOGGLE_HIT_R + CONTROL_TOGGLE_GAP;
export const CONTROL_TOGGLE_MAX_DEG = 60;
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

/** ボタンの並び（上から。1 つ足すなら 1 行）: 鍵・文字・入れている間の色・入り切りを持つ InputState の鍵 */
export interface ControlToggleDef {
  kind: ControlToggleKind;
  labels: { off: string; on: string };
  tint: number;
  flag: 'silentOn' | 'fastOn';
}
export const CONTROL_TOGGLES: readonly ControlToggleDef[] = [
  { kind: 'silent', labels: CONTROL_TOGGLE_LABELS.silent, tint: CONTROL_TOGGLE_TINT.silent, flag: 'silentOn' },
  { kind: 'fast', labels: CONTROL_TOGGLE_LABELS.fast, tint: CONTROL_TOGGLE_TINT.fast, flag: 'fastOn' },
];

export interface RingSpot {
  /** 中心（論理 px）・弧の番号（0 が内）・右の真横からの角度（度。下が正＝画面の y と同じ向き） */
  x: number;
  y: number;
  ring: number;
  deg: number;
}

/** 弧 k の半径・上下の開き（度。y の帯と MAX_DEG の小さい方で上下対称）・入る数（隣の当たりの中心の間 ≥ RING_STEP） */
export function ringGeometry(k: number): { radius: number; halfDeg: number; capacity: number } {
  const radius = CONTROL_TOGGLE_RING0 + k * CONTROL_TOGGLE_RING_STEP;
  const room = Math.min(CONTROL_TOGGLE_PAUSE_Y - CONTROL_TOGGLE_Y_MIN, CONTROL_TOGGLE_Y_MAX - CONTROL_TOGGLE_PAUSE_Y);
  const halfDeg = Math.min(CONTROL_TOGGLE_MAX_DEG, (Math.asin(Math.min(1, room / radius)) * 180) / Math.PI);
  const minDeg = (2 * Math.asin(Math.min(1, CONTROL_TOGGLE_RING_STEP / 2 / radius)) * 180) / Math.PI;
  return { radius, halfDeg, capacity: Math.floor((2 * halfDeg) / minDeg + 1e-9) + 1 };
}

/**
 * n 個の衛星の中心（上から順）: 一時停止の中心から右半分の弧へ。内の弧から入る数まで詰め、余れば次の外の弧へ。弧の中の m 個は上下の開き −halfDeg〜+halfDeg に等間隔（1 個なら真横）。
 * 作るときに 1 回だけ呼ぶ（確保してよい）
 */
export function controlToggleRing(n: number): RingSpot[] {
  const out: RingSpot[] = [];
  for (let k = 0; out.length < n; k++) {
    const g = ringGeometry(k);
    const m = Math.min(g.capacity, n - out.length);
    for (let i = 0; i < m; i++) {
      const deg = m === 1 ? 0 : -g.halfDeg + (2 * g.halfDeg * i) / (m - 1);
      const a = (deg * Math.PI) / 180;
      out.push({ x: CONTROL_TOGGLE_PAUSE_X + g.radius * Math.cos(a), y: CONTROL_TOGGLE_PAUSE_Y + g.radius * Math.sin(a), ring: k, deg });
    }
  }
  return out;
}
