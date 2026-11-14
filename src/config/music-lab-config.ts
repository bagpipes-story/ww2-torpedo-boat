// v0.7.2 S1（アートと音③：BGM と命中スローの音。spec-v0720 §7・brief L14）: 曲の試聴の場（?sfxlab。scenes/music-lab-scene）の語と置き方。論理 px（高さ 720・幅 1280〜1584）。
// S2（brief L25）: 行 1「任務の曲」（静か・緊張・戦闘・自動・止める）と行 2「効果音と一緒に」（台本 3 つ・止める）の語・自動の回し方・台本の表。
// S3（brief L31）: 行 2 の 4 つ目「命中＋スロー」（台本）と行 3「命中スロー」（案 A・B・C。押すたびに今のベッドへ魚雷の命中とスロー）の語・命中の位置。
// 割り付け（行の上 124・高さ 84・間 10・行の名前の幅 236・列の間 16・下の段の「戻る」320 × 84）は v0.7.1 の効果音の試聴の場と同じ（ui/sound-lab-layout の矩形をそのまま使う）。
// 何も import しない（ui/music-lab-layout と tests/music-lab が node で読んでも game-config → screen-fit の DOM を引かない。sound-lab-config と同じ）。ゲームの数値ではないので data/*.json には置かない。

/**
 * 上の説明（ビルド番号の下・中央）。v0.7.2 S3: 2 行を改行で分けた（S2 までは折り返し任せで、論理幅 1280 では語の切れ目で 3 行になり、3 行目が行 0 のボタンの上にかかった）。
 * どの行も論理幅 1280〜1584 の折り返しの幅（論理幅 − 2 × 余白）に収まる＝折り返さない（tests/music-lab が 8 px 刻みで見る）。2 行の下は行の上 124 より上
 */
export const MUSIC_LAB_HEAD_JA = '曲の試聴（v0.7.2）：タイトルの曲と命中スローを A・B・C から選んでください（（今）がゲームの案）\n押すと作って鳴らします。知っている曲に似ていたら一言ください（その案は作り直します）';
/** 行の名前と、その下の小さい一言（行 0＝タイトルの曲・行 1＝任務の曲・行 2＝効果音と一緒に・行 3＝命中スロー＝S3） */
export const MUSIC_LAB_ROW_LABELS_JA: readonly string[] = ['タイトルの曲', '任務の曲', '効果音と一緒に', '命中スロー'];
export const MUSIC_LAB_ROW_SUBS_JA: readonly string[] = ['押すと作って鳴らす', '段で変わる（ゲームと同じ）', 'ゲームと同じ大きさと下げ', '押すと命中とスロー'];
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
/** 行 1（任務の曲）: 段のボタン 3 つ（並びは MUSIC_MOOD_QUIET・TENSE・BATTLE）の題と 2 行目、「自動」 */
export const MUSIC_LAB_MOOD_TITLES_JA: readonly string[] = ['静か', '緊張', '戦闘'];
export const MUSIC_LAB_MOOD_SUBS_JA: readonly string[] = ['静かな層だけ', '見つかった', '撃たれている'];
export const MUSIC_LAB_AUTO_JA = '自動';
export const MUSIC_LAB_AUTO_SUB_JA = '8 秒ずつ回す';
/** 「自動」の回し方: 段（MUSIC_MOOD_*: 0 静か・1 緊張・2 戦闘）の並びをくり返す（静か → 緊張 → 戦闘 → 緊張＝ゲームで起きる移りだけ）・1 段の秒（曲の家族が鳴ってから数える） */
export const MUSIC_LAB_AUTO_MOODS: readonly number[] = [0, 1, 2, 1];
export const MUSIC_LAB_AUTO_STEP_S = 8;
/** 行 2（効果音と一緒に）: 台本 4 つの題と 2 行目（並びは MUSIC_LAB_DEMOS。4 つ目の「命中＋スロー」は S3） */
export const MUSIC_LAB_DEMO_TITLES_JA: readonly string[] = ['静か＋海', '発見＋警報', '戦闘＋砲声', '命中＋スロー'];
export const MUSIC_LAB_DEMO_SUBS_JA: readonly string[] = ['エンジンと海の音', '警報で曲が下がる', '砲声と爆発で下がる', '命中で周りがこもる'];
/**
 * 行 2 の台本（systems/sfx-lab-demo。曲の家族が鳴ってからくり返す）: 段（MUSIC_MOOD_*）・エンジンのループの速力帯（'silent'・'cruise'・'full'）と速さの割合（0〜1。ゲームの式で音量と rate）・
 * くり返しの秒・出来事 [秒, 種類, 聞き手からの x m, y m]。種類は sfx-lab-demo の DEMO_KEYS の添字（0 大砲＝距離の帯で近い音／遠雷・1 機銃・2 大きい水柱・3 大きい爆発・4 魚雷の命中・
 * 5 警報・6 探照灯・7 被弾。5〜7 は位置なしの合図。S3 の 8＝魚雷の命中＋命中スロー＝世界の命中と同じ残り秒）。聞き手は (0, 0)・距離の帯は単発と同じ（400・1,500・4,000 m）。
 * 「戦闘＋砲声」は大きい爆発を帯 0（300 m）と帯 1（1,000 m）で鳴らす。「命中＋スロー」は戦闘の曲・全速のエンジンに魚雷の命中とスローだけ（スローの案は行 3 で選んだ物＝既定はゲームの案）
 */
export const MUSIC_LAB_DEMOS: readonly { readonly mood: number; readonly step: string; readonly speed: number; readonly periodS: number; readonly events: readonly (readonly number[])[] }[] = [
  { mood: 0, step: 'cruise', speed: 0.45, periodS: 8, events: [] },
  { mood: 1, step: 'cruise', speed: 0.55, periodS: 8, events: [[0.6, 5, 0, 0]] },
  {
    mood: 2, step: 'full', speed: 0.9, periodS: 8,
    events: [[0.3, 6, 0, 0], [0.9, 0, 900, -300], [1.5, 2, 60, 40], [2.1, 0, 900, -300], [2.7, 2, -80, 50], [3.2, 1, 250, 0], [3.4, 1, 250, 0], [3.6, 1, 250, 0], [4.0, 3, 300, 100], [5.0, 0, 3000, 500], [6.0, 4, 700, -200], [7.0, 7, 0, 0], [7.4, 3, 1000, -400]],
  },
  { mood: 2, step: 'full', speed: 0.9, periodS: 8, events: [[1.0, 8, 700, -200]] },
];
/** v0.7.2 S3: 行 3（命中スロー）の案（記号は config/sfx-music-config の SFX_SLOW_IDS と同じ並び＝tests/music-lab）の名前と 2 行目の一言。ゲームの案（既定）は「記号（今）」の題と名前の 2 行目 */
export const MUSIC_LAB_SLOW_LETTERS: readonly string[] = ['A', 'B', 'C'];
export const MUSIC_LAB_SLOW_NAMES_JA: readonly string[] = ['低く遅く', '低くだけ', 'なし'];
export const MUSIC_LAB_SLOW_NOTES_JA: readonly string[] = ['こもって遅くなる', '速さはそのまま', '今のまま（v0.7.1）'];
/** 行 3 で鳴らす魚雷の命中の位置（聞き手からの m。距離の帯 1＝「戦闘＋砲声」「命中＋スロー」の魚雷の命中と同じ） */
export const MUSIC_LAB_SLOW_HIT_XY: readonly [number, number] = [700, -200];
/** 状態の一文の曲の名前（任務の家族）と「自動」の印 */
export const MUSIC_LAB_FAMILY_JA = '任務の曲';
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
