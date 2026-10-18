// 命中率 KPI の模擬の表（v0.5.0。docs/02 §6.3）: data の値で、正しい見越し角の 1 本を雷跡に気づいて避ける駆逐艦へ撃ち、距離帯ごとの命中率を目標帯と並べる。
// 中身は src/core/hit-rate-sim.ts（tests/hit-rate-sim.test.ts と同じ）。設定は data/hit_rate_model.json の kpi_measurement.sim と kpi_by_range.sim_ranges_m。
// 環境変数で上書きして感度を見る: WAKE（torpedo_wake_detect_m）・SPOT（wake_spot_rate_per_s）・REACT（reaction_delay_s）・EVADE_TURN（evade_turn_rate_deg_s）・
//   BOOST（speed_boost_kt。負は減速）・HIT（ship_hit_scale）・DETECT（艇を見つける距離 m。体当たりも）・ENEMY（enemies.json の id）・REPS・HISTORICAL=1（史実モード。v0.5.2）・TORP（torpedoes.json の id。v0.6.0）
// 実行: npx esbuild scripts/hit-rate-sim.ts --bundle --platform=node --format=esm --outfile=<scratch>/hit-rate-sim.mjs && node <scratch>/hit-rate-sim.mjs
import { gameData } from '../src/config/game-data';
import { ktToMps } from '../src/core/units';
import { hitRateSimSetup, runHitRateSim } from '../src/systems/hit-rate-sim-setup';

const env = (k: string): number | undefined => (process.env[k] !== undefined ? Number(process.env[k]) : undefined);
const historical = process.env['HISTORICAL'] === '1';
const s = hitRateSimSetup(gameData, { enemyId: process.env['ENEMY'], torpedoId: process.env['TORP'], shipHitScale: env('HIT'), detectM: env('DETECT'), historical });
s.ai.torpedoWakeDetectM = env('WAKE') ?? s.ai.torpedoWakeDetectM;
s.ai.wakeSpotRatePerS = env('SPOT') ?? s.ai.wakeSpotRatePerS;
s.ai.reactionDelayS = env('REACT') ?? s.ai.reactionDelayS;
s.ai.evadeTurnRateDegS = env('EVADE_TURN') ?? s.ai.evadeTurnRateDegS;
const boost = env('BOOST');
if (boost !== undefined) s.ai.speedBoostMps = ktToMps(boost);
const res = runHitRateSim(gameData, s, env('REPS'));
const pct = (x: number): string => `${Math.round(x * 100)}%`;
const inBand = (r: { rate: number; targetMin: number; targetMax: number }): boolean => r.rate >= r.targetMin - 0.005 && r.rate <= r.targetMax + 0.005;
console.log(
  `[見える ${s.ai.torpedoWakeDetectM} m・気づく ${s.ai.wakeSpotRatePerS}/秒・反応 ${s.ai.reactionDelayS} 秒・転舵 ${s.ai.evadeTurnRateDegS}°/秒・増減 ${Math.round(s.ai.speedBoostMps / 0.514444)} kt・当たり x${env('HIT') ?? gameData.hitRateModel.world.ship_hit_scale}・発見 ${s.detectM} m]`,
);
for (const r of res) console.log(`  ${r.band.padEnd(12)} ${pct(r.rate).padStart(4)}（目標 ${pct(r.targetMin)}〜${pct(r.targetMax)}）${inBand(r) ? ' ✓' : ''}  n=${r.shots}`);
