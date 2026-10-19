// キャンペーンと解放（v0.6.0。docs/02 §4「Campaign」、CLAUDE.md §2「日本側は米PTキャンペーンの後にアンロック」）。Phaser 非依存。
// 解放の規則は missions_seed.json の campaigns[].unlock: 'default'（最初から開いている）か 'complete_<キャンペーン id>'（その遊べる任務を全部、1 回ずつ帰投で終える）。
// 一度開いたキャンペーンは閉じない（開いた印を別に保存する）。帰投で終えた任務の id と開いた印の読み書きは systems/progress-storage.ts。

export type UnlockRule = { kind: 'default' } | { kind: 'complete'; campaignId: string };

const COMPLETE_PREFIX = 'complete_';

/** data の unlock の文字列を規則に。'default' と 'complete_<id>' だけを受け、ほかは例外（起動時に分かる） */
export function parseUnlockRule(v: unknown, label: string): UnlockRule {
  if (v === 'default') return { kind: 'default' };
  if (typeof v === 'string' && v.startsWith(COMPLETE_PREFIX) && v.length > COMPLETE_PREFIX.length) return { kind: 'complete', campaignId: v.slice(COMPLETE_PREFIX.length) };
  throw new Error(`${label} の unlock は 'default' か 'complete_<キャンペーン id>'（${String(v)}）`);
}

export interface CampaignStatus {
  unlocked: boolean;
  /** 条件の任務のうち帰投で終えた数と、条件の任務の数（default は 0 / 0） */
  done: number;
  total: number;
}

/**
 * キャンペーンが開いているか。default は常に開く。complete は、開いた印（flagged）があるか、?debug&unlock（forceAll）か、
 * 条件の任務（prereqIds＝相手のキャンペーンの遊べる任務）がすべて帰投で終えた任務（cleared）に入っていれば開く
 */
export function campaignStatus(rule: UnlockRule, prereqIds: readonly string[], cleared: ReadonlySet<string>, flagged: boolean, forceAll: boolean): CampaignStatus {
  if (rule.kind === 'default') return { unlocked: true, done: 0, total: 0 };
  let done = 0;
  for (const id of prereqIds) if (cleared.has(id)) done++;
  const total = prereqIds.length;
  return { unlocked: flagged || forceAll || (total > 0 && done === total), done, total };
}

/**
 * v0.5.2 までに遊んでいた端末の移し替え: 帰投で終えた任務の記録がまだ無く（clearedRaw が null＝v0.6.0 で初めて開いた）、
 * 保存した「終えた任務の回数」（見越し点マーカーの解放に使う。v0.5.2）が条件の任務の数以上なら、開いたものとみなす
 */
export function legacyUnlocked(clearedRaw: string | null, storedSorties: number, needed: number): boolean {
  return clearedRaw === null && needed > 0 && storedSorties >= needed;
}

/** 保存した id の一覧の読み取り: JSON の文字列の配列だけを受ける（重複は落とす）。無い・壊れていれば [] */
export function parseIdList(text: string | null | undefined): string[] {
  if (text === null || text === undefined || text === '') return [];
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) if (typeof x === 'string' && x !== '' && !out.includes(x)) out.push(x);
  return out;
}

export function serializeIdList(ids: readonly string[]): string {
  return JSON.stringify(ids);
}
