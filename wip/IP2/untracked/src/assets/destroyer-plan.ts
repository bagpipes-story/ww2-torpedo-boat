// v0.7.0 IP2（U8「駆逐艦のグラフィックを見直してクオリティを上げてください。でも、色は現在と同じ単系統のままで」）: 駆逐艦 3 種の描き直しの置き方（Phaser にも Canvas にも依らない）。
// 骨組みの位置は ship-art-config の SHIP_ART_LAYOUTS（当たりの形 R22・形で見分ける＝陽炎型 連装 3・フレッチャー級 単装 5・睦月型 単装 4）、細部は destroyer-art-config。
// 艦首が上（y 0）・中心線は x = B/2・世界単位。assets/destroyer-paint が Canvas の 2D に描き、tests/destroyer-art が置き方の決まり（部品は船体の内・大きさ ≥ 2 単位・中心線の部品は重ならない）を確かめる。
import { SHIP_ART_LAYOUTS } from '../config/ship-art-config';
import {
  DESTROYER_BARREL_LEN, DESTROYER_BOAT_LEN_UNITS, DESTROYER_SHORT_BARREL_SHARE, DESTROYER_BOAT_W_UNITS, DESTROYER_DETAILS, DESTROYER_LOCKER_UNITS, DESTROYER_TWIN_LEN, type DestroyerBridgeStyle, type DestroyerDetail,
  type DestroyerGunStyle,
} from '../config/destroyer-art-config';
import { hullHalfWidthAt, hullOutline, type Pt } from './boat-shape';

export type DestroyerKind = 'kagero' | 'fletcher' | 'mutsuki';

/** 置いた部品（世界単位。cx・cy は中心、w は横・len は縦の大きさ） */
export type DestroyerPart =
  | { readonly t: 'gun'; readonly style: DestroyerGunStyle; readonly cx: number; readonly cy: number; readonly w: number; readonly len: number; readonly dir: 1 | -1; readonly barrel: number }
  | { readonly t: 'tubes'; readonly cx: number; readonly cy: number; readonly w: number; readonly len: number; readonly n: number; readonly shield: boolean }
  | { readonly t: 'funnel'; readonly cx: number; readonly cy: number; readonly w: number; readonly len: number }
  | { readonly t: 'bridge'; readonly style: DestroyerBridgeStyle; readonly cx: number; readonly cy: number; readonly w: number; readonly len: number }
  | { readonly t: 'tub'; readonly cx: number; readonly cy: number; readonly w: number; readonly len: number }
  | { readonly t: 'mast'; readonly cx: number; readonly cy: number; readonly w: number; readonly len: number }
  | { readonly t: 'boat'; readonly cx: number; readonly cy: number; readonly w: number; readonly len: number }
  | { readonly t: 'locker'; readonly cx: number; readonly cy: number; readonly w: number; readonly len: number };

export interface DestroyerPlan {
  readonly kind: DestroyerKind;
  readonly L: number;
  readonly B: number;
  readonly detail: DestroyerDetail;
  readonly hull: (typeof SHIP_ART_LAYOUTS)['kagero']['hull'];
  /** 船体の輪郭（艦首の先から右舷→左舷） */
  readonly outline: readonly Pt[];
  /** 船首楼の段（長さの割合）と描き方（'line' 段・'notch' 切れ込み）。null は平甲板 */
  readonly forecastle: readonly [number, 'line' | 'notch'] | null;
  /** 描く順の部品（低い物から高い物へ: 小物・短艇・発射管・砲・機銃の台・艦橋・煙突・マスト） */
  readonly parts: readonly DestroyerPart[];
}

/** 長さの割合 f の半幅（世界単位） */
export function planHalfAt(plan: DestroyerPlan, f: number): number {
  return hullHalfWidthAt(plan.hull, f, plan.B);
}

/** 置き方 → 描く部品の並び */
export function destroyerPlan(kind: DestroyerKind, L: number, B: number): DestroyerPlan {
  const lay = SHIP_ART_LAYOUTS[kind];
  const d = DESTROYER_DETAILS[kind];
  const cx = B / 2;
  const parts: DestroyerPart[] = [];
  for (const [f, xf] of d.lockers) parts.push({ t: 'locker', cx: cx + xf * B, cy: f * L, w: DESTROYER_LOCKER_UNITS[0], len: DESTROYER_LOCKER_UNITS[1] });
  for (const [f, xf] of d.boats) parts.push({ t: 'boat', cx: cx + xf * B, cy: f * L, w: DESTROYER_BOAT_W_UNITS, len: DESTROYER_BOAT_LEN_UNITS });
  for (const [f, wf] of lay.tubes) parts.push({ t: 'tubes', cx, cy: f * L, w: wf * B, len: d.tubeLen * L, n: d.tubeN, shield: d.tubeShield });
  for (const [f, wf, dir] of lay.mounts) {
    const w = wf * B;
    const len = d.gun === 'twin' ? DESTROYER_TWIN_LEN * L : w;
    parts.push({ t: 'gun', style: d.gun, cx, cy: f * L, w, len, dir, barrel: DESTROYER_BARREL_LEN * L * (d.gun === 'single12' ? DESTROYER_SHORT_BARREL_SHARE : 1) });
  }
  for (const [f, xf] of lay.tubs) parts.push({ t: 'tub', cx: cx + xf * B, cy: f * L, w: 4, len: 4 });
  {
    const [f0, f1, wf] = lay.bridge;
    parts.push({ t: 'bridge', style: d.bridge, cx, cy: ((f0 + f1) / 2) * L, w: wf * B, len: (f1 - f0) * L });
  }
  for (const [f, wf, lf] of lay.funnels) parts.push({ t: 'funnel', cx, cy: f * L, w: wf * B, len: lf * L });
  for (const f of lay.masts) parts.push({ t: 'mast', cx, cy: f * L, w: d.yardHalfB * B * 2, len: 2 });
  return { kind, L, B, detail: d, hull: lay.hull, outline: hullOutline(lay.hull, L, B), forecastle: lay.forecastle, parts };
}

/** 部品の範囲（世界単位。砲は砲身まで）。tests が船体の内に収まるか・重ならないかを見る */
export function destroyerPartBounds(p: DestroyerPart): { x0: number; x1: number; y0: number; y1: number } {
  const b = { x0: p.cx - p.w / 2, x1: p.cx + p.w / 2, y0: p.cy - p.len / 2, y1: p.cy + p.len / 2 };
  if (p.t === 'gun') {
    if (p.dir === 1) b.y0 -= p.barrel;
    else b.y1 += p.barrel;
  }
  return b;
}

/** 部品の箱（砲は砲塔と砲身の 2 つ。ほかは destroyerPartBounds の 1 つ）。tests が船体の内に収まるかを見る */
export function destroyerPartBoxes(p: DestroyerPart, barrelSpread: number): { x0: number; x1: number; y0: number; y1: number }[] {
  if (p.t !== 'gun') return [destroyerPartBounds(p)];
  const body = { x0: p.cx - p.w / 2, x1: p.cx + p.w / 2, y0: p.cy - p.len / 2, y1: p.cy + p.len / 2 };
  const y0 = p.dir === 1 ? body.y0 - p.barrel : body.y1;
  return [body, { x0: p.cx - barrelSpread, x1: p.cx + barrelSpread, y0, y1: y0 + p.barrel }];
}
