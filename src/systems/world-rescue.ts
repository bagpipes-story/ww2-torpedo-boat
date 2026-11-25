// 生存者の救助・機雷原・フィッチの砲火の世界側（v0.8.5 S2。us_07「D-Day・生存者救助」。spec-v0850 §4.0〜§4.5）: setup.rescue のある任務だけ mission-world が作る（無い任務は null）。
// 組み立ての時に 1 回、systems/rescue-field-setup で今夜の群のずれと機雷の置き方（seed+47 の 88 回）。ステップの中で引くのは触雷の火災・機関の判定だけ（同じ系列の続き・触れた時だけ。lead の決め 1）。
// 固定ステップの順（spec §4.0。systems/world-enemy-step）: 米PT の隊の段 → S ボートの退き（stepCover。core/sboat-cover）→ 砲台（systems/shore-guns。着弾で onShell）→ step（救助の時間の終わり → 拾う・移す → 機雷）。
// 救助の時間の終わりは世界の夜明けのラッチ（dawn.reached。言葉は S4）。任務の終わりに finish（帰投と同じに数える終わりは乗せている分も渡した・沈めば沈没で失った・漂流と座礁は乗せたまま＝lead の決め 3）。
// 触雷の被害は世界の hitBoat（終了理由 'mine'。今の被弾の作法＝爆発・揺れ・HUD の被弾）。絵は systems/rescue-view（読むだけ。systems/rescue-build が作って渡す）。§7: 毎ステップ確保しない（状態は固定長）。
// v0.8.5 IP3: 拾う・移すの後に味方の艇（core/friendly-boats。渡した数が達成に届けば 1 回出す・乱数なし・機雷と砲台と S ボートは見ない）。動きは世界の秒（体感秒 × time_scale）。
// v0.8.5 IP2: フィッチの砲火の後に S ボートの第二波（core/sboat-wave。隊の PtSquadron.wave。world-enemies が組み立てで確保）を進める。砲台の着弾は生存者の海へ撃った弾か（aimed）を数える（HUD の文）。
import type { HitSpec } from '../core/gunnery';
import type { MissionEndReason } from '../core/mission-flow';
import { MINE_END_REASON, mineHitSpec, stepMines, type MinefieldState } from '../core/minefield';
import type { PtSection } from '../core/pt-boats';
import { finishRescue, rescueShell, rescueTimeUp, stepRescue, type RescueState } from '../core/rescue';
import type { RescueField } from '../core/rescue-field';
import type { SeededRng } from '../core/rng';
import { createSboatCover, stepSboatCover, type SboatCoverSink, type SboatCoverState } from '../core/sboat-cover';
import { stepSboatWave, type SboatWaveState } from '../core/sboat-wave';
import type { BoatState } from '../core/boat-motion';
import { createFriendlyBoats, dispatchFriendlyBoats, stepFriendlyBoats, type FriendlyState } from '../core/friendly-boats';
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
  readonly pts: { readonly section: PtSection; readonly wave?: SboatWaveState | null } | null;
  readonly stepTimeS: number;
}

export class WorldRescue {
  readonly state: RescueState;
  readonly mines: MinefieldState | null;
  /** フィッチの砲火（S ボートの隊のある任務だけ。無ければ null） */
  readonly cover: SboatCoverState | null;
  readonly rules: RescueSetup;
  readonly field: MinefieldSetup | null;
  /** 味方の艇（v0.8.5 IP3。rescue.friendly_boats の無い任務は null） */
  readonly friendly: FriendlyState | null;
  private readonly timeScale: number;
  /** seed+47 の続き（触雷の火災・機関の判定だけ） */
  private readonly rng: SeededRng;
  private readonly halfLengthM: number;
  private readonly halfBeamM: number;
  readonly view: RescueViewLike | null;
  /** 外から去らせた S ボートの知らせ（世界は凍結の隊の onLeave と同じ扱い＝us_07 は標的スロットが無いので何もしない。絵は砲火の印を読む） */
  private readonly coverSink: SboatCoverSink = { onLeave: () => {} };
  /** 生存者の海へ撃った弾で失った人数とその通し番号（v0.8.5 IP2。HUD の「砲台が生存者の海を砲撃」） */
  seaLost = 0;
  seaSeq = 0;

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
    this.friendly = s.rescue!.friendly ? createFriendlyBoats(s.rescue!.friendly) : null;
    this.timeScale = s.timeScale;
    this.cover = s.ptBoats ? createSboatCover(s.ptBoats.count + (s.rescue!.wave2 ? s.rescue!.wave2.legs.length : 0)) : null; // 第二波（v0.8.5 IP2）の分も
    this.view = makeView ? makeView(this) : null;
  }

  /** S ボートの退き（凍結の stepPtSection の後。spec §4.0）→ 第二波（v0.8.5 IP2。第一波がみな去って delay_s の後・救助の時間の内に 1 回） */
  stepCover(w: WorldRescueView, feelDt: number): void {
    if (!this.cover || !w.pts) return;
    stepSboatCover(this.cover, this.rules.fitch, w.pts.section, feelDt, this.coverSink);
    const wv = w.pts.wave;
    if (wv && this.rules.wave2) stepSboatWave(wv, this.rules.wave2, w.pts.section, w.dawn.reached || this.state.timeUp, feelDt);
  }

  /** 砲台の着弾 1 発（systems/shore-guns の onLand。艇への命中も）: 群の shell_kill_m の内なら一番近い群から 1 名。aimed は生存者の海へ撃った弾（v0.8.5 IP2） */
  onShell(x: number, y: number, aimed = false): void {
    if (rescueShell(this.state, this.rules, x, y) >= 0 && aimed) {
      this.seaLost++;
      this.seaSeq++;
    }
  }

  /** 砲台の後（spec §4.0）: 救助の時間の終わり → 拾う・移す → 味方の艇（v0.8.5 IP3）→ 機雷（見える・触雷）。触雷は世界の hitBoat へ */
  step(w: WorldRescueView, feelDt: number): void {
    const b = w.boat.state;
    const afloat = !w.boat.sinking;
    const fr = this.friendly;
    if (w.dawn.reached) rescueTimeUp(this.state, fr !== null && fr.dispatched); // 味方の艇が出ていれば残りは海に置いたまま（艇が拾い続ける。v0.8.5 IP3）
    stepRescue(this.state, this.rules, b.x, b.y, b.speedMps, afloat, feelDt);
    const fp = this.rules.friendly;
    if (fr && fp) {
      if (!fr.dispatched && this.state.objectiveReached) dispatchFriendlyBoats(fr, fp, this.state);
      stepFriendlyBoats(fr, fp, this.rules, this.state, feelDt * this.timeScale, feelDt);
    }
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
