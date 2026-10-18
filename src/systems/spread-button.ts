// 扇の角度ボタン（v0.5.1 実機 1 回目。docs/02 §5）: 魚雷ボタンの下の小さな横長のボタン。押して同じボタンの上で離すたびに 狭 3° → 中 4° → 広 5° → 狭 …
// （data の salvo_spacing_choices_deg）。一斉の扇の隣どうしの間隔（魚雷ボタンと共有の SpreadConfig.spacingDeg）を書き換える。
// 選んだ間隔は覚える（Registry と localStorage。次の任務・次に開いたときも同じ。読めない・書けなければ覚えないだけ）。
// 作ってから TORPEDO_BUTTON_ARM_MS は押下を受けない（Briefing の「出撃」が右下にあり、2 度押しで間隔が変わらないように）。文字は変わったときだけ（§7）。
import Phaser from 'phaser';
import { DEPTH } from '../config/game-config';
import { MENU_FILL_COLOR, MENU_STROKE_ALPHA, MENU_STROKE_PX } from '../config/menu-config';
import {
  HUD_COLOR_STRONG,
  SPREAD_BUTTON_FILL_ALPHA,
  SPREAD_BUTTON_FONT_PX,
  SPREAD_BUTTON_H,
  SPREAD_BUTTON_LABELS,
  SPREAD_BUTTON_PRESSED_ALPHA,
  SPREAD_BUTTON_W,
  TORPEDO_BUTTON_ARM_MS,
  hudTextStyle,
} from '../config/ui-config';
import { nextSpacing, spacingChoices, type SpreadConfig } from '../core/salvo';

/** 覚える場所（Registry の鍵と localStorage の鍵） */
export const REGISTRY_KEY_SPREAD_DEG = 'salvoSpacingDeg';
const STORAGE_KEY = 'night-hunters.salvo-spacing-deg';

function loadStored(): number {
  try {
    const v = globalThis.localStorage?.getItem(STORAGE_KEY);
    return v === null || v === undefined ? Number.NaN : Number(v);
  } catch {
    return Number.NaN;
  }
}

function store(deg: number): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, String(deg));
  } catch {
    // プライベートブラウズ等: 覚えないだけ
  }
}

export class SpreadButton {
  private readonly rect: Phaser.GameObjects.Rectangle;
  private readonly text: Phaser.GameObjects.Text;
  private readonly choices: number[];
  private readonly armTimer: Phaser.Time.TimerEvent;
  private armed = false;
  private pointerId = -1;

  constructor(
    private readonly scene: Phaser.Scene,
    cx: number,
    cy: number,
    private readonly spread: SpreadConfig,
    private readonly defaultDeg: number,
    choices: readonly number[],
  ) {
    this.choices = spacingChoices(choices, defaultDeg, SPREAD_BUTTON_LABELS.length);
    // 前に選んだ間隔（この起動の Registry → 端末の localStorage → data の最初の選択）
    const remembered = scene.registry.get(REGISTRY_KEY_SPREAD_DEG) as number | undefined;
    const start = [remembered ?? Number.NaN, loadStored()].find((d) => this.choices.includes(d)) ?? defaultDeg;
    this.spread.spacingDeg = start;
    this.rect = scene.add.rectangle(cx, cy, SPREAD_BUTTON_W, SPREAD_BUTTON_H, MENU_FILL_COLOR, SPREAD_BUTTON_FILL_ALPHA).setStrokeStyle(MENU_STROKE_PX, MENU_FILL_COLOR, MENU_STROKE_ALPHA).setDepth(DEPTH.hud).setInteractive();
    this.text = scene.add.text(cx, cy, '', hudTextStyle(SPREAD_BUTTON_FONT_PX, HUD_COLOR_STRONG)).setOrigin(0.5).setDepth(DEPTH.hud + 1);
    this.refreshLabel();
    this.armTimer = scene.time.delayedCall(TORPEDO_BUTTON_ARM_MS, () => {
      this.armed = true;
    });
    this.rect.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, this.onDown, this);
    this.rect.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, this.onUp, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onRelease, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onRelease, this);
  }

  /** 今の間隔（度） */
  get spacingDeg(): number {
    return this.spread.spacingDeg;
  }

  /** 押しかけを取り消す（一時停止。v0.5.1） */
  cancel(): void {
    if (this.pointerId === -1) return;
    this.pointerId = -1;
    this.rect.setFillStyle(MENU_FILL_COLOR, SPREAD_BUTTON_FILL_ALPHA);
  }

  destroy(): void {
    this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.onRelease, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onRelease, this);
    this.armTimer.remove(false);
    this.rect.destroy();
    this.text.destroy();
  }

  private refreshLabel(): void {
    const i = this.choices.indexOf(this.spread.spacingDeg);
    const label = `扇 ${SPREAD_BUTTON_LABELS[i] ?? ''} ${this.spread.spacingDeg}°`;
    if (this.text.text !== label) this.text.setText(label);
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (!this.armed || this.pointerId !== -1) return;
    this.pointerId = p.id;
    this.rect.setFillStyle(MENU_FILL_COLOR, SPREAD_BUTTON_PRESSED_ALPHA);
  }

  /** 同じボタンの上で離したら次の間隔（iOS の取り消しは決定にしない） */
  private onUp(p: Phaser.Input.Pointer): void {
    if (p.id !== this.pointerId) return;
    this.cancel();
    if (p.wasCanceled) return;
    this.spread.spacingDeg = nextSpacing(this.choices, this.spread.spacingDeg, this.defaultDeg);
    this.scene.registry.set(REGISTRY_KEY_SPREAD_DEG, this.spread.spacingDeg);
    store(this.spread.spacingDeg);
    this.refreshLabel();
  }

  private onRelease(p: Phaser.Input.Pointer): void {
    if (p.id === this.pointerId) this.cancel();
  }
}
