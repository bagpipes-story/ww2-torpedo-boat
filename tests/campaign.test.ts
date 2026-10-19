import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { defaultCampaign, getCampaigns, getMenuEntries, missionCampaignId, playableMissionIds, recordsHitKpi } from '../src/config/campaign-data';
import { campaignStatus, legacyUnlocked, parseIdList, parseUnlockRule, serializeIdList } from '../src/core/campaign';

const clone = (): typeof gameData => JSON.parse(JSON.stringify(gameData)) as typeof gameData;

describe('キャンペーンと解放（v0.6.0。core/campaign・config/campaign-data）', () => {
  it('解放の規則: default と complete_<id> だけ。ほかは例外', () => {
    expect(parseUnlockRule('default', 'x')).toEqual({ kind: 'default' });
    expect(parseUnlockRule('complete_us_pt', 'x')).toEqual({ kind: 'complete', campaignId: 'us_pt' });
    for (const bad of ['complete_', 'always', '', null, 3]) expect(() => parseUnlockRule(bad, 'x')).toThrow();
  });
  it('開いているか: default は常に。complete は、条件の任務をすべて帰投で終えた・開いた印がある・?debug&unlock のどれか。済の数を数える', () => {
    const rule = { kind: 'complete' as const, campaignId: 'us_pt' };
    const pre = ['us_01', 'us_02', 'us_03'];
    expect(campaignStatus({ kind: 'default' }, [], new Set(), false, false)).toEqual({ unlocked: true, done: 0, total: 0 });
    expect(campaignStatus(rule, pre, new Set(['us_02']), false, false)).toEqual({ unlocked: false, done: 1, total: 3 });
    expect(campaignStatus(rule, pre, new Set(['us_01', 'us_02', 'us_03', 'jp_06']), false, false)).toEqual({ unlocked: true, done: 3, total: 3 });
    expect(campaignStatus(rule, pre, new Set(), true, false).unlocked).toBe(true); // 一度開いたら閉じない
    expect(campaignStatus(rule, pre, new Set(), false, true).unlocked).toBe(true); // ?debug&unlock
    expect(campaignStatus(rule, [], new Set(), false, false).unlocked).toBe(false); // 条件の任務が無ければ開かない
  });
  it('v0.5.2 までの端末: 帰投の記録がまだ無く、終えた任務の回数が条件の数以上なら開いたものとみなす（記録があれば移し替えない）', () => {
    expect(legacyUnlocked(null, 3, 3)).toBe(true);
    expect(legacyUnlocked(null, 2, 3)).toBe(false);
    expect(legacyUnlocked('[]', 9, 3)).toBe(false);
    expect(legacyUnlocked(null, 9, 0)).toBe(false);
  });
  it('id の一覧の読み書き: JSON の文字列の配列だけ。重複・空文字は落とし、壊れていれば []', () => {
    expect(parseIdList(serializeIdList(['us_01', 'us_02']))).toEqual(['us_01', 'us_02']);
    expect(parseIdList('["us_01","us_01","",3]')).toEqual(['us_01']);
    for (const bad of [null, undefined, '', '{', '"us_01"', '{"a":1}']) expect(parseIdList(bad)).toEqual([]);
  });
  it('data: 米PT（default）と日本ハードモード（complete_us_pt）。米PTの遊べる任務は us_01〜03、日本は jp_06。短い名前', () => {
    const cs = getCampaigns(gameData);
    expect(cs.map((c) => [c.id, c.shortJa, c.unlock])).toEqual([
      ['us_pt', '米PT', { kind: 'default' }],
      ['jp_hard', '日本', { kind: 'complete', campaignId: 'us_pt' }],
    ]);
    expect(defaultCampaign(gameData).id).toBe('us_pt');
    expect(playableMissionIds(gameData, 'us_pt')).toEqual(['us_01', 'us_02', 'us_03']);
    expect(playableMissionIds(gameData, 'jp_hard')).toEqual(['jp_06']);
    expect(getMenuEntries(gameData, 'jp_hard').campaignName).toBe('日本ハードモード');
    expect(() => getMenuEntries(gameData, 'nope')).toThrow();
  });
  it('壊れた campaigns は例外: default が 2 件・相手の無い complete_・自分自身を条件・id の重複', () => {
    const twoDefault = clone();
    (twoDefault.missionsSeed.campaigns[1] as { unlock: string }).unlock = 'default';
    expect(() => getCampaigns(twoDefault)).toThrow();
    const noTarget = clone();
    (noTarget.missionsSeed.campaigns[1] as { unlock: string }).unlock = 'complete_nope';
    expect(() => getCampaigns(noTarget)).toThrow();
    const self = clone();
    (self.missionsSeed.campaigns[1] as { unlock: string }).unlock = 'complete_jp_hard';
    expect(() => getCampaigns(self)).toThrow();
    const dup = clone();
    (dup.missionsSeed.campaigns[1] as { id: string }).id = 'us_pt';
    expect(() => getCampaigns(dup)).toThrow();
  });
  it('通算の命中率に数えるのは米PTの任務だけ（hit_rate_model.kpi_measurement.campaigns）', () => {
    expect(gameData.hitRateModel.kpi_measurement.campaigns).toEqual(['us_pt']);
    expect(['us_01', 'us_02', 'us_03'].map((id) => recordsHitKpi(gameData, id))).toEqual([true, true, true]);
    expect(recordsHitKpi(gameData, 'jp_06')).toBe(false);
    expect(missionCampaignId(gameData, 'jp_06')).toBe('jp_hard');
    expect(missionCampaignId(gameData, 'nope')).toBe('');
  });
});
