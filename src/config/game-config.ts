// Phaser 設定と画面定数（docs/02 §2）。数値はここだけに置く。
export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;
/** 夜の海の背景色（docs/02 §7） */
export const SEA_COLOR = '#0b1020';
/** HUD の余白（ゲーム座標 px）。横持ちの黒帯がノッチを吸収するので safe-area 補正は v0.1.2 で検討 */
export const HUD_MARGIN = 24;
/** HUD の FPS 更新間隔（ms）。毎フレーム setText しない（CLAUDE.md §7） */
export const HUD_FPS_INTERVAL_MS = 250;
/** Registry に置くゲームデータのキー */
export const REGISTRY_KEY_DATA = 'gameData';

export const SCENE_KEYS = {
  boot: 'Boot',
  mission: 'Mission',
} as const;
