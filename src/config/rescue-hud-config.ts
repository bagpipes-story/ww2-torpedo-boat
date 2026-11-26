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

/**
 * 任務の行（v0.8.5 IP5。実機 2 回目「救助している最中の人数とフィッチに渡している時の人数の表示が他のメッセージが出ると見えなくなってしまう」「成否判定に関わる任務メッセージと
 * 通常メッセージは段落分けて表示させる」）: 上中央の 3 行目（敵影と発見）の下に固定の 4 行目を 1 本（ui/rescue-mission-line）。出来事は今の 2 行目のまま（任務の行を替えない）。
 * 字の px（3 行目と同じ 20）・3 行目の上端からの段（3 行目 20 px の行の高さ 26 ＋ すき間 8）・板の内の余白 px（左右・上下）・板の色と α・縁の太さ・角の丸み。
 * 置き場所の根拠（tests/rescue-mission-line）: 板は y 110〜142 ＝ 3 行目の下端 106 より下・上の縁の端の印（三角の上端 170・帰投と生存者のラベルの上端 175）より上。
 * 字の幅の上限は論理幅 − 2 × 362（W 1280 で 556・W 1560 で 836。板の左端 ≥ 350＝左上の燃料の注意「全速では届かない・減速」〔x 144〜342・y 126〜149〕の右 8 px。右の技能の列〔x ≥ W − 112〕にも掛からない。
 * 収まらない文〔達成の尾・満員の尾〕は組み直した時だけ縮める）
 */
export const RESCUE_MISSION_LINE_PX = 20;
export const RESCUE_MISSION_LINE_DY = 34;
export const RESCUE_MISSION_LINE_PAD_X = 12;
export const RESCUE_MISSION_LINE_PAD_Y = 3;
export const RESCUE_MISSION_LINE_SIDE_KEEP_PX = 362;
export const RESCUE_MISSION_LINE_FILL = 0x0a1626;
export const RESCUE_MISSION_LINE_FILL_ALPHA = 0.62;
export const RESCUE_MISSION_LINE_STROKE_W = 2;
export const RESCUE_MISSION_LINE_RADIUS = 6;
/** 任務の行の頭の札（「［史実］」と同じ全角の括弧）と、達成の数に届いた時の尾（帰投で達成＝帰投しなければ未達のまま） */
export const RESCUE_MISSION_TAG_JA = '［任務］';
export const RESCUE_MISSION_DONE_JA = '帰投で達成';
/**
 * 砲台の端の印（v0.8.5 IP5。実機 2 回目「沿岸砲もきちんと描画してください」）: 210 mm の砲台は岸の線から陸へ 600 m（data の inland_m）＝浅瀬の縁から 850 m 先で、
 * 艇から見える画面（ズーム 0.75 で縦 960 m・先読み 320 m）にほとんど入らない。画面の外にある砲台を、射界の内にいる間か撃ってから HOLD_MS の間、赤い「砲台 N m」で縁に出す
 * （50 m 刻みの四捨五入・ラベルは矢印の上）。撃った時は矢印を PULSE_SCALE 倍から PULSE_MS で戻す（砲口の閃光の代わり）。見た目だけ（世界は読むだけ）
 */
export const RESCUE_BATTERY_MARKER_JA = '砲台';
export const RESCUE_BATTERY_MARKER_STEP_M = 50;
export const RESCUE_BATTERY_MARKER_HOLD_MS = 6000;
export const RESCUE_BATTERY_PULSE_MS = 450;
export const RESCUE_BATTERY_PULSE_SCALE = 1.8;
