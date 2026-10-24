// 狙われている大発のラベル（v0.6.4 最終確認の直し。config/convoy-config の CONVOY_TARGET_LABEL・systems/convoy の中央揃え）: 隊列の間隔で隣の「大発」と重ならない。
// 直す前の 1 行の「大発（狙われている）」は 22 px で 220 m あり、間隔 120 m の隣の「大発」（44 m）に掛かって、ヘッドレスの画像で「大発大発（狙われている）」と読めた。
// ラベルは世界の座標の文字（22 px = 22 m。ui-config の ESCORT_LABEL_FONT_PX の写し: ui-config・game-config は DOM を読むので使わない）。原点は上の真ん中で、隣のラベルはみな 1 行。
import { describe, expect, it } from 'vitest';
import { CONVOY_MARKER_LABEL, CONVOY_TARGET_LABEL } from '../src/config/convoy-config';
import { gameData } from '../src/config/game-data';
import { buildWorldSetup } from '../src/systems/world-setup';
import { textWidthPx } from './pt-ui-kit';

const LABEL_PX = 22;

describe('狙われている大発のラベル（v0.6.4 最終確認）', () => {
  it('1 行目は隣と同じ「大発」で、足す語は 2 行目。jp_01 の隊列の最も狭い間隔で、隣のラベルと同じ高さの行は重ならない', () => {
    const s = buildWorldSetup(gameData, 'jp_01');
    const off = s.convoy!.params.offsetsM;
    let gap = Infinity;
    for (let i = 1; i < off.length; i++) gap = Math.min(gap, Math.abs(off[i]! - off[i - 1]!));
    expect(gap).toBe(120);
    expect(CONVOY_MARKER_LABEL).not.toContain('\n');
    const rows = CONVOY_TARGET_LABEL.split('\n');
    expect(rows).toEqual([CONVOY_MARKER_LABEL, '狙われている']);
    const neighbor = textWidthPx(CONVOY_MARKER_LABEL, LABEL_PX);
    // 隣と同じ高さの行（1 行目）は、半幅の和が間隔より狭い（2 行目の高さに隣の文字は無い）
    expect((textWidthPx(rows[0]!, LABEL_PX) + neighbor) / 2).toBeLessThan(gap);
    // 直す前の 1 行の形は重なる: (220 + 44) / 2 = 132 m > 120 m
    expect((textWidthPx('大発（狙われている）', LABEL_PX) + neighbor) / 2).toBeGreaterThan(gap);
  });
});
