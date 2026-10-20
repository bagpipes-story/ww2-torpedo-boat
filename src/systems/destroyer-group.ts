// 駆逐艦の隊（v0.4.5。難易度ハードで 2 隻以上。v0.4.7 から輸送船も隊の 1 隻）: 艦（entities/destroyer）とその反撃（enemy-fire）を隻数ぶん持ち、世界・敵の側・テレメトリが「どれか／すべて／最寄り」で読む。
// 夜明けに退く（v0.6.2）: withdraw() で全艦が退く向きへ全速、海域を出た艦は out（狙えない・見えない・撃たない）。撃沈の数・達成・allSinking は沈み始めた艦だけ（退いた艦は数えない）。
// 任務の達成は駆逐艦だけ（輸送船は撃破の加点）。砲撃の乱数は 1 つの系列（seed+1）を、見張り（雷跡に気づく。v0.5.0）の乱数は別の系列（seed+17）を、それぞれ艦の順に消費する（1 隻ならこれまでと同じ）。§7: 確保しない（最寄りは添字で返す）。
import type Phaser from 'phaser';
import { TEXTURE_KEYS } from '../config/game-config';
import type { BoatState, SeaBounds } from '../core/boat-motion';
import { allShipsOut, allShipsSettled, sinkingCount, withdrawnCount } from '../core/dawn-withdraw';
import type { SeededRng } from '../core/rng';
import { startRetire } from '../core/ship-ai';
import { Destroyer } from '../entities/destroyer';
import { EnemyFire } from './enemy-fire';
import type { SplashPool } from './splash-pool';
import type { DestroyerSetup, TransportSetup } from './world-setup';

export class DestroyerGroup {
  readonly ships: Destroyer[] = [];
  readonly fires: EnemyFire[] = [];
  /** 駆逐艦の隻数（先頭から。これより後ろは輸送船） */
  readonly destroyerCount: number;
  /** 魚雷の通過判定の半径二乗（隊の最大） */
  readonly passRadius2: number;
  /** 撃沈の達成に要る駆逐艦の隻数（v0.6.0。既定は全隻。jp_06 のハードは 2 隻中 1 隻） */
  readonly objectiveSinks: number;

  constructor(scene: Phaser.Scene, ds: DestroyerSetup, transport: TransportSetup | null, bounds: SeaBounds, gunRng: SeededRng, lookoutRng: SeededRng, splashes: SplashPool) {
    for (const st of ds.starts) {
      this.ships.push(new Destroyer(scene, st, ds.spec, ds.shipAi, bounds, lookoutRng));
      this.fires.push(new EnemyFire(scene, ds.gunnery, gunRng, st.headingDeg, splashes));
    }
    this.destroyerCount = this.ships.length;
    this.objectiveSinks = Math.min(ds.objectiveSinks ?? this.destroyerCount, this.destroyerCount);
    this.passRadius2 = ds.passRadius2;
    if (transport) {
      this.ships.push(new Destroyer(scene, transport.start, transport.spec, transport.shipAi, bounds, lookoutRng, TEXTURE_KEYS.transport));
      this.fires.push(new EnemyFire(scene, transport.gunnery, gunRng, transport.start.headingDeg, splashes));
      if (transport.passRadius2 > this.passRadius2) this.passRadius2 = transport.passRadius2;
    }
  }

  /** 隊の隻数（輸送船込み） */
  get total(): number {
    return this.ships.length;
  }

  /** 輸送船がいる／沈み始めた（v0.4.7） */
  get hasTransport(): boolean {
    return this.ships.length > this.destroyerCount;
  }

  get transportSunk(): boolean {
    return this.hasTransport && this.ships[this.destroyerCount]!.sinking;
  }

  /** 沈み始めた駆逐艦の隻数（撃沈の表示。輸送船と退いた艦は数えない） */
  get sunkCount(): number {
    return sinkingCount(this.ships, this.destroyerCount);
  }

  /** 達成の隻数の駆逐艦が沈み始めた（任務の目標。既定は全隻） */
  get objectiveSinking(): boolean {
    return this.sunkCount >= this.objectiveSinks;
  }

  /** 隊のすべて（輸送船込み）が沈み始めた。以後は魚雷を撃てない */
  get allSinking(): boolean {
    for (const s of this.ships) if (!s.sinking) return false;
    return true;
  }

  /** すべて（輸送船込み）が沈み始めたか夜明けに退いた（v0.6.2）。以後は魚雷を撃てない（退く艦がいなければ allSinking と同じ） */
  get allOut(): boolean {
    return allShipsOut(this.ships);
  }

  /** すべての決着がついた（沈没演出が終わったか退いた）。走っている魚雷を外れとして確定してよい（退く艦がいなければ v0.6.1 の allSunk＝すべての沈没演出が終わった、と同じ） */
  get allSettled(): boolean {
    return allShipsSettled(this.ships);
  }

  /** 夜明けに退いて海域を出た駆逐艦の隻数（v0.6.2。輸送船は transportWithdrawn） */
  get withdrawnCount(): number {
    return withdrawnCount(this.ships, this.destroyerCount);
  }

  /** 輸送船が夜明けに退いて海域を出た（v0.6.2） */
  get transportWithdrawn(): boolean {
    return this.hasTransport && this.ships[this.destroyerCount]!.withdrawn;
  }

  /** 夜明けに退く（v0.6.2。夜明けのラッチで 1 回だけ）: 浮いている艦すべてが headingDeg へ全速（core/ship-ai の startRetire）。乱数は引かない */
  withdraw(headingDeg: number): void {
    for (const s of this.ships) if (!s.out) startRetire(s.ai, headingDeg);
  }

  /** どれかが沈没演出中（終了判定・味方機・水上機を待たせる） */
  get anySinkPlaying(): boolean {
    for (const s of this.ships) if (s.sinking && !s.sunk) return true;
    return false;
  }

  /** 浮いているどれかが自艇を見つけている */
  get anyDetected(): boolean {
    for (const s of this.ships) if (!s.out && s.ai.playerDetected) return true;
    return false;
  }

  /** 浮いているどれかの探照灯・星弾・照明弾に照らされている */
  get anyIlluminated(): boolean {
    for (let i = 0; i < this.ships.length; i++) if (!this.ships[i]!.out && this.fires[i]!.illuminated) return true;
    return false;
  }

  /** i 以外の浮いている艦の光に照らされている（輸送船は自分では照らせず、駆逐艦の光の下で撃つ。v0.4.7） */
  othersIlluminated(i: number): boolean {
    for (let k = 0; k < this.ships.length; k++) if (k !== i && !this.ships[k]!.out && this.fires[k]!.illuminated) return true;
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

  /** (x, y) に最も近い浮いている艦（沈み始めた艦と退いた艦を除く）の添字（無ければ -1）。平方根なし */
  nearestAfloatIndex(x: number, y: number): number {
    let best = -1;
    let bestD2 = Infinity;
    for (let i = 0; i < this.ships.length; i++) {
      const s = this.ships[i]!;
      if (s.out) continue;
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
