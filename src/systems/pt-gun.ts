// T-14 の 13mm 機銃（v0.6.3 実機 1 回目。docs/02 §6.4、boats.json の jp_t14.gun_battery）の世界側: core/pt-gun（弾倉のある艇の砲）を固定ステップで進め、
// 生きた PT への命中ごとに seed+20 から 1 回引いて core/pt-damage の hitPt（撃退・撃沈）へ渡し、曳光弾・砲口の閃光・標的の輪・命中と外れの水柱を描く（barge-hunt の艇の砲と同じ形）。
// 撃退・撃沈の PT の見た目（色・沈み込み・世界の命中スローと爆発）は PT の絵を持つ呼ぶ側（PtSquadron）へ onFate で知らせる。
// §7: 曳光弾 PT_GUN_SHELL_POOL_SIZE 枚・閃光 1 枚・輪 1 枚を起動時に作り、毎フレームは transform/alpha/visible だけ触る。events は 1 個だけ作る（閉包を毎ステップ作らない）。
// 乱数: seed+20（PT_GUN_SEED_OFFSET）の 1 系列だけ（1 発 2 回・生きた PT への命中 1 回。模擬 core/pt-pass-sim と同じ）。艇に砲のある米PT の任務（jp_05）だけ PtSquadron が作る。押さなければ引かない。
import Phaser from 'phaser';
import { DEPTH, RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import { GUN_FLASH_LIFETIME_S, GUN_FLASH_SCALE, GUN_TRACER_TINT, TARGET_RING_ALPHA, TARGET_RING_SCALE, TARGET_RING_TINT } from '../config/hunt-config';
import { PT_GUN_SHELL_POOL_SIZE } from '../config/pt-config';
import type { BoatState, SpeedStep } from '../core/boat-motion';
import { GUN_FIRING, type GunBatteryParams, type GunEvents } from '../core/gun-battery';
import { PT_GUN_SEED_OFFSET, type PtEvents, type PtParams, type PtSection } from '../core/pt-boats';
import { hitPt } from '../core/pt-damage';
import { createPtGun, stepPtGun, type PtGunState } from '../core/pt-gun';
import { SeededRng } from '../core/rng';
import { syncShells } from './barge-hunt';
import type { SplashPool } from './splash-pool';

export class PtGun {
  /** 砲の本体と弾倉（HUD・Result が読む） */
  readonly state: PtGunState;
  /** 散布と PT への命中の結末（seed+20） */
  readonly rng: SeededRng;
  private readonly tracers: Phaser.GameObjects.Image[] = [];
  private readonly flash: Phaser.GameObjects.Image;
  private readonly ring: Phaser.GameObjects.Image;
  private flashAge = Infinity;

  private readonly events: GunEvents = {
    onFire: (x, y) => {
      this.flash.setPosition(x, y).setAlpha(1).setVisible(true);
      this.flashAge = 0;
    },
    // 生きた PT に当たった（gun-battery は ptLive の PT にだけ当てる）: 1 回引いて撃退・撃沈を決め、結末が変わったら絵を持つ側へ
    onHit: (i, group, x, y) => {
      const before = this.q.boats[i]!.fate;
      const fate = hitPt(this.q, this.p, i, this.g.groups[group]!.damage, this.rng.next(), this.ptEvents);
      this.splashes.splash(x, y, true);
      if (fate !== before) this.onFate(i, fate);
    },
    onMiss: (x, y) => this.splashes.splash(x, y, false),
  };

  constructor(
    scene: Phaser.Scene,
    readonly g: GunBatteryParams,
    seed: number,
    private readonly boat: BoatState,
    private readonly q: PtSection,
    private readonly p: PtParams,
    /** 隊の知らせ（撃退で航過の外の PT がすぐ去る onLeave） */
    private readonly ptEvents: PtEvents,
    private readonly splashes: SplashPool,
    /** PT i の結末が変わった（PT_FATE_*。撃退か撃沈） */
    private readonly onFate: (i: number, fate: number) => void,
  ) {
    this.rng = new SeededRng((seed + PT_GUN_SEED_OFFSET) >>> 0);
    this.state = createPtGun(g, PT_GUN_SHELL_POOL_SIZE);
    for (let i = 0; i < PT_GUN_SHELL_POOL_SIZE; i++) this.tracers.push(scene.add.image(0, 0, TEXTURE_KEYS.gunTracer).setScale(1 / RENDER_SCALE).setTint(GUN_TRACER_TINT).setDepth(DEPTH.shell).setVisible(false));
    this.flash = scene.add.image(0, 0, TEXTURE_KEYS.explosionRing).setTint(GUN_TRACER_TINT).setScale(GUN_FLASH_SCALE / RENDER_SCALE).setDepth(DEPTH.effects).setVisible(false);
    this.ring = scene.add.image(0, 0, TEXTURE_KEYS.explosionRing).setTint(TARGET_RING_TINT).setAlpha(TARGET_RING_ALPHA).setScale(TARGET_RING_SCALE / RENDER_SCALE).setDepth(DEPTH.effects).setVisible(false);
  }

  /**
   * 固定ステップ（米PT の隊の前。模擬と同じ順）: 弾倉 → 標的 → 発射 → 着弾 → 撃退・撃沈。held は射撃ボタン、canFire は艇が浮いていて帰投の輪の外。
   * 撃ったか（このステップは閃光で PT が見つける）を返す
   */
  step(band: SpeedStep, held: boolean, canFire: boolean, visRange2: number, feelDt: number, dt: number): boolean {
    stepPtGun(this.state, this.g, this.boat, band, held, canFire, this.q, this.p, visRange2, this.rng, feelDt, dt, this.events);
    return this.state.battery.fired;
  }

  /** 毎フレーム: 曳光弾、閃光、標的の輪（撃っている間だけ。変わるものだけ触る） */
  updateVisuals(realDt: number): void {
    const b = this.state.battery;
    syncShells(b.shells, this.tracers, null);
    if (this.flashAge !== Infinity) {
      this.flashAge += realDt;
      if (this.flashAge >= GUN_FLASH_LIFETIME_S) {
        this.flashAge = Infinity;
        this.flash.setVisible(false);
      } else this.flash.setAlpha(1 - this.flashAge / GUN_FLASH_LIFETIME_S);
    }
    const t = b.status === GUN_FIRING ? this.q.boats[b.target] : undefined;
    if (t) this.ring.setPosition(t.x, t.y);
    if (!!t !== this.ring.visible) this.ring.setVisible(!!t);
  }

  destroy(): void {
    for (const s of this.tracers) s.destroy();
    this.flash.destroy();
    this.ring.destroy();
  }
}
