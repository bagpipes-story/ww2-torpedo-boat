// Result の材料の型のうち任務ごとの部分（v0.6.3 で result-scene から切り出し。中身はそのまま。型だけ）。result-scene.ts が再 export する（今までの import のため）。
// v0.6.3: 米PT の記録（PtResult）を足した。実機 1 回目: T-14 の 13mm の記録（射撃・命中・撃退・撃沈・閃光が最初）と enemies.json の id。実機 2 回目: 連射と制圧の数。
import type { SpeedStep } from '../core/boat-motion';

/** 大発掃討の記録（v0.4.2）: 隻数・撃破・上陸・ノルマ、射撃の発射と命中、最初に撃った距離 m と速力帯、最初に目で気づかれた距離 m（NaN なら気づかれる前に撃った）、撃破の距離の最小・最大 m、13mm の命中数と被害 HP。実機で数値を合わせる根拠 */
export interface BargeResult {
  enemyId: string;
  total: number;
  sunk: number;
  beached: number;
  quota: number;
  shots: number;
  hits: number;
  firstShotM: number;
  firstShotBand: string;
  firstDetectM: number;
  flashFirst: boolean;
  killMinM: number;
  killMaxM: number;
  mgHits: number;
  mgDamage: number;
  /** 沿岸砲（v0.4.3）: 任務にある、射界の中にいた体感秒、砲撃・命中・被害 HP */
  batteryEnabled: boolean;
  batteryInArcS: number;
  batteryShots: number;
  batteryHits: number;
  batteryDamage: number;
}

/** 僚艇の記録（v0.4.4）: 残り HP と最大、被弾数と被害 HP、自艇から最も離れた距離 m、沈んだか（沈んだ実秒） */
export interface EscortResult {
  hpLeft: number;
  hpMax: number;
  hits: number;
  damage: number;
  maxDistM: number;
  sunk: boolean;
  sunkAtS: number;
}

/**
 * 米PT の記録（v0.6.3。spec §D.4。systems/pt-telemetry の ptResult）: 隻数・去った数（海域の外）・去っていない数（Result の「健在 N 隻」）・夜明けに去った、
 * 航過（撃った・無傷。終わる瞬間に撃っていた航過も数える）と上限（終わった航過 + まだ戦う PT の残り。撃退・撃沈で減る）、撃たれた弾・命中・1 発の HP、
 * 最初に見つかった距離 m（NaN なら見つからず）とそのときの速力帯、見失わせた回数、PT の最接近 m、予告（赤い線）から初弾までの最短秒（撃たれなければ Infinity）。data/enemies.json を合わせる根拠
 */
export interface PtResult {
  /** 米PT の enemies.json の id（撃沈の点 scoring.json の kill.points_by_enemy のキー。v0.6.3 実機 1 回目） */
  enemyId: string;
  total: number;
  out: number;
  alive: number;
  leftAtDawn: boolean;
  passes: number;
  maxPasses: number;
  firedPasses: number;
  cleanPasses: number;
  shots: number;
  hits: number;
  damagePerHit: number;
  /** 艇の最大 HP（「HP −x」の上限。沈める 1 発は残りの HP より大きいことがある） */
  hpMax: number;
  firstDetectM: number;
  firstDetectBand: SpeedStep | '';
  lostContacts: number;
  closestM: number;
  minWarnS: number;
  /**
   * T-14 の 13mm（v0.6.3 実機 1 回目。砲の無い任務は gunEnabled false で数は 0）: 撃った弾・PT への命中・撃退した PT・沈めた PT、
   * 最初に見つかったのが 13mm の閃光だった（Result の「最初 520 m ・ 閃光」。spec r1 §E.3、data/boats.json の jp_t14.gun_battery を合わせる根拠）
   */
  gunEnabled: boolean;
  gunShots: number;
  gunHits: number;
  retired: number;
  sunk: number;
  flashFirst: boolean;
  /**
   * 追撃（v0.6.3 実機 2 回目。spec r2 §F.4）: 撃たれた連射（firedPasses・cleanPasses の内。終わる瞬間に撃っていた連射も数える。passes は航過だけ）、
   * 13mm で追撃をやめさせた（制圧）回数
   */
  bursts: number;
  suppressions: number;
}
