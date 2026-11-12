// v0.7.0 IP1b（U3「もっと派手な演出、数でも大丈夫」）: 沈没の段。fire-fx の沈没の始まり（見えていた発生源の sinking が立ったフレーム）から、油の輪と煙の柱（fire-fx）に重ねて:
// 2 次の爆発（艦 5 回・小艇 2 回。船体の長さに沿った所。explosion-fx の secondary＝輪なし）、艦の上の炎 3 つ（tex-flame・ADD。艦首・中央・艦尾の近く・終わりで小さく）、
// 沈む所から湧く泡（spark-fx の bubble。6.5 秒）。枠 SINK_SLOTS（3 つ目は一番古い枠）。
// §7: 確保は constructor だけ。start・update は書くだけ。乱数は絵だけ（ART_SEED_SINK）。論理の状態は読まない（fire-fx が位置・向き・寸法を渡す）。
import type Phaser from 'phaser';
import { sinkBlastAtInto, sinkBlastTimes } from '../assets/blast-shape';
import { flameFlicker } from '../assets/fire-shape';
import {
  ART_SEED_SINK, SINK_BLAST_SPREAD, SINK_BUBBLE_INTERVAL_S, SINK_BUBBLE_S, SINK_BUBBLE_SPREAD, SINK_FLAME_AT, SINK_FLAME_DIAMETER_M, SINK_FLAME_S, SINK_FLAMES_PER_SLOT, SINK_SLOTS,
} from '../config/blast-art-config';
import { ADD_DEPTH_STEP, BLEND_ADD, FIRE_SMOKE_DEPTH, FLAME_BODY_SHARE, FLAME_FRAME_S, FLAME_TEX_PX } from '../config/fx-art-config';
import { TEXTURE_KEYS } from '../config/game-config';
import { RENDERER_WEBGL } from '../config/sea-art-config';
import { SeededRng } from '../core/rng';
import type { ExplosionFx } from './explosion-fx';
import type { SparkFx } from './spark-fx';

export class SinkFx {
  private readonly flames: Phaser.GameObjects.Image[] = [];
  private readonly age = new Float32Array(SINK_SLOTS).fill(Infinity);
  private readonly x = new Float32Array(SINK_SLOTS);
  private readonly y = new Float32Array(SINK_SLOTS);
  private readonly rot = new Float32Array(SINK_SLOTS);
  private readonly len = new Float32Array(SINK_SLOTS);
  private readonly beam = new Float32Array(SINK_SLOTS);
  private readonly ship = new Uint8Array(SINK_SLOTS);
  private readonly blastsDone = new Uint8Array(SINK_SLOTS);
  private readonly bubbleIn = new Float32Array(SINK_SLOTS);
  private readonly phase = new Float32Array(SINK_SLOTS * SINK_FLAMES_PER_SLOT);
  private readonly at = new Float32Array(2);
  private readonly flick = new Float32Array(2);
  private readonly rng = new SeededRng(ART_SEED_SINK);
  private next = 0;
  private t = 0;

  constructor(scene: Phaser.Scene, private readonly explosions: ExplosionFx, private readonly sparks: SparkFx) {
    const add = scene.sys.game.renderer.type === RENDERER_WEBGL;
    for (let i = 0; i < SINK_SLOTS * SINK_FLAMES_PER_SLOT; i++) {
      const f = scene.add.image(0, 0, TEXTURE_KEYS.flame, 'p0').setDepth(FIRE_SMOKE_DEPTH + ADD_DEPTH_STEP).setVisible(false);
      if (add) f.setBlendMode(BLEND_ADD);
      this.flames.push(f);
      this.phase[i] = this.rng.nextRange(0, Math.PI * 2);
    }
  }

  /** 沈没の始まり（fire-fx から）: 位置・艇首の向き（ラジアン・0＝北）・船体の長さと幅 m・艦か */
  start(x: number, y: number, rot: number, lenM: number, beamM: number, ship: boolean): void {
    const s = this.next;
    this.next = (s + 1) % SINK_SLOTS;
    this.age[s] = 0;
    this.x[s] = x;
    this.y[s] = y;
    this.rot[s] = rot;
    this.len[s] = lenM;
    this.beam[s] = beamM;
    this.ship[s] = ship ? 1 : 0;
    this.blastsDone[s] = 0;
    this.bubbleIn[s] = 0;
    for (let k = 0; k < SINK_FLAMES_PER_SLOT; k++) this.flames[s * SINK_FLAMES_PER_SLOT + k]!.setVisible(false);
  }

  /** 毎フレーム（fire-fx の update の後に world-art から） */
  update(realDt: number): void {
    this.t += realDt;
    for (let s = 0; s < SINK_SLOTS; s++) {
      if (this.age[s] === Infinity) continue;
      const a = this.age[s]! + realDt;
      this.age[s] = a;
      const ship = this.ship[s] === 1;
      const times = sinkBlastTimes(ship);
      while (this.blastsDone[s]! < times.length && a >= times[this.blastsDone[s]!]!) {
        this.blastsDone[s] = this.blastsDone[s]! + 1;
        sinkBlastAtInto(this.at, this.x[s]!, this.y[s]!, this.rot[s]!, this.len[s]!, this.beam[s]!, this.rng.nextRange(-0.5, 0.5), this.rng.nextRange(-0.5, 0.5));
        this.explosions.secondary(this.at[0]!, this.at[1]!);
      }
      this.bubbleIn[s] = this.bubbleIn[s]! - realDt;
      if (a < SINK_BUBBLE_S && this.bubbleIn[s]! <= 0) {
        this.bubbleIn[s] = SINK_BUBBLE_INTERVAL_S * (ship ? 1 : 2.5);
        const r = this.beam[s]! * SINK_BUBBLE_SPREAD;
        this.sparks.bubble(this.x[s]! + this.rng.nextRange(-r, r), this.y[s]! + this.rng.nextRange(-r, r));
      }
      this.updateFlames(s, a, ship);
      if (a >= SINK_BUBBLE_S && a >= SINK_FLAME_S && this.blastsDone[s]! >= times.length) this.age[s] = Infinity;
    }
  }

  private updateFlames(s: number, a: number, ship: boolean): void {
    for (let k = 0; k < SINK_FLAMES_PER_SLOT; k++) {
      const i = s * SINK_FLAMES_PER_SLOT + k;
      const f = this.flames[i]!;
      const start = 0.25 + k * 0.35;
      if (!ship || a < start || a >= SINK_FLAME_S) {
        if (f.visible) f.setVisible(false);
        continue;
      }
      const left = 1 - (a - start) / (SINK_FLAME_S - start);
      flameFlicker(this.t, this.phase[i]!, this.flick);
      sinkBlastAtInto(this.at, this.x[s]!, this.y[s]!, this.rot[s]!, this.len[s]!, 0, SINK_FLAME_AT[k]! / (2 * SINK_BLAST_SPREAD), 0);
      const frame = Math.floor((this.t + this.phase[i]!) / FLAME_FRAME_S) % 2 === 0 ? 'p0' : 'p1';
      if (f.frame.name !== frame) f.setFrame(frame);
      const size = (SINK_FLAME_DIAMETER_M / FLAME_BODY_SHARE / FLAME_TEX_PX) * this.flick[1]! * (0.35 + 0.65 * Math.min(1, left * 1.6));
      f.setPosition(this.at[0]!, this.at[1]!).setScale(size).setAlpha(this.flick[0]!).setAngle((this.phase[i]! * 180) / Math.PI);
      if (!f.visible) f.setVisible(true);
    }
  }

  destroy(): void {
    for (const f of this.flames) f.destroy();
    this.flames.length = 0;
  }
}
