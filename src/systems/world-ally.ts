// 味方の駆逐艦 卯月の世界側（v0.6.10 S5a。jp_04「多号作戦・オルモック湾へ」。docs/02 §6.11、spec-v0610 R-U1〜R-U8・リードの決定 LD8・LD15）: core/ally-destroyer の 1 夜の状態と、
// 見張りの乱数 seed+27・砲の乱数 seed+28（ここだけが作る。world-landing は作らない＝tests/landing-imports）・絵（entities/ally-destroyer）を持つ。
// 固定ステップは systems/world-landing の stepAfterPts が雷撃（stepPtTorpedoes）の直後・敵の魚雷のプールの前に step を 1 回呼ぶ（R-U6 の順 (i)。模擬 core/landing-sim と同じ順・同じ引数）。
// 照らされた斉射は同じ雷撃の入れ先（LandingTorpedoLink）と seed+26、撃たずに去るは link の onLitAway。hitPt の知らせは何もしない PtEvents（jp_04 の米PT の隊は標的スロットが無く、
// 25mm の隊の知らせ PtSquadron.events の onLeave も何もしない＝模擬の ev と同じ。PT の灰色・沈む絵・手柄の口は S5b）。演出（AllyFx）は砲口の閃光と水柱だけ（乱数・状態に触らない）。
// 卯月の無い任務・?debug&noally（setup.allyDestroyer の鍵が無い）と米PT の隊の無い世界は buildAlly が null（seed+27・+28 も絵も作らない＝ほかの任務と noally の夜は前と同じ）。
// §7: 確保は組み立ての 1 回だけ。毎ステップ・毎フレームは状態を読んで絵を動かすだけ。
import type Phaser from 'phaser';
import { ALLY_GUN_SEED_OFFSET, ALLY_LOOKOUT_SEED_OFFSET, createAllyDestroyer, stepAllyDestroyer, type AllyDestroyer, type AllyFx, type AllyLink } from '../core/ally-destroyer';
import type { AllyDestroyerParams } from '../core/ally-destroyer-data';
import type { PtEvents, PtParams, PtSection } from '../core/pt-boats';
import type { PtTorpedoShip, PtTorpedoState } from '../core/pt-torpedo';
import type { PtTorpedoParams } from '../core/pt-torpedo-data';
import { SeededRng } from '../core/rng';
import { AllyDestroyerView } from '../entities/ally-destroyer';
import type { ScreenRect } from '../ui/landing-markers';
import type { WorldSetup } from './world-setup-types';

/** hitPt の知らせ（jp_04 は標的スロットが無い＝何もしない。模擬 core/landing-sim の ev の onLeave と同じ） */
const NO_PT_EVENTS: PtEvents = { onContact: () => {}, onLeave: () => {}, onOut: () => {}, onPassEnd: () => {}, onFire: () => {}, onCommit: () => {}, onImpact: () => {} };
/** 外から去らせた PT の知らせ（jp_04 は標的スロットが無い＝何もしない。world-landing の NO_LEAVE と同じ） */
const NO_LEAVE = (): void => {};

export class WorldAlly implements AllyFx {
  /** 1 夜の卯月（見張り・照らす PT・探照灯・砲・反応・印・数え。HUD・Result・PtSquadron が読む＝S5b〜S7） */
  readonly a: AllyDestroyer;
  /** 見張り seed+27（候補の PT 1 隻 1 ステップに 1 回）と砲 seed+28（1 発 2 回・生きた PT への命中 1 回）。ヘッドレスの突き合わせが状態を読む */
  readonly rng27: SeededRng;
  readonly rng28: SeededRng;
  private readonly view: AllyDestroyerView;

  constructor(scene: Phaser.Scene, p: AllyDestroyerParams, pt: PtParams, seed: number, hasCoast: boolean, boundsHeight: number, hud: readonly ScreenRect[]) {
    this.rng27 = new SeededRng((seed + ALLY_LOOKOUT_SEED_OFFSET) >>> 0);
    this.rng28 = new SeededRng((seed + ALLY_GUN_SEED_OFFSET) >>> 0);
    this.view = new AllyDestroyerView(scene, p, hasCoast, boundsHeight, hud);
    this.a = createAllyDestroyer(p, pt, this.rng27, this.rng28, this);
  }

  /** AllyFx: 撃った（砲口の閃光） */
  onFire(_gunIndex: number, x: number, y: number): void {
    this.view.fired(x, y);
  }

  /** AllyFx: 着弾（水柱。hit は生きた PT に当たって hitPt を呼んだ） */
  onImpact(_gunIndex: number, x: number, y: number, hit: boolean): void {
    this.view.impact(x, y, hit);
  }

  /**
   * 固定ステップ（world-landing の stepAfterPts。雷撃の直後・敵の魚雷のプールの前）: st・tp・ship・rng26・dawn・nowS・link は stepPtTorpedoes と同じもの、
   * feelDt は命中スロー込みの体感秒、dt は time_scale 込みの秒（砲弾の飛行）
   */
  step(q: PtSection, st: PtTorpedoState, tp: PtTorpedoParams, ship: PtTorpedoShip, rng26: SeededRng, dawn: boolean, nowS: number, feelDt: number, dt: number, link: AllyLink): void {
    stepAllyDestroyer(this.a, q, st, tp, ship, rng26, dawn, nowS, feelDt, dt, link, NO_PT_EVENTS, NO_LEAVE);
  }

  /** 毎フレーム（world-visuals。揚陸の絵の後）: 扇・探照灯・砲弾・閃光・水柱・ラベル */
  updateVisuals(realDt: number): void {
    this.view.update(realDt, this.a.g, this.a.target);
  }

  destroy(): void {
    this.view.destroy();
  }
}

/**
 * 卯月の世界を組み立てる（systems/world-landing の buildLanding の中で 1 回。揚陸の世界と同じ組み立て）。setup.allyDestroyer の無い任務（jp_04 以外・?debug&noally）・揚陸の無い任務・
 * 米PT の隊の無い世界は null（seed+27・+28・絵を作らない）。pt は今夜の米PT（揺らぎ込み。世界の PtSquadron の p＝模擬の ptNightParams と同じ値）、hud は輸送船の字と同じ HUD の矩形
 */
export function buildAlly(scene: Phaser.Scene, s: WorldSetup, pts: { readonly p: PtParams } | null, seed: number, hud: readonly ScreenRect[]): WorldAlly | null {
  const p = s.allyDestroyer;
  if (!p || !s.landing || !pts) return null;
  return new WorldAlly(scene, p, pts.p, seed, s.mission.coast !== null, s.mission.bounds.height, hud);
}
