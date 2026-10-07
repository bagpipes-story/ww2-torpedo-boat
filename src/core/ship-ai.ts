// 駆逐艦の操舵と v0.2 の AI（docs/02 §6.4）。Phaser 非依存、毎ステップ確保しない。
// 行動: 巡航（海域の端が近づけば中央へ向き直す）→ 雷跡を見つけたら reaction_delay 後に雷跡と平行に転舵して「櫛で梳く」→ プレイヤーを発見し近ければ体当たり。
// 時間の単位: reaction_delay_s と detect_hold_s は実時間秒（プレイヤーの体感に合わせる）。旋回率・加速度・速度は time_scale 込みの dt で積分する。
import type { BoatState, SeaBounds } from './boat-motion';
import type { TorpedoState } from './torpedo';
import { clamp, degToRad, ktToMps, wrapDeg180, wrapDeg360 } from './units';

export type ShipAiMode = 'cruise' | 'evade' | 'ram';

export interface ShipAiParams {
  /** 魚雷（雷跡）を見つける距離 m */
  torpedoWakeDetectM: number;
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
  /** 雷跡を見つけてからの経過（実時間秒）。-1 は未発見 */
  wakeSeenForS: number;
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
}

export function createShipAiState(headingDeg: number, cruiseSpeedMps: number): ShipAiState {
  return {
    mode: 'cruise',
    desiredHeadingDeg: headingDeg,
    patrolHeadingDeg: headingDeg,
    desiredSpeedMps: cruiseSpeedMps,
    wakeSeenForS: -1,
    seenTorpedoHeadingDeg: 0,
    seenTorpedoDx: 0,
    seenTorpedoDy: 0,
    playerDetected: false,
    detectHoldLeftS: 0,
    ramClosestD2: Infinity,
    ramStalledS: 0,
    ramCooldownLeftS: 0,
  };
}

/**
 * 1 ステップの判断。dt は実時間秒（反応遅れと警戒解除は実時間で数える）。
 * playerDetectRangeM はこのステップでの発見距離（速力・月明・煙幕込み）。
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
    ai.wakeSeenForS = (ai.wakeSeenForS < 0 ? 0 : ai.wakeSeenForS) + realDt;
  } else if (ai.wakeSeenForS >= 0) {
    // 向かってくる魚雷が無くなれば（消えた・通り過ぎた）回避を解き、巡航へ戻る
    ai.wakeSeenForS = -1;
  }
  if (ai.ramCooldownLeftS > 0) ai.ramCooldownLeftS -= realDt;

  // --- モード決定（回避 > 体当たり > 巡航）。向かってくる魚雷を見ている間は避けるのが先（体当たりは始めない） ---
  if (ai.wakeSeenForS >= p.reactionDelayS) {
    ai.mode = 'evade';
    ai.desiredHeadingDeg = combHeadingDeg(ai.seenTorpedoHeadingDeg, ai.seenTorpedoDx, ai.seenTorpedoDy, p.turnTowardWakes);
    ai.desiredSpeedMps = clamp(p.cruiseSpeedMps + p.speedBoostMps, 0, p.maxSpeedMps);
    return;
  }
  // 体当たりは trigger_m で始め、give_up_m を超えるまで続ける。近づけないまま stall_s 経てば諦め、cooldown_s は再開しない。
  // 向かってくる魚雷が見えている間（反応遅れの最中も）は突っ込まず針路を保つ: 至近距離の魚雷が「体当たりの転舵」で外れないように
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
function bearingDeg(x: number, y: number, tx: number, ty: number): number {
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

/** モードに応じた旋回率 */
export function turnRateFor(mode: ShipAiMode, p: ShipAiParams): number {
  if (mode === 'evade') return p.evadeTurnRateDegS;
  if (mode === 'ram') return p.turnRateDegS + p.ramTurnRateBonusDegS;
  return p.turnRateDegS;
}

/** enemies.json の 1 レコードのうち AI が使う部分（docs/02 §6.4・§6.5） */
export interface EnemyAiDataRecord {
  speed_typical_kt: number;
  speed_max_kt: number;
  turn_rate_deg_s: number;
  accel_mps2: number;
  detection: { base_detect_m: number; reaction_delay_s: number; torpedo_wake_detect_m: number };
  evasion: { turn_toward_wakes: boolean; evade_turn_rate_deg_s: number; speed_boost_kt: number };
  ram: { enabled: boolean; trigger_m: number; give_up_m: number; stall_s: number; cooldown_s: number; turn_rate_bonus_deg_s: number };
  patrol: { edge_turn_margin_m: number };
}

function hasNums(o: unknown, keys: readonly string[]): o is Record<string, number> {
  if (!o || typeof o !== 'object') return false;
  const r = o as Record<string, unknown>;
  return keys.every((k) => typeof r[k] === 'number' && Number.isFinite(r[k]));
}

export function isEnemyAiDataRecord(v: unknown): v is EnemyAiDataRecord {
  if (!hasNums(v, ['speed_typical_kt', 'speed_max_kt', 'turn_rate_deg_s', 'accel_mps2'])) return false;
  const r = v as Record<string, unknown>;
  const eva = r['evasion'] as Record<string, unknown> | undefined;
  const ram = r['ram'] as Record<string, unknown> | undefined;
  return (
    hasNums(r['detection'], ['base_detect_m', 'reaction_delay_s', 'torpedo_wake_detect_m']) &&
    hasNums(eva, ['evade_turn_rate_deg_s', 'speed_boost_kt']) &&
    typeof eva?.['turn_toward_wakes'] === 'boolean' &&
    hasNums(ram, ['trigger_m', 'give_up_m', 'stall_s', 'cooldown_s', 'turn_rate_bonus_deg_s']) &&
    typeof ram?.['enabled'] === 'boolean' &&
    hasNums(r['patrol'], ['edge_turn_margin_m'])
  );
}

/** data → AI パラメータ（kt→m/s）。evasionMultiplier は史実モードの倍率（通常 1。転舵率に掛ける） */
export function shipAiParamsFromData(r: EnemyAiDataRecord, evasionMultiplier: number = 1): ShipAiParams {
  return {
    torpedoWakeDetectM: r.detection.torpedo_wake_detect_m,
    reactionDelayS: r.detection.reaction_delay_s / evasionMultiplier,
    evadeTurnRateDegS: r.evasion.evade_turn_rate_deg_s * evasionMultiplier,
    speedBoostMps: ktToMps(r.evasion.speed_boost_kt),
    turnTowardWakes: r.evasion.turn_toward_wakes,
    ramTriggerM: r.ram.trigger_m,
    ramEnabled: r.ram.enabled,
    ramGiveUpM: Math.max(r.ram.give_up_m, r.ram.trigger_m),
    ramStallS: r.ram.stall_s,
    ramCooldownS: r.ram.cooldown_s,
    ramTurnRateBonusDegS: r.ram.turn_rate_bonus_deg_s,
    edgeTurnMarginM: r.patrol.edge_turn_margin_m,
    turnRateDegS: r.turn_rate_deg_s,
    accelMps2: r.accel_mps2,
    cruiseSpeedMps: ktToMps(r.speed_typical_kt),
    maxSpeedMps: ktToMps(r.speed_max_kt),
  };
}
