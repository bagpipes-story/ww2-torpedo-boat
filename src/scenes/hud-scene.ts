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
import { isSortie } from '../core/sortie';
import {
  HOME_COLOR,
  HOME_COLOR_TEXT,
  HOME_MARKER_DISTANCE_STEP_M,
  HOME_MARKER_TOP_MARGIN,
  HUD_COLOR_WARN,
  IDENTIFY_BUTTON_Y,
  PLANE_DISTANCE_STEP_M,
  PLANE_MARKER_TOP_MARGIN,
  IDENTIFY_PULSE_ALPHA_MAX,
  IDENTIFY_PULSE_HZ,
  ROUND_BUTTON_ALPHA,
  TORPEDO_BUTTON_ARM_MS,
  TORPEDO_BUTTON_RADIUS,
  ROUND_BUTTON_GAP,
  ROUND_BUTTON_RADIUS,
  TARGET_MARKER_DISTANCE_STEP_M,
  TARGET_MARKER_TOP_MARGIN,
} from '../config/ui-config';
import { FF_CHALLENGE, FF_STRAFE } from '../core/friendly';
import { BARGE_MARKER_LABEL, COAST_MARKER_LABEL, COAST_MARKER_TEXT_COLOR, GUN_BUTTON_LABEL } from '../config/hunt-config';
import { HoldButton } from '../systems/hold-button';
import { KeyboardInput } from '../systems/keyboard-input';
import { PinchZoom } from '../systems/pinch-zoom';
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
  /** 敵の水上機（v0.4.1）。任務に enemy_aircraft があるときだけ。接近・去る間に画面外なら赤い矢印 */
  private planeMarker?: EdgeMarker;
  private coastMarker?: EdgeMarker;
  private fuelGauge?: FuelGauge;
  private stick?: VirtualStick;
  private torpedoButton?: TorpedoButton;
  /** 「射撃」（主兵装が砲の任務。v0.4.2）: 右下の魚雷ボタンの場所。押している間 gunHeld。出だしの 0.6 秒は受けない（「出撃」の 2 度押し） */
  private gunButton?: HoldButton;
  private smokeButton?: HoldButton;
  private extinguishButton?: HoldButton;
  private lookoutButton?: HoldButton;
  /** 「識別」（v0.3.3）。任務に味方機がいるときだけ作る。残り秒の整数が変わったときだけ文字を組む */
  private identifyButton?: HoldButton;
  private lastIdentifyN = -1;
  private lastHoldTenths = -1;
  private keyboard?: KeyboardInput;
  private pinch?: PinchZoom;
  private telemetry!: BoatTelemetry;
  /** Mission が launch で渡す Sortie の任務（v0.4.0） */
  private missionId: string = PROTOTYPE_MISSION_ID;
  /** 難易度ハード（v0.4.5。出撃から） */
  private hard = false;

  constructor() {
    super(SCENE_KEYS.hud);
  }

  init(data: unknown): void {
    this.missionId = isSortie(data) ? data.missionId : PROTOTYPE_MISSION_ID;
    this.hard = isSortie(data) ? data.hard : false;
  }

  create(): void {
    // 論理座標 1280×720 を canvas（1280×RENDER_SCALE）に合わせる
    this.cameras.main.setZoom(RENDER_SCALE).centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    this.lastIdentifyN = -1; // 再開で前回の値を引きずらない
    this.lastHoldTenths = -1;

    const data = getGameData(this.registry, REGISTRY_KEY_DATA);
    const input = this.registry.get(REGISTRY_KEY_INPUT) as InputState;
    this.telemetry = this.registry.get(REGISTRY_KEY_TELEMETRY) as BoatTelemetry;
    // 1 行目に割当と夜明けを出す（?debug&fuel=…&dawn=… の上書きが効いているかを実機で確かめられる）
    const mission = getPrototypeMission(data, this.missionId, this.hard);
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
    // 画面外マーカー: 敵は赤・50 m 刻み・ラベルは矢印の下（視程内だけ。大発の任務は「大発」で切り上げ＝2 行目の手引きと同じ距離）、帰投地点は青・100 m 刻み・ラベルは矢印の上（常に。画面内なら隠す）
    const guns = mission.mainWeapon === 'guns';
    this.targetMarker = new EdgeMarker(this, { textureKey: TEXTURE_KEYS.targetMarker, labelPrefix: guns ? BARGE_MARKER_LABEL : '敵', stepM: TARGET_MARKER_DISTANCE_STEP_M, labelAbove: false, roundUp: guns, topMargin: TARGET_MARKER_TOP_MARGIN });
    this.homeMarker = new EdgeMarker(this, { textureKey: TEXTURE_KEYS.homeMarker, labelPrefix: '帰投', stepM: HOME_MARKER_DISTANCE_STEP_M, labelAbove: true, roundUp: true, topMargin: HOME_MARKER_TOP_MARGIN, color: HOME_COLOR_TEXT });
    // 岸のある任務（大発）: 砂色の「岸 N m」（浅瀬の縁が画面外の間。出発点から南へ 1,900 m。v0.4.2 の実機で、どこへ行けばよいか分からなかった）
    if (mission.coast) this.coastMarker = new EdgeMarker(this, { textureKey: TEXTURE_KEYS.coastMarker, labelPrefix: COAST_MARKER_LABEL, stepM: HOME_MARKER_DISTANCE_STEP_M, labelAbove: true, roundUp: true, topMargin: TARGET_MARKER_TOP_MARGIN, color: COAST_MARKER_TEXT_COLOR });
    if (this.telemetry.seaplaneEnabled) {
      this.planeMarker = new EdgeMarker(this, { textureKey: TEXTURE_KEYS.targetMarker, labelPrefix: '敵機', stepM: PLANE_DISTANCE_STEP_M, labelAbove: false, roundUp: true, topMargin: PLANE_MARKER_TOP_MARGIN, color: HUD_COLOR_WARN });
    }
    this.stick = new VirtualStick(this, input);
    const launch = data.hitRateModel.torpedo_launch;
    const spread: SpreadConfig = {
      spreadMinDeg: launch.spread_angle_deg_min,
      spreadMaxDeg: launch.spread_angle_deg_max,
      holdSecondsForMax: launch.spread_hold_seconds_for_max,
      countStepS: launch.salvo_count_step_s,
    };
    if (mission.mainWeapon === 'guns') {
      let armed = false;
      this.time.delayedCall(TORPEDO_BUTTON_ARM_MS, () => (armed = true));
      const gx = GAME_WIDTH - HUD_MARGIN - TORPEDO_BUTTON_RADIUS;
      const gy = GAME_HEIGHT - HUD_MARGIN - TORPEDO_BUTTON_RADIUS;
      this.gunButton = new HoldButton(this, gx, gy, GUN_BUTTON_LABEL, { onDown: () => (input.gunHeld = armed), onUp: () => (input.gunHeld = false) }, TEXTURE_KEYS.torpedoButton);
    } else {
      this.torpedoButton = new TorpedoButton(this, input, spread);
      this.torpedoButton.setRemaining(this.telemetry.torpedoesLeft);
    }
    // 右上「煙幕」: 離すと展開。その下「消火」: 火災中に押し続けると消火（押している時間は Mission が数える。v0.3.1 実機の要望で煙幕と別ボタンに）。右中「見張り」: 押している間ズームアウト
    const bx = GAME_WIDTH - HUD_MARGIN - ROUND_BUTTON_RADIUS;
    this.smokeButton = new HoldButton(this, bx, HUD_MARGIN + ROUND_BUTTON_RADIUS, '煙幕', {
      onUp: () => {
        input.smokeTap = true;
      },
    });
    this.extinguishButton = new HoldButton(this, bx, HUD_MARGIN + ROUND_BUTTON_RADIUS * 3 + ROUND_BUTTON_GAP, '消火', {
      onDown: () => {
        input.extinguishHeld = true;
      },
      onUp: () => {
        input.extinguishHeld = false;
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
    // 「識別」: 見張りと魚雷の間。常に薄く出し、味方機が識別を求めている間だけ青く点滅して残り秒を出す（押下＝識別信号。離しは見ない）
    // 今夜味方機がいるときだけ（v0.4.6。夜の揺らぎで来ない夜がある）
    if (this.telemetry.friendlyEnabled) {
      this.identifyButton = new HoldButton(this, bx, IDENTIFY_BUTTON_Y, '識別', {
        onDown: () => {
          input.identifyTap = true;
        },
      });
      this.identifyButton.setEnabled(false);
    }
    this.keyboard = new KeyboardInput(this, input);
    // ピンチズーム（右半分、ボタンの列を除く）。見張りを離した後もその倍率を保つ
    this.pinch = new PinchZoom(this, input, this.telemetry, data.hitRateModel.world.camera_zoom_min, data.hitRateModel.world.camera_zoom_max);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.stick?.destroy();
      this.torpedoButton?.destroy();
      this.gunButton?.destroy();
      this.smokeButton?.destroy();
      this.extinguishButton?.destroy();
      this.lookoutButton?.destroy();
      this.identifyButton?.destroy();
      this.targetMarker?.destroy();
      this.homeMarker?.destroy();
      this.planeMarker?.destroy();
      this.coastMarker?.destroy();
      this.fuelGauge?.destroy();
      this.boatHud?.destroy();
      this.hpBar?.destroy();
      this.debugHud?.destroy();
      this.stick = undefined;
      this.torpedoButton = undefined;
      this.gunButton = undefined;
      this.smokeButton = undefined;
      this.extinguishButton = undefined;
      this.lookoutButton = undefined;
      this.identifyButton = undefined;
      this.targetMarker = undefined;
      this.homeMarker = undefined;
      this.planeMarker = undefined;
      this.coastMarker = undefined;
      this.fuelGauge = undefined;
      this.boatHud = undefined;
      this.hpBar = undefined;
      this.debugHud = undefined;
      this.keyboard = undefined;
      this.pinch?.destroy();
      this.pinch = undefined;
    });
  }

  override update(): void {
    this.keyboard?.update();
    this.boatHud?.refresh(this.telemetry, this.time.now);
    this.hpBar?.refresh(this.telemetry, this.time.now);
    this.fuelGauge?.refresh(this.telemetry);
    this.targetMarker?.refresh(this.telemetry.enemyDx, this.telemetry.enemyDy, this.telemetry.enemySighted, this.telemetry);
    this.homeMarker?.refresh(this.telemetry.homeDx, this.telemetry.homeDy, !this.telemetry.atHome, this.telemetry, this.telemetry.homeEdgeM);
    this.planeMarker?.refresh(this.telemetry.planeDx, this.telemetry.planeDy, !Number.isNaN(this.telemetry.planeDx), this.telemetry);
    this.coastMarker?.refresh(this.telemetry.coastDx, this.telemetry.coastDy, !Number.isNaN(this.telemetry.coastDy), this.telemetry);
    this.torpedoButton?.setRemaining(this.telemetry.torpedoesLeft);
    this.torpedoButton?.update();
    const t = this.telemetry;
    if (this.smokeButton) {
      // 展開中 / 冷却の残り秒 / 使える。整数が変わったときだけ文字が変わる
      this.smokeButton.setLabel(t.smokeLeftS > 0 ? '煙幕\n展開中' : t.smokeCooldownS > 0 ? `煙幕\n${Math.ceil(t.smokeCooldownS)}` : '煙幕');
      this.smokeButton.setEnabled(t.smokeLeftS <= 0 && t.smokeCooldownS <= 0);
    }
    // 消火は火災中だけ使える（押せるが Mission が無視する。薄く表示）。火災中は要する長押し秒を出す（乗員が減ると伸びる。v0.3.5）
    if (this.extinguishButton) {
      this.extinguishButton.setEnabled(t.onFire);
      const tenths = t.onFire ? Math.round(t.extinguishHoldS * 10) : 0;
      if (tenths !== this.lastHoldTenths) {
        this.lastHoldTenths = tenths;
        this.extinguishButton.setLabel(tenths > 0 ? `消火\n${(tenths / 10).toFixed(1)}s` : '消火');
      }
    }
    if (this.identifyButton) {
      // 識別を求めている間（航過中でも真上を過ぎてから押した後は除く）だけ有効。残り秒は 5,4,3,2,1 で 0 は出さない
      const live = t.friendlyPhase === FF_CHALLENGE || (t.friendlyPhase === FF_STRAFE && !t.friendlyPending);
      const n = t.friendlyPhase === FF_CHALLENGE ? Math.max(1, Math.ceil(t.friendlyLeftS)) : 0;
      if (n !== this.lastIdentifyN) {
        this.lastIdentifyN = n;
        this.identifyButton.setLabel(n > 0 ? `識別\n${n}` : '識別');
      }
      this.identifyButton.setEnabled(live);
      this.identifyButton.setTint(live ? HOME_COLOR : null);
      this.identifyButton.setAlphaOverride(
        live ? ROUND_BUTTON_ALPHA + (IDENTIFY_PULSE_ALPHA_MAX - ROUND_BUTTON_ALPHA) * (0.5 + 0.5 * Math.sin((2 * Math.PI * IDENTIFY_PULSE_HZ * this.time.now) / 1000)) : NaN,
      );
    }
  }
}
