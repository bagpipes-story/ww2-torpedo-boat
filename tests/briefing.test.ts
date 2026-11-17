import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gameData, getPrototypeMission, getRaidParams } from '../src/config/game-data';
import { getMenuEntries } from '../src/config/mission-data';
import { playableMissionIds } from '../src/config/campaign-data';
import { enemyNameJa, getBriefingRecord, riskLabelJa } from '../src/config/briefing-data';
import { bearingJa, briefingRows, compassJa, enemyCountsJa, formatDateJa, hazardsJa, menuEntries, moonLabelJa, shortLabelJa } from '../src/core/briefing';
import { RAID_ALERT_JA, RAID_CALM_JA, RAID_DISPERSE, RAID_STAY, raidChoiceText, raidOutcomeText, raidResultLine } from '../src/core/sortie';
import { briefingNumbers, buildWorldSetup } from '../src/systems/world-setup';
import { getEngineParams } from '../src/config/engine-mission-data';
import { FAMOUS_BOAT_RE, PERSON_DENYLIST, PT_NUMBER_RE, RANK_RE } from './person-denylist';
import { ANCHOR_HINT_JA, ANCHOR_UNDERWAY_JA, anchorBackdropLineJa, anchorWithdrawJa } from '../src/ui/anchor-lines';
import { anchorResultLineJa } from '../src/ui/anchor-result';
import { resultHeadingJa } from '../src/ui/result-heading';
import { bowOnLineJa } from '../src/ui/strait-lines';
import { createHash } from 'node:crypto';
import { directSortie } from '../src/core/sortie';
import { OTHER_BRIEFING_IDS, otherBriefingsJson } from './briefing-other-kit';
import { BRIEF_NOTE_PX, BRIEF_ROW_PX, BRIEF_WRAP, phaserWrap } from './wrap-kit';

type Mission = Record<string, unknown>;
const clone = (): typeof gameData => JSON.parse(JSON.stringify(gameData)) as typeof gameData;
const missionsOf = (d: typeof gameData): Mission[] => d.missionsSeed.missions as unknown as Mission[];
const byId = (d: typeof gameData, id: string): Mission => missionsOf(d).find((m) => m['id'] === id)!;
const nameOf = (id: string): string => enemyNameJa(gameData, id);
const labelOf = (id: string): string => riskLabelJa(gameData, id);

describe('任務一覧と Briefing の文（docs/02 §4、v0.4.0）', () => {
  it('任務一覧: 米PTキャンペーンの 5 件を order 順に。v0.4.4 から 3 件とも出撃でき、v0.8.0 S5 で us_04 も（Title の格子の右下）、v0.8.1 S4 で us_06 も（3 段目の左）。sub は日付 ・ 場所', () => {
    const menu = getMenuEntries(gameData);
    expect(menu.campaignName).toBe('米PTキャンペーン');
    expect(menu.entries).toEqual([
      { id: 'us_01', title: 'コレヒドール脱出', sub: '1942年3月11日 ・ コレヒドール→ミンダナオ（フィリピン）', playable: true, status: '出撃準備 →' },
      { id: 'us_02', title: '東京急行を迎え撃て', sub: '1942年12月11日 ・ ガダルカナル島沖（アイアンボトム・サウンド）', playable: true, status: '出撃準備 →' },
      { id: 'us_03', title: '大発を狩れ', sub: '1943年7月15日 ・ ニューギニア北岸（フォン半島）', playable: true, status: '出撃準備 →' },
      { id: 'us_04', title: 'ブラケット海峡の夜', sub: '1943年8月1日 ・ ブラケット海峡（コロンバンガラ島沖）', playable: true, status: '出撃準備 →' },
      { id: 'us_06', title: 'オルモック湾の決着', sub: '1944年12月11日 ・ パロンポン沖（レイテ島西岸）', playable: true, status: '出撃準備 →' },
    ]);
  });
  it('任務一覧の検査: 他のキャンペーンと playable_from の無い任務は出ない。書式違い・日付違い・order の重複・出撃できる任務が無いのは例外', () => {
    const US_IDS = ['us_01', 'us_02', 'us_03', 'us_04', 'us_06']; // v0.8.0 S5: us_04 に playable_from（v0.8.0）。v0.8.1 S4: us_06 にも（v0.8.1）
    expect(getMenuEntries(gameData).entries.map((e) => e.id)).toEqual(US_IDS);
    const otherCampaign = clone();
    byId(otherCampaign, 'jp_01')['playable_from'] = 'v0.5.0';
    expect(getMenuEntries(otherCampaign).entries.map((e) => e.id)).toEqual(US_IDS);
    // 日本側（v0.6.0）: jp_01・jp_05 は準備中（版）、jp_06 は出撃できる。jp_06 の世界を消すと出撃できる任務が無くて例外。
    // v0.6.1: 版を付け替え（v0.6.1 夜明け・v0.6.2 敵が退く・v0.6.3 昼の海が入ったので、jp_05 は v0.6.4、jp_01 は v0.6.5）
    // v0.6.3: jp_05 は米PT で出撃できる、jp_01 は v0.6.4（jp_05・jp_06 の世界を消すと例外）
    // v0.6.4: jp_01 も出撃できる（味方の大発の輸送隊）。3 つの世界をみな消すと例外
    // v0.6.7: jp_02「孤島の哨戒」も出撃できる（米の飛行艇の夜の哨戒。order 2 なので 2 番目＝Title の格子の右上）
    // v0.6.9: jp_04「多号作戦・オルモック湾へ」も出撃できる（停泊して揚陸する輸送船を米PT の雷撃から守る。order 4 なので 3 番目＝格子の 2 段目の左）
    // v0.6.11 S6: jp_03「運天港・空襲下の退避」も出撃できる（order 3 なので 3 番目＝格子の 2 段目の左。jp_04 は 2 段目の右へ）。6 件＝2 列 × 3 段で満杯
    expect(menuEntries(gameData.missionsSeed.missions, 'jp_hard').map((e) => [e.id, e.playable, e.status])).toEqual([
      ['jp_01', true, '出撃準備 →'],
      ['jp_02', true, '出撃準備 →'],
      ['jp_03', true, '出撃準備 →'],
      ['jp_04', true, '出撃準備 →'],
      ['jp_05', true, '出撃準備 →'],
      ['jp_06', true, '出撃準備 →'],
    ]);
    const jpNone = clone();
    delete byId(jpNone, 'jp_06')['v0_1_prototype'];
    delete byId(jpNone, 'jp_01')['v0_1_prototype'];
    delete byId(jpNone, 'jp_02')['v0_1_prototype'];
    delete byId(jpNone, 'jp_04')['v0_1_prototype'];
    delete byId(jpNone, 'jp_03')['v0_1_prototype'];
    expect(() => menuEntries(jpNone.missionsSeed.missions, 'jp_hard')).not.toThrow(); // jp_05 が残る
    delete byId(jpNone, 'jp_05')['v0_1_prototype'];
    expect(() => menuEntries(jpNone.missionsSeed.missions, 'jp_hard')).toThrow(/出撃できる任務/);
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
    expect(() => getMenuEntries(nonePlayable)).toThrow(); // 日本のタブの解放の一覧（us_01〜03）が遊べる任務の外になる（v0.8.0 S0 の getCampaigns の検査）
    expect(() => menuEntries(nonePlayable.missionsSeed.missions, 'us_pt')).not.toThrow(); // v0.8.0 S5: us_04 が残る（v0.8.1 S4 から us_06 も）
    delete byId(nonePlayable, 'us_04')['v0_1_prototype'];
    expect(() => menuEntries(nonePlayable.missionsSeed.missions, 'us_pt')).not.toThrow(); // v0.8.1 S4: us_06 が残る
    delete byId(nonePlayable, 'us_06')['v0_1_prototype'];
    expect(() => menuEntries(nonePlayable.missionsSeed.missions, 'us_pt')).toThrow(/出撃できる任務/);
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
    expect(moonLabelJa('day')).toBe('昼'); // v0.6.11（jp_03 は moon_label_ja「昼（07:00 空襲警報）」で差し替える）
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
      { label: '成功', text: '帰投（敵艦隊がいなくなれば不要）。命中はボーナス（帰投地点は北東の青い輪）' }, // v0.6.2 実機 1 回目: fleet_gone_clears
      { label: '月', text: '半月 ・ 見える 1500 m ・ 見つかる 巡航 2000 m／静音 1000 m' },
      { label: '敵', text: '駆逐艦 ×1、輸送船 ×1（北西から）' },
      { label: '危険', text: '暴風、敵艦艇の砲撃・衝突、敵航空機、座礁、友軍誤射' },
      { label: '条件', text: '夜明けまで 150 秒（昼の空は味方・敵は北へ退く） ・ 燃料 38 gal ・ 魚雷 4 本 ・\u00a0機銃は艦に効かない' }, // v0.6.8: もう一つの兵装の一言（「・」の後はノーブレークスペース）
    ]);
  });
  it('?debug の上書きも出る: fuel 20・dawn 60 → 条件「夜明けまで 60 秒（昼の空は味方・敵は北へ退く） ・ 燃料 20 gal ・ 魚雷 4 本 ・ 機銃は艦に効かない」。小数の燃料は 1 桁', () => {
    const rec = getBriefingRecord(gameData, 'us_02');
    expect(briefingRows(rec, briefingNumbers(buildWorldSetup(gameData, 'us_02', { fuelGal: 20, dawnS: 60 })), nameOf, labelOf)[5]!.text).toBe('夜明けまで 60 秒（昼の空は味方・敵は北へ退く） ・ 燃料 20 gal ・ 魚雷 4 本 ・\u00a0機銃は艦に効かない');
    expect(briefingRows(rec, { ...briefingNumbers(buildWorldSetup(gameData, 'us_02')), fuelGal: 34.25 }, nameOf, labelOf)[5]!.text).toBe('夜明けまで 150 秒（昼の空は味方・敵は北へ退く） ・ 燃料 34.3 gal ・ 魚雷 4 本 ・\u00a0機銃は艦に効かない');
  });
  it('人物名を出さない（CLAUDE.md §11）: 一覧の 3 任務の画面に出す文と空襲の文に人物名が無い。src は historical_note を読まない', () => {
    const raidData = clone();
    const proto = byId(raidData, 'us_02')['v0_1_prototype'] as Record<string, unknown>;
    proto['hazards'] = [...(proto['hazards'] as string[]), 'harbor_fire_explosion'];
    const p = getRaidParams(raidData, getPrototypeMission(raidData, 'us_02'))!;
    const s = { missionId: 'us_02', seed: 3, raid: true, choice: RAID_STAY, stayHit: true, hard: false, historical: false };
    const texts: string[] = [RAID_ALERT_JA, RAID_CALM_JA, raidChoiceText(p, RAID_DISPERSE).detail, raidChoiceText(p, RAID_STAY).detail, raidOutcomeText(s, p), raidResultLine(s, p, 1)];
    // v0.6.0: 日本側の一覧も（実在の人物を出さない。CLAUDE.md §11）
    for (const e of [...getMenuEntries(gameData).entries, ...getMenuEntries(gameData, 'jp_hard').entries]) {
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
  it.each(['us_01', 'us_02', 'us_03', 'jp_01', 'jp_02', 'jp_03', 'jp_04', 'jp_05', 'jp_06'])('data の整合: %s の hazards は世界の block に一致し（us_02 の港内空襲は実機で外した）、id はすべて risk_events に、敵は enemies にある', (id) => {
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
    if (m.dawnStrike) expected.add('dawn_air_strike'); // 夜明けの空襲（v0.6.1。敵の制空下の任務だけ）
    if (getEngineParams(gameData, id)) expected.add('engine_failure'); // 機関の不調（v0.6.5。jp_05 だけ）
    if (proto['patrol_air'] !== undefined) expected.add('patrol_air'); // 夜の哨戒機（v0.6.7。jp_02 だけ）
    if (proto['evac_raid'] !== undefined) expected.add('unten_air_raid'); // 港の空襲（v0.6.11。jp_03 だけ）
    expect(new Set(m.hazards)).toEqual(expected);
    for (const h of m.hazards) expect(gameData.riskEvents.events.some((e) => e.id === h)).toBe(true);
    for (const id of enemyIds) expect(gameData.enemies.enemies.some((e) => e.id === id)).toBe(true);
  });
});

// v0.8.0 S4（spec-v0800 §4.9・§4.6・§4.12、brief L25・L34）: us_04 の Briefing（月の行の尾・敵の来る方角「西と北西」・ハードの ×5）と、ほかの任務の文がバイト同一の証。
// 基準の sha256: v0.8.0 S4 は S3 の commit（e8be5eb）の木の 9 任務（84,709 字・b59abff9…）。v0.8.1 S4（lead の L60）から us_04 を足した 10 任務で、main e9d80ea（v0.8.0 のマージ）の木に
// tests/briefing-other-kit.ts を写して esbuild で回した値（94,917 字。この木の値も同じ＝us_06 の S4 の文はほかの 10 任務の Briefing を 1 字も変えない）。
describe('us_04 の Briefing（v0.8.0 S4）とほかの任務の文のバイト同一', () => {
  const OTHER_SHA = '4dcef19ffd9b3b3900242608a5ca807f21031fac72a2260021e23716044eb47d';
  it('ほかの 10 任務（us_06 のほか。ノーマル・ハード × 史実モード × seed 4 つ）の日付・場所・題・6 行・史実は main e9d80ea と同じ（sha256）', () => {
    expect(OTHER_BRIEFING_IDS.length).toBe(10);
    expect([...OTHER_BRIEFING_IDS].sort()).toEqual([...playableMissionIds(gameData, 'us_pt'), ...playableMissionIds(gameData, 'jp_hard')].filter((id) => id !== 'us_06').sort());
    const j = otherBriefingsJson();
    expect(j.length).toBe(94917);
    expect(createHash('sha256').update(j).digest('hex')).toBe(OTHER_SHA);
  });
  const rowsOf = (hard: boolean, seed = 1, radarOff = false): { label: string; text: string }[] => {
    const setup = buildWorldSetup(gameData, 'us_04', { sortie: directSortie('us_04', seed, 'none', hard, false), hard, radarOff });
    const rec = { ...getBriefingRecord(gameData, 'us_04', hard), hazardIds: setup.hazardsTonight, absentHazardIds: setup.absentHazards };
    return briefingRows(rec, briefingNumbers(setup, '見越し点マーカー 使用可'), nameOf, labelOf);
  };
  it('6 行（数は data から: 燃料・射程・夜明け）。ハードは駆逐艦 ×5。?debug&noradar は月の行の尾だけが無い', () => {
    const p = getPrototypeMission(gameData, 'us_04');
    const radar = gameData.hitRateModel.radar.models.so_early.ship_range_m;
    const fuel = (byId(gameData, 'us_04')['v0_1_prototype'] as Record<string, unknown>)['fuel_allotment_gal'];
    for (const hard of [false, true]) {
      expect(rowsOf(hard).map((r) => `${r.label}: ${r.text}`)).toEqual([
        `目的: ${String(byId(gameData, 'us_04')['objective'])}`,
        '成功: 帰投。1隻撃沈で達成（帰投地点は南西の青い輪）',
        `月: 新月 ・ 見える 900 m ・ 見つかる 巡航 1200 m／静音 600 m ・\u00a0レーダー\u00a0${radar}\u00a0m（陸のそばは映らない）`, // 句の中はノーブレークスペース（句ごと 2 行目へ）
        `敵: 駆逐艦 ×${hard ? 5 : 4}（西と北西から）`,
        '危険: 敵艦艇の砲撃・衝突、敵航空機、座礁、友軍誤射、夜明けの空襲',
        `条件: 夜明けまで ${p.durationS} 秒（以後は空襲・敵は西へ退く） ・ 燃料 ${String(fuel)} gal ・ 魚雷 4 本 ・\u00a0機銃は艦に効かない ・ 見越し点マーカー 使用可`,
      ]);
    }
    expect(rowsOf(false, 1, true)[2]!.text).toBe('新月 ・ 見える 900 m ・ 見つかる 巡航 1200 m／静音 600 m');
    const rec = getBriefingRecord(gameData, 'us_04');
    expect([formatDateJa(rec.date), rec.place, rec.titleJa]).toEqual(['1943年8月1日', 'ブラケット海峡（コロンバンガラ島沖）', 'ブラケット海峡の夜']);
    // v0.8.0 S5（brief L57）: 目的の文に隻数を書かない（ノーマルは列 3 ＋ 護衛 1、ハードは列 4 ＋ 護衛 1＝敵の行の ×4／×5 が言う）。ハードの文は持たない
    expect(rec.objective).toBe('東京急行の駆逐艦がビラへ向かい、揚げ終えると同じ海峡を全速で戻る。分隊の先頭の艇としてレーダーで捉えて雷撃し、進路をよけて生きて帰れ');
    expect(getBriefingRecord(gameData, 'us_04', true).objective).toBe(rec.objective);
  });
  it('今夜の揺らぎ（seed 1〜60・ノーマルとハード）でも敵の行は「西と北西から」か「西から」（護衛の出発点が西に寄った夜は方角を 1 つに）', () => {
    const seen = new Set<string>();
    for (const hard of [false, true]) for (let seed = 1; seed <= 60; seed++) seen.add(rowsOf(hard, seed)[3]!.text.replace(/×\d/, '×N'));
    expect([...seen].every((t) => t === '駆逐艦 ×N（西と北西から）' || t === '駆逐艦 ×N（西から）')).toBe(true);
  });
  it('行の数（24 px・1,056 px。1 字の余白でも）: 目的 2・成功 1・月 2・敵 1・危険 1・条件 2、史実 3（20 px）。下端は出撃のボタンの上端 584 − 8 の内', () => {
    for (const hard of [false, true]) {
      const r = rowsOf(hard).map((x) => x.text);
      for (const W of [BRIEF_WRAP, BRIEF_WRAP - BRIEF_ROW_PX]) expect(r.map((t) => phaserWrap(t, BRIEF_ROW_PX, W).length), `${hard} ${W}`).toEqual([2, 1, 2, 1, 1, 2]);
      expect(phaserWrap(r[2]!)[1]).toBe(`・\u00a0レーダー\u00a04000\u00a0m（陸のそばは映らない）`); // 月の行の 2 行目は尾の句ごと（「4000⏎m」と割れない）
      const note = getBriefingRecord(gameData, 'us_04', hard).noteJa;
      // 史実は 3 行（「PT 15隻」の間はノーブレークスペース＝1 行目が「…の夜、PT」で切れない）。行の頭に「、」「。」が来ない（1,020〜1,070 px のどれでも）
      for (let W = 1020; W <= 1070; W++) {
        const l = phaserWrap(note, BRIEF_NOTE_PX, W);
        expect(l.length, String(W)).toBe(3);
        for (const x of l.slice(1)) expect(x, String(W)).not.toMatch(/^[、。）・]/);
      }
    }
    const lh = (px: number): number => Math.ceil(px * 1.25);
    const bottom = 148 + [2, 1, 2, 1, 1, 2].reduce((a, n) => a + n * lh(BRIEF_ROW_PX) + 10, 0) + 8 + 3 * lh(BRIEF_NOTE_PX);
    expect(bottom).toBe(561);
    expect(bottom).toBeLessThanOrEqual(584 - 8);
  });
  it('人物・有名な艇の番号・逸話の島の名を出さない（§4.12）: us_04 の題・場所・目的・成功・6 行・史実（ノーマル・ハード）', () => {
    const texts: string[] = [];
    for (const hard of [false, true]) {
      const rec = getBriefingRecord(gameData, 'us_04', hard);
      texts.push(rec.titleJa, rec.place, rec.objective, rec.success, rec.noteJa, ...rowsOf(hard).map((r) => r.text));
    }
    for (const t of texts) {
      for (const name of PERSON_DENYLIST) expect(t).not.toContain(name);
      expect(RANK_RE.test(t) || FAMOUS_BOAT_RE.test(t), t).toBe(false);
    }
  });
});

// v0.8.1 S4（spec-v0810 §3.7 D-O1・D-O5・D-O6・§3.8、lead の L64）: us_06 の Briefing（目的・史実メモ・月の行の尾・敵の行「（南西に停泊）」とハードの駆潜艇・危険・条件）と、
// us_06 の画面の文の全部（Title の札・Briefing・HUD の新しい文・Result の 1 行と見出し・夜明けの帯）に人名・階級つきの呼び方・PT の番号（/PT-?\s*\d/。隻数は番号でない）が無いこと。
describe('us_06 の Briefing（v0.8.1 S4）と画面の文の人名・PT の番号', () => {
  const rowsOf = (hard: boolean, seed = 1): { label: string; text: string }[] => {
    const setup = buildWorldSetup(gameData, 'us_06', { sortie: directSortie('us_06', seed, 'none', hard, false), hard });
    const rec = { ...getBriefingRecord(gameData, 'us_06', hard), hazardIds: setup.hazardsTonight, absentHazardIds: setup.absentHazards };
    return briefingRows(rec, briefingNumbers(setup, '見越し点マーカー 使用可'), nameOf, labelOf);
  };
  const proto = (): Record<string, unknown> => byId(gameData, 'us_06')['v0_1_prototype'] as Record<string, unknown>;
  it('6 行（数は data から: 夜明け・燃料・魚雷・射程・駆潜艇の隻数）。ハードは敵の行に「駆潜艇 ×2」。目的・成功・史実は data の文（ハードも同じ）', () => {
    const p = getPrototypeMission(gameData, 'us_06');
    const radar = gameData.hitRateModel.radar.models.so_late.ship_range_m;
    const pickets = ((proto()['hard'] as Record<string, unknown>)['extra_pickets'] as unknown[]).length;
    const torps = buildWorldSetup(gameData, 'us_06').torpedoCapacity;
    for (const hard of [false, true]) {
      expect(rowsOf(hard).map((r) => `${r.label}: ${r.text}`)).toEqual([
        `目的: ${String(byId(gameData, 'us_06')['objective'])}`,
        '成功: 帰投。卯月を撃沈すれば達成（帰投地点は北東の青い輪）',
        `月: 月没後 ・ 見える 900 m ・ 見つかる 巡航 1200 m／静音 600 m ・ レーダー ${radar} m（陸のそばは映らない）`,
        `敵: 駆逐艦 ×1、輸送船 ×1${hard ? `、駆潜艇 ×${pickets}` : ''}（南西に停泊）`,
        '危険: 敵艦艇の砲撃・衝突、敵航空機、夜明けの空襲 ・\u00a0停泊艦の南の岸の陰から寄れ', // v0.8.1 IP1: 寄り方の手がかり（危険の行の尾。&nobackdrop では出ない）。IP2: 夜の水上機の「敵航空機」と、1 行に収める短い尾
        `条件: 夜明けまで ${p.durationS} 秒（以後は空襲・敵は東へ退く） ・ 燃料 ${String(proto()['fuel_allotment_gal'])} gal ・ 魚雷 ${torps} 本 ・ 機銃は艦に効かない ・ 見越し点マーカー 使用可`,
      ]);
    }
    expect([pickets, p.durationS, proto()['fuel_allotment_gal'], torps, radar]).toEqual([2, 200, 40, 4, 6000]);
    const rec = getBriefingRecord(gameData, 'us_06');
    expect([formatDateJa(rec.date), rec.place, rec.titleJa]).toEqual(['1944年12月11日', 'パロンポン沖（レイテ島西岸）', 'オルモック湾の決着']);
    expect(rec.objective).toBe('パロンポン沖に止まった駆逐艦 卯月と、揚陸中の輸送船 空知丸。レーダーで捉え、暗い岸を背に忍び寄って雷撃し、動き出した艦から逃れて帰れ');
    expect(rec.noteJa).toBe('1944年12月12日1時ごろ、パロンポン沖に止まっていた駆逐艦卯月を、レーダーで捉えた米PT\u00a02隻が暗い岸を背に忍び寄り、約900\u00a0mから魚雷6本を撃って2本以上を当てて沈めた。輸送船空知丸は駆潜艇2隻に導かれて揚陸していた。日本のタブの「多号作戦・オルモック湾へ」と同じ夜。');
    expect(getBriefingRecord(gameData, 'us_06', true).noteJa).toBe(rec.noteJa); // 句の間はノーブレークスペース（S0 の data。Phaser の折り返しは半角スペースで切る）
  });
  it('敵の行の「南西に停泊」は自艇の出発点から見た今夜の卯月（seed 1〜60・ノーマルとハード）。止まった艦の無い任務には鍵が無い', () => {
    const seen = new Set<string>();
    for (const hard of [false, true]) for (let seed = 1; seed <= 60; seed++) seen.add(rowsOf(hard, seed)[3]!.text.replace(/、駆潜艇 ×2/, ''));
    expect([...seen]).toEqual(['駆逐艦 ×1、輸送船 ×1（南西に停泊）']);
    for (const id of OTHER_BRIEFING_IDS) expect('enemyAtJa' in briefingNumbers(buildWorldSetup(gameData, id)), id).toBe(false);
    // v0.8.1 IP1: 危険の行の尾（岸の陰の手がかり）も背に岸の任務だけ。&nobackdrop（背に岸の無い夜）にも出さない
    for (const id of OTHER_BRIEFING_IDS) expect('hazardTailJa' in briefingNumbers(buildWorldSetup(gameData, id)), id).toBe(false);
    expect('hazardTailJa' in briefingNumbers(buildWorldSetup(gameData, 'us_06', { backdropOff: true }))).toBe(false);
  });
  it('行の数（24 px・1,056 px。1 字の余白でも）: 目的 2・成功 1・月 2・敵 1・危険 1・条件 2、史実 3（20 px）。下端は出撃のボタンの上端 584 − 8 の内（us_04 と同じ 561）', () => {
    for (const hard of [false, true]) {
      const r = rowsOf(hard).map((x) => x.text);
      for (const W of [BRIEF_WRAP, BRIEF_WRAP - BRIEF_ROW_PX]) expect(r.map((t) => phaserWrap(t, BRIEF_ROW_PX, W).length), `${hard} ${W}`).toEqual([2, 1, 2, 1, 1, 2]);
      for (const W of [BRIEF_WRAP, BRIEF_WRAP - BRIEF_ROW_PX]) expect(phaserWrap(getBriefingRecord(gameData, 'us_06', hard).noteJa, BRIEF_NOTE_PX, W).length, `${hard} ${W}`).toBe(3);
    }
    const lh = (px: number): number => Math.ceil(px * 1.25);
    const bottom = 148 + [2, 1, 2, 1, 1, 2].reduce((a, n) => a + n * lh(BRIEF_ROW_PX) + 10, 0) + 8 + 3 * lh(BRIEF_NOTE_PX);
    expect(bottom).toBe(561);
    expect(bottom).toBeLessThanOrEqual(584 - 8);
  });
  it('us_06 の画面の文の全部（Title の札・Briefing・HUD の新しい文・Result の 1 行と見出し・夜明けの帯）に人名・階級つきの呼び方・PT の番号が無い', () => {
    const texts: string[] = [];
    const card = getMenuEntries(gameData).entries.find((e) => e.id === 'us_06')!;
    texts.push(card.title, card.sub, card.status);
    for (const hard of [false, true]) {
      const rec = getBriefingRecord(gameData, 'us_06', hard);
      texts.push(rec.titleJa, rec.place, rec.objective, rec.success, rec.noteJa, ...rowsOf(hard).map((r) => r.text));
    }
    texts.push(anchorBackdropLineJa(7), ANCHOR_UNDERWAY_JA, ANCHOR_HINT_JA, bowOnLineJa(5, true), resultHeadingJa('rammed', NaN, true, false, false, true));
    texts.push(anchorResultLineJa({ nameJa: '卯月', sunk: true, underwayS: 85, reason: 2, heldShots: 4, heldHits: 2, backdropS: 48 }));
    const t = { anchor: {}, transportEnabled: true, transportSunk: false, shipsSunk: 0, shipsTotal: 1, torpedoesLeft: 2, dawn: { forceJa: '日本の艦', retireJa: '東' } } as never;
    texts.push(anchorWithdrawJa(t, 'x'), anchorWithdrawJa({ ...(t as object), shipsSunk: 1 } as never, 'x'));
    for (const s of texts) {
      for (const name of PERSON_DENYLIST) expect(s).not.toContain(name);
      expect(RANK_RE.test(s) || PT_NUMBER_RE.test(s) || FAMOUS_BOAT_RE.test(s), s).toBe(false);
    }
    expect(texts.length).toBe(33); // v0.8.1 IP1: HUD の手がかり（ANCHOR_HINT_JA）を足した
  });
});
