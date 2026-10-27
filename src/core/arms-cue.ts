// 兵装の文の番号と HUD への受け渡し（v0.6.8。spec-v068 §3.4・§4.5）: 魚雷と機銃は全任務で両方使える。右の兵装の上の 1 行（ui/weapon-cue）が読む番号と、
// 世界（systems/arms-telemetry）が毎フレーム書く ArmsTelemetry。艦への機銃の乱数の系列 +25 もここ（tests が systems を引かずに読める。レビュー F17）。
// Phaser 非依存・何も import しない。

/** 艦への機銃の乱数の系列（seed+25。v0.6.8。駆逐艦の任務だけで作る。1 発 2 回＝core/shells の launchShell）。+24 は対空（core/aa-fire の AA_SEED_OFFSET） */
export const SHIP_GUN_SEED_OFFSET = 25;

/** 文なし */
export const CUE_NONE = 0;
/** 出来事の文（evSeq が変わったときに決まった秒だけ出す）: 狙う艦の無い魚雷（大発の下・PT の下・艦なし）と撃墜（空襲の機・水上機・哨戒機） */
export const EV_TORP_BARGE = 1;
export const EV_TORP_PT = 2;
export const EV_TORP_NOSHIP = 3;
export const EV_DOWN_STRIKE = 4;
export const EV_DOWN_SEAPLANE = 5;
export const EV_DOWN_SORTIE = 6;
/** 状態の文（機銃を押している間だけ）: 艦には効かない・対空・射界外・射程に敵なし・煙幕で見えない・弾倉交換 */
export const ST_SHIP = 10;
export const ST_AA = 11;
export const ST_ARC = 12;
export const ST_NONE = 13;
export const ST_SMOKE = 14;
export const ST_RELOAD = 15;
/** HUD だけの出来事（魚雷 0 本で魚雷ボタンを押した。世界は書かない） */
export const EV_TORP_EMPTY = 20;

/** 世界 → HUD（BoatTelemetry.arms）。値だけ（毎フレーム書き換え、確保しない） */
export interface ArmsTelemetry {
  /** 積んでいる魚雷（w.torpedoes.remaining） */
  torpedoesAboard: number;
  /** 撃てる: 積んでいる > 0・輪の外・沈み始めていない・終わりの待ちでない */
  torpedoUsable: boolean;
  /** 最後の出来事（EV_*）と数（撃墜の「残り N 機」など）と通し番号（変わったら HUD がその秒だけ出す） */
  evCode: number;
  evN: number;
  evSeq: number;
  /** 今の状態の文（ST_*。0 は無し）と数（弾倉交換の残り秒） */
  stCode: number;
  stN: number;
  /** どれかの砲が標的を持って撃っている（大発・PT・艦・対空） */
  gunFiring: boolean;
  /** v0.6.8 の道の弾倉交換の残り秒の切り上げ（自分の弾倉か借りた弾倉。無ければ 0） */
  reloadN: number;
}

export function createArmsTelemetry(): ArmsTelemetry {
  return { torpedoesAboard: 0, torpedoUsable: false, evCode: CUE_NONE, evN: 0, evSeq: 0, stCode: CUE_NONE, stN: 0, gunFiring: false, reloadN: 0 };
}
