// 揚陸の任務（v0.6.9 S6b。jp_04。spec-v069 §5.4・D9・R1・R8/F12）の画面の端の 2 本の印と海の上の ▼ の決まり（Phaser 非依存・確保なし。ui/hud-markers・systems/world-landing が使う）:
// 「輸送 N m」（味方の青。輸送船が画面の外で揚陸の決着の前。距離は輸送船の中心まで）・「雷撃 N m」（赤。輸送船を狙う戦う PT か見張りの報告の PT が画面の外。自艇からその PT へ）・
// ▼「雷撃」（報告の PT が画面の内で視程の外＝PT の絵が出ていない間。海の上に置く＝systems/world-landing の entities/landing-caret）。
// F12: 報告の PT が脅威の PT（「PT N m」の印・敵影が追う PT）で視程の内なら「雷撃」の印は出さない（同じ PT に 2 本の赤い印が重なる）。
// 重なり: 2 本の印が近ければ縁に沿ってずらす（ui/marker-separation の separateMarker。左右の縁は字 4 行・上下の縁はラベルの幅＋8。ずらした先が右下の速力と兵装の HUD の角なら逆へ）。
// HUD との重なり（S6b。S6a-fix の報告）: ▼ は画面の内で、▼ と字の箱が上の HUD の帯・右端の技能のボタン・右下の兵装（landingCaretRects。どれも端の印の縁の矩形の外）に重ならない点だけ
// （重なれば端の印が drawn false で縁から PT を指す。▼ と印は同時に出ない）。輸送船の字は HUD の矩形（landingHudRects）に重なれば船体の下へ、下も重なれば出さない（ui/ally-ship-view の allyShipTextPlace）。
import { CUE_PX, R_SKILL, TEXT_GAP, panelLayout, panelLeftX } from '../config/hud-layout-config';
import { LANDING_MARKER_SEP_EDGE_PX, LANDING_MARKER_SEP_SIDE_PX } from '../config/landing-config';
import type { LandingTelemetry } from '../core/landing';
import { EDGE_EPS_PX, separateMarker, type MarkerRect, type MarkerShift } from './marker-separation';

/** 「輸送 N m」を出すか（画面の内かどうかは ui/edge-marker が決める）: 揚陸の任務で、決着（揚陸完了か沈没）の前 */
export function landingShipMarkerShown(l: LandingTelemetry): boolean {
  return l.enabled && !l.resolved && !Number.isNaN(l.shipDx);
}

/**
 * 「雷撃 N m」を出すか（画面の内かどうかは ui/edge-marker が決める）: 印の PT（輸送船を狙う戦う PT＝モード 37 の PT があればそれ（S8 のレビュー game-1）、無ければ見張りの報告の PT。
 * systems/landing-telemetry の reportDx 〜 reportIsThreat）があり、それが視程の内の脅威の PT でなく（F12）、報告の PT なら海の上の ▼ が出ていない（▼ が出ていれば ▼ が受け持つ）。
 * 視程の外の PT（絵が無い）は ui/hud-markers が drawn false で渡す＝画面の内でも ▼ の立てない所（上の HUD の帯・右端の技能のボタン・兵装の下）か射線の PT（▼ は報告の PT だけ）なら縁から指す
 */
export function landingRunnerMarkerShown(l: LandingTelemetry): boolean {
  const fire = !l.resolved && l.fireLineI >= 0;
  return l.enabled && (fire || l.reportI >= 0) && !Number.isNaN(l.reportDx) && !(l.reportIsThreat && l.reportSighted) && !(l.caretShown && !fire);
}

/** 海の上の ▼「雷撃」を出すか: 報告の PT（i ≥ 0）が自艇の視程の外（d2 は自艇からの距離の二乗。PT の絵は視程の内だけ出る＝systems/pt-squadron）。どこに立てるかは landingCaretFits */
export function landingCaretShown(reportI: number, d2: number, visRange2: number): boolean {
  return reportI >= 0 && d2 > visRange2;
}

/**
 * ▼ を立てる点か（PT の論理画面の点 sx, sy。画面は W × H）: 画面の内で、▼ と「雷撃」の箱（PT の点から左右 halfW・上 topDy〜上 bottomDy。下は負なら点の下）が rects（landingCaretRects）に重ならない。
 * 外（画面の外・上の帯・右端の技能のボタン・兵装）なら ▼ は出さず、端の印が縁から指す（その矩形はどれも端の印の縁の矩形の外なので、矢印は PT へ向く）
 */
export function landingCaretFits(sx: number, sy: number, W: number, H: number, halfW: number, topDy: number, bottomDy: number, rects: readonly ScreenRect[]): boolean {
  return sx >= 0 && sx <= W && sy >= 0 && sy <= H && !boxHitsRects(sx - halfW, sy - topDy, sx + halfW, sy - bottomDy, rects, 0);
}

/** 論理画面の矩形（左上 x0, y0・右下 x1, y1） */
export interface ScreenRect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** 箱 [x0, x1] × [y0, y1] が rects のどれかに重なるか（各矩形を pad px 広げて見る。確保なし） */
export function boxHitsRects(x0: number, y0: number, x1: number, y1: number, rects: readonly ScreenRect[], pad: number): boolean {
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i]!;
    if (x0 < r.x1 + pad && r.x0 - pad < x1 && y0 < r.y1 + pad && r.y0 - pad < y1) return true;
  }
  return false;
}

/** landingHudRects の入力（ui-config の値。ui-config は DOM を読むので呼ぶ側＝systems/world-landing の buildLanding が渡す） */
export interface HudRectInputs {
  W: number;
  H: number;
  /** 上の HUD の帯（ビルド番号・2・3 行目・左上の夜明けの時計・HP・燃料・右上の揚陸の時計）の下端 */
  topBandBottom: number;
  /** 右端の技能の縦一列にある煙幕・識別のボタン（ui/weapon-panel と同じ: 艇の煙幕発生器・今夜の味方機。消火と見張りはいつも） */
  has: { smoke: boolean; identify: boolean };
  pause: { x: number; y: number; r: number };
  stick: { x: number; y: number; r: number };
  /** 速力・針路・舵の表示（と機関の帯）の左端と上端 */
  speedLeft: number;
  speedTop: number;
}

/**
 * 海の上の輸送船の字が重なってはいけない HUD の矩形（出撃の組み立てで 1 回）: 上の帯（画面の上の外まで）・一時停止・スティック・速力の表示（と機関の帯）・兵装（機銃の当たりの左から、
 * 上の 1 行の文の上から）・右端の技能のある段のボタン（当たりの縁 TEXT_GAP 込み。空いた段は塞がない）。tests/landing-markers が tests/hud-layout の固定の箱と当たりをどれも含むことを見る
 */
export function landingHudRects(k: HudRectInputs): ScreenRect[] {
  const rs = landingCaretRects(k);
  const left = panelLeftX(k.W) - TEXT_GAP;
  rs.push(
    { x0: k.pause.x - k.pause.r, y0: k.pause.y - k.pause.r, x1: k.pause.x + k.pause.r, y1: k.pause.y + k.pause.r },
    { x0: k.stick.x - k.stick.r, y0: k.stick.y - k.stick.r, x1: k.stick.x + k.stick.r, y1: k.stick.y + k.stick.r },
    { x0: k.speedLeft, y0: k.speedTop, x1: left, y1: k.H },
  );
  return rs;
}

/**
 * ▼「雷撃」が重なってはいけない矩形（landingHudRects の一部。出撃の組み立てで 1 回）: 上の帯・兵装・右端の技能のある段のボタン。どれも端の印の縁の矩形の外（上 TARGET_MARKER_TOP_MARGIN の上・
 * 右 W − 352 の右）なので、そこで ▼ を出さず端の印に替えても矢印は PT へ向く。一時停止・スティック・速力の表示は縁の矩形の内なので ▼ のまま（薄いスティックや速力の字の上でも小さな ▼ は読める）
 */
export function landingCaretRects(k: HudRectInputs): ScreenRect[] {
  const L = panelLayout(k.W, k.has);
  const left = panelLeftX(k.W) - TEXT_GAP;
  const rs: ScreenRect[] = [
    { x0: -k.W, y0: -k.H, x1: 2 * k.W, y1: k.topBandBottom },
    { x0: left, y0: L.cue.bottom - CUE_PX - TEXT_GAP, x1: k.W, y1: k.H },
  ];
  const r = R_SKILL + TEXT_GAP;
  for (const b of L.skills) rs.push({ x0: b.x - r, y0: b.y - r, x1: b.x + r, y1: b.y + r });
  return rs;
}

/**
 * 「帰投 N m」の矢印を左の縁の一時停止のボタンから縁に沿ってずらす（S8 のレビュー game-4: jp_04 は帰投の輪が出発点の真西で、矢印と字がボタンの高さに来て「一時停止」と重なった）。
 * (x, y) が左の縁の点で、矢印（半分 arrowHalfPx）とその上の字（矢印から labelAbovePx 上まで）がボタンの縦の幅（pauseY ± pauseR）に重なれば、近い方（ボタンの上か下。
 * 縁の矩形 r に収まる方）へ y をずらす。out に書いて返す（重ならなければ 0）
 */
export function avoidPauseButton(x: number, y: number, r: MarkerRect, pauseY: number, pauseR: number, arrowHalfPx: number, labelAbovePx: number, out: MarkerShift): MarkerShift {
  out.dx = 0;
  out.dy = 0;
  if (Math.abs(x - r.left) >= EDGE_EPS_PX) return out;
  const above = pauseY - pauseR - arrowHalfPx; // 矢印をここより上に置けば矢印の下端がボタンの上
  const below = pauseY + pauseR + labelAbovePx; // ここより下に置けば字の上端がボタンの下
  if (y <= above || y >= below) return out;
  const upFits = above >= r.top;
  const downFits = below <= r.bottom;
  const ny = upFits && (!downFits || y - above <= below - y) ? above : below;
  out.dy = Math.min(r.bottom, Math.max(r.top, ny)) - y;
  return out;
}

/**
 * 2 本の印の b を a からずらす（out に書いて返す。遠ければ 0）: separateMarker に、b が左右の縁なら LANDING_MARKER_SEP_SIDE_PX・上下の縁なら LANDING_MARKER_SEP_EDGE_PX を渡す。
 * ずらした点が右下の速力と兵装の HUD の角（keepLeft より右・keepTop より下。ui/marker-separation の avoidCorner と同じ矩形）に入るなら、a を挟んだ逆の側へ（縁の矩形に収める）
 */
export function separateLandingMarker(ax: number, ay: number, bx: number, by: number, r: MarkerRect, keepLeft: number, keepTop: number, out: MarkerShift): MarkerShift {
  const side = Math.abs(bx - r.left) < EDGE_EPS_PX || Math.abs(bx - r.right) < EDGE_EPS_PX;
  separateMarker(ax, ay, bx, by, r, side ? LANDING_MARKER_SEP_SIDE_PX : LANDING_MARKER_SEP_EDGE_PX, out);
  const nx = bx + out.dx;
  const ny = by + out.dy;
  if (!(nx > keepLeft && ny > keepTop)) return out;
  if (out.dx !== 0) out.dx = Math.min(r.right, Math.max(r.left, 2 * ax - nx)) - bx;
  if (out.dy !== 0) out.dy = Math.min(r.bottom, Math.max(r.top, 2 * ay - ny)) - by;
  return out;
}
