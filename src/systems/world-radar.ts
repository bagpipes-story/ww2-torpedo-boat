// レーダー（v0.8.0 S2。spec-v0800 §3.2 の D-R1〜D-R12・§3.5・§5.2・§6 の S2、brief L9）の世界の側: core/radar の状態を持ち、固定ステップの敵の側の段の最後
// （systems/world-enemy-step。艦を動かし、列の通過の段階を当てた後）に進める。掃引の時（radarSweepDue）だけ、隊の艦（護衛・列・輸送船＝どれも艦）の位置と
// 「浮いて海域の中か」（Destroyer.out の逆＝沈み始めた・退いた・海域の外の列の艦は映らない）を渡す（掃引の間は何もしない＝§5.2）。
// 目とは別の感覚（D-R1・brief L9）: 世界・自艇・艦・AI・視程・発見・テレメトリには何も書かない（読むだけ。書くのは自分の state と渡す枠 targets だけ＝tests/radar-neutral が走査）。
// 陸の反射の岸の線は海峡の両岸（setup.shores）から起動時に 1 回（両岸の無い任務は空）。機・大発・PT は渡さない（v0.8.0 のレーダーの任務は駆逐艦の隊だけ。足すのは後の版）。
// 絵（輝点 16 の Image）は systems/radar-view が持ち、毎フレーム updateVisuals が渡す（置き直すのは掃引の回数が変わった時だけ）。
// Phaser 非依存（絵は構造の型 RadarBlipView。tests/radar-world・radar-neutral が絵なしで回す）・乱数なし。確保は constructor だけ。
// v0.8.0 S4（brief L26・L31）: 東の縁の向こうの揚陸の地の名（作る時に 1 回。2 行目の「東（ビラ）へ消えた」）と、Result の「目で見えない間に撃った魚雷」の数え
// （発射の時の見えていたかは systems/torpedo-free が世界の規則で決めて渡し、命中は systems/torpedo-hits が渡す＝ここは数えるだけ。魚雷の状態は読まない・書かない）。
import type { ShoresSetup } from '../config/shores-mission-data';
import { RADAR_KIND_SHIP, createRadarState, createRadarTargets, radarSweepDue, stepRadar, type RadarGeometry, type RadarState, type RadarTargets } from '../core/radar';
import type { RadarParams } from '../core/radar-data';
import { landLinesFromShores } from '../core/strait-geometry';

/** 掃引で読む艦（entities/destroyer の Destroyer が満たす） */
export interface RadarShip {
  readonly state: { readonly x: number; readonly y: number };
  readonly out: boolean;
}

/** 固定ステップで読む世界の部分（MissionWorld がそのまま満たす） */
export interface RadarWorldView {
  readonly stepTimeS: number;
  readonly boat: { readonly state: { readonly x: number; readonly y: number } };
  readonly destroyers: { readonly ships: readonly RadarShip[] } | null;
}

/** 輝点の絵（systems/radar-view の RadarView が満たす）。nowS は固定ステップの時計（薄れ方） */
export interface RadarBlipView {
  update(s: RadarState, nowS: number, sweepS: number): void;
  destroy(): void;
}

export class WorldRadar {
  readonly state: RadarState = createRadarState();
  readonly geo: RadarGeometry;
  /** 掃引に渡す枠（隊の隻数。掃引の時だけ 0〜n − 1 を書く） */
  private readonly targets: RadarTargets;
  /** 目で見えない間に撃った魚雷（S4・brief L31）: 発射の時に印を付けた魚雷（プールの状態。使い回さない）・本数・そのうちの命中（不発を除く） */
  private readonly unseen = new WeakSet<object>();
  private nUnseenShots = 0;
  private nUnseenHits = 0;

  constructor(
    readonly p: RadarParams,
    bounds: { readonly width: number; readonly height: number },
    shores: ShoresSetup | undefined,
    /** 隊の隻数（隊の無い任務は 0＝何も映らない） */
    shipCapacity: number,
    private readonly view: RadarBlipView | null,
    /** 東の縁の向こうの揚陸の地の名（列が東へ抜けて戻る任務だけ。無ければ ''） */
    readonly eastJa = '',
  ) {
    const { width, height } = bounds;
    this.geo = { width, height, land: shores ? landLinesFromShores(shores, width, height) : [] };
    this.targets = createRadarTargets(shipCapacity);
  }

  /** 目で見えない間に撃った魚雷の本数・そのうちの命中（Result の 1 行。systems/strait-result-part） */
  get unseenShots(): number { return this.nUnseenShots; }
  get unseenHits(): number { return this.nUnseenHits; }

  /** 魚雷を 1 本撃った（狙える艦がある間の発射。sighted は発射の時に 3 行目が敵影ありだったか） */
  noteLaunch(torpedo: object, sighted: boolean): void {
    if (sighted) return;
    this.unseen.add(torpedo);
    this.nUnseenShots++;
  }

  /** 魚雷が当たった（不発でない。終わり際の当たりも） */
  noteHit(torpedo: object): void {
    if (this.unseen.has(torpedo)) this.nUnseenHits++;
  }

  /** 1 固定ステップ（敵の側の段の最後）。掃引の時でなければ何もしない */
  step(w: RadarWorldView): void {
    const r = this.state;
    if (!radarSweepDue(r, w.stepTimeS)) return;
    const tg = this.targets;
    const g = w.destroyers;
    let n = 0;
    if (g) {
      const ships = g.ships;
      for (let i = 0; i < ships.length && n < tg.x.length; i++) {
        const d = ships[i]!;
        tg.x[n] = d.state.x;
        tg.y[n] = d.state.y;
        tg.kind[n] = RADAR_KIND_SHIP;
        tg.afloat[n] = d.out ? 0 : 1;
        n++;
      }
    }
    tg.n = n;
    const b = w.boat.state;
    stepRadar(r, this.p, this.geo, w.stepTimeS, b.x, b.y, tg);
  }

  /** 毎フレーム（world-visuals）: 輝点の絵。nowS は固定ステップの時計 */
  updateVisuals(nowS: number): void {
    this.view?.update(this.state, nowS, this.p.sweepS);
  }

  destroy(): void {
    this.view?.destroy();
  }
}
