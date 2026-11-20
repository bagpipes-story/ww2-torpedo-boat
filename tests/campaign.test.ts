import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { defaultCampaign, getCampaigns, getMenuEntries, missionCampaignId, playableMissionIds, recordsHitKpi, unlockPrereqIds } from '../src/config/campaign-data';
import { campaignStatus, legacyUnlocked, parseIdList, parseUnlockMissionIds, parseUnlockRule, serializeIdList } from '../src/core/campaign';

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
  it('data: 米PT（default）と日本ハードモード（complete_us_pt）。米PTの遊べる任務は us_01〜06（v0.8.0 S5 で us_04・v0.8.1 S4 で us_06・v0.8.2 S4 で us_05）、日本は jp_01〜jp_06。短い名前', () => {
    const cs = getCampaigns(gameData);
    expect(cs.map((c) => [c.id, c.shortJa, c.unlock])).toEqual([
      ['us_pt', '米PT', { kind: 'default' }],
      ['jp_hard', '日本', { kind: 'complete', campaignId: 'us_pt' }],
    ]);
    expect(defaultCampaign(gameData).id).toBe('us_pt');
    expect(playableMissionIds(gameData, 'us_pt')).toEqual(['us_01', 'us_02', 'us_03', 'us_04', 'us_05', 'us_06']); // v0.8.0 S5: us_04（ブラケット海峡の夜）に playable_from。v0.8.1 S4: us_06（オルモック湾の決着）も。v0.8.2 S4: us_05（スリガオ海峡・最初の接触）も
    expect(playableMissionIds(gameData, 'jp_hard')).toEqual(['jp_01', 'jp_02', 'jp_03', 'jp_04', 'jp_05', 'jp_06']); // v0.6.4: jp_01（夜の輸送護衛）も遊べる。v0.6.7: jp_02（孤島の哨戒）も。v0.6.9: jp_04（多号作戦・オルモック湾へ）も。v0.6.11 S6: jp_03（運天港・空襲下の退避）も。配列順
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
  it('解放の条件の任務（v0.8.0 S0。spec-v0800 §2.4・lead の既定 L2）: 日本のタブは unlock_mission_ids で米PT の 3 任務のまま（us_04 が遊べるようになっても 3）。米PT は条件なし', () => {
    const [us, jp] = getCampaigns(gameData);
    expect([us!.unlockMissionIds, jp!.unlockMissionIds]).toEqual([null, ['us_01', 'us_02', 'us_03']]);
    expect([unlockPrereqIds(gameData, us!), unlockPrereqIds(gameData, jp!)]).toEqual([[], ['us_01', 'us_02', 'us_03']]);
    expect(String((gameData.missionsSeed.campaigns[1] as Record<string, unknown>)['unlock_mission_ids_source'])).toContain('design (v0.8.0 S0');
    // v0.8.0 S5 から us_04 が遊べる（S0 の木では playable_from を足した写しで確かめた）: 一覧があれば 3 のまま、一覧を消すと v0.6.0 の規則（遊べる米PT の任務を全部＝v0.8.1 S4 の us_06 で 5・v0.8.2 S4 の us_05 で 6）
    expect(playableMissionIds(gameData, 'us_pt')).toEqual(['us_01', 'us_02', 'us_03', 'us_04', 'us_05', 'us_06']);
    const later = clone();
    delete (later.missionsSeed.campaigns[1] as Record<string, unknown>)['unlock_mission_ids'];
    expect(unlockPrereqIds(later, getCampaigns(later)[1]!)).toEqual(['us_01', 'us_02', 'us_03', 'us_04', 'us_05', 'us_06']);
  });
  it('v0.8.0 S5（brief L50）: us_04 が遊べても日本のタブは米PT の 3 任務で開く。(a) us_01〜03 を帰投で終え us_04 は一度も → 開く (b) us_04 だけ帰投で終えた → 未解放・済 0/3 のまま', () => {
    const [us, jp] = getCampaigns(gameData);
    const pre = unlockPrereqIds(gameData, jp!);
    expect(pre).toEqual(['us_01', 'us_02', 'us_03']);
    // (a)
    expect(campaignStatus(jp!.unlock, pre, new Set(['us_01', 'us_02', 'us_03']), false, false)).toEqual({ unlocked: true, done: 3, total: 3 });
    // (b) と、us_04 を足しても数えない（us_04 ＋ 2 任務は 2/3）
    expect(campaignStatus(jp!.unlock, pre, new Set(['us_04']), false, false)).toEqual({ unlocked: false, done: 0, total: 3 });
    expect(campaignStatus(jp!.unlock, pre, new Set(['us_04', 'us_01', 'us_02']), false, false)).toEqual({ unlocked: false, done: 2, total: 3 });
    // Title の未解放のタブの 2 行目（config/menu-config の titleCampaignLockedSubJa。DOM を読む config なのでソースの式を写して埋める）は今の「米PTの 3 任務…（済 0/3）」のまま
    const src = readFileSync(join(__dirname, '..', 'src', 'config', 'menu-config.ts'), 'utf8');
    const tpl = /return `(未解放 ・ \$\{prereqName\}の \$\{total\} 任務を帰投で（済 \$\{done\}\/\$\{total\}）)`;/.exec(src)![1]!;
    const fill = (done: number, total: number): string => tpl.replace('${prereqName}', us!.shortJa).replace('${done}', String(done)).split('${total}').join(String(total));
    expect(fill(0, pre.length)).toBe('未解放 ・ 米PTの 3 任務を帰投で（済 0/3）');
    // v0.5.2 までの端末の移し替え（systems/progress-storage の migrateLegacyUnlocks）も条件の数は 3 のまま
    expect([legacyUnlocked(null, 3, pre.length), legacyUnlocked(null, 2, pre.length)]).toEqual([true, false]);
  });
  it('v0.8.1 S4（brief L65）: us_06 が遊べても日本のタブは米PT の 3 任務で開く。us_06 だけ・us_04 と us_06 を帰投で終えても未解放（済 0/3）、us_06 ＋ 2 任務は 2/3、us_01〜03 なら開く', () => {
    const [, jp] = getCampaigns(gameData);
    const pre = unlockPrereqIds(gameData, jp!);
    expect(pre).toEqual(['us_01', 'us_02', 'us_03']);
    expect(campaignStatus(jp!.unlock, pre, new Set(['us_06']), false, false)).toEqual({ unlocked: false, done: 0, total: 3 });
    expect(campaignStatus(jp!.unlock, pre, new Set(['us_04', 'us_06']), false, false)).toEqual({ unlocked: false, done: 0, total: 3 });
    expect(campaignStatus(jp!.unlock, pre, new Set(['us_06', 'us_01', 'us_03']), false, false)).toEqual({ unlocked: false, done: 2, total: 3 });
    expect(campaignStatus(jp!.unlock, pre, new Set(['us_01', 'us_02', 'us_03']), false, false)).toEqual({ unlocked: true, done: 3, total: 3 });
    expect([legacyUnlocked(null, 3, pre.length), legacyUnlocked(null, 2, pre.length)]).toEqual([true, false]); // v0.5.2 までの端末の移し替えも 3 のまま
  });
  it('v0.8.2 S4（lead の L44）: us_05 が遊べても日本のタブは米PT の 3 任務で開く。us_05 だけ・us_04〜06 を帰投で終えても未解放（済 0/3）、us_05 ＋ 2 任務は 2/3、us_01〜03 なら開く', () => {
    const [, jp] = getCampaigns(gameData);
    const pre = unlockPrereqIds(gameData, jp!);
    expect(pre).toEqual(['us_01', 'us_02', 'us_03']);
    expect(campaignStatus(jp!.unlock, pre, new Set(['us_05']), false, false)).toEqual({ unlocked: false, done: 0, total: 3 });
    expect(campaignStatus(jp!.unlock, pre, new Set(['us_04', 'us_05', 'us_06']), false, false)).toEqual({ unlocked: false, done: 0, total: 3 });
    expect(campaignStatus(jp!.unlock, pre, new Set(['us_05', 'us_02', 'us_03']), false, false)).toEqual({ unlocked: false, done: 2, total: 3 });
    expect(campaignStatus(jp!.unlock, pre, new Set(['us_01', 'us_02', 'us_03']), false, false)).toEqual({ unlocked: true, done: 3, total: 3 });
  });
  it('解放の条件の一覧の検査: 空・重複・文字でない・相手の遊べる任務の外・default のキャンペーンに置く は例外', () => {
    expect(parseUnlockMissionIds(undefined, 'x')).toBeNull();
    expect(parseUnlockMissionIds(['us_01'], 'x')).toEqual(['us_01']);
    for (const bad of [[], ['us_01', 'us_01'], ['us_01', ''], 'us_01', [1]]) expect(() => parseUnlockMissionIds(bad, 'campaigns.jp_hard'), JSON.stringify(bad)).toThrow(/campaigns\.jp_hard の unlock_mission_ids は空でない・重複の無い任務の id の配列/);
    const notPlayable = clone();
    (notPlayable.missionsSeed.campaigns[1] as Record<string, unknown>)['unlock_mission_ids'] = ['us_01', 'us_07']; // v0.8.0 S5 から us_04 は遊べるので、まだ遊べない任務で（v0.8.2 S4 から us_05 も遊べる＝us_07）
    expect(() => getCampaigns(notPlayable)).toThrow(/campaigns\.jp_hard\.unlock_mission_ids（us_01・us_07）は complete_ の相手の遊べる任務（us_01・us_02・us_03・us_04・us_05・us_06）の中だけ/); // v0.8.1 S4: us_06 も遊べる。v0.8.2 S4: us_05 も
    const onDefault = clone();
    (onDefault.missionsSeed.campaigns[0] as Record<string, unknown>)['unlock_mission_ids'] = ['us_01'];
    expect(() => getCampaigns(onDefault)).toThrow(/campaigns\.us_pt\.unlock_mission_ids（us_01）は complete_ の相手の遊べる任務（なし）の中だけ/);
  });
  it('通算の命中率に数えるのは米PTの任務だけ（hit_rate_model.kpi_measurement.campaigns）', () => {
    expect(gameData.hitRateModel.kpi_measurement.campaigns).toEqual(['us_pt']);
    expect(['us_01', 'us_02', 'us_03'].map((id) => recordsHitKpi(gameData, id))).toEqual([true, true, true]);
    expect(recordsHitKpi(gameData, 'jp_06')).toBe(false);
    expect(missionCampaignId(gameData, 'jp_06')).toBe('jp_hard');
    expect(missionCampaignId(gameData, 'nope')).toBe('');
  });
});
