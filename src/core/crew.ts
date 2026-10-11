// 乗員（docs/02 §6.6・§6.9、v0.3.4）: 死傷は HP から決まる（HP が 1/casualties_per_hp 減るごとに 1 名）。別の状態は持たないので、火災の連続減少・沈没・再開と常に整合する。
// 乗員が減っても操作・性能は変わらない（v0.5 以降の候補）。Phaser 非依存。

export interface CrewParams {
  total: number;
  /** HP 1 あたりの死傷者数（0.1 なら HP 10 で 1 名） */
  casualtiesPerHp: number;
}

/** 失った乗員（0〜total の整数） */
export function crewLost(p: CrewParams, maxHp: number, hp: number): number {
  const lostHp = Math.max(0, maxHp - hp);
  // 浮動小数の端数（9.999…）で 1 名少なく数えないよう少しだけ足す
  return Math.min(p.total, Math.floor(lostHp * p.casualtiesPerHp + 1e-9));
}

export function crewAlive(p: CrewParams, maxHp: number, hp: number): number {
  return p.total - crewLost(p, maxHp, hp);
}

// ---------- data の読み出し ----------

export interface BoatCrewDataRecord {
  crew: number;
  hull_hp: number;
  damage: { casualties_per_hp: number };
}

export function isBoatCrewDataRecord(v: unknown): v is BoatCrewDataRecord {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  const d = r['damage'] as Record<string, unknown> | undefined;
  return typeof r['crew'] === 'number' && typeof r['hull_hp'] === 'number' && !!d && typeof d['casualties_per_hp'] === 'number' && Number.isFinite(d['casualties_per_hp'] as number);
}

/** 検査: 定員は 1 以上の整数、率は 0 以上、浮いている艇（HP > 0）の乗員が全滅しない（hull_hp × 率 ≤ 定員） */
export function crewParamsFromData(r: BoatCrewDataRecord): CrewParams {
  if (!Number.isInteger(r.crew) || r.crew < 1) throw new Error('boats.json の crew は 1 以上の整数（docs/02 §6.6）');
  const rate = r.damage.casualties_per_hp;
  if (!(rate >= 0)) throw new Error('boats.json の damage.casualties_per_hp は 0 以上（docs/02 §6.6）');
  // 浮動小数の端数（100 × 0.14 = 14.000000000000002）で境界の設計値を弾かないよう少しだけ許す（crewLost の 1e-9 と同じ）
  if (r.hull_hp * rate > r.crew + 1e-9) throw new Error('boats.json の damage.casualties_per_hp が大きすぎる（浮いている艇の乗員が全滅し得る。hull_hp × 率 ≤ crew）');
  return { total: r.crew, casualtiesPerHp: rate };
}
