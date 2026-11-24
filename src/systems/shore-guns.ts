// 大発の無い任務の沿岸砲の持ち主（v0.8.5 S2。us_07 の 210 mm。spec-v0850 §4.3）: 今の沿岸砲（systems/shore-battery＝core/shore-battery の規則のまま）を、大発の狩り（systems/barge-hunt）の外で持つ。
// world-enemies が「大発が無く沿岸砲がある任務」だけ作る（us_03 の大発の狩りの中の沿岸砲は 1 字も変えない）。乱数は大発の狩りと同じ seed+8（2 門目 seed+9、…）。
// 大発の気づきは無い（false）。気づきの距離は昼の砲台の自分の目＝砲の base_detect_m をそのまま（速力・月の係数を掛けない＝射界の内なら煙幕の外は見えている）。煙幕で線が切れれば撃たない（今の規則）。
// 着弾ごとに onLand（世界の救助が群から 1 名を奪う。乱数なし）。被害は世界の hitBoat（終了理由 shore_battery）。テレメトリと Result の読み口は大発の狩りの shore* と同じ名。
// §7: 砲台の絵・弾・閃光は ShoreBattery が起動時に作る。毎ステップは確保しない。
import type Phaser from 'phaser';
import type { BoatState } from '../core/boat-motion';
import type { HitSpec } from '../core/gunnery';
import type { MissionEndReason } from '../core/mission-flow';
import { SeededRng } from '../core/rng';
import type { ShoreBatteryParams } from '../core/shore-battery';
import type { SmokeParams, SmokeState } from '../core/smoke';
import { ShoreBattery } from './shore-battery';
import type { SplashPool } from './splash-pool';

/** 沿岸砲の乱数の系列の始め（seed+8。大発の狩りの沿岸砲と同じ。core/night の注） */
export const SHORE_GUNS_SEED_OFFSET = 8;

/** 固定ステップで読む世界の部分（MissionWorld がそのまま満たす） */
export interface ShoreGunsView {
  readonly boat: { readonly sinking: boolean };
  readonly vis: { readonly smokeFactor: number };
  readonly smoke: SmokeState | null;
  readonly smokeParams: SmokeParams | null;
}

export class ShoreGuns {
  readonly shores: ShoreBattery[] = [];

  constructor(
    scene: Phaser.Scene,
    batteries: readonly ShoreBatteryParams[],
    seed: number,
    boat: BoatState,
    boatHalfLengthM: number,
    boatHalfBeamM: number,
    splashes: SplashPool,
    hitBoat: (spec: HitSpec, rng: SeededRng, x: number, y: number, reason: MissionEndReason) => void,
    onLand: ((x: number, y: number) => void) | null,
  ) {
    for (let i = 0; i < batteries.length; i++) {
      this.shores.push(new ShoreBattery(scene, batteries[i]!, new SeededRng((seed + SHORE_GUNS_SEED_OFFSET + i) >>> 0), boat, boatHalfLengthM, boatHalfBeamM, splashes, (spec, rng, x, y) => hitBoat(spec, rng, x, y, 'shore_battery'), onLand));
    }
  }

  /** 固定ステップ（spec §4.0 の順: S ボートの退きの後・生存者の前）。閃光は使わない（昼は射界の内なら見えている） */
  step(w: ShoreGunsView, feelDt: number, dt: number): void {
    const afloat = !w.boat.sinking;
    for (const sb of this.shores) sb.step(feelDt, dt, afloat, sb.p.baseDetectM, w.vis.smokeFactor, w.smoke, w.smokeParams, false, 0);
  }

  /** どれかの射界の中・どれかが撃ってくる・射界の中にいた体感秒の最大・砲撃・命中・被害の合計（大発の狩りの shore* と同じ） */
  get shoreInArc(): boolean {
    for (const sb of this.shores) if (sb.state.inArc) return true;
    return false;
  }

  get shoreAlerted(): boolean {
    for (const sb of this.shores) if (sb.state.alerted) return true;
    return false;
  }

  get shoreInArcS(): number {
    let m = 0;
    for (const sb of this.shores) if (sb.state.inArcS > m) m = sb.state.inArcS;
    return m;
  }

  get shoreShots(): number {
    let n = 0;
    for (const sb of this.shores) n += sb.state.shots;
    return n;
  }

  get shoreHits(): number {
    let n = 0;
    for (const sb of this.shores) n += sb.state.hits;
    return n;
  }

  get shoreDamage(): number {
    let n = 0;
    for (const sb of this.shores) n += sb.state.hits * sb.p.hit.damage;
    return n;
  }

  updateVisuals(realDt: number): void {
    for (const sb of this.shores) sb.updateVisuals(realDt);
  }

  destroy(): void {
    for (const sb of this.shores) sb.destroy();
  }
}
