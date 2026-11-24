// 今の data/missions_seed.json（JSON の往復で書いた物）の us_07 の記録だけを、HEAD の file の us_07 の記録の字の位置へ差し込む
// （ほかの任務の字は HEAD のまま＝1.0 などの書き方を変えない）。node us07-splice.mjs
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
const F = '/home/user/ww2-torpedo-boat/data/missions_seed.json';
const orig = execSync('git -C /home/user/ww2-torpedo-boat show HEAD:data/missions_seed.json', { encoding: 'utf8', maxBuffer: 1 << 26 });
const cur = JSON.parse(readFileSync(F, 'utf8'));
const o = JSON.parse(orig);
const ind = (s) => s.split('\n').map((l, k) => (k === 0 ? l : `    ${l}`)).join('\n');
const blk = (m) => ind(JSON.stringify(m, null, 2)).replace(/ /g, '\\u00a0');
const a = blk(o.missions.find((m) => m.id === 'us_07'));
if (orig.split(a).length !== 2) throw new Error('HEAD の us_07 の字が 1 か所に無い');
const out = orig.replace(a, () => blk(cur.missions.find((m) => m.id === 'us_07')));
// ほかの任務は HEAD と同じ値か
const chk = JSON.parse(out);
for (const m of o.missions) if (m.id !== 'us_07' && JSON.stringify(m) !== JSON.stringify(chk.missions.find((x) => x.id === m.id))) throw new Error(`${m.id} が変わった`);
writeFileSync(F, out);
console.log('spliced us_07');
