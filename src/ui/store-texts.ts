// ストア（v0.9.0 S1）の文: 点の書き方・品の効きの短い文と状態・効く任務・Briefing の「装備: カスタム」の 2 行目・Result の得点の行の後ろ「 ・ ストア +M（計 T 点）」・見出しの印。
// Phaser も DOM を読む config も使わない（文を組むだけ。tests/store-texts が node で読める）。数は data/store.json と艇・魚雷の data から（直書きしない）。
import type { GameData } from '../config/game-data';
import { effectiveStoreItems } from '../config/custom-loadout';
import { getStoreCatalogue } from '../config/store-data';
import { BRIEF_LOADOUT_SUB_MAX_PX, BRIEF_LOADOUT_SUB_PX, RESULT_CUSTOM_TAG_JA, STORE_EQUIPPED_JA, STORE_UNEQUIPPED_JA } from '../config/store-layout-config';
import { storeRewardJa } from '../config/trophy-config';
import type { StoreItem, StoreState } from '../core/store';

/** 12345 → 「12,345」（3 桁ごとのコンマ。端末の言語設定に依らない） */
export function formatPoints(n: number): string {
  const s = String(Math.max(0, Math.round(n)));
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 財布「所持 12,345 点」 */
export function walletJa(points: number): string {
  return `所持 ${formatPoints(points)} 点`;
}

/** 魚雷の名の頭（「米 Mk 13魚雷（PT後期・…）」→「米 Mk 13魚雷」） */
function torpedoShortName(data: GameData, id: string): string {
  const t = data.torpedoes.torpedoes.find((x) => x.id === id);
  const name = t ? t.name_ja : id;
  const i = name.indexOf('（');
  return i > 0 ? name.slice(0, i) : name;
}

/** 品の効きの短い文（格子の 1 枚の 2 行目。effect の値から） */
export function storeEffectJa(data: GameData, item: StoreItem): string {
  const e = item.effect;
  switch (e.kind) {
    case 'mission_fuel_factor':
      return `燃料の割当 ×${e.factor}`;
    case 'boat_smoke':
      return `煙幕 ${e.durationS} 秒 ・ 次まで ${e.cooldownS} 秒`;
    case 'mission_torpedo':
      return `${torpedoShortName(data, e.torpedoId)}を積む`;
    case 'boat_torpedo_count':
      return `魚雷 ${e.count} 本`;
    case 'boat_crew':
      return `弾倉交換 ${e.reloadS.toFixed(1)} 秒 ・ 消火 ${e.extinguishHoldS} 秒`;
  }
}

export type StoreCardTone = 'price' | 'short' | 'on' | 'off';

/**
 * 格子の 1 枚の右の状態: 持っていなければ値段（足りなければ short）、持っていれば「装着中」／「外している」。
 * ご褒美（v0.9.0 IP3）はまだ持っていなければ値段の代わりに進み「n/13」（progress。史実 × デフォルトで達成した任務の数）
 */
export function storeCardState(s: StoreState, item: StoreItem, progress: { readonly done: number; readonly total: number } = { done: 0, total: 0 }): { text: string; tone: StoreCardTone } {
  if (s.owned.includes(item.id)) return s.off.includes(item.id) ? { text: STORE_UNEQUIPPED_JA, tone: 'off' } : { text: STORE_EQUIPPED_JA, tone: 'on' };
  if (item.reward) return { text: `${progress.done}/${progress.total}`, tone: 'short' };
  return { text: `${formatPoints(item.price)} 点`, tone: s.points >= item.price ? 'price' : 'short' };
}

/** 格子の 1 枚の 2 行目: 品の効きの短い文。ご褒美（v0.9.0 IP3）は値段の代わりの札「ご褒美（史実・デフォルトで全13任務を達成）」（効きは選んだ時の説明に出る） */
export function storeCardSubJa(data: GameData, item: StoreItem): string {
  return item.reward ? storeRewardJa(getStoreCatalogue(data).openMissionIds.length) : storeEffectJa(data, item);
}

/** 品が何かを変える任務（ストアを開く条件の任務の順。Briefing の切り替えが出る任務と同じ判定） */
export function storeItemMissionIds(data: GameData, item: StoreItem): string[] {
  return getStoreCatalogue(data).openMissionIds.filter((id) => effectiveStoreItems(data, id, [item.id]).length > 0);
}

/** 説明の 2 行目「効く任務: us_02・us_04」 */
export function storeItemMissionsJa(data: GameData, item: StoreItem): string {
  const ids = storeItemMissionIds(data, item);
  return ids.length === 0 ? '効く任務: なし' : `効く任務: ${ids.join('・')}`;
}

/** 文の幅の見積もり px（半角 0.602 em・全角 1 em。等幅の Menlo の比＝tests の textWidthPx と同じ） */
export function estimateTextPx(str: string, px: number): number {
  let w = 0;
  for (const ch of str) w += (ch.charCodeAt(0) < 0x2000 ? 0.602 : 1) * px;
  return w;
}

/** Briefing の「装備: カスタム」の 2 行目: 効く品の短い名を「・」で（見積もりの幅が maxPx を超えたら入るだけ並べて「ほか n」） */
export function loadoutSubJa(shortNames: readonly string[], maxPx: number = BRIEF_LOADOUT_SUB_MAX_PX, px: number = BRIEF_LOADOUT_SUB_PX): string {
  const all = shortNames.join('・');
  if (estimateTextPx(all, px) <= maxPx) return all;
  for (let k = shortNames.length - 1; k >= 1; k--) {
    const s = `${shortNames.slice(0, k).join('・')} ほか ${shortNames.length - k}`;
    if (estimateTextPx(s, px) <= maxPx) return s;
  }
  return `${shortNames[0] ?? ''} ほか ${shortNames.length - 1}`;
}

/** Result の得点の行の後ろ（ストアが開いている端末だけ。Mission の endMission が 1 回だけ記録した物）: 「 ・ ストア +M（計 T 点）」。支度金を配った出撃は「 ・ 開店 +G」、書けなければ「（保存できず）」 */
export function storeResultPartJa(rec: { readonly credited: number; readonly granted: number; readonly total: number; readonly saved: boolean }): string {
  const grant = rec.granted > 0 ? ` ・ 開店 +${formatPoints(rec.granted)}` : '';
  return ` ・ ストア +${formatPoints(rec.credited)}${grant}（計 ${formatPoints(rec.total)} 点${rec.saved ? '' : '・保存できず'}）`;
}

/** Result の見出しの印（カスタムの出撃だけ。デフォルトの出撃は ''＝見出しは今と同じ） */
export function resultCustomTagJa(sortie: { readonly custom?: unknown }): string {
  return sortie.custom ? RESULT_CUSTOM_TAG_JA : '';
}
