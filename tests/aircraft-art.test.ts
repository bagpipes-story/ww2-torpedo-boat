// v0.7.0 S2b（アートと音①：コードで描く絵。spec-v0700 §4.3・§7.5・決め D4）: 機 8 種の絵の形の決まり（Phaser に依らない aircraft-shapes と aircraft-art-config を読む）。
// - 部品はすべて箱（翼幅 60 × 長さ 48 単位）の内・左右対称（中心線 x 30）・機首（最も上の点）は中心線の上・翼幅 ≥ 箱の 0.8（見張りで「十字」に読める）・細部 ≥ 2 単位（R17）。
// - 種類ごとの見分け: Pete は複葉と中央フロート・Jake は双フロート・Rufe は中央フロートと翼端の小フロート・SBD は前縁が真っ直ぐで 1 発・PB2Y は 4 発と双垂直尾翼・
//   F6F は角ばった翼端とプロペラの円・F4U は逆ガルの折れの線。表（id → 形）が data の機の id を覆い、表に無い id・null は既定の形。
// - source の pin: Boot の 2 行は aircraft-placeholder のときのまま（R14）、MissionWorld が世界を作る時に paintMissionAircraft（任務の機の id）を呼ぶ、
//   描き直しは canvas の clearRect の後に paintTexture（幅・高さを渡す generateTexture）、aircraft-placeholder は無い（aircraft-art が同じ名前を持つ）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  AIRCRAFT_ART_BY_ID, AIRCRAFT_ART_DEFAULT, AIRCRAFT_ART_LAYOUTS, AIRCRAFT_ART_MIN_SPAN_SHARE, AIRCRAFT_ART_SHAPES, AIRCRAFT_DETAIL_MIN_UNITS, AIRCRAFT_RIM_UNITS,
  FRIENDLY_AIRCRAFT_ART, aircraftArtShape, type AircraftArtShape,
} from '../src/config/aircraft-art-config';
import { aircraftPartBounds, aircraftShape, wingPoly, type AircraftShape } from '../src/assets/aircraft-shapes';
import { gameData } from '../src/config/game-data';

const SPAN = 60;
const LEN = 48;
const CX = SPAN / 2;
const SHAPES: Record<AircraftArtShape, AircraftShape> = Object.fromEntries(AIRCRAFT_ART_SHAPES.map((s) => [s, aircraftShape(AIRCRAFT_ART_LAYOUTS[s], SPAN, LEN)])) as Record<AircraftArtShape, AircraftShape>;
const key = (p: { x: number; y: number }): string => `${p.x.toFixed(3)},${p.y.toFixed(3)}`;

describe('機の絵の形（v0.7.0 S2b。aircraft-shapes）', () => {
  it('8 種がすべて置き方を持つ', () => {
    expect(Object.keys(AIRCRAFT_ART_LAYOUTS).sort()).toEqual([...AIRCRAFT_ART_SHAPES].sort());
    expect(AIRCRAFT_ART_SHAPES).toHaveLength(8);
  });
  it.each(AIRCRAFT_ART_SHAPES)('%s: 部品は箱の内・左右対称・機首は中心線の上・翼幅 ≥ 箱の 0.8', (s) => {
    const sh = SHAPES[s];
    expect(sh.parts.length).toBeGreaterThan(5);
    let top = Infinity;
    let topX = NaN;
    for (const p of sh.parts) {
      const b = aircraftPartBounds(p);
      expect(b.x0, `${s} ${p.kind}`).toBeGreaterThanOrEqual(-1e-9);
      expect(b.x1, `${s} ${p.kind}`).toBeLessThanOrEqual(SPAN + 1e-9);
      expect(b.y0, `${s} ${p.kind}`).toBeGreaterThanOrEqual(-1e-9);
      expect(b.y1, `${s} ${p.kind}`).toBeLessThanOrEqual(LEN + 1e-9);
      if (p.kind === 'poly') {
        const set = new Set(p.pts.map(key));
        for (const q of p.pts) expect(set.has(key({ x: 2 * CX - q.x, y: q.y })), `${s} 対称 ${q.x},${q.y}`).toBe(true);
        for (const q of p.pts) if (q.y < top) { top = q.y; topX = q.x; }
      } else {
        const cx = (b.x0 + b.x1) / 2;
        if (Math.abs(cx - CX) > 1e-9) expect(sh.parts.some((o) => o !== p && o.kind === p.kind && Math.abs((aircraftPartBounds(o).x0 + aircraftPartBounds(o).x1) / 2 - (2 * CX - cx)) < 1e-9), `${s} 対の部品`).toBe(true);
        if (b.y0 < top) { top = b.y0; topX = cx; }
      }
    }
    expect(top).toBeLessThanOrEqual(AIRCRAFT_RIM_UNITS + 1e-9);
    expect(topX).toBeCloseTo(CX, 6);
    expect(sh.wingSpan / SPAN).toBeGreaterThanOrEqual(AIRCRAFT_ART_MIN_SPAN_SHARE);
    const wing = wingPoly(AIRCRAFT_ART_LAYOUTS[s].wing, CX, LEN, 0);
    expect((Math.max(...wing.map((q) => q.x)) - Math.min(...wing.map((q) => q.x))) / SPAN).toBeGreaterThanOrEqual(AIRCRAFT_ART_MIN_SPAN_SHARE - 0.14); // 下翼（Pete 52）も 0.66 以上
  });
  it.each(AIRCRAFT_ART_SHAPES)('%s: 細部（矩形・丸）は 2 単位以上（R17）、リムの内側の地は輪郭より細い', (s) => {
    for (const p of SHAPES[s].parts) {
      if (p.kind === 'rect') { expect(Math.min(p.w, p.h), `${s} rect`).toBeGreaterThanOrEqual(AIRCRAFT_DETAIL_MIN_UNITS); }
      else if (p.kind === 'disc') expect(p.r * 2, `${s} disc`).toBeGreaterThanOrEqual(AIRCRAFT_DETAIL_MIN_UNITS - 1e-9);
    }
    const lay = AIRCRAFT_ART_LAYOUTS[s];
    const outer = wingPoly(lay.wing, CX, LEN, 0);
    const inner = wingPoly(lay.wing, CX, LEN, AIRCRAFT_RIM_UNITS);
    expect(Math.max(...inner.map((q) => q.x))).toBeLessThan(Math.max(...outer.map((q) => q.x)));
    expect(Math.min(...inner.map((q) => q.y))).toBeGreaterThan(Math.min(...outer.map((q) => q.y)));
  });
  it('種類ごとの見分け（置き方）', () => {
    const L = AIRCRAFT_ART_LAYOUTS;
    expect(L.pete.upperWing).not.toBeNull(); // 複葉
    expect(L.pete.centerFloat).not.toBeNull();
    expect(L.pete.tipFloats).toBe(true);
    expect(L.jake.twinFloats).not.toBeNull(); // 双フロート
    expect(L.jake.centerFloat).toBeNull();
    expect(L.rufe.centerFloat).not.toBeNull();
    expect(L.rufe.tipFloats).toBe(true);
    expect(L.rufe.wing.tipRound).toBeGreaterThan(L.f6f.wing.tipRound); // 丸い翼端 vs 角ばった翼端
    expect(L.sbd.wing.sweep).toBe(0); // 前縁が真っ直ぐ
    expect(L.sbd.nacelles).toHaveLength(0);
    expect(L.pb2y.nacelles).toHaveLength(2); // ±2 ＝ 4 発
    expect(L.pb2y.fins).toBe('twin');
    expect(L.pb2y.tipFloats).toBe(true);
    expect(L.f6f.wing.tipRound).toBe(0);
    expect(L.f6f.propR).toBeGreaterThan(0);
    expect(L.f4u.wing.gull).not.toBeNull(); // 逆ガル
    expect(L.f4u.wing.y).toBeGreaterThan(L.f6f.wing.y); // 長い機首
    for (const s of AIRCRAFT_ART_SHAPES) if (s !== 'pete') expect(L[s].upperWing, s).toBeNull();
    for (const s of AIRCRAFT_ART_SHAPES) if (s !== 'pb2y') expect(L[s].fins, s).toBe('single');
    for (const s of AIRCRAFT_ART_SHAPES) if (s !== 'f4u') expect(L[s].wing.gull, s).toBeNull();
    // 4 発の絵はナセルの矩形が 4 つ（フロートと同じ明るいリムの色＝暗い中間色だと昼の海との比を切る）、逆ガルは明るい線の矩形 2 つ、プロペラは薄い丸
    expect(SHAPES.pb2y.parts.filter((p) => p.kind === 'rect' && p.tone === 'rim' && p.h === 12)).toHaveLength(4);
    expect(SHAPES.f4u.parts.filter((p) => p.kind === 'rect' && p.tone === 'highlight' && p.alpha < 1)).toHaveLength(2);
    expect(SHAPES.f6f.parts.filter((p) => p.kind === 'disc' && p.alpha < 0.5)).toHaveLength(1);
  });
  it('id → 形の表は data の機の id を覆い、表に無い id・null は既定の形、味方機は SBD', () => {
    type Rec = Record<string, unknown>;
    const ids = (gameData.enemies.enemies as unknown as Rec[]).filter((e) => 'strike' in e || 'altitude_m' in e).map((e) => e['id'] as string).sort();
    expect(Object.keys(AIRCRAFT_ART_BY_ID).sort()).toEqual(ids);
    expect(new Set(Object.values(AIRCRAFT_ART_BY_ID)).size).toBe(7); // 7 種が全部違う形
    expect(aircraftArtShape('ijn_f1m2_pete')).toBe('pete');
    expect(aircraftArtShape('us_patrol_bomber')).toBe('pb2y');
    expect(aircraftArtShape('no_such_plane')).toBe(AIRCRAFT_ART_DEFAULT);
    expect(aircraftArtShape(null)).toBe(AIRCRAFT_ART_DEFAULT);
    expect(FRIENDLY_AIRCRAFT_ART).toBe('sbd');
  });
});

describe('機の絵の source の pin（v0.7.0 S2b。R14・D4）', () => {
  const boot = readFileSync('src/scenes/boot-scene.ts', 'utf8');
  const world = readFileSync('src/systems/mission-world.ts', 'utf8');
  const art = readFileSync('src/assets/aircraft-art.ts', 'utf8');
  it('Boot の 2 行は同じ（味方機・敵機の既定）。import の行だけ aircraft-art', () => {
    expect(boot).toMatch(/^\s*generateAircraftTexture\(this\);$/m);
    expect(boot).toMatch(/^\s*generateAircraftTexture\(this, TEXTURE_KEYS\.enemyAircraft, TARGET_MARKER_COLOR\);/m);
    expect(boot).toMatch(/import \{ generateAircraftTexture \} from '\.\.\/assets\/aircraft-art';/);
    expect(boot).not.toMatch(/aircraft-placeholder/);
  });
  it('MissionWorld は世界を作る時に paintMissionAircraft（任務の機の id）を 1 回呼ぶ（setup の後・敵と危険の生成の前）', () => {
    const at = world.indexOf('paintMissionAircraft(scene, missionAircraftId(mission))');
    expect(at).toBeGreaterThan(0);
    expect(at).toBeGreaterThan(world.indexOf('this.setup = s;'));
    expect(at).toBeLessThan(world.indexOf('buildEnemies(scene, s,'));
    expect(world.match(/paintMissionAircraft\(/g)).toHaveLength(1);
  });
  it('描き直しは canvas を clearRect してから paintTexture（art-dims の寸法＝幅・高さを渡す generateTexture）。鍵は TEXTURE_KEYS.enemyAircraft のまま', () => {
    expect(art).toMatch(/clearRect\(0, 0, src\.width, src\.height\)/);
    expect(art.indexOf('clearRect')).toBeLessThan(art.indexOf('paintAircraftTexture(scene, key, aircraftArtShape(aircraftId)'));
    expect(art).toMatch(/aircraftTexSize\(AIRCRAFT_SPAN_UNITS, AIRCRAFT_LENGTH_UNITS, RENDER_SCALE\)/);
    expect(art).toMatch(/paintTexture\(scene, key, size, RENDER_SCALE/);
    expect(art).not.toMatch(/generateTexture\(/); // 直接は呼ばない（art-pen の paintTexture が幅・高さ付きで呼ぶ）
    expect(art).toMatch(/missionAircraftId\(mission: PrototypeMission\)/);
    expect(art).toMatch(/mission\.dawnStrike\?\.aircraft_id \?\? mission\.enemyAircraft\?\.enemyId \?\? null/);
  });
});
