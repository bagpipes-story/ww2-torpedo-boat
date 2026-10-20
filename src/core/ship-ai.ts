// 駆逐艦の操舵と v0.2 の AI（docs/02 §6.4）。Phaser 非依存、毎ステップ確保しない。
// 行動: 巡航（海域の端が近づけば中央へ向き直す）→ 雷跡に気づいたら reaction_delay 後に雷跡と平行に転舵して「櫛で梳く」→ プレイヤーを発見し近ければ体当たり。
// 雷跡に気づく（v0.5.0）: 見える距離（torpedo_wake_detect_m）に向かってくる魚雷がある間、見張りが実時間 1 秒あたり wake_spot_rate_per_s の割合で気づく
// （乱数は 1 ステップ 1 回、気づくまで。遠くから撃つほど気づかれる時間が長い＝距離で命中率が下がる。docs/02 §6.3）。
// 夜明けに退く（v0.6.2）: retiring が立った艦は退く向きへ全速（体当たりと端での向き直しはしない。見た雷跡の回避は続ける）。立てるのは夜明けのラッチだけ（startRetire）。
// 時間の単位: reaction_delay_s と detect_hold_s は実時間秒（プレイヤーの体感に合わせる）。旋回率・加速度・速度は time_scale 込みの dt で積分する。
import type { BoatState, SeaBounds } from './boat-motion';
import type { SeededRng } from './rng';
import type { TorpedoState } from './torpedo';
import { clamp, degToRad, wrapDeg180, wrapDeg360 } from './units';

// data の読み出し（v0.5.0 で ship-ai-data.ts に分けた。300 行を超えたため。import 先はこれまでどおり ship-ai でよい）
export { isEnemyAiDataRecord, shipAiParamsFromData, type EnemyAiDataRecord } from './ship-ai-data';

export type ShipAiMode = 'cruise' | 'evade' | 'ram' | 'retire';

/** 見張りの乱数の系列（出撃の seed + 17。v0.5.0。seed〜seed+9 は魚雷・砲撃・掃射・暴風・空襲・水上機・大発・艇の砲・沿岸砲、seed+16 は今夜の揺らぎ） */
export const LOOKOUT_SEED_OFFSET = 17;

export interface ShipAiParams {
  /** 魚雷（雷跡）が見える距離 m（この中の向かってくる魚雷に見張りが気づきうる） */
  torpedoWakeDetectM: number;
  /** 見張りが雷跡に気づく割合（実時間 1 秒あたり。v0.5.0）。Infinity なら見える距離に入った瞬間に気づく（v0.4.8 までと同じ。乱数を引かない） */
  wakeSpotRatePerS: number;
  /** 見つけてから転舵を始めるまでの実時間秒 */
  reactionDelayS: number;
  /** 回避時の転舵率 deg/s（通常の turn_rate より優先） */
  evadeTurnRateDegS: number;
  /** 回避・体当たり時の増速 m/s */
  speedBoostMps: number;
  /** 雷跡の方へ艦首を向ける（true）か、同じ向きに逃げる（false） */
  turnTowardWakes: boolean;
  /** 体当たりを狙い始める距離 m（発見済みのとき） */
  ramTriggerM: number;
  ramEnabled: boolean;
  /** 体当たりを諦める距離 m（trigger_m より大きくして境界でモードが揺れないようにする） */
  ramGiveUpM: number;
  /** 体当たり中、最接近距離が更新されないままこの実時間秒が経てば諦める（旋回円の内側・海域の端に押し付け・振り切られた） */
  ramStallS: number;
  /** 諦めてから体当たりを再開しない実時間秒 */
  ramCooldownS: number;
  /** 体当たり時の旋回率ボーナス deg/s */
  ramTurnRateBonusDegS: number;
  /** 巡航中、海域の端からこの距離に入ったら中央へ向き直す m（旋回半径 + 境界余白より大きくする） */
  edgeTurnMarginM: number;
  /** 通常の旋回率 deg/s と加減速 m/s² */
  turnRateDegS: number;
  accelMps2: number;
  /** 巡航速度と最大速度 m/s */
  cruiseSpeedMps: number;
  maxSpeedMps: number;
}

export interface ShipAiState {
  mode: ShipAiMode;
  desiredHeadingDeg: number;
  /** 哨戒の針路。回避・体当たりが終わればここへ戻る（端での向き直しで更新される） */
  patrolHeadingDeg: number;
  desiredSpeedMps: number;
  /** 雷跡に気づいてからの経過（実時間秒）。-1 は気づいていない */
  wakeSeenForS: number;
  /** 見張りが向かってくる雷跡に気づいている（v0.5.0。向かってくる魚雷が見える距離から無くなれば解く） */
  wakeSpotted: boolean;
  /** 直近に見た魚雷の進路（回避方位の計算用） */
  seenTorpedoHeadingDeg: number;
  /** 直近に見た魚雷の相対位置（雷跡の方へ向くか決める用） */
  seenTorpedoDx: number;
  seenTorpedoDy: number;
  /** プレイヤーを発見している */
  playerDetected: boolean;
  /** 見失ってから警戒を解くまでの残り秒 */
  detectHoldLeftS: number;
  /** 体当たり中の最接近距離の二乗と、それが更新されていない実時間秒 */
  ramClosestD2: number;
  ramStalledS: number;
  /** 体当たりを諦めてからの再開禁止の残り秒 */
  ramCooldownLeftS: number;
  /** 夜明けに退いている（v0.6.2。一度立ったら任務中は消えない）と、その向き（0=北、時計回り） */
  retiring: boolean;
  retireHeadingDeg: number;
}

export function createShipAiState(headingDeg: number, cruiseSpeedMps: number): ShipAiState {
  return {
    mode: 'cruise',
    desiredHeadingDeg: headingDeg,
    patrolHeadingDeg: headingDeg,
    desiredSpeedMps: cruiseSpeedMps,
    wakeSeenForS: -1,
    wakeSpotted: false,
    seenTorpedoHeadingDeg: 0,
    seenTorpedoDx: 0,
    seenTorpedoDy: 0,
    playerDetected: false,
    detectHoldLeftS: 0,
    ramClosestD2: Infinity,
    ramStalledS: 0,
    ramCooldownLeftS: 0,
    retiring: false,
    retireHeadingDeg: 0,
  };
}

/** 夜明けに退き始める（v0.6.2。夜明けのラッチで 1 回だけ。次の updateShipAi から退く向きへ全速） */
export function startRetire(ai: ShipAiState, headingDeg: number): void {
  ai.retiring = true;
  ai.retireHeadingDeg = wrapDeg360(headingDeg);
}

/**
 * 1 ステップの判断。dt は実時間秒（反応遅れと警戒解除は実時間で数える）。
 * playerDetectRangeM はこのステップでの発見距離（速力・月明・煙幕込み）。lookoutRng は雷跡に気づく抽選（seed+17。wakeSpotRatePerS が Infinity なら引かない）。
 */
export function updateShipAi(
  ai: ShipAiState,
  ship: BoatState,
  player: BoatState,
  playerDetectRangeM: number,
  detectHoldS: number,
  torpedoes: readonly TorpedoState[],
  p: ShipAiParams,
  bounds: SeaBounds,
  realDt: number,
  lookoutRng: SeededRng,
): void {
  // --- プレイヤーの発見（距離二乗で比較） ---
  const pdx = player.x - ship.x;
  const pdy = player.y - ship.y;
  const pd2 = pdx * pdx + pdy * pdy;
  if (pd2 <= playerDetectRangeM * playerDetectRangeM) {
    ai.playerDetected = true;
    ai.detectHoldLeftS = detectHoldS;
  } else if (ai.playerDetected) {
    ai.detectHoldLeftS -= realDt;
    if (ai.detectHoldLeftS <= 0) ai.playerDetected = false;
  }

  // --- 雷跡の発見（走っている魚雷の位置を見る。雷跡の点は見ない）。近づいてくる魚雷だけが脅威: 通り過ぎた・並走中の魚雷では回避を続けない ---
  const wakeR2 = p.torpedoWakeDetectM * p.torpedoWakeDetectM;
  let nearest2 = Infinity;
  for (let i = 0; i < torpedoes.length; i++) {
    const t = torpedoes[i]!;
    if (!t.active) continue;
    const dx = t.x - ship.x;
    const dy = t.y - ship.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > wakeR2 || d2 >= nearest2) continue;
    const th = degToRad(t.headingDeg);
    // 魚雷の進行方向と「魚雷→艦」ベクトルの内積が正なら艦へ向かっている
    if (Math.sin(th) * -dx + -Math.cos(th) * -dy > 0) {
      nearest2 = d2;
      ai.seenTorpedoHeadingDeg = t.headingDeg;
      ai.seenTorpedoDx = dx;
      ai.seenTorpedoDy = dy;
    }
  }
  if (nearest2 !== Infinity) {
    // 見張り（v0.5.0）: 気づくまで毎ステップ 1 回だけ抽選（このステップに気づく確率 1 − e^(−率 × 実秒)）
    if (!ai.wakeSpotted) ai.wakeSpotted = !(p.wakeSpotRatePerS < Infinity) || lookoutRng.next() < 1 - Math.exp(-p.wakeSpotRatePerS * realDt);
    if (ai.wakeSpotted) ai.wakeSeenForS = (ai.wakeSeenForS < 0 ? 0 : ai.wakeSeenForS) + realDt;
  } else {
    // 向かってくる魚雷が無くなれば（消えた・通り過ぎた）回避を解き、巡航へ戻る。次の魚雷は気づき直す
    ai.wakeSpotted = false;
    ai.wakeSeenForS = -1;
  }
  if (ai.ramCooldownLeftS > 0) ai.ramCooldownLeftS -= realDt;

  // --- モード決定（回避 > 退避 > 体当たり > 巡航）。向かってくる魚雷を見ている間は避けるのが先（体当たりは始めない） ---
  if (ai.wakeSeenForS >= p.reactionDelayS) {
    ai.mode = 'evade';
    ai.desiredHeadingDeg = combHeadingDeg(ai.seenTorpedoHeadingDeg, ai.seenTorpedoDx, ai.seenTorpedoDy, p.turnTowardWakes);
    ai.desiredSpeedMps = clamp(p.cruiseSpeedMps + p.speedBoostMps, 0, p.maxSpeedMps);
    return;
  }
  // 夜明けに退く（v0.6.2）: 退く向きへ全速。体当たりと端での向き直しはしない（海域の外へ抜ける。回避が終われば退く向きへ戻る）
  if (ai.retiring) {
    ai.mode = 'retire';
    ai.desiredHeadingDeg = ai.retireHeadingDeg;
    ai.desiredSpeedMps = p.maxSpeedMps;
    return;
  }
  // 体当たりは trigger_m で始め、give_up_m を超えるまで続ける。近づけないまま stall_s 経てば諦め、cooldown_s は再開しない。
  // 向かってくる魚雷に気づいている間（反応遅れの最中も）は突っ込まず針路を保つ: 至近距離の魚雷が「体当たりの転舵」で外れないように（気づく前は知らないので突っ込み続ける。v0.5.0）
  const ramRange = ai.mode === 'ram' ? p.ramGiveUpM : p.ramTriggerM;
  if (p.ramEnabled && ai.playerDetected && ai.wakeSeenForS < 0 && ai.ramCooldownLeftS <= 0 && pd2 <= ramRange * ramRange) {
    if (ai.mode !== 'ram' || pd2 < ai.ramClosestD2) {
      ai.ramClosestD2 = pd2;
      ai.ramStalledS = 0;
    } else {
      ai.ramStalledS += realDt;
    }
    if (ai.ramStalledS < p.ramStallS) {
      ai.mode = 'ram';
      ai.desiredHeadingDeg = bearingDeg(ship.x, ship.y, player.x, player.y);
      ai.desiredSpeedMps = p.maxSpeedMps;
      return;
    }
    ai.ramCooldownLeftS = p.ramCooldownS;
  }
  if (ai.mode !== 'cruise') {
    ai.mode = 'cruise';
    ai.desiredSpeedMps = p.cruiseSpeedMps;
  }
  // 回避・体当たりの後は哨戒の針路へ戻る（v0.2.1 実機: 回避後の向きのままだと艇の方へ「追ってくる」ように見えた）
  ai.desiredHeadingDeg = ai.patrolHeadingDeg;
  // 海域の端が近ければ中央へ向き直す（端に張り付かない。往復の哨戒になる）。新しい向きが哨戒針路になる
  const m = p.edgeTurnMarginM;
  if (ship.x < m || ship.y < m || ship.x > bounds.width - m || ship.y > bounds.height - m) {
    ai.desiredHeadingDeg = edgeTurnHeadingDeg(ship, bounds, m);
    ai.patrolHeadingDeg = ai.desiredHeadingDeg;
  }
}

/**
 * 端での向き直しの目標方位。中央への方位を返すが、最短側で回ると「端の外向き」の方位を通過してしまう場合は、
 * 逆回りで 90° ずつ回る中間方位を返す（最短側だと旋回円の分だけ端へ膨らみ、旋回半径 ≈ 余白のときは境界に張り付いて横滑りした。レビューで判明）。
 * 角では 2 辺の内向き法線の合計（斜め）を使う。
 */
export function edgeTurnHeadingDeg(ship: BoatState, bounds: SeaBounds, marginM: number): number {
  const bearing = bearingDeg(ship.x, ship.y, bounds.width / 2, bounds.height / 2);
  let ix = 0;
  let iy = 0;
  if (ship.x < marginM) ix += 1;
  if (ship.x > bounds.width - marginM) ix -= 1;
  if (ship.y < marginM) iy += 1;
  if (ship.y > bounds.height - marginM) iy -= 1;
  if (ix === 0 && iy === 0) return bearing;
  const diff = wrapDeg180(bearing - ship.headingDeg);
  if (diff === 0) return bearing;
  const sign = diff > 0 ? 1 : -1;
  // 端の外向きの方位（内向き法線の反対。bearingDeg の規約で (dx, dy) = (-ix, -iy)）
  const outward = wrapDeg360((Math.atan2(-ix, iy) * 180) / Math.PI);
  const toOutward = wrapDeg360((outward - ship.headingDeg) * sign);
  if (toOutward < Math.abs(diff)) return wrapDeg360(ship.headingDeg - sign * 90);
  return bearing;
}

/** 点 (x, y) から (tx, ty) への方位（0=北、時計回り） */
export function bearingDeg(x: number, y: number, tx: number, ty: number): number {
  return wrapDeg360((Math.atan2(tx - x, -(ty - y)) * 180) / Math.PI);
}

/**
 * 「櫛で梳く」方位: 魚雷の進路と平行な 2 方位（同方向／正反対）のうち、
 * turnTowardWakes なら雷跡（魚雷のいる側）へ艦首を向ける方、そうでなければ魚雷と同じ向き。
 */
export function combHeadingDeg(torpedoHeadingDeg: number, torpedoDx: number, torpedoDy: number, turnTowardWakes: boolean): number {
  const same = wrapDeg360(torpedoHeadingDeg);
  const reciprocal = wrapDeg360(torpedoHeadingDeg + 180);
  if (!turnTowardWakes) return same;
  // 魚雷のいる方位
  const bearing = wrapDeg360((Math.atan2(torpedoDx, -torpedoDy) * 180) / Math.PI);
  const dSame = Math.abs(wrapDeg180(bearing - same));
  const dRecip = Math.abs(wrapDeg180(bearing - reciprocal));
  return dSame <= dRecip ? same : reciprocal;
}

/**
 * 艦の操舵: 目標方位へ旋回率の上限で向き、目標速度へ加速度で近づき、船首方向へ進む。dt は time_scale 込みの秒。
 */
export function steerShip(ship: BoatState, desiredHeadingDeg: number, desiredSpeedMps: number, turnRateDegS: number, accelMps2: number, dt: number): void {
  const diff = wrapDeg180(desiredHeadingDeg - ship.headingDeg);
  const maxTurn = turnRateDegS * dt;
  const turn = clamp(diff, -maxTurn, maxTurn);
  ship.headingDeg = wrapDeg360(ship.headingDeg + turn);
  if (ship.speedMps < desiredSpeedMps) ship.speedMps = Math.min(desiredSpeedMps, ship.speedMps + accelMps2 * dt);
  else if (ship.speedMps > desiredSpeedMps) ship.speedMps = Math.max(desiredSpeedMps, ship.speedMps - accelMps2 * dt);
  const h = degToRad(ship.headingDeg);
  ship.x += Math.sin(h) * ship.speedMps * dt;
  ship.y -= Math.cos(h) * ship.speedMps * dt;
}

/** モードに応じた旋回率（退避は通常の旋回率） */
export function turnRateFor(mode: ShipAiMode, p: ShipAiParams): number {
  if (mode === 'evade') return p.evadeTurnRateDegS;
  if (mode === 'ram') return p.turnRateDegS + p.ramTurnRateBonusDegS;
  return p.turnRateDegS;
}
