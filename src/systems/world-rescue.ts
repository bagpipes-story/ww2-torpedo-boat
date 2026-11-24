// 生存者の救助・機雷原・フィッチの砲火の世界側（v0.8.5 S2。us_07「D-Day・生存者救助」。spec-v0850 §4.0〜§4.5）: setup.rescue のある任務だけ mission-world が作る（無い任務は null）。
// 組み立ての時に 1 回、systems/rescue-field-setup で今夜の群のずれと機雷の置き方（seed+47 の 88 回）。ステップの中で引くのは触雷の火災・機関の判定だけ（同じ系列の続き・触れた時だけ。lead の決め 1）。
// 固定ステップの順（spec §4.0。systems/world-enemy-step）: 米PT の隊の段 → S ボートの退き（stepCover。core/sboat-cover）→ 砲台（systems/shore-guns。着弾で onShell）→ step（救助の時間の終わり → 拾う・移す → 機雷）。
// 救助の時間の終わりは世界の夜明けのラッチ（dawn.reached。言葉は S4）。任務の終わりに finish（帰投と同じに数える終わりは乗せている分も渡した・沈めば沈没で失った・漂流と座礁は乗せたまま＝lead の決め 3）。
// 触雷の被害は世界の hitBoat（終了理由 'mine'。今の被弾の作法＝爆発・揺れ・HUD の被弾）。絵は systems/rescue-view（読むだけ。systems/rescue-build が作って渡す）。§7: 毎ステップ確保しない（状態は固定長）。
import type { HitSpec } from '../core/gunnery';
import type { MissionEndReason } from '../core/mission-flow';
import { MINE_END_REASON, mineHitSpec, stepMines, type MinefieldState } from '../core/minefield';
import type { PtSection } from '../core/pt-boats';
import { finishRescue, rescueShell, rescueTimeUp, stepRescue, type RescueState } from '../core/rescue';
import type { RescueField } from '../core/rescue-field';
import type { SeededRng } from '../core/rng';
import { createSboatCover, stepSboatCover, type SboatCoverSink, type SboatCoverState } from '../core/sboat-cover';
import type { BoatState } from '../core/boat-motion';
import type { MinefieldSetup } from '../config/minefield-mission-data';
import type { RescueSetup } from '../config/rescue-mission-data';
import type { WorldSetup } from './world-setup';

/** 絵の持ち主（systems/rescue-view の RescueView。systems/rescue-build が作って渡す＝このファイルは絵と DOM を import しない＝node の tests から組める） */
export interface RescueViewLike {
  update(realDt: number, w: WorldRescueView): void;
  destroy(): void;
}

/** 固定ステップで読む世界の部分（MissionWorld がそのまま満たす） */
export interface WorldRescueView {
  readonly boat: { readonly state: BoatState; readonly sinking: boolean };
  readonly dawn: { readonly reached: boolean };
  readonly pts: { readonly section: PtSection } | null;
  readonly stepTimeS: number;
}

export class WorldRescue {
  readonly state: RescueState;
  readonly mines: MinefieldState | null;
  /** フィッチの砲火（S ボートの隊のある任務だけ。無ければ null） */
  readonly cover: SboatCoverState | null;
  readonly rules: RescueSetup;
  readonly field: MinefieldSetup | null;
  /** seed+47 の続き（触雷の火災・機関の判定だけ） */
  private readonly rng: SeededRng;
  private readonly halfLengthM: number;
  private readonly halfBeamM: number;
  readonly view: RescueViewLike | null;
  /** 外から去らせた S ボートの知らせ（世界は凍結の隊の onLeave と同じ扱い＝us_07 は標的スロットが無いので何もしない。絵は砲火の印を読む） */
  private readonly coverSink: SboatCoverSink = { onLeave: () => {} };

  constructor(
    s: WorldSetup,
    f: RescueField,
    /** 世界の水柱のプール（systems/splash-pool の SplashPool。触雷の水柱だけ） */
    private readonly splashes: { splash(x: number, y: number, hit: boolean): void },
    /** 触雷の被害（世界の hitBoat。終了理由 'mine'） */
    private readonly hitBoat: (spec: HitSpec, rng: SeededRng, x: number, y: number, reason: MissionEndReason) => void,
    /** 絵を作る（読むだけの絵。tests は null） */
    makeView: ((src: WorldRescue) => RescueViewLike) | null = null,
  ) {
    this.rules = s.rescue!;
    this.field = s.minefield ?? null;
    this.state = f.rescue;
    this.mines = f.mines;
    this.rng = f.rng;
    this.halfLengthM = s.boatHalfLengthM;
    this.halfBeamM = s.boatHalfBeamM;
    this.cover = s.ptBoats ? createSboatCover(s.ptBoats.count) : null;
    this.view = makeView ? makeView(this) : null;
  }

  /** S ボートの退き（凍結の stepPtSection の後。spec §4.0） */
  stepCover(w: WorldRescueView, feelDt: number): void {
    if (this.cover && w.pts) stepSboatCover(this.cover, this.rules.fitch, w.pts.section, feelDt, this.coverSink);
  }

  /** 砲台の着弾 1 発（systems/shore-guns の onLand。艇への命中も）: 群の shell_kill_m の内なら一番近い群から 1 名 */
  onShell(x: number, y: number): void {
    rescueShell(this.state, this.rules, x, y);
  }

  /** 砲台の後（spec §4.0）: 救助の時間の終わり → 拾う・移す → 機雷（見える・触雷）。触雷は世界の hitBoat へ */
  step(w: WorldRescueView, feelDt: number): void {
    const b = w.boat.state;
    const afloat = !w.boat.sinking;
    if (w.dawn.reached) rescueTimeUp(this.state);
    stepRescue(this.state, this.rules, b.x, b.y, b.speedMps, afloat, feelDt);
    const m = this.mines;
    const fd = this.field;
    if (!m || !fd) return;
    const k = stepMines(m, fd, b, this.halfLengthM, this.halfBeamM, afloat);
    if (k < 0) return;
    this.splashes.splash(m.x[k]!, m.y[k]!, true);
    this.hitBoat(mineHitSpec(fd), this.rng, m.x[k]!, m.y[k]!, MINE_END_REASON);
  }

  /** 任務の終わり（buildMissionResult の前に 1 回。2 回目からは何もしない） */
  finish(reason: MissionEndReason): void {
    finishRescue(this.state, this.rules, reason);
  }

  /** 渡した数が達成の数に届いた（「帰投せよ」の呼びかけ。達成そのものは帰投と同じに数える終わり＝core/mission-flow の rescueObjectiveDone） */
  get objectiveReached(): boolean {
    return this.state.objectiveReached;
  }

  updateVisuals(realDt: number, w: WorldRescueView): void {
    this.view?.update(realDt, w);
  }

  destroy(): void {
    this.view?.destroy();
  }
}
