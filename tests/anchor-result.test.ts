// v0.8.1 S4（spec-v0810 §3.7 D-O4、lead の L62・L63）: Result の us_06 の 1 行（ui/anchor-result）と見出しの言い換え、その材料（systems/anchor-result-part の anchorResultPart）。
// v0.8.1 IP1: 尾の語「岸を背に N 秒」→「岸の陰に N 秒」（地図の岸の陰の海と 2 行目の「岸の陰に入った」と同じ言葉。字の数は同じ＝幅も同じ）。
// - 文の形: 撃沈（動き出す前）・動き出していれば「 ・ 出撃 N 秒に動き出した（理由）」・健在。止まった艦へ撃った夜だけ魚雷の句。気づいた理由の語は 5 つ。
// - 幅: 20 px で論理幅 1280 の行の幅 1232 の内（縮めない）＝いちばん長い形（199 秒・見つかった・4 本 4 命中・199 秒）。本文の下端は us_04 の 2 行と同じ置き方（592 の内か、上げても重ならない）。
// - 見出し: 止まった艦の任務の体当たりは「敵艦と衝突した」。ほかの任務の見出しは 1 字も変わらない（REASON_LABEL のまま）。
// - 材料: 止まった艦の任務だけ鍵が出る。名は記録の name_ja の括弧の中の最後（「駆逐艦（睦月型・卯月）」→「卯月」）。人名・PT の番号は無い。
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { ANCHOR_REASON_ALARM, ANCHOR_REASON_DAWN, ANCHOR_REASON_HIT, ANCHOR_REASON_SEEN, ANCHOR_REASON_WAKE } from '../src/core/anchored-ship';
import type { MissionEndReason } from '../src/core/mission-flow';
import { anchorResultPart } from '../src/systems/anchor-result-part';
import { ANCHOR_REASON_JA, ANCHOR_REASON_LABEL, anchorResultLineJa, anchorShipNameJa, type AnchorResult } from '../src/ui/anchor-result';
import { radarResultLineJa } from '../src/ui/radar-result';
import { resultBodyLines, type ResultBodySource } from '../src/ui/result-body';
import { REASON_LABEL, resultHeadingJa } from '../src/ui/result-heading';
import { anchorKit, runUntil } from './anchor-world-kit';
import { PERSON_DENYLIST, RANK_RE } from './person-denylist';
import { textWidthPx } from './pt-ui-kit';
import { code } from './sfx-rules-kit';

const A0: AnchorResult = { nameJa: '卯月', sunk: true, underwayS: NaN, reason: ANCHOR_REASON_WAKE, heldShots: 3, heldHits: 2, backdropS: 48.4 };
const LINE_W = 1280 - 48;

describe('文の形と幅（D-O4）', () => {
  it('撃沈（動き出す前）・動き出した秒と理由・健在。止まった艦へ撃たなかった夜は魚雷の句なし。理由の語 5 つ', () => {
    expect(anchorResultLineJa(A0)).toBe('卯月: 撃沈（動き出す前） ・ 止まった艦へ 3 本（命中 2・通算に入れない） ・ 岸の陰に 48 秒');
    expect(anchorResultLineJa({ ...A0, underwayS: 85.2 })).toBe('卯月: 撃沈 ・ 出撃 85 秒に動き出した（雷跡） ・ 止まった艦へ 3 本（命中 2・通算に入れない） ・ 岸の陰に 48 秒');
    expect(anchorResultLineJa({ ...A0, sunk: false, heldShots: 0, heldHits: 0, backdropS: 0 })).toBe('卯月: 健在 ・ 岸の陰に 0 秒');
    expect(anchorResultLineJa({ ...A0, sunk: false, underwayS: 200, reason: ANCHOR_REASON_DAWN })).toBe('卯月: 健在 ・ 出撃 200 秒に動き出した（夜明け） ・ 止まった艦へ 3 本（命中 2・通算に入れない） ・ 岸の陰に 48 秒');
    expect([ANCHOR_REASON_SEEN, ANCHOR_REASON_WAKE, ANCHOR_REASON_HIT, ANCHOR_REASON_ALARM, ANCHOR_REASON_DAWN].map((k) => ANCHOR_REASON_JA[k])).toEqual(['見つかった', '雷跡', '被雷', '警報', '夜明け']);
  });
  it('いちばん長い形（199 秒・見つかった・4 本 4 命中・199 秒）も 20 px で 1232 px の内（縮めない）。px を固定', () => {
    const wide = anchorResultLineJa({ nameJa: '卯月', sunk: true, underwayS: 199, reason: ANCHOR_REASON_SEEN, heldShots: 4, heldHits: 4, backdropS: 199 });
    expect(wide).toBe('卯月: 撃沈 ・ 出撃 199 秒に動き出した（見つかった） ・ 止まった艦へ 4 本（命中 4・通算に入れない） ・ 岸の陰に 199 秒');
    expect(Math.round(textWidthPx(wide, 20) * 10) / 10).toBe(1216.9);
    for (const r of [ANCHOR_REASON_SEEN, ANCHOR_REASON_WAKE, ANCHOR_REASON_HIT, ANCHOR_REASON_ALARM, ANCHOR_REASON_DAWN]) for (const sunk of [false, true]) expect(textWidthPx(anchorResultLineJa({ nameJa: '卯月', sunk, underwayS: 199, reason: r, heldShots: 4, heldHits: 4, backdropS: 199 }), 20)).toBeLessThanOrEqual(LINE_W);
    expect(textWidthPx(anchorResultLineJa({ ...A0, heldShots: 4, heldHits: 4, backdropS: 199 }), 20)).toBeLessThanOrEqual(LINE_W);
    for (const name of PERSON_DENYLIST) expect(wide).not.toContain(name);
    expect(RANK_RE.test(wide) || /PT-?\s*\d/.test(wide)).toBe(false);
  });
  it('名は記録の name_ja の括弧の中の最後（卯月）。括弧に「・」が無ければ括弧の前（駆潜艇）', () => {
    const rec = (id: string): string => String((gameData.enemies.enemies as unknown as Record<string, unknown>[]).find((x) => x['id'] === id)!['name_ja']);
    expect([anchorShipNameJa(rec('ijn_destroyer_mutsuki_enemy')), anchorShipNameJa(rec('ijn_subchaser')), anchorShipNameJa('駆逐艦')]).toEqual(['卯月', '駆潜艇', '駆逐艦']);
  });
});

describe('見出しの言い換え（L62）', () => {
  it('止まった艦の任務の体当たりは「敵艦と衝突した」（夜明け後・ハード・史実の尾は同じ）。ほかの理由とほかの任務は今の文', () => {
    expect(resultHeadingJa('rammed', NaN, false, false, false, true)).toBe('任務終了 — 敵艦と衝突した');
    expect(resultHeadingJa('rammed', 12.4, true, true, false, true)).toBe('任務終了 — 敵艦と衝突した（夜明け後 12 秒）（ハード）（史実）');
    expect(resultHeadingJa('rammed', NaN, false, false)).toBe('任務終了 — 駆逐艦に体当たりされた');
    expect(Object.keys(ANCHOR_REASON_LABEL)).toEqual(['rammed']);
    for (const r of Object.keys(REASON_LABEL) as MissionEndReason[]) {
      expect(resultHeadingJa(r, NaN, false, false), r).toBe(`任務終了 — ${REASON_LABEL[r]}`);
      if (r !== 'rammed') expect(resultHeadingJa(r, NaN, true, false, false, true), r).toBe(resultHeadingJa(r, NaN, true, false));
    }
    expect(REASON_LABEL.rammed).toBe('駆逐艦に体当たりされた');
    expect(code('src/scenes/result-scene.ts')).toContain('r.evac !== undefined, r.anchor !== undefined || r.recon !== undefined), HUD_FONT_SPEED_PX, HUD_COLOR_STRONG);'); // v0.8.2 S4: 報告の任務（us_05）も（列の艦はどれも船体に当たれば同じ理由）
  });
});

/** 本文の材料（駆逐艦の任務の魚雷の枝。tests/radar-result と同じ形） */
function body(over: Partial<ResultBodySource>): ResultBodySource {
  return { hunt: null, pt: null, convoy: null, engine: null, gunboat: null, detections: 0, returned: true, objectiveDone: true, shots: [1, 2, 3, 4], capacity: 4, hits: 1, duds: 0, misses: 3, bands: [], kpi: null, sortie: { historical: false }, ...over } as ResultBodySource;
}

describe('本文の 1 行と材料', () => {
  it('魚雷の枝のレーダーの行の後ろ（兵装の行の前）に 1 行（20 px・KPI の色）。鍵の無い任務は今の行のまま。行の数は us_04（レーダー＋列）と同じ＝下端の置き方も同じ', () => {
    const R = { firstS: 0.0167, firstDx: -1300, firstDy: 2100, unseenShots: 0, unseenHits: 0 };
    const withA = resultBodyLines(body({ radar: R, anchor: A0 }), false);
    const without = resultBodyLines(body({ radar: R }), false).map((l) => l.text);
    expect(withA.map((l) => l.text).slice(0, without.length)).toEqual(without);
    expect(withA.slice(without.length).map((l) => [l.text, l.px])).toEqual([[anchorResultLineJa(A0), 20]]);
    expect(withA.map((l) => l.text).slice(-2)).toEqual([radarResultLineJa(R), anchorResultLineJa(A0)]);
    const us04 = resultBodyLines(body({ radar: R, strait: { forceJa: '東京急行', vilaJa: 'ビラ', inCount: 3, outCount: 2, sunk: 1, away: 0, inbound: 0 } }), false);
    expect(withA.map((l) => [l.px, l.sectionAfter])).toEqual(us04.map((l) => [l.px, l.sectionAfter]));
    expect(resultBodyLines(body({ radar: R, anchor: A0, arms: { blindTorpedoes: 1 } as never }), false).map((l) => l.text).slice(-2, -1)).toEqual([anchorResultLineJa(A0)]);
  });
  it('材料（anchorResultPart）: 止まった艦の任務だけ鍵。卯月の撃沈・動き出した世界の秒と理由・止まった艦への魚雷・背に岸の秒（systems/anchor-telemetry の記録）。us_02 は鍵ごと無い', () => {
    const w = anchorKit();
    const uz = w.destroyers.ships[0]!.state;
    [w.boat.state.x, w.boat.state.y] = [uz.x, uz.y - 300];
    runUntil(w, 20);
    const p = anchorResultPart(w, gameData).anchor!;
    const log = w.destroyers.anchors!.log;
    expect([p.nameJa, p.sunk, p.reason, p.underwayS, p.heldShots, p.backdropS]).toEqual(['卯月', false, ANCHOR_REASON_SEEN, log.underwayAtS[0], 0, log.backdropS]);
    expect(Number.isFinite(p.underwayS)).toBe(true);
    expect(anchorResultPart(anchorKit({ mission: 'us_02' }), gameData)).toEqual({});
    expect(code('src/systems/mission-telemetry.ts')).toContain('...anchorResultPart(w, data),');
  });
});
