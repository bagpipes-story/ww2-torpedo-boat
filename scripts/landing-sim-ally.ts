// scripts/landing-sim の TABLE=4「卯月」（v0.6.10 S3b。spec-v0610 §6.2・レビュー H1・M2・L4・G-A7）の行を作る（scripts/landing-sim が 300 行を超えないため）。集計は src/core/landing-ally-cell。
// 遊び方ごと・組ごとに 1 行と、組ごとの出来事の最初の seed（S5 の一致の夜を選ぶ）。卯月のいない表（ALLY_OFF=1）は卯月の列が 0、見張る線の列は -。
import { ALLY_EAST_FATES, ALLY_FIRST_EVENTS, landingAllyCell, type LandingAllyCell } from '../src/core/landing-ally-cell';
import type { LandingPolicy } from '../src/core/landing-sim-policy';
import type { LandingRun } from '../src/systems/landing-sim-setup';

const f = (x: number, d: number, w: number): string => (Number.isFinite(x) ? x.toFixed(d) : '-').padStart(w);
const HEAD =
  'policy         lit%  litS  litA  aRet  aSnk | shell   hit chase |  calm fight  litS  litA  ally   t38  dawn other | t38off  own% preD% | thruC thruH thruE |  d27/n  d28/n | call% inCt% shown% obey%';

function line(c: LandingAllyCell): string {
  return (
    `${c.policy.padEnd(13)} ${f(c.litNightPct, 1, 5)} ${f(c.litSalvos, 2, 5)} ${f(c.litAways, 2, 5)} ${f(c.allyRetired, 2, 5)} ${f(c.allySunk, 2, 5)} | ${f(c.shells, 1, 5)} ${f(c.hits, 2, 5)} ${f(c.chaseShells, 1, 5)} | ` +
    `${ALLY_EAST_FATES.map((k) => f(c.east[k], 1, 5)).join(' ')} | ${f(c.t38Off, 2, 6)} ${f(c.ownSunkPct, 1, 5)} ${f(c.homeBeforeDawnPct, 1, 5)} | ` +
    `${f(c.thruCalmPct, 1, 5)} ${f(c.thruHurriedPct, 1, 5)} ${f(c.thruEngagedPct, 1, 5)} | ${f(c.draws27, 0, 6)} ${f(c.draws28, 0, 6)} | ` +
    `${f(c.callPct, 1, 5)} ${f(c.callHiddenPct, 1, 5)} ${f(c.callShownPct, 1, 6)} ${f(c.callObeyPct, 1, 5)}`
  );
}

/** TABLE=4 の行（seed は最初の seed、n は 1 組の夜、span は組の seed の範囲の文字） */
export function allyTableLines(run: LandingRun, pols: readonly LandingPolicy[], blocks: number, n: number, seed: number, span: (b: number) => string): string[] {
  const s = run.setup;
  const guard = s.allyDestroyer?.guardLegs ?? [];
  const dir = guard.map((i) => `${s.landing.runDirJa[i] ?? '?'}（線 ${i}）`).join('・') || '-';
  const out: string[] = [];
  const cells: LandingAllyCell[][] = [];
  for (let b = 0; b < blocks; b++) {
    out.push(`組 ${b + 1}（seed ${span(b)}）: 卯月（1 夜あたり・%。見張る線の PT＝${dir} の結末はその PT の数あたり %）`);
    out.push(HEAD);
    const row: LandingAllyCell[] = [];
    for (const pol of pols) {
      const c = landingAllyCell(pol, run.trials(pol, b), seed + b * n, guard, s.torpedo.n);
      row.push(c);
      out.push(line(c));
    }
    cells.push(row);
  }
  out.push(`出来事の最初の seed（組ごと。- は無し）: ${ALLY_FIRST_EVENTS.join('・')}`);
  for (let k = 0; k < pols.length; k++) {
    out.push(`${pols[k]!.padEnd(13)} ${cells.map((row) => ALLY_FIRST_EVENTS.map((e) => f(row[k]!.first[e], 0, 4)).join(' ')).join(' | ')}`);
  }
  out.push(
    'lit% = 卯月が PT を照らした夜 | litS・litA = 1 夜の照らされた斉射・撃たずに去らせた PT | aRet・aSnk = 卯月の砲の撃退・撃沈 | shell・hit・chase = 卯月の弾・生きた PT への命中・去る PT を追って撃った弾 | ' +
      'calm〜other = 見張る線の PT の結末: 気づかれていない斉射・自艇と戦って撃った（慌てた・戦いながら）・照らされた斉射・撃たずに去った・卯月の砲・自艇の 25mm・夜明け・ほか | ' +
      't38off = 自艇の 25mm が撃退か撃沈した PT（1 夜） | own%・preD% = 自艇の沈没・夜明けの前の帰投 | thruC・thruH・thruE = 卯月の船体の下を通る魚雷（気づかれていない・慌てた（照らされたも）・戦いながらの斉射の撃った本数あたり %。まっすぐな道の上限） | ' +
      'd27/n・d28/n = seed+27・+28 の 1 夜の回数 | call%・inCt%・shown%・obey% = 夜明け近しの帰投の輪の呼びかけ: 決着の前に立った・立ったとき接触・報告・雷跡があって見えなかった・見えた・聞いた夜（lure の動きだけ）',
  );
  return out;
}
