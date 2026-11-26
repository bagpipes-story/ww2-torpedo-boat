// 味方の艇が救助に来る（v0.8.5 IP3。us_07 の rescue.friendly_boats＝V-F）の検査と読み出し。config/rescue-mission-data の getRescueParams が呼ぶ（rescue の鍵の 1 つ。例外は鍵を
// 名指す日本語・spec-v0850 §4 の作法）。道が掃海された水路の帯の内か（V-F4）は機雷原の値が要るので config/minefield-mission-data の Boot の検査（validateMinefieldMissions）から呼ぶ。
// 規則は core/friendly-boats。速さは kt を m/s に（世界の秒で進む＝艇・艦と同じ）。speed_kt は数か "player_full"（自艇の boats.json の speed_max_kt＝全速。v0.8.5 IP4）。Phaser 非依存。
import { segDistM } from '../core/ally-geometry';
import { FRIENDLY_MAX, type FriendlyRules } from '../core/friendly-boats';
import { ktToMps } from '../core/units';
import type { PrototypeMission } from './game-data';

/** V-F1: 鍵（ちょうどこれ） */
export const RESCUE_FRIENDLY_KEYS = ['count', 'speed_kt', 'capacity', 'stagger_s', 'park_offset_m', 'route_m', 'label_ja', 'source'] as const;

/** V-F1: speed_kt に書ける語＝自艇（任務の player_boat）の全速（boats.json の speed_max_kt。数を二重に持たない。v0.8.5 IP4） */
export const FRIENDLY_SPEED_PLAYER_FULL = 'player_full';

/** 味方の艇の世界の値（RescueSetup.friendly。core/friendly-boats の FriendlyRules ＋ HUD・絵の名と kt） */
export interface FriendlySetup extends FriendlyRules {
  readonly speedKt: number;
  readonly labelJa: string;
}

type Rec = Record<string, unknown>;
const isObj = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
type Bad = (v: string, msg: string) => never;

/** 円 (x, y, r) が矩形に掛かるか（中心が内でも） */
function circleHitsRect(x: number, y: number, r: number, s: { x: number; y: number; w: number; h: number }): boolean {
  const dx = x - Math.max(s.x, Math.min(x, s.x + s.w));
  const dy = y - Math.max(s.y, Math.min(y, s.y + s.h));
  return dx * dx + dy * dy < r * r || (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h);
}

/** 線分が矩形（の内）を通るか（端が内・辺と交わる） */
export function segHitsRect(ax: number, ay: number, bx: number, by: number, s: { x: number; y: number; w: number; h: number }): boolean {
  const inside = (x: number, y: number): boolean => x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h;
  if (inside(ax, ay) || inside(bx, by)) return true;
  const cross = (px: number, py: number, qx: number, qy: number): boolean => {
    const d = (bx - ax) * (qy - py) - (by - ay) * (qx - px);
    if (d === 0) return false;
    const t = ((px - ax) * (qy - py) - (py - ay) * (qx - px)) / d;
    const u = ((px - ax) * (by - ay) - (py - ay) * (bx - ax)) / d;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  };
  const x1 = s.x + s.w, y1 = s.y + s.h;
  return cross(s.x, s.y, x1, s.y) || cross(x1, s.y, x1, y1) || cross(x1, y1, s.x, y1) || cross(s.x, y1, s.x, s.y);
}

/**
 * V-F: rescue.friendly_boats（無い任務は null）。
 * V-F1 形（count は 1〜FRIENDLY_MAX の整数・speed_kt は正の数か "player_full"〔自艇の全速＝ctx.playerFullKt〕・capacity は 1 以上の整数・stagger_s と park_offset_m は 0 以上・route_m は [x, y] の 3 点以上・label_ja・source）。
 * V-F2 止まる所のずれは拾える距離（pickup_m）の内。V-F3 道: 点は海域の中で浅瀬の外・最初の点は帰投の輪の内（帰投の輪から出る）・2 番目から後のどれかがフィッチの輪の内
 * （止まる所のずれ込み。最初のその点で降ろす）・その後に 1 点以上（水路の端へ）
 */
export function readFriendlyBoats(mission: PrototypeMission, raw: unknown, ctx: { pickupM: number; playerFullKt: number; fitch: { x: number; y: number; ringM: number } }, bad: Bad): FriendlySetup | null {
  if (raw === null) return null;
  if (!isObj(raw)) return bad('V-F1', 'rescue.friendly_boats は object か null');
  const ks = Object.keys(raw);
  if (ks.length !== RESCUE_FRIENDLY_KEYS.length || !RESCUE_FRIENDLY_KEYS.every((k) => k in raw)) bad('V-F1', `rescue.friendly_boats の鍵はちょうど ${RESCUE_FRIENDLY_KEYS.join('・')}（${ks.join('・') || 'なし'}）`);
  const count = raw['count'];
  if (!(Number.isInteger(count) && (count as number) >= 1 && (count as number) <= FRIENDLY_MAX)) bad('V-F1', `rescue.friendly_boats.count は 1〜${FRIENDLY_MAX} の整数（${String(count)}）`);
  const rawKt = raw['speed_kt'];
  const kt = rawKt === FRIENDLY_SPEED_PLAYER_FULL ? ctx.playerFullKt : rawKt;
  if (!(isNum(kt) && kt > 0)) bad('V-F1', `rescue.friendly_boats.speed_kt は正の数か "${FRIENDLY_SPEED_PLAYER_FULL}"（自艇の全速）`);
  const cap = raw['capacity'];
  if (!(Number.isInteger(cap) && (cap as number) >= 1)) bad('V-F1', 'rescue.friendly_boats.capacity は 1 以上の整数');
  for (const k of ['stagger_s', 'park_offset_m'] as const) if (!(isNum(raw[k]) && (raw[k] as number) >= 0)) bad('V-F1', `rescue.friendly_boats.${k} は 0 以上`);
  if (!isText(raw['label_ja']) || !isText(raw['source'])) bad('V-F1', 'rescue.friendly_boats の label_ja・source は空でない文字列');
  const rs = raw['route_m'];
  if (!Array.isArray(rs) || rs.length < 3 || !rs.every((p) => Array.isArray(p) && p.length === 2 && p.every(isNum))) return bad('V-F1', 'rescue.friendly_boats.route_m は [x, y] の 3 点以上の配列');
  const route = (rs as number[][]).map((p) => [p[0]!, p[1]!] as [number, number]);
  const park = raw['park_offset_m'] as number;
  if (!(park <= ctx.pickupM)) bad('V-F2', `rescue.friendly_boats.park_offset_m（${park} m）は rescue.pickup_m（${ctx.pickupM} m）以下（群の拾える所で止まる）`);
  const { width, height } = mission.bounds;
  route.forEach(([x, y], i) => {
    if (!(x >= 0 && x <= width && y >= 0 && y <= height) || mission.shallows.some((s) => circleHitsRect(x, y, 0, s))) bad('V-F3', `rescue.friendly_boats.route_m[${i}]（${x}, ${y}）は海域の中で浅瀬の外`);
  });
  const rp = mission.returnPoint;
  const [x0, y0] = route[0]!;
  if (!(Math.hypot(x0 - rp.x, y0 - rp.y) <= rp.radiusM)) bad('V-F3', `rescue.friendly_boats.route_m[0]（${x0}, ${y0}）は帰投の輪（${rp.x}, ${rp.y}・半径 ${rp.radiusM}）の内（帰投の輪から出る）`);
  const f = ctx.fitch;
  const fitchIdx = route.findIndex(([x, y], i) => i >= 1 && Math.hypot(x - f.x, y - f.y) + park <= f.ringM);
  if (fitchIdx < 1) bad('V-F3', `rescue.friendly_boats.route_m の 2 番目から後のどれかはフィッチの輪（半径 ${f.ringM} m・止まる所のずれ ${park} m 込み）の内（降ろす所）`);
  if (!(fitchIdx < route.length - 1)) bad('V-F3', 'rescue.friendly_boats.route_m はフィッチの輪の点の後に 1 点以上（水路の端へ）');
  return {
    count: count as number,
    speedKt: kt as number,
    speedMps: ktToMps(kt as number),
    capacity: cap as number,
    staggerS: raw['stagger_s'] as number,
    parkOffsetM: park,
    route,
    fitchIdx,
    labelJa: raw['label_ja'] as string,
  };
}

/**
 * V-F4（Boot の検査。機雷原のある任務だけ）: 道の線分はどれも掃海された水路の 1 本の帯の内（両端が同じ水路の中心線から幅の半分の内＝帯は凸なので線分ごと内）、
 * 水路の端（道の最後の点）から各群の中心（今夜のずれの四隅込み）への真っ直ぐは機雷原の区画を通らない（機雷原の上を描かない）。壊れていれば「<任務>.v0_1_prototype.rescue.friendly_boats…（V-F4）」
 */
export function checkFriendlyRoute(
  mission: Pick<PrototypeMission, 'id'>,
  fr: FriendlySetup,
  field: { readonly lanes: readonly { x0: number; y0: number; x1: number; y1: number; widthM: number }[]; readonly fields: readonly { x: number; y: number; w: number; h: number }[] },
  groups: readonly { x: number; y: number }[],
  jitterM: number,
): void {
  const at = `${mission.id}.v0_1_prototype.rescue.friendly_boats`;
  const inLane = (ax: number, ay: number, bx: number, by: number): boolean =>
    field.lanes.some((l) => segDistM(ax, ay, l.x0, l.y0, l.x1, l.y1) <= l.widthM / 2 && segDistM(bx, by, l.x0, l.y0, l.x1, l.y1) <= l.widthM / 2);
  for (let i = 0; i + 1 < fr.route.length; i++) {
    const [ax, ay] = fr.route[i]!;
    const [bx, by] = fr.route[i + 1]!;
    if (!inLane(ax, ay, bx, by)) throw new Error(`${at}.route_m[${i}]→[${i + 1}] は掃海された水路（minefield.lanes）の 1 本の帯の内（V-F4・spec-v0850 §4）`);
  }
  const [ex, ey] = fr.route[fr.route.length - 1]!;
  const corners = [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;
  groups.forEach((g, i) => {
    for (const [sx, sy] of corners) {
      const gx = g.x + sx * jitterM;
      const gy = g.y + sy * jitterM;
      if (field.fields.some((r) => segHitsRect(ex, ey, gx, gy, r))) throw new Error(`${at}.route_m の最後の点（${ex}, ${ey}）から rescue.groups[${i}]（ずれ込み）への真っ直ぐは機雷原の区画を通らない（V-F4・spec-v0850 §4）`);
    }
  });
}
