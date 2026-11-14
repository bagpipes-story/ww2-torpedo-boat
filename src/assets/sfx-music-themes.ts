// v0.7.2 S0（アートと音③：BGM と命中スローの音。spec-v0720 §3.5・§3.6）: タイトルの曲の候補と任務の曲の家族 L0・L1・L2 の表（作曲器 assets/sfx-music-compose の入力）。
// 旋律の音は書かない（和音の進行・リズムの型・音域・句の終わりの種類・動機の写しの位置だけ＝spec §3.1。旋律は種つきの歩き）。数は音色と曲の形の定数（聞かせ方）。
// - A 静かな夜の海: 4/4・63 BPM・8 小節（a → a′）・D エオリア（最後の和音だけ A）。パッド・鈴の動機（2 小節に 3〜5 音）・4 小節ごとのうねり。
// v0.7.2 IP1（実機 1 回目。ユーザー「タイトルの曲は A でもよいのですが、もっとアップテンポでもいいかと思います。軍艦マーチくらいの。ちなみに B はファミコンの RPG みたいでださいです。
// また、緊張と戦闘の音楽はおなじでは？」）: B・C を消し、126 BPM（120 に近い速さで 16 分が整数の標本になる唯一の速さ）の 2 案を足した。速さだけを参考にし、知っている曲はまねない。
// - D「A を行進の速さで」: 4/4・126 BPM・16 小節（A の進行を 2 回＝a → a′）・D エオリア。温かい金管の旋律（2 声 ±3 cent）・弓の 8 分の刻み（根音・基音 220 Hz 以上）・
//   行進の小太鼓（4 小節ごとに連打）・1・3 拍のティンパニ風の打ち・A のパッド・部屋の響き。
// - E「短調の勇ましい行進」: 2/4・126 BPM・16 小節・G 和声的短音階。付点の旋律（温かい金管 2 声）・拍の頭の低い金管（根音と 5 度）と裏拍のやわらかい和音・小太鼓（4 小節ごとに連打）・
//   句の頭のやわらかいシンバル・1 拍目の打ち・部屋の響き。
// - 任務（U-M1）: 4/4・90 BPM・E エオリア・Em C D Em Em C Am B7。L0 静か（暗いパッド・2 小節に 1 回の鈴・うねり）。IP1 で緊張と戦闘をはっきり分けた:
//   L1 緊張＝まばら（2 分音符ごとの心音の「ドクン」・高い B のトレモロ・4 拍目の 2 音の刻み＝根音と 5 度。16 分の震えは消した）、
//   L2 戦闘＝走る（2 小節。拍ごとのティンパニ風の打ち・裏拍に強い 16 分の小太鼓と 2 小節目の連打・E と B の金管の切れた刻み・16 分の低い弓の刻み）。3 層は同じ時刻に始めて音量だけを変える（L2 は 8 小節に 4 回）。
// 乱数は曲ごとの種 SFX_SEED_MUSIC_*（musicRng）。既定のタイトルの曲は MUSIC_TITLE_DEFAULT_ID（§11 O1: 試聴で選ぶまで A）。
import { SFX_SEED_MUSIC_A, SFX_SEED_MUSIC_D, SFX_SEED_MUSIC_E, SFX_SEED_MUSIC_L0, SFX_SEED_MUSIC_L1, SFX_SEED_MUSIC_L2, type MusicKey } from '../config/sfx-music-config';
import { SeededRng } from '../core/rng';
import type { MusicPart, MusicRhythm, MusicTheme } from './sfx-music-compose';

/** 既定のタイトルの曲（設計の既定＝§11 O1。試聴の場の「（今）」の印。ユーザーが選んだらここを変える） */
export const MUSIC_TITLE_DEFAULT_ID: MusicKey = 'title_a';

/** A の進行（D・E の表でも使う）・任務の家族の共通（E エオリア・90 BPM・8 小節） */
const A_CHORDS = ['Dm', 'Bb', 'F', 'C', 'Dm', 'Bb', 'Gm', 'A'] as const;
const MISSION = { bpm: 90, beats: 4, bars: 8, tonic: 4, mode: 'aeolian', chords: ['Em', 'C', 'D', 'Em', 'Em', 'C', 'Am', 'B7'] } as const;
const SWELL_4: MusicPart = { inst: 'swell', pitch: 'none', low: 0, high: 0, vel: 1, every: 4, rhythms: [[0, 64, 100]] };
const PAD_BAR = [[0, 16, 100]] as const;
const NONE = { pitch: 'none', low: 0, high: 0 } as const;
/** 32 分の連打（from の 16 分から to まで・強さ v0 → v1）＝小太鼓の句の終わり（作る時だけ） */
function roll(from: number, to: number, v0: number, v1: number): number[] {
  const out: number[] = [], k = (to - from) * 2;
  for (let i = 0; i < k; i++) out.push(from + i / 2, 0.5, Math.round(v0 + ((v1 - v0) * i) / Math.max(1, k - 1)));
  return out;
}
/** 16 分の並び（強さの並び。位置 0 から 1 ずつ・長さ 1） */
const sixteenths = (vels: readonly number[]): number[] => vels.flatMap((v, i) => [i, 1, v]);
const MARCH_4: readonly MusicRhythm[] = [[0, 1, 100, 2, 1, 45, 3, 1, 50, 4, 1, 80, 6, 1, 50, 8, 1, 95, 10, 1, 45, 11, 1, 50, 12, 1, 80, 14, 1, 50], [0, 1, 100, 3, 1, 55, 4, 1, 80, 6, 1, 50, 7, 1, 55, 8, 1, 95, 11, 1, 55, 12, 1, 80, 14, 1, 50, 15, 1, 55]];
const BATTLE_SN = [45, 35, 100, 40, 50, 35, 95, 45, 45, 35, 100, 40, 50, 40, 95, 55];

export const MUSIC_THEMES: Readonly<Record<MusicKey, MusicTheme>> = {
  title_a: {
    key: 'title_a', bpm: 63, beats: 4, bars: 8, tonic: 2, mode: 'aeolian', chords: A_CHORDS,
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
  title_d: {
    key: 'title_d', bpm: 126, beats: 4, bars: 16, tonic: 2, mode: 'aeolian', chords: [...A_CHORDS, ...A_CHORDS], room: [0.16, 1.0],
    melody: {
      inst: 'horn', low: 65, high: 79, vel: 1, span: 1, legato: 0.85, voices: 2, cents: 6,
      rhythms: [[0, 4, 100, 4, 4, 80, 8, 6, 90, 14, 2, 70], [0, 6, 100, 6, 2, 75, 8, 4, 90, 12, 4, 80], [0, 3, 100, 3, 1, 70, 4, 4, 85, 8, 8, 95], [0, 4, 100, 4, 2, 75, 6, 2, 75, 8, 4, 90, 12, 4, 80], [0, 8, 100, 8, 3, 85, 11, 1, 70, 12, 4, 90]],
      ends: [[0, 4, 90, 4, 4, 80, 8, 8, 100], [0, 6, 95, 6, 2, 75, 8, 8, 100], [0, 16, 100]],
      cadences: [[4, 'half'], [8, 'end'], [12, 'half'], [16, 'end']], motifs: [[5, 1], [9, 1], [13, 5]],
    },
    parts: [
      { inst: 'pad', pitch: 'chord', low: 57, high: 71, vel: 0.4, voices: 2, cents: 4, rhythms: PAD_BAR },
      { inst: 'bowed', pitch: 'root', low: 57, high: 69, vel: 0.55, voices: 2, cents: 7, human: 0.06, rhythms: [[0, 1, 100, 2, 1, 55, 4, 1, 80, 6, 1, 55, 8, 1, 95, 10, 1, 55, 12, 1, 80, 14, 1, 60]] },
      { inst: 'snare', ...NONE, vel: 0.4, human: 0.08, fillEvery: 4, rhythms: MARCH_4, fill: [0, 1, 100, 2, 1, 45, 4, 1, 80, 6, 1, 50, ...roll(8, 16, 40, 100)] },
      { inst: 'boom', ...NONE, vel: 0.7, human: 0.05, rhythms: [[0, 4, 100, 8, 4, 80]] },
    ],
  },
  title_e: {
    key: 'title_e', bpm: 126, beats: 2, bars: 16, tonic: 7, mode: 'harmonic', room: [0.15, 0.9],
    chords: ['Gm', 'Gm', 'Cm', 'D', 'Gm', 'Eb', 'Cm', 'D', 'Gm', 'Gm', 'Cm', 'Cm', 'Eb', 'Cm', 'Gm', 'D'],
    melody: {
      inst: 'horn', low: 67, high: 81, vel: 1, span: 1, legato: 0.8, voices: 2, cents: 6,
      rhythms: [[0, 3, 100, 3, 1, 70, 4, 4, 90], [0, 3, 100, 3, 1, 70, 4, 3, 90, 7, 1, 70], [0, 2, 95, 2, 2, 80, 4, 3, 90, 7, 1, 70], [0, 4, 100, 4, 3, 85, 7, 1, 70], [0, 6, 100, 6, 2, 75]],
      ends: [[0, 8, 100], [0, 3, 90, 3, 1, 70, 4, 4, 100], [0, 4, 90, 4, 4, 100]],
      cadences: [[4, 'rest'], [8, 'half'], [12, 'rest'], [16, 'end']], motifs: [[5, 1], [9, 1], [13, 5]],
    },
    parts: [
      { inst: 'stab', pitch: 'alt', low: 53, high: 65, vel: 0.7, voices: 2, cents: 5, rhythms: [[0, 2, 100, 4, 2, 85]] },
      { inst: 'soft', pitch: 'chord', low: 62, high: 74, vel: 0.35, voices: 2, cents: 5, rhythms: [[2, 1, 100, 6, 1, 90]] },
      { inst: 'snare', ...NONE, vel: 0.5, human: 0.08, fillEvery: 4, rhythms: [[0, 1, 100, 2, 1, 45, 3, 1, 50, 4, 1, 85, 6, 1, 50], [0, 1, 100, 3, 1, 55, 4, 1, 85, 6, 1, 50, 7, 1, 55]], fill: [0, 1, 100, 2, 1, 50, ...roll(4, 8, 45, 100)] },
      { inst: 'crash', ...NONE, vel: 0.5, every: 4, rhythms: [[0, 8, 100]] },
      { inst: 'boom', ...NONE, vel: 0.55, human: 0.05, rhythms: [[0, 4, 100]] },
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
      { inst: 'boom', ...NONE, vel: 0.5, human: 0.04, rhythms: [[0, 1, 100, 1, 1, 55, 8, 1, 95, 9, 1, 50]] },
      { inst: 'trem', pitch: 'pedal', low: 79, high: 91, vel: 0.5, pcs: [11], every: 4, rhythms: [[0, 64, 100]] },
      { inst: 'bowed', pitch: 'alt', low: 64, high: 76, vel: 0.4, voices: 2, cents: 5, human: 0.06, rhythms: [[12, 1, 90, 14, 1, 100]] },
    ],
  },
  mission_l2: {
    key: 'mission_l2', ...MISSION, bars: 2, chords: ['Em', 'Em'], melody: null, glue: true,
    parts: [
      { inst: 'snare', ...NONE, vel: 1, human: 0.1, fillEvery: 2, rhythms: [sixteenths(BATTLE_SN)], fill: [...sixteenths(BATTLE_SN.slice(0, 8)), ...roll(8, 16, 50, 100)] },
      { inst: 'boom', ...NONE, vel: 0.85, human: 0.04, rhythms: [[0, 2, 100, 4, 2, 85, 8, 2, 95, 12, 2, 85]] },
      { inst: 'stab', pitch: 'pedal', low: 71, high: 83, vel: 0.5, pcs: [4, 11], rhythms: [[0, 1, 100, 3, 1, 85, 6, 1, 90, 8, 1, 95, 11, 1, 85, 14, 1, 90], [0, 1, 100, 3, 1, 85, 6, 2, 90, 10, 1, 85, 12, 1, 95, 14, 1, 90]] },
      { inst: 'bowed', pitch: 'pedal', low: 64, high: 76, vel: 0.25, pcs: [4], voices: 2, cents: 6, rhythms: [sixteenths([100, 50, 70, 50, 90, 50, 70, 50, 95, 50, 70, 50, 90, 50, 70, 55])] },
    ],
  },
};

/** 曲の作曲の乱数（種は曲ごとの SFX_SEED_MUSIC_*。ゲームの乱数とは別＝引く回数を変えない） */
export function musicRng(key: MusicKey): SeededRng {
  switch (key) {
    case 'title_a': return new SeededRng(SFX_SEED_MUSIC_A);
    case 'title_d': return new SeededRng(SFX_SEED_MUSIC_D);
    case 'title_e': return new SeededRng(SFX_SEED_MUSIC_E);
    case 'mission_l0': return new SeededRng(SFX_SEED_MUSIC_L0);
    case 'mission_l1': return new SeededRng(SFX_SEED_MUSIC_L1);
    case 'mission_l2': return new SeededRng(SFX_SEED_MUSIC_L2);
  }
}
/** 曲の種（tests・scripts の確かめ用。musicRng と同じ数） */
export const MUSIC_SEEDS: Readonly<Record<MusicKey, number>> = {
  title_a: SFX_SEED_MUSIC_A, title_d: SFX_SEED_MUSIC_D, title_e: SFX_SEED_MUSIC_E, mission_l0: SFX_SEED_MUSIC_L0, mission_l1: SFX_SEED_MUSIC_L1, mission_l2: SFX_SEED_MUSIC_L2,
};
