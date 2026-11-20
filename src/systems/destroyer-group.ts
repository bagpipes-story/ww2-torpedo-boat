// 駆逐艦の隊（v0.4.5。難易度ハードで 2 隻以上。v0.4.7 から輸送船も隊の 1 隻）: 艦（entities/destroyer）とその反撃（enemy-fire）を隻数ぶん持ち、世界・敵の側・テレメトリが「どれか／すべて／最寄り」で読む。
// 夜明けに退く（v0.6.2）: withdraw() で全艦が退く向きへ全速、海域を出た艦は out（狙えない・見えない・撃たない）。撃沈の数・達成・allSinking は沈み始めた艦だけ（退いた艦は数えない）。
// 任務の達成は駆逐艦だけ（輸送船は撃破の加点）。砲撃の乱数は 1 つの系列（seed+1）を、見張り（雷跡に気づく。v0.5.0）の乱数は別の系列（seed+17）を、それぞれ艦の順に消費する（1 隻ならこれまでと同じ）。§7: 確保しない（最寄りは添字で返す）。
// 列の通過（v0.8.0 S2。us_04。setup.transit の任務だけ）: 列の艦は護衛（ds.starts）の後ろ・輸送船の前に作り、駆逐艦に数える（撃沈・達成・命中率の KPI）。段階は transit（systems/destroyer-transit）。
// 海域の外の列の艦は out（狙えない・見えない・撃たない）。allOut・allSettled は戻りの残りがある間は偽（R2）。列の無い任務は transit が null で、式は v0.7.2 のまま。
// 止まった艦と暗い岸を背に（v0.8.1 S2。us_06。setup.anchors・setup.backdrop の任務だけ world-enemies が作った後に 1 回付ける＝anchors・backdrop。無い任務は null で式は今のまま）。
// 輸送船の添字は transportIndex（無ければ −1）。ハードの駆潜艇（v0.8.1 S2b。setup.pickets）はその後ろ＝並びは護衛 → 列 → 輸送船 → 駆潜艇。駆潜艇は駆逐艦にも輸送船にも数えない（達成・KPI・撃沈 n/m・輸送船の加点の外）が、海の上の艦として allOut・allSettled・最寄り・体当たり・夜明けに退くに入る。
// 片道の列（v0.8.2 S2。us_05。setup.transit.column）: 列の艦は艦ごとの記録の寸法・列の AI・砲・絵の鍵（systems/column-kits）。艦ごとの砲・KPI の旗・レーダーの種類・絵の鍵・艦種は kits（今の任務は今の 3 つ組の値）。
// 見張りの役（systems/column-roles）は見張りのいる列だけ constructor が作り、弾薬庫（systems/ship-magazine）は規則のある艦のいる隊だけ world-enemies が 1 回付ける（無い任務は null）。
import type Phaser from 'phaser';
import { TEXTURE_KEYS } from '../config/game-config';
import type { BoatState, SeaBounds } from '../core/boat-motion';
import { allShipsOut, allShipsSettled, sinkingCount, withdrawnCount } from '../core/dawn-withdraw';
import { litByOwnLight } from '../core/own-light';
import type { SeededRng } from '../core/rng';
import { startRetire } from '../core/ship-ai';
import type { LandLine } from '../core/strait-geometry';
import { Destroyer } from '../entities/destroyer';
import type { AnchorSetup } from '../config/anchor-mission-data';
import type { BackdropSetup } from '../config/backdrop-mission-data';
import { shipArtKey } from '../config/ship-art-config';
import type { TransitSetup } from '../config/transit-mission-data';
import { DestroyerAnchor } from './destroyer-anchor';
import { DestroyerTransit } from './destroyer-transit';
import { ColumnRoles } from './column-roles';
import { columnShipKit, groupKits, type GroupKits } from './column-kits';
import type { ShipMagazine } from './ship-magazine';
import { ShoreBackdrop } from './shore-backdrop';
import { EnemyFire } from './enemy-fire';
import type { SplashPool } from './splash-pool';
import type { DestroyerSetup, PicketSetup, TransportSetup } from './world-setup';

/**
 * 自艇の魚雷の通過の半径の 2 乗（v0.8.2 IP2。全任務の 1 つの規則。ユーザーの決め 2026-11-19「推奨の全任務で直す」）: Infinity＝走る魚雷を「最寄りの浮いている艦の中心から
 * 遠ざかり始めた」で外れに決めない（凍結の systems/torpedo-pool の markMissIfPassed が働かない）。外れに決まるのは射程の終わり・海の外・隊のすべてが出た時で、それまでは
 * 後ろの艦にも当たる（v0.8.2 IP1 では片道の列＝us_05 だけ。前は艦の通過の半径の隊の最大で、前の艦を過ぎて外れに決まった魚雷が後ろの艦の絵の下を抜けた）。
 * 艦ごとの passRadius2（destroyer-setup・transport・pickets・列の kits）は setup の値のまま残る（模擬 core/intercept-sim などが読む）
 */
export const TORPEDO_PASS_RADIUS2 = Infinity;

export class DestroyerGroup {
  readonly ships: Destroyer[] = [];
  readonly fires: EnemyFire[] = [];
  /** 駆逐艦の隻数（先頭から。これより後ろは輸送船・駆潜艇） */
  readonly destroyerCount: number;
  /** 魚雷の通過判定の半径二乗（v0.8.2 IP2 から全任務で TORPEDO_PASS_RADIUS2＝通り過ぎで外れに決めない） */
  readonly passRadius2: number;
  /** 撃沈の達成に要る駆逐艦の隻数（v0.6.0。既定は全隻。jp_06 のハードは 2 隻中 1 隻） */
  readonly objectiveSinks: number;
  /** 列の通過（v0.8.0 S2。us_04）の段階と列の艦。setup.transit の無い任務は null */
  readonly transit: DestroyerTransit | null;
  /** 輸送船の添字（v0.8.1 S2。無ければ −1）。hasTransport・transportSunk・transportWithdrawn はここを読む */
  readonly transportIndex: number;
  readonly picketIndex: number; // ハードの駆潜艇（v0.8.1 S2b）の先頭の添字（無ければ −1）と隻数
  readonly picketCount: number;
  readonly kits: GroupKits; // 艦ごとの砲（gunneryAt）・KPI の旗（kpiAt）・レーダーの種類（radarKindAt）・絵の鍵・艦種（v0.8.2 S2。systems/column-kits。今の任務は今の 3 つ組の値）
  /** 列の見張り（v0.8.2 S2。見張りのいる片道の列＝us_05 だけ。destroyer-step が列の段階の直後に進める）と戦艦の弾薬庫（world-enemies が 1 回付ける）。無い任務は null */
  readonly roles: ColumnRoles | null;
  magazine: ShipMagazine | null = null;
  /** 止まった艦（v0.8.1 S2。setAnchors）と暗い岸を背に（setBackdrop）。付けるのは world-enemies の 1 回だけ。無い任務は null */
  anchors: DestroyerAnchor | null = null;
  backdrop: ShoreBackdrop | null = null;

  constructor(
    scene: Phaser.Scene, ds: DestroyerSetup, transport: TransportSetup | null,
    /** 列の通過（v0.8.0 S2。setup.transit。無い任務は null）。列の艦は護衛と同じ寸法・砲・絵で、AI は列の速さの transit.shipAi */
    transit: TransitSetup | null,
    bounds: SeaBounds, gunRng: SeededRng, lookoutRng: SeededRng, splashes: SplashPool,
    /** 駆逐艦の絵の鍵（v0.7.0 S2a。world-enemies が ship-art-config の shipArtKey(敵の id) を渡す＝D3・R15。絵だけ。当たりは ds.spec のまま） */
    destroyerTextureKey: string = TEXTURE_KEYS.destroyer,
    /** ハードの駆潜艇（v0.8.1 S2b。setup.pickets。無い任務は null）。輸送船の後ろに並べ、絵の鍵は記録の id から（shipArtKey） */
    pickets: PicketSetup | null = null,
  ) {
    for (const st of ds.starts) {
      this.ships.push(new Destroyer(scene, st, ds.spec, ds.shipAi, bounds, lookoutRng, destroyerTextureKey));
      this.fires.push(new EnemyFire(scene, ds.gunnery, gunRng, st.headingDeg, splashes));
    }
    if (transit) {
      const leg = transit.inbound;
      for (let i = 0; i < transit.ships; i++) {
        const k = columnShipKit(ds, transit.shipAi, transit.column, i, destroyerTextureKey); // 片道の列は艦ごとの記録（v0.8.2 S2）・往復の列は護衛と同じ物
        this.ships.push(new Destroyer(scene, { x: leg.appearX, y: leg.laneY, headingDeg: leg.headingDeg }, k.spec, k.ai, bounds, lookoutRng, k.artKey));
        this.fires.push(new EnemyFire(scene, k.gunnery, gunRng, leg.headingDeg, splashes));
      }
    }
    this.destroyerCount = this.ships.length;
    this.objectiveSinks = Math.min(ds.objectiveSinks ?? this.destroyerCount, this.destroyerCount);
    this.passRadius2 = TORPEDO_PASS_RADIUS2; // 全任務で 1 つの規則（v0.8.2 IP2。下の定数の注）
    this.transportIndex = transport ? this.ships.length : -1;
    if (transport) {
      this.ships.push(new Destroyer(scene, transport.start, transport.spec, transport.shipAi, bounds, lookoutRng, TEXTURE_KEYS.transport));
      this.fires.push(new EnemyFire(scene, transport.gunnery, gunRng, transport.start.headingDeg, splashes));
    }
    this.picketIndex = pickets ? this.ships.length : -1;
    this.picketCount = pickets ? pickets.starts.length : 0;
    if (pickets) {
      for (const start of pickets.starts) {
        this.ships.push(new Destroyer(scene, start, pickets.spec, pickets.shipAi, bounds, lookoutRng, shipArtKey(pickets.enemyId)));
        this.fires.push(new EnemyFire(scene, pickets.gunnery, gunRng, start.headingDeg, splashes));
      }
    }
    this.kits = groupKits({ total: this.ships.length, first: ds.starts.length, destroyerCount: this.destroyerCount, transportIndex: this.transportIndex, picketIndex: this.picketIndex }, ds, transport, pickets, transit?.column, destroyerTextureKey, TEXTURE_KEYS.transport);
    this.transit = transit ? new DestroyerTransit(this.ships, ds.starts.length, transit) : null; // 列の艦はここで海域の外（まだ来ない）へ
    this.roles = transit && this.transit ? ColumnRoles.of(this.ships.slice(ds.starts.length, ds.starts.length + transit.ships), transit, this.transit.state) : null; // 見張りのいる片道の列だけ（v0.8.2 S2）
  }

  /** 隊の隻数（輸送船・駆潜艇込み） */
  get total(): number {
    return this.ships.length;
  }

  /** 輸送船がいる／沈み始めた（v0.4.7） */
  get hasTransport(): boolean {
    return this.transportIndex >= 0;
  }

  get transportSunk(): boolean {
    return this.transportIndex >= 0 && this.ships[this.transportIndex]!.sinking;
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

  /** すべて（輸送船込み）が沈み始めたか夜明けに退いた（v0.6.2）。以後は魚雷を撃てない（退く艦がいなければ allSinking と同じ）。列の通過は戻りの残りが 0 の時だけ（v0.8.0） */
  get allOut(): boolean {
    return this.transit ? this.transit.allOut : allShipsOut(this.ships);
  }

  /** すべての決着がついた（沈没演出が終わったか退いた）。走っている魚雷を外れとして確定してよい（退く艦がいなければ v0.6.1 の allSunk＝すべての沈没演出が終わった、と同じ）。列の通過は同上 */
  get allSettled(): boolean {
    return this.transit ? this.transit.allSettled : allShipsSettled(this.ships);
  }

  /** 列の通過の残りの戻り（これから海域に現れる艦。v0.8.0。列の無い任務は 0）。destroyer-step は 0 の時だけ走っている魚雷を外れで確定する */
  get pendingReturns(): number {
    return this.transit ? this.transit.pending : 0;
  }

  /** 夜明けに退いて海域を出た駆逐艦の隻数（v0.6.2。輸送船は transportWithdrawn） */
  get withdrawnCount(): number {
    return withdrawnCount(this.ships, this.destroyerCount);
  }

  /** 輸送船が夜明けに退いて海域を出た（v0.6.2） */
  get transportWithdrawn(): boolean {
    return this.transportIndex >= 0 && this.ships[this.transportIndex]!.withdrawn;
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

  /** i 以外の浮いている艦が自分の光（探照灯・星弾）で照らしている（輸送船は自分では照らせず、駆逐艦の光の下で撃つ。v0.4.7）。他の艦の illuminated は読まない（互いを照らし続ける輪。v0.7.0 IP4） */
  othersOwnLit(i: number): boolean {
    for (let k = 0; k < this.ships.length; k++) if (k !== i && !this.ships[k]!.out && litByOwnLight(this.fires[k]!.state)) return true;
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

  /** 探照灯を岸で切る（v0.8.0 実機 1 回目。岸の線のある任務だけ world-enemies が 1 回呼ぶ） */
  setBeamLand(lines: readonly LandLine[]): void {
    for (const f of this.fires) f.setBeamLand(lines);
  }

  /** 止まった艦を付ける（v0.8.1 S2。setup.anchors の任務だけ world-enemies が 1 回）。計画は隊の艦の全部（駆逐艦 → 輸送船 → 駆潜艇。数が違えば destroyer-anchor が例外） */
  setAnchors(a: AnchorSetup): void {
    this.anchors = new DestroyerAnchor(this.ships, a, this.ships.length);
  }

  /** 暗い岸を背にを付ける（v0.8.1 S2。setup.backdrop の任務だけ world-enemies が 1 回。岸の線は探照灯の切り取りと同じ線・照明弾の距離は今夜の水上機の値） */
  setBackdrop(b: BackdropSetup, lines: readonly LandLine[], flareRevealM: number): void {
    this.backdrop = new ShoreBackdrop(b, lines, this.ships.length, flareRevealM);
  }

  /** 艦 i の砲（v0.8.1 S2b。world-enemies の命中の 2 つの手）。kits の配列（v0.8.2 S2。今の任務は駆逐艦・輸送船・駆潜艇の今の値の同じ物） */
  gunneryAt(i: number): DestroyerSetup['gunnery'] { return this.kits.guns[i]!; }

  /** 艦 i を狙った 1 本を命中率の KPI に数えるか（v0.8.2 S2。systems/torpedo-free。今の任務は 0 ≤ i < destroyerCount と同じ・片道の列は駆逐艦の記録の艦だけ。i < 0 は偽） */
  kpiAt(i: number): boolean { return this.kits.kpi[i] === 1; }

  /** 艦 i のレーダーの種類（v0.8.1 S2b。world-radar）: 駆潜艇は小さい艇、ほかの艦はみな艦（kits の配列＝今と同じ値） */
  radarKindAt(i: number): number { return this.kits.radarKind[i]!; }

  updateVisuals(realDt: number): void {
    for (let i = 0; i < this.ships.length; i++) this.fires[i]!.updateVisuals(realDt, this.ships[i]!.state);
  }

  destroy(): void {
    for (const f of this.fires) f.destroy();
    for (const s of this.ships) s.destroy();
  }
}
