// 魚雷 1 本と目標（駆逐艦・輸送船）の走査（v0.6.2 実機 1 回目で systems/torpedo-pool から切り出し。当たり・最寄りの判定は v0.6.2 のまま）と、
// 終わり際の当たり（late hit。docs/02 §6.7）: 隊のすべてが出た（沈み始めたか夜明けに退いた）後も、沈む船体は「沈没の演出の終わり」と「沈み始めて settleS」の
// 遅い方まで魚雷が当たる（ユーザー「2本目が当たりそうなのにそれが成果に反映されないと残念」。us_02 は 1 発で沈むので、扇の 2 本目は同じ艦へ向かっている）。
// 終わり際の当たりは記録だけ（命中・得点・命中率。systems/torpedo-hits の onLateHit）。浮いている艦が 1 隻でも残っていれば数えない（魚雷は沈む船体を抜けて
// 残りの艦へ走る＝v0.6.2 のまま）。すべて出た後は艦が動かず・撃たず・魚雷を読まないので、世界（艦・乱数・AI）は変わらない。Phaser 非依存・確保しない。
import type { TorpedoState } from './torpedo';
import { pointHitsHull, type Circle } from './torpedo-solver';

/** 魚雷の結果通知（systems/torpedo-pool が出し、systems/torpedo-hits が記録する）。引数はプリミティブのみ（確保しない）。target は当たった艦の添字（v0.4.5） */
export interface TorpedoEvents {
  /** 当たった艦の添字と位置。s は魚雷の状態（不発・蛇行・発射時の距離と見越し角のずれを読む。呼び出しの中だけ有効） */
  onHit(target: number, x: number, y: number, s: TorpedoState): void;
  /** 終わり際の当たり（v0.6.2 実機 1 回目）: すべて出た後に沈む船体へ当たった。記録だけ（艦の被弾・撃沈・命中スローは無し） */
  onLateHit(target: number, x: number, y: number, s: TorpedoState): void;
  onMiss(s: TorpedoState): void;
}

/** 魚雷の目標（entities/destroyer が満たす） */
export interface TorpedoTarget {
  readonly circles: Circle[];
  readonly state: { readonly x: number; readonly y: number };
  /** もう狙えない（沈み始めたか、夜明けに退いて海域を出た。v0.6.2。当たらず、通過の判定にも使わない） */
  readonly out: boolean;
  /** 沈没の演出中か沈没済み */
  readonly sinking: boolean;
  /** 沈没の演出が終わった */
  readonly sunk: boolean;
  /** 沈み始めたときの時計（固定ステップで進んだ実秒）。沈んでいなければ NaN */
  readonly sinkStartS: number;
}

/** 走査の結果（呼び出し側が createTargetScan で 1 個だけ持ち、scanTargets が中身だけ書く） */
export interface TargetScan {
  /** 船体に当たった浮いている艦の添字（無ければ -1。武装済みのときだけ） */
  hit: number;
  /** 最も近い浮いている艦の添字（無ければ -1＝すべて出た） */
  nearest: number;
  nearestD2: number;
  /** 終わり際の当たり: すべて出た後に当たった沈む船体の添字（無ければ -1。武装済みのときだけ） */
  late: number;
}

export function createTargetScan(): TargetScan {
  return { hit: -1, nearest: -1, nearestD2: Infinity, late: -1 };
}

/** 沈む船体にまだ当たるか: 沈み始めていて、演出中か、沈み始めて settleS 未満（nowS が NaN なら false） */
export function lateHitOpen(t: TorpedoTarget, nowS: number, settleS: number): boolean {
  return t.sinking && !Number.isNaN(nowS) && (!t.sunk || nowS - t.sinkStartS < settleS);
}

/**
 * 魚雷 (x, y) の走査。hit・nearest は浮いている艦だけ（v0.6.2 と同じ: 当たりは添字の若い方、最寄りは中心の距離の二乗）。
 * late は浮いている艦が無いときだけ（lateHitOpen の船体のうち添字の若い方）。lateNowS が NaN なら終わり際の当たりは見ない
 */
export function scanTargets(out: TargetScan, x: number, y: number, armed: boolean, targets: readonly TorpedoTarget[], lateNowS: number, settleS: number): void {
  out.hit = -1;
  out.nearest = -1;
  out.nearestD2 = Infinity;
  out.late = -1;
  for (let k = 0; k < targets.length; k++) {
    const t = targets[k]!;
    if (t.out) {
      if (armed && out.late < 0 && lateHitOpen(t, lateNowS, settleS) && pointHitsHull(x, y, t.circles)) out.late = k;
      continue;
    }
    if (armed && out.hit < 0 && pointHitsHull(x, y, t.circles)) out.hit = k;
    const dx = x - t.state.x;
    const dy = y - t.state.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < out.nearestD2) {
      out.nearestD2 = d2;
      out.nearest = k;
    }
  }
  if (out.nearest >= 0) out.late = -1;
}

/**
 * 走っている魚雷を外れとして確定してよいか（systems/destroyer-step が毎ステップ）: すべて出て、どの沈む船体の終わり際の当たりの窓も閉じた
 * （＝すべて決着し、最後に沈み始めてから settleS 経った）。沈んだ艦が無ければ（すべて退いた）すべて出た時点で true（v0.6.2 と同じ）
 */
export function remainingTorpedoesSettled(targets: readonly TorpedoTarget[], nowS: number, settleS: number): boolean {
  for (let k = 0; k < targets.length; k++) {
    const t = targets[k]!;
    if (!t.out || lateHitOpen(t, nowS, settleS)) return false;
  }
  return true;
}
