// Mission: 海・海域境界・自艇・カメラ追従（v0.1.2）。HUD と操作は HudScene（別カメラ、ズーム=RENDER_SCALE）に分離。
// 運動は src/core/boat-motion.ts を固定ステップで積分する（CLAUDE.md §7）。
import Phaser from 'phaser';
import {
  FIXED_STEP_S,
  MAX_FRAME_DELTA_MS,
  MAX_STEPS_PER_FRAME,
  PROTOTYPE_MISSION_ID,
  REGISTRY_KEY_DATA,
  REGISTRY_KEY_INPUT,
  REGISTRY_KEY_TELEMETRY,
  RENDER_SCALE,
  SCENE_KEYS,
  SEA_BOUNDS_MARGIN_M,
  TEXTURE_KEYS,
} from '../config/game-config';
import { getBoatRecord, getGameData, getPrototypeMission } from '../config/game-data';
import {
  boatParamsFromData,
  clampToBounds,
  nearestSpeedStep,
  stepBoat,
  throttleToTargetSpeed,
  type BoatParams,
  type SeaBounds,
  type SpeedStep,
} from '../core/boat-motion';
import { FixedStepper } from '../core/fixed-stepper';
import type { InputState } from '../core/input-state';
import { PlayerBoat } from '../entities/player-boat';

/** HUD に渡す自艇の状態。Mission が毎フレーム書き、HudScene が読む（1個だけ作る） */
export interface BoatTelemetry {
  speedMps: number;
  rudder: number;
  targetStep: SpeedStep;
  headingDeg: number;
}

export class MissionScene extends Phaser.Scene {
  private boat!: PlayerBoat;
  private params!: BoatParams;
  private bounds!: SeaBounds;
  private inputState!: InputState;
  private telemetry!: BoatTelemetry;
  private timeScale = 1;
  private readonly stepper = new FixedStepper(FIXED_STEP_S, MAX_STEPS_PER_FRAME);
  private readonly stepFn = (dt: number): void => {
    stepBoat(this.boat.state, this.inputState, this.params, dt * this.timeScale);
    clampToBounds(this.boat.state, this.bounds, SEA_BOUNDS_MARGIN_M);
  };

  constructor() {
    super(SCENE_KEYS.mission);
  }

  create(): void {
    const data = getGameData(this.registry, REGISTRY_KEY_DATA);
    const world = data.hitRateModel.world;
    const mission = getPrototypeMission(data, PROTOTYPE_MISSION_ID);
    this.params = boatParamsFromData(getBoatRecord(data, mission.playerBoatId));
    this.bounds = mission.bounds;
    this.timeScale = world.time_scale;
    this.inputState = this.registry.get(REGISTRY_KEY_INPUT) as InputState;

    // 海: 1 セル分のテクスチャを TileSprite 1 個で海域全体に敷く（描画 1 回、毎フレームの更新なし）
    this.add.tileSprite(0, 0, this.bounds.width, this.bounds.height, TEXTURE_KEYS.seaGrid).setOrigin(0, 0).setTileScale(1 / RENDER_SCALE).setDepth(0);
    // 海域境界（静的に 1 回描く）
    this.add.graphics().lineStyle(6, 0x3a4a6a, 1).strokeRect(0, 0, this.bounds.width, this.bounds.height).setDepth(1);

    // 自艇。巡航速度で出発する（動いていることがすぐ分かるように）
    this.boat = new PlayerBoat(
      this,
      { x: mission.playerStart.x, y: mission.playerStart.y, headingDeg: mission.playerStart.headingDeg },
      this.params.speedCruiseMps,
    );

    // カメラ: 既定ズーム（docs/02 §6.10）× 描画スケール。追従は少し遅らせる
    const cam = this.cameras.main;
    cam.setZoom(world.camera_zoom_default * RENDER_SCALE);
    cam.startFollow(this.boat.sprite, false, 0.1, 0.1);

    this.telemetry = { speedMps: this.boat.state.speedMps, rudder: 0, targetStep: 'cruise', headingDeg: this.boat.state.headingDeg };
    this.registry.set(REGISTRY_KEY_TELEMETRY, this.telemetry);

    // HUD は後から起動して手前に描く
    this.scene.launch(SCENE_KEYS.hud);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scene.stop(SCENE_KEYS.hud);
      this.boat.destroy();
    });
  }

  override update(_time: number, delta: number): void {
    const deltaS = Math.min(delta, MAX_FRAME_DELTA_MS) / 1000;
    this.stepper.advance(deltaS, this.stepFn);
    this.boat.syncSprite();

    const t = this.telemetry;
    t.speedMps = this.boat.state.speedMps;
    t.rudder = this.inputState.rudder;
    t.headingDeg = this.boat.state.headingDeg;
    t.targetStep = nearestSpeedStep(throttleToTargetSpeed(this.inputState.throttle, this.params), this.params);
  }
}
