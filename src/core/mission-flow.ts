// 任務の流れ（docs/02 §3・§6.7、v0.3.0）: 帰投地点の輪、「帰投せよ」の呼びかけ、終了理由の判定。Phaser 非依存、確保しない。
// 任務は撃沈・撃ち尽くしでは終わらず、帰投地点の輪に入ったときに「帰投」で終わる。夜明け（duration_s）で輪の外なら「帰投できず」、燃料 0 で止まれば「漂流」。

/** 終了理由。Result の見出しは result-scene の表で付ける */
export type MissionEndReason = 'returned' | 'dawn' | 'adrift' | 'rammed' | 'destroyed';

export interface ReturnPoint {
  x: number;
  y: number;
  radiusM: number;
  /** 「帰投せよ」を出す余裕: 巡航で輪の縁まで帰る燃料・秒 × この倍率を下回ったら呼ぶ（全速で帰っても間に合う 1.5） */
  callMargin: number;
  /** 輪の中で走っている魚雷の決着を待つ最大実秒（命中率の記録を「帰投したので外れ」で汚さない） */
  torpedoSettleMaxS: number;
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
  /** 夜明けまでの実秒 */
  timeLeftS: number;
  /** 駆逐艦の沈没演出中（完了前）。演出は見せてから次へ */
  destroyerSinkPlaying: boolean;
  fuelEmpty: boolean;
  /** 速力帯が停止 */
  stopped: boolean;
}

export interface EndParams {
  torpedoSettleMaxS: number;
  /** 燃料 0 で止まってから漂流で終わるまでの実秒 */
  adriftDelayS: number;
}

/**
 * 終了理由を決める。null なら続行。
 * 1 自艇が沈没中 → null、2 輪の中で魚雷が無い（または待ち切った・夜明け）→ returned、3 撃沈演出中 → null、
 * 4 夜明け → 燃料 0 なら adrift、あれば dawn、5 燃料 0 で止まって adriftDelayS → adrift
 */
export function decideMissionEnd(c: EndCheck, p: EndParams): MissionEndReason | null {
  if (c.boatSinking) return null;
  if (c.atHome && (!c.torpedoesRunning || c.waitS >= p.torpedoSettleMaxS || c.timeLeftS <= 0)) return 'returned';
  if (c.destroyerSinkPlaying) return null;
  if (c.timeLeftS <= 0) return c.fuelEmpty ? 'adrift' : 'dawn';
  if (c.fuelEmpty && c.stopped && c.waitS >= p.adriftDelayS) return 'adrift';
  return null;
}

// ---------- data の読み出し ----------

export interface ReturnPointDataRecord {
  x_m: number;
  y_m: number;
  radius_m: number;
  call_margin: number;
  torpedo_settle_max_s: number;
}

export function isReturnPointDataRecord(v: unknown): v is ReturnPointDataRecord {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return ['x_m', 'y_m', 'radius_m', 'call_margin', 'torpedo_settle_max_s'].every((k) => typeof r[k] === 'number' && Number.isFinite(r[k] as number));
}

/** 値の検査込み。輪は海域の中に収まり、半径は正、余裕は 1 以上、待ちは 0 以上 */
export function returnPointFromData(r: ReturnPointDataRecord, bounds: { width: number; height: number }): ReturnPoint {
  if (!(r.radius_m > 0)) throw new Error('return_point.radius_m は正の数');
  if (!(r.call_margin >= 1)) throw new Error('return_point.call_margin は 1 以上（1 未満だと呼びかけた時点で巡航でも帰れない）');
  if (!(r.torpedo_settle_max_s >= 0)) throw new Error('return_point.torpedo_settle_max_s は 0 以上');
  if (r.x_m - r.radius_m < 0 || r.y_m - r.radius_m < 0 || r.x_m + r.radius_m > bounds.width || r.y_m + r.radius_m > bounds.height) {
    throw new Error('return_point の輪が海域（bounds_m）からはみ出している');
  }
  return { x: r.x_m, y: r.y_m, radiusM: r.radius_m, callMargin: r.call_margin, torpedoSettleMaxS: r.torpedo_settle_max_s };
}
