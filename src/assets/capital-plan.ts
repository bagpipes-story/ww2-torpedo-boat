// v0.8.2 S2b（us_05「スリガオ海峡・最初の接触」。spec-v0820 §4.11 D-A1・D-A2、lead の L30）: 戦艦 扶桑型（山城・扶桑）と重巡 最上の置き方（Phaser にも Canvas にも依らない）。
// 骨組み（船体の輪郭・船首楼の段・艦橋の足元・煙突・主砲塔・マスト）は ship-art-config の SHIP_ART_LAYOUTS、細部の置き方は capital-layout-config。駆逐艦と同じ DestroyerPlan の形
// （艦首が上・中心線は x = B/2・世界単位）にして assets/destroyer-paint が描く（新しい部品の型は assets/capital-paint・capital-detail-paint）。寸法は記録 × sprite_scale＝当たりと同じ大きさ（R22）。
// v0.8.2 S2c（ユーザーの実機の感想 2026-11-18「デフォルメされすぎている…もう少しディティールに」「最上は後部甲板に水上機」）: 山城と最上の 1944 年の並びと細部（塔の段・背負い式の砲塔・
// 副砲・高角砲・25 mm・短艇とダビット・カタパルトと水上機・クレーン・最上の飛行甲板の 7 機）。描く順は低い物から高い物へ（背負い式の砲塔は下の砲塔の後＝砲身が下の砲塔の屋根を越える）。
import { AA_R_UNITS, CAPITAL_LOCKER_UNITS, CASEMATE_EDGE_UNITS, CASEMATE_W_UNITS, CRANE_UNITS, DAVIT_UNITS } from '../config/capital-art-config';
import {
  CAPITAL_DETAILS, CAPITAL_TOWER_ROWS, DECK_PLANE_FRONT_UNITS, DECK_PLANE_GAP_UNITS, PLANE_BI_UNITS, PLANE_MONO_UNITS, TURRET_EARS,
} from '../config/capital-layout-config';
import type { DestroyerDetail } from '../config/destroyer-art-config';
import { SHIP_ART_LAYOUTS } from '../config/ship-art-config';
import { hullHalfWidthAt, hullOutline } from './boat-shape';
import type { CapitalKind, DestroyerPart, DestroyerPlan } from './destroyer-plan';

/** 戦艦・重巡の形か（鍵 → 形の表の値。ほかは駆逐艦の destroyerPlan） */
export function isCapitalKind(kind: string): kind is CapitalKind {
  return kind === 'fuso' || kind === 'mogami';
}

/** 斜めの矩形（幅 a × 長さ b を ang 度）の外の箱の [w, len] */
function boxOf(a: number, b: number, ang: number): [number, number] {
  const r = (ang * Math.PI) / 180;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  return [a * c + b * s, a * s + b * c];
}
function plane(cx: number, cy: number, ang: number, bi: boolean): DestroyerPart {
  const [span, plen] = bi ? PLANE_BI_UNITS : PLANE_MONO_UNITS;
  const [w, len] = boxOf(span, plen, ang);
  return { t: 'plane', cx, cy, w, len, span, plen, ang, bi };
}

/** 置き方 → 描く部品の並び（低い物から高い物へ: 小物・ダビット・短艇・飛行甲板・砲郭・発射管・カタパルト・水上機・甲板の主砲塔・高角砲・機銃・高い主砲塔・後部の上部構造・煙突・塔・マスト・クレーン） */
export function capitalPlan(kind: CapitalKind, L: number, B: number): DestroyerPlan {
  const lay = SHIP_ART_LAYOUTS[kind];
  const d = CAPITAL_DETAILS[kind];
  const cx = B / 2;
  const parts: DestroyerPart[] = [];
  const [bw, bl] = d.boatSize;
  for (const [f, xf] of d.lockers) parts.push({ t: 'locker', cx: cx + xf * B, cy: f * L, w: CAPITAL_LOCKER_UNITS[0], len: CAPITAL_LOCKER_UNITS[1] });
  for (const [f, xf] of d.boats) {
    const side = xf > 0 ? 1 : -1;
    for (const k of [-1, 1]) parts.push({ t: 'davit', cx: cx + xf * B + side * (bw / 2 + DAVIT_UNITS * 0.6), cy: f * L + k * bl * 0.3, w: DAVIT_UNITS, len: DAVIT_UNITS, side });
  }
  for (const [f, xf] of d.boats) parts.push({ t: 'boat', cx: cx + xf * B, cy: f * L, w: bw, len: bl });
  if (d.deck) {
    const [f0, f1, wf, wa, rails] = d.deck;
    parts.push({ t: 'deck', cx, cy: ((f0 + f1) / 2) * L, w: wf * B, len: (f1 - f0) * L, rails, wAft: wa * B });
  }
  if (d.casemates) {
    // 舷側の砲郭の列: 列の前後で狭い方の半幅から、縁の余白と列の幅の半分だけ内（甲板の輪郭の内）
    const [f0, f1, n] = d.casemates;
    const off = Math.min(hullHalfWidthAt(lay.hull, f0, B), hullHalfWidthAt(lay.hull, f1, B)) - CASEMATE_EDGE_UNITS - CASEMATE_W_UNITS / 2;
    for (const side of [1, -1] as const) parts.push({ t: 'casemate', cx: cx + side * off, cy: ((f0 + f1) / 2) * L, w: CASEMATE_W_UNITS, len: (f1 - f0) * L, n, side });
  }
  const [tw, tl, tn] = d.tubeSize;
  for (const [f, xf] of d.tubes) parts.push({ t: 'tubes', cx: cx + xf * B, cy: f * L, w: tw * B, len: tl * L, n: tn, shield: true });
  const [cl, cw] = d.catapultSize;
  for (const [f, xf, ang] of d.catapults) {
    const [w, len] = boxOf(cw, cl * L, ang);
    parts.push({ t: 'catapult', cx: cx + xf * B, cy: f * L, w, len, cl: cl * L, cw, ang });
  }
  for (const [f, xf, ang, bi] of d.planes) parts.push(plane(cx + xf * B, f * L, ang, bi === 1));
  if (d.deck) {
    // 飛行甲板の水上機: 艦首側から機首を前へ、間を空けて中心線に並べる（描くのは艦尾側から）
    const ps: DestroyerPart[] = [];
    let nose = d.deck[0] * L + DECK_PLANE_FRONT_UNITS;
    d.deckPlanes.forEach((bi) => {
      const plen = (bi ? PLANE_BI_UNITS : PLANE_MONO_UNITS)[1];
      ps.push(plane(cx, nose + plen / 2, 0, bi === 1));
      nose += plen + DECK_PLANE_GAP_UNITS;
    });
    parts.push(...ps.reverse());
  }
  const [tlen, barrel, tbw, tdx] = d.turret;
  const gun = (i: number): DestroyerPart => {
    const [f, wf, dir] = lay.mounts[i]!;
    return { t: 'gun', style: 'twin', cx, cy: f * L, w: wf * B, len: tlen * L, dir, barrel: barrel * L, dx: tdx, bw: tbw, lift: d.lifts[i], ears: TURRET_EARS[kind] };
  };
  lay.mounts.forEach((_, i) => { if (!d.lifts[i]) parts.push(gun(i)); });
  const [hw, hl, hb, hbw, hdx] = d.haSize;
  for (const [f, xf, dir] of d.ha) parts.push({ t: 'gun', style: 'twin', cx: cx + xf * B, cy: f * L, w: hw * B, len: hl * L, dir, barrel: hb * L, dx: hdx, bw: hbw });
  for (const [list, n, r] of [[d.aa3, 3, AA_R_UNITS[0]], [d.aa1, 1, AA_R_UNITS[1]]] as const) {
    for (const [f, xf] of list) parts.push({ t: 'aa', cx: cx + xf * B, cy: f * L, w: r * 2, len: r * 2, n, side: xf > 0 ? 1 : -1 });
  }
  // 高い主砲塔（背負い式・高い台）: 低い段から順に（下の砲塔の後＝砲身が屋根を越える）
  const lifted = lay.mounts.map((_, i) => i).filter((i) => d.lifts[i]! > 0).sort((a, b) => d.lifts[a]! - d.lifts[b]!);
  for (const i of lifted) parts.push(gun(i));
  if (d.aftHouse) {
    const [f0, f1, wf] = d.aftHouse;
    parts.push({ t: 'pagoda', style: 'fusoAft', cx, cy: ((f0 + f1) / 2) * L, w: wf * B, len: (f1 - f0) * L, tiers: CAPITAL_TOWER_ROWS.fusoAft.length });
  }
  const [sw, sl, trunk] = d.stack;
  for (const [f, wf, lf] of lay.funnels) parts.push({ t: 'stack', cx, cy: f * L, w: sw * B, len: sl * L, fw: wf * B, flen: lf * L, trunk });
  {
    const [f0, f1, wf] = lay.bridge;
    parts.push({ t: 'pagoda', style: d.tower, cx, cy: ((f0 + f1) / 2) * L, w: wf * B, len: (f1 - f0) * L, tiers: CAPITAL_TOWER_ROWS[d.tower].length });
  }
  for (const f of lay.masts) parts.push({ t: 'mast', cx, cy: f * L, w: d.yardHalfB * B * 2, len: 2 });
  for (const [f0, x0f, f1, x1f] of d.cranes) {
    const [x0, y0, x1, y1] = [cx + x0f * B, f0 * L, cx + x1f * B, f1 * L];
    parts.push({ t: 'crane', cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: Math.abs(x1 - x0) + CRANE_UNITS * 2, len: Math.abs(y1 - y0) + CRANE_UNITS * 2, x0, y0, x1, y1 });
  }
  // 甲板の模様（destroyer-paint の paintDeckMarks）が読む欄: 横の継ぎ目は描かない（木甲板の縦の板は capital-deck-paint）・爆雷の軌条なし（ほかの欄は描くのに使わない）
  const detail: DestroyerDetail = {
    gun: 'twin', bridge: 'ijn', tubeN: 1, tubeLen: cl, tubeShield: false, boats: d.boats, lockers: d.lockers, dcRacks: false, yardHalfB: d.yardHalfB, panelUnits: L,
  };
  return { kind, L, B, detail, hull: lay.hull, outline: hullOutline(lay.hull, L, B), forecastle: lay.forecastle, parts };
}

/** 塔の k 段目の箱 [x, y, w, h]（capital-layout-config の CAPITAL_TOWER_ROWS。どの段も部品の箱の内＝tests/capital-art）。assets/capital-paint が描く（起動時だけ） */
export function pagodaTier(p: Extract<DestroyerPart, { t: 'pagoda' }>, k: number): [number, number, number, number] {
  const [ws, ls, dy] = CAPITAL_TOWER_ROWS[p.style][k]!;
  const w = p.w * ws;
  const h = p.len * ls;
  return [p.cx - w / 2, p.cy + p.len * dy - h / 2, w, h];
}
