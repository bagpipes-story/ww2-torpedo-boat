// v0.7.0 IP2（実機 2 回目の直し。ユーザーの U7「魚雷の爆発はもっと轟沈感を出すために派手に水柱を立たせてください」）: 魚雷の命中の水柱のプール。
// 1 枠: 柱の塊 6（tex-splash を縦に積む。速く上がって保ち、崩れて広がり薄れる）・根元の飛沫 2（平たい白い塊）・飛沫の輪と泡の輪（tex-shockwave。艦艇の下）・残る霧 3（tex-smoke-puff）。
// 全部の枠で分ける落ちる水滴のプール（tex-spark の p1。崩れ始めに柱の頂の近くから落ちる）。閃光は今の爆発（explosion-fx。U6 で落ち着かせた）のまま。
// 呼ぶ口は explosion-fx の play（mission-scene の onTorpedoHit が playExplosion に 'torpedo' を渡した時だけ＝見た目だけの引数。論理と呼ぶ順は変えない）。
// §7: 確保は constructor だけ。play・update は書くだけ。乱数は絵だけ（ART_SEED_COLUMN）。論理の状態は読まない（呼ぶ側が位置を渡す）。
import type Phaser from 'phaser';
import { columnBlobInto, columnFall, columnHeightM, columnRingInto, columnSkirtInto, rainHeightM } from '../assets/column-shape';
import { EXPLOSION_RING_RADIUS_UNITS } from '../assets/art-dims';
import {
  ART_SEED_COLUMN, COLUMN_BLOBS, COLUMN_BLOB_R_TOP_M, COLUMN_FOAM_RING_ALPHA, COLUMN_FOAM_RING_AT_S, COLUMN_FOAM_RING_R_M, COLUMN_FOAM_RING_S, COLUMN_FOAM_RING_TINT, COLUMN_MISTS, COLUMN_MIST_ALPHA,
  COLUMN_MIST_AT_S, COLUMN_MIST_DRIFT_MPS, COLUMN_MIST_HEIGHT, COLUMN_MIST_R_M, COLUMN_MIST_S, COLUMN_MIST_SINK_MPS, COLUMN_MIST_TINT, COLUMN_RAIN_AT_S, COLUMN_RAIN_GRAVITY, COLUMN_RAIN_HEIGHT,
  COLUMN_RAIN_PER, COLUMN_RAIN_POOL, COLUMN_RAIN_R_M, COLUMN_RAIN_SPREAD, COLUMN_RAIN_TINT, COLUMN_RAIN_VX, COLUMN_RING_DEPTH, COLUMN_SKIRTS, COLUMN_SKIRT_TINT, COLUMN_SLOTS, COLUMN_SLOT_S,
  COLUMN_SPRAY_RING_ALPHA, COLUMN_SPRAY_RING_R_M, COLUMN_SPRAY_RING_S, COLUMN_SPRAY_RING_TINT, COLUMN_TINT_BASE, COLUMN_TINT_TOP,
} from '../config/column-art-config';
import { ADD_DEPTH_STEP, FIRE_DRIFT_DEG, FIRE_SMOKE_DEPTH } from '../config/fx-art-config';
import { SHOCK_TEX_RING_PX, SPARK_DEPTH, SPARK_TEX_H } from '../config/blast-art-config';
import { DEPTH, RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import { SMOKE_PUFF_TEX_RADIUS_UNITS } from '../config/ui-config';
import { SeededRng } from '../core/rng';

/** 色の混ぜ（0x rrggbb を t で） */
function mixTint(a: number, b: number, t: number): number {
  const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * t);
  const g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * t);
  const bl = (a & 255) + (((b & 255) - (a & 255)) * t);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

export class TorpedoColumnFx {
  private readonly blobs: Phaser.GameObjects.Image[] = [];
  private readonly skirts: Phaser.GameObjects.Image[] = [];
  private readonly spray: Phaser.GameObjects.Image[] = [];
  private readonly foam: Phaser.GameObjects.Image[] = [];
  private readonly mists: Phaser.GameObjects.Image[] = [];
  private readonly rain: Phaser.GameObjects.Image[] = [];
  private readonly age = new Float32Array(COLUMN_SLOTS).fill(Infinity);
  private readonly cx = new Float32Array(COLUMN_SLOTS);
  private readonly cy = new Float32Array(COLUMN_SLOTS);
  private readonly rained = new Uint8Array(COLUMN_SLOTS);
  private readonly skirtDx = new Float32Array(COLUMN_SLOTS * COLUMN_SKIRTS);
  private readonly mistDx = new Float32Array(COLUMN_SLOTS * COLUMN_MISTS);
  private readonly mistH = new Float32Array(COLUMN_SLOTS * COLUMN_MISTS);
  private readonly mistR = new Float32Array(COLUMN_SLOTS * COLUMN_MISTS);
  private readonly rainAge = new Float32Array(COLUMN_RAIN_POOL).fill(Infinity);
  private readonly rainX = new Float32Array(COLUMN_RAIN_POOL);
  private readonly rainY = new Float32Array(COLUMN_RAIN_POOL);
  private readonly rainH = new Float32Array(COLUMN_RAIN_POOL);
  private readonly rainVx = new Float32Array(COLUMN_RAIN_POOL);
  private readonly rng = new SeededRng(ART_SEED_COLUMN);
  private readonly pose = new Float32Array(5);
  private next = 0;
  private nextRain = 0;
  private readonly perM = 1 / EXPLOSION_RING_RADIUS_UNITS / RENDER_SCALE;
  private readonly ringPerM = 1 / SHOCK_TEX_RING_PX;
  private readonly puffPerM = 1 / SMOKE_PUFF_TEX_RADIUS_UNITS / RENDER_SCALE;
  private readonly driftX = Math.sin((FIRE_DRIFT_DEG * Math.PI) / 180) * COLUMN_MIST_DRIFT_MPS;
  private readonly driftY = -Math.cos((FIRE_DRIFT_DEG * Math.PI) / 180) * COLUMN_MIST_DRIFT_MPS;

  constructor(scene: Phaser.Scene) {
    const top = DEPTH.effects - ADD_DEPTH_STEP;
    for (let i = 0; i < COLUMN_SLOTS; i++) {
      for (let j = 0; j < COLUMN_SKIRTS; j++) this.skirts.push(scene.add.image(0, 0, TEXTURE_KEYS.splash).setTint(COLUMN_SKIRT_TINT).setDepth(top - ADD_DEPTH_STEP).setVisible(false));
      for (let j = 0; j < COLUMN_BLOBS; j++) this.blobs.push(scene.add.image(0, 0, TEXTURE_KEYS.splash).setTint(mixTint(COLUMN_TINT_BASE, COLUMN_TINT_TOP, j / (COLUMN_BLOBS - 1))).setDepth(top).setVisible(false));
      this.spray.push(scene.add.image(0, 0, TEXTURE_KEYS.shockwave).setTint(COLUMN_SPRAY_RING_TINT).setDepth(COLUMN_RING_DEPTH).setVisible(false));
      this.foam.push(scene.add.image(0, 0, TEXTURE_KEYS.shockwave).setTint(COLUMN_FOAM_RING_TINT).setDepth(COLUMN_RING_DEPTH).setVisible(false));
      for (let j = 0; j < COLUMN_MISTS; j++) this.mists.push(scene.add.image(0, 0, TEXTURE_KEYS.smokePuff).setTint(COLUMN_MIST_TINT).setDepth(FIRE_SMOKE_DEPTH).setVisible(false));
    }
    for (let i = 0; i < COLUMN_RAIN_POOL; i++) this.rain.push(scene.add.image(0, 0, TEXTURE_KEYS.spark, 'p1').setTint(COLUMN_RAIN_TINT).setDepth(SPARK_DEPTH).setVisible(false));
  }

  /** 水柱を立てる（explosion-fx の play から。魚雷の命中で不発でない時だけ） */
  play(x: number, y: number): void {
    const i = this.next;
    this.next = (i + 1) % COLUMN_SLOTS;
    this.age[i] = 0;
    this.cx[i] = x;
    this.cy[i] = y;
    this.rained[i] = 0;
    for (let j = 0; j < COLUMN_SKIRTS; j++) this.skirtDx[i * COLUMN_SKIRTS + j] = (j === 0 ? -1 : 1) * this.rng.nextRange(6, 14);
    for (let j = 0; j < COLUMN_MISTS; j++) {
      const m = i * COLUMN_MISTS + j;
      this.mistDx[m] = this.rng.nextRange(-26, 26);
      this.mistH[m] = this.rng.nextRange(COLUMN_MIST_HEIGHT[0], COLUMN_MIST_HEIGHT[1]);
      this.mistR[m] = this.rng.nextRange(0.8, 1);
    }
    this.hideSlot(i);
  }

  private hideSlot(i: number): void {
    for (let j = 0; j < COLUMN_BLOBS; j++) this.blobs[i * COLUMN_BLOBS + j]!.setVisible(false);
    for (let j = 0; j < COLUMN_SKIRTS; j++) this.skirts[i * COLUMN_SKIRTS + j]!.setVisible(false);
    for (let j = 0; j < COLUMN_MISTS; j++) this.mists[i * COLUMN_MISTS + j]!.setVisible(false);
    this.spray[i]!.setVisible(false);
    this.foam[i]!.setVisible(false);
  }

  /** 崩れ始め: 柱の頂の近くから水滴を落とす */
  private letRain(i: number): void {
    const h = columnHeightM(COLUMN_RAIN_AT_S);
    for (let k = 0; k < COLUMN_RAIN_PER; k++) {
      const r = this.nextRain;
      this.nextRain = (r + 1) % COLUMN_RAIN_POOL;
      const side = this.rng.nextRange(-1, 1);
      this.rainAge[r] = 0;
      this.rainX[r] = this.cx[i]! + side * COLUMN_BLOB_R_TOP_M * COLUMN_RAIN_SPREAD * 0.6;
      this.rainY[r] = this.cy[i]! + this.rng.nextRange(-8, 8);
      this.rainH[r] = h * this.rng.nextRange(COLUMN_RAIN_HEIGHT[0], COLUMN_RAIN_HEIGHT[1]);
      this.rainVx[r] = Math.sign(side || 1) * this.rng.nextRange(COLUMN_RAIN_VX[0], COLUMN_RAIN_VX[1]);
      this.rain[r]!.setScale((2 * this.rng.nextRange(COLUMN_RAIN_R_M[0], COLUMN_RAIN_R_M[1])) / SPARK_TEX_H);
    }
  }

  /** 毎フレーム（explosion-fx の update から。realDt は見た目の時計） */
  update(realDt: number): void {
    const o = this.pose;
    for (let i = 0; i < COLUMN_SLOTS; i++) {
      if (this.age[i] === Infinity) continue;
      const a = this.age[i]! + realDt;
      if (a >= COLUMN_SLOT_S) {
        this.age[i] = Infinity;
        this.hideSlot(i);
        continue;
      }
      this.age[i] = a;
      const x = this.cx[i]!;
      const y = this.cy[i]!;
      if (!this.rained[i] && a >= COLUMN_RAIN_AT_S) {
        this.rained[i] = 1;
        this.letRain(i);
      }
      for (let j = 0; j < COLUMN_BLOBS; j++) {
        const img = this.blobs[i * COLUMN_BLOBS + j]!;
        columnBlobInto(o, a, j);
        if (o[3]! <= 0) {
          if (img.visible) img.setVisible(false);
          continue;
        }
        img.setPosition(x, y - o[0]!).setScale(o[1]! * this.perM, o[2]! * this.perM).setAlpha(o[3]!);
        if (!img.visible) img.setVisible(true);
      }
      columnSkirtInto(o, a);
      for (let j = 0; j < COLUMN_SKIRTS; j++) {
        const img = this.skirts[i * COLUMN_SKIRTS + j]!;
        if (o[2]! <= 0) {
          if (img.visible) img.setVisible(false);
          continue;
        }
        img.setPosition(x + this.skirtDx[i * COLUMN_SKIRTS + j]! * (1 + columnFall(a)), y).setScale(o[0]! * this.perM, o[1]! * this.perM).setAlpha(o[2]!);
        if (!img.visible) img.setVisible(true);
      }
      this.ring(this.spray[i]!, x, y, columnRingInto(o, a, 0, COLUMN_SPRAY_RING_S, COLUMN_SPRAY_RING_R_M[0], COLUMN_SPRAY_RING_R_M[1], COLUMN_SPRAY_RING_ALPHA));
      this.ring(this.foam[i]!, x, y, columnRingInto(o, a, COLUMN_FOAM_RING_AT_S, COLUMN_FOAM_RING_S, COLUMN_FOAM_RING_R_M[0], COLUMN_FOAM_RING_R_M[1], COLUMN_FOAM_RING_ALPHA));
      const ma = a - COLUMN_MIST_AT_S;
      for (let j = 0; j < COLUMN_MISTS; j++) {
        const img = this.mists[i * COLUMN_MISTS + j]!;
        if (ma <= 0 || ma >= COLUMN_MIST_S) {
          if (img.visible) img.setVisible(false);
          continue;
        }
        const m = i * COLUMN_MISTS + j;
        const t = ma / COLUMN_MIST_S;
        const r = (COLUMN_MIST_R_M[0] + (COLUMN_MIST_R_M[1] - COLUMN_MIST_R_M[0]) * (1 - (1 - t) * (1 - t))) * this.mistR[m]!;
        const lift = Math.max(0, this.mistH[m]! * columnHeightM(COLUMN_MIST_AT_S) - COLUMN_MIST_SINK_MPS * ma);
        img.setPosition(x + this.mistDx[m]! + this.driftX * ma, y + this.driftY * ma - lift).setScale(r * this.puffPerM).setAlpha(COLUMN_MIST_ALPHA * Math.min(1, ma / 0.4) * (1 - t));
        if (!img.visible) img.setVisible(true);
      }
    }
    this.updateRain(realDt);
  }

  private ring(img: Phaser.GameObjects.Image, x: number, y: number, o: Float32Array): void {
    if (o[1]! <= 0) {
      if (img.visible) img.setVisible(false);
      return;
    }
    img.setPosition(x, y).setScale(o[0]! * this.ringPerM).setAlpha(o[1]!);
    if (!img.visible) img.setVisible(true);
  }

  private updateRain(dt: number): void {
    for (let r = 0; r < COLUMN_RAIN_POOL; r++) {
      if (this.rainAge[r] === Infinity) continue;
      const img = this.rain[r]!;
      const t = this.rainAge[r]! + dt;
      const h = rainHeightM(this.rainH[r]!, t, COLUMN_RAIN_GRAVITY);
      if (h <= 0) {
        this.rainAge[r] = Infinity;
        if (img.visible) img.setVisible(false);
        continue;
      }
      this.rainAge[r] = t;
      img.setPosition(this.rainX[r]! + this.rainVx[r]! * t, this.rainY[r]! - h).setAlpha(Math.min(1, 0.4 + h / 40));
      if (!img.visible) img.setVisible(true);
    }
  }

  destroy(): void {
    for (const list of [this.blobs, this.skirts, this.spray, this.foam, this.mists, this.rain]) {
      for (const im of list) im.destroy();
      list.length = 0;
    }
  }
}
