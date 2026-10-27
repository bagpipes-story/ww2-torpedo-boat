// 夜の哨戒機（v0.6.7。日本ハードモード⑥・jp_02「孤島の哨戒」。docs/02 §6.8、spec-v067 §C.1）の門番の定数・値と状態の型・確保、HUD に渡す状態の型、2 行目のキーの欄の上限。Phaser 非依存。
// 値は data から core/patrol-air-data の patrolAirParamsFromData が組む（起動時に 1 回）。欄の上限は起動時の検査（spec C.7 の C9）と ui/patrol-lines が同じ定数で詰める。
// 確保は createPatrolAir・createPatrolTelemetry だけ（任務の始めに 1 回）。段の進め方は core/patrol-air、夜の出撃（空襲の core を 1 波）は core/air-sortie。

/** 2 行目のキーの欄の上限（spec §D.2・C.7 の C9）: 秒（次の捜索・付近の残り・秒読み）・捜索の距離/100・発見の距離/100・この出撃の爆弾と命中・航跡の残り秒・失った HP/5 */
export const PA_KEY_SEC_MAX = 31;
export const PA_KEY_DIST_HM_MAX = 63;
export const PA_KEY_NEAR_HM_MAX = 31;
export const PA_KEY_BOMBS_MAX = 7;
export const PA_KEY_WAKE_S_MAX = 7;
export const PA_KEY_HP5_MAX = 31;

/** 門番の値（WorldSetup.patrolAir.gate。秒は体感秒、距離は画面の m、方位は北 0・時計回り） */
export interface PatrolParams {
  /** 捜索の機の数（夜の出撃の機数・missions_seed の patrol_air.count と同じ） */
  planes: number;
  /** 機の速さ m/体感秒（enemies.json の strike.run_speed_kt × time_scale。夜の出撃と同じ） */
  flightMps: number;
  /** 航跡（速力帯が巡航か全速）が見える距離・見えていれば発見する距離（enemies.json の patrol） */
  wakeDetectM: number;
  lockM: number;
  /** 静音で動く船体が見える距離＝自艇の視程（月から。付近の捜索の半径） */
  nearM: number;
  /** 夜の出撃の旋回の半径（これより近くでは発見しない＝受け渡しで機が跳ばない） */
  runRadiusM: number;
  /** 最初の捜索が現れる実秒・航跡の数えが届くと捜索が来る秒・定時の捜索の間・付近の捜索の秒・去る秒・秒読みの余白（risk_events.json の patrol_air.params） */
  firstPassS: number;
  wakeTriggerS: number;
  sweepGapS: number;
  orbitS: number;
  leaveS: number;
  hudStopMarginS: number;
  /** 最初の捜索の方位と、捜索ごとに回す角度（missions_seed の patrol_air） */
  fromBearingDeg: number;
  passRotateDeg: number;
  /** 最初のこの回数の捜索はレーダー（止まっていても見える） */
  radarPasses: number;
  /** 付近の捜索の方位の速さ °/体感秒（flightMps / nearM） */
  orbitDegPerS: number;
  /** 自艇の静音の上限 kt（HUD の「14 kt を超えると…」。見え方は速力帯で決め、この数は文だけ） */
  quietKt: number;
}

/** 夜の出撃の乱数の系列（seed+23。投下ごとに散布の 2 回と、自艇に当たったときの火災・機関（applyShellHit）。門番は引かない。哨戒のある任務だけで作る）。
 * +19 は夜明けの空襲、+20 は T-14 の 13mm、+22 は隼艇の 25mm（core/air-strike-state の一覧は凍結のため直さない＝重ならない検査は tests/air-strike） */
export const PATROL_AIR_SEED_OFFSET = 23;

/** 門番の段: 哨戒（機は画面にいない）→ 接近 → 付近の捜索 → 去る → 哨戒。接近か付近の捜索で発見すると出撃（空襲の core を 1 波）→ 終われば哨戒。OFF は夜明け・沈没・輪・座礁の後（戻らない） */
export const PA_HUNT = 0;
export const PA_PASS = 1;
export const PA_ORBIT = 2;
export const PA_LEAVE = 3;
export const PA_SORTIE = 4;
export const PA_OFF = 5;
/** stepPatrolAir の戻りビット: 捜索が来た・発見（呼び手が restartAirSortie）・見つけられずに去る・哨戒に戻る・OFF に入った */
export const PA_EV_PASS = 1;
export const PA_EV_FIND = 2;
export const PA_EV_LEAVE = 4;
export const PA_EV_HUNT = 8;
export const PA_EV_OFF = 16;

/** 門番の状態（任務の始めに 1 回作り、中身だけ書き換える） */
export interface PatrolState {
  phase: number;
  /** 任務の始めからの体感秒・哨戒の秒（定時の捜索まで）・航跡の数え（あれば +秒・無ければ −秒・下限 0。哨戒の間だけ）・段に入ってからの秒 */
  t: number;
  huntT: number;
  wakeAcc: number;
  phaseT: number;
  /** 始めた捜索の数（0 はレーダーの前。KPI の捜索の回数も）。今の捜索の隊形の自艇からの方位 deg（機 i はこれ + 隊形のずれ）と距離 m、レーダーか、航跡で来たか、始まりの t */
  k: number;
  bearingDeg: number;
  r: number;
  radar: boolean;
  viaWake: boolean;
  passStartT: number;
  /** 発見の瞬間の方位・距離と段（PA_PASS か PA_ORBIT。受け渡しの絵の向き） */
  findBearingDeg: number;
  findR: number;
  findPhase: number;
  /** KPI（夜の累計。Result）: 航跡で来た捜索・隠れた（付近の捜索を見つからずにやり過ごした。レーダーは除く）・発見（レーダー込み）・目の発見・最初の目の発見の t（無ければ NaN）・目の発見の予告の最短の秒（無ければ Infinity） */
  passesWake: number;
  hides: number;
  finds: number;
  findsVisual: number;
  firstVisualFindT: number;
  minVisualWarnS: number;
}

export function createPatrolAir(): PatrolState {
  return {
    phase: PA_HUNT, t: 0, huntT: 0, wakeAcc: 0, phaseT: 0, k: 0, bearingDeg: 0, r: 0, radar: false, viaWake: false, passStartT: 0,
    findBearingDeg: 0, findR: 0, findPhase: PA_PASS, passesWake: 0, hides: 0, finds: 0, findsVisual: 0, firstVisualFindT: NaN, minVisualWarnS: Infinity,
  };
}

/** HUD に渡す夜の哨戒の状態（BoatTelemetry.patrol。systems/patrol-telemetry が毎フレーム中身だけ書く。哨戒の無い任務は enabled false のまま＝HUD は何も出さない） */
export interface PatrolTelemetry {
  enabled: boolean;
  /** 門番の段（PA_*）・始めた捜索の数（0 はレーダーの前）・今の捜索（出撃中は発見した捜索）がレーダーか・航跡で来たか・今の帯で見えている（接近・付近の捜索の間だけ） */
  phase: number;
  passes: number;
  radar: boolean;
  viaWake: boolean;
  seen: boolean;
  /** 捜索の隊形の自艇からの方位 deg と距離 m（接近・付近の捜索・去る。出撃中は発見の方位と距離。哨戒の間は次に来る方位と NaN） */
  bearingDeg: number;
  distM: number;
  /** 秒読み「あと N 秒で止まれ」（接近だけ・整数）・付近の捜索の残り秒・次の捜索までの秒・航跡の数えが届くまでの秒（哨戒で数えている間だけ）。当てはまらなければ NaN */
  countdownS: number;
  orbitLeftS: number;
  nextPassS: number;
  wakeLeftS: number;
  /** 出撃の脅威（core/air-strike の AS_T_*。出撃が来ていなければ 0）・印の機（-1 は無し）・落下中の狙いが円弧・残りの爆弾 */
  threat: number;
  plane: number;
  fallingArc: boolean;
  bombsLeft: number;
  /** この出撃の分（core/air-sortie の SortieBase からの差）: 爆弾・自艇への命中・失った HP */
  sortieBombs: number;
  sortieHits: number;
  sortieDamage: number;
  /** 結果の行（0 無し・1 見つけられずに去る・2 出撃が去る）とその残り秒 */
  resultKind: number;
  resultLeftS: number;
  /** 文の数: 機の数・自艇の静音の上限 kt・航跡と発見と動く船体の距離 m */
  planes: number;
  quietKt: number;
  wakeDetectM: number;
  lockM: number;
  nearM: number;
  /** 夜の累計（Result）: 航跡で来た捜索・隠れた・発見・目の発見、再出撃が空中の爆弾で遅れたステップ（F12。0 のはず） */
  passesWake: number;
  hides: number;
  finds: number;
  findsVisual: number;
  restartDelayed: number;
}

export function createPatrolTelemetry(): PatrolTelemetry {
  return {
    enabled: false, phase: PA_HUNT, passes: 0, radar: false, viaWake: false, seen: false, bearingDeg: NaN, distM: NaN,
    countdownS: NaN, orbitLeftS: NaN, nextPassS: NaN, wakeLeftS: NaN, threat: 0, plane: -1, fallingArc: false, bombsLeft: 0,
    sortieBombs: 0, sortieHits: 0, sortieDamage: 0, resultKind: 0, resultLeftS: 0, planes: 0, quietKt: 0, wakeDetectM: 0, lockM: 0, nearM: 0,
    passesWake: 0, hides: 0, finds: 0, findsVisual: 0, restartDelayed: 0,
  };
}
