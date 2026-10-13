// 敵の側の読み口（v0.4.2）: 駆逐艦（us_02）か大発の隊（us_03）のどちらかを持つ世界を、味方機・水上機・テレメトリ・Scene が同じ名前で読む（駆逐艦の有無を知らなくてよい）。
// 値はすべてその場で読む（キャッシュしない。沈没の tween が書く sunk の遅れを作らない）。確保しない。
import type { BoatState } from '../core/boat-motion';
import { nearestAfloat } from '../core/barges';
import type { Destroyer } from '../entities/destroyer';
import type { BargeHunt } from './barge-hunt';
import type { EnemyFire } from './enemy-fire';

export class EnemySide {
  constructor(
    private readonly d: Destroyer | null,
    private readonly fire: EnemyFire | null,
    private readonly hunt: BargeHunt | null,
  ) {}

  /** 自艇を見つけている（駆逐艦: 沈み始める前の ai.playerDetected。大発: 浮いている 1 隻でも） */
  get detected(): boolean {
    if (this.d) return this.d.ai.playerDetected && !this.d.sinking;
    return this.hunt ? this.hunt.flotilla.anyDetected : false;
  }

  /** 探照灯・星弾・照明弾で照らされて撃たれる（駆逐艦だけ。沈み始めたら false） */
  get illuminated(): boolean {
    return this.d && this.fire ? this.fire.illuminated && !this.d.sinking : false;
  }

  /** 駆逐艦が沈み始めた（大発の任務では false）。撃沈後の HUD・魚雷の残弾表示・照明の表示を止める */
  get shipDown(): boolean {
    return this.d ? this.d.sinking : false;
  }

  /** 撃沈の演出中（終了判定・味方機・水上機を待たせる。大発の沈み込みは待たせない） */
  get sinkPlaying(): boolean {
    return this.d ? this.d.sinking && !this.d.sunk : false;
  }

  /** 任務の目標を達した（駆逐艦が沈み始めた／大発をノルマ以上撃破）。「撃沈！帰投せよ」と Result の任務達成 */
  get objectiveDone(): boolean {
    if (this.d) return this.d.sinking;
    return this.hunt ? this.hunt.quotaMet : false;
  }

  /** 狩る相手が残っていない（大発がすべて撃破か上陸。「大発なし 帰投せよ」）。駆逐艦の任務では false（撃ち尽くしは魚雷の残弾で決める） */
  get noTargetsLeft(): boolean {
    const f = this.hunt ? this.hunt.flotilla : null;
    return f ? f.sunk + f.beached === f.barges.length : false;
  }

  /** 累計の発砲数（水上機の照明弾の下の砲撃の KPI） */
  get shotsFired(): number {
    if (this.fire) return this.fire.shotsFired;
    return this.hunt ? this.hunt.flotilla.shotsFired : 0;
  }

  /** 自艇から見た「いまの敵」: 沈み始める前の駆逐艦か、(x, y) に最も近い浮いている大発（いなければ null）。矢印・敵影・?debug の円 */
  focus(x: number, y: number): BoatState | null {
    if (this.d) return this.d.sinking ? null : this.d.state;
    if (!this.hunt) return null;
    const i = nearestAfloat(this.hunt.flotilla, x, y);
    return i < 0 ? null : this.hunt.flotilla.barges[i]!;
  }

  /** 水上機が来る方角の元: 駆逐艦の位置。大発なら (x, y) に最も近い浮いている大発（いなければ先頭の最後の位置） */
  anchorX(x: number, y: number): number {
    if (this.d) return this.d.state.x;
    if (!this.hunt) return x;
    const i = nearestAfloat(this.hunt.flotilla, x, y);
    return this.hunt.flotilla.barges[i < 0 ? 0 : i]!.x;
  }

  anchorY(x: number, y: number): number {
    if (this.d) return this.d.state.y;
    if (!this.hunt) return y;
    const i = nearestAfloat(this.hunt.flotilla, x, y);
    return this.hunt.flotilla.barges[i < 0 ? 0 : i]!.y;
  }
}
