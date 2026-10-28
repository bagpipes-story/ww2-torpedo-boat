// 艦への機銃（v0.6.8。spec-v068 §1.1 D4・§3.2・§5.1。ユーザー「意味がなくても駆逐艦に機銃撃ったり」）: 駆逐艦の任務（us_01・us_02・jp_06）で艇の砲（boats.json の gun_battery）を
// 駆逐艦・輸送船へ撃つ。本体は凍結の core/gun-battery の stepGunBatteryOf（大発・米PT と同じ: 見えていて射程内・射界内・煙幕に遮られていない最寄り、散布は速力帯の倍率、1 発 2 回の乱数）。
// 艦には効かない: 当たっても水柱（命中は橙）と「艦に効かず閃光で見つかる」だけ（艦の被弾の数え・沈没の演出は呼ばない。tests/arms-world-order のソースの pin）。撃てば閃光（systems/arms-step）。
// 艦は事前に作った写し（ShipProxy: 位置・向き・速さ・狙えるか・煙幕に遮られたか）で渡す（module の関数 shipLive・shipBlocked。毎ステップ閉包を作らない）。
// 船体の大きさは隊の艦の最大（実寸 × ship_hit_scale の半分）。弾倉のある艇（jp_06 の T-38）は core/magazine（pt-gun と同じ: 交換中は押していない扱い・撃った数だけ減らす）。
// 乱数は seed+25（core/arms-cue の SHIP_GUN_SEED_OFFSET）の 1 系列だけ（駆逐艦の任務だけで作る。押さなければ引かない）。Phaser 非依存・確保は constructor だけ。
import { ARMS_SHELL_POOL_SIZE } from '../config/arms-config';
import { SHIP_GUN_SEED_OFFSET } from '../core/arms-cue';
import type { BoatState, SpeedStep } from '../core/boat-motion';
import { GUN_SAFE, createGunBattery, stepGunBatteryOf, type GunBatteryParams, type GunBatteryState, type GunEvents } from '../core/gun-battery';
import { magazineSpend, type MagazineParams, type MagazineState } from '../core/magazine';
import { PT_GUN_RELOAD } from '../core/pt-gun';
import { SeededRng } from '../core/rng';
import { losBlocked, type SmokeParams, type SmokeState } from '../core/smoke';

/** 艦の写し（凍結の本体は BoatState の配列を読む）: live は狙える（沈み始めていない・退いていない）、blocked は煙幕に遮られた（押している間だけ測る） */
export interface ShipProxy extends BoatState {
  live: boolean;
  blocked: boolean;
}

/** 隊の艦の読む部分（systems/destroyer-group の Destroyer がそのまま満たす） */
export interface ArmsShip {
  readonly state: BoatState;
  readonly out: boolean;
  readonly spec: { readonly lengthM: number; readonly beamM: number; readonly hitScale: number };
}

/** 駆逐艦の隊の読む部分（DestroyerGroup がそのまま満たす） */
export interface ArmsShipGroup {
  readonly ships: readonly ArmsShip[];
}

/** 艦への機銃が世界から読む部分（MissionWorld がそのまま満たす） */
export interface ShipGunWorld {
  readonly boat: { readonly state: BoatState };
  readonly band: SpeedStep;
  readonly visRange2: number;
  readonly smoke: SmokeState | null;
  readonly smokeParams: SmokeParams | null;
}

function shipLive(p: ShipProxy): boolean {
  return p.live;
}

function shipBlocked(p: ShipProxy): boolean {
  return p.blocked;
}

export class ShipGun {
  readonly battery: GunBatteryState;
  /** 散布（seed+25。1 発 2 回） */
  readonly rng: SeededRng;
  readonly proxies: ShipProxy[] = [];
  private readonly halfLengthM: number;
  private readonly halfBeamM: number;

  constructor(
    readonly g: GunBatteryParams,
    group: ArmsShipGroup,
    seed: number,
  ) {
    this.rng = new SeededRng((seed + SHIP_GUN_SEED_OFFSET) >>> 0);
    this.battery = createGunBattery(g, ARMS_SHELL_POOL_SIZE);
    let hl = 0;
    let hb = 0;
    for (const s of group.ships) {
      hl = Math.max(hl, (s.spec.lengthM * s.spec.hitScale) / 2);
      hb = Math.max(hb, (s.spec.beamM * s.spec.hitScale) / 2);
      this.proxies.push({ x: s.state.x, y: s.state.y, headingDeg: s.state.headingDeg, speedMps: s.state.speedMps, live: !s.out, blocked: false });
    }
    this.halfLengthM = hl;
    this.halfBeamM = hb;
  }

  /** 撃った累計の発数・当たった数（命中は水柱だけ） */
  get rounds(): number {
    return this.battery.shots;
  }

  get hits(): number {
    return this.battery.hits;
  }

  /**
   * 固定ステップ（敵の側の最初。駆逐艦の段の前＝撃ったステップに閃光で艦が見つける）: 写しを今の艦に合わせ → 標的 → 発射 → 着弾。held は機銃、canFire は呼ぶ側（浮いている・輪の外・
   * 座礁していない・終わりの待ちでない）。mag は弾倉（無い艇は null。交換は呼ぶ側が 1 ステップ 1 回 magazineTick）。交換中で押していれば状態は PT_GUN_RELOAD（core/pt-gun と同じ番号）
   */
  step(w: ShipGunWorld, group: ArmsShipGroup, held: boolean, canFire: boolean, mag: MagazineState | null, magP: MagazineParams | null, feelDt: number, dt: number, ev: GunEvents): void {
    const boat = w.boat.state;
    const sm = held ? w.smoke : null;
    const sp = w.smokeParams;
    for (let i = 0; i < this.proxies.length; i++) {
      const p = this.proxies[i]!;
      const s = group.ships[i]!;
      p.x = s.state.x;
      p.y = s.state.y;
      p.headingDeg = s.state.headingDeg;
      p.speedMps = s.state.speedMps;
      p.live = !s.out;
      p.blocked = sm !== null && sp !== null && p.live && losBlocked(sm, sp, p.x, p.y, boat.x, boat.y);
    }
    const reloading = mag !== null && mag.reloadLeftS > 0;
    const before = this.battery.shots;
    stepGunBatteryOf(this.battery, this.g, boat, w.band, held && !reloading, canFire, this.proxies, shipLive, shipBlocked, this.halfLengthM, this.halfBeamM, w.visRange2, this.rng, feelDt, dt, ev);
    if (reloading && held && canFire && this.battery.status === GUN_SAFE) this.battery.status = PT_GUN_RELOAD;
    if (mag !== null && magP !== null) magazineSpend(mag, magP, this.battery.shots - before);
  }
}
