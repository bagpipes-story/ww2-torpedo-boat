// us_07 の v0_1_prototype の値を書き換える（v0.8.5 S3 の測りの変種）: node us07-patch.mjs variant.json
// variant.json は { "player_start.x_m": 5150, "pt_boats.legs_m": [[...]], ... }（us_07.v0_1_prototype からのドットの道）。
// 書き出しは JSON.stringify(…, null, 2) で、NBSP は今の file と同じ \u00a0 の escape に戻す（ほかの任務の行は 1 字も変わらない）。
import { readFileSync, writeFileSync } from 'node:fs';
const F = '/home/user/ww2-torpedo-boat/data/missions_seed.json';
const v = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const d = JSON.parse(readFileSync(F, 'utf8'));
const p = d.missions.find((m) => m.id === 'us_07').v0_1_prototype;
for (const [path, val] of Object.entries(v)) {
  if (path.startsWith('//')) continue;
  const ks = path.split('.');
  let o = p;
  for (const k of ks.slice(0, -1)) o = o[k];
  if (!(ks.at(-1) in o)) throw new Error(`no key ${path}`);
  o[ks.at(-1)] = val;
}
writeFileSync(F, `${JSON.stringify(d, null, 2).replace(/\u00a0/g, '\\u00a0')}\n`);
console.log('patched', Object.keys(v).filter((k) => !k.startsWith('//')).join(' '));
