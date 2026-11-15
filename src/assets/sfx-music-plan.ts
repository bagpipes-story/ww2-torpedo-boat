// v0.7.2 IP2（実機 2 回目。ユーザー「タイトルはDでいきます。Dをさらに名曲となるようにリメイクしてください」）: 動機の計画で旋律を作る（composePlanMelody）。
// 旋律の音は書かない（tests/sfx-music-compose）。計画（theme.melody.plan）は小節ごとの役・役ごとのリズムの候補・始まりの度数・移す段だけで、音は種つきの歩きと写しから:
// 1. リズム: 動機の頭（m1）・尾（m2）・続き（link）・句の終わり（half・closed・final）の型を種で選ぶ（同じ役は同じ型＝リズムがそろう）。frag は頭の半分（音の多い方）を 2 回。
// 2. 動機（最初の m1・m2 の 2 小節）＝弧: 始まり（主和音の音・音域の下から 0.4 の近く）→ 山（動機の 2〜4 番目の強拍のどれか・始まりの 3〜8 半音上の和音の音）→ 始まりの近くへ下りる。
//    歩きは順次が主（4 度〜6 度の表情の跳躍は 2 回まで・跳躍の後は逆向きの順次・強拍は和音の音・増 2 度と増 4 度と 7 度は使わない）。動機の山は 1 回だけ（山より下を歩く）。
// 3. 写し: 2 回目の m1・m2 はそのまま。top1・top2（a″）は動機を topShift 段上げる（強拍は和音の音へ）＝曲の山（一番高い音は 1 回）。ほかの音はどれも山より下（cap）。
// 4. b: seq は動機の頭を seqShift 段の候補で移す・seq2 はさらに 1 段上・frag は頭の半分を 2 段と 3 段上（上がる移し）。段とオクターブは、音域と cap の内・形（上下の向き）が頭と同じ・
//    同じ音が続かない・前の決まった音に近い物を点で選ぶ。
// 5. 句の終わり: その小節の一番長い音（同じ長さなら先）。half は 5 度（重み 0.65）か 2 度・closed は主音（0.6）か 3 度・final は主音。直前の決まった音に近い高さ。
// 6. 残り（link と句の終わりの後の上がり）は、前の音から次の決まった音へ向かって歩く（最後の 1 音は順次で入りやすく）。最後の小節の上がりは輪の頭（1 小節目の最初の音）へ。
// 作る時だけ動く（確保してよい）。乱数は呼ぶ側の音だけの SeededRng。
import type { SeededRng } from '../core/rng';
import type { MusicNote } from './sfx-music-synth';
import { barScale, chordAt, isAvoid, note, pcOf, pick, scaleStep, type MusicMelody, type MusicPlan, type MusicPlanRole, type MusicRhythm, type MusicTheme } from './sfx-music-theory';

/** 旋律の 1 音の場所（16 分の位置・長さ・強さ・小節・役・強拍・和音・音階） */
interface Slot { readonly at: number; readonly dur: number; readonly vel: number; readonly bar: number; readonly role: MusicPlanRole; readonly strong: boolean; readonly ch: number[]; readonly sc: number[] }
/** 歩く時の決まり（target＝run の後の決まった音・soft＝目安だけ〔届かなくてよい〕・cap＝上の限り・leaps＝表情の跳躍の残り） */
interface Walk { readonly target: number; readonly soft: boolean; readonly cap: number; leaps: number }
/**
 * 歩きの重み（音程の半音 → 重み）: 同じ音 0.06・順次 1・3 度 0.35・4 度 0.3・増 4 度 0・5 度 0.3（表情の跳躍）・6 度 0.12・7 度 0・オクターブ 0.03。
 * 順次の後は同じ向き ×1.6・逆 ×0.6（線が続く）・1 つ前の音へ戻る ×0.3（a b a b は使わない）。跳躍の残りが無い時の跳躍は ×0.05・6 度より大きく下へ ×0.25・
 * 音域のまん中（下と上の間）へ寄る（×(1 ± 1.2 × 離れ ÷ 音域)）
 */
const STEP_W = [0.06, 1, 1, 0.35, 0.35, 0.3, 0, 0.3, 0.12, 0.12, 0, 0, 0.03];
const W_ON = 1.6, W_OFF = 0.6, W_BACK = 0.3, MOTIF_LEAPS = 2, W_EXTRA_LEAP = 0.05, W_DOWN6 = 0.25, W_MID = 1.2;
/** 決まりを破る候補の重み（ほかに候補が無い時だけ選ばれる） */
const P_RULE = 1e-4;
/** 避ける音（長調の和音の半音上・増 4 度）を 4 分音符以上か跳躍で使う重み */
const W_AVOID = 0.05;
/** 目標へ近づく音 ×2・同じ距離 ×1・遠ざかる ×0.5。目標の 1 つ前は順次で入る音 ×3・同じ音 ×0.2・4 半音より遠い ×0.3 */
const W_NEAR = 2, W_FAR = 0.5, W_INTO = 3, W_INTO_SAME = 0.2, W_INTO_FAR = 0.3;
/** 句の終わりの度数の重み（主音からの半音）: half は 5 度 0.65・2 度 0.35、closed は主音 0.6・3 度 0.4、final は主音 */
const HALF_W: readonly (readonly [number, number])[] = [[7, 0.65], [2, 0.35]];
const CLOSED_W: readonly (readonly [number, number])[] = [[0, 0.6], [3, 0.4]];
/**
 * 高さの計画: 動機の山は音域の上から TOP_ROOM〜TOP_ROOM＋PEAK_BAND 半音下の和音の音（その上 topShift 段＝約 4 半音が曲の山）・始まりは山の 3〜8 半音下の主和音の音。
 * 上の限り: a・a′（1〜8 小節）は動機の山まで・b（9〜12）は曲の山の B_GAP 半音下まで・a″（13〜16）の山でない音は曲の山の 1 半音下まで（山は 1 回）
 */
const PEAK_MIN = 3, PEAK_MAX = 8, TOP_ROOM = 4, PEAK_BAND = 2, B_GAP = 3;
/** b の移しの点: 音域の外 100・形の向きの違い 8・同じ音の続き・行ったり来たり 8・入りの跳躍が逆向きの順次で戻らない 6・前の音からの距離 1／半音 */
const P_OUT = 100, P_SHAPE = 8, P_SAME = 8, P_LEAP = 6;
const UNSET = -1;

/** 増 2 度（音階に無い導音の飛び＝B♭–C#・F–G#）と増 4 度・7 度は使わない */
function awkward(a: number, b: number): boolean {
  const d = Math.abs(b - a), lo = pcOf(Math.min(a, b)), hi = pcOf(Math.max(a, b));
  return d === 6 || d === 10 || d === 11 || (d === 3 && ((lo === 10 && hi === 1) || (lo === 5 && hi === 8)));
}
/** pcs のどれかの音で p に一番近い音（[lo, hi] に無ければオクターブずつ広げる） */
function nearIn(p: number, pcs: readonly number[], lo: number, hi: number): number {
  for (let w = 0; w <= 24; w += 12) {
    let best = UNSET, bd = Infinity;
    for (let q = lo - w; q <= hi + w; q++) if (pcs.includes(pcOf(q)) && Math.abs(q - p) < bd) { bd = Math.abs(q - p); best = q; }
    if (best !== UNSET) return best;
  }
  return p;
}
/** 強拍は和音の音・音階の外は音階へ・[lo, hi] の外は内へ（写しの後の直し） */
function refit(q: number, o: Slot, lo: number, hi: number): number {
  const p = o.sc.includes(pcOf(q)) && q >= lo && q <= hi ? q : nearIn(q, o.sc, lo, hi);
  return o.strong && !o.ch.includes(pcOf(p)) ? nearIn(p, o.ch, lo, hi) : p;
}
function weighted(list: readonly (readonly [number, number])[], rng: SeededRng): number {
  let r = rng.next() * list.reduce((a, x) => a + x[1], 0);
  for (const [v, w] of list) if ((r -= w) < 0) return v;
  return list[list.length - 1]![0];
}
const sign = (x: number): number => (x > 0 ? 1 : x < 0 ? -1 : 0);

/** 役ごとのリズム（種で選んだ型）。frag は動機の頭の半分（音の多い方。同じなら前半）を 2 回。fragBack＝後半を使った */
function rhythmsOf(plan: MusicPlan, rng: SeededRng, barN: number): Record<MusicPlanRole, MusicRhythm> & { half2: MusicRhythm; fragBack: boolean } {
  const head = pick(plan.heads, rng), tail = pick(plan.tails, rng), link = pick(plan.links, rng), half = pick(plan.halfs, rng), half2 = pick(plan.halfs, rng);
  const closed = pick(plan.closes, rng), fin = pick(plan.finals, rng), front: number[] = [], back: number[] = [], h = barN / 2;
  for (let k = 0; k < head.length; k += 3) (head[k]! < h ? front : back).push(head[k]! < h ? head[k]! : head[k]! - h, Math.min(head[k + 1]!, h - (head[k]! % h)), head[k + 2]!);
  const fragBack = back.length > front.length, src = fragBack ? back : front, frag = [...src, ...src.map((v, i) => (i % 3 === 0 ? v + h : v))];
  return { m1: head, m2: tail, link, half, half2, closed, final: fin, seq: head, seq2: head, frag, top1: head, top2: tail, fragBack };
}

/** 動機の計画の旋律（同じ種は同じ音符）。音は MIDI・強さは型の % × vel・長さは × legato */
export function composePlanMelody(th: MusicTheme, m: MusicMelody, plan: MusicPlan, rng: SeededRng, six: number): MusicNote[] {
  const barN = th.beats * 4, lo = m.low, hi = m.high, rh = rhythmsOf(plan, rng, barN), slots: Slot[] = [], firstOf = new Map<MusicPlanRole, number>();
  let seenHalf = false;
  plan.roles.forEach((role, bar) => {
    const r = role === 'half' && seenHalf ? rh.half2 : rh[role];
    if (role === 'half') seenHalf = true;
    if (!firstOf.has(role)) firstOf.set(role, bar);
    for (let k = 0; k < r.length; k += 3) {
      const at = bar * barN + r[k]!, ch = chordAt(th, at);
      slots.push({ at, dur: r[k + 1]!, vel: r[k + 2]! / 100, bar, role, strong: r[k]! % 8 === 0, ch, sc: barScale(th, ch) });
    }
  });
  const ps = slots.map(() => UNSET), barSlots = (bar: number): number[] => slots.flatMap((o, i) => (o.bar === bar ? [i] : []));
  const mBars = [firstOf.get('m1')!, firstOf.get('m2')!], motif = [...barSlots(mBars[0]!), ...barSlots(mBars[1]!)];
  // 2. 動機（弧）: 山（強拍の 2〜4 番目のどれか・音域の上の方の和音の音）を先に決め、始まり（山の 3〜8 半音下の主和音の音）→ 山 → 始まりの近くへ歩く
  const mcap = hi - TOP_ROOM, deg = pick(plan.starts, rng), s0 = motif[0]!, tonic = tonicPcs(th);
  const strongs = motif.filter((i, k) => k > 0 && slots[i]!.strong).slice(0, 3), peakAt = strongs.length > 0 ? pick(strongs, rng) : motif[motif.length - 1]!;
  const peaks: number[] = [];
  for (let q = mcap - PEAK_BAND; q <= mcap; q++) if (slots[peakAt]!.ch.includes(pcOf(q))) peaks.push(q);
  const peak = peaks.length > 0 ? pick(peaks, rng) : mcap, startPc = scaleStep(th.tonic + 60, deg, slots[s0]!.sc) % 12, starts: number[] = [];
  for (let q = peak - PEAK_MAX; q <= peak - PEAK_MIN; q++) if (q >= lo && pcOf(q) === startPc && !awkward(q, peak)) starts.push(q);
  const start = starts.length > 0 ? starts[0]! : nearIn(peak - PEAK_MIN - 2, tonicPcs(th), lo, peak - PEAK_MIN), center = start;
  ps[s0] = start;
  ps[peakAt] = peak;
  const k0 = motif.indexOf(peakAt);
  walk(ps, slots, motif.slice(1, k0), { target: peak, soft: false, cap: peak - 1, leaps: MOTIF_LEAPS }, lo, hi, rng, tonic);
  walk(ps, slots, motif.slice(k0 + 1), { target: start, soft: true, cap: peak - 1, leaps: 1 }, lo, hi, rng, tonic);
  // 3. 写しと山
  let climax = -Infinity;
  plan.roles.forEach((role, bar) => {
    if (bar === mBars[0] || bar === mBars[1] || !['m1', 'm2', 'top1', 'top2'].includes(role)) return;
    const src = role === 'm1' || role === 'top1' ? barSlots(mBars[0]!) : barSlots(mBars[1]!), dst = barSlots(bar), up = role.startsWith('top') ? plan.topShift : 0;
    const qs = up === 0 ? src.map((k) => ps[k]!) : moveBar(slots, src.map((k) => ps[k]!), dst, src.map(() => up), lo, hi);
    dst.forEach((i, k) => { ps[i] = qs[k]!; if (up) climax = Math.max(climax, qs[k]!); });
  });
  if (!Number.isFinite(climax)) climax = hi + 1;
  const capOf = (bar: number): number => (bar < 8 ? peak : bar < 12 ? climax - B_GAP : climax - 1);
  // 4. b の移し（上がる移しを 3 小節まとめて置く）: seq は動機の頭を基の段 s・seq2 は s＋1・frag は頭の半分を s＋2 と s＋3。基の段（seqShift の候補 × オクターブ）は、
  //    3 小節の点（音域と cap の外・形の向きの違い・同じ音の続き・戻らない跳躍・増 2 度など・入りの距離）の和が一番小さい物（上がる移しを途中で折らない）
  const head = barSlots(mBars[0]!), headPs = head.map((i) => ps[i]!), half = barN / 2;
  const fragPs = head.filter((i) => (slots[i]!.at % barN < half) !== rh.fragBack).map((i) => ps[i]!);
  const bBars = plan.roles.flatMap((role, bar) => (role === 'seq' || role === 'seq2' || role === 'frag' ? [bar] : []));
  let bestB: number[][] = [], bestP = Infinity;
  for (const s0 of plan.seqShift) for (const oct of [0, -7]) {
    let p = rng.next(), ref = bBars.length > 0 ? lastSet(ps, barSlots(bBars[0]!)[0]!) : UNSET;
    const bars = bBars.map((bar) => {
      const role = plan.roles[bar]!, dst = barSlots(bar), src = role === 'frag' ? [...fragPs, ...fragPs] : headPs, cap = capOf(bar), up = role === 'seq' ? 0 : role === 'seq2' ? 1 : 2;
      const qs = moveBar(slots, src, dst, src.map((_, k) => s0 + oct + up + (role === 'frag' && k >= fragPs.length ? 1 : 0)), lo, cap);
      p += placePenalty(qs, src, ref, lo, cap);
      ref = qs[qs.length - 1]!;
      return qs;
    });
    if (p < bestP) { bestP = p; bestB = bars; }
  }
  bBars.forEach((bar, k) => barSlots(bar).forEach((i, j) => { ps[i] = bestB[k]![j]!; }));
  // 5. 句の終わり
  plan.roles.forEach((role, bar) => {
    if (role !== 'half' && role !== 'closed' && role !== 'final') return;
    const idx = barSlots(bar), ci = idx.reduce((b, i) => (slots[i]!.dur > slots[b]!.dur ? i : b), idx[0]!), o = slots[ci]!, ref = lastSet(ps, ci);
    const iv = role === 'final' ? 0 : weighted(role === 'half' ? HALF_W : CLOSED_W, rng), pc = (th.tonic + iv) % 12;
    const pcs = o.ch.includes(pc) ? [pc] : role === 'half' ? [(th.tonic + 2) % 12, (th.tonic + 7) % 12].filter((x) => o.ch.includes(x)) : [th.tonic];
    ps[ci] = nearIn(ref === UNSET ? center : ref, pcs.length > 0 ? pcs : o.ch, lo, capOf(bar));
  });
  // 6. 残りを歩く（前の音 → 次の決まった音。最後の上がりは輪の頭へ）
  for (let i = 0; i < slots.length; i++) {
    if (ps[i] !== UNSET) continue;
    let j = i;
    while (j < slots.length && ps[j] === UNSET) j++;
    const run: number[] = [];
    for (let k = i; k < j; k++) run.push(k);
    walk(ps, slots, run, { target: j < slots.length ? ps[j]! : ps[0]!, soft: false, cap: capOf(slots[i]!.bar), leaps: 1 }, lo, hi, rng, tonic);
    i = j;
  }
  return slots.map((o, i) => note(m.inst, o.at * six, o.dur * six * m.legato, ps[i]!, m.vel * o.vel));
}

/** 移した小節の点（小さいほど良い）: 音域と cap の外・形の向きの違い・同じ音の続き・行ったり来たり・戻らない跳躍・増 2 度など・入りの距離（前の音 ref から） */
function placePenalty(qs: readonly number[], src: readonly number[], ref: number, lo: number, cap: number): number {
  const into = ref === UNSET ? 0 : qs[0]! - ref;
  let p = Math.abs(into) + (Math.abs(into) > 12 || (ref !== UNSET && awkward(ref, qs[0]!)) ? P_OUT : 0);
  qs.forEach((q, k) => {
    const a = k > 0 ? q - qs[k - 1]! : into, b = k + 1 < qs.length ? qs[k + 1]! - q : 0;
    if (q < lo || q > cap) p += P_OUT;
    if (k > 0 && sign(q - qs[k - 1]!) !== sign(src[k]! - src[k - 1]!)) p += P_SHAPE;
    if (k > 0 && q === qs[k - 1]! && src[k] !== src[k - 1]) p += P_SAME;
    if (k >= 3 && q === qs[k - 2] && qs[k - 1] === qs[k - 3]) p += P_SAME;
    if (Math.abs(a) >= 3 && k + 1 < qs.length && !(Math.abs(b) >= 1 && Math.abs(b) <= 2 && sign(b) === -sign(a))) p += P_LEAP;
    if (k > 0 && awkward(qs[k - 1]!, q)) p += P_OUT;
  });
  return p;
}
/**
 * 音の並び src を dst の場所へ移す（音ごとに shifts 段。強拍は和音の音・ほかは音階の音・[lo, hi] の内へ直す）。直す時は、元の上下の向きを保つ音・同じ音を続けない音を、
 * 移した高さに近い順に選ぶ（直しで形がつぶれない）
 */
function moveBar(slots: readonly Slot[], src: readonly number[], dst: readonly number[], shifts: readonly number[], lo: number, hi: number): number[] {
  const out: number[] = [];
  dst.forEach((i, k) => {
    const o = slots[i]!, q = scaleStep(src[k]!, shifts[k]!, o.sc), pcs = o.strong ? o.ch : o.sc, prev = out[k - 1], dir = k > 0 ? sign(src[k]! - src[k - 1]!) : 0;
    const same = prev === undefined || (sign(q - prev) === dir && !awkward(prev, q) && (Math.abs(src[k]! - src[k - 1]!) <= 2) === (Math.abs(q - prev) <= 2));
    if (pcs.includes(pcOf(q)) && q >= lo && q <= hi && same) { out.push(q); return; }
    let best = UNSET, bd = Infinity;
    for (let r = Math.max(lo, q - 5); r <= Math.min(hi, q + 5); r++) {
      if (!pcs.includes(pcOf(r))) continue;
      const sd = k > 0 ? Math.abs(src[k]! - src[k - 1]!) : 0, rd = prev !== undefined ? Math.abs(r - prev) : 0;
      const d = Math.abs(r - q) + (prev !== undefined && sign(r - prev) !== dir ? 6 : 0) + (prev !== undefined && (sd <= 2) !== (rd <= 2) ? 3 : 0) + (prev !== undefined && rd > 0 && awkward(prev, r) ? 20 : 0);
      if (d < bd) { bd = d; best = r; }
    }
    out.push(best === UNSET ? refit(q, o, lo, hi) : best);
  });
  return out;
}
const tonicPcs = (th: MusicTheme): number[] => [th.tonic, (th.tonic + 3) % 12, (th.tonic + 7) % 12];

/** idx の前で一番近い決まった音の番号（無ければ −1）と、その音（無ければ −1） */
function lastIndex(ps: readonly number[], idx: number): number {
  for (let k = idx - 1; k >= 0; k--) if (ps[k] !== UNSET) return k;
  return UNSET;
}
function lastSet(ps: readonly number[], idx: number): number {
  const k = lastIndex(ps, idx);
  return k === UNSET ? UNSET : ps[k]!;
}

/**
 * 歩く: run の番号の音を順に選ぶ（前の音は run[0] の前の決まった音）。target は run の後の決まった音（soft は目安だけ）。届く範囲の内で近づき、最後の 1 音は順次で入りやすく。
 * 跳躍の後は逆向きの順次・跳躍は次の音が順次で戻れる時だけ・同じ音は 2 回まで・増 2 度などは使わない・cap より上は使わない
 */
function walk(ps: number[], slots: readonly Slot[], run: readonly number[], w: Walk, lo: number, hi: number, rng: SeededRng, tonic: readonly number[]): void {
  const mid = (lo + hi) / 2, j1 = run.length > 0 ? run[run.length - 1]! + 1 : 0;
  for (let r = 0; r < run.length; r++) {
    const i = run[r]!, o = slots[i]!, pi = lastIndex(ps, i), prev = ps[pi]!, prev2 = pi > 0 ? lastSet(ps, pi) : UNSET, iv = prev2 === UNSET ? 0 : prev - prev2, left = run.length - 1 - r;
    const nx = r + 1 < run.length ? slots[run[r + 1]!] : undefined, cand: number[] = [], wt: number[] = [];
    let total = 0;
    for (let q = Math.max(lo, prev - 12); q <= Math.min(w.cap, prev + 12); q++) {
      if (!o.sc.includes(pcOf(q)) || (o.strong && !o.ch.includes(pcOf(q)))) continue;
      const d = q - prev, ad = Math.abs(d);
      let x = STEP_W[ad] ?? 0;
      if (x === 0 || awkward(prev, q) || (ad === 0 && prev === prev2)) continue;
      if (Math.abs(iv) >= 3 && !(ad >= 1 && ad <= 2 && sign(d) === -sign(iv))) x *= P_RULE; // 跳躍の後は逆向きの順次
      if (ad >= 3 && nx && !canStepBack(q, d, nx, lo, w.cap)) x *= P_RULE;
      if (ad >= 3 && w.leaps <= 0) x *= W_EXTRA_LEAP;
      if (Math.abs(iv) >= 1 && Math.abs(iv) <= 2) x *= q === prev2 ? W_BACK : sign(d) === sign(iv) ? W_ON : W_OFF;
      if (d <= -8) x *= W_DOWN6; // 6 度より大きく下へ跳ばない（上への表情の跳躍は使う）
      if (pi >= 2 && q === prev2 && ps[pi - 2] === prev) x *= P_RULE; // a b a b（行ったり来たりの震え）
      const dist = Math.abs(w.target - q), was = Math.abs(w.target - prev);
      if (!w.soft && dist > 2 * left + 7) x *= P_RULE; // 届かない
      x *= dist < was ? W_NEAR : dist === was ? 1 : W_FAR;
      if (!w.soft && left === 0) x *= dist >= 1 && dist <= 2 ? W_INTO : dist === 0 ? W_INTO_SAME : dist > 4 ? W_INTO_FAR : 1;
      if (!w.soft && left === 0) {
        const into = w.target - q, after = j1 + 1 < ps.length && ps[j1 + 1] !== UNSET ? ps[j1 + 1]! - w.target : 0;
        if (awkward(q, w.target)) x *= P_RULE * P_RULE;
        if (ad >= 3 && !(Math.abs(into) >= 1 && Math.abs(into) <= 2 && sign(into) === -sign(d))) x *= P_RULE; // 跳躍で来たら決まった音へ逆向きの順次
        if (Math.abs(into) >= 3 && (Math.abs(d) >= 3 || (after !== 0 && !(Math.abs(after) <= 2 && sign(after) === -sign(into))))) x *= P_RULE; // 決まった音へ跳ぶなら、その後は逆向きの順次
        if (into === 0 && after === 0 && q === prev) x *= P_RULE;
      }
      if (tonic.includes(pcOf(q)) && q !== prev && triadRun(ps, pi, tonic) >= 3) x *= P_RULE; // 主和音の分散を 4 音続けない
      if ((o.dur >= 4 || ad >= 3) && isAvoid(q, o.ch)) x *= W_AVOID; // 避ける音を長く・跳躍で使わない
      x *= Math.max(0.2, 1 + (W_MID * sign(d) * (mid - prev)) / (hi - lo)); // 音域のまん中へ寄る
      cand.push(q); wt.push(x); total += x;
    }
    let p = total > 0 ? cand[cand.length - 1]! : nearIn(prev, o.strong ? o.ch : o.sc, lo, w.cap);
    for (let k = 0, x = rng.next() * total; k < cand.length && total > 0; k++) if ((x -= wt[k]!) < 0) { p = cand[k]!; break; }
    if (Math.abs(p - prev) >= 3) w.leaps--;
    ps[i] = p;
  }
}
/** 番号 pi までの主和音の音の続き（違う音の並び。同じ音は数えない） */
function triadRun(ps: readonly number[], pi: number, tonic: readonly number[]): number {
  let run = 0;
  for (let k = pi; k >= 0 && ps[k] !== UNSET && tonic.includes(pcOf(ps[k]!)); k--) if (k === pi || ps[k] !== ps[k + 1]) run++;
  return run;
}
/** 跳躍で q に来た後、次の音 nx が逆向きの順次で戻れるか */
function canStepBack(q: number, d: number, nx: Slot, lo: number, hi: number): boolean {
  for (const s of [1, 2]) {
    const r = q - sign(d) * s;
    if (r >= lo && r <= hi && nx.sc.includes(pcOf(r)) && (!nx.strong || nx.ch.includes(pcOf(r)))) return true;
  }
  return false;
}
