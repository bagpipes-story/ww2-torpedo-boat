// Briefing の値の行の折り返しの写し（v0.6.9 S7 の tests/jp04-lesson から v0.6.10 S7 で切り出した。中身は同じ）: Phaser 3 の Text.advancedWordWrap を、この repo の幅の見積もり
// （tests/pt-ui-kit の textWidthPx: 半角 0.602 em・全角 1 em）で写したもの（半角スペースで語に分け、行に入らない語は次の行へ送り、行の頭の語が幅を超えれば字で切る）。
// ヘッドレスの本当の折り返しは見積もりより約 1% 広いので、tests は 1 字（WRAP − 字の大きさ）の余白でも同じ行の数であることも見る。
import { textWidthPx } from './pt-ui-kit';

/** Briefing の値の行（menu-config の BRIEF_ROW_PX 24・BRIEF_VALUE_WRAP 1056・BRIEF_NOTE_PX 20。menu-config は DOM を読むので値で書く） */
export const BRIEF_ROW_PX = 24;
export const BRIEF_WRAP = 1056;
export const BRIEF_NOTE_PX = 20;

/** Phaser 3 の Text.advancedWordWrap を幅の見積もりで写したもの（行の配列） */
export function phaserWrap(text: string, px = BRIEF_ROW_PX, width = BRIEF_WRAP): string[] {
  const w = (s: string): number => textWidthPx(s, px);
  const lines = [text.replace(/ +/g, ' ')];
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.replace(/^ *|\s*$/g, '');
    if (w(line) < width) {
      out.push(line);
      continue;
    }
    let left = width;
    const words = line.split(' ');
    let o = '';
    for (let j = 0; j < words.length; j++) {
      const word = words[j]!;
      if (w(`${word} `) > left) {
        if (j === 0) {
          let nw = `${word} `;
          while (nw.length > 0) {
            nw = nw.slice(0, -1);
            if (w(nw) <= left) break;
          }
          words[j] = word.slice(nw.length);
          o += nw;
        }
        const off = words[j]!.length > 0 ? j : j + 1;
        lines.splice(i + 1, 0, words.slice(off).join(' ').replace(/[ \n]*$/g, ''));
        break;
      }
      o += `${word} `;
      left -= w(`${word} `);
    }
    out.push(o.replace(/[ \n]*$/g, ''));
  }
  return out.filter((l) => l.length > 0);
}
