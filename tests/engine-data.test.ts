// 機関の不調（v0.6.5。日本ハードモード④・jp_05。spec-v065 §B.1〜B.4・§C.2・§G.1）の data と検査:
// risk_events.json の engine_failure.params（ちょうど 8 鍵＋source。warn_rearm_heat はレビュー fair-1）・各検査の境の両側・例外の文、
// 任務の同居（米PT の任務だけ・輸送隊・夜明けの空襲・水上機と同居しない・夜ごとの危険にしない）、
// jp_05 の hazards と文・jp_t14 の source・先の版の番号の付け替え（v0.6.8 → v0.6.9）、WorldSetup.engine（jp_05 だけ・鍵ごと出ない・engineOff・engineHot）。
// 不調の本体（熱の式・段・入力。core/engine-trouble）は tests/engine-trouble.test.ts。
import { describe, expect, it, vi } from 'vitest';
import { gameData, getBoatRecord } from '../src/config/game-data';
import { riskLabelJa } from '../src/config/briefing-data';
import { DEBUG_ENGINE_HOT_HEAT } from '../src/config/engine-config';
import { engineSetupPart, getEngineParams } from '../src/config/engine-mission-data';
import { ENGINE_FAILURE_EVENT_ID, ENGINE_MIN_FINAL_LEAD_S, ENGINE_MIN_FULL_TO_LIMP_S, ENGINE_MIN_WARN_LEAD_S, ENGINE_PARAM_KEYS, engineParamsFromData } from '../src/core/engine-trouble-data';
import { SeededRng } from '../src/core/rng';
import { directSortie } from '../src/core/sortie';
import { buildWorldSetup, type SetupOptions } from '../src/systems/world-setup';
import { PERSON_DENYLIST, RANK_RE } from './person-denylist';
import { textWidthPx } from './pt-ui-kit';

type Rec = Record<string, unknown>;
type Data = typeof gameData;
const clone = (): Data => JSON.parse(JSON.stringify(gameData)) as Data;
const eventOf = (d: Data): Rec => (d.riskEvents.events as unknown as Rec[]).find((e) => e['id'] === ENGINE_FAILURE_EVENT_ID)!;
const paramsOf = (d: Data): Rec => eventOf(d)['params'] as Rec;
const missionOf = (d: Data, id: string): Rec => (d.missionsSeed.missions as unknown as Rec[]).find((m) => m['id'] === id)!;
const protoOf = (d: Data, id: string): Rec => missionOf(d, id)['v0_1_prototype'] as Rec;
const boatOf = (d: Data, id: string): Rec => (d.boats.boats as unknown as Rec[]).find((b) => b['id'] === id)!;
/** v0_1_prototype を持つ任務（遊べる世界のある任務）すべて */
const PROTO_IDS = (gameData.missionsSeed.missions as unknown as Rec[]).filter((m) => m['v0_1_prototype']).map((m) => m['id'] as string);
const EXCERPT = 'WebSearch の抜粋のみ・本文未読';
/** 今の data の params（数だけ）。各検査の境はこれを 1 鍵ずつ変えて見る */
const BASE = Object.fromEntries(ENGINE_PARAM_KEYS.map((k) => [k, paramsOf(gameData)[k]])) as Record<(typeof ENGINE_PARAM_KEYS)[number], number>;
const withP = (over: Partial<typeof BASE>, reliability: unknown = 0.7): ReturnType<typeof engineParamsFromData> => engineParamsFromData({ ...BASE, ...over, source: 'design (テスト)' }, reliability, 'テスト');

describe('risk_events.json の engine_failure（v0.6.5。spec §B.1）', () => {
  it('値: 全速 30 秒で不調・予告は熱 0.6 と 0.85・巡航 30 秒／静音 20 秒で冷える・熱 0.6 で戻る（不調 8 秒）・回復の後は熱 0.5 まで過熱のまま。鍵はちょうど 8 個＋source', () => {
    const p = paramsOf(gameData);
    expect(Object.keys(p).sort()).toEqual([...ENGINE_PARAM_KEYS, 'source'].sort());
    expect(BASE).toEqual({ full_to_limp_s: 30, reliability_ref: 0.7, cruise_cool_s: 30, silent_cool_s: 20, warn_heat: 0.6, final_warn_heat: 0.85, recover_heat: 0.6, warn_rearm_heat: 0.5 });
    const e = eventOf(gameData);
    expect([e['count'], e['share'], e['enemy_direct'], e['game_event'], e['version']]).toEqual([0, 0, false, 'engine_failure', 'v0.6.5']);
    // 短い名（Briefing の「危険」）は「（」の前。HUD の「機関損傷」（PT の命中）とは別の言葉
    expect(riskLabelJa(gameData, ENGINE_FAILURE_EVENT_ID)).toBe('全速を続けると機関が不調になる');
    expect(String(e['label_ja'])).toContain('日本ハードモード専用・史実集計外');
    expect(String(e['penalty'])).toContain('止まらない');
    expect(String(e['penalty'])).toContain('8 秒で操作なしに戻る');
    expect(String(e['trigger'])).toContain('乱数の判定はしない');
    expect(String(e['trigger'])).toContain('熱 1.0（full_to_limp_s）で不調'); // 「限界」は 0.85 の予告の段の名（レビュー F8）
    expect(String(e['trigger'])).not.toContain('限界で不調');
    // 「止まる 3 秒は次の攻撃までの 3 秒に収まる」は成り立たなかったので書かない（spec R1）
    expect(JSON.stringify(e)).not.toContain('収まる');
    expect(JSON.stringify(e)).not.toContain('組立不良を反映');
  });
  it('source: design で、史料は「WebSearch の抜粋のみ・本文未読」と確度。空冷の乙型の過熱を水冷の T-14 に当てるのは design と書く。人物名なし', () => {
    const src = String(paramsOf(gameData)['source']);
    expect(src.startsWith('design (v0.6.5')).toBe(true);
    expect(src).toContain(EXCERPT);
    expect(src).toContain('medium');
    expect(src).toContain('Lorraine-Dietrich 12E');
    expect(src).toContain('空冷の乙型の話');
    expect(src).toContain('への当てはめは design');
    expect(src).toContain('warn_rearm_heat 0.5');
    // 止まる形の数は scratchpad の試作の値（repo の TABLE=3 には止まる形が無い。レビュー F2）。repo に無い spec を出どころにしない
    expect(src).toContain('scratchpad の試作（止まる形。repo に無い）');
    expect(src).not.toContain('spec-v065');
    const texts = [JSON.stringify(eventOf(gameData)), String((boatOf(gameData, 'jp_t14')['source'] as Rec)['engine_reliability'])];
    for (const t of texts) {
      for (const name of PERSON_DENYLIST) expect(t).not.toContain(name);
      expect(RANK_RE.test(t)).toBe(false);
    }
  });
});

describe('engineParamsFromData の検査（spec §C.2。壊れていれば「risk_events.engine_failure.params: …」で Boot で止まる）', () => {
  it('今の data: 実効の T = 30 秒（jp_t14 の engine_reliability 0.7 = reliability_ref）。engine_reliability 0.85 なら 60 秒、0.55 なら下限ちょうどの 20 秒', () => {
    expect(withP({})).toEqual({ fullToLimpS: 30, cruiseCoolS: 30, silentCoolS: 20, warnHeat: 0.6, finalWarnHeat: 0.85, recoverHeat: 0.6, warnRearmHeat: 0.5, startHeat: 0 });
    expect(withP({}, 0.85).fullToLimpS).toBeCloseTo(60, 9);
    expect(withP({}, 0.55).fullToLimpS).toBeCloseTo(ENGINE_MIN_FULL_TO_LIMP_S, 9);
    expect(() => withP({}, 0.5)).toThrow(/full_to_limp_s の実効の秒/); // 18 秒
    // 今の値の予告: 過熱から不調まで 12 秒・限界から 4.5 秒・回復から次の不調まで 12 秒（下限 8・3・8）
    const p = withP({});
    expect((1 - p.warnHeat) * p.fullToLimpS).toBeCloseTo(12, 9);
    expect((1 - p.finalWarnHeat) * p.fullToLimpS).toBeCloseTo(4.5, 9);
    expect((1 - p.recoverHeat) * p.fullToLimpS).toBeCloseTo(12, 9);
    expect([ENGINE_MIN_WARN_LEAD_S, ENGINE_MIN_FINAL_LEAD_S, ENGINE_MIN_FULL_TO_LIMP_S]).toEqual([8, 3, 20]);
    // 不調の秒（(1 − recover_heat) × silent_cool_s）は 8 秒
    expect((1 - p.recoverHeat) * p.silentCoolS).toBeCloseTo(8, 9);
  });
  it('鍵: ちょうど 8 個＋source（欠け・余分・数でない・source なしは例外。文に鍵の名）', () => {
    expect(ENGINE_PARAM_KEYS).toHaveLength(8);
    const ok = { ...BASE, source: 'design (テスト)' };
    for (const k of ENGINE_PARAM_KEYS) {
      const missing: Rec = { ...ok };
      delete missing[k];
      expect(() => engineParamsFromData(missing, 0.7, 'テスト'), k).toThrow(new RegExp(`risk_events\\.engine_failure\\.params: .*${k}`));
      expect(() => engineParamsFromData({ ...ok, [k]: '30' }, 0.7, 'テスト'), k).toThrow(new RegExp(k));
      expect(() => engineParamsFromData({ ...ok, [k]: Number.NaN }, 0.7, 'テスト'), k).toThrow(new RegExp(k));
    }
    expect(() => engineParamsFromData({ ...ok, max_stalls: 2 }, 0.7, 'テスト')).toThrow(/知らない鍵 max_stalls/); // 回数の上限はやめた（spec R9）
    const noSrc: Rec = { ...ok };
    delete noSrc['source'];
    expect(() => engineParamsFromData(noSrc, 0.7, 'テスト')).toThrow(/source/);
    expect(() => engineParamsFromData({ ...ok, source: '' }, 0.7, 'テスト')).toThrow(/source/);
    expect(() => engineParamsFromData(undefined, 0.7, 'テスト')).toThrow(/risk_events\.engine_failure\.params: params/);
    expect(() => engineParamsFromData([1, 2], 0.7, 'テスト')).toThrow(/params/);
  });
  it('秒は正・0 < reliability_ref < 1・艇の engine_reliability は 0 < r < 1 の数（無ければ例外）', () => {
    for (const k of ['full_to_limp_s', 'cruise_cool_s', 'silent_cool_s'] as const) {
      expect(() => withP({ [k]: 0 }), k).toThrow(new RegExp(k));
      expect(() => withP({ [k]: -5 }), k).toThrow(new RegExp(k));
    }
    for (const v of [0, 1, -0.1, 1.2]) expect(() => withP({ reliability_ref: v }), String(v)).toThrow(/reliability_ref/);
    const noRel = (): ReturnType<typeof engineParamsFromData> => engineParamsFromData({ ...BASE, source: 'design (テスト)' }, undefined, 'テスト'); // withP の既定（0.7）を通さない
    expect(noRel).toThrow(/engine_reliability が無い/);
    expect(() => withP({}, '0.7')).toThrow(/engine_reliability が無い/);
    for (const v of [0, 1, 1.5]) expect(() => withP({}, v), String(v)).toThrow(/engine_reliability は 0 < r < 1/);
    expect(noRel).toThrow(/（テスト。docs\/02 §6\.8）/); // 文の末尾に任務と艇
  });
  it('予告の熱: 0 < warn_heat < final_warn_heat < 1（warn = final は例外）・0 < recover_heat', () => {
    expect(() => withP({ warn_heat: 0.6, final_warn_heat: 0.6 })).toThrow(/warn_heat < final_warn_heat/);
    expect(() => withP({ warn_heat: 0.9, final_warn_heat: 0.85 })).toThrow(/warn_heat < final_warn_heat/);
    expect(() => withP({ warn_heat: 0, recover_heat: 0 })).toThrow(/warn_heat/);
    expect(() => withP({ final_warn_heat: 1 })).toThrow(/final_warn_heat < 1/);
    expect(() => withP({ recover_heat: 0 })).toThrow(/recover_heat は正/);
    expect(withP({ recover_heat: 0.01, warn_rearm_heat: 0.005 }).recoverHeat).toBe(0.01);
  });
  it('E2（不調の前に必ず予告）の境の両側: 過熱から不調まで ≥ 8 秒・限界から ≥ 3 秒・回復から次の不調まで ≥ 8 秒・recover_heat ≤ warn_heat', () => {
    // 過熱の予告: (1 − warn) × 30 ≥ 8 ⇔ warn ≤ 1 − 8/30
    expect(withP({ warn_heat: 1 - 8 / 30, final_warn_heat: 0.9, recover_heat: 0.6 }).warnHeat).toBeCloseTo(0.7333, 4);
    expect(() => withP({ warn_heat: 1 - 7.9 / 30, final_warn_heat: 0.9, recover_heat: 0.6 })).toThrow(/warn_heat の予告/);
    // 限界の予告: (1 − final) × 30 ≥ 3 ⇔ final ≤ 0.9
    expect(withP({ final_warn_heat: 0.9 }).finalWarnHeat).toBe(0.9);
    expect(() => withP({ final_warn_heat: 0.91 })).toThrow(/final_warn_heat の予告/);
    // 回復の後: (1 − recover) × 30 ≥ 8（recover ≤ warn より先に見る）
    expect(() => withP({ recover_heat: 0.75 })).toThrow(/recover_heat の後/);
    expect(() => withP({ recover_heat: 0.7 })).toThrow(/recover_heat ≤ warn_heat/); // 後の秒は 9 秒で通るが warn 0.6 より上
    expect(withP({ recover_heat: 0.6 }).recoverHeat).toBe(0.6); // = warn（今の値）は通る
    // 実効の T を縮めると予告の秒も縮む（engine_reliability 0.55 で T = 20: 過熱 8 秒・限界 3 秒でちょうど通る）
    expect(withP({ final_warn_heat: 0.85 }, 0.55).fullToLimpS).toBeCloseTo(20, 9);
    expect(() => withP({ warn_heat: 0.61 }, 0.55)).toThrow(/warn_heat の予告/);
    expect(() => withP({ final_warn_heat: 0.86 }, 0.55)).toThrow(/final_warn_heat の予告/);
  });
  it('回復の後の保ち: 0 < warn_rearm_heat < recover_heat（0・recover_heat ちょうど・その上は例外。recover_heat を下げたらこれも下げる）', () => {
    expect(withP({ warn_rearm_heat: 0.59 }).warnRearmHeat).toBe(0.59);
    expect(withP({ warn_rearm_heat: 0.01 }).warnRearmHeat).toBe(0.01);
    for (const v of [0, -0.1, 0.6, 0.7]) expect(() => withP({ warn_rearm_heat: v }), String(v)).toThrow(/0 < warn_rearm_heat < recover_heat/);
    expect(() => withP({ recover_heat: 0.5 })).toThrow(/warn_rearm_heat < recover_heat/); // spec §I.1 の「まだ簡単」の 1 つ目は warn_rearm_heat も下げる
    expect(withP({ recover_heat: 0.5, warn_rearm_heat: 0.4 }).recoverHeat).toBe(0.5);
  });
  it('静音以下のほうが速く冷える: silent_cool_s ≤ cruise_cool_s（= は通る）', () => {
    expect(withP({ silent_cool_s: 30 }).silentCoolS).toBe(30);
    expect(() => withP({ silent_cool_s: 31 })).toThrow(/silent_cool_s ≤ cruise_cool_s/);
    expect(() => withP({ cruise_cool_s: 19 })).toThrow(/silent_cool_s ≤ cruise_cool_s/);
  });
});

describe('任務の不調（config/engine-mission-data。spec §B.2・§C.2 の同居の検査）', () => {
  it('不調が入るのは v0_1_prototype.hazards に engine_failure がある jp_05 だけ（jp_01 の T-38 にも engine_reliability 0.85 があるが読まない）', () => {
    expect(PROTO_IDS.sort()).toEqual(['jp_01', 'jp_02', 'jp_04', 'jp_05', 'jp_06', 'us_01', 'us_02', 'us_03']); // v0.6.7: jp_02（夜の哨戒機。不調なし）。v0.6.9 S1: jp_04（揚陸の輸送船。不調なし。playable_from は S7）
    for (const id of PROTO_IDS) expect(getEngineParams(gameData, id) !== null, id).toBe(id === 'jp_05');
    expect(getEngineParams(gameData, 'jp_05')).toEqual({ fullToLimpS: 30, cruiseCoolS: 30, silentCoolS: 20, warnHeat: 0.6, finalWarnHeat: 0.85, recoverHeat: 0.6, warnRearmHeat: 0.5, startHeat: 0 });
    expect(boatOf(gameData, 'jp_t38')['engine_reliability']).toBe(0.85);
  });
  it('同居: 米PT の隊（pt_boats）の任務だけ・輸送隊（convoy）と同居しない・night.optional_hazards に入れない（どれも任務の id 付きの例外）', () => {
    const d1 = clone();
    (protoOf(d1, 'jp_06')['hazards'] as string[]).push(ENGINE_FAILURE_EVENT_ID);
    expect(() => getEngineParams(d1, 'jp_06')).toThrow(/jp_06: 機関の不調.*pt_boats/);
    const d2 = clone();
    (protoOf(d2, 'jp_01')['hazards'] as string[]).push(ENGINE_FAILURE_EVENT_ID);
    expect(() => getEngineParams(d2, 'jp_01')).toThrow(/jp_01: 機関の不調.*convoy/);
    const d3 = clone();
    ((protoOf(d3, 'jp_05')['night'] as Rec)['optional_hazards'] as string[]).push(ENGINE_FAILURE_EVENT_ID);
    expect(() => getEngineParams(d3, 'jp_05')).toThrow(/jp_05: 機関の不調.*optional_hazards/);
  });
  it('同居（レビュー fair-3）: 夜明けの空襲（dawn_strike）・敵の水上機（enemy_aircraft）のある米PT の任務は例外（その攻撃の最中は赤い線に入らず、米PT は夜明けに去る）', () => {
    const d1 = clone();
    protoOf(d1, 'jp_05')['dawn_strike'] = JSON.parse(JSON.stringify(protoOf(gameData, 'jp_01')['dawn_strike']));
    expect(() => getEngineParams(d1, 'jp_05')).toThrow(/jp_05: 機関の不調.*dawn_strike/);
    const d2 = clone();
    protoOf(d2, 'jp_05')['enemy_aircraft'] = JSON.parse(JSON.stringify(protoOf(gameData, 'us_02')['enemy_aircraft']));
    expect(() => getEngineParams(d2, 'jp_05')).toThrow(/jp_05: 機関の不調.*enemy_aircraft/);
    expect(getEngineParams(gameData, 'jp_05')).not.toBeNull(); // 今の jp_05（味方の制空下・水上機なし）は通る
  });
  it('data が壊れていれば任務の自艇の名を付けて例外: params の欠け・自艇の engine_reliability の欠け・risk_events に無い', () => {
    const d1 = clone();
    delete paramsOf(d1)['warn_heat'];
    expect(() => getEngineParams(d1, 'jp_05')).toThrow(/risk_events\.engine_failure\.params: warn_heat.*jp_05 の自艇 jp_t14/);
    const d2 = clone();
    delete boatOf(d2, 'jp_t14')['engine_reliability'];
    expect(() => getEngineParams(d2, 'jp_05')).toThrow(/engine_reliability が無い.*jp_05 の自艇 jp_t14/);
    const d3 = clone();
    (d3.riskEvents as unknown as { events: Rec[] }).events = (d3.riskEvents.events as unknown as Rec[]).filter((e) => e['id'] !== ENGINE_FAILURE_EVENT_ID);
    expect(() => getEngineParams(d3, 'jp_05')).toThrow(/risk_events\.json に engine_failure が無い/);
    // 不調の無い任務は壊れた params を読まない
    expect(getEngineParams(d1, 'jp_06')).toBeNull();
  });
  it('jp_05 の data: hazards に engine_failure（上位と v0_1_prototype）・hazards_source・todo（長押しで再始動の文は消した）。目的・成功・史実メモは変えない', () => {
    const m = missionOf(gameData, 'jp_05');
    const p = protoOf(gameData, 'jp_05');
    expect(m['hazards']).toEqual(['enemy_ship_gunfire_or_ram', 'engine_failure']);
    expect(p['hazards']).toEqual(['enemy_ship_gunfire_or_ram', 'engine_failure']);
    expect(String(p['hazards_source'])).toContain('v0.6.5 から機関の不調');
    expect(String(p['hazards_source'])).toContain('risk_events.engine_failure.params');
    expect(String(m['todo'])).not.toContain('長押し');
    expect(String(m['todo'])).toContain('jp_tm4');
    expect(m['objective']).toBe('哨戒の帰り道に米PTの2隻組。振り切れず、航過のあとも後ろから追って撃つ。航過は全速で転舵、追撃は針路そのまま機銃で撃ち返して追い払い、ラバウルへ帰る');
  });
  it('jp_t14: engine_reliability 0.7 のまま。source は「熱の溜まる速さ」に読む・抜粋と確度・組立不良は確かめられなかった（low）。静音の上限 14 kt（不調の間の速さの上限）', () => {
    const b = boatOf(gameData, 'jp_t14');
    expect(b['engine_reliability']).toBe(0.7);
    const src = String((b['source'] as Rec)['engine_reliability']);
    expect(src.startsWith('design (v0.6.5 から機関の不調の熱の溜まる速さに読む')).toBe(true);
    expect(src).toContain(EXCERPT);
    expect(src).toContain('（low）');
    expect(getBoatRecord(gameData, 'jp_t14').speed_bands_kt.silent_max).toBe(14);
  });
  it('先の版の番号の付け替え（spec §B.4・R18）: 米PT の雷撃は v0.6.9。data に v0.6.8 の雷撃の文は残らない（v0.6.9 S1: 雷撃の source と notes の尾は jp_04 の雷撃に書き換えた）', () => {
    const pt = (gameData.enemies.enemies as unknown as Rec[]).find((e) => e['id'] === 'us_pt_enemy')!;
    const src = String((pt['source'] as Rec)['torpedo_attack']);
    expect(src.startsWith('historical (launch_range_m 900≈1,000 yd: 1944-12-12 の卯月への PT-490・492 の雷撃')).toBe(true);
    expect(src).toContain(') / design (v0.6.9。');
    expect(src).toContain('jp_04 だけが読む（core/pt-torpedo-data）');
    expect(src).not.toContain('まで読まない');
    expect(String(pt['notes']).endsWith('jp_04 では輸送船へ 1 隻 1 回だけ 3 本を撃つ（気づかれていなければ 900 m で撃って去り、隊が自艇を捉えた瞬間に近ければ慌てて撃って去り、自艇と戦いながら 900 m の内で艇首が向けば撃って戦い続ける。v0.6.9。core/pt-torpedo）。jp_01・jp_05 には狙う深い船体が無いので魚雷は使わない')).toBe(true);
    expect(String(pt['notes'])).not.toContain('v0.6.9 で雷撃');
    expect(JSON.stringify(gameData.enemies)).not.toMatch(/v0\.6\.8 (の PT の雷撃|で雷撃)/); // 空襲下の退避は v0.6.8 → v0.6.10 に繰り下げ（v0.6.8 は兵装パネル。その版の source は書いてよい。レビュー F7）
  });
});

describe('WorldSetup.engine（spec §E.3。世界と模擬はまだ読まない）', () => {
  it('jp_05 だけ engine を持ち、ほかの任務は鍵ごと出ない（setup の snapshot が変わらない）。engineOff なら jp_05 も鍵ごと出ない', () => {
    for (const id of PROTO_IDS) {
      for (const hard of [false, true]) {
        const s = buildWorldSetup(gameData, id, { sortie: directSortie(id, 7, 'none', hard, false), hard });
        expect('engine' in s, `${id} ${hard}`).toBe(id === 'jp_05');
        expect(JSON.stringify(s).includes('"engine"'), `${id} ${hard}`).toBe(id === 'jp_05');
      }
    }
    expect(buildWorldSetup(gameData, 'jp_05').engine).toEqual(getEngineParams(gameData, 'jp_05'));
    expect('engine' in buildWorldSetup(gameData, 'jp_05', { engineOff: true })).toBe(false);
    expect(engineSetupPart(gameData, 'jp_05', { engineOff: true })).toEqual({});
    expect(engineSetupPart(gameData, 'us_02', {})).toEqual({});
    expect(engineSetupPart(gameData, 'jp_01', { engineHot: true })).toEqual({});
  });
  it('engineHot（?debug&enghot）は出撃時の熱だけ 0.75（ほかの値は同じ）', () => {
    expect(DEBUG_ENGINE_HOT_HEAT).toBe(0.75);
    const hot = buildWorldSetup(gameData, 'jp_05', { engineHot: true }).engine!;
    expect(hot).toEqual({ ...getEngineParams(gameData, 'jp_05')!, startHeat: 0.75 });
    expect(hot.startHeat).toBeGreaterThan(hot.warnHeat); // すぐ「過熱」
    expect(engineSetupPart(gameData, 'jp_05', { engineHot: true, engineOff: true })).toEqual({});
  });
  it('乱数を引かない（spec §E.5・E8）: 不調の値を組んでも jp_05 の今夜は 5 回のまま、engineOff と同じ回数', () => {
    const draws = (o: SetupOptions): number => {
      const spy = vi.spyOn(SeededRng.prototype, 'next');
      buildWorldSetup(gameData, 'jp_05', { sortie: directSortie('jp_05', 3, 'none', false, false), ...o });
      const n = spy.mock.calls.length;
      spy.mockRestore();
      return n;
    };
    expect([draws({}), draws({ engineOff: true }), draws({ engineHot: true })]).toEqual([5, 5, 5]);
    const spy = vi.spyOn(SeededRng.prototype, 'next');
    getEngineParams(gameData, 'jp_05');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
  it('Briefing の「危険」（24 px）: 「敵艦艇の砲撃・衝突、全速を続けると機関が不調になる」は 1 行（折り返し 1,056 px の内）', () => {
    const s = buildWorldSetup(gameData, 'jp_05');
    expect(s.hazardsTonight).toEqual(['enemy_ship_gunfire_or_ram', 'engine_failure']);
    const line = s.hazardsTonight.map((h) => riskLabelJa(gameData, h)).join('、');
    expect(line).toBe('敵艦艇の砲撃・衝突、全速を続けると機関が不調になる');
    expect(textWidthPx(line, 24)).toBe(600);
    expect(textWidthPx(line, 24)).toBeLessThanOrEqual(1056);
  });
});
