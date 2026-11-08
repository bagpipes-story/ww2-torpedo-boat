// v0.7.0 S2a（アートと音①：コードで描く絵。spec-v0700 §4.2・§7.4）: 艦（駆逐艦 3 種・輸送船）・大発・米PT・魚雷の絵の形の決まり（Phaser に依らない ship-shape と ship-art-config を読む）。
// - 輪郭はテクスチャの矩形 [0, B] × [0, L] の内・艦首の先が上の中央 (B/2, 0)・長さの 0.19〜0.86 は幅いっぱい（R22: 当たりのカプセルを細らせない）・艦尾は L まで。
// - 部品（艦橋・煙突・砲・発射管の台・ハッチ・点）は船体の縁から 1 単位以上内で、細部は 2 単位以上（R17）。幅 10 単位以上の艦は側の暗い帯あり・大発（7.3）は無し。
// - 大発の輪郭は placeholder のまま（道板 0.76B・道板 0.08L・艇尾は角）。駆逐艦の鍵の表（D3）が data の駆逐艦の id を覆い、値は TEXTURE_KEYS にある。
// - 魚雷の先端・尾は黄の系統（黄の面積 100%）。パレットの色相は敵 330〜20°・味方 190〜220°。source の pin: Boot・DestroyerGroup・world-enemies・placeholders ≤ 300 行。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ART_DETAIL_MIN_UNITS, ART_RIM_UNITS, ART_SIDE_BAND_MIN_BEAM_UNITS, PALETTE_ALLY, PALETTE_ENEMY, PALETTE_TRANSPORT, TORPEDO_ART, TORPEDO_TAIL_UNITS, TORPEDO_TIP_UNITS } from '../src/config/boat-art-config';
import {
  BARGE_RAMP_BEAM_SHARE, BARGE_RAMP_LEN_SHARE, SHIP_ART_KEY_BY_ENEMY, SHIP_ART_KIND_BY_KEY, SHIP_ART_LAYOUTS, SHIP_FULL_BEAM_FROM, SHIP_FULL_BEAM_SHARE, SHIP_FULL_BEAM_TO,
  shipArtKey, shipArtKind, type ShipArtKind,
} from '../src/config/ship-art-config';
import { bargeShape, shipPartBounds, shipShape, type ShipShape } from '../src/assets/ship-shape';
import { hullHalfWidthAt } from '../src/assets/boat-shape';
import { gameData, getBargeParams, getEnemyRecord, getPrototypeMission } from '../src/config/game-data';
import { validateLandingMissions } from '../src/config/landing-mission-data';
import { validateAllyDestroyerMissions } from '../src/config/ally-destroyer-mission-data';

const SS = gameData.hitRateModel.world.sprite_scale as number;
const TS = gameData.hitRateModel.world.time_scale as number;
const HS = gameData.hitRateModel.world.hit_scale as number;
const dims = (id: string): { L: number; B: number } => { const r = getEnemyRecord(gameData, id); return { L: r.length_m * SS, B: r.beam_m * SS }; };
const landing = validateLandingMissions(gameData, TS)!;
const ally = validateAllyDestroyerMissions(gameData, TS, getEnemyRecord(gameData, 'ijn_destroyer').searchlight!.cone_deg)!;
/** Boot と同じ寸法の 5 枚（鍵・形・世界単位） */
const SHIPS: { key: string; kind: ShipArtKind; L: number; B: number }[] = [
  { key: 'tex-destroyer', kind: 'kagero', ...dims('ijn_destroyer') },
  { key: 'tex-destroyer-us', kind: 'fletcher', ...dims('us_destroyer') },
  { key: 'tex-destroyer-friendly', kind: 'mutsuki', L: ally.lengthM * SS, B: ally.beamM * SS },
  { key: 'tex-transport', kind: 'transport', ...dims(getPrototypeMission(gameData, 'us_02').transport!.enemyId) },
  { key: 'tex-transport-friendly', kind: 'transport', L: landing.lengthM * SS, B: landing.beamM * SS },
];
const hsv = (c: number): { h: number; s: number } => {
  const r = (c >> 16) & 255; const g = (c >> 8) & 255; const b = c & 255;
  const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); const d = mx - mn;
  let h = 0;
  if (d > 0) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: mx === 0 ? 0 : d / mx };
};

/** 部品が船体（長さの割合 → 半幅）の内に margin 以上の余白で収まり、細部が 2 単位以上 */
function expectPartsInside(shape: ShipShape, halfAt: (yFrac: number) => number, label: string): void {
  expect(shape.parts.length).toBeGreaterThan(3);
  for (const p of shape.parts) {
    if (p.kind === 'poly') continue; // 地の面・側の帯（輪郭から作る）
    const bb = shipPartBounds(p);
    expect(bb.y0, `${label} ${p.kind} ${p.tone} 艦首`).toBeGreaterThanOrEqual(1 - 1e-9);
    expect(bb.y1, `${label} ${p.kind} ${p.tone} 艦尾`).toBeLessThanOrEqual(shape.lengthUnits - 1 + 1e-9);
    const margin = p.tone === 'highlight' && p.alpha < 0.5 ? 0.3 : 1; // 半透明の中心線の筋は船体の内なら良い
    for (const y of [bb.y0, (bb.y0 + bb.y1) / 2, bb.y1]) {
      const half = halfAt(y / shape.lengthUnits);
      expect(Math.max(Math.abs(bb.x0 - shape.beamUnits / 2), Math.abs(bb.x1 - shape.beamUnits / 2)), `${label} ${p.kind} ${p.tone} y ${y.toFixed(1)}`).toBeLessThanOrEqual(half - margin + 1e-9);
    }
    expect(Math.min(bb.x1 - bb.x0, bb.y1 - bb.y0), `${label} ${p.kind} ${p.tone}`).toBeGreaterThanOrEqual(ART_DETAIL_MIN_UNITS - 1e-9);
  }
}

describe('艦の絵の形（v0.7.0 S2a）', () => {
  it('鍵 → 形の表は 5 枚を覆い、2 枚の輸送船は同じ形、表に無い鍵は陽炎型', () => {
    expect(Object.keys(SHIP_ART_KIND_BY_KEY).sort()).toEqual(SHIPS.map((s) => s.key).sort());
    for (const s of SHIPS) expect(shipArtKind(s.key)).toBe(s.kind);
    expect(shipArtKind('tex-boat-jp_t38')).toBe('kagero');
    for (const s of SHIPS) expect(s.B, s.key).toBeGreaterThanOrEqual(ART_SIDE_BAND_MIN_BEAM_UNITS); // 艦はみな側の暗い帯あり
  });
  it.each(SHIPS)('$key: 輪郭は矩形の内・艦首の先が上の中央・0.19〜0.86 は幅いっぱい（R22）・艦尾は L', ({ kind, L, B }) => {
    const layout = SHIP_ART_LAYOUTS[kind];
    const shape = shipShape(layout, L, B);
    for (const p of shape.outline) {
      expect(p.x).toBeGreaterThanOrEqual(0); expect(p.x).toBeLessThanOrEqual(B + 1e-9);
      expect(p.y).toBeGreaterThanOrEqual(0); expect(p.y).toBeLessThanOrEqual(L + 1e-9);
    }
    expect(shape.outline[0]).toEqual({ x: B / 2, y: 0 });
    expect(layout.hull[layout.hull.length - 1]![0]).toBe(1);
    for (let f = SHIP_FULL_BEAM_FROM - 0.01; f <= SHIP_FULL_BEAM_TO + 0.01; f += 0.01) expect(hullHalfWidthAt(layout.hull, f, B), `${kind} ${f.toFixed(2)}`).toBeGreaterThanOrEqual((SHIP_FULL_BEAM_SHARE * B) / 2);
    expect(hullHalfWidthAt(layout.hull, 0.19, B)).toBeCloseTo(B / 2, 9);
    expect(hullHalfWidthAt(layout.hull, 0.86, B)).toBeCloseTo(B / 2, 9);
    expect(hullHalfWidthAt(layout.hull, 1, B)).toBeGreaterThan(0); // 艦尾は丸いか角（尖らない）
  });
  it.each(SHIPS)('$key: 部品は縁から 1 単位以上内で 2 単位以上（R17）・側の暗い帯と地と中心線の筋がある', ({ kind, L, B }) => {
    const layout = SHIP_ART_LAYOUTS[kind];
    const shape = shipShape(layout, L, B);
    expectPartsInside(shape, (f) => hullHalfWidthAt(layout.hull, f, B), kind);
    expect(shape.parts.filter((p) => p.kind === 'poly' && p.tone === 'side')).toHaveLength(2);
    expect(shape.parts[0]!.tone).toBe('deck');
    expect(shape.parts.some((p) => p.kind === 'rect' && p.tone === 'highlight' && p.alpha < 0.5)).toBe(true);
    // 部品どうし（砲・煙突・艦橋・発射管の台）は長さの向きに重ならない（中心線の筋・艦橋の上面・砲塔の点・ハッチの内側・荷役の腕を除く）
    const solid = shape.parts.filter((p) => p.kind !== 'poly' && p.alpha >= 1 && p.tone !== 'highlight' && !(p.kind === 'rect' && p.tone === 'detail' && p.r === 0) && !(p.kind === 'rect' && p.w === 2 && p.tone === 'super'));
    const spans = solid.map((p) => shipPartBounds(p)).filter((b) => Math.abs((b.x0 + b.x1) / 2 - B / 2) < 1e-9).sort((a, b) => a.y0 - b.y0);
    for (let i = 1; i < spans.length; i++) expect(spans[i]!.y0, `${kind} 部品 ${i} の重なり`).toBeGreaterThanOrEqual(spans[i - 1]!.y1 - 1e-9);
  });
  it('形で見分ける（spec §3.3「違いは色でなく形」）: 陽炎型は連装 3 と船首楼の段、フレッチャー級は単装 5 と平甲板と角のある艦尾、睦月型は単装 4 と切れ込み、輸送船は砲なし・ハッチ 4・丸い艦首', () => {
    const l = SHIP_ART_LAYOUTS;
    expect(l.kagero.mounts).toHaveLength(3);
    expect(l.kagero.mounts.every(([, w]) => w >= 0.4)).toBe(true);
    expect(l.kagero.forecastle?.[1]).toBe('line');
    expect(l.fletcher.mounts).toHaveLength(5);
    expect(l.fletcher.mounts.every(([, w]) => w < 0.4)).toBe(true);
    expect(l.fletcher.forecastle).toBeNull();
    expect(l.fletcher.hull[l.fletcher.hull.length - 1]![1]).toBeGreaterThan(l.kagero.hull[l.kagero.hull.length - 1]![1]);
    expect(l.mutsuki.mounts).toHaveLength(4);
    expect(l.mutsuki.forecastle?.[1]).toBe('notch');
    expect(l.transport.mounts).toHaveLength(0);
    expect(l.transport.hatches).toHaveLength(4);
    expect(hullHalfWidthAt(l.transport.hull, 0.04, 1)).toBeGreaterThan(hullHalfWidthAt(l.kagero.hull, 0.04, 1) * 1.5);
    for (const k of ['kagero', 'fletcher', 'mutsuki'] as const) { expect(l[k].funnels).toHaveLength(2); expect(l[k].tubes).toHaveLength(2); }
  });
  it('駆逐艦の鍵の表（D3）: data の駆逐艦の id → TEXTURE_KEYS にある鍵（us_destroyer は tex-destroyer-us）', () => {
    const g = readFileSync('src/config/game-config.ts', 'utf8');
    for (const v of Object.values(SHIP_ART_KEY_BY_ENEMY)) expect(g).toContain(`'${v}'`);
    expect(shipArtKey('us_destroyer')).toBe('tex-destroyer-us');
    expect(shipArtKey('ijn_destroyer')).toBe('tex-destroyer');
    expect(dims('us_destroyer')).toEqual({ L: 229.6, B: 24 });
  });
});

describe('大発・米PT・魚雷の絵（v0.7.0 S2a）', () => {
  const barge = getBargeParams(gameData, getPrototypeMission(gameData, 'us_03'))!;
  const L = barge.boundsMarginM * 2;
  const B = (barge.halfBeamM * 2 * SS) / HS;
  it('大発: 輪郭は placeholder のまま（道板 0.76B・0.08L・艇尾は角）・幅 10 単位未満で側の暗い帯なし・部品は内で 2 単位以上', () => {
    const shape = bargeShape(L, B);
    expect(B).toBeLessThan(ART_SIDE_BAND_MIN_BEAM_UNITS);
    expect(shape.outline).toEqual([
      { x: 0.12 * B, y: 0 }, { x: 0.88 * B, y: 0 }, { x: 0.88 * B, y: 0.08 * L }, { x: B, y: 0.08 * L }, { x: B, y: L }, { x: 0, y: L }, { x: 0, y: 0.08 * L }, { x: 0.12 * B, y: 0.08 * L },
    ]);
    expect(BARGE_RAMP_BEAM_SHARE).toBe(0.76);
    expect(BARGE_RAMP_LEN_SHARE).toBe(0.08);
    expect(shape.parts.some((p) => p.kind === 'poly' && p.tone === 'side')).toBe(false);
    expectPartsInside(shape, (f) => (f < BARGE_RAMP_LEN_SHARE ? (BARGE_RAMP_BEAM_SHARE * B) / 2 : B / 2), 'barge');
    expect(shape.parts.some((p) => p.kind === 'rect' && p.tone === 'side')).toBe(true); // 開いた荷台
    expect(shape.parts.filter((p) => p.kind === 'disc' && p.tone === 'highlight').length).toBeGreaterThanOrEqual(3); // 荷の点
  });
  it('魚雷: 先端 1.5・尾 1 単位、どちらも黄の系統（色相 38〜62°・彩度 ≥ 0.35＝黄の面積 100%）・先端は胴より明るい', () => {
    expect(TORPEDO_TIP_UNITS).toBe(1.5);
    expect(TORPEDO_TAIL_UNITS).toBe(1);
    for (const c of [TORPEDO_ART.body, TORPEDO_ART.tip, TORPEDO_ART.tail]) { const { h, s } = hsv(c); expect(h).toBeGreaterThanOrEqual(38); expect(h).toBeLessThanOrEqual(62); expect(s).toBeGreaterThanOrEqual(0.35); }
    expect(TORPEDO_ART.tip & 255).toBeGreaterThan(TORPEDO_ART.body & 255);
  });
  it('パレットの色相: 敵と敵の輸送船は 330〜20°、味方は 190〜220°（地・縁・側・上部構造）', () => {
    for (const pal of [PALETTE_ENEMY, PALETTE_TRANSPORT]) for (const c of [pal.deck, pal.rim, pal.side, pal.superstructure]) { const h = hsv(c).h; expect(h >= 330 || h <= 20, c.toString(16)).toBe(true); }
    for (const c of [PALETTE_ALLY.deck, PALETTE_ALLY.rim, PALETTE_ALLY.side, PALETTE_ALLY.superstructure]) { const h = hsv(c).h; expect(h).toBeGreaterThanOrEqual(190); expect(h).toBeLessThanOrEqual(220); }
    expect(ART_RIM_UNITS).toBe(1.5);
  });
  it('source の pin: Boot は駆逐艦の絵の後に米駆逐艦の 1 行、world-enemies が shipArtKey(mission.enemyId) を DestroyerGroup の最後の引数で渡す（setup には足さない＝R15）、placeholders.ts は 300 行以下', () => {
    const boot = readFileSync('src/scenes/boot-scene.ts', 'utf8');
    const i = boot.indexOf('generateDestroyerTexture(this, { lengthUnits: enemy.length_m * spriteScale, beamUnits: enemy.beam_m * spriteScale });');
    const j = boot.indexOf('generateExtraDestroyerTextures(this, gameData, spriteScale);');
    expect(i).toBeGreaterThan(0);
    expect(j).toBeGreaterThan(i);
    expect(boot.split('generateExtraDestroyerTextures(').length).toBe(2);
    const we = readFileSync('src/systems/world-enemies.ts', 'utf8');
    expect(we).toContain('splashes, shipArtKey(mission.enemyId)) : null;');
    const dg = readFileSync('src/systems/destroyer-group.ts', 'utf8');
    expect(dg).toContain('destroyerTextureKey: string = TEXTURE_KEYS.destroyer,');
    expect(dg).toContain('new Destroyer(scene, st, ds.spec, ds.shipAi, bounds, lookoutRng, destroyerTextureKey)');
    expect(readFileSync('src/systems/destroyer-setup.ts', 'utf8')).not.toMatch(/textureKey|artKey|shipArt/); // setup には絵の鍵を足さない（snapshot が変わる）
    expect(readFileSync('src/assets/placeholders.ts', 'utf8').split('\n').length).toBeLessThanOrEqual(301);
    expect(readFileSync('src/assets/ship-art.ts', 'utf8')).toContain('hullTexSize(spec.lengthUnits, spec.beamUnits, RENDER_SCALE)');
    expect(readFileSync('src/assets/torpedo-art.ts', 'utf8')).toContain('torpedoTexSize(lengthUnits, RENDER_SCALE)');
  });
});
