// 味方の艇が救助に来る（v0.8.5 IP3。us_07。実機 1 回目のユーザー「40人救助してまだまだ漂流してるのに見捨てて帰投するのが納得感ありません。40人救助達成したら帰投水域の方から
// 味方の艇が救助応援に駆けつける演出にする？」）: 渡した数が達成の数に届いた時（海に人が残り救助の時間の内なら）1 回だけ、count 隻が帰投の輪から出る。
// - 道: data の route（帰投の輪 → フィッチ → 掃海された水路の角 → 水路の端。検査 V-F が水路の帯の内を確かめる＝機雷原の上を描かない）を通り、水路の端から残りのある一番近い群へ真っ直ぐ。
//   機雷に触れない・砲台と S ボートに狙われない（どの段も読まない）。乱数なし（決まった動き）。向きは進む向きへすぐ（回る速さは無い）。
// - 拾う: 群の中心から艇ごとの決まったずれ（park_offset_m。拾える距離の内）で止まり、自艇と同じ 1 名 per_person_s（体感秒）。乗せられるのは艇ごとに capacity。
//   群が空けば次の群（ほかの艇が狙っていない群を先に）・満ちるか海が空けば水路を戻ってフィッチの輪で 1 名 transfer_per_person_s で降ろし、海に残りがあればまた出る。
// - 数え: 拾った人は「味方の艇が拾った」（picked）。自艇の渡した・点には数えない。拾ったのは群の残り（core/rescue の left）から引く＝砲撃は海に残る人だけを奪う（今の規則のまま）。
// - 救助の時間の終わりの後も拾い続ける（core/rescue の rescueTimeUp は艇が出ていれば海を空けない。自艇はもう拾わない）。海が空けば戻って降ろし、フィッチのそばで止まる。任務が終われば何もしない。
// 時計: 拾う・降ろす・出る間隔は体感秒（feelDt）、動きは世界の秒（dt＝feelDt × time_scale。艇・艦と同じ m/s）。Phaser 非依存・毎ステップ確保しない（状態は固定長の型付き配列）。
import { nearestRescueGroup, rescueOnWater, type RescueRules, type RescueState } from './rescue';

/** 艇の段（絵は FRIENDLY_OUT・FRIENDLY_WAIT を描かない） */
export const FRIENDLY_OUT = 0, FRIENDLY_WAIT = 1, FRIENDLY_GO = 2, FRIENDLY_SEEK = 3, FRIENDLY_PICK = 4, FRIENDLY_BACK = 5, FRIENDLY_UNLOAD = 6, FRIENDLY_IDLE = 7;
/** 艇の数の上限（固定長の状態。V-F1） */
export const FRIENDLY_MAX = 4;
/** 時計の比べの許し（固定ステップの 1/60 秒の和の丸め。core/rescue と同じ） */
const FRIENDLY_TIME_EPS_S = 1e-6;
/** 群のそばで止まる所の向きの扇（群の北側に艇を並べる＝群の札は群の下・艇の札は艇の上で重ならない）。艇 i は北から (i − (n − 1) / 2) × この角（ラジアン） */
const FRIENDLY_PARK_FAN_RAD = Math.PI / 2;

/** core が読む値（config/rescue-friendly-data の FriendlySetup がそのまま満たす）。route は [x, y] の点（0 が出る所・fitchIdx が降ろす所・最後が水路の端） */
export interface FriendlyRules {
  readonly count: number;
  readonly speedMps: number;
  readonly capacity: number;
  readonly staggerS: number;
  readonly parkOffsetM: number;
  readonly route: readonly (readonly [number, number])[];
  readonly fitchIdx: number;
}

export interface FriendlyState {
  readonly n: number;
  /** 出た（1 回だけ）・出た通し番号（HUD の出来事） */
  dispatched: boolean;
  seq: number;
  /** 艇ごと: 位置・向き（度）・段・向かう道の点・乗せている・時計（体感秒。出る前の待ち・拾う・降ろす）・狙う群（−1 は無し）・止まる所のずれ */
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly hdg: Float64Array;
  readonly phase: Uint8Array;
  readonly wp: Int16Array;
  readonly aboard: Int16Array;
  readonly timer: Float64Array;
  readonly target: Int16Array;
  readonly ox: Float64Array;
  readonly oy: Float64Array;
  /** 拾った（Result の「味方の艇が拾った」）・フィッチへ降ろした・拾った 1 名ごとの通し番号 */
  picked: number;
  unloaded: number;
  pickSeq: number;
}

/** 組み立ての時に 1 回: みな海域に出ていない（FRIENDLY_OUT）。止まる所のずれは艇ごとに群の北側の扇の決まった向き（三角関数は組み立ての 1 回だけ） */
export function createFriendlyBoats(r: FriendlyRules): FriendlyState {
  const n = r.count;
  const st: FriendlyState = {
    n, dispatched: false, seq: 0,
    x: new Float64Array(n), y: new Float64Array(n), hdg: new Float64Array(n), phase: new Uint8Array(n), wp: new Int16Array(n), aboard: new Int16Array(n), timer: new Float64Array(n), target: new Int16Array(n).fill(-1),
    ox: new Float64Array(n), oy: new Float64Array(n), picked: 0, unloaded: 0, pickSeq: 0,
  };
  const [x0, y0] = r.route[0]!;
  const [x1, y1] = r.route[1]!;
  const h = (Math.atan2(x1 - x0, -(y1 - y0)) * 180) / Math.PI;
  for (let i = 0; i < n; i++) {
    const a = (i - (n - 1) / 2) * FRIENDLY_PARK_FAN_RAD; // 北（画面の上＝−y）から時計回り
    st.ox[i] = r.parkOffsetM * Math.sin(a);
    st.oy[i] = -r.parkOffsetM * Math.cos(a);
    st.x[i] = x0;
    st.y[i] = y0;
    st.hdg[i] = h;
  }
  return st;
}

/** 渡した数が達成に届いた時（呼ぶ側が 1 回）: 海に残りがあり救助の時間の内なら出す（艇 i は i × stagger_s の後に出る所に現れる）。出したら true */
export function dispatchFriendlyBoats(st: FriendlyState, r: FriendlyRules, rescue: RescueState): boolean {
  if (st.dispatched || rescue.timeUp || rescue.ended || rescueOnWater(rescue) <= 0) return false;
  st.dispatched = true;
  st.seq++;
  for (let i = 0; i < st.n; i++) {
    st.phase[i] = FRIENDLY_WAIT;
    st.timer[i] = i * r.staggerS;
    st.wp[i] = 1;
  }
  return true;
}

/** 艇が今見えている（出る所に現れた後） */
export const friendlyVisible = (st: FriendlyState, i: number): boolean => st.phase[i]! >= FRIENDLY_GO;

/** (tx, ty) へ dist m だけ真っ直ぐ寄せる（向きは進む向き）。着いたら true（その点に置く） */
function moveToward(st: FriendlyState, i: number, tx: number, ty: number, dist: number): boolean {
  const dx = tx - st.x[i]!;
  const dy = ty - st.y[i]!;
  const d2 = dx * dx + dy * dy;
  if (d2 <= dist * dist) {
    st.x[i] = tx;
    st.y[i] = ty;
    return true;
  }
  const d = Math.sqrt(d2);
  st.x[i] = st.x[i]! + (dx / d) * dist;
  st.y[i] = st.y[i]! + (dy / d) * dist;
  st.hdg[i] = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return false;
}

/** 狙う群: 残りのある群のうち、ほかの艇（探している・拾っている）が狙っていない一番近い群。みな狙われていれば一番近い群。無ければ −1 */
function pickTarget(st: FriendlyState, i: number, rescue: RescueState): number {
  let best = -1;
  let bestD2 = Infinity;
  for (let g = 0; g < rescue.n; g++) {
    if (rescue.left[g]! <= 0) continue;
    let taken = false;
    for (let j = 0; j < st.n; j++) if (j !== i && st.target[j] === g && (st.phase[j] === FRIENDLY_SEEK || st.phase[j] === FRIENDLY_PICK)) taken = true;
    if (taken) continue;
    const dx = rescue.gx[g]! - st.x[i]!;
    const dy = rescue.gy[g]! - st.y[i]!;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = g;
    }
  }
  return best >= 0 ? best : nearestRescueGroup(rescue, st.x[i]!, st.y[i]!, Infinity);
}

/** 水路を戻る（fromSea: 群のそばにいる＝水路の端から。false は道の上で wp へ向かっている＝一つ前の点から。フィッチの点より前へは戻らない） */
function goBack(st: FriendlyState, i: number, r: FriendlyRules, fromSea: boolean): void {
  st.phase[i] = FRIENDLY_BACK;
  st.target[i] = -1;
  st.timer[i] = 0;
  st.wp[i] = fromSea ? r.route.length - 1 : Math.max(r.fitchIdx, st.wp[i]! - 1);
}

/** 群を探す（無ければ戻る） */
function seek(st: FriendlyState, i: number, r: FriendlyRules, rescue: RescueState): void {
  const g = pickTarget(st, i, rescue);
  if (g < 0) return goBack(st, i, r, true);
  st.phase[i] = FRIENDLY_SEEK;
  st.target[i] = g;
  st.timer[i] = 0;
}

/**
 * 固定ステップに 1 回（自艇の拾う・移すの後）。dt は世界の秒（動き）、feelDt は体感秒（拾う・降ろす・出る間隔）。任務の終わりの後・出る前は何もしない。
 * rr は救助の値（per_person_s・transfer_per_person_s）
 */
export function stepFriendlyBoats(st: FriendlyState, r: FriendlyRules, rr: Pick<RescueRules, 'perPersonS' | 'transferPerPersonS'>, rescue: RescueState, dt: number, feelDt: number): void {
  if (!st.dispatched || rescue.ended) return;
  const dist = r.speedMps * dt;
  const last = r.route.length - 1;
  const empty = rescueOnWater(rescue) <= 0;
  for (let i = 0; i < st.n; i++) {
    const ph = st.phase[i]!;
    if (ph === FRIENDLY_WAIT) {
      st.timer[i] = st.timer[i]! - feelDt;
      if (st.timer[i]! <= FRIENDLY_TIME_EPS_S) {
        st.phase[i] = FRIENDLY_GO;
        st.timer[i] = 0;
      }
      continue;
    }
    if (ph === FRIENDLY_GO) {
      if (empty) {
        goBack(st, i, r, false);
        continue;
      }
      const p = r.route[st.wp[i]!]!;
      if (moveToward(st, i, p[0], p[1], dist)) {
        if (st.wp[i]! >= last) seek(st, i, r, rescue);
        else st.wp[i] = st.wp[i]! + 1;
      }
      continue;
    }
    if (ph === FRIENDLY_SEEK || ph === FRIENDLY_PICK) {
      let g = st.target[i]!;
      if (g < 0 || rescue.left[g]! <= 0) {
        if (st.aboard[i]! > 0 && empty) {
          goBack(st, i, r, true);
          continue;
        }
        seek(st, i, r, rescue);
        if (st.phase[i] !== FRIENDLY_SEEK) continue;
        g = st.target[i]!;
      }
      if (st.phase[i] === FRIENDLY_SEEK) {
        if (!moveToward(st, i, rescue.gx[g]! + st.ox[i]!, rescue.gy[g]! + st.oy[i]!, dist)) continue;
        st.phase[i] = FRIENDLY_PICK;
        st.timer[i] = 0;
      }
      st.timer[i] = st.timer[i]! + feelDt;
      while (st.timer[i]! >= rr.perPersonS - FRIENDLY_TIME_EPS_S && st.aboard[i]! < r.capacity && rescue.left[g]! > 0) {
        st.timer[i] = st.timer[i]! - rr.perPersonS;
        rescue.left[g] = rescue.left[g]! - 1;
        st.aboard[i] = st.aboard[i]! + 1;
        st.picked++;
        st.pickSeq++;
      }
      if (st.aboard[i]! >= r.capacity || (rescue.left[g]! <= 0 && rescueOnWater(rescue) <= 0)) goBack(st, i, r, true);
      continue;
    }
    if (ph === FRIENDLY_BACK) {
      const w = st.wp[i]!;
      const atFitch = w <= r.fitchIdx;
      const p = r.route[w]!;
      const tx = atFitch ? p[0] + st.ox[i]! : p[0];
      const ty = atFitch ? p[1] + st.oy[i]! : p[1];
      if (!moveToward(st, i, tx, ty, dist)) continue;
      if (!atFitch) {
        st.wp[i] = w - 1;
        continue;
      }
      st.phase[i] = st.aboard[i]! > 0 ? FRIENDLY_UNLOAD : empty ? FRIENDLY_IDLE : FRIENDLY_GO;
      st.timer[i] = 0;
      if (st.phase[i] === FRIENDLY_GO) st.wp[i] = r.fitchIdx + 1;
      continue;
    }
    if (ph === FRIENDLY_UNLOAD) {
      st.timer[i] = st.timer[i]! + feelDt;
      while (st.timer[i]! >= rr.transferPerPersonS - FRIENDLY_TIME_EPS_S && st.aboard[i]! > 0) {
        st.timer[i] = st.timer[i]! - rr.transferPerPersonS;
        st.aboard[i] = st.aboard[i]! - 1;
        st.unloaded++;
      }
      if (st.aboard[i]! > 0) continue;
      st.timer[i] = 0;
      if (empty) st.phase[i] = FRIENDLY_IDLE;
      else {
        st.phase[i] = FRIENDLY_GO;
        st.wp[i] = r.fitchIdx + 1;
      }
    }
  }
}

/** 今乗せている人数の和（拾ったがまだ降ろしていない） */
export function friendlyAboard(st: FriendlyState): number {
  let s = 0;
  for (let i = 0; i < st.n; i++) s += st.aboard[i]!;
  return s;
}
