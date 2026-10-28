// 停泊して揚陸する輸送船を守る模擬のつり合い（v0.6.9 S4。jp_04。core/landing-sim、systems/landing-sim-setup の LANDING_CALIBRATION・LANDING_PAIRS・LANDING_HARD_CALIBRATION・
// LANDING_SALVO_BANDS。spec-v069 §6 S4・§8・R12・R13）: 帯は N 400 × 2 組（scripts/landing-sim の TABLE=1・2）で決め、ここは N 60（seed 1〜60）の 1 組で同じ帯を広げて見る（回帰の検出）。
// 広げ方: % の行の帯と対の帯は両側に MARGIN_PT 点（N 60 の 1 夜は 1.7 点・達成 85% の標準誤差 約 4.6 点）、斉射の 1 本の命中は両側に MARGIN_HIT。不変（I1〜I6）は広げない。
// S4 の値（engaged_error_factor 2.0）の N 60 は lure 81.7%・lure_near 26.7%・lure_late − lure −10.0 点（帯の端。N 400 × 2 組は −20.5）・ハードの lure 66.7%。帯を外したら値を動かす前に
// scripts/landing-sim の N 400 × 2 組を回す（N 60 の外れは 1 組の揺れのことがある）。data の source に書いた S4 の値と理由もここで pin する。
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import type { LandingCell } from '../src/core/landing-sim-cell';
import { LANDING_POLICIES, type LandingPolicy } from '../src/core/landing-sim-policy';
import {
  LANDING_CALIBRATION, LANDING_HARD_CALIBRATION, LANDING_PAIRS, LANDING_SALVO_BANDS, landingBandMisses, landingCalibrationRun, landingInvariantMisses,
  type LandingBandRow, type LandingRun,
} from '../src/systems/landing-sim-setup';

const N = 60;
const SEED = 1;
/** % の帯を両側に広げる点 */
const MARGIN_PT = 8;
/** 斉射の当たりうる 1 本の帯を両側に広げる幅 */
const MARGIN_HIT = 0.05;
/** 1 つの it の上限（vitest で N 60 × 10 の遊び方が 13 秒ほど・ハードの 2 つが 3 秒ほど。CI は遅いことがある） */
const SIM_TIMEOUT_MS = 60_000;

type Rec = Record<string, unknown>;
let normal: LandingRun | undefined;
let hard: LandingRun | undefined;
const normalRun = (): LandingRun => (normal ??= landingCalibrationRun(gameData, 'jp_04', LANDING_POLICIES, N, SEED, 1));
/** ハードは帯のある遊び方だけ（hide・lure。全部の 10 だと N 60 で 15 秒ほど＝ファイルが 30 秒になる。全部の表は scripts/landing-sim の HARD=1） */
const HARD_POLICIES = LANDING_HARD_CALIBRATION.map((r) => r.policy);
const hardRun = (): LandingRun => (hard ??= landingCalibrationRun(gameData, 'jp_04', HARD_POLICIES, N, SEED, 1, { hard: true }));

/** 行の帯を両側に MARGIN_PT 広げた写し */
function widened(r: LandingBandRow): LandingBandRow {
  const bands: LandingBandRow['bands'] = {};
  for (const [k, b] of Object.entries(r.bands) as [keyof LandingBandRow['bands'], readonly [number, number]][]) bands[k] = [b[0] - MARGIN_PT, b[1] + MARGIN_PT];
  return { policy: r.policy, bands };
}

/** 行の帯（広げた）と不変を外れた項目（「遊び方: 項目」） */
function rowMisses(run: LandingRun, rows: readonly LandingBandRow[], policies: readonly LandingPolicy[]): string[] {
  return policies.flatMap((pol) => {
    const c: LandingCell = run.cell(pol, 0);
    const r = rows.find((x) => x.policy === pol);
    return [...(r ? landingBandMisses(widened(r), c) : []), ...landingInvariantMisses(c, run.setup)].map((m) => `${pol}: ${m}`);
  });
}

describe(`揚陸を守る模擬のつり合い（jp_04、N ${N}・seed ${SEED}〜${SEED + N - 1}、帯 ± ${MARGIN_PT} 点）`, () => {
  it('ノーマル: 行の帯（hide ≤ 15・lure 70〜88 で自艇の沈没 ≤ 18・漂流 ≤ 3・夜明けの前の帰投 ≥ 80・決着の前の燃料少と輪 ≤ 10。± 8 点）と全部の遊び方の I1〜I6', () => {
    expect(rowMisses(normalRun(), LANDING_CALIBRATION, LANDING_POLICIES)).toEqual([]);
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

  it('ノーマル: 斉射の当たりうる 1 本（気づかれていない 0.30〜0.50・慌てた 0.08〜0.25。± 0.05）。戦いながらの斉射は見つかった夜だけで、lure_near は 1 夜 2 斉射（PT 2 隻とも輸送船を撃つ）', () => {
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
    expect(run.cell('lure_near', 0).engaged).toBeGreaterThan(run.cell('lure', 0).engaged + 1);
  }, SIM_TIMEOUT_MS);

  it('ハード（PT 3 隻）: 行の帯（hide ≤ 8・lure 45〜70 で自艇の沈没 ≤ 30。± 8 点）とその 2 つの I1〜I6', () => {
    const run = hardRun();
    expect(run.setup.pt.count).toBe(3);
    expect(HARD_POLICIES).toEqual(['hide', 'lure']);
    expect(rowMisses(run, LANDING_HARD_CALIBRATION, HARD_POLICIES)).toEqual([]);
  }, SIM_TIMEOUT_MS);

  it('data の source に S4 の値と理由（N 400 × 2 組の数。spec §6 S4・R13）: 揚陸・夜明け・燃料・ハード（雷撃の source は tests/pt-torpedo-data）', () => {
    const P = (gameData.missionsSeed.missions as unknown as Rec[]).find((m) => m['id'] === 'jp_04')!['v0_1_prototype'] as Rec;
    const land = String((P['landing'] as Rec)['source']);
    expect(land).toContain('unload_s 140 は時間圧縮（S4 の模擬 N 400 × 2 組で動かさなかった: 120〜160 のどれでも lure の達成は同じ 87.3 / 85.3%');
    expect(land).toContain('1 にすると lure 69.5 / 70.3%・lure_late 22.8 / 24.5%（2.5 の掃き）＝最後の手段で使わない');
    expect(land).toContain('S4 の較正は engaged_error_factor 2.5 → 2.0 だけ＝spec R13');
    expect(String(P['duration_s_source'])).toContain('S4 の模擬（N 400 × 2 組）で動かさなかった: どの遊び方も夜明けの前に揚陸が決着し（I6）');
    expect(String(P['fuel_allotment_gal_source'])).toContain('kite の漂流 87.5 / 83.0%・自艇の沈没 + 漂流は lure より ＋92.1 点（帯 ≥ 5）');
    const hardSrc = String((P['hard'] as Rec)['source']);
    expect(hardSrc).toContain('ハードの帯（spec R12）を満たしたので残す: lure 67.0 / 63.8%（帯 45〜70）・自艇の沈没 19.0 / 20.8%（≤ 30）・hide 0 / 0%（≤ 8）');
    for (const t of [land, String(P['duration_s_source']), String(P['fuel_allotment_gal_source']), hardSrc]) {
      expect(t).not.toContain('S4 の模擬で決める');
      expect(t).not.toContain('hard block ごと外す');
    }
  });
});
