// 一時停止の周りの「静音」「倍速」（v0.8.3 IP1。config/control-toggle-config の controlToggleRing。実機 1 回目のユーザー「一時停止の周りに半円？円形？で配置するUIで、
// 大きさは一時停止よりも一段小さく」「ボタンは今後も増える可能性があります」）: 衛星の大きさと一時停止の値の照らし合わせ、2 つの位置（上右と下右に対称）、
// N = 1〜6 の当たりの円が論理幅 1280〜1584 で画面の左半分に収まり、一時停止の当たり（円 R37.8）・互いと 12 px 以上離れ、計器・スティック・ビルド番号・2・3 行目・速力の表示・
// 右のパネルの当たりに 12 px 以上離れること。固定の箱は tests/hud-layout の fixedBoxes の写し（v0.8.3 の最初の版の検査はそこにあった）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONTROL_TOGGLES, CONTROL_TOGGLE_HIT_R, CONTROL_TOGGLE_PAUSE_R, CONTROL_TOGGLE_PAUSE_X, CONTROL_TOGGLE_PAUSE_Y, CONTROL_TOGGLE_R, CONTROL_TOGGLE_SCALE, PAUSE_HIT_R, controlToggleRing, ringGeometry } from '../src/config/control-toggle-config';
import { HIT_PAD, MIN_HIT, R_SKILL, panelLayout, speedHudRightX, type PanelCircle, type PanelRect } from '../src/config/hud-layout-config';

const WIDTHS = [1280, 1344, 1560, 1584];
/** 円（中心と半径）と箱の間（重なれば負） */
const circleGap = (x: number, y: number, r: number, b: PanelRect): number => Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.y0 - y, 0, y - b.y1)) - r;
const hitBox = (c: PanelCircle): PanelRect => ({ x0: c.x - c.r - HIT_PAD, y0: c.y - c.r - HIT_PAD, x1: c.x + c.r + HIT_PAD, y1: c.y + c.r + HIT_PAD });
/** tests/hud-layout の fixedBoxes の写し（一時停止を除く。機関の表示も入れる） */
function fixedBoxes(W: number): Record<string, PanelRect> {
  const sp = speedHudRightX(W);
  return {
    fps: { x0: 24, y0: 24, x1: 100, y1: 46 },
    clock: { x0: 24, y0: 50, x1: 208, y1: 74 },
    hp: { x0: 24, y0: 82, x1: 342, y1: 126 },
    fuel: { x0: 24, y0: 126, x1: 342, y1: 166 },
    stickGrab: { x0: 31, y0: 403, x1: 317, y1: 689 },
    buildLabel: { x0: W / 2 - 813 / 2, y0: 24, x1: W / 2 + 813 / 2, y1: 46 },
    line2: { x0: 220, y0: 50, x1: W - 220, y1: 76 },
    line3: { x0: W / 2 - 300, y0: 80, x1: W / 2 + 300, y1: 104 },
    speedHud: { x0: sp - 240, y0: 552, x1: sp, y1: 696 },
  };
}

describe('一時停止の周りの「静音」「倍速」（controlToggleRing）', () => {
  it('一時停止の値（ui-config と照らし合わせ）・衛星の大きさ（0.58 倍 R27.84・当たり R40.5＝直径 81）・2 つの位置（上右と下右に対称）・並び', () => {
    const ui = readFileSync('src/config/ui-config.ts', 'utf8');
    const num = (re: RegExp): number => Number(re.exec(ui)?.[1]);
    const R48 = num(/ROUND_BUTTON_RADIUS = (\d+);/);
    expect([num(/PAUSE_BUTTON_Y = (\d+);/), R48 * num(/PAUSE_BUTTON_SIZE_SCALE = ([\d.]+);/), 24 + CONTROL_TOGGLE_PAUSE_R]).toEqual([CONTROL_TOGGLE_PAUSE_Y, CONTROL_TOGGLE_PAUSE_R, CONTROL_TOGGLE_PAUSE_X]);
    expect(R48 * CONTROL_TOGGLE_SCALE).toBeCloseTo(CONTROL_TOGGLE_R, 12);
    expect([2 * CONTROL_TOGGLE_HIT_R, PAUSE_HIT_R]).toEqual([MIN_HIT, CONTROL_TOGGLE_PAUSE_R + HIT_PAD]);
    const r1 = (v: number): number => Math.round(v * 10) / 10;
    expect(controlToggleRing(2).map((p) => [r1(p.x), r1(p.y), p.ring, r1(p.deg)])).toEqual([[134.2, 218.5, 0, -34.8], [134.2, 321.5, 0, 34.8]]);
    expect(controlToggleRing(1).map((p) => [r1(p.x), p.y])).toEqual([[150.3, 270]]);
    expect([0, 1, 2].map((k) => { const g = ringGeometry(k); return [r1(g.radius), r1(g.halfDeg), g.capacity]; })).toEqual([[90.3, 34.8, 2], [183.3, 16.3, 2], [276.3, 10.7, 2]]);
    expect(CONTROL_TOGGLES.map((d) => [d.kind, d.labels.off, d.labels.on, d.flag])).toEqual([['silent', '静音', '静音', 'silentOn'], ['fast', '倍速', '倍速\n2×', 'fastOn']]);
  });

  it.each(WIDTHS)('W %i: N = 1〜6 の当たりの円は画面の左半分・一時停止の右に収まり、一時停止の当たり・互いと 12 px 以上、固定の箱と右のパネルの当たりと 12 px 以上離れる', (W) => {
    const fb = fixedBoxes(W);
    const panel: PanelRect[] = [];
    for (const has of [{ smoke: true, identify: true }, { smoke: false, identify: false, switch: true }]) {
      const L = panelLayout(W, has);
      panel.push(hitBox(L.torpedo), hitBox(L.gun), L.spread.hit, ...L.skills.map((s) => hitBox({ x: s.x, y: s.y, r: R_SKILL })));
    }
    const h = CONTROL_TOGGLE_HIT_R;
    for (let n = 1; n <= 6; n++) {
      const ps = controlToggleRing(n);
      expect(ps.length).toBe(n);
      for (const [i, p] of ps.entries()) {
        expect(p.x - h > 0 && p.x + h < W / 2 && p.y - h > 0 && p.x > CONTROL_TOGGLE_PAUSE_X, `${n}:${i} 画面`).toBe(true);
        expect(Math.hypot(p.x - CONTROL_TOGGLE_PAUSE_X, p.y - CONTROL_TOGGLE_PAUSE_Y) - h - PAUSE_HIT_R, `${n}:${i} 一時停止`).toBeGreaterThanOrEqual(12 - 1e-9);
        for (let j = 0; j < i; j++) expect(Math.hypot(p.x - ps[j]!.x, p.y - ps[j]!.y) - 2 * h, `${n}:${i}×${j}`).toBeGreaterThanOrEqual(12 - 1e-9);
        for (const [k, b] of Object.entries(fb)) expect(circleGap(p.x, p.y, h, b), `${n}:${i} × ${k}`).toBeGreaterThanOrEqual(12 - 1e-9);
        for (const r of panel) expect(circleGap(p.x, p.y, h, r)).toBeGreaterThan(12);
      }
    }
  });

  it('上から詰める（N を増やしても前の N 個の位置は動かない）', () => {
    const six = controlToggleRing(6);
    for (let n = 1; n <= 6; n++) {
      const ps = controlToggleRing(n);
      // 弧の中の数が増えると並べ直すので、同じなのは満ちた弧の分だけ
      const full = ps.filter((p) => ps.filter((q) => q.ring === p.ring).length === ringGeometry(p.ring).capacity);
      for (const p of full) expect(six.some((q) => q.x === p.x && q.y === p.y)).toBe(true);
    }
  });
});
