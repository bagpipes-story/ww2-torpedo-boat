// v0.7.2 S0（アートと音③：BGM と命中スローの音。spec-v0720 §1〜§6・§13）の曲の定数。曲の鍵・速さ・長さ・音量・下げ（ducking）・任務の段の間・命中スローの案・
// 作る予算・常駐の上限・音だけの種は「聞かせ方」の定数で、ゲームの強さの値ではない（config/sfx-config と同じ考え。論理に効く値は data/*.json のまま）。何も import しない。
// ユーザーの決め U-M1（2026-11-14「メニュー＋任務中も静かに（推奨）」）: Title・Briefing・Result に BGM、任務の中は小さい曲で、見つかったら緊張・撃たれたら戦闘の曲に変わる。
// 警報の合図が鳴る時は曲を下げる。「曲: オン／オフ」は「音」と別。曲の標本は assets/sfx-music-*（作曲は音符・合成は音符を数フレームに分けて 1 本の標本へ描く＝方式 (a)）。
// S0 はゲームのどこからも import されない（鳴らない＝束はバイトで同じ）。再生（systems/sfx-music-player）は S1、任務の段は S2、命中スローは S3。

/** 標本の速さ（効果音と同じ 22,050 Hz・モノ。tests/sfx-music-inventory が SFX_SAMPLE_RATE と同じことを固定） */
export const MUSIC_SAMPLE_RATE = 22050;
/** 仕上げの頂（効果音と同じ 0.9。束と層の音量は下の MUSIC_GAIN で掛ける） */
export const MUSIC_PEAK = 0.9;

/** 曲の鍵（6 本＝タイトルの候補 A・B・C と任務の層 L0 静か・L1 緊張・L2 戦闘）。効果音の SFX_KEYS とは別の表（§13 L5。tests が重ならないことを固定） */
export const MUSIC_KEYS = ['title_a', 'title_b', 'title_c', 'mission_l0', 'mission_l1', 'mission_l2'] as const;
export type MusicKey = (typeof MUSIC_KEYS)[number];
export const MUSIC_TITLE_KEYS: readonly MusicKey[] = ['title_a', 'title_b', 'title_c'];
/** 任務の 3 層（同じ when で始めて音量だけを変える。L0・L1 は 8 小節、L2 は 2 小節＝8 小節を 4 回で割り切る） */
export const MUSIC_LAYER_KEYS: readonly MusicKey[] = ['mission_l0', 'mission_l1', 'mission_l2'];

/** 速さ（BPM）は 16 分音符が 22,050 Hz で整数の標本になる 7 つだけ（330,750 ÷ BPM＝継ぎ目と層の同期が標本の単位でぴったり。spec §2） */
export const MUSIC_BPMS = [63, 70, 75, 90, 98, 105, 126] as const;
export type MusicBpm = (typeof MUSIC_BPMS)[number];
/** 鍵ごとの長さ（標本＝小節 × 拍 × 4 × 16 分の標本。spec §3.5・§3.6）: A 63 BPM 4/4 8 小節・B 105 BPM 2/4 16 小節・C 70 BPM 4/4 8 小節・任務 90 BPM 4/4 */
export const MUSIC_LENGTHS: Readonly<Record<MusicKey, number>> = {
  title_a: 672_000, title_b: 403_200, title_c: 604_800, mission_l0: 470_400, mission_l1: 470_400, mission_l2: 117_600,
};

// 曲だけの乱数の種（作曲は new SeededRng(SFX_SEED_MUSIC_<鍵>) だけ。7601〜7699＝効果音 7501〜7531・7599、絵の ART_SEED_*（70xx〜74xx）と重ねない）。
// 値は scripts/sfx-music.ts が「§3.1・§3.2 の決まりを全部通る最初の種」を鍵の順に（前の鍵の種の次から）探して決めた（ゲームの中では探さない）
export const SFX_SEED_MUSIC_A = 7603;
export const SFX_SEED_MUSIC_B = 7619;
export const SFX_SEED_MUSIC_C = 7621;
export const SFX_SEED_MUSIC_L0 = 7622;
export const SFX_SEED_MUSIC_L1 = 7623;
export const SFX_SEED_MUSIC_L2 = 7624;
/** 打楽器・うねり・ぱちぱちの雑音の表（32,768 標本を 1 回だけ作って使い回す） */
export const SFX_SEED_MUSIC_NOISE = 7699;

/** 出口（master の後）の RMS の目標（dBFS。spec §3.4）: メニュー −24（UI の音の頂 約 −10 dBFS の 14 dB 下）・任務の静か −33・緊張 −30・戦闘 −27（巡航のエンジン 約 −31 の下〜近く） */
export const MUSIC_TARGET_DBFS = { menu: -24, quiet: -33, tense: -30, battle: -27 } as const;
/** 目標からのずれの許し（± dB。tests/sfx-music-render が固定） */
export const MUSIC_LEVEL_TOLERANCE_DB = 1.5;
/** master の音量（config/sfx-config の SFX_MASTER_GAIN と同じ 0.8。tests が同じことを固定） */
export const MUSIC_MASTER_GAIN = 0.8;
/**
 * 鍵ごとの音量（頂 0.9 の標本に掛ける。曲の束は 1）＝ 目標 ÷（標本の RMS × master 0.8）。タイトルの候補はどれもメニューの目標、任務の層は段ごとの重ね
 * （MUSIC_MOOD_WEIGHTS）で静か・緊張・戦闘の目標になる数。scripts/sfx-music.ts が今の標本から出した数（標本を作り直したら出し直す）
 */
export const MUSIC_GAIN: Readonly<Record<MusicKey, number>> = {
  title_a: 0.411, title_b: 0.399, title_c: 0.622, mission_l0: 0.152, mission_l1: 0.232, mission_l2: 0.268,
};

/** 任務の段（S2 の core/sfx-music-mood）: 0 静か・1 緊張（見つかった）・2 戦闘（撃たれている） */
export const MUSIC_MOOD_QUIET = 0;
export const MUSIC_MOOD_TENSE = 1;
export const MUSIC_MOOD_BATTLE = 2;
/** 段ごとの層の音量（L0, L1, L2。spec §3.6）: 静か (1, 0, 0)・緊張 (0.8, 1, 0)・戦闘 (0.6, 0.8, 1) */
export const MUSIC_MOOD_WEIGHTS: readonly (readonly [number, number, number])[] = [[1, 0, 0], [0.8, 1, 0], [0.6, 0.8, 1]];
/**
 * 段の間（spec §5.2。時計はゲームの時計＝一時停止の間は進まない）: 上がるのは次の 10 Hz で（戦闘は時定数 0.6 秒・緊張 1.5 秒）。下がるのは最後の信号から
 * 戦闘 6 秒・緊張 8 秒の後（探照灯の往復・見え隠れでぱたぱたしない）、戦闘 → 緊張は 3 秒・緊張 → 静かは 4 秒で。沈み始めは 2.5 秒で 0。1 分の移りは 6 回まで（probe の門）
 */
export const SFX_MUSIC_MOOD = {
  updateHz: 10, riseTcBattleS: 0.6, riseTcTenseS: 1.5, holdBattleS: 6, holdTenseS: 8, fallBattleS: 3, fallTenseS: 4, sinkFadeS: 2.5, maxChangesPerMin: 6,
} as const;

/** 曲の場面（S1 の systems/sfx-music-player が頼まれる場面。D8）: なし・メニュー（Title・Briefing・Result）・任務・試聴の場 */
export const MUSIC_CTX_NONE = 0;
export const MUSIC_CTX_MENU = 1;
export const MUSIC_CTX_MISSION = 2;
export const MUSIC_CTX_LAB = 3;
/**
 * 移りの秒（spec §3.4・§4.2・§4.3・D10）: 曲の最初の音は 2 秒で上げる（イヤホンで驚かせない）・メニューは 2 秒で上げて 1.2 秒で下げる・任務の L0 は 3 秒で上げる・任務の終わりは 0.5 秒・
 * Result は鐘の後（帰投 2.2 秒・それ以外 3.0 秒）にタイトルの曲を頭から・一時停止は 0.15 秒・「曲: オフ」は 0.3 秒・「音: オフ」は 0.15 秒の後に音源を止める・
 * 試聴の場の重ねは 0.5 秒・止めかけの組がある時にまた移れば 30 ms で止める
 */
export const MUSIC_FADE = {
  firstInS: 2, menuInS: 2, menuOutS: 1.2, missionInS: 3, missionOutS: 0.5, resultReturnedDelayS: 2.2, resultLostDelayS: 3.0,
  pauseS: 0.15, musicOffS: 0.3, muteStopS: 0.15, labCrossS: 0.5, hastyStopS: 0.03,
} as const;
/** 曲の音源の数の上限（落ち着いた時は 0・1・3、移りの最中も ≤ 6。spec §4.2） */
export const MUSIC_MAX_SOURCES = 6;
/** 曲のオン／オフの保存（localStorage の鍵。'0' でオフ・無い／読めなければオン＝D7。「音: オフ」の間は曲も鳴らない） */
export const MUSIC_STORAGE_KEY = 'night-hunters.music';

/**
 * 下げる（ducking。spec §4.6・D9）: 効果音の鍵 → 下げる dB と hold 秒。警報 alarm（発見・空襲の予告・識別の要求）の −8 dB・0.8 秒はユーザーの決め U-M1。
 * ほかは設計の既定（ユーザー未確認）: 鐘 −6・1.2 秒、魚雷の命中 −5・0.8 秒、近い大きい爆発（距離の帯 maxBand 以下）−4・0.5 秒、探照灯 −4・0.5 秒。鍵は SFX_KEYS にある（tests）
 */
export const SFX_MUSIC_DUCK: Readonly<Record<string, { readonly db: number; readonly holdS: number; readonly maxBand?: number }>> = {
  alarm: { db: -8, holdS: 0.8 },
  bell: { db: -6, holdS: 1.2 },
  torp_hit: { db: -5, holdS: 0.8 },
  blast_l: { db: -4, holdS: 0.5, maxBand: 1 },
  light_on: { db: -4, holdS: 0.5 },
};
/** 下げ方: 時定数 0.03 秒で下げ、hold の後に 0.25 秒で戻す。下げている間の次の合図は、深いか長い時だけ予約を直す（0.5 秒に 2 回まで）。メニューの UI の音では下げない */
export const SFX_MUSIC_DUCK_SHAPE = { downTcS: 0.03, upS: 0.25, reworkWindowS: 0.5, reworkMax: 2 } as const;

/**
 * 命中スローの音（spec §6.2。スローの論理と data は変えない＝U11。v0.7.1 D6 の「音程は変えない（v0.7.2 で決める）」をここで決める＝§11 O2）: 案ごとのベッド（ループ＋曲）の
 * 低域通過の Hz・ループの rate・曲の rate。単発（爆発・魚雷の命中）はどの案もそのまま。A（推し）低く遅く・B 低くだけ・C なし（v0.7.1 と同じ）
 */
export const SFX_SLOW_IDS = ['A', 'B', 'C'] as const;
export type SfxSlowId = (typeof SFX_SLOW_IDS)[number];
export const SFX_SLOW: Readonly<Record<SfxSlowId, { readonly filterHz: number; readonly loopRate: number; readonly musicRate: number }>> = {
  A: { filterHz: 1100, loopRate: 0.8, musicRate: 0.85 },
  B: { filterHz: 1100, loopRate: 1, musicRate: 1 },
  C: { filterHz: 20000, loopRate: 1, musicRate: 1 },
};
/** 既定の案（設計の既定＝§11 O2。試聴の場の「（今）」の印。ユーザーが選んだらここを変える） */
export const SFX_SLOW_DEFAULT_ID: SfxSlowId = 'A';
/** ベッドの濾波器: ふだん 20 kHz（22,050 Hz の標本では 0.3 dB 以下の差）・下げる時定数 0.04 秒・rate の時定数 0.06 秒・終わりは時定数 0.25 秒で戻す */
export const SFX_SLOW_SHAPE = { idleHz: 20000, filterTcS: 0.04, rateTcS: 0.06, endTcS: 0.25 } as const;

/**
 * 作る予算（spec §2・D4・R1）: 1 フレームに MUSIC_BUILD_BUDGET 単位まで。単位は「波形表の 1 声の 1 標本」＝1（node で約 8 ns）。金管（2 つの表の重ね）＝2、FM の鈴＝3、
 * 雑音の打楽器・うねり＝2、ラジオの濾波（C。2 次の濾波器 2 つの漸化式＝待ちが長い）＝3、0 で埋める・数える・掛ける一回り＝0.5／標本、波形表の 1 倍音の 1 点＝1（JIT の前の初回が遅いので重めに）、音符 1 つの用意（係数の exp・log）＝300。
 * 予算の内なら音符の途中でも区切る（状態を残して続きから書く＝分け方に依らずビット同一。tests/sfx-music-render）
 */
export const MUSIC_BUILD_BUDGET = 150_000;
export const MUSIC_COST = { tone: 1, toneMix: 2, fm: 3, noise: 2, fx: 3, pass: 0.5, tablePoint: 1, note: 300 } as const;
/** 予算がこれより小さいと進まないことがある（波形表の 1 倍音＝2,048 点 × 1＝2,048 単位） */
export const MUSIC_BUILD_MIN_BUDGET = 2048;
/**
 * JIT の初回（実測: ヘッドレスの Chromium と node で、書き方ごとに初めの 30〜60 万標本は標本 1 つ 150 → 30 → 15 ns と遅く、温まると 4〜6 ns。初めて回す 1 回の stepBuild が
 * 10〜24 ms＝温まった後の 10 倍。揺れ・ビブラートの枝を初めて通る時も）: 書き方ごとに初めの samples 標本は「冷えている」。1 回の stepBuild で冷えた書き方に使うのは perCall 標本まで
 * （段の一回り＝0 で埋める以外の数え・掛けは軽いので passShare 倍に数える）。分け方だけが変わる＝標本はビット同一（作り終えるのが少し遅れる）
 */
export const MUSIC_BUILD_WARM = { samples: 600_000, perCall: 20_000, passShare: 0.25 } as const;
/** 常駐の上限（標本）: ゲームの中は既定のタイトルの曲 1 本＋任務の家族 3 層 ≤ 180 万標本（7.2 MB。効果音 644,962 標本は別）。試聴の場はタイトル 3 本＋家族 ≤ 280 万（約 11 MB） */
export const MUSIC_MAX_RESIDENT_SAMPLES = 1_800_000;
export const MUSIC_LAB_MAX_SAMPLES = 2_800_000;
/** 作業用の配列（1 本を一番長い鍵の長さで 1 回だけ作って使い回す＝R2。作り終えたら写して捨ててよい） */
export const MUSIC_WORK_SAMPLES = 672_000;
