// 夜明け（v0.6.1。docs/02 §6.7）の世界側: 固定ステップの中で夜明けをラッチし（core/dawn-air の dawnReached。scene の timeLeftS <= 0 と同じステップ）、
// 敵の制空下の任務では夜明けの空襲（strike = systems/air-strike-flight の AirStrikeFlight）を始めて、固定ステップの最後に進める。
// 夜明け前は何もしない（乱数も引かない）＝夜は v0.6.0 と同じ。海の明るさ（ui/sea-light）は全任務で、夜明けの 20 秒前から背景色を段で変える（見た目だけ）。
// 夜明けに敵が退く（v0.6.2）: dawn_air.enemy_ships_at_dawn が retire なら駆逐艦・輸送船が退く向き（dawn_withdraw.retire_edge。今夜の左右反転込み）へ、
// hide なら大発が岸へ。どちらもラッチの 1 回だけ（enemy.withdraw）。stay・none は何もしない。
// §7: 確保は constructor だけ。毎ステップ・毎フレームは読み書きだけ。
// strike は構造の型 DawnStrike で持つ（AirStrikeFlight を import すると game-config → screen-fit の DOM がテストの node 型検査に入るため）。
import type Phaser from 'phaser';
import { SEA_LIGHT_POST_S, SEA_LIGHT_PRE_S, SEA_LIGHT_STEPS } from '../config/dawn-config';
import type { AirStrikeParams, AirStrikeState } from '../core/air-strike';
import type { BoatState } from '../core/boat-motion';
import { dawnAirCode, dawnReached, seaLightStep, type ShipsAtDawn } from '../core/dawn-air';
import { retireDirJa, retireHeadingDeg } from '../core/dawn-withdraw';
import { SeaLight } from '../ui/sea-light';
import type { WorldSetup } from './world-setup';

/** 夜明けの判定と空襲の材料として世界から読む部分（MissionWorld がそのまま満たす。AirStrikeFlight の AirStrikeWorldView を含む） */
export interface DawnWorldView {
  /** 固定ステップで実際に進んだ実秒（夜明けの時計） */
  readonly stepTimeS: number;
  /** 輪の中か。ラッチは自艇を動かす前に呼ぶ＝前のステップの位置（夜明けの瞬間の位置）、step は自艇を動かした後＝このステップの位置。空襲は輪の中で中断 */
  readonly atHome: boolean;
  /** 座礁（空襲は中断。座礁中は夜明けをラッチしない） */
  readonly grounded: boolean;
  readonly boat: { readonly state: BoatState; readonly sinking: boolean };
  readonly escort: { readonly state: { readonly boat: BoatState; readonly sunk: boolean } } | null;
  /** 敵の側（systems/enemy-side。v0.6.2）: 夜明けに退かせる（retire の任務は退く向き、hide は NaN） */
  readonly enemy: DawnEnemy;
}

/** 夜明けに敵を退かせる口（EnemySide がそのまま満たす） */
export interface DawnEnemy {
  withdraw(retireHeadingDeg: number): void;
}

/** 夜明けの空襲の世界側が満たす口（AirStrikeFlight。機体・爆弾・着弾点の輪・爆撃進路の線を持つ。空襲の無い任務では null） */
export interface DawnStrike {
  /** core/air-strike の状態と値（テレメトリ・Result が読む） */
  readonly state: AirStrikeState;
  readonly p: AirStrikeParams;
  readonly active: boolean;
  start(player: BoatState): void;
  step(feelDt: number, w: DawnWorldView): void;
  updateVisuals(player: BoatState, escort: BoatState | null): void;
  destroy(): void;
}

export class WorldDawn {
  /** 夜明けに達した（一度立ったら任務中は消えない）。沈没中・座礁中は立てない（どちらも任務が終わる途中＝夜明け前の終わりとして扱う） */
  reached = false;
  /**
   * 夜明けの瞬間に帰投地点の輪の外にいた（帰投点 × after_dawn_factor・回避なし・Result の見出し）。
   * 夜明け後のステップが輪の外で終われば後からも立てる（夜明けのフレームの途中で輪を出ると、終了判定＝フレームの最後の位置では帰投しないため）
   */
  caughtOutside = false;
  /** 任務の夜明けの空（DAWN_AIR_*。missions_seed の dawn_air.play_as） */
  readonly air: number;
  /** 夜明けの敵艦（v0.6.2。dawn_air.enemy_ships_at_dawn）。retire・hide はラッチで敵を退かせる */
  readonly ships: ShipsAtDawn;
  /** 退く向き（0=北、時計回り。retire の任務だけ、ほかは NaN）と方角の日本語（北など。ほかは ''）。今夜の左右反転込み、構築時に 1 回だけ */
  readonly retireHeadingDeg: number;
  readonly retireJa: string;
  private readonly durationS: number;
  private readonly seaLight: SeaLight;

  constructor(
    scene: Phaser.Scene,
    setup: WorldSetup,
    /** 夜明けの空襲（world-hazards が setup.airStrike から作る。無ければ null） */
    readonly strike: DawnStrike | null,
  ) {
    this.durationS = setup.durationS;
    this.air = dawnAirCode(setup.dawnAir.playAs);
    this.ships = setup.dawnAir.shipsAtDawn;
    const edge = this.ships === 'retire' ? setup.dawnAir.retireEdge : null;
    this.retireHeadingDeg = edge ? retireHeadingDeg(edge, setup.night.mirrored) : NaN;
    this.retireJa = edge ? retireDirJa(edge, setup.night.mirrored) : '';
    this.seaLight = new SeaLight(scene.cameras.main);
  }

  /**
   * 固定ステップの中、stepTimeS を進めた直後に呼ぶ。夜明けの最初のステップで 1 回だけ立て、空襲を始め、retire・hide の任務は敵を退かせる（乱数は引かない）。
   * 自艇が沈没中か座礁中ならラッチしない（どちらも任務が終わる途中。夜明け後の終わり・空襲の 1 行・夜明けの帯にしない）
   */
  latch(w: DawnWorldView): void {
    if (this.reached || w.boat.sinking || w.grounded || !dawnReached(this.durationS, w.stepTimeS)) return;
    this.reached = true;
    this.caughtOutside = !w.atHome;
    this.strike?.start(w.boat.state);
    // 艦はこの後の同じステップ（destroyer-step・barge-hunt）から退く。retire で縁が無い（遊べない任務の形）なら退かない
    if ((this.ships === 'retire' && !Number.isNaN(this.retireHeadingDeg)) || this.ships === 'hide') w.enemy.withdraw(this.retireHeadingDeg);
  }

  /** 固定ステップの最後（味方機の後。夜の乱数の系列と順序を変えない）。夜明け前は何もしない */
  step(feelDt: number, w: DawnWorldView): void {
    if (!this.reached) return;
    // 夜明けのステップ（同じフレームの後のステップも）で輪を出たら、終了判定（フレームの最後の位置）は帰投しないので「夜明けに輪の外」と同じに扱う。沈没中は atHome が止まるので見ない
    if (!w.atHome && !w.boat.sinking) this.caughtOutside = true;
    this.strike?.step(feelDt, w);
  }

  /** 毎フレーム: 海の明るさ（段が変わったときだけ背景色）と、空襲の機体・爆弾・着弾点の輪・爆撃進路の線 */
  updateVisuals(w: DawnWorldView): void {
    this.seaLight.update(seaLightStep(w.stepTimeS, this.durationS, SEA_LIGHT_PRE_S, SEA_LIGHT_POST_S, SEA_LIGHT_STEPS));
    this.strike?.updateVisuals(w.boat.state, w.escort ? w.escort.state.boat : null);
  }

  /** 空襲の機体が来ているか爆弾が空中（味方機を同時に来させない） */
  get strikeActive(): boolean {
    return this.strike ? this.strike.active : false;
  }

  destroy(): void {
    this.seaLight.destroy();
    this.strike?.destroy();
  }
}
