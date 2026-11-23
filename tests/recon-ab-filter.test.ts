// v0.8.2 S4（lead の L48）: us_05 の再生と HUD の A/B（scripts/headless/ab-replay・hud-ab の RECONUI=1）で S4 の新しい文と中継の端の印だけを比べから外す濾し
// （scripts/headless/recon-filter の RECON_FILTER・reconHud・reconPair）を固定する。v0.8.1 の tests/anchor-ab-filter の写し。
// - 印（lineRe）は S4 の新しい文（2 行目の報告の出来事 6 つ・常の文・呼びかけの「報告済み ・ 帰投せよ」・片道の列のレーダーの文）にだけ当たり、今の us_05 の HUD の文には当たらない。
// - 中継の印の物（黄の字・砂色の矢印の絵）は両方の側で除く。ほかの物（緑の印も）は残す。濾しの試し（inject）は隠していない字に 'X' を足す。配線（RECONUI で reconPair へ・B を先に）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RELAY_RING_TEXT } from '../src/config/recon-hud-config';
import { RADAR_MARKER_TEXT_COLOR } from '../src/config/strait-hud-config';
import { RECON_BOOM_JA, RECON_RELAYED_JA, reconCapHitLineJa, reconRadioLineJa, reconSeenLineJa, reconSentLineJa } from '../src/ui/recon-texts';

const SRC = readFileSync('scripts/headless/recon-filter.mjs', 'utf8');
const AB = readFileSync('scripts/headless/ab-replay.mjs', 'utf8');
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
const F = new Function(`return ${block('export const RECON_FILTER = ').replace('export const RECON_FILTER = ', '')};`)() as { lineRe: string; mask: string; dropColor: string; dropTex: string };
const reconHud = new Function(`${block('export function reconHud(').replace('export ', '')}; return reconHud;`)() as (objs: Obj[], f: Record<string, unknown>, k: number) => Obj[];

const NEW = [reconSeenLineJa('戦艦', 20), reconSentLineJa('戦艦', 2, '東へ 18 ノット'), reconRadioLineJa('西', '隣の分隊'), RECON_RELAYED_JA, reconCapHitLineJa('戦艦', 3), reconCapHitLineJa('重巡', 1), RECON_BOOM_JA,
  '報告: 戦艦を目で確かめよ（レーダーでは艦種が分からない）', '報告: 追尾 12 秒 ・ あと 8 秒', '無線故障 ・ 隣の分隊（黄色い輪）で中継', '報告済み ・ 帰投せよ  800 m', '接触が東（スリガオ海峡）へ消えた'];
/** 今の us_05 の HUD の文の例（S3 のビルドの HUD に出ていた文の形） */
const OLD = ['命中 0 ・ 撃沈 0/7', '撃沈！帰投せよ  800 m', '魚雷なし 帰投せよ  1200 m', '燃料少 帰投せよ  900 m', 'レーダー探知！ 西南西 4600 m ・ 接触 1 ・ 目では見えない', 'レーダー: 西に新しい接触 3600 m ・ 接触 5',
  '衝突の危険！ 戦艦 400 m ・ 艦首がこちらへ', '敵影あり ・ 未発見 ・ 見つかる距離 800 m', '日本の艦隊は東へ退く ・ 追うか帰投か', 'レーダー 2400 m', '帰投 2300 m', '敵 900 m', '夜明けまで 12 秒', '接触が東（ビラ）へ消えた ・ 揚陸を終えると同じ海峡を戻ってくる'];

describe('us_05 の濾し（scripts/headless/recon-filter の RECON_FILTER・reconHud）', () => {
  it('印は S4 の新しい文にだけ当たり、今の us_05 の HUD の文には当たらない。除く物は中継の輪の黄の字と砂色の矢印の絵。隠した物の字は <S4>', () => {
    const re = new RegExp(F.lineRe);
    for (const t of NEW) expect(re.test(t), t).toBe(true);
    for (const t of OLD) expect(re.test(t), t).toBe(false);
    expect([F.mask, F.dropColor, F.dropTex]).toEqual(['<S4>', RELAY_RING_TEXT, 'tex-coast-marker']);
  });
  it('両方の側で中継の印を除き、出し側は当たる Text を記録して隠す。もう一方は印のフレームのその添字だけを隠す。緑の印・ほかの物は触らない。印の無いフレームの違いは残る', () => {
    const hud = (l2: string, relay: boolean): Obj[] => [
      { type: 'Text', text: 'FPS 60', color: '#e6eef7' },
      { type: 'Text', text: l2, color: '#e6eef7' },
      { type: 'Text', text: '敵影なし ・ 未発見 ・ 見つかる距離 800 m', color: '#cfd8e3' },
      ...(relay ? [{ type: 'Image', tex: 'tex-coast-marker' }, { type: 'Text', text: '中継 2100 m', color: RELAY_RING_TEXT }] : []),
      { type: 'Text', text: 'レーダー 2400 m', color: RADAR_MARKER_TEXT_COLOR },
      { type: 'Image', tex: 'tex-radar-marker' },
    ];
    const src = { ...F, re: F.lineRe, source: true, marks: {} as Record<number, number[]>, inject: false };
    const b0 = reconHud(hud('レーダー探知！ 西南西 4600 m ・ 接触 1 ・ 目では見えない', true), src, 0);
    const b1 = reconHud(hud('報告: 追尾 3 秒 ・ あと 17 秒', true), src, 1);
    expect(src.marks).toEqual({ 1: [1] });
    expect(b0).toEqual(hud('レーダー探知！ 西南西 4600 m ・ 接触 1 ・ 目では見えない', false)); // 中継の印は除き、緑の印は残す
    const other = { ...F, re: F.lineRe, source: false, marks: src.marks, inject: false };
    expect(reconHud(hud('命中 0 ・ 撃沈 0/7', false), other, 1)).toEqual(b1); // 同じフレームの A（今の文・中継の印なし）も隠れて同じ
    expect(reconHud(hud('命中 1 ・ 撃沈 0/7', false), other, 0)).not.toEqual(b0); // 印の無いフレームの違いは残る
    const inj = reconHud(hud('命中 0 ・ 撃沈 0/7', false), { ...other, inject: true }, 1);
    expect(inj[2]!.text).toBe('敵影なし ・ 未発見 ・ 見つかる距離 800 mX');
  });
  it('配線（source）: ab-replay は RECONUI で reconPair へ（B が出し側で先に回り、印を A へ渡す）。ほかの組と ANCHORUI は今のまま', () => {
    expect(AB).toContain("import { reconPair } from './recon-filter.mjs';");
    expect(AB).toContain("reconui: process.env.RECONUI === '1'");
    expect(AB).toContain('else if (c.reconui) [ra, rb] = await reconPair(pa, pb, o, c, abRun);');
    expect(AB).toContain('if (c.anchorui) [ra, rb] = await anchorPair(pa, pb, o, c, abRun);');
    expect(SRC).toContain('const rb = await pb.page.evaluate(abRun, { ...o, s4: { ...f, source: true, marks: {}, inject: false } });');
    expect(SRC).toContain('const ra = await pa.page.evaluate(abRun, { ...o, s4: { ...f, source: false, marks: rb.marks, inject: c.filtertest === true } });');
  });
});
