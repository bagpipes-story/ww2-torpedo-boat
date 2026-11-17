// Result の us_06 の鍵の材料（v0.8.1 S4。spec-v0810 §3.7 D-O4、lead の L63。ui/anchor-result の 1 行）: systems/mission-telemetry の buildMissionResult が終わりに 1 回だけ呼ぶ。
// 止まった艦の任務だけ anchor の鍵が出る（ほかの任務の Result は同じ）。v0.8.0 の systems/strait-result-part と同じ置き方（systems/mission-result-extras は scenes/result-scene の型を
// 読む＝Phaser と DOM を引くので、tests から読めるようにここに分けた）。世界の形は構造の型で読む（tests の小さな世界から作れる）。
import type { GameData } from '../config/game-data';
import type { AnchorState } from '../core/anchored-ship';
import { anchorShipNameJa, type AnchorResult } from '../ui/anchor-result';
import type { AnchorLog } from './anchor-telemetry';

/** 読む世界の部分（MissionWorld がそのまま満たす）: 隊の艦の沈み始め・止まった艦の段と記録・隊の先頭の艦の記録の id */
export interface AnchorResultWorld {
  readonly destroyers: { readonly ships: readonly { readonly sinking: boolean }[]; readonly anchors: { readonly state: AnchorState; readonly log: AnchorLog } | null } | null;
  readonly setup: { readonly mission: { readonly enemyId: string } };
}

/**
 * 止まった艦の任務だけ anchor の鍵: 隊の先頭の艦（卯月）の名（enemies.json の name_ja）・撃沈・動き出した世界の秒と気づいた理由、止まった艦への魚雷とその命中・最寄りの艦に対して
 * 背に岸が効いた秒（systems/anchor-telemetry の記録）。無い任務は {}
 */
export function anchorResultPart(w: AnchorResultWorld, data: GameData): { anchor?: AnchorResult } {
  const g = w.destroyers;
  const a = g ? g.anchors : null;
  if (!g || !a) return {};
  const rec = (data.enemies.enemies as readonly Record<string, unknown>[]).find((x) => x['id'] === w.setup.mission.enemyId);
  const name = typeof rec?.['name_ja'] === 'string' ? anchorShipNameJa(rec['name_ja']) : '駆逐艦';
  return { anchor: { nameJa: name, sunk: g.ships[0]!.sinking, underwayS: a.log.underwayAtS[0]!, reason: a.state.reason[0]!, heldShots: a.log.heldShots, heldHits: a.log.heldHits, backdropS: a.log.backdropS } };
}
