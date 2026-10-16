// 駆逐艦の隊（v0.4.5。難易度ハードで 2 隻以上）: 艦（entities/destroyer）とその反撃（enemy-fire）を隻数ぶん持ち、世界・敵の側・テレメトリが「どれか／すべて／最寄り」で読む。
// 砲撃の乱数は 1 つの系列（seed+1）を艦の順に消費する（1 隻ならこれまでと同じ）。§7: 確保しない（最寄りは添字で返す）。
import type Phaser from 'phaser';
import type { BoatState, SeaBounds } from '../core/boat-motion';
import type { SeededRng } from '../core/rng';
import { Destroyer } from '../entities/destroyer';
import { EnemyFire } from './enemy-fire';
import type { SplashPool } from './splash-pool';
import type { DestroyerSetup } from './world-setup';

export class DestroyerGroup {
  readonly ships: Destroyer[] = [];
  readonly fires: EnemyFire[] = [];

  constructor(scene: Phaser.Scene, ds: DestroyerSetup, bounds: SeaBounds, gunRng: SeededRng, splashes: SplashPool) {
    for (const st of ds.starts) {
      this.ships.push(new Destroyer(scene, st, ds.spec, ds.shipAi, bounds));
      this.fires.push(new EnemyFire(scene, ds.gunnery, gunRng, st.headingDeg, splashes));
    }
  }

  get total(): number {
    return this.ships.length;
  }

  /** 沈み始めた隻数（撃沈の表示） */
  get sunkCount(): number {
    let n = 0;
    for (const s of this.ships) if (s.sinking) n++;
    return n;
  }

  /** すべて沈み始めた（任務の目標。以後は魚雷を撃てない） */
  get allSinking(): boolean {
    for (const s of this.ships) if (!s.sinking) return false;
    return true;
  }

  /** すべての沈没演出が終わった */
  get allSunk(): boolean {
    for (const s of this.ships) if (!s.sunk) return false;
    return true;
  }

  /** どれかが沈没演出中（終了判定・味方機・水上機を待たせる） */
  get anySinkPlaying(): boolean {
    for (const s of this.ships) if (s.sinking && !s.sunk) return true;
    return false;
  }

  /** 浮いているどれかが自艇を見つけている */
  get anyDetected(): boolean {
    for (const s of this.ships) if (!s.sinking && s.ai.playerDetected) return true;
    return false;
  }

  /** 浮いているどれかの探照灯・星弾・照明弾に照らされている */
  get anyIlluminated(): boolean {
    for (let i = 0; i < this.ships.length; i++) if (!this.ships[i]!.sinking && this.fires[i]!.illuminated) return true;
    return false;
  }

  /** どれかの星弾が照らしている（HUD の「照明弾！」） */
  get anyStarLit(): boolean {
    for (const f of this.fires) if (f.state.star.illuminating) return true;
    return false;
  }

  get shotsFired(): number {
    let n = 0;
    for (const f of this.fires) n += f.shotsFired;
    return n;
  }

  /** (x, y) に最も近い浮いている艦の添字（無ければ -1）。平方根なし */
  nearestAfloatIndex(x: number, y: number): number {
    let best = -1;
    let bestD2 = Infinity;
    for (let i = 0; i < this.ships.length; i++) {
      const s = this.ships[i]!;
      if (s.sinking) continue;
      const dx = s.state.x - x;
      const dy = s.state.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = i;
      }
    }
    return best;
  }

  nearestAfloat(x: number, y: number): Destroyer | null {
    const i = this.nearestAfloatIndex(x, y);
    return i < 0 ? null : this.ships[i]!;
  }

  /** どれかの船体に艇が触れている（体当たり） */
  touchesBoat(boat: BoatState, boatHalfLengthM: number): boolean {
    for (const s of this.ships) if (s.touchesBoat(boat, boatHalfLengthM)) return true;
    return false;
  }

  syncSprites(): void {
    for (const s of this.ships) s.syncSprite();
  }

  updateVisuals(realDt: number): void {
    for (let i = 0; i < this.ships.length; i++) this.fires[i]!.updateVisuals(realDt, this.ships[i]!.state);
  }

  destroy(): void {
    for (const f of this.fires) f.destroy();
    for (const s of this.ships) s.destroy();
  }
}
