// v0.8.2 S4（spec-v0820 §4.13 D-H5・§4.8 D-P2、lead の L42）: Result の us_05 の 2 行（ui/recon-result）とその材料（systems/recon-result-part）、得点の shipKills・見出し・頭の「艦隊」。
// - 報告の行の 5 つの形（送った・中継した・中継できず・追い終えず・見ていない）。艦隊の行（艦種ごとの命中・沈めた艦・誘爆・海峡へ去った隻数・通算の注）。
// - 幅: 20 px で論理幅 1280 の行の幅 1232 の内（縮めない）。spec の形（「弾薬庫の誘爆で 1 隻轟沈」「通算の命中率に数えない」）は越えるので spec §14 の短い方。沈めた艦が多い形は尾を落とす。
// - 列の 1 行（往路・復路）は片道の列では出さない。本文の下端は us_04 の 2 行と同じ置き方に 1 行足した分（592 の内か、上げても重ならない＝headless の brief-result の US05=1 が本当の折り返しで見る）。
// - 見出しの体当たりは「敵艦と衝突した」（列の艦はどれも船体に当たれば同じ理由）・頭は「艦隊: 撃沈 N/M」・得点の行は「報告 N ・ 命中 N ・ 撃沈 N」（result-scene の 3 行）。
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { RECON_NONE, RECON_PENDING, RECON_RELAYED, RECON_SENT, RECON_TRACKING, createReconState } from '../src/core/recon-report';
import { computeScore } from '../src/core/scoring';
import { getScoringParams } from '../src/config/game-data';
import { TRANSIT_GONE, TRANSIT_IN } from '../src/core/ship-transit';
import { reconResultPart } from '../src/systems/recon-result-part';
import { straitResultPart } from '../src/systems/strait-result-part';
import { RECON_RESULT_KPI_TAIL_JA, RECON_RESULT_MAX_PX, reconFleetLineJa, reconReportLineJa, type ReconResult } from '../src/ui/recon-result';
import { radarResultLineJa } from '../src/ui/radar-result';
import { resultBodyLines, type ResultBodySource } from '../src/ui/result-body';
import { resultHeadingJa, resultShipsJa } from '../src/ui/result-heading';
import { setupOf } from './column-world-kit';
import { code } from './core-rules-kit';
import { PERSON_DENYLIST, PT_NUMBER_RE, RANK_RE } from './person-denylist';
import { textWidthPx } from './pt-ui-kit';

const S = setupOf('us_05');
const R0: ReconResult = { stage: RECON_SENT, seenAtS: 148.2, sentAtS: 170.4, relayedAtS: NaN, trackedS: 20, identifyJa: '戦艦', relayJa: '隣の分隊', total: 7, bbHits: 3, caHits: 0, ddHits: 1, bbSunk: 1, caSunk: 0, ddSunk: 0, detonations: 1, gone: 6, shipKills: [{ enemyId: 'ijn_battleship_fuso', count: 1 }] };

describe('文の形と幅（D-H5）', () => {
  it('報告の行の 5 つの形（秒は四捨五入・名は data の艦種と中継の輪の名）', () => {
    expect(reconReportLineJa(R0)).toBe('報告: 出撃 170 秒に送った（無線） ・ 戦艦を確認 148 秒');
    expect(reconReportLineJa({ ...R0, stage: RECON_RELAYED, relayedAtS: 210.2 })).toBe('報告: 無線が壊れ、出撃 210 秒に隣の分隊で中継 ・ 戦艦を確認 148 秒');
    expect(reconReportLineJa({ ...R0, stage: RECON_PENDING })).toBe('報告できなかった（無線が壊れ、中継できず） ・ 戦艦を確認 148 秒');
    expect(reconReportLineJa({ ...R0, stage: RECON_TRACKING, trackedS: 12.7 })).toBe('報告できなかった（追尾 12 秒） ・ 戦艦を確認 148 秒');
    expect(reconReportLineJa({ ...R0, stage: RECON_NONE, seenAtS: NaN })).toBe('報告できなかった（戦艦を見ていない）');
  });
  it('艦隊の行: 艦種ごとの命中・誘爆で轟沈・撃沈・海峡へ・通算の注。spec の形は 20 px で 1,349 px＝越えるので短い方（spec §14）', () => {
    expect(reconFleetLineJa(R0)).toBe(`艦隊 7 隻: 戦艦に命中 3（誘爆で轟沈 1） ・ 重巡 0 ・ 駆逐艦 1 → 海峡へ 6${RECON_RESULT_KPI_TAIL_JA}`);
    expect(RECON_RESULT_KPI_TAIL_JA).toBe(' ・ 戦艦・重巡への魚雷は通算に入れない');
    expect(reconFleetLineJa({ ...R0, bbHits: 0, bbSunk: 0, detonations: 0, caHits: 3, caSunk: 1, ddHits: 1, ddSunk: 1, gone: 5 })).toBe(`艦隊 7 隻: 戦艦に命中 0 ・ 重巡 3（撃沈） ・ 駆逐艦 1（撃沈 1） → 海峡へ 5${RECON_RESULT_KPI_TAIL_JA}`);
    expect(Math.round(textWidthPx('艦隊 7 隻: 戦艦に命中 3（弾薬庫の誘爆で 1 隻轟沈） ・ 重巡 0 ・ 駆逐艦 1 → 海峡へ 6 ・ 戦艦と重巡への魚雷は通算の命中率に数えない', 20))).toBe(1349);
    expect(Math.round(textWidthPx(reconFleetLineJa(R0), 20) * 10) / 10).toBe(1156.9);
  });
  it('どの形も 20 px で 1232 px の内（沈めた艦が多い形は尾を落とす）。報告の行のいちばん長い形も。人名・PT の番号なし', () => {
    const all: string[] = [];
    for (const stage of [RECON_NONE, RECON_TRACKING, RECON_SENT, RECON_PENDING, RECON_RELAYED]) all.push(reconReportLineJa({ ...R0, stage, seenAtS: 269, sentAtS: 269, relayedAtS: 269, trackedS: 19.9 }));
    for (const total of [7, 8]) for (let bb = 0; bb <= 4; bb++) for (let ca = 0; ca <= 4 - bb; ca++) {
      const dd = 4 - bb - ca;
      for (const det of [0, 1]) all.push(reconFleetLineJa({ ...R0, total, bbHits: bb, bbSunk: det, detonations: det, caHits: ca, caSunk: ca >= 3 ? 1 : 0, ddHits: dd, ddSunk: Math.min(dd, 2), gone: total }));
    }
    for (const s of all) {
      expect(textWidthPx(s, 20), s).toBeLessThanOrEqual(RECON_RESULT_MAX_PX);
      for (const name of PERSON_DENYLIST) expect(s).not.toContain(name);
      expect(RANK_RE.test(s) || PT_NUMBER_RE.test(s), s).toBe(false);
    }
    expect(all.some((s) => !s.endsWith(RECON_RESULT_KPI_TAIL_JA))).toBe(true); // 尾を落とした形がある
    expect(all.filter((s) => s.startsWith('艦隊') && s.endsWith(RECON_RESULT_KPI_TAIL_JA)).length).toBeGreaterThan(0);
  });
});

/** 材料の小さな世界（us_05 の setup の列・艦は命中と沈み始めだけ・列の通過は段階だけ） */
function world(o: { hits?: number[]; sinking?: number[]; phases?: number[]; detonations?: number; stage?: number } = {}): Parameters<typeof reconResultPart>[0] {
  const col = S.transit!.column!;
  const st = createReconState();
  st.stage = o.stage ?? RECON_SENT;
  const phase = new Uint8Array(col.length).fill(TRANSIT_GONE);
  (o.phases ?? []).forEach((p, i) => (phase[i] = p));
  return {
    recon: { state: st, plan: S.recon! },
    destroyers: {
      ships: col.map((_, i) => ({ hitsTaken: o.hits?.[i] ?? 0, sinking: (o.sinking ?? []).includes(i) })),
      destroyerCount: col.length,
      kits: { classes: col.map((k) => k.shipClass) },
      transit: { state: { ships: col.length, phase } as never },
      magazine: { detonations: o.detonations ?? 0 },
    },
    setup: S,
  };
}

describe('材料（reconResultPart）と得点・本文・見出し', () => {
  it('艦種ごとの命中・沈めた艦・誘爆・海峡へ去った隻数。沈み始めた列の艦の記録の id ごとの数＝得点の shipKills（戦艦・重巡だけ点）', () => {
    const cls = S.transit!.column!.map((k) => k.shipClass);
    const bb = cls.lastIndexOf('battleship');
    const ca = cls.indexOf('heavy_cruiser');
    const hits = cls.map(() => 0);
    hits[bb] = 3; hits[ca] = 1; hits[0] = 1;
    const phases = cls.map((_, i) => (i === bb ? 5 : i === cls.length - 2 ? TRANSIT_IN : TRANSIT_GONE));
    const p = reconResultPart(world({ hits, sinking: [bb], phases, detonations: 1 })).recon!;
    expect([p.total, p.bbHits, p.caHits, p.ddHits, p.bbSunk, p.caSunk, p.ddSunk, p.detonations, p.gone, p.identifyJa, p.relayJa]).toEqual([7, 3, 1, 1, 1, 0, 0, 1, 5, '戦艦', '隣の分隊']);
    expect(p.shipKills).toEqual([{ enemyId: 'ijn_battleship_fuso', count: 1 }]);
    const P = getScoringParams(gameData);
    const inp = { returned: true, objectiveDone: true, missionType: 'recon_and_attack', bands: [], kills: 0, killEnemyId: '', fuelLeftPct: 0, crewAlive: 1, crewTotal: 1, detections: 1 };
    expect(computeScore({ ...inp, shipKills: p.shipKills } as never, P).kills).toBe(200);
    expect(computeScore(inp as never, P).objective).toBe(300);
    expect(reconResultPart({ recon: null, destroyers: null, setup: {} })).toEqual({});
  });
  it('本文: 魚雷の枝のレーダーの行の後に 2 行（20 px・KPI の色）。列の 1 行（往路・復路）は片道の列では出さない', () => {
    const R = { firstS: 5.2, firstDx: -4400, firstDy: 2000, unseenShots: 0, unseenHits: 0 };
    const body = (over: Partial<ResultBodySource>): ResultBodySource => ({ hunt: null, pt: null, convoy: null, engine: null, gunboat: null, detections: 0, returned: true, objectiveDone: true, shots: [1, 2, 3, 4], capacity: 4, hits: 1, duds: 0, misses: 3, bands: [], kpi: null, sortie: { historical: false }, ...over }) as ResultBodySource;
    const withR = resultBodyLines(body({ radar: R, recon: R0 }), false);
    const without = resultBodyLines(body({ radar: R }), false).map((l) => l.text);
    expect(withR.map((l) => l.text).slice(0, without.length)).toEqual(without);
    expect(withR.slice(without.length).map((l) => [l.text, l.px])).toEqual([[reconReportLineJa(R0), 20], [reconFleetLineJa(R0), 20]]);
    expect(withR.map((l) => l.text).slice(-3, -2)).toEqual([radarResultLineJa(R)]);
    expect(straitResultPart({ destroyers: { transit: { state: {} as never, plan: { vilaLabelJa: 'スリガオ海峡', outbound: null } } }, setup: { dawnAir: { retireForceJa: '日本の艦隊' } } })).toEqual({});
    expect(code('src/systems/mission-telemetry.ts')).toContain('...reconResultPart(w),');
    // 読む欄の走査: ui/recon-result は材料の数と名だけ（艦・AI・世界・Phaser を読まない）。材料は艦の命中と沈み始め・艦種・去った隻数・誘爆の数・報告の段と秒だけ（位置・AI は読まない）
    expect(code('src/ui/recon-result.ts').replace(/^import .*$/gm, '')).not.toMatch(/destroyers|\bships\b|\.state\.|\.ai\b|from 'phaser'|document|window|Math\.random/);
    expect(code('src/systems/recon-result-part.ts').replace(/^\/\/.*$/gm, '')).not.toMatch(/\.state\.x|\.state\.y|\.ai\b|aiParams|from 'phaser'|Math\.random/);
  });
  it('見出し・頭・得点の行（result-scene の 3 行）: 体当たりは「敵艦と衝突した」、頭は「艦隊: 撃沈 N/M」、得点は「報告 N ・ 命中 N ・ 撃沈 N」。報告の無い任務は今の文', () => {
    expect(resultHeadingJa('rammed', NaN, false, false, false, true)).toBe('任務終了 — 敵艦と衝突した');
    const ships = { shipsTotal: 7, shipsSunk: 1, transportEnabled: false, transportSunk: false, dawn: { shipsWithdrawn: 0, transportWithdrawn: false } };
    expect(resultShipsJa({ ...ships, recon: R0 })).toBe('艦隊: 撃沈 1/7');
    expect(resultShipsJa(ships)).toBe('駆逐艦: 撃沈 1/7');
    const rs = code('src/scenes/result-scene.ts');
    expect(rs).toContain('r.evac !== undefined, r.anchor !== undefined || r.recon !== undefined), HUD_FONT_SPEED_PX');
    expect(code('src/systems/mission-score.ts')).toContain('...(r.recon ? { shipKills: r.recon.shipKills } : {}),'); // v0.9.0: 得点の材料は systems/mission-score
    expect(rs).toContain('computeScore(missionScoreInput(r), scoringParams)');
    expect(rs).toContain("`${r.escort ? '達成' : r.recon ? '報告' : '撃沈'} ${score.objective} ・ 命中 ${score.hits}${transportPart}${r.recon ? ` ・ 撃沈 ${score.kills}` : ''}${evadePart}`");
  });
});
