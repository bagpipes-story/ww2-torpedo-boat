// 夜の哨戒機（v0.6.7。日本ハードモード⑥・jp_02「孤島の哨戒」。docs/02 §6.8、spec-v067 §C.1）の門番の値の型と、HUD の 2 行目のキーの欄の上限。Phaser 非依存。
// 値は data から core/patrol-air-data の patrolAirParamsFromData が組む（起動時に 1 回）。欄の上限は起動時の検査（spec C.7 の C9）と ui/patrol-lines が同じ定数で詰める。
// 門番の段・状態・テレメトリ（PA_*・PatrolState・createPatrolAir・PatrolTelemetry）は v0.6.7 の S3 でここに足す。

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
