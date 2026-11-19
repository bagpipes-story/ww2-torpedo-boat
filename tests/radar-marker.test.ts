// v0.8.0 S4（spec-v0800 §4.9・D-R10、brief L27）: 緑の端の印「レーダー N m」（ui/radar-marker・radar-marker-pick）。
// - 選び方: 画面の外で、目の届く距離より遠く（目の内は赤い「敵 N m」の役）、赤い印の艦の今の位置から 300 m より離れた、今の自艇から一番近い輝点。どれも無ければ出さない。
// - 置き方（tests/hud-layout と同じ箱・論理幅 1280・1344・1560・1584）: 縁の全周の方位で、矢印とラベルが右下の速力と兵装の角・兵装の上の文・右端の技能の列に触れず、ラベルは画面の内。
//   ラベル「レーダー 4000 m」は今の印の半幅 56 より広いので、右の縁と下の縁（速力の HUD を避ける時）はその分だけ左で止める。
// - 見せ方の定数の理由（同じ艦の古い輝点の 300 m は data の列の速さ × time_scale × 掃引の秒 ＋ 丸めの半分以上・色は輝点と同じ・離す px は字 2 行）。§7: 毎フレームの本体に確保なし。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MARKER_LABEL_HALF, R_GUN, TEXT_GAP, markerRightMargin, panelLayout, speedHudKeepLeft, speedHudRightX, type PanelRect } from '../src/config/hud-layout-config';
import { RADAR_BLIP_COLOR, RADAR_MARKER_TEX_KEY } from '../src/config/radar-art-config';
import {
  RADAR_MARKER_LABEL_INSET_PX, RADAR_MARKER_LABEL_JA, RADAR_MARKER_RIGHT_EXTRA_PX, RADAR_MARKER_SAME_SHIP_M, RADAR_MARKER_SEP_PX, RADAR_MARKER_STEP_M, RADAR_MARKER_TEXT_COLOR,
} from '../src/config/strait-hud-config';
import type { RadarTelemetry } from '../src/core/boat-telemetry';
import { markerOnScreen } from '../src/ui/edge-marker-screen';
import { avoidCorner, type MarkerRect, type MarkerShift } from '../src/ui/marker-separation';
import { pickRadarEdgeBlip, radarRightEdgeShift, type RadarPick, type RadarPickScreen } from '../src/ui/radar-marker-pick';
import { textWidthPx } from './pt-ui-kit';
import { code } from './sfx-rules-kit';
import { kitWorld } from './transit-world-kit';

/** ui-config・game-config は DOM を読むので型検査に入れない（tests/torpedo-free-kit と同じ動的 import。window が無ければ既定値＝論理幅の値は使わない） */
const UI = (await import(/* @vite-ignore */ ['..', 'src', 'config', 'ui-config'].join('/'))) as Record<string, number>;
const GC = (await import(/* @vite-ignore */ ['..', 'src', 'config', 'game-config'].join('/'))) as Record<string, number>;
const H = 720;
const TOP = UI['TARGET_MARKER_TOP_MARGIN']!;
const MARGIN = UI['TARGET_MARKER_MARGIN']!;
/** ui/hud-markers の SPEED_HUD_KEEP_TOP の式（hud-markers は Phaser を引くので式を ui-config の値で組む。下の source の pin と同じ式） */
const KEEP_TOP = H - GC['HUD_MARGIN']! - UI['RUDDER_MARKER_HEIGHT']! - UI['HUD_TEXT_GAP']! - UI['HUD_HEADING_OFFSET_Y']! - UI['HUD_FONT_HEADING_PX']! - UI['HUD_FONT_MARKER_PX']! * 3;
const FONT = 18;
const LABEL = `${RADAR_MARKER_LABEL_JA} 4000 m`;
const HALF = textWidthPx(LABEL, FONT) / 2;

/** 輝点だけのレーダーのテレメトリ（自艇は原点） */
function tel(blips: [number, number][]): RadarTelemetry {
  return { enabled: true, contacts: blips.length, blips: blips.map(([x, y]) => ({ x, y })), boatX: 0, boatY: 0 } as unknown as RadarTelemetry;
}
const out = (): RadarPick => ({ dx: NaN, dy: NaN, d2: NaN });

describe('選び方（pickRadarEdgeBlip）', () => {
  const V: RadarPickScreen = { cx: 640, cy: 360, topMargin: TOP, sideMargin: MARGIN, lookAheadM: 0 };
  const EYE2 = 900 * 900;
  it('画面の外・目の外の一番近い輝点（自艇から今の位置で。輝点の並びの順に依らない）。画面の内・目の内は選ばない。無ければ NaN', () => {
    // 北（上）へ 1,200 m（画面の外）・東へ 2,000 m（外）・西へ 400 m（目の内）・北へ 100 m（画面の内）
    const r = tel([[2000, 0], [0, -1200], [-400, 0], [0, -100]]);
    const p = pickRadarEdgeBlip(r, EYE2, NaN, NaN, RADAR_MARKER_SAME_SHIP_M, 0, 1, V, out());
    expect([p.dx, p.dy, p.d2]).toEqual([0, -1200, 1200 * 1200]);
    expect(Number.isNaN(pickRadarEdgeBlip(tel([[-400, 0], [0, -100]]), EYE2, NaN, NaN, RADAR_MARKER_SAME_SHIP_M, 0, 1, V, out()).dx)).toBe(true);
    // ズーム 0.16（上へ 180 px・下へ 304 px が画面の内）: 北 1,000 m は画面の内・南 2,000 m は外＝遠い南を選ぶ。0.1 ではどちらも内＝出さない
    const ns = tel([[0, -1000], [0, 2000]]);
    expect(pickRadarEdgeBlip(ns, EYE2, NaN, NaN, RADAR_MARKER_SAME_SHIP_M, 0, 0.16, V, out()).dy).toBe(2000);
    expect(Number.isNaN(pickRadarEdgeBlip(ns, EYE2, NaN, NaN, RADAR_MARKER_SAME_SHIP_M, 0, 0.1, V, out()).dx)).toBe(true);
    expect(pickRadarEdgeBlip(ns, EYE2, NaN, NaN, RADAR_MARKER_SAME_SHIP_M, 0, 0.5, V, out()).dy).toBe(-1000);
    // レーダーの無い任務は出さない
    expect(Number.isNaN(pickRadarEdgeBlip({ ...r, enabled: false }, EYE2, NaN, NaN, RADAR_MARKER_SAME_SHIP_M, 0, 1, V, out()).dx)).toBe(true);
  });
  it('赤い「敵」の艦（目で見えている最寄りの艦）の今の位置から 300 m の内の古い輝点は選ばない（印を 2 つ出さない）。見えていなければ（NaN）除かない', () => {
    const r = tel([[0, -1000], [0, -2500]]); // 目の内へ入ったばかりの艦の古い輝点 1,000 m と、次の艦の 2,500 m
    expect(pickRadarEdgeBlip(r, EYE2, 0, -880, RADAR_MARKER_SAME_SHIP_M, 0, 1, V, out()).dy).toBe(-2500);
    expect(pickRadarEdgeBlip(r, EYE2, NaN, NaN, RADAR_MARKER_SAME_SHIP_M, 0, 1, V, out()).dy).toBe(-1000);
    expect(pickRadarEdgeBlip(r, EYE2, 0, -650, RADAR_MARKER_SAME_SHIP_M, 0, 1, V, out()).dy).toBe(-1000); // 350 m 離れていれば別の艦
  });
  it('同じ艦の古い輝点の 300 m は data の列の掃引の間の道のり（速さ × time_scale × 掃引の秒）＋ 丸めの半分以上', () => {
    const s = kitWorld().setup;
    expect(RADAR_MARKER_SAME_SHIP_M).toBeGreaterThanOrEqual(s.transit!.speedMps * s.timeScale * s.radar!.sweepS + s.radar!.positionStepM / 2);
  });
  it('画面の内の判定は ui/edge-marker と同じ写し（見越し・ズーム・markerOnScreen）・毎フレームの本体に確保なし・平方根なし', () => {
    const src = code('src/ui/radar-marker-pick.ts');
    expect(src).toContain('if (markerOnScreen((dx - ox) * zoom, (dy + oy) * zoom, v.cx, v.cy, v.topMargin, v.sideMargin)) continue;');
    const em = code('src/ui/edge-marker.ts');
    expect(em).toContain('const sx = (dx - Math.sin(h) * CAMERA_LOOK_AHEAD_M) * t.cameraZoom;');
    expect(em).toContain('const sy = (dy + Math.cos(h) * CAMERA_LOOK_AHEAD_M) * t.cameraZoom;');
    const body = src.slice(src.indexOf('export function pickRadarEdgeBlip'));
    expect(body).not.toMatch(/\bnew\s|\.(map|filter|slice)\(|=>|Math\.(sqrt|hypot|atan2)/);
    const mk = code('src/ui/radar-marker.ts');
    const refresh = mk.slice(mk.indexOf('refresh(t: BoatTelemetry'), mk.indexOf('destroy(): void'));
    expect(refresh).not.toMatch(/\bnew\s|\.(map|filter|slice)\(|=>|for \(const/);
    expect(refresh.match(/Math\.sqrt\(/g)?.length).toBe(1);
  });
});

/** ui/edge-marker の refresh の縁の点の写し（中心からの方向 (sx, sy) を縁の矩形へクランプ） */
function edgePoint(W: number, sx: number, sy: number): [number, number] {
  const cx = W / 2;
  const cy = H / 2;
  const sideW = sx > 0 ? cx - markerRightMargin(W) : cx - MARGIN;
  const k = Math.min(sideW / Math.max(Math.abs(sx), 1e-6), (sy >= 0 ? cy - MARGIN : cy - TOP) / Math.max(Math.abs(sy), 1e-6));
  return [cx + sx * k, cy + sy * k];
}
const inter = (a: PanelRect, b: PanelRect): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

describe('置き方（hud-layout の箱。brief L27）', () => {
  it('縁の全周（1° おき）で、矢印とラベルは右下の速力の HUD・兵装の当たりと上の文・右端の技能の当たりに触れず、ラベルは画面の内（論理幅 4 つ）', () => {
    const keepTop = KEEP_TOP;
    expect(keepTop).toBe(534);
    expect(code('src/ui/hud-markers.ts')).toContain('export const SPEED_HUD_KEEP_TOP = GAME_HEIGHT - HUD_MARGIN - RUDDER_MARKER_HEIGHT - HUD_TEXT_GAP - HUD_HEADING_OFFSET_Y - HUD_FONT_HEADING_PX - HUD_FONT_MARKER_PX * 3;');
    expect(code('src/ui/hud-markers.ts')).toContain('const SPEED_HUD_KEEP_LEFT = SPEED_HUD_RIGHT_X - RUDDER_BAR_HALF_WIDTH * 2 - HUD_FONT_MARKER_PX * 4;');
    for (const W of [1280, 1344, 1560, 1584]) {
      const rect: MarkerRect = { left: MARGIN, top: TOP, right: W - markerRightMargin(W), bottom: H - MARGIN };
      const L = panelLayout(W, { smoke: true, identify: true });
      const sp = speedHudRightX(W);
      const boxes: [string, PanelRect][] = [
        ['speedHud', { x0: sp - 240, y0: 584, x1: sp, y1: 696 }],
        ['cue', { x0: L.cue.left, y0: L.cue.bottom - Math.round(L.cue.px * 1.2), x1: L.cue.right, y1: L.cue.bottom }],
        ['gun', { x0: L.gun.x - R_GUN - 1.8, y0: L.gun.y - R_GUN - 1.8, x1: L.gun.x + R_GUN + 1.8, y1: L.gun.y + R_GUN + 1.8 }],
        ['torpedo', { x0: L.torpedo.x - L.torpedo.r - 1.8, y0: L.torpedo.y - L.torpedo.r - 1.8, x1: W, y1: H }],
        ...L.skills.map((s): [string, PanelRect] => [s.kind, { x0: s.x - 45.8, y0: s.y - 45.8, x1: s.x + 45.8, y1: s.y + 45.8 }]),
      ];
      const sh: MarkerShift = { dx: 0, dy: 0 };
      for (let deg = 0; deg < 360; deg++) {
        const r = (deg * Math.PI) / 180;
        let [x, y] = edgePoint(W, Math.sin(r) * 5000, -Math.cos(r) * 5000);
        avoidCorner(x, y, rect, speedHudKeepLeft(W) - RADAR_MARKER_RIGHT_EXTRA_PX, keepTop, sh);
        x += sh.dx;
        y += sh.dy;
        x += radarRightEdgeShift(x, rect, RADAR_MARKER_RIGHT_EXTRA_PX, sh).dx;
        const lx = Math.min(Math.max(x, RADAR_MARKER_LABEL_INSET_PX + HALF), W - RADAR_MARKER_LABEL_INSET_PX - HALF); // EdgeMarker の labelInset
        const gap = MARGIN * 0.35;
        const label: PanelRect = { x0: lx - HALF, y0: y + gap, x1: lx + HALF, y1: y + gap + FONT * 1.25 };
        const arrow: PanelRect = { x0: x - 9, y0: y - 9, x1: x + 9, y1: y + 9 };
        for (const [k, b] of boxes) {
          expect(inter(label, b), `W ${W} ${deg}° label × ${k}`).toBe(false);
          expect(inter(arrow, b), `W ${W} ${deg}° arrow × ${k}`).toBe(false);
        }
        expect(label.x0 >= 0 && label.x1 <= W && label.y1 <= H, `W ${W} ${deg}°`).toBe(true);
      }
    }
  });
  it('ラベルの幅とずらしの px: 「レーダー 4000 m」18 px で 147.9 px＝半幅は今の印より 17.9 px 広い→ 18 px 左で止めると右の縁のラベルは兵装のパネルの左 − 8 の内', () => {
    expect(Math.round(textWidthPx(LABEL, FONT) * 10) / 10).toBe(147.9);
    expect(RADAR_MARKER_RIGHT_EXTRA_PX).toBe(Math.ceil(HALF - MARKER_LABEL_HALF));
    for (const W of [1280, 1344, 1560, 1584]) expect(W - markerRightMargin(W) - RADAR_MARKER_RIGHT_EXTRA_PX + HALF).toBeLessThanOrEqual(panelLayout(W, { smoke: true, identify: true }).panelLeft - TEXT_GAP);
    expect(RADAR_MARKER_STEP_M).toBe(100);
  });
  it('色は輝点と同じ緑・離す px は字 2 行（隼艇の印と同じ）・矢印の絵は Boot で 1 枚（tex-target-marker の色違い）', () => {
    expect(RADAR_MARKER_TEXT_COLOR).toBe(`#${RADAR_BLIP_COLOR.toString(16).padStart(6, '0')}`);
    expect(RADAR_MARKER_SEP_PX).toBe(FONT * 2 + 8);
    expect(readFileSync('src/config/ui-config.ts', 'utf8')).toContain('export const HUD_FONT_MARKER_PX = 18;');
    expect(code('src/scenes/boot-scene.ts')).toContain('generateTargetMarkerTexture(this, RADAR_MARKER_TEX_KEY, TARGET_MARKER_SIZE, RADAR_BLIP_COLOR);');
    expect(RADAR_MARKER_TEX_KEY).toBe('tex-radar-marker');
    expect(code('src/config/game-config.ts')).not.toContain('tex-radar-marker'); // TEXTURE_KEYS の棚卸し（tests/art-inventory）は変えない
    // 作るのはレーダーのある任務だけ（ほかの任務の印の数と作る順は今のまま）・敵・帰投・敵機の後に refresh
    const hm = code('src/ui/hud-markers.ts');
    expect(hm).toContain('if (telemetry.radar.enabled) {');
    expect(hm.indexOf('this.radarMarker?.refresh(telemetry, this.radarOthers, SPEED_HUD_KEEP_LEFT, SPEED_HUD_KEEP_TOP);')).toBeGreaterThan(hm.indexOf('pm?.refresh('));
    expect(hm).toContain('this.radarOthers = this.relayMarker ? [this.targetMarker, this.homeMarker, this.planeMarker, this.relayMarker] : [this.targetMarker, this.homeMarker, this.planeMarker];'); // v0.8.2 S4: 報告の任務（us_05）は中継の印からも離す（ほかの任務は今の 3 つ）
    expect(markerOnScreen(0, 0, 640, 360, TOP, MARGIN)).toBe(true);
  });
});
