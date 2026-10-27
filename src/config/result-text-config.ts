// Result の本文（ui/result-body）が読む色と語（v0.6.7 S0 で ui-config・menu-config から移した。値は同じ。両方が出し直す）。
// 何も import しない（ui/result-body がテストの node 型検査から読まれても game-config → screen-fit の DOM を引かない。hud-text-config と同じ作法）。

/** Result の通算の命中率の行（v0.5.0。今回の記録と見分ける） */
export const HUD_COLOR_KPI = '#e8d48a';
/** Result: 史実モードの魚雷は通算の命中率に数えない（通算はノーマルの調整の根拠。CLAUDE.md §9） */
export const RESULT_HISTORICAL_KPI_JA = '史実モード: 通算の命中率には数えない（通算はノーマルの調整の根拠）';
/** Result: 米PT以外のキャンペーンの魚雷も通算に数えない（v0.6.0。hit_rate_model.kpi_measurement.campaigns） */
export const RESULT_CAMPAIGN_KPI_JA = 'この任務の魚雷は通算の命中率に数えない（通算は米PTの調整の根拠）';
