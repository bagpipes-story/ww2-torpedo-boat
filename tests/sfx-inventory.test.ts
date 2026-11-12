// v0.7.1 S0（アートと音②：合成の効果音。spec-v0710 §4・§6.2・§7.3・§9.1）: 音の棚卸しを固定する（tests/art-inventory の型）。
// - 鍵は 25 本（単発 20・ループ 5）。足す・消すは config/sfx-config の表とここを一緒に直す。
// - 表の欄がそろう（秒は spec §4・最小間隔は §7.3・届く帯は §6.2・優先は系統から）。種は SFX_SEED_<鍵> で重ならず、絵の種（ART_SEED_*）とも重ならない。合計 ≤ 70 万標本。
// - 段ごとの作り方: S0 は ui_tap・mg・blast_l、S2 で砲・水柱・爆発・沈没の 7 本、S3 でループ 5 本。残りは PLANNED の段（S4）で足す＝足した段は IMPLEMENTED_NOW へ移す。25 本そろったら PLANNED は空。
// - 音量の順（S2 の mix の詰め）: 魚雷の命中 ≥ 大きい爆発 > 小さい爆発 > 近い砲 > 大きい水柱 > 機銃 > 小さい水柱（機銃・水柱が爆発を埋めない）。
// - 音を足しても TEXTURE_KEYS とシーンの並びは今のまま（v0.7.0 の 53 鍵・7 シーン）。
// S4 で足す検査: core/sfx-cues の合図の表の鍵は全部ここにある・どこからも鳴らさない鍵は無い（下の it.todo）。
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as cfg from '../src/config/sfx-config';
import { SFX_BAND_GAIN, SFX_BAND_MAX_M, SFX_KEYS, SFX_MAX_TOTAL_SAMPLES, SFX_SAMPLE_RATE, SFX_TABLE, type SfxFamily, type SfxKey } from '../src/config/sfx-config';
import { renderSfx, sfxImplementedKeys } from '../src/assets/sfx-bank';

/** spec §4 の 25 本と秒（単発 20・ループ 5） */
const SECONDS: Readonly<Record<string, number>> = {
  mg: 0.12, gun_near: 0.6, gun_far: 0.9, splash_s: 0.35, splash_l: 0.8, blast_s: 0.5, blast_l: 1.6, torp_hit: 2.2, torp_launch: 0.7, hull_hit: 0.3,
  alarm: 0.6, light_on: 0.5, flare_pop: 1.2, bomb_fall: 1.2, reload: 0.35, smoke: 1.0, ui_tap: 0.06, bell: 1.4, engine_cough: 0.8, sink: 2.5,
  engine: 1.0, sea: 4.0, fire: 2.0, rain: 2.0, drone: 1.5,
};
const LOOPS = ['engine', 'sea', 'fire', 'rain', 'drone'];
/** 系統（spec §7.3 の優先の単位） */
const FAMILY: Readonly<Record<string, SfxFamily>> = {
  mg: 'gun', gun_near: 'gun', gun_far: 'gun', splash_s: 'splash', splash_l: 'splash', blast_s: 'blast', blast_l: 'blast', torp_hit: 'blast', sink: 'blast',
  torp_launch: 'cue', hull_hit: 'cue', alarm: 'cue', light_on: 'cue', flare_pop: 'cue', bomb_fall: 'cue', reload: 'cue', smoke: 'cue', bell: 'cue', engine_cough: 'cue',
  ui_tap: 'ui', engine: 'loop', sea: 'loop', fire: 'loop', rain: 'loop', drone: 'loop',
};
/** 優先: 合図・UI（奪われない）3 > 爆発・魚雷 2 > 砲 1 > 水柱 0。ループは声を使わない（欄は 3） */
const PRIORITY: Readonly<Record<SfxFamily, number>> = { ui: 3, cue: 3, loop: 3, blast: 2, gun: 1, splash: 0 };
/**
 * spec §7.3 の最小間隔（秒。ほかは 0＝合図は冷却で間引く）。S2 で gun_near だけ 0.12 → 0.2: 駆逐艦の副砲は 0.125 秒ごとに撃ち、フレームの刻み（1/60 秒）で間が 0.117／0.133 秒に
 * 揺れるので、0.12 では「1 発おき」がフレームの揺れ任せになる（probe の us_01）。0.2 で毎秒 4 発に決める
 */
const MIN_INTERVAL: Readonly<Record<string, number>> = { mg: 0.07, gun_near: 0.2, gun_far: 0.25, splash_s: 0.08, splash_l: 0.15, blast_s: 0.1, blast_l: 0.2 };
/** 鍵の音量（S2 で probe の記録を mix した数から詰めた。合図・ループは仮のまま＝S3〜S5） */
const GAIN: Readonly<Record<string, number>> = { mg: 0.4, gun_near: 0.7, gun_far: 0.8, splash_s: 0.3, splash_l: 0.5, blast_s: 0.8, blast_l: 1, torp_hit: 1, sink: 0.6 };
/** spec §6.2 の届く帯（ほかは一番遠い帯 3） */
const REACH: Readonly<Record<string, number>> = { splash_s: 1, mg: 2, splash_l: 2 };
/** 再生のたびの rate の揺れ（spec §4。ほかは 0） */
const JITTER: Readonly<Record<string, number>> = { mg: 0.08, splash_s: 0.12 };

/** 今の段で作り方のある鍵（SFX_KEYS の順）と、残りを足す段（spec §10） */
const IMPLEMENTED_NOW: readonly string[] = ['mg', 'gun_near', 'gun_far', 'splash_s', 'splash_l', 'blast_s', 'blast_l', 'torp_hit', 'ui_tap', 'sink', 'engine', 'sea', 'fire', 'rain', 'drone'];
const PLANNED: Readonly<Record<string, 'S4'>> = {
  torp_launch: 'S4', hull_hit: 'S4', alarm: 'S4', light_on: 'S4', flare_pop: 'S4', bomb_fall: 'S4', reload: 'S4', smoke: 'S4', bell: 'S4', engine_cough: 'S4',
};

describe('音の鍵と表の棚卸し（v0.7.1 S0）', () => {
  it('鍵は 25 本（単発 20・ループ 5）で、spec §4 の表と同じ・重ならない', () => {
    expect([...SFX_KEYS]).toEqual(Object.keys(SECONDS));
    expect(SFX_KEYS.length).toBe(25);
    expect(new Set(SFX_KEYS).size).toBe(25);
    expect(Object.keys(SFX_TABLE).sort()).toEqual([...SFX_KEYS].sort());
    expect(SFX_KEYS.filter((k) => SFX_TABLE[k].loop)).toEqual(LOOPS);
  });
  it.each([...SFX_KEYS])('%s: 表の欄がそろう（秒・種・音量・優先・最小間隔・届く帯・系統・ループ・rate の揺れ）', (key) => {
    const d = SFX_TABLE[key];
    expect(Object.keys(d).sort()).toEqual(['family', 'gain', 'loop', 'minIntervalS', 'priority', 'rateJitter', 'reachBand', 'seconds', 'seed']);
    expect(d.seconds).toBe(SECONDS[key]);
    expect(d.seed).toBe((cfg as unknown as Record<string, number>)[`SFX_SEED_${key.toUpperCase()}`]);
    expect(d.gain).toBeGreaterThan(0);
    expect(d.gain).toBeLessThanOrEqual(1);
    if (key in GAIN) expect(d.gain).toBe(GAIN[key]);
    expect(d.family).toBe(FAMILY[key]);
    expect(d.priority).toBe(PRIORITY[d.family]);
    expect(d.minIntervalS).toBe(MIN_INTERVAL[key] ?? 0);
    expect(d.reachBand).toBe(REACH[key] ?? SFX_BAND_MAX_M.length - 1);
    expect(d.loop).toBe(LOOPS.includes(key));
    expect(d.rateJitter).toBe(JITTER[key] ?? 0);
  });
  it('種は 26（鍵 25 ＋ 再生の揺れ SFX_SEED_PLAY）で重ならず、絵の種（ART_SEED_*）とも重ならない', () => {
    const src = readFileSync('src/config/sfx-config.ts', 'utf8');
    const seeds = [...src.matchAll(/^export const (SFX_SEED_\w+) = (\d+);/gm)].map((m) => [m[1]!, Number(m[2])] as const);
    expect(seeds.length).toBe(26);
    expect(seeds.map((s) => s[0]).sort()).toEqual([...SFX_KEYS.map((k) => `SFX_SEED_${k.toUpperCase()}`), 'SFX_SEED_PLAY'].sort());
    expect(new Set(seeds.map((s) => s[1])).size).toBe(26);
    const art: number[] = [];
    for (const f of readdirSync('src/config')) {
      if (f.startsWith('sfx-')) continue;
      for (const m of readFileSync(join('src/config', f), 'utf8').matchAll(/^export const \w*ART_SEED\w* = (\d+);/gm)) art.push(Number(m[1]));
    }
    expect(art.length).toBeGreaterThanOrEqual(10);
    for (const s of seeds) expect(art, s[0]).not.toContain(s[1]);
  });
  it('標本の合計は 70 万以下（22,050 Hz・約 28.2 秒＝621,368 標本）', () => {
    expect(SFX_SAMPLE_RATE).toBe(22050);
    expect(SFX_MAX_TOTAL_SAMPLES).toBe(700_000);
    const total = SFX_KEYS.reduce((a, k) => a + Math.round(SFX_TABLE[k].seconds * SFX_SAMPLE_RATE), 0);
    expect(total).toBe(621_368);
    expect(total).toBeLessThanOrEqual(SFX_MAX_TOTAL_SAMPLES);
  });
  it('聞かせ方の定数は spec のとおり（声 16・距離の帯・パン・リミッタ・master・ループの更新）', () => {
    expect(cfg.SFX_VOICES).toBe(16);
    expect(cfg.SFX_PEAK).toBe(0.9);
    expect(cfg.SFX_EDGE_FADE_S).toBe(0.002);
    expect([...SFX_BAND_MAX_M]).toEqual([400, 1500, 4000, 16000]);
    expect([...SFX_BAND_GAIN]).toEqual([1.0, 0.55, 0.3, 0.16]);
    expect(cfg.SFX_GUN_FAR_FROM_BAND).toBe(2);
    expect([cfg.SFX_PAN_HALF_WIDTH_M, cfg.SFX_PAN_MAX, cfg.SFX_PAN_CENTER_M]).toEqual([900, 0.7, 30]);
    expect(cfg.SFX_LIMITER).toMatchObject({ thresholdDb: -10, ratio: 12, attackS: 0.003, releaseS: 0.25 });
    expect(cfg.SFX_MASTER_GAIN).toBe(0.8);
    // S1: 最初の音の立ち上がり（R11。0 からではない＝最初のタップが聞こえる）・消音の絞り・最初のタップを覚える秒・見張り（L3c）・保存の鍵・Audio Session（L1）
    expect(cfg.SFX_FIRST_FADE).toEqual({ fromShare: 0.3, seconds: 0.3 });
    expect(cfg.SFX_MUTE_TIME_CONSTANT_S).toBe(0.015);
    // S2: 沈没の 2 次の爆発（小さめ・0.3 秒の内は重ねない）・小艇の沈没の速さ（rate は 0.5〜2 の内）・Boot で作る標本は ui_tap だけ（残りは 1 フレームに 1 本）。S1 の代わりの音は消した
    expect(cfg.SFX_SECONDARY_BLAST).toEqual({ gain: 0.7, minIntervalS: 0.3 });
    expect(cfg.SFX_SECONDARY_BLAST.minIntervalS).toBeGreaterThan(SFX_TABLE.blast_s.minIntervalS);
    expect(cfg.SFX_SINK_SMALL_RATE).toBe(1.3);
    expect(cfg.SFX_SINK_SMALL_RATE).toBeLessThanOrEqual(cfg.SFX_LOOP_RATE_MAX);
    expect([...cfg.SFX_BUILD_FIRST]).toEqual(['ui_tap']);
    expect('SFX_S1_SMALL_BLAST' in cfg).toBe(false);
    expect(cfg.SFX_UI_PENDING_S).toBe(0.5);
    expect(cfg.SFX_WATCHDOG).toEqual({ checkMs: 100, frozenMs: 500, throttleMs: 5000, capMs: 200, maxTries: 3 });
    expect([cfg.SFX_STORAGE_KEY, cfg.SFX_AUDIO_SESSION_TYPE]).toEqual(['night-hunters.sound', 'ambient']);
    expect([cfg.SFX_LOOP_UPDATE_HZ, cfg.SFX_LOOP_TIME_CONSTANT_S, cfg.SFX_LOOP_GAIN_EPS, cfg.SFX_LOOP_RATE_EPS, cfg.SFX_LOOP_PAUSE_FADE_S]).toEqual([10, 0.08, 0.01, 0.005, 0.15]);
    expect([cfg.SFX_LOOP_RATE_MIN, cfg.SFX_LOOP_RATE_MAX]).toEqual([0.5, 2]);
    expect(cfg.SFX_LOOP_ENGINE).toMatchObject({ gainStop: 0.1, gainSilent: 0.16, gainCruise: 0.38, gainFull: 0.6, rateBase: 0.75, rateSpan: 0.75 });
    // 全速のエンジン ≤ 0.6（R11）・rate は 0.5〜2 の内（§14 L6）
    expect(cfg.SFX_LOOP_ENGINE.rateBase * (1 - cfg.SFX_LOOP_ENGINE.stageWobble[2])).toBeGreaterThanOrEqual(cfg.SFX_LOOP_RATE_MIN);
    expect((cfg.SFX_LOOP_ENGINE.rateBase + cfg.SFX_LOOP_ENGINE.rateSpan) * (1 + cfg.SFX_LOOP_ENGINE.stageWobble[2])).toBeLessThanOrEqual(cfg.SFX_LOOP_RATE_MAX);
    // S3: ループの目標の表は spec §5 のまま（比）。束の音量（リミッタの後へつなぐ時の全体の倍率）・止める時の絞り・一時停止を開いた合図・機の爆音の帯と jp_03
    expect(cfg.SFX_LOOP_ENGINE).toMatchObject({ damagedWobble: 0.06, wobbleHz: 3, stageWobble: [0.04, 0.08, 0.12] });
    expect([cfg.SFX_LOOP_SEA, cfg.SFX_LOOP_FIRE, cfg.SFX_LOOP_RAIN]).toEqual([{ gainBase: 0.1, gainSpeed: 0.14, gainStorm: 0.1 }, { gain: 0.35, riseS: 0.3, fallS: 0.5 }, { gainInside: 0.4, gainNear: 0.15 }]);
    expect(cfg.SFX_LOOP_DRONE).toEqual({ gainFar: 0.1, gainNear: 0.4, gainByBand: [0.4, 0.3, 0.2], gainFriendly: 0.4, gainFriendlyLeaving: 0.2, gainAttack: 0.45, gainRest: 0.1, gainEvacOther: 0.25, rateMin: 0.9, rateMax: 1.15 });
    expect(cfg.SFX_LOOP_DRONE.gainByBand.length).toBe(SFX_BAND_MAX_M.length - 1);
    expect([cfg.SFX_LOOP_BUS_GAIN, cfg.SFX_LOOP_STOP_FADE_S]).toEqual([0.5, 0.15]);
    expect(cfg.SFX_PAUSE_OPEN).toEqual({ gain: 0.7, rate: 0.7 });
    // ループの和の一番大きい目標（全速・暴風の中・火災・空襲）× 束の音量 ≤ 1（頂 0.9 の標本 5 本の頂が全部そろっても、束の出口で 1 を超えない）
    const worst = cfg.SFX_LOOP_ENGINE.gainFull + cfg.SFX_LOOP_SEA.gainBase + cfg.SFX_LOOP_SEA.gainSpeed + cfg.SFX_LOOP_SEA.gainStorm + cfg.SFX_LOOP_FIRE.gain + cfg.SFX_LOOP_RAIN.gainInside + cfg.SFX_LOOP_DRONE.gainAttack;
    expect(worst * cfg.SFX_PEAK * cfg.SFX_LOOP_BUS_GAIN).toBeLessThanOrEqual(1);
  });
  it('音量の順（S2）: 魚雷の命中 ≥ 大きい爆発 > 小さい爆発 > 近い砲 > 大きい水柱 > 機銃 > 小さい水柱。帯 0 の機銃は帯 1 の大きい爆発より小さい', () => {
    const g = (k: SfxKey): number => SFX_TABLE[k].gain;
    expect(g('torp_hit')).toBeGreaterThanOrEqual(g('blast_l'));
    const order: SfxKey[] = ['blast_l', 'blast_s', 'gun_near', 'splash_l', 'mg', 'splash_s'];
    for (let i = 1; i < order.length; i++) expect(g(order[i]!), `${order[i - 1]} > ${order[i]}`).toBeLessThan(g(order[i - 1]!));
    expect(g('mg') * SFX_BAND_GAIN[0]!).toBeLessThan(g('blast_l') * SFX_BAND_GAIN[1]!);
    expect(g('mg') * SFX_BAND_GAIN[0]!).toBeLessThan(g('torp_hit') * SFX_BAND_GAIN[1]!);
  });
  it('sfx-config は何も import しない', () => {
    expect(readFileSync('src/config/sfx-config.ts', 'utf8')).not.toMatch(/^\s*import\s/m);
  });
});

describe('段ごとの作り方（S0: 3 本・S2: 7 本・S3: ループ 5 本。残りは S4）', () => {
  it('作り方のある鍵は今の段の表と同じ・残りは予定の段にあり、合わせて 25 本', () => {
    expect(sfxImplementedKeys()).toEqual(SFX_KEYS.filter((k) => IMPLEMENTED_NOW.includes(k)));
    expect(sfxImplementedKeys().length).toBe(IMPLEMENTED_NOW.length);
    expect([...IMPLEMENTED_NOW, ...Object.keys(PLANNED)].sort()).toEqual([...SFX_KEYS].sort());
    expect(IMPLEMENTED_NOW.filter((k) => k in PLANNED)).toEqual([]);
  });
  it.each(Object.keys(PLANNED))('%s: 作り方がまだ無い鍵は、黙って無音を返さず投げる', (key) => {
    expect(() => renderSfx(key as SfxKey)).toThrow(/まだ無い/);
  });
  it.todo('S4: core/sfx-cues の合図の表の鍵は全部 SFX_KEYS にある');
  it.todo('S4: どこからも鳴らさない鍵は無い（口・合図・ループ・UI のどれかが使う）');
});

describe('音を足しても絵の鍵とシーンの並びは今のまま（v0.7.0 の main 3a9e7aa）', () => {
  it('TEXTURE_KEYS は 53 鍵で、名前と値の指紋が同じ', () => {
    const m = /export const TEXTURE_KEYS = \{([\s\S]*?)\n\} as const;/.exec(readFileSync('src/config/game-config.ts', 'utf8'));
    const rows = [...m![1]!.matchAll(/^\s*(\w+): '([^']+)',/gm)].map((x) => `${x[1]}:${x[2]}`);
    const joined = rows.join(',');
    let h = 0x811c9dc5;
    for (let i = 0; i < joined.length; i++) h = Math.imul(h ^ joined.charCodeAt(i), 0x01000193) >>> 0;
    expect(rows.length).toBe(53);
    expect(h).toBe(TEXTURE_KEYS_FNV);
  });
  it('シーンの並びは Boot・Title・Briefing・Mission・Hud・Result・Pause', () => {
    expect(readFileSync('src/config/phaser-config.ts', 'utf8')).toContain('  scene: [BootScene, TitleScene, BriefingScene, MissionScene, HudScene, ResultScene, PauseScene],');
  });
});
const TEXTURE_KEYS_FNV = 1609463289;
