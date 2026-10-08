// スコア（docs/02 §6.9、v0.3.1）。Phaser 非依存。配点は data/scoring.json。
// 合計 = 帰投 + 任務達成（駆逐艦撃沈）+ 命中（不発を除く 1 本ごとに base × 発射距離の帯の倍率）+ 燃料残（帰投して任務達成のときだけ、残り % × max/100）。

export interface ScoringParams {
  returnedPoints: number;
  /** 任務の type → 達成点 */
  objectiveByType: Record<string, number>;
  hitBase: number;
  /** 距離帯の名前（hit_rate_model.kpi_by_range の band）→ 倍率 */
  hitRangeMultiplier: Record<string, number>;
  fuelMax: number;
  fuelRequiresReturnedAndObjective: boolean;
}

export interface ScoreInput {
  returned: boolean;
  objectiveDone: boolean;
  missionType: string;
  /** 距離帯ごとの命中（hits は不発を含むので duds を引く） */
  bands: readonly { band: string; hits: number; duds: number }[];
  /** 燃料の残り %（0〜100、HUD と同じ ceil） */
  fuelLeftPct: number;
}

export interface ScoreBreakdown {
  survival: number;
  objective: number;
  hits: number;
  fuel: number;
  total: number;
}

export function computeScore(inp: ScoreInput, p: ScoringParams, out: ScoreBreakdown = { survival: 0, objective: 0, hits: 0, fuel: 0, total: 0 }): ScoreBreakdown {
  out.survival = inp.returned ? p.returnedPoints : 0;
  out.objective = inp.objectiveDone ? (p.objectiveByType[inp.missionType] ?? 0) : 0;
  let hits = 0;
  for (let i = 0; i < inp.bands.length; i++) {
    const b = inp.bands[i]!;
    const effective = b.hits - b.duds;
    if (effective <= 0) continue;
    const mult = p.hitRangeMultiplier[b.band];
    if (mult === undefined) throw new Error(`scoring.json の hit.range_multiplier に帯 ${b.band} が無い`);
    hits += effective * Math.round(p.hitBase * mult);
  }
  out.hits = hits;
  const fuelAllowed = p.fuelRequiresReturnedAndObjective ? inp.returned && inp.objectiveDone : inp.returned;
  const pct = Math.max(0, Math.min(100, inp.fuelLeftPct));
  out.fuel = fuelAllowed ? Math.round((pct * p.fuelMax) / 100) : 0;
  out.total = out.survival + out.objective + out.hits + out.fuel;
  return out;
}

// ---------- data の読み出し ----------

export interface ScoringDataRecord {
  survival: { returned: number };
  objective_by_type: Record<string, number | string>;
  hit: { base: number; range_multiplier: Record<string, number> };
  fuel: { max: number; requires_returned_and_objective: boolean };
}

function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function isScoringDataRecord(v: unknown): v is ScoringDataRecord {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  const s = r['survival'] as Record<string, unknown> | undefined;
  const o = r['objective_by_type'] as Record<string, unknown> | undefined;
  const h = r['hit'] as Record<string, unknown> | undefined;
  const f = r['fuel'] as Record<string, unknown> | undefined;
  if (!s || !isFiniteNum(s['returned'])) return false;
  if (!o || typeof o !== 'object') return false;
  if (!h || !isFiniteNum(h['base']) || !h['range_multiplier'] || typeof h['range_multiplier'] !== 'object') return false;
  const rm = h['range_multiplier'] as Record<string, unknown>;
  if (!Object.values(rm).every((x) => isFiniteNum(x) && x >= 0)) return false;
  if (!f || !isFiniteNum(f['max']) || typeof f['requires_returned_and_objective'] !== 'boolean') return false;
  return true;
}

/**
 * data から配点を作る。kpiBands（hit_rate_model.kpi_by_range の band 名）がすべて倍率表にあることを検査する（欠けていれば例外）。
 * objective_by_type の "source" のような文字列の値は読み飛ばす
 */
export function scoringParamsFromData(r: ScoringDataRecord, kpiBands: readonly string[]): ScoringParams {
  const objective: Record<string, number> = {};
  for (const [k, v] of Object.entries(r.objective_by_type)) if (isFiniteNum(v)) objective[k] = v;
  for (const b of kpiBands) {
    if (!isFiniteNum(r.hit.range_multiplier[b])) throw new Error(`scoring.json の hit.range_multiplier に帯 ${b} が無い（hit_rate_model.kpi_by_range と一致させる）`);
  }
  return {
    returnedPoints: r.survival.returned,
    objectiveByType: objective,
    hitBase: r.hit.base,
    hitRangeMultiplier: { ...r.hit.range_multiplier },
    fuelMax: r.fuel.max,
    fuelRequiresReturnedAndObjective: r.fuel.requires_returned_and_objective,
  };
}
