// 頑張った証（v0.9.0 IP3。IP4 から条件はハード × 史実 × デフォルト＝ユーザーの言葉 2026-11-28「画面はうまくできてるんだけど達成条件をハード×史実 × デフォルトにしてください」。ユーザーの言葉 2026-11-27「史実　デフォルトで達成したシナリオには出撃前の説明画面にトロフィーが表示されたり、全シナリオ史実デフォルトでクリアして場合のみ、
// ご褒美追加装備がもらえるなど、頑張った証が分かるようになればいいな」）の見せ方の定数: トロフィーの絵（コードで描く金の杯。assets/trophy-art）・Briefing の置き方と語・
// Result のご褒美の 1 行・ストアのご褒美の札の語。ゲームの強さの値ではない（ご褒美の効きは data/store.json）。何も import しない（tests が node で読める）。

/** 絵の鍵と、描く大きさ（論理 px の正方形。描く時に RENDER_SCALE を掛け、置く時に 1 / RENDER_SCALE × 表示の大きさ / これ） */
export const TROPHY_TEXTURE_KEY = 'trophy-cup';
export const TROPHY_TEX_PX = 48;
/** 金の杯の色（地・明るい面・影・縁）。Briefing の字と Result の 1 行は TROPHY_TEXT_COLOR */
export const TROPHY_GOLD = 0xd9a93a;
export const TROPHY_GOLD_LIGHT = 0xf7dd86;
export const TROPHY_GOLD_DARK = 0x8f6519;
export const TROPHY_OUTLINE = 0x2e2108;
export const TROPHY_TEXT_COLOR = '#f0cd63';

/**
 * Briefing のトロフィー（頑張った証の形で達成した任務だけ。ほかは何も作らない＝今と同じ画素）: 任務名の行（題 40 px）の右、「← 任務一覧」の左 BRIEF_TROPHY_RIGHT_GAP に右揃え。
 * 左に杯（BRIEF_TROPHY_PX の正方形）、右に「ハード・史実・装備デフォルトで達成」（v0.9.0 IP5。ユーザーの言葉 2026-11-28「「ハード・史実・装備デフォルトで達成」と表示されるようにしてください。
 * （任務終了時の画面も同じ）」。IP4 は「ハード・史実で達成」）。ハードの違いの無い任務（jp_02・jp_05）は史実 × デフォルトで「史実・装備デフォルトで達成」（設計の既定＝語をそろえた）。
 * 縦は題の行の中央。1280 で一番長い題（「スリガオ海峡・最初の接触」・「多号作戦・オルモック湾へ」の 480 px）の右端と杯の間は 26 px（tests/reward）
 */
export const BRIEF_TROPHY_PX = 40;
export const BRIEF_TROPHY_LABEL_PX = 22;
export const BRIEF_TROPHY_GAP_X = 8;
export const BRIEF_TROPHY_RIGHT_GAP = 24;
export const BRIEF_TROPHY_JA = '史実・装備デフォルトで達成';
export const BRIEF_TROPHY_HARD_JA = 'ハード・史実・装備デフォルトで達成';

/** Briefing と Result のトロフィーの文（hard＝その任務にハードの違いがある＝ハード × 史実 × デフォルトで達成した） */
export function briefTrophyJa(hard: boolean): string {
  return hard ? BRIEF_TROPHY_HARD_JA : BRIEF_TROPHY_JA;
}

/** 字の幅の見積もり（半角 0.602 em・全角 1 em。ui/store-texts の estimateTextPx と同じ式） */
function estimatePx(str: string, px: number): number {
  let w = 0;
  for (const ch of str) w += (ch.charCodeAt(0) < 0x2000 ? 0.602 : 1) * px;
  return w;
}

/**
 * Briefing のトロフィーの置き場（論理 px）: backX は「← 任務一覧」の左端、titleY・titlePx は任務名の行。杯の左上 (iconX, iconY)・字の左端 labelX と中央の y・全体の左端 left
 */
export function briefTrophyLayout(backX: number, titleY: number, titlePx: number, hard: boolean): { left: number; right: number; top: number; bottom: number; iconX: number; iconY: number; labelX: number; cy: number } {
  const right = backX - BRIEF_TROPHY_RIGHT_GAP;
  const labelW = estimatePx(briefTrophyJa(hard), BRIEF_TROPHY_LABEL_PX);
  const labelX = right - labelW;
  const iconX = labelX - BRIEF_TROPHY_GAP_X - BRIEF_TROPHY_PX;
  const cy = titleY + titlePx / 2;
  return { left: iconX, right, top: cy - BRIEF_TROPHY_PX / 2, bottom: cy + BRIEF_TROPHY_PX / 2, iconX, iconY: cy - BRIEF_TROPHY_PX / 2, labelX, cy };
}

/**
 * Result の杯（v0.9.0 IP5。ユーザーの言葉「（任務終了時の画面も同じ）」）: この出撃が頑張った証の形で達成した時だけ（core/achieved-record の sortieTrophy）、見出しのすぐ下に
 * Briefing と同じ文（RESULT_TROPHY_LABEL_PX・TROPHY_TEXT_COLOR）を 1 行。杯（RESULT_TROPHY_PX）は字の左に RESULT_TROPHY_GAP_X、杯と字の組を画面の中央にそろえる
 */
export const RESULT_TROPHY_PX = 30;
export const RESULT_TROPHY_LABEL_PX = 22;
export const RESULT_TROPHY_GAP_X = 8;

/** Result の杯の置き場（論理 px）: cx は行の中央、textW は字の幅。字の中央 textCx（原点 0.5 の x）と杯の左端 iconX */
export function resultTrophyLayout(cx: number, textW: number): { textCx: number; iconX: number } {
  const textCx = cx + (RESULT_TROPHY_PX + RESULT_TROPHY_GAP_X) / 2;
  return { textCx, iconX: textCx - textW / 2 - RESULT_TROPHY_GAP_X - RESULT_TROPHY_PX };
}

/** Result の 1 行（ご褒美を渡した出撃だけ。names はご褒美の名） */
export function rewardResultJa(names: readonly string[]): string {
  return `ご褒美: ${names.join('・')} を手に入れた`;
}

/** ストアのご褒美の札（値段の代わり）と、まだの時の進み（主ボタンの 2 行目）。v0.9.0 IP4 からハード × 史実 × デフォルト（jp_02・jp_05 は史実 × デフォルト） */
export function storeRewardJa(total: number): string {
  return `ご褒美（ハード史実デフォルト全${total}任務達成）`;
}
export function storeRewardProgressJa(done: number, total: number): string {
  return `ハード史実デフォルト ${done}/${total}`;
}
export const STORE_REWARD_ACTION_JA = 'ご褒美';
