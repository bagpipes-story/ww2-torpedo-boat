// 砲撃の強さを測るオフライン模擬（Phaser 非依存。src/core と data だけ）。docs/02 §6.5・§6.6、v0.2.1。
// (1) 距離ごとの HP/秒（静止した艇、照らされっぱなし）、(2) 照らされたまま留まったときの沈没までの秒数（火災込み、200 回の中央値）、
// (3) 攻撃行動: 静音で 1,000 m まで寄り（発見 1,000 m）、発射して全速で反転離脱したときの残り HP。
// 実行: npx esbuild scripts/gunnery-sim.ts --bundle --platform=node --format=esm --outfile=/tmp/gunnery-sim.mjs && node /tmp/gunnery-sim.mjs
import boats from '../data/boats.json';
import enemies from '../data/enemies.json';
import hitRateModel from '../data/hit_rate_model.json';
import { boatParamsFromData, isBoatDataRecord, stepBoat, type BoatState } from '../src/core/boat-motion';
import {
  applyShellHit,
  createDamageState,
  createGunneryState,
  damageParamsFromData,
  gunneryParamsFromData,
  isBoatDamageDataRecord,
  isEnemyGunneryDataRecord,
  stepDamage,
  updateGuns,
  updateIllumination,
  type HitOutcome,
  type ShellEvents,
} from '../src/core/gunnery';
import { SeededRng } from '../src/core/rng';
import { ktToMps } from '../src/core/units';

const rawEnemy: unknown = enemies.enemies.find((e) => e.id === 'ijn_destroyer');
if (!isEnemyGunneryDataRecord(rawEnemy)) throw new Error('enemy');
const GP = gunneryParamsFromData(rawEnemy);
const rawBoat: unknown = boats.boats.find((b) => b.id === 'us_elco80');
if (!isBoatDamageDataRecord(rawBoat) || !isBoatDataRecord(rawBoat)) throw new Error('boat');
const DP = damageParamsFromData(rawBoat);
const BP = boatParamsFromData(rawBoat);
const TS = hitRateModel.world.time_scale;
const REAL = 1 / 60;
const GAME = REAL * TS;
const HALF_LEN = rawBoat.length_m / 2;
const HALF_BEAM = rawBoat.beam_m / 2;
const ship: BoatState = { x: 0, y: 0, headingDeg: 90, speedMps: ktToMps(25) };

function hpPerSecond(gunIndex: number, rangeM: number, seconds: number): number {
  const p = { ...GP, guns: [GP.guns[gunIndex]!] };
  const g = createGunneryState(p, 48, 0);
  const player: BoatState = { x: rangeM, y: 0, headingDeg: 0, speedMps: 0 };
  const rng = new SeededRng(7);
  let hits = 0;
  const ev: ShellEvents = { onFire: () => {}, onImpact: (_i, _x, _y, hit) => { if (hit) hits++; } };
  for (let i = 0; i < seconds * 60; i++) {
    g.illuminated = true;
    updateGuns(g, ship, player, true, HALF_LEN, HALF_BEAM, p, rng, REAL, GAME, ev);
  }
  return (hits * p.guns[0]!.damage) / seconds;
}

function timeToSinkS(rangeM: number, seed: number): number {
  const g = createGunneryState(GP, 48, 0);
  const d = createDamageState(DP);
  const out: HitOutcome = { destroyed: false, startedFire: false, engineHit: false };
  const player: BoatState = { x: rangeM, y: 0, headingDeg: 0, speedMps: 0 };
  const rng = new SeededRng(seed);
  let dead = false;
  const ev: ShellEvents = { onFire: () => {}, onImpact: (i, _x, _y, hit) => { if (hit && !dead) dead = applyShellHit(d, GP.guns[i]!, DP, rng, out).destroyed; } };
  for (let i = 0; i < 600 * 60; i++) {
    g.illuminated = true;
    updateGuns(g, ship, player, true, HALF_LEN, HALF_BEAM, GP, rng, REAL, GAME, ev);
    if (stepDamage(d, DP, REAL)) dead = true;
    if (dead) return i / 60;
  }
  return Infinity;
}

/**
 * 攻撃行動: 艦は原点で東向きに停止（横腹を見せる理想化）。艇は南 1,800 m から北へ静音で寄り、1,000 m で発射（想定）して全速で反転、南へ離脱。
 * 発見距離は半月の速力段係数（静音 1,000 m・巡航 2,000 m・全速 3,200 m）で近似。
 */
function attackRun(seed: number): { hpLeft: number; litS: number; sankAtS: number | null } {
  const g = createGunneryState(GP, 48, 90);
  const d = createDamageState(DP);
  const out: HitOutcome = { destroyed: false, startedFire: false, engineHit: false };
  const player: BoatState = { x: 0, y: 1800, headingDeg: 0, speedMps: ktToMps(8) };
  const shipMoving: BoatState = { x: 0, y: 0, headingDeg: 90, speedMps: 0 };
  const rng = new SeededRng(seed);
  let dead = false;
  const ev: ShellEvents = { onFire: () => {}, onImpact: (i, _x, _y, hit) => { if (hit && !dead) dead = applyShellHit(d, GP.guns[i]!, DP, rng, out).destroyed; } };
  const input = { rudder: 0, throttle: -0.5 };
  let phase: 'approach' | 'turn' | 'escape' = 'approach';
  let litS = 0;
  for (let i = 0; i < 120 * 60; i++) {
    const dx = player.x - shipMoving.x;
    const dy = player.y - shipMoving.y;
    const dist = Math.hypot(dx, dy);
    if (phase === 'approach' && dist <= 1000) { phase = 'turn'; input.throttle = 1; input.rudder = 1; }
    if (phase === 'turn' && Math.abs(((player.headingDeg - 180 + 540) % 360) - 180) < 5) { phase = 'escape'; input.rudder = 0; }
    stepBoat(player, input, BP, GAME);
    const stepFactor = player.speedMps > ktToMps(31) ? 1.6 : player.speedMps > ktToMps(15.5) ? 1 : player.speedMps > ktToMps(4) ? 0.5 : 0.4; // 最も近い速力段の係数
    const detected = dist <= 2000 * stepFactor;
    updateIllumination(g, shipMoving, player, detected, GP, REAL);
    if (g.illuminated) litS += REAL;
    updateGuns(g, shipMoving, player, true, HALF_LEN, HALF_BEAM, GP, rng, REAL, GAME, ev);
    if (stepDamage(d, DP, REAL)) dead = true;
    if (dead) return { hpLeft: 0, litS: +litS.toFixed(1), sankAtS: i / 60 };
    if (phase === 'escape' && dist > 3500) break;
  }
  return { hpLeft: Math.round(d.hp), litS: +litS.toFixed(1), sankAtS: null };
}

const lines: string[] = [];
for (let gi = 0; gi < GP.guns.length; gi++) {
  const gun = GP.guns[gi]!;
  const cells = [600, 1000, 1200, 1500, 2000, 3000].filter((r) => r <= gun.effectiveM).map((r) => `${r}m ${hpPerSecond(gi, r, 600).toFixed(1)}`);
  lines.push(`${gun.id} HP/秒（静止・照射中）: ${cells.join(' | ')}`);
}
for (const r of [730, 1000, 1500, 2000]) {
  const ts = Array.from({ length: 200 }, (_, k) => timeToSinkS(r, 100 + k)).sort((a, b) => a - b);
  const med = ts[100]!;
  const p10 = ts[20]!;
  const p90 = ts[180]!;
  lines.push(`${r}m に留まる: 沈没まで 中央値 ${med === Infinity ? '600 秒超' : med.toFixed(1) + ' 秒'}（10%: ${p10.toFixed(1)}、90%: ${p90 === Infinity ? '600+' : p90.toFixed(1)}）`);
}
const runs = Array.from({ length: 200 }, (_, k) => attackRun(500 + k));
const sank = runs.filter((r) => r.sankAtS !== null).length;
const hp = runs.filter((r) => r.sankAtS === null).map((r) => r.hpLeft).sort((a, b) => a - b);
lines.push(`攻撃行動（静音で 1,000 m → 全速で反転離脱、200 回）: 沈没 ${sank} 回、生還時の残り HP 中央値 ${hp.length ? hp[Math.floor(hp.length / 2)] : '-'}（照射された時間 中央値 ${runs.map((r) => r.litS).sort((a, b) => a - b)[100]} 秒）`);
console.log(lines.join('\n'));
