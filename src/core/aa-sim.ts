// 対空の模擬（v0.6.8。spec-v068 §5.2）: 夜明けの空襲の 1 波を機銃を押し続けて受けたとき、1 波の発数・射程の中の秒・撃墜（平均と 1 機以上の波の割合）・
// 爆弾・自艇への命中（対空なしの同じ seed と並べる）・波の間隔・止まった（次の波が来ない）回数を数える。Phaser 非依存。ゲームは使わない
// （tests/aa-balance.test.ts と scripts/aa-sim.ts が使う。17 の md5 の模擬ではない）。
// ゲームと同じ core（凍結の stepAirStrike・strikePose・stepBoat と、core/aa-fire・magazine・air-down）を同じ順で回す: 艇 → 速力帯 → （対空: 撃墜の後なら順番を飛ばす →
// 弾倉 → 機の枠 → 撃つ → 撃墜 → 順番を飛ばす）→ 空襲（最後。機の位置は前のステップのもの＝ゲームの stepEnemySide が dawn.step の前なのと同じ）。
// 艇は広い海（core/air-strike-sim の SIM_BOUNDS の中ほど）から、遊び方の速さで走り出す。僚艇はいない（全弾が自艇へ）。乱数: 散布は seed、対空は seed+24。
import { createAirStrike, startAirStrike, stepAirStrike, type AirStrikeCheck, type AirStrikeParams } from './air-strike';
import { AA_SEED_OFFSET, AA_SRC_DAWN, addStrikePlanes, createAaState, createAaTargets, stepAaFire, type AntiAircraftParams } from './aa-fire';
import { downStrikePlane, skipDownedRuns } from './air-down';
import { nextSpeedBand, stepBoat, type BoatInput, type BoatParams, type BoatState, type SpeedStep } from './boat-motion';
import type { AircraftPose } from './friendly';
import type { GunBatteryParams } from './gun-battery';
import { createMagazine, magazineTick } from './magazine';
import { SeededRng } from './rng';
import { wrapDeg360 } from './units';

/** 遊び方: 止まる・巡航で回り続ける・全速で回り続ける・全速で直進（どれも機銃は押し続ける） */
export type AaSimPolicy = 'stop' | 'cruise_circle' | 'full_circle' | 'full_straight';
export const AA_SIM_POLICIES: readonly AaSimPolicy[] = ['stop', 'cruise_circle', 'full_circle', 'full_straight'];

export interface AaSimSetup {
  strike: AirStrikeParams;
  boat: BoatParams;
  gun: GunBatteryParams;
  aa: AntiAircraftParams;
  timeScale: number;
  /** 固定ステップの実時間秒（step-config の FIXED_STEP_S） */
  stepS: number;
}

/** 空襲の模擬の組み立て（systems/air-strike-sim-setup の strikeSimSetup）に艇の砲（config/loadout-data の getLoadout().gun）と対空の値を足す */
export function aaSimSetup(s: { strike: AirStrikeParams; boat: BoatParams; timeScale: number; stepS: number }, gun: GunBatteryParams, aa: AntiAircraftParams): AaSimSetup {
  return { strike: s.strike, boat: s.boat, gun, aa, timeScale: s.timeScale, stepS: s.stepS };
}

/** 1 回の模擬の合計（waves 波ぶん） */
export interface AaTrial {
  rounds: number;
  inRangeS: number;
  downs: number;
  /** 1 機以上落とした波の数 */
  wavesWithDown: number;
  bombs: number;
  hits: number;
  /** 波の始まりの間隔の最小・最大（体感秒。波が 1 つなら NaN）と、打ち切りに着いた（次の波が来ない） */
  gapMinS: number;
  gapMaxS: number;
  stalled: boolean;
}

/** n 回の 1 波あたりの平均（pAtLeast1 は 1 機以上落とした波の割合。gap は全回の最小・最大。stalls は打ち切りに着いた回数）。*NoAa は対空なしの同じ seed */
export interface AaWaveCell {
  rounds: number;
  inRangeS: number;
  downs: number;
  pAtLeast1: number;
  bombs: number;
  bombsNoAa: number;
  hits: number;
  hitsNoAa: number;
  gapMinS: number;
  gapMaxS: number;
  stalls: number;
}

/** 打ち切り: 1 波あたりこの体感秒（撃墜の無い波は us 42.3 秒・jp_02 51.1 秒） */
const AA_SIM_MAX_S_PER_WAVE = 120;
/** 模擬の艇の出発点（core/air-strike-sim の SIM_ORIGIN と同じ広い海の中ほど） */
const AA_SIM_ORIGIN = 5e5;
/** 回り続ける: 目標方位を今の針路 + 90° に置き続ける（舵いっぱい。core/air-strike-sim と同じ） */
const CIRCLE_AHEAD_DEG = 90;

/** 1 回: 空襲を始めて waves 波が終わり次の波が来るまで（fire false なら対空なし＝撃たない・引かない） */
export function aaWaveTrial(s: AaSimSetup, pol: AaSimPolicy, fire: boolean, seed: number, waves: number): AaTrial {
  const bp = s.boat;
  const speed01 = pol === 'stop' ? 0 : pol === 'cruise_circle' ? bp.speedCruiseMps / bp.speedMaxMps : 1;
  const boat: BoatState = { x: AA_SIM_ORIGIN, y: AA_SIM_ORIGIN, headingDeg: 0, speedMps: speed01 * bp.speedMaxMps };
  const input: BoatInput = { headingDeg: pol === 'stop' ? NaN : 0, speed01 };
  const st = createAirStrike(s.strike);
  const c: AirStrikeCheck = { player: boat, playerSinking: false, escort: null, escortAfloat: false, cancel: false };
  const rng = new SeededRng(seed >>> 0);
  const aaRng = new SeededRng((seed + AA_SEED_OFFSET) >>> 0);
  const aa = createAaState(s.gun);
  const magP = s.gun.magazine ?? null;
  const mag = magP ? createMagazine(magP) : null;
  const tg = createAaTargets();
  const pose: AircraftPose = { dx: 0, dy: 0, headingDeg: 0, alpha: 0 };
  const dt = s.stepS;
  const maxS = AA_SIM_MAX_S_PER_WAVE * (waves + 1);
  const out: AaTrial = { rounds: 0, inRangeS: 0, downs: 0, wavesWithDown: 0, bombs: 0, hits: 0, gapMinS: NaN, gapMaxS: NaN, stalled: false };
  let band: SpeedStep = 'stop';
  let t = 0;
  let lastWaves = 0;
  let waveStartT = NaN;
  let lastDownWave = -1;
  startAirStrike(st, s.strike, boat);
  while (st.waves <= waves) {
    if (t >= maxS) {
      out.stalled = true;
      break;
    }
    t += dt;
    if (pol === 'cruise_circle' || pol === 'full_circle') input.headingDeg = wrapDeg360(boat.headingDeg + CIRCLE_AHEAD_DEG);
    stepBoat(boat, input, bp, dt * s.timeScale);
    band = nextSpeedBand(band, boat.speedMps, bp);
    if (fire) {
      if (out.downs > 0) skipDownedRuns(st, s.strike);
      if (mag && magP) magazineTick(mag, magP, dt);
      tg.n = 0;
      addStrikePlanes(tg, st, s.strike, boat, AA_SRC_DAWN, pose);
      const k = stepAaFire(aa, s.gun, s.aa, mag, magP, true, true, band, boat, tg, aaRng, dt);
      if (aa.target >= 0) out.inRangeS += dt;
      if (k >= 0 && downStrikePlane(st, tg.idx[k]!)) {
        out.downs++;
        if (lastDownWave !== st.waves) {
          lastDownWave = st.waves;
          out.wavesWithDown++;
        }
        skipDownedRuns(st, s.strike);
      }
    }
    stepAirStrike(st, s.strike, c, rng, dt);
    if (st.waves !== lastWaves) {
      if (!Number.isNaN(waveStartT)) {
        const g = t - waveStartT;
        if (!(g >= out.gapMinS)) out.gapMinS = g;
        if (!(g <= out.gapMaxS)) out.gapMaxS = g;
      }
      waveStartT = t;
      lastWaves = st.waves;
    }
  }
  out.rounds = aa.rounds;
  out.bombs = st.bombsDropped;
  out.hits = st.hitsPlayer;
  return out;
}

/** n 回（seed0, seed0 + 1, …）の 1 波あたりの平均。対空ありと対空なしを同じ seed で並べる */
export function aaWaveCell(s: AaSimSetup, pol: AaSimPolicy, n: number, seed0: number, waves: number): AaWaveCell {
  const cell: AaWaveCell = { rounds: 0, inRangeS: 0, downs: 0, pAtLeast1: 0, bombs: 0, bombsNoAa: 0, hits: 0, hitsNoAa: 0, gapMinS: NaN, gapMaxS: NaN, stalls: 0 };
  for (let i = 0; i < n; i++) {
    const a = aaWaveTrial(s, pol, true, seed0 + i, waves);
    const z = aaWaveTrial(s, pol, false, seed0 + i, waves);
    cell.rounds += a.rounds;
    cell.inRangeS += a.inRangeS;
    cell.downs += a.downs;
    cell.pAtLeast1 += a.wavesWithDown;
    cell.bombs += a.bombs;
    cell.hits += a.hits;
    cell.bombsNoAa += z.bombs;
    cell.hitsNoAa += z.hits;
    if (!Number.isNaN(a.gapMinS) && !(a.gapMinS >= cell.gapMinS)) cell.gapMinS = a.gapMinS;
    if (!Number.isNaN(a.gapMaxS) && !(a.gapMaxS <= cell.gapMaxS)) cell.gapMaxS = a.gapMaxS;
    if (a.stalled) cell.stalls++;
  }
  const w = n * waves;
  cell.rounds /= w;
  cell.inRangeS /= w;
  cell.downs /= w;
  cell.pAtLeast1 /= w;
  cell.bombs /= w;
  cell.bombsNoAa /= w;
  cell.hits /= w;
  cell.hitsNoAa /= w;
  return cell;
}
