// Title の任務の行の達成の印（v0.9.0 IP2。IP3 で 1 つに: ユーザーの言葉 2026-11-27「別にメニュー画面に「史実カスタム」を記録・表示してほしい訳ではなく」）の文と置き方。
// 文: どれかの形（ハード・史実モード・カスタムを問わず）で達成した任務は「✓ 達成」だけ（IP2 の「 ・ ハード ・ 史実（カスタム）」の札と 2 段はやめた）。
// 史実 × デフォルトで達成した任務（core/achieved-record の historicalDefaultTrophy）は「✓ 達成」の左に小さなトロフィー（入る行だけ。今の 13 行はどの論理幅でも入る＝tests/achieved-texts）。
// 置き方: 行の右端に右揃えの 1 段（状態の文「出撃準備 →」の上＝題の右）。Phaser・DOM を読まない（tests/achieved-texts が node で読む）。作るのは Title の create の 1 回だけ（§7）。
import { TITLE_ACHIEVED_GAP, TITLE_ACHIEVED_JA, TITLE_ACHIEVED_PAD_X, TITLE_ACHIEVED_PX, TITLE_TROPHY_GAP, TITLE_TROPHY_PX } from '../config/achieved-config';
import { historicalDefaultTrophy } from '../core/achieved-record';

/** 印の文（達成していなければ ''。1〜255 のどのビットでも「✓ 達成」） */
export function achievedMarkJa(mask: number): string {
  return Number.isInteger(mask) && mask >= 1 && mask <= 0xff ? TITLE_ACHIEVED_JA : '';
}

/** 文の幅の見積もり px（半角 0.602 em・全角 1 em。等幅の Menlo の比＝ui/store-texts の estimateTextPx と同じ式） */
function estimatePx(str: string, px: number): number {
  let w = 0;
  for (const ch of str) w += (ch.charCodeAt(0) < 0x2000 ? 0.602 : 1) * px;
  return w;
}

/** 行の印の置き方: 文・幅の上限 px（超えたら作る時に縮める）・トロフィーを出すか */
export interface TitleMarkLayout {
  readonly text: string;
  readonly maxW: number;
  readonly trophy: boolean;
}

/**
 * 行の印の置き方（達成していなければ null）。rowRight は行の右端の x、titleRight は題の右端の x（MenuButton が測った物）。
 * 幅の上限 = 行の右端 − 余白 − （題の右端 + 間）（0 未満は 0）。トロフィーは史実 × デフォルトで達成していて、杯と間を足しても縮めずに入る時だけ
 */
export function titleMarkLayout(mask: number, rowRight: number, titleRight: number, px: number = TITLE_ACHIEVED_PX): TitleMarkLayout | null {
  const text = achievedMarkJa(mask);
  if (text === '') return null;
  const maxW = Math.max(0, rowRight - TITLE_ACHIEVED_PAD_X - (titleRight + TITLE_ACHIEVED_GAP));
  const trophy = historicalDefaultTrophy(mask) !== null && estimatePx(text, px) + TITLE_TROPHY_GAP + TITLE_TROPHY_PX <= maxW;
  return { text, maxW, trophy };
}
