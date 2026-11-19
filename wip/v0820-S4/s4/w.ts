import { textWidthPx } from '/home/user/ww2-torpedo-boat/tests/pt-ui-kit';
for (const [s, px] of process.argv.slice(2).map((a) => a.split('@')) as [string, string][]) console.log(textWidthPx(s, Number(px)).toFixed(1), px, s);
