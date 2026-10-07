// HUD シーン: Mission の上に重ねて動く。カメラは RENDER_SCALE 倍ズームで論理座標 1280×720 を保つ。
// デバッグHUD（FPS・ビルド番号）、速力・舵、バーチャルスティック、PC デバッグキーをここに置く。
import Phaser from 'phaser';
import {
  GAME_HEIGHT,
  GAME_WIDTH,
  HUD_MARGIN,
  REGISTRY_KEY_DATA,
  REGISTRY_KEY_INPUT,
  REGISTRY_KEY_TELEMETRY,
  RENDER_SCALE,
  SCENE_KEYS,
} from '../config/game-config';
import { getGameData } from '../config/game-data';
import type { InputState } from '../core/input-state';
import type { SpreadConfig } from '../core/salvo';
import { ROUND_BUTTON_RADIUS } from '../config/ui-config';
import { HoldButton } from '../systems/hold-button';
import { KeyboardInput } from '../systems/keyboard-input';
import { TorpedoButton } from '../systems/torpedo-button';
import { VirtualStick } from '../systems/virtual-stick';
import { BoatHud } from '../ui/boat-hud';
import { DebugHud } from '../ui/debug-hud';
import { HpBar } from '../ui/hp-bar';
import { TargetMarker } from '../ui/target-marker';
import type { BoatTelemetry } from '../core/boat-motion';

export class HudScene extends Phaser.Scene {
  private debugHud?: DebugHud;
  private boatHud?: BoatHud;
  private hpBar?: HpBar;
  private targetMarker?: TargetMarker;
  private stick?: VirtualStick;
  private torpedoButton?: TorpedoButton;
  private smokeButton?: HoldButton;
  private lookoutButton?: HoldButton;
  private keyboard?: KeyboardInput;
  private telemetry!: BoatTelemetry;

  constructor() {
    super(SCENE_KEYS.hud);
  }

  create(): void {
    // 論理座標 1280×720 を canvas（1280×RENDER_SCALE）に合わせる
    this.cameras.main.setZoom(RENDER_SCALE).centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);

    const data = getGameData(this.registry, REGISTRY_KEY_DATA);
    const input = this.registry.get(REGISTRY_KEY_INPUT) as InputState;
    this.telemetry = this.registry.get(REGISTRY_KEY_TELEMETRY) as BoatTelemetry;

    this.debugHud = new DebugHud(this, {
      buildLabel: import.meta.env.VITE_BUILD_LABEL,
      dataSummary: `data v${data.hitRateModel.version} / time_scale x${data.hitRateModel.world.time_scale}`,
    });
    this.boatHud = new BoatHud(this);
    this.hpBar = new HpBar(this);
    this.targetMarker = new TargetMarker(this);
    this.stick = new VirtualStick(this, input);
    const launch = data.hitRateModel.torpedo_launch;
    const spread: SpreadConfig = {
      spreadMinDeg: launch.spread_angle_deg_min,
      spreadMaxDeg: launch.spread_angle_deg_max,
      holdSecondsForMax: launch.spread_hold_seconds_for_max,
    };
    this.torpedoButton = new TorpedoButton(this, input, spread);
    this.torpedoButton.setRemaining(this.telemetry.torpedoesLeft);
    // 右上「煙幕」: 離すと展開、火災中に押し続けると消火（押している時間を数え、消火した押下では展開しない判定は Mission 側）。右中「見張り」: 押している間ズームアウト
    const bx = GAME_WIDTH - HUD_MARGIN - ROUND_BUTTON_RADIUS;
    this.smokeButton = new HoldButton(this, bx, HUD_MARGIN + ROUND_BUTTON_RADIUS, '煙幕', {
      onDown: () => {
        input.smokeHeld = true;
      },
      onUp: () => {
        input.smokeHeld = false;
        input.smokeTap = true;
      },
    });
    this.lookoutButton = new HoldButton(this, bx, GAME_HEIGHT / 2, '見張り', {
      onDown: () => {
        input.lookout = true;
      },
      onUp: () => {
        input.lookout = false;
      },
    });
    this.keyboard = new KeyboardInput(this, input);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.stick?.destroy();
      this.torpedoButton?.destroy();
      this.smokeButton?.destroy();
      this.lookoutButton?.destroy();
      this.targetMarker?.destroy();
      this.boatHud?.destroy();
      this.hpBar?.destroy();
      this.debugHud?.destroy();
      this.stick = undefined;
      this.torpedoButton = undefined;
      this.smokeButton = undefined;
      this.lookoutButton = undefined;
      this.targetMarker = undefined;
      this.boatHud = undefined;
      this.hpBar = undefined;
      this.debugHud = undefined;
      this.keyboard = undefined;
    });
  }

  override update(): void {
    this.keyboard?.update();
    this.boatHud?.refresh(this.telemetry);
    this.hpBar?.refresh(this.telemetry);
    this.targetMarker?.refresh(this.telemetry);
    this.torpedoButton?.setRemaining(this.telemetry.torpedoesLeft);
    this.torpedoButton?.update();
    const t = this.telemetry;
    if (this.smokeButton) {
      // 火災中は「長押しで消火」を案内（冷却中でも押せる）。それ以外は 展開中 / 冷却の残り秒 / 使える。整数が変わったときだけ文字が変わる
      this.smokeButton.setLabel(
        t.onFire ? '消火\n長押し' : t.smokeLeftS > 0 ? '煙幕\n展開中' : t.smokeCooldownS > 0 ? `煙幕\n${Math.ceil(t.smokeCooldownS)}` : '煙幕',
      );
      this.smokeButton.setEnabled(t.onFire || (t.smokeLeftS <= 0 && t.smokeCooldownS <= 0));
    }
  }
}
