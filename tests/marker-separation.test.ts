// 画面の端の 2 本の矢印のずらし（v0.6.6。ui/marker-separation。spec-v066 §D.6・§G・レビュー R6）: 遠ければ動かさない、同じ点なら縁に沿って SEP ずらす（左右の縁は y・上下の縁は x）、
// 下の端では上へ・右の端では左へ、ずらした点は表示の矩形の内、確保なし。ui/hud-markers の配線（輸送隊の矢印の後に隼艇の矢印・字 2 行ぶん）はソースで見る。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { separateMarker, type MarkerRect, type MarkerShift } from '../src/ui/marker-separation';

/** 論理 1280 × 720 の画面で ui/edge-marker の縁（左 56・右 1280 − 右の余白・上 輸送隊の矢印の上端の余白・下 720 − 56）に近い矩形 */
const R: MarkerRect = { left: 56, top: 200, right: 1100, bottom: 664 };
const SEP = 44;
const out: MarkerShift = { dx: NaN, dy: NaN };
const at = (ax: number, ay: number, bx: number, by: number): [number, number] => {
  const o = separateMarker(ax, ay, bx, by, R, SEP, out);
  expect(o).toBe(out); // 書き込み先をそのまま返す（確保なし）
  return [o.dx, o.dy];
};

describe('separateMarker（ui/marker-separation）', () => {
  it('2 点が SEP 以上離れていれば動かさない（ちょうど SEP も）', () => {
    expect(at(56, 400, 56, 500)).toEqual([0, 0]);
    expect(at(56, 400, 56, 444)).toEqual([0, 0]);
    expect(at(300, 200, 360, 200)).toEqual([0, 0]);
  });
  it('左右の縁で重なれば b を下へ SEP（同じ点・少しずれた点）。下の端を越えるなら上へ', () => {
    expect(at(56, 400, 56, 400)).toEqual([0, 44]);
    expect(at(56, 400, 56, 410)).toEqual([0, 34]);
    expect(at(1100, 300, 1100, 300)).toEqual([0, 44]);
    expect(at(56, 640, 56, 640)).toEqual([0, -44]);
    expect(at(56, 664, 56, 650)).toEqual([0, 620 - 650]);
  });
  it('上下の縁で重なれば b を縁に沿って画面の中央から遠ざかる向きへ SEP（右半分は右・左半分は左）。端を越えるなら逆へ', () => {
    expect(at(900, 664, 900, 664)).toEqual([44, 0]);
    expect(at(300, 200, 300, 200)).toEqual([-44, 0]);
    expect(at(1080, 664, 1080, 664)).toEqual([-44, 0]);
    expect(at(70, 200, 70, 200)).toEqual([44, 0]);
  });
  it('ずらした点はいつも矩形の内で、a から SEP 以上離れる（縁の上の b と近くの a の総当たり）', () => {
    const edge: [number, number][] = [];
    for (const y of [200, 230, 432, 640, 664]) edge.push([R.left, y], [R.right, y]);
    for (const x of [80, 400, 578, 900, 1080]) edge.push([x, R.top], [x, R.bottom]);
    const clampX = (x: number): number => Math.min(R.right, Math.max(R.left, x));
    const clampY = (y: number): number => Math.min(R.bottom, Math.max(R.top, y));
    let moved = 0;
    for (const [bx, by] of edge) {
      for (const [ex, ey] of [[0, 0], [10, 0], [0, -20], [-15, 15], [30, 30], [0, 43], [60, 0]] as const) {
        const ax = clampX(bx + ex);
        const ay = clampY(by + ey);
        const [dx, dy] = at(ax, ay, bx, by);
        const [nx, ny] = [bx + dx, by + dy];
        expect(nx).toBeGreaterThanOrEqual(R.left);
        expect(nx).toBeLessThanOrEqual(R.right);
        expect(ny).toBeGreaterThanOrEqual(R.top);
        expect(ny).toBeLessThanOrEqual(R.bottom);
        if ((bx - ax) ** 2 + (by - ay) ** 2 >= SEP * SEP) {
          expect([dx, dy]).toEqual([0, 0]);
          continue;
        }
        moved++;
        expect(Math.hypot(nx - ax, ny - ay)).toBeGreaterThanOrEqual(SEP - 1e-9);
        // 縁に沿って: 左右の縁の b は x のまま、上下の縁の b は y のまま
        if (bx === R.left || bx === R.right) expect(dx).toBe(0);
        else expect(dy).toBe(0);
      }
    }
    expect(moved).toBeGreaterThan(50);
  });
  it('本文に確保を書かない（new・[]・{}・=>）。hud-markers は輸送隊の矢印の後に隼艇の矢印を refresh してからずらす（字 2 行ぶん＝18 × 2 + 8 = 44 px）', () => {
    const strip = (code: string): string => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const src = strip(readFileSync('src/ui/marker-separation.ts', 'utf8'));
    const body = src.slice(src.indexOf('export function separateMarker'));
    expect(body.length).toBeGreaterThan(100);
    for (const s of ['new ', '[]', '{}', '=>']) expect(body).not.toContain(s);
    const hud = strip(readFileSync('src/ui/hud-markers.ts', 'utf8'));
    expect(hud).toContain('const GUNBOAT_MARKER_SEP_PX = HUD_FONT_MARKER_PX * 2 + 8;');
    const refresh = hud.slice(hud.indexOf('refresh(telemetry: BoatTelemetry)'));
    const [cv, gb, nudge] = [refresh.indexOf('this.convoyMarker?.refresh('), refresh.indexOf('gm.refresh('), refresh.indexOf('gm.nudge(separateMarker(cm.shownX, cm.shownY, gm.shownX, gm.shownY')];
    expect([cv, gb, nudge].every((i) => i > 0), `${cv} ${gb} ${nudge}`).toBe(true);
    expect(cv).toBeLessThan(gb);
    expect(gb).toBeLessThan(nudge);
    // 隼艇の矢印は生きていて決着の前だけ・ラベルは矢印の下・僚艇の青（矢印の色は tint）
    expect(hud).toContain('gm.refresh(gb.dx, gb.dy, !gb.sunk && !gb.resolved, telemetry, gb.distM);');
    expect(hud).toMatch(/gunboatMarker = new EdgeMarker\(scene, \{ textureKey: TEXTURE_KEYS\.homeMarker, labelPrefix: telemetry\.gunboat\.labelJa, stepM: CONVOY_MARKER_STEP_M, labelAbove: false, roundUp: true, topMargin: CONVOY_MARKER_TOP_MARGIN, color: ESCORT_TEXT_COLOR, tint: ESCORT_TINT \}\)/);
  });
});
