// v0.7.2 IP2（実機 2 回目。ユーザー「Dをさらに名曲となるようにリメイクしてください」）: 旋律の点（耳の代わりの数。scripts/sfx-music.ts の SEARCH=1 が D の種を選ぶ・tests/sfx-music-score が
// 決まりごとに確かめる）。ゲームは import しない（作る時に点は要らない）。どれも旋律（中央の 1 声）の音符だけから数える:
// - motif（動機が戻る）: 1・2 小節目を動機とし、3 小節目からの小節で、リズムが同じで上下の向きが 75% 以上同じ（か全部逆＝反行）の小節、と頭の半分の 2 回（断片）を数える。3 回以上（決まり）。
// - arch（弧）: 一番高い音は 1 回だけで、輪の 75〜90% の所（決まり）。b で上がり（a より高いか b の中で上がる）・山へは下から上がって入り・山の後は下りる。
// - steps（順次が主）: 順次の割合 60〜85%（72% に近いほど良い）・4 度〜6 度の表情の跳躍があり・5 度より大きい跳躍は少なく（1 つ −0.1）・オクターブより大きい跳躍は無い（決まり）・
//   跳躍は戻る（melodyCheck の recover）。
// - rhythm（リズムのまとまり）: 小節のリズムが動機（とその断片）のリズムの割合・ほかの小節と同じリズムの割合。
// - cadence（句の終わりの強さ）: 長い音・強拍・度数（半終止は 5 度、閉じるのは主音か 3 度・最後は主音）・順次で入る。
// - range（音域）: 9 度（13 半音）以上 13 度（21 半音）以下（決まり）。repeat: 同じ音は 2 回まで（決まり）・同じ音の続きは少ないほど良い。seam: 輪の最後の音から頭の音へ順次。
// - harmony（濁り）: 長調の和音の上の避ける音（assets/sfx-music-theory の isAvoid）を 4 分音符以上か跳躍で使った長さの割合が小さいほど良い。
// melodyCheck（旋法・強拍の和音の音・決まり文句など）の破れも決まりの破れ。決まりを 1 つでも破れば total は 0。作る時だけの道具（確保してよい）。
import { cadenceNoteIndex, chordAt, melodyCheck, pcOf, sixteenthOf, type MusicScore } from './sfx-music-compose';
import { isAvoid } from './sfx-music-theory';

/** 点の重み（合計 1）。決まり（hard）を破った曲は 0 */
export const MUSICALITY_WEIGHTS = { motif: 0.2, arch: 0.15, steps: 0.15, rhythm: 0.1, cadence: 0.15, range: 0.05, repeat: 0.1, seam: 0.05, harmony: 0.05 } as const;
export type MusicalityPart = keyof typeof MUSICALITY_WEIGHTS;
/** 決まりの数: 動機の戻り 3 回以上・山の位置 75〜90%・音域 13〜21 半音・跳躍 12 半音まで・同じ音 2 回まで・形が同じとみなす向きの割合 0.75・順次の目安 72%（幅 13%） */
export const MUSICALITY_RULES = { minReturns: 3, climaxFrom: 0.75, climaxTo: 0.9, minSpan: 13, maxSpan: 21, maxLeap: 12, maxRun: 2, shapeShare: 0.75, stepTarget: 0.72, stepWidth: 0.13 } as const;
export interface Musicality {
  readonly total: number; readonly parts: Readonly<Record<MusicalityPart, number>>; readonly violations: readonly string[];
  readonly returns: number; readonly climaxCount: number; readonly climaxAt: number; readonly span: number; readonly stepShare: number; readonly leaps: number; readonly maxRun: number;
}

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
const sign = (x: number): number => (x > 0 ? 1 : x < 0 ? -1 : 0);
/** 上下の向きの一致の割合（同じ数の音の並びどうし。逆を数えると反行） */
function shapeMatch(a: readonly number[], b: readonly number[], invert: boolean): number {
  if (a.length !== b.length || a.length < 2) return 0;
  let same = 0;
  for (let k = 1; k < a.length; k++) if (sign(a[k]! - a[k - 1]!) === (invert ? -1 : 1) * sign(b[k]! - b[k - 1]!)) same++;
  return same / (a.length - 1);
}

export function musicality(sc: MusicScore): Musicality {
  const th = sc.theme, m = th.melody, six = sixteenthOf(th.bpm), barN = th.beats * 4, barS = barN * six, ns = sc.melody, R = MUSICALITY_RULES, v: string[] = [];
  if (!m || ns.length < 2) throw new Error(`曲 '${th.key}' に旋律が無い`);
  v.push(...melodyCheck(sc).violations);
  const p = ns.map((x) => Math.round(x.pitch)), bar = ns.map((x) => Math.floor(x.start / barS)), n = p.length;
  const inBar = (b: number): number[] => p.flatMap((_, i) => (bar[i] === b ? [i] : []));
  const sigOf = (idx: readonly number[], from: number): string => idx.map((i) => `${ns[i]!.start - from}:${ns[i]!.len}`).join(',');
  // motif: 1・2 小節目の動機が戻る小節（リズムが同じ・向きが 75% 以上同じか逆）と頭の半分の 2 回
  const m1 = inBar(0), m2 = inBar(1), sig1 = sigOf(m1, 0), sig2 = sigOf(m2, barS), half = barS / 2;
  const halves = [m1.filter((i) => ns[i]!.start < half), m1.filter((i) => ns[i]!.start >= half)];
  let returns = 0, fromMotif = 2;
  for (let b = 2; b < th.bars; b++) {
    const idx = inBar(b), sig = sigOf(idx, b * barS), ps = idx.map((i) => p[i]!);
    const like = (src: readonly number[]): boolean => Math.max(shapeMatch(ps, src.map((i) => p[i]!), false), shapeMatch(ps, src.map((i) => p[i]!), true)) >= R.shapeShare;
    let hit = (sig === sig1 && like(m1)) || (sig === sig2 && like(m2));
    let rhythmHit = sig === sig1 || sig === sig2;
    for (const h of halves) {
      if (h.length < 2 || idx.length !== 2 * h.length) continue;
      const a = idx.slice(0, h.length), c = idx.slice(h.length), hs = sigOf(h, h === halves[0] ? 0 : half);
      if (sigOf(a, b * barS) === hs && sigOf(c, b * barS + half) === hs) {
        rhythmHit = true;
        const hp = h.map((i) => p[i]!);
        if (Math.max(shapeMatch(a.map((i) => p[i]!), hp, false), shapeMatch(a.map((i) => p[i]!), hp, true)) >= R.shapeShare && Math.max(shapeMatch(c.map((i) => p[i]!), hp, false), shapeMatch(c.map((i) => p[i]!), hp, true)) >= R.shapeShare) hit = true;
      }
    }
    if (hit) returns++;
    if (rhythmHit) fromMotif++;
  }
  if (returns < R.minReturns) v.push('returns');
  // arch: 山は 1 回・輪の 75〜90%
  const top = Math.max(...p), low = Math.min(...p), ci = p.indexOf(top), climaxCount = p.filter((x) => x === top).length, climaxAt = ns[ci]!.start / sc.n;
  if (climaxCount !== 1) v.push('climaxOnce');
  if (climaxAt < R.climaxFrom || climaxAt > R.climaxTo) v.push('climaxAt');
  const mean = (b0: number, b1: number): number => { const s = p.filter((_, i) => bar[i]! >= b0 && bar[i]! < b1); return s.reduce((a, x) => a + x, 0) / Math.max(1, s.length); };
  // 上がり: b が a より高いか、b の中で上がる（移しが上がる）
  const after = p.slice(ci + 1), rise = mean(8, 12) > mean(0, 8) - 1 || mean(10, 11) > mean(8, 9) + 1 ? 1 : 0.4, intoTop = ci >= 2 && p[ci - 1]! < top && p[ci - 2]! <= p[ci - 1]! + 2 ? 1 : ci >= 1 && p[ci - 1]! < top ? 0.6 : 0;
  const fall = after.length > 0 && after.reduce((a, x) => a + x, 0) / after.length <= top - 4 ? 1 : 0.4;
  // steps: 順次の割合・表情の跳躍・大きすぎる跳躍
  const iv = p.slice(1).map((x, i) => x - p[i]!), moves = iv.filter((x) => x !== 0), leapIv = moves.filter((x) => Math.abs(x) >= 3);
  const stepShare = moves.filter((x) => Math.abs(x) <= 2).length / Math.max(1, moves.length), expressive = leapIv.filter((x) => Math.abs(x) >= 5 && Math.abs(x) <= 9).length;
  if (leapIv.some((x) => Math.abs(x) > R.maxLeap)) v.push('bigLeap');
  // repeat: 同じ音の続き
  let maxRun = 1, run = 1;
  for (let i = 1; i < n; i++) { run = p[i] === p[i - 1] ? run + 1 : 1; maxRun = Math.max(maxRun, run); }
  if (maxRun > R.maxRun) v.push('repeatRun');
  // range
  const span = top - low;
  if (span < R.minSpan || span > R.maxSpan) v.push('span13');
  // rhythm: 動機のリズムの小節の割合と、ほかと同じリズムの小節の割合
  const sigs = Array.from({ length: th.bars }, (_, b) => sigOf(inBar(b), b * barS)), shared = sigs.filter((s, b) => sigs.some((t, c) => c !== b && t === s)).length;
  // cadence: 句の終わりの音（IP2 の計画は小節の一番長い音・ほかは句の最後の音）の強さ
  const cads = m.cadences.map(([b, kind]) => {
    const i = m.plan ? cadenceNoteIndex(ns, bar, b - 1) : bar.reduce((last, x, k) => (x < b && x >= b - m.span ? k : last), -1), deg = (pcOf(p[i]!) - th.tonic + 12) % 12;
    const len = ns[i]!.len / six, degS = kind === 'half' ? (deg === 7 ? 1 : deg === 2 ? 0.8 : 0) : kind === 'closed' ? (deg === 0 ? 1 : deg === 3 ? 0.85 : 0) : kind === 'end' ? (deg === 0 ? 1 : 0) : 0.6;
    const longS = len >= 7 ? 1 : len >= 5 ? 0.75 : len >= 3.5 ? 0.5 : 0.2, strongS = (ns[i]!.start / six) % (barN / 2) === 0 ? 1 : 0.5, stepS = i > 0 && Math.abs(p[i]! - p[i - 1]!) <= 2 ? 1 : 0.6;
    return 0.35 * degS + 0.3 * longS + 0.15 * strongS + 0.2 * stepS;
  });
  const sameMoves = iv.filter((x) => x === 0).length, seamIv = Math.abs(p[0]! - p[n - 1]!);
  let avoidLen = 0, allLen = 0;
  ns.forEach((x, i) => { allLen += x.len; if ((x.len / six >= 3.5 || (i > 0 && Math.abs(iv[i - 1]!) >= 3)) && isAvoid(p[i]!, chordAt(th, x.start / six))) avoidLen += x.len; });
  const parts: Record<MusicalityPart, number> = {
    motif: clamp01(returns / 6),
    arch: (rise + intoTop + fall) / 3,
    steps: clamp01(0.6 * clamp01(1 - Math.abs(stepShare - R.stepTarget) / R.stepWidth) + 0.4 * clamp01(expressive / 3) - 0.1 * leapIv.filter((x) => Math.abs(x) > 7).length),
    rhythm: clamp01(0.7 * (fromMotif / th.bars) + 0.3 * (shared / th.bars)) ,
    cadence: cads.reduce((a, x) => a + x, 0) / Math.max(1, cads.length),
    range: span >= R.minSpan && span <= R.maxSpan ? 1 : 0,
    repeat: clamp01(1 - (3 * sameMoves) / Math.max(1, iv.length)),
    seam: seamIv >= 1 && seamIv <= 2 ? 1 : seamIv <= 4 ? 0.6 : 0.2,
    harmony: clamp01(1 - (8 * avoidLen) / allLen),
  };
  const total = v.length > 0 ? 0 : (Object.keys(MUSICALITY_WEIGHTS) as MusicalityPart[]).reduce((a, k) => a + MUSICALITY_WEIGHTS[k] * parts[k], 0);
  return { total, parts, violations: v, returns, climaxCount, climaxAt, span, stepShare, leaps: leapIv.length, maxRun };
}
