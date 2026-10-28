// 米PT の雷撃の数値（v0.6.9 S1・S4a・S4。core/pt-torpedo-data。spec-v069 §3.3・§4.9 V11・R2・R8/F13e・R12）: ちょうど 11 鍵（R12 の engaged_error_factor）・V11 の例外の文すべて・torpedo_id が魚雷の記録と boat_ref の後期の型に一致・
// data（enemies.json の us_pt_enemy.torpedo_attack）の値・source と notes の pin。PtParams（core/pt-data）はこの block を読まない。
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { getPtParams } from '../src/config/pt-mission-data';
import { getPrototypeMission } from '../src/config/game-data';
import { isPtDataRecord } from '../src/core/pt-data';
import { PT_TORPEDO_KEYS, isPtTorpedoRecord, ptTorpedoParamsFromData, type PtTorpedoContext } from '../src/core/pt-torpedo-data';
import { buildWorldSetup } from '../src/systems/world-setup';
import { PERSON_DENYLIST, RANK_RE } from './person-denylist';

type Rec = Record<string, unknown>;
const EXCERPT = 'WebSearch の抜粋のみ・本文未読';
const enemies = gameData.enemies.enemies as unknown as Rec[];
const PT = enemies.find((e) => e['id'] === 'us_pt_enemy')!;
const RAW = PT['torpedo_attack'] as Rec;
const boat = (gameData.boats.boats as unknown as Rec[]).find((b) => b['id'] === PT['boat_ref'])!;
const torpedoOf = (id: unknown): unknown => (gameData.torpedoes.torpedoes as unknown as Rec[]).find((t) => t['id'] === id);
const launch = gameData.hitRateModel.torpedo_launch;
const ctxOf = (raw: Rec, over: Partial<PtTorpedoContext> = {}): PtTorpedoContext => ({
  boatRef: 'us_elco80',
  boatTorpedoes: boat['torpedoes'] as PtTorpedoContext['boatTorpedoes'],
  torpedoRecord: torpedoOf(raw['torpedo_id']),
  armingM: launch.arming_distance_m,
  erraticPeriodS: launch.erratic_period_s,
  ...over,
});
const LABEL = 'jp_04: enemies.json の us_pt_enemy.torpedo_attack';
const build = (over: Rec, ctx: Partial<PtTorpedoContext> = {}): (() => unknown) => {
  const raw = { ...RAW, ...over };
  return () => ptTorpedoParamsFromData(raw, ctxOf(raw, ctx), LABEL);
};

describe('torpedo_attack の data（enemies.json の us_pt_enemy。spec §3.3）', () => {
  it('ちょうど 11 鍵（spec の順。R12 の engaged_error_factor は hurried_error_factor の次）・値は spec §3.3・R12 のまま（Mk 13・900 m・30°・3 本・8°・±10°・慌てて 1,300 m・2.5 倍・10 秒・撃って去る）と S4 の戦いながら 2 倍（R13）', () => {
    expect(PT_TORPEDO_KEYS).toEqual(['torpedo_id', 'launch_range_m', 'launch_heading_tol_deg', 'salvo_count', 'salvo_spacing_deg', 'aim_error_deg', 'hurried_max_m', 'hurried_error_factor', 'engaged_error_factor', 'reacquire_s', 'retreat_after_salvo']);
    expect(Object.keys(RAW)).toEqual([...PT_TORPEDO_KEYS]);
    expect(RAW).toEqual({ torpedo_id: 'us_mk13', launch_range_m: 900, launch_heading_tol_deg: 30, salvo_count: 3, salvo_spacing_deg: 8, aim_error_deg: 10, hurried_max_m: 1300, hurried_error_factor: 2.5, engaged_error_factor: 2, reacquire_s: 10, retreat_after_salvo: true });
    // torpedo_id は boats.json の us_elco80.torpedoes.type_late（R8/F13e）で、torpedoes.json にある
    expect((boat['torpedoes'] as Rec)['type_late']).toBe(RAW['torpedo_id']);
    expect(torpedoOf(RAW['torpedo_id'])).toBeDefined();
  });
  it('組んだ値: 距離は二乗も・Mk 13 の 33.5 kt・射程 5,760 m・不発 3%・蛇行 2%・幅 2°（hit_rate_model の arming 100 m・蛇行の周期 6 秒）', () => {
    const p = ptTorpedoParamsFromData(RAW, ctxOf(RAW), LABEL);
    expect(p).toEqual({
      torpedoId: 'us_mk13', launchM: 900, launch2: 810000, tolDeg: 30, n: 3, spacingDeg: 8, aimDeg: 10, hurriedM: 1300, hurried2: 1690000, hurriedFactor: 2.5, engagedFactor: 2, reacquireS: 10,
      torpedo: { speedMps: 33.5 * 0.5144, rangeM: 5760, armingM: 100, jitterDeg: 2, erraticPeriodS: 6 },
      reliability: { dud: 0.03, erratic: 0.02 },
      jitterDeg: 2,
    });
    // jp_04 の組み立てに同じ値が入る（ノーマル・ハード・史実モードで同じ。jp の任務は信頼性を変えない）
    for (const o of [{}, { hard: true }, { historical: true }]) expect(buildWorldSetup(gameData, 'jp_04', o).landing!.torpedo, JSON.stringify(o)).toEqual(p);
  });
  it('core/pt-data の isPtDataRecord と PtParams は torpedo_attack を読まない（block を外しても壊しても同じ PtParams）', () => {
    const m = getPrototypeMission(gameData, 'jp_05');
    const ts = gameData.hitRateModel.world.time_scale;
    const base = getPtParams(gameData, m, ts);
    for (const t of [undefined, { launch_range_m: 'x' }]) {
      const d = JSON.parse(JSON.stringify(gameData)) as typeof gameData;
      const rec = (d.enemies.enemies as unknown as Rec[]).find((e) => e['id'] === 'us_pt_enemy')!;
      if (t === undefined) delete rec['torpedo_attack'];
      else rec['torpedo_attack'] = t;
      expect(isPtDataRecord(rec)).toBe(true);
      expect(getPtParams(d, m, ts)).toEqual(base);
    }
  });
  it('source（historical と design。抜粋・慌てた斉射の規則 R2・スリガオの数 F13b・動かせる範囲は landing.source）と notes の尾（jp_04 だけ）', () => {
    const src = String((PT['source'] as Rec)['torpedo_attack']);
    expect(src.startsWith('historical (launch_range_m 900≈1,000 yd')).toBe(true);
    expect(src).toContain(EXCERPT);
    expect(src).toContain('URL は docs/01 §8 の jp_04 の表');
    expect(src).toContain('34 本で 1〜2 本＝3〜6%・出典 1 つ（medium-low）'); // R8/F13b（前の 34 本で 2 本＝6% は 1 つの出典の数）
    expect(src).not.toContain('34 本で 2 本＝6%');
    expect(src).toContain('哨戒中で魚雷が残り、輸送船から hurried_max_m の内で艇首が launch_heading_tol_deg 以内の PT はみな（見つけた PT だけでなく）'); // R2
    expect(src).toContain('hurried_max_m 0 で慌てた斉射なし');
    // R12: 戦いながらの斉射（自艇と戦っている PT も撃つ・去らない・0 で無し）と S4 の較正（R13: 2.5 から 1.5〜3.0 を回して 2.0。N 400 × 2 組の数）
    expect(src).toContain('戦いながらの斉射（spec R12: 早く引きつけても輸送船のそばで戦えば輸送船は危ない＝輸送船から離れて戦え）');
    expect(src).toContain('狙いの誤差を engaged_error_factor 倍にして撃ち、去らずに自艇と戦い続ける');
    expect(src).toContain('engaged_error_factor 2.0 は S4 の模擬（scripts/landing-sim。N 400 × 2 組＝seed 1〜400 と 401〜800。数は 組 1 / 組 2）で慌てた斉射と同じ 2.5 から 1.5〜3.0 を回して決めた（spec R12・R13）');
    expect(src).toContain('lure の達成 84.5 / 82.3%（帯 70〜88 の真ん中。1.5 は 79.8 / 78.5%・2.5 は 87.3 / 85.3% で上の端まで 0.7 点・3.0 は 87.8 / 88.3% で帯の外）');
    expect(src).toContain('（lure − lure_near ＋55.3 点、帯 ≥ 10＝輸送船から離れて戦え）');
    expect(src).toContain('ハードの lure 67.0 / 63.8%（帯 45〜70）');
    expect(src).toContain('0 で戦いながらの斉射なし');
    expect(src).toContain('S1 のまま S4 の帯に入ったので動かさない: 斉射の当たりうる 1 本（10 の遊び方を合わせて）気づかれていない 0.445 / 0.446（帯 0.30〜0.50）・慌てた 0.169 / 0.172（帯 0.08〜0.25）');
    expect(src).not.toContain('S4 の模擬で決める');
    expect(src).not.toContain('engaged_error_factor 2.5 は');
    expect(src).toContain('・engaged_error_factor・reacquire_s・retreat_after_salvo。');
    expect(src).toContain('landing.source（spec R7）');
    expect(src).toContain('us_elco80.torpedoes.type_late');
    expect(String(PT['notes'])).toContain('jp_01・jp_05 には狙う深い船体が無いので魚雷は使わない');
    expect(String(PT['notes'])).toContain('自艇と戦いながら 900 m の内で艇首が向けば撃って戦い続ける'); // R12
    for (const t of [src, String(PT['notes'])]) {
      for (const name of PERSON_DENYLIST) expect(t, name).not.toContain(name);
      expect(RANK_RE.test(t)).toBe(false);
    }
  });
});

describe('V11（ptTorpedoParamsFromData の検査。例外の頭は任務と記録）', () => {
  it('形: 鍵の欠け（R12 の engaged_error_factor も）・知らない鍵・型の違いはどれも「ちょうど 11 鍵」', () => {
    const { reacquire_s: _r, ...missing } = RAW;
    const { engaged_error_factor: _e, ...noEngaged } = RAW;
    for (const raw of [missing, noEngaged, { ...RAW, salvo_gap_s: 1 }, { ...RAW, torpedo_id: 13 }, { ...RAW, retreat_after_salvo: 'yes' }, { ...RAW, aim_error_deg: NaN }, { ...RAW, launch_range_m: '900' }, { ...RAW, engaged_error_factor: '2.5' }, { ...RAW, engaged_error_factor: Infinity }, [], null, 'x']) {
      expect(isPtTorpedoRecord(raw), JSON.stringify(raw)).toBe(false);
      expect(() => ptTorpedoParamsFromData(raw, ctxOf(RAW), LABEL), JSON.stringify(raw)).toThrow(/^jp_04: enemies\.json の us_pt_enemy\.torpedo_attack: ちょうど 11 鍵（torpedo_id・launch_range_m・.*・engaged_error_factor・.*（docs\/02 §6\.11）$/);
    }
    expect(isPtTorpedoRecord(RAW)).toBe(true);
  });
  it('torpedo_id: 魚雷の記録が無い・boat_ref の type_late と違う・boat_ref の torpedoes が無い', () => {
    expect(build({ torpedo_id: 'no_such' })).toThrow(/torpedo_id（no_such）が torpedoes\.json に魚雷の値/);
    expect(build({ torpedo_id: 'us_mk8' })).toThrow(/torpedo_id（us_mk8）は boats\.json の us_elco80\.torpedoes\.type_late（us_mk13）と同じ/);
    expect(build({}, { boatTorpedoes: undefined })).toThrow(/boats\.json の us_elco80\.torpedoes\.count（1 以上の整数）が無い/);
  });
  it('数: salvo_count は 1〜4 の整数・0 < tol < 90・spacing > 0・aim ≥ 0・launch > 0', () => {
    for (const v of [0, 5, 2.5]) expect(build({ salvo_count: v }), String(v)).toThrow(/salvo_count（.*）は 1〜4（us_elco80 の魚雷の本数）の整数/);
    for (const v of [1, 4]) expect(build({ salvo_count: v })).not.toThrow();
    for (const v of [0, 90, -5]) expect(build({ launch_heading_tol_deg: v }), String(v)).toThrow(/0 < launch_heading_tol_deg < 90/);
    for (const v of [0, -1]) expect(build({ salvo_spacing_deg: v }), String(v)).toThrow(/salvo_spacing_deg は正/);
    expect(build({ aim_error_deg: -0.1 })).toThrow(/aim_error_deg は 0 以上/);
    expect(build({ aim_error_deg: 0 })).not.toThrow();
    expect(build({ launch_range_m: 0 })).toThrow(/launch_range_m は正/);
  });
  it('慌てた斉射: hurried_max_m は 0（なし＝スイッチ）か launch_range_m より遠い・hurried_error_factor ≥ 1', () => {
    expect(build({ hurried_max_m: 0 })).not.toThrow();
    expect((build({ hurried_max_m: 0 })() as { hurried2: number }).hurried2).toBe(0);
    for (const v of [900, 500, -1]) expect(build({ hurried_max_m: v }), String(v)).toThrow(/hurried_max_m（.*）は 0（慌てた斉射なし）か launch_range_m（900 m）より遠い/);
    expect(build({ hurried_error_factor: 0.9 })).toThrow(/hurried_error_factor は 1 以上/);
    expect(build({ hurried_error_factor: 1 })).not.toThrow();
  });
  it('戦いながらの斉射（R12）: engaged_error_factor は 0（なし＝スイッチ）か 1 以上', () => {
    for (const v of [0, 1, 1.5, 2.5, 3]) expect(build({ engaged_error_factor: v }), String(v)).not.toThrow();
    expect((build({ engaged_error_factor: 0 })() as { engagedFactor: number }).engagedFactor).toBe(0);
    for (const v of [0.5, 0.99, -1]) expect(build({ engaged_error_factor: v }), String(v)).toThrow(/engaged_error_factor（.*）は 0（戦いながらの斉射なし）か 1 以上（戦いながらの斉射の狙いは粗い）（docs\/02 §6\.11）$/);
  });
  it('reacquire_s ≥ 0・retreat_after_salvo は true・撃つ距離 < 魚雷の射程', () => {
    expect(build({ reacquire_s: -1 })).toThrow(/reacquire_s は 0 以上/);
    expect(build({ reacquire_s: 0 })).not.toThrow();
    expect(build({ retreat_after_salvo: false })).toThrow(/retreat_after_salvo は true（v0\.6\.9 は気づかれていない・慌てた斉射の後に去る。戦いながらの斉射は去らない）/);
    expect(build({ hurried_max_m: 5760 })).toThrow(/撃つ距離（launch_range_m・hurried_max_m の遠い方 5760 m）は魚雷の射程（5760 m）より近い/);
    expect(build({ hurried_max_m: 5759 })).not.toThrow();
  });
});
