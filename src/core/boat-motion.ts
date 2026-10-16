// 艇の運動モデル（docs/02 §6.1）。Phaser 非依存の純粋ロジック。
// 単位は実寸: 位置 m、速度 m/s、針路は方位角（0=北=画面上、時計回り、[0,360)）。
// 時間圧縮（time_scale）は呼び出し側が dt に掛けて渡す（docs/02 §6.10）。
// §7: 毎フレーム呼ばれる関数はオブジェクトを確保しない。state を書き換える。
import { clamp, degToRad, ktToMps, mpsToKt, wrapDeg180, wrapDeg360 } from './units';

export interface BoatParams {
  speedMaxMps: number;
  speedCruiseMps: number;
  speedSilentMps: number;
  /** 速力帯の上限 m/s（docs/02 §6.1・§6.5）: この速度以下なら その帯。HUD の表示と発見距離の係数に使う */
  stopMaxMps: number;
  silentMaxMps: number;
  cruiseMaxMps: number;
  /** 上の帯へ移るのに境界をこれだけ超える必要がある（m/s。境界付近の揺れで帯が点滅しない） */
  bandHysteresisMps: number;
  accelMps2: number;
  decelMps2: number;
  turnRateDegS: number;
  lengthM: number;
  beamM: number;
}

export interface BoatState {
  x: number;
  y: number;
  headingDeg: number;
  speedMps: number;
}

/**
 * 操作入力（docs/02 §5、v0.2.1 で見直し）: スティックを倒した方向へ進み、倒すほど速い。
 * headingDeg: 目標方位（0=北=画面上、時計回り）。NaN なら針路を保つ（スティック中立）。
 * speed01: 目標速度の全速に対する比率 0〜1（中立=0=停止）。
 */
export interface BoatInput {
  headingDeg: number;
  speed01: number;
}

export interface SeaBounds {
  width: number;
  height: number;
}

export type SpeedStep = 'stop' | 'silent' | 'cruise' | 'full';

/** HUD に渡す自艇の状態。Mission が毎フレーム書き、HUD が読む（1 個だけ作る） */
export interface BoatTelemetry {
  speedMps: number;
  /** 旋回の指令 -1(左)〜+1(右)（目標方位への残り角。舵バーの表示用） */
  rudder: number;
  /** 現在の速度の速力帯（停止/静音/巡航/全速） */
  targetStep: SpeedStep;
  headingDeg: number;
  /** 残弾 */
  torpedoesLeft: number;
  /** 有効弾の命中数（不発を除く） */
  hits: number;
  /** 夜明けまでの実時間秒（0 で任務終了。帰投地点の外なら「帰投できず」） */
  timeLeftS: number;
  /** 敵（駆逐艦）の自艇からの相対位置 m（画面外マーカー用）。沈没後は NaN */
  enemyDx: number;
  enemyDy: number;
  /** 敵が自艇の視程内にいる（見える・マーカーを出す）。docs/02 §6.5 */
  enemySighted: boolean;
  /** 敵が自艇を発見している */
  playerDetected: boolean;
  /** 敵が自艇を見つける距離 m（速力段・月明で決まる。HUD に出して速力を落とす価値を見せる） */
  detectRangeM: number;
  /** 探照灯か星弾に照らされている（砲撃が来る）。starLit は星弾によるもの（HUD で区別する） */
  illuminated: boolean;
  starLit: boolean;
  /** 艇の HP と被害（docs/02 §6.6） */
  hp: number;
  hpMax: number;
  onFire: boolean;
  engineDamaged: boolean;
  /** 煙幕: 展開の残り実秒、次に使えるまでの実秒、艦との視線が煙に遮られている */
  smokeLeftS: number;
  smokeCooldownS: number;
  hiddenBySmoke: boolean;
  /** ワールドカメラの論理ズーム（見張りで下がる。画面外マーカーの計算用） */
  cameraZoom: number;
  /** 燃料（v0.3.0）: 残り ÷ 割当、全速で帰投地点の輪の縁まで戻るのに要る分 ÷ 割当（輪の中は 0。v0.3.3 で巡航基準から全速基準に。燃料計の青い目盛り）、空（漂流） */
  fuel01: number;
  fuelNeed01: number;
  fuelEmpty: boolean;
  /** 帰投地点: 自艇からの相対位置 m、中心までの距離 m、輪の縁までの距離 m（HUD の表示・目盛り・呼びかけ・Result はすべてこれ）、「帰投せよ」のビット（core/mission-flow）、輪の中、輪の中で魚雷の決着待ち */
  homeDx: number;
  homeDy: number;
  homeDistM: number;
  homeEdgeM: number;
  callFlags: number;
  atHome: boolean;
  homeWaiting: boolean;
  /** 駆逐艦が沈み始めた（以後は魚雷を撃てない。3 行目は「駆逐艦を撃沈」） */
  destroyerSunk: boolean;
  /** 浅瀬（core/shallows の SHALLOW_*）: 状態、縁までの距離 m（接近中のみ）、安全速力 kt（HUD の文言用） */
  shallowState: number;
  shallowAheadM: number;
  shallowSafeKt: number;
  /** 味方機（core/friendly の FF_*、v0.3.3）: 段階、識別の残り秒（要求中以外は NaN）、撃たれた回数、結果、真上を過ぎてから押した */
  friendlyPhase: number;
  friendlyLeftS: number;
  friendlyPasses: number;
  friendlyOutcome: number;
  friendlyPending: boolean;
  /** 敵の水上機（core/seaplane の SP_*、v0.4.1）: 段階、機までの距離 m（接近中）、発見確定、航跡が見えている、航跡が見える速力 kt、照明弾が燃えている、落とした爆弾・落下中・命中、結果、機の相対位置（マーカー用。来ていなければ NaN） */
  planePhase: number;
  planeDistM: number;
  planeLocked: boolean;
  planeWake: boolean;
  planeWakeKt: number;
  planeFlareOn: boolean;
  planeBombsDropped: number;
  planeBombAir: boolean;
  planeBombsHit: number;
  planeOutcome: number;
  planeDx: number;
  planeDy: number;
  /** 暴風（core/storm の STORM_*、v0.3.4）: 状態、縁までの距離 m、帯が北にある、安全速力を超えている、艦との線が帯にかかる（雨）、安全速力 kt */
  stormState: number;
  stormGapM: number;
  stormNorth: boolean;
  stormFast: boolean;
  stormLos: boolean;
  stormSafeKt: number;
  /** 乗員（v0.3.4）: 生存と定員。v0.3.5: 旋回率に掛かる倍率と、消火に要する長押し秒（乗員で伸びる） */
  crewAlive: number;
  crewTotal: number;
  crewTurnFactor: number;
  extinguishHoldS: number;
  /**
   * 大発掃討（v0.4.2。core/gun-battery の GUN_*）: 主兵装が砲、射撃の状態、速力帯で散っている、撃っている大発までの m（撃っていなければ 0）、射程と「遠い」の m、散らない速力の上限 kt（静音帯）。
   * 撃破・上陸・ノルマ・隻数、逃げている大発が岸に着くまでの最短の体感秒（逃げていなければ NaN）、平常の行の手がかり「大発は南の岸沿いを東から」（岸の向きと航路の向き + 180° の 8 方位。大発の任務でなければ ''。作るときに 1 回だけ）。
   * 岸の浅瀬の縁への相対位置 m（「岸 N m」の矢印。縁より海側にいる間だけ、それ以外と岸の無い任務は NaN）
   */
  gunMission: boolean;
  gunStatus: number;
  gunFast: boolean;
  gunTargetM: number;
  gunRangeM: number;
  gunEffectiveM: number;
  gunSteadyKt: number;
  bargesSunk: number;
  bargesBeached: number;
  bargesQuota: number;
  bargesTotal: number;
  bargeEscapeS: number;
  bargeHint: string;
  coastDx: number;
  coastDy: number;
  /** 沿岸砲（v0.4.3）: 任務にある、艇が射界の中、気づかれて撃ってくる */
  batteryEnabled: boolean;
  batteryInArc: boolean;
  batteryAlerted: boolean;
  /** 僚艇（v0.4.4。core/escort）: 任務にいる、HP と最大、自艇からの距離 m（1 フレーム 1 回の平方根）、沈んだ、「遅れている」の距離 m */
  escortEnabled: boolean;
  escortHp: number;
  escortHpMax: number;
  escortDistM: number;
  escortSunk: boolean;
  escortLagWarnM: number;
  /** 駆逐艦の隊（v0.4.5）: 沈み始めた隻数と隻数（駆逐艦のいない任務は 0。2 隻以上なら 2 行目に「撃沈 N/M」） */
  shipsSunk: number;
  shipsTotal: number;
  /** 今夜の危険（v0.4.6。夜の揺らぎ）: 味方機・敵の水上機がいる（識別ボタンと敵機の矢印を作るか） */
  friendlyEnabled: boolean;
  seaplaneEnabled: boolean;
  /** 輸送船（v0.4.7）: 任務にいる、沈み始めた */
  transportEnabled: boolean;
  transportSunk: boolean;
}

/** data/boats.json の1レコードのうち運動に使う部分 */
export interface BoatDataRecord {
  speed_max_kt: number;
  speed_cruise_kt: number;
  speed_silent_kt: number;
  speed_bands_kt: { stop_max: number; silent_max: number; cruise_max: number; hysteresis: number };
  accel_mps2: number;
  decel_mps2: number;
  turn_rate_deg_s: number;
  length_m: number;
  beam_m: number;
}

export function isBoatDataRecord(v: unknown): v is BoatDataRecord {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  const bands = r['speed_bands_kt'] as Record<string, unknown> | undefined;
  return (
    ['speed_max_kt', 'speed_cruise_kt', 'speed_silent_kt', 'accel_mps2', 'decel_mps2', 'turn_rate_deg_s', 'length_m', 'beam_m']
      .every((k) => typeof r[k] === 'number' && Number.isFinite(r[k] as number)) &&
    !!bands &&
    ['stop_max', 'silent_max', 'cruise_max', 'hysteresis'].every((k) => typeof bands[k] === 'number' && Number.isFinite(bands[k] as number))
  );
}

export function boatParamsFromData(r: BoatDataRecord): BoatParams {
  return {
    speedMaxMps: ktToMps(r.speed_max_kt),
    speedCruiseMps: ktToMps(r.speed_cruise_kt),
    speedSilentMps: ktToMps(r.speed_silent_kt),
    stopMaxMps: ktToMps(r.speed_bands_kt.stop_max),
    silentMaxMps: ktToMps(r.speed_bands_kt.silent_max),
    cruiseMaxMps: ktToMps(r.speed_bands_kt.cruise_max),
    bandHysteresisMps: ktToMps(r.speed_bands_kt.hysteresis),
    accelMps2: r.accel_mps2,
    decelMps2: r.decel_mps2,
    turnRateDegS: r.turn_rate_deg_s,
    lengthM: r.length_m,
    beamM: r.beam_m,
  };
}

/** HUD が速度を kt の整数で出すので、帯の判定も同じ丸めで行う（「18 kt」と表示されているのに巡航、を防ぐ） */
function roundedKtMps(speedMps: number): number {
  return ktToMps(Math.round(mpsToKt(speedMps)));
}

/** 速度がどの速力帯にあるか（状態なし。表示用に丸めた kt で判定）。帯の上限は data（speed_bands_kt） */
export function speedBandFor(speedMps: number, p: BoatParams): SpeedStep {
  const v = roundedKtMps(speedMps);
  if (v <= p.stopMaxMps) return 'stop';
  if (v <= p.silentMaxMps) return 'silent';
  if (v <= p.cruiseMaxMps) return 'cruise';
  return 'full';
}

const BAND_ORDER: readonly SpeedStep[] = ['stop', 'silent', 'cruise', 'full'];

/**
 * ヒステリシス付きの速力帯（HUD 表示と発見距離の係数。docs/02 §6.5）。
 * 下の帯へは境界を下回ればすぐ移り、上の帯へは境界＋hysteresis を超えて初めて移る。境界ぎりぎりで走っても帯が点滅しない。
 */
export function nextSpeedBand(prev: SpeedStep, speedMps: number, p: BoatParams): SpeedStep {
  const v = roundedKtMps(speedMps);
  const h = p.bandHysteresisMps;
  // 上限（これ以下ならその帯）。上へ移るときだけ h を足す
  const upper = (band: SpeedStep): number => (band === 'stop' ? p.stopMaxMps : band === 'silent' ? p.silentMaxMps : band === 'cruise' ? p.cruiseMaxMps : Infinity);
  let i = BAND_ORDER.indexOf(prev);
  if (i < 0) i = 0;
  while (i > 0 && v <= upper(BAND_ORDER[i - 1]!)) i--;
  while (i < BAND_ORDER.length - 1 && v > upper(BAND_ORDER[i]!) + h) i++;
  return BAND_ORDER[i]!;
}

/**
 * 1ステップ進める。目標速度 = speed01 × 全速 に加速度/減速度で近づき、目標方位へ旋回率の上限で最短側に回る（NaN なら針路を保つ）。
 * 速度ベクトルは常に船首方向（横滑りなし）。停止中でも回頭できる（操作性のための簡略。docs/02 §6.1）。dt は既に time_scale を掛けた秒。
 */
export function stepBoat(s: BoatState, input: BoatInput, p: BoatParams, dt: number): void {
  const target = clamp(input.speed01, 0, 1) * p.speedMaxMps;
  if (s.speedMps < target) s.speedMps = Math.min(target, s.speedMps + p.accelMps2 * dt);
  else if (s.speedMps > target) s.speedMps = Math.max(target, s.speedMps - p.decelMps2 * dt);

  if (!Number.isNaN(input.headingDeg)) {
    const diff = wrapDeg180(input.headingDeg - s.headingDeg);
    const maxTurn = p.turnRateDegS * dt;
    s.headingDeg = wrapDeg360(s.headingDeg + clamp(diff, -maxTurn, maxTurn));
  }

  const h = degToRad(s.headingDeg);
  s.x += Math.sin(h) * s.speedMps * dt;
  s.y -= Math.cos(h) * s.speedMps * dt;
}

/** 旋回率と加速を基準値 × 倍率で決める（暴風 × 乗員。v0.3.5。書く場所を 1 つにして上書きし合わない） */
export function setPerformance(p: BoatParams, baseTurnDegS: number, baseAccelMps2: number, turnFactor: number, accelFactor: number): void {
  p.turnRateDegS = baseTurnDegS * turnFactor;
  p.accelMps2 = baseAccelMps2 * accelFactor;
}

/** HUD の舵表示用: 目標方位への残り角を fullDeg で正規化した -1(左)〜+1(右)。目標が無ければ 0 */
export function turnCommand(input: BoatInput, s: BoatState, fullDeg: number): number {
  if (Number.isNaN(input.headingDeg)) return 0;
  return clamp(wrapDeg180(input.headingDeg - s.headingDeg) / fullDeg, -1, 1);
}

/** 一定針路・一定速力で直進する（v0.1 の駆逐艦。docs/02 §6.4）。dt は time_scale 込みの秒 */
export function stepStraight(s: BoatState, dt: number): void {
  const h = degToRad(s.headingDeg);
  s.x += Math.sin(h) * s.speedMps * dt;
  s.y -= Math.cos(h) * s.speedMps * dt;
}

/** 海域境界の内側に位置を押し戻す（docs/02 §6.1）。margin は境界からの余白 m */
export function clampToBounds(s: BoatState, b: SeaBounds, margin: number): void {
  s.x = clamp(s.x, margin, b.width - margin);
  s.y = clamp(s.y, margin, b.height - margin);
}
