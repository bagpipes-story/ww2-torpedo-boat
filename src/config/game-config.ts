// Phaser 設定と画面定数（docs/02 §2）。数値はここだけに置く。
import { logicalWidthFor } from '../core/screen';
import { parseRaidOverride, type RaidOverride } from '../core/sortie';
import { startScreenFit } from './screen-fit';

/** 論理座標の高さ（固定）。幅は起動時の横持ちの縦横比で決める（v0.5.1 実機 1 回目） */
export const GAME_HEIGHT = 720;
/** 論理幅の下限（16:9。これより太い画面は左右に黒帯）・上限（2.2:1）・刻み */
export const GAME_WIDTH_MIN = 1280;
export const GAME_WIDTH_MAX = 1584;
export const GAME_WIDTH_STEP = 8;
/** ゲームの枠（#game）を画面に合わせる（JS。iOS の 100dvh は起動直後に狂う）。横持ちの枠の CSS px。テスト（window 無し）では null */
const SCREEN = startScreenFit();
/**
 * 論理幅: 高さ 720 のまま、横持ちの枠の縦横比に合わせて広げる（iPhone 15 のホーム画面のアプリで 734×393 → 1344）。
 * HUD は GAME_WIDTH からの位置で並ぶので右端・中央に付いてくる。起動後に向きや大きさが変わっても幅は変えない（FIT が黒帯で合わせる）
 */
export const GAME_WIDTH = SCREEN ? logicalWidthFor(SCREEN.width, SCREEN.height, GAME_HEIGHT, GAME_WIDTH_MIN, GAME_WIDTH_MAX, GAME_WIDTH_STEP) : GAME_WIDTH_MIN;
/** 夜の海の背景色（docs/02 §7）。値は dawn-config（v0.6.1。夜明けの海の明るさが DOM 無しで読む） */
export { SEA_COLOR } from './dawn-config';
/** HUD の余白（ゲーム座標 px）。ノッチ・角丸は枠の外（screen-fit が左右の safe-area を引く）、下のホームバーは引かない（v0.5.1） */
export const HUD_MARGIN = 24;
/** HUD の FPS 更新間隔（ms）。毎フレーム setText しない（CLAUDE.md §7） */
export const HUD_FPS_INTERVAL_MS = 250;
/** Registry に置くゲームデータのキー */
export const REGISTRY_KEY_DATA = 'gameData';

/** Registry に置く共有オブジェクトのキー */
export const REGISTRY_KEY_INPUT = 'inputState';
export const REGISTRY_KEY_TELEMETRY = 'boatTelemetry';
/** Registry に置く「Briefing まで進んでまだ出撃していない夜」（BriefingInit。出撃で null）。任務一覧へ戻って同じ任務を選び直しても同じ夜にする（v0.4.0） */
export const REGISTRY_KEY_PENDING_SORTIE = 'pendingSortie';
/** Title で選んだ難易度（true＝ハード。v0.4.5）。Title → Briefing → Mission → Result の「もう一度」まで持ち回る。初期値はノーマル */
export const REGISTRY_KEY_HARD = 'hardMode';
/** Title で選んだ史実モード（true＝オン。v0.5.2。hit_rate_model.historical_mode）。難易度と同じく Result の「もう一度」まで持ち回る。初期値は data の enabled_default（オフ） */
export const REGISTRY_KEY_HISTORICAL = 'historicalMode';
/** Title で選んでいるキャンペーンのタブ（v0.6.0。'us_pt' / 'jp_hard'）。Result の「任務一覧」から戻っても同じタブ。無ければ default のキャンペーン */
export const REGISTRY_KEY_CAMPAIGN = 'campaign';

/** 描画スケールの上限（CLAUDE.md §7: resolution は min(devicePixelRatio, 2)） */
export const DPR_CAP = 2;
/**
 * 描画スケール = 「FIT で実際に表示される CSS px / 論理 px」× min(DPR, 2)。
 * Phaser 3 には resolution 設定が無いので、ゲームサイズをこの倍率で作り、各シーンのカメラを同じ倍率でズームして論理座標 GAME_WIDTH×720（幅は画面の縦横比で 1280〜1584。v0.5.1） を保つ。
 * 論理 px に DPR を掛けると、FIT で縮む分だけ画面の物理画素より大きな canvas を塗ることになる（§7「フル解像度のCanvas」）ので、
 * 表示サイズ基準にする。横持ち前提なので起動時の向きに関わらず長辺を幅として計算する。下限 1（生成テクスチャの線幅を 1px 以上に保つ）。
 * Text は style.resolution に同じ値を渡す。
 */
function computeRenderScale(): number {
  if (typeof window === 'undefined' || !SCREEN) return 1;
  const fit = Math.min(SCREEN.width / GAME_WIDTH, SCREEN.height / GAME_HEIGHT);
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
/** ?debug&ff: 味方機の開始条件のうち「魚雷を撃った」を満たした扱いにする（撃たずに帰って識別を試すため。docs/02 §6.8） */
export const DEBUG_FRIENDLY_FORCE = DEBUG_ENABLED && new URLSearchParams(window.location.search).has('ff');
/** ?debug&storm=Y: 暴風の帯の南の縁の初期 y を固定。?debug&nostorm: 帯なし（v0.3.3 と同じ世界。比較用） */
export const DEBUG_STORM_START_Y = debugNumber('storm');
export const DEBUG_STORM_OFF = DEBUG_ENABLED && new URLSearchParams(window.location.search).has('nostorm');
/** ?debug&plane: 水上機が最初の接近を哨戒 20 秒と航跡 3 秒を待たずに始める（航跡が見え次第。以後の追跡・見失いは通常どおり）。?debug&plane=attack: 加えて常に見えている（減速しても見失わない。照明弾・爆撃の確認用）。?debug&noplane: 水上機なし（v0.4.0 と同じ世界） */
function debugSeaplane(): 'none' | 'force' | 'attack' {
  if (!DEBUG_ENABLED) return 'none';
  const v = new URLSearchParams(window.location.search).get('plane');
  return v === null ? 'none' : v === 'attack' ? 'attack' : 'force';
}
export const DEBUG_SEAPLANE = debugSeaplane();
export const DEBUG_SEAPLANE_OFF = DEBUG_ENABLED && new URLSearchParams(window.location.search).has('noplane');
/** ?debug&mission=us_03: 直行する任務（v0.4.2。v0_1_prototype を持つ任務の id。無ければ us_02）。?debug&barges=near: 大発の任務で隊の先頭の 450 m 西・230 m 北（浅瀬の縁の外、東向き。先頭まで約 500 m）から始める */
export const DEBUG_MISSION_ID: string = (DEBUG_ENABLED && new URLSearchParams(window.location.search).get('mission')) || 'us_02';
export const DEBUG_BARGES_NEAR = DEBUG_ENABLED && new URLSearchParams(window.location.search).get('barges') === 'near';
/** ?debug&notransport: 輸送船なし（v0.4.7。v0.4.6 と同じ世界。再生の比較用） */
export const DEBUG_TRANSPORT_OFF = DEBUG_ENABLED && new URLSearchParams(window.location.search).has('notransport');
/** ?debug&fixed: 夜の揺らぎを掛けない（v0.4.6。危険はすべて出て、敵の位置もずれない＝v0.4.5 と同じ世界。再生の比較用） */
export const DEBUG_FIXED_NIGHT = DEBUG_ENABLED && new URLSearchParams(window.location.search).has('fixed');
/** ?debug&hard: 直行の出撃を難易度ハードに（v0.4.5。敵の数が増える。通し（&title）では Title の切り替えが優先） */
export const DEBUG_HARD = DEBUG_ENABLED && new URLSearchParams(window.location.search).has('hard');
/** ?debug&historical: 直行の出撃を史実モードに（v0.5.2。通し（&title）では Title の切り替えが優先） */
export const DEBUG_HISTORICAL = DEBUG_ENABLED && new URLSearchParams(window.location.search).has('historical');
/** ?debug&sorties=N: 終えた任務の回数を N とみなす（v0.5.2。見越し点マーカーの解放を実機・ヘッドレスで確かめる。保存した回数は変えない）。無ければ NaN（保存した回数） */
export const DEBUG_SORTIES = debugNumber('sorties');
/** ?debug&unlock: すべてのキャンペーンを開いたものとして扱う（v0.6.0。保存は変えない。Safari とホーム画面のアプリは保存が別なので、日本側を Safari で試すとき用） */
export const DEBUG_UNLOCK_ALL = DEBUG_ENABLED && new URLSearchParams(window.location.search).has('unlock');
/** ?debug&shiphit=N: 駆逐艦・輸送船の船体の当たり判定の倍率（v0.4.8。data の world.ship_hit_scale の代わり。1 = v0.4.7 までの実寸、2 = 絵と同じ。実機で比べる・再生の比較用）。無ければ NaN（data の値） */
export const DEBUG_SHIP_HIT_SCALE = debugNumber('shiphit');
/** ?debug&nobattery: 沿岸砲なし（v0.4.3。v0.4.2 と同じ世界） */
export const DEBUG_BATTERY_OFF = DEBUG_ENABLED && new URLSearchParams(window.location.search).has('nobattery');
/** ?debug&nostrike: 夜明けの空襲なし（v0.6.1。敵の制空下の任務でも敵機が来ない。夜明けの後も任務は続く。&dawn=S と合わせて夜明けの後を試す） */
export const DEBUG_STRIKE_OFF = DEBUG_ENABLED && new URLSearchParams(window.location.search).has('nostrike');
/** ?debug&engoff: 機関の不調なし（v0.6.5。jp_05 が v0.6.4 と同じ世界。再生の比較用）。?debug&enghot: 出撃時の機関の熱を config/engine-config の DEBUG_ENGINE_HOT_HEAT に（すぐ「過熱」。不調を早く見る） */
export const DEBUG_ENGINE_OFF = DEBUG_ENABLED && new URLSearchParams(window.location.search).has('engoff');
export const DEBUG_ENGINE_HOT = DEBUG_ENABLED && new URLSearchParams(window.location.search).has('enghot');
/** ?debug（&title なし）: Title・Briefing を飛ばして us_02 の Mission へ直行し、Result の「もう一度」も Mission へ（v0.3.5 までと同じ流れ。既存のヘッドレスと実機の数値比べの URL がそのまま動く）。?debug&title で Title から通す */
export const DEBUG_DIRECT_MISSION = DEBUG_ENABLED && !new URLSearchParams(window.location.search).has('title');
/** 港内空襲の上書き（docs/02 §6.8）。通し（&title）: &raid＝必ず起こす、&noraid＝起こさない、&raid=disperse|stay|hit＝起こす（hit は至近弾、stay は無傷に固定。選ぶのは Briefing）。直行: &raid=disperse|stay|hit だけが効き、その結果で出撃する（直行は空襲を振らないので、他は空襲なし） */
export const DEBUG_RAID_OVERRIDE: RaidOverride = DEBUG_ENABLED
  ? parseRaidOverride(new URLSearchParams(window.location.search).get('raid'), new URLSearchParams(window.location.search).has('noraid'))
  : 'none';
/** ?debug&seed=N: 出撃の seed を固定（Result の seed と同じ値で任務の乱数を再現する。空襲を振るのは通しだけなので、空襲の夜まで再現するのは ?debug&title&seed=N。0 と負は無視） */
export const DEBUG_SEED = debugNumber('seed');
/** 出撃の seed。Title の行・Result の「もう一度」（直行では Boot・Result）が Briefing・Mission の前に決める（Math.random は使わない。§7） */
export function sortieSeed(): number {
  return Number.isFinite(DEBUG_SEED) ? DEBUG_SEED >>> 0 : Date.now() >>> 0;
}

/** 同時に扱うタッチ数（マウス 1 ＋ タッチ 3: スティック＋右側ボタン）。Phaser の input.activePointers に渡す */
export const ACTIVE_TOUCH_POINTERS = 3;

/** カメラ追従の補間係数（1 フレームあたりの割合。dt では割らない。「カメラが追従」の手触りは実機で調整） */
export const CAMERA_FOLLOW_LERP = 0.1;

/** 描画順。数値が大きいほど手前 */
export const DEPTH = {
  sea: 0,
  /** 帰投地点の輪・浅瀬: 海の上、光と艦艇の下 */
  returnRing: 1,
  shallows: 1,
  /** 上陸地点の印（v0.6.4 実機 1 回目。systems/convoy）: 陸・浜の線の上。shallows と同じだと後に作る陸の塗り（entities/shallows）に帯の半分と「上陸地点」が隠れた */
  landingMark: 1.5,
  wake: 4,
  torpedo: 8,
  destroyer: 9,
  playerBoat: 10,
  /** 煙幕は艦艇の上に薄く重ねる（艇が煙に隠れて見える） */
  smoke: 11,
  /** 探照灯・星弾は海の上、艦艇の下。暴風の帯はその上・航跡の下 */
  light: 2,
  storm: 3,
  shell: 12,
  /** 空襲の着弾点の輪（v0.6.1）: 爆弾（shell）・自艇・煙の上、雨筋の下（爆弾の灰色の円や艇に隠れない） */
  impactRing: 12.5,
  /** 雨筋は砲弾の上、味方機は煙と砲弾の上、演出の下 */
  rain: 13,
  aircraft: 14,
  effects: 20,
  hud: 1000,
  stickBase: 990,
  stickKnob: 991,
} as const;

/** 固定ステップ積分（CLAUDE.md §7）。値は step-config（v0.5.0 で分けた。テストと命中率の模擬が DOM 無しで読む） */
export { FIXED_STEP_S, MAX_STEPS_PER_FRAME } from './step-config';

/** ?debug 直行で出る任務と、Boot のテクスチャの任務（data/missions_seed.json の us_02 の簡略版。v0.4.0 で出撃できるのはこれだけ） */
export const PROTOTYPE_MISSION_ID = 'us_02';

export const SCENE_KEYS = {
  boot: 'Boot',
  title: 'Title',
  briefing: 'Briefing',
  mission: 'Mission',
  hud: 'Hud',
  result: 'Result',
  /** 一時停止（v0.5.1 実機 1 回目）。Mission と Hud の上に重ねる */
  pause: 'Pause',
} as const;

/** 艇の絵の鍵（v0.6.0: 艇ごとに 1 枚。Boot が遊べる任務の自艇と僚艇の寸法から 1 回だけ作る。T-38 は Elco より小さい） */
export function boatTextureKey(boatId: string): string {
  return `tex-boat-${boatId}`;
}

export const TEXTURE_KEYS = {
  destroyer: 'tex-destroyer',
  transport: 'tex-transport',
  torpedo: 'tex-torpedo',
  wakeDot: 'tex-wake-dot',
  torpedoButton: 'tex-torpedo-button',
  explosionRing: 'tex-explosion-ring',
  targetMarker: 'tex-target-marker',
  homeMarker: 'tex-home-marker',
  returnRing: 'tex-return-ring',
  /** 空襲の着弾点の輪（v0.6.1。線の太い専用の輪） */
  impactRing: 'tex-impact-ring',
  debugRing: 'tex-debug-ring',
  shell: 'tex-shell',
  tracer: 'tex-tracer',
  searchlight: 'tex-searchlight',
  starshell: 'tex-starshell',
  hpBarBg: 'tex-hp-bar-bg',
  hpBarFill: 'tex-hp-bar-fill',
  roundButton: 'tex-round-button',
  smokePuff: 'tex-smoke-puff',
  aircraft: 'tex-aircraft',
  enemyAircraft: 'tex-aircraft-enemy',
  rainStreak: 'tex-rain-streak',
  stickBase: 'tex-stick-base',
  stickKnob: 'tex-stick-knob',
  rudderBar: 'tex-rudder-bar',
  rudderMarker: 'tex-rudder-marker',
  barge: 'tex-barge',
  bargeFriendly: 'tex-barge-friendly', // 味方の大発（v0.6.4。assets/barge-placeholder。赤い tex-barge を tint しても青くならないので別の 1 枚）
  gunTracer: 'tex-gun-tracer',
  coastMarker: 'tex-coast-marker',
  ptBoat: 'tex-pt-boat', // 敵の米PT（v0.6.3。assets/pt-placeholder）
} as const;
