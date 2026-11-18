// v0.8.2 S2b（us_05「スリガオ海峡・最初の接触」。spec-v0820 §4.11 D-A1・D-A2、lead の L30）: 戦艦 扶桑型（山城・扶桑）と重巡 最上の置き方（Phaser にも Canvas にも依らない）。
// 骨組み（船体の輪郭・船首楼の段・艦橋の足元・煙突・主砲塔・マスト）は ship-art-config の SHIP_ART_LAYOUTS、細部は capital-art-config。駆逐艦と同じ DestroyerPlan の形
// （艦首が上・中心線は x = B/2・世界単位）にして assets/destroyer-paint が描く（新しい部品の型 pagoda・casemate・deck）。寸法は記録 × sprite_scale＝当たりと同じ大きさ（R22）。
// 見分けの鍵（L30）: 戦艦は高い段の塔の艦橋と連装の主砲塔 6（前 2・中 2・後 2）、重巡は前の主砲塔 3 と後部の平らな飛行甲板とレール。tests/destroyer-art・capital-art が置き方の決まりを見る。
import { CAPITAL_DETAILS, CAPITAL_LOCKER_UNITS, CAPITAL_TUB_UNITS, CASEMATE_EDGE_UNITS, CASEMATE_W_UNITS, PAGODA_SHIFT, PAGODA_SHRINK_LEN, PAGODA_SHRINK_W } from '../config/capital-art-config';
import type { DestroyerDetail } from '../config/destroyer-art-config';
import { SHIP_ART_LAYOUTS } from '../config/ship-art-config';
import { hullHalfWidthAt, hullOutline } from './boat-shape';
import type { CapitalKind, DestroyerPart, DestroyerPlan } from './destroyer-plan';

/** 戦艦・重巡の形か（鍵 → 形の表の値。ほかは駆逐艦の destroyerPlan） */
export function isCapitalKind(kind: string): kind is CapitalKind {
  return kind === 'fuso' || kind === 'mogami';
}

/** 置き方 → 描く部品の並び（低い物から高い物へ: 小物・短艇・飛行甲板・カタパルト・砲郭・主砲・高角砲・機銃の台・艦橋・煙突・マスト） */
export function capitalPlan(kind: CapitalKind, L: number, B: number): DestroyerPlan {
  const lay = SHIP_ART_LAYOUTS[kind];
  const d = CAPITAL_DETAILS[kind];
  const cx = B / 2;
  const parts: DestroyerPart[] = [];
  for (const [f, xf] of d.lockers) parts.push({ t: 'locker', cx: cx + xf * B, cy: f * L, w: CAPITAL_LOCKER_UNITS[0], len: CAPITAL_LOCKER_UNITS[1] });
  for (const [f, xf] of d.boats) parts.push({ t: 'boat', cx: cx + xf * B, cy: f * L, w: d.boatSize[0], len: d.boatSize[1] });
  if (d.deck) {
    const [f0, f1, wf, rails] = d.deck;
    parts.push({ t: 'deck', cx, cy: ((f0 + f1) / 2) * L, w: wf * B, len: (f1 - f0) * L, rails });
  }
  for (const [f, xf] of d.catapults) parts.push({ t: 'tubes', cx: cx + xf * B, cy: f * L, w: d.catapultSize[0], len: d.catapultSize[1] * L, n: 1, shield: false });
  if (d.casemates) {
    // 舷側の砲郭の列: 列の前後で狭い方の半幅から、縁の余白と列の幅の半分だけ内（甲板の輪郭の内）
    const [f0, f1, n] = d.casemates;
    const off = Math.min(hullHalfWidthAt(lay.hull, f0, B), hullHalfWidthAt(lay.hull, f1, B)) - CASEMATE_EDGE_UNITS - CASEMATE_W_UNITS / 2;
    for (const side of [1, -1] as const) parts.push({ t: 'casemate', cx: cx + side * off, cy: ((f0 + f1) / 2) * L, w: CASEMATE_W_UNITS, len: (f1 - f0) * L, n, side });
  }
  const [tl, bl, bw, dx] = d.turret;
  for (const [f, wf, dir] of lay.mounts) parts.push({ t: 'gun', style: 'twin', cx, cy: f * L, w: wf * B, len: tl * L, dir, barrel: bl * L, dx, bw });
  const [hw, hl, hb, hbw, hdx] = d.haSize;
  for (const [f, xf, dir] of d.ha) parts.push({ t: 'gun', style: 'twin', cx: cx + xf * B, cy: f * L, w: hw * B, len: hl * L, dir, barrel: hb * L, dx: hdx, bw: hbw });
  for (const [f, xf] of d.tubs) parts.push({ t: 'tub', cx: cx + xf * B, cy: f * L, w: CAPITAL_TUB_UNITS, len: CAPITAL_TUB_UNITS });
  {
    const [f0, f1, wf] = lay.bridge;
    const cy = ((f0 + f1) / 2) * L;
    if (d.tiers > 0) parts.push({ t: 'pagoda', cx, cy, w: wf * B, len: (f1 - f0) * L, tiers: d.tiers });
    else parts.push({ t: 'bridge', style: 'ijn', cx, cy, w: wf * B, len: (f1 - f0) * L });
  }
  for (const [f, wf, lf] of lay.funnels) parts.push({ t: 'funnel', cx, cy: f * L, w: wf * B, len: lf * L });
  for (const f of lay.masts) parts.push({ t: 'mast', cx, cy: f * L, w: d.yardHalfB * B * 2, len: 2 });
  // 甲板の模様（destroyer-paint の paintDeckMarks）が読む欄: 板の継ぎ目の間隔・爆雷の軌条なし（ほかの欄は描くのに使わない）
  const detail: DestroyerDetail = {
    gun: 'twin', bridge: 'ijn', tubeN: 1, tubeLen: d.catapultSize[1], tubeShield: false, boats: d.boats, lockers: d.lockers, dcRacks: false, yardHalfB: d.yardHalfB, panelUnits: d.panelUnits,
  };
  return { kind, L, B, detail, hull: lay.hull, outline: hullOutline(lay.hull, L, B), forecastle: lay.forecastle, parts };
}

/** 塔の艦橋の k 段目の箱 [x, y, w, h]（段ごとに縮み、少し前へ。PAGODA_SHIFT ≤ PAGODA_SHRINK_LEN / 2 なので足元の箱の内＝tests/capital-art）。assets/capital-paint が描く（起動時だけ） */
export function pagodaTier(p: Extract<DestroyerPart, { t: 'pagoda' }>, k: number): [number, number, number, number] {
  const w = p.w * (1 - PAGODA_SHRINK_W * k);
  const h = p.len * (1 - PAGODA_SHRINK_LEN * k);
  return [p.cx - w / 2, p.cy - p.len * PAGODA_SHIFT * k - h / 2, w, h];
}
