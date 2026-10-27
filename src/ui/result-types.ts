// Result の材料の型のうち任務ごとの部分（v0.6.3 で result-scene から切り出し。中身はそのまま。型だけ）。result-scene.ts が再 export する（今までの import のため）。
// v0.6.3: 米PT の記録（PtResult）を足した。実機 1 回目: T-14 の 13mm の記録（射撃・命中・撃退・撃沈・閃光が最初）と enemies.json の id。実機 2 回目: 連射と制圧の数。
// v0.6.4: 味方の大発の輸送隊の記録（ConvoyResult）と、米PT の標的スロットの欄（大発への航過・最初に捉えた標的・砲の名）。v0.6.5: 機関の不調の記録（EngineResult）。
// v0.6.6: 隼艇の僚艇の記録（GunboatResult。jp_01 のハード）。v0.6.8: 兵装の新しい道の記録（ArmsResult。使った夜だけ）。
import type { BlindKind } from '../core/arms-cue';
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
 * 米PT の記録（v0.6.3。spec §D.4。systems/pt-telemetry の ptResult）: 隻数・去った数（海域の外）・去っていない結末の無い数（Result の「健在 N 隻」。撃退・撃沈した PT は入れない）・夜明けに去った、
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
  /**
   * 米PT の標的スロット（v0.6.4。jp_01）: 大発を狙った攻撃の数（航過の後の「（大発へ N）」）、最初に捉えた標的（0 自艇・1 大発・2 隼艇。「最初 600 m ・ 大発」＝jp_01 の大発の帯 silent・新月）、
   * 砲の名の頭（label から「機銃」を除いた「25mm」。jp_05 は「13mm」）。jp_01 では hits / cleanPasses / firedPasses は自艇への攻撃だけ（大発への航過は「かわした」の分母に入らない）
   */
  passesOnBarges: number;
  firstDetectKind: number;
  gunLabel: string;
}

/** 味方の大発の輸送隊の記録（v0.6.4。jp_01。systems/convoy-telemetry の convoyResult）: 隻数・上陸・沈没・ノルマ（達成に要る上陸）・隊が受けた命中 */
export interface ConvoyResult {
  total: number;
  arrived: number;
  sunk: number;
  quota: number;
  hitsTaken: number;
}

/** 機関の不調の記録（v0.6.5。jp_05。systems/mission-result-extras の engineResult）: 熱が過熱・限界を下から越えた回数、不調の回数と秒の和（体感秒）。Result の 1 行（ui/engine-lines） */
export interface EngineResult {
  warns: number;
  finals: number;
  limps: number;
  limpS: number;
}

/**
 * 隼艇の僚艇の記録（v0.6.6。jp_01 のハード。systems/mission-result-extras の gunboatResult）: 名（data の label_ja）・残り HP と最大・受けた命中・沈んだか（その体感秒）、
 * 隼艇の 25mm の射撃・PT への命中・撃退・撃沈（最後の結末を決めた砲が隼艇の PT。systems/gunboat-credit）・制圧、米PT が隼艇を狙った攻撃の数（航過＋連射）。Result の 1 行（ui/gunboat-lines）
 */
export interface GunboatResult {
  labelJa: string;
  hp: number; maxHp: number; hitsTaken: number; sunk: boolean; sunkS: number;
  shots: number; hits: number; retired: number; ptSunk: number; suppressions: number;
  attacked: number;
}

/**
 * 夜の哨戒機の記録（v0.6.7。jp_02。systems/patrol-telemetry の patrolResult）: 捜索の回数（航跡で来た回数）・隠れた（付近の捜索をやり過ごした）・発見（レーダー込み）と目の発見、
 * 夜の出撃の爆弾・自艇への命中・失った HP、自艇を狙った爆弾ごとの投下から転舵までの秒（NaN は転舵なし）、再出撃の遅れ（F12。0 のはず）。Result の 2 行（ui/patrol-result-lines）
 */
export interface PatrolResult {
  passes: number; passesWake: number; hides: number; finds: number; findsVisual: number;
  bombs: number; hits: number; damage: number; dodgeS: number[];
  restartDelayed: number;
}

/**
 * 兵装の新しい道の記録（v0.6.8。spec-v068 §4.7。systems/arms-telemetry の armsResultPart）: 艦へ撃った発数と命中（水柱だけ・効かない）、機へ撃った発数と撃墜（うち水上機・夜の出撃の哨戒機）、
 * 狙う艦の無い魚雷の本数とその種類（大発の下・PT の下・艦なし）。艦への機銃・対空・狙う艦の無い魚雷をどれも使わなかった夜は鍵ごと無い（Result は今までの文のまま）
 */
export interface ArmsResult {
  shipRounds: number; shipHits: number;
  aaRounds: number; downs: number; downsSeaplane: number; downsSortie: number;
  blindTorpedoes: number; blindKind: BlindKind;
}
