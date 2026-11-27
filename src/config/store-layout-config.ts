// ストア（v0.9.0 S1。spec-v0900 §4.6）の画面の置き方と語: Title の左上の「ストア」・ストアの画面（財布・品の格子・説明・交換の主ボタン）・Briefing の「装備: デフォルト／カスタム」。
// 論理 px（高さ 720・幅 1280〜1584）。幅は引数で受ける（menu-config・game-config は DOM を読むので import しない＝tests/store-layout が node で読める。title-layout-config と同じ）。
// ゲームの強さの値ではない（data/store.json の品の値と別）。
import { TITLE_SOUND_H, TITLE_SOUND_W, TITLE_SOUND_Y } from './title-layout-config';

/** 画面の縁の余白（game-config の HUD_MARGIN と同じ 24。tests/store-layout がソースを読んで結ぶ） */
export const STORE_MARGIN = 24;
const SCREEN_H = 720;
/** 右下の主ボタン（menu-config の MENU_PRIMARY_W と同じ 320）と Briefing の出撃の高さ（BRIEF_SORTIE_H と同じ 112） */
const PRIMARY_W = 320;
const PRIMARY_H = 112;

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * Title の左上の「ストア」（ストアが開いている端末だけ。閉じている端末は何も出さない＝Title は v0.8.5 と同じ）: 右上の「曲」「音」と同じ 200 × 80 で左右対称（x 24〜224・y 20〜100）。
 * 題は「ストア」、2 行目は財布の点
 */
export const TITLE_STORE_RECT: Rect = { x: STORE_MARGIN, y: TITLE_SOUND_Y, w: TITLE_SOUND_W, h: TITLE_SOUND_H };
export const TITLE_STORE_JA = 'ストア';
export const TITLE_STORE_PX = 26;
export const TITLE_STORE_SUB_PX = 18;

/** ストアの画面: 題（Briefing の任務名と同じ 40 px・x 64）と、その下の一言 */
export const STORE_TITLE_X = 64;
export const STORE_TITLE_Y = 48;
export const STORE_TITLE_PX = 40;
export const STORE_TITLE_JA = 'ストア';
export const STORE_LEAD_Y = 100;
export const STORE_LEAD_PX = 18;
/** 右上の「← 任務一覧」（1280 で x 1,016〜）にかからない長さ（18 px で 約 560 px） */
export const STORE_LEAD_JA = '任務の得点が点として貯まり、装備と交換できる';
/** 右上の「← 任務一覧」（Briefing の BRIEF_BACK_* と同じ 240 × 96・上端 24） */
export const STORE_BACK_W = 240;
export const STORE_BACK_H = 96;
export const STORE_BACK_PX = 24;
export const STORE_BACK_JA = '← 任務一覧';
export function storeBackRect(width: number): Rect {
  return { x: width - STORE_MARGIN - STORE_BACK_W, y: STORE_MARGIN, w: STORE_BACK_W, h: STORE_BACK_H };
}
/** 財布「所持 12,345 点」: 「← 任務一覧」の左 24 に右寄せ、縦はボタンの中心 */
export const STORE_WALLET_PX = 26;
export const STORE_WALLET_GAP = 24;
export function storeWalletAnchor(width: number): { x: number; y: number } {
  const b = storeBackRect(width);
  return { x: b.x - STORE_WALLET_GAP, y: b.y + b.h / 2 };
}

/**
 * 品の格子: 2 列（列 597・間 24＝幅 1,218 を中心に。Title の任務の格子と同じ幅）。行は 6 品まで 96 px、7 品からは 76 px（Title の詰めた行と同じ）・間 12・上端 140。
 * 1 枚に 題（26 px）・効きの短い文（18 px）・右に状態（22 px）
 */
export const STORE_GRID_TOP = 140;
export const STORE_GRID_COL_W = 597;
export const STORE_GRID_GAP_X = 24;
export const STORE_GRID_GAP_Y = 12;
export const STORE_CARD_H = 96;
export const STORE_CARD_COMPACT_H = 76;
export const STORE_CARD_COMPACT_FROM = 7;
export const STORE_CARD_COMPACT_PAD_Y = 10;
export const STORE_CARD_TITLE_PX = 26;
export const STORE_CARD_SUB_PX = 18;
export const STORE_CARD_STATE_PX = 22;
export function storeGridLeft(width: number): number {
  return width / 2 - STORE_GRID_COL_W - STORE_GRID_GAP_X / 2;
}
export function storeCardH(n: number): number {
  return n >= STORE_CARD_COMPACT_FROM ? STORE_CARD_COMPACT_H : STORE_CARD_H;
}
/** i 番目の品の枠（左の列から右の列へ、上の段から下の段へ） */
export function storeCardRect(i: number, n: number, width: number): Rect {
  const h = storeCardH(n);
  const col = i % 2;
  const row = Math.floor(i / 2);
  return { x: storeGridLeft(width) + col * (STORE_GRID_COL_W + STORE_GRID_GAP_X), y: STORE_GRID_TOP + row * (h + STORE_GRID_GAP_Y), w: STORE_GRID_COL_W, h };
}
/** 格子の下端 */
export function storeGridBottom(n: number): number {
  const rows = Math.ceil(n / 2);
  return rows === 0 ? STORE_GRID_TOP : STORE_GRID_TOP + rows * storeCardH(n) + (rows - 1) * STORE_GRID_GAP_Y;
}

/** 下の帯: 選んだ品の説明（22 px・幅 832・格子の左端から。格子の下 24） */
export const STORE_DESC_GAP = 24;
export const STORE_DESC_PX = 22;
export const STORE_DESC_WRAP = 832;
export const STORE_DESC_LINE_GAP = 8;
/** 左下の一言（18 px・幅 STORE_DESC_WRAP で折り返し・下端 696）: どこで効くかと、保存の場所の既知の制約（Safari とホーム画面のアプリは別） */
export const STORE_HINT_PX = 18;
export const STORE_HINT_JA = 'Briefing で「装備: カスタム」を選ぶと装着中の品が効く（史実モードはデフォルトのまま）\n点と装備はこの端末のこのアプリだけに保存（Safari とホーム画面のアプリは別）';
/** 右下の主ボタン（Briefing の「出撃」と同じ x・320 × 112）: 交換する → 3 秒の間「本当に交換」→ もう一度で交換（誤タップ対策）。交換済みは「外す」⇄「装着する」 */
export const STORE_ACTION_PX = 32;
export const STORE_CONFIRM_MS = 3000;
export function storeActionRect(width: number): Rect {
  return { x: width - STORE_MARGIN - PRIMARY_W, y: SCREEN_H - STORE_MARGIN - PRIMARY_H, w: PRIMARY_W, h: PRIMARY_H };
}
export const STORE_BUY_JA = '交換する';
export const STORE_CONFIRM_JA = '本当に交換';
export const STORE_UNEQUIP_JA = '外す';
export const STORE_EQUIP_JA = '装着する';
export const STORE_EQUIPPED_JA = '装着中';
export const STORE_UNEQUIPPED_JA = '外している';
export const STORE_SAVE_FAILED_JA = '保存できなかった（プライベートブラウズ・容量）。交換していない';

/**
 * Briefing の「装備: デフォルト／カスタム」（ユーザーの決め U1 の語）: 出撃（右下の主ボタン）の左 16 に 400 × 112（1280 で 520〜920・1560 で 800〜1200）。
 * 出すのはストアが開いていて、史実モードでなく、港の空襲の無い任務で、その任務に効く装着中の品が 1 つ以上ある時だけ（＝今の端末・ヘッドレスでは出ない）
 */
export const BRIEF_LOADOUT_W = 400;
export const BRIEF_LOADOUT_GAP = 16;
export const BRIEF_LOADOUT_PX = 28;
export const BRIEF_LOADOUT_SUB_PX = 20;
export function briefLoadoutRect(width: number): Rect {
  const go = storeActionRect(width);
  return { x: go.x - BRIEF_LOADOUT_GAP - BRIEF_LOADOUT_W, y: go.y, w: BRIEF_LOADOUT_W, h: go.h };
}
export const BRIEF_LOADOUT_DEFAULT_JA = '装備: デフォルト';
export const BRIEF_LOADOUT_CUSTOM_JA = '装備: カスタム';
export const BRIEF_LOADOUT_DEFAULT_SUB_JA = '史実の初期装備 ・ タップで切替';
/** カスタムの 2 行目（効く品の短い名を「・」で。見積もりの幅がボタンの余白の内＝400 − 2 × 32 を超えたら入るだけ並べて「ほか n」） */
export const BRIEF_LOADOUT_SUB_MAX_PX = 336;

/** Mission の HUD の左上の印（カスタムの出撃だけ。史実モードとは同時に出ない）と Result の見出しの印 */
export const HUD_CUSTOM_BADGE_JA = '［カスタム］';
export const RESULT_CUSTOM_TAG_JA = '（カスタム）';
