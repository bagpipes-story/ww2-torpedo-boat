// 凍結のファイル 12 本（CHANGELOG.md v0.6.7 の N3: 夜明けの空襲の core・水上機・砲・米PT・隼艇）は 1 字も変えない（v0.6.8 S0。spec-v068 §3.1）。
// 今までは手で diff を見ていた（模擬の md5・ヘッドレス再生・tests/gun-battery-frozen が裏付け）。v0.6.8 は撃墜をこれらの外の包み（core/air-down）で作るので、ファイルの sha256 をここで固定する。
// 値は main a9a8229（v0.6.7）のファイルの生のバイトの sha256。変えるなら凍結を解く理由を CHANGELOG に書いてから、この表と一緒に変える。
// v0.6.8 実機 1 回目（CHANGELOG v0.6.8「実機 1 回目の調整」）: core/gun-battery.ts だけ 1 つの規則で凍結を解いた（弾倉の検査から「組 1 つ」を外す＝組が 2 つ以上の砲も弾倉は 1 つ。
// us_elco80 の 2 組の砲に弾倉を持たせるため。ほかは検査の文と弾倉の注だけ）。その行の値は解いた後のファイル。ほかの 11 本は a9a8229 のまま。
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const A9 = 'main a9a8229';
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
];

const ROOT = join(__dirname, '..');

describe('凍結のファイル（v0.6.7 の N3。v0.6.8 からテストで固定）', () => {
  it('12 本で、重なりがない。a9a8229 から変えたのは gun-battery.ts の 1 本だけ', () => {
    expect(FROZEN.length).toBe(12);
    expect(new Set(FROZEN.map((f) => f.file)).size).toBe(12);
    expect(FROZEN.filter((f) => f.at !== A9).map((f) => f.file)).toEqual(['src/core/gun-battery.ts']);
  });
  it.each(FROZEN)('$file の sha256 は $at のまま', ({ file, sha }) => {
    const got = createHash('sha256').update(readFileSync(join(ROOT, file))).digest('hex');
    expect(got).toBe(sha);
  });
});
