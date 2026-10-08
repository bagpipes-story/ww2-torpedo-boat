// Phaser 設定と画面定数（docs/02 §2）。数値はここだけに置く。
export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;
/** 夜の海の背景色（docs/02 §7） */
export const SEA_COLOR = '#0b1020';
/** HUD の余白（ゲーム座標 px）。safe-area 補正は未実装（横持ちの 16:9 黒帯がノッチを吸収する想定。CHANGELOG 既知の制約。対応版は docs/03 に未記載） */
export const HUD_MARGIN = 24;
/** HUD の FPS 更新間隔（ms）。毎フレーム setText しない（CLAUDE.md §7） */
export const HUD_FPS_INTERVAL_MS = 250;
/** Registry に置くゲームデータのキー */
export const REGISTRY_KEY_DATA = 'gameData';

/** Registry に置く共有オブジェクトのキー */
export const REGISTRY_KEY_INPUT = 'inputState';
export const REGISTRY_KEY_TELEMETRY = 'boatTelemetry';

/** 描画スケールの上限（CLAUDE.md §7: resolution は min(devicePixelRatio, 2)） */
export const DPR_CAP = 2;
/**
 * 描画スケール = 「FIT で実際に表示される CSS px / 論理 px」× min(DPR, 2)。
 * Phaser 3 には resolution 設定が無いので、ゲームサイズをこの倍率で作り、各シーンのカメラを同じ倍率でズームして論理座標 1280×720 を保つ。
 * 論理 px に DPR を掛けると、FIT で縮む分だけ画面の物理画素より大きな canvas を塗ることになる（§7「フル解像度のCanvas」）ので、
 * 表示サイズ基準にする。横持ち前提なので起動時の向きに関わらず長辺を幅として計算する。下限 1（生成テクスチャの線幅を 1px 以上に保つ）。
 * Text は style.resolution に同じ値を渡す。
 */
function computeRenderScale(): number {
  if (typeof window === 'undefined') return 1;
  const w = Math.max(window.innerWidth, window.innerHeight);
  const h = Math.min(window.innerWidth, window.innerHeight);
  const fit = Math.min(w / GAME_WIDTH, h / GAME_HEIGHT);
  const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
  return Math.max(1, fit * dpr);
}
export const RENDER_SCALE = computeRenderScale();

/** URL に ?debug があるときだけ true。window.__game の公開、見越し点マーカー、発見距離・視程の円を出す（通常の Pages URL では何もしない） */
export const DEBUG_ENABLED = typeof window !== 'undefined' && window.location.search.includes('debug');

/** ?debug のときだけ有効な数値の上書き（実機で割当と夜明けを比べるため。docs/03 v0.3.1）: `?debug&fuel=36&dawn=150`。無ければ NaN（data の値を使う） */
function debugNumber(key: string): number {
  if (!DEBUG_ENABLED) return NaN;
  const v = new URLSearchParams(window.location.search).get(key);
  if (v === null) return NaN;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : NaN;
}
export const DEBUG_FUEL_ALLOTMENT_GAL = debugNumber('fuel');
export const DEBUG_DAWN_S = debugNumber('dawn');

/** 同時に扱うタッチ数（マウス 1 ＋ タッチ 3: スティック＋右側ボタン）。Phaser の input.activePointers に渡す */
export const ACTIVE_TOUCH_POINTERS = 3;

/** カメラ追従の補間係数（1 フレームあたりの割合。dt では割らない。「カメラが追従」の手触りは実機で調整） */
export const CAMERA_FOLLOW_LERP = 0.1;

/** 描画順。数値が大きいほど手前 */
export const DEPTH = {
  sea: 0,
  /** 帰投地点の輪: 海の上、光と艦艇の下 */
  returnRing: 1,
  wake: 4,
  torpedo: 8,
  destroyer: 9,
  playerBoat: 10,
  /** 煙幕は艦艇の上に薄く重ねる（艇が煙に隠れて見える） */
  smoke: 11,
  /** 探照灯・星弾は海の上、艦艇の下 */
  light: 2,
  shell: 12,
  effects: 20,
  hud: 1000,
  stickBase: 990,
  stickKnob: 991,
} as const;

/** 固定ステップ積分（CLAUDE.md §7）。実時間 1/60 秒 × time_scale を 1 ステップにする */
export const FIXED_STEP_S = 1 / 60;
export const MAX_STEPS_PER_FRAME = 4;

/** v0.1 で使うミッション（data/missions_seed.json の注記どおり us_02 の簡略版） */
export const PROTOTYPE_MISSION_ID = 'us_02';

export const SCENE_KEYS = {
  boot: 'Boot',
  mission: 'Mission',
  hud: 'Hud',
  result: 'Result',
} as const;

export const TEXTURE_KEYS = {
  playerBoat: 'tex-player-boat',
  destroyer: 'tex-destroyer',
  torpedo: 'tex-torpedo',
  wakeDot: 'tex-wake-dot',
  torpedoButton: 'tex-torpedo-button',
  explosionRing: 'tex-explosion-ring',
  targetMarker: 'tex-target-marker',
  homeMarker: 'tex-home-marker',
  returnRing: 'tex-return-ring',
  fuelTick: 'tex-fuel-tick',
  debugRing: 'tex-debug-ring',
  shell: 'tex-shell',
  tracer: 'tex-tracer',
  searchlight: 'tex-searchlight',
  starshell: 'tex-starshell',
  hpBarBg: 'tex-hp-bar-bg',
  hpBarFill: 'tex-hp-bar-fill',
  roundButton: 'tex-round-button',
  smokePuff: 'tex-smoke-puff',
  stickBase: 'tex-stick-base',
  stickKnob: 'tex-stick-knob',
  rudderBar: 'tex-rudder-bar',
  rudderMarker: 'tex-rudder-marker',
} as const;
