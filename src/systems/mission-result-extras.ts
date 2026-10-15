// Result の材料のうち任務ごとの部分（v0.4.4 で mission-telemetry から切り出し）: 大発掃討（v0.4.2）と僚艇（v0.4.4）。終了時に 1 回だけ作る。
import type { BargeResult, EscortResult } from '../scenes/result-scene';
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
    batteryEnabled: h.shore !== null,
    batteryInArcS: h.shore ? h.shore.state.inArcS : 0,
    batteryShots: h.shore ? h.shore.state.shots : 0,
    batteryHits: h.shore ? h.shore.state.hits : 0,
    batteryDamage: h.shore ? h.shore.state.hits * h.shore.p.hit.damage : 0,
  };
}

/** 僚艇の Result の材料（v0.4.4。任務に僚艇がいるときだけ）。被害 HP は最大 − 残り */
export function escortResult(w: MissionWorld): EscortResult {
  const e = w.escort!;
  const s = e.state;
  return { hpLeft: s.hp, hpMax: e.p.maxHp, hits: s.hits, damage: e.p.maxHp - s.hp, maxDistM: Math.sqrt(s.maxDist2), sunk: s.sunk, sunkAtS: s.sunkAtS };
}
