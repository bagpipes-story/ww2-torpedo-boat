// v0.8.2 S3（spec-v0820 §6 D-P2・lead の L29）: us_05 の探り（scripts/headless/column-probe.mjs のページの糊と column-probe-policy.mjs の台本）が人の知れる物だけを読むことを字で見張る
// （v0.8.1 の tests/anchor-probe-scan の作法）。
// - 台本は import も Math.random も無く、ページ・世界（window・__hl・__game・registry）に触れない。素の view を受けて素の出力を書くだけ。
// - 台本とページの糊は、測りの印（<column-probe:measure> 〜 </column-probe:measure>）の間を除いて、艦の AI・見張りの役・列の段階と道・今夜の揺らぎ・弾薬庫・世界の報告の状態・
//   艦種の表（kits）・艦の速さの名前を持たない（艦の種類は絵＝テクスチャの鍵から、報告の段は HUD のテレメトリから）。測りは印の間の 1 か所だけ。
// - 台本の揺らぎは自分の乱数（seed × 7907 ＋ 40483）で、同じ seed は同じ夜（小さな素の模型で 2 回回す）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const PROBE = readFileSync('scripts/headless/column-probe.mjs', 'utf8');
const POLICY = readFileSync('scripts/headless/column-probe-policy.mjs', 'utf8');
const TABLE = readFileSync('scripts/headless/column-probe-table.mjs', 'utf8');
const OPEN = '// <column-probe:measure>', CLOSE = '// </column-probe:measure>';
const FORBIDDEN = [/\.ai\b/, /shipAi/i, /roles/, /screenAi|lineAi/, /transit/i, /lane/i, /jitter/i, /magazine/i, /rejoin/i, /w\.recon/, /recon\.state/, /\bkits\b/, /classes/, /speedMps/i, /hitsTaken/, /chanceSum/, /\brng\b/i];
/** 測りの印の間を除いた字 */
const unfenced = (s: string): string => {
  const i = s.indexOf(OPEN), j = s.indexOf(CLOSE);
  return i < 0 ? s : s.slice(0, i) + s.slice(j + CLOSE.length);
};
const count = (s: string, sub: string): number => s.split(sub).length - 1;
type View = Record<string, unknown> & { t: number; x: number; y: number; h: number };
type Out = { headingDeg: number; speed01: number; fireN: number; fireSpreadDeg: number; smoke: boolean };
type Policy = { COLUMN_POLICIES: string[]; COLUMN_HARD_POLICIES: string[]; COLUMN_HUMAN: { seedMul: number; seedAdd: number }; createColumnDriver(p: string, seed: number, plan: object): object; stepColumnDriver(d: object, v: View, o: Out): void };
const PLAN = { width: 6500, height: 4000, startX: 4200, startY: 700, ringX: 5000, ringY: 800, ringR: 250, relayX: 1600, relayY: 800, relayR: 250, dawnS: 270, visM: 1500, silent01: 0.44, cruise01: 0.59, torpScreenMps: 86, spacingDeg: 4 };

describe('us_05 の探りの台本と糊（D-P2）', () => {
  it('測りは印の間の 1 か所だけ（ページの糊の中）・台本と表には印が無い', () => {
    expect([count(PROBE, OPEN), count(PROBE, CLOSE), count(POLICY, OPEN), count(POLICY, CLOSE), count(TABLE, OPEN)]).toEqual([1, 1, 0, 0, 0]);
    expect(PROBE.indexOf('const PAGE = `')).toBeLessThan(PROBE.indexOf(OPEN));
    expect(PROBE.indexOf(OPEN)).toBeLessThan(PROBE.indexOf(CLOSE));
    expect(PROBE.indexOf(CLOSE)).toBeLessThan(PROBE.indexOf('`;\n'));
  });
  it('台本・糊・表は測りの外で禁じた名前を持たない（艦の AI・役・列の道・揺らぎ・弾薬庫・世界の報告・艦種の表・艦の速さ・乱数）', () => {
    for (const [name, text] of [['policy', unfenced(POLICY)], ['probe', unfenced(PROBE)], ['table', TABLE]] as const) {
      for (const re of FORBIDDEN) expect(text.match(re)?.[0] ?? null, `${name} ${re}`).toBeNull();
    }
    // 印の間には実際に測りの名前がある（印が空でない＝走査を外す意味がある）
    const fence = PROBE.slice(PROBE.indexOf(OPEN), PROBE.indexOf(CLOSE));
    expect(['kits.classes', 'w.recon.state', 'g.magazine', 'g.roles', 'hitsTaken', 'kpiTarget', 'speedMps'].every((k) => fence.includes(k))).toBe(true);
    // 糊が台本に渡す報告の段は HUD のテレメトリ（boatTelemetry の recon）・艦の種類は絵のテクスチャの鍵
    expect(unfenced(PROBE)).toContain("v.rep = t.recon ? t.recon.stage : 0");
    expect(unfenced(PROBE)).toContain('d.sprite.texture.key');
  });
  it('台本は素の JS: import・require・Math.random・ページと世界の物が無い。糊と表も Math.random を使わず、ページの import は台本だけ・行の上限', () => {
    expect(POLICY).not.toMatch(/^\s*import\b|\bimport\(|\brequire\(/m);
    expect(POLICY).not.toMatch(/Math\.random|\bwindow\b|\bdocument\b|__hl|__game|registry|\bsetup\b/);
    expect(PROBE).not.toMatch(/Math\.random/);
    const page = PROBE.slice(PROBE.indexOf('const PAGE = `'), PROBE.indexOf('`;\n'));
    expect(page.match(/^import .*$/gm)).toEqual(["import { COLUMN_HUMAN, createColumnDriver, stepColumnDriver } from '${HERE}/column-probe-policy.mjs';"]);
    expect(TABLE).not.toMatch(/^\s*import\b|\bimport\(|\brequire\(|Math\.random|\bwindow\b|__hl|__game|registry/m);
    const lines = (s: string): number => s.split('\n').length - 1;
    expect([lines(PROBE) <= 200, lines(POLICY) <= 200, lines(TABLE) <= 80]).toEqual([true, true, true]);
  });
  it('同じ seed は同じ夜（素の模型の艇と 3 隻の輝点の列で 7 つの台本を 200 秒ずつ 2 回）・揺らぎの系列は seed × 7907 ＋ 40483', async () => {
    const path = '../scripts/headless/column-probe-policy.mjs';
    const P = (await import(path)) as Policy;
    expect([P.COLUMN_HUMAN.seedMul, P.COLUMN_HUMAN.seedAdd]).toEqual([7907, 40483]);
    expect(P.COLUMN_POLICIES).toEqual(['shadow_report', 'report_attack', 'bb_ambush', 'van_attack', 'charge', 'radar_only', 'idle']);
    expect(P.COLUMN_HARD_POLICIES).toEqual(['shadow_report', 'report_attack']);
    const night = (policy: string, seed: number): string => {
      const d = P.createColumnDriver(policy, seed, PLAN);
      // 前衛 1（y 2,800・5 秒）と本隊 2（y 1,840 と 2,400・80 秒）が 46.3 m/秒で東へ。目で見える艦は視程 1,500 m の内（本隊の 2 隻目が戦艦の絵）
      const v: View = { t: 0, leftS: 270, x: 4200, y: 700, h: 225, torps: 4, atHome: false, seen: false, lit: false, rep: 0, bn: 0, sweepS: NaN, bx: [0, 0, 0], by: [0, 0, 0], en: 0, ekind: [0, 0, 0], ex: [0, 0, 0], ey: [0, 0, 0], evx: [0, 0, 0], evy: [0, 0, 0] };
      const ships = [[5, 2800, 0], [80, 1840, 0], [85, 2400, 2]] as const;
      const o: Out = { headingDeg: NaN, speed01: 0, fireN: 0, fireSpreadDeg: 0, smoke: false };
      let log = '';
      for (let k = 0; k < 12000; k++, v.t += 1 / 60, v.leftS = 270 - v.t) {
        const sweep = Math.floor(v.t / 2) * 2;
        let bn = 0, en = 0;
        for (const [at, y, kind] of ships) {
          if (v.t < at) continue;
          const x = 150 + 46.3 * (v.t - at);
          if (sweep !== v.sweepS) { (v.bx as number[])[bn] = x; (v.by as number[])[bn] = y; }
          bn++;
          if ((x - v.x) ** 2 + (y - v.y) ** 2 <= 1500 * 1500) { (v.ex as number[])[en] = x; (v.ey as number[])[en] = y; (v.evx as number[])[en] = 46.3; (v.ekind as number[])[en] = kind; en++; }
        }
        v.bn = bn; v.en = en; v.sweepS = sweep;
        if (en > 0 && (v.ekind as number[]).slice(0, en).includes(2) && v.rep === 0) v.rep = 1;
        if (v.rep === 1 && v.t > 160) v.rep = 2;
        P.stepColumnDriver(d, v, o);
        if (!Number.isNaN(o.headingDeg)) v.h = o.headingDeg;
        v.x += Math.sin((v.h * Math.PI) / 180) * o.speed01 * 100 / 60;
        v.y -= Math.cos((v.h * Math.PI) / 180) * o.speed01 * 100 / 60;
        if (o.fireN > 0) log += `${k}:${o.fireN}@${o.headingDeg.toFixed(3)};`;
      }
      return `${log}${v.x.toFixed(3)},${v.y.toFixed(3)}`;
    };
    for (const p of P.COLUMN_POLICIES) expect(night(p, 7), p).toBe(night(p, 7));
    expect(night('shadow_report', 7)).not.toBe(night('shadow_report', 8)); // 止まる点の揺らぎは seed で変わる
    expect(night('idle', 7)).toBe('4200.000,700.000');
    expect(night('bb_ambush', 7)).toMatch(/^\d+:4@/); // 戦艦の絵が見えて撃つ
  });
});
