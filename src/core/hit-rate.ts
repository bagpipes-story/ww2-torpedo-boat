// 命中率 KPI の記録と集計（docs/02 §6.3、CLAUDE.md §9）。Phaser 非依存。
// 発射ごとに {range_m, hit, dud, erratic} を記録し、Result で距離帯ごとに集計する。集計は任務終了時に 1 回なので確保してよい。

export interface ShotRecord {
  rangeM: number;
  /** 幾何的に船体へ到達した（不発でも true） */
  hit: boolean;
  dud: boolean;
  erratic: boolean;
  /** 発射時の見越し角のずれ（度。解けなければ NaN。v0.5.0） */
  leadErrDeg: number;
  /** 駆逐艦を狙った発射（KPI に数える。輸送船は false。v0.5.0） */
  kpiTarget: boolean;
}

/**
 * 発射の時の KPI の的（v0.8.1 S1。spec-v0810 §3.5 D-K1）: 駆逐艦を狙い、夜明けの前（v0.5.0・v0.6.1 の今の条件）で、狙った艦の速さが minSpeedMps 以上
 * （config/kpi-data が読む hit_rate_model.json の kpi_measurement の目標の速さの下限＝5 kt。止まった艦への 1 本は通算の命中率に数えない。境は含む＝5.00 kt は数え 4.99 kt は数えない）。
 * minSpeedMps 0 なら今の条件そのもの（速さは 0 以上）。S2 の systems/torpedo-free が発射の時に 1 回呼ぶ（S1 ではゲームの誰も呼ばない）
 */
export function kpiTargetAtLaunch(isDestroyer: boolean, dawnReached: boolean, targetSpeedMps: number, minSpeedMps: number): boolean {
  return isDestroyer && !dawnReached && targetSpeedMps >= minSpeedMps;
}

/** KPI の「正しく狙った 1 本」（docs/02 §6.3。v0.5.0）: 駆逐艦を狙い、蛇行せず、見越し角のずれが maxDeg 以内 */
export function isAimedShot(r: ShotRecord, maxDeg: number): boolean {
  return r.kpiTarget && !r.erratic && Math.abs(r.leadErrDeg) <= maxDeg;
}

export interface RangeBand {
  band: string;
  range_m_min: number;
  range_m_max: number;
}

export interface BandSummary {
  band: string;
  shots: number;
  hits: number;
  duds: number;
}

/** 距離が属する帯の index。どの帯にも入らなければ -1 */
export function bandIndexForRange(rangeM: number, bands: RangeBand[]): number {
  for (let i = 0; i < bands.length; i++) {
    const b = bands[i]!;
    if (rangeM >= b.range_m_min && rangeM < b.range_m_max) return i;
  }
  return -1;
}

export function summarizeShots(records: ShotRecord[], bands: RangeBand[]): BandSummary[] {
  const out: BandSummary[] = bands.map((b) => ({ band: b.band, shots: 0, hits: 0, duds: 0 }));
  for (const r of records) {
    const i = bandIndexForRange(r.rangeM, bands);
    if (i < 0) continue;
    const s = out[i]!;
    s.shots++;
    if (r.hit) s.hits++;
    if (r.hit && r.dud) s.duds++;
  }
  return out;
}

export function countHits(records: ShotRecord[]): { total: number; hits: number; duds: number; misses: number } {
  let hits = 0;
  let duds = 0;
  for (const r of records) {
    if (r.hit) {
      hits++;
      if (r.dud) duds++;
    }
  }
  return { total: records.length, hits, duds, misses: records.length - hits };
}
