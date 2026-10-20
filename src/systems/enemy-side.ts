// 敵の側の読み口（v0.4.2）: 駆逐艦の隊（us_02・us_01。v0.4.5 から複数隻）か大発の隊（us_03）のどちらかを持つ世界を、味方機・水上機・テレメトリ・Scene が同じ名前で読む（駆逐艦の有無を知らなくてよい）。
// 値はすべてその場で読む（キャッシュしない。沈没の tween が書く sunk の遅れを作らない）。確保しない。
// 夜明けに退く（v0.6.2）: withdraw() を夜明けのラッチで 1 回だけ呼ぶ（retire は駆逐艦・輸送船が退く向きへ、hide は大発が岸へ）。退いた艦・隠れた大発は撃沈・撃破に数えない。
// 米PT の隊（v0.6.3。systems/pt-squadron）は最後の枝（駆逐艦・大発の式は変えない）: 発見・脅威の PT・水上機の方角の元・発砲数。目標・撃ち尽くし・退く・沈没の演出は無い（false・何もしない）。
import type { BoatState } from '../core/boat-motion';
import { nearestAfloat } from '../core/barges';
import type { BargeHunt } from './barge-hunt';
import type { DestroyerGroup } from './destroyer-group';
import type { PtSquadron } from './pt-squadron';

export class EnemySide {
  constructor(
    private readonly g: DestroyerGroup | null,
    private readonly hunt: BargeHunt | null,
    private readonly pts: PtSquadron | null,
  ) {}

  /** 自艇を見つけている（駆逐艦: 浮いているどれかの ai.playerDetected。大発: 浮いている 1 隻でも。米PT: 隊が捉えている） */
  get detected(): boolean {
    if (this.g) return this.g.anyDetected;
    if (this.hunt) return this.hunt.flotilla.anyDetected;
    return this.pts ? this.pts.section.detected : false;
  }

  /** 探照灯・星弾・照明弾で照らされて撃たれる（駆逐艦だけ。沈み始めた艦のは数えない） */
  get illuminated(): boolean {
    return this.g ? this.g.anyIlluminated : false;
  }

  /** 駆逐艦がすべて沈み始めた（大発の任務では false）。撃沈後の HUD・魚雷の残弾表示・照明の表示を止める */
  get shipDown(): boolean {
    return this.g ? this.g.allSinking : false;
  }

  /** 駆逐艦・輸送船がすべて沈み始めたか夜明けに退いた（v0.6.2。大発の任務では false）。狙う艦がいない＝魚雷を撃てない・残弾 0 を見せる */
  get allOut(): boolean {
    return this.g ? this.g.allOut : false;
  }

  /** 夜明けに退いて海域を出た駆逐艦の隻数（v0.6.2。輸送船は数えない。大発の任務では 0）。Result の夜明けの行 */
  get shipsWithdrawn(): number {
    return this.g ? this.g.withdrawnCount : 0;
  }

  /** 輸送船が夜明けに退いて海域を出た（v0.6.2） */
  get transportWithdrawn(): boolean {
    return this.g ? this.g.transportWithdrawn : false;
  }

  /** 夜明けの後に岸へ隠れた（上陸した）大発の隻数（v0.6.2。駆逐艦の任務では 0）。Result の夜明けの行 */
  get bargesHidden(): number {
    return this.hunt ? this.hunt.hiddenAfterDawn : 0;
  }

  /** 夜明けの後に岸へ逃げている大発の隻数（v0.6.2 実機 1 回目。夜明け前と駆逐艦の任務では 0）。空襲の行の「大発 岸へ N 隻」 */
  get bargesRunning(): number {
    return this.hunt ? this.hunt.runningAfterDawn : 0;
  }

  /**
   * 夜明けに退く（v0.6.2）。夜明けのラッチ（systems/world-dawn）で 1 回だけ、enemy_ships_at_dawn が retire か hide の任務で呼ぶ（stay・none は呼ばない）。
   * retire: 駆逐艦の隊は retireHeadingDeg（core/dawn-withdraw の retireHeadingDeg。今夜の左右反転込み）へ全速。hide は NaN を渡す（駆逐艦は退かない）。
   * 大発は岸へ（向きは使わない）。乱数は引かない
   */
  withdraw(retireHeadingDeg: number): void {
    if (!Number.isNaN(retireHeadingDeg)) this.g?.withdraw(retireHeadingDeg);
    this.hunt?.withdraw();
  }

  /** 撃沈の演出中（終了判定・味方機・水上機を待たせる。大発の沈み込みは待たせない） */
  get sinkPlaying(): boolean {
    return this.g ? this.g.anySinkPlaying : false;
  }

  /** 任務の目標を達した（駆逐艦がすべて沈み始めた（輸送船は数えない）／大発をノルマ以上撃破）。「撃沈！帰投せよ」と Result の任務達成 */
  get objectiveDone(): boolean {
    if (this.g) return this.g.objectiveSinking;
    return this.hunt ? this.hunt.quotaMet : false;
  }

  /** 狩る相手が残っていない（大発がすべて撃破か上陸。「大発なし 帰投せよ」）。駆逐艦の任務では false（撃ち尽くしは魚雷の残弾で決める） */
  get noTargetsLeft(): boolean {
    const f = this.hunt ? this.hunt.flotilla : null;
    return f ? f.sunk + f.beached === f.barges.length : false;
  }

  /** 累計の発砲数（水上機の照明弾の下の砲撃の KPI） */
  get shotsFired(): number {
    if (this.g) return this.g.shotsFired;
    if (this.hunt) return this.hunt.flotilla.shotsFired;
    return this.pts ? this.pts.section.shots : 0;
  }

  /** 自艇から見た「いまの敵」: (x, y) に最も近い、沈み始める前で退いていない駆逐艦か浮いている大発、米PT は脅威の PT（いなければ null）。矢印・敵影・?debug の円 */
  focus(x: number, y: number): BoatState | null {
    if (this.g) {
      const d = this.g.nearestAfloat(x, y);
      return d ? d.state : null;
    }
    if (!this.hunt) return this.pts ? this.pts.focus(x, y) : null;
    const i = nearestAfloat(this.hunt.flotilla, x, y);
    return i < 0 ? null : this.hunt.flotilla.barges[i]!;
  }

  /** 水上機が来る方角の元: (x, y) に最も近い浮いている駆逐艦（いなければ 1 隻目の最後の位置）。大発なら最も近い浮いている大発（いなければ先頭の最後の位置） */
  anchorX(x: number, y: number): number {
    if (this.g) return (this.g.nearestAfloat(x, y) ?? this.g.ships[0]!).state.x;
    if (!this.hunt) return this.pts ? this.ptAnchor(x, y).x : x;
    const i = nearestAfloat(this.hunt.flotilla, x, y);
    return this.hunt.flotilla.barges[i < 0 ? 0 : i]!.x;
  }

  anchorY(x: number, y: number): number {
    if (this.g) return (this.g.nearestAfloat(x, y) ?? this.g.ships[0]!).state.y;
    if (!this.hunt) return this.pts ? this.ptAnchor(x, y).y : y;
    const i = nearestAfloat(this.hunt.flotilla, x, y);
    return this.hunt.flotilla.barges[i < 0 ? 0 : i]!.y;
  }

  /** 米PT: 脅威の PT（みな去ったら 1 隻目の最後の位置） */
  private ptAnchor(x: number, y: number): BoatState {
    return this.pts!.focus(x, y) ?? this.pts!.section.boats[0]!;
  }
}
