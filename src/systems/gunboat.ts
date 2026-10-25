// 隼艇（H-38）の僚艇の世界側（v0.6.6「日本ハードモード⑤：隼艇」。jp_01 のハードだけ。docs/02 §6.4、spec-v066 §C.3・§C.4・§D.6・§E.5）: core/gunboat を固定ステップで進め
// （輸送隊の段の直後。判断 → 運動 → 帯 → valid を米PT の標的スロットの末尾の船体へ）、守りの砲の 25mm（systems/pt-gun を seed+22・薄い青・輪なしで。米PT の隊の events・水柱・結末の絵を共有）を
// 自艇の 25mm の後に撃ち、米PT が隼艇を見つける距離（target_range_factor × max(帯の発見距離, 閃光の記憶)）を標的スロットへ書く（模擬 core/convoy-sim-gunboat と同じ式・同じ段）。
// 標的が隼艇なら接触の閃光は隼艇から（撃ったステップだけ・倍率なし）。被弾は HP だけ（乱数なし）、沈没は僚艇と同じ tween と世界の onSunk（命中スロー＋爆発）。手柄の分けは systems/gunboat-credit。
// 絵: 自艇と同じ船形（boats.json の艇の絵を Boot で 1 枚）を僚艇の青で、下にラベル（data の label_ja「隼艇」。被弾の後は「隼艇 HP 44」、狙われている間は 2 行「隼艇／狙われている」の警告色、
// 決着の後に浜へ向かう・浜にいる間は「隼艇（浜）」）。表示は自艇の視程の内だけ（大発と同じ）。隠れている間は曳光弾と閃光も出さない（誰が撃っているか分からない。レビュー R13）。
// §7: 絵 1 枚・ラベル 1 つ・砲（曳光弾 24・閃光 1）を起動時に作り、毎フレームは位置・角度・表示だけ（字は HP・狙い・浜が変わったときだけ setText）。ctx と credit は 1 個だけ。
import Phaser from 'phaser';
import { DEPTH, RENDER_SCALE, boatTextureKey } from '../config/game-config';
import { GUNBOAT_AIMED_SUFFIX, GUNBOAT_BEACH_SUFFIX, GUNBOAT_HP_PREFIX, GUNBOAT_TRACER_TINT } from '../config/gunboat-config';
import { ESCORT_LABEL_FONT_PX, ESCORT_LABEL_OFFSET_M, ESCORT_TEXT_COLOR, ESCORT_TINT, HUD_COLOR_WARN, SINK_DURATION_MS, SINK_SCALE_TO, SINK_TILT_DEG, hudTextStyle } from '../config/ui-config';
import type { BoatState } from '../core/boat-motion';
import { createGunboat, hitGunboat, stepGunboat, writeGunboatTelemetry, type GunboatCtx, type GunboatParams, type GunboatState, type GunboatTelemetry } from '../core/gunboat';
import { GUNBOAT_GUN_SEED_OFFSET, type PtCheck, type PtEvents, type PtHull, type PtParams, type PtSection } from '../core/pt-boats';
import { ptHeldFlashM } from '../core/pt-target';
import { enemyDetectRangeM, speedFactorForBand, type VisibilityParams } from '../core/visibility';
import { createGunboatCredit, noteGunboatGun, type GunboatCredit } from './gunboat-credit';
import { PtGun } from './pt-gun';
import type { PtTargets } from './pt-target';
import type { SplashPool } from './splash-pool';

/** 隼艇の砲に米PT の隊（PtSquadron）が渡すもの: seed（+22 は砲が足す）・米PT の値・隊の知らせ・水柱・結末の絵（PtSquadron.onFate。手柄の fateBy もそこで書く） */
export interface GunboatGunKit {
  seed: number;
  pt: PtParams;
  events: PtEvents;
  splashes: SplashPool;
  onFate: (i: number, fate: number) => void;
}

export class Gunboat {
  readonly state: GunboatState;
  /** 米PT の標的スロットの末尾の船体（PtTargets が hulls に足す。valid は step と hit が書く） */
  readonly hull: PtHull;
  /** 自艇と隼艇の 25mm の手柄の分け（systems/gunboat-credit） */
  readonly credit: GunboatCredit;
  private readonly gun: PtGun;
  /** 隼艇の 25mm を最後に撃った体感秒（閃光の記憶。撃っていなければ −Infinity） */
  private lastFireS = -Infinity;
  private readonly sprite: Phaser.GameObjects.Image;
  private readonly label: Phaser.GameObjects.Text;
  private shown = false;
  /** ラベルの字の元（変わったときだけ setText）: HP・狙われている・浜 */
  private labelHp: number;
  private labelAimed = false;
  private labelBeach = false;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly p: GunboatParams,
    /** 判断の材料（自艇・輸送隊・米PT の隊・帰投の輪・海域・自艇の視程の二乗。visRange2 は step が書く） */
    private readonly ctx: GunboatCtx,
    /** 米PT が隼艇を見つける帯の距離の元（月明・速力帯）と基準の距離 m（pt_boats の base_detect_m） */
    private readonly vis: VisibilityParams,
    private readonly baseDetectM: number,
    /** 沈んだ（世界が命中スローと Scene の爆発。大発の撃破と同じ） */
    private readonly onSunk: (x: number, y: number) => void,
    kit: GunboatGunKit,
  ) {
    this.state = createGunboat(p, ctx.player);
    const b = this.state.boat;
    this.hull = { boat: b, halfLengthM: p.halfLengthM, halfBeamM: p.halfBeamM, valid: this.state.valid };
    this.credit = createGunboatCredit(ctx.pts.boats.length);
    this.labelHp = this.state.hp;
    this.sprite = scene.add.image(b.x, b.y, boatTextureKey(p.boatId)).setTint(ESCORT_TINT).setScale(1 / RENDER_SCALE).setAngle(b.headingDeg).setDepth(DEPTH.playerBoat).setVisible(false);
    this.label = scene.add.text(b.x, b.y + ESCORT_LABEL_OFFSET_M, p.labelJa, hudTextStyle(ESCORT_LABEL_FONT_PX, ESCORT_TEXT_COLOR)).setOrigin(0.5, 0).setAlign('center').setDepth(DEPTH.playerBoat).setVisible(false);
    this.gun = new PtGun(scene, p.gun, kit.seed, b, ctx.pts, kit.pt, kit.events, kit.splashes, kit.onFate, { seedOffset: GUNBOAT_GUN_SEED_OFFSET, tint: GUNBOAT_TRACER_TINT, ring: false });
  }

  /** 固定ステップ（輸送隊の段の直後。dt は time_scale 込み）: 判断 → 運動 → 帯 → valid を船体へ。ptTarget は米PT の隊の今の標的（0 = 自艇）、visRange2 は自艇の視程の二乗 */
  step(dt: number, ptTarget: number, playerSinking: boolean, visRange2: number): void {
    this.ctx.visRange2 = visRange2;
    stepGunboat(this.state, this.p, this.ctx, ptTarget, playerSinking, dt);
    this.hull.valid = this.state.valid;
  }

  /**
   * 自艇の 25mm の後・標的の選択の前（PtSquadron.step）: 守りの砲（held・帯は判断の結果、canFire は船体の valid）→ 命中・制圧・出来事は前後の差で隼艇の分に →
   * 米PT が隼艇を見つける距離 = 倍率 × max(帯の発見距離, 閃光の記憶) を標的スロットへ。撃ったか（このステップの閃光）を返す
   */
  fire(t: PtTargets, q: PtSection, nowS: number, visRange2: number, feelDt: number, dt: number): boolean {
    const h0 = q.gunHits;
    const u0 = q.suppressions;
    const e0 = q.gunEventSeq;
    const fired = this.gun.step(this.state.band, this.state.held, this.state.valid, visRange2, feelDt, dt);
    noteGunboatGun(this.credit, q, h0, u0, e0);
    if (fired) this.lastFireS = nowS;
    const bandM = enemyDetectRangeM(this.baseDetectM, speedFactorForBand(this.state.band, this.vis.speedFactor), this.vis, false);
    t.setGunboatDetect(this.p.targetRangeFactor * Math.max(bandM, ptHeldFlashM(nowS, this.lastFireS, t.rule.flashHoldS, this.p.gun.flashRevealM)));
    return fired;
  }

  /** 標的を選んだ後（今の標的が隼艇のときだけ呼ぶ）: 接触の閃光は隼艇がこのステップに撃ったときの閃光の距離（倍率なし）と隼艇の位置 */
  contactFlash(c: PtCheck, fired: boolean): void {
    c.flashM = fired ? this.p.gun.flashRevealM : 0;
    c.flashX = this.state.boat.x;
    c.flashY = this.state.boat.y;
  }

  /** PT の弾の 1 命中（PtTargets.gunboatHit が呼ぶ）: HP だけ（乱数なし）。この弾で沈んだら船体を落とし、沈み込みの tween と世界の onSunk、true */
  hit(damage: number, nowS: number): boolean {
    if (!hitGunboat(this.state, damage, nowS)) return false;
    this.hull.valid = false;
    const b = this.state.boat;
    this.sprite.setVisible(true).setPosition(b.x, b.y).setAngle(b.headingDeg);
    this.label.setVisible(true).setPosition(b.x, b.y + ESCORT_LABEL_OFFSET_M);
    this.scene.tweens.add({ targets: [this.sprite, this.label], scaleX: this.sprite.scaleX * SINK_SCALE_TO, scaleY: this.sprite.scaleY * SINK_SCALE_TO, alpha: 0, angle: this.sprite.angle + SINK_TILT_DEG, duration: SINK_DURATION_MS, ease: 'Sine.easeIn' });
    this.onSunk(b.x, b.y);
    return true;
  }

  /** 毎フレーム（PtSquadron.updateVisuals）: 自艇の視程の内だけ絵とラベルを出し、字は変わったときだけ。砲の曳光弾と閃光は絵が見えている間だけ。沈み込みは tween に任せる */
  updateVisuals(realDt: number, player: BoatState, visRange2: number, aimed: boolean): void {
    const g = this.state;
    const b = g.boat;
    const show = !g.sunk && (b.x - player.x) * (b.x - player.x) + (b.y - player.y) * (b.y - player.y) <= visRange2;
    this.gun.updateVisuals(realDt, show);
    if (g.sunk) return;
    if (show !== this.shown) {
      this.shown = show;
      this.sprite.setVisible(show);
      this.label.setVisible(show);
    }
    if (!show) return;
    this.sprite.setPosition(b.x, b.y).setAngle(b.headingDeg);
    this.label.setPosition(b.x, b.y + ESCORT_LABEL_OFFSET_M);
    if (g.hp === this.labelHp && aimed === this.labelAimed && g.toBeach === this.labelBeach) return;
    this.labelHp = g.hp;
    this.labelAimed = aimed;
    this.labelBeach = g.toBeach;
    this.label.setText(`${this.p.labelJa}${g.toBeach ? GUNBOAT_BEACH_SUFFIX : ''}${g.hp < this.p.hullHp ? `${GUNBOAT_HP_PREFIX}${g.hp}` : ''}${aimed ? GUNBOAT_AIMED_SUFFIX : ''}`).setColor(aimed ? HUD_COLOR_WARN : ESCORT_TEXT_COLOR);
  }

  /** 隼艇の 25mm が撃った弾（Result の「命中 9/39 発」の分母。systems/mission-result-extras） */
  get shots(): number {
    return this.gun.state.battery.shots;
  }

  /** HUD のテレメトリへ（mission-telemetry が毎フレーム。平方根 1 回）。絵が出ているか（updateVisuals の自艇の視程の判定）も */
  writeTelemetry(t: GunboatTelemetry, player: BoatState): void {
    writeGunboatTelemetry(t, this.state, this.p, player);
    t.inSight = this.shown;
  }

  destroy(): void {
    this.gun.destroy();
    this.sprite.destroy();
    this.label.destroy();
  }
}
