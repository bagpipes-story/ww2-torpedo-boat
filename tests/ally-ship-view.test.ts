// v0.6.9 S5a（spec-v069 §5.4・§4.9 V12）: 海の上の味方の輸送船の状態の行（ui/ally-ship-view の鍵・文・色の調子）と揚陸地点の帯の中心、Boot の揚陸の任務の検査（validateLandingMissions）。
// 鍵が同じなら文と色も同じ（entities/ally-ship は鍵が変わったときだけ setText）。% は 5% 刻み（1 夜に 20 回）、雷跡の秒は切り上げ、沈んだときの % は 1% 刻み。
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { LANDING_PCT_LABEL_STEP, LANDING_WAKE_S_MAX } from '../src/config/landing-config';
import { validateLandingMissions } from '../src/config/landing-mission-data';
import { createLanding, createLandingWakes, hitLanding, tickLanding } from '../src/core/landing';
import { buildWorldSetup } from '../src/systems/world-setup';
import { SHIP_TONE_FRIENDLY, SHIP_TONE_SUNK, SHIP_TONE_WARN, allyShipStatusKey, allyShipStatusText, allyShipStatusTone, landingMarkX } from '../src/ui/ally-ship-view';

const S = buildWorldSetup(gameData, 'jp_04', {});
const P = S.landing!.params;
const view = (key: number): [string, number] => [allyShipStatusText(key), allyShipStatusTone(key)];

describe('輸送船の状態の行（ui/ally-ship-view）', () => {
  it('揚陸中は 5% 刻みの「揚陸 N%」（1 夜に 20 回だけ変わる）、被雷の後は「被雷 1 ・ 揚陸 N%」、揚陸完了は「揚陸完了」', () => {
    const st = createLanding(P);
    const w = createLandingWakes();
    const seen = new Set<number>();
    for (let t = 0; t < P.unloadS; t += 0.25) {
      tickLanding(st, P, t);
      seen.add(allyShipStatusKey(st, w));
    }
    expect(LANDING_PCT_LABEL_STEP).toBe(5);
    expect(seen.size).toBe(20);
    const s2 = createLanding(P);
    tickLanding(s2, P, P.unloadS * 0.47);
    expect(view(allyShipStatusKey(s2, w))).toEqual(['揚陸 45%', SHIP_TONE_FRIENDLY]);
    hitLanding(s2, P, 70);
    tickLanding(s2, P, P.unloadS * 0.56);
    expect(view(allyShipStatusKey(s2, w))).toEqual(['被雷 1 ・ 揚陸 55%', SHIP_TONE_FRIENDLY]);
    tickLanding(s2, P, P.unloadS);
    expect(view(allyShipStatusKey(s2, w))).toEqual(['揚陸完了', SHIP_TONE_FRIENDLY]);
  });
  it('雷跡が走っている間（浮いている）は警告の「雷跡！ N 秒」（最接近までの体感秒の切り上げ。上限あり）', () => {
    const st = createLanding(P);
    tickLanding(st, P, 30);
    const w = { count: 3, cpaS: 11.2 };
    expect(view(allyShipStatusKey(st, w))).toEqual(['雷跡！ 12 秒', SHIP_TONE_WARN]);
    w.cpaS = 0;
    expect(view(allyShipStatusKey(st, w))).toEqual(['雷跡！ 0 秒', SHIP_TONE_WARN]);
    w.cpaS = 1e6;
    expect(allyShipStatusText(allyShipStatusKey(st, w))).toBe(`雷跡！ ${LANDING_WAKE_S_MAX} 秒`);
  });
  it('沈んだら灰色の「沈没（揚陸 N%）」（1% 刻み・雷跡より先）、揚陸の後に沈んだら「沈没（揚陸完了）」', () => {
    const st = createLanding(P);
    tickLanding(st, P, P.unloadS * 0.625);
    for (let k = 0; k < P.hitsToSink; k++) hitLanding(st, P, 90);
    expect(view(allyShipStatusKey(st, { count: 2, cpaS: 5 }))).toEqual(['沈没（揚陸 62%）', SHIP_TONE_SUNK]);
    const sd = createLanding(P);
    tickLanding(sd, P, P.unloadS);
    for (let k = 0; k < P.hitsToSink; k++) hitLanding(sd, P, 150);
    expect(view(allyShipStatusKey(sd, createLandingWakes()))).toEqual(['沈没（揚陸完了）', SHIP_TONE_SUNK]);
  });
  it('鍵と文・色は 1 対 1（鍵が変われば文か色が変わる＝無駄な setText をしない）', () => {
    const keys = new Map<string, number>();
    const st = createLanding(P);
    const w = createLandingWakes();
    for (let t = 0; t <= P.unloadS; t += 0.5) {
      tickLanding(st, P, t);
      for (const wk of [w, { count: 1, cpaS: (t % 13) + 0.3 }]) {
        const k = allyShipStatusKey(st, wk);
        const txt = `${allyShipStatusText(k)}|${allyShipStatusTone(k)}`;
        if (keys.has(txt)) expect(keys.get(txt)).toBe(k);
        keys.set(txt, k);
      }
      if (t === 60) hitLanding(st, P, t);
    }
    expect(keys.size).toBeGreaterThan(30);
  });
});

describe('揚陸地点の帯（landingMarkX）と Boot の検査（validateLandingMissions）', () => {
  it('jp_04: 艇首 135° の先が浜の線（南の縁）に届く x を中心に。浜を向かない艇首は泊地の真南、海域の幅に収める', () => {
    const h = S.mission.bounds.height;
    expect(landingMarkX(P, h, S.mission.bounds.width)).toBeCloseTo(P.x + (h - P.y), 6);
    expect(landingMarkX({ x: 3000, y: 2760, headingDeg: 180 }, h, 6000)).toBeCloseTo(3000, 6);
    expect(landingMarkX({ x: 3000, y: 2760, headingDeg: 45 }, h, 6000)).toBe(3000);
    expect(landingMarkX({ x: 5900, y: 100, headingDeg: 100 }, h, 6000)).toBe(6000);
  });
  it('全任務（jp_04 のノーマルとハード）で投げず、最初の揚陸の任務の輸送船の寸法を返す。V12: 艇に煙幕があれば投げる', () => {
    const p = validateLandingMissions(gameData, gameData.hitRateModel.world.time_scale);
    expect(p).not.toBeNull();
    expect([p!.shipId, p!.lengthM, p!.beamM]).toEqual(['ijn_transport', P.lengthM, P.beamM]);
    const boats = gameData.boats.boats.map((b) => (b.id === 'jp_t38' ? { ...b, smoke_generator: true } : b));
    const bad = { ...gameData, boats: { ...gameData.boats, boats } } as typeof gameData;
    expect(() => validateLandingMissions(bad, gameData.hitRateModel.world.time_scale)).toThrow(/jp_04\.v0_1_prototype\.landing: 艇（jp_t38）は smoke_generator false/);
    const none = { ...gameData, missionsSeed: { ...gameData.missionsSeed, missions: gameData.missionsSeed.missions.filter((m) => m.id !== 'jp_04') } } as typeof gameData;
    expect(validateLandingMissions(none, gameData.hitRateModel.world.time_scale)).toBeNull();
  });
  it('Boot（scenes/boot-scene）は米PT の絵の後に validateLandingMissions を 1 回呼び、揚陸の任務があれば味方の輸送船の絵を作る', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../src/scenes/boot-scene.ts', import.meta.url), 'utf8');
    const a = src.indexOf('generatePtBoatTexture(this,');
    const b = src.indexOf('const landing = validateLandingMissions(gameData, gameData.hitRateModel.world.time_scale);');
    const c = src.indexOf('if (landing) generateFriendlyTransportTexture(this, { lengthUnits: landing.lengthM * spriteScale, beamUnits: landing.beamM * spriteScale });');
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });
});
