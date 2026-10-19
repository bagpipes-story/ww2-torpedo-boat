// キャンペーンの一覧と任務一覧（v0.6.0。data/missions_seed.json の campaigns と missions）。Title・Mission・Result が読む。
// data を直接読み、game-data の関数は呼ばない（mission-data と同じ作法。値の循環を作らない）。壊れた data は例外（起動時に分かる）。
import type { GameData } from './game-data';
import { menuEntries, type MenuEntry } from '../core/briefing';
import { parseUnlockRule, type UnlockRule } from '../core/campaign';

export interface CampaignInfo {
  id: string;
  nameJa: string;
  /** 短い名前（未解放のタブの条件の文に使う。short_ja。無ければ name_ja） */
  shortJa: string;
  unlock: UnlockRule;
}

/** キャンペーンの一覧（data の順）。id・name_ja が無い、unlock が読めない、complete_ の相手が無い、default がちょうど 1 件でない、のどれかなら例外 */
export function getCampaigns(data: GameData): CampaignInfo[] {
  const raw = data.missionsSeed.campaigns as readonly Record<string, unknown>[];
  const out: CampaignInfo[] = raw.map((c, i) => {
    const id = c['id'];
    const nameJa = c['name_ja'];
    if (typeof id !== 'string' || id === '' || typeof nameJa !== 'string' || nameJa === '') throw new Error(`missions_seed.json の campaigns[${i}] に id / name_ja が無い`);
    const shortJa = typeof c['short_ja'] === 'string' && c['short_ja'] !== '' ? c['short_ja'] : nameJa;
    return { id, nameJa, shortJa, unlock: parseUnlockRule(c['unlock'], `campaigns.${id}`) };
  });
  const ids = new Set(out.map((c) => c.id));
  if (ids.size !== out.length) throw new Error('missions_seed.json の campaigns の id が重複している');
  for (const c of out) if (c.unlock.kind === 'complete' && (!ids.has(c.unlock.campaignId) || c.unlock.campaignId === c.id)) throw new Error(`campaigns.${c.id} の unlock の相手（${c.unlock.campaignId}）が無い`);
  if (out.filter((c) => c.unlock.kind === 'default').length !== 1) throw new Error("missions_seed.json の campaigns に unlock が 'default' のキャンペーンがちょうど 1 件ない");
  return out;
}

/** 最初から開いているキャンペーン（unlock が default） */
export function defaultCampaign(data: GameData): CampaignInfo {
  return getCampaigns(data).find((c) => c.unlock.kind === 'default')!;
}

/** Title の任務一覧: キャンペーン（省けば default）の、playable_from を持つ任務を order 順に */
export function getMenuEntries(data: GameData, campaignId?: string): { campaignName: string; entries: MenuEntry[] } {
  const c = campaignId === undefined ? defaultCampaign(data) : getCampaigns(data).find((x) => x.id === campaignId);
  if (!c) throw new Error(`missions_seed.json に キャンペーン ${String(campaignId)} が無い`);
  return { campaignName: c.nameJa, entries: menuEntries(data.missionsSeed.missions, c.id) };
}

/** キャンペーンの遊べる任務（playable_from と v0_1_prototype を持つ）の id。解放の条件に使う（us_pt なら us_01・us_02・us_03） */
export function playableMissionIds(data: GameData, campaignId: string): string[] {
  const out: string[] = [];
  for (const m of data.missionsSeed.missions as readonly Record<string, unknown>[]) {
    const proto = m['v0_1_prototype'];
    if (m['campaign'] === campaignId && typeof m['playable_from'] === 'string' && typeof proto === 'object' && proto !== null && !Array.isArray(proto) && typeof m['id'] === 'string') out.push(m['id']);
  }
  return out;
}

/** 任務のキャンペーンの id（無ければ ''） */
export function missionCampaignId(data: GameData, missionId: string): string {
  const m = (data.missionsSeed.missions as readonly Record<string, unknown>[]).find((x) => x['id'] === missionId);
  return m && typeof m['campaign'] === 'string' ? m['campaign'] : '';
}

/**
 * 通算の命中率（v0.5.0）に数える任務か: 任務のキャンペーンが hit_rate_model.kpi_measurement.campaigns に入っているか（v0.6.0。米PTだけ。
 * 日本の 45cm 魚雷・米駆逐艦への 1 本を混ぜると、ノーマルの調整の唯一の根拠（CLAUDE.md §9）が崩れる）
 */
export function recordsHitKpi(data: GameData, missionId: string): boolean {
  return data.hitRateModel.kpi_measurement.campaigns.includes(missionCampaignId(data, missionId));
}
