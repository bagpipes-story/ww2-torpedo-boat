// 停泊して揚陸する味方の輸送船と米PT の雷撃の世界側（v0.6.9 S5a。jp_04「多号作戦・オルモック湾へ」。docs/02 §6.11、spec-v069 §4.1〜§4.4・D12・D13・D18・R12）。
// 持つもの: 味方の輸送船（entities/ally-ship）・敵の魚雷の 2 つ目のプール（systems/torpedo-pool の TorpedoPool をそのまま。Mk 13・PT の隻数 × salvo_count 本。自艇の w.torpedoes・KPI・
// 終わりの待ち・torpedoEventsFor には触らない）・雷撃の乱数 seed+26・雷撃の状態（core/pt-torpedo）・揚陸の状態（core/landing）・魚雷の決着をつなぐ LandingTorpedoLink（core/landing-torpedoes。模擬と同じもの）。
// 固定ステップ（world-enemy-step が米PT の隊の段の直後に 1 回）: stepPtTorpedoes（凍結の stepPtSection の後。気づかれていない・慌てた・戦いながらの斉射。seed+26）→ 敵の魚雷のプール
// （終わり際の当たりなし＝nowS NaN。沈み始めた輸送船は狙わない）→ tickLanding（揚陸の時計は世界の stepTimeS＝夜明けの時計）。模擬 core/landing-sim と同じ順（tests/landing-step-order）。
// 命中: 被雷は Scene の爆発と揺れ（onTorpedoHit。命中スローなし）、不発は小さな爆発、沈没は世界の onSunk（命中スロー＋爆発。大発の撃破と同じ）と沈む tween。
// 外から去らせた PT の知らせは何もしない（jp_04 は標的スロットが無い＝隊の targets?.onLeave と同じ。PtSquadron の private な events には触らない）。
// 揚陸の無い任務では buildLanding が null を返す（seed+26 も絵もプールも作らない＝ほかの任務の乱数・絵・順は変わらない）。MissionWorld が最後に作る（兵装の後）。
// §7: 状態・プール・ハンドル・書き先は組み立てで 1 回。毎ステップ確保しない。毎フレームは雷跡の走査（≤ 9 本）と鍵の比較だけ。
import type Phaser from 'phaser';
import type { SeaBounds } from '../core/boat-motion';
import { createLanding, createLandingWakes, landingResolved, landingWakes, tickLanding, type LandingState, type LandingWakes } from '../core/landing';
import type { LandingParams } from '../core/landing-data';
import { LandingTorpedoLink } from '../core/landing-torpedoes';
import type { PtSection } from '../core/pt-boats';
import { PT_TORPEDO_SEED_OFFSET, createPtTorpedoState, stepPtTorpedoes, type PtTorpedoState } from '../core/pt-torpedo';
import type { PtTorpedoParams } from '../core/pt-torpedo-data';
import { SeededRng } from '../core/rng';
import type { TorpedoTarget } from '../core/torpedo-targets';
import { AllyShip } from '../entities/ally-ship';
import { TorpedoPool } from './torpedo-pool';
import type { WorldEvents } from './world-events';
import type { WorldSetup } from './world-setup-types';

/** 固定ステップで世界から読む部分（MissionWorld がそのまま満たす）: 米PT の隊・夜明けのラッチ・出撃からの時計 */
export interface LandingWorldView {
  readonly pts: { readonly section: PtSection } | null;
  readonly dawn: { readonly reached: boolean };
  readonly stepTimeS: number;
}

/** 沈み始めた輸送船は的にしない（模擬 core/landing-sim と同じ式。out の船は scanTargets も飛ばすので [ship] でも同じ） */
const NO_HULLS: readonly TorpedoTarget[] = Object.freeze([]);
/** 外から去らせた PT の知らせ（jp_04 は標的スロットが無い＝何もしない） */
const NO_LEAVE = (): void => {};

export class WorldLanding {
  readonly state: LandingState;
  /** 雷撃の状態（PT ごとの斉射の残り・種類・距離・時計・決着の数え。Result と HUD が読む） */
  readonly tst: PtTorpedoState;
  /** 走っている敵の雷跡の本数と最接近までの秒（毎フレーム。輸送船の「雷跡！ N 秒」） */
  readonly wakes: LandingWakes = createLandingWakes();
  readonly link: LandingTorpedoLink;
  private readonly ship: AllyShip;
  private readonly hulls: readonly TorpedoTarget[];

  constructor(
    scene: Phaser.Scene,
    readonly p: LandingParams,
    readonly tp: PtTorpedoParams,
    count: number,
    /** 敵の魚雷のプール（2 つ目。Mk 13）と雷撃の乱数 seed+26（どちらも buildLanding が作る） */
    readonly pool: TorpedoPool,
    readonly rng: SeededRng,
    bounds: SeaBounds,
    private readonly timeScale: number,
    private readonly events: WorldEvents,
    /** 輸送船が沈み始めた（世界の命中スローと Scene の爆発。大発の撃破と同じ） */
    private readonly onSunk: (x: number, y: number) => void,
  ) {
    this.state = createLanding(p);
    this.tst = createPtTorpedoState(count, tp.n);
    this.ship = new AllyShip(scene, p, bounds);
    this.hulls = [this.state];
    this.link = new LandingTorpedoLink(this.state, p, this.tst, pool, { onShipHit: (x, y, dud, sunk) => this.onShipHit(x, y, dud, sunk) });
  }

  /** 固定ステップ（米PT の隊の段の直後。dt は time_scale 込み、feelDt は命中スロー込みの体感秒。spec §4.1）: 雷撃 → 敵の魚雷 → 揚陸の時計 */
  stepAfterPts(w: LandingWorldView, dt: number, feelDt: number): void {
    const q = w.pts?.section;
    if (!q) return;
    const nowS = w.stepTimeS;
    stepPtTorpedoes(this.tst, this.tp, q, this.state, this.rng, w.dawn.reached, nowS, feelDt, this.link, NO_LEAVE);
    this.link.nowS = nowS;
    this.pool.step(dt, feelDt, this.state.out ? NO_HULLS : this.hulls, this.p.passRadius2, this.link);
    tickLanding(this.state, this.p, nowS);
  }

  /** 決着（揚陸完了か、揚陸の前に沈んだ）。「帰投せよ」の呼びかけ（mission-world の returnCallDone） */
  get resolved(): boolean {
    return landingResolved(this.state);
  }

  /** 毎フレーム: 敵の魚雷の絵と雷跡（TorpedoPool のまま）、走っている雷跡の数え、輸送船の状態の行 */
  updateVisuals(realDt: number): void {
    this.pool.updateVisuals(realDt);
    landingWakes(this.pool.states, this.tp.torpedo.speedMps, this.timeScale, this.state, this.wakes);
    this.ship.update(this.state, this.wakes);
  }

  destroy(): void {
    this.pool.destroy();
    this.ship.destroy();
  }

  /** 魚雷が輸送船に当たった（LandingTorpedoLink の hooks。固定ステップの中） */
  private onShipHit(x: number, y: number, dud: boolean, sunk: boolean): void {
    if (!sunk) {
      this.events.onTorpedoHit(x, y, dud);
      return;
    }
    this.ship.sink();
    this.onSunk(x, y);
  }
}

/**
 * 揚陸の世界を組み立てる（MissionWorld の最後。兵装の後）。setup.landing の無い任務（jp_04 以外）と米PT の隊の無い世界は null（seed+26・プール・絵を作らない）。
 * 敵の魚雷のプールは PT の隻数 × salvo_count 本（ノーマル 6・ハード 9。1 隻 1 回）、乱数は seed+26 を 1 本
 */
export function buildLanding(scene: Phaser.Scene, s: WorldSetup, pts: { readonly section: PtSection } | null, seed: number, events: WorldEvents, onSunk: (x: number, y: number) => void): WorldLanding | null {
  if (!s.landing || !pts) return null;
  const ld = s.landing;
  const count = pts.section.boats.length;
  const pool = new TorpedoPool(scene, ld.torpedo.torpedo, count * ld.torpedo.n, s.mission.bounds);
  const rng = new SeededRng((seed + PT_TORPEDO_SEED_OFFSET) >>> 0);
  return new WorldLanding(scene, ld.params, ld.torpedo, count, pool, rng, s.mission.bounds, s.timeScale, events, onSunk);
}
