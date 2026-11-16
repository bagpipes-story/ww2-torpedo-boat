// v0.8.1 S3（spec-v0810 §3.9 D-P2・lead の L51〜L53）: us_06 の探り（scripts/headless/anchor-probe.mjs のページの糊と anchor-probe-policy.mjs の台本）が人の知れる物だけを読むことを字で見張る。
// - 台本は import も Math.random も無く、ページ・世界（window・__hl・__game・registry）に触れない。素の view を受けて素の出力を書くだけ。
// - 台本とページの糊は、測りの印（<anchor-probe:measure> 〜 </anchor-probe:measure>）の間を除いて、艦の AI・止まった段・背に岸・今夜の揺らぎ・艦の速さの名前を持たない
//   （例外は ?debug の旗 &nobackdrop の字だけ＝shore_east_nb の夜を開く問い合わせ）。測りは印の間の 1 か所だけ。
// - 台本の揺らぎは自分の乱数（seed × 7907 ＋ 40483）で、同じ seed は同じ夜（小さな素の模型で 2 回回す）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const PROBE = readFileSync('scripts/headless/anchor-probe.mjs', 'utf8');
const POLICY = readFileSync('scripts/headless/anchor-probe-policy.mjs', 'utf8');
const OPEN = '// <anchor-probe:measure>', CLOSE = '// </anchor-probe:measure>';
const FORBIDDEN = [/anchored/i, /anchors/i, /shipAi/, /\.ai\./, /speedMps/i, /backdrop/i, /jitter/i, /underway/i, /noticed/i];
/** 測りの印の間を除き、?debug の旗 &nobackdrop を消した字 */
const unfenced = (s: string): string => {
  const i = s.indexOf(OPEN), j = s.indexOf(CLOSE);
  return (i < 0 ? s : s.slice(0, i) + s.slice(j + CLOSE.length)).replace(/&nobackdrop\b/g, '');
};
const count = (s: string, sub: string): number => s.split(sub).length - 1;
type View = Record<string, unknown> & { t: number; x: number; y: number; h: number };
type Out = { headingDeg: number; speed01: number; fireN: number; fireSpreadDeg: number };
type Policy = { ANCHOR_POLICIES: string[]; ANCHOR_HUMAN: { seedMul: number; seedAdd: number }; createAnchorDriver(p: string, seed: number, plan: object): object; stepAnchorDriver(d: object, v: View, o: Out): void };

describe('us_06 の探りの台本と糊（D-P2）', () => {
  it('測りは印の間の 1 か所だけ（ページの糊の中）・台本には印が無い', () => {
    expect([count(PROBE, OPEN), count(PROBE, CLOSE), count(POLICY, OPEN), count(POLICY, CLOSE)]).toEqual([1, 1, 0, 0]);
    expect(PROBE.indexOf(OPEN)).toBeLessThan(PROBE.indexOf(CLOSE));
    expect(PROBE.indexOf('const PAGE = `')).toBeLessThan(PROBE.indexOf(OPEN));
    expect(PROBE.indexOf(CLOSE)).toBeLessThan(PROBE.indexOf('`;\n'));
  });
  it('台本と糊は測りの外で禁じた名前を持たない（艦の AI・止まった段・背に岸・今夜の揺らぎ・艦の速さ）', () => {
    for (const [name, text] of [['policy', unfenced(POLICY)], ['probe', unfenced(PROBE)]] as const) {
      for (const re of FORBIDDEN) expect(text.match(re)?.[0] ?? null, `${name} ${re}`).toBeNull();
    }
    // 印の間には実際に測りの名前がある（印が空でない＝走査を外す意味がある）
    const fence = PROBE.slice(PROBE.indexOf(OPEN), PROBE.indexOf(CLOSE));
    expect(['underwayAtS', 'noticedAtS', 'backdropS', 'speedMps', 'kpiTarget'].every((k) => fence.includes(k))).toBe(true);
  });
  it('台本は素の JS: import・require・Math.random・ページと世界の物が無い。糊も Math.random を使わず、ページの import は台本だけ', () => {
    expect(POLICY).not.toMatch(/^\s*import\b|\bimport\(|\brequire\(/m);
    expect(POLICY).not.toMatch(/Math\.random|\bwindow\b|\bdocument\b|__hl|__game|registry|\bsetup\b/);
    expect(PROBE).not.toMatch(/Math\.random/);
    const page = PROBE.slice(PROBE.indexOf('const PAGE = `'), PROBE.indexOf('`;\n'));
    expect(page.match(/^import .*$/gm)).toEqual(["import { ANCHOR_HUMAN, createAnchorDriver, stepAnchorDriver } from '${HERE}/anchor-probe-policy.mjs';"]);
    expect(PROBE.split('\n').length - 1).toBeLessThanOrEqual(200);
    expect(POLICY.split('\n').length - 1).toBeLessThanOrEqual(200);
  });
  it('同じ seed は同じ夜（素の模型の艇を 6 つの台本で 150 秒ずつ 2 回）・揺らぎの系列は seed × 7907 ＋ 40483', async () => {
    const path = '../scripts/headless/anchor-probe-policy.mjs';
    const P = (await import(path)) as Policy;
    expect([P.ANCHOR_HUMAN.seedMul, P.ANCHOR_HUMAN.seedAdd]).toEqual([7907, 40483]);
    expect(P.ANCHOR_POLICIES).toEqual(['shore_east', 'open_north', 'shore_east_nb', 'charge', 'transport_first', 'idle']);
    const plan = { width: 6000, height: 3000, ringX: 4400, ringY: 400, ringR: 250, dawnS: 200, silent01: 0.42, cruise01: 0.59, uzX: 3620, uzY: 2380, trX: 3000, trY: 2760, torpScreenMps: 86, spacingDeg: 4 };
    const night = (policy: string, seed: number): string => {
      const d = P.createAnchorDriver(policy, seed, plan);
      const v: View = { t: 0, leftS: 200, x: 5000, y: 250, h: 225, torps: 4, atHome: false, seen: false, lit: false, ddSunk: 0, trSunk: false, bn: 1, sweepS: 0, bx: [3620], by: [2380], en: 0, ekind: [0], ex: [3620], ey: [2380], evx: [0], evy: [0] };
      const o: Out = { headingDeg: NaN, speed01: 0, fireN: 0, fireSpreadDeg: 0 };
      let log = '';
      for (let k = 0; k < 9000; k++, v.t += 1 / 60, v.leftS = 200 - v.t) {
        v.en = (v.x - 3620) ** 2 + (v.y - 2380) ** 2 <= 900 * 900 ? 1 : 0;
        P.stepAnchorDriver(d, v, o);
        if (!Number.isNaN(o.headingDeg)) v.h = o.headingDeg;
        v.x += Math.sin((v.h * Math.PI) / 180) * o.speed01 * 100 / 60;
        v.y -= Math.cos((v.h * Math.PI) / 180) * o.speed01 * 100 / 60;
        if (o.fireN > 0) log += `${k}:${o.fireN}@${o.headingDeg.toFixed(3)};`;
      }
      return `${log}${v.x.toFixed(3)},${v.y.toFixed(3)}`;
    };
    for (const p of P.ANCHOR_POLICIES) expect(night(p, 7), p).toBe(night(p, 7));
    expect(night('shore_east', 7)).not.toBe(night('shore_east', 8)); // 反応と狙いのずれは seed で変わる
    expect(night('idle', 7)).toBe('5000.000,250.000');
  });
});
