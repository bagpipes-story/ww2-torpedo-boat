// v0.8.5 S5: 救助の任務（us_07）の画面端の印（S ボート・帰投・生存者・フィッチ）が一時停止と静音・倍速の衛星の塊を避ける（ui/pause-cluster・ui/edge-marker の writeBoxes・
// ui/hud-markers・ui/rescue-markers）。S4 の画面写しで左の縁の「Sボート 2700 m」が一時停止の上に出た。
// 縁の矩形の全周の点（W 1280・1560）で、ずらした後の矢印とラベルの箱が塊の当たりの円の外接矩形に重ならないこと、ずらしは右へだけ・画面の内、配線（救助の任務だけ）をソースで見る。
// ui-config・game-config は DOM を読むので使わない（端の印の縁の値は ui-config の式を写した: 上端 179／帰投の段 217・左と下 56・右は markerRightMargin(W)）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONTROL_TOGGLES, CONTROL_TOGGLE_HIT_R, PAUSE_HIT_R, controlToggleRing } from '../src/config/control-toggle-config';
import { markerRightMargin } from '../src/config/hud-layout-config';
import { RESCUE_SURVIVOR_MARKER_JA } from '../src/config/rescue-hud-config';
import { boxHitsRects } from '../src/ui/landing-markers';
import type { MarkerShift } from '../src/ui/marker-separation';
import { PAUSE_CLUSTER_PAD_PX, avoidPauseCluster, edgeLabelBox, pauseCluster, type MutableRect } from '../src/ui/pause-cluster';
import { textWidthPx } from './pt-ui-kit';

const H = 720;
const HUD_MARGIN = 24;
const MARGIN = 56; // TARGET_MARKER_MARGIN
const TOP_TARGET = 179; // TARGET_MARKER_TOP_MARGIN（S ボートの印。ラベルは矢印の下）
const TOP_HOME = 217; // HOME_MARKER_TOP_MARGIN（帰投・生存者・フィッチ。ラベルは矢印の上）
const GAP = MARGIN * 0.35; // ui/edge-marker のラベルの隙間
const ARROW_HALF = 9 * Math.SQRT2; // 矢印 18 px の回した外接（writeBoxes と同じ）
const LABEL_H = 26; // 18 px の字の高さ（余裕込み）
const PX = 18;
const code = (p: string): string => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/** 縁の矩形（ui/edge-marker のクランプ）の全周の点を step px ごとに */
function edgePoints(W: number, top: number, step: number): Array<[number, number]> {
  const l = MARGIN, r = W - markerRightMargin(W), b = H - MARGIN;
  const out: Array<[number, number]> = [];
  for (let x = l; x <= r; x += step) out.push([x, top], [x, b]);
  for (let y = top; y <= b; y += step) out.push([l, y], [r, y]);
  out.push([l, top], [r, top], [l, b], [r, b]);
  return out;
}

/** 印の点 (mx, my) の矢印とラベルの箱（edge-marker の置き方と labelInset の寄せ） */
function boxes(W: number, mx: number, my: number, labelAbove: boolean, w: number, a: MutableRect, lb: MutableRect): void {
  a.x0 = mx - ARROW_HALF; a.x1 = mx + ARROW_HALF; a.y0 = my - ARROW_HALF; a.y1 = my + ARROW_HALF;
  const cx = Math.min(Math.max(mx, HUD_MARGIN + w / 2), W - HUD_MARGIN - w / 2);
  edgeLabelBox(cx, labelAbove ? my - GAP : my + GAP, labelAbove, w, LABEL_H, lb);
}

const C = pauseCluster();
const LABELS: Array<{ text: string; above: boolean; top: number }> = [
  { text: 'Sボート 2700 m', above: false, top: TOP_TARGET },
  { text: 'Sボート 12000 m', above: false, top: TOP_TARGET },
  { text: '帰投 3000 m', above: true, top: TOP_HOME },
  { text: `${RESCUE_SURVIVOR_MARKER_JA} 650 m`, above: true, top: TOP_HOME },
  { text: `${RESCUE_SURVIVOR_MARKER_JA} 4500 m`, above: true, top: TOP_HOME },
  { text: 'フィッチ 1200 m', above: true, top: TOP_HOME },
];

describe('一時停止の塊（v0.8.5 S5）', () => {
  it('塊は一時停止と今の衛星の当たりの円の外接矩形（右端は衛星の外）', () => {
    expect(C.rects.length).toBe(1 + CONTROL_TOGGLES.length);
    expect(C.rects[0]).toEqual({ x0: 60 - PAUSE_HIT_R, y0: 270 - PAUSE_HIT_R, x1: 60 + PAUSE_HIT_R, y1: 270 + PAUSE_HIT_R });
    const ring = controlToggleRing(CONTROL_TOGGLES.length);
    for (let i = 0; i < ring.length; i++) expect(C.rects[i + 1]!.x1).toBeCloseTo(ring[i]!.x + CONTROL_TOGGLE_HIT_R, 9);
    expect(C.right).toBeCloseTo(Math.max(...ring.map((s) => s.x)) + CONTROL_TOGGLE_HIT_R, 9);
    expect(pauseCluster(0).rects.length).toBe(1);
  });

  it('掛からなければ動かさない・掛かれば右へだけ（左端が塊の右端 + pad）', () => {
    const out: MarkerShift = { dx: 1, dy: 1 };
    const a: MutableRect = { x0: 0, y0: 0, x1: 0, y1: 0 };
    const lb: MutableRect = { x0: 0, y0: 0, x1: 0, y1: 0 };
    boxes(1280, 600, TOP_TARGET, false, 120, a, lb);
    expect(avoidPauseCluster(a, lb, C, out)).toEqual({ dx: 0, dy: 0 });
    boxes(1280, MARGIN, 600, false, 120, a, lb); // 左の縁の下の方（塊の下）
    expect(avoidPauseCluster(a, lb, C, out)).toEqual({ dx: 0, dy: 0 });
    boxes(1280, MARGIN, 270, false, 120, a, lb); // S4 の画面写しの「Sボート 2700 m」
    avoidPauseCluster(a, lb, C, out);
    expect(out.dy).toBe(0);
    expect(Math.min(a.x0, lb.x0) + out.dx).toBeCloseTo(C.right + PAUSE_CLUSTER_PAD_PX, 9);
  });

  for (const W of [1280, 1560]) {
    it(`W ${W}: 縁の全周の点で、ずらした矢印とラベルは塊に重ならず画面の内`, () => {
      const out: MarkerShift = { dx: 0, dy: 0 };
      const a: MutableRect = { x0: 0, y0: 0, x1: 0, y1: 0 };
      const lb: MutableRect = { x0: 0, y0: 0, x1: 0, y1: 0 };
      let moved = 0;
      let checked = 0;
      for (const L of LABELS) {
        const w = textWidthPx(L.text, PX);
        for (const [x, y] of edgePoints(W, L.top, 4)) {
          boxes(W, x, y, L.above, w, a, lb);
          const hitBefore = boxHitsRects(a.x0, a.y0, a.x1, a.y1, C.rects, 0) || boxHitsRects(lb.x0, lb.y0, lb.x1, lb.y1, C.rects, 0);
          avoidPauseCluster(a, lb, C, out);
          expect(out.dy).toBe(0);
          expect(out.dx).toBeGreaterThanOrEqual(0);
          if (hitBefore) expect(out.dx, `${L.text} (${x}, ${y})`).toBeGreaterThan(0);
          if (out.dx > 0) moved++;
          a.x0 += out.dx; a.x1 += out.dx; lb.x0 += out.dx; lb.x1 += out.dx; // edge-marker の nudge は寄せた後のラベルと矢印を同じだけ動かす（右の枠の寄せは下で見る）
          expect(boxHitsRects(a.x0, a.y0, a.x1, a.y1, C.rects, 0), `${L.text} 矢印 (${x}, ${y})`).toBe(false);
          expect(boxHitsRects(lb.x0, lb.y0, lb.x1, lb.y1, C.rects, 0), `${L.text} ラベル (${x}, ${y})`).toBe(false);
          expect(lb.x1).toBeLessThanOrEqual(W - HUD_MARGIN);
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(1000);
      expect(moved).toBeGreaterThan(0); // 左の縁と上の縁の左の方は本当に掛かっていた
    });
  }

  it('配線: 救助の任務だけ（hud-markers は telemetry.rescue の枝で塊を作り、S ボート・帰投・生存者・フィッチの印に掛ける）', () => {
    const hm = code('ui/hud-markers.ts');
    expect(hm).toMatch(/if \(telemetry\.rescue\) \{\s*this\.pauseKeep = pauseCluster\(\);/);
    expect(hm.match(/pauseCluster\(\)/g)!.length).toBe(1);
    expect(hm).toMatch(/if \(pk\) \{\s*if \(this\.targetMarker\) clearOfPauseCluster\(this\.targetMarker, pk\);\s*if \(this\.homeMarker\) clearOfPauseCluster\(this\.homeMarker, pk\);/);
    const rm = code('ui/rescue-markers.ts');
    expect(rm).toMatch(/if \(other\) this\.apart\(other, m\);\s*clearOfPauseCluster\(m, this\.pauseKeep\);/);
    const pc = code('ui/pause-cluster.ts');
    expect(pc).not.toMatch(/from 'phaser'/);
    const body = pc.slice(pc.indexOf('export function clearOfPauseCluster'));
    expect(body).not.toMatch(/new |\{ *x0:|\.filter\(|\.map\(/); // 毎フレームの道に確保なし
  });
});
