// Result のレーダーの 1 行（v0.8.0 S4。spec-v0800 §4.9・§3.2 D-R9、brief L31）: 「レーダー: 最初の接触 北西 2300 m（出撃直後） ・ 目で見えない間に撃った魚雷 2 本（命中 0）」。
// 材料（RadarResult）は systems/strait-result-part がレーダーの記録（最初の接触の掃引の秒・輝点・その時の自艇）と、発射の時に 3 行目が敵影なしだった魚雷の数え（systems/world-radar）から
// 終わりに 1 回作る（艦の正体・列の段階・AI・本当の位置は入れない＝brief L26）。レーダーのある任務（us_04）だけ鍵がある。Phaser・DOM を読まない（tests/radar-result が読む）。
import { RADAR_LINE_STEP_M } from '../config/strait-hud-config';
import { bearingJa } from '../core/briefing';

/** 最初の接触が出撃からこの秒の前なら「出撃直後」（最初の掃引は出撃の最初の固定ステップ＝約 0.02 秒。brief L31） */
export const RADAR_RESULT_SOON_S = 1;

/** Result のレーダーの材料（終わりに 1 回） */
export interface RadarResult {
  /** 夜の最初の接触の秒（NaN は接触なし）と、その時の自艇から一番近い輝点への位置 m */
  firstS: number;
  firstDx: number;
  firstDy: number;
  /** 狙える艦がある間に撃った魚雷のうち、発射の時に 3 行目が敵影なしだった本数と、そのうちの命中（不発を除く） */
  unseenShots: number;
  unseenHits: number;
}

/** 最初の接触の句（「最初の接触 北西 2300 m（出撃直後）」か「接触なし」） */
export function radarFirstContactJa(r: RadarResult): string {
  if (Number.isNaN(r.firstS)) return '接触なし';
  const dir = bearingJa((Math.atan2(r.firstDx, -r.firstDy) * 180) / Math.PI);
  const dist = Math.round(Math.hypot(r.firstDx, r.firstDy) / RADAR_LINE_STEP_M) * RADAR_LINE_STEP_M;
  return `最初の接触 ${dir} ${dist} m（${r.firstS < RADAR_RESULT_SOON_S ? '出撃直後' : `出撃 ${Math.round(r.firstS)} 秒`}）`;
}

/** Result のレーダーの 1 行 */
export function radarResultLineJa(r: RadarResult): string {
  const shots = r.unseenShots > 0 ? `${r.unseenShots} 本（命中 ${r.unseenHits}）` : '0 本';
  return `レーダー: ${radarFirstContactJa(r)} ・ 目で見えない間に撃った魚雷 ${shots}`;
}
