// 右側の 2 列の兵装パネル（v0.6.8。config/hud-layout-config。spec-v068 §4.1・§4.2・§6.1）: 論理幅 1280・1344・1560・1584 × 7 任務で、当たりが重ならない・当たりの間 ≥ 12 px・
// 当たり ≥ 81 px・ビルド番号・2 行目・3 行目・スティック・一時停止・計器・速力（と機関）の表示・兵装の上の文・「一斉 N 本」・つまむ帯に触れない・端の印の文がパネルに届かない。
// 検査は spec の layout.mjs の check() を写した（固定の箱の値はその写し）。値の pin: 列 W − 88 / W − 232、魚雷 560 / 568、機銃 632 / 589、扇 642〜682（当たり 638〜720）、
// 技能の段 400 / 280、速力の右端 W − 312、端の印の余白 352、つまむ帯 W − 304、避ける角 W − 624。y ≥ 682（ホームバーの帯）に入るのは主の機銃と扇だけ。
import { describe, expect, it } from 'vitest';
import {
  HIT_PAD,
  HOME_BAND_Y,
  MARKER_LABEL_HALF,
  MIN_HIT,
  RUDDER_HALF,
  R_PRIMARY,
  R_SECONDARY,
  R_SKILL,
  TEXT_GAP,
  cueAnchorX,
  markerRightMargin,
  panelLayout,
  pinchMaxX,
  speedHudKeepLeft,
  speedHudRightX,
  type PanelCircle,
  type PanelLayout,
  type PanelPrimary,
  type PanelRect,
} from '../src/config/hud-layout-config';
import { SECONDARY_SCALE } from '../src/config/arms-config';
import { textWidthPx } from './pt-ui-kit';

const H = 720;
const M = 24;
const WIDTHS = [1280, 1344, 1560, 1584];
const MISSIONS: Record<string, [PanelPrimary, { smoke: boolean; identify: boolean }, { engine?: boolean }]> = {
  us_01: ['torpedo', { smoke: true, identify: false }, {}],
  us_02: ['torpedo', { smoke: true, identify: true }, {}],
  us_03: ['guns', { smoke: true, identify: false }, {}],
  jp_01: ['guns', { smoke: false, identify: false }, {}],
  jp_02: ['guns', { smoke: false, identify: false }, {}],
  jp_05: ['guns', { smoke: false, identify: false }, { engine: true }],
  jp_06: ['torpedo', { smoke: false, identify: false }, {}],
};

const circleHit = (b: PanelCircle): PanelRect => ({ x0: b.x - b.r - HIT_PAD, y0: b.y - b.r - HIT_PAD, x1: b.x + b.r + HIT_PAD, y1: b.y + b.r + HIT_PAD });
const inter = (a: PanelRect, b: PanelRect): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
function gap(a: PanelRect, b: PanelRect): number {
  const dx = Math.max(0, Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1));
  const dy = Math.max(0, Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1));
  return Math.max(dx, dy);
}
/** 文の幅の見積もり（ASCII 0.602 em、それ以外 1 em。layout.mjs と同じ） */
function textW(s: string, px: number): number {
  let w = 0;
  for (const ch of s) w += ch.charCodeAt(0) <= 0x7e ? 0.602 * px : px;
  return w;
}

/** 触れてはいけない固定の箱（layout.mjs の fixedBoxes の写し。ビルド番号は 813 px 幅） */
function fixedBoxes(W: number, engine: boolean): Record<string, PanelRect> {
  const sp = speedHudRightX(W);
  const b: Record<string, PanelRect> = {
    fps: { x0: 24, y0: 24, x1: 100, y1: 46 },
    clock: { x0: 24, y0: 50, x1: 208, y1: 74 },
    hp: { x0: 24, y0: 82, x1: 342, y1: 126 },
    fuel: { x0: 24, y0: 126, x1: 342, y1: 166 },
    pause: { x0: 24, y0: 234, x1: 96, y1: 306 },
    stickGrab: { x0: 31, y0: 403, x1: 317, y1: 689 },
    buildLabel: { x0: W / 2 - 813 / 2, y0: 24, x1: W / 2 + 813 / 2, y1: 46 },
    line2: { x0: 220, y0: 50, x1: W - 220, y1: 76 },
    line3: { x0: W / 2 - 300, y0: 80, x1: W / 2 + 300, y1: 104 },
    speedHud: { x0: sp - 2 * RUDDER_HALF, y0: 584, x1: sp, y1: 696 },
  };
  if (engine) b['engineHud'] = { x0: sp - 80 - 8 - textW('機関の熱', 18), y0: 552, x1: sp, y1: 574 };
  return b;
}

function check(L: PanelLayout, engine: boolean): { errors: string[]; minGap: number; hits: Array<[string, PanelRect]> } {
  const W = L.W;
  const errors: string[] = [];
  const hits: Array<[string, PanelRect]> = [['torpedo', circleHit(L.torpedo)], ['gun', circleHit(L.gun)], ['spread', L.spread.hit], ...L.skills.map((s): [string, PanelRect] => [s.kind, circleHit({ x: s.x, y: s.y, r: R_SKILL })])];
  const cue: PanelRect = { x0: L.cue.left, y0: L.cue.bottom - Math.round(L.cue.px * 1.2), x1: L.cue.right, y1: L.cue.bottom };
  const salvoW = textW('一斉 4 本', 22);
  const salvo: PanelRect = { x0: L.salvoLabel.x - salvoW / 2, y0: L.salvoLabel.bottom - 26, x1: L.salvoLabel.x + salvoW / 2, y1: L.salvoLabel.bottom };
  let minGap = Infinity;
  for (let i = 0; i < hits.length; i++)
    for (let j = i + 1; j < hits.length; j++) {
      if (inter(hits[i]![1], hits[j]![1])) errors.push(`hit overlap ${hits[i]![0]}×${hits[j]![0]}`);
      minGap = Math.min(minGap, gap(hits[i]![1], hits[j]![1]));
    }
  if (minGap < 12) errors.push(`hit gap ${minGap.toFixed(1)} < 12`);
  const fb = fixedBoxes(W, engine);
  for (const [n, r] of hits) {
    for (const [k, b] of Object.entries(fb)) if (inter(r, b)) errors.push(`${n} × ${k}`);
    if (inter(r, cue)) errors.push(`${n} × cue`);
    if (n !== 'torpedo' && inter(r, salvo)) errors.push(`${n} × 一斉`);
    if (r.x1 > W || r.y1 > H || r.x0 < 0) errors.push(`${n} outside`);
    if (r.x0 < pinchMaxX(W)) errors.push(`${n} in pinch band`);
    if (r.x1 - r.x0 < MIN_HIT || r.y1 - r.y0 < MIN_HIT) errors.push(`${n} hit < 81`);
  }
  for (const [k, b] of Object.entries(fb)) {
    if (k === 'speedHud' || k === 'engineHud') continue;
    if (inter(fb['speedHud']!, b)) errors.push(`speedHud × ${k}`);
    if (fb['engineHud'] && inter(fb['engineHud'], b)) errors.push(`engineHud × ${k}`);
  }
  if (inter(cue, fb['speedHud']!)) errors.push('cue × speedHud');
  if (W - markerRightMargin(W) + MARKER_LABEL_HALF > L.panelLeft - TEXT_GAP + 0.001) errors.push('marker label reaches panel');
  return { errors, minGap, hits };
}

describe('右側の 2 列の兵装パネル（config/hud-layout-config）', () => {
  for (const W of WIDTHS)
    for (const [id, [prim, has, opts]] of Object.entries(MISSIONS))
      it(`W ${W} ${id}: 重なり・触れる箱なし、当たりの間 ≥ 12、当たり ≥ 81、ホームバーの帯は主の機銃と扇だけ`, () => {
        const L = panelLayout(W, prim, has);
        const c = check(L, opts.engine === true);
        expect(c.errors).toEqual([]);
        expect(c.minGap).toBeGreaterThanOrEqual(12);
        for (const [n, r] of c.hits) expect(r.x1 - r.x0 >= MIN_HIT && r.y1 - r.y0 >= MIN_HIT, n).toBe(true);
        const inBand = c.hits.filter(([, r]) => r.y1 > HOME_BAND_Y).map(([n]) => n);
        expect(inBand.sort()).toEqual(prim === 'guns' ? ['gun', 'spread'] : ['spread']);
      });

  it('値の pin（どの幅でも y は同じ）', () => {
    for (const W of WIDTHS) {
      const T = panelLayout(W, 'torpedo', { smoke: true, identify: true });
      const G = panelLayout(W, 'guns', { smoke: true, identify: false });
      expect([T.c1, T.c2, G.c1, G.c2]).toEqual([W - 88, W - 232, W - 88, W - 232]);
      expect([T.torpedo, T.gun]).toEqual([{ x: W - 88, y: 560, r: R_PRIMARY }, { x: W - 232, y: 589, r: R_SECONDARY }]);
      expect([G.gun, G.torpedo]).toEqual([{ x: W - 88, y: 632, r: R_PRIMARY }, { x: W - 232, y: 568, r: R_SECONDARY }]);
      for (const L of [T, G]) {
        expect([L.spread.y - L.spread.h / 2, L.spread.y + L.spread.h / 2, L.spread.hit.y0, L.spread.hit.y1]).toEqual([642, 682, 638, 720]);
        expect([L.spread.x, L.spread.w]).toEqual([L.torpedo.x, 2 * L.torpedo.r]);
        expect(L.salvoLabel).toEqual({ x: L.torpedo.x, bottom: L.torpedo.y - L.torpedo.r - 8 });
        expect(L.cue).toEqual({ left: W - 288, right: W - 24, bottom: 488, px: 22, maxW: 264 });
      }
      expect(T.skills.map((s) => [s.kind, s.x, s.y])).toEqual([['smoke', W - 88, 400], ['extinguish', W - 232, 400], ['lookout', W - 232, 280], ['identify', W - 88, 280]]);
      expect(panelLayout(W, 'guns', { smoke: false, identify: false }).skills.map((s) => [s.kind, s.x, s.y])).toEqual([['extinguish', W - 232, 400], ['lookout', W - 88, 400]]);
      expect([T.panelLeft, T.speedRight, speedHudRightX(W), markerRightMargin(W), pinchMaxX(W), speedHudKeepLeft(W)]).toEqual([W - 288, W - 312, W - 312, 352, W - 304, W - 624]);
    }
    expect(SECONDARY_SCALE).toBe(R_SECONDARY / R_PRIMARY);
    // 端の印の文の半幅は 4 桁の距離の本当の幅から（レビュー ux-marker-cue-4px: 52 では「帰投 2800 m」の右端がパネルの左 − 4 px で、兵装の上の 1 行と 1 つの文に読めた）。地図は 6 km 四方までなので 4 桁まで
    for (const label of ['帰投 9900 m', '敵機 9900 m', '大発 9900 m', '隼艇 9900 m', 'PT 9900 m']) expect(textWidthPx(label, 18) / 2, label).toBeLessThanOrEqual(MARKER_LABEL_HALF);
    expect(MARKER_LABEL_HALF - textWidthPx('帰投 9900 m', 18) / 2).toBeLessThan(1);
    expect(H - M).toBe(696);
  });

  it('兵装の上の文の中心: 兵装の中心、幅のある文は帯 [W − 288, W − 24] に寄せる', () => {
    const W = 1344;
    const T = panelLayout(W, 'torpedo', { smoke: true, identify: false });
    expect([cueAnchorX(T, 'torpedo'), cueAnchorX(T, 'gun')]).toEqual([W - 88, W - 232]);
    expect(cueAnchorX(T, 'torpedo', 246)).toBe(W - 24 - 123);
    expect(cueAnchorX(T, 'gun', 246)).toBe(W - 288 + 123);
    expect(cueAnchorX(T, 'gun', 100)).toBe(W - 232);
    expect(cueAnchorX(T, 'gun', 9999)).toBe((W - 288 + W - 24) / 2);
  });
});
