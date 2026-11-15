// v0.7.2 S0（アートと音③：BGM と命中スローの音。spec-v0720 §3.5・§3.6）: タイトルの曲と任務の曲の家族 L0・L1・L2 の表（作曲器 assets/sfx-music-compose の入力）。
// 旋律の音は書かない（和音の進行・リズムの型・音域・句の終わりの種類・動機の計画の役だけ＝spec §3.1。旋律は種つきの歩きと写し）。数は音色と曲の形の定数（聞かせ方）。
// v0.7.2 IP1（実機 1 回目。ユーザー「…もっとアップテンポでもいいかと思います。軍艦マーチくらいの。…B はファミコンの RPG みたいでださいです。また、緊張と戦闘の音楽はおなじでは？」）で
// B・C を消して 126 BPM の D・E を足し、緊張と戦闘を作り直した（速さだけを参考にし、知っている曲はまねない）。
// v0.7.2 IP2（実機 2 回目。ユーザー「タイトルはDでいきます。Dをさらに名曲となるようにリメイクしてください。命中スローはAでいいです。」）: D をタイトルの曲に決め、作り直した。
// A・E は消した（ユーザーの決め）。IP1 の D は試聴の場の聞き比べ「D（前）」（鍵 title_d_prev）に残したが、S4（実機 3 回目「OKです。進めてください」）で消した
// （試験の材料の写しは tests/sfx-music-kit の PREV_THEME＝作曲器の 1 小節 1 和音のタイトルの道が変わらない証）。
// - D（IP2。鍵 title_d）: 4/4・126 BPM・16 小節（30.48 秒）・D エオリア（属和音は長調）。4 小節ずつの歌の形 a（1〜4。言い出し・半終止）→ a′（5〜8。答え・閉じる）→
//   b（9〜12。F の明るさへ上がる移し・E7 → A で張る）→ a″（13〜16。動機が 3 度上で戻って山・いちばん強い終止の後に Asus4 → A で 1 小節目へ戻る）。
//   和音: Dm｜B♭｜F｜C A｜Dm｜B♭｜Gm A7｜Dm｜F｜Gm｜B♭ E7/G#｜A｜Dm｜B♭｜Gm A7｜Dm Dm Asus4 A（IP1 の D の Dm B♭ F C／Dm B♭ Gm A を残した）。
//   旋律は動機の計画（assets/sfx-music-plan）: 2 小節の動機（リズムと形を種で）・5〜6 小節目はそのまま・9〜11 小節目は動機の頭の上がる移しと断片・13〜14 小節目は 3 度上で戻る＝山
//   （一番高い音は 1 回）・句の終わりは長い音（4・12 小節目は 5 度か 2 度・8 小節目は主音か 3 度・16 小節目は主音）。種は 400 個の種の点の一番高い種（assets/sfx-music-score）。
//   伴奏（assets/sfx-music-arrange）: 温かい金管の旋律（2 声）・動く低音（弓の 8 分の刻み。経過音で和音の間をつなぐ）・和音のパッド・対旋律の弦（a′・b・a″。旋律と反行・長い音）・
//   行進の小太鼓（句の終わりの連打・11〜12 小節目はだんだん強く連打）・1・3 拍のティンパニ風の打ち（12 小節目は 13 小節目への連打）・13 小節目の頭のやわらかいシンバル・部屋の響き。
//   強弱の弧: a は mp・a′ は mf・b はだんだん強く・a″ は ff で 16 小節目で落ち着いて輪の頭へ。
// - 任務（U-M1）: 4/4・90 BPM・E エオリア・Em C D Em Em C Am B7。L0 静か（暗いパッド・2 小節に 1 回の鈴・うねり）。IP1 で緊張と戦闘をはっきり分けた:
//   L1 緊張＝まばら（2 分音符ごとの心音の「ドクン」・高い B のトレモロ・4 拍目の 2 音の刻み＝根音と 5 度。16 分の震えは消した）、
//   L2 戦闘＝走る（2 小節。拍ごとのティンパニ風の打ち・裏拍に強い 16 分の小太鼓と 2 小節目の連打・E と B の金管の切れた刻み・16 分の低い弓の刻み）。3 層は同じ時刻に始めて音量だけを変える（L2 は 8 小節に 4 回）。
// 乱数は曲ごとの種 SFX_SEED_MUSIC_*（musicRng）。タイトルの曲は MUSIC_TITLE_DEFAULT_ID（IP2: ユーザーの決めで D）。
import { SFX_SEED_MUSIC_D, SFX_SEED_MUSIC_L0, SFX_SEED_MUSIC_L1, SFX_SEED_MUSIC_L2, type MusicKey } from '../config/sfx-music-config';
import { SeededRng } from '../core/rng';
import type { MusicArrange, MusicPart, MusicPlan, MusicRhythm, MusicTheme } from './sfx-music-compose';

/** タイトルの曲（v0.7.2 IP2: ユーザーの決め U-M2「タイトルはDでいきます」＝作り直した D。試聴の場の「（今）」の印） */
export const MUSIC_TITLE_DEFAULT_ID: MusicKey = 'title_d';

/** 任務の家族の共通（E エオリア・90 BPM・8 小節） */
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

/**
 * IP2 の D の動機の計画: 小節ごとの役（a: 動機・続き・半終止 ／ a′: 動機・続き・閉じる ／ b: 移し・上の移し・断片・半終止 ／ a″: 3 度上の動機・続き・最後）と役ごとのリズムの候補
 * （16 分の [位置, 長さ, 強さ %]。種で 1 つずつ選ぶ）。動機の始まりは主音・3 度・5 度・b の移しは 2 段（F の和音へ）か 1 段・a″ は 2 段（3 度）上
 */
const D_PLAN: MusicPlan = {
  roles: ['m1', 'm2', 'link', 'half', 'm1', 'm2', 'link', 'closed', 'seq', 'seq2', 'frag', 'half', 'top1', 'top2', 'link', 'final'],
  heads: [
    [0, 4, 100, 4, 3, 85, 7, 1, 70, 8, 8, 95], [0, 6, 100, 6, 2, 75, 8, 4, 90, 12, 4, 80], [0, 3, 100, 3, 1, 70, 4, 4, 90, 8, 3, 95, 11, 1, 70, 12, 4, 85],
    [0, 4, 100, 4, 2, 80, 6, 2, 75, 8, 6, 95, 14, 2, 75], [0, 8, 100, 8, 3, 85, 11, 1, 70, 12, 4, 90],
  ],
  tails: [[0, 4, 95, 4, 4, 85, 8, 8, 90], [0, 6, 95, 6, 2, 75, 8, 8, 90], [0, 3, 95, 3, 1, 70, 4, 4, 85, 8, 8, 90], [0, 12, 95, 12, 4, 80], [0, 8, 95, 8, 4, 85, 12, 4, 80]],
  links: [
    [0, 2, 90, 2, 2, 75, 4, 2, 85, 6, 2, 75, 8, 4, 90, 12, 4, 80], [0, 4, 95, 4, 2, 80, 6, 2, 75, 8, 2, 90, 10, 2, 75, 12, 4, 85],
    [0, 3, 95, 3, 1, 70, 4, 3, 90, 7, 1, 70, 8, 4, 90, 12, 4, 80], [0, 6, 95, 6, 2, 75, 8, 2, 85, 10, 2, 75, 12, 4, 85],
  ],
  halfs: [[0, 12, 100, 12, 2, 70, 14, 2, 80], [0, 4, 90, 4, 4, 85, 8, 8, 100], [0, 8, 100, 8, 4, 80, 12, 4, 85]],
  closes: [[0, 12, 100, 12, 4, 80], [0, 8, 100, 8, 4, 75, 12, 4, 85]],
  finals: [[0, 12, 100, 12, 4, 85]],
  starts: [0, 2, 4], seqShift: [2, 1, 0, -1, -2], topShift: 2,
};
/** IP2 の D の小太鼓の型（0・1 行進・2 句の終わりの連打・3 だんだん強く・4 1 小節の連打・5 輪の頭への軽い連打）とティンパニ風の打ち（0 1・3 拍・1 次の小節への連打） */
const D_SNARE: readonly MusicRhythm[] = [
  ...MARCH_4, [0, 1, 100, 2, 1, 45, 4, 1, 80, 6, 1, 50, ...roll(8, 16, 40, 100)], [0, 1, 100, 2, 1, 50, 4, 1, 85, 6, 1, 55, 8, 1, 90, 10, 1, 60, ...roll(12, 16, 50, 100)],
  roll(0, 16, 30, 100), [0, 1, 90, 4, 1, 70, 8, 1, 85, 10, 1, 50, 12, 1, 70, 13, 1, 55, 14, 1, 75, 15, 1, 60],
];
const D_BOOM: readonly MusicRhythm[] = [[0, 4, 100, 8, 4, 80], [0, 4, 100, 8, 4, 80, 12, 1, 60, 13, 1, 70, 14, 1, 85, 15, 1, 100]];
/**
 * IP2 の D の伴奏の計画: 小節ごとの強さ（a mp 0.74 → a′ mf 0.86 → b 0.84〜1.0 → a″ ff 1.1 → 16 小節目 0.9）・動く低音（弓 2 声・A3〜A4＝基音 220 Hz 以上）・パッド・
 * 対旋律（弦 2 声・5〜16 小節）・小太鼓（4・8 小節目は連打・11 小節目はだんだん強く・12 小節目は 1 小節の連打・16 小節目は軽い連打）・打ち（12 小節目は 13 小節目への連打）・13 小節目のシンバル
 */
const D_ARRANGE: MusicArrange = {
  dyn: [0.74, 0.74, 0.76, 0.8, 0.86, 0.86, 0.88, 0.9, 0.84, 0.88, 0.94, 1, 1.1, 1.08, 1.04, 0.9],
  bass: { inst: 'bowed', range: [56, 69], vel: 0.55, voices: 2, cents: 7, human: 0.06, accents: [100, 55, 80, 55, 95, 55, 80, 60] },
  pad: { inst: 'pad', range: [57, 71], vel: 0.4 },
  counter: { inst: 'strings', range: [62, 76], vel: 0.42, voices: 2, cents: 8, bars: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16] },
  snare: { vel: 0.4, human: 0.08, cells: D_SNARE, plan: [-1, -1, -1, 2, -1, -1, -1, 2, -1, -1, 3, 4, -1, -1, -1, 5] },
  boom: { vel: 0.7, human: 0.05, cells: D_BOOM, plan: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0] },
  crash: { vel: 0.5, bars: [13] },
};

export const MUSIC_THEMES: Readonly<Record<MusicKey, MusicTheme>> = {
  title_d: {
    key: 'title_d', bpm: 126, beats: 4, bars: 16, tonic: 2, mode: 'aeolian', room: [0.16, 1.0],
    chords: ['Dm', 'Bb', 'F', 'C A', 'Dm', 'Bb', 'Gm A7', 'Dm', 'F', 'Gm', 'Bb E7/G#', 'A', 'Dm', 'Bb', 'Gm A7', 'Dm Dm Asus4 A'],
    melody: {
      inst: 'horn', low: 64, high: 82, vel: 1, span: 1, legato: 0.88, voices: 2, cents: 6, rhythms: [], ends: [], motifs: [],
      cadences: [[4, 'half'], [8, 'closed'], [12, 'half'], [16, 'end']], plan: D_PLAN,
    },
    parts: [], arrange: D_ARRANGE,
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
    case 'title_d': return new SeededRng(SFX_SEED_MUSIC_D);
    case 'mission_l0': return new SeededRng(SFX_SEED_MUSIC_L0);
    case 'mission_l1': return new SeededRng(SFX_SEED_MUSIC_L1);
    case 'mission_l2': return new SeededRng(SFX_SEED_MUSIC_L2);
  }
}
/** 曲の種（tests・scripts の確かめ用。musicRng と同じ数） */
export const MUSIC_SEEDS: Readonly<Record<MusicKey, number>> = {
  title_d: SFX_SEED_MUSIC_D, mission_l0: SFX_SEED_MUSIC_L0, mission_l1: SFX_SEED_MUSIC_L1, mission_l2: SFX_SEED_MUSIC_L2,
};
