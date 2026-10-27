// v0.6.7 S0 の先に書く pin（spec-v067 §E.2・レビュー R13）: Result の本文の枝（大発掃討／米PT／魚雷）の並び [文, 字の大きさ px, 色, 後ろに節の間を足すか] を、
// 決まった Result の材料（us_02 の魚雷・史実モード・us_03 の大発・jp_05 の米PT と機関・jp_01 の輸送隊（ノーマル／ハードと隼艇）・jp_06 の魚雷）で literal に固める。
// 期待は 746884c の scenes/result-scene.ts:163-204 の枝（line() の文・大きさ・色と y += RESULT_SECTION_GAP の位置）を読んで書いた。色 undefined は hudTextStyle の既定の色（HUD_COLOR）。
// result-scene は Phaser を import するので vitest では作れない。scene が ui/result-body を呼ぶ移動の後も、ヘッドレスの Result 画面の Text の列（A＝746884c 対 B）で同じことを確かめる（N4）。
import { describe, expect, it } from 'vitest';
import type { BandSummary } from '../src/core/hit-rate';
import { resultBodyLines, type ResultBodySource } from '../src/ui/result-body';
import type { BargeResult, ConvoyResult, EngineResult, GunboatResult, PtResult } from '../src/ui/result-types';

const STRONG = '#e6eef7';
const KPI = '#e8d48a';
type Row = [string, number, string | undefined, boolean];
const rows = (r: ResultBodySource, hardV = false): Row[] => resultBodyLines(r, hardV).map((l) => [l.text, l.px, l.color, l.sectionAfter]);

const bands = (shots: readonly number[], hits: readonly number[], duds: readonly number[]): BandSummary[] =>
  ['<=400yd', '400-800yd', '800-1200yd', '1200-2000yd', '>=2000yd'].map((band, i) => ({ band, shots: shots[i]!, hits: hits[i]!, duds: duds[i]! }));
const base = (o: Partial<ResultBodySource>): ResultBodySource => ({
  hunt: null, pt: null, convoy: null, engine: null, gunboat: null, detections: 0, returned: true, objectiveDone: false,
  shots: [], capacity: 4, hits: 0, duds: 0, misses: 0, bands: bands([0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0]), kpi: null, sortie: { historical: false },
  ...o,
});
const HUNT: BargeResult = {
  enemyId: 'ijn_daihatsu', total: 6, sunk: 4, beached: 1, quota: 3, shots: 120, hits: 31, firstShotM: 312.4, firstShotBand: 'silent', firstDetectM: 405.2, flashFirst: false,
  killMinM: 180.6, killMaxM: 296.1, mgHits: 3, mgDamage: 9, batteryEnabled: true, batteryInArcS: 21.4, batteryShots: 6, batteryHits: 1, batteryDamage: 12,
};
const PT: PtResult = {
  enemyId: 'us_pt_enemy', total: 2, out: 1, alive: 1, leftAtDawn: false, passes: 3, maxPasses: 4, firedPasses: 2, cleanPasses: 1, shots: 18, hits: 2, damagePerHit: 6, hpMax: 50,
  firstDetectM: 612.3, firstDetectBand: 'cruise', lostContacts: 1, closestM: 88.2, minWarnS: 1.94, gunEnabled: true, gunShots: 40, gunHits: 7, retired: 1, sunk: 0, flashFirst: false,
  bursts: 1, suppressions: 1, passesOnBarges: 0, firstDetectKind: 0, gunLabel: '13mm',
};
const ENGINE: EngineResult = { warns: 2, finals: 1, limps: 1, limpS: 6.4 };
const CONVOY: ConvoyResult = { total: 3, arrived: 2, sunk: 1, quota: 3, hitsTaken: 9 };
const GUNBOAT: GunboatResult = { labelJa: '隼艇', hp: 31, maxHp: 60, hitsTaken: 4, sunk: false, sunkS: NaN, shots: 55, hits: 9, retired: 1, ptSunk: 0, suppressions: 1, attacked: 3 };
const PT01: PtResult = { ...PT, total: 3, gunLabel: '25mm', passesOnBarges: 2, firstDetectKind: 1, firstDetectBand: 'silent' };
const PT01H: PtResult = { ...PT01, gunHits: 16, suppressions: 2, retired: 2 }; // 隊の数（自艇＋隼艇）。自艇の分は隼艇の分を引いて 7・1・1
const KPI_LINES = { byBand: ['通算 —', '通算 3/10（30%）目標 35〜45%', '通算 1/4（25%）', '通算 —', '通算 —'], legend: '通算 = 正しく狙った 1 本（ずれ ±3° 以内）の累計 ・ 計 14 本（今回 +2）・ 各帯 10 本で判定' };

describe('Result の本文（ui/result-body。746884c の result-scene の枝と同じ並び）', () => {
  it('us_02 の魚雷: 1 行目（未発射つき）・節・撃った帯（不発の注記と通算の命中率）・凡例（KPI の色）', () => {
    const r = base({ shots: [{}, {}, {}], capacity: 4, hits: 1, duds: 1, misses: 1, bands: bands([0, 2, 1, 0, 0], [0, 1, 0, 0, 0], [0, 1, 0, 0, 0]), kpi: KPI_LINES });
    expect(rows(r)).toEqual(PIN.us02);
  });
  it('us_02 の史実モード（通算に数えない）と jp_06 の魚雷（発射なし・米PT 以外のキャンペーン）', () => {
    expect(rows(base({ shots: [{}, {}], capacity: 4, hits: 0, misses: 2, bands: bands([0, 0, 2, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0]), sortie: { historical: true } }))).toEqual(PIN.us02Historical);
    expect(rows(base({ capacity: 2 }))).toEqual(PIN.jp06);
  });
  it('us_03 の大発: 撃破・上陸（24 px・強調）・節・射撃と距離の行（20 px）', () => {
    expect(rows(base({ hunt: HUNT }))).toEqual(PIN.us03);
  });
  it('jp_05 の米PT と機関の不調: 1 行目（24 px）・節・見つかった・予告（KPI の色）・13mm・機関', () => {
    expect(rows(base({ pt: PT, engine: ENGINE, detections: 3 }))).toEqual(PIN.jp05);
    expect(rows(base({ pt: { ...PT, gunEnabled: false, gunShots: 0, gunHits: 0, retired: 0 }, detections: 0, returned: false }))).toEqual(PIN.jp05Unseen);
  });
  it('jp_01 の輸送隊: ノーマル（輸送隊の行・節・米PT の行は 20 px）とハード（ノルマの達成／未達・隼艇の行・節）', () => {
    expect(rows(base({ pt: PT01, convoy: CONVOY, detections: 2, objectiveDone: false }), false)).toEqual(PIN.jp01);
    expect(rows(base({ pt: PT01H, convoy: CONVOY, gunboat: GUNBOAT, detections: 2, objectiveDone: false }), true)).toEqual(PIN.jp01Hard);
  });
});

const PIN: Record<string, Row[]> = {
  us02: [
    ['命中 1 / 発射 3（不発 1、外れ 1、未発射 1）', 24, STRONG, true],
    ['400-800yd: 1 / 2（不発 1）   通算 3/10（30%）目標 35〜45%', 20, undefined, false],
    ['800-1200yd: 0 / 1   通算 1/4（25%）', 20, undefined, false],
    ['通算 = 正しく狙った 1 本（ずれ ±3° 以内）の累計 ・ 計 14 本（今回 +2）・ 各帯 10 本で判定', 20, KPI, false],
  ],
  us02Historical: [
    ['命中 0 / 発射 2（不発 0、外れ 2、未発射 2）', 24, STRONG, true],
    ['800-1200yd: 0 / 2', 20, undefined, false],
    ['史実モード: 通算の命中率には数えない（通算はノーマルの調整の根拠）', 20, KPI, false],
  ],
  jp06: [
    ['命中 0 / 発射 0（不発 0、外れ 0、未発射 2）', 24, STRONG, true],
    ['発射なし', 20, undefined, false],
    ['この任務の魚雷は通算の命中率に数えない（通算は米PTの調整の根拠）', 20, KPI, false],
  ],
  us03: [
    ['大発 撃破 4 / 6（ノルマ 3 ・ 上陸 1）', 24, STRONG, true],
    ['射撃 120 発 ・ 命中 31（26%）・ 最初の射撃 312 m（静音）', 20, undefined, false],
    ['撃破の距離 181〜296 m ・ 大発に気づかれた距離 405 m ・ 13mm の被弾 3 発（HP −9）', 20, undefined, false],
    ['沿岸砲: 射界の中 21 秒 ・ 砲撃 6 発 ・ 命中 1（HP −12）', 20, undefined, false],
  ],
  jp05: [
    ['米PT 航過 3 回 ・ 連射 1 回 ・ かわした 1/2 ・ 被弾 2 発（HP −12）', 24, STRONG, true],
    ['見つかった 3 回（最初 612 m ・ 巡航） ・ 見失わせた 1 回', 20, undefined, false],
    ['予告から初弾まで 最短 1.9 秒 ・ 撃たれた弾 18 発', 20, KPI, false],
    ['13mm 射撃 40 発 ・ 命中 7（18%） ・ 制圧 1 ・ 撃退 1 ・ 撃沈 0', 20, KPI, false],
    ['機関 不調 1 回（計 6 秒） ・ 限界 1 回', 20, KPI, false],
  ],
  jp05Unseen: [
    ['米PT に一度も見つからなかった', 24, STRONG, true],
    ['見つからず ・ PT の最接近 88 m', 20, undefined, false],
    ['予告から初弾まで 最短 1.9 秒 ・ 撃たれた弾 18 発', 20, KPI, false],
  ],
  jp01: [
    ['大発 上陸 2/3 ・ 沈没 1（ノルマ 3） ・ 大発の被弾 9 発', 24, STRONG, true],
    ['米PT 航過 3 回（大発へ 2） ・ 連射 1 回 ・ かわした 1/2 ・ 被弾 2 発（HP −12）', 20, undefined, false],
    ['米PT が捉えた 2 回（最初 612 m ・ 大発） ・ 見失わせた 1 回', 20, undefined, false],
    ['予告から初弾まで 最短 1.9 秒 ・ 撃たれた弾 18 発', 20, KPI, false],
    ['25mm 射撃 40 発 ・ 命中 7（18%） ・ 制圧 1 ・ 撃退 1 ・ 撃沈 0', 20, KPI, false],
  ],
  jp01Hard: [
    ['大発 上陸 2/3（ノルマ 3 ・ 未達） ・ 沈没 1 ・ 大発の被弾 9 発', 24, STRONG, false],
    ['隼艇 生還 HP 31/60 ・ 命中 9/55 発 ・ 撃退 1 ・ 制圧 1 ・ 狙われ 3 回', 20, undefined, true],
    ['米PT 航過 3 回（大発へ 2） ・ 連射 1 回 ・ かわした 1/2 ・ 被弾 2 発（HP −12）', 20, undefined, false],
    ['米PT が捉えた 2 回（最初 612 m ・ 大発） ・ 見失わせた 1 回', 20, undefined, false],
    ['予告から初弾まで 最短 1.9 秒 ・ 撃たれた弾 18 発', 20, KPI, false],
    ['25mm 射撃 40 発 ・ 命中 7（18%） ・ 制圧 1 ・ 撃退 1 ・ 撃沈 0', 20, KPI, false],
  ],
};
