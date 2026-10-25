// HUD に渡す自艇の状態の型（v0.6.5 の準備で core/boat-motion.ts から移した。boat-motion が再 export する。v0.6.5 で機関の不調の engine、v0.6.6 で隼艇の gunboat、v0.6.7 で夜の哨戒機の patrol を足した）。
// Phaser 非依存。型だけ（実行時の値を持たない）。
import type { ConvoyTelemetry } from './convoy';
import type { DawnTelemetry } from './dawn-air';
import type { EngineTelemetry } from './engine-trouble';
import type { GunboatTelemetry } from './gunboat';
import type { PatrolTelemetry } from './patrol-air-state';
import type { PtTelemetry } from './pt-boats';
import type { SpeedStep } from './boat-motion';

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
  /** 夜明けまでの実時間秒（0 で夜明け。v0.6.1 から任務は終わらない。夜明けの後の時計・空襲は dawn） */
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
  dawn: DawnTelemetry; // 夜明け（v0.6.1。core/dawn-air）: ラッチ・夜明け後の秒・空の持ち主・空襲の段（systems/dawn-telemetry が毎フレーム書く）
  pt: PtTelemetry; // 敵の米PT（v0.6.3。core/pt-boats）: 隊の段階・航過・かわす向き・脅威の PT の相対位置（systems/pt-telemetry が毎フレーム書く。無い任務は enabled false）
  convoy: ConvoyTelemetry; // 味方の大発の輸送隊（v0.6.4。core/convoy）: 隻数・上陸・沈没・浜まで・最寄りの大発（systems/convoy-telemetry が毎フレーム書く。無い任務は enabled false）
  engine: EngineTelemetry; // 機関の不調（v0.6.5。core/engine-trouble）: 熱・段・不調の残りの秒・出来事（systems/engine-trouble が毎フレーム書く。不調の無い任務は on false）
  gunboat: GunboatTelemetry; // 隼艇（v0.6.6。core/gunboat。jp_01 のハード）: 自艇からの位置・HP・沈没・決着・浜（systems/gunboat が毎フレーム書く。無い任務は enabled false）
  patrol: PatrolTelemetry; // 夜の哨戒機（v0.6.7。core/patrol-air-state。jp_02）: 門番の段・捜索の方位と距離・秒読み・夜の出撃の脅威（systems/patrol-telemetry が毎フレーム書く。無い任務は enabled false）
}
