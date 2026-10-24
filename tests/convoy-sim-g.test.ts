// 味方の大発を守る模擬の帯が簡単側への揺れを捕まえるか（v0.6.4 レビュー data:R5。帯は src/systems/convoy-sim-setup の CONVOY_CALIBRATION＝測った値のまわりの回帰の帯）。
// barge_hp を 4 の倍数で 1 段上げる（v0.6.4 実機 1 回目の 12 → 16 = 4 発で沈む）と、HUD どおり（shield_full ★）の行は到達（上の端 2.52）と 3 隻の夜（上の端 58%）の 2 つだけで外れる
// （seed 1〜200 で 2.56・61.5%。沈没・HP・撃退の帯は通ってしまう）。data の barge_hp を変えるときは帯ごと測り直し、ここの上書きの値も合わせる。1 行＋対の相手を回す（N 200 で 12 秒ほど）。
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { convoySimSetup } from '../src/systems/convoy-sim-setup';
import { simMisses, simRun } from './convoy-sim-kit';

describe('味方の大発を守る模擬の帯（spec §F.4: 簡単側への揺れ）', () => {
  it('較正（N 200・seed 1〜200）: barge_hp を 1 段上げる（12 → 16）と shield_full の帯は到達と 3 隻の夜 % の 2 つだけが上の端（2.52・58）を超えて落ちる（ほかの帯と不変は通る）', () => {
    expect(convoySimSetup(gameData, 'jp_01').convoy.hp).toBe(12);
    const run = simRun({ bargeHp: 16 });
    expect(run.setup.convoy.hp).toBe(16);
    const misses = simMisses(run, ['shield_full']);
    expect(misses, misses.join(' / ')).toEqual([expect.stringMatching(/^shield_full: 到達\/3 2\.\d+（帯 2\.3〜2\.52）$/), expect.stringMatching(/^shield_full: 3 隻の夜 % \d+\.\d+（帯 47〜58）$/)]);
  }, 60_000);
});
