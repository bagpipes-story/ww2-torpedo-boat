// 味方の駆逐艦 卯月の絵（v0.6.10 S5a。jp_04「多号作戦・オルモック湾へ」。docs/02 §6.11、spec-v0610 リードの決定 LD15・LD16）: 泊地の北東に止まった艦（assets/ally-destroyer-placeholder の
// tex-destroyer-friendly。輸送船と同じ薄い青・いつも見える）・ラベル「卯月」（船体の上＝北。HUD の矩形に重なれば出さない＝輸送船の「揚陸地点」の字と同じ ui/ally-ship-view の allyMarkLabelShown）・
// 海の上の見張りの扇（tex-ally-fan。ui/ally-fan の形＝速い PT の見張りの半径・陸を切り落とした 1 枚。薄く、照らす PT がいる間は少し濃く）・探照灯（敵の駆逐艦と同じ tex-searchlight を
// 光の向き core/gunnery の light.bearingDeg へ回す。消えたら ALLY_BEAM_FADE_S で薄れる）・砲弾（core の砲弾のプールと同じ数の絵。12 cm は点・25 mm は曳光、薄い青）・砲口の閃光・着弾の水柱（自分のプール）。
// 艦は動かない: 艦・ラベル・扇・探照灯の位置は起動時に 1 回。§7: 絵はみな起動時に作り、毎フレームは位置・角度・alpha・visible のうち変わるものだけ触る（Graphics.clear も setText もしない）。
import Phaser from 'phaser';
import { ALLY_BEAM_FADE_S, ALLY_FAN_ALPHA, ALLY_FAN_ALPHA_ACTIVE, ALLY_SPLASH_POOL_SIZE, ALLY_TRACER_TINT } from '../config/ally-config';
import { DEPTH, RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import { LANDING_TEXT_HYST_PX } from '../config/landing-config';
import {
  ESCORT_LABEL_FONT_PX, ESCORT_LABEL_OFFSET_M, ESCORT_TEXT_COLOR, MUZZLE_FLASH_LIFETIME_S, MUZZLE_FLASH_SCALE, SEARCHLIGHT_ALPHA, SEARCHLIGHT_TEX_LENGTH_UNITS, SPLASH_SCALE_HIT, SPLASH_SCALE_MISS, hudTextStyle,
} from '../config/ui-config';
import type { AllyDestroyerParams } from '../core/ally-destroyer-data';
import type { GunneryState } from '../core/gunnery';
import { degToRad, radToDeg } from '../core/units';
import { SplashPool } from '../systems/splash-pool';
import { allyFanFor } from '../ui/ally-fan';
import { allyMarkLabelShown, allyShipLabelYs } from '../ui/ally-ship-view';
import type { ScreenRect } from '../ui/landing-markers';

export class AllyDestroyerView {
  private readonly sprite: Phaser.GameObjects.Image;
  private readonly label: Phaser.GameObjects.Text;
  private readonly fan: Phaser.GameObjects.Image;
  private readonly beam: Phaser.GameObjects.Image;
  private readonly flash: Phaser.GameObjects.Image;
  private readonly shells: Phaser.GameObjects.Image[] = [];
  /** 砲弾の絵が今どの砲のテクスチャか（−1 は未設定。12 cm は点・ほかは曳光） */
  private readonly shellGun: Int8Array;
  private readonly splashes: SplashPool;
  /** 扇が濃い（照らす PT がいる）・ラベルが出ている・探照灯が消えてからの実秒（Infinity は消えきった）・閃光の実秒 */
  private fanActive = false;
  private labelShown = true;
  private beamOffS = Infinity;
  private flashAge = Infinity;
  /** ラベルの中央の x・下端の y（ワールド。動かない） */
  private readonly labelX: number;
  private readonly labelY: number;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly p: AllyDestroyerParams,
    /** 陸のある任務（岸 coast）と海域の南の縁（扇を陸で切る。Boot と同じ値） */
    hasCoast: boolean,
    boundsHeight: number,
    /** ラベルが重なってはいけない HUD の矩形（論理 px。ui/landing-markers の landingHudRects。輸送船の字と同じ） */
    private readonly hud: readonly ScreenRect[],
  ) {
    const fan = allyFanFor(p, hasCoast, boundsHeight);
    this.fan = scene.add.image(p.x, p.y, TEXTURE_KEYS.allyFan).setOrigin(fan.originX, fan.originY).setScale(fan.mPerPx).setAlpha(ALLY_FAN_ALPHA).setDepth(DEPTH.returnRing);
    this.sprite = scene.add.image(p.x, p.y, TEXTURE_KEYS.destroyerFriendly).setScale(1 / RENDER_SCALE).setAngle(p.headingDeg).setDepth(DEPTH.destroyer);
    const h = degToRad(p.headingDeg);
    const halfY = (this.sprite.displayHeight / 2) * Math.abs(Math.cos(h)) + (this.sprite.displayWidth / 2) * Math.abs(Math.sin(h));
    this.labelX = p.x;
    this.labelY = allyShipLabelYs(p.y, halfY, ESCORT_LABEL_OFFSET_M, 0).labelY;
    this.label = scene.add.text(this.labelX, this.labelY, p.labelJa, hudTextStyle(ESCORT_LABEL_FONT_PX, ESCORT_TEXT_COLOR)).setOrigin(0.5, 1).setDepth(DEPTH.destroyer);
    // 探照灯: 光源（テクスチャの下端）を艦の位置に。角度 0 で北へ伸びる（敵の駆逐艦の systems/enemy-fire と同じ絵・倍率・濃さ）
    this.beam = scene.add
      .image(p.x, p.y, TEXTURE_KEYS.searchlight)
      .setOrigin(0.5, 1)
      .setAlpha(SEARCHLIGHT_ALPHA)
      .setDepth(DEPTH.light)
      .setScale(p.gunnery.searchlight.rangeM / SEARCHLIGHT_TEX_LENGTH_UNITS / RENDER_SCALE)
      .setVisible(false);
    this.flash = scene.add.image(p.x, p.y, TEXTURE_KEYS.explosionRing).setTint(ALLY_TRACER_TINT).setScale(MUZZLE_FLASH_SCALE / RENDER_SCALE).setDepth(DEPTH.effects).setVisible(false);
    this.shellGun = new Int8Array(p.shellPoolSize).fill(-1);
    for (let i = 0; i < p.shellPoolSize; i++) this.shells.push(scene.add.image(0, 0, TEXTURE_KEYS.tracer).setScale(1 / RENDER_SCALE).setTint(ALLY_TRACER_TINT).setDepth(DEPTH.shell).setVisible(false));
    this.splashes = new SplashPool(scene, ALLY_SPLASH_POOL_SIZE, SPLASH_SCALE_MISS, SPLASH_SCALE_HIT);
  }

  /** 撃った（core の AllyFx。固定ステップの中）: 砲口の閃光 */
  fired(x: number, y: number): void {
    this.flash.setPosition(x, y).setAlpha(1).setVisible(true);
    this.flashAge = 0;
  }

  /** 着弾（core の AllyFx。固定ステップの中）: 水柱（生きた PT に当たれば橙で大きく） */
  impact(x: number, y: number, hit: boolean): void {
    this.splashes.splash(x, y, hit);
  }

  /** 毎フレーム: 扇の濃さ（照らす PT の有無が変わったときだけ）・探照灯・砲弾・閃光・水柱・ラベル（g と target は core/ally-destroyer の状態を読むだけ） */
  update(realDt: number, g: GunneryState, target: number): void {
    const active = target >= 0;
    if (active !== this.fanActive) {
      this.fanActive = active;
      this.fan.setAlpha(active ? ALLY_FAN_ALPHA_ACTIVE : ALLY_FAN_ALPHA);
    }
    this.updateBeam(realDt, g);
    const shells = g.shells;
    for (let i = 0; i < shells.length; i++) {
      const s = shells[i]!;
      const img = this.shells[i]!;
      if (!s.active) {
        if (img.visible) img.setVisible(false);
        continue;
      }
      if (this.shellGun[i] !== s.gunIndex) {
        this.shellGun[i] = s.gunIndex;
        img.setTexture(s.gunIndex === this.p.sinkGunIndex ? TEXTURE_KEYS.shell : TEXTURE_KEYS.tracer);
      }
      if (!img.visible) img.setVisible(true);
      img.setPosition(s.x, s.y).setAngle(radToDeg(Math.atan2(s.vx, -s.vy)));
    }
    if (this.flashAge !== Infinity) {
      this.flashAge += realDt;
      if (this.flashAge >= MUZZLE_FLASH_LIFETIME_S) {
        this.flashAge = Infinity;
        this.flash.setVisible(false);
      } else this.flash.setAlpha(1 - this.flashAge / MUZZLE_FLASH_LIFETIME_S);
    }
    this.splashes.updateVisuals(realDt);
    this.placeLabel();
  }

  /** 探照灯: 点いている間は光の向きへ（濃さはいつもの値）、消えたら向きはそのまま ALLY_BEAM_FADE_S で薄れて隠す */
  private updateBeam(realDt: number, g: GunneryState): void {
    const light = g.light;
    if (light.on) {
      this.beam.setAngle(light.bearingDeg);
      if (this.beamOffS !== 0) {
        this.beamOffS = 0;
        this.beam.setAlpha(SEARCHLIGHT_ALPHA).setVisible(true);
      }
      return;
    }
    if (this.beamOffS === Infinity) return;
    this.beamOffS += realDt;
    if (this.beamOffS >= ALLY_BEAM_FADE_S) {
      this.beamOffS = Infinity;
      this.beam.setVisible(false);
    } else this.beam.setAlpha(SEARCHLIGHT_ALPHA * (1 - this.beamOffS / ALLY_BEAM_FADE_S));
  }

  /** ラベル「卯月」: 箱を本当のカメラで論理画面へ写し、HUD の矩形に重なれば出さない（変わったときだけ setVisible。最初の描画の前＝worldView が空なら何もしない） */
  private placeLabel(): void {
    const cam = this.scene.cameras.main;
    const v = cam.worldView;
    if (v.width <= 0) return;
    const z = cam.zoom / RENDER_SCALE;
    const hw = (this.label.width / 2) * z;
    const cx = (this.labelX - v.x) * z;
    const by = (this.labelY - v.y) * z;
    const shown = allyMarkLabelShown(this.labelShown, cx - hw, by - this.label.height * z, cx + hw, by, this.hud, LANDING_TEXT_HYST_PX);
    if (shown === this.labelShown) return;
    this.labelShown = shown;
    this.label.setVisible(shown);
  }

  destroy(): void {
    this.sprite.destroy();
    this.label.destroy();
    this.fan.destroy();
    this.beam.destroy();
    this.flash.destroy();
    for (const s of this.shells) s.destroy();
    this.splashes.destroy();
  }
}
