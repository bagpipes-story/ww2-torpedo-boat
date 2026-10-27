// v0.6.7 レビューの直し（ux:ux-2・ux:ux-5）: 夜の哨戒機の任務の「敵機 N m」の矢印。
// ux-2: 付近の捜索の 900 m・接近の始まりの 4200 m（v0.6.7 実機 1 回目に 6000 m から）・出撃の旋回の 600 m のちょうどの半径で hypot が 1 ulp 上に出て、切り上げのラベルが「1000 m」と行き来した（8 秒で 168 回の setText）→ µm に丸める。
// ux-5: 南東の捜索で矢印が下の縁の右寄り（右下の速力の HUD の上）に止まった → 下の縁なら左へ、右の縁なら上へ縁に沿ってずらす。どちらも夜の哨戒機の任務だけ（ほかの任務の矢印はソースで今のまま）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { AircraftPose } from '../src/core/friendly';
import { PA_ORBIT, PA_PASS, createPatrolAir, patrolPose } from '../src/core/patrol-air';
import { snappedDistM } from '../src/ui/edge-marker-screen';
import { avoidCorner, type MarkerRect, type MarkerShift } from '../src/ui/marker-separation';
import { S02 } from './patrol-world-kit';

const G = S02.patrolAir!.gate;
const STEP = 100;
const label = (d: number): number => Math.ceil(d / STEP) * STEP;

describe('ラベルの距離（snappedDistM。ux:ux-2）', () => {
  it('ちょうどの半径（900・4200・600 m）では、どの方位でもラベルは半径のまま（丸めない hypot は 1 ulp 上で 100 m 上に跳ぶ方位がある）', () => {
    for (const r of [G.nearM, G.wakeDetectM, S02.patrolAir!.sortie.runRadiusM]) {
      let raw = 0;
      for (let i = 0; i < 3600; i++) {
        const b = (i / 10) * (Math.PI / 180);
        const dx = r * Math.sin(b);
        const dy = -r * Math.cos(b);
        if (label(Math.hypot(dx, dy)) !== r) raw++;
        expect(label(snappedDistM(dx, dy)), `${r} m ${i / 10}°`).toBe(r);
      }
      expect(raw, `${r} m`).toBeGreaterThan(100); // 直す前の跳び（レビューの 706・683・476 / 3600 と同じ桁）
    }
  });
  it('本物の門番の付近の捜索 8 秒（60 fps・隊形のずれ −10°）で、1 番機のラベルは 900 m のまま 1 度も変わらない', () => {
    const s = createPatrolAir();
    const out: AircraftPose = { dx: 0, dy: 0, headingDeg: 0, alpha: 0 };
    s.phase = PA_ORBIT;
    s.r = G.nearM;
    s.bearingDeg = 146;
    const labels = new Set<number>();
    for (let i = 0; i <= 8 * 60; i++) {
      s.bearingDeg = (146 + G.orbitDegPerS * (i / 60)) % 360;
      const q = patrolPose(s, G, S02.patrolAir!.sortie.spawnOffsetsDeg[0]!, out);
      labels.add(label(snappedDistM(q.dx, q.dy)));
    }
    expect([...labels]).toEqual([900]);
    // 接近の始まり（r ちょうど 4200）も 2 行目と同じ 4200 m
    s.phase = PA_PASS;
    s.r = G.wakeDetectM;
    const q = patrolPose(s, G, -10, out);
    expect(label(snappedDistM(q.dx, q.dy))).toBe(4200);
    // 半径の内側の普通の距離は丸めても同じ刻み
    expect(label(snappedDistM(300, 400))).toBe(500);
    expect(label(snappedDistM(1234.5, 0))).toBe(1300);
  });
});

describe('右下の速力の HUD を避ける（avoidCorner。ux:ux-5）', () => {
  /** 論理 1280 × 720 の ui/edge-marker の縁（左 56・右 1280 − 180・上 300・下 720 − 56）と、速力の HUD の塊の左上（余白込み） */
  const R: MarkerRect = { left: 56, top: 300, right: 1100, bottom: 664 };
  const KEEP_LEFT = 792;
  const KEEP_TOP = 534;
  const out: MarkerShift = { dx: NaN, dy: NaN };
  const at = (x: number, y: number): [number, number] => {
    const o = avoidCorner(x, y, R, KEEP_LEFT, KEEP_TOP, out);
    expect(o).toBe(out); // 書き込み先をそのまま返す（確保なし）
    return [o.dx, o.dy];
  };
  it('下の縁で速力の HUD の上なら左へ（縁の上のまま）、右の縁で速力の HUD の横なら上へ。外なら動かさない', () => {
    expect(at(1000, 664)).toEqual([KEEP_LEFT - 1000, 0]);
    expect(at(1100, 664)).toEqual([KEEP_LEFT - 1100, 0]); // 角は下の縁として左へ
    expect(at(1100, 600)).toEqual([0, KEEP_TOP - 600]);
    expect(at(KEEP_LEFT, 664)).toEqual([0, 0]);
    expect(at(700, 664)).toEqual([0, 0]);
    expect(at(1100, KEEP_TOP)).toEqual([0, 0]);
    expect(at(1100, 400)).toEqual([0, 0]);
    expect(at(56, 664)).toEqual([0, 0]);
    // 縁でない点（画面の内に出ることは無いが）は動かさない
    expect(at(900, 600)).toEqual([0, 0]);
  });
  it('ずらした点は縁の上・表示の矩形の内', () => {
    for (let x = KEEP_LEFT + 1; x <= R.right; x += 7) {
      const [dx] = at(x, R.bottom);
      expect(x + dx).toBe(KEEP_LEFT);
      expect(x + dx).toBeGreaterThanOrEqual(R.left);
    }
    for (let y = KEEP_TOP + 1; y <= R.bottom - 1; y += 5) {
      const [, dy] = at(R.right, y);
      expect(y + dy).toBe(KEEP_TOP);
      expect(y + dy).toBeGreaterThanOrEqual(R.top);
    }
  });
});

describe('配線（ui/hud-markers のソース）', () => {
  const strip = (code: string): string => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const hud = strip(readFileSync('src/ui/hud-markers.ts', 'utf8'));
  it('距離を渡すのと速力の HUD を避けるのは夜の哨戒機の任務だけ（ほかの任務は distM なし＝今の hypot・ずらしなし）', () => {
    expect(hud).toContain('const patrol = telemetry.patrol.enabled;');
    expect(hud).toContain('pm?.refresh(pdx, telemetry.planeDy, !Number.isNaN(pdx), telemetry, patrol && !Number.isNaN(pdx) ? snappedDistM(pdx, telemetry.planeDy) : undefined);');
    expect(hud).toContain('if (pm && patrol && pm.isShown) pm.nudge(avoidCorner(pm.shownX, pm.shownY, PLANE_MARKER_RECT, SPEED_HUD_KEEP_LEFT, SPEED_HUD_KEEP_TOP, shift).dx, shift.dy);');
    // 矢印の refresh の順は今のまま（敵 → 帰投 → 敵機 → 岸 → 輸送隊 → 隼艇）
    const r = hud.slice(hud.indexOf('refresh(telemetry: BoatTelemetry)'));
    const order = ['this.targetMarker?.refresh(', 'this.homeMarker?.refresh(', 'pm?.refresh(', 'this.coastMarker?.refresh(', 'this.convoyMarker?.refresh(', 'gm.refresh('].map((x) => r.indexOf(x));
    expect(order.every((i, j) => i > 0 && (j === 0 || i > order[j - 1]!)), order.join(' ')).toBe(true);
  });
  it('速力の HUD の塊は ui/boat-hud の置き方から（舵のバーの左端・針路の上端）と、ラベルの分の余白', () => {
    expect(hud).toContain('const SPEED_HUD_KEEP_LEFT = GAME_WIDTH - HUD_MARGIN * 2 - TORPEDO_BUTTON_RADIUS * 2 - RUDDER_BAR_HALF_WIDTH * 2 - HUD_FONT_MARKER_PX * 4;');
    expect(hud).toContain('const SPEED_HUD_KEEP_TOP = GAME_HEIGHT - HUD_MARGIN - RUDDER_MARKER_HEIGHT - HUD_TEXT_GAP - HUD_HEADING_OFFSET_Y - HUD_FONT_HEADING_PX - HUD_FONT_MARKER_PX * 3;');
    const bh = strip(readFileSync('src/ui/boat-hud.ts', 'utf8'));
    expect(bh).toContain('const right = GAME_WIDTH - HUD_MARGIN - TORPEDO_BUTTON_RADIUS * 2 - HUD_MARGIN;');
    expect(bh).toContain('.image(right - RUDDER_BAR_HALF_WIDTH, bottom - RUDDER_MARKER_HEIGHT / 2, TEXTURE_KEYS.rudderBar)');
    expect(bh).toContain('const textBottom = this.rudderBar.y - RUDDER_MARKER_HEIGHT / 2 - HUD_TEXT_GAP;');
    expect(bh).toContain('.text(right, textBottom - HUD_HEADING_OFFSET_Y, \'\', hudTextStyle(HUD_FONT_HEADING_PX))');
  });
});
