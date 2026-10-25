// Result の本文の枝（v0.6.7 S0。scenes/result-scene の大発掃討／米PT／魚雷の枝を純粋な関数に写した。文・字の大きさ・色・後ろの間は v0.6.6 のまま。tests/result-body-neutral が pin）。
// 返すのは行の並びだけで、y の足し方・画面の幅への縮め（line() の閉包）は scene に残す。Phaser も DOM を読む config も使わない（tests から型検査ごと読める）。
import { HUD_COLOR_STRONG, HUD_FONT_HEADING_PX, HUD_FONT_STATUS_PX, HUD_FONT_STEP_PX } from '../config/hud-text-config';
import { HUD_COLOR_KPI, RESULT_CAMPAIGN_KPI_JA, RESULT_HISTORICAL_KPI_JA } from '../config/result-text-config';
import type { BandSummary } from '../core/hit-rate';
import { convoyResultLine } from './convoy-lines';
import { engineResultLine } from './engine-lines';
import { gunboatResultLineJa } from './gunboat-lines';
import { bargeResultLines } from './hud-lines';
import { ptResultLines } from './pt-lines';
import type { BargeResult, ConvoyResult, EngineResult, GunboatResult, PtResult } from './result-types';

/** 本文の 1 行: 文・字の大きさ px・色（undefined なら hudTextStyle の既定の色）・後ろに節の間（RESULT_SECTION_GAP）を足すか（行の間 RESULT_LINE_GAP はいつも） */
export interface ResultBodyLine {
  text: string;
  px: number;
  color: string | undefined;
  sectionAfter: boolean;
}

/** 本文が読む Result の材料（scenes/result-scene の MissionResult がそのまま満たす。result-scene は Phaser を import するので構造の型で読む） */
export interface ResultBodySource {
  hunt: BargeResult | null;
  pt: PtResult | null;
  convoy: ConvoyResult | null;
  engine: EngineResult | null;
  gunboat: GunboatResult | null;
  detections: number;
  returned: boolean;
  objectiveDone: boolean;
  shots: readonly unknown[];
  capacity: number;
  hits: number;
  duds: number;
  misses: number;
  bands: readonly BandSummary[];
  kpi: { readonly byBand: readonly string[]; readonly legend: string } | null;
  sortie: { readonly historical: boolean };
}

/**
 * 見出しの下の本文（大発掃討 v0.4.2・米PT v0.6.3（輸送隊 v0.6.4・隼艇 v0.6.6・機関の不調 v0.6.5）・魚雷（距離帯と通算の命中率 v0.5.0））。
 * hardV はハードの違いのある任務のハード（輸送隊の 1 行目にノルマの達成／未達を出す。見出しの「（ハード）」と同じ条件。v0.6.6 レビュー ux:ux-7）
 */
export function resultBodyLines(r: ResultBodySource, hardV: boolean): ResultBodyLine[] {
  const out: ResultBodyLine[] = [];
  const line = (text: string, px: number, color?: string): void => {
    out.push({ text, px, color, sectionAfter: false });
  };
  const section = (): void => {
    out[out.length - 1]!.sectionAfter = true;
  };
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
  } else {
    const fired = r.shots.length;
    const unfired = r.capacity - fired;
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
  return out;
}
