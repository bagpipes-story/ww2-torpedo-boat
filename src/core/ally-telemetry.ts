// 味方の駆逐艦 卯月（v0.6.10 S6。jp_04。docs/02 §6.11、spec-v0610 part 2 の S6・リードの決定 LD3・LD4）の HUD 向けテレメトリの形。BoatTelemetry.ally（core/boat-telemetry）。
// createTelemetry が 1 回だけ作り（systems/ally-telemetry の initAllyTelemetry）、毎フレームは systems/ally-telemetry の refreshAllyTelemetry が中身だけ書く（§7: 確保しない）。
// 卯月の無い任務・?debug&noally は enabled false のまま（文もキーも前と同じ）。照らされた斉射・撃たずに去った出来事は揚陸の出来事（LandingTelemetry の eventKind の LE_LIT_*）が運ぶ。
// Phaser 非依存（型と作るだけ）。

export interface AllyTelemetry {
  /** 卯月がいる夜（jp_04 のノーマル・ハード。&noally・ほかの任務は false） */
  enabled: boolean;
  /** 艦の呼び名（data の label_ja「卯月」。2 行目の「卯月 撃退！」「卯月が照らした！」「走らせれば卯月が照らす」） */
  labelJa: string;
  /** 夜明け近しの帰投の輪の呼びかけ（data の ring_call_before_dawn。LD3: 「夜明け近し ・ 帰投の輪で揚陸を待て あと N 秒」。false なら前の文） */
  ringCall: boolean;
  /** 平常の行の末尾「・ 走らせれば卯月が照らす」を付ける夜（LD4: ノーマルだけ＝840 px に収まる。ハードは 3 方角で収まらないので付けない） */
  runHint: boolean;
  /** 米PT の隊の最後の砲の出来事（撃退・撃沈・制圧）は卯月の砲（PtSquadron.ally の手柄の eventSeq ＝ 隊の gunEventSeq。2 行目の頭「卯月 撃退！」） */
  gunEvent: boolean;
}

/** 卯月のいない形（ほかの任務・&noally・tests の中立のテレメトリ） */
export function createAllyTelemetry(): AllyTelemetry {
  return { enabled: false, labelJa: '', ringCall: false, runHint: false, gunEvent: false };
}
