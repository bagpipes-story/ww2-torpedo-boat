// 緑の端の印「レーダー N m」の輝点の選び方と置き方の手直し（v0.8.0 S4。spec-v0800 §4.9・D-R10、brief L27）。純粋な関数（Phaser・DOM を読まない＝tests/radar-marker が読む）。
// 選ぶのは画面の外で、目の届く距離より遠い（d² > 視程²）一番近い輝点だけ（目の内の輝点は赤い「敵 N m」の役＝印を 2 つ出さない。目の絞りはここ＝UI の層。レーダーのテレメトリに視程は無い）。
// 赤い印の艦（目で見えている最寄りの艦＝t.enemySighted の t.enemyDx・Dy）の今の位置の近く（sameM の内）の輝点も除く（掃引の時の古い輝点がまだ目の外に残る同じ艦）。
// 画面の内かは ui/edge-marker と同じ写し（カメラの中心は自艇から進行方向に見越しの m 先・ズーム）と ui/edge-marker-screen の markerOnScreen。§7: 確保しない（out に書く）。
import type { RadarTelemetry } from '../core/boat-telemetry';
import { degToRad } from '../core/units';
import { markerOnScreen } from './edge-marker-screen';
import { EDGE_EPS_PX, type MarkerRect, type MarkerShift } from './marker-separation';

/** 画面の写し（ui/edge-marker の refresh と同じ値: 論理画面の中心・上の余白・左右と下の余白・カメラの見越し m） */
export interface RadarPickScreen {
  readonly cx: number;
  readonly cy: number;
  readonly topMargin: number;
  readonly sideMargin: number;
  readonly lookAheadM: number;
}

/** 選んだ輝点の自艇からの位置 m と距離の 2 乗（無ければ dx は NaN） */
export interface RadarPick {
  dx: number;
  dy: number;
  d2: number;
}

/**
 * 今の輝点（0〜contacts − 1）のうち、画面の外で目の届く距離より遠く、目で見えている最寄りの艦（seenDx・seenDy。見えていなければ NaN）から sameM より離れた、
 * 今の自艇から一番近いもの（距離の 2 乗で比べる）を out に書いて返す。eyeRange2 は自艇の視程の 2 乗（t.strait.eyeRange2）、headingDeg・zoom は自艇の針路とカメラのズーム
 */
export function pickRadarEdgeBlip(
  r: RadarTelemetry, eyeRange2: number, seenDx: number, seenDy: number, sameM: number, headingDeg: number, zoom: number, v: RadarPickScreen, out: RadarPick,
): RadarPick {
  out.dx = NaN;
  out.dy = NaN;
  out.d2 = Infinity;
  if (!r.enabled) return out;
  const h = degToRad(headingDeg);
  const ox = Math.sin(h) * v.lookAheadM;
  const oy = Math.cos(h) * v.lookAheadM;
  const same2 = sameM * sameM;
  for (let k = 0; k < r.contacts && k < r.blips.length; k++) {
    const b = r.blips[k]!;
    const dx = b.x - r.boatX;
    const dy = b.y - r.boatY;
    const d2 = dx * dx + dy * dy;
    if (!(d2 > eyeRange2) || !(d2 < out.d2)) continue;
    if ((dx - seenDx) * (dx - seenDx) + (dy - seenDy) * (dy - seenDy) <= same2) continue; // 赤い印の艦の古い輝点（見えていなければ NaN で比べは偽）
    if (markerOnScreen((dx - ox) * zoom, (dy + oy) * zoom, v.cx, v.cy, v.topMargin, v.sideMargin)) continue;
    out.dx = dx;
    out.dy = dy;
    out.d2 = d2;
  }
  return out;
}

/**
 * 右の縁に止まった印のずれ（brief L27: ラベル「レーダー 4000 m」は今の印の半幅より広いので、右の縁なら extraPx だけ左へ＝ラベルが右下の兵装のパネルに届かない）。
 * 縁でなければ 0。out に書いて返す（dy はいつも 0）
 */
export function radarRightEdgeShift(x: number, r: MarkerRect, extraPx: number, out: MarkerShift): MarkerShift {
  out.dx = Math.abs(x - r.right) < EDGE_EPS_PX ? -extraPx : 0;
  out.dy = 0;
  return out;
}
