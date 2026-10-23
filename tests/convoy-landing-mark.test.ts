// 浜の上陸地点の印と浜に残る大発のラベル（v0.6.4 実機 1 回目「大発が浜に上陸っていうけど何もない海の真ん中で消えていくので意味不明です」。core/convoy の convoyLandingMark・systems/convoy）:
// 砂色の帯は上陸地点 3 つと浜に乗り上げた絵を覆い、ラベル「上陸地点」は陸の側で、浜に残る大発のラベル「上陸」（上陸地点ごと。隣どうしも）とも、陸のラベル「ガダルカナル島（カミンボ）」とも重ならない。
// ラベルは世界の座標の文字（px = m）。「上陸」は ui-config の ESCORT_LABEL_FONT_PX 22・ESCORT_LABEL_OFFSET_M 18 の写し（ui-config・game-config は DOM を読むので使わない。tests/convoy-label と同じ）。
// 行の高さはヘッドレスの getBounds（22 px の「上陸」は 27 m、36 px の「上陸地点」は 43 m）より広めに字の大きさ × 1.3。原点: 「上陸」「上陸地点」は上の真ん中、陸のラベルは真ん中（entities/shallows）。
import { describe, expect, it } from 'vitest';
import { CONVOY_BEACHED_LABEL, CONVOY_LANDING_MARK_LABEL, CONVOY_LANDING_MARK_LABEL_OFFSET_M, CONVOY_LANDING_MARK_PAD_M } from '../src/config/convoy-config';
import { gameData } from '../src/config/game-data';
import { COAST_LABEL_FONT_PX } from '../src/config/hunt-config';
import { convoyLandingMark } from '../src/core/convoy';
import { convoyParamsAtNight } from '../src/core/convoy-data';
import { buildWorldSetup } from '../src/systems/world-setup';
import { textWidthPx } from './pt-ui-kit';

const LABEL_PX = 22;
const LABEL_OFFSET_M = 18;
const LINE = 1.3;
/** 上陸の瞬間の行き過ぎ（浜の線を越えた 1 ステップ。tests/convoy-beach で上陸地点から 1 m 以内） */
const OVERSHOOT_M = 1;

const S = buildWorldSetup(gameData, 'jp_01');
const P = S.convoy!.params;
const BP = P.beach!;
const MK = convoyLandingMark(BP, CONVOY_LANDING_MARK_PAD_M, CONVOY_LANDING_MARK_LABEL_OFFSET_M);

describe('上陸地点の印（v0.6.4 実機 1 回目）', () => {
  it('帯は岸の線 y 3,000 の x 3,500〜3,700（上陸地点 3,540〜3,660 の両端から 40 m）、ラベル「上陸地点」は (3600, 3040) を上の真ん中に陸の側', () => {
    expect(MK).toEqual({ x0: 3500, x1: 3700, y: 3000, labelX: 3600, labelY: 3040 });
    expect(MK.y).toBe(S.mission.bounds.height);
    // 浜に乗り上げた絵（中心が上陸地点、表示の半長）も帯の内
    for (const x of BP.x) {
      expect(x - P.boundsMarginM).toBeGreaterThanOrEqual(MK.x0);
      expect(x + P.boundsMarginM).toBeLessThanOrEqual(MK.x1);
    }
  });

  it('浜に残る大発のラベル「上陸」: 隣どうし（60 m おき）は重ならず、陸の上（y 3,006〜）で「上陸地点」の上の行に収まる', () => {
    let gap = Infinity;
    for (let i = 1; i < BP.x.length; i++) gap = Math.min(gap, Math.abs(BP.x[i]! - BP.x[i - 1]!));
    expect(gap).toBe(60);
    const w = textWidthPx(CONVOY_BEACHED_LABEL, LABEL_PX);
    expect(w).toBe(44);
    expect(w).toBeLessThan(gap);
    const top = BP.y + LABEL_OFFSET_M;
    expect(top).toBe(3006);
    expect(top).toBeGreaterThan(BP.shoreY);
    expect(top + OVERSHOOT_M + LABEL_PX * LINE).toBeLessThan(MK.labelY);
  });

  it('「上陸地点」は陸の内で、陸のラベル「ガダルカナル島（カミンボ）」（陸の真ん中）と重ならない', () => {
    const coast = S.mission.coast!;
    const b = S.mission.bounds;
    const half = textWidthPx(CONVOY_LANDING_MARK_LABEL, COAST_LABEL_FONT_PX) / 2;
    const box = [MK.labelX - half, MK.labelY, MK.labelX + half, MK.labelY + COAST_LABEL_FONT_PX * LINE];
    expect(box[3]!).toBeLessThan(b.height + coast.landM);
    const ch = textWidthPx(coast.label, COAST_LABEL_FONT_PX) / 2;
    const cv = (COAST_LABEL_FONT_PX * LINE) / 2;
    const land = [b.width / 2 - ch, b.height + coast.landM / 2 - cv, b.width / 2 + ch, b.height + coast.landM / 2 + cv];
    const overlap = box[0]! < land[2]! && land[0]! < box[2]! && box[1]! < land[3]! && land[1]! < box[3]!;
    expect(overlap).toBe(false);
  });

  it('左右反転の夜（jp_01 は mirror_chance 0。core/convoy-data の convoyParamsAtNight）でも、反転した上陸地点を覆う', () => {
    const m = convoyLandingMark(convoyParamsAtNight(P, 0, true, S.mission.bounds.width).beach!, CONVOY_LANDING_MARK_PAD_M, CONVOY_LANDING_MARK_LABEL_OFFSET_M);
    expect(m).toEqual({ x0: 2300, x1: 2500, y: 3000, labelX: 2400, labelY: 3040 });
  });
});
