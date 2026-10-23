// 味方の大発を守る模擬の帯が簡単側への揺れを捕まえるか（v0.6.4 レビュー data:R5。帯は src/systems/convoy-sim-setup の CONVOY_CALIBRATION＝測った値のまわりの回帰の帯）。
// barge_hp を 4 の倍数で 1 段上げる（20 → 24 = 6 発で沈む）と、HUD どおり（shield_full ★）の行は 3 隻の夜（上の端 64%）だけで外れる（seed 1〜200 で 66%。到達・沈没・HP の帯は通ってしまう）。
// data の barge_hp を変えるときは帯ごと測り直し、ここの上書きの値も合わせる。1 行だけ回す（N 200 で 7 秒ほど）。
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { convoySimSetup } from '../src/systems/convoy-sim-setup';
import { simMisses, simRun } from './convoy-sim-kit';

describe('味方の大発を守る模擬の帯（spec §F.4: 簡単側への揺れ）', () => {
  it('較正（N 200・seed 1〜200）: barge_hp を 1 段上げる（20 → 24）と shield_full の帯は 3 隻の夜 % だけが上の端 64 を超えて落ちる（ほかの帯と不変は通る）', () => {
    expect(convoySimSetup(gameData, 'jp_01').convoy.hp).toBe(20);
    const run = simRun({ bargeHp: 24 });
    expect(run.setup.convoy.hp).toBe(24);
    const misses = simMisses(run, ['shield_full']);
    expect(misses, misses.join(' / ')).toHaveLength(1);
    expect(misses[0]).toMatch(/^shield_full: 3 隻の夜 % \d+\.\d+（帯 45〜64）$/);
  }, 60_000);
});
