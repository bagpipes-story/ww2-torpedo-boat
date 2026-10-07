// Mission: カメラ（追従・先読み・見張りズーム）、テレメトリ、演出（爆発・揺れ）、終了判定と Result への遷移。
// 運動・魚雷・反撃・煙幕・被害は systems/mission-world.ts（v0.2.2 で分割）。HUD と操作は HudScene。
import Phaser from 'phaser';
import {
  CAMERA_FOLLOW_LERP,
  DEBUG_ENABLED,
  PROTOTYPE_MISSION_ID,
  REGISTRY_KEY_DATA,
  REGISTRY_KEY_INPUT,
  REGISTRY_KEY_TELEMETRY,
  RENDER_SCALE,
  SCENE_KEYS,
} from '../config/game-config';
import { getGameData } from '../config/game-data';
import {
  BOAT_HIT_SHAKE_INTENSITY,
  CAMERA_LOOK_AHEAD_M,
  HIT_SHAKE_INTENSITY,
  HIT_SHAKE_MS,
  MISSION_END_DELAY_MS,
  RUDDER_BAR_FULL_DEG,
  ZOOM_LERP,
} from '../config/ui-config';
import { turnCommand, type BoatTelemetry } from '../core/boat-motion';
import { countHits, summarizeShots } from '../core/hit-rate';
import { resetInput, type InputState } from '../core/input-state';
import { degToRad } from '../core/units';
import { playerVisRangeM } from '../core/visibility';
import { drawSea } from '../entities/sea';
import { DebugRanges, LeadMarker, playExplosion } from '../systems/mission-effects';
import { MissionWorld, type WorldEvents } from '../systems/mission-world';
import type { MissionEndReason, MissionResult } from './result-scene';

export class MissionScene extends Phaser.Scene {
  private world!: MissionWorld;
  private inputState!: InputState;
  private telemetry!: BoatTelemetry;
  /** カメラの論理ズーム（RENDER_SCALE を掛ける前）。見張り中は zoomMin へ、離すと zoomDefault へ寄せる */
  private zoomDefault = 1;
  private zoomMin = 1;
  private zoom = 1;
  /** デバッグ時（?debug）だけの見越し点マーカーと距離の円 */
  private leadMarker?: LeadMarker;
  private debugRanges?: DebugRanges;
  private timeLeftS = 0;
  private elapsedS = 0;
  private ended = false;
  private endTimer?: Phaser.Time.TimerEvent;

  private readonly worldEvents: WorldEvents = {
    onTorpedoHit: (x, y, dud) => {
      playExplosion(this, x, y, dud);
      if (!dud) this.shakeCamera();
    },
    onDestroyerSunk: () => this.endMission('sunk'),
    onShellHit: (x, y, small, destroyed) => {
      playExplosion(this, x, y, small);
      // 弱い揺れ。撃沈なら onBoatSinking の強い揺れだけにする（Phaser は揺れている間の新しい揺れを無視するため）
      if (!destroyed) {
        const z = this.cameras.main.zoom;
        this.cameras.main.shake(HIT_SHAKE_MS, BOAT_HIT_SHAKE_INTENSITY / (z * z));
      }
    },
    onBoatSinking: (x, y) => {
      playExplosion(this, x, y, false);
      this.shakeCamera();
      // 保留中の「撃ち尽くし」終了は取り消し、沈没演出の完了で Result へ
      this.endTimer?.remove(false);
      this.endTimer = undefined;
    },
    onBoatSunk: (reason) => this.endMission(reason),
  };

  constructor() {
    super(SCENE_KEYS.mission);
  }

  create(): void {
    const data = getGameData(this.registry, REGISTRY_KEY_DATA);
    const world = data.hitRateModel.world;
    this.inputState = this.registry.get(REGISTRY_KEY_INPUT) as InputState;
    resetInput(this.inputState);

    // 乱数: シードは起動時刻。Result に表示するので再現したいときに使える
    const seed = Date.now() >>> 0;
    this.world = new MissionWorld(this, data, PROTOTYPE_MISSION_ID, this.inputState, seed, this.worldEvents);
    const w = this.world;
    drawSea(this, w.bounds); // 世界の表示物より後に作るが、depth（sea=0）で下に描かれる

    this.timeLeftS = w.durationS;
    this.elapsedS = 0;
    this.ended = false;

    // カメラ: 既定ズーム（docs/02 §6.10）× 描画スケール。追従は少し遅らせ、進行方向に先読みする。見張り（右中ボタン）で zoom_min まで引く
    this.zoomDefault = world.camera_zoom_default;
    this.zoomMin = world.camera_zoom_min;
    this.zoom = this.zoomDefault;
    const cam = this.cameras.main;
    cam.setZoom(this.zoom * RENDER_SCALE);
    cam.startFollow(w.boat.sprite, false, CAMERA_FOLLOW_LERP, CAMERA_FOLLOW_LERP);
    this.updateLookAhead();

    this.telemetry = {
      speedMps: w.boat.state.speedMps,
      rudder: 0,
      targetStep: 'stop',
      headingDeg: w.boat.state.headingDeg,
      torpedoesLeft: w.torpedoes.capacity,
      hits: 0,
      timeLeftS: this.timeLeftS,
      enemyDx: w.destroyer.state.x - w.boat.state.x,
      enemyDy: w.destroyer.state.y - w.boat.state.y,
      enemySighted: false,
      playerDetected: false,
      detectRangeM: w.detectRangeM,
      illuminated: false,
      starLit: false,
      hp: w.damage.hp,
      hpMax: w.damageParams.maxHp,
      onFire: false,
      engineDamaged: false,
      smokeLeftS: 0,
      smokeCooldownS: 0,
      hiddenBySmoke: false,
      cameraZoom: this.zoom,
    };
    this.registry.set(REGISTRY_KEY_TELEMETRY, this.telemetry);
    this.refreshTelemetry();

    // 見越し点マーカー（docs/02 §6.3: v0.1 はデバッグ切替で常時表示可）と距離の円。URL に ?debug があるときだけ
    if (DEBUG_ENABLED) {
      this.leadMarker = new LeadMarker(this);
      this.debugRanges = new DebugRanges(this);
    }

    this.scene.launch(SCENE_KEYS.hud);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scene.stop(SCENE_KEYS.hud);
      this.endTimer?.remove(false);
      this.endTimer = undefined;
      this.world.destroy();
      this.leadMarker?.destroy();
      this.leadMarker = undefined;
      this.debugRanges?.destroy();
      this.debugRanges = undefined;
    });
  }

  override update(_time: number, delta: number): void {
    if (this.ended) return;
    const realDt = delta / 1000;
    const w = this.world;

    w.updateFrame(realDt);
    this.updateZoom();
    this.updateLookAhead();
    const enemyAlive = w.destroyer.sinking ? null : w.destroyer.state;
    this.leadMarker?.refresh(w.boat.state, enemyAlive, w.torpedoParams.speedMps);
    this.debugRanges?.refresh(enemyAlive, w.detectRangeM, w.boat.state, playerVisRangeM(w.vis));

    this.elapsedS += realDt;
    this.timeLeftS -= realDt;
    this.refreshTelemetry();

    // 沈没演出中（どちらの側でも）は演出の完了（'sunk' / 'rammed' / 'destroyed'）に任せる
    if (w.destroyer.sinking || w.boat.sinking) return;
    if (this.timeLeftS <= 0) {
      this.endMission('timeout');
    } else if (w.torpedoes.remaining === 0 && w.launcher.queued === 0 && w.torpedoes.unresolvedCount === 0 && !this.endTimer) {
      this.endTimer = this.time.delayedCall(MISSION_END_DELAY_MS, () => this.endMission('expended'));
    }
  }

  /** 見張り: 押している間 zoomMin へ、離すと既定へ、毎フレーム一定割合ずつ寄せる（setZoom は値が動いている間だけ） */
  private updateZoom(): void {
    const target = this.inputState.lookout ? this.zoomMin : this.zoomDefault;
    const diff = target - this.zoom;
    if (Math.abs(diff) < 1e-4) {
      if (this.zoom !== target) {
        this.zoom = target;
        this.cameras.main.setZoom(this.zoom * RENDER_SCALE);
      }
      return;
    }
    this.zoom += diff * ZOOM_LERP;
    this.cameras.main.setZoom(this.zoom * RENDER_SCALE);
  }

  /** 敵の相対位置、見える・見つかった、反撃、被害、煙幕、ズームを telemetry へ。敵スプライトは視程内だけ表示（docs/02 §6.5） */
  private refreshTelemetry(): void {
    const t = this.telemetry;
    const w = this.world;
    const s = w.boat.state;
    const d = w.destroyer;
    t.speedMps = s.speedMps;
    t.rudder = turnCommand(this.inputState, s, RUDDER_BAR_FULL_DEG);
    t.headingDeg = s.headingDeg;
    t.targetStep = w.band;
    t.torpedoesLeft = w.torpedoes.remaining;
    t.hits = w.hits;
    t.timeLeftS = this.timeLeftS;
    if (d.sinking) {
      t.enemyDx = NaN;
      t.enemyDy = NaN;
      t.enemySighted = false;
    } else {
      t.enemyDx = d.state.x - s.x;
      t.enemyDy = d.state.y - s.y;
      t.enemySighted = t.enemyDx * t.enemyDx + t.enemyDy * t.enemyDy <= w.visRange2;
      d.setSighted(t.enemySighted);
    }
    t.playerDetected = d.ai.playerDetected && !d.sinking;
    t.detectRangeM = w.detectRangeM;
    t.illuminated = w.enemyFire.illuminated && !d.sinking;
    t.starLit = w.enemyFire.state.star.illuminating && !d.sinking;
    t.hp = w.damage.hp;
    t.onFire = w.damage.fireLeftS > 0 && w.damage.hp > 0;
    t.engineDamaged = w.damage.engineDamaged;
    t.smokeLeftS = w.smokeLeftS;
    t.smokeCooldownS = w.smokeCooldownS;
    t.hiddenBySmoke = w.hiddenBySmoke;
    t.cameraZoom = this.zoom;
  }

  /** 進行方向に CAMERA_LOOK_AHEAD_M だけ視点をずらす（followOffset は「ターゲットから引く」向き） */
  private updateLookAhead(): void {
    const h = degToRad(this.world.boat.state.headingDeg);
    this.cameras.main.setFollowOffset(-Math.sin(h) * CAMERA_LOOK_AHEAD_M, Math.cos(h) * CAMERA_LOOK_AHEAD_M);
  }

  /** Phaser の shake はズームの 2 乗で弱まるので、見た目の揺れ幅が端末で揃うよう補正する。進行中の弱い揺れがあっても上書きする（force） */
  private shakeCamera(): void {
    const z = this.cameras.main.zoom;
    this.cameras.main.shake(HIT_SHAKE_MS, HIT_SHAKE_INTENSITY / (z * z), true);
  }

  private endMission(reason: MissionEndReason): void {
    if (this.ended) return;
    this.ended = true;
    const w = this.world;
    // まだ走っている魚雷は外れとして記録し、Result の集計から漏れないようにする
    w.resolveRemainingAsMisses();
    const data = getGameData(this.registry, REGISTRY_KEY_DATA);
    const counts = countHits(w.shots);
    const result: MissionResult = {
      reason,
      shots: w.shots.slice(),
      bands: summarizeShots(w.shots, data.hitRateModel.kpi_by_range),
      hits: counts.hits - counts.duds,
      duds: counts.duds,
      misses: counts.misses,
      capacity: w.torpedoes.capacity,
      destroyerSunk: w.destroyer.sinking,
      survived: !w.boat.sinking,
      elapsedS: this.elapsedS,
      seed: w.seed,
      hpLeft: w.damage.hp,
      hpMax: w.damageParams.maxHp,
    };
    this.scene.start(SCENE_KEYS.result, result);
  }
}
