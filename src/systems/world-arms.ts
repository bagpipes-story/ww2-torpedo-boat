// 世界の兵装（v0.6.8。spec-v068 §3.2）: systems/arms-step の ArmsStep（Phaser 非依存の段）を継ぎ、絵を足す: 艦への機銃の曳光弾（弾の状態に合わせる。barge-hunt の syncShells）・
// 砲口の閃光・対空の曳光弾（AA_TRACER_POOL 本を使い回し、行き先のずれは決まった表＝乱数なし）・撃墜した機の落ちる絵（ARMS_WRECK_POOL 枚。回りながら小さく薄くなり、最後に水柱）。
// 艦への弾の水柱と撃墜の水柱は世界の SplashPool、撃墜の爆発と命中スローは世界の onSunk（大発の撃破と同じ。固定ステップの中で呼ぶ）。
// MissionWorld が敵の側・危険の後に 1 回だけ作る（+24・+25 の系列は ArmsStep が使う任務だけで作る）。§7: 絵は constructor で作り、毎フレームは transform/alpha/visible だけ。
// ?debug&aa=<p>（config/game-config の DEBUG_AA_CHANCE）は 1 発の撃墜の確率を上書きする（実機で撃墜を見るため）。
import type Phaser from 'phaser';
import { AA_TRACER_OFFSETS_M, AA_TRACER_POOL, AA_TRACER_S, ARMS_SHELL_POOL_SIZE, ARMS_WRECK_POOL, ARMS_WRECK_S, ARMS_WRECK_SCALE_TO, ARMS_WRECK_SPIN_DEG } from '../config/arms-config';
import { DEBUG_AA_CHANCE, DEPTH, RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import type { GameData } from '../config/game-data';
import { GUN_FLASH_LIFETIME_S, GUN_FLASH_SCALE, GUN_TRACER_TINT } from '../config/hunt-config';
import { getLoadout } from '../config/loadout-data';
import type { BlindKind } from '../core/arms-cue';
import { radToDeg } from '../core/units';
import { ArmsStep, type ArmsKit } from './arms-step';
import { syncShells } from './barge-hunt';
import type { MissionWorld } from './mission-world';
import type { SplashPool } from './splash-pool';

export class WorldArms extends ArmsStep {
  private readonly shellImgs: Phaser.GameObjects.Image[] = [];
  private readonly flashImg: Phaser.GameObjects.Image | null;
  private flashAge = Infinity;
  private readonly aaImgs: Phaser.GameObjects.Image[] = [];
  /** 対空の曳光弾ごとの始点・終点（世界の座標）と経過の実秒（Infinity は使っていない） */
  private readonly aaFrom: Float32Array;
  private readonly aaTo: Float32Array;
  private readonly aaAge: Float32Array;
  private aaNext = 0;
  private aaOffset = 0;
  private readonly wrecks: Phaser.GameObjects.Image[] = [];
  private readonly wreckAge: Float32Array;
  private readonly wreckAngle: Float32Array;
  private wreckNext = 0;

  constructor(
    scene: Phaser.Scene,
    kind: BlindKind,
    kit: ArmsKit,
    private readonly splashes: SplashPool,
    /** 撃墜（世界の命中スローと Scene の爆発・揺れ。大発の撃破と同じ） */
    private readonly onSunk: (x: number, y: number) => void,
  ) {
    super(kind, kit);
    if (this.shipGun) for (let i = 0; i < ARMS_SHELL_POOL_SIZE; i++) this.shellImgs.push(scene.add.image(0, 0, TEXTURE_KEYS.gunTracer).setScale(1 / RENDER_SCALE).setTint(GUN_TRACER_TINT).setDepth(DEPTH.shell).setVisible(false));
    const aa = this.aa !== null;
    this.aaFrom = new Float32Array(aa ? AA_TRACER_POOL * 2 : 0);
    this.aaTo = new Float32Array(aa ? AA_TRACER_POOL * 2 : 0);
    this.aaAge = new Float32Array(aa ? AA_TRACER_POOL : 0).fill(Infinity);
    this.wreckAge = new Float32Array(aa ? ARMS_WRECK_POOL : 0).fill(Infinity);
    this.wreckAngle = new Float32Array(aa ? ARMS_WRECK_POOL : 0);
    if (aa) {
      for (let i = 0; i < AA_TRACER_POOL; i++) this.aaImgs.push(scene.add.image(0, 0, TEXTURE_KEYS.gunTracer).setScale(1 / RENDER_SCALE).setTint(GUN_TRACER_TINT).setDepth(DEPTH.aircraft).setVisible(false));
      for (let i = 0; i < ARMS_WRECK_POOL; i++) this.wrecks.push(scene.add.image(0, 0, TEXTURE_KEYS.enemyAircraft).setScale(1 / RENDER_SCALE).setDepth(DEPTH.aircraft).setVisible(false));
    }
    this.flashImg = this.shipGun || aa ? scene.add.image(0, 0, TEXTURE_KEYS.explosionRing).setTint(GUN_TRACER_TINT).setScale(GUN_FLASH_SCALE / RENDER_SCALE).setDepth(DEPTH.effects).setVisible(false) : null;
  }

  protected override fxMuzzle(x: number, y: number): void {
    if (!this.flashImg) return;
    this.flashImg.setPosition(x, y).setAlpha(1).setVisible(true);
    this.flashAge = 0;
  }

  protected override fxSplash(x: number, y: number, hit: boolean): void {
    this.splashes.splash(x, y, hit);
  }

  protected override fxAaRound(fromX: number, fromY: number, toX: number, toY: number): void {
    const i = this.aaNext;
    this.aaNext = (i + 1) % AA_TRACER_POOL;
    const o = this.aaOffset;
    this.aaOffset = (o + 2) % AA_TRACER_OFFSETS_M.length;
    const tx = toX + AA_TRACER_OFFSETS_M[o]!;
    const ty = toY + AA_TRACER_OFFSETS_M[o + 1]!;
    this.aaFrom[i * 2] = fromX;
    this.aaFrom[i * 2 + 1] = fromY;
    this.aaTo[i * 2] = tx;
    this.aaTo[i * 2 + 1] = ty;
    this.aaAge[i] = 0;
    this.aaImgs[i]!.setPosition(fromX, fromY).setAngle(radToDeg(Math.atan2(tx - fromX, -(ty - fromY)))).setVisible(true);
  }

  protected override fxDown(_src: number, x: number, y: number, headingDeg: number): void {
    const i = this.wreckNext;
    this.wreckNext = (i + 1) % ARMS_WRECK_POOL;
    this.wreckAge[i] = 0;
    this.wreckAngle[i] = headingDeg;
    this.wrecks[i]!.setPosition(x, y).setAngle(headingDeg).setScale(1 / RENDER_SCALE).setAlpha(1).setVisible(true);
    this.onSunk(x, y);
  }

  /** 毎フレーム（mission-world の updateFrame の最後）: 艦への弾・閃光・対空の曳光弾・落ちる機（変わるものだけ触る） */
  updateVisuals(realDt: number, _w: MissionWorld): void {
    if (this.shipGun) syncShells(this.shipGun.battery.shells, this.shellImgs, null);
    if (this.flashImg && this.flashAge !== Infinity) {
      this.flashAge += realDt;
      if (this.flashAge >= GUN_FLASH_LIFETIME_S) {
        this.flashAge = Infinity;
        this.flashImg.setVisible(false);
      } else this.flashImg.setAlpha(1 - this.flashAge / GUN_FLASH_LIFETIME_S);
    }
    for (let i = 0; i < this.aaImgs.length; i++) {
      const age = this.aaAge[i]!;
      if (age === Infinity) continue;
      const a = age + realDt;
      const img = this.aaImgs[i]!;
      if (a >= AA_TRACER_S) {
        this.aaAge[i] = Infinity;
        img.setVisible(false);
        continue;
      }
      this.aaAge[i] = a;
      const u = a / AA_TRACER_S;
      img.setPosition(this.aaFrom[i * 2]! + (this.aaTo[i * 2]! - this.aaFrom[i * 2]!) * u, this.aaFrom[i * 2 + 1]! + (this.aaTo[i * 2 + 1]! - this.aaFrom[i * 2 + 1]!) * u);
    }
    for (let i = 0; i < this.wrecks.length; i++) {
      const age = this.wreckAge[i]!;
      if (age === Infinity) continue;
      const a = age + realDt;
      const img = this.wrecks[i]!;
      if (a >= ARMS_WRECK_S) {
        this.wreckAge[i] = Infinity;
        img.setVisible(false);
        this.splashes.splash(img.x, img.y, true);
        continue;
      }
      this.wreckAge[i] = a;
      const u = a / ARMS_WRECK_S;
      img.setAngle(this.wreckAngle[i]! + ARMS_WRECK_SPIN_DEG * u).setScale((1 - (1 - ARMS_WRECK_SCALE_TO) * u) / RENDER_SCALE).setAlpha(1 - u);
    }
  }

  destroy(): void {
    for (const s of this.shellImgs) s.destroy();
    for (const s of this.aaImgs) s.destroy();
    for (const s of this.wrecks) s.destroy();
    this.flashImg?.destroy();
  }
}

/**
 * 任務の兵装を作る（艇が魚雷も砲も積まなければ null。遊べる任務ではいつも作る）。狙う艦の無い魚雷の文は任務の敵から: 大発の隊（us_03）・米PT の隊（jp_01・jp_05）・それ以外（艦なし）。
 * 砲は艇の gun_battery（主兵装に関わらず）、対空と閃光は hit_rate_model.json（?debug&aa で 1 発の確率だけ上書き）
 */
export function buildArms(scene: Phaser.Scene, w: MissionWorld, data: GameData, seed: number, onSunk: (x: number, y: number) => void): WorldArms | null {
  const lo = getLoadout(data, w.setup.mission);
  if (lo.torpedoes <= 0 && lo.gun === null) return null;
  const kind: BlindKind = w.hunt ? 'barge' : w.pts ? 'pt' : 'noship';
  const aa = Number.isFinite(DEBUG_AA_CHANCE) ? { ...lo.aa, hitChancePerRound: Math.min(1, DEBUG_AA_CHANCE) } : lo.aa;
  return new WorldArms(scene, kind, { gun: lo.gun, aa, seed, world: w }, w.splashes, onSunk);
}
