// v0.7.1（アートと音②：合成の効果音。spec-v0710 §2・§4〜§7・D1）の音の定数。音量・間引き・距離の帯・音の種は「聞かせ方」の定数で、ゲームの強さの値ではない
// ので data/*.json には置かない（config/*-art-config と同じ考え。論理に効く値は data のまま）。ユーザーの決め（v0.7.0 の U1。2026-11-07「コードで描く・鳴らす」）:
// 音のファイルは使わず、起動時に 1 回 assets/sfx-bank が合成する。何も import しない（tests・scripts が node の型検査で読める）。
// 表は 25 本ぶんそろえるが、合成の作り方があるのは段ごと（S0 は ui_tap・mg・blast_l、S2 で砲・水柱・爆発・沈没の 7 本。残りは S3〜S4。tests/sfx-inventory が段ごとに固定する）。
// 音量（gain）と最小間隔は S2 で probe の記録を mix した数から詰めた（scripts/headless/sfx-probe・scripts/sfx-mix。S5 で実機の耳で詰め直す）。届く帯は spec §6.2、秒は §4。

/** 合成と AudioBuffer の標本の速さ（Hz。古い WebKit の下限ちょうど。context の速さへは再生時に補われる＝spec §14 L5） */
export const SFX_SAMPLE_RATE = 22050;
/** 正規化の頂（どの標本もこの頂にそろえ、鍵ごとの音量 gain ≤ 1 を掛けて鳴らす＝R4） */
export const SFX_PEAK = 0.9;
/** 単発の両端の fade の秒（ぷつっという音を消す） */
export const SFX_EDGE_FADE_S = 0.002;
/** 標本の合計の上限（22,050 Hz で約 31.7 秒＝Float32 で約 2.8 MB。tests/sfx-inventory が固定） */
export const SFX_MAX_TOTAL_SAMPLES = 700_000;
/** 同時に鳴る単発の声の数（起動時に作って使い回す＝R1） */
export const SFX_VOICES = 16;

/** 音の鍵（25 本。単発 20・ループ 5）。足す・消すは下の表と tests/sfx-inventory と一緒に */
export const SFX_KEYS = [
  'mg', 'gun_near', 'gun_far', 'splash_s', 'splash_l', 'blast_s', 'blast_l', 'torp_hit', 'torp_launch', 'hull_hit',
  'alarm', 'light_on', 'flare_pop', 'bomb_fall', 'reload', 'smoke', 'ui_tap', 'bell', 'engine_cough', 'sink',
  'engine', 'sea', 'fire', 'rain', 'drone',
] as const;
export type SfxKey = (typeof SFX_KEYS)[number];

/** 系統（優先と RMS の帯の単位）: 合図・UI ／ 爆発・魚雷 ／ 砲 ／ 水柱 ／ ループ */
export type SfxFamily = 'ui' | 'cue' | 'blast' | 'gun' | 'splash' | 'loop';
/** 優先（大きいほど残る。声が満ちた時に自分より低い声だけを奪う＝合図・UI は奪われない。spec §7.3） */
export const SFX_PRIORITY_CUE = 3;
export const SFX_PRIORITY_BLAST = 2;
export const SFX_PRIORITY_GUN = 1;
export const SFX_PRIORITY_SPLASH = 0;

// 音だけの乱数の種（assets の合成は new SeededRng(SFX_SEED_<鍵>) だけを使う。ゲームの乱数の系列とは別＝引く回数を変えない。絵の ART_SEED_*（70xx〜74xx）とも重ねない）
export const SFX_SEED_MG = 7501;
export const SFX_SEED_GUN_NEAR = 7502;
export const SFX_SEED_GUN_FAR = 7503;
export const SFX_SEED_SPLASH_S = 7504;
export const SFX_SEED_SPLASH_L = 7505;
export const SFX_SEED_BLAST_S = 7506;
export const SFX_SEED_BLAST_L = 7507;
export const SFX_SEED_TORP_HIT = 7508;
export const SFX_SEED_TORP_LAUNCH = 7509;
export const SFX_SEED_HULL_HIT = 7510;
export const SFX_SEED_ALARM = 7511;
export const SFX_SEED_LIGHT_ON = 7512;
export const SFX_SEED_FLARE_POP = 7513;
export const SFX_SEED_BOMB_FALL = 7514;
export const SFX_SEED_RELOAD = 7515;
export const SFX_SEED_SMOKE = 7516;
export const SFX_SEED_UI_TAP = 7517;
export const SFX_SEED_BELL = 7518;
export const SFX_SEED_ENGINE_COUGH = 7519;
export const SFX_SEED_SINK = 7520;
export const SFX_SEED_ENGINE = 7521;
export const SFX_SEED_SEA = 7522;
export const SFX_SEED_FIRE = 7523;
export const SFX_SEED_RAIN = 7524;
export const SFX_SEED_DRONE = 7525;
/** 再生のたびの rate の揺れ（エンジンの乱数。合成の種とは別） */
export const SFX_SEED_PLAY = 7599;

/** 鍵ごとの表の 1 行 */
export interface SfxDef {
  /** 標本の長さ（秒。標本の数は round(秒 × SFX_SAMPLE_RATE)） */
  readonly seconds: number;
  /** 合成の乱数の種（SFX_SEED_<鍵>） */
  readonly seed: number;
  /** 鍵の音量（0〜1。頂 SFX_PEAK の標本に掛ける。距離の帯の音量はさらに掛かる） */
  readonly gain: number;
  /** 優先（SFX_PRIORITY_*） */
  readonly priority: number;
  /** 同じ鍵を続けて鳴らす最小間隔（ゲームの時計の秒。0 は間引かない＝合図は core/sfx-cues の冷却で間引く） */
  readonly minIntervalS: number;
  /** 届く一番遠い帯（SFX_BAND_MAX_M の添字。位置つきで鳴らす時だけ効く） */
  readonly reachBand: number;
  readonly family: SfxFamily;
  /** ループ（任務の間だけ鳴らし続ける 5 本。継ぎ目が合う標本） */
  readonly loop: boolean;
  /** 再生のたびの rate の揺れ（± この割合。機銃・小さい水柱が同じ音の連打に聞こえないように） */
  readonly rateJitter: number;
}

function def(seconds: number, seed: number, gain: number, priority: number, minIntervalS: number, reachBand: number, family: SfxFamily, rateJitter = 0): SfxDef {
  return { seconds, seed, gain, priority, minIntervalS, reachBand, family, loop: family === 'loop', rateJitter };
}

/** 距離の帯（spec §6.2。聞き手＝自艇からの距離 m の上限と、帯ごとの音量。最後の帯より遠い音は捨てる。比べるのは距離の 2 乗＝core/sfx-mix） */
export const SFX_BAND_MAX_M: readonly number[] = [400, 1500, 4000, 16000];
export const SFX_BAND_GAIN: readonly number[] = [1.0, 0.55, 0.3, 0.16];
/** 大砲はこの帯から遠雷（gun_far）、手前は gun_near（距離が音色で分かる） */
export const SFX_GUN_FAR_FROM_BAND = 2;
const FAR = 3;
const MID = 2;
const NEAR = 1;

/** 鍵 → 表（秒・種・音量・優先・最小間隔・届く帯・系統・rate の揺れ）。合図・UI・ループは位置なしで鳴らすので届く帯は一番遠い帯にしておく */
export const SFX_TABLE: Readonly<Record<SfxKey, SfxDef>> = {
  mg: def(0.12, SFX_SEED_MG, 0.4, SFX_PRIORITY_GUN, 0.07, MID, 'gun', 0.08),
  gun_near: def(0.6, SFX_SEED_GUN_NEAR, 0.7, SFX_PRIORITY_GUN, 0.2, FAR, 'gun'),
  gun_far: def(0.9, SFX_SEED_GUN_FAR, 0.8, SFX_PRIORITY_GUN, 0.25, FAR, 'gun'),
  splash_s: def(0.35, SFX_SEED_SPLASH_S, 0.3, SFX_PRIORITY_SPLASH, 0.08, NEAR, 'splash', 0.12),
  splash_l: def(0.8, SFX_SEED_SPLASH_L, 0.5, SFX_PRIORITY_SPLASH, 0.15, MID, 'splash'),
  blast_s: def(0.5, SFX_SEED_BLAST_S, 0.8, SFX_PRIORITY_BLAST, 0.1, FAR, 'blast'),
  blast_l: def(1.6, SFX_SEED_BLAST_L, 1.0, SFX_PRIORITY_BLAST, 0.2, FAR, 'blast'),
  torp_hit: def(2.2, SFX_SEED_TORP_HIT, 1.0, SFX_PRIORITY_BLAST, 0, FAR, 'blast'),
  torp_launch: def(0.7, SFX_SEED_TORP_LAUNCH, 0.6, SFX_PRIORITY_CUE, 0, FAR, 'cue'),
  hull_hit: def(0.3, SFX_SEED_HULL_HIT, 0.7, SFX_PRIORITY_CUE, 0, FAR, 'cue'),
  alarm: def(0.6, SFX_SEED_ALARM, 0.6, SFX_PRIORITY_CUE, 0, FAR, 'cue'),
  light_on: def(0.5, SFX_SEED_LIGHT_ON, 0.6, SFX_PRIORITY_CUE, 0, FAR, 'cue'),
  flare_pop: def(1.2, SFX_SEED_FLARE_POP, 0.5, SFX_PRIORITY_CUE, 0, FAR, 'cue'),
  bomb_fall: def(1.2, SFX_SEED_BOMB_FALL, 0.5, SFX_PRIORITY_CUE, 0, FAR, 'cue'),
  reload: def(0.35, SFX_SEED_RELOAD, 0.5, SFX_PRIORITY_CUE, 0, FAR, 'cue'),
  smoke: def(1.0, SFX_SEED_SMOKE, 0.45, SFX_PRIORITY_CUE, 0, FAR, 'cue'),
  ui_tap: def(0.06, SFX_SEED_UI_TAP, 0.5, SFX_PRIORITY_CUE, 0, FAR, 'ui'),
  bell: def(1.4, SFX_SEED_BELL, 0.6, SFX_PRIORITY_CUE, 0, FAR, 'cue'),
  engine_cough: def(0.8, SFX_SEED_ENGINE_COUGH, 0.7, SFX_PRIORITY_CUE, 0, FAR, 'cue'),
  sink: def(2.5, SFX_SEED_SINK, 0.6, SFX_PRIORITY_BLAST, 0, FAR, 'blast'),
  engine: def(1.0, SFX_SEED_ENGINE, 1, SFX_PRIORITY_CUE, 0, FAR, 'loop'),
  sea: def(4.0, SFX_SEED_SEA, 1, SFX_PRIORITY_CUE, 0, FAR, 'loop'),
  fire: def(2.0, SFX_SEED_FIRE, 1, SFX_PRIORITY_CUE, 0, FAR, 'loop'),
  rain: def(2.0, SFX_SEED_RAIN, 1, SFX_PRIORITY_CUE, 0, FAR, 'loop'),
  drone: def(1.5, SFX_SEED_DRONE, 1, SFX_PRIORITY_CUE, 0, FAR, 'loop'),
};

/** パン（spec §6.2）: clamp(dx / 画面の半幅 900 m, −1, 1) × 0.7。自艇から 30 m 以内は中央。ズームでは変えない */
export const SFX_PAN_HALF_WIDTH_M = 900;
export const SFX_PAN_MAX = 0.7;
export const SFX_PAN_CENTER_M = 30;

/** 束ねの後のリミッタ（DynamicsCompressor。spec §7.1）と master の音量。knee は spec に無い仮の値（WebAudio の既定 30 dB だと −25 dB から効き始めて全体が沈む） */
export const SFX_LIMITER = { thresholdDb: -10, ratio: 12, attackS: 0.003, releaseS: 0.25, kneeDb: 6 } as const;
export const SFX_MASTER_GAIN = 0.8;

// S1（鳴る縦切り。spec §7.2・§8・§11 の R11・§14 L1〜L4）: 再生のエンジン（systems/sfx-engine）と起動（systems/sfx-boot）の定数。どれも聞かせ方で、遊びには効かない
/** 最初に鳴る音の立ち上がり（R11「イヤホンで大きすぎる」）: 束ねの音量をこの割合から seconds 秒で 1 へ。0 からにしない（最初のタップの 0.06 秒の音が聞こえなくなる） */
export const SFX_FIRST_FADE = { fromShare: 0.3, seconds: 0.3 } as const;
/** S2（spec §3.1）: 沈没の段の 2 次の爆発（ExplosionFx.secondary）は blast_s を音量 0.7 倍で、blast_s が鳴ってから 0.3 秒の内は鳴らさない（2 隻が同時に沈んでも連打にしない） */
export const SFX_SECONDARY_BLAST = { gain: 0.7, minIntervalS: 0.3 } as const;
/** S2: 小艇（大発・米PT・僚艇）の沈没は sink をこの速さで（高く短く。艦は 1）。rate は 0.5〜2 の内＝L6 */
export const SFX_SINK_SMALL_RATE = 1.3;
/** S2（spec §7.4）: Boot の create で標本を作るのはこの鍵だけ（最初の Title のタップが鳴る）。残りは次のフレームから 1 フレームに 1 本ずつ（systems/sfx-boot。作り終わる前の音は鳴らさないだけ） */
export const SFX_BUILD_FIRST: readonly SfxKey[] = ['ui_tap'];
/** 消音は master の音量を 0 へ（context は止めない＝L4）。ぷつっと切れないようにこの時定数（秒）で絞る。解く時はすぐ戻す */
export const SFX_MUTE_TIME_CONSTANT_S = 0.015;
/** 最初のタップ: context がまだ動き出していない間に頼まれた UI の音は 1 つだけ覚え、この秒の内に動き出せば鳴らす（止まっている context には積まない＝R2。古くなれば捨てる） */
export const SFX_UI_PENDING_S = 0.5;
/**
 * 見張り（L3c）: context が running なのに再生の時計が実時間 frozenMs 進まなければ、止めてすぐ再開を 1 回（checkMs ごとに見る＝10 Hz。次は throttleMs の後）。
 * 1 回の見る間は capMs まで数える（裏から戻った最初の 1 回で誤って動かさない）。時計が進まないまま maxTries 回動かしたら、進むのを見るまでやめる（効かない再開を繰り返さない）
 */
export const SFX_WATCHDOG = { checkMs: 100, frozenMs: 500, throttleMs: 5000, capMs: 200, maxTries: 3 } as const;
/** 消音の保存（localStorage の鍵。'0' で消音・無い／読めなければ音オン＝D6。Safari とホーム画面のアプリは保存が別） */
export const SFX_STORAGE_KEY = 'night-hunters.sound';
/** iOS の Audio Session の種類（L1: 本体の消音スイッチに従い、ほかのアプリの音楽を止めない。無い端末では何もしない） */
export const SFX_AUDIO_SESSION_TYPE = 'ambient';

/** ループの更新（spec §5・§14 L6）: ノードへ書くのは 10 Hz・目標が変わった時だけ（setTargetAtTime の時定数 0.08 秒）。一時停止は 0.15 秒で 0 へ。rate は 0.5〜2 の内 */
export const SFX_LOOP_UPDATE_HZ = 10;
export const SFX_LOOP_TIME_CONSTANT_S = 0.08;
export const SFX_LOOP_GAIN_EPS = 0.01;
export const SFX_LOOP_RATE_EPS = 0.005;
export const SFX_LOOP_PAUSE_FADE_S = 0.15;
export const SFX_LOOP_RATE_MIN = 0.5;
export const SFX_LOOP_RATE_MAX = 2;

/** ループの目標（spec §5 の表。読むのは S3 の core/sfx-cues。音量は 0〜1、rate は倍） */
export const SFX_LOOP_ENGINE = {
  /** targetStep ごとの音量: 停止・静音・巡航・全速（燃料切れと沈没は 0） */
  gainStop: 0.1, gainSilent: 0.16, gainCruise: 0.38, gainFull: 0.6,
  /** rate ＝ rateBase ＋ rateSpan ×（速さ ÷ 艇の最大） */
  rateBase: 0.75, rateSpan: 0.75,
  /** 機関の損傷の揺れ（± 割合・Hz）と、機関の不調（jp_05）の WARN・FINAL・LIMP の揺れ（± 割合） */
  damagedWobble: 0.06, wobbleHz: 3, stageWobble: [0.04, 0.08, 0.12],
} as const;
export const SFX_LOOP_SEA = { gainBase: 0.1, gainSpeed: 0.14, gainStorm: 0.1 } as const;
export const SFX_LOOP_FIRE = { gain: 0.35, riseS: 0.3, fallS: 0.5 } as const;
export const SFX_LOOP_RAIN = { gainInside: 0.4, gainNear: 0.15 } as const;
export const SFX_LOOP_DRONE = {
  /** 距離の帯で 0.10〜0.40（水上機・夜明けの空襲の接近・哨戒機）。S3: 帯は単発と同じ SFX_BAND_MAX_M（400・1,500・4,000 m。それより遠くは gainFar）＝帯の境でだけ変わる */
  gainFar: 0.1, gainNear: 0.4, gainByBand: [0.4, 0.3, 0.2],
  /** 味方機: 識別の要求・掃射 0.40、去る 0.20（水上機・哨戒機の去る間も）。空襲: 旋回・突入・投下 0.45、休み 0.10 */
  gainFriendly: 0.4, gainFriendlyLeaving: 0.2, gainAttack: 0.45, gainRest: 0.1,
  /** S3（jp_03。設計の既定）: 港の空襲の編隊がほかの隊だけを狙っている間（操作中の隊を狙う編隊は gainAttack・波の予告だけの間は gainFar） */
  gainEvacOther: 0.25,
  /** rate 0.9〜1.15（突入・投下で上げる）。S3: 音量に比例（gainAttack で rateMax＝近い・突っ込んでくるほど高い） */
  rateMin: 0.9, rateMax: 1.15,
} as const;
/**
 * S3（ループのつなぎ。systems/sfx-loop-player）: ループの束はリミッタを通さず master へ直につなぐ（リミッタは単発の重なりを抑える物。鳴り続けるループを通すと、
 * ループだけで閾値を超えて下げっぱなしになり、砲声のたびにエンジンの音が沈む＝数は CHANGELOG の v0.7.1 S3）。束の音量 SFX_LOOP_BUS_GAIN は上の表（spec §5 の比）に掛ける全体の倍率
 * （リミッタの後の単発の頂 約 0.8 に、5 本の和の頂を足しても 1 を超えない大きさ。S5 で実機の耳で詰める）。一時停止は束を 0 へ、再開で戻す
 */
export const SFX_LOOP_BUS_GAIN = 0.5;
/** S3: 任務の終わり・消音でループを止める時は、この秒で絞ってから音源を止める（ぷつっと切らない） */
export const SFX_LOOP_STOP_FADE_S = 0.15;
/** S3（spec §3.3）: 一時停止の画面を開いた合図＝ボタンの音を低く・小さく */
export const SFX_PAUSE_OPEN = { gain: 0.7, rate: 0.7 } as const;
