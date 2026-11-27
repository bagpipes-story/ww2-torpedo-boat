// Title の任務の行の達成の印（v0.9.0 IP2。ユーザーの言葉 2026-11-27「各シナリオとも、終了時、終了後にクリアしたのかどうかがよくわかりません。」）の文と 2 段への分け方。
// 文の規則（core/achieved-record の achievedMarkOf の 6 つの真偽から）:
//   - 頭「✓ 達成」: どれかの形で達成した任務。カスタムの装備でしか達成していなければ「✓ 達成（カスタム）」（この時は後ろの札に「（カスタム）」を重ねない＝全部がカスタム）
//   - 札「ハード」: ハードで達成した。ハードはカスタムでだけなら「ハード（カスタム）」
//   - 札「史実」: 史実モードで達成した。史実モードはカスタムでだけなら「史実（カスタム）」（v0.9.0 IP1 の「史実でカスタムを使ったという表示と記録」）
//   例: 「✓ 達成」「✓ 達成 ・ ハード」「✓ 達成 ・ ハード ・ 史実（カスタム）」「✓ 達成（カスタム）」「✓ 達成（カスタム） ・ ハード」
// 置き方: 行の右端に右揃えの 2 段（上の段は状態の文「出撃準備 →」の上＝題の右、下の段はその下＝副題の右）。句（頭・札）を前から k 個を上、残りを下に分け、
// 縮める倍率（収まれば 1）の小さい方が最も大きい k を選ぶ（同じなら上に多く）。Phaser・DOM を読まない（tests/achieved-texts が node で読む）。作るのは Title の create の 1 回だけ（§7）。
import {
  TITLE_ACHIEVED_CUSTOM_JA,
  TITLE_ACHIEVED_GAP,
  TITLE_ACHIEVED_HARD_JA,
  TITLE_ACHIEVED_HISTORICAL_JA,
  TITLE_ACHIEVED_JA,
  TITLE_ACHIEVED_PAD_X,
  TITLE_ACHIEVED_PX,
  TITLE_ACHIEVED_SEP_JA,
} from '../config/achieved-config';
import { achievedMarkOf } from '../core/achieved-record';

/** 印の句（頭・ハードの札・史実の札の順。達成していなければ []） */
export function achievedMarkPiecesJa(mask: number): string[] {
  const m = achievedMarkOf(mask);
  if (!m.any) return [];
  const tag = (customOnly: boolean): string => (!m.anyCustomOnly && customOnly ? TITLE_ACHIEVED_CUSTOM_JA : '');
  const out = [`${TITLE_ACHIEVED_JA}${m.anyCustomOnly ? TITLE_ACHIEVED_CUSTOM_JA : ''}`];
  if (m.hard) out.push(`${TITLE_ACHIEVED_HARD_JA}${tag(m.hardCustomOnly)}`);
  if (m.historical) out.push(`${TITLE_ACHIEVED_HISTORICAL_JA}${tag(m.historicalCustomOnly)}`);
  return out;
}

/** 印の 1 行の文（句を「 ・ 」で。達成していなければ ''） */
export function achievedMarkJa(mask: number): string {
  return achievedMarkPiecesJa(mask).join(TITLE_ACHIEVED_SEP_JA);
}

/** 文の幅の見積もり px（半角 0.602 em・全角 1 em。等幅の Menlo の比＝ui/store-texts の estimateTextPx と同じ式） */
function estimatePx(str: string, px: number): number {
  let w = 0;
  for (const ch of str) w += (ch.charCodeAt(0) < 0x2000 ? 0.602 : 1) * px;
  return w;
}

/** 行の印の 2 段（下の段が要らなければ bottom は ''）と、それぞれの幅の上限 px（超えた段は作る時に縮める） */
export interface TitleMarkLayout {
  readonly top: string;
  readonly bottom: string;
  readonly topMaxW: number;
  readonly bottomMaxW: number;
}

/**
 * 行の印の置き方（達成していなければ null）。rowRight は行の右端の x、titleRight・subRight は題と副題の右端の x（MenuButton が測った物）。
 * 上の段の幅の上限 = 行の右端 − 余白 − （題の右端 + 間）、下の段は副題の右端から同じ（0 未満は 0）
 */
export function titleMarkLayout(mask: number, rowRight: number, titleRight: number, subRight: number, px: number = TITLE_ACHIEVED_PX): TitleMarkLayout | null {
  const pieces = achievedMarkPiecesJa(mask);
  if (pieces.length === 0) return null;
  const right = rowRight - TITLE_ACHIEVED_PAD_X;
  const topMaxW = Math.max(0, right - (titleRight + TITLE_ACHIEVED_GAP));
  const bottomMaxW = Math.max(0, right - (subRight + TITLE_ACHIEVED_GAP));
  const fit = (text: string, maxW: number): number => (text === '' ? 1 : Math.min(1, maxW / estimatePx(text, px)));
  let best = { top: '', bottom: '', score: -1 };
  for (let k = pieces.length; k >= 1; k--) {
    const top = pieces.slice(0, k).join(TITLE_ACHIEVED_SEP_JA);
    const bottom = pieces.slice(k).join(TITLE_ACHIEVED_SEP_JA);
    const score = Math.min(fit(top, topMaxW), fit(bottom, bottomMaxW));
    if (score > best.score) best = { top, bottom, score }; // 大きい k から見るので、同じ倍率なら上に多い方が残る
  }
  return { top: best.top, bottom: best.bottom, topMaxW, bottomMaxW };
}
