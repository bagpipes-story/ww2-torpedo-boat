// 任務の流れ（docs/02 §3・§6.7、v0.3.0）: 帰投地点の輪、「帰投せよ」の呼びかけ、終了理由の判定。Phaser 非依存、確保しない。
// 任務は撃沈・撃ち尽くしでは終わらず、帰投地点の輪に入ったときに「帰投」で終わる。燃料 0 で止まれば「漂流」。
// 夜明け（duration_s）は終わりではなく状態（v0.6.1）。終わるのは帰投・沈没・漂流・座礁と、制空権下で敵艦隊がいなくなったとき（cleared。v0.6.2 実機 1 回目）。
// 終わり際の魚雷待ち（v0.6.2 実機 1 回目）: 理由が決まっても、走っている魚雷の決着か torpedo_end_settle_s までは終えない（stepEndSettle）

/**
 * 終了理由。Result の見出しは ui/result-heading の表で付ける。bombed は夜の水上機、air_strike は夜明けの空襲（v0.6.1。dawn「夜明け — 帰投できず」は廃止）。
 * cleared は制空権下で敵艦隊がいなくなった（v0.6.2 実機 1 回目。fleet_gone_clears の任務だけ。輪に入らなくても帰投と同じに数える＝endCountsAsReturn）。pt_fire は米PT の掃射（v0.6.3。その火災で沈んでも）
 */
export type MissionEndReason = 'returned' | 'cleared' | 'adrift' | 'grounded' | 'rammed' | 'destroyed' | 'friendly_fire' | 'storm' | 'bombed' | 'air_strike' | 'barge_fire' | 'shore_battery' | 'pt_fire';

/** 帰投と同じに数える終わり（Result の returned・得点・キャンペーンの解放）: 帰投と cleared（v0.6.2 実機 1 回目。帰投は不要） */
export function endCountsAsReturn(reason: MissionEndReason): boolean {
  return reason === 'returned' || reason === 'cleared';
}

export interface ReturnPoint {
  x: number;
  y: number;
  radiusM: number;
  /** 「帰投せよ」を出す余裕: 巡航で輪の縁まで帰る燃料・秒 × この倍率を下回ったら呼ぶ（全速で帰っても間に合う 1.5） */
  callMargin: number;
  /** 輪の中で走っている魚雷の決着を待つ最大実秒（命中率の記録を「帰投したので外れ」で汚さない）。夜明け前の帰投だけ */
  torpedoSettleMaxS: number;
  /** 終わり際に走っている魚雷を待つ最大実秒（v0.6.2 実機 1 回目）: 自艇の沈没・cleared・漂流・座礁と、夜明け後の輪の中 */
  torpedoEndSettleS: number;
}

/** 輪の中か（距離の二乗で比較。半径ちょうどは中） */
export function insideRing(rp: ReturnPoint, x: number, y: number): boolean {
  const dx = x - rp.x;
  const dy = y - rp.y;
  return dx * dx + dy * dy <= rp.radiusM * rp.radiusM;
}

/** 輪の縁までの距離 m（中なら 0）。HUD 用に 1 フレーム 1 回だけ呼ぶ */
export function ringEdgeDistM(rp: ReturnPoint, x: number, y: number): number {
  const d = Math.hypot(x - rp.x, y - rp.y) - rp.radiusM;
  return d > 0 ? d : 0;
}

/** 呼びかけのビット。一度立ったら任務中は消えない（ラッチ） */
export const CALL_EXPENDED = 1;
export const CALL_SUNK = 2;
export const CALL_DAWN = 4;
export const CALL_FUEL = 8;

/**
 * 呼びかけのビットを更新して返す。needGal / needS は巡航で輪の縁まで直線で帰る燃料・実秒。
 * 等号は「立つ」。条件が戻ってもビットは消えない
 */
export function updateReturnCalls(
  flags: number,
  destroyerSunk: boolean,
  torpedoesExpended: boolean,
  fuelGal: number,
  needGal: number,
  timeLeftS: number,
  needS: number,
  margin: number,
): number {
  let f = flags;
  if (torpedoesExpended) f |= CALL_EXPENDED;
  if (destroyerSunk) f |= CALL_SUNK;
  if (timeLeftS <= needS * margin) f |= CALL_DAWN;
  if (fuelGal <= needGal * margin) f |= CALL_FUEL;
  return f;
}

/** 表示する理由: 立っているビットの最上位（燃料 > 夜明け > 撃沈 > 撃ち尽くし）。無ければ 0 */
export function topCall(flags: number): number {
  if (flags & CALL_FUEL) return CALL_FUEL;
  if (flags & CALL_DAWN) return CALL_DAWN;
  if (flags & CALL_SUNK) return CALL_SUNK;
  if (flags & CALL_EXPENDED) return CALL_EXPENDED;
  return 0;
}

/** 毎フレーム Scene が中身だけ書き換える判定材料 */
export interface EndCheck {
  /** 自艇が沈没演出中（完了で rammed / destroyed になるので、ここでは何も決めない） */
  boatSinking: boolean;
  atHome: boolean;
  /** 走っている魚雷か発射待ちがある */
  torpedoesRunning: boolean;
  /** 輪の中にいる間、または燃料 0 で止まっている間だけ数えた実秒（それ以外は 0） */
  waitS: number;
  /** 夜明けまでの実秒（夜明け後は 0 以下。輪の中なら魚雷を待たずに帰投する） */
  timeLeftS: number;
  /** 駆逐艦の沈没演出中（完了前）。演出は見せてから次へ */
  destroyerSinkPlaying: boolean;
  fuelEmpty: boolean;
  /** 速力帯が停止 */
  stopped: boolean;
  /** 浅瀬に座礁して止まっている（v0.3.2） */
  grounded: boolean;
  /** 制空権下で敵艦隊がいなくなった（v0.6.2 実機 1 回目。fleet_gone_clears の任務で、駆逐艦・輸送船がすべて沈み始めたか退いた）。撃沈の演出の後に cleared */
  fleetGone: boolean;
}

export interface EndParams {
  torpedoSettleMaxS: number;
  /** 燃料 0 で止まってから漂流で終わるまで、座礁してから終わるまでの実秒 */
  adriftDelayS: number;
  /** 夜明け後に輪の中で魚雷を待つ最大実秒（v0.6.2 実機 1 回目。torpedo_end_settle_s） */
  endSettleS: number;
}

/**
 * 終了理由を決める。null なら続行。
 * 1 自艇が沈没中 → null、2 輪の中で魚雷が無い（または待ち切った: 夜明け前は torpedoSettleMaxS、夜明け後は endSettleS。v0.6.2 実機 1 回目までは夜明け後は待たなかった）→ returned、
 * 2' 輪の中なら他の理由では終わらない（魚雷待ちの間に燃料が尽きても漂流にしない。レビューで判明）、2'' 座礁していれば adriftDelayS 後に grounded、3 撃沈演出中 → null、
 * 3' 制空権下で敵艦隊がいない → cleared（v0.6.2 実機 1 回目。夜明けの前でも後でも）、4 燃料 0 で止まって adriftDelayS → adrift（夜明け後も同じ）。
 * 夜明けそのものでは終わらない（v0.6.1）。時間の打ち切りは置かない: 敵の制空下は空襲の波、どの任務も止まっていれば燃料が尽きて漂流で終わる。
 * returned 以外の理由は、この後 stepEndSettle が走っている魚雷を待ってから終える
 */
export function decideMissionEnd(c: EndCheck, p: EndParams): MissionEndReason | null {
  if (c.boatSinking) return null;
  if (c.atHome && (!c.torpedoesRunning || c.waitS >= (c.timeLeftS > 0 ? p.torpedoSettleMaxS : p.endSettleS))) return 'returned';
  if (c.atHome) return null;
  if (c.grounded) return c.waitS >= p.adriftDelayS ? 'grounded' : null;
  if (c.destroyerSinkPlaying) return null;
  if (c.fleetGone) return 'cleared';
  if (c.fuelEmpty && c.stopped && c.waitS >= p.adriftDelayS) return 'adrift';
  return null;
}

/** 終わり際の魚雷待ちの窓（v0.6.2 実機 1 回目）。Scene の側が 1 個だけ作り（createEndSettle）、stepEndSettle が中身だけ書き換える（確保しない） */
export interface EndSettle {
  /** 窓の理由（沈没の窓は沈没の演出が終わるまで null）。窓が開いていなければ null */
  reason: MissionEndReason | null;
  /** 窓を開けた時計の実秒（開いていなければ NaN） */
  openedAtS: number;
  /** 自艇が沈み始めて開けた窓（一度立ったら消えない） */
  sinking: boolean;
}

export function createEndSettle(): EndSettle {
  return { reason: null, openedAtS: NaN, sinking: false };
}

/**
 * 終わり際の魚雷待ち（v0.6.2 実機 1 回目。docs/02 §6.7）。終えるなら理由、待つなら null。乱数なし・確保なし（同じ入力の列なら同じ結果）。
 * nowS は時計（固定ステップで進んだ実秒）、running は決着していない魚雷がある、settleS は torpedo_end_settle_s。
 * - 自艇の沈没（boatSinking）: 沈み始めた最初の呼び出しで窓を開ける（ほかの理由の窓が開いていても沈没に替える）。終えるのは、沈没の演出が終わり（sunkReason が入り）、
 *   かつ 魚雷がすべて決着したか窓を開けて settleS 経った とき（＝演出の完了と settleS の遅い方）
 * - decided が returned: すぐ終える（輪の中の待ちは decideMissionEnd が済ませている）
 * - decided がほか（cleared・adrift・grounded）: 初めて入った呼び出しで窓を開け、理由はそのまま（後で輪に入っても変えない）。魚雷がすべて決着したか settleS 経ったら終える
 */
export function stepEndSettle(s: EndSettle, nowS: number, boatSinking: boolean, sunkReason: MissionEndReason | null, decided: MissionEndReason | null, running: boolean, settleS: number): MissionEndReason | null {
  if (boatSinking) {
    if (!s.sinking) {
      s.sinking = true;
      s.openedAtS = nowS;
    }
    s.reason = sunkReason;
    if (sunkReason === null) return null;
  } else if (s.reason === null) {
    if (decided === null) return null;
    if (decided === 'returned') return decided;
    s.reason = decided;
    s.openedAtS = nowS;
  }
  return !running || nowS - s.openedAtS >= settleS ? s.reason : null;
}

/**
 * 漂流の窓を cleared に上げる（v0.6.2 実機 1 回目のレビュー）: 漂流の窓の間に走っていた魚雷が敵艦隊を沈めた（fleetGone）。decideMissionEnd と同じく
 * cleared は漂流より上で、撃沈の演出の間は待つ（戻り値 true＝このフレームは終えない）。上げたら窓は cleared が決まったときから開け直す。
 * 座礁の窓（座礁は cleared より上）・沈没の窓・ほかの理由は変えない。stepEndSettle の前に毎回呼ぶ（確保しない）
 */
export function promoteAdriftToCleared(s: EndSettle, nowS: number, boatSinking: boolean, fleetGone: boolean, sinkPlaying: boolean): boolean {
  if (s.reason !== 'adrift' || boatSinking || !fleetGone) return false;
  if (sinkPlaying) return true;
  s.reason = 'cleared';
  s.openedAtS = nowS;
  return false;
}

// ---------- data の読み出し ----------

export interface ReturnPointDataRecord {
  x_m: number;
  y_m: number;
  radius_m: number;
  call_margin: number;
  torpedo_settle_max_s: number;
  torpedo_end_settle_s: number;
}

export function isReturnPointDataRecord(v: unknown): v is ReturnPointDataRecord {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return ['x_m', 'y_m', 'radius_m', 'call_margin', 'torpedo_settle_max_s', 'torpedo_end_settle_s'].every((k) => typeof r[k] === 'number' && Number.isFinite(r[k] as number));
}

/** 値の検査込み。輪は海域の中に収まり、半径は正、余裕は 1 以上、待ちは 0 以上 */
export function returnPointFromData(r: ReturnPointDataRecord, bounds: { width: number; height: number }): ReturnPoint {
  if (!(r.radius_m > 0)) throw new Error('return_point.radius_m は正の数');
  if (!(r.call_margin >= 1)) throw new Error('return_point.call_margin は 1 以上（1 未満だと呼びかけた時点で巡航でも帰れない）');
  if (!(r.torpedo_settle_max_s >= 0)) throw new Error('return_point.torpedo_settle_max_s は 0 以上');
  if (!(r.torpedo_end_settle_s >= 0)) throw new Error('return_point.torpedo_end_settle_s は 0 以上');
  if (r.x_m - r.radius_m < 0 || r.y_m - r.radius_m < 0 || r.x_m + r.radius_m > bounds.width || r.y_m + r.radius_m > bounds.height) {
    throw new Error('return_point の輪が海域（bounds_m）からはみ出している');
  }
  return { x: r.x_m, y: r.y_m, radiusM: r.radius_m, callMargin: r.call_margin, torpedoSettleMaxS: r.torpedo_settle_max_s, torpedoEndSettleS: r.torpedo_end_settle_s };
}
