// 達成の記録（v0.9.0 IP1。ユーザーの言葉 2026-11-27「史実モードでもカスタム装備使える仕様でいいです。でも史実でカスタムを使ったという表示と記録は必要です。」）:
// 任務ごとに「どの形で達成したか」を 8 つの形（ハード × 史実モード × カスタムの装備）のビットで覚える。Phaser 非依存（localStorage は systems/store-storage）。
// 保存の鍵は S0・S1 と同じ night-hunters.achieved の 1 つ。形は { "v": 2, "m": { "us_02": 1, "us_05": 37 } }（値は 1〜255 のビットの和）。
// S0・S1 のビルドが書いた形（任務の id の JSON 配列 ["us_02", …]）も読める: その id は「ノーマル・史実オフ・デフォルトで達成」（ビット 1）として扱う。
// ストアを開く条件（core/store の storeOpenStatus）は今までどおり「どれかのビットが立っている任務」を数える（achievedIdSet）。
// v0.9.0 IP3: Title の行の印は「✓ 達成」だけ（どれかのビット）。史実 × デフォルトのビット（MASK_HIST_DEFAULT）は Briefing のトロフィーとストアのご褒美「歴戦の乗員」の条件。

export const ACHIEVED_RECORD_VERSION = 2;

/** 形の番号（0〜7）の 3 つの桁: ハード（ハードの違いのある任務のハードだけ）・史実モード・カスタムの装備 */
export const ACH_HARD = 1;
export const ACH_HISTORICAL = 2;
export const ACH_CUSTOM = 4;
/** ノーマル・史実オフ・デフォルトのビット（S0・S1 の記録と ?debug&achieved はこのビット） */
export const ACH_BIT_PLAIN = 1;
/** 立ちうるビットの全部（8 つの形） */
export const ACH_MASK_ALL = 0xff;

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
 * 史実 × デフォルトの装備で達成した形（v0.9.0 IP3。ユーザーの言葉 2026-11-27「史実　デフォルトで達成したシナリオには出撃前の説明画面にトロフィーが表示されたり、
 * 全シナリオ史実デフォルトでクリアして場合のみ、ご褒美追加装備がもらえるなど、頑張った証が分かるようになればいいな」）: ノーマル・史実・デフォルト（4）と ハード・史実・デフォルト（8）。
 * S0・S1 の id の配列（ビット 1）とカスタムの形はここに入らない＝前の記録とカスタムの装備ではトロフィーもご褒美も出ない
 */
export const MASK_HIST_DEFAULT = 0x0c;
const BIT_HARD_HIST_DEFAULT = 0x08;

/** Briefing のトロフィー（史実 × デフォルトで達成していなければ null。hard はハードの史実 × デフォルトでも達成した＝「（ハード）」） */
export function historicalDefaultTrophy(mask: number): { readonly hard: boolean } | null {
  const m = validMask(mask) ? mask : 0;
  return (m & MASK_HIST_DEFAULT) === 0 ? null : { hard: (m & BIT_HARD_HIST_DEFAULT) !== 0 };
}

/** ids のうち史実 × デフォルトで達成した任務の数（ストアのご褒美の進み「史実デフォルト n/13」） */
export function historicalDefaultCount(rec: AchievedRecord, ids: readonly string[]): number {
  let n = 0;
  for (const id of ids) if (historicalDefaultTrophy(rec.get(id) ?? 0)) n++;
  return n;
}

/** ご褒美の条件（ids＝ストアを開く条件の 13 任務がみな史実 × デフォルトで達成。ids が空なら偽） */
export function historicalDefaultAll(rec: AchievedRecord, ids: readonly string[]): boolean {
  return ids.length > 0 && historicalDefaultCount(rec, ids) === ids.length;
}

/** ?debug&achieved の語の後ろの形（config/debug-achieved。v0.9.0 IP3）→ 形のビット（カスタムの形は置かない＝印は「✓ 達成」で同じ・トロフィーとご褒美には数えない） */
const DEBUG_ACHIEVED_FORMS: ReadonlyMap<string, number> = new Map([
  ['', achievedVariantBit({ hard: false, historical: false, custom: false })],
  ['hard', achievedVariantBit({ hard: true, historical: false, custom: false })],
  ['hist', achievedVariantBit({ hard: false, historical: true, custom: false })],
  ['hardhist', achievedVariantBit({ hard: true, historical: true, custom: false })],
]);

/** ?debug&achieved=<id|all>[:形],… の語を { id, bit } に（id の all はそのまま。形が表に無い語・空の語は落とす） */
export function parseDebugAchieved(v: string): { id: string; bit: number }[] {
  const out: { id: string; bit: number }[] = [];
  for (const w of v.split(',')) {
    const parts = w.split(':');
    const id = parts[0] ?? '';
    const bit = parts.length <= 2 ? DEBUG_ACHIEVED_FORMS.get(parts[1] ?? '') : undefined;
    if (id !== '' && bit !== undefined) out.push({ id, bit });
  }
  return out;
}
