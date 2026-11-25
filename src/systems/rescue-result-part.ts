// Result の us_07 の鍵の材料（v0.8.5 S2。spec-v0850 §8.3 の数）: systems/mission-telemetry の buildMissionResult が終わりに 1 回だけ（世界の finish の後）呼ぶ。救助の任務だけ rescue の鍵が出る
// （ほかの任務の Result は同じ）。v0.8.2 の systems/recon-result-part と同じ置き方。世界の形は構造の型で読む。点（core/scoring の rescued）は result-scene が delivered から渡す。本文の行は S4。
import type { RescueResult } from '../core/rescue-telemetry';
import { sboatWaveAppeared, type SboatWaveState } from '../core/sboat-wave';
import type { WorldRescue } from './world-rescue';

/** 読む世界の部分（MissionWorld がそのまま満たす） */
export interface RescueResultWorld {
  readonly rescue: WorldRescue | null;
  readonly pts: { readonly section: { readonly boats: readonly unknown[] }; readonly wave?: SboatWaveState | null } | null;
  readonly shoreGuns: { readonly shoreShots: number; readonly shoreHits: number; readonly seaShots?: number } | null;
}

/** 救助の任務だけ rescue の鍵（無い任務は {}） */
export function rescueResultPart(w: RescueResultWorld): { rescue?: RescueResult } {
  const r = w.rescue;
  if (!r) return {};
  const st = r.state;
  let total = 0;
  for (const g of r.rules.groups) total += g.count;
  let onWater = 0;
  for (let i = 0; i < st.n; i++) onWater += st.left[i]!;
  const m = r.mines;
  const wv = w.pts ? w.pts.wave ?? null : null; // 第二波（v0.8.5 IP2）: 出なければ隻数に入れない
  return {
    rescue: {
      total, objective: r.rules.objectiveDelivered, delivered: st.delivered, deliveredAtReturn: st.deliveredAtReturn, lostShell: st.lostShell, byOthers: st.byOthers, lostSunk: st.lostSunk, aboard: st.aboard, onWater,
      minesPlaced: m ? m.placed : 0, minesSeen: m ? m.seen : 0, minesBlown: m ? m.blown : 0,
      sboats: w.pts ? (wv ? sboatWaveAppeared(wv) : w.pts.section.boats.length) : 0, sboatRetreated: r.cover ? r.cover.count : 0,
      batteryShots: w.shoreGuns ? w.shoreGuns.shoreShots : 0, batteryHits: w.shoreGuns ? w.shoreGuns.shoreHits : 0, fitchJa: r.rules.fitch.labelJa,
      sboatWave2: wv && wv.spawned ? wv.n : 0, batterySeaShots: w.shoreGuns ? w.shoreGuns.seaShots ?? 0 : 0,
    },
  };
}
