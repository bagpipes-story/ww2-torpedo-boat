// HUD シーン: Mission の上に重ねて動く。カメラは RENDER_SCALE 倍ズームで論理座標 1280×720 を保つ。
// デバッグHUD（FPS・ビルド番号）、速力・舵、バーチャルスティック、PC デバッグキーをここに置く。
import Phaser from 'phaser';
import {
  DEBUG_DAWN_S,
  DEBUG_FUEL_ALLOTMENT_GAL,
  GAME_HEIGHT,
  GAME_WIDTH,
  HUD_MARGIN,
  PROTOTYPE_MISSION_ID,
  REGISTRY_KEY_DATA,
  REGISTRY_KEY_INPUT,
  REGISTRY_KEY_TELEMETRY,
  RENDER_SCALE,
  SCENE_KEYS,
  TEXTURE_KEYS,
} from '../config/game-config';
import { effectiveFuelAllotmentGal, getGameData, getPrototypeMission } from '../config/game-data';
import type { InputState } from '../core/input-state';
import type { SpreadConfig } from '../core/salvo';
import { HOME_COLOR_TEXT, HOME_MARKER_DISTANCE_STEP_M, HOME_MARKER_TOP_MARGIN, ROUND_BUTTON_RADIUS, TARGET_MARKER_DISTANCE_STEP_M, TARGET_MARKER_TOP_MARGIN } from '../config/ui-config';
import { HoldButton } from '../systems/hold-button';
import { KeyboardInput } from '../systems/keyboard-input';
import { TorpedoButton } from '../systems/torpedo-button';
import { VirtualStick } from '../systems/virtual-stick';
import { BoatHud } from '../ui/boat-hud';
import { DebugHud } from '../ui/debug-hud';
import { HpBar } from '../ui/hp-bar';
import { EdgeMarker } from '../ui/edge-marker';
import { FuelGauge } from '../ui/fuel-gauge';
import type { BoatTelemetry } from '../core/boat-motion';

export class HudScene extends Phaser.Scene {
  private debugHud?: DebugHud;
  private boatHud?: BoatHud;
  private hpBar?: HpBar;
  private targetMarker?: EdgeMarker;
  private homeMarker?: EdgeMarker;
  private fuelGauge?: FuelGauge;
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
    // 1 行目に割当と夜明けを出す（?debug&fuel=…&dawn=… の上書きが効いているかを実機で確かめられる）
    const mission = getPrototypeMission(data, PROTOTYPE_MISSION_ID);
    const fuelGal = effectiveFuelAllotmentGal(data, mission, DEBUG_FUEL_ALLOTMENT_GAL);
    const dawnS = Number.isFinite(DEBUG_DAWN_S) ? DEBUG_DAWN_S : mission.durationS;

    this.debugHud = new DebugHud(this, {
      buildLabel: import.meta.env.VITE_BUILD_LABEL,
      // 短く保つ（長いブランチ名でも右上の煙幕ボタンに掛からないよう、1 行目は約 80 文字以内）
      dataSummary: `data v${data.hitRateModel.version} ・ x${data.hitRateModel.world.time_scale} ・ ${fuelGal} gal ・ ${dawnS} s`,
    });
    this.boatHud = new BoatHud(this);
    this.hpBar = new HpBar(this);
    this.fuelGauge = new FuelGauge(this);
    // 画面外マーカー: 敵は赤・50 m 刻み・ラベルは矢印の下（視程内だけ）、帰投地点は青・100 m 刻み・ラベルは矢印の上（常に。画面内なら隠す）
    this.targetMarker = new EdgeMarker(this, { textureKey: TEXTURE_KEYS.targetMarker, labelPrefix: '敵', stepM: TARGET_MARKER_DISTANCE_STEP_M, labelAbove: false, topMargin: TARGET_MARKER_TOP_MARGIN });
    this.homeMarker = new EdgeMarker(this, { textureKey: TEXTURE_KEYS.homeMarker, labelPrefix: '帰投', stepM: HOME_MARKER_DISTANCE_STEP_M, labelAbove: true, roundUp: true, topMargin: HOME_MARKER_TOP_MARGIN, color: HOME_COLOR_TEXT });
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
      this.homeMarker?.destroy();
      this.fuelGauge?.destroy();
      this.boatHud?.destroy();
      this.hpBar?.destroy();
      this.debugHud?.destroy();
      this.stick = undefined;
      this.torpedoButton = undefined;
      this.smokeButton = undefined;
      this.lookoutButton = undefined;
      this.targetMarker = undefined;
      this.homeMarker = undefined;
      this.fuelGauge = undefined;
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
    this.fuelGauge?.refresh(this.telemetry);
    this.targetMarker?.refresh(this.telemetry.enemyDx, this.telemetry.enemyDy, this.telemetry.enemySighted, this.telemetry);
    this.homeMarker?.refresh(this.telemetry.homeDx, this.telemetry.homeDy, !this.telemetry.atHome, this.telemetry, this.telemetry.homeEdgeM);
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
