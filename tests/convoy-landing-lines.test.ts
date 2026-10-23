// 浜の上陸の出来事の並び（v0.6.4 実機 1 回目のレビュー ux-2。ui/pt-line-clock・ui/convoy-lines）: 浜の上陸は 60 m おき＝3.3 秒おきなので、出来事は CONVOY_EVENT_SHOW_MS 3.5 秒で
// 「上陸 1/3」→「2/3」→「上陸 3/3 ・ 帰投せよ」と間に別の行を挟まずに続き、最後の 1 隻の上陸（決着）も出来事になる（前は待っている上陸の出来事を捨てて呼びかけへ回し、
// 呼びかけは赤い線・結果・射撃中に負けて「上陸 3/3」がほぼ出なかった）。沈没の出来事の途中の決着は沈没の出来事を残す。tests/convoy-lines（300 行に近い）の続き。
import { describe, expect, it } from 'vitest';
import { CONVOY_EVENT_SHOW_MS } from '../src/config/convoy-config';
import { HOME_COLOR_TEXT } from '../src/config/hud-text-config';
import type { BoatTelemetry } from '../src/core/boat-motion';
import { createConvoyTelemetry, type ConvoyTelemetry } from '../src/core/convoy';
import { CALL_SUNK } from '../src/core/mission-flow';
import { PT_PASS, PT_PATROL, type PtTelemetry } from '../src/core/pt-boats';
import { CONVOY_EV_SUNK, convoyEventLine } from '../src/ui/convoy-lines';
import { MISSION_CONVOY_EVENT, MISSION_PT, MISSION_PT_PASS, MODE_FLAG_CONVOY_EVENT, missionMode } from '../src/ui/mission-mode';
import { PtLineClock } from '../src/ui/pt-line-clock';
import { row, tele } from './pt-ui-kit';

const SHOW = CONVOY_EVENT_SHOW_MS;
const CV_EVENT = MODE_FLAG_CONVOY_EVENT;
/** jp_01 の出撃時の輸送隊のテレメトリ（tests/convoy-lines と同じ: 3 隻・浜まで 3,040 m・米PT は東から）に上書き */
function cv(over: Partial<ConvoyTelemetry> = {}): ConvoyTelemetry {
  return { ...createConvoyTelemetry(), enabled: true, total: 3, afloat: 3, arrived: 0, sunk: 0, resolved: false, leftM: 3040, nearestDx: 0, nearestDy: 150, nearestM: 150, fromDirJa: '東', ...over };
}
const t01 = (pt: Partial<PtTelemetry> = {}, convoy: Partial<ConvoyTelemetry> = {}): BoatTelemetry => tele({ silentMaxKt: 13, leaveDirJa: '北東', ...pt }, { convoy: cv(convoy) });
const PASS_BARGE: Partial<PtTelemetry> = { detected: true, sighted: true, dx: 300, dy: -400, passing: true, threatPhase: PT_PASS, dodge: 1, escapeDeg: 315, targetKind: 1 };
/** mission-line と同じ文（輸送隊の出来事は時計の種類から convoyEventLine。ほかは tests/pt-ui-kit の row） */
function rowAt(t: BoatTelemetry, call: number, flags: number, clk: PtLineClock): [number, string, string] {
  const mode = missionMode(t, call, flags);
  if (mode !== MISSION_CONVOY_EVENT) return row(t, call, flags);
  const l = convoyEventLine(t.convoy, clk.convoyEvent);
  return [mode, l.text, l.color];
}

describe('浜の上陸の出来事の並び（レビュー ux-2）', () => {
  it('浜の上陸は 3.3 秒おき（tests/convoy-beach の 145.1／148.4／151.8 秒）: 「上陸 1/3」→「2/3」→「上陸 3/3 ・ 帰投せよ」が間に別の行を挟まずに続く（レビュー ux-2: 2.5 秒だと 0.8 秒挟まった）。赤い線の下で待った上陸の出来事は、線の途中の決着で決着の文に替わる', () => {
    const c = new PtLineClock();
    c.flags(t01(), 0, MISSION_PT);
    const steps: Array<[number, Partial<ConvoyTelemetry>]> = [[145100, { afloat: 2, arrived: 1 }], [148400, { afloat: 1, arrived: 2 }], [151800, { afloat: 0, arrived: 3, resolved: true }]];
    const texts: string[] = [];
    let mode = MISSION_PT;
    for (let ms = 145000; ms <= 151800 + SHOW + 200; ms += 50) {
      const cvNow = [...steps].reverse().find(([t]) => ms >= t)?.[1] ?? {};
      const t = t01({}, cvNow);
      const flags = c.flags(t, ms, mode);
      const r = rowAt(t, cvNow.resolved ? CALL_SUNK : 0, flags, c);
      mode = r[0];
      c.shown(mode);
      if (texts[texts.length - 1] !== r[1]) texts.push(r[1]);
    }
    expect(texts).toEqual(['大発 3 隻 ・ 上陸 0/3 ・ 浜まで 3100 m ・ 米PT 2 隻 東で哨戒中', '大発 上陸 1/3 ・ 残り 2 隻', '大発 上陸 2/3 ・ 残り 1 隻', '大発 上陸 3/3 ・ 帰投せよ', '']);
    // 赤い線の下で待つ上陸の出来事 → 線の途中で最後の 1 隻が上陸 → 線が消えたら決着の文（前は捨てて呼びかけへ。ヘッドレスで「上陸 3/3」がほぼ出なかった）
    const d = new PtLineClock();
    d.flags(t01(PASS_BARGE), 500, -1);
    const two = t01(PASS_BARGE, { afloat: 1, arrived: 2 });
    expect(d.flags(two, 1000, MISSION_PT_PASS) & CV_EVENT).toBe(CV_EVENT);
    d.shown(MISSION_PT_PASS);
    const done = { afloat: 0, arrived: 3, resolved: true };
    expect(d.flags(t01(PASS_BARGE, done), 2000, MISSION_PT_PASS) & CV_EVENT).toBe(CV_EVENT);
    d.shown(MISSION_PT_PASS);
    const after = t01({ threatPhase: PT_PATROL }, done);
    const f = d.flags(after, 3000, MISSION_PT_PASS);
    expect(rowAt(after, CALL_SUNK, f, d)).toEqual([MISSION_CONVOY_EVENT, '大発 上陸 3/3 ・ 帰投せよ', HOME_COLOR_TEXT]);
    d.shown(MISSION_CONVOY_EVENT);
    expect(d.flags(after, 2950 + SHOW + 100, MISSION_CONVOY_EVENT) & CV_EVENT).toBe(0);
    // 沈没の出来事の途中で最後の 1 隻が上陸: 沈没の出来事が残り、文は「大発 1 隻 沈没 ・ 上陸 2/3 ・ 帰投せよ」
    const c3 = new PtLineClock();
    c3.flags(t01({}, { afloat: 2, arrived: 1 }), 500, MISSION_PT);
    const sunkOne = t01({}, { afloat: 1, sunk: 1, arrived: 1 });
    expect(c3.flags(sunkOne, 1000, MISSION_PT) & CV_EVENT).toBe(CV_EVENT);
    expect(c3.convoyEvent).toBe(CONVOY_EV_SUNK);
    c3.shown(MISSION_CONVOY_EVENT);
    const done2 = { afloat: 0, sunk: 1, arrived: 2, resolved: true };
    const f3 = c3.flags(t01({}, done2), 1500, MISSION_CONVOY_EVENT);
    expect(f3 & CV_EVENT).toBe(CV_EVENT);
    expect(c3.convoyEvent).toBe(CONVOY_EV_SUNK);
    expect(convoyEventLine(cv(done2), c3.convoyEvent).text).toBe('大発 1 隻 沈没 ・ 上陸 2/3 ・ 帰投せよ');
    expect(c3.flags(t01({}, done2), 1000 + SHOW + 100, MISSION_CONVOY_EVENT) & CV_EVENT).toBe(0);
  });
});
