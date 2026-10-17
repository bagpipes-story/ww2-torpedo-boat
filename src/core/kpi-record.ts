// 通算の命中率 KPI（docs/02 §6.3、CLAUDE.md §9。v0.5.0）: 任務をまたいで「正しく狙った 1 本」の距離帯ごとの発射数・命中数を貯める。Phaser 非依存。
// 保存（localStorage）は systems/kpi-storage、ここは数え方・保存の形（検査込み）・Result の行だけ。任務の終わりに 1 回だけ使う（確保してよい）。
import { bandIndexForRange, isAimedShot, type RangeBand, type ShotRecord } from './hit-rate';

export interface KpiTargetBand extends RangeBand {
  target_hit_min: number;
  target_hit_max: number;
}

/** 帯ごと（kpi_by_range の順）の発射数と命中数（命中は幾何。不発も命中に数える＝模擬と同じ） */
export interface KpiTally {
  shots: number[];
  hits: number[];
}

export function emptyTally(bandCount: number): KpiTally {
  return { shots: new Array<number>(bandCount).fill(0), hits: new Array<number>(bandCount).fill(0) };
}

/** 任務の記録のうち正しく狙った 1 本（isAimedShot）を足す。足した本数を返す */
export function addAimedShots(t: KpiTally, records: readonly ShotRecord[], bands: readonly RangeBand[], aimedMaxDeg: number): number {
  let n = 0;
  for (const r of records) {
    if (!isAimedShot(r, aimedMaxDeg)) continue;
    const i = bandIndexForRange(r.rangeM, bands as RangeBand[]);
    if (i < 0) continue;
    t.shots[i]!++;
    if (r.hit) t.hits[i]!++;
    n++;
  }
  return n;
}

/** 保存の形: {"bands":[帯の名前…],"shots":[…],"hits":[…]} */
export function serializeTally(t: KpiTally, bands: readonly RangeBand[]): string {
  return JSON.stringify({ bands: bands.map((b) => b.band), shots: t.shots, hits: t.hits });
}

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

/** 保存の形を読む。無い・壊れている・帯の並びが今の data と違う・命中が発射より多いなら空から（古い記録を混ぜない） */
export function parseTally(text: string | null, bands: readonly RangeBand[]): KpiTally {
  const empty = emptyTally(bands.length);
  if (text === null) return empty;
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return empty;
  }
  if (typeof v !== 'object' || v === null) return empty;
  const o = v as Record<string, unknown>;
  const names = o['bands'];
  const shots = o['shots'];
  const hits = o['hits'];
  if (!Array.isArray(names) || !Array.isArray(shots) || !Array.isArray(hits)) return empty;
  if (names.length !== bands.length || shots.length !== bands.length || hits.length !== bands.length) return empty;
  for (let i = 0; i < bands.length; i++) {
    if (names[i] !== bands[i]!.band || !isCount(shots[i]) || !isCount(hits[i]) || hits[i] > shots[i]) return empty;
  }
  return { shots: shots as number[], hits: hits as number[] };
}

/** Result の帯の行に足す通算（帯ごと。kpi_by_range の順）: 「通算 3/5 = 60%（目標 45〜55%）」。まだ無ければ「通算 0 本」 */
export function tallyEntriesJa(t: KpiTally, bands: readonly KpiTargetBand[]): string[] {
  return bands.map((b, i) => {
    const n = t.shots[i]!;
    if (n === 0) return '通算 0 本';
    const pct = Math.round((t.hits[i]! / n) * 100);
    return `通算 ${t.hits[i]}/${n} = ${pct}%（目標 ${Math.round(b.target_hit_min * 100)}〜${Math.round(b.target_hit_max * 100)}%）`;
  });
}
