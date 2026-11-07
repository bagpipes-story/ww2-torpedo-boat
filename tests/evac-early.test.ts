// v0.6.11 IP1 の U8（ユーザー「残存する全ての艇が避難所に入って敵機が捕捉しなくなった場合…その時点で残り時間があってもゲームクリアにしてください」）: core/evac-early の
// 早い決着。条件の縁（上げている隊・入っている隊・見つかった陰・外の隊・予告した編隊・飛んでいる編隊・全滅だけ・240 秒の後）、予告し直しと同じステップに最後の隊が隠れた夜、
// 立った次のステップに決着（core/evac-air の evacSettle）と模擬の帰投（時計と同じラッチ）、Result の時の行・HUD の決着の行と帯・レールの % の 2 行目の幅。
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { createDawnResult } from '../src/core/dawn-air';
import { EF_ANNOUNCED, EF_IDLE, EF_OFF, EO_LOST_EARLY, evacFlightLive } from '../src/core/evac-plan';
import { G_ENTERING, G_FOUND, G_GONE, G_HAULING, G_HIDDEN, G_UNDERWAY } from '../src/core/evac-data';
import { evacAllHidden, evacCoverAtRisk, evacEarlyCheck, evacSettleDue, evacSkyClear } from '../src/core/evac-early';
import { EVR_HIDDEN } from '../src/core/evac-result';
import { evacHaulPct, evacHaulProgress } from '../src/core/evac-shelter';
import { runEvacTrial } from '../src/core/evac-sim';
import { EVAC_POLICIES } from '../src/core/evac-sim-policy';
import { createEvacTelemetry, EVE_SETTLE } from '../src/core/evac-telemetry';
import { SHELTER_COVER } from '../src/core/evac-data';
import { evacSimSetup } from '../src/systems/evac-sim-setup';
import { EVAC_LINE_MAX_PX, evacLine, evacSettleBannerLines, jaWidthPx } from '../src/ui/evac-lines';
import { evacTimeLineJa } from '../src/ui/evac-result';
import { NEUTRAL } from './evac-kit';
import { makeAirRig, runAir, stepAirRig, type AirRig } from './evac-air-kit';

/** 第1〜3隊を壕 0〜2 に上げ切って隠し、第4〜6隊を全滅にする（操作中の第1隊は中の壕） */
function allHiddenRig(seed = 1): AirRig {
  const r = makeAirRig(seed);
  const sq = r.sq;
  for (let gi = 0; gi < sq.groups.length; gi++) {
    const g = sq.groups[gi]!;
    if (gi < 3) {
      g.phase = G_HIDDEN;
      g.shelter = gi;
      g.slotsHeld = g.boats.length;
      sq.shelterUsed[gi] = g.boats.length;
      for (const b of g.boats) b.up = true;
    } else {
      g.phase = G_GONE;
      g.leader = -1;
      for (const b of g.boats) b.sunk = true;
    }
  }
  return r;
}

describe('条件の縁（core/evac-early）', () => {
  it('全艇が隠れて空が空いていれば立つ・どれか 1 つでも外れれば立たない', () => {
    const r = allHiddenRig();
    expect(evacAllHidden(r.sq)).toBe(true);
    expect(evacSkyClear(r.air.plan)).toBe(true);
    for (const ph of [G_HAULING, G_ENTERING, G_FOUND, G_UNDERWAY]) {
      const x = allHiddenRig();
      x.sq.groups[2]!.phase = ph;
      expect(evacAllHidden(x.sq), String(ph)).toBe(false);
      evacEarlyCheck(x.air.plan, 30);
      expect(Number.isNaN(x.sq.earlyS)).toBe(true);
    }
    // 予告した編隊（予告し直しを含む）がある
    const a = allHiddenRig();
    a.air.plan.flights[0]!.phase = EF_ANNOUNCED;
    expect(evacSkyClear(a.air.plan)).toBe(false);
    evacEarlyCheck(a.air.plan, 30);
    expect(Number.isNaN(a.sq.earlyS)).toBe(true);
    // 全滅だけ（隠れた隊が無い）は立たない（18 隻すべてが沈めば沈没で終わる）
    const z = allHiddenRig();
    for (const g of z.sq.groups) g.phase = G_GONE;
    expect(evacAllHidden(z.sq)).toBe(false);
    // まだ来ていない波・目標なし・見失って去り終えた編隊は数えない
    const b = allHiddenRig();
    b.air.plan.flights[0]!.phase = EF_OFF;
    b.air.plan.flights[1]!.phase = EF_IDLE;
    evacEarlyCheck(b.air.plan, 30);
    expect(b.sq.earlyS).toBe(30);
    expect(evacSettleDue(b.sq, 30 + 1 / 60)).toBe(true);
    // 240 秒の後・決着の後は書かない
    const c = allHiddenRig();
    evacEarlyCheck(c.air.plan, 240);
    expect(Number.isNaN(c.sq.earlyS)).toBe(true);
    c.sq.settled = true;
    evacEarlyCheck(c.air.plan, 100);
    expect(Number.isNaN(c.sq.earlyS)).toBe(true);
    expect(evacSettleDue(c.sq, 239.9)).toBe(false);
    expect(evacSettleDue(c.sq, 240)).toBe(true);
  });

  it('案 B: 陰に隠れた隊があれば、予告（陰を見つける引き）が残る間は立たない・最後の予告の後か見つける見込み 0 なら立つ・壕だけなら波が残っても立つ', () => {
    const cov = (): AirRig => {
      const r = allHiddenRig(4);
      const sq = r.sq;
      const ci = sq.p.shelters.findIndex((x) => x.kind === SHELTER_COVER);
      const g = sq.groups[2]!;
      sq.shelterUsed[g.shelter] = 0;
      g.shelter = ci;
      sq.shelterUsed[ci] = g.boats.length;
      for (const b of g.boats) b.up = false;
      return r;
    };
    const a = cov();
    expect(a.air.plan.nextWave).toBeLessThan(a.air.plan.raid.waves.length);
    expect(evacAllHidden(a.sq) && evacSkyClear(a.air.plan)).toBe(true);
    expect(evacCoverAtRisk(a.air.plan)).toBe(true);
    evacEarlyCheck(a.air.plan, 30);
    expect(Number.isNaN(a.sq.earlyS)).toBe(true);
    a.air.plan.nextWave = a.air.plan.raid.waves.length;
    expect(evacCoverAtRisk(a.air.plan)).toBe(false);
    evacEarlyCheck(a.air.plan, 200);
    expect(a.sq.earlyS).toBe(200);
    const z = cov();
    (z.air.plan.raid as { coverRevealChance: number }).coverRevealChance = 0;
    expect(evacCoverAtRisk(z.air.plan)).toBe(false);
    const c = allHiddenRig(4);
    expect(c.air.plan.nextWave).toBeLessThan(c.air.plan.raid.waves.length);
    expect(evacCoverAtRisk(c.air.plan)).toBe(false);
    evacEarlyCheck(c.air.plan, 30);
    expect(c.sq.earlyS).toBe(30);
  });

  it('飛んでいる編隊（爆弾が空中・去る途中も）がある間は立たない', () => {
    const r = makeAirRig(2);
    let live = 0;
    runAir(r, NEUTRAL, 60, () => {
      if (r.air.plan.flights.some(evacFlightLive)) {
        live++;
        expect(evacSkyClear(r.air.plan)).toBe(false);
      }
    });
    expect(live).toBeGreaterThan(0);
  });

  it('最後の隊が隠れた同じステップに予告（し直し）があれば、その編隊が始める時に見失って去った（EF_OFF）ステップに立ち、次のステップに決着する', () => {
    const r = allHiddenRig(3);
    const plan = r.air.plan;
    plan.nextWave = plan.raid.waves.length; // 波の予告はもう無い（予告し直しの 1 つだけ）
    const fl = plan.flights[0]!;
    fl.phase = EF_ANNOUNCED;
    fl.target = 1;
    fl.startS = 20;
    fl.view.boat.state = r.sq.groups[1]!.boats[0]!.state;
    r.t = 10;
    let at = NaN;
    let settledAt = NaN;
    runAir(r, NEUTRAL, 15, () => {
      if (Number.isNaN(at) && !Number.isNaN(r.sq.earlyS)) at = r.t;
      if (Number.isNaN(settledAt) && r.sq.settled) settledAt = r.t;
    });
    expect(fl.phase).toBe(EF_OFF);
    expect(fl.outcome).toBe(EO_LOST_EARLY);
    expect(at).toBeCloseTo(20, 6);
    expect(settledAt).toBeCloseTo(20 + 1 / 60, 6);
    expect(r.air.plan.evSettle || r.sq.settled).toBe(true);
    // 決着の後は書き直さない
    stepAirRig(r, NEUTRAL);
    expect(r.sq.earlyS).toBeCloseTo(20, 6);
  });
});

describe('模擬（core/evac-sim）: 早い決着の夜は立った次のステップに帰投で終わる', () => {
  it('ノーマル・ハードの seq と bot 各 seed 1〜6: 早い決着の夜は決着が 240 秒より前・終わりは home・残存は決着のまま・達成は残存 ≥ 6', () => {
    let early = 0;
    for (const hard of [false, true]) {
      const s = evacSimSetup(gameData, hard);
      for (const pol of ['seq', 'bot'] as const)
        for (let seed = 1; seed <= 6; seed++) {
          const t = runEvacTrial(s, pol, seed);
          if (Number.isNaN(t.earlyS)) continue;
          early++;
          expect(t.earlyS).toBeLessThan(s.durationS);
          expect(t.end).toBe('home');
          expect(t.timeS).toBeCloseTo(t.earlyS + s.stepS, 6);
          expect(t.survivors).toBe(t.survivorsAtSettle);
          expect(t.caughtOutside).toBe(false);
          expect(t.achieved).toBe(t.survivors >= s.raid.survivorQuota);
        }
    }
    expect(early).toBeGreaterThan(0);
    expect(EVAC_POLICIES).toContain('stay');
  }, 120_000);
});

describe('文（Result の時の行・HUD の決着の行と帯・レールの %）', () => {
  it('Result の時の行は「全艇が隠れた ・ 空襲を待たずに退避完了（残り M:SS） ・ …の中（第1隊） ・ 残存 N で確定」（≤ 1,232 px）', () => {
    const base = { total: 18, quota: 6, historical: 5, survivors: 12, seatAfloat: true, cave: 9, cover: 3, outside: 0, byGroup: [3, 3, 3, 3, 0, 0], aimed: 9, again: 2, lost: 3, came: 6, downed: 1, chaseDowned: 0, bombs: 40, boatHits: 12, switches: 7, promotions: 2 };
    const d = { ...createDawnResult(), reached: true, timeLeftAtEndS: 83.2 };
    const line = evacTimeLineJa({ ...base, settlePlace: EVR_HIDDEN, settleGroupJa: '第1隊', settleShelterJa: '屋我地の陰（東）', settleSurvivors: 12, settleEarly: true }, d, 'returned', true);
    expect(line).toBe('全艇が隠れた ・ 空襲を待たずに退避完了（残り 1:24） ・ 屋我地の陰（東）の中（第1隊） ・ 残存 12 で確定');
    expect(jaWidthPx(line, 20)).toBeLessThanOrEqual(1280 - 48);
    expect(evacTimeLineJa({ ...base, settlePlace: EVR_HIDDEN, settleGroupJa: '第1隊', settleShelterJa: '西の壕', settleSurvivors: 12, settleEarly: false }, d, 'returned', true)).toBe('空襲が去る時: 西の壕の中（第1隊） ・ 残存 12 で確定');
  });

  it('HUD: 決着の行・中央の帯は早い決着の言い方、レールで上げている行は % 入りで ≤ 840 px（全部の隠れ場所・隻数・%）', () => {
    const e = createEvacTelemetry(6);
    e.enabled = true;
    e.groupLabels = ['第1隊', '第2隊', '第3隊', '第4隊', '第5隊', '第6隊'];
    e.shelterLabels = ['中の壕', '西の壕', '東の壕', '屋我地の陰（東）'];
    e.total = 18;
    e.quota = 6;
    e.survivors = 9;
    e.event = EVE_SETTLE;
    e.eventN = 9;
    e.early = true;
    expect(evacLine(e).text).toBe('全艇が隠れた ・ 空襲を待たずに退避完了（残存 9）');
    expect(evacSettleBannerLines(e, '')).toEqual(['全艇が隠れた ・ 空襲を待たずに退避完了', '残存 9／18 で確定（6 隻以上で達成）']);
    e.early = false;
    expect(evacLine(e).text).toBe('第1次の空襲が去った ・ 残存 9 で確定');
    // 案 B: 全艇が隠れたが陰の隊が予告で見つかりうる間の待機の行（≤ 840 px）
    e.event = 0;
    Object.assign(e, { phase: G_HIDDEN, shelter: 0, coverHold: 4, leftS: 100 });
    const hold = evacLine(e).text;
    expect(hold).toBe('陰の隊は予告で見つかることがある ・ 第4波の予告の後に退避完了');
    expect(jaWidthPx(hold, 22)).toBeLessThanOrEqual(EVAC_LINE_MAX_PX);
    e.coverHold = 0;
    expect(evacLine(e).text).toContain('で待機');
    e.event = 0;
    e.phase = G_HAULING;
    let shown = 0;
    for (let s = 0; s < 4; s++)
      for (let afloat = 1; afloat <= 3; afloat++)
        for (let up = 0; up < afloat; up++)
          for (const pct of [-1, 0, 9, 45, 99]) {
            Object.assign(e, { shelter: s, afloat, upCount: up, hauling: pct >= 0, haulPct: pct });
            const x = evacLine(e).text;
            expect(jaWidthPx(x, 22), x).toBeLessThanOrEqual(EVAC_LINE_MAX_PX);
            if (pct >= 0) {
              expect(x).toContain(`（${pct}%）`);
              shown++;
            }
          }
    expect(shown).toBeGreaterThan(0);
    Object.assign(e, { shelter: 1, afloat: 3, upCount: 1, hauling: true, haulPct: 45 });
    expect(evacLine(e).text).toBe('西の壕 レールで上げている 2/3（45%） ・ 隊長艇は最後 ・ 倒すと下ろす');
  });

  it('レールの進み（evacHaulProgress・evacHaulPct）: haul_s の残りから 0〜1 と 0〜99%、上げていなければ NaN と −1', () => {
    const r = makeAirRig(1);
    const g = r.sq.groups[0]!;
    const haulS = r.sq.p.haulS;
    expect(evacHaulPct(g, haulS)).toBe(-1);
    expect(Number.isNaN(evacHaulProgress(g, haulS))).toBe(true);
    g.phase = G_HAULING;
    g.hauling = 2;
    for (const [left, pct] of [[haulS, 0], [haulS * 0.549, 45], [haulS * 0.001, 99], [0, 99], [-0.1, 99]] as const) {
      g.haulLeftS = left;
      expect(evacHaulPct(g, haulS)).toBe(pct);
    }
    g.haulLeftS = haulS / 2;
    expect(evacHaulProgress(g, haulS)).toBeCloseTo(0.5, 9);
  });
});
