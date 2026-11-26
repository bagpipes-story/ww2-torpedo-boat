// HUD に渡す自艇の状態の型（v0.6.5 の準備で core/boat-motion.ts から移した。boat-motion が再 export する。v0.6.5 で機関の不調の engine、v0.6.6 で隼艇の gunboat、v0.6.7 で夜の哨戒機の patrol、v0.6.8 で兵装の arms・aaFiring、v0.6.9 で揚陸の landing、v0.6.10 で卯月の ally、v0.6.11 で空襲下の退避の evac、v0.8.0 S2 でレーダーの radar と列の通過の transit、v0.8.1 S2 で止まった艦の anchor を足した）。
// Phaser 非依存。型だけ（実行時の値を持たない）。
import type { AllyTelemetry } from './ally-telemetry';
import type { ArmsTelemetry } from './arms-cue';
import type { ConvoyTelemetry } from './convoy';
import type { DawnTelemetry } from './dawn-air';
import type { EngineTelemetry } from './engine-trouble';
import type { EvacTelemetry } from './evac-telemetry';
import type { GunboatTelemetry } from './gunboat';
import type { LandingTelemetry } from './landing';
import type { PatrolTelemetry } from './patrol-air-state';
import type { PtTelemetry } from './pt-boats';
import type { PtNames, RescueTelemetry } from './rescue-telemetry';
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
  /** 武装の前（100 m の内）に狙える艦の船体の下を通った自艇の魚雷の数（v0.8.2 IP1。systems/torpedo-under。2 行目の「近すぎて船体の下を通過」だけが読む） */
  torpedoUnder: number;
  /** 煙幕への乱射（v0.8.4。史実モードだけ）の弾が自艇から近く（config/barrage-hud-config）に落ちた累計。2 行目の「煙の中へ乱射されている」だけが読む。乱射の無い世界は 0 */
  smokeBarrage: number;
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
  /** 大発への砲の弾倉交換の残り体感秒（v0.6.8 実機 1 回目。0 は交換していない・弾倉の無い砲・大発の任務でない。2 行目の「弾倉交換 ・ あと N 秒」と機銃ボタン） */
  gunReloadLeftS: number;
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
  /** 機銃で機を撃っている（v0.6.8。2 行目の砲の行を出さない。mission-mode が読む。as BoatTelemetry の偽物では undefined＝偽） */
  aaFiring: boolean;
  arms: ArmsTelemetry; // 兵装（v0.6.8。core/arms-cue）: 積んでいる魚雷・撃てるか・出来事と状態の文（systems/arms-telemetry が毎フレーム書く）
  landing: LandingTelemetry; // 停泊して揚陸する味方の輸送船と米PT の雷撃（v0.6.9。core/landing。jp_04）: 揚陸・報告・雷跡・出来事（systems/landing-telemetry が毎フレーム書く。無い任務は enabled false）
  ally: AllyTelemetry; // 味方の駆逐艦 卯月（v0.6.10 S6。core/ally-telemetry。jp_04）: 呼び名・帰投の輪の呼びかけ・平常の行の末尾・最後の砲の出来事が卯月か（systems/ally-telemetry。無い任務は enabled false）
  evac: EvacTelemetry; // 空襲下の退避（v0.6.11 S5。core/evac-telemetry。jp_03）: 操作中の隊・座席の隊の HP・予告・出来事・近い隠れ場所・狙われた隊（systems/evac-telemetry。無い任務は enabled false）
  radar: RadarTelemetry; // 自艇のレーダー（v0.8.0 S2。core/radar の状態の写し。us_04）: 掃引・接触・最初の接触・増えた／減った（systems/radar-telemetry。無い任務・?debug&noradar は enabled false）。HUD の文・端の印・Result は S4
  transit: TransitTelemetry; // 列の通過（v0.8.0 S2。core/ship-transit の段階の数。us_04）: 段階ごとの隻数・残りの戻り・通算（systems/transit-telemetry。無い任務は enabled false）。文は S4
  strait: StraitTelemetry; // 海峡の夜の目と衝突の危険（v0.8.0 S4。us_04）: 視程の 2 乗・艦首がこちらへ向く目で見えている艦（systems/strait-telemetry。列の通過もレーダーも無い任務は enabled false）
  anchor?: AnchorTelemetry; // 止まった艦と暗い岸を背に（v0.8.1 S2。us_06）: 気づいた・動き出した・背に岸の秒・止まった艦への魚雷（systems/anchor-telemetry。setup.anchors の無い任務は鍵ごと無い）
  recon?: ReconTelemetry; // 報告・無線・中継（v0.8.2 S2。us_05）: 段・追った秒・無線・中継の輪（systems/recon-telemetry。setup.recon の無い任務は鍵ごと無い）。文は S4
  magazine?: MagazineTelemetry; // 戦艦の弾薬庫（v0.8.2 S2。us_05）: 誘爆の秒と何本目・引いた回数と確率の和（systems/recon-telemetry。規則のある艦のいない任務は鍵ごと無い）
  rescue?: RescueTelemetry; // 生存者の救助・機雷・フィッチの砲火（v0.8.5 S2。us_07。core/rescue-telemetry・systems/rescue-telemetry。setup.rescue の無い任務は鍵ごと無い）。文は S4
  ptNames?: PtNames; // PT の隊の HUD の名（v0.8.5 S2。記録に name_short_ja のある隊＝us_07 の「Sボート」だけ。無ければ ui/pt-lines は「米PT」・「ガソリンに引火」）
}

/** 報告の HUD・Result の材料（v0.8.2 S2。読み手は S4 の ui/recon-lines・recon-result）。秒はみな固定ステップの時計（NaN は未だ） */
export interface ReconTelemetry {
  /** 段（core/recon-report の RECON_*）・無線が壊れた・追った秒・あと何秒（追う間の外は 0）・確かめた秒・報告の隻数（確かめる艦種の艦） */
  stage: number; radioBroken: boolean; trackedS: number; trackLeftS: number; seenAtS: number; seenCount: number;
  /** 送った・中継待ちになった・無線が壊れた・中継した秒・無線の故障を引いた回数・出来事のあったステップの通算と最後のステップのビット（RECON_EV_*） */
  sentAtS: number; pendingAtS: number; radioBrokenAtS: number; relayedAtS: number; draws: number; eventCount: number; events: number;
  /** 中継の輪（自艇からの相対位置 m・半径 m・名。S4 の端の印） */
  relayDx: number; relayDy: number; relayRadiusM: number; relayJa: string;
  /** v0.8.2 S4（ui/recon-lines の材料）: 確かめる艦種の名詞・列の向きと速さの句（作る時に 1 回）、戦艦・重巡への命中で沈まなかった回数・その最後の何本目と艦種の名詞・艦ごとに見た命中（隊の添字） */
  identifyJa: string; fleetJa: string; capHits: number; capHitN: number; capHitJa: string; capSeen: Uint8Array;
}

/** 戦艦の弾薬庫の HUD・Result の材料（v0.8.2 S2。艦ごとの配列は世界の MagazineLog の参照＝写さない。隊の添字） */
export interface MagazineTelemetry {
  detonatedAtS: ArrayLike<number>;
  onHit: ArrayLike<number>;
  /** 誘爆した艦の数・引いた回数・引いた確率の和（隊の全艦。探りの期待値＝S3） */
  detonations: number; draws: number; chanceSum: number;
}

/** 輝点の位置（core/radar の RadarBlip の読むだけの形。S4 の緑の端の印が読む） */
export interface RadarBlipPos {
  readonly x: number;
  readonly y: number;
}

/** レーダーの HUD・Result の材料（v0.8.0 S2。読み手は S4 の ui/radar-lines・radar-result）。輝点の位置は世界の絵（systems/radar-view）が出し、ここは数と出来事だけ */
export interface RadarTelemetry {
  enabled: boolean;
  /** 艦が映る射程 m（Briefing・HUD の尾） */
  shipRangeM: number;
  /** 掃引の回数・今の接触（輝点）の数・一番近い接触までの m（無ければ NaN） */
  sweeps: number;
  contacts: number;
  nearestM: number;
  /** 夜の最初の接触: 秒（NaN は未だ）・一番近い輝点・その時の自艇 */
  firstS: number;
  firstX: number;
  firstY: number;
  firstFromX: number;
  firstFromY: number;
  /** 接触の数が増えた回数と最後の新しい接触、減った回数と最後に消えた接触 */
  newCount: number;
  newX: number;
  newY: number;
  lostCount: number;
  lostX: number;
  lostY: number;
  /**
   * v0.8.0 S4（ui/radar-lines・radar-marker の材料。brief L26・L27）: 海域の幅 m（PPI の枠の東の縁）と東の縁の向こうの揚陸の地の名（列が東へ抜けて戻る任務だけ。無ければ ''）、
   * 今の輝点（core/radar の状態の枠をそのまま参照する＝毎フレーム写さない。0〜contacts − 1 が近い順）、最後の掃引の自艇の位置（接触の方位と距離の元）と今の自艇の位置（端の印の元）
   */
  widthM: number;
  eastJa: string;
  /** 東の縁の向こうへ去って戻らない片道の列（v0.8.2 S4。us_05。eastJa は海峡の名＝「接触が東（スリガオ海峡）へ消えた」に戻りの尾を付けない） */
  eastOneWay?: boolean;
  blips: readonly RadarBlipPos[];
  fromX: number;
  fromY: number;
  boatX: number;
  boatY: number;
}

/** 列の通過の HUD・Result の材料（v0.8.0 S2。読み手は S4 の ui/strait-lines・strait-result） */
export interface TransitTelemetry {
  enabled: boolean;
  /** 列の艦の数（ハード込み） */
  ships: number;
  /** 今の段階ごとの隻数: まだ来ない・往路・揚陸の地（ビラ）・復路・去った・撃沈 */
  waiting: number;
  inbound: number;
  away: number;
  outbound: number;
  gone: number;
  sunk: number;
  /** 残りの戻り（これから現れる艦。夜明けの後は 0）・通算（往路に現れた・揚陸の地に着いた・復路に現れた）・復路の最初の艦が現れた秒（NaN は未だ） */
  pending: number;
  inCount: number;
  arrivedCount: number;
  outCount: number;
  firstOutS: number;
}

/** 海峡の夜の HUD の材料（v0.8.0 S4。brief L27・L28。読み手は ui/radar-marker（目で見える輝点を除く）と ui/strait-line-clock（衝突の危険）） */
export interface StraitTelemetry {
  enabled: boolean;
  /** 自艇の視程の 2 乗（世界の visRange2 の写し＝艦の絵と敵影の規則。暴風の雨で変わる） */
  eyeRange2: number;
  /** 衝突の危険の艦（隊の艦の添字のビット: 目で見えていて・艦首が自艇へ半角の内・距離の内）と、その一番近い艦までの m（無ければ NaN） */
  bowOnMask: number;
  bowOnM: number;
  /** その一番近い危険な艦が駆潜艇（v0.8.1 S4。us_06 のハードの隊の最後の 2 隻。2 行目の名詞。駆潜艇のいない任務はいつも偽） */
  bowOnPicket: boolean;
  /** その一番近い危険な艦の艦種の名詞（v0.8.2 S2。片道の列の任務＝us_05 だけ鍵が出る: 戦艦・重巡・駆逐艦。危険が無ければ ''。文は S4） */
  bowOnNounJa?: string;
}

/** 止まった艦と暗い岸を背にの HUD・Result の材料（v0.8.1 S2。setup.anchors の任務＝us_06 だけ鍵が出る。読み手は S4 の ui/anchor-lines・anchor-result） */
export interface AnchorTelemetry {
  /** 艦ごと（隊の先頭から。長さは止まった艦の数）の段（core/anchored-ship の ANCHOR_*）・気づいた理由（ANCHOR_REASON_*）・気づいた／動き出した世界の秒（NaN は未だ）＝世界の固定長の配列の参照（写さない） */
  stage: ArrayLike<number>;
  reason: ArrayLike<number>;
  noticedAtS: ArrayLike<number>;
  underwayAtS: ArrayLike<number>;
  noticedCount: number; // 気づいた・動き出した艦の通算（増えた時が出来事）・最寄りの浮いている艦に対して背に岸が効いている・その世界の秒の和・止まった艦へ撃った魚雷とその命中（不発を除く）
  underwayCount: number;
  backdropOn: boolean;
  backdropS: number;
  heldShots: number;
  heldHits: number;
  /** 艦ごと（上と同じ添字）の目で見えているビット（v0.8.1 S4。systems/mission-telemetry の setSighted と同じ d² ≤ visRange2・海域を出た艦は 0。HUD の「停泊していた艦が動き出した！」の材料） */
  seenMask: number;
}
