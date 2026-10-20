// 夜明けの空（v0.6.1。docs/02 §6.7）: 夜明け（duration_s）は任務の終わりではなく「状態」。夜明けに輪の外なら、任務の dawn_air.play_as で昼が変わる
// （enemy は敵機の空襲が波で続く、own は敵機は来ない）。Phaser 非依存、判定の関数は確保しない。
// 夜明けの判定 dawnReached は scene の timeLeftS <= 0（mission-scene）と同じ不等式。世界は固定ステップの中でラッチする（systems/world-dawn.ts）。
// missions_seed.json の dawn_air（13 任務すべて）の検査と読み出し、テレメトリと Result の型もここ。
import { retireDirJa, type RetireEdge } from './dawn-withdraw';

/** 夜明けの空を握っている側（史実の control と、遊び方の play_as） */
export type AirSide = 'enemy' | 'own' | 'contested';
export type AirConfidence = 'high' | 'medium' | 'low';
/** 夜明けの敵艦（stay 残る・retire 退く・hide 隠れる・none いない） */
export type ShipsAtDawn = 'stay' | 'retire' | 'hide' | 'none';

export interface DawnAirRef {
  url: string;
  claim: string;
}

export interface DawnAir {
  control: AirSide;
  confidence: AirConfidence;
  playAs: AirSide;
  shipsAtDawn: ShipsAtDawn;
  labelJa: string;
  refs: readonly DawnAirRef[];
  /** 退く先の縁（v0.6.2。shipsAtDawn が retire の遊べる任務だけ。v0_1_prototype.dawn_withdraw を config/dawn-data の getDawnAir が入れる）。ほかは null */
  retireEdge: RetireEdge | null;
  /** 退く敵の呼び名（v0.6.2。dawn_withdraw.force_ja。夜明けの帯の「東京急行は北へ退く」）。retireEdge が null なら '' */
  retireForceJa: string;
  /** 制空権下で敵艦隊がいなくなれば任務終了（v0.6.2 実機 1 回目。v0_1_prototype.fleet_gone_clears を config/dawn-data の getDawnAir が入れる）。ほかは false */
  fleetGoneClears: boolean;
}

/** テレメトリ・Result の夜明けの空の符号（NONE は夜明け前、または遊び方の無い争奪） */
export const DAWN_AIR_NONE = 0;
export const DAWN_AIR_OWN = 1;
export const DAWN_AIR_ENEMY = 2;

/** play_as → DAWN_AIR_*（contested は遊べる任務に無いので NONE） */
export function dawnAirCode(playAs: AirSide): number {
  return playAs === 'enemy' ? DAWN_AIR_ENEMY : playAs === 'own' ? DAWN_AIR_OWN : DAWN_AIR_NONE;
}

/** 夜明けに達したか（durationS − stepTimeS ≤ 0。等号は達した。scene の timeLeftS = max(0, d − t) ≤ 0 と同じステップで真になる） */
export function dawnReached(durationS: number, stepTimeS: number): boolean {
  return durationS - stepTimeS <= 0;
}

/** 夜明け後の実秒（夜明け前は 0。夜明けの時計と同じく命中スローで縮めない実秒） */
export function daylightS(durationS: number, stepTimeS: number): number {
  const s = stepTimeS - durationS;
  return s > 0 ? s : 0;
}

/**
 * 海の明るさの段（0〜steps）。夜明けの preS 秒前までは 0、夜明けまでは floor(half × 経過 / preS)（0〜half−1）、
 * 夜明けからは min(steps, half + ceil(half × 夜明け後 / postS))（夜明けちょうどで half）。half = floor(steps / 2)。単調に増える
 */
export function seaLightStep(stepTimeS: number, durationS: number, preS: number, postS: number, steps: number): number {
  const half = Math.floor(steps / 2);
  if (!dawnReached(durationS, stepTimeS)) {
    const into = stepTimeS - (durationS - preS);
    if (into < 0 || !(preS > 0)) return 0;
    const k = Math.floor((half * into) / preS);
    return k < half - 1 ? k : half - 1;
  }
  if (!(postS > 0)) return steps;
  const k = half + Math.ceil((half * (stepTimeS - durationS)) / postS);
  return k < steps ? k : steps;
}

/**
 * Briefing の「夜明けまで N 秒」の後ろに付ける句（Briefing を作るときの 1 回だけ）。空: enemy は「以後は空襲」、own は「昼の空は味方」（争奪は遊べる任務に無いので無し）。
 * 夜明けの敵艦（v0.6.2）: retire は「敵は北へ退く」（方角は今夜の左右反転込み）、hide は「大発は岸へ隠れる」。stay・none は付けない。両方あれば「・」でつなぐ
 */
export function dawnConditionJa(air: Pick<DawnAir, 'playAs' | 'shipsAtDawn' | 'retireEdge'>, mirrored = false): string {
  const sky = air.playAs === 'enemy' ? '以後は空襲' : air.playAs === 'own' ? '昼の空は味方' : '';
  const ships = air.shipsAtDawn === 'retire' && air.retireEdge ? `敵は${retireDirJa(air.retireEdge, mirrored)}へ退く` : air.shipsAtDawn === 'hide' ? '大発は岸へ隠れる' : '';
  return sky && ships ? `（${sky}・${ships}）` : sky || ships ? `（${sky}${ships}）` : '';
}

// ---------- テレメトリと Result ----------

/** BoatTelemetry.dawn（createTelemetry で 1 回だけ作り、毎フレーム中身だけ書き換える） */
export interface DawnTelemetry {
  reached: boolean;
  caughtOutside: boolean;
  daylightS: number;
  /** 任務の DAWN_AIR_*（夜明け前から入れておく） */
  air: number;
  /** 任務に dawn_strike があり、?debug&nostrike でない */
  strikeEnabled: boolean;
  /** 空襲の段（core/air-strike の AS_T_*。0 は無し） */
  threat: number;
  toEscort: boolean;
  /** 落下中の自艇への爆弾の狙いが旋回の弧の先（投下の瞬間に旋回していた。core/air-strike-pose の predictBoat と同じ判定）。落下中でなければ false */
  fallingArc: boolean;
  /** 0 始まりの機の番号（-1 は無し） */
  plane: number;
  bombsLeft: number;
  /** 次の波までの秒（波の合間でなければ NaN） */
  restS: number;
  /** 接近中の距離 m（接近中でなければ NaN） */
  inboundDistM: number;
  count: number;
  /** 今の波が来る方角（8 方位。波ごとに wave_rotate_deg 回る＝毎フレーム書く。出発時と夜明けの帯は最初の波） */
  fromJa: string;
  nameJa: string;
  labelJa: string;
  /** 空襲に僚艇（要人）を狙う機がある（escort_target_planes。夜明けの帯の 2 行目） */
  vip: boolean;
  /** 夜明けの敵艦（v0.6.2。dawn_air.enemy_ships_at_dawn。夜明けの帯の「…は北へ退く」「大発は岸へ隠れる」）と、退く方角（北など。retire だけ、ほかは ''）・退く敵の呼び名（retire だけ） */
  ships: ShipsAtDawn;
  retireJa: string;
  forceJa: string;
  /** 駆逐艦・輸送船がすべて沈み始めたか退き、そのうち 1 隻でも退いた（v0.6.2 レビュー。HUD の 3 行目「東京急行は北へ去った ・ 狙う艦なし」）。夜明け前は常に false */
  shipsGone: boolean;
  /** 夜明けの後に岸へ逃げている大発の隻数と、夜明けの後に岸へ隠れた（上陸した）隻数（v0.6.2 実機 1 回目。空襲の行の後ろ。夜明け前・大発の無い任務は 0） */
  bargesRunning: number;
  bargesHidden: number;
}

export function createDawnTelemetry(): DawnTelemetry {
  return {
    reached: false,
    caughtOutside: false,
    daylightS: 0,
    air: DAWN_AIR_NONE,
    strikeEnabled: false,
    threat: 0,
    toEscort: false,
    fallingArc: false,
    plane: -1,
    bombsLeft: 0,
    restS: NaN,
    inboundDistM: NaN,
    count: 0,
    fromJa: '',
    nameJa: '',
    labelJa: '',
    vip: false,
    ships: 'none',
    retireJa: '',
    forceJa: '',
    shipsGone: false,
    bargesRunning: 0,
    bargesHidden: 0,
  };
}

/** 空襲の集計（Result。空襲の無い任務では null） */
export interface DawnStrikeResult {
  waves: number;
  bombs: number;
  bombsAtEscort: number;
  hitsPlayer: number;
  hitsEscort: number;
  damagePlayer: number;
  /** 自艇を狙った爆弾ごとの、投下から転舵までの秒（転舵しなければ NaN） */
  dodgeS: number[];
  /** 僚艇（要人）を狙う機がある（Result の行に「自艇・僚艇」の内訳を出す） */
  vip: boolean;
}

/** MissionResult.dawn（任務の終わりに 1 回だけ作る） */
export interface DawnResult {
  reached: boolean;
  caughtOutside: boolean;
  daylightS: number;
  timeLeftAtEndS: number;
  air: number;
  labelJa: string;
  strike: DawnStrikeResult | null;
  /**
   * 夜明けに退いた（v0.6.2。Result の夜明けの行の後ろ）: 海域を出た駆逐艦の隻数（輸送船は数えない）・輸送船も出た・退いた方角（retire の任務だけ、ほかは ''）、
   * 夜明けの後に岸へ隠れた（上陸した）大発の隻数。退いた艦・隠れた大発は撃沈・撃破に数えない
   */
  shipsWithdrawn: number;
  transportWithdrawn: boolean;
  retireJa: string;
  bargesHidden: number;
}

/** 夜明け前に終わった任務の形（呼ぶ側が中身を書く） */
export function createDawnResult(): DawnResult {
  return { reached: false, caughtOutside: false, daylightS: 0, timeLeftAtEndS: 0, air: DAWN_AIR_NONE, labelJa: '', strike: null, shipsWithdrawn: 0, transportWithdrawn: false, retireJa: '', bargesHidden: 0 };
}

// ---------- data の読み出し（missions_seed.json の dawn_air） ----------

export interface DawnAirRecord {
  control: string;
  confidence: string;
  play_as: string;
  enemy_ships_at_dawn: string;
  label_ja: string;
  refs: { url: string; claim: string }[];
  source: string;
}

const DAWN_AIR_KEYS: readonly string[] = ['control', 'confidence', 'play_as', 'enemy_ships_at_dawn', 'label_ja', 'refs', 'source'];
const DAWN_AIR_REF_KEYS: readonly string[] = ['url', 'claim'];
const AIR_SIDES: readonly string[] = ['enemy', 'own', 'contested'];
const CONFIDENCES: readonly string[] = ['high', 'medium', 'low'];
const SHIPS_AT_DAWN: readonly string[] = ['stay', 'retire', 'hide', 'none'];

/** 形だけの検査（文字列と refs の配列）。値の検査は dawnAirFromData（任務の名前を付けて例外） */
export function isDawnAirRecord(v: unknown): v is DawnAirRecord {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const r = v as Record<string, unknown>;
  for (const k of DAWN_AIR_KEYS) if (k !== 'refs' && typeof r[k] !== 'string') return false;
  const refs = r['refs'];
  if (!Array.isArray(refs)) return false;
  return refs.every((x) => !!x && typeof x === 'object' && typeof (x as Record<string, unknown>)['url'] === 'string' && typeof (x as Record<string, unknown>)['claim'] === 'string');
}

/**
 * dawn_air を読む（docs/02 §6.7、spec §6.6）。例外は任務の id を付ける:
 * 知らないキー、列挙の外の値、空の label_ja・claim、refs が 0 件、https でない url、source に historical が無い、
 * play_as が control と食い違う（enemy→enemy・own→own・contested→どれでも）、遊べる任務（playable）で play_as が contested（争奪の遊び方はまだ無い）
 */
export function dawnAirFromData(r: DawnAirRecord, missionId: string, playable: boolean): DawnAir {
  const at = `missions_seed ${missionId} の dawn_air`;
  for (const k of Object.keys(r)) if (!DAWN_AIR_KEYS.includes(k)) throw new Error(`${at} に知らないキー ${k}`);
  if (!AIR_SIDES.includes(r.control)) throw new Error(`${at}.control は enemy・own・contested のどれか（${r.control}）`);
  if (!CONFIDENCES.includes(r.confidence)) throw new Error(`${at}.confidence は high・medium・low のどれか（${r.confidence}）`);
  if (!AIR_SIDES.includes(r.play_as)) throw new Error(`${at}.play_as は enemy・own・contested のどれか（${r.play_as}）`);
  if (!SHIPS_AT_DAWN.includes(r.enemy_ships_at_dawn)) throw new Error(`${at}.enemy_ships_at_dawn は stay・retire・hide・none のどれか（${r.enemy_ships_at_dawn}）`);
  if (r.label_ja.trim() === '') throw new Error(`${at}.label_ja が空`);
  if (r.refs.length === 0) throw new Error(`${at}.refs が 0 件（出典を 1 つ以上）`);
  for (const ref of r.refs) {
    for (const k of Object.keys(ref)) if (!DAWN_AIR_REF_KEYS.includes(k)) throw new Error(`${at}.refs に知らないキー ${k}`);
    if (!/^https:\/\/\S+$/.test(ref.url)) throw new Error(`${at}.refs の url は https://（${ref.url}）`);
    if (ref.claim.trim() === '') throw new Error(`${at}.refs の claim が空（${ref.url}）`);
  }
  if (!r.source.includes('historical')) throw new Error(`${at}.source に historical が無い（control は史実の読み）`);
  const control = r.control as AirSide;
  const playAs = r.play_as as AirSide;
  if (control !== 'contested' && playAs !== control) throw new Error(`${at}.play_as（${playAs}）が control（${control}）と食い違う（争奪のときだけ選べる）`);
  if (playable && playAs === 'contested') throw new Error(`${at}.play_as が contested（争奪の遊び方はまだ無い。遊べる任務は enemy か own に決める）`);
  return {
    control,
    confidence: r.confidence as AirConfidence,
    playAs,
    shipsAtDawn: r.enemy_ships_at_dawn as ShipsAtDawn,
    labelJa: r.label_ja,
    refs: r.refs.map((x) => ({ url: x.url, claim: x.claim })),
    retireEdge: null,
    retireForceJa: '',
    fleetGoneClears: false,
  };
}
