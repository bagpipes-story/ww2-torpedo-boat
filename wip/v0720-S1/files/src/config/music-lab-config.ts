// v0.7.2 S1（アートと音③：BGM と命中スローの音。spec-v0720 §7・brief L14）: 曲の試聴の場（?sfxlab。scenes/music-lab-scene）の語と置き方。論理 px（高さ 720・幅 1280〜1584）。
// 割り付け（行の上 124・高さ 84・間 10・行の名前の幅 236・列の間 16・下の段の「戻る」320 × 84）は v0.7.1 の効果音の試聴の場と同じ（ui/sound-lab-layout の矩形をそのまま使う）。
// 何も import しない（ui/music-lab-layout と tests/music-lab が node で読んでも game-config → screen-fit の DOM を引かない。sound-lab-config と同じ）。ゲームの数値ではないので data/*.json には置かない。

/** 上の説明（ビルド番号の下・中央。折り返す。論理幅 1280 で 2 行＝行の上 124 より上） */
export const MUSIC_LAB_HEAD_JA = '曲の試聴（v0.7.2）: タイトルの曲を A・B・C から選んでください（（今）がゲームの曲）。知っている曲に似ていたら一言ください（その案は作り直します）';
/** 行の名前と、その下の小さい一言（行 0＝タイトルの曲。S2 で任務の曲の行・S3 で命中スローの行を足す） */
export const MUSIC_LAB_ROW_LABELS_JA: readonly string[] = ['タイトルの曲'];
export const MUSIC_LAB_ROW_SUBS_JA: readonly string[] = ['押すと作って鳴らす'];
/**
 * タイトルの曲の候補（並びは config/sfx-music-config の MUSIC_TITLE_KEYS＝A・B・C）: 記号・名前・2 行目の一言。ボタンの題は「記号 名前」、ゲームの曲（既定）は「記号（今）」だけ
 * （v0.7.1 IP4 と同じ: 論理幅 1280 の 4 列のボタン 233 px に収める）で、名前は 2 行目へ
 */
export const MUSIC_LAB_LETTERS: readonly string[] = ['A', 'B', 'C'];
export const MUSIC_LAB_NAMES_JA: readonly string[] = ['静かな夜の海', '小太鼓と金管', 'ラジオの哀愁'];
export const MUSIC_LAB_NOTES_JA: readonly string[] = ['パッドと鈴・63 BPM', '行進・105 BPM', '1940 年代・70 BPM'];
/** 行 0 の 4 つ目のボタン（鳴っている曲を止める） */
export const MUSIC_LAB_STOP_JA = '止める';
export const MUSIC_LAB_STOP_SUB_JA = '0.5 秒で消す';
/** ゲームの曲の印（効果音の試聴の場と同じ） */
export const MUSIC_LAB_DEFAULT_MARK_JA = '（今）';
/** 押した候補のボタンの 2 行目（作っている間） */
export const MUSIC_LAB_BUILDING_SUB_JA = '作成中…';
/** 下の段の 2 つ目のボタン（効果音の試聴の場へ。ui/music-lab-layout の musicLabSideRect）と、効果音の試聴の場からここへ戻るボタン */
export const MUSIC_LAB_TO_SFX_JA = '効果音の試聴へ';
export const MUSIC_LAB_FROM_SFX_JA = '曲の試聴へ';
/** 右下の状態の一文（変わった時だけ書き換える） */
export const MUSIC_LAB_STATUS_IDLE_JA = 'ボタンを押すと作って鳴らします';
export const MUSIC_LAB_STATUS_NONE_JA = 'この端末では音が出せません';
export const MUSIC_LAB_STATUS_WAIT_JA = '音の準備中…（もう一度押してください）';
export const MUSIC_LAB_STATUS_BUILDING_JA = '作成中… ';
export const MUSIC_LAB_STATUS_PLAYING_JA = '鳴らしている: ';
export const MUSIC_LAB_STATUS_STOPPED_JA = '止めました';
