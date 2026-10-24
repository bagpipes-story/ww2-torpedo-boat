// 浜の上陸地点の印と浜に残る大発のラベル（v0.6.4 実機 1 回目「大発が浜に上陸っていうけど何もない海の真ん中で消えていくので意味不明です」。core/convoy の convoyLandingMark・systems/convoy）:
// 砂色の帯は上陸地点 3 つと浜に乗り上げた絵を覆い、ラベル「上陸地点」は陸の側で帯の針路の後ろの端の外（レビュー ux-4）、浜に残る大発のラベル「上陸」（上陸地点ごと。隣どうしも）とも、
// 陸のラベル「ガダルカナル島（カミンボ）」とも重ならない。狙われている大発の 2 行のラベルは浜へ向かう間は絵の上（レビュー R1。core/convoy の convoyLabelAbove）で、浜の字に重ならない。
// ラベルは世界の座標の文字（px = m）。「上陸」は ui-config の ESCORT_LABEL_FONT_PX 22・ESCORT_LABEL_OFFSET_M 18 の写し（ui-config・game-config は DOM を読むので使わない。tests/convoy-label と同じ）。
// 行の高さはヘッドレスの getBounds（22 px の「上陸」は 27 m、36 px の「上陸地点」は 43 m）より広めに字の大きさ × 1.3。原点: 「上陸」は上の真ん中、「上陸地点」は上の右か左の端、陸のラベルは真ん中（entities/shallows）。
import { describe, expect, it } from 'vitest';
import { CONVOY_BEACHED_LABEL, CONVOY_LANDING_MARK_LABEL, CONVOY_LANDING_MARK_LABEL_OFFSET_M, CONVOY_LANDING_MARK_PAD_M, CONVOY_MARKER_LABEL, CONVOY_TARGET_LABEL } from '../src/config/convoy-config';
import { gameData } from '../src/config/game-data';
import { COAST_LABEL_FONT_PX } from '../src/config/hunt-config';
import { CV_ARRIVED, CV_SAILING, CV_SUNK, convoyLabelAbove, convoyLandingMark, createConvoy, stepConvoy, type ConvoyBarge, type ConvoyLandingMark } from '../src/core/convoy';
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
const MK = convoyLandingMark(P, BP, CONVOY_LANDING_MARK_PAD_M, CONVOY_LANDING_MARK_LABEL_OFFSET_M);
type Box = readonly [number, number, number, number];
const hit = (a: Box, c: Box): boolean => a[0] < c[2] && c[0] < a[2] && a[1] < c[3] && c[1] < a[3];
/** 「上陸地点」の矩形（上の端・原点 labelOriginX） */
const markBox = (m: ConvoyLandingMark): Box => {
  const w = textWidthPx(CONVOY_LANDING_MARK_LABEL, COAST_LABEL_FONT_PX);
  return [m.labelX - m.labelOriginX * w, m.labelY, m.labelX + (1 - m.labelOriginX) * w, m.labelY + COAST_LABEL_FONT_PX * LINE];
};
/** 大発のラベルの矩形（systems/convoy の placeLabel と同じ置き方: 絵の下は上の真ん中が y + 18、絵の上は下の真ん中が y − 18。行ごとの幅の最大） */
const labelBox = (b: ConvoyBarge, text: string, above: boolean): Box => {
  const lines = text.split('\n');
  const w = Math.max(...lines.map((l) => textWidthPx(l, LABEL_PX)));
  const h = lines.length * LABEL_PX * LINE;
  const top = above ? b.y - LABEL_OFFSET_M - h : b.y + LABEL_OFFSET_M;
  return [b.x - w / 2, top, b.x + w / 2, top + h];
};
/** 大発の絵の矩形（表示の半長の正方形。どの向きでも絵を覆う） */
const spriteBox = (b: ConvoyBarge): Box => [b.x - P.boundsMarginM, b.y - P.boundsMarginM, b.x + P.boundsMarginM, b.y + P.boundsMarginM];

describe('上陸地点の印（v0.6.4 実機 1 回目）', () => {
  it('帯は岸の線 y 3,000 の x 3,500〜3,700（上陸地点 3,540〜3,660 の両端から 40 m）、ラベル「上陸地点」は帯の西の端（針路の後ろ）に右の端を揃えて y 3,040 から陸の側', () => {
    expect(MK).toEqual({ x0: 3500, x1: 3700, y: 3000, labelX: 3500, labelY: 3040, labelOriginX: 1 });
    expect(MK.y).toBe(S.mission.bounds.height);
    // 浜に乗り上げた絵（中心が上陸地点、表示の半長）も帯の内
    for (const x of BP.x) {
      expect(x - P.boundsMarginM).toBeGreaterThanOrEqual(MK.x0);
      expect(x + P.boundsMarginM).toBeLessThanOrEqual(MK.x1);
    }
  });

  it('浜に残る大発のラベル「上陸」: 隣どうし（60 m おき）は重ならず、陸の上（y 3,006〜）で「上陸地点」の上の行に収まる。「上陸地点」は西の端の「上陸」（3,518〜）より西', () => {
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
    const mb = markBox(MK);
    expect(mb[2]).toBeLessThan(Math.min(...BP.x) - w / 2);
    for (const x of BP.x) expect(hit(mb, [x - w / 2, top, x + w / 2, top + OVERSHOOT_M + LABEL_PX * LINE])).toBe(false);
  });

  it('「上陸地点」は陸の内で、陸のラベル「ガダルカナル島（カミンボ）」（陸の真ん中）と重ならない', () => {
    const coast = S.mission.coast!;
    const b = S.mission.bounds;
    const box = markBox(MK);
    expect(box[3]).toBeLessThan(b.height + coast.landM);
    expect(box[0]).toBeGreaterThan(0);
    const ch = textWidthPx(coast.label, COAST_LABEL_FONT_PX) / 2;
    const cv = (COAST_LABEL_FONT_PX * LINE) / 2;
    const land: Box = [b.width / 2 - ch, b.height + coast.landM / 2 - cv, b.width / 2 + ch, b.height + coast.landM / 2 + cv];
    expect(hit(box, land)).toBe(false);
  });

  it('左右反転の夜（jp_01 は mirror_chance 0。core/convoy-data の convoyParamsAtNight）でも、反転した上陸地点を覆い、「上陸地点」は東の端（西へ向かう隊の後ろ）に左の端を揃える', () => {
    const mp = convoyParamsAtNight(P, 0, true, S.mission.bounds.width);
    const m = convoyLandingMark(mp, mp.beach!, CONVOY_LANDING_MARK_PAD_M, CONVOY_LANDING_MARK_LABEL_OFFSET_M);
    expect(m).toEqual({ x0: 2300, x1: 2500, y: 3000, labelX: 2500, labelY: 3040, labelOriginX: 0 });
  });
});

describe('狙われている大発のラベル（レビュー R1: 浜へ向かう間は絵の上）', () => {
  it('convoyLabelAbove: 浜のある隊で浜へ向かう（leg 1）大発が狙われている間だけ（沈む間もそのまま）。航路の上・狙われていない・上陸した・浜の無い隊は絵の下', () => {
    const b = createConvoy(P).barges[0]!;
    expect(convoyLabelAbove(P, b, true)).toBe(false); // leg 0
    b.leg = 1;
    expect([convoyLabelAbove(P, b, true), convoyLabelAbove(P, b, false)]).toEqual([true, false]);
    b.phase = CV_SUNK;
    expect(convoyLabelAbove(P, b, true)).toBe(true);
    b.phase = CV_ARRIVED;
    expect(convoyLabelAbove(P, b, true)).toBe(false);
    const { beach: _b, ...noBeach } = P;
    expect(convoyLabelAbove(noBeach, { ...b, phase: CV_SAILING }, true)).toBe(false);
  });

  it('邪魔をせずに回した夜の浜へ向かう間ずっと、狙われている大発の 2 行（132 × 57 m）は「上陸地点」・ほかの大発の絵とラベル（上陸した「上陸」・航行中の「大発」）・自分の絵に重ならない。絵の下のままだと最後の約 2 秒に重なる（直す前）', () => {
    expect(textWidthPx('狙われている', LABEL_PX)).toBe(132);
    const f = createConvoy(P);
    const mb = markBox(MK);
    let frames = 0;
    let belowHits = 0;
    const bad: string[] = [];
    for (let k = 1; k <= 200 * 60 && f.arrived < 3; k++) {
      stepConvoy(f, P, gameData.hitRateModel.world.time_scale / 60, { onArrived: () => {}, onSunk: () => {} });
      for (let i = 0; i < 3; i++) {
        const b = f.barges[i]!;
        if (b.phase !== CV_SAILING || b.leg !== 1) continue;
        frames++;
        expect(convoyLabelAbove(P, b, true)).toBe(true);
        const up = labelBox(b, CONVOY_TARGET_LABEL, true);
        const down = labelBox(b, CONVOY_TARGET_LABEL, false);
        const others: Box[] = [mb];
        for (let j = 0; j < 3; j++) {
          if (j === i) continue;
          const o = f.barges[j]!;
          others.push(spriteBox(o), labelBox(o, o.phase === CV_ARRIVED ? CONVOY_BEACHED_LABEL : CONVOY_MARKER_LABEL, false));
        }
        if (others.some((o) => hit(up, o)) || hit(up, spriteBox(b))) bad.push(`${(k / 60).toFixed(2)} 秒 ${i}`);
        if (others.some((o) => hit(down, o))) belowHits++;
      }
    }
    expect(f.arrived).toBe(3);
    expect(frames).toBeGreaterThan(3 * 38 * 60); // 浜への道 711 m ÷ 18 m/秒 ≈ 39.5 秒 × 3 隻
    expect(bad).toEqual([]);
    expect(belowHits).toBeGreaterThan(60); // 絵の下（前の置き方）は 1 秒以上ぶん重なる
  });
});
