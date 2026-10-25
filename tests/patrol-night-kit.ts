// jp_02 の夜を世界の順で回す小さな台本（v0.6.7 S3 のテスト用。spec-v067 §C.6 の F3・F5・F6・F8〜F12 を core だけで確かめる）。
// 順は世界と同じ: 台本の入力 → 自艇 → 縁 → 輪 → 速力帯 → 門番 → 発見なら再出撃 → 夜の出撃（seed+23。命中は同じ系列で火災・機関）→ 火災。
// 省くもの: 夜明けの空襲（夜明けの秒で打ち切り、それまでに輪に入れば「夜明け前に帰投」）・燃料・乗員の減りの効き・命中スロー。本物の模擬と帯は S4（core/patrol-air-sim）。
// 台本は HUD と同じ材料（門番の段・レーダーか・lock_m の線までの秒・投下）だけを読む。転舵は投下の r 秒後に 90°（旋回中は逆へ、直進なら帰投の側）、0.6〜1.4 秒で帰投の向きへ戻す。
import { gameData } from '../src/config/game-data';
import { AS_EV_IMPACT, AS_EV_RELEASE, AS_INBOUND, AS_ORBIT, AS_RUN, createAirStrike, stepAirStrike, type AirStrikeCheck } from '../src/core/air-strike';
import { airSortieComplete, createSortieBase, restartAirSortie } from '../src/core/air-sortie';
import { clampToBounds, nextSpeedBand, stepBoat, type BoatInput, type BoatState, type SpeedStep } from '../src/core/boat-motion';
import { applyShellHit, createDamageState, stepDamage, type HitOutcome } from '../src/core/gunnery';
import { PATROL_AIR_SEED_OFFSET, PA_EV_FIND, PA_ORBIT, PA_PASS, PA_SORTIE, createPatrolAir, patrolLockInS, stepPatrolAir } from '../src/core/patrol-air';
import { SeededRng } from '../src/core/rng';
import { radToDeg, wrapDeg180, wrapDeg360 } from '../src/core/units';
import { buildWorldSetup } from '../src/systems/world-setup';
import { DT } from './patrol-air-kit';

export const W = buildWorldSetup(gameData, 'jp_02');
const G = W.patrolAir!.gate;
const SP = W.patrolAir!.sortie;
const EPS = 1e-6;

/** hud: 全速で輪へ・目の捜索は秒読み 0 の stopLagS 秒後に止まり付近の捜索が終わるまで止まる／quiet: 14 kt（13.6 kt）で同じ／run: 全速で止まらない／run_ring: 全速・着弾点の輪から離れる側へ／run_straight: 全速でまっすぐ（転舵しない） */
export type NightPolicy = 'hud' | 'quiet' | 'run' | 'run_ring' | 'run_straight';

export interface NightOptions {
  pol: NightPolicy;
  /** 投下から転舵までの秒（'jitter' は投下ごとに 0.35〜0.9 秒の一様） */
  reactS: number | 'jitter';
  stopLagS?: number;
}

export interface NightResult {
  homeBeforeDawn: boolean;
  sunk: boolean;
  finds: number;
  findsVisual: number;
  /** 目の発見の予告の最短の秒（目の発見が無ければ Infinity） */
  minWarnS: number;
  bombs: number;
  hits: number;
  waves: number;
  maxAttack: number;
  maxBombsAir: number;
  draws: number;
  expectedDraws: number;
  restartFalse: number;
}

class CountingRng extends SeededRng {
  draws = 0;
  override next(): number {
    this.draws++;
    return super.next();
  }
}

export function night(seed: number, o: NightOptions): NightResult {
  const bp = { ...W.boatParams };
  const d = createDamageState(W.damageParams);
  const boat: BoatState = { x: W.playerStart.x, y: W.playerStart.y, headingDeg: W.playerStart.headingDeg, speedMps: 0 };
  const input: BoatInput = { headingDeg: boat.headingDeg, speed01: 0 };
  const rng = new CountingRng((seed + PATROL_AIR_SEED_OFFSET) >>> 0);
  const polRng = new SeededRng((seed * 7919 + 1000) >>> 0);
  const holdRng = new SeededRng((seed * 7919 + 2000) >>> 0);
  const g = createPatrolAir();
  const st = createAirStrike(SP);
  const base = createSortieBase();
  const c: AirStrikeCheck = { player: boat, playerSinking: false, escort: null, escortAfloat: false, cancel: true };
  const hit: HitOutcome = { destroyed: false, startedFire: false, engineHit: false };
  const ring = W.mission.returnPoint;
  const lag = o.stopLagS ?? 0.3;
  const out: NightResult = { homeBeforeDawn: false, sunk: false, finds: 0, findsVisual: 0, minWarnS: Infinity, bombs: 0, hits: 0, waves: 0, maxAttack: 0, maxBombsAir: 0, draws: 0, expectedDraws: 0, restartFalse: 0 };
  let band: SpeedStep = 'stop';
  let hitDraws = 0;
  let dodgeAt = Number.NaN;
  let dodgeUntil = -1;
  let dodgeHeading = 0;
  let fireOutAt = Number.NaN;
  let t = 0;
  while (t < W.durationS - EPS) {
    const t0 = t;
    t += DT;
    const homeBrg = wrapDeg360(radToDeg(Math.atan2(ring.x - boat.x, -(ring.y - boat.y))));
    const sortie = g.phase === PA_SORTIE;
    let spd = o.pol === 'quiet' && !sortie ? 13.6 / 31 : 1;
    if ((o.pol === 'hud' || o.pol === 'quiet') && !g.radar && (g.phase === PA_ORBIT || (g.phase === PA_PASS && patrolLockInS(g, G) <= G.hudStopMarginS - lag))) spd = 0;
    let hdg = homeBrg;
    if (sortie && o.pol !== 'run_straight') {
      if (t0 >= dodgeAt - EPS) {
        const yaw = st.yawDegS;
        const turning = yaw !== 0 && Math.abs(yaw) >= SP.aimTurnMinDegS;
        let dir = turning ? (yaw > 0 ? -1 : 1) : wrapDeg180(homeBrg - boat.headingDeg) >= 0 ? 1 : -1;
        if (o.pol === 'run_ring' && st.lastRelease >= 0) {
          const b = st.bombs[st.lastRelease]!;
          const rel = wrapDeg180(radToDeg(Math.atan2(b.aimX - boat.x, -(b.aimY - boat.y))) - boat.headingDeg);
          if (Math.abs(rel) > 10) dir = rel > 0 ? -1 : 1;
        }
        dodgeHeading = wrapDeg360(boat.headingDeg + dir * 90);
        dodgeUntil = t0 + 0.6 + 0.8 * holdRng.next();
        dodgeAt = Number.NaN;
      }
      if (t0 < dodgeUntil - EPS) hdg = dodgeHeading;
    }
    input.speed01 = spd;
    input.headingDeg = spd === 0 && t0 >= dodgeUntil - EPS ? Number.NaN : hdg;
    if (t0 >= fireOutAt - EPS) {
      d.fireLeftS = 0; // 消火（火災の 2 秒後に長押しが終わる）
      fireOutAt = Number.NaN;
    }
    stepBoat(boat, input, bp, DT * W.timeScale);
    clampToBounds(boat, W.mission.bounds, W.boundsMarginM);
    if ((boat.x - ring.x) ** 2 + (boat.y - ring.y) ** 2 <= ring.radiusM ** 2) {
      out.homeBeforeDawn = true;
      break;
    }
    band = nextSpeedBand(band, boat.speedMps, bp);
    const ev = stepPatrolAir(g, G, band, false, airSortieComplete(st), DT);
    if (ev & PA_EV_FIND && !restartAirSortie(st, SP, boat, g.findBearingDeg, g.findR, base)) out.restartFalse++;
    c.cancel = g.phase !== PA_SORTIE;
    const e = stepAirStrike(st, SP, c, rng, DT);
    if (e & AS_EV_RELEASE && o.pol !== 'run_straight') dodgeAt = t - (st.waveT - st.lastReleaseT) + (o.reactS === 'jitter' ? 0.35 + 0.55 * polRng.next() : o.reactS);
    if (e & AS_EV_IMPACT && st.bombs[st.lastImpact]!.hitPlayer) {
      const before = rng.draws;
      applyShellHit(d, SP.bombHit, W.damageParams, rng, hit);
      hitDraws += rng.draws - before;
      if (hit.startedFire) fireOutAt = t + 2;
      if (hit.engineHit) {
        bp.speedMaxMps = W.boatParams.speedMaxMps * W.damageParams.engineSpeedFactor;
        bp.speedCruiseMps = Math.min(bp.speedCruiseMps, bp.speedMaxMps);
      }
      if (d.hp <= 0) out.sunk = true;
    }
    if (!out.sunk && stepDamage(d, W.damageParams, DT)) out.sunk = true;
    let attack = 0;
    for (const pl of st.planes) if (pl.phase === AS_INBOUND || pl.phase === AS_ORBIT || pl.phase === AS_RUN) attack++;
    let air = 0;
    for (const b of st.bombs) if (b.active) air++;
    out.maxAttack = Math.max(out.maxAttack, attack);
    out.maxBombsAir = Math.max(out.maxBombsAir, air);
    if (out.sunk) break;
  }
  out.finds = g.finds;
  out.findsVisual = g.findsVisual;
  out.minWarnS = g.minVisualWarnS;
  out.bombs = st.bombsDropped;
  out.hits = st.hitsPlayer;
  out.waves = st.waves;
  out.draws = rng.draws;
  out.expectedDraws = 2 * st.bombsDropped + hitDraws;
  return out;
}

/** seed 1〜n の夜をまとめる */
export function nights(n: number, o: NightOptions): NightResult[] {
  const rs: NightResult[] = [];
  for (let s = 1; s <= n; s++) rs.push(night(s, o));
  return rs;
}

export const share = (rs: readonly NightResult[], f: (r: NightResult) => boolean): number => rs.filter(f).length / rs.length;
