// 達成の記録（v0.9.0 IP1。ユーザーの言葉 2026-11-27「史実モードでもカスタム装備使える仕様でいいです。でも史実でカスタムを使ったという表示と記録は必要です。」）:
// 任務ごとに「どの形で達成したか」を 8 つの形（ハード × 史実モード × カスタムの装備）のビットで覚える。Phaser 非依存（localStorage は systems/store-storage）。
// 保存の鍵は S0・S1 と同じ night-hunters.achieved の 1 つ。形は { "v": 2, "m": { "us_02": 1, "us_05": 37 } }（値は 1〜255 のビットの和）。
// S0・S1 のビルドが書いた形（任務の id の JSON 配列 ["us_02", …]）も読める: その id は「ノーマル・史実オフ・デフォルトで達成」（ビット 1）として扱う。
// ストアを開く条件（core/store の storeOpenStatus）は今までどおり「どれかのビットが立っている任務」を数える（achievedIdSet）。
// Title の行の印（「✓ 達成 ・ ハード ・ 史実（カスタム）」）は achievedMarkOf の 6 つの真偽から ui/achieved-texts が文にする。

export const ACHIEVED_RECORD_VERSION = 2;

/** 形の番号（0〜7）の 3 つの桁: ハード（ハードの違いのある任務のハードだけ）・史実モード・カスタムの装備 */
export const ACH_HARD = 1;
export const ACH_HISTORICAL = 2;
export const ACH_CUSTOM = 4;
/** ノーマル・史実オフ・デフォルトのビット（S0・S1 の記録と ?debug&achieved はこのビット） */
export const ACH_BIT_PLAIN = 1;
/** 立ちうるビットの全部（8 つの形） */
export const ACH_MASK_ALL = 0xff;
/** ビットの組: デフォルトの装備の 4 つの形・ハードの 4 つ・史実モードの 4 つ */
const MASK_DEFAULT_GEAR = 0x0f;
const MASK_HARD = 0xaa;
const MASK_HISTORICAL = 0xcc;

/** その出撃の形のビット（1 << 形の番号）。hard は「ハードの違いのある任務のハード」（jp_02・jp_05 のハードはノーマルと同じ世界なので偽で渡す） */
export function achievedVariantBit(o: { readonly hard: boolean; readonly historical: boolean; readonly custom: boolean }): number {
  return 1 << ((o.hard ? ACH_HARD : 0) | (o.historical ? ACH_HISTORICAL : 0) | (o.custom ? ACH_CUSTOM : 0));
}

/** 任務の id → 達成した形のビットの和（1〜255。達成していない任務は鍵ごと無い） */
export type AchievedRecord = Map<string, number>;

function validMask(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= ACH_MASK_ALL;
}

/**
 * 保存の文字列の読み取り。無い・JSON でない・版が違う・形が違う → 空。S0・S1 の id の配列は各 id をビット 1 に（空・重複・文字列でない物は落とす）。
 * 版 2 の値は 1〜255 の整数だけ（壊れた値の任務は落とす＝達成していない扱い）
 */
export function parseAchievedRecord(text: string | null | undefined): AchievedRecord {
  const out: AchievedRecord = new Map();
  if (text === null || text === undefined || text === '') return out;
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return out;
  }
  if (Array.isArray(v)) {
    for (const x of v) if (typeof x === 'string' && x !== '') out.set(x, ACH_BIT_PLAIN);
    return out;
  }
  if (typeof v !== 'object' || v === null) return out;
  const r = v as Record<string, unknown>;
  const m = r['m'];
  if (r['v'] !== ACHIEVED_RECORD_VERSION || typeof m !== 'object' || m === null || Array.isArray(m)) return out;
  for (const [id, mask] of Object.entries(m as Record<string, unknown>)) if (id !== '' && validMask(mask)) out.set(id, mask);
  return out;
}

export function serializeAchievedRecord(rec: AchievedRecord): string {
  const m: Record<string, number> = {};
  for (const [id, mask] of rec) m[id] = mask;
  return JSON.stringify({ v: ACHIEVED_RECORD_VERSION, m });
}

/** 達成を足す（rec を書き換える）。新しいビットが立ったら true（＝保存する）。bit が 1〜128 の 1 つのビットでなければ何もしない */
export function addAchieved(rec: AchievedRecord, missionId: string, bit: number): boolean {
  if (missionId === '' || !validMask(bit) || (bit & (bit - 1)) !== 0) return false;
  const before = rec.get(missionId) ?? 0;
  if ((before & bit) !== 0) return false;
  rec.set(missionId, before | bit);
  return true;
}

/** どれかの形で達成した任務の id（ストアを開く条件・Title の「達成 n/N」） */
export function achievedIdSet(rec: AchievedRecord): Set<string> {
  return new Set(rec.keys());
}

/** ids のうち達成した任務の数 */
export function achievedCount(rec: AchievedRecord, ids: readonly string[]): number {
  let n = 0;
  for (const id of ids) if (rec.has(id)) n++;
  return n;
}

/**
 * Title の行の印の材料: 達成したか・ハードで達成したか・史実モードで達成したか、と、それぞれが「カスタムの装備でだけ」か
 * （その組のビットがデフォルトの装備の 4 つの形に 1 つも無い）
 */
export interface AchievedMark {
  readonly any: boolean;
  readonly anyCustomOnly: boolean;
  readonly hard: boolean;
  readonly hardCustomOnly: boolean;
  readonly historical: boolean;
  readonly historicalCustomOnly: boolean;
}

export function achievedMarkOf(mask: number): AchievedMark {
  const m = validMask(mask) ? mask : 0;
  const hard = m & MASK_HARD;
  const hist = m & MASK_HISTORICAL;
  return {
    any: m !== 0,
    anyCustomOnly: m !== 0 && (m & MASK_DEFAULT_GEAR) === 0,
    hard: hard !== 0,
    hardCustomOnly: hard !== 0 && (hard & MASK_DEFAULT_GEAR) === 0,
    historical: hist !== 0,
    historicalCustomOnly: hist !== 0 && (hist & MASK_DEFAULT_GEAR) === 0,
  };
}
