// 右下の兵装と右端の技能（v0.6.8。config/hud-layout-config。spec-v068 §4.1・§4.2・§6.1、実機 1 回目の直し spec-ip1 D5〜D7）: 論理幅 1280・1344・1560・1584 × 7 任務で、当たりが重ならない・
// 当たりの間 ≥ 12 px・当たり ≥ 81 px・ビルド番号・2 行目・3 行目・スティック・一時停止・計器・速力（と機関）の表示・兵装の上の文・「一斉 N 本」・つまむ帯に触れない・端の印の文がパネルに届かない。
// 検査は spec の layout.mjs の check() を写した（固定の箱の値はその写し）。値の pin: 魚雷は全任務で列 W − 88・y 560（R64）、機銃はその左の列 W − 232・y 589（R56）、扇 642〜682（当たり 638〜720）、
// 技能は x W − 68 の縦一列（R44）で上から 煙幕 68・消火 180・見張り 292・識別 404（無いボタンの段は空く）、速力の右端 W − 312、端の印の余白 352、つまむ帯 W − 304、避ける角 W − 624。
// y ≥ 682（ホームバーの帯）に入るのはどの任務も扇だけ。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  HIT_PAD,
  HOME_BAND_Y,
  MARKER_LABEL_HALF,
  MIN_HIT,
  RUDDER_HALF,
  R_GUN,
  R_SKILL,
  R_TORPEDO,
  SKILL_FONT_PX,
  SKILL_GAP,
  SKILL_ORDER,
  TEXT_GAP,
  cueAnchorX,
  markerRightMargin,
  panelLayout,
  pinchMaxX,
  skillColumnX,
  skillSlotY,
  speedHudKeepLeft,
  speedHudRightX,
  type PanelCircle,
  type PanelLayout,
  type PanelRect,
} from '../src/config/hud-layout-config';
import { GUN_BUTTON_FONT_PX, GUN_BUTTON_SCALE } from '../src/config/arms-config';
import { textWidthPx } from './pt-ui-kit';

const H = 720;
const M = 24;
const WIDTHS = [1280, 1344, 1560, 1584];
/** 任務ごとの技能のボタン（煙幕は艇の煙幕発生器・識別は今夜の味方機）と機関の表示。兵装の置き方は main_weapon に関わらず同じ（v0.6.8 実機 1 回目） */
const MISSIONS: Record<string, [{ smoke: boolean; identify: boolean }, { engine?: boolean }]> = {
  us_01: [{ smoke: true, identify: false }, {}],
  us_02: [{ smoke: true, identify: true }, {}],
  us_03: [{ smoke: true, identify: false }, {}],
  jp_01: [{ smoke: false, identify: false }, {}],
  jp_02: [{ smoke: false, identify: false }, {}],
  jp_05: [{ smoke: false, identify: false }, { engine: true }],
  jp_06: [{ smoke: false, identify: false }, {}],
};

const circleHit = (b: PanelCircle): PanelRect => ({ x0: b.x - b.r - HIT_PAD, y0: b.y - b.r - HIT_PAD, x1: b.x + b.r + HIT_PAD, y1: b.y + b.r + HIT_PAD });
const skillHit = (s: { x: number; y: number }): PanelRect => circleHit({ x: s.x, y: s.y, r: R_SKILL });
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
/** 兵装の上の 1 行の文の帯と「一斉 N 本」の文の箱 */
const cueBox = (L: PanelLayout): PanelRect => ({ x0: L.cue.left, y0: L.cue.bottom - Math.round(L.cue.px * 1.2), x1: L.cue.right, y1: L.cue.bottom });
function salvoBox(L: PanelLayout): PanelRect {
  const w = textW('一斉 4 本', 22);
  return { x0: L.salvoLabel.x - w / 2, y0: L.salvoLabel.bottom - 26, x1: L.salvoLabel.x + w / 2, y1: L.salvoLabel.bottom };
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
  const hits: Array<[string, PanelRect]> = [['torpedo', circleHit(L.torpedo)], ['gun', circleHit(L.gun)], ['spread', L.spread.hit], ...L.skills.map((s): [string, PanelRect] => [s.kind, skillHit(s)])];
  const cue = cueBox(L);
  const salvo = salvoBox(L);
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

describe('右下の兵装と右端の技能（config/hud-layout-config）', () => {
  for (const W of WIDTHS)
    for (const [id, [has, opts]] of Object.entries(MISSIONS))
      it(`W ${W} ${id}: 重なり・触れる箱なし、当たりの間 ≥ 12、当たり ≥ 81、ホームバーの帯は扇だけ`, () => {
        const L = panelLayout(W, has);
        const c = check(L, opts.engine === true);
        expect(c.errors).toEqual([]);
        expect(c.minGap).toBeGreaterThanOrEqual(12);
        for (const [n, r] of c.hits) expect(r.x1 - r.x0 >= MIN_HIT && r.y1 - r.y0 >= MIN_HIT, n).toBe(true);
        const inBand = c.hits.filter(([, r]) => r.y1 > HOME_BAND_Y).map(([n]) => n);
        expect(inBand).toEqual(['spread']);
      });

  it('値の pin（どの幅でも y は同じ。兵装はどの任務も同じ: 角が魚雷 R64・その左が機銃 R56）', () => {
    for (const W of WIDTHS) {
      const all = panelLayout(W, { smoke: true, identify: true });
      const jp = panelLayout(W, { smoke: false, identify: false });
      for (const L of [all, jp, panelLayout(W, { smoke: true, identify: false }), panelLayout(W, { smoke: false, identify: true })]) {
        expect([L.c1, L.c2]).toEqual([W - 88, W - 232]);
        expect([L.torpedo, L.gun]).toEqual([{ x: W - 88, y: 560, r: R_TORPEDO }, { x: W - 232, y: 589, r: R_GUN }]);
        expect([L.spread.y - L.spread.h / 2, L.spread.y + L.spread.h / 2, L.spread.hit.y0, L.spread.hit.y1]).toEqual([642, 682, 638, 720]);
        expect([L.spread.x, L.spread.w, L.spread.hit.x0, L.spread.hit.x1]).toEqual([W - 88, 128, W - 152, W - 24]);
        expect(L.salvoLabel).toEqual({ x: W - 88, bottom: 488 });
        expect(L.cue).toEqual({ left: W - 288, right: W - 24, bottom: 488, px: 22, maxW: 264 });
        expect([L.panelLeft, L.speedRight]).toEqual([W - 288, W - 312]);
        // 技能は x W − 68 の縦一列で、円の右端は魚雷の右端 W − 24 と揃う
        for (const s of L.skills) expect([s.x, s.x + R_SKILL]).toEqual([W - 68, L.torpedo.x + L.torpedo.r]);
      }
      expect(all.skills.map((s) => [s.kind, s.label, s.x, s.y])).toEqual([
        ['smoke', '煙幕', W - 68, 68],
        ['extinguish', '消火', W - 68, 180],
        ['lookout', '見張り', W - 68, 292],
        ['identify', '識別', W - 68, 404],
      ]);
      // 日本の艇（煙幕なし・味方機なし）は消火 180 と見張り 292 だけ（煙幕の段は空く）、識別だけ無い夜は 3 段、煙幕だけ無い夜は識別の段のまま
      expect(jp.skills.map((s) => [s.kind, s.label, s.x, s.y])).toEqual([['extinguish', '消火', W - 68, 180], ['lookout', '見張り', W - 68, 292]]);
      expect(panelLayout(W, { smoke: true, identify: false }).skills.map((s) => [s.kind, s.y])).toEqual([['smoke', 68], ['extinguish', 180], ['lookout', 292]]);
      expect(panelLayout(W, { smoke: false, identify: true }).skills.map((s) => [s.kind, s.y])).toEqual([['extinguish', 180], ['lookout', 292], ['identify', 404]]);
      expect([speedHudRightX(W), markerRightMargin(W), pinchMaxX(W), speedHudKeepLeft(W), skillColumnX(W)]).toEqual([W - 312, 352, W - 304, W - 624, W - 68]);
    }
    expect(SKILL_ORDER).toEqual(['smoke', 'extinguish', 'lookout', 'identify']);
    expect([0, 1, 2, 3].map((i) => skillSlotY(i))).toEqual([68, 180, 292, 404]);
    expect([R_TORPEDO, R_GUN, R_SKILL, SKILL_GAP, SKILL_FONT_PX]).toEqual([64, 56, 44, 24, 20]);
    expect(GUN_BUTTON_SCALE).toBe(R_GUN / R_TORPEDO);
    expect(SKILL_FONT_PX).toBe(GUN_BUTTON_FONT_PX); // 技能の文字は機銃と同じ 20 px（22 px は R44 に重い）
    // 端の印の文の半幅は 4 桁の距離の本当の幅から（レビュー ux-marker-cue-4px: 52 では「帰投 2800 m」の右端がパネルの左 − 4 px で、兵装の上の 1 行と 1 つの文に読めた）。地図は 6 km 四方までなので 4 桁まで
    for (const label of ['帰投 9900 m', '敵機 9900 m', '大発 9900 m', '隼艇 9900 m', 'PT 9900 m']) expect(textWidthPx(label, 18) / 2, label).toBeLessThanOrEqual(MARKER_LABEL_HALF);
    expect(MARKER_LABEL_HALF - textWidthPx('帰投 9900 m', 18) / 2).toBeLessThan(1);
    expect(H - M).toBe(696);
  });

  it('技能の当たり（R44 ± 1.8 = 91.6 px）: 81 px 以上・段の間 20.4 px、兵装の上の文の帯・「一斉 N 本」・2 行目・3 行目・ビルド番号に触れない（識別の下端 449.8 と帯の上端 462 の間 12.2・煙幕の左端 W − 113.8 は 2 行目の右端 W − 220 の右）', () => {
    for (const W of WIDTHS) {
      const L = panelLayout(W, { smoke: true, identify: true });
      const fb = fixedBoxes(W, false);
      const hs = L.skills.map(skillHit);
      for (const h of hs) expect([h.x1 - h.x0, h.y1 - h.y0].every((v) => v >= MIN_HIT && Math.abs(v - 91.6) < 1e-9)).toBe(true);
      for (let i = 1; i < hs.length; i++) expect(gap(hs[i - 1]!, hs[i]!)).toBeCloseTo(20.4, 9);
      const boxes: Array<[string, PanelRect]> = [['cue', cueBox(L)], ['一斉', salvoBox(L)], ['line2', fb['line2']!], ['line3', fb['line3']!], ['buildLabel', fb['buildLabel']!]];
      for (const [k, b] of boxes) for (const [i, h] of hs.entries()) expect(inter(h, b), `${L.skills[i]!.kind} × ${k}`).toBe(false);
      expect(cueBox(L).y0 - hs[3]!.y1).toBeCloseTo(12.2, 9);
      expect(hs[0]!.x0).toBeCloseTo(W - 113.8, 9);
      expect(hs[0]!.x0).toBeGreaterThan(fb['line2']!.x1);
      expect(fb['line2']!.x1).toBe(W - 220);
      // 魚雷の当たりの上端（496 − 1.8）まで識別の下から 44.4 px
      expect(circleHit(L.torpedo).y0 - hs[3]!.y1).toBeCloseTo(44.4, 9);
    }
  });

  it('技能の本当の当たり（R48 の丸の絵を 44/48 に縮めた枠 (ceil(96k)+4)/k × 44/48）も 81 px 以上で、R44 ± 1.8 との差は片側 1 px 未満（描画スケール k 1〜2）', () => {
    const texR = Number(/export const ROUND_BUTTON_RADIUS = (\d+);/.exec(readFileSync('src/config/ui-config.ts', 'utf8'))?.[1]);
    expect(texR).toBe(48);
    for (const k of [1, 1.092, 1.5, 2]) {
      const side = ((Math.ceil(2 * texR * k) + 4) / k) * (R_SKILL / texR);
      expect(side, `k ${k}`).toBeGreaterThanOrEqual(MIN_HIT);
      expect(Math.abs(side / 2 - (R_SKILL + HIT_PAD)), `k ${k}`).toBeLessThan(1);
    }
  });

  it('兵装の上の文の中心: 兵装の中心、幅のある文は帯 [W − 288, W − 24] に寄せる', () => {
    const W = 1344;
    const T = panelLayout(W, { smoke: true, identify: false });
    expect([cueAnchorX(T, 'torpedo'), cueAnchorX(T, 'gun')]).toEqual([W - 88, W - 232]);
    expect(cueAnchorX(T, 'torpedo', 246)).toBe(W - 24 - 123);
    expect(cueAnchorX(T, 'gun', 246)).toBe(W - 288 + 123);
    expect(cueAnchorX(T, 'gun', 100)).toBe(W - 232);
    expect(cueAnchorX(T, 'gun', 9999)).toBe((W - 288 + W - 24) / 2);
  });
});
