// 回避パラメータの感度を見るオフライン模擬（Phaser 非依存。src/core と data だけを使う）。
// 静止した艇が見越し角どおりに 1 本（または扇 4 本）撃ち、雷跡回避・発見・体当たりをする駆逐艦に当たるかを、
// 艦の左正横〜艦首〜右正横の 13 方位 × 距離帯で数える。enemies.json / hit_rate_model.json を変えたらこれで当たりを取る（KPI 本番は Result の集計）。
// 実行: npx esbuild scripts/evade-sim.ts --bundle --platform=node --format=esm --outfile=/tmp/evade-sim.mjs && node /tmp/evade-sim.mjs
import enemies from '../data/enemies.json';
import torpedoes from '../data/torpedoes.json';
import { createShipAiState, shipAiParamsFromData, steerShip, turnRateFor, updateShipAi, isEnemyAiDataRecord } from '../src/core/ship-ai';
import { createTorpedoState, launchTorpedo, stepTorpedo, torpedoParamsFromData, isArmed, isTorpedoDataRecord } from '../src/core/torpedo';
import { createCircles, fillHullCircles, pointHitsHull, interceptHeadingDeg, velocityFromHeading } from '../src/core/torpedo-solver';
import { fillSalvoHeadings } from '../src/core/salvo';
import { ktToMps } from '../src/core/units';

const raw: unknown = enemies.enemies.find((e) => e.id === 'ijn_destroyer');
if (!isEnemyAiDataRecord(raw)) throw new Error('enemy');
const REC = raw; // 絞り込んだ型を関数の中でも使う
const trec: unknown = torpedoes.torpedoes.find((t) => t.id === 'us_mk8');
if (!isTorpedoDataRecord(trec)) throw new Error('torp');
const TP = torpedoParamsFromData(trec, 100, 6);
const TIME_SCALE = 5;
const DT = (1 / 60) * TIME_SCALE;

function run(rangeM: number, bearingFromShipDeg: number, reactionRealS: number, wakeDetectM: number, spreadDeg: number, count: number, detectM: number): boolean {
  const p = shipAiParamsFromData(REC);
  if (process.env['TURN']) p.turnRateDegS = Number(process.env['TURN']);
  if (process.env['EVADE_TURN']) p.evadeTurnRateDegS = Number(process.env['EVADE_TURN']);
  p.reactionDelayS = reactionRealS;
  p.torpedoWakeDetectM = wakeDetectM;
  // 艦: 原点、東へ 25kt。艇: 艦から見て bearing 方向に rangeM
  const C = 5e6; // 海域中央（端の向き直しが働かないように）
  const ship = { x: C, y: C, headingDeg: 90, speedMps: ktToMps(25) };
  const b = (bearingFromShipDeg * Math.PI) / 180;
  const boat = { x: C + Math.sin(b) * rangeM, y: C - Math.cos(b) * rangeM, headingDeg: 0, speedMps: 0 };
  const vel = { x: 0, y: 0 };
  velocityFromHeading(ship.headingDeg, ship.speedMps, vel);
  const aim = interceptHeadingDeg(boat.x, boat.y, TP.speedMps, ship.x, ship.y, vel.x, vel.y);
  if (aim === null) throw new Error('no intercept');
  const headings: number[] = new Array(count).fill(0);
  fillSalvoHeadings(aim, count, spreadDeg, headings);
  const torps = headings.map((h) => { const s = createTorpedoState(); launchTorpedo(s, boat.x, boat.y, h, false, false, 0, rangeM, 25); return s; });
  const ai = createShipAiState(ship.headingDeg, p.cruiseSpeedMps);
  const hull = createCircles(5);
  const far = { x: 1e6, y: 1e6, headingDeg: 0, speedMps: 0 };
  const bounds = { width: 1e7, height: 1e7 };
  for (let step = 0; step < 60 * 60 * 5; step++) {
    updateShipAi(ai, ship, detectM > 0 ? boat : far, detectM, 8, torps, p, bounds, DT / TIME_SCALE);
    steerShip(ship, ai.desiredHeadingDeg, ai.desiredSpeedMps, turnRateFor(ai.mode, p), p.accelMps2, DT);
    fillHullCircles(hull, ship.x, ship.y, ship.headingDeg, 118, 10.8);
    let anyActive = false;
    for (const t of torps) {
      if (!t.active) continue;
      anyActive = true;
      stepTorpedo(t, TP, DT, DT / TIME_SCALE);
      if (isArmed(t, TP) && pointHitsHull(t.x, t.y, hull)) return true;
      if (t.runM > rangeM * 2 + 1000) t.active = false;
    }
    if (!anyActive) return false;
  }
  return false;
}

const rows: string[] = [];
// 既定は data の値。環境変数 REACT / WAKE / TURN / EVADE_TURN で上書きして感度を見る
const REACT = Number(process.env['REACT'] ?? REC.detection.reaction_delay_s);
const WAKE = Number(process.env['WAKE'] ?? REC.detection.torpedo_wake_detect_m);
// 艇は艦の前方半円〜正横（0=左正横, 90=艦首正面, 180=右正横）。15° 刻み 13 方位
const BEARINGS = Array.from({ length: 13 }, (_, i) => i * 15);
for (const detect of [0, 1000]) {
  const cells: string[] = [];
  for (const range of [350, 450, 730, 1000, 1400]) {
    let hit = 0, fan = 0;
    for (const bg of BEARINGS) if (run(range, bg, REACT, WAKE, 0, 1, detect)) hit++;
    for (const bg of BEARINGS) if (run(range, bg, REACT, WAKE, 8, 4, detect)) fan++;
    cells.push(`${range}m 単発 ${Math.round((hit / BEARINGS.length) * 100)}% 扇4(8°) ${Math.round((fan / BEARINGS.length) * 100)}%`);
  }
  rows.push(`[wake ${WAKE}m, react ${REACT}s, turn ${process.env['TURN'] ?? REC.turn_rate_deg_s}/${process.env['EVADE_TURN'] ?? REC.evasion.evade_turn_rate_deg_s}] ${detect > 0 ? '発見あり（停止 1,000m）＋体当たり' : '発見なし（回避のみ）'}: ` + cells.join(' | '));
}
console.log(rows.join('\n'));
