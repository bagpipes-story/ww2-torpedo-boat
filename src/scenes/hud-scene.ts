// HUD シーン: Mission の上に重ねて動く。カメラは RENDER_SCALE 倍ズームで論理座標 GAME_WIDTH×720（幅は画面の縦横比で 1280〜1584。v0.5.1） を保つ。
// デバッグHUD（FPS・ビルド番号）、速力・舵、バーチャルスティック、PC デバッグキーをここに置く。
import Phaser from 'phaser';
import {
  DEBUG_DAWN_S,
  DEBUG_FUEL_ALLOTMENT_GAL,
  DEBUG_SHIP_HIT_SCALE,
  DEPTH,
  GAME_HEIGHT,
  GAME_WIDTH,
  HUD_MARGIN,
  PROTOTYPE_MISSION_ID,
  REGISTRY_KEY_DATA,
  REGISTRY_KEY_INPUT,
  REGISTRY_KEY_TELEMETRY,
  RENDER_SCALE,
  SCENE_KEYS,
} from '../config/game-config';
import { effectiveFuelAllotmentGal, getGameData, getPrototypeMission } from '../config/game-data';
import type { InputState } from '../core/input-state';
import type { SpreadConfig } from '../core/salvo';
import { isSortie } from '../core/sortie';
import { HUD_COLOR_KPI, HUD_FONT_DEBUG_PX, HUD_HIST_BADGE_JA, HUD_HIST_BADGE_X, hudTextStyle } from '../config/ui-config';
import { KeyboardInput } from '../systems/keyboard-input';
import { PauseControl } from '../systems/pause-control';
import { PinchZoom } from '../systems/pinch-zoom';
import { VirtualStick } from '../systems/virtual-stick';
import { BoatHud } from '../ui/boat-hud';
import { DebugHud } from '../ui/debug-hud';
import { EngineHud } from '../ui/engine-hud';
import { HpBar } from '../ui/hp-bar';
import { HudMarkers } from '../ui/hud-markers';
import { DawnBanner } from '../ui/dawn-banner';
import { FuelGauge } from '../ui/fuel-gauge';
import { WeaponPanel } from '../ui/weapon-panel';
import type { BoatTelemetry } from '../core/boat-motion';

export class HudScene extends Phaser.Scene {
  private debugHud?: DebugHud;
  private boatHud?: BoatHud;
  private hpBar?: HpBar;
  /** 画面端のマーカー 4 本（敵・帰投・敵機・岸。v0.6.4 で ui/hud-markers へ） */
  private markers?: HudMarkers;
  private dawnBanner?: DawnBanner; // 夜明けの帯（v0.6.1。夜明けに 1 回だけ。ui/dawn-banner）
  private fuelGauge?: FuelGauge;
  private engineHud?: EngineHud; // 右下の機関の熱の帯（v0.6.5。機関の不調のある夜だけ。ui/engine-hud）
  private stick?: VirtualStick;
  /** 右側のパネル（右下の魚雷・扇・機銃、右端の縦一列の煙幕・消火・見張り・識別、兵装の上の 1 行。v0.6.8。ui/weapon-panel・ui/weapon-cue。置き方は config/hud-layout-config） */
  private panel?: WeaponPanel;
  private keyboard?: KeyboardInput;
  private pinch?: PinchZoom;
  /** 「一時停止」（v0.5.1 実機 1 回目）。左端。押すと Mission と Hud を止めて一時停止の画面 */
  private pause?: PauseControl;
  private telemetry!: BoatTelemetry;
  /** Mission が launch で渡す Sortie の任務（v0.4.0） */
  private missionId: string = PROTOTYPE_MISSION_ID;
  /** 難易度ハード（v0.4.5。出撃から） */
  private hard = false;
  /** 史実モード（v0.5.2。出撃から） */
  private historical = false;

  constructor() {
    super(SCENE_KEYS.hud);
  }

  init(data: unknown): void {
    this.missionId = isSortie(data) ? data.missionId : PROTOTYPE_MISSION_ID;
    this.hard = isSortie(data) ? data.hard : false;
    this.historical = isSortie(data) ? data.historical : false;
  }

  create(): void {
    // 論理座標 GAME_WIDTH×720 を canvas（GAME_WIDTH×RENDER_SCALE）に合わせる
    this.cameras.main.setZoom(RENDER_SCALE).centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);

    const data = getGameData(this.registry, REGISTRY_KEY_DATA);
    const input = this.registry.get(REGISTRY_KEY_INPUT) as InputState;
    this.telemetry = this.registry.get(REGISTRY_KEY_TELEMETRY) as BoatTelemetry;
    // 1 行目に割当と夜明けを出す（?debug&fuel=…&dawn=… の上書きが効いているかを実機で確かめられる）
    const mission = getPrototypeMission(data, this.missionId, this.hard);
    const fuelGal = effectiveFuelAllotmentGal(data, mission, DEBUG_FUEL_ALLOTMENT_GAL);
    const dawnS = Number.isFinite(DEBUG_DAWN_S) ? DEBUG_DAWN_S : mission.durationS;

    this.debugHud = new DebugHud(this, {
      buildLabel: import.meta.env.VITE_BUILD_LABEL,
      // 短く保つ（長いブランチ名でも右端の縦一列の技能（いちばん上は煙幕）に掛からないよう、1 行目は約 80 文字以内）
      // ?debug&shiphit=N（v0.4.8）のときだけ「当たり xN」を足す（実機でどちらの当たり判定か分かるように）
      dataSummary: `data v${data.hitRateModel.version} ・ x${data.hitRateModel.world.time_scale} ・ ${fuelGal} gal ・ ${dawnS} s${Number.isFinite(DEBUG_SHIP_HIT_SCALE) ? ` ・ 当たり x${DEBUG_SHIP_HIT_SCALE}` : ''}`,
    });
    this.boatHud = new BoatHud(this);
    // 史実モードの印（v0.5.2 実機 1・2 回目）: 左上の FPS の右に黄色で［史実］とだけ。固定文字列なので 1 回だけ描く（§7）
    if (this.historical) this.add.text(HUD_HIST_BADGE_X, HUD_MARGIN, HUD_HIST_BADGE_JA, hudTextStyle(HUD_FONT_DEBUG_PX, HUD_COLOR_KPI)).setDepth(DEPTH.hud);
    this.hpBar = new HpBar(this);
    this.fuelGauge = new FuelGauge(this);
    if (this.telemetry.engine.on) this.engineHud = new EngineHud(this); // Mission が launch の前にテレメトリを 1 回書く（?debug&engoff の夜は on false）
    this.markers = new HudMarkers(this, mission, this.telemetry); // 画面外マーカー 4 本（敵・帰投・敵機・岸。ui/hud-markers。v0.6.4 で切り出し）
    this.dawnBanner = new DawnBanner(this, this.telemetry.dawn.reached);
    this.stick = new VirtualStick(this, input);
    const launch = data.hitRateModel.torpedo_launch;
    const spread: SpreadConfig = {
      spacingDeg: launch.salvo_spacing_deg,
      holdStartS: launch.salvo_hold_start_s,
      countStepS: launch.salvo_count_step_s,
    };
    // 右側のパネル（右下の兵装・右端の技能。作る順は v0.6.7 と同じ: スティックの後・キーボードの前。前回の値は panel が持つので再開で引きずらない）
    this.panel = new WeaponPanel(this, input, data, mission, this.telemetry, spread);
    this.keyboard = new KeyboardInput(this, input);
    // ピンチズーム（右半分、右下の兵装の左端 − 16 より右とボタンの上を除く）。見張りを離した後もその倍率を保つ
    this.pinch = new PinchZoom(this, input, this.telemetry, data.hitRateModel.world.camera_zoom_min, data.hitRateModel.world.camera_zoom_max);
    this.pause = new PauseControl(this, input, () => [this.stick, ...(this.panel ? this.panel.controls() : []), this.pinch]);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.stick?.destroy();
      this.panel?.destroy();
      this.markers?.destroy();
      this.dawnBanner?.destroy();
      this.fuelGauge?.destroy();
      this.engineHud?.destroy();
      this.engineHud = undefined;
      this.boatHud?.destroy();
      this.hpBar?.destroy();
      this.debugHud?.destroy();
      this.stick = undefined;
      this.panel = undefined;
      this.markers = undefined;
      this.dawnBanner = undefined;
      this.fuelGauge = undefined;
      this.boatHud = undefined;
      this.hpBar = undefined;
      this.debugHud = undefined;
      this.keyboard = undefined;
      this.pinch?.destroy();
      this.pinch = undefined;
      this.pause?.destroy();
      this.pause = undefined;
    });
  }

  override update(): void {
    this.keyboard?.update();
    this.boatHud?.refresh(this.telemetry, this.time.now);
    this.hpBar?.refresh(this.telemetry, this.time.now);
    this.fuelGauge?.refresh(this.telemetry);
    this.engineHud?.refresh(this.telemetry, this.time.now);
    this.markers?.refresh(this.telemetry);
    this.dawnBanner?.refresh(this.telemetry, this.time.now);
    this.panel?.update(this.telemetry, this.time.now);
  }
}
