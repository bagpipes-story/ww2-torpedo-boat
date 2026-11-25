// 大発の無い任務の沿岸砲の持ち主（v0.8.5 S2。us_07 の 210 mm。spec-v0850 §4.3）: 今の沿岸砲（systems/shore-battery＝core/shore-battery の規則のまま）を、大発の狩り（systems/barge-hunt）の外で持つ。
// world-enemies が「大発が無く沿岸砲がある任務」だけ作る（us_03 の大発の狩りの中の沿岸砲は 1 字も変えない）。乱数は大発の狩りと同じ seed+8（2 門目 seed+9、…）。
// 大発の気づきは無い（false）。気づきの距離は昼の砲台の自分の目＝砲の base_detect_m をそのまま（速力・月の係数を掛けない＝射界の内なら煙幕の外は見えている）。煙幕で線が切れれば撃たない（今の規則）。
// 着弾ごとに onLand（世界の救助が群から 1 名を奪う。乱数なし）。被害は世界の hitBoat（終了理由 shore_battery）。テレメトリと Result の読み口は大発の狩りの shore* と同じ名。
// v0.8.5 IP2（実機 1 回目「沿岸砲の砲撃が生存者に至近弾となったら1名ずつ死亡発生するように」）: 自艇を撃てない砲台（気づいていない・射界の外・煙幕で線が切れた・沈み始めた）があり
// 救助の時間の内なら、隊で 1 本の時計（rescue.shelling.interval_s）ごとに生存者の海へ 1 発（core/survivor-shelling。乱数 seed+48。弾・水柱・音は自艇へ撃つ弾と同じ道）。
// §7: 砲台の絵・弾・閃光は ShoreBattery が起動時に作る。毎ステップは確保しない。
import type Phaser from 'phaser';
import type { BoatState } from '../core/boat-motion';
import type { HitSpec } from '../core/gunnery';
import type { MissionEndReason } from '../core/mission-flow';
import type { RescueState } from '../core/rescue';
import { SeededRng } from '../core/rng';
import { createSurvivorShelling, stepSurvivorShelling, SURVIVOR_SHELL_SEED_OFFSET, type SurvivorShellRules, type SurvivorShellState } from '../core/survivor-shelling';
import type { ShoreBatteryParams } from '../core/shore-battery';
import { losBlocked, type SmokeParams, type SmokeState } from '../core/smoke';
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
  readonly dawn: { readonly reached: boolean };
}

/** 生存者の海（v0.8.5 IP2。systems/world-rescue の WorldRescue がそのまま満たす）: 群・砲撃の値・着弾（aimed は生存者の海へ撃った弾） */
export interface ShoreGunsSurvivors {
  readonly state: RescueState;
  readonly rules: { readonly shelling: SurvivorShellRules | null };
  onShell(x: number, y: number, aimed: boolean): void;
}

export class ShoreGuns {
  readonly shores: ShoreBattery[] = [];
  /** 生存者の海への砲撃（v0.8.5 IP2。生存者の海のある任務だけ。無ければ null で seed+48 も作らない）・その乱数・砲台ごとの「自艇を撃てない」（毎ステップ書く） */
  readonly shelling: SurvivorShellState | null;
  private readonly shellRng: SeededRng | null;
  private readonly free: Uint8Array;
  private readonly boat: BoatState;

  constructor(
    scene: Phaser.Scene,
    batteries: readonly ShoreBatteryParams[],
    seed: number,
    boat: BoatState,
    boatHalfLengthM: number,
    boatHalfBeamM: number,
    splashes: SplashPool,
    hitBoat: (spec: HitSpec, rng: SeededRng, x: number, y: number, reason: MissionEndReason) => void,
    private readonly survivors: ShoreGunsSurvivors | null,
  ) {
    const onLand = survivors ? (x: number, y: number, aimed: boolean): void => survivors.onShell(x, y, aimed) : null;
    for (let i = 0; i < batteries.length; i++) {
      this.shores.push(new ShoreBattery(scene, batteries[i]!, new SeededRng((seed + SHORE_GUNS_SEED_OFFSET + i) >>> 0), boat, boatHalfLengthM, boatHalfBeamM, splashes, (spec, rng, x, y) => hitBoat(spec, rng, x, y, 'shore_battery'), onLand));
    }
    this.boat = boat;
    this.free = new Uint8Array(batteries.length);
    const sr = survivors ? survivors.rules.shelling : null;
    this.shelling = sr ? createSurvivorShelling(sr) : null;
    this.shellRng = sr ? new SeededRng((seed + SURVIVOR_SHELL_SEED_OFFSET) >>> 0) : null;
  }

  private readonly onSeaFire = (k: number, x: number, y: number): void => this.shores[k]!.fireAtSea(x, y);

  /** 固定ステップ（spec §4.0 の順: S ボートの退きの後・生存者の前）。閃光は使わない（昼は射界の内なら見えている） */
  step(w: ShoreGunsView, feelDt: number, dt: number): void {
    const afloat = !w.boat.sinking;
    for (const sb of this.shores) sb.step(feelDt, dt, afloat, sb.p.baseDetectM, w.vis.smokeFactor, w.smoke, w.smokeParams, false, 0);
    const sv = this.survivors;
    if (!sv || !this.shelling || !sv.rules.shelling) return;
    // 生存者の海（v0.8.5 IP2）: 自艇を撃てる（気づいていて・射界の中・煙幕に遮られていない＝core/shore-battery の撃つ条件）砲台は撃たない
    const b = this.boat;
    for (let k = 0; k < this.shores.length; k++) {
      const sb = this.shores[k]!;
      const st = sb.state;
      const blocked = w.smoke !== null && w.smokeParams !== null && losBlocked(w.smoke, w.smokeParams, sb.p.x, sb.p.y, b.x, b.y);
      this.free[k] = st.alerted && st.inArc && !blocked ? 0 : 1;
    }
    stepSurvivorShelling(this.shelling, sv.rules.shelling, this.shores, this.free, sv.state, !w.dawn.reached && !sv.state.timeUp && !sv.state.ended, this.shellRng!, feelDt, this.onSeaFire);
  }

  /** 生存者の海へ撃った数（v0.8.5 IP2。無い任務は 0） */
  get seaShots(): number {
    return this.shelling ? this.shelling.shots : 0;
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
