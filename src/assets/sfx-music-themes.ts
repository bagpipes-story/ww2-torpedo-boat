// v0.7.2 S0（アートと音③：BGM と命中スローの音。spec-v0720 §3.5・§3.6）: タイトルの曲の候補 A・B・C と任務の曲の家族 L0・L1・L2 の表（作曲器 assets/sfx-music-compose の入力）。
// 旋律の音は書かない（和音の進行・リズムの型・音域・句の終わりの種類・動機の写しの位置だけ＝spec §3.1。旋律は種つきの歩き）。数は音色と曲の形の定数（聞かせ方）。
// - A 静かな夜の海: 4/4・63 BPM・8 小節（a → a′）・D エオリア（最後の和音だけ A）。パッド・鈴の動機（2 小節に 3〜5 音）・4 小節ごとのうねり。
// - B 小太鼓と金管の行進: 2/4・105 BPM・16 小節（A → A′）・B♭ 長調。小太鼓（16 分・句の終わりに連打）・明るい低音の「ずん・ちゃ」（裏の和音）・金管風の旋律（F4〜F5）。
// - C 1940 年代のラジオの哀愁: 4/4・70 BPM・8 小節（a → a′）・A 和声的短音階。弱音器の金管風の旋律（ビブラート 5.5 Hz）・弦のパッド・ブラシ（2・4 拍）・はじく低音。
//   全体を「ラジオ」に（帯 320〜3,200 Hz・柔らかい歪み・ぱちぱち 毎秒 6 回・揺れ ±0.25%＝assets/sfx-music-render）。
// - 任務（U-M1）: 4/4・90 BPM・E エオリア・Em C D Em Em C Am B7。L0 静か（暗いパッド・2 小節に 1 回の鈴・うねり）・L1 緊張（8 分のはじく音の刻み＝根音と 5 度・1・3 拍のトム・
//   小さい高い震え）・L2 戦闘（2 小節。16 分の小太鼓・トム・リム、E と B の金管の刻み＝1 拍・2 拍裏・4 拍）。3 層は同じ時刻に始めて音量だけを変える（L2 は 8 小節に 4 回）。
// 乱数は曲ごとの種 SFX_SEED_MUSIC_*（musicRng）。既定のタイトルの曲は MUSIC_TITLE_DEFAULT_ID（§11 O1: 試聴で選ぶまで A）。
import { SFX_SEED_MUSIC_A, SFX_SEED_MUSIC_B, SFX_SEED_MUSIC_C, SFX_SEED_MUSIC_L0, SFX_SEED_MUSIC_L1, SFX_SEED_MUSIC_L2, type MusicKey } from '../config/sfx-music-config';
import { SeededRng } from '../core/rng';
import type { MusicPart, MusicTheme } from './sfx-music-compose';

/** 既定のタイトルの曲（設計の既定＝§11 O1。試聴の場の「（今）」の印。ユーザーが選んだらここを変える） */
export const MUSIC_TITLE_DEFAULT_ID: MusicKey = 'title_a';

/** 任務の家族の共通（E エオリア・90 BPM・8 小節） */
const MISSION = { bpm: 90, beats: 4, bars: 8, tonic: 4, mode: 'aeolian', chords: ['Em', 'C', 'D', 'Em', 'Em', 'C', 'Am', 'B7'] } as const;
const SWELL_4: MusicPart = { inst: 'swell', pitch: 'none', low: 0, high: 0, vel: 1, every: 4, rhythms: [[0, 64, 100]] };
const PAD_BAR = [[0, 16, 100]] as const;

export const MUSIC_THEMES: Readonly<Record<MusicKey, MusicTheme>> = {
  title_a: {
    key: 'title_a', bpm: 63, beats: 4, bars: 8, tonic: 2, mode: 'aeolian', chords: ['Dm', 'Bb', 'F', 'C', 'Dm', 'Bb', 'Gm', 'A'],
    melody: {
      inst: 'bell', low: 74, high: 86, vel: 1, span: 2, legato: 1, decayS: [0.9, 1.8],
      rhythms: [
        [0, 8, 100, 12, 4, 70, 16, 16, 90], [0, 6, 100, 6, 2, 60, 8, 8, 80, 16, 16, 90], [0, 4, 90, 4, 4, 70, 8, 8, 80, 24, 8, 70],
        [0, 12, 100, 12, 4, 60, 16, 8, 90, 24, 4, 60, 28, 4, 70], [4, 4, 80, 8, 8, 100, 16, 12, 90, 28, 4, 60],
      ],
      ends: [[0, 8, 100, 8, 8, 80, 16, 16, 90], [0, 4, 90, 4, 4, 70, 8, 8, 80, 16, 16, 100], [0, 12, 100, 12, 4, 70, 16, 16, 90]],
      cadences: [[4, 'half'], [8, 'end']], motifs: [[5, 1]],
    },
    parts: [
      { inst: 'pad', pitch: 'chord', low: 62, high: 76, vel: 0.5, voices: 3, cents: 3, rhythms: PAD_BAR },
      SWELL_4,
    ],
  },
  title_b: {
    key: 'title_b', bpm: 105, beats: 2, bars: 16, tonic: 10, mode: 'major',
    chords: ['Bb', 'F', 'Bb', 'Eb', 'Bb', 'F', 'Gm', 'F', 'Bb', 'Eb', 'Bb', 'Gm', 'Eb', 'F', 'F', 'Bb'],
    melody: {
      inst: 'brass', low: 65, high: 77, vel: 1, span: 1, legato: 0.9,
      rhythms: [[0, 2, 100, 2, 2, 80, 4, 4, 90], [0, 3, 100, 3, 1, 70, 4, 4, 90], [0, 4, 100, 4, 2, 80, 6, 2, 80], [0, 2, 100, 2, 2, 80, 4, 2, 90, 6, 2, 80], [0, 6, 100, 6, 2, 70]],
      ends: [[0, 8, 100], [0, 2, 90, 2, 2, 80, 4, 4, 100], [0, 4, 90, 4, 4, 100]],
      cadences: [[4, 'rest'], [8, 'half'], [12, 'rest'], [16, 'end']], motifs: [[5, 1], [9, 1], [13, 5]],
    },
    parts: [
      {
        inst: 'snare', pitch: 'none', low: 0, high: 0, vel: 0.7, human: 0.08, fillEvery: 4,
        rhythms: [[0, 1, 100, 2, 1, 50, 3, 1, 60, 4, 1, 90, 6, 1, 55, 7, 1, 60], [0, 1, 100, 1, 1, 45, 2, 1, 60, 4, 1, 90, 5, 1, 45, 6, 1, 60], [0, 1, 100, 3, 1, 55, 4, 1, 85, 6, 1, 60, 7, 1, 70]],
        fill: [0, 1, 60, 1, 1, 65, 2, 1, 70, 3, 1, 75, 4, 1, 80, 5, 1, 85, 6, 1, 90, 7, 1, 100],
      },
      { inst: 'pluck', pitch: 'alt', low: 46, high: 58, vel: 0.8, rhythms: [[0, 2, 100, 4, 2, 85]] },
      { inst: 'pluck', pitch: 'chord', low: 58, high: 70, vel: 0.35, rhythms: [[2, 1, 80, 6, 1, 80]] },
    ],
  },
  title_c: {
    key: 'title_c', bpm: 70, beats: 4, bars: 8, tonic: 9, mode: 'harmonic', chords: ['Am', 'Dm', 'E7', 'Am', 'F', 'Dm', 'E7', 'Am'], radio: true, wow: [0.0025, 22],
    melody: {
      inst: 'mute', low: 64, high: 81, vel: 1, span: 1, legato: 0.92,
      rhythms: [[0, 6, 100, 6, 2, 70, 8, 8, 90], [0, 4, 90, 4, 4, 80, 8, 4, 100, 12, 4, 80], [0, 8, 100, 8, 2, 70, 10, 2, 75, 12, 4, 85], [2, 2, 80, 4, 4, 90, 8, 6, 100, 14, 2, 70], [0, 3, 90, 3, 1, 70, 4, 4, 85, 8, 8, 100]],
      ends: [[0, 4, 90, 4, 12, 100], [0, 8, 90, 8, 8, 100], [0, 16, 100]],
      cadences: [[4, 'half'], [8, 'end']], motifs: [[5, 1]],
    },
    parts: [
      { inst: 'pad', pitch: 'chord', low: 57, high: 72, vel: 0.4, voices: 3, cents: 3, rhythms: PAD_BAR },
      { inst: 'brush', pitch: 'none', low: 0, high: 0, vel: 0.6, human: 0.1, rhythms: [[4, 2, 100, 12, 2, 100], [4, 2, 100, 10, 1, 40, 12, 2, 100]] },
      { inst: 'pluck', pitch: 'alt', low: 45, high: 57, vel: 0.7, rhythms: [[0, 4, 100, 8, 4, 85]] },
      { inst: 'crackle', pitch: 'none', low: 0, high: 0, vel: 1, rhythms: [], rate: 6 },
    ],
  },
  mission_l0: {
    key: 'mission_l0', ...MISSION,
    melody: { inst: 'bell', low: 71, high: 83, vel: 0.7, span: 2, legato: 1, decayS: [1.2, 1.8], rhythms: [[0, 32, 100]], ends: [[0, 32, 100]], cadences: [[4, 'half'], [8, 'end']], motifs: [] },
    parts: [{ inst: 'padDark', pitch: 'chord', low: 64, high: 79, vel: 0.6, voices: 3, cents: 4, rhythms: PAD_BAR }, { ...SWELL_4, vel: 0.8 }],
  },
  mission_l1: {
    key: 'mission_l1', ...MISSION, melody: null, glue: true,
    parts: [
      { inst: 'pluck', pitch: 'alt', low: 64, high: 76, vel: 0.7, human: 0.08, rhythms: [[0, 2, 100, 2, 2, 70, 4, 2, 90, 6, 2, 70, 8, 2, 95, 10, 2, 70, 12, 2, 90, 14, 2, 75]] },
      { inst: 'tom', pitch: 'none', low: 0, high: 0, vel: 0.45, human: 0.05, rhythms: [[0, 2, 100, 8, 2, 85]] },
      {
        inst: 'shaker', pitch: 'none', low: 0, high: 0, vel: 0.4, human: 0.15,
        rhythms: [[0, 1, 100, 1, 1, 50, 2, 1, 70, 3, 1, 50, 4, 1, 90, 5, 1, 50, 6, 1, 70, 7, 1, 50, 8, 1, 100, 9, 1, 50, 10, 1, 70, 11, 1, 50, 12, 1, 90, 13, 1, 50, 14, 1, 70, 15, 1, 60]],
      },
    ],
  },
  mission_l2: {
    key: 'mission_l2', ...MISSION, bars: 2, chords: ['Em', 'Em'], melody: null, glue: true,
    parts: [
      {
        inst: 'snare', pitch: 'none', low: 0, high: 0, vel: 0.75, human: 0.1, fillEvery: 2,
        rhythms: [[0, 1, 100, 1, 1, 40, 2, 1, 55, 3, 1, 40, 4, 1, 90, 5, 1, 40, 6, 1, 55, 7, 1, 45, 8, 1, 100, 9, 1, 40, 10, 1, 55, 11, 1, 40, 12, 1, 90, 13, 1, 45, 14, 1, 60, 15, 1, 50]],
        fill: [0, 1, 100, 2, 1, 55, 4, 1, 90, 6, 1, 55, 8, 1, 70, 9, 1, 75, 10, 1, 80, 11, 1, 85, 12, 1, 90, 13, 1, 95, 14, 1, 100, 15, 1, 100],
      },
      { inst: 'tom', pitch: 'none', low: 0, high: 0, vel: 0.5, human: 0.05, rhythms: [[0, 2, 100, 6, 2, 80, 10, 2, 85], [0, 2, 100, 10, 2, 85, 14, 2, 70]] },
      { inst: 'rim', pitch: 'none', low: 0, high: 0, vel: 0.6, rhythms: [[4, 1, 100, 12, 1, 100]] },
      { inst: 'brass', pitch: 'pedal', low: 64, high: 76, vel: 0.28, pcs: [4, 11], rhythms: [[0, 2, 100, 6, 2, 85, 12, 2, 95]] },
    ],
  },
};

/** 曲の作曲の乱数（種は曲ごとの SFX_SEED_MUSIC_*。ゲームの乱数とは別＝引く回数を変えない） */
export function musicRng(key: MusicKey): SeededRng {
  switch (key) {
    case 'title_a': return new SeededRng(SFX_SEED_MUSIC_A);
    case 'title_b': return new SeededRng(SFX_SEED_MUSIC_B);
    case 'title_c': return new SeededRng(SFX_SEED_MUSIC_C);
    case 'mission_l0': return new SeededRng(SFX_SEED_MUSIC_L0);
    case 'mission_l1': return new SeededRng(SFX_SEED_MUSIC_L1);
    case 'mission_l2': return new SeededRng(SFX_SEED_MUSIC_L2);
  }
}
/** 曲の種（tests・scripts の確かめ用。musicRng と同じ数） */
export const MUSIC_SEEDS: Readonly<Record<MusicKey, number>> = {
  title_a: SFX_SEED_MUSIC_A, title_b: SFX_SEED_MUSIC_B, title_c: SFX_SEED_MUSIC_C, mission_l0: SFX_SEED_MUSIC_L0, mission_l1: SFX_SEED_MUSIC_L1, mission_l2: SFX_SEED_MUSIC_L2,
};
