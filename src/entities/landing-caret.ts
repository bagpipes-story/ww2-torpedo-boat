// 海の上の ▼「雷撃」（v0.6.9 S6b。jp_04。spec-v069 §5.4・D9）: 見張りの報告の PT が画面の内で自艇の視程の外（PT の絵が出ていない）間、その PT の真上に赤い ▼ と「雷撃」を出す
// （画面の外は端の「雷撃 N m」の印＝ui/hud-markers）。出すかどうかは ui/landing-markers の landingCaretShown、置き場所は systems/world-landing が毎フレーム渡す。
// HUD に重ねない（S6b。S6a-fix の報告で輸送船の字が上の HUD に重なった）: PT の論理画面の点が画面の内で、▼ と字の箱が上の帯・右端の技能のボタン・兵装に重ならないときだけ出す
// （ui/landing-markers の landingCaretFits・landingCaretRects。重なれば端の印が縁から指す。本当のカメラの worldView とズームで写す＝追従の遅れも込み）。update は出したかを返す（テレメトリの caretShown）。
// 絵は出撃の組み立てで 1 回だけ作る（▼ は画面の端の印と同じ tex-target-marker を 180° 回す＝新しい絵は無い）。§7: 毎フレームは位置だけ（transform）、出し入れは変わったときだけ、
// 大きさはズームが変わったときだけ（どのズームでも画面の端の印のラベルと同じ 18 px・同じ間に見える）。
import Phaser from 'phaser';
import { DEPTH, GAME_HEIGHT, GAME_WIDTH, RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import { LANDING_CARET_DY_PX, LANDING_CARET_LABEL, LANDING_CARET_LABEL_DY_PX } from '../config/landing-config';
import { HUD_COLOR_WARN, HUD_FONT_MARKER_PX, TARGET_MARKER_SIZE, hudTextStyle } from '../config/ui-config';
import { landingCaretFits, type ScreenRect } from '../ui/landing-markers';

/** ▼ は上向きの三角の絵を逆さに */
const CARET_ANGLE_DEG = 180;

export class LandingCaret {
  private readonly arrow: Phaser.GameObjects.Image;
  private readonly label: Phaser.GameObjects.Text;
  private shown = false;
  /** 最後に大きさを合わせた論理ズーム（NaN は未設定） */
  private zoom = NaN;
  /** ▼ と字の箱の、PT の点からの左右の半幅・上端の上げ・下端の上げ（論理 px。どのズームでも同じ大きさ。組み立てで 1 回） */
  private readonly halfW: number;
  private readonly topDy: number;
  private readonly bottomDy: number;

  constructor(
    private readonly scene: Phaser.Scene,
    /** ▼ が重なってはいけない矩形（論理 px。ui/landing-markers の landingCaretRects） */
    private readonly rects: readonly ScreenRect[],
  ) {
    this.arrow = scene.add.image(0, 0, TEXTURE_KEYS.targetMarker).setAngle(CARET_ANGLE_DEG).setDepth(DEPTH.effects).setVisible(false);
    this.label = scene.add.text(0, 0, LANDING_CARET_LABEL, hudTextStyle(HUD_FONT_MARKER_PX, HUD_COLOR_WARN)).setOrigin(0.5, 1).setDepth(DEPTH.effects).setVisible(false);
    this.halfW = Math.max(this.label.width, TARGET_MARKER_SIZE) / 2;
    this.topDy = LANDING_CARET_LABEL_DY_PX + this.label.height;
    this.bottomDy = LANDING_CARET_DY_PX - TARGET_MARKER_SIZE / 2;
  }

  /** 毎フレーム: show（報告の PT が視程の外）で、PT の点 (x, y)（世界の m）が ▼ を立てられる所なら真上へ ▼ と字を置く。出したかを返す */
  update(show: boolean, x: number, y: number): boolean {
    const cam = this.scene.cameras.main;
    const z = cam.zoom / RENDER_SCALE;
    const v = cam.worldView;
    const on = show && v.width > 0 && landingCaretFits((x - v.x) * z, (y - v.y) * z, GAME_WIDTH, GAME_HEIGHT, this.halfW, this.topDy, this.bottomDy, this.rects);
    if (on !== this.shown) {
      this.shown = on;
      this.arrow.setVisible(on);
      this.label.setVisible(on);
    }
    if (!on) return false;
    if (z !== this.zoom) {
      this.zoom = z;
      this.arrow.setScale(1 / (RENDER_SCALE * z));
      this.label.setScale(1 / z);
    }
    this.arrow.setPosition(x, y - LANDING_CARET_DY_PX / z);
    this.label.setPosition(x, y - LANDING_CARET_LABEL_DY_PX / z);
    return true;
  }

  destroy(): void {
    this.arrow.destroy();
    this.label.destroy();
  }
}
