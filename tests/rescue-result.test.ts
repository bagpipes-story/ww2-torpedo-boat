// v0.8.5 S4（spec-v0850 §8.3）: 救助の任務（us_07）の Result の文（ui/rescue-result）と配線（ui/result-body の救助の枝・ui/result-heading・scenes/result-scene）、
// コリーの名の札の置き場所（ui/rescue-label-spot。S2 の画面写しで南の群の札に重なった）。
// - 見出し: 達成「救助成功」・未達で帰投「帰投（渡した N 名 ・ 40 名に届かず）」・S ボートの掃射・触雷は「触雷で沈没」・後ろの秒は「（救助の後 N 秒）」。ほかの任務の見出しは今のまま。
// - 本文 4 行: 生存者の行方（0 の句は出さない）・機雷と砲台・S ボート・S ボートは想定の注。行の幅は Result の行の幅 1,232 px（W 1280）の内。人名と PT の番号なし。
import { describe, expect, it } from 'vitest';
import { HUD_COLOR_STRONG } from '../src/config/hud-text-config';
import { CORRY_LABEL_SPOTS } from '../src/config/rescue-hud-config';
import { SURVIVOR_LABEL_DY, SURVIVOR_TEX_UNITS } from '../src/config/rescue-art-config';
import type { DawnResult } from '../src/core/dawn-air';
import { createRescueState, rollRescueGroups } from '../src/core/rescue';
import { RESCUE_FIELD_SEED_OFFSET } from '../src/core/rescue';
import type { RescueResult } from '../src/core/rescue-telemetry';
import { SeededRng } from '../src/core/rng';
import { resultBodyLines, type ResultBodySource } from '../src/ui/result-body';
import { resultHeadingJa } from '../src/ui/result-heading';
import { corryLabelSpot } from '../src/ui/rescue-label-spot';
import { rescueHazardLineJa, rescueHeadJa, rescueHeadingJa, rescueReasonJa, rescueResultLines, rescueSboatLineJa, rescueSurvivorLineJa, rescueTimeLineJa } from '../src/ui/rescue-result';
import type { PtResult } from '../src/ui/result-types';
import { setupOf } from './column-world-kit';
import { gameData } from '../src/config/game-data';
import { enemyNameJa, getBriefingRecord, riskLabelJa } from '../src/config/briefing-data';
import { ptLookOf } from '../src/config/pt-look-data';
import { briefingRows } from '../src/core/briefing';
import { briefingNumbers } from '../src/systems/world-setup';
import { code } from './core-rules-kit';
import { PERSON_DENYLIST, PT_NUMBER_RE, RANK_RE } from './person-denylist';
import { textWidthPx } from './pt-ui-kit';

const S = setupOf('us_07');
const R = S.rescue!;
/** Result の行の幅（W 1280 − 2 × 24。result-scene の縮めの境） */
const RESULT_MAX_PX = 1232;
const rr = (o: Partial<RescueResult> = {}): RescueResult => ({
  total: 60, objective: 40, delivered: 0, deliveredAtReturn: 0, lostShell: 0, byOthers: 0, lostSunk: 0, aboard: 0, onWater: 0, minesPlaced: 24, minesSeen: 0, minesBlown: 0, sboats: 2, sboatRetreated: 0,
  batteryShots: 0, batteryHits: 0, fitchJa: 'フィッチ', sboatWave2: 0, batterySeaShots: 0, friendlyBoats: 0, friendlyPicked: 0, friendlyJa: '味方の艇', ...o,
});
const pt = (o: Partial<PtResult> = {}): PtResult => ({ enemyId: 'de_sboat_enemy', nameJa: 'Sボート', passes: 3, hits: 4, retired: 0, sunk: 1, ...o }) as PtResult;

describe('見出し', () => {
  it('達成・未達で帰投・S ボートの掃射・触雷（spec の「触雷 — 沈没」は頭の線と 2 本にしない）。後ろの秒は「救助の後」', () => {
    const r = rr({ delivered: 32 });
    expect(resultHeadingJa('returned', NaN, false, false, false, false, rescueReasonJa('returned', r, true, pt()))).toBe('任務終了 — 救助成功');
    expect(resultHeadingJa('returned', 20.4, true, false, false, false, rescueReasonJa('returned', r, false, pt()))).toBe('任務終了 — 帰投（渡した 32 名 ・ 40 名に届かず）（救助の後 20 秒）（ハード）');
    expect(resultHeadingJa('pt_fire', NaN, false, false, false, false, rescueReasonJa('pt_fire', r, false, pt()))).toBe('任務終了 — Sボートの掃射で沈没');
    expect(resultHeadingJa('mine', NaN, false, false, false, false, rescueReasonJa('mine', r, false, pt()))).toBe('任務終了 — 触雷で沈没');
    expect(resultHeadingJa('shore_battery', NaN, false, true, false, false, rescueReasonJa('shore_battery', r, false, pt()))).toBe('任務終了 — 沿岸砲で沈没（史実）');
    const m = { reason: 'returned' as const, returned: true, objectiveDone: true, pt: pt(), dawn: { reached: true, caughtOutside: true, daylightS: 12.2 } as DawnResult, sortie: { historical: true } };
    expect(rescueHeadingJa(m, r, true)).toBe('任務終了 — 救助成功（救助の後 12 秒）（ハード）（史実）');
    // 救助の無い任務は今のまま
    expect(resultHeadingJa('pt_fire', 20.4, false, false)).toBe('任務終了 — PTの掃射で沈没（夜明け後 20 秒）');
  });
});

describe('本文の 4 行', () => {
  it('生存者の行方（spec §8.3 の形。0 の句は出さない）・機雷と砲台・S ボート・想定の注', () => {
    expect(rescueSurvivorLineJa(rr({ delivered: 47, deliveredAtReturn: 3, lostShell: 2, byOthers: 11 }))).toBe('生存者: フィッチへ 44 名 ・ 帰投で 3 名 ・ 砲撃で失った 2 名 ・ 他艦が拾った 11 名');
    expect(rescueSurvivorLineJa(rr({ delivered: 20, lostSunk: 12, onWater: 28 }))).toBe('生存者: フィッチへ 20 名 ・ 沈没で失った 12 名 ・ 海に残った 28 名');
    expect(rescueSurvivorLineJa(rr({ aboard: 6, onWater: 54 }))).toBe('生存者: フィッチへ 0 名 ・ 乗せたまま 6 名 ・ 海に残った 54 名');
    expect(rescueSurvivorLineJa(rr({ delivered: 40, onWater: 20 }), true)).toBe('生存者: フィッチへ 40 名 ・ 他艦に任せた 20 名');
    expect(rescueHazardLineJa(rr({ minesSeen: 6, minesBlown: 1, batteryShots: 24, batteryHits: 2 }))).toBe('機雷: 見えた 6/24 ・ 触雷 1 ・ 砲台: 砲撃 24 発 ・ 命中 2');
    expect(rescueSboatLineJa(rr({ sboatRetreated: 1 }), pt())).toBe('Sボート 2 隻: 航過 3 回 ・ 被弾 4 発 ・ フィッチの砲火で退いた 1 ・ 撃退 0 ・ 撃沈 1');
    expect(rescueSboatLineJa(rr(), null)).toBe('米PT 2 隻: フィッチの砲火で退いた 0 ・ 撃退 0 ・ 撃沈 0');
    // v0.8.5 IP2: 生存者の海へ撃った弾の数（0 なら出さない）・第二波の隻数（出なければ出さない）
    expect(rescueHazardLineJa(rr({ minesSeen: 6, minesBlown: 1, batteryShots: 24, batteryHits: 2, batterySeaShots: 13 }))).toBe('機雷: 見えた 6/24 ・ 触雷 1 ・ 砲台: 砲撃 24 発 ・ 生存者の海へ 13 発 ・ 命中 2');
    expect(rescueSboatLineJa(rr({ sboats: 4, sboatWave2: 2, sboatRetreated: 3 }), pt())).toBe('Sボート 4 隻（第二波 2）: 航過 3 回 ・ 被弾 4 発 ・ フィッチの砲火で退いた 3 ・ 撃退 0 ・ 撃沈 1');
    expect(rescueResultLines(rr(), pt())[3]).toBe('この朝、史実ではSボートはユタ沖に来ていない（ゲームの想定）');
    expect(rescueHeadJa(rr({ delivered: 44 }))).toBe('救助: 渡した 44/40 名');
  });
  it('いちばん長い形でも行の幅の内（1 行目 24 px・ほか 20 px）。人名・階級・PT の番号なし', () => {
    // 終わり方ごとに同時に出る句（帰投で＝帰投と同じ終わりだけ・沈没で失った＝沈没だけ・乗せたまま＝漂流と座礁だけ。他艦が拾った＝救助の時間の後・海に残った＝前）
    const base = { lostShell: 19, minesSeen: 64, minesPlaced: 64, minesBlown: 2, batteryShots: 999, batteryHits: 99, sboats: 6, sboatRetreated: 6, sboatWave2: 3, batterySeaShots: 99 }; // v0.8.5 IP2: 第二波と生存者の海の句込み
    const ends = [{ delivered: 59, deliveredAtReturn: 20 }, { delivered: 40, lostSunk: 20 }, { delivered: 40, aboard: 20 }].flatMap((e) => [{ ...e, byOthers: 59 }, { ...e, onWater: 59 }]);
    for (const e of ends) { const l = rescueSurvivorLineJa(rr({ ...base, ...e })); expect(textWidthPx(l, 24), l).toBeLessThanOrEqual(RESULT_MAX_PX); }
    const [a, b, c, d] = rescueResultLines(rr({ ...base, ...ends[0]! }), pt({ passes: 99, hits: 999, retired: 3, sunk: 3 }));
    for (const s of [b, c, d]) expect(textWidthPx(s, 20), s).toBeLessThanOrEqual(RESULT_MAX_PX);
    for (const s of [a, b, c, d]) expect(PT_NUMBER_RE.test(s) || RANK_RE.test(s) || PERSON_DENYLIST.some((n) => s.includes(n)), s).toBe(false);
  });
  it('救助の時間の行: 前に帰投「残り N 秒で帰投」・後「終わって N 秒」・前に帰投せず終われば出さない', () => {
    const d = (o: Partial<DawnResult>): DawnResult => ({ reached: false, caughtOutside: false, daylightS: 0, timeLeftAtEndS: 59.2, ...o }) as DawnResult;
    expect(rescueTimeLineJa(d({}), true)).toBe('救助の時間: 残り 60 秒で帰投');
    expect(rescueTimeLineJa(d({}), false)).toBeNull();
    expect(rescueTimeLineJa(d({ reached: true, caughtOutside: true, daylightS: 20.4 }), true)).toBe('救助の時間が終わって 20 秒 ・ 帰投');
    expect(rescueTimeLineJa(d({ reached: true, daylightS: 20.4 }), false)).toBe('救助の時間が終わって 20 秒');
  });
  it('ui/result-body: 救助の枝は米PT の枝の代わり（1 行目 24 px・強調の色・節の間、ほかは 20 px・KPI の色）', () => {
    const src = { hunt: null, pt: pt(), convoy: null, engine: null, gunboat: null, rescue: rr({ delivered: 41 }), detections: 2, returned: true, objectiveDone: true, shots: [], capacity: 4, hits: 0, duds: 0, misses: 0, bands: [], kpi: null, sortie: { historical: false } } as ResultBodySource;
    const lines = resultBodyLines(src, false);
    expect(lines.map((l) => l.text)).toEqual(rescueResultLines(rr({ delivered: 41 }), pt(), true));
    expect([lines[0]!.px, lines[0]!.color, lines[0]!.sectionAfter, lines[1]!.px]).toEqual([24, HUD_COLOR_STRONG, true, 20]);
  });
  it('scenes/result-scene の配線: 見出しの言い換え・状況の行の頭・救助の時間の行・得点の「（救助の後 ×0.9）」', () => {
    const rs = code('src/scenes/result-scene.ts');
    expect(rs).toContain('line(r.rescue ? rescueHeadingJa(r, r.rescue, hardV) : resultHeadingJa(');
    expect(rs).toContain(': r.rescue ? rescueHeadJa(r.rescue) : r.escort ?');
    expect(rs).toContain('[r.rescue ? rescueTimeLineJa(r.dawn, r.returned) : dawnResultLine(r.dawn, r.returned, r.reason === \'cleared\')]');
    expect(rs).toContain("r.evac ? '空襲後' : r.rescue ? RESCUE_AFTER_JA : '夜明け後'");
  });
});

describe('コリーの名の札（ui/rescue-label-spot）', () => {
  /** 札と群の札・絵の四角のすき間の最小 m */
  function minGap(x: number, y: number, st: { n: number; gx: Float64Array; gy: Float64Array }): number {
    let g = Infinity;
    for (let i = 0; i < st.n; i++) {
      const lab = Math.max(Math.abs(x - st.gx[i]!) - 44 - 32, Math.max(st.gy[i]! + SURVIVOR_LABEL_DY - (y + 30), y - (st.gy[i]! + SURVIVOR_LABEL_DY + 28)));
      const img = Math.max(Math.abs(x - st.gx[i]!) - 44 - SURVIVOR_TEX_UNITS / 2, Math.max(st.gy[i]! - SURVIVOR_TEX_UNITS / 2 - (y + 30), y - (st.gy[i]! + SURVIVOR_TEX_UNITS / 2)));
      g = Math.min(g, lab, img);
    }
    return g;
  }
  it('seed 1〜64 の今夜の群（ずれ込み）のどれの札・絵とも重ならない（すき間 ≥ 8 m）。艦から 300 m の内', () => {
    const used = new Set<number>();
    for (let seed = 1; seed <= 64; seed++) {
      const st = createRescueState(R, 0);
      rollRescueGroups(st, R, new SeededRng(seed + RESCUE_FIELD_SEED_OFFSET));
      const p = corryLabelSpot(R.corry.x, R.corry.y, st, SURVIVOR_LABEL_DY, SURVIVOR_TEX_UNITS / 2, { x: 0, y: 0 });
      expect(minGap(p.x, p.y, st), `seed ${seed}`).toBeGreaterThanOrEqual(8);
      expect(Math.hypot(p.x - R.corry.x, p.y - R.corry.y), `seed ${seed}`).toBeLessThanOrEqual(300);
      used.add(CORRY_LABEL_SPOTS.findIndex(([ox, oy]) => R.corry.x + ox === p.x));
    }
    expect(used.size).toBeGreaterThanOrEqual(1);
  });
  it('S2 の置き方（艦の真下 80 m）は南の群の札に重なる夜があった', () => {
    let overlap = 0;
    for (let seed = 1; seed <= 64; seed++) {
      const st = createRescueState(R, 0);
      rollRescueGroups(st, R, new SeededRng(seed + RESCUE_FIELD_SEED_OFFSET));
      if (minGap(R.corry.x, R.corry.y + 57 + 80, st) < 0) overlap++;
    }
    expect(overlap).toBeGreaterThan(0);
  });
});

describe('Briefing（spec §8.1。systems/briefing-numbers の救助の鍵）', () => {
  const rows = (hard: boolean) => {
    const s = setupOf('us_07', hard);
    const rec = { ...getBriefingRecord(gameData, 'us_07', hard), hazardIds: s.hazardsTonight, absentHazardIds: s.absentHazards };
    return briefingRows(rec, briefingNumbers(s, '', ptLookOf(gameData, s.mission.enemyId).nameJa), (e) => enemyNameJa(gameData, e), (h) => riskLabelJa(gameData, h));
  };
  it('時の行（昼）・条件の「救助の時間 390 秒（昼の空は味方）」（v0.8.5 IP3 で 300 → 390）・機銃の句（「1挺」と言わない・魚雷は Sボートの下を抜ける）。「夜明け」と言わない', () => {
    const r = rows(false);
    expect(r.map((x) => x.label)).toEqual(['目的', '成功', '時', '敵', '危険', '条件']);
    expect(r[2]!.text).toBe('昼（日の出の後） ・ 見える 2700 m ・ 見つかる 巡航 3600 m／静音 1800 m');
    expect(r[5]!.text).toBe('救助の時間 390 秒（昼の空は味方） ・ 燃料 70 gal ・ 機銃40mm・20mm・12.7mm（撃つと閃光で見つかる。魚雷はSボートの下を抜ける）');
    expect(r[3]!.text).toBe('独Sボート ×2（西から）');
    expect(rows(true)[3]!.text).toBe('独Sボート ×3（西から）');
    for (const h of [false, true]) for (const x of rows(h)) expect(x.text, x.label).not.toContain('夜明け');
  });
  it('S ボートと（ハードの）砲台が想定だと目的・史実メモに書いてある（data の文。S3b）。ほかの任務の数は鍵ごと無い', () => {
    const m = (gameData.missionsSeed.missions as Record<string, unknown>[]).find((x) => x['id'] === 'us_07')!;
    const hard = (m['v0_1_prototype'] as Record<string, Record<string, string>>)['hard']!;
    expect(m['objective']).toContain('西からSボートが来て、退けても第二波が来る（ゲームの想定）') // v0.8.5 IP2 で第二波;
    expect(m['briefing_note_ja']).toContain('この朝、Sボートはユタ沖に来ていない。このゲームの襲撃は想定。');
    expect(hard['objective_ja']).toContain('3つの砲台');
    expect(hard['objective_ja']).toContain('Sボート3隻が来て、退けても第二波が来る（ゲームの想定）');
    expect(hard['note_ja']).toContain('3隻目のSボート・2つ目・3つ目の砲台・多い機雷も想定');
    const n = briefingNumbers(setupOf('jp_05'));
    expect([n.dayRowJa, n.clockJa]).toEqual([undefined, undefined]);
  });
});
