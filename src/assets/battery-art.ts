// v0.7.0 IP1b（U4「沿岸砲もリメイクお願いします」）: 沿岸砲の絵を初めて使う時に 1 回だけ Canvas の 2D に描く（鍵が既にあれば描かない＝sea-art の paintCanvas。CLAUDE.md §7）。
// - tex-shore-battery: 真上から見た砲台（擬装の網と草木の塊・土嚢の輪・コンクリートの床と砲の穴・軌条・弾薬箱・敵の赤の輪と三角の印）。一辺 BATTERY_ART_SIZE_M m を k px/m で。
// - tex-shore-gun: 回る砲（防盾＝赤い帯つき・砲身・砲口の制退器・尾栓）。上が砲口、回り軸は防盾の中心（原点の y は gunOriginY）。
// 形は assets/battery-shape（絵だけの乱数 ART_SEED_BATTERY）。色は焼く（tint しない）。
import type Phaser from 'phaser';
import { batteryBags, batteryNet, batteryRedMarks } from './battery-shape';
import { paintCanvas } from './sea-art';
import {
  ART_SEED_BATTERY, BATTERY_ART_SIZE_M, BATTERY_BAG_RING_R, BATTERY_BAG_THICK_M, BATTERY_COLORS, BATTERY_GUN_LEN_M, BATTERY_GUN_TAIL_M, BATTERY_GUN_W_M, BATTERY_MUZZLE_W_M, BATTERY_PAD_R, BATTERY_PIT_R, BATTERY_RAIL_R, BATTERY_RED_RING_W,
  BATTERY_SHIELD_R,
} from '../config/blast-art-config';
import { RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';

const hex = (c: number, a = 1): string => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

/** 砲の絵の幅と高さ m（防盾の幅・砲口から尾栓まで）と原点の y の割合（回り軸＝防盾の中心） */
export const GUN_TEX_W_M = BATTERY_SHIELD_R * 2 + 1;
export const GUN_TEX_H_M = BATTERY_GUN_LEN_M + BATTERY_GUN_TAIL_M + 1;
export const gunOriginY = (BATTERY_GUN_LEN_M + 0.5) / GUN_TEX_H_M;

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

/** 角丸の矩形の道（ctx.roundRect は古い Safari に無い） */
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function paintBase(ctx: CanvasRenderingContext2D, k: number, S: number): void {
  const C = BATTERY_COLORS;
  ctx.save();
  ctx.translate(S / 2, S / 2);
  ctx.scale(k, k);
  const net = batteryNet(ART_SEED_BATTERY);
  const blob = (b: (typeof net)[number], a: number): void => {
    ctx.fillStyle = hex(C.net[b.color]!, a);
    ctx.beginPath();
    b.pts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(b.x + px, b.y + py) : ctx.lineTo(b.x + px, b.y + py)));
    ctx.closePath();
    ctx.fill();
  };
  for (const b of net) blob(b, 1); // 外の擬装（土嚢の下）
  // 土嚢の外の影
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  circle(ctx, 1.6, 2.2, BATTERY_BAG_RING_R + BATTERY_BAG_THICK_M / 2 + 1.5);
  ctx.fill();
  // コンクリートの床（中が少し明るい）と赤い縁の輪
  const g = ctx.createRadialGradient(-6, -6, 3, 0, 0, BATTERY_PAD_R);
  g.addColorStop(0, hex(0x8a877c));
  g.addColorStop(1, hex(C.pad));
  ctx.fillStyle = g;
  circle(ctx, 0, 0, BATTERY_PAD_R);
  ctx.fill();
  ctx.strokeStyle = hex(C.red);
  ctx.lineWidth = BATTERY_RED_RING_W;
  circle(ctx, 0, 0, BATTERY_PAD_R - BATTERY_RED_RING_W / 2);
  ctx.stroke();
  // 土嚢の輪（接線の向きの角丸の袋・縫い目・上の明るい筋）
  for (const b of batteryBags()) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.ang);
    ctx.fillStyle = hex(b.shade ? C.bagB : C.bagA);
    ctx.strokeStyle = hex(C.seam);
    ctx.lineWidth = 1.1;
    roundRect(ctx, -b.len / 2, -b.thick / 2, b.len, b.thick, 3);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,245,215,0.45)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(-b.len / 2 + 2, -b.thick / 2 + 1.8);
    ctx.lineTo(b.len / 2 - 2, -b.thick / 2 + 1.8);
    ctx.stroke();
    ctx.restore();
  }
  // 陸の側の擬装の網（土嚢に掛かる。網目の暗い筋）
  for (const b of net) {
    if (b.y < 8) continue;
    blob({ ...b, x: b.x * 0.86, y: b.y * 0.86, r: b.r * 0.7, pts: b.pts.map(([px, py]) => [px * 0.7, py * 0.7] as const) }, 0.85);
    ctx.strokeStyle = 'rgba(10,20,8,0.6)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(b.x * 0.86 - b.r * 0.5, b.y * 0.86 - b.r * 0.3);
    ctx.lineTo(b.x * 0.86 + b.r * 0.5, b.y * 0.86 + b.r * 0.3);
    ctx.moveTo(b.x * 0.86 - b.r * 0.3, b.y * 0.86 + b.r * 0.5);
    ctx.lineTo(b.x * 0.86 + b.r * 0.3, b.y * 0.86 - b.r * 0.5);
    ctx.stroke();
  }
  // 赤い三角の印（敵。外を指す）
  ctx.fillStyle = hex(C.red);
  for (const m of batteryRedMarks()) {
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(m.ang);
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(-3.5, -4.6);
    ctx.lineTo(-3.5, 4.6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  // 砲の穴・軌条・弾薬箱（後ろの口の手前）
  ctx.fillStyle = hex(C.pit);
  circle(ctx, 0, 0, BATTERY_PIT_R);
  ctx.fill();
  ctx.strokeStyle = hex(C.rail);
  ctx.lineWidth = 2;
  circle(ctx, 0, 0, BATTERY_RAIL_R);
  ctx.stroke();
  ctx.fillStyle = hex(C.ammo);
  ctx.strokeStyle = hex(C.seam);
  ctx.lineWidth = 0.9;
  for (const sx of [-9.5, 4]) {
    ctx.fillRect(sx, 22, 6, 4.4);
    ctx.strokeRect(sx, 22, 6, 4.4);
  }
  ctx.restore();
}

function paintGun(ctx: CanvasRenderingContext2D, k: number): void {
  const C = BATTERY_COLORS;
  ctx.save();
  ctx.scale(k, k);
  const cx = GUN_TEX_W_M / 2;
  const cy = BATTERY_GUN_LEN_M + 0.5;
  // 尾栓（後ろ）・砲身（明るい芯の筋）・砲口の制退器
  ctx.fillStyle = hex(C.metalDark);
  ctx.fillRect(cx - 3, cy, 6, BATTERY_GUN_TAIL_M);
  const bg = ctx.createLinearGradient(cx - BATTERY_GUN_W_M / 2, 0, cx + BATTERY_GUN_W_M / 2, 0);
  bg.addColorStop(0, hex(C.metalDark));
  bg.addColorStop(0.45, hex(C.metalLight));
  bg.addColorStop(1, hex(C.metalDark));
  ctx.fillStyle = bg;
  ctx.fillRect(cx - BATTERY_GUN_W_M / 2, 4, BATTERY_GUN_W_M, cy - 4);
  ctx.fillStyle = hex(C.metal);
  ctx.fillRect(cx - BATTERY_MUZZLE_W_M / 2, 0.5, BATTERY_MUZZLE_W_M, 4.4);
  ctx.strokeStyle = hex(C.shieldRim);
  ctx.lineWidth = 0.8;
  ctx.strokeRect(cx - BATTERY_MUZZLE_W_M / 2, 0.5, BATTERY_MUZZLE_W_M, 4.4);
  // 防盾（敵の鮭色の丸・前に赤い帯・暗い縁）
  ctx.fillStyle = hex(C.shield);
  circle(ctx, cx, cy, BATTERY_SHIELD_R);
  ctx.fill();
  ctx.strokeStyle = hex(C.red);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, BATTERY_SHIELD_R - 1.8, Math.PI * 1.12, Math.PI * 1.88);
  ctx.stroke();
  ctx.strokeStyle = hex(C.shieldRim);
  ctx.lineWidth = 1.2;
  circle(ctx, cx, cy, BATTERY_SHIELD_R - 0.6);
  ctx.stroke();
  ctx.fillStyle = hex(C.metalLight, 0.7);
  circle(ctx, cx - 3, cy - 2.5, 2.2);
  ctx.fill();
  ctx.fillStyle = hex(C.shieldRim);
  ctx.fillRect(cx + 2.5, cy + 1, 3.5, 3);
  ctx.restore();
}

/** 沿岸砲の 2 枚（初めて使う時に 1 回。鍵があれば何もしない）。返り値は世界の m に合わせる scale（1 px ＝ 1/k m） */
export function ensureShoreBatteryTextures(scene: Phaser.Scene): number {
  const k = RENDER_SCALE;
  const S = Math.ceil(BATTERY_ART_SIZE_M * k);
  paintCanvas(scene, TEXTURE_KEYS.shoreBattery, S, S, (ctx) => paintBase(ctx, k, S));
  paintCanvas(scene, TEXTURE_KEYS.shoreGun, Math.ceil(GUN_TEX_W_M * k), Math.ceil(GUN_TEX_H_M * k), (ctx) => paintGun(ctx, k));
  return 1 / k;
}
