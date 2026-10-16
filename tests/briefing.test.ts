import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gameData, getPrototypeMission, getRaidParams } from '../src/config/game-data';
import { enemyNameJa, getBriefingRecord, getMenuEntries, riskLabelJa } from '../src/config/mission-data';
import { bearingJa, briefingRows, compassJa, enemyCountsJa, formatDateJa, hazardsJa, menuEntries, moonLabelJa, shortLabelJa } from '../src/core/briefing';
import { RAID_ALERT_JA, RAID_CALM_JA, RAID_DISPERSE, RAID_STAY, raidChoiceText, raidOutcomeText, raidResultLine } from '../src/core/sortie';
import { briefingNumbers, buildWorldSetup } from '../src/systems/world-setup';

type Mission = Record<string, unknown>;
const clone = (): typeof gameData => JSON.parse(JSON.stringify(gameData)) as typeof gameData;
const missionsOf = (d: typeof gameData): Mission[] => d.missionsSeed.missions as unknown as Mission[];
const byId = (d: typeof gameData, id: string): Mission => missionsOf(d).find((m) => m['id'] === id)!;
const nameOf = (id: string): string => enemyNameJa(gameData, id);
const labelOf = (id: string): string => riskLabelJa(gameData, id);

/** 人物名の denylist（CLAUDE.md §11）と階級つきの呼び方 */
const PERSON_DENYLIST = ['マッカーサー', 'MacArthur', 'ケネディ', 'Kennedy', 'バルクリー', 'Bulkeley', 'Bulkley', '白石'];
const RANK_RE = /[一-龥ァ-ヶ]{1,6}(中尉|大尉|少佐|中佐|大佐|少将|中将|大将|艇長)/;

describe('任務一覧と Briefing の文（docs/02 §4、v0.4.0）', () => {
  it('任務一覧: 米PTキャンペーンの 3 件を order 順に。v0.4.4 から 3 件とも出撃できる。sub は日付 ・ 場所', () => {
    const menu = getMenuEntries(gameData);
    expect(menu.campaignName).toBe('米PTキャンペーン');
    expect(menu.entries).toEqual([
      { id: 'us_01', title: 'コレヒドール脱出', sub: '1942年3月11日 ・ コレヒドール→ミンダナオ（フィリピン）', playable: true, status: '出撃準備 →' },
      { id: 'us_02', title: '東京急行を迎え撃て', sub: '1942年12月11日 ・ ガダルカナル島沖（アイアンボトム・サウンド）', playable: true, status: '出撃準備 →' },
      { id: 'us_03', title: '大発を狩れ', sub: '1943年7月15日 ・ ニューギニア北岸（フォン半島）', playable: true, status: '出撃準備 →' },
    ]);
  });
  it('任務一覧の検査: 他のキャンペーンと playable_from の無い任務は出ない。書式違い・日付違い・order の重複・出撃できる任務が無いのは例外', () => {
    const US_IDS = ['us_01', 'us_02', 'us_03'];
    expect(getMenuEntries(gameData).entries.map((e) => e.id)).toEqual(US_IDS);
    const otherCampaign = clone();
    byId(otherCampaign, 'jp_01')['playable_from'] = 'v0.5.0';
    expect(getMenuEntries(otherCampaign).entries.map((e) => e.id)).toEqual(US_IDS);
    expect(() => menuEntries(gameData.missionsSeed.missions, 'jp_hard')).toThrow(/出撃できる任務/);
    const badFrom = clone();
    byId(badFrom, 'us_03')['playable_from'] = '0.4.1';
    expect(() => getMenuEntries(badFrom)).toThrow();
    const badDate = clone();
    byId(badDate, 'us_01')['date'] = '1942/03/11';
    expect(() => getMenuEntries(badDate)).toThrow();
    const dupOrder = clone();
    byId(dupOrder, 'us_03')['order'] = 2;
    expect(() => getMenuEntries(dupOrder)).toThrow();
    const nonePlayable = clone();
    delete byId(nonePlayable, 'us_01')['v0_1_prototype'];
    delete byId(nonePlayable, 'us_02')['v0_1_prototype'];
    delete byId(nonePlayable, 'us_03')['v0_1_prototype'];
    expect(() => getMenuEntries(nonePlayable)).toThrow();
  });
  it('日付: 1942-12-11 → 1942年12月11日、1942-03-11 → 1942年3月11日、1942/12/11 は例外', () => {
    expect(formatDateJa('1942-12-11')).toBe('1942年12月11日');
    expect(formatDateJa('1942-03-11')).toBe('1942年3月11日');
    expect(() => formatDateJa('1942/12/11')).toThrow();
  });
  it('注記を落とす: 座礁（敵地での処分18を含む）→ 座礁、駆逐艦（陽炎型・秋月型の簡略）→ 駆逐艦、大発動艇（大発）→ 大発動艇、暴風・敵艦の砲撃・衝突はそのまま', () => {
    expect(shortLabelJa('座礁（敵地での処分18を含む）')).toBe('座礁');
    expect(shortLabelJa('駆逐艦（陽炎型・秋月型の簡略）')).toBe('駆逐艦');
    expect(shortLabelJa('大発動艇（大発）')).toBe('大発動艇');
    expect(shortLabelJa('暴風')).toBe('暴風');
    expect(shortLabelJa('敵艦の砲撃・衝突')).toBe('敵艦の砲撃・衝突');
    expect(shortLabelJa('（注）')).toBe('（注）');
  });
  it('月: dark 新月、half 半月、full 満月', () => {
    expect(moonLabelJa('dark')).toBe('新月');
    expect(moonLabelJa('half')).toBe('半月');
    expect(moonLabelJa('full')).toBe('満月');
  });
  it('敵の数: 出てきた順にまとめる。空なら なし', () => {
    expect(enemyCountsJa(['ijn_destroyer', 'ijn_destroyer', 'daihatsu_barge'], nameOf)).toBe('駆逐艦 ×2、大発動艇 ×1');
    expect(enemyCountsJa([], nameOf)).toBe('なし');
  });
  it('危険: harbor_fire_explosion を除いて「、」でつなぐ。空なら なし', () => {
    expect(hazardsJa(['storm', 'grounding', 'harbor_fire_explosion'], labelOf, ['harbor_fire_explosion'])).toBe('暴風、座礁');
    expect(hazardsJa(['harbor_fire_explosion'], labelOf, ['harbor_fire_explosion'])).toBe('なし');
  });
  it('方角（6000×4000）', () => {
    expect(compassJa(5400, 600, 6000, 4000)).toBe('北東');
    expect(compassJa(3000, 2000, 6000, 4000)).toBe('中央');
    expect(compassJa(600, 2000, 6000, 4000)).toBe('西');
    expect(compassJa(3000, 3900, 6000, 4000)).toBe('南');
    expect(compassJa(5900, 3900, 6000, 4000)).toBe('南東');
  });
  it('方位の 8 方角（2 行目の「大発は東から」）: 90 → 東、0 → 北、225 → 南西、−90 → 西', () => {
    expect([bearingJa(90), bearingJa(0), bearingJa(225), bearingJa(-90)]).toEqual(['東', '北', '南西', '西']);
  });
  it('us_02 の Briefing: 6 行と史実メモ', () => {
    const rec = getBriefingRecord(gameData, 'us_02');
    expect(rec.titleJa).toBe('東京急行を迎え撃て');
    expect(formatDateJa(rec.date)).toBe('1942年12月11日');
    expect(rec.place).toBe('ガダルカナル島沖（アイアンボトム・サウンド）');
    expect(rec.noteJa).toBe('PT-37・40（諸説）が駆逐艦照月に命中し爆沈。PT-44喪失。照月の残骸は2025年7月に発見。');
    expect(briefingRows(rec, briefingNumbers(buildWorldSetup(gameData, 'us_02')), nameOf, labelOf)).toEqual([
      { label: '目的', text: '夜間に補給に来る駆逐艦を雷撃し、生還する' },
      { label: '成功', text: '帰投。命中はボーナス（帰投地点は北東の青い輪）' },
      { label: '月', text: '半月 ・ 見える 1500 m ・ 見つかる 巡航 2000 m／静音 1000 m' },
      { label: '敵', text: '駆逐艦 ×1、輸送船 ×1（北西から）' },
      { label: '危険', text: '暴風、敵艦艇の砲撃・衝突、敵航空機、座礁、友軍誤射' },
      { label: '条件', text: '夜明けまで 150 秒 ・ 燃料 38 gal ・ 魚雷 4 本' },
    ]);
  });
  it('?debug の上書きも出る: fuel 20・dawn 60 → 条件「夜明けまで 60 秒 ・ 燃料 20 gal ・ 魚雷 4 本」。小数の燃料は 1 桁', () => {
    const rec = getBriefingRecord(gameData, 'us_02');
    expect(briefingRows(rec, briefingNumbers(buildWorldSetup(gameData, 'us_02', { fuelGal: 20, dawnS: 60 })), nameOf, labelOf)[5]!.text).toBe('夜明けまで 60 秒 ・ 燃料 20 gal ・ 魚雷 4 本');
    expect(briefingRows(rec, { ...briefingNumbers(buildWorldSetup(gameData, 'us_02')), fuelGal: 34.25 }, nameOf, labelOf)[5]!.text).toBe('夜明けまで 150 秒 ・ 燃料 34.3 gal ・ 魚雷 4 本');
  });
  it('人物名を出さない（CLAUDE.md §11）: 一覧の 3 任務の画面に出す文と空襲の文に人物名が無い。src は historical_note を読まない', () => {
    const raidData = clone();
    const proto = byId(raidData, 'us_02')['v0_1_prototype'] as Record<string, unknown>;
    proto['hazards'] = [...(proto['hazards'] as string[]), 'harbor_fire_explosion'];
    const p = getRaidParams(raidData, getPrototypeMission(raidData, 'us_02'))!;
    const s = { missionId: 'us_02', seed: 3, raid: true, choice: RAID_STAY, stayHit: true, hard: false };
    const texts: string[] = [RAID_ALERT_JA, RAID_CALM_JA, raidChoiceText(p, RAID_DISPERSE).detail, raidChoiceText(p, RAID_STAY).detail, raidOutcomeText(s, p), raidResultLine(s, p, 1)];
    for (const e of getMenuEntries(gameData).entries) {
      const m = byId(gameData, e.id);
      for (const k of ['title_ja', 'place', 'objective', 'success', 'briefing_note_ja']) texts.push(String(m[k]));
      texts.push(e.title, e.sub, e.status);
    }
    for (const t of texts) {
      for (const name of PERSON_DENYLIST) expect(t).not.toContain(name);
      expect(RANK_RE.test(t)).toBe(false);
    }
    // src/ の .ts はコメントを除いて historical_note を読まない
    const srcDir = join(__dirname, '..', 'src');
    const files = readdirSync(srcDir, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.ts'));
    for (const f of files) {
      const code = readFileSync(join(srcDir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
      expect(code.includes('historical_note'), f).toBe(false);
    }
  });
  it.each(['us_01', 'us_02', 'us_03'])('data の整合: %s の hazards は世界の block に一致し（us_02 の港内空襲は実機で外した）、id はすべて risk_events に、敵は enemies にある', (id) => {
    const m = getPrototypeMission(gameData, id);
    const proto = (byId(gameData, id)['v0_1_prototype'] as Record<string, unknown>);
    const enemyIds = proto['enemies'] as string[];
    const armed = enemyIds.some((id) => {
      const e = gameData.enemies.enemies.find((x) => x.id === id) as unknown as Record<string, unknown>;
      return Array.isArray(e['guns']) && (e['guns'] as unknown[]).length > 0;
    });
    const expected = new Set<string>();
    if (m.storm) expected.add('storm');
    if (m.shallows.length > 0) expected.add('grounding');
    if (m.friendlyAircraft) expected.add('friendly_fire');
    if (m.enemyAircraft) expected.add('enemy_aircraft');
    if (armed) expected.add('enemy_ship_gunfire_or_ram');
    if (m.shoreBattery) expected.add('shore_battery');
    expect(new Set(m.hazards)).toEqual(expected);
    for (const h of m.hazards) expect(gameData.riskEvents.events.some((e) => e.id === h)).toBe(true);
    for (const id of enemyIds) expect(gameData.enemies.enemies.some((e) => e.id === id)).toBe(true);
  });
});
