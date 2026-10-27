// 世界の初期化パラメータの型（v0.6.7 S0 で world-setup.ts から移した。中身は v0.6.6 のまま。world-setup.ts が出し直す＝今までの import のため）。型だけ（JS の出力は無い）。
import type { AirStrikeParams } from '../config/dawn-data';
import type { EngineParams, EngineSetupOptions } from '../config/engine-mission-data';
import type { PrototypeMission } from '../config/game-data';
import type { GunboatParams, GunboatSetupOptions } from '../config/gunboat-mission-data';
import type { MainWeapon } from '../config/mission-data';
import type { PatrolAirSetup, PatrolAirSetupOptions } from '../config/patrol-air-mission-data';
import type { BargeParams } from '../core/barge-data';
import type { BoatParams } from '../core/boat-motion';
import type { ConvoySetup } from '../core/convoy-data';
import type { CrewEffects, CrewParams } from '../core/crew';
import type { DawnAir } from '../core/dawn-air';
import type { EscortParams } from '../core/escort';
import type { FriendlyParams } from '../core/friendly';
import type { FuelCurve } from '../core/fuel';
import type { GunBatteryParams } from '../core/gun-battery';
import type { DamageParams } from '../core/gunnery';
import type { NightRoll } from '../core/night';
import type { PtParams } from '../core/pt-data';
import type { SeaplaneParams } from '../core/seaplane-data';
import type { GroundingParams } from '../core/shallows';
import type { ShoreBatteryParams } from '../core/shore-battery';
import type { SmokeParams } from '../core/smoke';
import type { RaidParams, Sortie, SortieConditions } from '../core/sortie';
import type { StormParams } from '../core/storm';
import type { TorpedoParams, TorpedoReliability } from '../core/torpedo';
import type { VisibilityParams } from '../core/visibility';
import type { DestroyerSetup, TransportSetup } from './destroyer-setup';

export interface WorldSetup {
  mission: PrototypeMission;
  /** 自艇の出発点（?debug&barges=near で大発の隊の手前に置く。v0.4.2） */
  playerStart: { x: number; y: number; headingDeg: number };
  /** 岸（南）に接する浅瀬の北の縁 y m（「岸 N m」の矢印の行き先。浅瀬が無ければ岸の線。岸の無い任務は NaN。v0.4.2） */
  coastEdgeY: number;
  /** 主兵装（v0.4.2）。guns・none（v0.6.3）なら torpedoCapacity 0。v0.6.8 からは右下の角のボタン・「魚雷なし／大発なし」・Briefing の順だけを決め、魚雷と機銃は全任務で両方使える（config/loadout-data） */
  mainWeapon: MainWeapon;
  boatParams: BoatParams;
  /** 境界から押し戻す余白 m（表示上の船体半分）。煙も同じ距離だけ後ろに置く */
  boundsMarginM: number;
  /** 体当たり・着弾判定に使う自艇の半長・半幅 m（hit_scale 込み） */
  boatHalfLengthM: number;
  boatHalfBeamM: number;
  damageParams: DamageParams;
  timeScale: number;
  slowMoFactor: number;
  slowMoSeconds: number;
  vis: VisibilityParams;
  baseDetectM: number;
  /** 自艇の視程の二乗 */
  visRange2: number;
  /** 出発時（停止）の発見距離。最初の固定ステップが回る前のフレームでも HUD に正しく出す */
  detectRangeAtStartM: number;
  /** 夜明けまでの実秒（?debug&dawn= で上書き可） */
  durationS: number;
  fuelCurve: FuelCurve;
  /** 任務に積む燃料 gal（?debug&fuel= で上書き可、艇の容量で頭打ち） */
  fuelAllotmentGal: number;
  /** 実際に積んで出る燃料 gal（港内空襲で分散すると割当 × disperse_fuel_factor。燃料計・燃料点の 100% は fuelAllotmentGal。v0.4.0） */
  fuelStartGal: number;
  /** 出撃前の港内空襲（任務の hazards に無ければ null）と、この出撃の出撃時の状態 */
  raid: RaidParams | null;
  start: SortieConditions;
  grounding: GroundingParams;
  /** 味方機（友軍誤射）。任務に friendly_aircraft が無ければ null */
  friendly: FriendlyParams | null;
  /** 暴風の帯。任務に storm が無いか ?debug&nostorm なら null */
  storm: StormParams | null;
  /** 敵の水上機（docs/02 §6.8、v0.4.1）。任務に enemy_aircraft が無いか ?debug&noplane なら null */
  seaplane: SeaplaneParams | null;
  /** 乗員（定員と HP あたりの死傷率）と、減りが操作に効く度合い（v0.3.5） */
  crew: CrewParams;
  crewEffects: CrewEffects;
  /** 駆逐艦（任務に enemy_start があるとき）。大発の任務では null */
  destroyer: DestroyerSetup | null;
  /** 大発の隊と艇の砲（v0.4.2。任務に barges があるとき）。無ければ null */
  barges: BargeParams | null;
  guns: GunBatteryParams | null;
  ptBoats: PtParams | null; // 米PT の隊（v0.6.3。任務に pt_boats があるとき。今夜の揺らぎ込み）。無ければ null
  convoy: ConvoySetup | null; // 味方の大発の輸送隊（v0.6.4。任務に convoy があるとき。先頭の今夜のずれ込み。大発の帯・米PT の標的の規則もこの中）。無ければ null
  /** 沿岸砲（v0.4.3。任務に shore_battery があるとき。?debug&nobattery で null）。shoreBatteries は全門（v0.4.5。ハードで増える。nobattery なら []） */
  shoreBattery: ShoreBatteryParams | null;
  shoreBatteries: ShoreBatteryParams[];
  /** 難易度ハード（v0.4.5） */
  hard: boolean;
  /** 史実モード（v0.5.2。hit_rate_model.historical_mode） */
  historical: boolean;
  /** 輸送船（v0.4.7）。任務に transport が無いか ?debug&notransport なら null */
  transport: TransportSetup | null;
  /** 僚艇（v0.4.4。任務に escort があるとき。駆逐艦の任務だけ） */
  escort: EscortParams | null;
  /** 主兵装の魚雷の本数（Briefing の「魚雷 N 本」。guns・none の任務は 0）。v0.6.8 から魚雷のプールは艇が積む本数（boats.json の torpedoes.count。systems/mission-world） */
  torpedoCapacity: number;
  torpedoParams: TorpedoParams;
  torpedoReliability: TorpedoReliability;
  torpedoJitterDeg: number;
  /** 舷側オフセット m（艇幅の半分） */
  launchOffsetM: number;
  salvoIntervalS: number;
  /** 煙幕発生器が無い艇なら null */
  smokeParams: SmokeParams | null;
  /** 今夜（v0.4.6。core/night）: 揺らぎ、今夜いる危険（任務の hazards から今夜いないものを除く。Briefing の「危険」）、今夜いない危険 */
  night: NightRoll;
  hazardsTonight: string[];
  absentHazards: string[];
  /** 敵の来る位置（1 隻目の駆逐艦・大発の隊の先頭・1 隻目の米PT の出発点。Briefing の「敵 …（北西から）」） */
  enemyFrom: { x: number; y: number } | null;
  dawnAir: DawnAir; // 夜明けの空（v0.6.1。missions_seed の dawn_air。遊べる任務の規則は config/dawn-data が検査）
  airStrike: AirStrikeParams | null; // 夜明けの空襲（v0.6.1。dawn_strike の任務だけ。?debug&nostrike で null。水上機とは別に組み、今夜の absent() は通さない）
  engine?: EngineParams; // 機関の不調（v0.6.5。hazards に engine_failure がある任務＝jp_05 だけ。無い任務と engineOff では鍵ごと出ない＝setup の snapshot を変えない）
  gunboat?: GunboatParams; // 隼艇（v0.6.6。jp_01 のハードの hard.gunboat だけ。core/gunboat。無い任務・ノーマル・gunboatOff では鍵ごと出ない＝setup の snapshot を変えない）
  patrolAir?: PatrolAirSetup; // 夜の哨戒機（v0.6.7。v0_1_prototype.patrol_air のある任務＝jp_02 だけ。門番と夜の出撃の値。無い任務と patrolOff では鍵ごと出ない＝setup の snapshot を変えない）
}

/** 組み立ての上書き（v0.4.6 で位置引数からまとめた。既定はすべて「上書きなし」）。fuelGal / dawnS は NaN で data の値 */
export interface SetupOptions extends EngineSetupOptions, GunboatSetupOptions, PatrolAirSetupOptions {
  fuelGal?: number;
  dawnS?: number;
  /** 出撃（空襲の結果・難易度・夜の seed）。null なら空襲の効果なし・揺らぎなし */
  sortie?: Sortie | null;
  /** 難易度ハード（sortie があれば sortie.hard と同じでなければ例外） */
  hard?: boolean;
  /** 史実モード（v0.5.2。省けば sortie の値、sortie も無ければオフ。sortie と違えば例外） */
  historical?: boolean;
  stormOff?: boolean;
  planeOff?: boolean;
  bargesNear?: boolean;
  batteryOff?: boolean;
  /** 夜の揺らぎを掛けない（?debug&fixed。v0.4.5 と同じ世界） */
  fixedNight?: boolean;
  /** 輸送船なし（?debug&notransport。v0.4.6 と同じ世界） */
  transportOff?: boolean;
  /** 今夜いなくても出す（?debug&storm=Y・&plane・&ff） */
  forceStorm?: boolean;
  forcePlane?: boolean;
  forceFriendly?: boolean;
  /** 駆逐艦・輸送船の船体の当たり判定の倍率の上書き（?debug&shiphit=N。v0.4.8。正の数でなければ data の world.ship_hit_scale） */
  shipHitScale?: number;
  strikeOff?: boolean; // ?debug&nostrike: 夜明けの空襲なし（v0.6.1。夜明けの後も任務は続く）
}
