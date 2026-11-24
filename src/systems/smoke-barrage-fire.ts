// 煙幕への乱射（v0.8.4。史実モードだけ）の艦 1 隻ぶんの持ち物: core/smoke-barrage の状態・値・世界に 1 つの乱数（seed+46）・煙の読み口（世界の smoke）。
// systems/enemy-fire の step・stepPair が普段の砲の発射の前に fire、普段の砲の段の後に settle を呼ぶ（持たない艦は null＝普段の道そのまま）。
// 作るのは world-enemies だけ（史実モードで、煙幕のある艇で、艦の隊のいる世界）。弾・閃光・水柱・音は普段の砲の物をそのまま使う（乱射の弾は普段の弾）。Phaser 非依存・確保は constructor だけ。
import { SMOKE_BARRAGE_HUD_NEAR_M } from '../config/barrage-hud-config';
import type { BoatState } from '../core/boat-motion';
import type { GunneryParams, GunneryState } from '../core/gunnery';
import type { SeededRng } from '../core/rng';
import { createSmokeBarrageState, settleBarrageShells, stepSmokeBarrage, type BarrageFireEvents, type SmokeBarrageParams, type SmokeBarrageState } from '../core/smoke-barrage';
import type { ShellState } from '../core/shells';
import type { SmokeState } from '../core/smoke';

/** 隊の全艦で分け合う物（乱数は艦の順に同じ系列を引く＝普段の砲の seed+1 と同じ作法）。smoke は世界（MissionWorld の smoke。作るのは敵の側の後なので固定ステップの時に読む） */
export interface BarrageShared {
  readonly params: SmokeBarrageParams;
  readonly rng: SeededRng;
  readonly world: { readonly smoke?: SmokeState | null };
}

export class ShipBarrage {
  readonly state: SmokeBarrageState;

  constructor(private readonly shared: BarrageShared, gunCount: number, shellPoolSize: number) {
    this.state = createSmokeBarrageState(gunCount, shellPoolSize);
  }

  /** 普段の砲の発射の前（同じステップ）。visibleTarget＝普段の砲が撃てる目標がある（2 目標の任務の照らされた僚艇） */
  fire(g: GunneryState, gp: GunneryParams, ship: BoatState, boat: BoatState, detected: boolean, losBlocked: boolean, canFire: boolean, visibleTarget: boolean, realDt: number, events: BarrageFireEvents): void {
    const sh = this.shared;
    stepSmokeBarrage(this.state, sh.params, gp, g, ship, boat, detected, losBlocked, canFire, visibleTarget, sh.world.smoke ?? null, sh.rng, realDt, events);
  }

  /** 普段の砲の段の後（同じステップ）: 着いた乱射の弾を数える（自艇から SMOKE_BARRAGE_HUD_NEAR_M 以内の数が HUD の 2 行目） */
  settle(shells: readonly ShellState[], gp: GunneryParams, boat: BoatState, halfLengthM: number, halfBeamM: number): void {
    settleBarrageShells(this.state, shells, gp, boat, halfLengthM, halfBeamM, SMOKE_BARRAGE_HUD_NEAR_M);
  }
}
