import { describe, expect, it } from 'vitest';
import enemies from '../data/enemies.json';
import type { BoatState, SeaBounds } from '../src/core/boat-motion';
import {
  combHeadingDeg,
  createShipAiState,
  edgeTurnHeadingDeg,
  isEnemyAiDataRecord,
  shipAiParamsFromData,
  steerShip,
  turnRateFor,
  updateShipAi,
  type ShipAiParams,
} from '../src/core/ship-ai';
import { createTorpedoState, launchTorpedo, type TorpedoState } from '../src/core/torpedo';
import { SeededRng } from '../src/core/rng';
import { ktToMps } from '../src/core/units';

const raw = enemies.enemies.find((e) => e.id === 'ijn_destroyer') as Record<string, unknown>;
const det = raw['detection'] as Record<string, number>;
const eva = raw['evasion'] as Record<string, number | boolean | string>;
const ram = raw['ram'] as Record<string, number | boolean>;
const patrol = raw['patrol'] as Record<string, number>;
// 回避の手順の試験は見張りの抽選を外す（Infinity＝見える距離に入った瞬間に気づく。v0.4.8 までと同じ）。抽選そのものは「見張り」の describe で試す
const P: ShipAiParams = {
  torpedoWakeDetectM: det['torpedo_wake_detect_m']!,
  wakeSpotRatePerS: Infinity,
  reactionDelayS: det['reaction_delay_s']!,
  evadeTurnRateDegS: eva['evade_turn_rate_deg_s'] as number,
  speedBoostMps: ktToMps(eva['speed_boost_kt'] as number),
  turnTowardWakes: eva['turn_toward_wakes'] as boolean,
  ramTriggerM: ram['trigger_m'] as number,
  ramEnabled: ram['enabled'] as boolean,
  ramGiveUpM: ram['give_up_m'] as number,
  ramStallS: ram['stall_s'] as number,
  ramCooldownS: ram['cooldown_s'] as number,
  ramTurnRateBonusDegS: ram['turn_rate_bonus_deg_s'] as number,
  edgeTurnMarginM: patrol['edge_turn_margin_m']!,
  turnRateDegS: raw['turn_rate_deg_s'] as number,
  accelMps2: raw['accel_mps2'] as number,
  cruiseSpeedMps: ktToMps(raw['speed_typical_kt'] as number),
  maxSpeedMps: ktToMps(raw['speed_max_kt'] as number),
};
const far = (): BoatState => ({ x: 5000, y: 5000, headingDeg: 0, speedMps: 0 });
/** 見張りの乱数（P では引かない） */
const RNG = new SeededRng(1);
const DETECT = 2500;
/** 艦から海域中央への方位（0=北、時計回り） */
const bearingOf = (b: BoatState, sea: SeaBounds): number => ((Math.atan2(sea.width / 2 - b.x, -(sea.height / 2 - b.y)) * 180) / Math.PI + 360) % 360;
/** 端の処理が邪魔しないよう広い海域。原点 (0,0) の艦は端にいるので中央寄りへずらす */
const SEA: SeaBounds = { width: 20000, height: 20000 };
const ship = (): BoatState => ({ x: 10000, y: 10000, headingDeg: 90, speedMps: P.cruiseSpeedMps });

describe('steerShip', () => {
  it('旋回率の上限で目標方位へ向き、最短側に回る', () => {
    const s = ship();
    steerShip(s, 180, P.cruiseSpeedMps, 3, 0.3, 10); // 10 秒で 30°
    expect(s.headingDeg).toBeCloseTo(120, 9);
    const t = { x: 0, y: 0, headingDeg: 10, speedMps: 5 };
    steerShip(t, 350, 5, 3, 0.3, 1); // -20° が最短 → 7°
    expect(t.headingDeg).toBeCloseTo(7, 9);
  });
  it('目標方位に達したら止まり、速度は加速度で近づく', () => {
    const s = ship();
    steerShip(s, 93, P.cruiseSpeedMps + 10, 3, 0.3, 5); // 15° 回れるが 3° で止まる。速度 +1.5
    expect(s.headingDeg).toBeCloseTo(93, 9);
    expect(s.speedMps).toBeCloseTo(P.cruiseSpeedMps + 1.5, 9);
  });
  it('方位 90 で東へ進む', () => {
    const s = ship();
    steerShip(s, 90, P.cruiseSpeedMps, 3, 0.3, 2);
    expect(s.x).toBeCloseTo(10000 + P.cruiseSpeedMps * 2, 9);
    expect(s.y).toBeCloseTo(10000, 9);
  });
});

describe('combHeadingDeg', () => {
  it('雷跡の方へ艦首を向ける: 北から来る魚雷（進路 180）には 0（北）', () => {
    // 魚雷は艦の北 (dx=0, dy=-500) にいて南へ進む
    expect(combHeadingDeg(180, 0, -500, true)).toBe(0);
    // 南から来る魚雷（進路 0）には 180
    expect(combHeadingDeg(0, 0, 500, true)).toBe(180);
  });
  it('turnTowardWakes=false なら魚雷と同じ向き', () => {
    expect(combHeadingDeg(180, 0, -500, false)).toBe(180);
  });
});

describe('updateShipAi', () => {
  const torpedoAt = (x: number, y: number, heading: number): TorpedoState => {
    const t = createTorpedoState();
    launchTorpedo(t, x, y, heading, false, false, 0, 800, 25);
    t.runM = 200; // 武装済み相当（AI には無関係だが現実的に）
    return t;
  };
  it('魚雷が無ければ巡航のまま', () => {
    const ai = createShipAiState(90, P.cruiseSpeedMps);
    updateShipAi(ai, ship(), far(), DETECT, 8, [], P, SEA, 0.1, RNG);
    expect(ai.mode).toBe('cruise');
    expect(ai.desiredHeadingDeg).toBe(90);
    expect(ai.playerDetected).toBe(false);
  });
  it('雷跡を見つけても reaction_delay までは転舵しない。遅れの後に櫛で梳く方位へ', () => {
    const ai = createShipAiState(90, P.cruiseSpeedMps);
    const s = ship();
    const torps = [torpedoAt(10000, 10600, 0)]; // 南 600m から北上してくる（範囲 700m 内）
    // 0.1 秒刻みで遅れの手前までは巡航。回数で数える（0.1 の累積は浮動小数で僅かにずれるので時刻では比べない）
    const n = Math.round(P.reactionDelayS / 0.1);
    for (let i = 0; i < n - 1; i++) {
      updateShipAi(ai, s, far(), DETECT, 8, torps, P, SEA, 0.1, RNG);
      expect(ai.mode).toBe('cruise');
    }
    updateShipAi(ai, s, far(), DETECT, 8, torps, P, SEA, 0.1, RNG);
    updateShipAi(ai, s, far(), DETECT, 8, torps, P, SEA, 0.1, RNG);
    expect(ai.mode).toBe('evade');
    expect(ai.desiredHeadingDeg).toBe(180); // 南（魚雷の方）へ艦首
    expect(ai.desiredSpeedMps).toBeCloseTo(P.cruiseSpeedMps + P.speedBoostMps, 9);
    expect(turnRateFor(ai.mode, P)).toBe(P.evadeTurnRateDegS);
  });
  it('範囲外の魚雷は見ない。魚雷が消えたら巡航へ戻る', () => {
    const ai = createShipAiState(90, P.cruiseSpeedMps);
    const s = ship();
    const farTorp = [torpedoAt(10000, 10000 + P.torpedoWakeDetectM + 200, 0)]; // 見える距離（v0.5.0 から 2,000 m）の外
    for (let i = 0; i < 100; i++) updateShipAi(ai, s, far(), DETECT, 8, farTorp, P, SEA, 0.1, RNG);
    expect(ai.mode).toBe('cruise');
    const near = [torpedoAt(10000, 10600, 0)];
    for (let i = 0; i < 70; i++) updateShipAi(ai, s, far(), DETECT, 8, near, P, SEA, 0.1, RNG);
    expect(ai.mode).toBe('evade');
    near[0]!.active = false;
    updateShipAi(ai, s, far(), DETECT, 8, near, P, SEA, 0.1, RNG);
    expect(ai.mode).toBe('cruise');
    expect(ai.desiredSpeedMps).toBeCloseTo(P.cruiseSpeedMps, 9);
    expect(ai.desiredHeadingDeg).toBe(90); // 元の哨戒針路へ戻る
  });
  it('プレイヤーの発見は距離で決まり、見失っても hold 秒は警戒が続く', () => {
    const ai = createShipAiState(90, P.cruiseSpeedMps);
    const s = ship();
    const player: BoatState = { x: 12400, y: 10000, headingDeg: 0, speedMps: 0 };
    updateShipAi(ai, s, player, 2500, 8, [], P, SEA, 0.1, RNG);
    expect(ai.playerDetected).toBe(true);
    player.x = 12600; // 範囲外へ
    for (let i = 0; i < 79; i++) updateShipAi(ai, s, player, 2500, 8, [], P, SEA, 0.1, RNG);
    expect(ai.playerDetected).toBe(true);
    for (let i = 0; i < 2; i++) updateShipAi(ai, s, player, 2500, 8, [], P, SEA, 0.1, RNG);
    expect(ai.playerDetected).toBe(false);
  });
  it('発見済みで ram.trigger_m 以内ならプレイヤーへ向かって最大速力', () => {
    const ai = createShipAiState(90, P.cruiseSpeedMps);
    const s = ship();
    const player: BoatState = { x: 10000, y: 9700, headingDeg: 0, speedMps: 0 }; // 北 300m
    updateShipAi(ai, s, player, 2500, 8, [], P, SEA, 0.1, RNG);
    expect(ai.mode).toBe('ram');
    expect(ai.desiredHeadingDeg).toBeCloseTo(0, 9);
    expect(ai.desiredSpeedMps).toBeCloseTo(P.maxSpeedMps, 9);
    expect(turnRateFor('ram', P)).toBe(P.turnRateDegS + P.ramTurnRateBonusDegS);
  });
  it('向かってくる魚雷を見ている間は回避が体当たりより優先。魚雷が去れば体当たりへ', () => {
    const ai = createShipAiState(90, P.cruiseSpeedMps);
    const s = ship();
    const player: BoatState = { x: 10300, y: 10000, headingDeg: 0, speedMps: 0 };
    const torps = [torpedoAt(10000, 10600, 0)];
    updateShipAi(ai, s, player, 2500, 8, [], P, SEA, 0.1, RNG);
    expect(ai.mode).toBe('ram'); // 魚雷が無ければ体当たり
    updateShipAi(ai, s, player, 2500, 8, torps, P, SEA, 0.1, RNG);
    expect(ai.mode).toBe('cruise'); // 魚雷が見えたら反応遅れの間も突っ込まず針路を保つ
    expect(ai.desiredSpeedMps).toBeCloseTo(P.cruiseSpeedMps, 9);
    for (let i = 0; i < 70; i++) updateShipAi(ai, s, player, 2500, 8, torps, P, SEA, 0.1, RNG);
    expect(ai.mode).toBe('evade');
    torps[0]!.active = false;
    updateShipAi(ai, s, player, 2500, 8, torps, P, SEA, 0.1, RNG);
    expect(ai.mode).toBe('ram');
  });
  it('近づけないまま stall_s 経てば体当たりを諦め、cooldown_s は再開しない', () => {
    const ai = createShipAiState(90, P.cruiseSpeedMps);
    const s = ship();
    const player: BoatState = { x: 10000, y: 9800, headingDeg: 0, speedMps: 0 }; // 艦は動かさない → 距離が縮まらない
    updateShipAi(ai, s, player, 2500, 8, [], P, SEA, 0.1, RNG);
    expect(ai.mode).toBe('ram');
    const nStall = Math.round(P.ramStallS / 0.1);
    for (let i = 0; i < nStall - 1; i++) updateShipAi(ai, s, player, 2500, 8, [], P, SEA, 0.1, RNG);
    expect(ai.mode).toBe('ram');
    updateShipAi(ai, s, player, 2500, 8, [], P, SEA, 0.1, RNG);
    updateShipAi(ai, s, player, 2500, 8, [], P, SEA, 0.1, RNG);
    expect(ai.mode).toBe('cruise');
    expect(ai.desiredSpeedMps).toBeCloseTo(P.cruiseSpeedMps, 9);
    const nCool = Math.round(P.ramCooldownS / 0.1);
    for (let i = 0; i < nCool - 2; i++) updateShipAi(ai, s, player, 2500, 8, [], P, SEA, 0.1, RNG);
    expect(ai.mode).toBe('cruise');
    for (let i = 0; i < 3; i++) updateShipAi(ai, s, player, 2500, 8, [], P, SEA, 0.1, RNG);
    expect(ai.mode).toBe('ram'); // 再開（距離がまた最接近として記録され、stall を数え直す）
  });
});

describe('updateShipAi: 通り過ぎた魚雷', () => {
  it('艦から遠ざかる（通り過ぎた）魚雷は脅威と見なさず、回避を解いて巡航へ戻る', () => {
    const ai = createShipAiState(90, P.cruiseSpeedMps);
    const s = ship();
    const t = createTorpedoState();
    launchTorpedo(t, 10000, 9700, 0, false, false, 0, 800, 25); // 艦の北 300m を北へ走る（遠ざかる）
    for (let i = 0; i < 100; i++) updateShipAi(ai, s, far(), DETECT, 8, [t], P, SEA, 0.1, RNG);
    expect(ai.mode).toBe('cruise');
    expect(ai.wakeSeenForS).toBe(-1);
    // 同じ位置で南向き（艦へ向かう）なら脅威
    const u = createTorpedoState();
    launchTorpedo(u, 10000, 9700, 180, false, false, 0, 800, 25);
    for (let i = 0; i < 70; i++) updateShipAi(ai, s, far(), DETECT, 8, [u], P, SEA, 0.1, RNG);
    expect(ai.mode).toBe('evade');
    expect(ai.desiredHeadingDeg).toBe(0); // 北（魚雷の方）へ艦首
  });
});

describe('updateShipAi: 体当たりの継続と海域の端', () => {
  it('体当たりは trigger_m で始まり give_up_m まで続く（境界でモードが揺れない）', () => {
    const ai = createShipAiState(90, P.cruiseSpeedMps);
    const s = ship();
    const player: BoatState = { x: 10000, y: 9700, headingDeg: 0, speedMps: 0 };
    updateShipAi(ai, s, player, 2500, 8, [], P, SEA, 0.1, RNG);
    expect(ai.mode).toBe('ram');
    player.y = 10000 - (P.ramTriggerM + P.ramGiveUpM) / 2; // trigger と give_up の間
    updateShipAi(ai, s, player, 2500, 8, [], P, SEA, 0.1, RNG);
    expect(ai.mode).toBe('ram');
    player.y = 10000 - P.ramGiveUpM - 10;
    updateShipAi(ai, s, player, 2500, 8, [], P, SEA, 0.1, RNG);
    expect(ai.mode).toBe('cruise');
    updateShipAi(ai, s, player, 2500, 8, [], P, SEA, 0.1, RNG);
    expect(ai.mode).toBe('cruise'); // trigger の外では再開しない
  });
  it('巡航中に海域の端へ近づくと中央へ向き直す。最短側で回っても端の方を向かなければ中央の方位そのもの', () => {
    const ai = createShipAiState(135, P.cruiseSpeedMps);
    const sea: SeaBounds = { width: 6000, height: 4000 };
    // 右端から 300m（margin 700 内）、南東向き。中央 (3000,2000) は方位 ≈ 282.5°。最短側（右回り）は 180→225 と南〜南西を通るが右端（90°）は通らない
    const s: BoatState = { x: 5700, y: 2600, headingDeg: 135, speedMps: P.cruiseSpeedMps };
    updateShipAi(ai, s, far(), DETECT, 8, [], P, sea, 0.1, RNG);
    expect(ai.mode).toBe('cruise');
    expect(ai.desiredHeadingDeg).toBeCloseTo(282.5, 0);
    const inside: BoatState = { x: 3000, y: 2000, headingDeg: 90, speedMps: P.cruiseSpeedMps };
    const ai2 = createShipAiState(90, P.cruiseSpeedMps);
    updateShipAi(ai2, inside, far(), DETECT, 8, [], P, sea, 0.1, RNG);
    expect(ai2.desiredHeadingDeg).toBe(90);
  });
  it('最短側で回ると端の外向き（南端なら 180°）を通る場合は逆回りで 90° ずつ', () => {
    const sea: SeaBounds = { width: 6000, height: 4000 };
    // 南端近く、南東向き、中央は右斜め後ろ（313°、差 +174°）。右回りだと 180° を通って端へ膨らむ → 左へ 90° = 49°
    const se: BoatState = { x: 5000, y: 3880, headingDeg: 139, speedMps: P.cruiseSpeedMps };
    expect(edgeTurnHeadingDeg(se, sea, 700)).toBeCloseTo(49, 9);
    // 左へ回り終えた後（北東向き）: 中央 313° へは左回り（差 −96°）で 180° を通らない → 中央の方位
    const ne: BoatState = { x: 4900, y: 3700, headingDeg: 49, speedMps: P.cruiseSpeedMps };
    expect(edgeTurnHeadingDeg(ne, sea, 700)).toBeCloseTo(bearingOf(ne, sea), 9);
    // 南西向き（221°）で中央が左斜め後ろ（36.7°、差 +176°）: 右回りは 270→360 と西・北を通り 180° は通らない → 中央の方位
    const sw: BoatState = { x: 1600, y: 3880, headingDeg: 221, speedMps: P.cruiseSpeedMps };
    expect(edgeTurnHeadingDeg(sw, sea, 700)).toBeCloseTo(bearingOf(sw, sea), 9);
    // 余白の外なら常に中央の方位
    const mid: BoatState = { x: 3000, y: 2000, headingDeg: 0, speedMps: P.cruiseSpeedMps };
    expect(edgeTurnHeadingDeg(mid, sea, 700)).toBeCloseTo(bearingOf(mid, sea), 9);
  });
});

describe('shipAiParamsFromData', () => {
  it('enemies.json の駆逐艦から kt→m/s で読める。史実モード倍率は反応遅れを短く・転舵を速くする', () => {
    expect(isEnemyAiDataRecord(raw)).toBe(true);
    if (!isEnemyAiDataRecord(raw)) return;
    const p = shipAiParamsFromData(raw);
    expect(p.cruiseSpeedMps).toBeCloseTo(ktToMps(25), 9);
    expect(p.maxSpeedMps).toBeCloseTo(ktToMps(35), 9);
    expect(p.speedBoostMps).toBeCloseTo(ktToMps(-10), 9); // v0.5.0: 回避中は 10 kt 減速
    expect([p.torpedoWakeDetectM, p.wakeSpotRatePerS, p.reactionDelayS]).toEqual([2000, 0.2, 0.5]);
    expect(p.ramGiveUpM).toBeGreaterThan(p.ramTriggerM);
    expect(p.ramStallS).toBe(6);
    expect(p.ramCooldownS).toBe(12);
    expect(p.edgeTurnMarginM).toBe(700);
    const h = shipAiParamsFromData(raw, 1.5);
    expect(h.reactionDelayS).toBeCloseTo(p.reactionDelayS / 1.5, 9);
    expect(h.evadeTurnRateDegS).toBeCloseTo(p.evadeTurnRateDegS * 1.5, 9);
    expect(h.wakeSpotRatePerS).toBeCloseTo(p.wakeSpotRatePerS * 1.5, 9);
    // 輸送船（wake_spot_rate_per_s なし）は見える距離に入った瞬間に気づく（v0.4.8 までと同じ）
    const tr = enemies.enemies.find((e) => e.id === 'ijn_transport') as unknown;
    expect(isEnemyAiDataRecord(tr)).toBe(true);
    if (isEnemyAiDataRecord(tr)) expect(shipAiParamsFromData(tr).wakeSpotRatePerS).toBe(Infinity);
  });
  it('フィールドが欠けていれば受け付けない', () => {
    const broken = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
    delete (broken['ram'] as Record<string, unknown>)['give_up_m'];
    expect(isEnemyAiDataRecord(broken)).toBe(false);
    const zeroRate = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
    (zeroRate['detection'] as Record<string, unknown>)['wake_spot_rate_per_s'] = 0;
    expect(isEnemyAiDataRecord(zeroRate)).toBe(false);
    expect(isEnemyAiDataRecord({})).toBe(false);
  });
});

describe('updateShipAi: 見張り（v0.5.0。雷跡に気づく割合）', () => {
  const torp = (x: number, y: number): TorpedoState => {
    const t = createTorpedoState();
    launchTorpedo(t, x, y, 0, false, false, 0, 800, 25); // 北へ（艦は北にいる）
    t.runM = 200;
    return t;
  };
  const Q: ShipAiParams = { ...P, wakeSpotRatePerS: 0.2 };
  /** 艦の南 600 m の魚雷に気づくまでの実秒（0.1 秒刻み。上限 60 秒） */
  const secondsToSpot = (rng: SeededRng): number => {
    const ai = createShipAiState(90, Q.cruiseSpeedMps);
    const s = ship();
    const ts = [torp(s.x, s.y + 600)];
    for (let i = 1; i <= 600; i++) {
      updateShipAi(ai, s, far(), DETECT, 8, ts, Q, SEA, 0.1, rng);
      if (ai.wakeSpotted) return i * 0.1;
      // 艦も魚雷も動かさない（気づくまでの時間だけを見る）
    }
    return 60;
  };
  it('気づくまでの時間は平均 1 / 率（0.2 → 約 5 秒）。気づく前は反応遅れを数えず、回避しない', () => {
    const rng = new SeededRng(7);
    let sum = 0;
    const N = 400;
    for (let k = 0; k < N; k++) sum += secondsToSpot(rng);
    expect(sum / N).toBeGreaterThan(4.5);
    expect(sum / N).toBeLessThan(5.6);
    const ai = createShipAiState(90, Q.cruiseSpeedMps);
    const s = ship();
    // 気づかない乱数（常に 0.999…）なら何秒たっても巡航のまま
    const never = { next: () => 0.9999999 } as unknown as SeededRng;
    for (let i = 0; i < 300; i++) updateShipAi(ai, s, far(), DETECT, 8, [torp(s.x, s.y + 600)], Q, SEA, 0.1, never);
    expect([ai.wakeSpotted, ai.wakeSeenForS, ai.mode]).toEqual([false, -1, 'cruise']);
  });
  it('同じ seed なら同じ時刻に気づく（再生できる）。見える距離の外・遠ざかる魚雷・Infinity では乱数を引かない', () => {
    expect(secondsToSpot(new SeededRng(42))).toBe(secondsToSpot(new SeededRng(42)));
    let draws = 0;
    const counting = { next: () => (draws++, 0.5) } as unknown as SeededRng;
    const ai = createShipAiState(90, Q.cruiseSpeedMps);
    const s = ship();
    updateShipAi(ai, s, far(), DETECT, 8, [torp(s.x, s.y + Q.torpedoWakeDetectM + 100)], Q, SEA, 0.1, counting);
    const away = createTorpedoState();
    launchTorpedo(away, s.x, s.y - 300, 0, false, false, 0, 800, 25); // 艦の北 300 m を北へ＝遠ざかる
    updateShipAi(ai, s, far(), DETECT, 8, [away], Q, SEA, 0.1, counting);
    updateShipAi(createShipAiState(90, P.cruiseSpeedMps), s, far(), DETECT, 8, [torp(s.x, s.y + 600)], P, SEA, 0.1, counting);
    expect(draws).toBe(0);
  });
  it('気づいたら reaction_delay 後に回避。魚雷が無くなれば気づきを解き、次の魚雷は気づき直す', () => {
    const always = { next: () => 0 } as unknown as SeededRng;
    const ai = createShipAiState(90, Q.cruiseSpeedMps);
    const s = ship();
    const ts = [torp(s.x, s.y + 600)];
    updateShipAi(ai, s, far(), DETECT, 8, ts, Q, SEA, 0.1, always);
    expect(ai.wakeSpotted).toBe(true);
    for (let i = 0; i < Math.round(Q.reactionDelayS / 0.1); i++) updateShipAi(ai, s, far(), DETECT, 8, ts, Q, SEA, 0.1, always);
    expect(ai.mode).toBe('evade');
    expect(ai.desiredSpeedMps).toBeCloseTo(Q.cruiseSpeedMps + Q.speedBoostMps, 9); // v0.5.0: 減速
    ts[0]!.active = false;
    updateShipAi(ai, s, far(), DETECT, 8, ts, Q, SEA, 0.1, always);
    expect([ai.wakeSpotted, ai.wakeSeenForS, ai.mode]).toEqual([false, -1, 'cruise']);
  });
  it('気づく前は魚雷があっても体当たりを続ける（知らないので）。気づいたら体当たりより回避', () => {
    const ai = createShipAiState(90, Q.cruiseSpeedMps);
    const s = ship();
    const player = { x: s.x + 300, y: s.y, headingDeg: 0, speedMps: 0 };
    const never = { next: () => 0.9999999 } as unknown as SeededRng;
    const ts = [torp(s.x, s.y + 600)];
    updateShipAi(ai, s, player, 2500, 8, ts, Q, SEA, 0.1, never);
    expect(ai.mode).toBe('ram');
    const always = { next: () => 0 } as unknown as SeededRng;
    for (let i = 0; i <= Math.round(Q.reactionDelayS / 0.1); i++) updateShipAi(ai, s, player, 2500, 8, ts, Q, SEA, 0.1, always);
    expect(ai.mode).toBe('evade');
  });
});
