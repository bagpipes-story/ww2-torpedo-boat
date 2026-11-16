// 海峡の夜の HUD の材料（v0.8.0 S4。spec-v0800 §4.9・brief L27・L28）: createTelemetry で 1 回作り（initStraitTelemetry）、毎フレーム refreshTelemetry の中で 1 回だけ書く（§7: 確保しない）。
// - 視程の 2 乗（世界の visRange2 の写し）: 緑の端の印（ui/radar-marker）が目で見える輝点を除く（目で見える艦は赤い「敵 N m」の役＝印を 2 つ出さない）。視程はレーダーのテレメトリに入れない（tests/radar-neutral）。
// - 衝突の危険: 目で見えている艦だけ（out でなく d² ≤ 視程²＝systems/mission-telemetry の setSighted と同じ規則）で、艦首が自艇へ半角の内・距離の内（core/strait-geometry の bowOnRisk。
//   2 乗の距離と内積だけ＝atan2 なし）。艦の添字のビットと一番近い艦までの m（平方根はビットがある時だけ 1 本）。1 回の接近で 1 回の文にするのは ui/strait-line-clock（ビットが立った時）。
// 列の通過もレーダーも無い任務は enabled false のまま何もしない（ほかの任務の毎フレームの仕事は増えない）。世界・艦・AI には何も書かない（読むだけ）。
import { BOW_ON_HALF_ANGLE_DEG, BOW_ON_RANGE_M } from '../config/strait-hud-config';
import type { StraitTelemetry } from '../core/boat-telemetry';
import { bowOnCos2, bowOnRisk } from '../core/strait-geometry';

/** 読む世界の部分（MissionWorld がそのまま満たす） */
export interface StraitTelemetryWorld {
  readonly visRange2: number;
  readonly boat: { readonly state: { readonly x: number; readonly y: number } };
  readonly destroyers: { readonly transit: object | null; readonly ships: readonly { readonly out: boolean; readonly state: { readonly x: number; readonly y: number; readonly headingDeg: number } }[] } | null;
  readonly radar: object | null;
}

/** 衝突の危険の距離の 2 乗と半角の cos の 2 乗（起動時に 1 回） */
const BOW_RANGE2 = BOW_ON_RANGE_M * BOW_ON_RANGE_M;
const BOW_COS2 = bowOnCos2(BOW_ON_HALF_ANGLE_DEG);
/** ビットで持てる艦の数（隊は 6 隻まで＝列 6 ＋ 護衛。31 ビットの内） */
const BOW_MAX_SHIPS = 30;

/** 出発時の strait（列の通過かレーダーのある任務だけ enabled） */
export function initStraitTelemetry(w: StraitTelemetryWorld): StraitTelemetry {
  const t: StraitTelemetry = { enabled: (w.destroyers !== null && w.destroyers.transit !== null) || w.radar !== null, eyeRange2: w.visRange2, bowOnMask: 0, bowOnM: NaN };
  refreshStraitTelemetry(t, w);
  return t;
}

/** 毎フレーム 1 回（無い任務は何もしない） */
export function refreshStraitTelemetry(t: StraitTelemetry, w: StraitTelemetryWorld): void {
  if (!t.enabled) return;
  const r2 = w.visRange2;
  t.eyeRange2 = r2;
  const b = w.boat.state;
  const g = w.destroyers;
  let mask = 0;
  let best = Infinity;
  if (g) {
    const ships = g.ships;
    for (let i = 0; i < ships.length && i < BOW_MAX_SHIPS; i++) {
      const d = ships[i]!;
      if (d.out) continue;
      const s = d.state;
      const dx = s.x - b.x;
      const dy = s.y - b.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2 || !bowOnRisk(s.x, s.y, s.headingDeg, b.x, b.y, BOW_RANGE2, BOW_COS2)) continue;
      mask |= 1 << i;
      if (d2 < best) best = d2;
    }
  }
  t.bowOnMask = mask;
  t.bowOnM = mask !== 0 ? Math.sqrt(best) : NaN;
}
