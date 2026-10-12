// Title・Briefing・Result の矩形ボタンとビルド番号（v0.4.0）。静的な画面なので作るのは 1 回だけ。見た目が変わるのは押下・有効・選択・2 行目のときだけ（§7）。
// 押下はボタンの上で、同じ指をボタンの上で離すと決定（外で離せば取り消し）。画面ができてから delayMs は押下を受けない（前の画面から押しっぱなしの指・2 度押しで進まない）。
import Phaser from 'phaser';
import { DEPTH, GAME_WIDTH, HUD_MARGIN } from '../config/game-config';
import {
  MENU_DISABLED_ALPHA,
  MENU_FILL_ALPHA,
  MENU_FILL_COLOR,
  MENU_FILL_PRESSED_ALPHA,
  MENU_INPUT_DELAY_MS,
  MENU_PAD_X,
  MENU_PAD_Y,
  MENU_SELECTED_COLOR,
  MENU_SELECTED_STROKE_PX,
  MENU_STROKE_ALPHA,
  MENU_STROKE_PX,
  MENU_SUB_PX,
  MENU_TWO_LINE_DY,
} from '../config/menu-config';
import { HUD_COLOR, HUD_COLOR_STRONG, HUD_FONT_DEBUG_PX, hudTextStyle } from '../config/ui-config';

export interface MenuButtonSpec {
  /** 左上と大きさ */
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  titlePx: number;
  /** 2 行目（undefined なら 1 行。'' なら題を中央に置いたまま 2 行目の場所を取っておき、後から setSub で変えられる）。subPx の既定は MENU_SUB_PX */
  sub?: string;
  subPx?: number;
  /** 右端の文（Title の行の状態） */
  right?: string;
  rightPx?: number;
  rightColor?: string;
  /** left: Title の行（題は左上、2 行目は左下、right は右端の中央）。center: 題は中央、2 行目が空でなければ題を cy−MENU_TWO_LINE_DY、2 行目を cy+MENU_TWO_LINE_DY */
  align: 'left' | 'center';
}

/** 押していない印（Phaser の pointer.id は 0 以上） */
const NO_POINTER = -1;

export class MenuButton {
  private readonly rect: Phaser.GameObjects.Rectangle;
  private readonly texts: Phaser.GameObjects.Text[] = [];
  private readonly titleText: Phaser.GameObjects.Text;
  private readonly subText: Phaser.GameObjects.Text | null = null;
  /** center 揃えの中心 y（2 行目が空かどうかで題の y を切り替える）。left 揃えは NaN */
  private readonly centerY: number = NaN;
  private readonly timer: Phaser.Time.TimerEvent;
  private armed = false;
  private enabled = true;
  private selected = false;
  private pointerId = NO_POINTER;

  constructor(
    private readonly scene: Phaser.Scene,
    spec: MenuButtonSpec,
    private readonly onTap: () => void,
    delayMs: number = MENU_INPUT_DELAY_MS,
  ) {
    const { x, y, w, h } = spec;
    this.rect = scene.add
      .rectangle(x + w / 2, y + h / 2, w, h, MENU_FILL_COLOR, MENU_FILL_ALPHA)
      .setStrokeStyle(MENU_STROKE_PX, MENU_FILL_COLOR, MENU_STROKE_ALPHA)
      .setDepth(DEPTH.hud)
      .setInteractive();
    const add = (tx: number, ty: number, text: string, px: number, color: string, ox: number, oy: number): Phaser.GameObjects.Text => {
      const t = scene.add.text(tx, ty, text, hudTextStyle(px, color)).setOrigin(ox, oy).setDepth(DEPTH.hud + 1);
      this.texts.push(t);
      return t;
    };
    const subPx = spec.subPx ?? MENU_SUB_PX;
    if (spec.align === 'left') {
      this.titleText = add(x + MENU_PAD_X, y + MENU_PAD_Y, spec.title, spec.titlePx, HUD_COLOR_STRONG, 0, 0);
      if (spec.sub !== undefined) this.subText = add(x + MENU_PAD_X, y + h - MENU_PAD_Y, spec.sub, subPx, HUD_COLOR, 0, 1);
    } else {
      const cx = x + w / 2;
      this.centerY = y + h / 2;
      this.titleText = add(cx, this.titleY(spec.sub ?? ''), spec.title, spec.titlePx, HUD_COLOR_STRONG, 0.5, 0.5);
      if (spec.sub !== undefined) this.subText = add(cx, this.centerY + MENU_TWO_LINE_DY, spec.sub, subPx, HUD_COLOR, 0.5, 0.5);
    }
    if (spec.right !== undefined) add(x + w - MENU_PAD_X, y + h / 2, spec.right, spec.rightPx ?? subPx, spec.rightColor ?? HUD_COLOR, 1, 0.5);

    this.timer = scene.time.delayedCall(delayMs, () => {
      this.armed = true;
    });
    this.rect.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, this.onDown, this);
    this.rect.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, this.onUp, this);
    // ボタンの外で離した: 取り消すだけ（GO の up が先に来るので、決定の後にここで二重に動くことはない）
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onRelease, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onRelease, this);
  }

  /** 変わったときだけ。矩形と文字の α を 1 / MENU_DISABLED_ALPHA に。無効にしたら押下中も取り消す */
  setEnabled(v: boolean): void {
    if (v === this.enabled) return;
    this.enabled = v;
    const a = v ? 1 : MENU_DISABLED_ALPHA;
    this.rect.setAlpha(a);
    for (const t of this.texts) t.setAlpha(a);
    if (!v) this.release();
  }

  /** 選んだ選択肢: 枠を太く白く（戻すと元の枠） */
  setSelected(v: boolean): void {
    if (v === this.selected) return;
    this.selected = v;
    if (v) this.rect.setStrokeStyle(MENU_SELECTED_STROKE_PX, MENU_SELECTED_COLOR, 1);
    else this.rect.setStrokeStyle(MENU_STROKE_PX, MENU_FILL_COLOR, MENU_STROKE_ALPHA);
  }

  /** 2 行目を変える（作るときに sub を渡したボタンだけ。変わったときだけ setText。center 揃えは空なら題を中央へ） */
  setSub(text: string): void {
    if (!this.subText || this.subText.text === text) return;
    this.subText.setText(text);
    if (!Number.isNaN(this.centerY)) this.titleText.setY(this.titleY(text));
  }

  destroy(): void {
    this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.onRelease, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onRelease, this);
    this.timer.remove(false);
    this.rect.destroy();
    for (const t of this.texts) t.destroy();
    this.texts.length = 0;
  }

  /** center 揃えの題の y: 2 行目が空なら中央、あれば上へずらす */
  private titleY(sub: string): number {
    return sub === '' ? this.centerY : this.centerY - MENU_TWO_LINE_DY;
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (!this.armed || !this.enabled || this.pointerId !== NO_POINTER) return;
    this.pointerId = p.id;
    this.rect.setFillStyle(MENU_FILL_COLOR, MENU_FILL_PRESSED_ALPHA);
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (p.id !== this.pointerId) return;
    this.release();
    if (this.enabled) this.onTap();
  }

  private onRelease(p: Phaser.Input.Pointer): void {
    if (p.id === this.pointerId) this.release();
  }

  private release(): void {
    if (this.pointerId === NO_POINTER) return;
    this.pointerId = NO_POINTER;
    this.rect.setFillStyle(MENU_FILL_COLOR, MENU_FILL_ALPHA);
  }
}

/** 上中央にビルド番号（CLAUDE.md §3。DebugHud と同じ位置）。固定文字列なので 1 回だけ描く */
export function addBuildLabel(scene: Phaser.Scene): Phaser.GameObjects.Text {
  return scene.add
    .text(GAME_WIDTH / 2, HUD_MARGIN, import.meta.env.VITE_BUILD_LABEL, hudTextStyle(HUD_FONT_DEBUG_PX, HUD_COLOR))
    .setOrigin(0.5, 0)
    .setDepth(DEPTH.hud);
}

/** 折り返す文の style（CJK は単語の区切りが無いので advanced wrap が要る） */
export function menuWrapStyle(px: number, color: string, width: number): Phaser.Types.GameObjects.Text.TextStyle {
  return { ...hudTextStyle(px, color), wordWrap: { width, useAdvancedWrap: true } };
}
