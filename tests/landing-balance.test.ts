// 停泊して揚陸する輸送船を守る模擬のつり合い（v0.6.9 S4。jp_04。core/landing-sim、systems/landing-sim-setup の LANDING_CALIBRATION・LANDING_PAIRS・LANDING_HARD_CALIBRATION・
// LANDING_SALVO_BANDS。spec-v069 §6 S4・§8・R12・R13）: 帯は N 400 × 2 組（scripts/landing-sim の TABLE=1・2）で決め、ここは N 60（seed 1〜60）の 1 組で同じ帯を広げて見る（回帰の検出）。
// 広げ方: % の行の帯と対の帯は両側に MARGIN_PT 点（N 60 の 1 夜は 1.7 点・達成 85% の標準誤差 約 4.6 点）、斉射の 1 本の命中は両側に MARGIN_HIT。不変（I1〜I6）は広げない。
// S4 の値（engaged_error_factor 2.0）の N 60 は lure 81.7%・lure_near 26.7%・lure_late − lure −20.0 点（S8 のレビュー game-6 の後。前は −10.0＝帯の端。N 400 × 2 組は −32.4）・ハードの lure 66.7%。帯を外したら値を動かす前に
// scripts/landing-sim の N 400 × 2 組を回す（N 60 の外れは 1 組の揺れのことがある）。data の source に書いた S4 の値と理由もここで pin する。
// v0.6.9 実機 1 回目（撃った PT は戦いながらの斉射でも去る＝ユーザーの選択 A）の後の N 60 は lure 86.7%・lure_near 36.7%・lure_late − lure −25.0 点・kite 40.0%・ハードの lure 71.7%
// （N 400 × 2 組は 73.0 / 75.0% で、ハードの lure の帯を 45〜70 から 45〜75 へ。ノーマルの帯は変えない）。回すのは較正の 12 だけ（人に近い 3 つは表だけ＝tests/landing-sim-human）。
// v0.6.10 S3a: 模擬に卯月が入った（S3a・S3b はここを卯月を切って回した）。
// v0.6.10 S4（spec-v0610 §6.3・LD14）: 卯月のいる夜の帯（systems/ally-sim-bands）で回す＝較正の 12 と人に近い 3 つ（human・human_face・face も帯）、ハードは hide・lure と人に近い 3 つ。
// 卯月の得の弱い対（得(human_face) ≥ 得(lure)。得は同じ seed の卯月を切った夜と比べる）・ハードの段・I9 も見る。卯月を切った夜の帯（*_NO_ALLY＝S0b）は scripts の ALLY_OFF=1 の md5（G6）が守る。
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import type { LandingCell } from '../src/core/landing-sim-cell';
import { LANDING_POLICIES, type LandingPolicy } from '../src/core/landing-sim-policy';
import {
  ALLY_GAIN_PAIRS, ALLY_HARD_LADDER, ALLY_LIT_BANDS, LANDING_CALIBRATION_ALLY, LANDING_HARD_CALIBRATION_ALLY, allyLadderChecks, landingBandSet, litNightPct,
} from '../src/systems/ally-sim-bands';
import {
  LANDING_CALIBRATION_NO_ALLY, LANDING_HARD_CALIBRATION_NO_ALLY, LANDING_I9_POLICIES, LANDING_PAIRS, LANDING_SALVO_BANDS, landingBandMisses, landingCalibrationRun, landingInvariantMisses,
  type LandingBandRow, type LandingRun,
} from '../src/systems/landing-sim-setup';

const N = 60;
const SEED = 1;
/** % の帯を両側に広げる点 */
const MARGIN_PT = 8;
/** 斉射の当たりうる 1 本の帯を両側に広げる幅 */
const MARGIN_HIT = 0.05;
/** lure_near の戦いながらの斉射は lure よりこれだけ多い（1 夜。卯月が東の PT を追い払うので 2 → 1.35 / 1.40（N 400 × 2 組。lure 0.24 / 0.28）。卯月の無い夜は 2.00 と 0.51） */
const LURE_NEAR_EXTRA = 0.5;
/** 1 つの it の上限（卯月のいる N 60 × 15 の遊び方が 20 秒ほど。CI は遅いことがある） */
const SIM_TIMEOUT_MS = 120_000;

type Rec = Record<string, unknown>;
let normal: LandingRun | undefined;
let hard: LandingRun | undefined;
const normalRun = (): LandingRun => (normal ??= landingCalibrationRun(gameData, 'jp_04', LANDING_POLICIES, N, SEED, 1));
/** ハードは帯のある遊び方だけ（hide・lure・人に近い 3 つ。全部の表は scripts/landing-sim の HARD=1） */
const HARD_POLICIES = LANDING_HARD_CALIBRATION_ALLY.map((r) => r.policy);
const hardRun = (): LandingRun => (hard ??= landingCalibrationRun(gameData, 'jp_04', HARD_POLICIES, N, SEED, 1, { hard: true }));

/** 行の帯を両側に MARGIN_PT 広げた写し */
function widened(r: LandingBandRow): LandingBandRow {
  const bands: LandingBandRow['bands'] = {};
  for (const [k, b] of Object.entries(r.bands) as [keyof LandingBandRow['bands'], readonly [number, number]][]) bands[k] = [b[0] - MARGIN_PT, b[1] + MARGIN_PT];
  return { policy: r.policy, bands };
}

/** 行の帯（広げた）と不変（I1〜I11。I9 は卯月を切った同じ seed の夜と比べる）を外れた項目（「遊び方: 項目」） */
function rowMisses(run: LandingRun, rows: readonly LandingBandRow[], policies: readonly LandingPolicy[]): string[] {
  return policies.flatMap((pol) => {
    const c: LandingCell = run.cell(pol, 0);
    const r = rows.find((x) => x.policy === pol);
    const i9 = run.i9Misses(pol, 0);
    return [...(r ? landingBandMisses(widened(r), c) : []), ...landingInvariantMisses(c, run.setup), ...(i9 > 0 ? [`I9 卯月の無い夜と違う ${i9} 夜`] : [])].map((m) => `${pol}: ${m}`);
  });
}

describe('卯月のいる帯の値（spec-v0610 §6.3。G-B4: 帯は広げない）', () => {
  it('ノーマル: lure 88〜99（自艇の沈没 ≤ 10・漂流 ≤ 3・夜明けの前の帰投 ≥ 85・決着の前の燃料少と輪 ≤ 10）・hide ≤ 15（沈没 ≤ 3）・face 60〜85・human 72〜88・human_face 52〜70。ほかは S0b のまま帯なし', () => {
    expect(LANDING_CALIBRATION_ALLY.map((r) => r.policy)).toEqual([...LANDING_POLICIES]);
    const by = Object.fromEntries(LANDING_CALIBRATION_ALLY.map((r) => [r.policy, r.bands]));
    expect(by['lure']).toEqual({ objPct: [88, 99], ownSunkPct: [0, 10], adriftPct: [0, 3], homeBeforeDawnPct: [85, 100], fuelCallPct: [0, 10], ringEarlyPct: [0, 10] });
    expect(by['hide']).toEqual({ objPct: [0, 15], ownSunkPct: [0, 3] });
    expect([by['face'], by['human'], by['human_face']]).toEqual([{ objPct: [60, 85] }, { objPct: [72, 88] }, { objPct: [52, 70] }]);
    for (const r of LANDING_CALIBRATION_NO_ALLY) if (r.policy !== 'lure' && r.policy !== 'hide') expect(by[r.policy], r.policy).toEqual({});
  });
  it('ハード: hide ≤ 8・lure 80〜97（沈没 ≤ 15）・face 38〜60・human 55〜75・human_face 20〜40。得の対・照らした夜・段', () => {
    expect(LANDING_HARD_CALIBRATION_ALLY).toEqual([
      { policy: 'hide', bands: { objPct: [0, 8] } }, { policy: 'lure', bands: { objPct: [80, 97], ownSunkPct: [0, 15] } }, { policy: 'face', bands: { objPct: [38, 60] } },
      { policy: 'human', bands: { objPct: [55, 75] } }, { policy: 'human_face', bands: { objPct: [20, 40] } },
    ]);
    expect(ALLY_GAIN_PAIRS).toEqual([{ policy: 'human', other: 'lure', lo: 5 }, { policy: 'human_face', other: 'lure', lo: 10 }]);
    expect(ALLY_LIT_BANDS).toEqual([{ policy: 'lure', lo: 80 }, { policy: 'human', lo: 60 }]);
    expect(ALLY_HARD_LADDER).toEqual([{ policy: 'human', hi: -8 }, { policy: 'human_face', hi: -20 }]);
  });
  it('帯の組（D9）: 卯月がいれば卯月の帯（人に近い遊び方も帯）、卯月を切った夜は S0b の帯（人に近い遊び方は表だけ）', () => {
    expect(landingBandSet(true, false)).toEqual({ rows: LANDING_CALIBRATION_ALLY, humanBanded: true });
    expect(landingBandSet(true, true)).toEqual({ rows: LANDING_HARD_CALIBRATION_ALLY, humanBanded: true });
    expect(landingBandSet(false, false)).toEqual({ rows: LANDING_CALIBRATION_NO_ALLY, humanBanded: false });
    expect(landingBandSet(false, true)).toEqual({ rows: LANDING_HARD_CALIBRATION_NO_ALLY, humanBanded: false });
    expect(LANDING_HARD_CALIBRATION_NO_ALLY[1]!.bands).toEqual({ objPct: [45, 78], ownSunkPct: [0, 30] }); // v0.6.10 S0b: 夜明け 160 秒で 75 → 78
  });
});

describe(`揚陸を守る模擬のつり合い（jp_04・卯月あり、N ${N}・seed ${SEED}〜${SEED + N - 1}、帯 ± ${MARGIN_PT} 点）`, () => {
  it('ノーマル: 行の帯（± 8 点。人に近い 3 つも）と 15 の遊び方の I1〜I11（I9 は hide・circle_start・home_early）', () => {
    expect(rowMisses(normalRun(), LANDING_CALIBRATION_ALLY, LANDING_POLICIES)).toEqual([]);
    expect(LANDING_I9_POLICIES.every((p) => normalRun().cell(p, 0).trials === N)).toBe(true);
  }, SIM_TIMEOUT_MS);

  it('ノーマル: 対の帯（R13: lure ≥ lure_near + 10・R2: lure_late ≤ lure − 10 かつ ≥ hide + 20・R1: circle_start ≤ hide + 10・picket ≤ lure − 20・kite は得にならない。± 8 点）', () => {
    const run = normalRun();
    const out: string[] = [];
    for (const pr of LANDING_PAIRS) {
      const d = pr.value(run.cell(pr.policy, 0)) - pr.value(run.cell(pr.other, 0));
      if (!(d >= pr.lo - MARGIN_PT && d <= pr.hi + MARGIN_PT)) out.push(`${pr.policy} − ${pr.other} ${pr.name} ${d.toFixed(1)}（帯 ${pr.lo}〜${pr.hi} ± ${MARGIN_PT}）`);
    }
    expect(out).toEqual([]);
    expect(LANDING_PAIRS.some((p) => p.policy === 'lure' && p.other === 'lure_near' && p.lo === 10)).toBe(true); // R13 の対
    expect(LANDING_PAIRS.some((p) => p.policy === 'lure_away' || p.other === 'lure_away')).toBe(false); // R13: lure_away は表だけ
  }, SIM_TIMEOUT_MS);

  it('ノーマル: 卯月の得の弱い対（得(human_face) ≥ 得(lure)。得は同じ seed の卯月を切った夜と比べる）と照らした夜（lure ≥ 80・human ≥ 60。− 8 点）', () => {
    const run = normalRun();
    expect(run.allyGain('human_face')).toBeGreaterThanOrEqual(run.allyGain('lure'));
    expect(run.allyGain('lure')).toBeGreaterThan(0);
    for (const b of ALLY_LIT_BANDS) expect(litNightPct(run.trials(b.policy, 0)), b.policy).toBeGreaterThanOrEqual(b.lo - MARGIN_PT);
    for (const p of LANDING_I9_POLICIES) expect(litNightPct(run.trials(p, 0)), p).toBe(0);
  }, SIM_TIMEOUT_MS);

  it('ノーマル: 斉射の当たりうる 1 本（気づかれていない 0.30〜0.50・慌てた 0.08〜0.25。± 0.05）。戦いながらの斉射は見つかった夜だけで、lure_near は lure より多い（輸送船のそばで戦う）', () => {
    const run = normalRun();
    const st = run.salvo(0);
    for (const k of ['calm', 'hurried'] as const) {
      const s = st[k];
      expect(s.salvos, k).toBeGreaterThan(0);
      const r = s.potHits / s.fired;
      expect(r, k).toBeGreaterThanOrEqual(LANDING_SALVO_BANDS[k][0] - MARGIN_HIT);
      expect(r, k).toBeLessThanOrEqual(LANDING_SALVO_BANDS[k][1] + MARGIN_HIT);
    }
    expect(st.engaged.salvos).toBeGreaterThan(0);
    expect(run.cell('hide', 0).engaged).toBe(0);
    expect(run.cell('lure_near', 0).engaged).toBeGreaterThan(run.cell('lure', 0).engaged + LURE_NEAR_EXTRA);
  }, SIM_TIMEOUT_MS);

  it('ハード（PT 3 隻）: 行の帯（± 8 点。hide・lure・人に近い 3 つ）とその I1〜I11、ハードの段（ハード − ノーマル: human ≤ −8・human_face ≤ −20。＋ 8 点）', () => {
    const run = hardRun();
    expect(run.setup.pt.count).toBe(3);
    expect(HARD_POLICIES).toEqual(['hide', 'lure', 'face', 'human', 'human_face']);
    expect(rowMisses(run, LANDING_HARD_CALIBRATION_ALLY, HARD_POLICIES)).toEqual([]);
    for (const c of allyLadderChecks(run, normalRun(), HARD_POLICIES)) expect(c.value, c.name).toBeLessThanOrEqual(c.hi + MARGIN_PT);
  }, SIM_TIMEOUT_MS);

  it('data の source に S4 の値と理由（N 400 × 2 組の数。spec §6 S4・R13）: 揚陸・夜明け・燃料・ハード（雷撃の source は tests/pt-torpedo-data）と v0.6.10 S4 の卯月', () => {
    const P = (gameData.missionsSeed.missions as unknown as Rec[]).find((m) => m['id'] === 'jp_04')!['v0_1_prototype'] as Rec;
    const land = String((P['landing'] as Rec)['source']);
    expect(land).toContain('unload_s 140 は時間圧縮（S4 の模擬 N 400 × 2 組で動かさなかった: 120〜160 のどれでも lure の達成は同じ 87.3 / 85.3%');
    expect(land).toContain('1 にすると lure 69.5 / 70.3%・lure_late 22.8 / 24.5%（2.5 の掃き）＝最後の手段で使わない');
    expect(land).toContain('S4 の較正は engaged_error_factor 2.5 → 2.0 だけ＝spec R13');
    expect(land).toContain('v0.6.9 実機 1 回目（撃った PT は戦いながらの斉射でも去る）: 上の S4 の数は戦いながら撃った PT が去らなかった規則のとき');
    expect(String(P['duration_s_source'])).toContain('S4 の模擬（N 400 × 2 組）で動かさなかった: どの遊び方も夜明けの前に揚陸が決着し（I6）');
    expect(String(P['duration_s_source'])).toContain('v0.6.9 実機 1 回目（撃った PT は去る）の後も較正の 12 の遊び方で I6 は通り（ノーマル・ハード）');
    expect(String(P['fuel_allotment_gal_source'])).toContain('kite の漂流 87.5 / 83.0%・自艇の沈没 + 漂流は lure より ＋92.1 点（帯 ≥ 5）');
    expect(String(P['fuel_allotment_gal_source'])).toContain('v0.6.9 実機 1 回目（撃った PT は戦いながらの斉射でも去る）の後: kite の漂流 28.3 / 27.5%・自艇の沈没 + 漂流は lure より ＋31.4 点（帯 ≥ 5）');
    const hardSrc = String((P['hard'] as Rec)['source']);
    expect(hardSrc).toContain('ハードの帯（spec R12）を満たしたので残す: lure 67.0 / 63.8%（帯 45〜70）・自艇の沈没 19.0 / 20.8%（≤ 30）・hide 0 / 0%（≤ 8）');
    expect(hardSrc).toContain('v0.6.9 実機 1 回目（ユーザー「ハードモードは敵PTが3隻に増えるようにしてください」）: もう 3 隻なのでそのまま（tests/setup-jp04）');
    expect(hardSrc).toContain('lure 73.0 / 75.0%（帯を 45〜75 に）');
    // v0.6.10 S4（卯月の較正。spec-v0610 §6.3・§6.4・LD14）: 値はそのままで、掃きの結果・A/B・夜明け 200 秒・ハードの段を source に
    expect(hardSrc).toContain('v0.6.10 S4（卯月。PT は 3 隻のまま・卯月はノーマルと同じ）');
    expect(hardSrc).toContain('ノーマルとの段 human −8.6・human_face −32.3 点（帯 ≤ −8・≤ −20＝ハードははっきり難しい）');
    expect(String(P['duration_s_source'])).toContain('lure の夜明けの前の帰投 100 / 99.8%（S0b で外した帯 ≥ 85 を戻した。卯月を切った夜は 27.5 / 27.5%）');
    const ally = String((P['ally_destroyer'] as Rec)['source']);
    for (const t of [
      'S4 の較正（模擬 N 400 × 2 組・seed 1〜800・夜明け 160 秒。つまみの範囲の中だけを掃き、帯は spec-v0610 §6.3 のまま＝LD14）で値はこのまま',
      'この値（(3620, 2380)・800 m・毎秒 0.4）は全部の帯を通る', '(3610, 2400)・700 m・0.6 は段が −7.9 点で外れる',
      '去る PT を追わない（chase_fire_s 0）は達成の差 0 で照らした夜が human 59.8%（組 2）まで減って帯 60 を外れる', '夜明け 200 秒の確かめでもノーマル・ハードとも全部の帯を通る',
    ]) expect(ally).toContain(t);
    expect(ally).not.toContain('数の合わせは S4 の模擬');
    for (const t of [land, String(P['duration_s_source']), String(P['fuel_allotment_gal_source']), hardSrc]) {
      expect(t).not.toContain('S4 の模擬で決める');
      expect(t).not.toContain('hard block ごと外す');
    }
  });
});
