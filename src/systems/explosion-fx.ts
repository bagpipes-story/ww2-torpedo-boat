// v0.7.0 S3b（アートと音①：コードで描く絵。spec-v0700 §5.3・R11・R12・D7）: 爆発のプール。EXPLOSION_SLOTS 枠 × 4 部品（閃光・火球・水柱／暗い玉・輪）＝Image 16。
// 大きい版（命中・撃破・沈没）: 閃光（tex-muzzle-flash を大きく・ADD・0.15 秒）＋火球（tex-fireball・ADD・0.5 秒で膨らむ）＋水柱（tex-splash 白・0.8 秒）＋今の輪（橙。結果を読む印＝D7。
//   scale 0.2 → 1.6・α 1 → 0・Cubic.easeOut 0.6 秒＝v0.6.11 の tween と同じ曲線を毎フレームの式で）。
// 小さい版（dud＝魚雷の不発・自艇の小さな被弾・僚艇の被弾・座礁）: 小さな閃光（0.1 秒）＋灰の輪（0.2 → 0.6）＋暗い玉 1 つ（tex-smoke-puff を暗く・半径 ≤ 15 m）。水柱は出さない（R11）。
// 5 つ目は一番古い枠を使い回す。毎回の new と tween をやめた（§7）。ADD の 2 部品は深さ ＋0.01 にまとめる（R25）。Canvas レンダラーでは ADD を使わない（通常の重ね）。
// 持ち主は world-art（世界の作成時に作り、mission-effects に登録し、破棄で外す＝R12）。§7: 確保は constructor だけ。update は読んで書くだけ。
import type Phaser from 'phaser';
import { FIRE_GROW, PUFF_GROW, SPLASH_GROW, easeOutCubic, flashLifeS, partFade, partGrow, slotLifeS } from '../assets/fx-shape';
import { EXPLOSION_RING_RADIUS_UNITS } from '../assets/art-dims';
import {
  ADD_DEPTH_STEP, BLEND_ADD, EXPLOSION_FIRE_RADIUS_M, EXPLOSION_FIRE_TINT, EXPLOSION_FLASH_RADIUS_M, EXPLOSION_FLASH_TINT, EXPLOSION_PUFF_RADIUS_M, EXPLOSION_SLOTS,
  EXPLOSION_SMALL_FLASH_RADIUS_M, EXPLOSION_SPLASH_RADIUS_M, FIRE_SMOKE_TINT,
} from '../config/fx-art-config';
import { DEPTH, RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import { RENDERER_WEBGL } from '../config/sea-art-config';
import { EXPLOSION_DURATION_MS, EXPLOSION_SCALE_DUD, EXPLOSION_SCALE_FROM, EXPLOSION_SCALE_HIT, EXPLOSION_TINT_DUD, EXPLOSION_TINT_HIT, SMOKE_PUFF_TEX_RADIUS_UNITS } from '../config/ui-config';

const NO_TINT = 0xffffff;
const RING_S = EXPLOSION_DURATION_MS / 1000;

export class ExplosionFx {
  private readonly flash: Phaser.GameObjects.Image[] = [];
  private readonly fire: Phaser.GameObjects.Image[] = [];
  /** 大きい版は水柱（tex-splash）、小さい版は暗い玉（tex-smoke-puff）＝同じ Image の texture を play で替える */
  private readonly wet: Phaser.GameObjects.Image[] = [];
  private readonly ring: Phaser.GameObjects.Image[] = [];
  private readonly age = new Float32Array(EXPLOSION_SLOTS).fill(Infinity);
  private readonly life = new Float32Array(EXPLOSION_SLOTS);
  private readonly small = new Uint8Array(EXPLOSION_SLOTS);
  private next = 0;
  /** テクスチャの半径（爆発の輪と同じ 40 単位）→ 世界の半径 m の scale */
  private readonly perM = 1 / EXPLOSION_RING_RADIUS_UNITS / RENDER_SCALE;
  private readonly puffPerM = 1 / SMOKE_PUFF_TEX_RADIUS_UNITS / RENDER_SCALE;

  constructor(scene: Phaser.Scene) {
    const add = scene.sys.game.renderer.type === RENDERER_WEBGL;
    const light = DEPTH.effects + ADD_DEPTH_STEP;
    for (let i = 0; i < EXPLOSION_SLOTS; i++) {
      const fl = scene.add.image(0, 0, TEXTURE_KEYS.muzzleFlash).setTint(EXPLOSION_FLASH_TINT).setDepth(light).setVisible(false);
      const fi = scene.add.image(0, 0, TEXTURE_KEYS.fireball).setTint(EXPLOSION_FIRE_TINT).setDepth(light).setVisible(false);
      if (add) {
        fl.setBlendMode(BLEND_ADD);
        fi.setBlendMode(BLEND_ADD);
      }
      this.flash.push(fl);
      this.fire.push(fi);
      this.wet.push(scene.add.image(0, 0, TEXTURE_KEYS.splash).setDepth(DEPTH.effects).setVisible(false));
      this.ring.push(scene.add.image(0, 0, TEXTURE_KEYS.explosionRing).setDepth(DEPTH.effects).setVisible(false));
    }
  }

  /** 爆発を置く（mission-effects の playExplosion から。dud は小さい版） */
  play(x: number, y: number, dud: boolean): void {
    const i = this.next;
    this.next = (this.next + 1) % EXPLOSION_SLOTS;
    this.age[i] = 0;
    this.small[i] = dud ? 1 : 0;
    this.life[i] = slotLifeS(dud, RING_S);
    const pm = this.perM;
    this.flash[i]!.setPosition(x, y).setScale((dud ? EXPLOSION_SMALL_FLASH_RADIUS_M : EXPLOSION_FLASH_RADIUS_M) * pm).setAlpha(1).setVisible(true);
    this.fire[i]!.setPosition(x, y).setScale(EXPLOSION_FIRE_RADIUS_M * pm * FIRE_GROW.from).setAlpha(1).setVisible(!dud);
    const wet = this.wet[i]!.setPosition(x, y);
    if (dud) wet.setTexture(TEXTURE_KEYS.smokePuff).setTint(FIRE_SMOKE_TINT).setScale(EXPLOSION_PUFF_RADIUS_M * this.puffPerM * PUFF_GROW.from).setAlpha(PUFF_GROW.alpha0);
    else wet.setTexture(TEXTURE_KEYS.splash).setTint(NO_TINT).setScale(EXPLOSION_SPLASH_RADIUS_M * pm * SPLASH_GROW.from).setAlpha(SPLASH_GROW.alpha0);
    wet.setVisible(true);
    this.ring[i]!.setPosition(x, y).setScale(EXPLOSION_SCALE_FROM / RENDER_SCALE).setTint(dud ? EXPLOSION_TINT_DUD : EXPLOSION_TINT_HIT).setAlpha(1).setVisible(true);
  }

  /** 毎フレーム（world-art から。realDt は見た目の時計）: 部品ごとに膨らみと薄れ、寿命が尽きた部品から隠す。枠の寿命で枠を閉じる */
  update(realDt: number): void {
    const pm = this.perM;
    for (let i = 0; i < EXPLOSION_SLOTS; i++) {
      const a0 = this.age[i]!;
      if (a0 === Infinity) continue;
      const a = a0 + realDt;
      if (a >= this.life[i]!) {
        this.age[i] = Infinity;
        this.flash[i]!.setVisible(false);
        this.fire[i]!.setVisible(false);
        this.wet[i]!.setVisible(false);
        this.ring[i]!.setVisible(false);
        continue;
      }
      this.age[i] = a;
      const dud = this.small[i] === 1;
      const fl = this.flash[i]!;
      const fs = flashLifeS(dud);
      if (a >= fs) {
        if (fl.visible) fl.setVisible(false);
      } else fl.setAlpha(1 - a / fs);
      if (!dud) {
        const fi = this.fire[i]!;
        if (a >= FIRE_GROW.life) {
          if (fi.visible) fi.setVisible(false);
        } else fi.setScale(EXPLOSION_FIRE_RADIUS_M * pm * partGrow(a, FIRE_GROW.life, FIRE_GROW.from)).setAlpha(partFade(a, FIRE_GROW.life, FIRE_GROW.alpha0));
      }
      const wet = this.wet[i]!;
      const g = dud ? PUFF_GROW : SPLASH_GROW;
      if (a >= g.life) {
        if (wet.visible) wet.setVisible(false);
      } else wet.setScale((dud ? EXPLOSION_PUFF_RADIUS_M * this.puffPerM : EXPLOSION_SPLASH_RADIUS_M * pm) * partGrow(a, g.life, g.from)).setAlpha(partFade(a, g.life, g.alpha0));
      const ring = this.ring[i]!;
      if (a >= RING_S) {
        if (ring.visible) ring.setVisible(false);
      } else {
        const e = easeOutCubic(a / RING_S);
        const to = dud ? EXPLOSION_SCALE_DUD : EXPLOSION_SCALE_HIT;
        ring.setScale((EXPLOSION_SCALE_FROM + (to - EXPLOSION_SCALE_FROM) * e) / RENDER_SCALE).setAlpha(1 - e);
      }
    }
  }

  destroy(): void {
    for (let i = 0; i < EXPLOSION_SLOTS; i++) {
      this.flash[i]!.destroy();
      this.fire[i]!.destroy();
      this.wet[i]!.destroy();
      this.ring[i]!.destroy();
    }
  }
}
