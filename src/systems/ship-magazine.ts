// 戦艦の弾薬庫（v0.8.2 S2。us_05「スリガオ海峡・最初の接触」の山城・扶桑。ユーザーの決め U1・spec-v0820 §4.4 D-G1・D-G2・D-G5・§9 の 4、lead の L21）の世界の側:
// 隊（systems/destroyer-group）の magazine。規則（記録の magazine＝kits の ColumnKit.magazine）のある艦が隊にいる世界だけ world-enemies が 1 回作って付け、乱数の系列 seed+44
// （core/magazine-detonation の MAGAZINE_SEED_OFFSET）もその時だけ作る。無い任務は隊の magazine が null（系列も作らない・torpedo-hits の式は takeHit だけ）。
// 呼ぶのは systems/torpedo-hits の 1 行だけ（`d.takeHit() || (g.magazine?.roll(…) ?? false)`＝takeHit が先・沈む本数に届いた命中では呼ばない）。不発・終わり際の当たり（onLateHit）・
// 沈み始めた艦（out＝魚雷が当たらない）は呼ばない。誘爆したら torpedo-hits が今の沈む道（playSinking）でその場で沈め始める（轟沈の見た目と長さは S2b）。
// 記録は艦ごとの MagazineLog（誘爆の秒＝世界の stepTimeS・何本目か・引いた回数・引いた確率の和）。Phaser 非依存。確保は作る時だけ（引くのは命中の出来事だけ）。
import type { ColumnKit } from '../config/column-mission-data';
import { MAGAZINE_SEED_OFFSET, createMagazineLog, rollMagazine, type MagazineLog, type MagazinePlan } from '../core/magazine-detonation';
import { SeededRng } from '../core/rng';

export class ShipMagazine {
  readonly log: MagazineLog;
  /** 誘爆した艦の数（通算） */
  detonations = 0;
  private readonly rng: SeededRng;

  private constructor(
    /** 隊の艦ごとの規則（隊の添字。規則の無い艦は null） */
    readonly rules: readonly (MagazinePlan | null)[],
    seed: number,
  ) {
    this.log = createMagazineLog(rules.length);
    this.rng = new SeededRng((seed + MAGAZINE_SEED_OFFSET) >>> 0);
  }

  /** 規則のある艦が列にいる隊だけ作る（無ければ null＝乱数の系列も作らない）。column は片道の列の kits・first は列の 1 隻目の隊の添字・total は隊の隻数 */
  static of(column: readonly ColumnKit[] | undefined, first: number, total: number, seed: number): ShipMagazine | null {
    if (!column || !column.some((k) => k.magazine !== null)) return null;
    const rules: (MagazinePlan | null)[] = [];
    for (let i = 0; i < total; i++) rules.push(i >= first && i < first + column.length ? column[i - first]!.magazine : null);
    return new ShipMagazine(rules, seed);
  }

  /** 艦 i の hitsTaken 本目の命中（沈む本数に届かなかった時だけ）。nowS は世界の stepTimeS（記録の秒）。誘爆したら true（引くのは規則があり onHits にある時だけ 1 回） */
  roll(i: number, hitsTaken: number, nowS: number): boolean {
    if (!rollMagazine(this.log, i, this.rules[i] ?? null, hitsTaken, nowS, this.rng)) return false;
    this.detonations++;
    return true;
  }

  /** 引いた回数と引いた確率の和（隊の全艦。探りの期待値＝S3） */
  get draws(): number {
    let n = 0;
    for (let i = 0; i < this.log.n; i++) n += this.log.draws[i]!;
    return n;
  }

  get chanceSum(): number {
    let c = 0;
    for (let i = 0; i < this.log.n; i++) c += this.log.chanceSum[i]!;
    return c;
  }
}
