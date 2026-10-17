// 通算の命中率 KPI の保存（v0.5.0。CLAUDE.md §9）: localStorage に記録の版（hit_rate_model.kpi_measurement.record_version）ごとの鍵で 1 つ。
// 読めない・書けない（プライベートブラウズ・容量・無効）ときは記録しないだけで、例外を外へ出さない。任務の終わりに 1 回だけ読み書きする（§7: update では触らない）。
// iOS の注意: Safari とホーム画面のアプリ（v0.5.1 の PWA）は保存場所が別。ホーム画面から遊び始めると記録は 0 から。
import type { GameData } from '../config/game-data';
import type { ShotRecord } from '../core/hit-rate';
import { addAimedShots, parseTally, serializeTally, tallyEntriesJa, type KpiTally } from '../core/kpi-record';

/** Result に出す通算: 帯ごとの「通算 h/n = p%（目標）」（kpi_by_range の順）と、凡例の 1 行 */
export interface KpiResultLines {
  byBand: string[];
  legend: string;
}

const KEY_PREFIX = 'night-hunters.kpi.';

function storage(): Storage | null {
  try {
    return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
  } catch {
    return null;
  }
}

export function loadKpiTally(data: GameData): KpiTally {
  const bands = data.hitRateModel.kpi_by_range;
  let text: string | null = null;
  try {
    text = storage()?.getItem(KEY_PREFIX + data.hitRateModel.kpi_measurement.record_version) ?? null;
  } catch {
    text = null;
  }
  return parseTally(text, bands);
}

function saveKpiTally(data: GameData, t: KpiTally): boolean {
  const s = storage();
  if (!s) return false;
  try {
    s.setItem(KEY_PREFIX + data.hitRateModel.kpi_measurement.record_version, serializeTally(t, data.hitRateModel.kpi_by_range));
    return true;
  } catch {
    return false;
  }
}

/** 任務の記録を通算に足して保存し、Result の材料を返す（撃った帯の行の右に通算、下に凡例 1 行。混んだ夜でも下のボタンに重ならないよう行を増やしすぎない） */
export function recordKpi(data: GameData, shots: readonly ShotRecord[]): KpiResultLines {
  const m = data.hitRateModel.kpi_measurement;
  const t = loadKpiTally(data);
  const added = addAimedShots(t, shots, data.hitRateModel.kpi_by_range, m.aimed_lead_error_deg_max);
  const saved = added === 0 || saveKpiTally(data, t);
  const total = t.shots.reduce((a, b) => a + b, 0);
  return {
    byBand: tallyEntriesJa(t, data.hitRateModel.kpi_by_range),
    legend: `通算 = 正しく狙った 1 本（ずれ ±${m.aimed_lead_error_deg_max}° 以内）の累計 ・ 計 ${total} 本（今回 +${added}）・ 各帯 ${m.min_shots_per_band_before_tuning} 本で判定${saved ? '' : ' ・ 保存できず'}`,
  };
}
