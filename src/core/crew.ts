// 乗員（docs/02 §6.6・§6.9、v0.3.4）: 死傷は HP から決まる（HP が 1/casualties_per_hp 減るごとに 1 名）。別の状態は持たないので、火災の連続減少・沈没・再開と常に整合する。
// v0.3.5: 減った乗員は操作に効く（docs/02 §6.6）。消火の長押しが 定員/生存 倍に伸び、1 名減るごとに旋回率・加速が per_loss ずつ落ちる（下限あり）。乗員が半分以下なら帰投点が減る（scoring）。Phaser 非依存。

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

/** 乗員の減りが操作に効く度合い（boats.json の damage.crew_effects） */
export interface CrewEffects {
  /** 消火の長押し秒 × (定員/生存)^この指数 */
  extinguishExponent: number;
  /** 1 名減るごとに旋回率・加速に掛かる割合（0.04 なら 3 名減で 0.88 倍） */
  turnRatePerLoss: number;
  accelPerLoss: number;
  /** 旋回率・加速の倍率の下限 */
  minFactor: number;
}

/** 旋回率に掛ける倍率（1 − per_loss × 減り、下限 minFactor） */
export function crewTurnFactor(e: CrewEffects, lost: number): number {
  return Math.max(e.minFactor, 1 - e.turnRatePerLoss * lost);
}

export function crewAccelFactor(e: CrewEffects, lost: number): number {
  return Math.max(e.minFactor, 1 - e.accelPerLoss * lost);
}

/** 消火の長押し秒に掛ける倍率（定員/生存）^指数。生存 0 は無い（浮いている限り 1 名以上）が、念のため定員で頭打ち */
export function crewExtinguishFactor(e: CrewEffects, alive: number, total: number): number {
  if (!(total > 0)) return 1;
  return Math.pow(total / Math.max(1, Math.min(total, alive)), e.extinguishExponent);
}

// ---------- data の読み出し ----------

export interface BoatCrewDataRecord {
  crew: number;
  hull_hp: number;
  damage: { casualties_per_hp: number; crew_effects: { extinguish_exponent: number; turn_rate_per_loss: number; accel_per_loss: number; min_factor: number } };
}

export function isBoatCrewDataRecord(v: unknown): v is BoatCrewDataRecord {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  const d = r['damage'] as Record<string, unknown> | undefined;
  if (!(typeof r['crew'] === 'number' && typeof r['hull_hp'] === 'number' && !!d && typeof d['casualties_per_hp'] === 'number' && Number.isFinite(d['casualties_per_hp'] as number))) return false;
  const e = d['crew_effects'] as Record<string, unknown> | undefined;
  return !!e && ['extinguish_exponent', 'turn_rate_per_loss', 'accel_per_loss', 'min_factor'].every((k) => typeof e[k] === 'number' && Number.isFinite(e[k] as number));
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

/** 検査: 指数と割合は 0 以上、下限は 0 より大きく 1 以下 */
export function crewEffectsFromData(r: BoatCrewDataRecord): CrewEffects {
  const e = r.damage.crew_effects;
  if (!(e.extinguish_exponent >= 0) || !(e.turn_rate_per_loss >= 0) || !(e.accel_per_loss >= 0)) throw new Error('boats.json の damage.crew_effects: extinguish_exponent / turn_rate_per_loss / accel_per_loss は 0 以上（docs/02 §6.6）');
  if (!(e.min_factor > 0 && e.min_factor <= 1)) throw new Error('boats.json の damage.crew_effects.min_factor は 0〜1（0 は除く）（docs/02 §6.6）');
  return { extinguishExponent: e.extinguish_exponent, turnRatePerLoss: e.turn_rate_per_loss, accelPerLoss: e.accel_per_loss, minFactor: e.min_factor };
}
