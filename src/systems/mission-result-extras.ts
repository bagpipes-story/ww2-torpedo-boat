// Result の材料のうち任務ごとの部分（v0.4.4 で mission-telemetry から切り出し）: 大発掃討（v0.4.2）と僚艇（v0.4.4）、敵の水上機（v0.4.1。v0.6.1 で切り出し）、暴風（v0.3.4。v0.6.3 で切り出し）。終了時に 1 回だけ作る。
import { SP_IDLE, SP_OUT_NONE } from '../core/seaplane';
import { meanInsideKt } from '../core/storm';
import type { BargeResult, EscortResult, MissionResult } from '../scenes/result-scene';
import type { MissionWorld } from './mission-world';

/** 大発掃討の Result の材料（v0.4.2。任務に大発がいるときだけ） */
export function bargeResult(w: MissionWorld): BargeResult {
  const h = w.hunt!;
  const f = h.flotilla;
  const g = h.battery;
  return {
    enemyId: w.setup.mission.enemyId,
    total: h.p.count,
    sunk: f.sunk,
    beached: f.beached,
    quota: h.p.quota,
    shots: g.shots,
    hits: g.hits,
    firstShotM: g.firstShotM,
    firstShotBand: g.firstShotBand,
    firstDetectM: f.firstDetectM,
    flashFirst: f.flashFirst,
    killMinM: h.killMinM,
    killMaxM: h.killMaxM,
    mgHits: f.hitsOnBoat,
    mgDamage: f.hitsOnBoat * h.p.gunHit.damage,
    batteryEnabled: h.shores.length > 0,
    batteryInArcS: h.shoreInArcS,
    batteryShots: h.shoreShots,
    batteryHits: h.shoreHits,
    batteryDamage: h.shoreDamage,
  };
}

/** 僚艇の Result の材料（v0.4.4。任務に僚艇がいるときだけ）。被害 HP は最大 − 残り */
export function escortResult(w: MissionWorld): EscortResult {
  const e = w.escort!;
  const s = e.state;
  return { hpLeft: s.hp, hpMax: e.p.maxHp, hits: s.hits, damage: e.p.maxHp - s.hp, maxDistM: Math.sqrt(s.maxDist2), sunk: s.sunk, sunkAtS: s.sunkAtS };
}

/** 敵の水上機の Result の材料（v0.4.1。v0.6.1 で mission-telemetry から切り出し。中身は同じ）。水上機のいない任務は既定値 */
export type SeaplaneResultFields = Pick<
  MissionResult,
  'seaplaneEnabled' | 'seaplanePhase' | 'seaplaneOutcome' | 'seaplaneAttacked' | 'seaplaneSorties' | 'seaplaneLost' | 'seaplaneSlowReactS' | 'seaplaneFlareLitS' | 'seaplaneShellsUnderFlare' | 'seaplaneBombs' | 'seaplaneBombHits' | 'seaplaneDodgeS'
>;

export function seaplaneResultFields(w: MissionWorld): SeaplaneResultFields {
  const sp = w.seaplane ? w.seaplane.state : null;
  return {
    seaplaneEnabled: w.seaplane !== null,
    seaplanePhase: sp ? sp.phase : SP_IDLE,
    seaplaneOutcome: sp ? sp.outcome : SP_OUT_NONE,
    seaplaneAttacked: sp ? sp.attacked : false,
    seaplaneSorties: sp ? sp.sorties : 0,
    seaplaneLost: sp ? sp.lost : 0,
    seaplaneSlowReactS: sp ? sp.slowReactS : NaN,
    seaplaneFlareLitS: sp ? sp.ordnance.flare.litS : 0,
    seaplaneShellsUnderFlare: sp ? sp.ordnance.flare.shellsUnderFlare : 0,
    seaplaneBombs: sp ? sp.ordnance.bombsDropped : 0,
    seaplaneBombHits: sp ? sp.ordnance.bombsHit : 0,
    seaplaneDodgeS: sp ? sp.ordnance.bombs.map((b) => b.dodgeReactS) : [],
  };
}

/** 暴風の Result の材料（v0.3.4。v0.6.3 で mission-telemetry から切り出し。中身は同じ）。暴風のない任務は既定値 */
export type StormResultFields = Pick<MissionResult, 'stormEnabled' | 'stormSafeKt' | 'stormInsideS' | 'stormOverS' | 'stormMeanKt' | 'stormSlams' | 'stormSlamDamage'>;

export function stormResultFields(w: MissionWorld): StormResultFields {
  return {
    stormEnabled: w.storm !== null,
    stormSafeKt: w.setup.storm ? w.setup.storm.safeSpeedKt : 0,
    stormInsideS: w.storm ? w.storm.state.insideS : 0,
    stormOverS: w.storm ? w.storm.state.overS : 0,
    stormMeanKt: w.storm ? meanInsideKt(w.storm.state) : NaN,
    stormSlams: w.storm ? w.storm.state.slams : 0,
    stormSlamDamage: w.storm ? w.storm.state.slamDamage : 0,
  };
}
