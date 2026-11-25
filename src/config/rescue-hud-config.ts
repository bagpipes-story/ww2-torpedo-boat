// 救助の任務（v0.8.5 S4。us_07「D-Day・生存者救助」）の HUD の見せ方の定数（spec-v0850 §8.2・§8.3）。ゲームの強さの値ではない（拾う距離・速さ・乗せる数・砲火の距離は data の rescue）。
// 何も import しない（文は ui/rescue-texts、時計は ui/rescue-lines、端の印は ui/rescue-markers、Result は ui/rescue-result）。

/** 1 つの出来事を 2 行目に出す ms（2 行目に出ていた ms の和。上の行に隠れている間は待つ＝v0.8.0〜v0.8.2 の出来事と同じ 4 秒） */
export const RESCUE_EVENT_SHOW_MS = 4000;
/** 常の文の「生存者 5 名 ・ 5 kt 以下で寄せて拾う」を出す一番近い群までの距離 m（拾える距離 40 m ＋ 艇の半長より外から寄せ方を言う） */
export const RESCUE_NEAR_HINT_M = 150;
/** 機雷が見えた出来事の距離の刻み m（四捨五入） */
export const RESCUE_MINE_STEP_M = 10;
/** 端の印: 一番近い群「生存者 650 m」（画面の外の時。50 m 刻みの切り上げ）・乗せている間の「フィッチ 1200 m」（輪の縁まで。100 m 刻みの切り上げ） */
export const RESCUE_SURVIVOR_MARKER_JA = '生存者';
export const RESCUE_SURVIVOR_MARKER_STEP_M = 50;
export const RESCUE_FITCH_MARKER_STEP_M = 100;
/** Result の見出しの後ろの秒・得点の「（救助の後 ×0.9）」の語（昼の任務に「夜明け後」と言わない。ui/result-heading・scenes/result-scene） */
export const RESCUE_AFTER_JA = '救助の後';
/** 救助の時間の終わりに残りを拾う他艦（史実: 駆逐艦ホブソンとバトラー。艦名は CLAUDE.md §11 で使ってよい） */
export const RESCUE_OTHER_SHIPS_JA = 'ホブソンとバトラー';
/** 帰投の輪の呼び名（任務の文。data の return_point に名は無い） */
export const RESCUE_HOME_JA = '沖の集合点';
/** Result の S ボートの想定の注（spec §8.3。ユーザーの決め 2026-11-24「両方で出す」＝史実に無い「もしも」を正直に書く） */
export const RESCUE_SBOAT_ASSUMPTION_JA = 'この朝、史実ではSボートはユタ沖に来ていない（ゲームの想定）';
/** コリーの名の札の置き場所の候補（艦の中心からの m。今夜の群の札と重ならない最初の物＝ui/rescue-label-spot）と札・群の札の大きさの見積もり（字の px ≈ m） */
export const CORRY_LABEL_SPOTS: readonly (readonly [number, number])[] = [
  [0, 140], [-150, 110], [-170, 0], [-150, -110], [0, -150], [160, -120], [170, 0], [150, 120], [0, 230], [-260, 0], [0, -240], [260, 0],
];
export const CORRY_LABEL_HALF_W = 44;
export const CORRY_LABEL_H = 30;
export const SURVIVOR_LABEL_HALF_W = 32;
export const SURVIVOR_LABEL_H = 28;
/** 札どうし・群の絵との間に取るすき間 m */
export const CORRY_LABEL_CLEAR_M = 8;
