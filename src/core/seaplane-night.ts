// 夜の水上機の 1 夜に複数回の攻撃（v0.8.1 IP2。us_06。ユーザーの U3「ノーマルとハードの両方」・実機 1 回目「敵の哨戒機がバンバン飛んできて常に速度を気にしないといけない緊張感」）:
// 凍結の core/seaplane.ts・core/seaplane-ordnance.ts（tests/frozen-files）の公開の状態を外から書く包み（凍結のファイルは 1 字も変えない。前例は core/air-down の downSeaplane・core/air-sortie）。
// 凍結の段の機械は、照明弾と爆弾の攻撃の後に去り終えると SP_DONE（「1 任務 1 回」）。任務の data（enemy_aircraft.attacks_per_night。config/seaplane-mission-data）が 2 以上の時だけ、
// その DONE を stepSeaplane の直後に哨戒（SP_PATROL・patrol_cooldown_s の冷却）へ戻し、爆弾を積み直す（照明弾は 1 つの状態を使い回す）。回数に届けば DONE のまま。
// 包みの無い任務（attacks_per_night の無い任務＝us_02 ほか）は作らない＝世界は 1 ビットも変わらない。attacks_per_night 1 の包みも凍結の機械と同じ夜（tests/seaplane-night）。
// 爆弾の数・当たりの数・転舵の秒は 1 夜の通し（Result）。HUD の「爆弾 N 発 命中 M」と旋回の行は今の攻撃の分だけ（systems/seaplane-telemetry が bombBase・hitBase を引く）。
// 撃墜（core/air-down）は arms の段で DONE にする＝この包みは見ない（stepSeaplane の中の LEAVING → DONE だけを見る）＝撃墜した機は戻らない。Phaser 非依存・乱数なし・確保は作る時だけ。
import { SP_DONE, SP_LEAVING, SP_OUT_BOMBED, SP_PATROL, type SeaplaneParams, type SeaplaneState } from './seaplane';

/** 1 夜の攻撃の包みの状態 */
export interface SeaplaneNightState {
  /** 1 夜に照明弾と爆弾で攻撃する回数の上限（data の attacks_per_night） */
  readonly attacksPerNight: number;
  /** 爆弾を落とし切って去り終えた攻撃の数 */
  attacks: number;
  /** 今の攻撃の前までに落とした・当たった爆弾の数（HUD の行は今の攻撃の分だけ） */
  bombBase: number;
  hitBase: number;
}

/** 包みを作る（世界の作る時に 1 回）: 爆弾の入れ物を 1 夜の分（bombCount × attacksPerNight）に足す（凍結の createOrdnance が作る bombCount 個と同じ形） */
export function createSeaplaneNight(s: SeaplaneState, p: SeaplaneParams, attacksPerNight: number): SeaplaneNightState {
  const bombs = s.ordnance.bombs;
  while (bombs.length < p.bombCount * attacksPerNight) {
    bombs.push({ active: false, fromX: 0, fromY: 0, aimX: 0, aimY: 0, leftS: 0, hit: false, aimed: false, aimHeadingDeg: 0, aimedS: 0, dodgeReactS: NaN });
  }
  return { attacksPerNight, attacks: 0, bombBase: 0, hitBase: 0 };
}

/**
 * stepSeaplane の直後に毎ステップ（prevPhase はその stepSeaplane の前の段）。攻撃を終えて去り終えた（LEAVING → DONE・結果は爆弾を落とし切った）時だけ攻撃を 1 つ数え、
 * 回数に届いていなければ哨戒へ戻して（冷却 patrol_cooldown_s・「この攻撃で発見確定した」の旗を下ろす＝次の接近で見失えばまた哨戒へ）爆弾を積み直す（true）。ほかは何も変えない（false）
 */
export function afterSeaplaneStep(n: SeaplaneNightState, s: SeaplaneState, p: SeaplaneParams, prevPhase: number): boolean {
  if (!(prevPhase === SP_LEAVING && s.phase === SP_DONE && s.outcome === SP_OUT_BOMBED)) return false;
  n.attacks++;
  if (n.attacks >= n.attacksPerNight) return false;
  s.phase = SP_PATROL;
  s.timerS = p.patrolCooldownS;
  s.attacked = false;
  s.ordnance.bombsLeft = p.bombCount;
  n.bombBase = s.ordnance.bombsDropped;
  n.hitBase = s.ordnance.bombsHit;
  return true;
}
