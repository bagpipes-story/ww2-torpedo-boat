// Result の本文の枝（v0.6.7 S0 で scenes/result-scene から移した。文・字の大きさ・色・後ろの間は v0.6.6 のまま。tests/result-body-neutral が pin）: 大発掃討／米PT／魚雷。
// v0.6.7 S5: 夜の哨戒機（jp_02）の 2 行の枝（ui/patrol-result-lines）。ほかの枝は変えない。
// v0.6.8 S5: 兵装の新しい道（艦への機銃・対空・狙う艦の無い魚雷）を使った夜だけ、どの枝の後ろにも 1 行（ui/arms-lines の armsResultLineJa）。魚雷の枝の「未発射」から狙う艦の無い魚雷を除く。使わなければ今までの行のまま。
// 返すのは行の並びだけで、y の足し方・画面の幅への縮め（line() の閉包）は scene に残す。Phaser も DOM を読む config も使わない（tests から型検査ごと読める）。
import { HUD_COLOR_STRONG, HUD_FONT_HEADING_PX, HUD_FONT_STATUS_PX, HUD_FONT_STEP_PX } from '../config/hud-text-config';
import { HUD_COLOR_KPI, RESULT_CAMPAIGN_KPI_JA, RESULT_HISTORICAL_KPI_JA } from '../config/result-text-config';
import type { BandSummary } from '../core/hit-rate';
import { armsResultLineJa } from './arms-lines';
import { convoyResultLine } from './convoy-lines';
import { engineResultLine } from './engine-lines';
import { gunboatResultLineJa } from './gunboat-lines';
import { bargeResultLines } from './hud-lines';
import { patrolBombResultJa, patrolSearchResultJa } from './patrol-result-lines';
import { ptResultLines } from './pt-lines';
import type { ArmsResult, BargeResult, ConvoyResult, EngineResult, GunboatResult, PatrolResult, PtResult } from './result-types';

/** 本文の 1 行: 文・字の大きさ px・色（undefined なら hudTextStyle の既定の色）・後ろに節の間（RESULT_SECTION_GAP）を足すか（行の間 RESULT_LINE_GAP はいつも） */
export interface ResultBodyLine { text: string; px: number; color: string | undefined; sectionAfter: boolean }

/** 本文が読む Result の材料（scenes/result-scene の MissionResult がそのまま満たす。result-scene は Phaser を import するので構造の型で読む） */
export interface ResultBodySource {
  hunt: BargeResult | null; pt: PtResult | null; convoy: ConvoyResult | null; engine: EngineResult | null; gunboat: GunboatResult | null;
  /** 夜の哨戒機（v0.6.7。jp_02）。無い任務は null（構造の型で読むので鍵が無い材料も null と同じ） */
  patrol?: PatrolResult | null;
  /** 兵装の新しい道（v0.6.8）。使った夜だけ鍵がある（無ければ今までの行のまま） */
  arms?: ArmsResult;
  detections: number; returned: boolean; objectiveDone: boolean;
  shots: readonly unknown[]; capacity: number; hits: number; duds: number; misses: number; bands: readonly BandSummary[];
  kpi: { readonly byBand: readonly string[]; readonly legend: string } | null;
  sortie: { readonly historical: boolean };
}

/** 見出しの下の本文。hardV はハードの違いのある任務のハード（輸送隊の 1 行目にノルマの達成／未達。見出しの「（ハード）」と同じ条件。v0.6.6 レビュー ux:ux-7） */
export function resultBodyLines(r: ResultBodySource, hardV: boolean): ResultBodyLine[] {
  const out: ResultBodyLine[] = [];
  const line = (text: string, px: number, color?: string): void => void out.push({ text, px, color, sectionAfter: false });
  const section = (): void => void (out[out.length - 1]!.sectionAfter = true);
  const h = r.hunt;
  if (h) {
    // 大発掃討（v0.4.2）: 撃破・上陸と、射撃・距離の記録（実機で数値を合わせる根拠）
    line(`大発 撃破 ${h.sunk} / ${h.total}（ノルマ ${h.quota} ・ 上陸 ${h.beached}）`, HUD_FONT_STEP_PX, HUD_COLOR_STRONG);
    section();
    for (const l of bargeResultLines(h)) line(l, HUD_FONT_HEADING_PX);
  } else if (r.pt) {
    // 米PT（v0.6.3）: 航過・かわした・被弾、見つかった距離と見失わせた回数、予告から初弾、13mm の射撃・命中・撃退・撃沈（実機 1 回目。data を合わせる根拠。CLAUDE.md §9）。
    // 味方の大発の輸送隊（v0.6.4。jp_01）はその上に 1 行目「大発 上陸 2/3 ・ 沈没 1（ノルマ 2） ・ 大発の被弾 9 発」（米PT の 1 行目は 20 px に）
    const [a, b, c, d] = ptResultLines(r.pt, r.detections, r.returned, r.convoy !== null, r.gunboat);
    if (r.convoy) {
      line(convoyResultLine(r.convoy, hardV ? r.objectiveDone : undefined), HUD_FONT_STEP_PX, HUD_COLOR_STRONG);
      if (r.gunboat) line(gunboatResultLineJa(r.gunboat), HUD_FONT_HEADING_PX); // 隼艇（v0.6.6。jp_01 のハード）: 生還／沈没・25mm・狙われた回数（自艇の 25mm の行は自艇の分）
      section();
      line(a, HUD_FONT_HEADING_PX);
    } else {
      line(a, HUD_FONT_STEP_PX, HUD_COLOR_STRONG);
      section();
    }
    line(b, HUD_FONT_HEADING_PX);
    line(c, HUD_FONT_STATUS_PX, HUD_COLOR_KPI);
    if (d) line(d, HUD_FONT_STATUS_PX, HUD_COLOR_KPI);
    if (r.engine) line(engineResultLine(r.engine), HUD_FONT_STATUS_PX, HUD_COLOR_KPI); // 機関の不調（v0.6.5。full_to_limp_s を動かす根拠。CLAUDE.md §9）
  } else if (r.patrol) {
    // 夜の哨戒機（v0.6.7。jp_02）: 捜索・隠れた・見つかった回数と、夜の爆撃と投下から転舵の秒（data を合わせる根拠。CLAUDE.md §9）。魚雷の行は出さない（撃たない任務）
    line(patrolSearchResultJa(r.patrol), HUD_FONT_HEADING_PX, HUD_COLOR_STRONG);
    line(patrolBombResultJa(r.patrol), HUD_FONT_STATUS_PX, HUD_COLOR_KPI);
  } else {
    const fired = r.shots.length;
    const unfired = r.capacity - fired - (r.arms?.blindTorpedoes ?? 0); // 狙う艦の無い魚雷（v0.6.8。駆逐艦がみな出た後）は撃った魚雷で、下の兵装の行が数える
    line(`命中 ${r.hits} / 発射 ${fired}（不発 ${r.duds}、外れ ${r.misses}${unfired > 0 ? `、未発射 ${unfired}` : ''}）`, HUD_FONT_STEP_PX, HUD_COLOR_STRONG);
    section();
    const bandsFired = r.bands.filter((b) => b.shots > 0);
    if (bandsFired.length === 0) line('発射なし', HUD_FONT_HEADING_PX);
    // 通算（v0.5.0）: 撃った帯の行の右に、その帯の通算の命中率と目標帯（命中率チューニングの根拠。CLAUDE.md §9）。凡例は下に 1 行
    const kpi = r.kpi;
    r.bands.forEach((b, i) => {
      if (b.shots > 0) line(`${b.band}: ${b.hits} / ${b.shots}${b.duds > 0 ? `（不発 ${b.duds}）` : ''}${kpi ? `   ${kpi.byBand[i]}` : ''}`, HUD_FONT_HEADING_PX);
    });
    if (kpi) line(kpi.legend, HUD_FONT_STATUS_PX, HUD_COLOR_KPI);
    else if (r.sortie.historical) line(RESULT_HISTORICAL_KPI_JA, HUD_FONT_STATUS_PX, HUD_COLOR_KPI);
    else line(RESULT_CAMPAIGN_KPI_JA, HUD_FONT_STATUS_PX, HUD_COLOR_KPI);
  }
  if (r.arms) line(armsResultLineJa(r.arms), HUD_FONT_STATUS_PX, HUD_COLOR_KPI); // 兵装の新しい道（v0.6.8）: どの枝の後ろにも。使わなかった夜は無い
  return out;
}

/**
 * 本文を角のボタンの上に収める（v0.6.8 レビュー ux-result-height-arms: 暴風・味方機・水上機・KPI 4 帯・兵装の 1 行の us_02 で最後の行が 673 まで下り、暴風の行が両方のボタンに重なった）。
 * n 行（0 行目は見出し）の最後の行の下端 lastBottom が limitY を超えた分を、i 行目は over·i/(n − 1) だけ上げる（見出しは動かさず、行の間がみな同じだけ縮む）。超えなければ 0（今までの位置のまま）。
 * scene が作るときに 1 回だけ呼ぶ（毎フレームの処理は無い）
 */
export function resultFitLiftPx(i: number, n: number, lastBottom: number, limitY: number): number {
  const over = lastBottom - limitY;
  if (!(over > 0) || n < 2 || i <= 0) return 0;
  return (over * Math.min(i, n - 1)) / (n - 1);
}
