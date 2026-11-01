// v0.6.9 S6b（S6a-fix の報告: 南を向いて輸送船のそばにいると船が画面の上に来て、船体の上の字が 2・3 行目とビルド番号に重なった）: 海の上の輸送船の字が重なってはいけない HUD の矩形
// （ui/landing-markers の landingHudRects・boxHitsRects。entities/ally-ship が ui/ally-ship-view の allyShipTextPlace で上 → 下 → 出さないを決める）。tests/hud-layout の固定の箱と
// ボタンの当たりをどれも含むこと、jp_04 にあるボタンの段だけ塞ぐこと、辺と pad の扱い。tests/landing-markers.test.ts（300 行を超えた）から分けた。
import { describe, expect, it } from 'vitest';
import { HIT_PAD, RUDDER_HALF, R_SKILL, panelLayout, speedHudRightX } from '../src/config/hud-layout-config';
import { boxHitsRects, landingCaretRects, landingHudRects } from '../src/ui/landing-markers';

describe('HUD に重ねない（landingHudRects・boxHitsRects。S6a-fix の報告: 画面の上に来た輸送船の字が 2・3 行目とビルド番号に重なった）', () => {
  /**
   * 論理 1560・1280 の ui-config の値（ui-config は DOM を読むので写し）: 上の帯の下端 170（印の矢印の上端 179 − 9）・一時停止 (60, 270) R36・スティック (174, 546) R110・
   * 速力の表示の左 W − 312 − 240 − 8・上 580（針路の文の上端 588 − 8。機関の帯のある任務は端の印の避ける角の上端 534＝systems/world-landing の buildLanding）
   */
  const rectsFor = (W: number, has = { smoke: true, identify: true }, speedTop = 580) =>
    landingHudRects({ W, H: 720, topBandBottom: 170, has, pause: { x: 60, y: 270, r: 36 }, stick: { x: 174, y: 546, r: 110 }, speedLeft: speedHudRightX(W) - 2 * RUDDER_HALF - 8, speedTop });
  type B = { x0: number; y0: number; x1: number; y1: number };
  const covered = (rs: readonly B[], b: B): boolean => rs.some((r) => r.x0 <= b.x0 && r.y0 <= b.y0 && r.x1 >= b.x1 && r.y1 >= b.y1);
  it('tests/hud-layout の固定の箱（上の帯の 7 つ・右上の揚陸の時計・一時停止・速力・機関の帯は機関のある任務の上端で）と jp_04 のボタンの当たり・兵装の上の文はどれも矩形のどれかの内（論理幅 1280・1560）', () => {
    for (const W of [1280, 1560]) {
      const rs = rectsFor(W);
      expect(rs.length).toBe(5 + 4);
      const sp = speedHudRightX(W);
      const fixed: Record<string, B> = {
        fps: { x0: 24, y0: 24, x1: 100, y1: 46 }, clock: { x0: 24, y0: 50, x1: 208, y1: 74 }, hp: { x0: 24, y0: 82, x1: 342, y1: 126 }, fuel: { x0: 24, y0: 126, x1: 342, y1: 166 },
        pause: { x0: 24, y0: 234, x1: 96, y1: 306 }, buildLabel: { x0: W / 2 - 813 / 2, y0: 24, x1: W / 2 + 813 / 2, y1: 46 }, line2: { x0: 220, y0: 50, x1: W - 220, y1: 76 },
        line3: { x0: W / 2 - 300, y0: 80, x1: W / 2 + 300, y1: 104 }, landingClock: { x0: W - 208, y0: 50, x1: W - 24, y1: 74 }, speedHud: { x0: sp - 240, y0: 584, x1: sp, y1: 696 },
      };
      for (const [k, b] of Object.entries(fixed)) expect(covered(rs, b), `${W} ${k}`).toBe(true);
      const engineHud = { x0: sp - 88 - 72, y0: 552, x1: sp, y1: 574 };
      expect([covered(rs, engineHud), covered(rectsFor(W, undefined, 534), engineHud)], `${W} 機関の帯（jp_05 だけ）`).toEqual([false, true]);
      const L = panelLayout(W, { smoke: false, identify: false });
      const circle = (c: { x: number; y: number; r: number }): B => ({ x0: c.x - c.r - HIT_PAD, y0: c.y - c.r - HIT_PAD, x1: c.x + c.r + HIT_PAD, y1: c.y + c.r + HIT_PAD });
      const hits: Record<string, B> = { torpedo: circle(L.torpedo), gun: circle(L.gun), spread: L.spread.hit, cue: { x0: L.cue.left, y0: L.cue.bottom - Math.round(L.cue.px * 1.2), x1: L.cue.right, y1: L.cue.bottom } };
      for (const sk of panelLayout(W, { smoke: true, identify: true }).skills) hits[sk.kind] = circle({ x: sk.x, y: sk.y, r: R_SKILL });
      for (const [k, b] of Object.entries(hits)) expect(covered(rs, b), `${W} ${k}`).toBe(true);
      expect(covered(rs, { x0: 64, y0: 436, x1: 284, y1: 656 }), `${W} スティックの台座`).toBe(true);
      // 上の帯は画面の上の外まで（上の外に出た字も「重なる」＝船体の下へ）。海の真ん中（自艇のまわり）は空いている
      expect(boxHitsRects(600, -300, 700, -250, rs, 0)).toBe(true);
      expect(boxHitsRects(W / 2 - 80, 200, W / 2 + 80, 420, rs, 0)).toBe(false);
      // jp_04（T-38 は煙幕なし・味方機なし）: 消火と見張りの段だけ塞ぐ（空いた煙幕・識別の段の字は出せる。論理幅 1280 の出発の画面で輸送船は右端の列の下に見える）
      const jp = rectsFor(W, { smoke: false, identify: false });
      expect(jp.length).toBe(5 + 2);
      const sx = W - 68;
      expect([boxHitsRects(sx - 10, 60, sx + 10, 80, jp, 0), boxHitsRects(sx - 10, 170, sx + 10, 190, jp, 0), boxHitsRects(sx - 10, 282, sx + 10, 302, jp, 0), boxHitsRects(sx - 10, 394, sx + 10, 414, jp, 0)]).toEqual([true, true, true, false]);
      expect(boxHitsRects(sx - 10, 233, sx + 10, 239, jp, 0)).toBe(false); // 消火（136〜224＋縁 8）と見張り（248〜336＋縁 8）の間
    }
  });
  it('▼ の矩形（landingCaretRects）は輸送船の字の矩形の一部で、どれも端の印の縁の矩形（上 179・右 W − 352）の外＝そこで端の印に替えても矢印は PT へ向く', () => {
    for (const W of [1280, 1560]) {
      for (const has of [{ smoke: false, identify: false }, { smoke: true, identify: true }]) {
        const k = { W, H: 720, topBandBottom: 170, has, pause: { x: 60, y: 270, r: 36 }, stick: { x: 174, y: 546, r: 110 }, speedLeft: speedHudRightX(W) - 2 * RUDDER_HALF - 8, speedTop: 580 };
        const cr = landingCaretRects(k);
        const hr = landingHudRects(k);
        expect(cr.length).toBe(2 + panelLayout(W, has).skills.length);
        expect(hr.slice(0, cr.length)).toEqual(cr);
        expect(hr.length).toBe(cr.length + 3);
        for (const r of cr) expect(r.y1 <= 179 || r.x0 >= W - 352, `${W} ${JSON.stringify(r)}`).toBe(true);
      }
    }
  });
  it('boxHitsRects: 辺が触れるだけは重ならない、pad px 広げれば重なる（置き場所の行き来を止める余分の空き）', () => {
    const rs = [{ x0: 100, y0: 100, x1: 200, y1: 200 }];
    expect(boxHitsRects(0, 0, 100, 100, rs, 0)).toBe(false);
    expect(boxHitsRects(0, 0, 101, 101, rs, 0)).toBe(true);
    expect(boxHitsRects(0, 0, 90, 90, rs, 10)).toBe(false);
    expect(boxHitsRects(0, 0, 91, 91, rs, 10)).toBe(true);
    expect(boxHitsRects(210, 150, 260, 160, rs, 0)).toBe(false);
    expect(boxHitsRects(210, 150, 260, 160, [], 100)).toBe(false);
  });
});
