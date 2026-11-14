// v0.7.2 S0（アートと音③：BGM と命中スローの音。spec-v0720 §2〜§6・§8.1・§13）: 曲の棚卸しを固定する（tests/sfx-inventory の型）。
// - 曲の鍵は 6 本（タイトルの候補 A・B・C と任務の層 L0・L1・L2）で、効果音の SFX_KEYS とは別の表（§13 L5: 効果音 26 本の表・標本・音量はそのまま）。
// - 種は SFX_SEED_MUSIC_*（7601〜7699）だけで重ならず、効果音・絵の種とも重ならない。作曲の乱数は musicRng（曲ごとの種）。Math.random なし。
// - 速さは 16 分音符が整数の標本になる 7 つだけ・長さは小節 × 拍 × 4 × 16 分・任務の層は L2 の整数倍（R6）・常駐の上限（ゲーム 180 万・試聴の場 280 万標本）。
// - 音量の表（§3.4 の出口の目標・段の重さ・鍵ごとの音量）・下げる表（§4.6。警報 −8 dB は U-M1・ほかは設計の既定）・段の間（§5.2）・命中スローの案（§6.2・O2）・
//   移りの秒（§4.2・D10）・作る予算（§2）・既定のタイトルの曲（O1: A）。config は何も import しない。S0 はゲームのどこからも import されない（tests/sfx-rules にも）。
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as mc from '../src/config/sfx-music-config';
import {
  MUSIC_BPMS, MUSIC_GAIN, MUSIC_KEYS, MUSIC_LAYER_KEYS, MUSIC_LENGTHS, MUSIC_MOOD_WEIGHTS, MUSIC_TARGET_DBFS, MUSIC_TITLE_KEYS, SFX_MUSIC_DUCK, SFX_SLOW, SFX_SLOW_IDS, type MusicKey,
} from '../src/config/sfx-music-config';
import { SFX_KEYS, SFX_LOOP_ENGINE, SFX_LOOP_RATE_MIN, SFX_MASTER_GAIN, SFX_PEAK, SFX_SAMPLE_RATE, SFX_STORAGE_KEY, SFX_TABLE } from '../src/config/sfx-config';
import { sixteenthOf } from '../src/assets/sfx-music-compose';
import { MUSIC_SEEDS, MUSIC_THEMES, MUSIC_TITLE_DEFAULT_ID, musicRng } from '../src/assets/sfx-music-themes';
import { SeededRng } from '../src/core/rng';

const MUSIC_FILES = ['src/config/sfx-music-config.ts', ...readdirSync('src/assets').filter((f) => f.startsWith('sfx-music-')).map((f) => `src/assets/${f}`)].sort();
const seedsIn = (file: string, re: RegExp): [string, number][] => [...readFileSync(file, 'utf8').matchAll(re)].map((m) => [m[1]!, Number(m[2])]);
/** spec §3.5・§3.6 の速さ・拍・小節 */
const FORM: Readonly<Record<MusicKey, readonly [number, number, number]>> = {
  title_a: [63, 4, 8], title_b: [105, 2, 16], title_c: [70, 4, 8], mission_l0: [90, 4, 8], mission_l1: [90, 4, 8], mission_l2: [90, 4, 2],
};

describe('曲の鍵と表（v0.7.2 S0）', () => {
  it('鍵は 6 本（タイトル 3・任務の層 3）で重ならず、効果音の SFX_KEYS にも表 SFX_TABLE にも入っていない（§13 L5）', () => {
    expect([...MUSIC_KEYS]).toEqual(['title_a', 'title_b', 'title_c', 'mission_l0', 'mission_l1', 'mission_l2']);
    expect(new Set(MUSIC_KEYS).size).toBe(6);
    expect([...MUSIC_TITLE_KEYS, ...MUSIC_LAYER_KEYS].sort()).toEqual([...MUSIC_KEYS].sort());
    for (const k of MUSIC_KEYS) {
      expect((SFX_KEYS as readonly string[]).includes(k), k).toBe(false);
      expect(k in SFX_TABLE, k).toBe(false);
    }
    expect(Object.keys(MUSIC_THEMES).sort()).toEqual([...MUSIC_KEYS].sort());
    for (const k of MUSIC_KEYS) expect(MUSIC_THEMES[k].key).toBe(k);
    expect(SFX_KEYS.length).toBe(26); // 効果音の表は v0.7.1 のまま
  });
  it('既定のタイトルの曲は A（§11 O1: 試聴で選ぶまで）・命中スローの既定は案 A（§11 O2）', () => {
    expect(MUSIC_TITLE_DEFAULT_ID).toBe('title_a');
    expect(MUSIC_TITLE_KEYS).toContain(MUSIC_TITLE_DEFAULT_ID);
    expect(mc.SFX_SLOW_DEFAULT_ID).toBe('A');
  });
  it('速さは 16 分音符が 22,050 Hz で整数の標本になる 7 つだけ（spec §2）・曲はその中の速さ・長さは小節 × 拍 × 4 × 16 分（spec §3.5・§3.6）', () => {
    expect([...MUSIC_BPMS]).toEqual([63, 70, 75, 90, 98, 105, 126]);
    for (const bpm of MUSIC_BPMS) expect(Number.isInteger(sixteenthOf(bpm)), `${bpm}`).toBe(true);
    expect([63, 70, 90, 105].map((b) => sixteenthOf(b as mc.MusicBpm))).toEqual([5250, 4725, 3675, 3150]);
    for (const k of MUSIC_KEYS) {
      const th = MUSIC_THEMES[k], [bpm, beats, bars] = FORM[k];
      expect([th.bpm, th.beats, th.bars], k).toEqual([bpm, beats, bars]);
      expect(MUSIC_LENGTHS[k], k).toBe(bars * beats * 4 * sixteenthOf(th.bpm));
      expect(th.chords.length, k).toBe(bars);
    }
    expect(MUSIC_LENGTHS).toEqual({ title_a: 672_000, title_b: 403_200, title_c: 604_800, mission_l0: 470_400, mission_l1: 470_400, mission_l2: 117_600 });
  });
  it('任務の層の長さは L2 の整数倍（R6: 同じ時刻に始めればずれない）', () => {
    expect(MUSIC_LENGTHS.mission_l0).toBe(MUSIC_LENGTHS.mission_l1);
    expect(MUSIC_LENGTHS.mission_l0 % MUSIC_LENGTHS.mission_l2).toBe(0);
    expect(MUSIC_LENGTHS.mission_l0 / MUSIC_LENGTHS.mission_l2).toBe(4);
  });
  it('常駐の上限（R2）: ゲームの中（既定のタイトル 1 本＋任務の家族）≤ 180 万標本、試聴の場（タイトル 3 本＋家族）≤ 280 万標本・作業用の配列は一番長い鍵の長さ', () => {
    const game = MUSIC_LENGTHS[MUSIC_TITLE_DEFAULT_ID] + MUSIC_LAYER_KEYS.reduce((a, k) => a + MUSIC_LENGTHS[k], 0);
    expect(game).toBe(1_730_400);
    expect(game).toBeLessThanOrEqual(mc.MUSIC_MAX_RESIDENT_SAMPLES);
    for (const t of MUSIC_TITLE_KEYS) expect(MUSIC_LENGTHS[t] + game - MUSIC_LENGTHS[MUSIC_TITLE_DEFAULT_ID]).toBeLessThanOrEqual(mc.MUSIC_MAX_RESIDENT_SAMPLES);
    const lab = MUSIC_KEYS.reduce((a, k) => a + MUSIC_LENGTHS[k], 0);
    expect(lab).toBe(2_738_400);
    expect(lab).toBeLessThanOrEqual(mc.MUSIC_LAB_MAX_SAMPLES);
    expect([mc.MUSIC_MAX_RESIDENT_SAMPLES, mc.MUSIC_LAB_MAX_SAMPLES]).toEqual([1_800_000, 2_800_000]);
    expect(mc.MUSIC_WORK_SAMPLES).toBe(Math.max(...Object.values(MUSIC_LENGTHS)));
  });
  it('標本の速さ・頂・master は効果音と同じ（同じ context・同じ master の後で測る）', () => {
    expect([mc.MUSIC_SAMPLE_RATE, mc.MUSIC_PEAK, mc.MUSIC_MASTER_GAIN]).toEqual([SFX_SAMPLE_RATE, SFX_PEAK, SFX_MASTER_GAIN]);
  });
});

describe('曲の種（音だけの乱数）', () => {
  it('種は SFX_SEED_MUSIC_* の 7 つ（曲 6 ＋ 雑音の表）で 7601〜7699・重ならず、効果音の種（SFX_SEED_*）と絵の種（ART_SEED_*）とも重ならない', () => {
    const seeds = seedsIn('src/config/sfx-music-config.ts', /^export const (SFX_SEED_MUSIC_\w+) = (\d+);/gm);
    expect(seeds.map((s) => s[0]).sort()).toEqual(['SFX_SEED_MUSIC_A', 'SFX_SEED_MUSIC_B', 'SFX_SEED_MUSIC_C', 'SFX_SEED_MUSIC_L0', 'SFX_SEED_MUSIC_L1', 'SFX_SEED_MUSIC_L2', 'SFX_SEED_MUSIC_NOISE']);
    expect(new Set(seeds.map((s) => s[1])).size).toBe(7);
    for (const [name, v] of seeds) expect(v >= 7601 && v <= 7699, `${name} ${v}`).toBe(true);
    const sfx = seedsIn('src/config/sfx-config.ts', /^export const (SFX_SEED_\w+) = (\d+);/gm).map((s) => s[1]);
    expect(sfx.length).toBe(32);
    const art: number[] = [];
    for (const f of readdirSync('src/config')) {
      if (f.startsWith('sfx-')) continue;
      for (const m of readFileSync(join('src/config', f), 'utf8').matchAll(/^export const \w*ART_SEED\w* = (\d+);/gm)) art.push(Number(m[1]));
    }
    expect(art.length).toBeGreaterThanOrEqual(10);
    for (const [name, v] of seeds) {
      expect(sfx, name).not.toContain(v);
      expect(art, name).not.toContain(v);
    }
  });
  it('曲ごとの乱数 musicRng は MUSIC_SEEDS の種の SeededRng と同じ系列・種は鍵ごとに違う', () => {
    expect(MUSIC_SEEDS).toEqual({ title_a: mc.SFX_SEED_MUSIC_A, title_b: mc.SFX_SEED_MUSIC_B, title_c: mc.SFX_SEED_MUSIC_C, mission_l0: mc.SFX_SEED_MUSIC_L0, mission_l1: mc.SFX_SEED_MUSIC_L1, mission_l2: mc.SFX_SEED_MUSIC_L2 });
    for (const k of MUSIC_KEYS) {
      const a = musicRng(k), b = new SeededRng(MUSIC_SEEDS[k]);
      for (let i = 0; i < 8; i++) expect(a.next(), k).toBe(b.next());
    }
  });
  it.each(MUSIC_FILES)('%s: Math.random なし・new SeededRng( の種は SFX_SEED_MUSIC_* だけ（効果音の種を借りない）', (f) => {
    const s = readFileSync(f, 'utf8').replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
    expect(s).not.toMatch(/Math\.random/);
    for (const m of s.matchAll(/new SeededRng\(([^)]*)\)/g)) expect(m[1]!.trim(), f).toMatch(/^SFX_SEED_MUSIC_[A-Z0-9]+$/);
  });
  it('config/sfx-music-config は何も import しない', () => {
    expect(readFileSync('src/config/sfx-music-config.ts', 'utf8')).not.toMatch(/^\s*import\s/m);
  });
});

describe('音量・下げ・段・命中スロー・移り・予算の表（spec §2〜§6）', () => {
  it('出口の RMS の目標（§3.4）と許し・段の重さ（§3.6）・鍵ごとの音量はそろっていて 0 < g ≤ 1', () => {
    expect(MUSIC_TARGET_DBFS).toEqual({ menu: -24, quiet: -33, tense: -30, battle: -27 });
    expect(mc.MUSIC_LEVEL_TOLERANCE_DB).toBe(1.5);
    expect(MUSIC_MOOD_WEIGHTS).toEqual([[1, 0, 0], [0.8, 1, 0], [0.6, 0.8, 1]]);
    expect([mc.MUSIC_MOOD_QUIET, mc.MUSIC_MOOD_TENSE, mc.MUSIC_MOOD_BATTLE]).toEqual([0, 1, 2]);
    expect(Object.keys(MUSIC_GAIN).sort()).toEqual([...MUSIC_KEYS].sort());
    for (const k of MUSIC_KEYS) expect(MUSIC_GAIN[k] > 0 && MUSIC_GAIN[k] <= 1, k).toBe(true);
  });
  it('下げる表（§4.6）: 鍵は SFX_KEYS にある・警報 −8 dB 0.8 秒（U-M1）・鐘 −6・魚雷の命中 −5・近い大きい爆発 −4（帯 1 まで）・探照灯 −4（設計の既定）・下げ方', () => {
    for (const k of Object.keys(SFX_MUSIC_DUCK)) expect(SFX_KEYS as readonly string[], k).toContain(k);
    expect(SFX_MUSIC_DUCK).toEqual({
      alarm: { db: -8, holdS: 0.8 }, bell: { db: -6, holdS: 1.2 }, torp_hit: { db: -5, holdS: 0.8 }, blast_l: { db: -4, holdS: 0.5, maxBand: 1 }, light_on: { db: -4, holdS: 0.5 },
    });
    expect(mc.SFX_MUSIC_DUCK_SHAPE).toEqual({ downTcS: 0.03, upS: 0.25, reworkWindowS: 0.5, reworkMax: 2 });
    for (const d of Object.values(SFX_MUSIC_DUCK)) expect(d.db < 0 && d.holdS > 0).toBe(true);
  });
  it('任務の段の間（§5.2）と場面（D8）・移りの秒（§3.4・§4.2・D10）・音源の上限（§4.2）・保存の鍵（D7。音の鍵と別）', () => {
    expect(mc.SFX_MUSIC_MOOD).toEqual({ updateHz: 10, riseTcBattleS: 0.6, riseTcTenseS: 1.5, holdBattleS: 6, holdTenseS: 8, fallBattleS: 3, fallTenseS: 4, sinkFadeS: 2.5, maxChangesPerMin: 6, hitMinDropHp: 0.5 });
    expect(mc.MUSIC_MOOD_SINK).toBe(MUSIC_MOOD_WEIGHTS.length); // v0.7.2 S2: 沈み始めは段の重さの表の外（3 層とも 0）
    expect(new Set([mc.MUSIC_CTX_NONE, mc.MUSIC_CTX_MENU, mc.MUSIC_CTX_MISSION, mc.MUSIC_CTX_LAB]).size).toBe(4);
    expect(mc.MUSIC_FADE).toEqual({
      firstInS: 2, menuInS: 2, menuOutS: 1.2, missionInS: 3, missionOutS: 0.5, resultReturnedDelayS: 2.2, resultLostDelayS: 3.0, pauseS: 0.15, musicOffS: 0.3, muteStopS: 0.15, labCrossS: 0.5, hastyStopS: 0.03,
    });
    expect(mc.MUSIC_MAX_SOURCES).toBe(6);
    expect(mc.MUSIC_STORAGE_KEY).toBe('night-hunters.music');
    expect(mc.MUSIC_STORAGE_KEY).not.toBe(SFX_STORAGE_KEY);
  });
  it('命中スローの案（§6.2）: A 低く遅く（1,100 Hz・ループ ×0.8・曲 ×0.85）・B 低くだけ・C なし。ループの rate はエンジンの最小 × 0.8 でも 0.5 以上（L6）', () => {
    expect([...SFX_SLOW_IDS]).toEqual(['A', 'B', 'C']);
    expect(SFX_SLOW).toEqual({ A: { filterHz: 1100, loopRate: 0.8, musicRate: 0.85 }, B: { filterHz: 1100, loopRate: 1, musicRate: 1 }, C: { filterHz: 20000, loopRate: 1, musicRate: 1 } });
    expect(mc.SFX_SLOW_SHAPE).toEqual({ idleHz: 20000, filterTcS: 0.04, rateTcS: 0.06, endTcS: 0.25 });
    expect(SFX_LOOP_ENGINE.rateBase * (1 - SFX_LOOP_ENGINE.stageWobble[2]) * SFX_SLOW.A.loopRate).toBeGreaterThanOrEqual(SFX_LOOP_RATE_MIN);
  });
  it('作る予算（§2）: 1 フレーム 150,000 単位・波形表 1 声＝1・金管＝2・FM＝3・雑音＝2・JIT の初回の上限', () => {
    expect(mc.MUSIC_BUILD_BUDGET).toBe(150_000);
    expect(mc.MUSIC_COST).toMatchObject({ tone: 1, toneMix: 2, fm: 3, noise: 2 });
    expect(mc.MUSIC_BUILD_MIN_BUDGET).toBe(2048 * mc.MUSIC_COST.tablePoint);
    expect(mc.MUSIC_BUILD_WARM.perCall * mc.MUSIC_COST.fm).toBeLessThanOrEqual(mc.MUSIC_BUILD_BUDGET);
  });
});
