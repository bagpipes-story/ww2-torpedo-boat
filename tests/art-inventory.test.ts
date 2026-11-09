// v0.7.0 S0（アートと音①：コードで描く絵。spec-v0700 §7.2・D1）: テクスチャの棚卸しを固定する。S1〜S3c は絵を描き直すだけで、遊びに効く物（鍵・寸法・原点）を変えない。
// - TEXTURE_KEYS の v0.6.11 の 36 の値は消さない・変えない。鍵は足すだけ（足した鍵は PLANNED_NEW の分類に入っている）・値は重ならない。
// - 各鍵を「描き直す世界の絵」「変えない（spec §2.2 の変えない物＝R27）」に分ける（新しい鍵は「描き直す（新しい物）」か「演出」）。
// - assets/art-dims の式は v0.6.11 の placeholder の式と k ∈ {1, iPhone SE, iPhone 15, 2} で同じ。iPhone 15 の k で data から作る寸法は f5563ab のヘッドレスの実物と同じ px。
// - 世界の絵の原点（setOrigin）は鍵ごとに今のまま（探照灯は光源 (0.5, 1)・爆撃進路の線は (0, 0.5)・ほかは中央）。
// 実物の寸法の A/B（全任務の game.textures）は scripts/headless/tex-ab.mjs が見る（門）。
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gameData, getBargeParams, getBoatRecord, getEnemyRecord, getPrototypeMission, getTorpedoRecord } from '../src/config/game-data';
import { hasHardVariant } from '../src/config/mission-data';
import { getPtParams } from '../src/config/pt-mission-data';
import { getConvoyParams } from '../src/config/convoy-mission-data';
import { getGunboatParams } from '../src/config/gunboat-mission-data';
import { validateLandingMissions } from '../src/config/landing-mission-data';
import { validateAllyDestroyerMissions } from '../src/config/ally-destroyer-mission-data';
import { EXPLOSION_RING_RADIUS_UNITS, TORPEDO_WIDTH_UNITS, WAKE_DOT_RADIUS_UNITS, aircraftTexSize, discTexSize, hullTexSize, searchlightTexSize, torpedoTexSize, type TexSize } from '../src/assets/art-dims';
import { SHIP_ART_DEFAULT_KEY, SHIP_ART_KEY_BY_ENEMY, shipArtKey } from '../src/config/ship-art-config';
import { AIRCRAFT_ART_BY_ID, AIRCRAFT_ART_DEFAULT, AIRCRAFT_ART_SHAPES, FRIENDLY_AIRCRAFT_ART, aircraftArtShape } from '../src/config/aircraft-art-config';
import { SEA_GRID_ON, SEA_LIGHT_ART } from '../src/config/sea-art-config';

type Rec = Record<string, unknown>;

// game-config・ui-config は DOM を引く（tsconfig.node に DOM が無い）ので、鍵の表と寸法の定数は source から読む（menu-config を値で書く tests/arms-lines の先例）
const GAME_CONFIG = readFileSync('src/config/game-config.ts', 'utf8');
const UI_CONFIG = readFileSync('src/config/ui-config.ts', 'utf8');
function readKeys(): Record<string, string> {
  const m = /export const TEXTURE_KEYS = \{([\s\S]*?)\n\} as const;/.exec(GAME_CONFIG);
  if (!m) throw new Error('TEXTURE_KEYS が見つからない');
  const out: Record<string, string> = {};
  for (const x of m[1]!.matchAll(/^\s*(\w+): '([^']+)',/gm)) out[x[1]!] = x[2]!;
  const lines = m[1]!.split('\n').filter((l) => /^\s*\w+:/.test(l)).length;
  if (lines !== Object.keys(out).length) throw new Error(`TEXTURE_KEYS の ${lines} 行のうち ${Object.keys(out).length} 行しか読めない（鍵: '値', の形で書く）`);
  return out;
}
function uiNum(name: string): number {
  const m = new RegExp(`export const ${name} = ([0-9.]+);`).exec(UI_CONFIG);
  if (!m) throw new Error(`ui-config の ${name} が見つからない`);
  return Number(m[1]);
}
const TEXTURE_KEYS = readKeys();
const boatTextureKey = (id: string): string => `tex-boat-${id}`;
const AIRCRAFT_SPAN_UNITS = uiNum('AIRCRAFT_SPAN_UNITS');
const AIRCRAFT_LENGTH_UNITS = uiNum('AIRCRAFT_LENGTH_UNITS');
const SEARCHLIGHT_TEX_LENGTH_UNITS = uiNum('SEARCHLIGHT_TEX_LENGTH_UNITS');
const STARSHELL_TEX_RADIUS_UNITS = uiNum('STARSHELL_TEX_RADIUS_UNITS');
const SMOKE_PUFF_TEX_RADIUS_UNITS = uiNum('SMOKE_PUFF_TEX_RADIUS_UNITS');

/** v0.6.11（main f5563ab）の TEXTURE_KEYS の 36 の値 */
const V0611_KEYS: Readonly<Record<string, string>> = {
  destroyer: 'tex-destroyer', transport: 'tex-transport', transportFriendly: 'tex-transport-friendly', destroyerFriendly: 'tex-destroyer-friendly', allyFan: 'tex-ally-fan',
  torpedo: 'tex-torpedo', wakeDot: 'tex-wake-dot', torpedoButton: 'tex-torpedo-button', gunButton: 'tex-gun-button', explosionRing: 'tex-explosion-ring',
  targetMarker: 'tex-target-marker', homeMarker: 'tex-home-marker', returnRing: 'tex-return-ring', impactRing: 'tex-impact-ring', evacRing: 'tex-evac-ring',
  debugRing: 'tex-debug-ring', shell: 'tex-shell', tracer: 'tex-tracer', searchlight: 'tex-searchlight', starshell: 'tex-starshell',
  hpBarBg: 'tex-hp-bar-bg', hpBarFill: 'tex-hp-bar-fill', roundButton: 'tex-round-button', smokePuff: 'tex-smoke-puff', aircraft: 'tex-aircraft',
  enemyAircraft: 'tex-aircraft-enemy', rainStreak: 'tex-rain-streak', stickBase: 'tex-stick-base', stickKnob: 'tex-stick-knob', rudderBar: 'tex-rudder-bar',
  rudderMarker: 'tex-rudder-marker', barge: 'tex-barge', bargeFriendly: 'tex-barge-friendly', gunTracer: 'tex-gun-tracer', coastMarker: 'tex-coast-marker', ptBoat: 'tex-pt-boat',
};
/** 描き直す世界の絵（S1 艇は boatTextureKey・S2a 艦と大発と米PT と魚雷・S2b 機・S3c 探照灯と星弾と煙幕。鍵・寸法・原点はそのまま） */
const REDRAW = ['destroyer', 'transport', 'transportFriendly', 'destroyerFriendly', 'torpedo', 'barge', 'bargeFriendly', 'ptBoat', 'aircraft', 'enemyAircraft', 'searchlight', 'starshell', 'smokePuff'];
/** 変えない（spec §2.2 の「変えない物」＝R27）: HUD・輪・扇・印・砲弾と曳光弾（爆撃進路の線にも伸ばす）・雨筋・HP バー（暴風の帯にも伸ばす）・雷跡の点（R8）・爆発の輪（見越し点・目標の輪・爆弾にも使う＝D2） */
const KEEP = [
  'allyFan', 'wakeDot', 'torpedoButton', 'gunButton', 'explosionRing', 'targetMarker', 'homeMarker', 'returnRing', 'impactRing', 'evacRing', 'debugRing',
  'shell', 'tracer', 'hpBarBg', 'hpBarFill', 'roundButton', 'rainStreak', 'stickBase', 'stickKnob', 'rudderBar', 'rudderMarker', 'gunTracer', 'coastMarker',
];
/** v0.7.0 で足す予定の鍵（spec D2）と分類。TEXTURE_KEYS に足した鍵はここに無ければならない（無い鍵を足すならここにも足す） */
const PLANNED_NEW: Readonly<Record<string, 'redraw-new' | 'fx'>> = {
  'tex-destroyer-us': 'redraw-new',
  'tex-splash': 'fx', 'tex-muzzle-flash': 'fx', 'tex-fireball': 'fx', 'tex-flame': 'fx', 'tex-wake-boat': 'fx', 'tex-wake-ship': 'fx',
  'tex-sea-tile': 'fx', 'tex-dawn-glow': 'fx', 'tex-glint': 'fx', 'tex-coast-strip': 'fx',
  'tex-oil-slick': 'fx', // S4（spec の D2 の外。沈没の油の輪が水柱の絵の流用で星形に見えた＝独立の見え方の検査の指摘）
};
/** 艇の絵の鍵（Boot が遊べる任務の自艇・僚艇・隼艇から作る 5 枚） */
const BOAT_IDS = ['jp_h38_hayabusa', 'jp_t14', 'jp_t38', 'us_elco77', 'us_elco80'];
const KEY_VALUES = Object.values(TEXTURE_KEYS) as string[];

describe('TEXTURE_KEYS の棚卸し（v0.7.0 S0）', () => {
  it('v0.6.11 の 36 の鍵は消えず、値も同じ', () => {
    expect(Object.keys(V0611_KEYS).length).toBe(36);
    for (const [name, value] of Object.entries(V0611_KEYS)) expect(TEXTURE_KEYS[name], name).toBe(value);
  });
  it('v0.6.11 の 36 は「描き直す」か「変えない」のどちらか 1 つ', () => {
    expect([...REDRAW, ...KEEP].sort()).toEqual(Object.keys(V0611_KEYS).sort());
    expect(new Set([...REDRAW, ...KEEP]).size).toBe(36);
  });
  it('足した鍵は v0.7.0 の予定の分類（PLANNED_NEW）にあり、値は重ならず、艇・陰・壕の絵の鍵とも重ならない', () => {
    for (const [name, value] of Object.entries(TEXTURE_KEYS)) if (!(name in V0611_KEYS)) expect(PLANNED_NEW[value], `${name}: ${value}`).toBeDefined();
    expect(new Set(KEY_VALUES).size).toBe(KEY_VALUES.length);
    for (const v of KEY_VALUES) expect(v.startsWith('tex-boat-') || v.startsWith('tex-evac-cover-art-') || v === 'tex-evac-cave-art').toBe(false);
    for (const v of Object.keys(PLANNED_NEW)) expect(v.startsWith('tex-boat-') || v.startsWith('tex-evac-')).toBe(false);
  });
  it('艇の絵の鍵は tex-boat-<艇の id>（v0.6.0）で、Boot が作るのは 5 枚（自艇・僚艇・ハードの隼艇）', () => {
    expect(GAME_CONFIG).toContain('export function boatTextureKey(boatId: string): string {\n  return `tex-boat-${boatId}`;\n}');
    expect(bootBoatIds()).toEqual(BOAT_IDS);
  });
});

/** boot-scene の艇の輪（for (const id of boatIds) の前）と同じ集め方 */
function bootBoatIds(): string[] {
  const ids = new Set<string>();
  for (const m of gameData.missionsSeed.missions as unknown as Rec[]) {
    if (!m['v0_1_prototype'] || typeof m['id'] !== 'string') continue;
    const pm = getPrototypeMission(gameData, m['id']);
    ids.add(pm.playerBoatId);
    if (pm.escort) ids.add(pm.escort.boat);
    const hm = hasHardVariant(gameData, m['id']) ? getPrototypeMission(gameData, m['id'], true) : null;
    const gb = hm ? getGunboatParams(gameData, hm) : null;
    if (gb) ids.add(gb.boatId);
  }
  return [...ids].sort();
}

// v0.6.11 の placeholder の式（assets/placeholders.ts・*-placeholder.ts の行を写した）
const OLD = {
  hull: (L: number, B: number, k: number): TexSize => { const l = L * k; const b = B * k; return { w: Math.ceil(b), h: Math.ceil(l) }; },
  torpedo: (L: number, k: number): TexSize => ({ w: Math.ceil(3 * k), h: Math.ceil(L * k) }),
  wakeDot: (k: number): TexSize => { const d = Math.ceil(2.5 * 2 * k) + 2; return { w: d, h: d }; },
  ring: (k: number): TexSize => { const d = Math.ceil(40 * 2 * k) + 8; return { w: d, h: d }; },
  aircraft: (k: number): TexSize => ({ w: Math.ceil(AIRCRAFT_SPAN_UNITS * k), h: Math.ceil(AIRCRAFT_LENGTH_UNITS * k) }),
  disc: (r: number, k: number): TexSize => { const d = Math.ceil(r * 2 * k) + 2; return { w: d, h: d }; },
  searchlight: (cone: number, k: number): TexSize => {
    const L = SEARCHLIGHT_TEX_LENGTH_UNITS * k;
    const halfW = Math.tan(((cone / 2) * Math.PI) / 180) * L;
    return { w: Math.ceil(halfW * 2) + 2, h: Math.ceil(L) };
  },
};

/** Boot と同じ道で作る各鍵の入力（世界単位） */
function bootSpecs(): { hulls: Record<string, [number, number]>; torpedoL: number; coneDeg: number } {
  const ss = gameData.hitRateModel.world.sprite_scale;
  const hs = gameData.hitRateModel.world.hit_scale;
  const ts = gameData.hitRateModel.world.time_scale;
  const hulls: Record<string, [number, number]> = {};
  for (const id of BOAT_IDS) { const b = getBoatRecord(gameData, id); hulls[boatTextureKey(id)] = [b.length_m * ss, b.beam_m * ss]; }
  const proto = getPrototypeMission(gameData, 'us_02');
  const enemy = getEnemyRecord(gameData, proto.enemyId);
  hulls['tex-destroyer'] = [enemy.length_m * ss, enemy.beam_m * ss];
  const tr = getEnemyRecord(gameData, proto.transport!.enemyId);
  hulls['tex-transport'] = [tr.length_m * ss, tr.beam_m * ss];
  const barge = getBargeParams(gameData, getPrototypeMission(gameData, 'us_03'))!;
  hulls['tex-barge'] = [barge.boundsMarginM * 2, (barge.halfBeamM * 2 * ss) / hs];
  const convoy = getConvoyParams(gameData, getPrototypeMission(gameData, 'jp_01'))!;
  hulls['tex-barge-friendly'] = [convoy.params.boundsMarginM * 2, (convoy.params.halfBeamM * 2 * ss) / hs];
  const pt = getPtParams(gameData, getPrototypeMission(gameData, 'jp_01'), ts)!;
  hulls['tex-pt-boat'] = [pt.spriteLengthUnits, pt.spriteBeamUnits];
  const landing = validateLandingMissions(gameData, ts)!;
  hulls['tex-transport-friendly'] = [landing.lengthM * ss, landing.beamM * ss];
  const coneDeg = enemy.searchlight ? enemy.searchlight.cone_deg : 0;
  const ally = validateAllyDestroyerMissions(gameData, ts, coneDeg)!;
  hulls['tex-destroyer-friendly'] = [ally.lengthM * ss, ally.beamM * ss];
  return { hulls, torpedoL: getTorpedoRecord(gameData, proto.torpedoId).length_m * ss, coneDeg };
}

/** RENDER_SCALE（k）: 1・iPhone SE（667×375 の横持ち、論理幅 1280）・iPhone 15（852×393、1560）・iPad／PC の上限 2 */
const K_SE = Math.min(667 / 1280, 375 / 720) * 2;
const K_15 = Math.min(852 / 1560, 393 / 720) * 2;
const KS = [1, K_SE, K_15, 2];

describe('assets/art-dims の式（v0.6.11 の placeholder の式と同じ）', () => {
  const s = bootSpecs();
  it.each(KS)('k %f: 船形・魚雷・雷跡の点・爆発の輪・機・星弾・煙幕・探照灯', (k) => {
    for (const [key, [L, B]] of Object.entries(s.hulls)) expect(hullTexSize(L, B, k), key).toEqual(OLD.hull(L, B, k));
    expect(torpedoTexSize(s.torpedoL, k)).toEqual(OLD.torpedo(s.torpedoL, k));
    expect(discTexSize(WAKE_DOT_RADIUS_UNITS, k, 2)).toEqual(OLD.wakeDot(k));
    expect(discTexSize(EXPLOSION_RING_RADIUS_UNITS, k, 8)).toEqual(OLD.ring(k));
    expect(aircraftTexSize(AIRCRAFT_SPAN_UNITS, AIRCRAFT_LENGTH_UNITS, k)).toEqual(OLD.aircraft(k));
    expect(discTexSize(STARSHELL_TEX_RADIUS_UNITS, k, 2)).toEqual(OLD.disc(STARSHELL_TEX_RADIUS_UNITS, k));
    expect(discTexSize(SMOKE_PUFF_TEX_RADIUS_UNITS, k, 2)).toEqual(OLD.disc(SMOKE_PUFF_TEX_RADIUS_UNITS, k));
    expect(searchlightTexSize(s.coneDeg, SEARCHLIGHT_TEX_LENGTH_UNITS, k)).toEqual(OLD.searchlight(s.coneDeg, k));
  });
  it('iPhone 15 の k で data から作る寸法は f5563ab のヘッドレスの実物（W 1560・dpr 2）と同じ px', () => {
    const px = (t: TexSize): string => `${t.w}x${t.h}`;
    const got: Record<string, string> = {};
    for (const [key, [L, B]] of Object.entries(s.hulls)) got[key] = px(hullTexSize(L, B, K_15));
    got['tex-torpedo'] = px(torpedoTexSize(s.torpedoL, K_15));
    got['tex-wake-dot'] = px(discTexSize(WAKE_DOT_RADIUS_UNITS, K_15, 2));
    got['tex-explosion-ring'] = px(discTexSize(EXPLOSION_RING_RADIUS_UNITS, K_15, 8));
    got['tex-aircraft'] = px(aircraftTexSize(AIRCRAFT_SPAN_UNITS, AIRCRAFT_LENGTH_UNITS, K_15));
    got['tex-starshell'] = px(discTexSize(STARSHELL_TEX_RADIUS_UNITS, K_15, 2));
    got['tex-smoke-puff'] = px(discTexSize(SMOKE_PUFF_TEX_RADIUS_UNITS, K_15, 2));
    got['tex-searchlight'] = px(searchlightTexSize(s.coneDeg, SEARCHLIGHT_TEX_LENGTH_UNITS, K_15));
    expect(got).toEqual({
      'tex-boat-jp_h38_hayabusa': '10x40', 'tex-boat-jp_t14': '8x33', 'tex-boat-jp_t38': '10x40', 'tex-boat-us_elco77': '14x52', 'tex-boat-us_elco80': '14x54',
      'tex-destroyer': '24x258', 'tex-transport': '35x262', 'tex-barge': '8x33', 'tex-barge-friendly': '8x33', 'tex-pt-boat': '14x54',
      'tex-transport-friendly': '35x262', 'tex-destroyer-friendly': '20x225', 'tex-torpedo': '4x14', 'tex-wake-dot': '8x8', 'tex-explosion-ring': '96x96',
      'tex-aircraft': '66x53', 'tex-starshell': '282x282', 'tex-smoke-puff': '142x142', 'tex-searchlight': '61x280',
    });
  });
  it('placeholders.ts の私的な値（魚雷の幅・雷跡の点・爆発の輪）は art-dims と同じ', () => {
    const src = readFileSync('src/assets/placeholders.ts', 'utf8');
    for (const [name, v] of [['TORPEDO_WIDTH_UNITS', TORPEDO_WIDTH_UNITS], ['WAKE_DOT_RADIUS_UNITS', WAKE_DOT_RADIUS_UNITS], ['EXPLOSION_RING_RADIUS_UNITS', EXPLOSION_RING_RADIUS_UNITS]] as const) {
      const m = new RegExp(`const ${name} = ([0-9.]+);`).exec(src);
      if (m) expect(Number(m[1]), name).toBe(v); // S2a・S3b で placeholders.ts から絵が移れば、art-dims の値を使う（行が無くなってよい）
    }
  });
});

/** src の entities・systems で TEXTURE_KEYS.<名前> を使う文（次の ; まで）の setOrigin の引数。無ければ default（中央） */
function worldOrigins(): Record<string, string[]> {
  const out: Record<string, Set<string>> = {};
  for (const dir of ['src/entities', 'src/systems']) {
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.ts')) continue;
      const s = readFileSync(join(dir, f), 'utf8');
      const re = /TEXTURE_KEYS\.(\w+)|boatTextureKey\(/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(s))) {
        const rest = s.slice(m.index);
        const end = rest.indexOf(';');
        const o = /\.setOrigin\(([^)]*)\)/.exec(rest.slice(0, end < 0 ? 300 : end));
        (out[m[1] ?? 'boat'] ??= new Set()).add(o ? o[1]!.replace(/\s+/g, ' ') : 'default');
      }
    }
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v].sort()]));
}

describe('世界の絵の原点（setOrigin）は鍵ごとに今のまま', () => {
  const o = worldOrigins();
  it('探照灯は光源 (0.5, 1)（敵の駆逐艦・卯月）、爆撃進路の線（tex-tracer を伸ばす）は (0, 0.5)、卯月の扇は扇の形の原点', () => {
    expect(o['searchlight']).toEqual(['0.5, 1']);
    expect(o['tracer']).toEqual(['0, 0.5', 'default']);
    expect(o['allyFan']).toEqual(['fan.originX, fan.originY']);
  });
  it('描き直すほかの絵（艇・艦・大発・米PT・魚雷・機・星弾・煙幕）は中央（setOrigin なし）', () => {
    for (const name of [...REDRAW.filter((n) => n !== 'searchlight'), 'boat']) if (o[name]) expect(o[name], name).toEqual(['default']);
    for (const name of ['destroyer', 'transport', 'transportFriendly', 'destroyerFriendly', 'torpedo', 'barge', 'bargeFriendly', 'ptBoat', 'enemyAircraft', 'starshell', 'smokePuff']) expect(o[name], name).toBeDefined();
  });
});

describe('art config の表（v0.7.0 S0 の骨組み）', () => {
  it('駆逐艦の絵の鍵の表（D3）: 値は TEXTURE_KEYS か予定の鍵、遊べる任務の駆逐艦の id を覆い、表に無い id は v0.6.11 の 1 枚', () => {
    for (const v of [SHIP_ART_DEFAULT_KEY, ...Object.values(SHIP_ART_KEY_BY_ENEMY)]) expect(KEY_VALUES.includes(v) || PLANNED_NEW[v] === 'redraw-new', v).toBe(true);
    expect(SHIP_ART_DEFAULT_KEY).toBe(TEXTURE_KEYS['destroyer']);
    const destroyerIds = new Set<string>();
    for (const m of gameData.missionsSeed.missions as unknown as Rec[]) {
      if (!m['v0_1_prototype'] || typeof m['id'] !== 'string') continue;
      for (const hard of hasHardVariant(gameData, m['id']) ? [false, true] : [false]) {
        const pm = getPrototypeMission(gameData, m['id'], hard);
        if (pm.enemyStart && !pm.barges && !pm.ptBoats) destroyerIds.add(pm.enemyId);
      }
    }
    expect([...destroyerIds].sort()).toEqual(['ijn_destroyer', 'us_destroyer']);
    for (const id of destroyerIds) expect(SHIP_ART_KEY_BY_ENEMY[id], id).toBeDefined();
    expect(shipArtKey('ijn_light_cruiser')).toBe(SHIP_ART_DEFAULT_KEY);
  });
  it('機の種類の表（D4）: data の全部の機の id（空襲・水上機・哨戒機）を覆い、表に無い id と機の無い任務は既定の形', () => {
    const aircraftIds = (gameData.enemies.enemies as unknown as Rec[]).filter((e) => 'strike' in e || 'altitude_m' in e).map((e) => e['id'] as string).sort();
    expect(Object.keys(AIRCRAFT_ART_BY_ID).sort()).toEqual(aircraftIds);
    for (const v of [...Object.values(AIRCRAFT_ART_BY_ID), AIRCRAFT_ART_DEFAULT, FRIENDLY_AIRCRAFT_ART]) expect(AIRCRAFT_ART_SHAPES).toContain(v);
    expect(aircraftArtShape('no_such_plane')).toBe(AIRCRAFT_ART_DEFAULT);
    expect(aircraftArtShape(null)).toBe(AIRCRAFT_ART_DEFAULT);
  });
  it('海の光の表は data の moon の 4 つ（dark・half・full・day）を覆い、格子の線は既定で残す（R6）', () => {
    const moons = new Set((gameData.missionsSeed.missions as unknown as Rec[]).filter((m) => m['v0_1_prototype']).map((m) => m['moon'] as string));
    for (const m of moons) expect(Object.keys(SEA_LIGHT_ART)).toContain(m);
    expect(Object.keys(SEA_LIGHT_ART).sort()).toEqual(['dark', 'day', 'full', 'half']);
    expect(SEA_GRID_ON).toBe(true);
  });
  it('art config は何も import しない・art-dims は phaser を import しない（evac-art-config の作法）', () => {
    for (const f of ['boat-art-config', 'ship-art-config', 'aircraft-art-config', 'fx-art-config', 'sea-art-config']) expect(readFileSync(`src/config/${f}.ts`, 'utf8'), f).not.toMatch(/^import /m);
    expect(readFileSync('src/assets/art-dims.ts', 'utf8')).not.toMatch(/^import /m);
  });
});
