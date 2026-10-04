// 命中率 KPI の記録と集計（docs/02 §6.3、CLAUDE.md §9）。Phaser 非依存。
// 発射ごとに {range_m, hit, dud, erratic} を記録し、Result で距離帯ごとに集計する。集計は任務終了時に 1 回なので確保してよい。

export interface ShotRecord {
  rangeM: number;
  /** 幾何的に船体へ到達した（不発でも true） */
  hit: boolean;
  dud: boolean;
  erratic: boolean;
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
