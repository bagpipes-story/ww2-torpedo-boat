// 空襲下の退避（v0.6.11。jp_03「運天港・空襲下の退避」）の絵の定数（S4。systems/evac-boats-view・systems/evac-terrain）。ゲームの強さの値ではないので data/*.json には置かない
// （landing-config・convoy-config と同じ考え）。何も import しない。HUD・輪・札の定数は S5（ui/evac-markers・ui/evac-lines）。

/** 隊が陰に隠れている（G_HIDDEN）間の艇の絵と、操作中の隊が隠れている間の自艇の絵の濃さ（壕に上げ終えた艇は描かない） */
export const EVAC_HIDDEN_ALPHA = 0.45;
/** 屋我地島（北の縁 y 0 の外の陸）の幅 m（南の岸は entities/shallows が mission.coast.land_m で描く） */
export const EVAC_ISLAND_LAND_M = 400;
/** 屋我地島の名の字の大きさ px（南の岸の COAST_LABEL_FONT_PX と同じ） */
export const EVAC_ISLAND_LABEL_PX = 36;
/** 壕の口（南の岸の陸の側に掘った暗い四角）の幅・奥行き m と色 */
export const EVAC_CAVE_MOUTH_W_M = 70;
export const EVAC_CAVE_MOUTH_D_M = 60;
export const EVAC_CAVE_COLOR = 0x0b0f0a;
/** 壕から海へ下ろすレール（1 本）の線の太さ m と色（壕の口から隠れ場所の点まで） */
export const EVAC_RAIL_WIDTH_M = 4;
export const EVAC_RAIL_COLOR = 0x7a6a48;
/** 陰（北の岸の際の暗い海）の楕円の幅・高さ m と色・濃さ（史実の裏付け無しの design） */
export const EVAC_COVER_W_M = 300;
export const EVAC_COVER_H_M = 160;
export const EVAC_COVER_COLOR = 0x0e1a24;
export const EVAC_COVER_ALPHA = 0.35;
