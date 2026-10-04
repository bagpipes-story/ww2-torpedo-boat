// 魚雷と雷跡のプール（CLAUDE.md §7: update 内で new しない。起動時に全部作って使い回す）。
// 運動・武装・射程は core/torpedo.ts、命中幾何は core/torpedo-solver.ts。
import Phaser from 'phaser';
import { DEPTH, RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import { WAKE_DOT_ALPHA, WAKE_DOT_LIFETIME_S, WAKE_DOT_POOL_SIZE, WAKE_DOT_SPACING_M } from '../config/ui-config';
import type { SeaBounds } from '../core/boat-motion';
import {
  consumeWakeMark,
  createTorpedoState,
  isArmed,
  launchTorpedo,
  markMissIfPassed,
  stepTorpedo,
  type TorpedoParams,
  type TorpedoState,
} from '../core/torpedo';
import { pointHitsHull, type Circle } from '../core/torpedo-solver';

/** 魚雷の結果通知。引数はプリミティブのみ（確保しない） */
export interface TorpedoEvents {
  onHit(x: number, y: number, dud: boolean, erratic: boolean, rangeAtLaunchM: number): void;
  onMiss(erratic: boolean, rangeAtLaunchM: number): void;
}

export class TorpedoPool {
  private readonly states: TorpedoState[] = [];
  private readonly sprites: Phaser.GameObjects.Image[] = [];
  private readonly wakeDots: Phaser.GameObjects.Image[] = [];
  private readonly wakeAges: Float32Array;
  private wakeNext = 0;
  private firedCount = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly params: TorpedoParams,
    readonly capacity: number,
    private readonly bounds: SeaBounds,
  ) {
    for (let i = 0; i < capacity; i++) {
      this.states.push(createTorpedoState());
      this.sprites.push(scene.add.image(0, 0, TEXTURE_KEYS.torpedo).setScale(1 / RENDER_SCALE).setDepth(DEPTH.torpedo).setVisible(false));
    }
    this.wakeAges = new Float32Array(WAKE_DOT_POOL_SIZE).fill(Infinity);
    for (let i = 0; i < WAKE_DOT_POOL_SIZE; i++) {
      this.wakeDots.push(scene.add.image(0, 0, TEXTURE_KEYS.wakeDot).setScale(1 / RENDER_SCALE).setDepth(DEPTH.wake).setVisible(false));
    }
  }

  /** 残弾 */
  get remaining(): number {
    return this.capacity - this.firedCount;
  }

  get activeCount(): number {
    let n = 0;
    for (let i = 0; i < this.states.length; i++) if (this.states[i]!.active) n++;
    return n;
  }

  /** 結果が未確定の魚雷の数。0 になれば任務を終えてよい（表示上はまだ走っていてもよい） */
  get unresolvedCount(): number {
    let n = 0;
    for (let i = 0; i < this.states.length; i++) {
      const s = this.states[i]!;
      if (s.active && !s.resolved) n++;
    }
    return n;
  }

  /** 1 本発射。残弾が無ければ false。引数はプリミティブ（確保しない） */
  fire(x: number, y: number, headingDeg: number, dud: boolean, erratic: boolean, erraticBiasDeg: number, rangeAtLaunchM: number): boolean {
    if (this.remaining <= 0) return false;
    const s = this.states[this.firedCount]!;
    this.firedCount++;
    launchTorpedo(s, x, y, headingDeg, dud, erratic, erraticBiasDeg, rangeAtLaunchM, WAKE_DOT_SPACING_M);
    const img = this.sprites[this.firedCount - 1]!;
    img.setPosition(x, y).setAngle(s.headingDeg).setVisible(true);
    return true;
  }

  /**
   * 固定ステップ。dt は time_scale 込み、realDt は実時間。
   * hull が null でなければ武装済みの魚雷と船体の命中を判定し、目標（中心 targetX/Y）を通り過ぎた魚雷は外れとして確定する。
   */
  step(dt: number, realDt: number, hull: Circle[] | null, targetX: number, targetY: number, passRadius2: number, events: TorpedoEvents): void {
    for (let i = 0; i < this.states.length; i++) {
      const s = this.states[i]!;
      if (!s.active) continue;
      const expired = stepTorpedo(s, this.params, dt, realDt);
      while (consumeWakeMark(s, WAKE_DOT_SPACING_M)) this.placeWakeDot(s.x, s.y);
      if (expired || s.x < 0 || s.y < 0 || s.x > this.bounds.width || s.y > this.bounds.height) {
        s.active = false;
        if (!s.resolved) events.onMiss(s.erratic, s.rangeAtLaunchM);
        continue;
      }
      if (!hull || s.resolved) continue;
      if (isArmed(s, this.params) && pointHitsHull(s.x, s.y, hull)) {
        s.active = false;
        s.resolved = true;
        events.onHit(s.x, s.y, s.dud, s.erratic, s.rangeAtLaunchM);
        continue;
      }
      if (markMissIfPassed(s, this.params, targetX, targetY, passRadius2)) {
        events.onMiss(s.erratic, s.rangeAtLaunchM);
      }
    }
  }

  /** 任務終了時: まだ結果が確定していない魚雷をすべて外れとして確定する（記録漏れを防ぐ。CLAUDE.md §9） */
  resolveRemainingAsMisses(events: TorpedoEvents): void {
    for (let i = 0; i < this.states.length; i++) {
      const s = this.states[i]!;
      if (!s.active || s.resolved) continue;
      s.resolved = true;
      events.onMiss(s.erratic, s.rangeAtLaunchM);
    }
  }

  private placeWakeDot(x: number, y: number): void {
    const i = this.wakeNext;
    this.wakeNext = (this.wakeNext + 1) % WAKE_DOT_POOL_SIZE;
    this.wakeAges[i] = 0;
    this.wakeDots[i]!.setPosition(x, y).setAlpha(WAKE_DOT_ALPHA).setVisible(true);
  }

  /** 毎フレーム: スプライトの位置と雷跡の減衰（値が変わるものだけ触る） */
  updateVisuals(realDt: number): void {
    for (let i = 0; i < this.states.length; i++) {
      const s = this.states[i]!;
      const img = this.sprites[i]!;
      if (!s.active) {
        if (img.visible) img.setVisible(false);
        continue;
      }
      img.setPosition(s.x, s.y).setAngle(s.headingDeg);
    }
    for (let i = 0; i < WAKE_DOT_POOL_SIZE; i++) {
      const age = this.wakeAges[i]!;
      if (age === Infinity) continue;
      const next = age + realDt;
      if (next >= WAKE_DOT_LIFETIME_S) {
        this.wakeAges[i] = Infinity;
        this.wakeDots[i]!.setVisible(false);
        continue;
      }
      this.wakeAges[i] = next;
      this.wakeDots[i]!.setAlpha(WAKE_DOT_ALPHA * (1 - next / WAKE_DOT_LIFETIME_S));
    }
  }

  destroy(): void {
    for (const s of this.sprites) s.destroy();
    for (const d of this.wakeDots) d.destroy();
  }
}
