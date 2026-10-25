// 画面の端の矢印の「画面の内なら隠す」（v0.6.6 レビュー ux:ux-1。ui/edge-marker-screen）: 余白を渡さない矢印は今の縁（上 topMargin・左右と下 56）、隼艇の矢印は本当の画面の矩形（0）。
// 論理 1560 × 720（iPhone 15 の横）の中心 (780, 360)、輸送隊と隼艇の矢印の上端の余白 293 px（ui/hud-markers の CONVOY_MARKER_TOP_MARGIN）。配線（隼艇だけ hideMargin 0 と drawn）はソースで見る。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { markerOnScreen } from '../src/ui/edge-marker-screen';

const CX = 780;
const CY = 360;
const TOP = 293;
const SIDE = 56;
/** 論理画面の点 (x, y) を中心からの sx, sy にして判定 */
const on = (x: number, y: number, hide?: number): boolean => markerOnScreen(x - CX, y - CY, CX, CY, TOP, SIDE, hide);

describe('markerOnScreen（ui/edge-marker-screen）', () => {
  it('余白を渡さなければ今の縁: 上は topMargin の下だけ画面の内（画面の上 293 px に見えている目標は「外」＝矢印が出る）、左右と下は 56 px の内', () => {
    expect(on(567, 229)).toBe(false); // レビューの probe の隼艇（上 4 割）。前はここで矢印が y 293 に出た
    expect(on(567, 300)).toBe(true);
    expect(on(780, 664)).toBe(false);
    expect(on(780, 663)).toBe(true);
    expect(on(55, 400)).toBe(false); // e-11-dash_east の隼艇（左の縁の 56 px の外）
    expect(on(1505, 400)).toBe(false);
  });
  it('隼艇（hideMargin 0）は本当の画面の矩形: 画面の上の方・左右の縁の近くに見えていれば隠し、画面の外（y < 0・x < 0・y > 720）なら出す', () => {
    expect(on(567, 229, 0)).toBe(true);
    expect(on(450, 200, 0)).toBe(true);
    expect(on(450, 5, 0)).toBe(true);
    expect(on(55, 400, 0)).toBe(true);
    expect(on(1555, 400, 0)).toBe(true);
    expect(on(450, -1, 0)).toBe(false);
    expect(on(-1, 400, 0)).toBe(false);
    expect(on(1561, 400, 0)).toBe(false);
    expect(on(450, 721, 0)).toBe(false);
  });
  it('余白を渡さない 5 本の矢印は前と同じ式（|sx| < cx − 56 かつ sy < cy − 56 かつ −sy < cy − topMargin）', () => {
    for (const x of [0, 55, 56, 57, 400, 780, 1503, 1504, 1505, 1560]) {
      for (const y of [0, 66, 67, 68, 292, 293, 294, 400, 663, 664, 665, 720]) {
        const sx = x - CX;
        const sy = y - CY;
        expect(on(x, y), `${x},${y}`).toBe(Math.abs(sx) < CX - SIDE && sy < CY - SIDE && -sy < CY - TOP);
      }
    }
  });
  it('配線: edge-marker は drawn のときだけ画面の内で隠し（既定 true）、hideMargin を渡すのは隼艇の矢印だけ（ほかの矢印は今のまま）', () => {
    const strip = (code: string): string => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const em = strip(readFileSync('src/ui/edge-marker.ts', 'utf8'));
    expect(em).toContain('refresh(dx: number, dy: number, show: boolean, t: BoatTelemetry, distM?: number, drawn = true): void {');
    expect(em).toContain('if (drawn && markerOnScreen(sx, sy, cx, cy, this.opts.topMargin, TARGET_MARKER_MARGIN, this.opts.hideMargin)) {');
    const hud = strip(readFileSync('src/ui/hud-markers.ts', 'utf8'));
    expect(hud.match(/hideMargin/g)?.length).toBe(1);
    expect(hud).toContain('ESCORT_TINT, hideMargin: 0 })');
    const gb = strip(readFileSync('src/systems/gunboat.ts', 'utf8'));
    expect(gb).toContain('t.inSight = this.shown;');
  });
});
