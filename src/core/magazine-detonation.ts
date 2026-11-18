// 戦艦の弾薬庫（v0.8.2 S1。us_05「スリガオ海峡・最初の接触」の山城・扶桑。ユーザーの決め U1・spec-v0820 §4.4 D-G1〜D-G3・D-G5・§9 の 4）の純粋な規則: 魚雷の命中で艦の hitsTaken が
// 規則（記録の magazine＝config/magazine-data の MagazineRule が形で満たす MagazinePlan）の onHits のどれかになった時、その chance で弾薬庫が誘爆する（その場で沈み始める＝轟沈）。
// 乱数は seed+44 の系列（MAGAZINE_SEED_OFFSET。規則のある艦が隊にいる世界だけが起動時に 1 回作る）。rollMagazine は規則があり hitsTaken が onHits にある時にちょうど 1 回だけ引き、
// ほかは引かない（確率の値に依らない＝?debug&boom の 1 と確率 0 でも引く回数は同じ。SeededRng.chance は 0 と 1 で引かないので使わない）。
// 世界の仕事（S2 の systems/torpedo-hits・ship-magazine）: 呼ぶのは不発でない命中で takeHit が沈む本数に届かなかった時だけ（`d.takeHit() || roll` の右）。不発と終わり際の当たり
// （onLateHit＝すべて出た後）と、沈み始めた艦への当たりは呼ばない。艦ごとの記録（固定長の型付き配列）: 誘爆の秒（呼ぶ側の時計）・何本目か・引いた回数・引いた確率の和（探りの期待値＝S3）。
// 置き場は core/magazine-detonation（core/magazine は v0.6.8 の機銃の弾倉）。Phaser 非依存。作る（createMagazineLog）のほかは確保しない。平方根・atan2 なし。
import type { SeededRng } from './rng';

/** 乱数の系列 seed+44（+29〜+43 は jp_03 の運天港の空襲＝core/evac-data。系列は仕組みごとに 1 つ＝core/night の注） */
export const MAGAZINE_SEED_OFFSET = 44;

/** 規則（config/magazine-data の MagazineRule が形で満たす）: onHits[k] 本目の命中のとき chance[k] で誘爆 */
export interface MagazinePlan { readonly onHits: readonly number[]; readonly chance: readonly number[] }

export interface MagazineLog {
  readonly n: number;
  /** 艦ごと（長さ n）: 誘爆した秒（NaN は無し）・何本目の命中か（0 は無し）・引いた回数・引いた確率の和 */
  readonly detonatedAtS: Float64Array; readonly onHit: Uint8Array; readonly draws: Uint32Array; readonly chanceSum: Float64Array;
}

/** 規則の何番目か（規則が無いか hitsTaken が onHits に無ければ −1） */
function ruleIndex(rule: MagazinePlan | null, hitsTaken: number): number {
  if (rule === null) return -1;
  for (let k = 0; k < rule.onHits.length; k++) if (rule.onHits[k] === hitsTaken) return k;
  return -1;
}

/** hitsTaken 本目の命中の誘爆の確率（規則が無いか onHits に無ければ 0） */
export function magazineChanceAt(rule: MagazinePlan | null, hitsTaken: number): number {
  const k = ruleIndex(rule, hitsTaken);
  return k < 0 ? 0 : rule!.chance[k]!;
}

/** 起動時に 1 回（隊の艦の数 n は 1 以上の整数）。中身は resetMagazineLog の後と同じ */
export function createMagazineLog(n: number): MagazineLog {
  if (!(Number.isInteger(n) && n >= 1)) throw new Error(`弾薬庫の記録の艦の数（${n}）は 1 以上の整数（core/magazine-detonation）`);
  return { n, detonatedAtS: new Float64Array(n).fill(NaN), onHit: new Uint8Array(n), draws: new Uint32Array(n), chanceSum: new Float64Array(n) };
}

/** 夜の初めに戻す。確保しない */
export function resetMagazineLog(log: MagazineLog): void {
  for (let i = 0; i < log.n; i++) {
    log.detonatedAtS[i] = NaN;
    log.onHit[i] = log.draws[i] = log.chanceSum[i] = 0;
  }
}

/** 艦 i の hitsTaken 本目の命中（rule はその艦の規則・nowS は記録する秒）。引くのは規則があり onHits にある時だけちょうど 1 回。誘爆したら true */
export function rollMagazine(log: MagazineLog, i: number, rule: MagazinePlan | null, hitsTaken: number, nowS: number, rng: SeededRng): boolean {
  const k = ruleIndex(rule, hitsTaken);
  if (k < 0) return false;
  const c = rule!.chance[k]!;
  log.draws[i]!++;
  log.chanceSum[i]! += c;
  if (!(rng.next() < c)) return false;
  log.detonatedAtS[i] = nowS;
  log.onHit[i] = hitsTaken;
  return true;
}
