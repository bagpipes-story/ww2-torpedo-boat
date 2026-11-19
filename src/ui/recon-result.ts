// 報告の任務（v0.8.2 S4。us_05「スリガオ海峡・最初の接触」）の Result の 2 行（spec-v0820 §4.13 D-H5、lead の L42）: 駆逐艦の任務の行（ui/result-body の魚雷の枝）のレーダーの行の後に 20 px・KPI の色で。
// 1 行目（報告）: 「報告: 出撃 170 秒に送った（無線） ・ 戦艦を確認 148 秒」／「報告: 無線が壊れ、出撃 210 秒に隣の分隊で中継 ・ 戦艦を確認 148 秒」／
//   「報告できなかった（無線が壊れ、中継できず） ・ 戦艦を確認 148 秒」／「報告できなかった（追尾 12 秒） ・ 戦艦を確認 148 秒」／「報告できなかった（戦艦を見ていない）」。
// 2 行目（艦隊）: 「艦隊 7 隻: 戦艦に命中 3（誘爆で轟沈 1） ・ 重巡 0 ・ 駆逐艦 1 → 海峡へ 6 ・ 戦艦・重巡への魚雷は通算に入れない」（命中は艦種ごとの不発でない本数・沈めた艦は括弧・
//   海峡へ＝東の縁の外へ去った隻数）。spec の形（「弾薬庫の誘爆で 1 隻轟沈」「通算の命中率に数えない」）は 20 px で 1,349 px＝行の幅 1,232 を越えるので spec §14 の短い方に。
//   それでも越える形（沈めた艦が 2 つ以上）は尾（通算の注）を落とす（ui/evac-text の jaWidthPx の見積もり＝tests/recon-result）。材料は systems/recon-result-part（終わりに 1 回）。
// 列の 1 行（ui/strait-result の往路・復路）は片道の列では出さない（systems/strait-result-part）。Phaser・DOM を読まない。
import { RECON_PENDING, RECON_RELAYED, RECON_SENT, RECON_TRACKING } from '../core/recon-report';
import { jaWidthPx } from './evac-text';

/** Result の材料（終わりに 1 回）: 報告の段と秒・確かめる艦種の名詞・中継の輪の名、艦隊の隻数・艦種ごとの命中と撃沈・誘爆・海峡へ去った隻数、得点の魚雷で沈めた艦（core/scoring の shipKills） */
export interface ReconResult {
  stage: number; seenAtS: number; sentAtS: number; relayedAtS: number; trackedS: number; identifyJa: string; relayJa: string;
  total: number; bbHits: number; caHits: number; ddHits: number; bbSunk: number; caSunk: number; ddSunk: number; detonations: number; gone: number;
  shipKills: { enemyId: string; count: number }[];
}

/** 通算の注（2 行目の尾。行の幅に収まらなければ落とす＝ui/result-body の縮めに頼らない） */
export const RECON_RESULT_KPI_TAIL_JA = ' ・ 戦艦・重巡への魚雷は通算に入れない';
/** 2 行目の字の大きさと幅の上限（20 px。論理幅 1280 の Result の行の幅 1232 px＝result-scene の縮めの境。tests/recon-result） */
export const RECON_RESULT_PX = 20;
export const RECON_RESULT_MAX_PX = 1232;

const sec = (s: number): number => Math.round(s);

/** 1 行目（報告） */
export function reconReportLineJa(r: ReconResult): string {
  const seen = Number.isNaN(r.seenAtS) ? '' : ` ・ ${r.identifyJa}を確認 ${sec(r.seenAtS)} 秒`;
  if (r.stage === RECON_SENT) return `報告: 出撃 ${sec(r.sentAtS)} 秒に送った（無線）${seen}`;
  if (r.stage === RECON_RELAYED) return `報告: 無線が壊れ、出撃 ${sec(r.relayedAtS)} 秒に${r.relayJa}で中継${seen}`;
  if (r.stage === RECON_PENDING) return `報告できなかった（無線が壊れ、中継できず）${seen}`;
  if (r.stage === RECON_TRACKING) return `報告できなかった（追尾 ${Math.floor(r.trackedS)} 秒）${seen}`;
  return `報告できなかった（${r.identifyJa}を見ていない）`;
}

/** 2 行目（艦隊）。誘爆で沈めた戦艦は「誘爆で轟沈 N」、魚雷の本数で沈めた艦は「撃沈」 */
export function reconFleetLineJa(r: ReconResult): string {
  const bbByHits = r.bbSunk - r.detonations;
  const bb = `戦艦に命中 ${r.bbHits}${r.detonations > 0 ? `（誘爆で轟沈 ${r.detonations}${bbByHits > 0 ? `・撃沈 ${bbByHits}` : ''}）` : r.bbSunk > 0 ? `（撃沈 ${r.bbSunk}）` : ''}`;
  const ca = `重巡 ${r.caHits}${r.caSunk > 0 ? '（撃沈）' : ''}`;
  const dd = `駆逐艦 ${r.ddHits}${r.ddSunk > 0 ? `（撃沈 ${r.ddSunk}）` : ''}`;
  const head = `艦隊 ${r.total} 隻: ${bb} ・ ${ca} ・ ${dd} → 海峡へ ${r.gone}`;
  return jaWidthPx(head + RECON_RESULT_KPI_TAIL_JA, RECON_RESULT_PX) > RECON_RESULT_MAX_PX ? head : head + RECON_RESULT_KPI_TAIL_JA;
}
