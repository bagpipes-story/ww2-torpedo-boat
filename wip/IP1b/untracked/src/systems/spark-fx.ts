// v0.7.0 IP1b（U3「もっと派手な演出、数でも大丈夫」）: 火花と水滴と硝煙のプール。爆発の破片（橙の火の筋が弧を描いて飛ぶ）・爆発と水柱の水滴（白い粒が跳ねて落ちる）・
// 砲口の火花（大砲と機銃）と大砲の硝煙（灰の小さな玉）・火災の火の粉・沈没の泡。火の筋は ADD（深さ SPARK_DEPTH ＋0.01）、水滴と泡は通常の重ね。尽きたら一番古いものを使い回す。
// 呼ぶ口: explosion-fx・blast-fx（爆発）、SplashPool の splash・muzzle（fx-bus 経由。水柱と 7 か所の砲口）、fire-fx（火の粉）、sink-fx（泡）。持ち主は world-art。
// §7: 確保は constructor だけ（Image・型付き配列）。update は読んで書くだけ。乱数は絵だけ（ART_SEED_SPARK）。論理の状態は読まない（呼ぶ側が位置を渡す）。
import type Phaser from 'phaser';
import { sparkPoseInto } from '../assets/blast-shape';
import {
  ART_SEED_SPARK, GUN_SMOKE_ALPHA, GUN_SMOKE_DRIFT_MPS, GUN_SMOKE_POOL, GUN_SMOKE_RADIUS_M, GUN_SMOKE_S, GUN_SMOKE_TINT, SPARK_DEPTH, SPARK_DROP_POOL, SPARK_HOT_POOL, SPARK_KINDS, SPARK_MUZZLE_BIG,
  SPARK_MUZZLE_SMALL, SPARK_SPRAY_HIT, SPARK_SPRAY_MISS, SPARK_TEX_H, SPARK_TEX_W, type SparkKindArt,
} from '../config/blast-art-config';
import { ADD_DEPTH_STEP, BLEND_ADD, FIRE_DRIFT_DEG } from '../config/fx-art-config';
import { RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import { RENDERER_WEBGL } from '../config/sea-art-config';
import { SMOKE_PUFF_TEX_RADIUS_UNITS } from '../config/ui-config';
import { SeededRng } from '../core/rng';

/** 1 つのプール（同じ絵・同じ重ね方の粒）の型付き配列 */
class Pool {
  readonly imgs: Phaser.GameObjects.Image[] = [];
  readonly age: Float32Array;
  readonly life: Float32Array;
  readonly x0: Float32Array;
  readonly y0: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly lift: Float32Array;
  readonly size: Float32Array;
  readonly grow: Uint8Array;
  next = 0;
  constructor(readonly n: number) {
    this.age = new Float32Array(n).fill(Infinity);
    this.life = new Float32Array(n).fill(1);
    this.x0 = new Float32Array(n);
    this.y0 = new Float32Array(n);
    this.vx = new Float32Array(n);
    this.vy = new Float32Array(n);
    this.lift = new Float32Array(n);
    this.size = new Float32Array(n);
    this.grow = new Uint8Array(n);
  }
}

export class SparkFx {
  private readonly hot = new Pool(SPARK_HOT_POOL);
  private readonly drop = new Pool(SPARK_DROP_POOL);
  private readonly smoke = new Pool(GUN_SMOKE_POOL);
  private readonly rng = new SeededRng(ART_SEED_SPARK);
  private readonly pose = new Float32Array(3);
  private readonly puffPerM = 1 / SMOKE_PUFF_TEX_RADIUS_UNITS / RENDER_SCALE;
  private readonly driftX = Math.sin((FIRE_DRIFT_DEG * Math.PI) / 180);
  private readonly driftY = -Math.cos((FIRE_DRIFT_DEG * Math.PI) / 180);

  constructor(scene: Phaser.Scene) {
    const add = scene.sys.game.renderer.type === RENDERER_WEBGL;
    for (let i = 0; i < SPARK_HOT_POOL; i++) {
      const im = scene.add.image(0, 0, TEXTURE_KEYS.spark, 'p0').setDepth(SPARK_DEPTH + ADD_DEPTH_STEP).setVisible(false);
      if (add) im.setBlendMode(BLEND_ADD);
      this.hot.imgs.push(im);
    }
    for (let i = 0; i < SPARK_DROP_POOL; i++) this.drop.imgs.push(scene.add.image(0, 0, TEXTURE_KEYS.spark, 'p1').setDepth(SPARK_DEPTH).setVisible(false));
    for (let i = 0; i < GUN_SMOKE_POOL; i++) this.smoke.imgs.push(scene.add.image(0, 0, TEXTURE_KEYS.smokePuff).setTint(GUN_SMOKE_TINT).setDepth(SPARK_DEPTH - 0.5).setVisible(false));
  }

  /** 爆発の破片（橙の火の筋。n 本・向きはばらばら） */
  debris(x: number, y: number, n: number): void {
    for (let k = 0; k < n; k++) this.spawn(this.hot, SPARK_KINDS.debris, x, y, this.rng.nextRange(0, Math.PI * 2), false);
  }

  /** 爆発と水柱の水滴（白い粒。n 粒） */
  drops(x: number, y: number, n: number): void {
    for (let k = 0; k < n; k++) this.spawn(this.drop, SPARK_KINDS.drop, x, y, this.rng.nextRange(0, Math.PI * 2), false);
  }

  /** 水柱の飛沫（SplashPool の splash から。外れは 3 粒・命中は 6 粒） */
  spray(x: number, y: number, hit: boolean): void {
    const n = hit ? SPARK_SPRAY_HIT : SPARK_SPRAY_MISS;
    for (let k = 0; k < n; k++) this.spawn(this.drop, SPARK_KINDS.spray, x, y, this.rng.nextRange(0, Math.PI * 2), false);
  }

  /** 砲口の火花（大砲は 4 本＋硝煙、機銃は 2 本） */
  muzzle(x: number, y: number, big: boolean): void {
    const n = big ? SPARK_MUZZLE_BIG : SPARK_MUZZLE_SMALL;
    for (let k = 0; k < n; k++) this.spawn(this.hot, SPARK_KINDS.muzzle, x, y, this.rng.nextRange(0, Math.PI * 2), false);
    if (!big) return;
    const p = this.smoke;
    const i = p.next;
    p.next = (i + 1) % p.n;
    p.age[i] = 0;
    p.life[i] = GUN_SMOKE_S;
    p.x0[i] = x;
    p.y0[i] = y;
    p.vx[i] = this.driftX * GUN_SMOKE_DRIFT_MPS;
    p.vy[i] = this.driftY * GUN_SMOKE_DRIFT_MPS;
  }

  /** 火災の火の粉（上へ舞う小さな橙） */
  ember(x: number, y: number): void {
    this.spawn(this.hot, SPARK_KINDS.ember, x, y, this.rng.nextRange(0, Math.PI * 2), false);
  }

  /** 沈没の泡（その場で膨らんで消える白い粒） */
  bubble(x: number, y: number): void {
    this.spawn(this.drop, SPARK_KINDS.bubble, x, y, this.rng.nextRange(0, Math.PI * 2), true);
  }

  private spawn(p: Pool, k: SparkKindArt, x: number, y: number, ang: number, grow: boolean): void {
    const i = p.next;
    p.next = (i + 1) % p.n;
    const sp = this.rng.nextRange(k.speed[0], k.speed[1]);
    p.age[i] = 0;
    p.life[i] = this.rng.nextRange(k.life[0], k.life[1]);
    p.x0[i] = x;
    p.y0[i] = y;
    p.vx[i] = Math.sin(ang) * sp;
    p.vy[i] = -Math.cos(ang) * sp;
    p.lift[i] = this.rng.nextRange(k.lift[0], k.lift[1]);
    p.size[i] = this.rng.nextRange(k.size[0], k.size[1]);
    p.grow[i] = grow ? 1 : 0;
    const img = p.imgs[i]!;
    img.setTint(k.tint).setAngle(p === this.hot ? (ang * 180) / Math.PI - 90 : 0);
  }

  /** 毎フレーム（world-art から。realDt は見た目の時計） */
  update(realDt: number): void {
    this.updatePool(this.hot, realDt, true);
    this.updatePool(this.drop, realDt, false);
    this.updateSmoke(realDt);
  }

  private updatePool(p: Pool, dt: number, streak: boolean): void {
    const o = this.pose;
    for (let i = 0; i < p.n; i++) {
      if (p.age[i] === Infinity) continue;
      const img = p.imgs[i]!;
      const a = p.age[i]! + dt;
      if (a >= p.life[i]!) {
        p.age[i] = Infinity;
        if (img.visible) img.setVisible(false);
        continue;
      }
      p.age[i] = a;
      sparkPoseInto(o, a, p.life[i]!, p.x0[i]!, p.y0[i]!, p.vx[i]!, p.vy[i]!, p.lift[i]!);
      const s = p.size[i]!;
      if (streak) img.setScale((s / SPARK_TEX_W) * (0.45 + 0.55 * o[2]!), (s * 0.5) / SPARK_TEX_W);
      else img.setScale(((2 * s) / SPARK_TEX_H) * (p.grow[i] ? 0.5 + (a / p.life[i]!) : 1));
      img.setPosition(o[0]!, o[1]!).setAlpha(o[2]!);
      if (!img.visible) img.setVisible(true);
    }
  }

  private updateSmoke(dt: number): void {
    const p = this.smoke;
    for (let i = 0; i < p.n; i++) {
      if (p.age[i] === Infinity) continue;
      const img = p.imgs[i]!;
      const a = p.age[i]! + dt;
      if (a >= p.life[i]!) {
        p.age[i] = Infinity;
        if (img.visible) img.setVisible(false);
        continue;
      }
      p.age[i] = a;
      const t = a / p.life[i]!;
      const r = GUN_SMOKE_RADIUS_M[0] + (GUN_SMOKE_RADIUS_M[1] - GUN_SMOKE_RADIUS_M[0]) * (1 - (1 - t) * (1 - t));
      img.setPosition(p.x0[i]! + p.vx[i]! * a, p.y0[i]! + p.vy[i]! * a).setScale(r * this.puffPerM).setAlpha(GUN_SMOKE_ALPHA * Math.min(1, t * 8) * (1 - t));
      if (!img.visible) img.setVisible(true);
    }
  }

  destroy(): void {
    for (const p of [this.hot, this.drop, this.smoke]) {
      for (const im of p.imgs) im.destroy();
      p.imgs.length = 0;
    }
  }
}
