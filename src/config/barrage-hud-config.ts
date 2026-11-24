// 煙幕への乱射（v0.8.4。史実モードだけ。ui/barrage-lines・systems/smoke-barrage-fire）の見せ方の定数。ゲームの強さの値ではない（撃つ距離・散布・速さは data/hit_rate_model.json の
// historical_mode.smoke_barrage）。何も import しない。
/** 乱射の弾が自艇からこの m 以内に落ちたら 2 行目に「煙の中へ乱射されている」 */
export const SMOKE_BARRAGE_HUD_NEAR_M = 150;
/** 2 行目に出す ms（ほかの出来事と同じ 4 秒＝出ていた ms の和。上の行に隠れている間は待つ。出ている間に次の弾が近くに落ちれば数え直す） */
export const SMOKE_BARRAGE_EVENT_SHOW_MS = 4000;
