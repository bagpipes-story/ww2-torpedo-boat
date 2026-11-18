// 報告・無線・中継（v0.8.2 S2。us_05「スリガオ海峡・最初の接触」の type recon_and_attack。spec-v0820 §4.5 D-N1〜D-N6・§9 の 5・6、lead の L22）の世界の側: S1 の core/recon-report の状態を持ち、
// setup.recon のある世界だけ systems/world-enemies が 1 回作る（無い任務は世界の recon が null＝乱数の系列 seed+45 も、毎ステップの仕事も無い）。固定ステップでは敵の側の段の最後
// （systems/world-enemy-step。レーダーの掃引の後）に 1 回、見る物（ReconView）を数えて stepRecon へ渡す:
//   - 確かめる艦種（identify_class＝戦艦）の列の艦が自艇の視程の 2 乗の内（systems/mission-telemetry の setSighted と同じ規則）にいる数。戦艦（≤ 2 隻）の 2 乗の距離だけ・報告がまとまるまで
//     （SENT・PENDING の後は測らない＝§9 の 6）。
//   - 追う間だけ、レーダーの最後の掃引の接触の数（隊は列だけ＝輝点はみな列の艦）。レーダーの無い夜（?debug&noradar）は目で見えている列の艦の数。
//   - 自艇が中継の輪の中（2 乗の距離 1 つ）。沈み始めた自艇は何も見ず・中継しない（時計だけ進む）。
//   時計は固定ステップの実秒（世界の stepTimeS の差＝命中スローで 20 秒が延びない）。
// 無線（onShellHit）: world-enemies が recon のある世界だけ、艦の砲弾の命中の手を包んで砲弾の damage を渡す（機銃も 76 mm 未満は reconOnShellHit が引かない・機・ほかの手は呼ばない）。
// 自艇が沈み始めた後の砲弾は引かない（boat-damage の applyHit が何もしない弾）。平方根・atan2 なし。Phaser 非依存（輪の絵は構造の型 RelayRingView）。確保は作る時だけ。
import type { ColumnKit } from '../config/column-mission-data';
import type { ReconSetup } from '../config/recon-mission-data';
import { RECON_NONE, RECON_RADIO_SEED_OFFSET, RECON_TRACKING, createReconState, reconDelivered, reconOnShellHit, stepRecon, type ReconState, type ReconView } from '../core/recon-report';
import { SeededRng } from '../core/rng';

/** 列の艦（entities/destroyer の Destroyer が満たす） */
export interface ReconShip {
  readonly out: boolean;
  readonly state: { readonly x: number; readonly y: number };
}

/** 固定ステップで読む世界の部分（MissionWorld がそのまま満たす） */
export interface ReconWorldView {
  readonly stepTimeS: number;
  readonly visRange2: number;
  readonly boat: { readonly sinking: boolean; readonly state: { readonly x: number; readonly y: number } };
  readonly destroyers: { readonly ships: readonly ReconShip[] } | null;
  /** 自艇のレーダー（無い夜は null＝目で見えている列の艦を接触に数える） */
  readonly radar: { readonly state: { readonly n: number } } | null;
}

/** 中継の輪の絵（entities/relay-ring の RelayRingView が満たす。tests は null） */
export interface RelayRingLike {
  destroy(): void;
}

export class WorldRecon {
  readonly state: ReconState = createReconState();
  /** このステップのビット（core/recon-report の RECON_EV_*）とビットが立った回数（HUD の出来事は S4） */
  events = 0;
  eventCount = 0;
  /** 確かめる艦種の艦の隊の添字（≤ 2 隻）と列の艦の隊の添字の範囲 */
  private readonly identify: Uint8Array;
  private readonly first: number;
  private readonly count: number;
  private readonly rng: SeededRng;
  private readonly view: { identifyInSight: number; columnContacts: number; inRelay: boolean } = { identifyInSight: 0, columnContacts: 0, inRelay: false };
  private lastS = 0;

  constructor(
    readonly plan: ReconSetup,
    /** 片道の列の kits（艦種）と列の 1 隻目の隊の添字 */
    column: readonly ColumnKit[],
    first: number,
    seed: number,
    /** 砲弾が当たった時の自艇（沈み始めていれば無線を引かない）。MissionWorld がそのまま満たす */
    private readonly hitWorld: { readonly boat?: { readonly sinking: boolean } },
    private readonly ring: RelayRingLike | null = null,
  ) {
    const ids: number[] = [];
    column.forEach((k, i) => { if (k.shipClass === plan.identifyClass) ids.push(first + i); });
    this.identify = Uint8Array.from(ids);
    this.first = first;
    this.count = column.length;
    this.rng = new SeededRng((seed + RECON_RADIO_SEED_OFFSET) >>> 0);
  }

  /** 報告が届いた（送ったか中継した）。mission-world の returnCallDone の枝 */
  get delivered(): boolean {
    return reconDelivered(this.state);
  }

  /** 艦の砲弾が自艇に当たった（world-enemies の包んだ手から。damage はその 1 発の値）。無線が壊れたら true */
  onShellHit(damage: number): boolean {
    if (this.hitWorld.boat?.sinking) return false;
    return reconOnShellHit(this.state, this.plan, damage, this.rng);
  }

  /** 1 固定ステップ（敵の側の段の最後・レーダーの後） */
  step(w: ReconWorldView): void {
    const dtS = w.stepTimeS - this.lastS;
    this.lastS = w.stepTimeS;
    const st = this.state;
    const v = this.view;
    const b = w.boat.state;
    const ships = w.destroyers ? w.destroyers.ships : null;
    const live = !w.boat.sinking && ships !== null;
    v.identifyInSight = live && (st.stage === RECON_NONE || st.stage === RECON_TRACKING) ? this.inSight(ships!, b, w.visRange2, true) : 0;
    v.columnContacts = live && st.stage === RECON_TRACKING ? (w.radar ? w.radar.state.n : this.inSight(ships!, b, w.visRange2, false)) : 0;
    const dx = b.x - this.plan.relay.x;
    const dy = b.y - this.plan.relay.y;
    v.inRelay = !w.boat.sinking && dx * dx + dy * dy <= this.plan.relay.radius2;
    this.events = stepRecon(st, this.plan, v as ReconView, dtS);
    if (this.events !== 0) this.eventCount++;
  }

  /** 自艇の視程の 2 乗の内の浮いている艦の数（identify は確かめる艦種の艦だけ・ほかは列の艦の全部） */
  private inSight(ships: readonly ReconShip[], b: { readonly x: number; readonly y: number }, r2: number, identify: boolean): number {
    const n = identify ? this.identify.length : this.count;
    let k = 0;
    for (let j = 0; j < n; j++) {
      const d = ships[identify ? this.identify[j]! : this.first + j];
      if (!d || d.out) continue;
      const dx = d.state.x - b.x;
      const dy = d.state.y - b.y;
      if (dx * dx + dy * dy <= r2) k++;
    }
    return k;
  }

  destroy(): void {
    this.ring?.destroy();
  }
}
