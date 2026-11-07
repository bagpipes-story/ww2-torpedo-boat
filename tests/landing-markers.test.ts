// v0.6.9 S6b（spec-v069 §5.4・D9・R1・R8/F12）: 揚陸の任務（jp_04）の画面の端の「輸送 N m」「雷撃 N m」と海の上の ▼「雷撃」（ui/landing-markers・ui/hud-markers・entities/landing-caret・systems/world-landing）。
// 出す・出さないの決まり（決着の前の輸送船・報告の PT・F12 の脅威の PT・視程の外の ▼）、テレメトリの reportIsThreat（本物の隊と core の hudThreatIndex）、重なりのずらし（左右の縁 80・上下の縁 120・
// 右下の HUD の角へは入れない・ラベルどうしが重ならない）、ラベルの幅、▼ を立てる点（上の帯・右の縁の外は端の印）、配線（jp_04 だけ作る・ほかの矢印の作る順と refresh は今のまま）をソースで見る。
// 輸送船の字が重なってはいけない HUD の矩形は tests/landing-hud-rects。
// ui-config・game-config は DOM を読むので使わない（矩形は論理 1560 × 720 の jp_04 の縁に近い値）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import {
  LANDING_CARET_DY_PX, LANDING_CARET_LABEL, LANDING_CARET_LABEL_DY_PX, LANDING_MARKER_SEP_EDGE_PX, LANDING_MARKER_SEP_SIDE_PX, LANDING_RUNNER_MARKER_LABEL, LANDING_SHIP_MARKER_LABEL,
} from '../src/config/landing-config';
import { MARKER_LABEL_HALF, MARKER_PX } from '../src/config/hud-layout-config';
import { PT_SHELL_POOL_SIZE } from '../src/config/pt-config';
import { createLanding, createLandingTelemetry, createLandingWakes, hitLanding, LD_DONE, type LandingTelemetry } from '../src/core/landing';
import { createPtSection, hudThreatIndex, PT_ALERT, PT_PATROL } from '../src/core/pt-boats';
import { createPtTorpedoState } from '../src/core/pt-torpedo';
import { degToRad } from '../src/core/units';
import { initLandingTelemetry, refreshLandingTelemetry, type LandingTelemetryWorld } from '../src/systems/landing-telemetry';
import { buildWorldSetup } from '../src/systems/world-setup';
import { landingCaretFits, landingCaretRects, landingCaretShown, landingRunnerMarkerShown, landingShipMarkerShown, separateLandingMarker } from '../src/ui/landing-markers';
import type { MarkerRect, MarkerShift } from '../src/ui/marker-separation';
import { textWidthPx } from './pt-ui-kit';

const S04 = buildWorldSetup(gameData, 'jp_04');
const LD = S04.landing!;
/** コメントを除いたソース */
const code = (p: string): string => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const expectOrder = (text: string, parts: readonly string[]): void => {
  let at = -1;
  for (const p of parts) {
    const i = text.indexOf(p, at + 1);
    expect(i, `「${p}」が「${parts[parts.indexOf(p) - 1] ?? '先頭'}」の後に無い`).toBeGreaterThan(at);
    at = i;
  }
};

type W = { -readonly [K in keyof LandingTelemetryWorld]: LandingTelemetryWorld[K] } & {
  landing: NonNullable<LandingTelemetryWorld['landing']> & { state: ReturnType<typeof createLanding> };
  pts: { section: ReturnType<typeof createPtSection> };
};
/** 出撃時の jp_04（揚陸・雷撃の状態・米PT の隊は core の本物。自艇は出発点） */
function world(): W {
  const section = createPtSection(S04.ptBoats!, PT_SHELL_POOL_SIZE);
  return {
    landing: { state: createLanding(LD.params), tst: createPtTorpedoState(section.boats.length, LD.torpedo.n), wakes: createLandingWakes(), p: LD.params, tp: LD.torpedo },
    pts: { section },
    boat: { state: { ...S04.playerStart, speedMps: 0 } },
    stepTimeS: 0,
    visRange2: S04.visRange2,
  };
}
/** i 隻目の PT を輸送船から方位 brg・d m に、艇首 hd・段階 phase で置く */
function place(w: W, i: number, brg: number, d: number, hd: number, phase = PT_PATROL): void {
  const b = w.pts.section.boats[i]!;
  b.x = LD.params.x + Math.sin(degToRad(brg)) * d;
  b.y = LD.params.y - Math.cos(degToRad(brg)) * d;
  b.headingDeg = hd;
  b.phase = phase;
}

describe('出す・出さないの決まり（ui/landing-markers）', () => {
  it('揚陸の無い任務（enabled false）はどの値でも出さない（ほかの 7 任務のテレメトリは tests/landing-neutral で enabled false）', () => {
    const l = createLandingTelemetry();
    Object.assign(l, { shipDx: 100, shipDy: 0, shipDistM: 100, reportI: 0, reportDx: 50, reportDy: 0, reportSighted: false, reportIsThreat: false });
    expect([landingShipMarkerShown(l), landingRunnerMarkerShown(l)]).toEqual([false, false]);
  });
  it('「輸送 N m」: 揚陸の決着（揚陸完了・揚陸の前の沈没）の前だけ。出撃時から（R1: 出発の画面で輸送船の場所が分かる。画面の内なら ui/edge-marker が隠す）', () => {
    const w = world();
    const t = initLandingTelemetry(w);
    expect(landingShipMarkerShown(t)).toBe(true);
    expect(t.shipDistM).toBeCloseTo(Math.hypot(LD.params.x - S04.playerStart.x, LD.params.y - S04.playerStart.y), 9);
    w.landing.state.phase = LD_DONE;
    refreshLandingTelemetry(t, w);
    expect([t.resolved, landingShipMarkerShown(t)]).toEqual([true, false]);
    const w2 = world();
    const t2 = initLandingTelemetry(w2);
    for (let k = 0; k < LD.params.hitsToSink; k++) hitLanding(w2.landing.state, LD.params, 10);
    refreshLandingTelemetry(t2, w2);
    expect([t2.resolved, landingShipMarkerShown(t2)]).toEqual([true, false]);
  });
  it('S8 のレビュー game-1: 「雷撃 N m」は輸送船を狙う戦う PT（射線。報告の PT より先）も指す。報告の PT の ▼ が出ていても射線の PT の印は出す。視程の内の脅威の PT なら出さない（F12）', () => {
    const w = world();
    const t = initLandingTelemetry(w);
    place(w, 1, 90, 1000, 270); // 東の PT が輸送船の東 1,000 m で輸送船へ（自艇と戦っている）
    w.pts.section.boats[1]!.phase = PT_ALERT;
    place(w, 0, 0, 1500, 180); // 北の PT は哨戒で輸送船へ（報告）
    refreshLandingTelemetry(t, { ...w, landing: { ...w.landing, caretShown: true } });
    const b1 = w.pts.section.boats[1]!;
    const me = w.boat.state;
    expect([t.fireLineI, t.reportI, t.reportDx, t.reportDy, t.caretShown]).toEqual([1, 0, b1.x - me.x, b1.y - me.y, true]);
    expect(landingRunnerMarkerShown(t)).toBe(true);
    // 射線の PT が無くなれば報告の PT（▼ が出ていれば印は出さない）
    b1.headingDeg = 0;
    refreshLandingTelemetry(t, { ...w, landing: { ...w.landing, caretShown: true } });
    expect([t.fireLineI, t.reportI, landingRunnerMarkerShown(t)]).toEqual([-1, 0, false]);
    // 射線の PT が脅威の PT で視程の内なら出さない
    b1.headingDeg = 270;
    me.x = b1.x - 300;
    me.y = b1.y;
    refreshLandingTelemetry(t, w);
    expect([t.fireLineI, t.reportIsThreat, t.reportSighted, landingRunnerMarkerShown(t)]).toEqual([1, true, true, false]);
  });
  it('「雷撃 N m」: 報告の PT があるときだけ。F12: それが脅威の PT（hudThreatIndex＝「PT N m」の印）で視程の内なら出さない。脅威でない・視程の外なら出す', () => {
    const w = world();
    const t = initLandingTelemetry(w);
    expect([t.reportI, t.reportIsThreat, landingRunnerMarkerShown(t)]).toEqual([-1, false, false]);
    // 北の PT（0）が輸送船へ 1500 m・南向き。東の PT（1）は東 2200 m（見張りの外）・西向き。自艇は出発点（視程の外）
    place(w, 0, 0, 1500, 180);
    place(w, 1, 90, 2200, 270);
    refreshLandingTelemetry(t, w);
    const me = w.boat.state;
    expect(t.reportI).toBe(0);
    expect(hudThreatIndex(w.pts.section, me.x, me.y)).toBe(0); // 哨戒の PT だけなら自艇に最も近い哨戒の PT
    expect([t.reportIsThreat, t.reportSighted, landingRunnerMarkerShown(t)]).toEqual([true, false, true]);
    // 自艇が北の PT の 300 m 西（視程の内）へ: 脅威の PT で見えている → 「PT N m」が受け持つので「雷撃」は出さない
    const b0 = w.pts.section.boats[0]!;
    me.x = b0.x - 300;
    me.y = b0.y;
    refreshLandingTelemetry(t, w);
    expect([t.reportI, t.reportIsThreat, t.reportSighted, landingRunnerMarkerShown(t)]).toEqual([0, true, true, false]);
    // 東の PT を自艇のすぐ東へ（自艇に最も近い哨戒の PT＝脅威。輸送船へは向かわない）: 報告の北の PT は脅威でないので、見えていても「雷撃」を出す
    const b1 = w.pts.section.boats[1]!;
    b1.x = me.x + 100;
    b1.y = me.y;
    b1.headingDeg = 0;
    refreshLandingTelemetry(t, w);
    expect(hudThreatIndex(w.pts.section, me.x, me.y)).toBe(1);
    expect([t.reportI, t.reportIsThreat, t.reportSighted, landingRunnerMarkerShown(t)]).toEqual([0, false, true, true]);
    // 隊が自艇を捉えた（哨戒の PT が無い）→ 報告なし → 出さない・脅威の旗も下りる
    for (const b of w.pts.section.boats) b.phase = PT_ALERT;
    refreshLandingTelemetry(t, w);
    expect([t.reportI, t.reportIsThreat, landingRunnerMarkerShown(t)]).toEqual([-1, false, false]);
  });
  it('「雷撃 N m」と ▼ はどちらか一方: 世界が ▼ を出した（caretShown）なら印は出さない。テレメトリは報告があるときだけ世界の値を写す（省けば出ていない）', () => {
    const w = world();
    const t = initLandingTelemetry(w);
    place(w, 0, 0, 1500, 180);
    place(w, 1, 90, 2200, 270);
    refreshLandingTelemetry(t, w);
    expect([t.reportI, t.caretShown, landingRunnerMarkerShown(t)]).toEqual([0, false, true]);
    const ld = w.landing as typeof w.landing & { caretShown?: boolean };
    ld.caretShown = true;
    refreshLandingTelemetry(t, w);
    expect([t.caretShown, landingRunnerMarkerShown(t)]).toEqual([true, false]);
    for (const b of w.pts.section.boats) b.phase = PT_ALERT; // 報告なし → 世界の旗が残っていても写さない
    refreshLandingTelemetry(t, w);
    expect([t.reportI, t.caretShown]).toEqual([-1, false]);
  });
  it('▼「雷撃」: 報告の PT が自艇の視程の外のときだけ（視程の内なら PT の絵が出ている）。報告が無ければ出さない', () => {
    const v2 = S04.visRange2;
    expect(landingCaretShown(0, v2 + 1, v2)).toBe(true);
    expect(landingCaretShown(0, v2, v2)).toBe(false);
    expect(landingCaretShown(1, 1, v2)).toBe(false);
    expect(landingCaretShown(-1, v2 * 4, v2)).toBe(false);
  });
  it('▼ を立てる点（landingCaretFits）: 画面の内で、▼ と字の箱（左右 18・上 49〜上 6）が矩形に重ならない。上の帯・右端の技能のボタン・兵装に重なる所と画面の外は端の印が縁から指す', () => {
    const rs = landingCaretRects({ W: 1560, H: 720, topBandBottom: 170, has: { smoke: false, identify: false }, pause: { x: 60, y: 270, r: 36 }, stick: { x: 174, y: 546, r: 110 }, speedLeft: 1000, speedTop: 580 });
    const fits = (sx: number, sy: number): boolean => landingCaretFits(sx, sy, 1560, 720, 18, 49, 6, rs);
    expect(fits(600, 400)).toBe(true);
    expect(fits(600, 219)).toBe(true); // 字の上端 170（帯の下端に触れるだけ）
    expect(fits(600, 218)).toBe(false); // 字が上の帯に入る
    expect(fits(1300, 400)).toBe(true); // 端の印の縁（W − 352）の右でも、技能のボタンの間の海なら ▼
    expect(fits(1470, 300)).toBe(false); // 見張りのボタン（292 ± 52）
    expect(fits(1470, 404)).toBe(true); // 空いた識別の段
    expect(fits(1300, 560)).toBe(false); // 兵装の上の文から下
    expect(fits(174, 546)).toBe(true); // スティックの上は ▼ のまま（縁の矩形の内なので端の印に替えると矢印が外を向く）
    expect(fits(1100, 650)).toBe(true); // 速力の表示の上も同じ
    expect([fits(-1, 400), fits(1561, 400), fits(600, 721)]).toEqual([false, false, false]);
  });
  it('ラベル: 「輸送 9900 m」「雷撃 9900 m」は 18 px で端の印の上限（MARKER_LABEL_HALF × 2 = 112）の内（「輸送船 9900 m」は入らない）、▼ の「雷撃」は 36 px', () => {
    expect(MARKER_PX).toBe(18);
    for (const p of [LANDING_SHIP_MARKER_LABEL, LANDING_RUNNER_MARKER_LABEL]) expect(textWidthPx(`${p} 9900 m`, MARKER_PX), p).toBeLessThanOrEqual(MARKER_LABEL_HALF * 2);
    expect(textWidthPx('輸送船 9900 m', MARKER_PX)).toBeGreaterThan(MARKER_LABEL_HALF * 2);
    expect(textWidthPx(LANDING_CARET_LABEL, MARKER_PX)).toBe(36);
    // ▼（18 px の三角＋縁 2）の下端は PT の中心より上、字の下端は ▼ の上端より上
    expect(LANDING_CARET_DY_PX - (MARKER_PX + 2) / 2).toBeGreaterThan(0);
    expect(LANDING_CARET_LABEL_DY_PX).toBeGreaterThanOrEqual(LANDING_CARET_DY_PX + (MARKER_PX + 2) / 2);
  });
});

describe('重なりのずらし（separateLandingMarker）', () => {
  /** 論理 1560 × 720 の jp_04 の縁に近い矩形（左 56・右 1560 − 352・上 雷撃の印の上端の段・下 720 − 56）と右下の速力・兵装の HUD の角（左端・上端） */
  const R: MarkerRect = { left: 56, top: 120, right: 1208, bottom: 664 };
  const KEEP_LEFT = 900;
  const KEEP_TOP = 560;
  const out: MarkerShift = { dx: NaN, dy: NaN };
  const at = (ax: number, ay: number, bx: number, by: number): [number, number] => {
    const o = separateLandingMarker(ax, ay, bx, by, R, KEEP_LEFT, KEEP_TOP, out);
    expect(o).toBe(out);
    return [o.dx, o.dy];
  };
  /** 矢印（20 px 四方）とラベル（幅 112・高さ 18、矢印の中心から 19.6 px の下か上）の箱 */
  const GAP = 56 * 0.35;
  type Box = [number, number, number, number];
  const arrow = (x: number, y: number): Box => [x - 10, y - 10, x + 10, y + 10];
  const label = (x: number, y: number, above: boolean): Box => (above ? [x - 56, y - GAP - 18, x + 56, y - GAP] : [x - 56, y + GAP, x + 56, y + GAP + 18]);
  const overlap = (a: Box, b: Box): boolean => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

  it('遠ければ動かさない。左右の縁は縦に 80、上下の縁は横に 120（ずらしの大きさは縁で決まる）', () => {
    expect(at(56, 300, 56, 400)).toEqual([0, 0]);
    expect(at(56, 300, 56, 300)).toEqual([0, LANDING_MARKER_SEP_SIDE_PX]);
    expect(at(1208, 300, 1208, 330)).toEqual([0, LANDING_MARKER_SEP_SIDE_PX - 30]);
    expect(at(400, 120, 400, 120)).toEqual([-LANDING_MARKER_SEP_EDGE_PX, 0]);
    expect(at(700, 120, 700, 120)).toEqual([LANDING_MARKER_SEP_EDGE_PX, 0]);
    expect(at(400, 664, 520, 664)).toEqual([0, 0]); // 上下の縁の 120 px 以上は動かさない…
    expect(at(400, 664, 480, 664)).toEqual([400 - LANDING_MARKER_SEP_EDGE_PX - 480, 0]); // …近ければ a から中央と逆の向きへ 120（左半分は左）
  });
  it('ずらした先が右下の HUD の角なら a を挟んだ逆へ: 下の縁の右寄りは左へ、右の縁の下寄りは上へ（縁の矩形の内）', () => {
    expect(at(880, 664, 880, 664)).toEqual([-LANDING_MARKER_SEP_EDGE_PX, 0]); // 右半分は本来は右（角）→ 左
    expect(at(1208, 520, 1208, 520)).toEqual([0, -LANDING_MARKER_SEP_SIDE_PX]); // 下へずらすと 600（角）→ 上
    expect(at(1208, 140, 1208, 130)).toEqual([0, 140 + LANDING_MARKER_SEP_SIDE_PX - 130]); // 角の外ならそのまま下
  });
  it('総当たり: ずらした b は矩形の内・右下の角の外（a が角の外なら）、a から縁に沿ってずらしの大きさ以上離れ、矢印とラベルがどの組み合わせ（ラベルが上・下）でも重ならない', () => {
    const edge: [number, number][] = [];
    for (const y of [120, 200, 360, 520, 559]) edge.push([R.left, y], [R.right, y]);
    for (const x of [80, 300, 632, 880, 1180]) edge.push([x, R.top], [x, R.bottom]);
    const inCorner = (x: number, y: number): boolean => x > KEEP_LEFT && y > KEEP_TOP;
    let moved = 0;
    for (const [bx, by] of edge) {
      for (const [ex, ey] of [[0, 0], [12, 0], [0, -20], [-15, 15], [40, 0], [0, 60]] as const) {
        const ax = Math.min(R.right, Math.max(R.left, bx + ex));
        const ay = Math.min(R.bottom, Math.max(R.top, by + ey));
        if (inCorner(ax, ay)) continue;
        const [dx, dy] = at(ax, ay, bx, by);
        if (dx === 0 && dy === 0) continue;
        moved++;
        const nx = bx + dx;
        const ny = by + dy;
        expect(nx >= R.left && nx <= R.right && ny >= R.top && ny <= R.bottom, `${bx},${by}`).toBe(true);
        expect(inCorner(nx, ny), `${bx},${by} → ${nx},${ny}`).toBe(false);
        if (dy !== 0) expect(Math.abs(ny - ay)).toBeGreaterThanOrEqual(LANDING_MARKER_SEP_SIDE_PX - 1e-9);
        if (dx !== 0) expect(Math.abs(nx - ax)).toBeGreaterThanOrEqual(LANDING_MARKER_SEP_EDGE_PX - 1e-9);
        // 縁の矩形の端で詰まらない限り（端は縁の内に止める）、矢印とラベルは重ならない
        const clipped = ny === R.top || ny === R.bottom || nx === R.left || nx === R.right;
        if (clipped && Math.abs(ny - ay) < LANDING_MARKER_SEP_SIDE_PX - 1e-9) continue;
        for (const aAbove of [false, true]) {
          for (const bAbove of [false, true]) {
            const boxes = [arrow(ax, ay), label(ax, ay, aAbove)];
            for (const bb of [arrow(nx, ny), label(nx, ny, bAbove)]) for (const ab of boxes) expect(overlap(ab, bb), `${ax},${ay} ${nx},${ny} ${aAbove} ${bAbove}`).toBe(false);
          }
        }
      }
    }
    expect(moved).toBeGreaterThan(30);
  });
});

describe('配線（ソース）', () => {
  it('ui/hud-markers: 2 本は揚陸の任務だけ、ほかの矢印をみな作った後に作る（ほかの任務は矢印の数・作る順が今のまま）。輸送は味方の青・本当の画面の矩形、雷撃は赤・縁から 56 px', () => {
    const h = code('ui/hud-markers.ts');
    expectOrder(h, [
      'this.targetMarker = new EdgeMarker(', 'this.homeMarker = new EdgeMarker(', 'this.coastMarker = new EdgeMarker(', 'this.convoyMarker = new EdgeMarker(', 'this.gunboatMarker = new EdgeMarker(', 'this.planeMarker = new EdgeMarker(',
      'if (!telemetry.landing.enabled) return;', 'this.runnerMarker = new EdgeMarker(', 'this.shipMarker = new EdgeMarker(',
    ]);
    expect(h).toContain("labelPrefix: LANDING_RUNNER_MARKER_LABEL, stepM: LANDING_DIST_STEP_M, labelAbove: false, roundUp: true, topMargin: TARGET_MARKER_TOP_MARGIN, color: HUD_COLOR_WARN, hideMargin: TARGET_MARKER_MARGIN })");
    expect(h).toContain('labelPrefix: LANDING_SHIP_MARKER_LABEL, stepM: LANDING_DIST_STEP_M, labelAbove: false, roundUp: true, topMargin: CONVOY_MARKER_TOP_MARGIN, color: ESCORT_TEXT_COLOR, tint: ESCORT_TINT, hideMargin: 0 })');
    expect(h.split('new EdgeMarker(').length - 1).toBe(8);
  });
  it('ui/hud-markers の refresh: 揚陸の 2 本は輸送隊の後・隼艇の前に 1 回（揚陸の任務だけ）。雷撃 → 角 → 「PT」から、輸送 → 角 → 雷撃から → 帰投から', () => {
    const h = code('ui/hud-markers.ts');
    expectOrder(h, ['this.convoyMarker?.refresh(', 'if (this.shipMarker) this.refreshLanding(telemetry);', 'const gb = telemetry.gunboat;']);
    expect(h.split('this.refreshLanding(').length - 1).toBe(1);
    expectOrder(h, [
      'private refreshLanding(t: BoatTelemetry): void {',
      'rm.refresh(l.reportDx, l.reportDy, landingRunnerMarkerShown(l), t, undefined, l.reportSighted);', 'avoidCorner(rm.shownX, rm.shownY, RUNNER_MARKER_RECT,', 'separateLandingMarker(tm.shownX, tm.shownY, rm.shownX, rm.shownY, RUNNER_MARKER_RECT,',
      'sm.refresh(l.shipDx, l.shipDy, landingShipMarkerShown(l), t, l.shipDistM);', 'avoidCorner(sm.shownX, sm.shownY, SHIP_MARKER_RECT,',
      'separateLandingMarker(rm.shownX, rm.shownY, sm.shownX, sm.shownY, SHIP_MARKER_RECT,', 'separateLandingMarker(hm.shownX, hm.shownY, sm.shownX, sm.shownY, SHIP_MARKER_RECT,',
    ]);
    expectOrder(h, ['this.gunboatMarker?.destroy();', 'this.runnerMarker?.destroy();', 'this.shipMarker?.destroy();']);
  });
  it('systems/world-landing: ▼ は輸送船の後に 1 回だけ作り、毎フレームは輸送船の行の後に報告（テレメトリと同じ landingReport）→ 視程の外か → 位置。world-visuals は世界を渡す', () => {
    const s = code('systems/world-landing.ts');
    expectOrder(s, ['this.ship = new AllyShip(scene, p, bounds, hud);', 'this.caret = new LandingCaret(scene, caretRects);']);
    expectOrder(s, ['export function buildLanding(', 'const k: HudRectInputs = {', 'has: { smoke: s.smokeParams !== null, identify: s.friendly !== null }', 'const hud = landingHudRects(k);', 'return new WorldLanding(scene, ld.params, ld.torpedo, count, pool, rng, s.mission.bounds, s.timeScale, events, onSunk, hud, landingCaretRects(k), buildAlly(scene, s, pts, seed, hud));']); // v0.6.10 S5a: 卯月のラベルも輸送船の字と同じ HUD の矩形
    expect(code('ui/weapon-panel.ts')).toContain('panelLayout(GAME_WIDTH, { smoke: hasSmoke, identify: telemetry.friendlyEnabled, switch: telemetry.evac.enabled })'); // 同じ決まり（煙幕発生器・今夜の味方機。［切替］は jp_03 だけ＝jp_04 は偽）
    expect(s.split('new LandingCaret(').length - 1).toBe(1);
    expect(s.split('landingHudRects(').length - 1).toBe(1);
    expectOrder(s, ['updateVisuals(realDt: number, w: LandingVisualsView): void {', 'this.ship.update(this.state, this.wakes);', 'landingReport(this.state, this.p, q, this.tst, this.report);', 'this.caretShown = this.caret.update(b !== null && landingCaretShown(this.report.i, d2, w.visRange2), b ? b.x : 0, b ? b.y : 0);']);
    expect(code('systems/landing-telemetry.ts')).toContain('t.caretShown = REPORT.i >= 0 && ld.caretShown === true;');
    expectOrder(s, ['this.ship.destroy();', 'this.caret.destroy();']);
    expect(code('systems/landing-telemetry.ts')).toContain('landingReport(st, ld.p, q, ld.tst, REPORT);');
    expect(code('systems/world-visuals.ts')).toContain('w.landing?.updateVisuals(realDt, w);');
  });
  it('entities/landing-caret: 絵は組み立てで 1 回（▼ は端の印の絵を 180° 回す。新しい絵なし）、毎フレームは本当のカメラで立てる点か見て（landingCaretFits）出し入れ（変わったときだけ）・大きさ（ズームが変わったときだけ）・位置だけ。字は書き換えない', () => {
    const c = code('entities/landing-caret.ts');
    expect(c).toContain('scene.add.image(0, 0, TEXTURE_KEYS.targetMarker).setAngle(CARET_ANGLE_DEG)');
    const upd = c.slice(c.indexOf('update(show: boolean, x: number, y: number): boolean {'), c.indexOf('destroy(): void {'));
    expect(upd.length).toBeGreaterThan(100);
    for (const bad of ['new ', 'scene.add', 'setText', '[', '`']) expect(upd, bad).not.toContain(bad);
    expect(upd).toContain('const on = show && v.width > 0 && landingCaretFits((x - v.x) * z, (y - v.y) * z, GAME_WIDTH, GAME_HEIGHT, this.halfW, this.topDy, this.bottomDy, this.rects);');
    expect(upd).toContain('if (on !== this.shown) {');
    expect(upd).toContain('if (z !== this.zoom) {');
    expect(c).toContain('this.topDy = LANDING_CARET_LABEL_DY_PX + this.label.height;');
    expect(c).toContain('this.bottomDy = LANDING_CARET_DY_PX - TARGET_MARKER_SIZE / 2;');
  });
});
