// Mission: 海・海域境界・自艇・カメラ追従（v0.1.2）。HUD と操作は HudScene（別カメラ、ズーム=RENDER_SCALE）に分離。
// 運動は src/core/boat-motion.ts を固定ステップで積分する（CLAUDE.md §7）。
import Phaser from 'phaser';
import {
  CAMERA_FOLLOW_LERP,
  DEPTH,
  FIXED_STEP_S,
  MAX_STEPS_PER_FRAME,
  PROTOTYPE_MISSION_ID,
  REGISTRY_KEY_DATA,
  REGISTRY_KEY_INPUT,
  REGISTRY_KEY_TELEMETRY,
  RENDER_SCALE,
  SCENE_KEYS,
} from '../config/game-config';
import { getBoatRecord, getGameData, getPrototypeMission } from '../config/game-data';
import { SEA_BORDER_COLOR, SEA_BORDER_WIDTH, SEA_GRID_CELL_M, SEA_GRID_COLOR, SEA_GRID_LINE_WIDTH } from '../config/ui-config';
import {
  boatParamsFromData,
  clampToBounds,
  nearestSpeedStep,
  stepBoat,
  throttleToTargetSpeed,
  type BoatParams,
  type BoatTelemetry,
  type SeaBounds,
} from '../core/boat-motion';
import { FixedStepper } from '../core/fixed-stepper';
import type { InputState } from '../core/input-state';
import { PlayerBoat } from '../entities/player-boat';

export class MissionScene extends Phaser.Scene {
  private boat!: PlayerBoat;
  private params!: BoatParams;
  private bounds!: SeaBounds;
  /** 境界から押し戻す余白（m）。表示上の船体半分（length_m × sprite_scale / 2）で、船首が境界線をはみ出さない */
  private boundsMarginM = 0;
  private inputState!: InputState;
  private telemetry!: BoatTelemetry;
  private timeScale = 1;
  private readonly stepper = new FixedStepper(FIXED_STEP_S, MAX_STEPS_PER_FRAME);
  private readonly stepFn = (dt: number): void => {
    stepBoat(this.boat.state, this.inputState, this.params, dt * this.timeScale);
    clampToBounds(this.boat.state, this.bounds, this.boundsMarginM);
  };

  constructor() {
    super(SCENE_KEYS.mission);
  }

  create(): void {
    const data = getGameData(this.registry, REGISTRY_KEY_DATA);
    const world = data.hitRateModel.world;
    const mission = getPrototypeMission(data, PROTOTYPE_MISSION_ID);
    const boatRecord = getBoatRecord(data, mission.playerBoatId);
    this.params = boatParamsFromData(boatRecord);
    this.bounds = mission.bounds;
    this.boundsMarginM = (boatRecord.length_m * world.sprite_scale) / 2;
    this.timeScale = world.time_scale;
    this.inputState = this.registry.get(REGISTRY_KEY_INPUT) as InputState;

    this.drawSea();

    // 自艇。巡航速度で出発する（動いていることがすぐ分かるように）
    this.boat = new PlayerBoat(
      this,
      { x: mission.playerStart.x, y: mission.playerStart.y, headingDeg: mission.playerStart.headingDeg },
      this.params.speedCruiseMps,
    );

    // カメラ: 既定ズーム（docs/02 §6.10）× 描画スケール。追従は少し遅らせる
    const cam = this.cameras.main;
    cam.setZoom(world.camera_zoom_default * RENDER_SCALE);
    cam.startFollow(this.boat.sprite, false, CAMERA_FOLLOW_LERP, CAMERA_FOLLOW_LERP);

    this.telemetry = { speedMps: this.boat.state.speedMps, rudder: 0, targetStep: 'cruise', headingDeg: this.boat.state.headingDeg };
    this.registry.set(REGISTRY_KEY_TELEMETRY, this.telemetry);

    // HUD は後から起動して手前に描く
    this.scene.launch(SCENE_KEYS.hud);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scene.stop(SCENE_KEYS.hud);
      this.boat.destroy();
    });
  }

  /**
   * 海の格子と境界線を 1 つの Graphics に 1 回だけ記録する（毎フレーム clear/再描画しない）。
   * TileSprite は表示サイズ分の canvas を内部に作るため、海域全体（6,000×4,000 m = 24M px）に使うと iOS Safari の canvas 上限を超える。
   * 線は 100 本程度なので Graphics の毎フレーム描画コストは無視できる。
   */
  private drawSea(): void {
    const { width, height } = this.bounds;
    const g = this.add.graphics().setDepth(DEPTH.sea);
    g.lineStyle(SEA_GRID_LINE_WIDTH, SEA_GRID_COLOR, 1);
    g.beginPath();
    for (let x = SEA_GRID_CELL_M; x < width; x += SEA_GRID_CELL_M) {
      g.moveTo(x, 0);
      g.lineTo(x, height);
    }
    for (let y = SEA_GRID_CELL_M; y < height; y += SEA_GRID_CELL_M) {
      g.moveTo(0, y);
      g.lineTo(width, y);
    }
    g.strokePath();
    g.lineStyle(SEA_BORDER_WIDTH, SEA_BORDER_COLOR, 1);
    g.strokeRect(0, 0, width, height);
  }

  override update(_time: number, delta: number): void {
    this.stepper.advance(delta / 1000, this.stepFn);
    this.boat.syncSprite();

    const t = this.telemetry;
    t.speedMps = this.boat.state.speedMps;
    t.rudder = this.inputState.rudder;
    t.headingDeg = this.boat.state.headingDeg;
    t.targetStep = nearestSpeedStep(throttleToTargetSpeed(this.inputState.throttle, this.params), this.params);
  }
}
