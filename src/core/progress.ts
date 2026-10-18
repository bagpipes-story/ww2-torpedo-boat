// 遊びの進み（v0.5.2。docs/02 §6.3「見越し角ガイド」）: 任務を終えた回数と、それで解放される見越し点マーカーの段階（hit_rate_model.aim_assist.levels）。
// 回数は Result まで行った任務だけ（一時停止でやめた任務は数えない）。保存は systems/progress-storage.ts。Phaser 非依存。
export interface AimAssistLevel {
  id: string;
  nameJa: string;
  /** 解放に要る「終えた任務の回数」。最初の段階（なし）は 0 */
  unlockSorties: number;
}

export const AIM_ASSIST_NONE = 'none';
export const AIM_ASSIST_LEAD_MARKER = 'lead_marker';
export const AIM_ASSIST_LEAD_MARKER_TIME = 'lead_marker_time';

/** data の段階の検査: 1 つ以上、最初は none で 0 回、回数は増える順、id は重複しない。壊れていれば起動時に分かる */
export function isAimAssistLevels(v: unknown): v is AimAssistLevel[] {
  if (!Array.isArray(v) || v.length === 0) return false;
  const ids = new Set<string>();
  for (let i = 0; i < v.length; i++) {
    const l = v[i] as Record<string, unknown> | null;
    if (!l || typeof l !== 'object') return false;
    if (typeof l['id'] !== 'string' || l['id'] === '' || typeof l['nameJa'] !== 'string' || !Number.isInteger(l['unlockSorties']) || (l['unlockSorties'] as number) < 0) return false;
    if (i === 0 && (l['id'] !== AIM_ASSIST_NONE || l['unlockSorties'] !== 0)) return false;
    if (i > 0 && (l['unlockSorties'] as number) <= ((v[i - 1] as AimAssistLevel).unlockSorties ?? -1)) return false;
    if (ids.has(l['id'])) return false;
    ids.add(l['id']);
  }
  return true;
}

/** 今の段階: 終えた任務の回数で解放した最も上の段階。史実モードでは最初の段階（なし。historical_mode.aim_assist） */
export function aimAssistLevelFor(levels: readonly AimAssistLevel[], sortiesDone: number, historical: boolean): AimAssistLevel {
  let cur = levels[0]!;
  if (historical) return cur;
  for (const l of levels) if (sortiesDone >= l.unlockSorties) cur = l;
  return cur;
}

/** 次に解放される段階（すべて解放していれば null） */
export function nextAimAssistUnlock(levels: readonly AimAssistLevel[], sortiesDone: number): AimAssistLevel | null {
  for (const l of levels) if (l.unlockSorties > sortiesDone) return l;
  return null;
}

/** Briefing の「条件」に足す一言: 解放までの回数か、使える段階。enabled は Title の「使う／使わない」（解放していても使わないを選べる） */
export function aimAssistStatusJa(levels: readonly AimAssistLevel[], sortiesDone: number, historical: boolean, enabled: boolean = true): string {
  if (historical) return `史実モード: ${levels[1]?.nameJa ?? '見越し点マーカー'}なし`;
  const cur = aimAssistLevelFor(levels, sortiesDone, false);
  const next = nextAimAssistUnlock(levels, sortiesDone);
  if (cur.id === AIM_ASSIST_NONE) return next ? `${next.nameJa}: あと ${next.unlockSorties - sortiesDone} 回の任務で解放（終えた任務 ${sortiesDone} 回）` : '';
  if (!enabled) return `${cur.nameJa} 使わない（任務一覧で切り替え）`;
  return `${cur.nameJa} 使用可${next ? `（${next.nameJa}は あと ${next.unlockSorties - sortiesDone} 回）` : ''}`;
}

/** 保存した回数の読み取り: 0 以上の整数の文字列だけ。それ以外（無い・壊れた）は 0 */
export function parseSortieCount(text: string | null | undefined): number {
  if (text === null || text === undefined) return 0;
  const n = Number(text);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

export function serializeSortieCount(n: number): string {
  return String(n);
}
