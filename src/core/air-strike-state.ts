// 夜明けの空襲（v0.6.1。docs/02 §6.8）の定数・型・状態の確保（core/air-strike から分けた。300 行を超えないため）。Phaser 非依存。
// 確保は createAirStrike だけ（機・爆弾のプール・転舵の秒 16 個）。段階の進め方は air-strike.ts、読み出し（姿勢・脅威・見越し）は air-strike-pose.ts。
// 使う側は core/air-strike だけを import する（ここと air-strike-pose を出し直している）。
import type { BoatState } from './boat-motion';
import type { HitSpec } from './gunnery';

/** 空襲の乱数の系列（seed+19）。+18 は敵の PT の AI に予約、+17 は見張り、+16 は今夜の揺らぎ、+8+i は沿岸砲、+5 は夜の水上機 */
export const AIR_STRIKE_SEED_OFFSET = 19;
/** 機数の上限（史実の 4 機の編成。HUD の番号と strikeKey の桁もこれで足りる） */
export const AIR_STRIKE_MAX_PLANES = 4;
/** 自艇を狙った爆弾の転舵の秒を覚える数（Result は最初の 8 発） */
export const AIR_STRIKE_DODGE_SLOTS = 16;
/** 現れた機が濃くなる体感秒（見た目だけ） */
export const AIR_STRIKE_FADE_S = 0.5;

/** 機の段階: 待機 → 接近 → 旋回 → 爆撃進路 → 抜ける → （爆弾が残れば旋回に戻る）→ 去る → 終わり */
export const AS_IDLE = 0;
export const AS_INBOUND = 1;
export const AS_ORBIT = 2;
export const AS_RUN = 3;
export const AS_OUTBOUND = 4;
export const AS_LEAVING = 5;
export const AS_DONE = 6;
/** stepAirStrike の戻りビット */
export const AS_EV_WAVE = 1;
export const AS_EV_RUN = 2;
export const AS_EV_RELEASE = 4;
export const AS_EV_IMPACT = 8;
/** HUD の脅威（優先: 落下中 > 爆撃進路 > 接近 > 旋回 > 波の合間） */
export const AS_T_NONE = 0;
export const AS_T_INBOUND = 1;
export const AS_T_ORBIT = 2;
export const AS_T_RUN = 3;
export const AS_T_FALLING = 4;
export const AS_T_REST = 5;

export interface AirStrikeParams {
  /** 機数（1〜4）と 1 機が 1 波で落とす爆弾の数 */
  planes: number;
  bombsPerPlane: number;
  /** 画面上の飛行速度 m/体感秒（run_speed_kt × time_scale）、旋回の半径 m、角速度 deg/体感秒（時計回り）、爆撃進路の体感秒（R / v） */
  flightMps: number;
  runRadiusM: number;
  orbitDegPerS: number;
  runS: number;
  /** 現れる距離 m、来る方角（北 0・時計回り）、機ごとの方角のずれ（planes 個以上）、波ごとに回る角度 */
  spawnM: number;
  fromBearingDeg: number;
  spawnOffsetsDeg: readonly number[];
  waveRotateDeg: number;
  /** 波の始まりから最初の爆撃進路まで、進路の間隔、最後の投下から次の波まで、去る秒（体感） */
  firstRunS: number;
  runGapS: number;
  waveRestS: number;
  leaveS: number;
  /** 落下の体感秒と game 秒、散布の半径（CEP × √2）、円弧で見越す最小の旋回率 deg/game 秒、time_scale */
  fallFeelS: number;
  fallGameS: number;
  scatterM: number;
  aimTurnMinDegS: number;
  timeScale: number;
  /** 被害（自艇は世界の hitBoat、僚艇は damage だけ） */
  bombHit: HitSpec;
  /** 命中の半長と半径（半幅 + 爆風）。僚艇のいない任務は 0 */
  playerHalfLengthM: number;
  playerHitRadiusM: number;
  escortHalfLengthM: number;
  escortHitRadiusM: number;
  /** 狙いを海域に収める（端に押し付けた艇は clampToBounds で止まり、速力は残る）: 海域の幅・高さ m、自艇・僚艇の端の余白 m（clampToBounds と同じ。模擬は広い海） */
  boundsW: number;
  boundsH: number;
  playerMarginM: number;
  escortMarginM: number;
  /** 機ごとに、僚艇（要人）が浮いていれば僚艇を狙うか（planes 個） */
  escortPlanes: readonly boolean[];
  /** 爆弾のプールの大きさ（ceil(落下 / 間隔) + 1） */
  poolSize: number;
  /** HUD の材料: 機の名前、来る方角の 8 方位 */
  nameJa: string;
  fromJa: string;
}

export interface AirPlane {
  phase: number;
  /** 接近・旋回・去る: 自艇からの方位 deg と距離 m */
  bearingDeg: number;
  r: number;
  /** 段階に入ってからの体感秒 */
  timerS: number;
  /** 爆撃進路の始点の方位（進路は真上へ） */
  runDeg: number;
  toEscort: boolean;
  /** 投下の瞬間の相対位置（抜けるときの始点） */
  e0x: number;
  e0y: number;
  bombsLeft: number;
}

export interface AirBomb {
  active: boolean;
  toEscort: boolean;
  plane: number;
  /** 投下の瞬間の機の位置（爆弾の絵の始点。投下点 E0。進路の途中で僚艇が沈めば沈んだ所）と狙点 */
  fromX: number;
  fromY: number;
  aimX: number;
  aimY: number;
  leftS: number;
  /** 投下からの秒、投下の瞬間の目標の針路と見越した旋回率、見越しの針路から DODGE_TURN_DEG 変わるまでの秒（しなければ NaN） */
  aimedS: number;
  aimHeadingDeg: number;
  yawDegS: number;
  dodgeReactS: number;
  hitPlayer: boolean;
  hitEscort: boolean;
}

export interface AirStrikeState {
  started: boolean;
  cancelled: boolean;
  /** 今の波（0 始まり）、来た波の数、波の始まりからの体感秒、次に爆撃進路に入る順番、1 波の進路の数、最後の投下の waveT（無ければ NaN） */
  wave: number;
  waves: number;
  waveT: number;
  nextRun: number;
  totalRuns: number;
  lastReleaseT: number;
  /** 前のステップの自艇の針路と、それから測った旋回率 deg/game 秒 */
  prevHeadingDeg: number;
  yawDegS: number;
  /** 僚艇の自艇からの相対位置（毎ステップ。僚艇へ向かう進路の終点） */
  escRelX: number;
  escRelY: number;
  pendingEv: number;
  planes: AirPlane[];
  bombs: AirBomb[];
  lastRelease: number;
  lastImpact: number;
  /** KPI（Result）: 落とした数、僚艇へ、命中、自艇への被害、自艇を狙った爆弾の転舵の秒（最初の 16 発）と数 */
  bombsDropped: number;
  bombsAtEscort: number;
  hitsPlayer: number;
  hitsEscort: number;
  damagePlayer: number;
  dodgeS: number[];
  dodgeCount: number;
}

/** 世界が固定ステップで中身だけ書き換える材料 */
export interface AirStrikeCheck {
  player: BoatState;
  playerSinking: boolean;
  escort: BoatState | null;
  escortAfloat: boolean;
  /** 自艇の沈没・輪の中・座礁（最初の 1 回で全機が去り、それ以上は来ない） */
  cancel: boolean;
}

export function createAirStrike(p: AirStrikeParams): AirStrikeState {
  const planes: AirPlane[] = [];
  for (let i = 0; i < p.planes; i++) planes.push({ phase: AS_IDLE, bearingDeg: 0, r: 0, timerS: 0, runDeg: 0, toEscort: false, e0x: 0, e0y: 0, bombsLeft: 0 });
  const bombs: AirBomb[] = [];
  for (let i = 0; i < p.poolSize; i++)
    bombs.push({ active: false, toEscort: false, plane: -1, fromX: 0, fromY: 0, aimX: 0, aimY: 0, leftS: 0, aimedS: 0, aimHeadingDeg: 0, yawDegS: 0, dodgeReactS: NaN, hitPlayer: false, hitEscort: false });
  const dodgeS: number[] = [];
  for (let i = 0; i < AIR_STRIKE_DODGE_SLOTS; i++) dodgeS.push(NaN);
  return {
    started: false, cancelled: false, wave: 0, waves: 0, waveT: 0, nextRun: 0, totalRuns: p.planes * p.bombsPerPlane, lastReleaseT: NaN,
    prevHeadingDeg: 0, yawDegS: 0, escRelX: 0, escRelY: 0, pendingEv: 0, planes, bombs, lastRelease: -1, lastImpact: -1,
    bombsDropped: 0, bombsAtEscort: 0, hitsPlayer: 0, hitsEscort: 0, damagePlayer: 0, dodgeS, dodgeCount: 0,
  };
}
