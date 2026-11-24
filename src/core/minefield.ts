// 機雷原（v0.8.5 S1。us_07「D-Day・生存者救助」。spec-v0850 §4.2）の純粋な規則。Phaser 非依存・毎ステップ確保しない（状態は createMinefield で 1 回。固定長の型付き配列）。
// - 置き方（layMines。組み立ての時に 1 回、seed+47 の系列で群の位置のずれの後＝core/rescue-field）: 枠は区画ごとのノーマルの数を区画の順に並べ、その後にハードで足す数を区画の順に並べた
//   maxCount 個（ハードの数）。1 枠ごとに x → y の 2 回（区画の矩形の内の一様）＝引く回数は難易度に依らず 2 × maxCount で固定。この難易度の数（count）までの枠を使う＝ハードはノーマルの枠を含む。
//   置かない所（掃海済みの水路の帯の内・浅瀬・帰投の輪・出発・フィッチの輪・コリー・群の、どれも clear_m の余白込み）に引き当てた枠は捨てる（引く回数は変えない）。
// - 見える: 昼なので、浮いている自艇の中心から sight_m の内に入った機雷は「見えた」に変わり、以後見えたまま（絵が出る）。
// - 触雷: 浮いている自艇の船体（core/shells の pointNearBoat。半幅 ＋ contact_m）の内なら爆発（確率なし）。1 ステップに 1 個。爆発は 1 個 1 回。被害は mine の値をそのまま
//   今の被弾の作法（core/gunnery の HitSpec）で。終わりの理由は MINE_END_REASON（'mine'）。S ボート・砲弾・魚雷は触れない（呼ばない）。
// - 走査は機雷の数の線形（≤ 48。二乗距離）。V-X2（置ける面積がある・ノーマルの数の 80% 以上が置ける見込み）の面積は minefieldFreeShare（決まった格子。乱数なし）。
import type { HitSpec } from './gunnery';
import type { MissionEndReason } from './mission-flow';
import type { SeededRng } from './rng';
import { pointNearBoat } from './shells';
import type { BoatState } from './boat-motion';

/** 機雷の状態: 置かれていない（捨てた枠・この難易度の数の外）・隠れ・見えた・爆発した */
export const MINE_NONE = 0;
export const MINE_HIDDEN = 1;
export const MINE_SEEN = 2;
export const MINE_BLOWN = 3;
/** 触雷で沈んだ終わりの理由（core/mission-flow の MissionEndReason） */
export const MINE_END_REASON: MissionEndReason = 'mine';

/** core が読む機雷原の値（config/minefield-mission-data の MinefieldSetup がそのまま満たす＝構造の型） */
export interface MinefieldRules {
  readonly fields: readonly { readonly x: number; readonly y: number; readonly w: number; readonly h: number; readonly normal: number; readonly hardExtra: number }[];
  readonly count: number;
  readonly maxCount: number;
  readonly lanes: readonly { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number; readonly widthM: number }[];
  readonly clearM: number;
  readonly mine: { readonly damage: number; readonly fireChance: number; readonly engineDamageChance: number; readonly sight2: number; readonly contactM: number };
}

/** 置かない円（中心と半径 m。clear_m は layMines が足す）と矩形（浅瀬。clear_m の余白込みで避ける） */
export interface MineKeepOut {
  readonly circles: readonly { readonly x: number; readonly y: number; readonly r: number }[];
  readonly rects: readonly { readonly x: number; readonly y: number; readonly w: number; readonly h: number }[];
}

export interface MinefieldState {
  /** 枠の数（maxCount）・位置・状態（MINE_*） */
  max: number;
  x: Float64Array;
  y: Float64Array;
  state: Uint8Array;
  /** 置いた数（この難易度の数のうち捨てなかった枠）・見えた数・爆発した数 */
  placed: number;
  seen: number;
  blown: number;
  /** 出来事の印: 見えた 1 個ごとの通し番号と最後に見えた機雷・爆発の通し番号と最後に爆発した機雷（−1 は無し） */
  seenSeq: number;
  lastSeen: number;
  blowSeq: number;
  lastBlown: number;
}

export function createMinefield(r: MinefieldRules): MinefieldState {
  const m = r.maxCount;
  return { max: m, x: new Float64Array(m), y: new Float64Array(m), state: new Uint8Array(m), placed: 0, seen: 0, blown: 0, seenSeq: 0, lastSeen: -1, blowSeq: 0, lastBlown: -1 };
}

/** 枠 k の区画（ノーマルの枠を区画の順に、その後にハードで足す枠を区画の順に） */
export function mineSlotField(r: MinefieldRules, k: number): number {
  let i = k;
  for (let f = 0; f < r.fields.length; f++) {
    if (i < r.fields[f]!.normal) return f;
    i -= r.fields[f]!.normal;
  }
  for (let f = 0; f < r.fields.length; f++) {
    if (i < r.fields[f]!.hardExtra) return f;
    i -= r.fields[f]!.hardExtra;
  }
  return -1;
}

/** 点から線分までの 2 乗の距離 */
function segDist2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const l2 = vx * vx + vy * vy;
  let t = l2 > 0 ? ((px - ax) * vx + (py - ay) * vy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = ax + vx * t - px;
  const ey = ay + vy * t - py;
  return ex * ex + ey * ey;
}

/** (x, y) に機雷を置けるか（水路の帯・置かない円・矩形を clear_m の余白込みで避ける） */
export function minePlaceable(r: MinefieldRules, keep: MineKeepOut, x: number, y: number): boolean {
  const c = r.clearM;
  for (let i = 0; i < r.lanes.length; i++) {
    const l = r.lanes[i]!;
    const lim = l.widthM / 2 + c;
    if (segDist2(x, y, l.x0, l.y0, l.x1, l.y1) <= lim * lim) return false;
  }
  for (let i = 0; i < keep.circles.length; i++) {
    const k = keep.circles[i]!;
    const dx = x - k.x;
    const dy = y - k.y;
    const lim = k.r + c;
    if (dx * dx + dy * dy <= lim * lim) return false;
  }
  for (let i = 0; i < keep.rects.length; i++) {
    const q = keep.rects[i]!;
    if (x >= q.x - c && x <= q.x + q.w + c && y >= q.y - c && y <= q.y + q.h + c) return false;
  }
  return true;
}

/** 組み立ての時に 1 回: maxCount 枠ぶん 2 回ずつ引き、この難易度の数（count）の内で置ける枠を隠れの機雷にする（引く回数は 2 × maxCount で固定） */
export function layMines(st: MinefieldState, r: MinefieldRules, keep: MineKeepOut, rng: SeededRng): void {
  st.placed = 0;
  for (let k = 0; k < st.max; k++) {
    const f = r.fields[mineSlotField(r, k)]!;
    const x = f.x + rng.next() * f.w;
    const y = f.y + rng.next() * f.h;
    st.x[k] = x;
    st.y[k] = y;
    const use = k < r.count && minePlaceable(r, keep, x, y);
    st.state[k] = use ? MINE_HIDDEN : MINE_NONE;
    if (use) st.placed++;
  }
}

/**
 * 固定ステップに 1 回（spec §4.0 の順で最後）。boat は自艇（中心・艇首）、afloat は浮いている。見えた機雷を数え、触れた機雷を爆発させてその添字を返す（無ければ −1。1 ステップに 1 個）。
 * 爆発したら呼ぶ側が mineHitSpec の被害を今の被弾の作法で自艇に当てる（終わりの理由は MINE_END_REASON）
 */
export function stepMines(st: MinefieldState, r: MinefieldRules, boat: BoatState, halfLengthM: number, halfBeamM: number, afloat: boolean): number {
  if (!afloat) return -1;
  let hit = -1;
  const touch = halfBeamM + r.mine.contactM;
  for (let k = 0; k < st.max; k++) {
    const s = st.state[k]!;
    if (s === MINE_NONE || s === MINE_BLOWN) continue;
    const dx = st.x[k]! - boat.x;
    const dy = st.y[k]! - boat.y;
    if (s === MINE_HIDDEN && dx * dx + dy * dy <= r.mine.sight2) {
      st.state[k] = MINE_SEEN;
      st.seen++;
      st.seenSeq++;
      st.lastSeen = k;
    }
    if (hit < 0 && pointNearBoat(st.x[k]!, st.y[k]!, boat, halfLengthM, touch)) {
      if (st.state[k] === MINE_HIDDEN) {
        st.seen++;
        st.seenSeq++;
        st.lastSeen = k;
      }
      st.state[k] = MINE_BLOWN;
      st.blown++;
      st.blowSeq++;
      st.lastBlown = k;
      hit = k;
    }
  }
  return hit;
}

/** 1 個の被害（今の被弾の作法の HitSpec。damage・fire_chance・engine_damage_chance） */
export function mineHitSpec(r: MinefieldRules): HitSpec {
  return r.mine;
}

/**
 * V-X2 の面積: 区画 f の内で置ける所の割合（決まった格子 stepM ごとの点を数える。乱数なし。起動時の検査と tests だけ）。
 * 群の位置のずれ（±jitter）は呼ぶ側が置かない円の半径に足す（どの夜でも置けない所を広めに見る）
 */
export function minefieldFreeShare(r: MinefieldRules, keep: MineKeepOut, f: number, stepM: number): number {
  const fd = r.fields[f]!;
  let all = 0;
  let free = 0;
  for (let y = fd.y + stepM / 2; y < fd.y + fd.h; y += stepM) {
    for (let x = fd.x + stepM / 2; x < fd.x + fd.w; x += stepM) {
      all++;
      if (minePlaceable(r, keep, x, y)) free++;
    }
  }
  return all > 0 ? free / all : 0;
}
