// v0.8.0 S1（spec-v0800 §3.2 D-R1〜D-R12・§3.5・§5.2・§7、lead の L6・L7）: core/radar の規則を us_04 の setup の値（so_early: 艦 4,000・小さい艇 1,200・掃引 3 秒・
// 陸の反射 400・丸め 50）と両岸で確かめる: 射程の縁 ±1 m・小さい艇・陸の反射の帯と水道の切れ目・丸めと同じ格子・掃引の刻み（間は輝点が動かない）・機は映らない・
// 沈み始めた艦と海域の外の艦は次の掃引で消える・固定長 16（近い順）・決定性・出来事（最初の接触・増えた・減った）・一番近い接触の距離・輝点の記録の鍵（位置だけ）・
// 隠れた状態を読まない（import と名前）・step の本体に確保なし・S1 ではゲームの誰も import しない（束はバイトで同じ）。S2 からは import する所を固定（世界・絵・テレメトリだけ）。
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { getPrototypeMission } from '../src/config/mission-data';
import { getRadarData, getRadarParams } from '../src/config/radar-mission-data';
import {
  RADAR_BLIP_CAPACITY, RADAR_KIND_AIR, RADAR_KIND_SHIP, RADAR_KIND_SMALL,
  createRadarState, createRadarTargets, radarAge01, radarSweepDue, stepRadar, type RadarGeometry, type RadarState,
} from '../src/core/radar';
import { radarParamsFromData, type RadarParams } from '../src/core/radar-data';
import { landLinesFromShores } from '../src/core/strait-geometry';
import { buildWorldSetup } from '../src/systems/world-setup';
import { code, imports, scanAllocations } from './core-rules-kit';
import { SRC } from './sfx-rules-kit';

const FILE = 'src/core/radar.ts';
const us04 = buildWorldSetup(gameData, 'us_04', {});
const P: RadarParams = us04.radar!;
const { width: W, height: H } = us04.mission.bounds;
const GEO: RadarGeometry = { width: W, height: H, land: landLinesFromShores(us04.shores!, W, H) };
const OPEN: RadarGeometry = { width: W, height: H, land: [] };
type Tgt = readonly [x: number, y: number, kind?: number, afloat?: number];
const TG = createRadarTargets(32);

/** 1 回の掃引（呼ぶ側の写し: 掃引の時だけ TG を書く）。戻りは stepRadar の値 */
function sweep(s: RadarState, list: readonly Tgt[], nowS: number, from: readonly [number, number] = [3000, 2000], p: RadarParams = P, geo: RadarGeometry = OPEN): boolean {
  if (!radarSweepDue(s, nowS)) return stepRadar(s, p, geo, nowS, from[0], from[1], TG);
  TG.n = list.length;
  list.forEach(([x, y, k = RADAR_KIND_SHIP, a = 1], i) => {
    TG.x[i] = x;
    TG.y[i] = y;
    TG.kind[i] = k;
    TG.afloat[i] = a;
  });
  return stepRadar(s, p, geo, nowS, from[0], from[1], TG);
}
const once = (list: readonly Tgt[], from?: readonly [number, number], p?: RadarParams, geo?: RadarGeometry): number[][] => {
  const s = createRadarState();
  sweep(s, list, 0, from, p, geo);
  return s.blips.slice(0, s.n).map((b) => [b.x, b.y]);
};

describe('us_04 のレーダーの値（setup。so_early・分隊の先頭の艇）', () => {
  it('艦 4,000・小さい艇 1,200（2 乗も）・掃引 3 秒・陸の反射 400・丸め 50・機は映さない', () => {
    expect([P.model, P.fit, P.shipRangeM, P.shipRange2, P.smallRangeM, P.smallRange2, P.sweepS, P.landClutterM, P.positionStepM, P.aircraft]).toEqual(['so_early', 'leader', 4000, 16e6, 1200, 1.44e6, 3, 400, 50, false]);
    expect(getRadarParams(gameData, getPrototypeMission(gameData, 'us_04', true))).toEqual(P);
  });
});

describe('映る物・映らない物（1 回の掃引）', () => {
  it('射程の縁 ±1 m（境界は映る）: 艦は 4,000 m・小さい艇は 1,200 m（小さい艇でない物は艦の射程）', () => {
    const n = (t: Tgt): number => once([t], [100, 100]).length;
    expect([n([4099, 100]), n([4100, 100]), n([4101, 100]), n([2500, 3299]), n([2500, 3301])]).toEqual([1, 1, 0, 1, 0]); // 斜め: 3,999.2 m・4,000.8 m
    expect([n([1299, 100, RADAR_KIND_SMALL]), n([1300, 100, RADAR_KIND_SMALL]), n([1301, 100, RADAR_KIND_SMALL]), n([1301, 100, RADAR_KIND_SHIP])]).toEqual([1, 1, 0, 1]);
  });
  it('陸の反射（400 m の内は映らない。境界は映る）: 北の岸・南の岸・水道の切れ目の中ほどは映り、切れ目の端（岸の角）の近くは映らない。反射 0 の型なら岸のすぐそばも映る', () => {
    const cases: [Tgt, boolean][] = [
      [[3000, 399], false], [[3000, 400], true], [[3000, 401], true],
      [[3000, 3601], false], [[3000, 3600], true], [[3000, 3599], true],
      [[1300, 3900], true], [[750, 3900], false], [[1850, 3950], false], [[650, 3700], false],
    ];
    for (const [t, shown] of cases) expect(once([t], [3000, 2000], P, GEO).length, String(t)).toBe(shown ? 1 : 0);
    expect(once([[3000, 1]], [3000, 2000], { ...P, landClutterM: 0 }, GEO)).toEqual([[3000, 0]]);
  });
  it('機は映らない（aircraft false）。小さい艇・艦は映る。aircraft が真の型（v0.9 の候補）なら艦の射程で映る', () => {
    expect(once([[3500, 2000, RADAR_KIND_AIR], [3600, 2000, RADAR_KIND_SMALL], [3700, 2000]])).toEqual([[3600, 2000], [3700, 2000]]);
    expect(once([[3500, 2000, RADAR_KIND_AIR]], [3000, 2000], { ...P, aircraft: true })).toEqual([[3500, 2000]]);
  });
  it('沈み始めた艦（afloat 0）と海域の外の艦は映らない。縁の上は映る。位置が NaN（艦でも自艇でも）なら映さない', () => {
    expect(once([[3500, 2000, RADAR_KIND_SHIP, 0], [W + 1, 2000], [-1, 2000], [3000, H + 1], [3000, -1], [W, 2000], [3000, H]], [3000, 2000], P, OPEN)).toEqual([[3000, H], [W, 2000]]);
    expect([once([[NaN, 2000], [3000, NaN]]), once([[3500, 2000]], [NaN, 2000])]).toEqual([[], []]);
  });
  it('丸め（position_step_m の格子・半分は切り上げ）と同じ格子は 1 つ。1944 年の型（so_late）は 25 m', () => {
    expect(once([[3234, 2345], [3224.9, 2324.9]])).toEqual([[3200, 2300], [3250, 2350]]);
    expect(once([[3225, 2325]])).toEqual([[3250, 2350]]);
    expect(once([[3260, 2360], [3270, 2340], [3240, 2330]]).length).toBe(1);
    const late = radarParamsFromData(getRadarData(gameData).models['so_late']!, { model: 'so_late', fit: 'own', source: 'design (tests)' }, false);
    expect(late.positionStepM).toBe(25);
    expect(once([[3234, 2345]], [3000, 2000], late)).toEqual([[3225, 2350]]);
  });
  it('固定長 16: 映る物が 20 あれば自艇から近い順の 16（入れる順に依らない）。使わない枠は NaN', () => {
    const ships: Tgt[] = Array.from({ length: 20 }, (_, k) => [3000 + 100 * (k + 1), 2000] as const);
    for (const list of [ships, [...ships].reverse()]) {
      const s = createRadarState();
      sweep(s, list, 0);
      expect(s.n).toBe(RADAR_BLIP_CAPACITY);
      expect(s.blips.map((b) => b.x)).toEqual(Array.from({ length: 16 }, (_, k) => 3000 + 100 * (k + 1)));
      expect(s.nearestM).toBe(100);
    }
    const s = createRadarState();
    sweep(s, [[3200, 2000], [3100, 2000]], 0);
    expect([s.n, s.blips[2]!.x, s.blips[2]!.y, s.blips[2]!.atS, s.blips[15]!.x]).toEqual([2, NaN, NaN, NaN, NaN]);
  });
});

describe('掃引の刻み（固定ステップの時計）', () => {
  it('最初のステップで 1 回、以後 3 秒の倍数ごと。間は何もしない（艦が動いても輝点は動かない）。輝点の秒は掃引の秒', () => {
    const s = createRadarState();
    const swept: number[] = [];
    let now = 0;
    for (let k = 1; k <= 1800; k++) {
      now += 1 / 60;
      const before = JSON.stringify(s);
      const due = radarSweepDue(s, now);
      const did = sweep(s, [[1000 + k, 2000]], now, [3000, 2000]);
      expect(did).toBe(due);
      if (did) {
        swept.push(k);
        expect([s.blips[0]!.x, s.blips[0]!.atS, s.lastSweepS, s.sweeps]).toEqual([Math.round((1000 + k) / 50) * 50, now, now, swept.length]);
      } else expect(JSON.stringify(s)).toBe(before);
    }
    expect(swept).toEqual([1, ...Array.from({ length: 10 }, (_, i) => 180 * (i + 1))]);
  });
  it('薄れの進み radarAge01: 掃引の秒で 0・半分で 0.5・次の掃引の秒から 1（使っていない枠は NaN）', () => {
    expect([radarAge01(3, 3, 3), radarAge01(3, 4.5, 3), radarAge01(3, 6, 3), radarAge01(3, 9, 3), radarAge01(3, 2, 3)]).toEqual([0, 0.5, 1, 1, 0]);
    expect(radarAge01(NaN, 3, 3)).toBeNaN();
  });
  it('沈み始めた艦・海域の外へ出た艦は次の掃引で消える（それまでは前の輝点のまま）', () => {
    for (const gone of [[3500, 2000, RADAR_KIND_SHIP, 0], [W + 10, 2000]] as const) {
      const s = createRadarState();
      sweep(s, [[3500, 2000], [3600, 2100]], 0);
      expect(sweep(s, [gone, [3600, 2100]], 1.5)).toBe(false);
      expect(s.n).toBe(2);
      expect(sweep(s, [gone, [3600, 2100]], 3)).toBe(true);
      expect([s.n, s.lostCount, s.lostX, s.lostY]).toEqual([1, 1, 3500, 2000]);
    }
  });
  it('同じ入力で同じ輝点と出来事（決定性）', () => {
    const night = (): string => {
      const s = createRadarState();
      for (let t = 0; t <= 60; t += 0.5) sweep(s, [[1000 + 20 * t, 1500], [5000 - 15 * t, 2300], [3000, 3000 - 30 * t, RADAR_KIND_SMALL]], t, [3600, 2600], P, GEO);
      return JSON.stringify(s);
    };
    expect(night()).toBe(night());
  });
});

describe('出来事（数えて残す。HUD の 2 行目・Result は S4）', () => {
  it('最初の接触 → 同じ数（なし）→ 増えた（前の輝点から一番遠い物）→ 減った（今の輝点から一番遠い前の物）→ 0 → また 1 は増えた', () => {
    const s = createRadarState();
    const ev = (): number[] => [s.n, s.firstS, s.newCount, s.newX, s.newY, s.lostCount, s.lostX, s.lostY];
    sweep(s, [], 0);
    expect(ev()).toEqual([0, NaN, 0, NaN, NaN, 0, NaN, NaN]);
    sweep(s, [[4000, 2000], [3500, 2500]], 3, [3010, 2020]);
    expect([s.firstS, s.firstX, s.firstY, s.firstFromX, s.firstFromY, s.newCount]).toEqual([3, 3500, 2500, 3010, 2020, 0]);
    expect(s.nearestM).toBeCloseTo(Math.hypot(490, 480), 9);
    sweep(s, [[4060, 2000], [3500, 2560]], 6);
    expect(ev()).toEqual([2, 3, 0, NaN, NaN, 0, NaN, NaN]);
    sweep(s, [[4100, 2000], [3500, 2600], [1000, 1000]], 9);
    expect(ev()).toEqual([3, 3, 1, 1000, 1000, 0, NaN, NaN]);
    sweep(s, [[4150, 2000], [1000, 1050]], 12);
    expect(ev()).toEqual([2, 3, 1, 1000, 1000, 1, 3500, 2600]);
    sweep(s, [], 15);
    expect([s.n, s.lostCount, s.nearestM]).toEqual([0, 2, NaN]);
    sweep(s, [[5000, 2000]], 18);
    expect([s.newCount, s.newX, s.newY, s.firstS]).toEqual([2, 5000, 2000, 3]);
  });
});

describe('輝点の記録は位置だけ・隠れた状態を読まない・確保しない（L6・L7・§7）', () => {
  const body = (name: string): string => code(FILE).match(new RegExp(`export interface ${name} \\{([^}]*)\\}`))![1]!;
  const fields = (name: string): string[] => [...body(name).matchAll(/(?:readonly\s+)?(\w+)\s*:/g)].map((m) => m[1]!);
  it('RadarBlip の鍵はちょうど x・y・atS（型の source と、作った 16 の枠の両方）。RadarTargets は n・x・y・kind・afloat。状態にも種類・針路・速さ・発見の欄は無い', () => {
    expect(fields('RadarBlip')).toEqual(['x', 'y', 'atS']);
    const s = createRadarState();
    sweep(s, [[3500, 2000, RADAR_KIND_SMALL]], 0);
    expect(s.blips.length).toBe(RADAR_BLIP_CAPACITY);
    for (const b of s.blips) expect(Object.keys(b).sort()).toEqual(['atS', 'x', 'y']);
    expect(fields('RadarTargets')).toEqual(['n', 'x', 'y', 'kind', 'afloat']);
    const st = fields('RadarState');
    expect(st).toEqual(['blips', 'n', 'nextSweepS', 'sweeps', 'lastSweepS', 'fromX', 'fromY', 'nearestM', 'firstS', 'firstX', 'firstY', 'firstFromX', 'firstFromY', 'newCount', 'newX', 'newY', 'lostCount', 'lostX', 'lostY', 'prevN', 'prevX', 'prevY', 'd2']);
    expect(Object.keys(s).sort()).toEqual([...st].sort());
    for (const f of st) expect(f, f).not.toMatch(/kind|heading|speed|sight|detect|vis|mode|ai[A-Z]|id$/i);
  });
  it('import は radar-data（型だけ）と strait-geometry だけ。発見・視程・AI・見越し点・乱数の名前を読まない', () => {
    const s = code(FILE);
    expect(imports(s)).toEqual(['./radar-data', './strait-geometry']);
    expect(s).toContain("import type { RadarParams } from './radar-data';");
    expect(s).not.toMatch(/\b(enemySighted|detectRangeM?|visRange2?|playerDetected|sighted|setSighted|lookout\w*|illuminated|hiddenBySmoke|ai|mode|aimMarker|marker|Math\.random|SeededRng|rng)\b/);
  });
  it('作る関数のほかは本体に確保の形が無い。平方根は stepRadar の 1 本だけ（一番近い接触の距離）・hypot と atan2 なし', () => {
    const { names, bad } = scanAllocations(FILE, ['createRadarState', 'createRadarTargets']);
    expect(names).toEqual(['createRadarState', 'createRadarTargets', 'insertBlip', 'lostBlip', 'newestBlip', 'radarAge01', 'radarSweepDue', 'stepRadar']);
    expect(bad).toEqual([]);
    const s = code(FILE);
    expect(s.match(/Math\.sqrt\(/g)!.length).toBe(1);
    expect(s).not.toMatch(/Math\.(hypot|atan2)\b/);
  });
  it('S2 から: core/radar を import するのはレーダーの世界・絵・テレメトリ、core/ship-transit は列の通過の世界とテレメトリ、core/strait-geometry は core/radar とレーダーの世界だけ（S1 は誰も import しなかった）。S3 から迎撃の模擬（ゲームの束に入らない＝scripts と tests だけが import する）も', () => {
    const importers = (name: string): string[] => SRC.filter((f) => imports(code(f)).some((p) => p.endsWith(`/${name}`))).sort();
    expect(importers('radar')).toEqual(['src/core/intercept-sim-policy.ts', 'src/core/intercept-sim-tracks.ts', 'src/core/intercept-sim-world.ts', 'src/core/intercept-sim.ts', 'src/systems/radar-telemetry.ts', 'src/systems/radar-view.ts', 'src/systems/world-radar.ts']);
    expect(importers('ship-transit')).toEqual(['src/core/intercept-sim-world.ts', 'src/core/intercept-sim.ts', 'src/systems/destroyer-transit.ts', 'src/systems/transit-telemetry.ts']);
    expect(importers('strait-geometry')).toEqual(['src/core/radar.ts', 'src/systems/intercept-sim-setup.ts', 'src/systems/world-radar.ts']);
  });
});
