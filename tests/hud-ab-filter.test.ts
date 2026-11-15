// v0.8.0 S4（brief L33）: us_04 の再生と HUD の A/B（scripts/headless/ab-replay・hud-ab）で S4 の物だけを比べから外す濾し（S4_FILTER・s4Hud）を固定する。
// - 2 行目の S4 の行の印（lineRe）は S4 の 5 つの文（レーダーの出来事 4・衝突の危険）にだけ当たり、今の 2 行目の文（平常・呼びかけ・水上機・味方機・浅瀬・夜明け）には当たらない。
//   NORADAR の印（radarOnlyRe）はレーダーの 4 つだけ（衝突の危険と 3 行目の「去った」はレーダーを切った夜とも比べる）。
// - 緑の端の印は字の色と絵の鍵で除く（ほかの HUD の物の色・鍵とは重ならない）。隠すのは出し側が印を付けたフレームのその Text だけ。濾しの試し（inject）は隠していない字に 'X' を足す。
// ab-replay は playwright を引くので import せず、source から 2 つを取り出して回す（ページへも toString で渡している＝同じ文）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RADAR_MARKER_TEX_KEY } from '../src/config/radar-art-config';
import { RADAR_MARKER_TEXT_COLOR } from '../src/config/strait-hud-config';
import type { RadarTelemetry } from '../src/core/boat-telemetry';
import { RADAR_EV_FIRST, RADAR_EV_NEW, RADAR_EV_RETURN, RADAR_EV_VILA, radarEventLineJa } from '../src/ui/radar-lines';
import { bowOnLineJa } from '../src/ui/strait-lines';
import { shipsGoneStatusJa } from '../src/ui/dawn-lines';
import { createDawnTelemetry } from '../src/core/dawn-air';

const SRC = readFileSync('scripts/headless/ab-replay.mjs', 'utf8');
/** `start` から中かっこの対で閉じる所まで */
function block(start: string): string {
  const i = SRC.indexOf(start);
  expect(i, start).toBeGreaterThanOrEqual(0);
  let j = SRC.indexOf('{', i);
  for (let d = 0; j < SRC.length; j++) {
    if (SRC[j] === '{') d++;
    else if (SRC[j] === '}' && --d === 0) break;
  }
  return SRC.slice(i, j + 1);
}
type Obj = { type: string; text?: string; color?: string; tex?: string; x?: number };
type Filter = { lineRe: string; radarOnlyRe: string; green: string; tex: string; mask: string };
const F = new Function(`return ${block('export const S4_FILTER = ').replace('export const S4_FILTER = ', '')};`)() as Filter;
const s4Hud = new Function(`${block('export function s4Hud(').replace('export ', '')}; return s4Hud;`)() as (objs: Obj[], f: Record<string, unknown>, k: number) => Obj[];

const r = { enabled: true, contacts: 2, firstS: 0, firstX: 1800, firstY: 1200, firstFromX: 3600, firstFromY: 2600, newX: 150, newY: 1500, fromX: 3600, fromY: 2600, lostX: 6000, widthM: 6000, eastJa: 'ビラ' } as unknown as RadarTelemetry;
const RADAR_TEXTS = [RADAR_EV_FIRST, RADAR_EV_NEW, RADAR_EV_VILA, RADAR_EV_RETURN].map((k) => radarEventLineJa(k, r));
const BOW = bowOnLineJa(4);
/** 今の 2 行目と 3 行目の文の例（どの任務にもある形） */
const OLD_TEXTS = ['命中 0 ・ 撃沈 0/4', '命中 1', '撃沈！帰投せよ  2300 m', '夜明け近し 帰投せよ  2300 m', '水上機 接近 1200 m ・ 航跡あり', '味方機の識別要求！ ［識別］を押せ あと 5 秒', '浅瀬 300 m ・ 15 kt 以下', '敵影なし ・ 未発見 ・ 見つかる距離 500 m', 'レーダー 2400 m', '帰投 2300 m', '敵 900 m', shipsGoneStatusJa({ ...createDawnTelemetry(), forceJa: '東京急行', retireJa: '西' })];

describe('S4 の濾し（scripts/headless/ab-replay の S4_FILTER・s4Hud）', () => {
  it('2 行目の印は S4 の 5 つの文にだけ当たる。NORADAR の印はレーダーの 4 つだけ（衝突の危険・列が去った 3 行目は比べる）。今の文には当たらない', () => {
    const line = new RegExp(F.lineRe);
    const radar = new RegExp(F.radarOnlyRe);
    for (const t of RADAR_TEXTS) expect([line.test(t), radar.test(t)], t).toEqual([true, true]);
    expect([line.test(BOW), radar.test(BOW)]).toEqual([true, false]);
    for (const t of OLD_TEXTS) expect([line.test(t), radar.test(t)], t).toEqual([false, false]);
    expect([F.green, F.tex, F.mask]).toEqual([RADAR_MARKER_TEXT_COLOR, RADAR_MARKER_TEX_KEY, '<S4>']);
  });
  it('出し側は S4 の行の Text を見つけて印を付け隠す。もう一方は印のフレームのその添字だけを隠す。緑の印（字と矢印）はどちらでも除く。ほかの物は触らない', () => {
    const hud = (l2: string, green: boolean): Obj[] => [
      { type: 'Text', text: 'FPS 60', color: '#e6eef7' },
      { type: 'Text', text: l2, color: '#e6eef7' },
      { type: 'Text', text: '敵影なし ・ 未発見 ・ 見つかる距離 500 m', color: '#cfd8e3' },
      ...(green ? [{ type: 'Image', tex: F.tex }, { type: 'Text', text: 'レーダー 2400 m', color: F.green }] : []),
      { type: 'Image', tex: 'tex-home-marker' },
    ];
    const src = { ...F, re: F.lineRe, source: true, marks: {} as Record<number, number>, inject: false };
    const b0 = s4Hud(hud('命中 0 ・ 撃沈 0/4', true), src, 0);
    const b1 = s4Hud(hud(RADAR_TEXTS[0]!, true), src, 1);
    expect(src.marks).toEqual({ 1: 1 });
    expect(b0).toEqual(hud('命中 0 ・ 撃沈 0/4', false));
    expect(b1[1]).toEqual({ type: 'Text', text: '<S4>' });
    expect(b1.length).toBe(4);
    const other = { ...F, re: F.lineRe, source: false, marks: src.marks, inject: false };
    expect(s4Hud(hud('命中 0 ・ 撃沈 0/4', false), other, 1)).toEqual(b1); // 同じフレームの A の 2 行目（今の文）も隠れて同じになる
    expect(s4Hud(hud('命中 0 ・ 撃沈 0/4', false), other, 0)).toEqual(b0); // 印の無いフレームは隠さない
    expect(s4Hud(hud('命中 1', false), other, 0)).not.toEqual(b0); // 印の無いフレームの 2 行目の違いは残る
    const shifted = s4Hud([{ type: 'Text', text: 'X' }, ...hud('命中 0 ・ 撃沈 0/4', false)], other, 1);
    expect(shifted).not.toEqual(b1); // ほかの Text が増えれば違いが残る（添字がずれる）
    const inj = s4Hud(hud('命中 0 ・ 撃沈 0/4', false), { ...other, inject: true }, 1);
    expect(inj[2]!.text).toBe('敵影なし ・ 未発見 ・ 見つかる距離 500 mX'); // 濾しの試し: 隠したフレームの 3 行目に 'X'
  });
  it('配線（source）: 再生の写しと HUD の物の写しの両方が濾しを通る。RADARUI は B・NORADAR は A が出し側で先に回り、印をもう一方へ渡す。結果に masked', () => {
    expect(SRC).toContain("s.hud = o.s4 ? window.__s4Hud(hl.objects('Hud'), o.s4, frames.length).filter((x) => x.type === 'Text').map((x) => x.text) : hl.texts('Hud');");
    expect(SRC).toContain("hud: o.s4 ? window.__s4Hud(hl.objects('Hud'), o.s4, frames.length) : hl.objects('Hud')");
    expect(SRC).toContain("return { ...S4_FILTER, re: c.radarui ? S4_FILTER.lineRe : S4_FILTER.radarOnlyRe, source: side === src, marks: {}, inject: c.filtertest === true && side !== src };");
    expect(SRC).toContain("const src = c.radarui ? 'B' : 'A';");
    expect(SRC).toContain('const r2 = await second.page.evaluate(abRun, { ...o, s4: { ...s4Of(c, c.radarui ? \'A\' : \'B\'), marks: r1.marks } });');
    expect(SRC).toContain("if (!c.radarui && !c.noradar) return null;"); // ほかの組は今のまま（濾しなし）
    expect(SRC).toContain("if (w.radar && !o.noradar) s.rd = ");
  });
});
