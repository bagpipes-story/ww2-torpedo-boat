// 米PT の隊の「今の標的」（v0.6.4。docs/02 §6.4、spec §C.3〜C.5）: 自艇と味方の大発のうち 1 つを PtCheck の標的に差し替える（隊で 1 つの標的スロット）。
// 点数 = まだ戦う PT までの最短 d² ÷ その船体が見つかる距離²（自艇は速力帯の発見距離と 25mm の閃光の記憶の大きい方、大発は帯の発見距離）が最小の船体＝「見つけやすくて近い方」。
// 替えるのは隊が手空きのときだけ（攻撃中でなく・次の攻撃まで待っていない・追撃中の PT がいない）: 赤い線・連射の途中で標的は飛ばず、追撃の PT が slow_exit_s の間に大発へ連射を固めない。
// 今の標的が valid なら、点数が今 × keepRatio² より小さい候補がいて、前の切り替えから lockS 秒たったときだけ替える（HUD が点滅しない）。valid でなければ（沈んだ・上陸した・輪に入った）すぐ替える。
// core の段階・幾何・乱数の列は触らない（jp_05 は targets を渡さず、ここを呼ばない）。乱数なし・確保なし・平方根なし。世界（systems/pt-target）と模擬（core/convoy-sim）が同じ関数を使う。
import { PT_CHASE, ptFighting, type PtCheck, type PtHull, type PtSection } from './pt-state';
import { degToRad } from './units';

/** 選び方（data の convoy ブロック: target_keep_ratio²・target_switch_hold_s・flash_hold_s。config/convoy-data が作る） */
export interface PtTargetRule {
  /** 今の標的の点数 × keepRatio2（0.8² = 0.64）より小さい候補があるときだけ替える */
  keepRatio2: number;
  /** 替えてから次に替えるまでの最短の体感秒（今の標的が valid な間だけ効く） */
  lockS: number;
  /** 閃光の記憶: 25mm を最後に撃ってからこの体感秒の間は「撃った艇」として閃光の距離で選ぶ（ptHeldFlashM） */
  flashHoldS: number;
}

export interface PtTargetSet {
  /** [0] は自艇、[1..] は大発（valid は世界が毎ステップ書く） */
  readonly hulls: readonly PtHull[];
  /** 船体ごとの発見距離 m（月明・速力帯込み。自艇は毎ステップ、大発は出撃時に 1 回。自艇の閃光の記憶は pick の引数） */
  readonly detectM: Float64Array;
  /** 今の標的（hulls の index） */
  current: number;
  /** 替わった回数（KPI）と最後に替えた体感秒 */
  switches: number;
  lastSwitchS: number;
}

/** 出撃時に 1 回（hulls は世界が持つ配列をそのまま） */
export function createPtTargetSet(hulls: readonly PtHull[]): PtTargetSet {
  return { hulls, detectM: new Float64Array(hulls.length), current: 0, switches: 0, lastSwitchS: -Infinity };
}

/** 閃光の記憶: 最後に撃った体感秒 lastFireS から flashHoldS の内なら閃光の距離 flashRevealM、過ぎていれば 0（まだ撃っていなければ lastFireS は −Infinity） */
export function ptHeldFlashM(nowS: number, lastFireS: number, flashHoldS: number, flashRevealM: number): number {
  return nowS - lastFireS <= flashHoldS ? flashRevealM : 0;
}

/** 接触（core/pt-contact）へ渡す閃光: 自艇が標的（current 0）のときだけ撃ったステップの閃光、標的が大発なら 0（大発のまま渡すと接触が lk*・flashFirst を大発から書き、帯の外の大発が「見つかって」突撃される） */
export function ptContactFlashM(current: number, flashM: number): number {
  return current === 0 ? flashM : 0;
}

/**
 * 標的を選ぶ（hulls の index を返す。書き込みは applyPtTarget）。隊が攻撃中（owner ≥ 0）・次の攻撃まで（gapLeftS > 0）・追撃中の PT がいる間は今のまま。
 * 点数 = まだ戦う PT までの最短 d² ÷ r²（r は自艇なら max(帯の発見距離, 閃光の記憶 heldFlashM)、大発なら帯の発見距離）。最小が今の標的と違い、今が valid なら
 * 「点数 < 今 × keepRatio2」かつ「lockS 秒たった」ときだけ替える。今が valid でなければすぐ替える。候補が無ければ（valid な船体が無い・戦う PT がいない）今のまま（呼ぶ側が targetValid false を書く）
 */
export function pickPtTarget(q: PtSection, ts: PtTargetSet, heldFlashM: number, rule: PtTargetRule, nowS: number): number {
  const cur = ts.current;
  if (q.owner >= 0 || q.gapLeftS > 0) return cur;
  const boats = q.boats;
  for (let i = 0; i < boats.length; i++) if (boats[i]!.phase === PT_CHASE) return cur;
  const hulls = ts.hulls;
  let best = -1;
  let bestScore = Infinity;
  let curScore = Infinity;
  for (let k = 0; k < hulls.length; k++) {
    const h = hulls[k]!;
    if (!h.valid) continue;
    const r = k === 0 && heldFlashM > ts.detectM[0]! ? heldFlashM : ts.detectM[k]!;
    let near2 = Infinity;
    for (let i = 0; i < boats.length; i++) {
      const b = boats[i]!;
      if (!ptFighting(b.phase)) continue;
      const d2 = (h.boat.x - b.x) * (h.boat.x - b.x) + (h.boat.y - b.y) * (h.boat.y - b.y);
      if (d2 < near2) near2 = d2;
    }
    const score = near2 / (r * r);
    if (k === cur) curScore = score;
    if (score < bestScore) {
      bestScore = score;
      best = k;
    }
  }
  if (best < 0 || best === cur) return cur;
  if (hulls[cur]!.valid && (nowS - ts.lastSwitchS < rule.lockS || !(bestScore < curScore * rule.keepRatio2))) return cur;
  return best;
}

/**
 * 選んだ標的を PtCheck に書く（毎ステップ。boat の参照・当たりの半長と半幅・valid・帯の発見距離。visRange2・smoke*・dawn・timeS は共通で触らない）。
 * 替わって隊が捉えていれば、最後に見た位置・速度・艇首を新しい標的の今の値に（突撃の狙いが古い標的の位置に残らない）。detected・holdLeftS・見つかった回数は触らない
 */
export function applyPtTarget(q: PtSection, c: PtCheck, ts: PtTargetSet, i: number, nowS: number): void {
  const h = ts.hulls[i]!;
  if (i !== ts.current) {
    ts.current = i;
    ts.switches++;
    ts.lastSwitchS = nowS;
    if (q.detected) {
      const b = h.boat;
      const r = degToRad(b.headingDeg);
      q.lkX = b.x;
      q.lkY = b.y;
      q.lkVx = Math.sin(r) * b.speedMps;
      q.lkVy = -Math.cos(r) * b.speedMps;
      q.lkHeadingDeg = b.headingDeg;
      q.lkAgeS = 0;
    }
  }
  c.boat = h.boat;
  c.boatHalfLengthM = h.halfLengthM;
  c.boatHalfBeamM = h.halfBeamM;
  c.targetValid = h.valid;
  c.detectOpenM = ts.detectM[i]!;
}
