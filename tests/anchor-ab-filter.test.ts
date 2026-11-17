// v0.8.1 S4（lead の L69）: us_06 の再生と HUD の A/B（scripts/headless/ab-replay・hud-ab の ANCHORUI=1）で S4 の新しい文だけを比べから外す濾し（scripts/headless/anchor-filter の
// ANCHOR_FILTER・anchorHud・anchorPair）を固定する。
// - 印（lineRe）は S4 の新しい文（「暗い岸を背にした」「停泊していた艦が動き出した！」・ハードの「衝突の危険！ 駆潜艇」・夜明けの帯の「輸送船は泊地に残る」）にだけ当たり、
//   今の us_06 の HUD の文（平常・呼びかけ・レーダーの出来事・駆逐艦の衝突の危険・3 行目・夜明けの帯の今の文・空襲）には当たらない。
// - 出し側（B）が当たる Text の添字を 1 フレームに幾つでも記録し、両方の側でその添字の Text だけを隠す。ほかの Text・緑の端の印は触らない（v0.8.0 S4 の濾しと違い緑の印も比べる）。
// - 濾しの試し（inject）は隠していない字に 'X' を足す＝濾しが別の変化を隠さない。配線（ab-replay は ANCHORUI で anchorPair へ・B を先に・結果に masked）。
// v0.8.1 IP1（A＝S4 の commit のビルド）: 印に IP1 の 2 行目の 2 つ（「岸の陰に入った ・ 見つかる距離」・寄り方の手がかり）を足した。S4 の「暗い岸を背にした」の印は残す
// （A の側の文。添字は B で決めるので A の旧い文も同じ添字で隠れる）。手がかりの印は文の全体（$ まで）。
// anchor-filter は playwright を引かないが、ページへ toString で渡す関数なので source から取り出して回す（tests/hud-ab-filter と同じ作法）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RADAR_MARKER_TEXT_COLOR } from '../src/config/strait-hud-config';
import { RADAR_EV_FIRST, RADAR_EV_NEW, radarEventLineJa } from '../src/ui/radar-lines';
import type { RadarTelemetry } from '../src/core/boat-telemetry';
import { ANCHOR_HINT_JA, ANCHOR_UNDERWAY_JA, anchorBackdropLineJa } from '../src/ui/anchor-lines';
import { bowOnLineJa } from '../src/ui/strait-lines';

const SRC = readFileSync('scripts/headless/anchor-filter.mjs', 'utf8');
const AB = readFileSync('scripts/headless/ab-replay.mjs', 'utf8');
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
type Obj = { type: string; text?: string; color?: string; tex?: string };
const F = new Function(`return ${block('export const ANCHOR_FILTER = ').replace('export const ANCHOR_FILTER = ', '')};`)() as { lineRe: string; mask: string };
const anchorHud = new Function(`${block('export function anchorHud(').replace('export ', '')}; return anchorHud;`)() as (objs: Obj[], f: Record<string, unknown>, k: number) => Obj[];

const r = { enabled: true, contacts: 2, firstS: 0, firstX: 3620, firstY: 2380, firstFromX: 5000, firstFromY: 250, newX: 2300, newY: 2050, fromX: 5000, fromY: 250, lostX: 0, widthM: 6000, eastJa: '' } as unknown as RadarTelemetry;
const NEW = [anchorBackdropLineJa(7), anchorBackdropLineJa(24), '暗い岸を背にした ・ 見つかる距離 350 m', ANCHOR_HINT_JA, ANCHOR_UNDERWAY_JA, bowOnLineJa(4, true), '日本の艦は東へ退く ・ 輸送船は泊地に残る ・ 追うか帰投か', '輸送船は泊地に残る ・ 撃つか帰投か', '輸送船は泊地に残る ・ 帰投せよ'];
/** 今の us_06 の HUD の文の例（S3 のビルドの HUD に出ていた文の形） */
const OLD = ['命中 0 ・ 輸送船 健在', '撃沈！帰投せよ  2300 m', '魚雷なし 帰投せよ  1200 m', '燃料少 帰投せよ  900 m', radarEventLineJa(RADAR_EV_FIRST, r), radarEventLineJa(RADAR_EV_NEW, r), bowOnLineJa(4), '敵影あり ・ 未発見 ・ 見つかる距離 350 m',
  '敵影なし ・ 発見された！ ・ 探照灯に照射中！ ・ 見つかる距離 1200 m', '駆逐艦を撃沈', '日本の艦は東へ退く ・ 追うか帰投か', '空襲！ 敵機 4 機 ・ 西から 1800 m ・ 帰投を急げ', '夜明け — 空襲', 'レーダー 2400 m', '帰投 2300 m', '敵 900 m', '夜明けまで 12 秒', `${ANCHOR_HINT_JA}X`, '岸の陰'];

describe('us_06 の濾し（scripts/headless/anchor-filter の ANCHOR_FILTER・anchorHud）', () => {
  it('印は S4 の新しい文 7 つと IP1 の 2 つ（と S4 の旧い背に岸の文）にだけ当たり、今の us_06 の HUD の文には当たらない。隠した物の字は <S4>', () => {
    const re = new RegExp(F.lineRe);
    for (const t of NEW) expect(re.test(t), t).toBe(true);
    for (const t of OLD) expect(re.test(t), t).toBe(false);
    expect(F.mask).toBe('<S4>');
  });
  it('出し側は当たる Text を全部（1 フレームに 2 つでも）記録して隠す。もう一方は印のフレームのその添字だけを隠す。緑の印・ほかの物は触らない。印の無いフレームの違いは残る', () => {
    const hud = (l2: string, banner: string): Obj[] => [
      { type: 'Text', text: 'FPS 60', color: '#e6eef7' },
      { type: 'Text', text: l2, color: '#e6eef7' },
      { type: 'Text', text: '敵影なし ・ 未発見 ・ 見つかる距離 350 m', color: '#cfd8e3' },
      { type: 'Text', text: banner, color: '#e6eef7' },
      { type: 'Text', text: 'レーダー 2400 m', color: RADAR_MARKER_TEXT_COLOR },
      { type: 'Image', tex: 'tex-radar-marker' },
    ];
    const src = { ...F, re: F.lineRe, source: true, marks: {} as Record<number, number[]>, inject: false };
    const b0 = anchorHud(hud('命中 0 ・ 輸送船 健在', '日本の艦は東へ退く ・ 追うか帰投か'), src, 0);
    const b1 = anchorHud(hud(ANCHOR_UNDERWAY_JA, '日本の艦は東へ退く ・ 輸送船は泊地に残る ・ 追うか帰投か'), src, 1);
    expect(src.marks).toEqual({ 1: [1, 3] });
    expect(b0).toEqual(hud('命中 0 ・ 輸送船 健在', '日本の艦は東へ退く ・ 追うか帰投か')); // 印の無いフレームは何も隠さず・緑の印も残す
    expect([b1[1], b1[3]]).toEqual([{ type: 'Text', text: '<S4>' }, { type: 'Text', text: '<S4>' }]);
    expect(b1.length).toBe(6);
    const other = { ...F, re: F.lineRe, source: false, marks: src.marks, inject: false };
    expect(anchorHud(hud('命中 0 ・ 輸送船 健在', '日本の艦は東へ退く ・ 追うか帰投か'), other, 1)).toEqual(b1); // 同じフレームの A（今の文）も隠れて同じ
    expect(anchorHud(hud('命中 1 ・ 輸送船 健在', '日本の艦は東へ退く ・ 追うか帰投か'), other, 0)).not.toEqual(b0); // 印の無いフレームの違いは残る
    const radarMoved = hud('命中 0 ・ 輸送船 健在', '日本の艦は東へ退く ・ 追うか帰投か').map((x) => (x.color === RADAR_MARKER_TEXT_COLOR ? { ...x, text: 'レーダー 2300 m' } : x));
    expect(anchorHud(radarMoved, other, 1)).not.toEqual(b1); // 緑の印の違いも残る（us_04 の濾しと違い除かない）
    const inj = anchorHud(hud('命中 0 ・ 輸送船 健在', '日本の艦は東へ退く ・ 追うか帰投か'), { ...other, inject: true }, 1);
    expect(inj[2]!.text).toBe('敵影なし ・ 未発見 ・ 見つかる距離 350 mX'); // 濾しの試し: 隠したフレームの 3 行目に 'X'
  });
  it('配線（source）: ab-replay は ANCHORUI で anchorPair へ（B が出し側で先に回り、印を A へ渡す）・写しと HUD の物の両方が濾しを通る・結果に masked。ほかの組は今のまま', () => {
    expect(AB).toContain("import { anchorPair } from './anchor-filter.mjs';");
    expect(AB).toContain("anchorui: process.env.ANCHORUI === '1'");
    expect(AB).toContain('if (c.anchorui) [ra, rb] = await anchorPair(pa, pb, o, c, abRun);');
    expect(AB).toContain("s.hud = o.s4 ? window.__s4Hud(hl.objects('Hud'), o.s4, frames.length).filter((x) => x.type === 'Text').map((x) => x.text) : hl.texts('Hud');");
    expect(AB).toContain("hud: o.s4 ? window.__s4Hud(hl.objects('Hud'), o.s4, frames.length) : hl.objects('Hud')");
    expect(SRC).toContain('const rb = await pb.page.evaluate(abRun, { ...o, s4: { ...f, source: true, marks: {}, inject: false } });');
    expect(SRC).toContain('const ra = await pa.page.evaluate(abRun, { ...o, s4: { ...f, source: false, marks: rb.marks, inject: c.filtertest === true } });');
    expect(SRC).toContain('c.masked = Object.keys(rb.marks).length;');
    expect(SRC.replace(/\/\/[^\n]*/g, '')).not.toMatch(/playwright|require\(/);
    expect(readFileSync('scripts/headless/hud-ab.mjs', 'utf8')).toContain("${r.anchorui ? ' ANCHORUI' : ''}");
  });
});
