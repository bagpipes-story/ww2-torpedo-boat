// 兵装の新しい道の持ち主（v0.6.8。spec-v068 §3.2・§5.1）: 魚雷と機銃は全任務で両方使える。v0.6.7 から使えるようになった側の数・状態・出来事を持つ:
// 狙う艦の無い魚雷（発射と決着は systems/torpedo-free。ここは数えて文を出す）・艦への機銃（systems/ship-gun。駆逐艦の任務だけ・seed+25）・
// 対空（core/aa-fire。機の来る任務だけ・seed+24。艦艇の標的が無いときだけ＝砲は 1 つ）・撃墜（core/air-down）・閃光（撃ってから gun_flash.hold_s の間、敵の見つける距離を
// gun_battery.muzzle_flash_reveal_m 以上に）・弾倉（jp_01 は米PT への 13mm/25mm の弾倉を借りる、jp_06・jp_02 は自分の弾倉）・終わりの待ちの間の停止。
// 固定ステップの順（systems/world-enemy-step）: stepShips（自分の弾倉の交換・艦への機銃）→ applyFlash → 駆逐艦か大発 → 米PT → 機関 → stepAir（対空は最後＝艦艇が先）。
// 撃墜が 1 機でもあれば stepAir の最初に毎ステップ順番を飛ばす（押していなくても。離したら波が止まる、を防ぐ。レビュー F2）。
// Phaser 非依存（tests から作れる）。絵は systems/world-arms の WorldArms（これを継ぎ fx* を描く）。§7: 確保は constructor だけ。押さなければ何も変わらない
// （新しい乱数は引かず、閃光も無く、世界の状態に触らない）。再生の道具（scratchpad の replay-v068）が読む公開の名: aaRng・shipRng・aaRounds・downs・shipRounds・blindTorpedoes。
import { ARMS_CUE_LINGER_S } from '../config/arms-config';
import { AA_BUSY, AA_FIRING, AA_OUT_OF_ARC, AA_SEED_OFFSET, AA_SRC_DAWN, AA_SRC_SEAPLANE, AA_SRC_SORTIE, createAaState, createAaTargets, stepAaFire, type AaState, type AntiAircraftParams } from '../core/aa-fire';
import { skipDownedRuns } from '../core/air-down';
import { CUE_NONE, EV_DOWN_SEAPLANE, EV_DOWN_SORTIE, EV_DOWN_STRIKE, ST_AA, ST_ARC, ST_NONE, ST_RELOAD, ST_SHIP, ST_SMOKE, blindTorpedoCue, type BlindKind } from '../core/arms-cue';
import type { BoatState, SpeedStep } from '../core/boat-motion';
import type { AircraftPose } from '../core/friendly';
import { GUN_BLOCKED, GUN_FIRING, GUN_OUT_OF_ARC, GUN_SAFE, type GunBatteryParams, type GunEvents } from '../core/gun-battery';
import { createMagazine, magazineTick, type MagazineParams, type MagazineState } from '../core/magazine';
import { PT_GUN_RELOAD, type PtGunState } from '../core/pt-gun';
import { SeededRng } from '../core/rng';
import { downSlot, fillAaSlots, hasAircraft, liveStrikePlanes, type AaSlotWorld } from './aa-slots';
import { ShipGun, type ArmsShipGroup, type ShipGunWorld } from './ship-gun';

/** 兵装が固定ステップで世界から読み書きする部分（MissionWorld がそのまま満たす。tests は偽物で組む） */
export interface ArmsWorld extends AaSlotWorld, ShipGunWorld {
  readonly input: { readonly gunHeld: boolean };
  readonly boat: { readonly state: BoatState; readonly sinking: boolean };
  readonly band: SpeedStep;
  readonly atHome: boolean;
  readonly grounded: boolean;
  readonly stepTimeS: number;
  /** 敵が自艇を見つける距離（このステップの値。閃光の間は閃光の距離以上に書く） */
  detectRangeM: number;
  /** 主兵装の砲（大発の任務・米PT の任務。撃っていれば対空は撃たない） */
  readonly hunt: { readonly battery: { readonly status: number } } | null;
  readonly pts: { readonly gun: { readonly state: PtGunState } | null } | null;
  readonly destroyers: ArmsShipGroup | null;
}

/** 砲と対空の材料（systems/world-arms の buildArms が config/loadout-data から作る）。無ければ狙う艦の無い魚雷だけ（S2 の形） */
export interface ArmsKit {
  readonly gun: GunBatteryParams | null;
  readonly aa: AntiAircraftParams;
  readonly seed: number;
  readonly world: ArmsWorld;
}

export class ArmsStep {
  /** 対空の乱数の系列（seed+24。機の来る任務で艇に砲があるときだけ。無ければ null） */
  readonly aaRng: SeededRng | null;
  /** 艦への機銃（駆逐艦の任務で艇に砲があるときだけ。無ければ null） */
  readonly shipGun: ShipGun | null;
  /** 対空の砲の状態（aaRng と同じ任務だけ） */
  readonly aa: AaState | null;
  /** 新しい道の弾倉（借りた米PT の砲の弾倉か自分の弾倉。弾倉の無い砲・新しい道の無い任務は null） */
  readonly mag: MagazineState | null;
  /** 機へ撃った発数・撃墜（出どころごと: 夜明けの空襲・夜の出撃・夜の水上機）・水上機を落とした */
  aaRounds = 0;
  downs = 0;
  readonly downsBy: number[] = [0, 0, 0];
  seaplaneDowned = false;
  /** 狙う艦の無い魚雷の本数（Result・初発射時の燃料から除く） */
  blindTorpedoes = 0;
  /** 終わりの待ちの窓が開いた（MissionEnd.holdFire が毎フレーム hold を呼ぶ。窓は閉じない）。以後は魚雷も新しい機銃の道も撃てない */
  endHold = false;
  /** 最後の出来事の文（core/arms-cue の EV_*）・その数・通し番号（HUD は通し番号が変わったときにその秒だけ出す） */
  evCode = CUE_NONE;
  evN = 0;
  evSeq = 0;
  /** 今の状態の文（ST_*。機銃を押している間だけ）と数（弾倉交換の残り秒） */
  stCode = CUE_NONE;
  stN = 0;
  /** 閃光が効いている（このステップ）と、効く最後の時計（世界の stepTimeS。撃っていなければ -Infinity） */
  flashActive = false;
  flashUntilS = -Infinity;
  protected readonly gun: GunBatteryParams | null;
  private readonly aaParams: AntiAircraftParams | null;
  private readonly magP: MagazineParams | null;
  private readonly ownsMag: boolean;
  /** 状態の文を全部出す任務（艦への機銃のある任務と jp_02）。主兵装の砲のある任務（us_03・jp_01・jp_05）は対空の文だけ（主兵装の 2 行目はそのまま） */
  private readonly fullCues: boolean;
  private readonly flashRevealM: number;
  private readonly flashHoldS: number;
  private readonly slots = createAaTargets();
  private readonly pose: AircraftPose = { dx: 0, dy: 0, headingDeg: 0, alpha: 0 };
  private surfaceFiring = false;
  private shipLingerS = 0;
  private aaLingerS = 0;
  /** 艦への機銃の知らせ（1 個だけ作る。絵は fx*） */
  private readonly shipEvents: GunEvents = {
    onFire: (x, y) => this.fxMuzzle(x, y),
    onHit: (_i, _g, x, y) => this.fxSplash(x, y, true),
    onMiss: (x, y) => this.fxSplash(x, y, false),
  };

  constructor(
    /** 狙う艦の無い魚雷の種類（任務の敵から。systems/world-arms の buildArms が決める） */
    readonly blindKind: BlindKind,
    kit: ArmsKit | null = null,
  ) {
    const gun = kit ? kit.gun : null;
    const w = kit ? kit.world : null;
    this.gun = gun;
    this.aaParams = kit ? kit.aa : null;
    this.shipGun = gun && kit && w && w.destroyers ? new ShipGun(gun, w.destroyers, kit.seed) : null;
    this.aaRng = gun && kit && w && hasAircraft(w) ? new SeededRng((kit.seed + AA_SEED_OFFSET) >>> 0) : null;
    this.aa = gun && this.aaRng ? createAaState(gun) : null;
    const used = this.shipGun !== null || this.aa !== null;
    const borrowed = w && w.pts && w.pts.gun ? w.pts.gun.state : null;
    this.magP = gun && gun.magazine ? gun.magazine : null;
    this.ownsMag = used && borrowed === null && this.magP !== null;
    this.mag = !used ? null : borrowed ?? (this.magP ? createMagazine(this.magP) : null);
    this.fullCues = w !== null && w.hunt === null && w.pts === null;
    this.flashRevealM = gun ? gun.flashRevealM : 0;
    this.flashHoldS = kit ? kit.aa.flashHoldS : 0;
  }

  /** 艦への機銃の乱数の系列（seed+25。駆逐艦の任務だけ。無ければ null） */
  get shipRng(): SeededRng | null {
    return this.shipGun ? this.shipGun.rng : null;
  }

  /** 艦へ撃った発数・当たった数（命中は水柱だけ） */
  get shipRounds(): number {
    return this.shipGun ? this.shipGun.rounds : 0;
  }

  get shipHits(): number {
    return this.shipGun ? this.shipGun.hits : 0;
  }

  /** 閃光の距離（夜の哨戒機の門番 core/patrol-air の flashM。閃光が無ければ 0） */
  get flashM(): number {
    return this.flashActive ? this.flashRevealM : 0;
  }

  /** 機を撃っている（標的があり弾倉交換中でない。2 行目の主兵装の砲の行を隠す＝ui/mission-mode） */
  get aaFiring(): boolean {
    return this.aa !== null && this.aa.status === AA_FIRING;
  }

  /** どれかの砲が標的を持って撃っている（大発・米PT・艦・対空） */
  get firing(): boolean {
    return this.surfaceFiring || (this.shipGun !== null && this.shipGun.battery.status === GUN_FIRING) || this.aaFiring;
  }

  /** 新しい道の弾倉交換の残り秒の切り上げ（交換していなければ 0） */
  get reloadN(): number {
    return this.mag !== null && this.mag.reloadLeftS > 0 ? Math.ceil(this.mag.reloadLeftS) : 0;
  }

  /** 狙う艦の無い魚雷を 1 本発射した（systems/torpedo-free の stepLauncher。発射の時に決着済み）: 数えて「大発の下を抜ける」などの文を出す */
  noteBlindTorpedo(): void {
    this.blindTorpedoes++;
    this.event(blindTorpedoCue(this.blindKind), 0);
  }

  /** 終わりの待ちの窓の間（systems/mission-end の holdFire。毎フレーム）: 新しい道を止める */
  hold(): void {
    this.endHold = true;
  }

  /** 固定ステップの最初（敵の側の最初）: 自分の弾倉の交換（押していなくても 1 回）→ 艦への機銃（駆逐艦の任務だけ）。撃てば閃光 */
  stepShips(w: ArmsWorld, g: ArmsShipGroup | null, dt: number, feelDt: number): void {
    if (this.ownsMag) magazineTick(this.mag!, this.magP!, feelDt);
    const sg = this.shipGun;
    if (!sg || !g) return;
    sg.step(w, g, w.input.gunHeld, this.canFire(w), this.mag, this.magP, feelDt, dt, this.shipEvents);
    if (sg.battery.fired) this.flash(w);
    this.shipLingerS = sg.battery.status === GUN_FIRING ? ARMS_CUE_LINGER_S : Math.max(0, this.shipLingerS - feelDt);
  }

  /** 閃光（艦への機銃の直後・駆逐艦の段の前）: 効いている間は敵の見つける距離を閃光の距離以上に（照明弾の上書きと同じ形。煙幕は効かない） */
  applyFlash(w: ArmsWorld): void {
    this.flashActive = w.stepTimeS <= this.flashUntilS;
    if (this.flashActive && w.detectRangeM < this.flashRevealM) w.detectRangeM = this.flashRevealM;
  }

  /**
   * 固定ステップの最後（米PT・機関の後。夜明けの空襲の段の前、夜の出撃は次のステップの前）: 撃墜の後なら順番を飛ばす（いつも）→ 主兵装の砲の状態 → 対空。
   * 艦艇を撃っている（大発・米PT の砲が標的を持つか弾倉交換・艦への機銃が標的を持つ）なら撃たない（状態は AA_BUSY）
   */
  stepAir(w: ArmsWorld, _dt: number, feelDt: number): void {
    if (this.downs > 0) this.skipDowned(w);
    const ptStatus = w.pts && w.pts.gun ? w.pts.gun.state.battery.status : GUN_SAFE;
    this.surfaceFiring = (w.hunt !== null && w.hunt.battery.status === GUN_FIRING) || ptStatus === GUN_FIRING;
    const held = w.input.gunHeld;
    const canFire = this.canFire(w);
    const st = this.aa;
    if (st && this.gun && this.aaParams && this.aaRng) {
      const busy = this.surfaceFiring || ptStatus === PT_GUN_RELOAD || (this.shipGun !== null && this.shipGun.battery.status === GUN_FIRING);
      const t = this.slots;
      t.n = 0;
      if (held && canFire && !busy) fillAaSlots(t, w, this.pose);
      const before = st.rounds;
      const k = stepAaFire(st, this.gun, this.aaParams, this.mag, this.magP, held, canFire && !busy, w.band, w.boat.state, t, this.aaRng, feelDt);
      if (held && canFire && busy) st.status = AA_BUSY;
      const n = st.rounds - before;
      if (n > 0) {
        this.aaRounds += n;
        this.flash(w);
        const b = w.boat.state;
        this.fxMuzzle(b.x, b.y);
        for (let r = 0; r < n; r++) this.fxAaRound(b.x, b.y, t.x[st.target]!, t.y[st.target]!);
      }
      if (k >= 0) this.down(w, k);
      this.aaLingerS = st.status === AA_FIRING ? ARMS_CUE_LINGER_S : Math.max(0, this.aaLingerS - feelDt);
    }
    this.updateCue(held && canFire);
  }

  /** 撃墜（枠 k）: 包みが撃墜を認めたときだけ数え、文を出し、順番を飛ばし、落ちる絵と爆発 */
  private down(w: ArmsWorld, k: number): void {
    const src = downSlot(this.slots, k, w, this.pose);
    if (src < 0) return;
    this.downs++;
    this.downsBy[src] = this.downsBy[src]! + 1;
    if (src === AA_SRC_SEAPLANE) this.seaplaneDowned = true;
    const ds = w.dawn.strike;
    this.event(src === AA_SRC_DAWN ? EV_DOWN_STRIKE : src === AA_SRC_SORTIE ? EV_DOWN_SORTIE : EV_DOWN_SEAPLANE, src === AA_SRC_DAWN && ds ? liveStrikePlanes(ds.state) : 0);
    this.skipDowned(w);
    this.fxDown(src, this.slots.x[k]!, this.slots.y[k]!, this.pose.headingDeg);
  }

  /** 撃墜された機の順番を飛ばす（夜明けの空襲と jp_02 の夜の出撃。撃墜が無ければ何もしない包み） */
  private skipDowned(w: ArmsWorld): void {
    const ds = w.dawn.strike;
    if (ds) skipDownedRuns(ds.state, ds.p);
    const pa = w.patrol;
    if (pa) skipDownedRuns(pa.flight.state, pa.sortie);
  }

  /** 新しい道が撃てる: 浮いている・帰投地点の輪の外・座礁していない・終わりの待ちでない */
  private canFire(w: ArmsWorld): boolean {
    return !w.boat.sinking && !w.atHome && !w.grounded && !this.endHold;
  }

  private flash(w: ArmsWorld): void {
    this.flashUntilS = w.stepTimeS + this.flashHoldS;
    this.flashActive = true;
  }

  private event(code: number, n: number): void {
    this.evCode = code;
    this.evN = n;
    this.evSeq++;
  }

  /**
   * 状態の文（押していて撃てる間だけ）。全部出す任務: 艦（撃っている＋残り）> 対空（同じ）> 弾倉交換 > 射界外 > 煙幕 > 射程に敵なし。
   * 主兵装の砲のある任務は対空だけ（主兵装の 2 行目の文と重ねない）
   */
  private updateCue(on: boolean): void {
    let code = CUE_NONE;
    let n = 0;
    if (on && this.fullCues) {
      const sg = this.shipGun ? this.shipGun.battery.status : GUN_SAFE;
      if (this.shipLingerS > 0) code = ST_SHIP;
      else if (this.aaLingerS > 0) code = ST_AA;
      else if (this.reloadN > 0) {
        code = ST_RELOAD;
        n = this.reloadN;
      } else if (sg === GUN_OUT_OF_ARC || (this.aa !== null && this.aa.status === AA_OUT_OF_ARC)) code = ST_ARC;
      else if (sg === GUN_BLOCKED) code = ST_SMOKE;
      else code = ST_NONE;
    } else if (on && this.aaLingerS > 0) code = ST_AA;
    this.stCode = code;
    this.stN = n;
  }

  /** 絵の口（Phaser 非依存の段では何もしない。systems/world-arms が描く）: 砲口の閃光・艦への弾の水柱・対空の 1 発・撃墜（世界の座標と向き） */
  protected fxMuzzle(_x: number, _y: number): void {}
  protected fxSplash(_x: number, _y: number, _hit: boolean): void {}
  protected fxAaRound(_fromX: number, _fromY: number, _toX: number, _toY: number): void {}
  protected fxDown(_src: number, _x: number, _y: number, _headingDeg: number): void {}
}
