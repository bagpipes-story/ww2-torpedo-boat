// Phaser 設定と画面定数（docs/02 §2）。数値はここだけに置く。
export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;
/** 夜の海の背景色（docs/02 §7） */
export const SEA_COLOR = '#0b1020';
/** HUD の余白（ゲーム座標 px）。横持ちの黒帯がノッチを吸収するので safe-area 補正は v0.1.2 で検討 */
export const HUD_MARGIN = 24;
/** HUD の FPS 更新間隔（ms）。毎フレーム setText しない（CLAUDE.md §7） */
export const HUD_FPS_INTERVAL_MS = 250;
/** HUD の描画順。ゲーム内オブジェクトより常に手前 */
export const HUD_DEPTH = 1000;
/** Registry に置くゲームデータのキー */
export const REGISTRY_KEY_DATA = 'gameData';

/** Registry に置く共有オブジェクトのキー */
export const REGISTRY_KEY_INPUT = 'inputState';
export const REGISTRY_KEY_TELEMETRY = 'boatTelemetry';

/** 描画スケールの上限（CLAUDE.md §7: resolution は min(devicePixelRatio, 2)） */
export const DPR_CAP = 2;
/**
 * 描画スケール。Phaser 3 には resolution 設定が無いので、ゲームサイズをこの倍率で作り、
 * 各シーンのカメラをこの倍率でズームして論理座標 1280×720 を保つ。Text は style.resolution に同じ値を渡す。
 */
export const RENDER_SCALE = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, DPR_CAP);

/** 固定ステップ積分（CLAUDE.md §7）。実時間 1/60 秒 × time_scale を 1 ステップにする */
export const FIXED_STEP_S = 1 / 60;
export const MAX_STEPS_PER_FRAME = 4;
/** タブ復帰などで delta が巨大になったときの上限（ms） */
export const MAX_FRAME_DELTA_MS = 250;

/** v0.1 で使うミッション（data/missions_seed.json の注記どおり us_02 の簡略版） */
export const PROTOTYPE_MISSION_ID = 'us_02';
/** 海域境界から艇を押し戻す余白（m） */
export const SEA_BOUNDS_MARGIN_M = 20;

export const SCENE_KEYS = {
  boot: 'Boot',
  mission: 'Mission',
  hud: 'Hud',
} as const;

export const TEXTURE_KEYS = {
  playerBoat: 'tex-player-boat',
  seaGrid: 'tex-sea-grid',
  stickBase: 'tex-stick-base',
  stickKnob: 'tex-stick-knob',
  rudderBar: 'tex-rudder-bar',
  rudderMarker: 'tex-rudder-marker',
} as const;
