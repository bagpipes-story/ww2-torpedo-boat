// 任務中の演出と補助表示: 爆発（v0.7.0 S3b から世界の絵のプール systems/explosion-fx。ここは登録と呼び出しの口だけ＝R12）、見越し点マーカー（v0.5.2 から解放制。?debug では常に）と距離の円（?debug のときだけ）。
import Phaser from 'phaser';
import { DEPTH, RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import {
  DEBUG_RING_ALPHA,
  DEBUG_RING_RADIUS_UNITS,
  DEBUG_RING_TINT_DETECT,
  DEBUG_RING_TINT_VIS,
  LEAD_MARKER_ALPHA,
  LEAD_MARKER_SCALE,
  LEAD_MARKER_TIME_COLOR,
  LEAD_MARKER_TIME_DY,
  LEAD_MARKER_TIME_PX,
  LEAD_MARKER_TINT,
  hudTextStyle,
} from '../config/ui-config';
import type { BoatState } from '../core/boat-motion';
import { interceptHeadingDeg, velocityFromHeading } from '../core/torpedo-solver';
import { degToRad } from '../core/units';
import type { ExplosionFx } from './explosion-fx';
import type { ExplosionLook } from './world-events';

/** 今の世界の爆発のプール（world-art が世界の作成時に登録し、破棄で null に。R12: 静的な取り出しは使わない＝やり直しで破棄済みの Image を握らない） */
let explosions: ExplosionFx | null = null;
export function registerExplosionFx(fx: ExplosionFx | null): void {
  explosions = fx;
}

/** 爆発の見た目の種類（定義は world-events。IP4） */
export type { ExplosionLook } from './world-events';

/** 爆発（名前と最初の 4 つの引数は v0.4 のまま。mission-scene の 5 か所から。onTorpedoHit だけ 'torpedo'）。中身は世界の絵のプール（閃光・火球・水柱・輪。dud は小さい版＝水柱なし）。登録の無い間は何もしない */
export function playExplosion(scene: Phaser.Scene, x: number, y: number, dud: boolean, look: ExplosionLook = 'blast'): void {
  void scene;
  explosions?.play(x, y, dud, look === 'torpedo');
}

/**
 * 見越し点マーカー（docs/02 §6.3。aim_assist の lead_marker。showTime なら lead_marker_time＝魚雷が届くまでの実時間秒も）。
 * sqrt は 1 回/フレーム。秒の文字は整数が変わったときだけ setText（§7）
 */
export class LeadMarker {
  private readonly image: Phaser.GameObjects.Image;
  private readonly time: Phaser.GameObjects.Text | null;
  private readonly tmpVel = { x: 0, y: 0 };
  private lastSecs = -1;

  constructor(scene: Phaser.Scene, showTime: boolean = false) {
    this.image = scene.add
      .image(0, 0, TEXTURE_KEYS.explosionRing)
      .setScale(LEAD_MARKER_SCALE / RENDER_SCALE)
      .setTint(LEAD_MARKER_TINT)
      .setAlpha(LEAD_MARKER_ALPHA)
      .setDepth(DEPTH.effects)
      .setVisible(false);
    this.time = showTime ? scene.add.text(0, 0, '', hudTextStyle(LEAD_MARKER_TIME_PX, LEAD_MARKER_TIME_COLOR)).setOrigin(0.5, 1).setAlpha(LEAD_MARKER_ALPHA).setDepth(DEPTH.effects).setVisible(false) : null;
  }

  private hide(): void {
    if (this.image.visible) this.image.setVisible(false);
    if (this.time?.visible) this.time.setVisible(false);
  }

  /** 今この瞬間に撃った魚雷が当たる方位へ、目標までの距離だけ進んだ点に置く（会合点の近似）。timeScale は時間圧縮（魚雷は game 秒で進むので実時間秒に直す） */
  refresh(boat: BoatState, target: BoatState | null, torpedoSpeedMps: number, timeScale: number = 1): void {
    if (!target) {
      this.hide();
      return;
    }
    velocityFromHeading(target.headingDeg, target.speedMps, this.tmpVel);
    const h = interceptHeadingDeg(boat.x, boat.y, torpedoSpeedMps, target.x, target.y, this.tmpVel.x, this.tmpVel.y);
    if (h === null) {
      this.hide();
      return;
    }
    const dist = Math.hypot(target.x - boat.x, target.y - boat.y);
    const hr = degToRad(h);
    const x = boat.x + Math.sin(hr) * dist;
    const y = boat.y - Math.cos(hr) * dist;
    this.image.setPosition(x, y).setVisible(true);
    if (this.time) {
      const secs = Math.round(dist / (torpedoSpeedMps * timeScale));
      if (secs !== this.lastSecs) {
        this.lastSecs = secs;
        this.time.setText(`${secs} 秒`);
      }
      this.time.setPosition(x, y - LEAD_MARKER_TIME_DY).setVisible(true);
    }
  }

  destroy(): void {
    this.image.destroy();
    this.time?.destroy();
  }
}

/** 発見距離（敵の周り、赤）と視程（自艇の周り、青）の円。?debug のときだけ。拡縮だけ動かす（再描画しない） */
export class DebugRanges {
  private readonly detect: Phaser.GameObjects.Image;
  private readonly vis: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene) {
    this.detect = scene.add.image(0, 0, TEXTURE_KEYS.debugRing).setTint(DEBUG_RING_TINT_DETECT).setAlpha(DEBUG_RING_ALPHA).setDepth(DEPTH.effects);
    this.vis = scene.add.image(0, 0, TEXTURE_KEYS.debugRing).setTint(DEBUG_RING_TINT_VIS).setAlpha(DEBUG_RING_ALPHA).setDepth(DEPTH.effects);
  }

  refresh(enemy: BoatState | null, detectRangeM: number, boat: BoatState, visRangeM: number): void {
    if (enemy) {
      const k = detectRangeM / DEBUG_RING_RADIUS_UNITS / RENDER_SCALE;
      this.detect.setPosition(enemy.x, enemy.y).setScale(k).setVisible(true);
    } else if (this.detect.visible) {
      this.detect.setVisible(false);
    }
    this.vis.setPosition(boat.x, boat.y).setScale(visRangeM / DEBUG_RING_RADIUS_UNITS / RENDER_SCALE);
  }

  destroy(): void {
    this.detect.destroy();
    this.vis.destroy();
  }
}
