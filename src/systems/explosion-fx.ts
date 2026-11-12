// v0.7.0 S3b（アートと音①：コードで描く絵。spec-v0700 §5.3・R11・R12・D7）: 爆発のプール。EXPLOSION_SLOTS 枠 × 4 部品（閃光・火球・水柱／暗い玉・輪）＝Image 16。
// 大きい版（命中・撃破・沈没）: 閃光（tex-muzzle-flash を大きく・ADD・0.15 秒）＋火球（tex-fireball・ADD・0.5 秒で膨らむ）＋水柱（tex-splash 白・0.8 秒）＋今の輪（橙。結果を読む印＝D7。
//   scale 0.2 → 1.6・α 1 → 0・Cubic.easeOut 0.6 秒＝v0.6.11 の tween と同じ曲線を毎フレームの式で）。
// 小さい版（dud＝魚雷の不発・自艇の小さな被弾・僚艇の被弾・座礁）: 小さな閃光（0.1 秒）＋灰の輪（0.2 → 0.6）＋暗い玉 1 つ（tex-smoke-puff を暗く・半径 ≤ 15 m）。水柱は出さない（R11）。
// 5 つ目は一番古い枠を使い回す。毎回の new と tween をやめた（§7）。ADD の 2 部品は深さ ＋0.01 にまとめる（R25）。Canvas レンダラーでは ADD を使わない（通常の重ね）。
// 持ち主は world-art（世界の作成時に作り、mission-effects に登録し、破棄で外す＝R12）。§7: 確保は constructor だけ。update は読んで書くだけ。
// IP1b（U3「もっと派手な演出、数でも大丈夫」）: 枠 4 → 6・閃光と火球と水柱を大きく長く、同じ枠の番号で 2 段目（systems/blast-fx: 2 つ目の閃光・2 つ目の火球・水柱の柱・水面の衝撃波・
//   爆発の煙）と破片の火花・水滴（systems/spark-fx）を出す。沈没の段の 2 次の爆発（sink-fx から secondary）は 2 段目だけ（輪なし＝結果の印にしない）。
// IP2（実機 2 回目。U6「フラッシュのような白色や輝度は落ち着かせてください」・U7「魚雷の爆発は…派手に水柱を立たせてください」）: 閃光は琥珀・α 0.55、火球は α 0.8、水柱は薄い灰青・α 0.7
//   （大きさと長さは IP1b のまま）。昼の海（夜明けの段）は ADD の閃光と火球の α を下げる（setDaylight）。魚雷の命中（play の torpedo）は白い水柱の代わりに大きな水柱（torpedo-column-fx）。
import type Phaser from 'phaser';
import { FIRE_GROW, PUFF_GROW, SPLASH_GROW, easeOutCubic, flashLifeS, partFade, partGrow, slotLifeS } from '../assets/fx-shape';
import { EXPLOSION_RING_RADIUS_UNITS } from '../assets/art-dims';
import {
  ADD_DEPTH_STEP, BLEND_ADD, EXPLOSION_DAY_ADD_DIM, EXPLOSION_FIRE_RADIUS_M, EXPLOSION_FIRE_TINT, EXPLOSION_FLASH_ALPHA, EXPLOSION_FLASH_RADIUS_M, EXPLOSION_FLASH_TINT, EXPLOSION_PUFF_RADIUS_M,
  EXPLOSION_SLOTS, EXPLOSION_SMALL_FLASH_RADIUS_M, EXPLOSION_SPLASH_RADIUS_M, EXPLOSION_SPLASH_TINT, FIRE_SMOKE_TINT,
} from '../config/fx-art-config';
import { DEPTH, RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import { BlastFx } from './blast-fx';
import type { SparkFx } from './spark-fx';
import { TorpedoColumnFx } from './torpedo-column-fx';
import { RENDERER_WEBGL } from '../config/sea-art-config';
import { EXPLOSION_DURATION_MS, EXPLOSION_SCALE_DUD, EXPLOSION_SCALE_FROM, EXPLOSION_SCALE_HIT, EXPLOSION_TINT_DUD, EXPLOSION_TINT_HIT, SMOKE_PUFF_TEX_RADIUS_UNITS } from '../config/ui-config';

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
  /** 2 段目（IP1b。同じ枠の番号） */
  private readonly blast: BlastFx;
  /** 魚雷の命中の水柱（IP2） */
  private readonly column: TorpedoColumnFx;
  /** 昼の海で ADD の閃光と火球の α に掛ける（夜は 1） */
  private addMul = 1;

  constructor(scene: Phaser.Scene, sparks: SparkFx) {
    this.blast = new BlastFx(scene, sparks);
    this.column = new TorpedoColumnFx(scene);
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

  /** 爆発を置く（mission-effects の playExplosion から。dud は小さい版、torpedo は魚雷の命中＝見た目だけの印（IP2）） */
  play(x: number, y: number, dud: boolean, torpedo = false): void {
    const i = this.next;
    this.next = (this.next + 1) % EXPLOSION_SLOTS;
    this.age[i] = 0;
    this.small[i] = dud ? 1 : 0;
    this.life[i] = slotLifeS(dud, RING_S);
    const pm = this.perM;
    this.flash[i]!.setPosition(x, y).setScale((dud ? EXPLOSION_SMALL_FLASH_RADIUS_M : EXPLOSION_FLASH_RADIUS_M) * pm).setAlpha(EXPLOSION_FLASH_ALPHA * this.addMul).setVisible(true);
    this.fire[i]!.setPosition(x, y).setScale(EXPLOSION_FIRE_RADIUS_M * pm * FIRE_GROW.from).setAlpha(FIRE_GROW.alpha0 * this.addMul).setVisible(!dud);
    const wet = this.wet[i]!.setPosition(x, y);
    if (dud) wet.setTexture(TEXTURE_KEYS.smokePuff).setTint(FIRE_SMOKE_TINT).setScale(EXPLOSION_PUFF_RADIUS_M * this.puffPerM * PUFF_GROW.from).setAlpha(PUFF_GROW.alpha0);
    else wet.setTexture(TEXTURE_KEYS.splash).setTint(EXPLOSION_SPLASH_TINT).setScale(EXPLOSION_SPLASH_RADIUS_M * pm * SPLASH_GROW.from).setAlpha(SPLASH_GROW.alpha0);
    wet.setVisible(!(torpedo && !dud)); // 魚雷の命中は水柱の根元の飛沫が代わり
    this.ring[i]!.setPosition(x, y).setScale(EXPLOSION_SCALE_FROM / RENDER_SCALE).setTint(dud ? EXPLOSION_TINT_DUD : EXPLOSION_TINT_HIT).setAlpha(1).setVisible(true);
    this.blast.play(i, x, y, dud, torpedo);
    if (torpedo && !dud) this.column.play(x, y);
  }

  /** 昼の割合（0＝夜・1＝昼。world-art が夜明けの段 lightStep / 16 を毎フレーム渡す）: 明るい海に ADD の光を足すと白く飛ぶので α を下げる（U6） */
  setDaylight(f: number): void {
    const m = 1 - EXPLOSION_DAY_ADD_DIM * Math.min(1, Math.max(0, f));
    if (m === this.addMul) return;
    this.addMul = m;
    this.blast.setAddMul(m);
  }

  /** 沈没の段の 2 次の爆発（sink-fx から。2 段目の閃光と火球・煙・破片だけ＝輪は出さない） */
  secondary(x: number, y: number): void {
    this.blast.secondary(x, y);
  }

  /** 毎フレーム（world-art から。realDt は見た目の時計）: 部品ごとに膨らみと薄れ、寿命が尽きた部品から隠す。枠の寿命で枠を閉じる */
  update(realDt: number): void {
    this.blast.update(realDt);
    this.column.update(realDt);
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
      } else fl.setAlpha(EXPLOSION_FLASH_ALPHA * this.addMul * (1 - a / fs));
      if (!dud) {
        const fi = this.fire[i]!;
        if (a >= FIRE_GROW.life) {
          if (fi.visible) fi.setVisible(false);
        } else fi.setScale(EXPLOSION_FIRE_RADIUS_M * pm * partGrow(a, FIRE_GROW.life, FIRE_GROW.from)).setAlpha(partFade(a, FIRE_GROW.life, FIRE_GROW.alpha0 * this.addMul));
      }
      const wet = this.wet[i]!;
      const g = dud ? PUFF_GROW : SPLASH_GROW;
      if (wet.visible) { // 魚雷の命中は play で隠した（水柱が代わり）
        if (a >= g.life) wet.setVisible(false);
        else wet.setScale((dud ? EXPLOSION_PUFF_RADIUS_M * this.puffPerM : EXPLOSION_SPLASH_RADIUS_M * pm) * partGrow(a, g.life, g.from)).setAlpha(partFade(a, g.life, g.alpha0));
      }
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
    this.blast.destroy();
    this.column.destroy();
  }
}
