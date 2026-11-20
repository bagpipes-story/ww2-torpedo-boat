// Result の us_05 の鍵の材料（v0.8.2 S4。spec-v0820 §4.13 D-H5・§4.8 D-P2、lead の L42）: systems/mission-telemetry の buildMissionResult が終わりに 1 回だけ呼ぶ。報告の任務だけ recon の鍵が出る
// （ほかの任務の Result は同じ）。v0.8.1 の systems/anchor-result-part と同じ置き方（mission-result-extras は scenes/result-scene の型を読む＝Phaser と DOM を引く）。世界の形は構造の型で読む。
// 読むのは報告の段と秒・隊の艦の命中（hitsTaken）と沈み始め・艦種（kits）・列の通過の段階（去った＝GONE）・弾薬庫の誘爆の数・列の記録の id（setup.transit.column）だけ。
// shipKills（core/scoring の任意の入力。点は kill.points_by_enemy の戦艦・重巡だけ＝駆逐艦は 0）は沈み始めた列の艦の記録の id ごとの数。
import { BOW_ON_NOUN_BY_CLASS_JA } from '../config/strait-hud-config';
import { TRANSIT_GONE, transitCount, type ShipTransitState } from '../core/ship-transit';
import type { ReconState } from '../core/recon-report';
import type { ReconResult } from '../ui/recon-result';

/** 読む世界の部分（MissionWorld がそのまま満たす） */
export interface ReconResultWorld {
  readonly recon: { readonly state: ReconState; readonly plan: { readonly identifyClass: string; readonly relay: { readonly labelJa: string } } } | null;
  readonly destroyers: {
    readonly ships: readonly { readonly hitsTaken: number; readonly sinking: boolean }[];
    readonly destroyerCount: number;
    readonly kits: { readonly classes: readonly string[] | null };
    readonly transit: { readonly state: ShipTransitState } | null;
    readonly magazine: { readonly detonations: number } | null;
  } | null;
  readonly setup: { readonly transit?: { readonly column?: readonly { readonly enemyId: string }[] } };
}

/** 報告の任務だけ recon の鍵（無い任務は {}） */
export function reconResultPart(w: ReconResultWorld): { recon?: ReconResult } {
  const r = w.recon;
  const g = w.destroyers;
  if (!r || !g) return {};
  const st = r.state;
  const col = w.setup.transit && w.setup.transit.column ? w.setup.transit.column : [];
  const off = g.destroyerCount - col.length; // 列の 1 隻目の隊の添字（us_05 は護衛なし＝0）
  const cls = g.kits.classes;
  const hits = { battleship: 0, heavy_cruiser: 0, destroyer: 0 } as Record<string, number>;
  const sunk = { battleship: 0, heavy_cruiser: 0, destroyer: 0 } as Record<string, number>;
  const kills = new Map<string, number>();
  for (let i = 0; i < g.ships.length; i++) {
    const s = g.ships[i]!;
    const c = cls ? cls[i]! : 'destroyer';
    hits[c] = (hits[c] ?? 0) + s.hitsTaken;
    if (!s.sinking) continue;
    sunk[c] = (sunk[c] ?? 0) + 1;
    const id = col[i - off]?.enemyId;
    if (id) kills.set(id, (kills.get(id) ?? 0) + 1);
  }
  return {
    recon: {
      stage: st.stage, seenAtS: st.seenAtS, sentAtS: st.sentAtS, relayedAtS: st.relayedAtS, trackedS: st.trackedS,
      identifyJa: BOW_ON_NOUN_BY_CLASS_JA[r.plan.identifyClass] ?? r.plan.identifyClass, relayJa: r.plan.relay.labelJa,
      total: g.ships.length, bbHits: hits['battleship']!, caHits: hits['heavy_cruiser']!, ddHits: hits['destroyer']!, bbSunk: sunk['battleship']!, caSunk: sunk['heavy_cruiser']!, ddSunk: sunk['destroyer']!,
      detonations: g.magazine ? g.magazine.detonations : 0, gone: g.transit ? transitCount(g.transit.state, TRANSIT_GONE) : 0,
      shipKills: [...kills].map(([enemyId, count]) => ({ enemyId, count })),
    },
  };
}
