// v0.6.11 IP2 の U11（ユーザー「屋我地の陰の方も視覚的に何がなんだかよくわからないので岩などを描画したりしてビジュアルのクオリティを上げてください」）: 陰と壕の岩の絵の置き方の不変条件。
// 絵だけ（模擬・世界の記録には効かない）なので、隠れ場所の輪・札・入る道・% の札を岩と木が塞がないことと、§7（起動後 1 回だけ描く・毎フレーム描かない）を source で確かめる。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CAVE_TREES, COVER_ART_HALF_W_M, COVER_BOULDERS, COVER_CLIFF_HALF_W_M, COVER_TREES } from '../src/config/evac-art-config';
import { gameData } from '../src/config/game-data';
import { getEvacParams } from '../src/config/evac-mission-data';
import { SHELTER_COVER } from '../src/core/evac-data';

const p = getEvacParams(gameData, 'jp_03', false)!;
const covers = p.params.shelters.filter((s) => s.kind === SHELTER_COVER);

describe('陰の岩の絵（U11）', () => {
  it('jp_03 に陰が 1 つ以上ある', () => {
    expect(covers.length).toBeGreaterThan(0);
  });
  it('口の外の岩は隠れ場所の輪の外（輪の半径 ＋ 岩の半径 ＋ 30 m）で、輪の下の札の帯（dy 70〜100・幅 ±130 m）にかからない', () => {
    for (const [dx, dy, r] of COVER_BOULDERS) {
      expect(Math.hypot(dx, dy)).toBeGreaterThan(p.params.shelterRingM + r + 30);
      const inLabelBand = dy + r > p.params.shelterRingM && dy - r < p.params.shelterRingM + 30 && Math.abs(dx) - r < 130;
      expect(inLabelBand).toBe(false);
    }
  });
  it('口の外の岩は入る道（陰の点の真南 ±100 m）にかからない', () => {
    for (const [dx, dy, r] of COVER_BOULDERS) if (dy > 0) expect(Math.abs(dx) - r).toBeGreaterThan(100);
  });
  it('崖の上の木々は陸（岸の線の北）で、絵の幅の内', () => {
    for (const [dx, dy, r] of COVER_TREES) {
      expect(dy - r).toBeGreaterThan(0);
      expect(Math.abs(dx) + r).toBeLessThan(COVER_ART_HALF_W_M);
    }
    expect(COVER_CLIFF_HALF_W_M).toBeLessThan(COVER_ART_HALF_W_M);
  });
  it('壕の木々は口の真下の % の札（±45 m）を空ける', () => {
    for (const [dx, , r] of CAVE_TREES) expect(Math.abs(dx) - r).toBeGreaterThan(45);
  });
});

describe('§7: 岩の絵は 1 回だけテクスチャに描き、毎フレーム描かない', () => {
  const art = readFileSync('src/assets/evac-terrain-art.ts', 'utf8');
  const terrain = readFileSync('src/systems/evac-terrain.ts', 'utf8');
  it('テクスチャがあれば描かない（やり直しの任務で描き直さない）', () => {
    expect(art.match(/if \(scene\.textures\.exists\(key\)\) return place;/g)?.length).toBe(2);
    expect(art).toContain('g.destroy();');
    expect(art).not.toMatch(/Math\.random/);
  });
  it('地形は update を持たない（constructor と destroy だけ）', () => {
    expect(terrain).not.toMatch(/\bupdate\(/);
    expect(terrain).toContain('for (const a of this.art) a.destroy();');
  });
});
