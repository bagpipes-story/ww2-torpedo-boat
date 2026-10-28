// v0.6.9 S5b（spec-v069 D15・§5・L6）: 揚陸のテレメトリ（systems/landing-telemetry）。jp_04 の値の世界（core の本物の状態: 揚陸・雷撃の数え・米PT の隊）で、
// 出撃時の値・揚陸の時計・見張りの報告（遠い・近い・向き・斉射の残り・決着の後は無し）・雷跡・撃てる隻数・出来事（通し番号が変わったときだけ写す・8 方位）を見る。
// 揚陸の無い世界（w.landing が null）は tests/landing-neutral。配線（createTelemetry・refreshTelemetry）の pin は tests/landing-step-order。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { PT_SHELL_POOL_SIZE } from '../src/config/pt-config';
import {
  createLanding, createLandingReport, createLandingTelemetry, createLandingWakes, hitLanding, landingDirIdx, landingEvent, landingReport, tickLanding,
  LANDING_REPORT_FAR, LANDING_REPORT_NEAR, LANDING_REPORT_NONE, LD_DONE, LD_SUNK, LD_UNLOADING, LE_CALM, LE_DONE, LE_HIT, LE_NONE,
} from '../src/core/landing';
import { createPtSection, PT_ALERT, PT_FATE_SUNK, PT_LEAVE, PT_PATROL } from '../src/core/pt-boats';
import { createPtTorpedoState } from '../src/core/pt-torpedo';
import { degToRad } from '../src/core/units';
import { initLandingTelemetry, refreshLandingTelemetry, type LandingTelemetryWorld } from '../src/systems/landing-telemetry';
import { buildWorldSetup } from '../src/systems/world-setup';

const S04 = buildWorldSetup(gameData, 'jp_04');
const LD = S04.landing!;

type W = { -readonly [K in keyof LandingTelemetryWorld]: LandingTelemetryWorld[K] } & {
  landing: NonNullable<LandingTelemetryWorld['landing']> & { state: ReturnType<typeof createLanding>; tst: ReturnType<typeof createPtTorpedoState>; wakes: ReturnType<typeof createLandingWakes> };
  pts: { section: ReturnType<typeof createPtSection> };
};

/** 出撃時の jp_04（揚陸・雷撃の状態・雷跡・米PT の隊は core の本物。自艇は出発点に止まる） */
function world(): W {
  const section = createPtSection(S04.ptBoats!, PT_SHELL_POOL_SIZE);
  return {
    landing: { state: createLanding(LD.params), tst: createPtTorpedoState(section.boats.length, LD.torpedo.n), wakes: createLandingWakes(), p: LD.params, tp: LD.torpedo },
    pts: { section },
    boat: { state: { ...S04.playerStart, speedMps: 0 } },
    stepTimeS: 0,
    visRange2: S04.visRange2,
  };
}
/** i 隻目の PT を輸送船から方位 brg・d m に、艇首 hd で置く（哨戒のまま） */
function place(w: W, i: number, brg: number, d: number, hd: number): void {
  const b = w.pts.section.boats[i]!;
  const p = w.landing.p;
  b.x = p.x + Math.sin(degToRad(brg)) * d;
  b.y = p.y - Math.cos(degToRad(brg)) * d;
  b.headingDeg = hd;
}

describe('揚陸のテレメトリ（systems/landing-telemetry）', () => {
  it('出撃時（initLandingTelemetry）: enabled・揚陸 140 秒・2 本で沈む・1 斉射 3 本・2 隻・北と東・慌てる 1300 m、揚陸中で報告なし（出発点は見張りの外）・輸送船への相対位置', () => {
    const w = world();
    const t = initLandingTelemetry(w);
    expect(t.enabled).toBe(true);
    expect([t.unloadS, t.hitsToSink, t.salvoCount, t.total, t.fromDirsJa, t.hurriedM]).toEqual([LD.params.unloadS, LD.params.hitsToSink, LD.torpedo.n, 2, '北と東', LD.torpedo.hurriedM]);
    expect([t.unloadS, t.hitsToSink, t.salvoCount, t.hurriedM]).toEqual([140, 2, 3, 1300]);
    expect([t.phase, t.resolved, t.pct, t.leftS, t.hits, t.duds, t.sinking, t.sunkAfterDone, t.armed, t.salvos, t.fired]).toEqual([LD_UNLOADING, false, 0, 140, 0, 0, false, false, 2, 0, 0]);
    expect([t.reportSub, t.reportI, t.reportStep, t.reportSighted]).toEqual([LANDING_REPORT_NONE, -1, 0, false]);
    expect(t.reportDx).toBeNaN();
    expect([t.wakes, t.eventSeq, t.eventKind, t.eventBoat]).toEqual([0, 0, LE_NONE, -1]);
    expect(t.shipDx).toBe(LD.params.x - S04.playerStart.x);
    expect(t.shipDy).toBe(LD.params.y - S04.playerStart.y);
    expect(t.shipDistM).toBeCloseTo(Math.hypot(t.shipDx, t.shipDy), 9);
    // 鍵の集合は createLandingTelemetry と同じ（毎フレーム鍵を足さない）
    expect(Object.keys(t).sort()).toEqual(Object.keys(createLandingTelemetry()).sort());
  });

  it('揚陸の時計: 残りの秒は unload_s − 出撃からの体感秒（揚陸中だけ）、割合は LandingState の写し。揚陸完了で残り 0・決着・出来事「揚陸完了」（PT なし＝方位 0）', () => {
    const w = world();
    const t = initLandingTelemetry(w);
    w.stepTimeS = 30.4;
    tickLanding(w.landing.state, w.landing.p, w.stepTimeS);
    refreshLandingTelemetry(t, w);
    expect(t.leftS).toBeCloseTo(140 - 30.4, 9);
    expect(t.pct).toBeCloseTo(30.4 / 140, 12);
    w.stepTimeS = 140;
    tickLanding(w.landing.state, w.landing.p, w.stepTimeS);
    w.stepTimeS = 141;
    refreshLandingTelemetry(t, w);
    expect([t.phase, t.resolved, t.pct, t.leftS, t.eventSeq, t.eventKind, t.eventBoat, t.eventDirIdx]).toEqual([LD_DONE, true, 1, 0, 1, LE_DONE, -1, 0]);
  });

  it('見張りの報告: 哨戒で斉射が残り見張りの内で輸送船へ向かう PT。慌てる距離の外は遠い・内は近い、100 m 刻みの切り上げ・輸送船から見た方位・自艇からの相対位置と見えているか', () => {
    const w = world();
    const t = initLandingTelemetry(w);
    const far = Math.round((LD.torpedo.hurriedM + LD.params.lookoutM) / 2) + 30;
    place(w, 0, 0, far, 180); // 北から南へ（輸送船へ）
    refreshLandingTelemetry(t, w);
    const b = w.pts.section.boats[0]!;
    expect([t.reportSub, t.reportI, t.reportStep, t.reportDirIdx]).toEqual([LANDING_REPORT_FAR, 0, Math.ceil(far / 100), 0]);
    expect([t.reportDx, t.reportDy, t.reportSighted]).toEqual([b.x - S04.playerStart.x, b.y - S04.playerStart.y, false]);
    place(w, 0, 45, LD.torpedo.hurriedM - 51, 225); // 北東から南西へ・慌てる距離の内
    w.boat.state.x = b.x - 100; // 自艇がそのすぐ西（視程の内）
    w.boat.state.y = b.y;
    refreshLandingTelemetry(t, w);
    expect([t.reportSub, t.reportI, t.reportStep, t.reportDirIdx, t.reportSighted]).toEqual([LANDING_REPORT_NEAR, 0, Math.ceil((LD.torpedo.hurriedM - 51) / 100), 1, true]);
    expect([t.reportDx, t.reportDy]).toEqual([100, 0]);
    // 輸送船から遠ざかる・警戒（自艇と戦っている）・斉射を撃った・見張りの外は報告しない
    const CUTS: [string, (w2: W) => void][] = [
      ['遠ざかる', (w2) => (w2.pts.section.boats[0]!.headingDeg = 45)],
      ['警戒', (w2) => (w2.pts.section.boats[0]!.phase = PT_ALERT)],
      ['撃った', (w2) => (w2.landing.tst.left[0] = 0)],
      ['見張りの外', (w2) => place(w2, 0, 45, LD.params.lookoutM + 10, 225)],
    ];
    for (const [name, cut] of CUTS) {
      const w2 = world();
      const t2 = initLandingTelemetry(w2);
      place(w2, 0, 45, LD.torpedo.hurriedM - 51, 225);
      refreshLandingTelemetry(t2, w2);
      expect(t2.reportSub, name).toBe(LANDING_REPORT_NEAR);
      cut(w2);
      refreshLandingTelemetry(t2, w2);
      expect([t2.reportSub, t2.reportI, t2.reportSighted], name).toEqual([LANDING_REPORT_NONE, -1, false]);
      expect(t2.reportDx, name).toBeNaN();
    }
  });

  it('報告の向きは landingReport と同じ式（landingDirIdx）: 8 方位のどれでも一致。決着の後は見張りの内でも報告しない', () => {
    const w = world();
    const out = createLandingReport();
    for (let k = 0; k < 8; k++) {
      place(w, 0, k * 45, 1000, (k * 45 + 180) % 360);
      landingReport(w.landing.state, w.landing.p, w.pts.section, w.landing.tst, out);
      const b = w.pts.section.boats[0]!;
      expect([out.dirIdx, landingDirIdx(w.landing.state, b.x, b.y)]).toEqual([k, k]);
    }
    const t = initLandingTelemetry(w);
    expect(t.reportSub).toBe(LANDING_REPORT_NEAR);
    w.landing.state.phase = LD_DONE;
    refreshLandingTelemetry(t, w);
    expect([t.reportSub, t.reportI]).toEqual([LANDING_REPORT_NONE, -1]);
  });

  it('出来事: 通し番号が変わったフレームだけ写し、その PT の輸送船からの 8 方位を 1 回だけ（PT が動いても次の出来事まで同じ）。被雷は被雷の数とそのときの割合', () => {
    const w = world();
    const t = initLandingTelemetry(w);
    const ld = w.landing.state;
    place(w, 1, 90, 900, 270); // 東
    landingEvent(ld, LE_CALM, 1, 899.9, 3);
    refreshLandingTelemetry(t, w);
    expect([t.eventSeq, t.eventKind, t.eventBoat, t.eventM, t.eventCount, t.eventHits, t.eventDirIdx]).toEqual([1, LE_CALM, 1, 899.9, 3, 0, 2]);
    place(w, 1, 0, 1500, 0); // 去って北へ
    refreshLandingTelemetry(t, w);
    expect(t.eventDirIdx).toBe(2);
    w.stepTimeS = 77;
    tickLanding(ld, w.landing.p, w.stepTimeS);
    hitLanding(ld, w.landing.p, w.stepTimeS);
    landingEvent(ld, LE_HIT, 1, NaN, 0);
    refreshLandingTelemetry(t, w);
    expect([t.eventSeq, t.eventKind, t.eventHits, t.hits, t.eventDirIdx]).toEqual([2, LE_HIT, 1, 1, 0]);
    expect(t.eventPct).toBeCloseTo(77 / 140, 12);
    expect(t.eventM).toBeNaN();
  });

  it('沈没（揚陸中に 2 本）: 揚陸の前に沈んだ・沈み始めた・残り 0・割合は沈んだときのまま。雷跡と撃った数は世界の数えの写し', () => {
    const w = world();
    const t = initLandingTelemetry(w);
    const ld = w.landing.state;
    w.stepTimeS = 70;
    tickLanding(ld, w.landing.p, 70);
    w.landing.wakes.count = 3;
    w.landing.wakes.cpaS = 9.5;
    w.landing.tst.salvos = 1;
    w.landing.tst.fired = 3;
    refreshLandingTelemetry(t, w);
    expect([t.wakes, t.wakeCpaS, t.salvos, t.fired]).toEqual([3, 9.5, 1, 3]);
    hitLanding(ld, w.landing.p, 75);
    hitLanding(ld, w.landing.p, 76);
    w.stepTimeS = 80;
    tickLanding(ld, w.landing.p, 80);
    refreshLandingTelemetry(t, w);
    expect([t.phase, t.resolved, t.sinking, t.sunkAfterDone, t.hits, t.leftS, t.pct]).toEqual([LD_SUNK, true, true, false, 2, 0, 0.5]);
  });

  it('撃てる隻数: 斉射が残り・結末なし・去っていない PT だけ', () => {
    const w = world();
    const t = initLandingTelemetry(w);
    expect(t.armed).toBe(2);
    w.landing.tst.left[0] = 0;
    refreshLandingTelemetry(t, w);
    expect(t.armed).toBe(1);
    w.pts.section.boats[1]!.fate = PT_FATE_SUNK;
    refreshLandingTelemetry(t, w);
    expect(t.armed).toBe(0);
    const w2 = world();
    w2.pts.section.boats[1]!.phase = PT_LEAVE;
    expect(initLandingTelemetry(w2).armed).toBe(1);
    w2.pts.section.boats[1]!.phase = PT_PATROL;
    expect(initLandingTelemetry(w2).armed).toBe(2);
  });

  it('§7: 毎フレームの refreshLandingTelemetry は確保しない（new・配列の写し・文字の組み立て・関数の生成が無い）', () => {
    const s = readFileSync(new URL('../src/systems/landing-telemetry.ts', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const fn = s.slice(s.indexOf('export function refreshLandingTelemetry'));
    expect(fn.length).toBeGreaterThan(100);
    for (const bad of [/\bnew\s/, /\.(map|filter|slice|concat)\(/, /`/, /=>/, /\[\s*\]/, /\{\s*\}/]) expect(fn, String(bad)).not.toMatch(bad);
  });
});
