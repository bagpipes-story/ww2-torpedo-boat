// 揚陸の任務（v0.6.9 S2。jp_04）の純粋な規則のテストの共通の材料: jp_04 の世界の値（data のまま）・数える乱数・雷撃の入れ先の記録・PT の置き方・
// 凍結の米PT の隊（core/pt-boats）を雷撃（core/pt-torpedo）と回す小さな夜（自艇は見つからない＝隠れる、か止まった自艇）。
import { gameData } from '../src/config/game-data';
import { PT_SHELL_POOL_SIZE } from '../src/config/pt-config';
import { createLanding, type LandingState } from '../src/core/landing';
import type { LandingParams } from '../src/core/landing-data';
import { createPtSection, stepPtSection, PT_OUT, type PtCheck, type PtEvents, type PtSection } from '../src/core/pt-boats';
import type { PtParams } from '../src/core/pt-data';
import { createPtTorpedoState, stepPtTorpedoes, type PtTorpedoSink, type PtTorpedoState } from '../src/core/pt-torpedo';
import type { PtTorpedoParams } from '../src/core/pt-torpedo-data';
import { SeededRng } from '../src/core/rng';
import { directSortie } from '../src/core/sortie';
import { buildWorldSetup } from '../src/systems/world-setup';
import type { WorldSetup } from '../src/systems/world-setup-types';

export const TS = gameData.hitRateModel.world.time_scale;
export const FEEL_DT = 1 / 60;
export const S0 = buildWorldSetup(gameData, 'jp_04');
export const P: PtParams = S0.ptBoats!;
export const TP: PtTorpedoParams = S0.landing!.torpedo;
export const LP: LandingParams = S0.landing!.params;

/** 今夜の揺らぎ込みの jp_04（seed・ハード） */
export function setupOf(seed: number, hard = false): WorldSetup {
  return buildWorldSetup(gameData, 'jp_04', { hard, sortie: directSortie('jp_04', seed, 'none', hard, false) });
}

/** next() を数える乱数 */
export class CountingRng extends SeededRng {
  draws = 0;
  override next(): number {
    this.draws++;
    return super.next();
  }
}

export interface Shot { i: number; x: number; y: number; h: number; dud: boolean; erratic: boolean; bias: number; m: number }
/** 斉射（kind は core/pt-torpedo の PT_SALVO_*） */
export interface Salvo { i: number; kind: number; m: number; n: number }

/** 雷撃の入れ先の記録（撃った 1 本ずつと斉射） */
export class RecSink implements PtTorpedoSink {
  readonly shots: Shot[] = [];
  readonly salvos: Salvo[] = [];
  fire(i: number, x: number, y: number, h: number, dud: boolean, erratic: boolean, bias: number, m: number): void {
    this.shots.push({ i, x, y, h, dud, erratic, bias, m });
  }
  onSalvo(i: number, kind: number, m: number, n: number): void {
    this.salvos.push({ i, kind, m, n });
  }
}

/** 輸送船・隊・雷撃の状態（allOut なら隊の PT はみな海域の外＝撃たない、で始める。使う PT は place で置く。false なら出発点で哨戒＝凍結の隊と回す夜） */
export interface Bench { ld: LandingState; q: PtSection; st: PtTorpedoState; sink: RecSink; left: number[] }

export function bench(p: PtParams = P, tp: PtTorpedoParams = TP, lp: LandingParams = LP, allOut = true): Bench {
  const q = createPtSection(p, PT_SHELL_POOL_SIZE);
  const st = createPtTorpedoState(p.count, tp.n);
  for (let i = 0; allOut && i < q.boats.length; i++) {
    q.boats[i]!.phase = PT_OUT;
    st.prevPhase[i] = PT_OUT;
  }
  return { ld: createLanding(lp), q, st, sink: new RecSink(), left: [] };
}

/** i 隻目を輸送船から brgDeg（輸送船から見た方位）の distM に置き、艇首を輸送船への方位 + offDeg に、段階を phase（前のステップも prev）に */
export function place(b: Bench, i: number, distM: number, brgDeg: number, offDeg: number, phase: number, prev: number = phase): void {
  const r = (brgDeg * Math.PI) / 180;
  const pt = b.q.boats[i]!;
  pt.x = b.ld.x + distM * Math.sin(r);
  pt.y = b.ld.y - distM * Math.cos(r);
  pt.headingDeg = (((brgDeg + 180 + offDeg) % 360) + 360) % 360;
  pt.phase = phase;
  b.st.prevPhase[i] = prev;
}

/** 1 ステップの雷撃（凍結の隊は回さない） */
export function stepTorp(b: Bench, rng: SeededRng, o: { tp?: PtTorpedoParams; dawn?: boolean; nowS?: number; feelDt?: number } = {}): void {
  stepPtTorpedoes(b.st, o.tp ?? TP, b.q, b.ld, rng, o.dawn ?? false, o.nowS ?? 0, o.feelDt ?? FEEL_DT, b.sink, (i) => b.left.push(i));
}

export function events(over: Partial<PtEvents> = {}): PtEvents {
  const none = (): void => {};
  return { onContact: none, onCommit: none, onFire: none, onImpact: none, onPassEnd: none, onLeave: none, onOut: none, ...over };
}

/** 凍結の隊の材料: 止まった自艇 (x, y)。targetValid false なら見つからない（隠れる） */
export function checkAt(x: number, y: number, o: Partial<PtCheck> = {}): PtCheck {
  return { boat: { x, y, headingDeg: 90, speedMps: 0 }, boatHalfLengthM: 8, boatHalfBeamM: 2, detectOpenM: 0, smokeFactor: 1, smoke: null, smokeParams: null, targetValid: false, visRange2: 0, dawn: false, timeS: 0, ...o };
}

/** 凍結の隊 → 雷撃を 1 ステップ（世界の順: stepPtSection の後に stepPtTorpedoes。spec §4.1）。c.timeS・c.dawn は呼ぶ側 */
export function stepNight(b: Bench, p: PtParams, tp: PtTorpedoParams, c: PtCheck, ptRng: SeededRng, rng: SeededRng, ev: PtEvents = events()): void {
  stepPtSection(b.q, p, c, ptRng, FEEL_DT, FEEL_DT * TS, ev);
  stepPtTorpedoes(b.st, tp, b.q, b.ld, rng, c.dawn, c.timeS, FEEL_DT, b.sink, (i) => b.left.push(i));
}
