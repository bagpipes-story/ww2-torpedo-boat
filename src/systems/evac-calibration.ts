// 空襲下の退避（v0.6.11。jp_03「運天港・空襲下の退避」。spec-v0611-r2 §12.4）の模擬の帯。帯の数はユーザーの決めの calibration targets（plan/user-decisions）から来るので動かさない。
// 合わせるのは data のつまみだけ（spec §12.5 の順。動かしたら理由を source と CHANGELOG に）。scripts/evac-sim の TABLE=2 が N 400 × 2 組（seed 1〜400・1001〜1400）を合わせた回で、
// S7 の tests/evac-sim-b が同じ帯を検査する。Phaser 非依存・window を読まない。
import type { EvacCell } from '../core/evac-sim-cell';
import type { EvacPolicy } from '../core/evac-sim-policy';

export interface EvacBandCheck {
  text: string;
  ok: boolean;
}

/** 漂流の上限（%）・seq の帯（ノーマル・ハード）・ハードの seq とノーマルの seq の差（点） */
export const EVAC_ADRIFT_MAX_PCT = 2;
export const EVAC_SEQ_BAND: readonly [number, number] = [50, 70];
export const EVAC_SEQ_HARD_BAND: readonly [number, number] = [20, 45];
export const EVAC_HARD_GAP_PTS = 15;

const inBand = (x: number, lo: number, hi: number): boolean => Number.isFinite(x) && x >= lo && x <= hi;

/**
 * 帯（spec §12.4）。cells は遊び方ごとの組を合わせたセル（無い遊び方の帯は出さない）。hard はハードの帯。normalSeqPct はハードの「≤ ノーマルの seq − 15 点」に使う（無ければ出さない）
 */
export function evacBandChecks(cells: ReadonlyMap<EvacPolicy, EvacCell>, hard: boolean, normalSeqPct: number = NaN): EvacBandCheck[] {
  const out: EvacBandCheck[] = [];
  const c = (p: EvacPolicy): EvacCell | undefined => cells.get(p);
  const add = (text: string, ok: boolean): void => void out.push({ text, ok });
  const seq = c('seq');
  const sp = seq ? seq.achievedPct : NaN;
  const f = (x: number): string => (Number.isFinite(x) ? x.toFixed(1) : '—');
  if (hard) {
    if (seq) add(`ハード seq の達成 ${f(sp)}% は ${EVAC_SEQ_HARD_BAND[0]}〜${EVAC_SEQ_HARD_BAND[1]}%`, inBand(sp, EVAC_SEQ_HARD_BAND[0], EVAC_SEQ_HARD_BAND[1]));
    if (seq && Number.isFinite(normalSeqPct)) add(`ハード seq ${f(sp)}% ≤ ノーマルの seq ${f(normalSeqPct)} − ${EVAC_HARD_GAP_PTS} 点`, sp <= normalSeqPct - EVAC_HARD_GAP_PTS);
    const slow = c('seq_slow');
    if (slow && seq) add(`ハード seq_slow ${f(slow.achievedPct)}% ≤ seq ${f(sp)}%`, slow.achievedPct <= sp);
    const stay = c('stay');
    if (stay) add(`ハード stay ${f(stay.achievedPct)}% ≤ 3%`, stay.achievedPct <= 3);
    const bot = c('bot');
    if (bot) add(`ハード bot ${f(bot.achievedPct)}% ≥ 60%`, bot.achievedPct >= 60);
    return out;
  }
  if (seq) {
    add(`seq の達成 ${f(sp)}% は ${EVAC_SEQ_BAND[0]}〜${EVAC_SEQ_BAND[1]}%`, inBand(sp, EVAC_SEQ_BAND[0], EVAC_SEQ_BAND[1]));
    add(`seq の残存の中央値 ${f(seq.medSurv)} は 6〜9`, inBand(seq.medSurv, 6, 9));
    add(`seq の漂流 ${f(seq.adriftPct)}% ≤ ${EVAC_ADRIFT_MAX_PCT}%`, seq.adriftPct <= EVAC_ADRIFT_MAX_PCT);
  }
  const slow = c('seq_slow');
  if (slow) {
    add(`seq_slow の達成 ${f(slow.achievedPct)}% は 30〜60% かつ ≤ seq ${f(sp)}%`, inBand(slow.achievedPct, 30, 60) && !(slow.achievedPct > sp));
    add(`seq_slow の残存の中央値 ${f(slow.medSurv)} は 5〜8`, inBand(slow.medSurv, 5, 8));
    add(`seq_slow の漂流 ${f(slow.adriftPct)}% ≤ ${EVAC_ADRIFT_MAX_PCT}%`, slow.adriftPct <= EVAC_ADRIFT_MAX_PCT);
  }
  const cover = c('seq_cover');
  if (cover && seq) add(`seq_cover ${f(cover.achievedPct)}% は seq ${f(sp)} ± 15 点`, Math.abs(cover.achievedPct - sp) <= 15);
  const ring = c('follow_ring');
  if (ring && seq) {
    add(`follow_ring ${f(ring.achievedPct)}% は seq − 10 〜 seq ＋ 20 点`, inBand(ring.achievedPct, sp - 10, sp + 20));
    add(`follow_ring の漂流 ${f(ring.adriftPct)}% ≤ ${EVAC_ADRIFT_MAX_PCT}%`, ring.adriftPct <= EVAC_ADRIFT_MAX_PCT);
  }
  const shoot = c('seq_shoot');
  if (shoot && seq) add(`seq_shoot ${f(shoot.achievedPct)}% は seq − 25 〜 seq ＋ 5 点（撃墜 ${f(shoot.downs)}/回）`, inBand(shoot.achievedPct, sp - 25, sp + 5));
  const own = c('own_only');
  if (own) {
    add(`own_only ${f(own.achievedPct)}% ≤ 25%`, own.achievedPct <= 25);
    add(`own_only の残存の中央値 ${f(own.medSurv)} は 3〜6`, inBand(own.medSurv, 3, 6));
  }
  const dodge = c('dodge_only');
  if (dodge && seq) add(`dodge_only ${f(dodge.achievedPct)}% ≤ seq − 15 点`, dodge.achievedPct <= sp - 15);
  const fight = c('fight');
  if (fight) add(`fight ${f(fight.achievedPct)}% ≤ 15%`, fight.achievedPct <= 15);
  const stay = c('stay');
  if (stay) {
    add(`stay ${f(stay.achievedPct)}% ≤ 10%`, stay.achievedPct <= 10);
    add(`stay の残存の中央値 ${f(stay.medSurv)} ≤ 4`, stay.medSurv <= 4);
  }
  const bot = c('bot');
  if (bot) {
    add(`bot ${f(bot.achievedPct)}% ≥ 90%`, bot.achievedPct >= 90);
    add(`bot の残存の中央値 ${f(bot.medSurv)} ≥ 10`, bot.medSurv >= 10);
    add(`bot で 18 隻残る ${f(bot.all18Pct)}% ≤ 10%`, bot.all18Pct <= 10);
  }
  return out;
}
