// レーダーの輝点の見せ方の定数（v0.8.0 S2。spec-v0800 §3.2 の D-R2・§4.10・§5.2・§7 の 1・3。assets/radar-art と systems/radar-view が読む）。
// ゲームの強さの値ではない（射程・掃引・陸の反射・丸めは data/hit_rate_model.json の radar。CLAUDE.md §2「アート」の作法）。輝点はみな同じ色と大きさ（種類・針路・速さは出さない＝D-R2）。
// 薄れ方は記録の掃引の秒からの経過（固定ステップの時計）を段に丸めて、段が変わった時だけ α を書く（tween なし）。何も import しない。

/** 輪の絵の鍵（レーダーのある任務で初めて使う時に 1 回作る＝ほかの任務は絵の鍵が増えない） */
export const RADAR_BLIP_TEX_KEY = 'tex-radar-blip';
/** 輪の色（緑。PPI の蛍光の見立て） */
export const RADAR_BLIP_COLOR = 0x6dff8c;
/** 輪の半径と線の幅（世界の m。丸めの格子 50 m より大きく、艦の絵（長さ約 236 m）の外にはみ出る大きさ） */
export const RADAR_BLIP_RADIUS_M = 80;
export const RADAR_BLIP_LINE_M = 10;
/** 輪の外の淡い光（同じ中心の太い線）の幅 m と α */
export const RADAR_BLIP_GLOW_M = 26;
export const RADAR_BLIP_GLOW_ALPHA = 0.28;
/** 置いたばかりの α と、次の掃引の直前の α（間は直線） */
export const RADAR_BLIP_ALPHA_FRESH = 0.9;
export const RADAR_BLIP_ALPHA_OLD = 0.25;
/** 薄れの段の数（brief L15 の 10 段） */
export const RADAR_BLIP_FADE_STEPS = 10;
/** 描く深さ（航跡 4 の上・魚雷 8 と艦 9 の下＝目で見えている艦の絵が輪の上。config/game-config の DEPTH と合わせる） */
export const RADAR_BLIP_DEPTH = 5;

/** 薄れの段 q（0＝置いたばかり〜RADAR_BLIP_FADE_STEPS＝次の掃引の直前）の α */
export function radarBlipAlpha(q: number): number {
  return RADAR_BLIP_ALPHA_FRESH - ((RADAR_BLIP_ALPHA_FRESH - RADAR_BLIP_ALPHA_OLD) * q) / RADAR_BLIP_FADE_STEPS;
}
