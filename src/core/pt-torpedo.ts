// 米PT の雷撃（v0.6.9。jp_04「多号作戦・オルモック湾へ」。docs/02 §6.11、spec-v069 §4.2・R2・R8・R12）: 凍結の core/pt-boats の stepPtSection の後に 1 回、停泊する味方の輸送船へ。
// 気づかれていない斉射: 哨戒（PT_PATROL）の PT が輸送船から launch_range_m の内で艇首が launch_heading_tol_deg 以内なら 1 回だけ salvo_count 本を撃つ。
// 慌てた斉射（R2）: 隊が自艇（か 25mm の閃光）を捉えたステップに、哨戒から警戒になった PT はみな（見つけた PT だけでなく）、輸送船から hurried_max_m の内で艇首が向いていれば
// 狙いの誤差 × hurried_error_factor で撃つ（hurried_max_m 0 で無し）。見失って哨戒に戻った PT は reacquire_s の間は撃たない（D8）。輸送船が沈めば哨戒の PT は去る（F11）。
// 戦いながらの斉射（R12）: 自艇と戦っている PT（警戒・突撃・追撃・離脱。哨戒・航過・去る・海域の外・沈んだ・撃退は除く）が、揚陸中（決着の前）の輸送船から launch_range_m の内で
// 艇首が向いていれば狙いの誤差 × engaged_error_factor で撃つ（engaged_error_factor 0 で無し。見失いの reacquire_s は掛けない）。
// 撃っても去らない（3 種類とも。v0.6.10 実機 1 回目。ユーザー「当初の設計どおり、PTが発射後も去らずに銃撃してくる設計に戻してください」→「A: 卯月は残し、PT を撃った後も去らない形に戻す」。
// v0.6.9 実機 1 回目〜v0.6.10 S8 は撃ったら去った＝retreat_after_salvo true）。撃った PT は段階を変えず、凍結の AI のまま（哨戒・接触・追撃・自艇への掃射）。斉射は 1 隻 1 回のまま（left 0）。
// 外から PT_LEAVE を書くのは輸送船の沈没（哨戒で斉射が残る PT）だけで、pt-damage の hitPt が航過の外の PT に書くのと同じ（phase と timerS、onLeave）。去った PT は凍結の去るの枝が北へ出す。
// 外から去らせても隊の欄（owner・held・相方・追撃の目標・連射）が宙に浮かないことは stepPtTorpedoes の沈没の枝の注（凍結のコードで確かめたこと）。
// 乱数は seed+26 の系列（PT_TORPEDO_SEED_OFFSET。jp_04 だけ。systems/world-landing と core/landing-sim が最後に作る）: 斉射のときだけ 狙い 1 回 → 1 本ごとに 不発 → 蛇行 → [偏差]
// （systems/torpedo-launcher と同じ順。3 種類とも同じ）。斉射の無いステップは引かない。Phaser 非依存・毎ステップ確保しない（状態は createPtTorpedoState で 1 回）。距離は二乗、atan2 は撃てる距離の内の PT だけ。
// v0.6.10（spec-v0610 R-U5・LD5・レビュー M1）: 味方の駆逐艦 卯月（core/ally-destroyer）に照らされた PT の反応 ptLitReact（射点なら慌てた斉射・ほかは何もしない・航過は待つ。
// v0.6.10 実機 1 回目から、照らされた PT も去らない＝撃たずに去る（LIT_AWAY・LE_LIT_AWAY）は無くした。卯月の光は砲の的のまま）。
// 慌てた斉射と分け合うのは距離と艇首の検査（hurriedReach・bowOn）だけで、照らされた斉射の条件（哨戒・斉射が残る・揚陸中・夜明けの前・見失いの待ちの外）は ptLitReact だけが見る。
// stepPtTorpedoes は litSalvo を読まない（卯月の無い夜の雷撃は照らされた斉射の印に関わらない）。
import { LD_UNLOADING } from './landing';
import { PT_ALERT, PT_BREAK, PT_CHASE, PT_FATE_CREW, PT_FATE_HULL, PT_FATE_NONE, PT_FATE_SUNK, PT_LEAVE, PT_PASS, PT_PATROL, PT_RUN_IN, type PtSection } from './pt-boats';
import type { PtTorpedoParams } from './pt-torpedo-data';
import type { SeededRng } from './rng';
import { fillSalvoHeadings } from './salvo';
import { bearingDeg } from './ship-ai';
import { wrapDeg180 } from './units';

/** 米PT の雷撃の乱数の系列（seed+26。v0.6.9。jp_04 だけ。0〜25 は使用済み（+21 は大発の 13mm に予約）、+27・+28 は味方の駆逐艦 卯月の見張り・砲（v0.6.10。core/ally-destroyer）） */
export const PT_TORPEDO_SEED_OFFSET = 26;

/** 撃った斉射の種類（PtTorpedoState.kind・lastKind・PtTorpedoSink.onSalvo）: 撃っていない・気づかれていない・慌てた・戦いながら（R12） */
export const PT_SALVO_NONE = 0;
export const PT_SALVO_CALM = 1;
export const PT_SALVO_HURRIED = 2;
export const PT_SALVO_ENGAGED = 3;

/** PT ごとの雷撃の結末（ptTorpedoOutcome。Result の雷撃の行）。OUT_GOAL_GONE は輸送船が沈んで去った（R8/F11。「引きつけて去らせた」と分ける）、OUT_ENGAGED は戦いながら撃った（R12。「戦いながら」）。
 * 斉射の後の砲の結末（撃退・撃沈）は ptAfterSalvoFate（撃っても去らない＝v0.6.10 実機 1 回目） */
export const OUT_NONE = 0;
export const OUT_CALM = 1;
export const OUT_HURRIED = 2;
export const OUT_RETIRED = 3;
export const OUT_SUNK = 4;
export const OUT_DAWN = 5;
export const OUT_LEFT = 6;
export const OUT_GOAL_GONE = 7;
export const OUT_ENGAGED = 8;
/** v0.6.10: 卯月に照らされて慌てて撃った（照らされた斉射。種類は慌てた斉射のまま・litSalvo）。10（照らされて撃たずに去った）は v0.6.10 実機 1 回目に無くした */
export const OUT_LIT_HURRIED = 9;

/** ptLitReact の戻り: 航過中か去ったので待つ（次のステップにまた）・照らされた斉射を撃った・何もしない（射点の外。v0.6.10 実機 1 回目までは撃たずに去った） */
export const LIT_WAIT = 0;
export const LIT_SALVO = 1;
export const LIT_NONE = 2;

export interface PtTorpedoState {
  /** 1 = 斉射が残っている（1 隻 1 回） */
  left: Uint8Array;
  /** 前のステップの終わりの段階（初めは哨戒）。見失い・接触の瞬間・夜明けをここから見る */
  prevPhase: Uint8Array;
  /** 見失って哨戒に戻ってから撃たない残りの体感秒 */
  holdS: Float64Array;
  /** 撃った斉射（PT_SALVO_*）・そのときの輸送船までの m・時計（出撃からの実秒＝世界の stepTimeS。命中スローで遅れない） */
  kind: Uint8Array; launchM: Float64Array; launchS: Float64Array;
  /** 斉射の魚雷の決着（core/landing-torpedoes の LandingTorpedoLink が書く）: 命中・不発の命中・まだ決着していない本数 */
  salvoHits: Uint8Array; salvoDuds: Uint8Array; salvoLeft: Uint8Array;
  /** 夜明けのラッチで去った・輸送船が沈んで去った（F11） */
  leftAtDawn: Uint8Array; goalGone: Uint8Array;
  /** v0.6.10: 卯月に照らされて撃った斉射（入れ先が LE_LIT_SALVO を選ぶ印。斉射の前に立つ。ptLitReact だけが書く） */
  litSalvo: Uint8Array;
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
    leftAtDawn: new Uint8Array(count), goalGone: new Uint8Array(count), litSalvo: new Uint8Array(count), headings,
    salvos: 0, fired: 0, hurriedFired: 0, engagedFired: 0, seq: 0, lastBoat: -1, lastKind: PT_SALVO_NONE,
  };
}

/**
 * 固定ステップに 1 回、凍結の stepPtSection の後（spec §4.1）。dawn は夜明けのラッチの後（凍結の隊と同じ値）、nowS は出撃からの実秒（世界の stepTimeS。命中スローで遅れない。R14 A8）、feelDt は体感秒。
 * onLeave は外から去らせた PT（輸送船が沈んだ）の知らせ（世界は隊の onLeave と同じ扱い。jp_04 は何もしない）
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
      const hurried = free && prev === PT_PATROL && ph === PT_ALERT && hurriedReach(tp, d2);
      const calm = free && ph === PT_PATROL && d2 <= tp.launch2;
      const engaged = tp.engagedFactor > 0 && ptEngaged(ph) && b.fate === PT_FATE_NONE && ship.phase === LD_UNLOADING && d2 <= tp.launch2;
      if (hurried || calm || engaged) {
        const brg = bearingDeg(b.x, b.y, ship.x, ship.y);
        if (bowOn(tp, b.headingDeg, brg)) salvo(st, tp, q, i, hurried ? PT_SALVO_HURRIED : calm ? PT_SALVO_CALM : PT_SALVO_ENGAGED, brg, d2, rng, nowS, sink);
      }
    }
    if (!ship.afloat && b.phase === PT_PATROL && st.left[i] === 1) {
      // 狙う船が無い（沈み始めた・沈んだ）: 哨戒の PT は撃たずに去る（警戒・突撃などの PT は自艇と戦い続け、見失って哨戒に戻ればここで去る。撃った PT（left 0）は去らない＝v0.6.10 実機 1 回目）。
      // 凍結のコード（pt-boats・pt-state・pt-chase・pt-damage）と pt-pass-end・pt-fire で確かめたこと: ここで去らせるのは哨戒の PT で、航過（PT_PASS）ではない。
      // ・q.owner: 立てるのは commitPass（pt-pass-end）と commitBurst（pt-chase）で、どちらも同時に航過にする。航過から出るのは owner も消す endPass・endBurst・dropOwner・
      //   夜明け（pt-boats の 3）だけ＝owner なら航過。哨戒の PT は owner でない（閉じる航過・赤い線（attackLineShown）は無い）。
      // ・burst: owner の航過だけが true。q.held: 読む窓は警戒〜突撃で、去るは突撃へ戻らない（hitPt の去る・pt-boats:75 の見失いも held を消さない。spec R8/F9）。
      // ・相方・追撃の目標: partnerReady は毎回 ptFighting で隊をなめ、追撃の目標は自艇の推定で PT の添字を持たない。25mm の標的は毎ステップ ptLive で選び直す。よって離す欄は無い。
      b.phase = PT_LEAVE;
      b.timerS = 0;
      st.goalGone[i] = 1;
      onLeave(i);
    }
    st.prevPhase[i] = b.phase;
  }
}

/** 慌てた斉射の距離（輸送船までの二乗 d2 が hurried_max_m の内。0 なら慌てた斉射なし）。接触の慌てた斉射と照らされた斉射（ptLitReact）が分け合う（LD5） */
function hurriedReach(tp: PtTorpedoParams, d2: number): boolean {
  return tp.hurried2 > 0 && d2 <= tp.hurried2;
}

/** 艇首が輸送船への方位 brg から launch_heading_tol_deg の内（3 種類の斉射と照らされた斉射が分け合う） */
function bowOn(tp: PtTorpedoParams, headingDeg: number, brg: number): boolean {
  return Math.abs(wrapDeg180(headingDeg - brg)) <= tp.tolDeg;
}

/**
 * 卯月に照らされて light_react_s 経った PT i の反応（v0.6.10。core/ally-destroyer だけが呼ぶ。spec-v0610 R-U5・LD5・レビュー M1）。戻りは LIT_*。航過（q.owner でもありうる）・去った PT は
 * LIT_WAIT（何も書かない）。哨戒で斉射が残り、輸送船が浮いて揚陸中・夜明けの前・見失いの待ちの外で、慌てた斉射の距離と艇首なら LIT_SALVO: litSalvo を立ててから
 * 慌てた斉射（seed+26 から 1 + 2n + 蛇行の本数）。撃った PT は去らない（段階はそのまま＝v0.6.10 実機 1 回目）。ほかの生きた段階（射点の外・待ち・夜明けの後・警戒〜離脱・揚陸の後・沈んだ後）は
 * LIT_NONE: 何もしない（引かない・書かない。v0.6.10 S2〜S8 は撃たずに去らせた）。卯月の光と砲はその PT を狙い続ける
 */
export function ptLitReact(st: PtTorpedoState, tp: PtTorpedoParams, q: PtSection, ship: PtTorpedoShip, i: number, rng: SeededRng, nowS: number, dawn: boolean, sink: PtTorpedoSink): number {
  const b = q.boats[i]!;
  if (b.phase === PT_PASS || b.phase >= PT_LEAVE) return LIT_WAIT;
  if (b.phase === PT_PATROL && st.left[i] === 1 && ship.afloat && ship.phase === LD_UNLOADING && !dawn && st.holdS[i]! <= 0) {
    const dx = ship.x - b.x;
    const dy = ship.y - b.y;
    const d2 = dx * dx + dy * dy;
    const brg = hurriedReach(tp, d2) ? bearingDeg(b.x, b.y, ship.x, ship.y) : NaN; // atan2 は慌てる距離の内だけ（NaN は艇首の検査を通らない）
    if (!Number.isNaN(brg) && bowOn(tp, b.headingDeg, brg)) {
      st.litSalvo[i] = 1; // 入れ先（LandingTorpedoLink.onSalvo）が見る印: 斉射の前に立てる
      salvo(st, tp, q, i, PT_SALVO_HURRIED, brg, d2, rng, nowS, sink);
      return LIT_SALVO;
    }
  }
  return LIT_NONE;
}

/** 自艇と戦っている段階（R12 の戦いながらの斉射。警戒・突撃・追撃・離脱。航過は固めた掃射の最中なので撃たない。哨戒は気づかれていない・慌てた斉射の規則） */
function ptEngaged(phase: number): boolean {
  return phase === PT_ALERT || phase === PT_RUN_IN || phase === PT_CHASE || phase === PT_BREAK;
}

/** i 隻目の斉射（kind は PT_SALVO_*。brg は PT → 輸送船の中心の方位。停泊して動かないので見越しは要らない）。平方根は 1 回（発射の距離） */
function salvo(st: PtTorpedoState, tp: PtTorpedoParams, q: PtSection, i: number, kind: number, brg: number, d2: number, rng: SeededRng, nowS: number, sink: PtTorpedoSink): void {
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
  // 撃っても去らない（3 種類とも。retreat_after_salvo は false だけ＝core/pt-torpedo-data の V11。v0.6.10 実機 1 回目）: 段階・timerS は凍結の AI のまま
}

/** i 隻目の PT の雷撃の結末（Result の雷撃の行。出撃の終わりに 1 回） */
export function ptTorpedoOutcome(st: PtTorpedoState, q: PtSection, i: number): number {
  const b = q.boats[i]!;
  if (st.kind[i] === PT_SALVO_CALM) return OUT_CALM;
  if (st.kind[i] === PT_SALVO_HURRIED) return st.litSalvo[i] === 1 ? OUT_LIT_HURRIED : OUT_HURRIED;
  if (st.kind[i] === PT_SALVO_ENGAGED) return OUT_ENGAGED; // 斉射を先に（撃った後の砲の結末は ui/pt-lines・ui/ally-result）
  if (b.fate === PT_FATE_SUNK) return OUT_SUNK;
  if (b.fate === PT_FATE_CREW || b.fate === PT_FATE_HULL) return OUT_RETIRED;
  if (st.goalGone[i] === 1) return OUT_GOAL_GONE;
  if (st.leftAtDawn[i] === 1) return OUT_DAWN;
  if (b.phase >= PT_LEAVE) return OUT_LEFT;
  return OUT_NONE;
}
