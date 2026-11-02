// 味方の駆逐艦 卯月（v0.6.10。jp_04「多号作戦・オルモック湾へ」。docs/02 §6.11、spec-v0610 §2 R-U1〜R-U8・リードの決定 LD5・LD8・LD10）の Phaser 非依存の規則。
// 世界（systems/world-ally。S5）と模擬（core/landing-sim。S3）が同じものを、stepPtTorpedoes の後・敵の魚雷のプールの前に回す（R-U6 の順 (i)）。卯月は泊地の北東に止まったまま
// （動かない・狙われない・沈まない＝R-U1。米PT の AI は卯月を知らない）。固定ステップごとに次の順（tests/ally-destroyer が順を固定する）:
// 1. 見張り（seed+27）: 去っていない・まだ気づいていない PT を添字の順に、速さで分けた距離（fast_kt 以上は lookout_fast_m、遅い PT は lookout_slow_m）の内で、卯月からの方位が扇
//    watch_arc_deg の内（端を含む。atan2 は距離の内だけ）なら候補として 1 回だけ引き、u < 1 − exp(−rate × 体感秒) で気づく。気づいた PT は去るまで覚える（扇は最初に気づくときだけ）。
// 2. 照らす PT（乱数なし）: 今の PT が生きて探照灯の射程の内なら続ける。今の PT が去る（PT_LEAVE だけ。海域の外・沈んだは追わない＝LD10）なら、射程の内で chase_fire_s の間は追って
//    撃つ（気づいた生きた PT が射程の内にいれば、すぐそちらへ）。ほかは気づいた生きた PT の最も近い 1 隻か無し。照らす PT が変われば照らされた秒を 0 に。
// 3. 探照灯（core/gunnery の updateIllumination。星弾は射程 0 で撃たない）→ 4. 砲（updateGuns。seed+28 は 1 発 2 回。着弾が生きた PT に当たれば 1 回引いて凍結の hitPt。
//    pt_sink_chance の砲（12 cm）は米PT の値の写しの fireChance をその値に。生きていない PT への着弾は外れで引かない）
// → 5. 照らされて生きたまま light_react_s 経った PT は ptLitReact（航過は待つ・射点なら慌てた斉射＝LE_LIT_SALVO・ほかは撃たずに去る＝onLitAway の LE_LIT_AWAY）→ 6. 照らされている PT の印。
// 砲の手柄は隼艇と同じ形（systems/gunboat-credit の GunboatCredit）: 命中・制圧・出来事は hitPt の前後の差、結末が変わった PT の fateBy は FATE_BY_ALLY（卯月だけが書く。LD8）。
// 確保は createAllyDestroyer の 1 夜に 1 回だけ（毎ステップの関数は new・配列・オブジェクト・閉包を作らない）。乱数の系列は作る側（world-ally・landing-sim）が作って渡す。
import type { AllyDestroyerParams } from './ally-destroyer-data';
import type { BoatState } from './boat-motion';
import { FATE_BY_ALLY } from './convoy-sim-gunboat';
import { createGunneryState, updateGuns, updateIllumination, type GunneryState, type ShellEvents } from './gunnery';
import { PT_FATE_NONE, PT_FATE_SUNK, PT_LEAVE, type PtBoatState, type PtEvents, type PtSection } from './pt-boats';
import { hitPt, ptLive } from './pt-damage';
import type { PtParams } from './pt-data';
import { LIT_AWAY, LIT_SALVO, LIT_WAIT, ptLitReact, type PtTorpedoShip, type PtTorpedoSink, type PtTorpedoState } from './pt-torpedo';
import type { PtTorpedoParams } from './pt-torpedo-data';
import type { SeededRng } from './rng';
import { bearingDeg } from './ship-ai';

/** 卯月の見張りの乱数の系列（seed+27。v0.6.10。jp_04 だけ。候補の PT 1 隻 1 ステップに 1 回） */
export const ALLY_LOOKOUT_SEED_OFFSET = 27;
/** 卯月の砲の乱数の系列（seed+28。v0.6.10。jp_04 だけ。1 発 2 回・生きた PT への命中 1 回。撃たなければ引かない） */
export const ALLY_GUN_SEED_OFFSET = 28;

/** 世界の演出（模擬は null）: 砲口の閃光（x, y は卯月）・着弾（hit は生きた PT に当たって hitPt を呼んだ） */
export interface AllyFx {
  onFire(gunIndex: number, x: number, y: number): void;
  onImpact(gunIndex: number, x: number, y: number, hit: boolean): void;
}

/** 卯月の砲の手柄（systems/gunboat-credit の GunboatCredit と同じ欄＝隼艇の作法。HUD の「命中 計 N」から引く・Result の卯月の行。S5〜S7） */
export interface AllyCredit {
  hits: number;
  suppressions: number;
  /** 卯月の砲が最後に起こした出来事の q.gunEventSeq（0 は無し） */
  eventSeq: number;
  /** PT ごとに最後の結末を決めた砲（卯月が決めたら FATE_BY_ALLY。ほかの砲の書き込みは PtSquadron の手柄の口だけ＝LD8） */
  readonly fateBy: Int8Array;
}

/** 雷撃の入れ先と照らされて去った出来事（core/landing-torpedoes の LandingTorpedoLink がそのまま満たす） */
export interface AllyLink extends PtTorpedoSink {
  onLitAway(i: number): void;
}

/** 1 夜の卯月（createAllyDestroyer で 1 回。updateGuns の着弾の知らせ ShellEvents を自分で受ける） */
export class AllyDestroyer implements ShellEvents {
  /** 12 cm（pt_sink_chance の砲）の 1 命中に使う米PT の値の写し（fireChance だけ pt_sink_chance） */
  readonly pHit: PtParams;
  /** 止まった卯月（位置・艇首・速さ 0）と、照らす PT の写し（updateIllumination・updateGuns の相手。毎ステップ中身だけ書く） */
  readonly ship: BoatState;
  readonly tgt: BoatState = { x: 0, y: 0, headingDeg: 0, speedMps: 0 };
  readonly g: GunneryState;
  /** 探照灯の射程の二乗 */
  readonly light2: number;
  /** PT ごと: 見張りが気づいた（去るまで）・照らされて反応した・このステップに照らされている（S5 で PtSquadron が見せる）・一度でも照らされた */
  readonly spotted: Uint8Array; readonly reacted: Uint8Array; readonly lit: Uint8Array; readonly everLit: Uint8Array;
  /** 照らす PT（−1 は無し）・去った PT を追って撃っている・その残りの体感秒・今の PT が生きたまま照らされた体感秒 */
  target = -1; chasing = false; chaseLeftS = 0; litS = 0;
  readonly credit: AllyCredit;
  /** 数え（模擬の不変 I7・I10 と表。S3）: 見張りの候補のステップ（= seed+27 の回数）・気づいた・照らした PT・撃った弾・追って撃った弾・生きた PT への命中（hitPt）・撃退・撃沈・照らされた斉射・撃たずに去った */
  candSteps = 0; spots = 0; litPts = 0; shells = 0; chaseShells = 0; liveHits = 0; retired = 0; sunk = 0; litSalvos = 0; litAways = 0;
  /** 今のステップの隊と hitPt の知らせ（stepAllyDestroyer が砲の前に書き、着弾の onImpact が読む） */
  q: PtSection | null = null;
  ptEv: PtEvents | null = null;

  constructor(
    readonly p: AllyDestroyerParams,
    /** 今夜の米PT（揺らぎ込み）: 25 mm の命中の値・当たりの半長と半幅・隻数 */
    readonly pt: PtParams,
    readonly rng27: SeededRng,
    readonly rng28: SeededRng,
    readonly fx: AllyFx | null,
  ) {
    const n = pt.count;
    this.pHit = { ...pt, fireChance: p.ptSinkChance };
    this.ship = { x: p.x, y: p.y, headingDeg: p.headingDeg, speedMps: 0 };
    this.g = createGunneryState(p.gunnery, p.shellPoolSize, p.headingDeg);
    this.light2 = p.gunnery.searchlight.rangeM * p.gunnery.searchlight.rangeM;
    this.spotted = new Uint8Array(n);
    this.reacted = new Uint8Array(n);
    this.lit = new Uint8Array(n);
    this.everLit = new Uint8Array(n);
    this.credit = { hits: 0, suppressions: 0, eventSeq: 0, fateBy: new Int8Array(n) };
  }

  /** ShellEvents: 撃った（updateGuns が 2 回引いた後） */
  onFire(gunIndex: number, x: number, y: number): void {
    this.shells++;
    if (this.chasing) this.chaseShells++;
    if (this.fx) this.fx.onFire(gunIndex, x, y);
  }

  /** ShellEvents: 着弾。当たりは今の照らす PT（飛んでいる間に変われば今の PT で見る＝core/gunnery のまま）で、生きた PT だけ hitPt（生きていなければ外れ・引かない） */
  onImpact(gunIndex: number, x: number, y: number, hit: boolean): void {
    const q = this.q;
    const t = this.target;
    let live = false;
    if (hit && q !== null && t >= 0) {
      const b = q.boats[t]!;
      live = ptLive(b);
      if (live) this.hitLive(q, b, t, gunIndex);
    }
    if (this.fx) this.fx.onImpact(gunIndex, x, y, live);
  }

  /** 生きた PT t への 1 命中: seed+28 を 1 回 → 凍結の hitPt → 手柄（前後の差・結末が変われば FATE_BY_ALLY） */
  private hitLive(q: PtSection, b: PtBoatState, t: number, gunIndex: number): void {
    const cr = this.credit;
    const f0 = b.fate;
    const h0 = q.gunHits;
    const s0 = q.suppressions;
    const e0 = q.gunEventSeq;
    const u = this.rng28.next();
    hitPt(q, gunIndex === this.p.sinkGunIndex ? this.pHit : this.pt, t, this.p.gunnery.guns[gunIndex]!.damage, u, this.ptEv!);
    this.liveHits++;
    cr.hits += q.gunHits - h0;
    cr.suppressions += q.suppressions - s0;
    if (q.gunEventSeq !== e0) cr.eventSeq = q.gunEventSeq;
    if (b.fate === f0) return;
    cr.fateBy[t] = FATE_BY_ALLY;
    if (b.fate === PT_FATE_SUNK) this.sunk++;
    else if (f0 === PT_FATE_NONE) this.retired++;
  }
}

/** 出撃の組み立てで 1 回（世界は systems/world-ally、模擬は core/landing-sim。rng27・rng28 は seed+27・seed+28 の系列、fx は世界の演出か null） */
export function createAllyDestroyer(p: AllyDestroyerParams, pt: PtParams, rng27: SeededRng, rng28: SeededRng, fx: AllyFx | null): AllyDestroyer {
  return new AllyDestroyer(p, pt, rng27, rng28, fx);
}

/**
 * 固定ステップに 1 回（stepPtTorpedoes の後・敵の魚雷のプールの前。R-U6）。st・tp・ship・rng26・dawn・nowS・link・onLeave は stepPtTorpedoes と同じもの（照らされた斉射は同じ雷撃の道）、
 * feelDt は体感秒（見張り・照射・砲の間隔・照らされた秒・追う秒）、dt は time_scale 込みの秒（砲弾の飛行）、ptEv は hitPt の知らせ（jp_04 は何もしない）
 */
export function stepAllyDestroyer(a: AllyDestroyer, q: PtSection, st: PtTorpedoState, tp: PtTorpedoParams, ship: PtTorpedoShip, rng26: SeededRng, dawn: boolean, nowS: number, feelDt: number, dt: number, link: AllyLink, ptEv: PtEvents, onLeave: (i: number) => void): void {
  allyLookout(a, q, feelDt);
  allyTarget(a, q, feelDt);
  const t = a.target;
  const has = t >= 0;
  if (has) copyBoat(a.tgt, q.boats[t]!);
  updateIllumination(a.g, a.ship, a.tgt, has, a.p.gunnery, feelDt);
  a.q = q;
  a.ptEv = ptEv;
  updateGuns(a.g, a.ship, a.tgt, has, a.pt.hitHalfLengthM, a.pt.hitHalfBeamM, a.p.gunnery, a.rng28, feelDt, dt, a);
  const lit = has && a.g.illuminated;
  if (lit && a.reacted[t] === 0 && ptLive(q.boats[t]!)) {
    a.litS += feelDt;
    if (a.litS >= a.p.lightReactS) {
      const r = ptLitReact(st, tp, q, ship, t, rng26, nowS, dawn, link, onLeave);
      if (r !== LIT_WAIT) a.reacted[t] = 1;
      if (r === LIT_SALVO) a.litSalvos++;
      else if (r === LIT_AWAY) {
        a.litAways++;
        link.onLitAway(t);
      }
    }
  }
  for (let i = 0; i < a.lit.length; i++) a.lit[i] = lit && i === t ? 1 : 0;
  if (lit && a.everLit[t] === 0) {
    a.everLit[t] = 1;
    a.litPts++;
  }
}

/** 1. 見張り: 候補の PT（去っていない・気づいていない・速さの距離の内・扇の内）だけ 1 回引く */
function allyLookout(a: AllyDestroyer, q: PtSection, feelDt: number): void {
  const p = a.p;
  for (let i = 0; i < q.boats.length; i++) {
    const b = q.boats[i]!;
    if (b.phase >= PT_LEAVE || a.spotted[i] === 1) continue;
    const fast = b.speedMps >= p.fastMps;
    const dx = b.x - p.x;
    const dy = b.y - p.y;
    if (dx * dx + dy * dy > (fast ? p.lookFast2 : p.lookSlow2)) continue;
    const brg = bearingDeg(p.x, p.y, b.x, b.y);
    if (brg < p.arc0Deg || brg > p.arc1Deg) continue;
    a.candSteps++;
    if (a.rng27.next() < 1 - Math.exp(-(fast ? p.rateFast : p.rateSlow) * feelDt)) {
      a.spotted[i] = 1;
      a.spots++;
    }
  }
}

/** 2. 照らす PT: 続ける・去った PT を追う（PT_LEAVE だけ。LD10）・気づいた生きた PT が射程の内なら追うのをやめてそちらへ・無ければ最も近い 1 隻 */
function allyTarget(a: AllyDestroyer, q: PtSection, feelDt: number): void {
  let t = a.target;
  if (t >= 0) {
    const b = q.boats[t]!;
    if (!inLight(a, b) || b.phase > PT_LEAVE) t = -1;
    else if (b.phase === PT_LEAVE) {
      if (a.chasing) a.chaseLeftS -= feelDt;
      else {
        a.chasing = true;
        a.chaseLeftS = a.p.chaseFireS;
      }
      if (!(a.chaseLeftS > 0)) t = -1;
    }
  }
  if (t < 0 || q.boats[t]!.phase >= PT_LEAVE) {
    const n = nearestSpotted(a, q);
    if (n >= 0) t = n;
  }
  if (t < 0 || q.boats[t]!.phase < PT_LEAVE) a.chasing = false;
  if (t !== a.target) {
    a.target = t;
    a.litS = 0;
  }
}

/** 気づいた生きた PT のうち探照灯の射程の内で最も近いもの（同じ距離なら添字の小さい方。無ければ −1） */
function nearestSpotted(a: AllyDestroyer, q: PtSection): number {
  let best = -1;
  let best2 = Infinity;
  for (let i = 0; i < q.boats.length; i++) {
    const b = q.boats[i]!;
    if (a.spotted[i] !== 1 || b.phase >= PT_LEAVE) continue;
    const dx = b.x - a.p.x;
    const dy = b.y - a.p.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > a.light2 || d2 >= best2) continue;
    best = i;
    best2 = d2;
  }
  return best;
}

function inLight(a: AllyDestroyer, b: PtBoatState): boolean {
  const dx = b.x - a.p.x;
  const dy = b.y - a.p.y;
  return dx * dx + dy * dy <= a.light2;
}

function copyBoat(o: BoatState, b: PtBoatState): void {
  o.x = b.x;
  o.y = b.y;
  o.headingDeg = b.headingDeg;
  o.speedMps = b.speedMps;
}
