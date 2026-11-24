// 救助の任務の HUD・Result の材料の型（v0.8.5 S2。us_07。読み手は S4 の ui/rescue-lines・rescue-texts・rescue-result と端の印）。中身は systems/rescue-telemetry が毎フレーム写す
// （確保しない）。setup.rescue の無い任務は BoatTelemetry の rescue の鍵ごと無い。PT の隊の名（ptNames）は記録に name_short_ja のある隊（us_07 の S ボート）だけ鍵が出る。型だけ。

export interface RescueTelemetry {
  /** 任務で決まる値（作る時に 1 回）: 乗せられる数・達成の数・群の合計・フィッチとコリーの名・フィッチの輪の半径 m */
  capacity: number; objective: number; total: number; fitchJa: string; corryJa: string; fitchRingM: number;
  /** 乗せている・渡した（うち帰投で数えた）・海に残る・砲撃で失った・他艦が拾った・沈没で失った・渡した数が達成に届いた・救助の時間が終わった・拾っている・移している */
  aboard: number; delivered: number; deliveredAtReturn: number; onWater: number; lostShell: number; byOthers: number; lostSunk: number;
  objectiveReached: boolean; timeUp: boolean; picking: boolean; transferring: boolean;
  /** 出来事の通し番号（拾った 1 名ごと・移した 1 名ごと・砲撃で失った 1 名ごと）と続けて拾った・移した数（core/rescue の印の写し） */
  pickSeq: number; pickRun: number; transferSeq: number; transferRun: number; shellSeq: number;
  /** 一番近い群（残りのある群。自艇からの相対位置 m と人数。無ければ NaN と 0）・フィッチ（相対位置 m） */
  nearDx: number; nearDy: number; nearCount: number; fitchDx: number; fitchDy: number;
  /** 機雷: 見えた数・爆発した数・見えた通し番号と最後に見えた機雷の相対位置 m（無ければ NaN）・爆発の通し番号（機雷原の無い任務は 0 と NaN） */
  minesSeen: number; minesBlown: number; mineSeenSeq: number; mineDx: number; mineDy: number; mineBlowSeq: number;
  /** フィッチの砲火: 退いた S ボートの数・その通し番号・今フィッチの砲火の距離の内に居る S ボートの数（S ボートの無い任務は 0） */
  sboatRetreated: number; sboatRetreatSeq: number; sboatCovered: number;
}

/** PT の隊の HUD の名（config/pt-look-data の PtLook のうち文に要る 2 つ） */
export interface PtNames {
  nameJa: string;
  sunkJa: string;
}

/** 救助の任務の Result の材料（v0.8.5 S2。systems/rescue-result-part が終わりに 1 回。点は core/scoring の rescued＝delivered。本文の行は S4 の ui/rescue-result） */
export interface RescueResult {
  /** 群の合計・達成の数・渡した（うち帰投で数えた）・砲撃で失った・他艦が拾った・沈没で失った・乗せたまま（漂流・座礁）・海に残った（任務の終わりの時に） */
  total: number; objective: number; delivered: number; deliveredAtReturn: number; lostShell: number; byOthers: number; lostSunk: number; aboard: number; onWater: number;
  /** 機雷: 置いた・見えた・触雷（機雷原の無い任務は 0）。S ボート: 隻数・フィッチの砲火で退いた。砲台: 撃たれた・命中 */
  minesPlaced: number; minesSeen: number; minesBlown: number; sboats: number; sboatRetreated: number; batteryShots: number; batteryHits: number;
}
