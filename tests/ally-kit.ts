// 卯月（v0.6.10 S2。core/ally-destroyer）のテストの共通の材料: jp_04 の卯月の値（data のまま）と、米PT を卯月から見た方位・距離に置く台、1 ステップを回す口、決まった値を返す乱数。
// 台は tests/landing-kit の bench（隊の PT はみな海域の外で始め、使う PT だけ置く）に、本物の LandingTorpedoLink・数える乱数 3 本（seed+26・+27・+28 の代わり）・演出の記録を足したもの。
import type { AllyDestroyerParams } from '../src/core/ally-destroyer-data';
import { createAllyDestroyer, stepAllyDestroyer, type AllyDestroyer, type AllyFx } from '../src/core/ally-destroyer';
import { LandingTorpedoLink, LandingTorpedoPool } from '../src/core/landing-torpedoes';
import type { PtEvents } from '../src/core/pt-boats';
import { SeededRng } from '../src/core/rng';
import { bench, CountingRng, events, FEEL_DT, LP, P, S0, TP, TS, type Bench } from './landing-kit';

export const A: AllyDestroyerParams = S0.allyDestroyer!;
export const DT = FEEL_DT * TS;

/** 決まった値を返す乱数（引いた回数も数える） */
export class FixedRng extends SeededRng {
  draws = 0;
  constructor(public u: number) {
    super(0);
  }
  override next(): number {
    this.draws++;
    return this.u;
  }
}

/** 並びの値を順に返す乱数（尽きたら最後の値） */
export class SeqRng extends SeededRng {
  draws = 0;
  constructor(private readonly us: readonly number[]) {
    super(0);
  }
  override next(): number {
    return this.us[Math.min(this.draws++, this.us.length - 1)]!;
  }
}

/** 演出の記録（発射の砲・着弾の砲と当たり・結末が変わった PT と結末（v0.6.10 S5b）） */
export class RecFx implements AllyFx {
  readonly fires: [number, number, number][] = [];
  readonly impacts: [number, boolean][] = [];
  readonly fates: [number, number][] = [];
  onFire(gi: number, x: number, y: number): void {
    this.fires.push([gi, x, y]);
  }
  onImpact(gi: number, _x: number, _y: number, hit: boolean): void {
    this.impacts.push([gi, hit]);
  }
  onFate(i: number, fate: number): void {
    this.fates.push([i, fate]);
  }
}

export interface AllyBench extends Bench {
  a: AllyDestroyer;
  link: LandingTorpedoLink;
  pool: LandingTorpedoPool;
  rng26: CountingRng;
  rng27: SeededRng & { draws: number };
  rng28: SeededRng & { draws: number };
  fx: RecFx;
  ev: PtEvents;
  t: number;
}

/** 卯月の台（p・乱数・演出は差し替えられる） */
export function allyBench(o: { p?: AllyDestroyerParams; rng27?: SeededRng & { draws: number }; rng28?: SeededRng & { draws: number }; fx?: boolean } = {}): AllyBench {
  const b = bench();
  const rng27 = o.rng27 ?? new CountingRng(27);
  const rng28 = o.rng28 ?? new CountingRng(28);
  const fx = new RecFx();
  const a = createAllyDestroyer(o.p ?? A, P, rng27, rng28, o.fx === false ? null : fx);
  const pool = new LandingTorpedoPool(TP.torpedo, P.count * TP.n, P.bounds);
  const link = new LandingTorpedoLink(b.ld, LP, b.st, pool);
  return { ...b, a, link, pool, rng26: new CountingRng(26), rng27, rng28, fx, ev: events(), t: 0 };
}

/** i 隻目を卯月から見た方位 brgDeg・distM に、艇首 headingDeg・速さ speedMps・段階 phase で置く（前のステップの段階も phase） */
export function atAlly(b: AllyBench, i: number, distM: number, brgDeg: number, headingDeg: number, speedMps: number, phase: number): void {
  const r = (brgDeg * Math.PI) / 180;
  const pt = b.q.boats[i]!;
  pt.x = b.a.p.x + distM * Math.sin(r);
  pt.y = b.a.p.y - distM * Math.cos(r);
  pt.headingDeg = headingDeg;
  pt.speedMps = speedMps;
  pt.phase = phase;
  b.st.prevPhase[i] = phase;
}

/** 卯月を n ステップ（雷撃は回さない。時計は FEEL_DT ずつ進む） */
export function stepAlly(b: AllyBench, n = 1, dawn = false): void {
  for (let k = 0; k < n; k++) {
    b.t += FEEL_DT;
    b.link.nowS = b.t;
    stepAllyDestroyer(b.a, b.q, b.st, TP, b.ld, b.rng26, dawn, b.t, FEEL_DT, DT, b.link, b.ev, (i) => b.left.push(i));
  }
}

/** 条件が立つまで回す（最大 max ステップ）。回したステップ数（立たなければ −1） */
export function stepUntil(b: AllyBench, cond: () => boolean, max = 6000): number {
  for (let k = 1; k <= max; k++) {
    stepAlly(b);
    if (cond()) return k;
  }
  return -1;
}

/** 砲を撃たない卯月（有効射程 1 m。照らすことと反応だけを見る） */
export const QUIET: AllyDestroyerParams = { ...A, gunnery: { ...A.gunnery, guns: A.gunnery.guns.map((g) => ({ ...g, effectiveM: 1 })) } };
/** ばらつき 0 の卯月（止まった PT には毎発当たる） */
export const EXACT: AllyDestroyerParams = { ...A, gunnery: { ...A.gunnery, guns: A.gunnery.guns.map((g) => ({ ...g, dispersionM: 0 })) } };
