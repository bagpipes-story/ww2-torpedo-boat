// 凍結のファイル 20 本（v0.6.9 S0 で 12 → 20。CHANGELOG.md v0.6.7 の N3: 夜明けの空襲の core・水上機・砲・米PT・隼艇）は 1 字も変えない（v0.6.8 S0。spec-v068 §3.1）。
// 今までは手で diff を見ていた（模擬の md5・ヘッドレス再生・tests/gun-battery-frozen が裏付け）。v0.6.8 は撃墜をこれらの外の包み（core/air-down）で作るので、ファイルの sha256 をここで固定する。
// 値は main a9a8229（v0.6.7）のファイルの生のバイトの sha256。変えるなら凍結を解く理由を CHANGELOG に書いてから、この表と一緒に変える。
// v0.6.8 実機 1 回目（CHANGELOG v0.6.8「実機 1 回目の調整」）: core/gun-battery.ts だけ 1 つの規則で凍結を解いた（弾倉の検査から「組 1 つ」を外す＝組が 2 つ以上の砲も弾倉は 1 つ。
// us_elco80 の 2 組の砲に弾倉を持たせるため。ほかは検査の文と弾倉の注だけ）。その行の値は解いた後のファイル。ほかの 11 本は a9a8229 のまま。
// v0.6.9 S0（spec-v069 D17）: 8 本を足して 20 本。jp_04 の米PT の雷撃は 2 つ目の魚雷のプールで自艇の魚雷の道（core/torpedo・torpedo-targets・torpedo-solver・systems/torpedo-pool）をそのまま使い、
// 米PT の AI（core/pt-state・pt-contact・pt-chase・pt-damage）を変えない証に固定する。値は main 2ad122b（v0.6.8）のファイル。
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const A9 = 'main a9a8229';
const M2A = 'main 2ad122b';
const FROZEN: readonly { readonly file: string; readonly sha: string; readonly at: string }[] = [
  { file: 'src/core/air-strike.ts', sha: '7421b30c9029466951485dc1b9b73ca92bd3cb99c0b30ccddeb7af22a0b47870', at: A9 },
  { file: 'src/core/air-strike-state.ts', sha: 'd4fc69ad354222057bf28dc228a42844d9a0aa177c6c84bea9c4c89659bed893', at: A9 },
  { file: 'src/core/air-strike-pose.ts', sha: '7d2537c36cee446abe827e7d64cd0163e7f339b909c53132a2f5a6d6c8c30a8b', at: A9 },
  { file: 'src/core/air-strike-data.ts', sha: '41b31ef6d704fd2a16ff177231aa8d65d5f25d7312d75662f1126de793afe536', at: A9 },
  { file: 'src/core/air-strike-sim.ts', sha: '8b7dcfe7353e1b2dbd408750960f34de97d0a32df629189ca6ef4520c4e9bb9f', at: A9 },
  { file: 'src/systems/air-strike-flight.ts', sha: '69eb8ea59b93b5dd526eeac885517e99a55abb204d2b55b4eb9eb0531052c213', at: A9 },
  { file: 'src/core/seaplane.ts', sha: '44869ce8b3d9737416647e2f94ec7d9d57c20760997a2a12e5dc9da4a0c0253d', at: A9 },
  { file: 'src/core/seaplane-ordnance.ts', sha: '384e793471b8f875495ebb922a364f2588a95f10c4f40ae2586149881c22d8cc', at: A9 },
  // a9a8229 は c8c853bc…。v0.6.8 実機 1 回目に弾倉の「組 1 つ」の規則だけ外した
  { file: 'src/core/gun-battery.ts', sha: '8177e1f273e43bb7ca2d7927cd3fab0daf760e16e701e3c1cdb86cb5bded2a56', at: 'v0.6.8 実機 1 回目' },
  { file: 'src/core/pt-boats.ts', sha: '9ddf0b50afd7879254d235bbcf13d319535fa8b22619bae0130ef764765ea515', at: A9 },
  { file: 'src/core/pt-gun.ts', sha: '98b31134c0004976076c9bef7db6dac0adfd6baa909d9bf996aaa5e059acbc56', at: A9 },
  { file: 'src/core/gunboat.ts', sha: '81fa506e34e9779edee5bc498f0377df810a3725493d3b1951a3783ab9745f9e', at: A9 },
  // v0.6.9 S0: 自艇の魚雷の道（2 つ目のプールがそのまま使う）
  { file: 'src/core/torpedo.ts', sha: '1720745a14840b07cd69763f8f9573d39bb2b1a5b22de8a85984f7228a317ce9', at: M2A },
  { file: 'src/core/torpedo-targets.ts', sha: 'fab980196eaccb3039170fca0aa98322fac61fa956e8f2f9643906e672de9043', at: M2A },
  { file: 'src/core/torpedo-solver.ts', sha: 'b0284c75891bf0ea9a7e6a502424dd21a7f8cdd8eb6cd9ec14d8ee667e1aee96', at: M2A },
  { file: 'src/systems/torpedo-pool.ts', sha: '6ffd41cc8f083c4016cac7f9563fc3f976f0d8b7c90238dba61a1349ee09aa1a', at: M2A },
  // v0.6.9 S0: 米PT の AI（雷撃は凍結の stepPtSection の後の包みだけが書く）
  { file: 'src/core/pt-state.ts', sha: '94e2368ceab17f83da74cc4f0b29bd11daf3051f9d5b299441e6ab5a0501f831', at: M2A },
  { file: 'src/core/pt-contact.ts', sha: '55392eca37b21c450b6c576b55be01c1e4b914e5681ed480b1cfb6a977fc8cf9', at: M2A },
  { file: 'src/core/pt-chase.ts', sha: 'e7fab40b408c0baf85cd06b8da44f591452ff6e8a43dae874b1ad12078846bee', at: M2A },
  { file: 'src/core/pt-damage.ts', sha: '63a1a325f1cb0928a0a8a5525aa5fcdf9ec93ceb4a18ee22c83002445c13e880', at: M2A },
];

const ROOT = join(__dirname, '..');

describe('凍結のファイル（v0.6.7 の N3。v0.6.8 からテストで固定。v0.6.9 で 20 本）', () => {
  it('20 本で、重なりがない。a9a8229 から変えたのは gun-battery.ts の 1 本だけ、v0.6.9 で足した 8 本は 2ad122b の値', () => {
    expect(FROZEN.length).toBe(20);
    expect(new Set(FROZEN.map((f) => f.file)).size).toBe(20);
    expect(FROZEN.filter((f) => f.at !== A9 && f.at !== M2A).map((f) => f.file)).toEqual(['src/core/gun-battery.ts']);
    expect(FROZEN.filter((f) => f.at === M2A).map((f) => f.file)).toEqual([
      'src/core/torpedo.ts', 'src/core/torpedo-targets.ts', 'src/core/torpedo-solver.ts', 'src/systems/torpedo-pool.ts',
      'src/core/pt-state.ts', 'src/core/pt-contact.ts', 'src/core/pt-chase.ts', 'src/core/pt-damage.ts',
    ]);
  });
  it.each(FROZEN)('$file の sha256 は $at のまま', ({ file, sha }) => {
    const got = createHash('sha256').update(readFileSync(join(ROOT, file))).digest('hex');
    expect(got).toBe(sha);
  });
});
