// 空襲下の退避（v0.6.11 S5。jp_03。spec-v0611-r2 §10.1・§10.2・§10.4）の HUD 向けの値の型と、世界のステップの間に積む出来事（EvacFeed）。
// t.evac は systems/telemetry-create が 1 回だけ作り（initEvacTelemetry）、systems/evac-telemetry が毎フレーム中身だけ書き換える（§7: 確保しない）。文と行の決めは ui/evac-lines。
// EvacFeed は systems/world-evac が持ち、座席の hooks（沈没・交代・全滅・座席へ入れた）と段 5 の後（予告・予告し直し・見失い・陰の発見・決着）にステップごとに積み、
// systems/evac-telemetry がフレームごとに読んで消す（フレームに固定ステップが 0 や 2 つあっても出来事を落とさない。plan.ev* は段 5 の頭で毎ステップ消える）。
// 世界と模擬の突き合わせ（world-vs-sim）が比べる物（sq・plan・座席）は書き換えない。Phaser 非依存・乱数なし。
import { evacSurvivors, type EvacBoat, type EvacSquadron } from './evac-squadron';

// ---------- 出来事（2 行目に EVAC_EVENT_SHOW_S だけ出す。上ほど重い＝新しい出来事は同じか重ければ今の出来事に替わる） ----------
export const EVE_NONE = 0;
/** 機銃を初めて撃った（1 回だけ。「機銃は僚艇も撃つ」） */
export const EVE_GUN = 1;
/** 操作中の隊が隠れた */
export const EVE_HIDDEN = 2;
/** 陰で見つかった隊（予告の陰の発見・閃光） */
export const EVE_FOUND = 3;
/** 港の空襲の機を撃墜（arms の EV_DOWN_EVAC） */
export const EVE_DOWN = 4;
/** 艇の沈没（EVS_* の 4 つ） */
export const EVE_SINK = 5;
/** 狙った隊が隠れて編隊が引き返す（始める前・途中） */
export const EVE_LOST = 6;
/** 決着（240 秒。第 1 次の空襲が去り、残存が確定） */
export const EVE_SETTLE = 7;

/**
 * 沈没の種類（重い順に数が大きい。1 フレームに 2 隻沈めば重い方）: 僚艇・操作していない隊長艇・座席の隊長艇（僚艇へ乗り移る）・隊の全滅・
 * 座席の隊長艇が沈んで乗り移らずに終わる（v0.6.11 S8b: 決着の後か、浮いている艇がほかに無い＝core/evac-seat の evacSinkLeader が座席を沈める）
 */
export const EVS_WINGMAN = 1;
export const EVS_LEADER = 2;
export const EVS_SEAT = 3;
export const EVS_GONE = 4;
export const EVS_SEAT_END = 5;

/** 予告の行の種類: なし・波の予告・もう一度来る編隊の予告し直し（S3b の U7） */
export const EVA_NONE = 0;
export const EVA_WAVE = 1;
export const EVA_REPASS = 2;

/** 2 行目の予告の行に並べる狙いの数の上限（同時の編隊の上限 EVAC_MAX_FLIGHTS と同じ） */
export const EVAC_ANN_MAX = 3;

/** 世界のステップの間に積む出来事（systems/world-evac が 1 つ持つ。seatSeq のほかはフレームごとに消す） */
export interface EvacFeed {
  /** 見失った編隊のビット（plan.evLost）・見つかった隊のビット（plan.evFound）・予告した波（−1）・予告し直した編隊のビット（repass.ev）・決着 */
  lost: number;
  found: number;
  wave: number;
  repass: number;
  settle: boolean;
  /** そのフレームのいちばん重い沈没（EVS_*。0 は無し）・その隊・そのとき狙われていた */
  sinkKind: number;
  sinkGroup: number;
  sinkTargeted: boolean;
  /** 座席へ入れた回数（［切替］・交代・全滅の後の自動の切替。消さない。左上の乗員の「-N」を切替で出さない＝r2 L6） */
  seatSeq: number;
  /**
   * systems/evac-telemetry の覚え（フレームをまたぐ。消さない）: 出来事の消える秒（世界の時計）・前のフレームの操作中の隊と段階（「隠れた」）・機銃の出来事を出した・
   * 見た兵装の出来事の通し番号（撃墜）・予告の行の消える秒・［切替］の先を見る並び（固定長。sq.order は世界と模擬の突き合わせが比べるので書かない）
   */
  untilS: number;
  prevControl: number;
  prevPhase: number;
  gunShown: boolean;
  armsSeq: number;
  annUntilS: number;
  /** ほかの隊を座席へ入れた（seatSeq と操作中の隊が変わった）時から EVAC_TAKE_HOLD_S の秒（引き継いだ行を予告の行より上に出す。v0.6.11 S8b） */
  takeUntilS: number;
  readonly order: Int32Array;
}

export function createEvacFeed(groups: number): EvacFeed {
  return {
    lost: 0, found: 0, wave: -1, repass: 0, settle: false, sinkKind: 0, sinkGroup: -1, sinkTargeted: false, seatSeq: 0,
    untilS: 0, prevControl: -1, prevPhase: -1, gunShown: false, armsSeq: -1, annUntilS: 0, takeUntilS: 0, order: new Int32Array(groups),
  };
}

/** フレームごとの分を消す（seatSeq は残す） */
export function clearEvacFeed(f: EvacFeed): void {
  f.lost = 0;
  f.found = 0;
  f.wave = -1;
  f.repass = 0;
  f.settle = false;
  f.sinkKind = 0;
  f.sinkGroup = -1;
  f.sinkTargeted = false;
}

/** 沈没を積む（重い方を残す。同じ重さなら後の方） */
export function feedSink(f: EvacFeed, kind: number, group: number, targeted: boolean): void {
  if (kind < f.sinkKind) return;
  f.sinkKind = kind;
  f.sinkGroup = group;
  f.sinkTargeted = targeted;
}

/**
 * 座席の hooks の onBoatSunk から（hooks は交代の前に呼ぶ＝隊長艇かは今の leader で分かる。記録は沈めた後＝残存はこの艇を除く）。
 * 座席の隊長艇で、決着の後か浮いている艇がほかに無ければ乗り移らない（evacSinkLeader と同じ条件）ので EVS_SEAT_END
 */
export function feedBoatSunk(f: EvacFeed, sq: EvacSquadron, b: EvacBoat): void {
  const g = sq.groups[b.group]!;
  const seat = b.slot === g.leader && b.group === sq.control;
  const kind = seat ? (sq.settled || evacSurvivors(sq) === 0 ? EVS_SEAT_END : EVS_SEAT) : b.slot === g.leader ? EVS_LEADER : EVS_WINGMAN;
  feedSink(f, kind, b.group, sq.targeted[b.group] !== 0);
}

/** HUD に渡す値（1 個だけ作る。evac の無い任務は enabled false・配列は長さ 0） */
export interface EvacTelemetry {
  enabled: boolean;
  /** 出撃のときに 1 回: 隊と隠れ場所の呼び名（data の label_ja）・隠れ場所が陰か・隻数（18）・ノルマ・史実の残存・決着の秒・予告から始まるまでの秒・来る方角（8 方位）・§2 の 4 機の機数（来ない夜は 0） */
  groupLabels: readonly string[];
  shelterLabels: readonly string[];
  shelterCover: readonly boolean[];
  total: number;
  quota: number;
  historical: number;
  durationS: number;
  leadS: number;
  fromJa: string;
  dawnPlanes: number;
  /** 毎フレーム: 操作中の隊・latch（SW_*）・段階（G_*）・取った隠れ場所（−1）・浮いている隻数・上げ終えた隻数・レールで上げている（−1 でない）・札（EVAC_HINT_*）とその隠れ場所・決着の後 */
  control: number;
  latch: number;
  phase: number;
  shelter: number;
  afloat: number;
  upCount: number;
  hauling: boolean;
  hint: number;
  hintShelter: number;
  /** 札の隠れ場所の空き枠（「満杯（空き 1 ・ …）」） */
  hintFree: number;
  settled: boolean;
  /** 全艇が隠れて 240 秒を待たずに決着した（v0.6.11 IP1 の U8。core/evac-early）・レールの上の艇の進み（整数の %。上げていなければ −1。IP1 の U9） */
  early: boolean;
  haulPct: number;
  /** 全艇が隠れて空も空いたが陰に隠れた隊があり予告が残る間は、最後の波の番号（1 始まり。それ以外は 0。IP1 の案 B。2 行目の待機の行が早く終わらない訳を言う） */
  coverHold: number;
  /** 残存（18 中・座席を含む）・隠れている艇（上げ終えた艇と隠れた隊の艇）・操作中の隊の 3 隻の HP（座席は座席の HP。沈んだ艇は −1） */
  survivors: number;
  hiddenBoats: number;
  readonly hp: Float64Array;
  /** 次の波の予告までの秒（最後の波の後は NaN）・決着までの秒・［切替］で移る隊（−1 は灰色）・座席へ入れた回数（EvacFeed の写し）・ほかの隊を座席へ入れてから EVAC_TAKE_HOLD_S の内（S8b） */
  nextWaveS: number;
  leftS: number;
  nextSwitch: number;
  seatSeq: number;
  takeHold: boolean;
  /** 近い隠れ場所（決着の前は空き枠 ≥ 浮いている隻数・見つかった陰でない。決着の後はどれでも。−1 は無し）・空き・輪の縁までの m・座席からの相対位置 m（端の矢印。要らない段階は NaN） */
  near: number;
  nearFree: number;
  nearEdgeM: number;
  nearDx: number;
  nearDy: number;
  /**
   * 予告の行（EVA_*。予告から始まるまで）・予告の通し番号（中央の帯）・その波（0 始まり）・機数（波の予告は 1 編隊の機数、予告し直しは戻ってくる機の和）・波の編隊の数・
   * 狙い（隊の番号。EVAC_ANN_MAX まで）・その編隊の撃墜されていない機の数・その数・目標の無い編隊の数・
   * 狙った隊がいま隠れている（始める時に見失う）狙いのビット（i 番目の狙い。v0.6.11 S8b: 入っている・上げている途中に狙われて、始まる前に隠れた隊）
   */
  annKind: number;
  annSeq: number;
  annWave: number;
  annPlanes: number;
  annFlights: number;
  readonly annTargets: Int32Array;
  readonly annTargetPlanes: Int32Array;
  annCount: number;
  annNoTarget: number;
  annLost: number;
  /** 操作中の隊を狙う爆弾が落下中（隠れていない時だけ）・操作していない隊長艇が燃えている隊（いちばん小さい番号。−1） */
  falling: boolean;
  fireGroup: number;
  /** 狙われている隊のビット（sq.targeted）・隊長艇の座席からの相対位置 m（全滅は NaN。端の矢印）・カメラの本当の中心の座席からの相対位置 m（無ければ NaN＝端の矢印は今までの見方） */
  targetedMask: number;
  readonly groupDx: Float64Array;
  readonly groupDy: Float64Array;
  camDx: number;
  camDy: number;
  /** 2 行目の出来事（EVE_*。出す秒を過ぎたら EVE_NONE）・通し番号・隊・数（残存・残りの機・撃てる隻数）・沈没の種類（EVS_*）か引き返す機の数・隠れ場所・そのとき狙われていた */
  event: number;
  eventSeq: number;
  eventGroup: number;
  eventN: number;
  eventSub: number;
  eventShelter: number;
  eventTargeted: boolean;
}

/** 出撃の前の既定（evac の無い任務はこのまま。systems/evac-telemetry の initEvacTelemetry が evac の任務だけ埋める） */
export function createEvacTelemetry(groups = 0): EvacTelemetry {
  return {
    enabled: false, groupLabels: [], shelterLabels: [], shelterCover: [], total: 0, quota: 0, historical: 0, durationS: 0, leadS: 0, fromJa: '', dawnPlanes: 0,
    control: 0, latch: 0, phase: 0, shelter: -1, afloat: 0, upCount: 0, hauling: false, hint: 0, hintShelter: -1, hintFree: 0, settled: false, early: false, haulPct: -1, coverHold: 0,
    survivors: 0, hiddenBoats: 0, hp: new Float64Array(3), nextWaveS: NaN, leftS: 0, nextSwitch: -1, seatSeq: 0, takeHold: false,
    near: -1, nearFree: 0, nearEdgeM: NaN, nearDx: NaN, nearDy: NaN,
    annKind: EVA_NONE, annSeq: 0, annWave: -1, annPlanes: 0, annFlights: 0, annTargets: new Int32Array(EVAC_ANN_MAX), annTargetPlanes: new Int32Array(EVAC_ANN_MAX), annCount: 0, annNoTarget: 0, annLost: 0,
    falling: false, fireGroup: -1, targetedMask: 0, groupDx: new Float64Array(groups), groupDy: new Float64Array(groups), camDx: NaN, camDy: NaN,
    event: EVE_NONE, eventSeq: 0, eventGroup: -1, eventN: 0, eventSub: 0, eventShelter: -1, eventTargeted: false,
  };
}
