// 米PT の雷撃（v0.6.9。jp_04「多号作戦・オルモック湾へ」。docs/02 §6.11、spec-v069 §4.2・R2・R8・R12）: 凍結の core/pt-boats の stepPtSection の後に 1 回、停泊する味方の輸送船へ。
// 気づかれていない斉射: 哨戒（PT_PATROL）の PT が輸送船から launch_range_m の内で艇首が launch_heading_tol_deg 以内なら 1 回だけ salvo_count 本を撃って去る。
// 慌てた斉射（R2）: 隊が自艇（か 25mm の閃光）を捉えたステップに、哨戒から警戒になった PT はみな（見つけた PT だけでなく）、輸送船から hurried_max_m の内で艇首が向いていれば
// 狙いの誤差 × hurried_error_factor で撃って去る（hurried_max_m 0 で無し）。見失って哨戒に戻った PT は reacquire_s の間は撃たない（D8）。輸送船が沈めば哨戒の PT は去る（F11）。
// 戦いながらの斉射（R12）: 自艇と戦っている PT（警戒・突撃・追撃・離脱。哨戒・航過・去る・海域の外・沈んだ・撃退は除く）が、揚陸中（決着の前）の輸送船から launch_range_m の内で
// 艇首が向いていれば狙いの誤差 × engaged_error_factor で撃ち、段階を変えない（自艇と戦い続ける。PT の欄は何も書かない。engaged_error_factor 0 で無し。見失いの reacquire_s は掛けない）。
// 外から PT_LEAVE を書くのは（気づかれていない・慌てた斉射と輸送船の沈没だけ）pt-damage の hitPt と同じ書き方（phase と timerS、onLeave）。哨戒・警戒の PT は q.owner でなく（owner は突撃からの commitPass だけ）、追撃・連射の状態も無い。
// q.held は哨戒・去るでは読まれない（HUD_THREAT が見るのは警戒〜突撃だけ。pt-boats:75 の見失いは held を消さないが害は無い。spec R8/F9）。去った PT は凍結の去るの枝が北へ出す。
// 乱数は seed+26 の系列（PT_TORPEDO_SEED_OFFSET。jp_04 だけ。systems/world-landing と core/landing-sim が最後に作る）: 斉射のときだけ 狙い 1 回 → 1 本ごとに 不発 → 蛇行 → [偏差]
// （systems/torpedo-launcher と同じ順。3 種類とも同じ）。斉射の無いステップは引かない。Phaser 非依存・毎ステップ確保しない（状態は createPtTorpedoState で 1 回）。距離は二乗、atan2 は撃てる距離の内の PT だけ。
import { LD_UNLOADING } from './landing';
import { PT_ALERT, PT_BREAK, PT_CHASE, PT_FATE_CREW, PT_FATE_HULL, PT_FATE_NONE, PT_FATE_SUNK, PT_LEAVE, PT_PATROL, PT_RUN_IN, type PtSection } from './pt-boats';
import type { PtTorpedoParams } from './pt-torpedo-data';
import type { SeededRng } from './rng';
import { fillSalvoHeadings } from './salvo';
import { bearingDeg } from './ship-ai';
import { wrapDeg180 } from './units';

/** 米PT の雷撃の乱数の系列（seed+26。v0.6.9。jp_04 だけ。0〜25 は使用済み（+21 は大発の 13mm に予約）、+27・+28 は味方の駆逐艦の見張り・砲に予約（v0.6.10）） */
export const PT_TORPEDO_SEED_OFFSET = 26;

/** 撃った斉射の種類（PtTorpedoState.kind・lastKind・PtTorpedoSink.onSalvo）: 撃っていない・気づかれていない・慌てた・戦いながら（R12） */
export const PT_SALVO_NONE = 0;
export const PT_SALVO_CALM = 1;
export const PT_SALVO_HURRIED = 2;
export const PT_SALVO_ENGAGED = 3;

/** PT ごとの雷撃の結末（ptTorpedoOutcome。Result の雷撃の行）。OUT_GOAL_GONE は輸送船が沈んで去った（R8/F11。「引きつけて去らせた」と分ける）、OUT_ENGAGED は戦いながら撃った（R12。「戦いながら」） */
export const OUT_NONE = 0;
export const OUT_CALM = 1;
export const OUT_HURRIED = 2;
export const OUT_RETIRED = 3;
export const OUT_SUNK = 4;
export const OUT_DAWN = 5;
export const OUT_LEFT = 6;
export const OUT_GOAL_GONE = 7;
export const OUT_ENGAGED = 8;

export interface PtTorpedoState {
  /** 1 = 斉射が残っている（1 隻 1 回） */
  left: Uint8Array;
  /** 前のステップの終わりの段階（初めは哨戒）。見失い・接触の瞬間・夜明けをここから見る */
  prevPhase: Uint8Array;
  /** 見失って哨戒に戻ってから撃たない残りの体感秒 */
  holdS: Float64Array;
  /** 撃った斉射（PT_SALVO_*）・そのときの輸送船までの m・時計（出撃からの体感秒） */
  kind: Uint8Array; launchM: Float64Array; launchS: Float64Array;
  /** 斉射の魚雷の決着（core/landing-torpedoes の LandingTorpedoLink が書く）: 命中・不発の命中・まだ決着していない本数 */
  salvoHits: Uint8Array; salvoDuds: Uint8Array; salvoLeft: Uint8Array;
  /** 夜明けのラッチで去った・輸送船が沈んで去った（F11） */
  leftAtDawn: Uint8Array; goalGone: Uint8Array;
  /** 斉射の針路（使い回し。salvo_count 個） */
  headings: number[];
  /** 数え: 斉射・撃った本数・慌てて撃った本数・戦いながら撃った本数、斉射の通し番号・最後に撃った PT（−1 は無し）とその種類 */
  salvos: number; fired: number; hurriedFired: number; engagedFired: number; seq: number; lastBoat: number; lastKind: number;
}

/** 魚雷を入れる先（世界は敵の TorpedoPool、模擬は core/landing-torpedoes。どちらも LandingTorpedoLink が満たす）。引数は数と真偽だけ */
export interface PtTorpedoSink {
  /** i 隻目の PT が 1 本撃つ（位置・針路・不発・蛇行・偏差・輸送船までの m） */
  fire(i: number, x: number, y: number, headingDeg: number, dud: boolean, erratic: boolean, biasDeg: number, rangeM: number): void;
  /** i 隻目の斉射の n 本を撃ち終えた（kind は PT_SALVO_*。HUD の出来事「米PT 雷撃！」「米PT 慌てて発射！」「米PT 戦いながら発射！」） */
  onSalvo(i: number, kind: number, rangeM: number, n: number): void;
}

/** 輸送船（停泊して動かない）: 中心と、浮いているか（沈み始めたら false）と揚陸の段階（core/landing の LD_*。戦いながらの斉射は揚陸中だけ）。core/landing の LandingState が満たす */
export interface PtTorpedoShip {
  readonly x: number;
  readonly y: number;
  readonly afloat: boolean;
  readonly phase: number;
}

/** 出撃の組み立てで 1 回（count 隻・salvoCount 本） */
export function createPtTorpedoState(count: number, salvoCount: number): PtTorpedoState {
  const headings: number[] = [];
  for (let k = 0; k < salvoCount; k++) headings.push(0);
  return {
    left: new Uint8Array(count).fill(1), prevPhase: new Uint8Array(count).fill(PT_PATROL), holdS: new Float64Array(count),
    kind: new Uint8Array(count), launchM: new Float64Array(count).fill(NaN), launchS: new Float64Array(count).fill(NaN),
    salvoHits: new Uint8Array(count), salvoDuds: new Uint8Array(count), salvoLeft: new Uint8Array(count),
    leftAtDawn: new Uint8Array(count), goalGone: new Uint8Array(count), headings,
    salvos: 0, fired: 0, hurriedFired: 0, engagedFired: 0, seq: 0, lastBoat: -1, lastKind: PT_SALVO_NONE,
  };
}

/**
 * 固定ステップに 1 回、凍結の stepPtSection の後（spec §4.1）。dawn は夜明けのラッチの後（凍結の隊と同じ値）、nowS は出撃からの体感秒、feelDt は体感秒。
 * onLeave は外から去らせた PT（斉射・輸送船が沈んだ）の知らせ（世界は隊の onLeave と同じ扱い。jp_04 は何もしない）
 */
export function stepPtTorpedoes(st: PtTorpedoState, tp: PtTorpedoParams, q: PtSection, ship: PtTorpedoShip, rng: SeededRng, dawn: boolean, nowS: number, feelDt: number, sink: PtTorpedoSink, onLeave: (i: number) => void): void {
  for (let i = 0; i < q.boats.length; i++) {
    const b = q.boats[i]!;
    const ph = b.phase;
    const prev = st.prevPhase[i]!;
    if (prev !== PT_PATROL && ph === PT_PATROL) st.holdS[i] = tp.reacquireS + feelDt; // 見失って哨戒へ戻った（+feelDt はこのステップの減りを打ち消す）
    st.holdS[i] = Math.max(0, st.holdS[i]! - feelDt);
    if (dawn && prev < PT_LEAVE && ph >= PT_LEAVE) st.leftAtDawn[i] = 1; // 凍結の夜明けのラッチが去らせた
    if (st.left[i] === 1 && !dawn && ship.afloat) {
      const dx = ship.x - b.x;
      const dy = ship.y - b.y;
      const d2 = dx * dx + dy * dy;
      const free = st.holdS[i]! <= 0; // 見失いの後の待ち（D8）は気づかれていない・慌てた斉射だけ
      // 慌てた斉射（R2）: このステップに隊が捉えた（哨戒 → 警戒は接触の瞬間だけ起きる）PT はみな。気づかれていない斉射: 哨戒のまま launch_range_m の内。
      // 戦いながらの斉射（R12）: 自艇と戦っている PT が揚陸中の輸送船の launch_range_m の内（接触の瞬間に慌てた斉射の条件も満たせば慌てた斉射）
      const hurried = free && prev === PT_PATROL && ph === PT_ALERT && tp.hurried2 > 0 && d2 <= tp.hurried2;
      const calm = free && ph === PT_PATROL && d2 <= tp.launch2;
      const engaged = tp.engagedFactor > 0 && ptEngaged(ph) && b.fate === PT_FATE_NONE && ship.phase === LD_UNLOADING && d2 <= tp.launch2;
      if (hurried || calm || engaged) {
        const brg = bearingDeg(b.x, b.y, ship.x, ship.y);
        if (Math.abs(wrapDeg180(b.headingDeg - brg)) <= tp.tolDeg) salvo(st, tp, q, i, hurried ? PT_SALVO_HURRIED : calm ? PT_SALVO_CALM : PT_SALVO_ENGAGED, brg, d2, rng, nowS, sink, onLeave);
      }
    }
    if (!ship.afloat && b.phase === PT_PATROL && st.left[i] === 1) {
      // 狙う船が無い（沈み始めた・沈んだ）: 哨戒の PT は撃たずに去る（警戒・突撃などの PT は自艇と戦い続け、見失って哨戒に戻ればここで去る）
      b.phase = PT_LEAVE;
      b.timerS = 0;
      st.goalGone[i] = 1;
      onLeave(i);
    }
    st.prevPhase[i] = b.phase;
  }
}

/** 自艇と戦っている段階（R12 の戦いながらの斉射。警戒・突撃・追撃・離脱。航過は固めた掃射の最中なので撃たない。哨戒は気づかれていない・慌てた斉射の規則） */
function ptEngaged(phase: number): boolean {
  return phase === PT_ALERT || phase === PT_RUN_IN || phase === PT_CHASE || phase === PT_BREAK;
}

/** i 隻目の斉射（kind は PT_SALVO_*。brg は PT → 輸送船の中心の方位。停泊して動かないので見越しは要らない）。平方根は 1 回（発射の距離） */
function salvo(st: PtTorpedoState, tp: PtTorpedoParams, q: PtSection, i: number, kind: number, brg: number, d2: number, rng: SeededRng, nowS: number, sink: PtTorpedoSink, onLeave: (i: number) => void): void {
  const b = q.boats[i]!;
  const a = tp.aimDeg * (kind === PT_SALVO_HURRIED ? tp.hurriedFactor : kind === PT_SALVO_ENGAGED ? tp.engagedFactor : 1);
  const err = rng.nextRange(-a, a);
  const n = fillSalvoHeadings(brg + err, tp.n, tp.spacingDeg * (tp.n - 1), st.headings);
  const rangeM = Math.sqrt(d2);
  st.salvoLeft[i] = n; // 決着していない本数（撃つ前に書く: 入れ先が受け取れなかった 1 本はその場で減らせる）
  for (let k = 0; k < n; k++) {
    const dud = rng.chance(tp.reliability.dud);
    const erratic = rng.chance(tp.reliability.erratic);
    const bias = erratic ? rng.nextRange(-tp.jitterDeg, tp.jitterDeg) : 0;
    sink.fire(i, b.x, b.y, st.headings[k]!, dud, erratic, bias, rangeM);
  }
  st.left[i] = 0;
  st.kind[i] = kind;
  st.launchM[i] = rangeM;
  st.launchS[i] = nowS;
  st.salvos++;
  st.fired += n;
  if (kind === PT_SALVO_HURRIED) st.hurriedFired += n;
  if (kind === PT_SALVO_ENGAGED) st.engagedFired += n;
  st.seq++;
  st.lastBoat = i;
  st.lastKind = kind;
  sink.onSalvo(i, kind, rangeM, n);
  if (kind === PT_SALVO_ENGAGED) return; // R12: 段階を変えず自艇と戦い続ける（PT の欄は書かない。owner・held・航過・追撃の状態はそのまま）
  // retreat_after_salvo（v0.6.9 は true だけ。core/pt-torpedo-data の V11）: 気づかれていない・慌てた斉射は撃ったら去る
  b.phase = PT_LEAVE;
  b.timerS = 0;
  onLeave(i);
}

/** i 隻目の PT の雷撃の結末（Result の雷撃の行。出撃の終わりに 1 回） */
export function ptTorpedoOutcome(st: PtTorpedoState, q: PtSection, i: number): number {
  const b = q.boats[i]!;
  if (st.kind[i] === PT_SALVO_CALM) return OUT_CALM;
  if (st.kind[i] === PT_SALVO_HURRIED) return OUT_HURRIED;
  if (st.kind[i] === PT_SALVO_ENGAGED) return OUT_ENGAGED; // 撃った後に 25mm で撃退・撃沈されても斉射を先に（b.fate は Result がそのまま読める）
  if (b.fate === PT_FATE_SUNK) return OUT_SUNK;
  if (b.fate === PT_FATE_CREW || b.fate === PT_FATE_HULL) return OUT_RETIRED;
  if (st.goalGone[i] === 1) return OUT_GOAL_GONE;
  if (st.leftAtDawn[i] === 1) return OUT_DAWN;
  if (b.phase >= PT_LEAVE) return OUT_LEFT;
  return OUT_NONE;
}
