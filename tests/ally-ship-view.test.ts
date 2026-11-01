// v0.6.9 S5a（spec-v069 §5.4・§4.9 V12）: 海の上の味方の輸送船の状態の行（ui/ally-ship-view の鍵・文・色の調子）と揚陸地点の帯の中心、Boot の揚陸の任務の検査（validateLandingMissions）。
// 鍵が同じなら文と色も同じ（entities/ally-ship は鍵が変わったときだけ setText）。% は 5% 刻み（1 夜に 20 回）、雷跡の秒は切り上げ、沈んだときの % は 1% 刻み。
// S6b: 字の置き場所（上 → 上が HUD に重なれば下 → 下も重なれば出さない・境で行き来しない）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { LANDING_PCT_LABEL_STEP, LANDING_WAKE_S_MAX } from '../src/config/landing-config';
import { validateLandingMissions } from '../src/config/landing-mission-data';
import { createLanding, createLandingWakes, hitLanding, tickLanding } from '../src/core/landing';
import { buildWorldSetup } from '../src/systems/world-setup';
import {
  SHIP_TEXT_ABOVE, SHIP_TEXT_BELOW, SHIP_TEXT_HIDDEN, SHIP_TONE_FRIENDLY, SHIP_TONE_SUNK, SHIP_TONE_WARN, allyShipLabelYs, allyShipLabelYsBelow, allyShipStatusKey, allyShipStatusText, allyShipStatusTone, allyShipTextPlace, landingMarkX,
} from '../src/ui/ally-ship-view';
import { landingHudRects } from '../src/ui/landing-markers';
import { RUDDER_HALF, speedHudRightX } from '../src/config/hud-layout-config';

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
  it('雷跡が走っている間（浮いている）は警告の「雷跡！ N 秒」（最接近までの体感秒の切り上げ。1 以上＝R14 A7・上限あり）', () => {
    const st = createLanding(P);
    tickLanding(st, P, 30);
    const w = { count: 3, cpaS: 11.2 };
    expect(view(allyShipStatusKey(st, w))).toEqual(['雷跡！ 12 秒', SHIP_TONE_WARN]);
    w.cpaS = 0;
    expect(view(allyShipStatusKey(st, w))).toEqual(['雷跡！ 1 秒', SHIP_TONE_WARN]);
    w.cpaS = 0.3;
    expect(allyShipStatusText(allyShipStatusKey(st, w))).toBe('雷跡！ 1 秒');
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

describe('ラベルと状態の行は船体の上（R14 A6: 浜は南。泊地は南の縁から 240 m で、下の字は画面の外や HUD の下に入った）', () => {
  it('ラベルの下端は外接の箱の上端から offset 上、状態の行の下端はその上（どちらも船体の中心より北）', () => {
    const ys = allyShipLabelYs(P.y, 40, 8, 26);
    expect(ys).toEqual({ labelY: P.y - 48, statusY: P.y - 74 });
    expect(ys.statusY).toBeLessThan(ys.labelY);
    expect(ys.labelY).toBeLessThan(P.y - 40);
  });
  it('entities/ally-ship は allyShipLabelYs で置き、origin の y は 1（下端）。S6b: 上が HUD に重なるときだけ allyShipLabelYsBelow（origin の y 0）へ、下も重なれば出さない', () => {
    const src = readFileSync(new URL('../src/entities/ally-ship.ts', import.meta.url), 'utf8');
    expect(src).toContain('allyShipLabelYs(p.y, halfY, ESCORT_LABEL_OFFSET_M, LANDING_STATUS_DY_M)');
    expect(src).toContain('allyShipLabelYsBelow(p.y, halfY, ESCORT_LABEL_OFFSET_M, LANDING_STATUS_DY_M)');
    expect(src.match(/\.setOrigin\(0\.5, 1\)/g)?.length).toBe(2);
    expect(src).not.toContain('p.y + halfY');
    // 毎フレームは箱を写して比べるだけ（確保・setText なし）。置き場所が変わったときだけ動かす
    const place = src.slice(src.indexOf('private placeText(): void {'), src.indexOf('/** 沈み始めた'));
    expect(place.length).toBeGreaterThan(100);
    for (const bad of ['new ', 'setText', 'scene.add', '`']) expect(place, bad).not.toContain(bad);
    expect(place).toContain('if (at === this.place) return;');
    expect(place).toContain('this.hud, LANDING_TEXT_HYST_PX,');
  });
});

describe('字が HUD に重なるとき（S6b。S6a-fix の報告: 南を向いて輸送船のそばにいると船が画面の上に来て、字が 2・3 行目とビルド番号に重なった）', () => {
  it('下に置くときは上の置き方の鏡: ラベルの上端は外接の箱の下端から offset 下、状態の行の上端はその statusDy 下', () => {
    expect(allyShipLabelYsBelow(P.y, 40, 8, 26)).toEqual({ labelY: P.y + 48, statusY: P.y + 74 });
  });
  const HUD = landingHudRects({ W: 1560, H: 720, topBandBottom: 170, has: { smoke: false, identify: false }, pause: { x: 60, y: 270, r: 36 }, stick: { x: 174, y: 546, r: 110 }, speedLeft: speedHudRightX(1560) - 2 * RUDDER_HALF - 8, speedTop: 580 });
  /** 船の中心の論理画面の y（ズーム z、外接の箱の半分 halfY m、字の高さ 24 px）から上・下の箱を作って置き場所を決める */
  const placeAt = (prev: number, sx: number, sy: number, z = 0.75, halfY = 40, hyst = 24): number => {
    const a = allyShipLabelYs(sy / z, halfY, 18, 26);
    const b = allyShipLabelYsBelow(sy / z, halfY, 18, 26);
    return allyShipTextPlace(prev, sx - 60, sx + 60, (a.statusY - 24) * z, a.labelY * z, b.labelY * z, (b.statusY + 24) * z, HUD, hyst);
  };
  it('海の真ん中は上、画面の上（S6a-fix の near-1: 船の中心 y ≈ 128）は下、船体が上の帯に入るほど上は出さない、右端の見張りのボタンの上と下は出さない', () => {
    expect(placeAt(SHIP_TEXT_ABOVE, 700, 400)).toBe(SHIP_TEXT_ABOVE);
    expect(placeAt(SHIP_TEXT_ABOVE, 1000, 128)).toBe(SHIP_TEXT_BELOW);
    expect(placeAt(SHIP_TEXT_ABOVE, 1000, 20)).toBe(SHIP_TEXT_HIDDEN); // 下の字も帯に入る（上の字は画面の上の外でも「重なる」）
    expect(placeAt(SHIP_TEXT_ABOVE, 1500, 300, 0.75, 20)).toBe(SHIP_TEXT_HIDDEN); // 上は消火、下は見張りのボタン
    expect(placeAt(SHIP_TEXT_ABOVE, 1500, 380, 0.75, 20)).toBe(SHIP_TEXT_BELOW); // 下は空いた識別の段（jp_04 には無い）
    expect(placeAt(SHIP_TEXT_ABOVE, 700, 760)).toBe(SHIP_TEXT_ABOVE); // 画面の下の外（見えない）は上のまま
    expect(placeAt(SHIP_TEXT_ABOVE, 200, 500)).toBe(SHIP_TEXT_HIDDEN); // スティックの台座
    expect(placeAt(SHIP_TEXT_ABOVE, 905, 700)).toBe(SHIP_TEXT_ABOVE); // 画面の下の真ん中（速力の表示の左。late-1 の t 48 は端の印の避ける角 W − 624 で消えていた）
    expect(placeAt(SHIP_TEXT_ABOVE, 1000, 650)).toBe(SHIP_TEXT_HIDDEN); // 速力の表示の上（上の字の下端 606・下の字の上端 694 がどちらも 580〜720 に入る）
    expect(placeAt(SHIP_TEXT_ABOVE, 1000, 620)).toBe(SHIP_TEXT_ABOVE); // 上の字の下端 576 は針路の文（588〜）の上 8 px より上
  });
  it('境で行き来しない: 良い方（上 > 下 > 出さない）へ移るのは hyst px 余分に空いてから、悪い方へは重なったらすぐ', () => {
    // 上の箱の上端 = y − (40 + 18 + 26 + 24) × 0.75 = y − 81 → 帯の下端 170 に触れない最小の y は 251、余分 24 px なら 275
    expect(placeAt(SHIP_TEXT_ABOVE, 700, 251)).toBe(SHIP_TEXT_ABOVE);
    expect(placeAt(SHIP_TEXT_ABOVE, 700, 250)).toBe(SHIP_TEXT_BELOW);
    expect(placeAt(SHIP_TEXT_BELOW, 700, 251)).toBe(SHIP_TEXT_BELOW);
    expect(placeAt(SHIP_TEXT_BELOW, 700, 274)).toBe(SHIP_TEXT_BELOW);
    expect(placeAt(SHIP_TEXT_BELOW, 700, 275)).toBe(SHIP_TEXT_ABOVE);
    // 下の箱の上端 = y + (40 + 18) × 0.75 = y + 43.5 → 帯に触れない最小の y は 126.5、出さないからは 150.5
    expect(placeAt(SHIP_TEXT_BELOW, 700, 127)).toBe(SHIP_TEXT_BELOW);
    expect(placeAt(SHIP_TEXT_BELOW, 700, 126)).toBe(SHIP_TEXT_HIDDEN);
    expect(placeAt(SHIP_TEXT_HIDDEN, 700, 150)).toBe(SHIP_TEXT_HIDDEN);
    expect(placeAt(SHIP_TEXT_HIDDEN, 700, 151)).toBe(SHIP_TEXT_BELOW);
    expect(placeAt(SHIP_TEXT_HIDDEN, 1500, 300, 0.75, 20)).toBe(SHIP_TEXT_HIDDEN);
    for (let y = -200; y <= 900; y += 7) for (const prev of [SHIP_TEXT_ABOVE, SHIP_TEXT_BELOW, SHIP_TEXT_HIDDEN]) {
      const at = placeAt(prev, 700, y);
      expect(placeAt(at, 700, y), `${prev} ${y}`).toBe(at); // 同じ画面なら次のフレームも同じ
    }
  });
});

