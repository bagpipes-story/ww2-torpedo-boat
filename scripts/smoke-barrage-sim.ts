// 煙幕への乱射（v0.8.4。史実モード。core/smoke-barrage）の強さを測るオフライン模擬（Phaser 非依存。src/core と data だけ）。brief の D4 の表:
// 止まった艇（BOAT、既定 us_elco80）が最後に見られた点に止まったまま煙幕を張り（艇尾＝船体の長さ × sprite_scale の半分の後ろに煙が積もる）、艦（ENEMY、既定 ijn_destroyer_mutsuki_enemy）は
// 止まって d m 先から乱射する。距離ごとに (1) 砲ごとと全弾の 1 発の当たる割合、(2) 同じ距離で照らして撃つ普段の砲の 1 発の当たる割合、(3) 煙の中に 30 秒いた時の当たりの数と HP の減り
// （火災・機関は数えない。見つけたままの仮定＝実際は止まった艇を煙の中で見つける距離の外なら detect_hold_s の 8 秒で見失って撃たなくなる。その距離も出す）。
// 煙は張れるたびに張り直す（5 秒張って 20 秒の冷却。煙は 25 秒残る）。艦と艇の線は煙に遮られる（艇は煙の中）。SEEDS（既定 200）回の平均。
// 実行: npx esbuild scripts/smoke-barrage-sim.ts --bundle --platform=node --format=esm --outfile=/tmp/smoke-barrage-sim.mjs && node /tmp/smoke-barrage-sim.mjs
import boats from '../data/boats.json';
import enemies from '../data/enemies.json';
import hitRateModel from '../data/hit_rate_model.json';
import type { BoatState } from '../src/core/boat-motion';
import { createGunneryState, gunneryParamsFromData, isEnemyGunneryDataRecord, updateGuns, type GunneryParams, type ShellEvents } from '../src/core/gunnery';
import { SeededRng } from '../src/core/rng';
import { barrageScatterM, createSmokeBarrageState, isSmokeBarrageDataRecord, settleBarrageShells, smokeBarrageParamsFromData, stepSmokeBarrage } from '../src/core/smoke-barrage';
import { createSmokeState, isBoatSmokeDataRecord, losBlocked, smokeParamsFromData, startSmoke, updateSmoke } from '../src/core/smoke';
import { enemyDetectRangeM } from '../src/core/visibility';

const ENEMY = process.env['ENEMY'] ?? 'ijn_destroyer_mutsuki_enemy';
const raw: unknown = enemies.enemies.find((e) => e.id === ENEMY);
if (!isEnemyGunneryDataRecord(raw)) throw new Error(`enemy ${ENEMY}`);
const GP: GunneryParams = gunneryParamsFromData(raw);
const rawBoat = boats.boats.find((b) => b.id === (process.env['BOAT'] ?? 'us_elco80'));
if (!rawBoat || !isBoatSmokeDataRecord(rawBoat)) throw new Error('boat');
const SP = smokeParamsFromData(rawBoat)!;
const hb = hitRateModel.historical_mode.smoke_barrage;
if (!isSmokeBarrageDataRecord(hb)) throw new Error('smoke_barrage');
const BP = smokeBarrageParamsFromData(hb);
const TS = hitRateModel.world.time_scale;
const REAL = 1 / 60;
const GAME = REAL * TS;
const HALF_LEN = (rawBoat.length_m * hitRateModel.world.hit_scale) / 2;
const HALF_BEAM = (rawBoat.beam_m * hitRateModel.world.hit_scale) / 2;
const STERN = (rawBoat.length_m * hitRateModel.world.sprite_scale) / 2;
const SEEDS = Number(process.env['SEEDS'] ?? 200);
const STAY_S = Number(process.env['STAY_S'] ?? 30);
const POOL = 32; // config/ui-config の SMOKE_POOL_SIZE と同じ
const SHELLS = 48; // config/ui-config の SHELL_POOL_SIZE と同じ
const RANGES = [600, 500, 400, 300, 200, 150, 100];

interface Tally { shots: number[]; hits: number[] }
const zero = (): Tally => ({ shots: GP.guns.map(() => 0), hits: GP.guns.map(() => 0) });

function blind(d: number, seed: number, t: Tally): void {
  const ship: BoatState = { x: 0, y: 0, headingDeg: 90, speedMps: 0 };
  const boat: BoatState = { x: 0, y: -d, headingDeg: 90, speedMps: 0 };
  const g = createGunneryState(GP, SHELLS, 0);
  const b = createSmokeBarrageState(GP.guns.length, SHELLS);
  const smoke = createSmokeState(POOL);
  const rng = new SeededRng(seed);
  const unused = new SeededRng(seed + 1000);
  const ev: ShellEvents = { onFire: (i) => { t.shots[i]!++; }, onImpact: (i, _x, _y, hit) => { if (hit) t.hits[i]!++; } };
  // 最後に見た点を置く 1 ステップ（煙の前に見つけている）
  stepSmokeBarrage(b, BP, GP, g, ship, boat, true, false, true, false, smoke, rng, REAL, ev);
  for (let k = 0; k < STAY_S * 60; k++) {
    startSmoke(smoke, SP);
    updateSmoke(smoke, SP, boat, STERN, REAL);
    const blocked = losBlocked(smoke, SP, ship.x, ship.y, boat.x, boat.y);
    stepSmokeBarrage(b, BP, GP, g, ship, boat, true, blocked, true, false, smoke, rng, REAL, ev);
    updateGuns(g, ship, boat, true, HALF_LEN, HALF_BEAM, GP, unused, REAL, GAME, ev); // 普段の砲は照らされていないので撃たない（弾の飛行と着弾だけ）
    settleBarrageShells(b, g.shells, GP, boat, HALF_LEN, HALF_BEAM, 150);
  }
}

function lit(d: number, seed: number, t: Tally): void {
  const ship: BoatState = { x: 0, y: 0, headingDeg: 90, speedMps: 0 };
  const boat: BoatState = { x: 0, y: -d, headingDeg: 90, speedMps: 0 };
  const g = createGunneryState(GP, SHELLS, 0);
  const rng = new SeededRng(seed);
  const ev: ShellEvents = { onFire: (i) => { t.shots[i]!++; }, onImpact: (i, _x, _y, hit) => { if (hit) t.hits[i]!++; } };
  for (let k = 0; k < STAY_S * 60; k++) {
    g.illuminated = true;
    updateGuns(g, ship, boat, true, HALF_LEN, HALF_BEAM, GP, rng, REAL, GAME, ev);
  }
}

const pct = (h: number, n: number): string => (n === 0 ? '—' : `${((100 * h) / n).toFixed(1)}%`);
const sum = (a: number[]): number => a.reduce((x, y) => x + y, 0);
const dmg = (t: Tally): number => GP.guns.reduce((s, gun, i) => s + gun.damage * t.hits[i]!, 0) / SEEDS;
const v = hitRateModel.visibility;
const hm = hitRateModel.historical_mode;
const detectStopSmoke = enemyDetectRangeM((enemies.enemies.find((e) => e.id === ENEMY) as { detection?: { base_detect_m?: number } }).detection?.base_detect_m ?? 2000, v.speed_factor.stop, { visPlayerBaseM: v.vis_player_base_m, moonFactor: v.moon_factor.half, speedFactor: v.speed_factor, smokeFactor: v.smoke_factor, detectHoldS: v.detect_hold_s, detectionMultiplier: hm.enemy_detection_multiplier }, true);
console.log(`敵 ${ENEMY}・艇 ${rawBoat.id}・smoke_barrage ${JSON.stringify(BP)}・${SEEDS} 回 × ${STAY_S} 秒・砲 ${GP.guns.map((g) => `${g.id}×${g.count}`).join(' ')}`);
console.log(`止まった艇を煙の中で見つける距離（半月・史実 ×${hm.enemy_detection_multiplier}）≈ ${detectStopSmoke.toFixed(0)} m（この外では見失って ${v.detect_hold_s} 秒で撃たなくなる）`);
console.log(`| 距離 | 散布の半径 | 乱射 1 発（${GP.guns.map((g) => g.id).join(' / ')} / 全弾） | 照らした普段の 1 発（同じ順） | 乱射 ${STAY_S} 秒の当たり・HP | 照らした ${STAY_S} 秒の HP |`);
console.log('|---|---|---|---|---|---|');
for (const d of RANGES) {
  const a = zero();
  const l = zero();
  for (let s = 1; s <= SEEDS; s++) { blind(d, s, a); lit(d, s, l); }
  const R = barrageScatterM(BP, Math.hypot(d, STERN)); // 狙う点＝艇尾の後ろの煙（艇は艦から見て横向き）
  const per = (t: Tally): string => [...GP.guns.map((_g, i) => pct(t.hits[i]!, t.shots[i]!)), pct(sum(t.hits), sum(t.shots))].join(' / ');
  console.log(`| ${d} m | 約 ${R.toFixed(0)} m | ${per(a)} | ${per(l)} | ${(sum(a.hits) / SEEDS).toFixed(1)} 発・${dmg(a).toFixed(0)} HP | ${dmg(l).toFixed(0)} HP |`);
}
