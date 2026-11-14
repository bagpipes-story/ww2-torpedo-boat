// v0.7.1 IP2（実機 2 回目）・IP3（実機 3 回目）・IP4（実機 4 回目。弾倉 B・魚雷 F に決まった後も次の試聴のために残す）: 音の試聴の場（?sfxlab。scenes/sound-lab-scene）の置き方と語。論理 px（高さ 720・幅 1280〜1584）。ゲームの数値ではないので data/*.json には置かない。
// 何も import しない（ui/sound-lab-layout と tests/sound-lab が node で読んでも game-config → screen-fit の DOM を引かない。title-layout-config と同じ）。
// 再生の秒（「続けて聞く」の間・最初のタップの待ち）は config/sfx-config の SFX_LAB。

/** 上の説明（ビルド番号の下・中央。折り返す。IP4 の文は論理幅 1280 でも 1 行に収まる＝2 行になっても行の上 124 より上） */
export const SOUND_LAB_HEAD_JA = '音の試聴（v0.7.1）: 弾倉は B・魚雷は F に決めました（（今）の印）。ほかの案は比べる用に残しています';
export const SOUND_LAB_HEAD_Y = 52;
export const SOUND_LAB_HEAD_PX = 22;
/**
 * 行（assets/sfx-variants の SFX_LAB_ROWS の 4 行と「続けて聞く」）: 左に行の名前、右にその行の案のボタン（4 つか 5 つ）。IP3 で 5 行にしたので高さ 96 → 84 px
 * （iPhone の表示倍率 0.483〜0.546 で 41 pt 以上。5 つの行のボタンは論理幅 1280 で幅 183 px）
 */
export const SOUND_LAB_ROW_TOP = 124;
export const SOUND_LAB_ROW_H = 84;
export const SOUND_LAB_ROW_GAP = 10;
export const SOUND_LAB_LABEL_W = 236;
export const SOUND_LAB_LABEL_PX = 26;
export const SOUND_LAB_LABEL_SUB_PX = 17;
export const SOUND_LAB_COL_GAP = 16;
export const SOUND_LAB_BUTTON_PX = 30;
export const SOUND_LAB_NOTE_PX = 18;
/** 行の名前（並びは assets/sfx-variants の SFX_LAB_ROWS と同じ・最後は「続けて聞く」）と、その下の小さい一言 */
export const SOUND_LAB_ROW_LABELS_JA: readonly string[] = ['弾倉の始め', '弾倉の終わり', '魚雷の発射', '魚雷の発射（新）', '続けて聞く'];
export const SOUND_LAB_ROW_SUBS_JA: readonly string[] = ['抜く', '差す・槓桿', '前の案 A〜D', '新しい案 E〜I', '始め → 1.2 秒 → 終わり'];
/** 「続けて聞く」のボタンの 2 行目 */
export const SOUND_LAB_PAIR_NOTE_JA = '弾倉の始め＋終わり';
/** ゲームで今鳴っている案の印 */
export const SOUND_LAB_DEFAULT_MARK_JA = '（今）';
/** 左下「戻る」（タイトルへ。差し替えた音は既定に戻す） */
export const SOUND_LAB_BACK_JA = '戻る（タイトルへ）';
export const SOUND_LAB_BACK_W = 320;
export const SOUND_LAB_BACK_H = 84;
export const SOUND_LAB_BACK_PX = 26;
/** 右下の状態の一文（押した時だけ書き換える） */
export const SOUND_LAB_STATUS_PX = 22;
export const SOUND_LAB_STATUS_IDLE_JA = 'ボタンを押すと鳴ります';
export const SOUND_LAB_STATUS_WAIT_JA = '音の準備中…（もう一度押してください）';
export const SOUND_LAB_STATUS_NONE_JA = 'この端末では音が出せません';
export const SOUND_LAB_PLAYED_JA = '鳴らした: ';
