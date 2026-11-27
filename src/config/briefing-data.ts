// Briefing の文の読み出し（v0.4.0。v0.6.3 で mission-data から切り出し。中身はそのまま）: missions_seed の文と遊べる世界の敵・危険・月、敵と危険の名前。
// mission-data と同じく data を直接読み、game-data の関数は呼ばない（値の循環を作らない）。mission-data からは再 export しない（循環になる）。
import type { GameData } from './game-data';
import { getPrototypeMission } from './mission-data';
import { readHardText } from './mission-hard-data';
import { shortLabelJa, type BriefingText } from '../core/briefing';

export interface BriefingRecord extends BriefingText {
  id: string;
  titleJa: string;
  date: string;
  place: string;
  /** 表示用の史実メモ（人物名なし。CLAUDE.md §11） */
  noteJa: string;
}

/**
 * Briefing に出す文（missions_seed）と遊べる世界の敵・危険・月。文が無ければ例外。hard なら駆逐艦の隻数を hard block のぶん増やして出す（v0.4.5）。
 * v0.6.6: 米PT の隊は哨戒線の本数ぶん（jp_01 のハードで ×3）、hard block に objective_ja・success_ja・note_ja があればハードではその文
 */
export function getBriefingRecord(data: GameData, missionId: string, hard: boolean = false): BriefingRecord {
  const m = data.missionsSeed.missions.find((x) => x.id === missionId) as Record<string, unknown> | undefined;
  if (!m) throw new Error(`missions_seed.json に ${missionId} が無い`);
  const text = (key: string): string => {
    const v = m[key];
    if (typeof v !== 'string' || v.length === 0) throw new Error(`${missionId}.${key} が無い（Briefing、docs/02 §4）`);
    return v;
  };
  const proto = m['v0_1_prototype'] as Record<string, unknown> | undefined;
  const enemies = proto?.['enemies'];
  if (!Array.isArray(enemies) || !enemies.every((e) => typeof e === 'string')) throw new Error(`${missionId}.v0_1_prototype.enemies が文字列の配列でない（Briefing）`);
  const mission = getPrototypeMission(data, missionId, hard);
  const ht = hard ? readHardText(proto?.['hard'], missionId) : null;
  const moonLabel = m['moon_label_ja']; // 月の行の頭の差し替え（v0.6.7。任意。無い任務では鍵ごと出ない＝他の任務の Briefing は同じ）
  if (moonLabel !== undefined && (typeof moonLabel !== 'string' || moonLabel.trim() === '')) throw new Error(`${missionId}.moon_label_ja は空でない文字列（Briefing の月の行）`);
  // 駆逐艦の任務は隻数ぶん id を並べる（ハードで 2 隻なら「駆逐艦 ×2」）、米PT の任務は線の本数ぶん（v0.6.6）。大発の任務は enemies のまま
  const enemyIds = mission.enemyStarts.length > 1 ? mission.enemyStarts.map(() => mission.enemyId) : mission.ptBoats ? mission.ptBoats.legs_m.map(() => mission.enemyId) : [...(enemies as string[])];
  // 列の通過のハードの足す艦（v0.8.0 S4。us_04 の「駆逐艦 ×5」。hard.extra_transit_ships は Boot の V-T1 で 1 以上の整数。無い任務は 0＝今のまま）
  const extra = hard && proto?.['transit'] !== undefined ? (proto['hard'] as Record<string, unknown> | undefined)?.['extra_transit_ships'] : undefined;
  for (let i = 0; i < (typeof extra === 'number' ? extra : 0); i++) enemyIds.push(mission.enemyId);
  // 片道の列のハードの足す艦（v0.8.2 S4。us_05 の 8 隻目の見張りの駆逐艦＝「駆逐艦 ×5」。hard.extra_column は Boot の V-C1 で列の記録の形。無い任務は鍵が無い＝今のまま）
  const xc = hard && (proto?.['transit'] as Record<string, unknown> | undefined)?.['column'] !== undefined ? (proto!['hard'] as Record<string, unknown> | undefined)?.['extra_column'] : undefined;
  if (Array.isArray(xc)) for (const x of xc as Record<string, unknown>[]) if (typeof x['enemy_id'] === 'string') enemyIds.push(x['enemy_id']);
  if (mission.transport) enemyIds.push(mission.transport.enemyId); // 輸送船（v0.4.7）は隊の後ろに
  const pk = hard && proto?.['anchored'] !== undefined ? (proto['hard'] as Record<string, unknown> | undefined) : undefined; // ハードの駆潜艇（v0.8.1 S4。us_06。V-A5 で 1〜4 隻）は輸送船の後ろに
  if (pk && Array.isArray(pk['extra_pickets']) && typeof pk['picket_enemy_id'] === 'string') for (const _ of pk['extra_pickets']) enemyIds.push(pk['picket_enemy_id']);
  return {
    id: missionId,
    titleJa: text('title_ja'),
    date: text('date'),
    place: text('place'),
    objective: ht ? ht.objective : text('objective'),
    success: ht ? ht.success : text('success'),
    noteJa: ht ? ht.note : text('briefing_note_ja'),
    moon: mission.moon,
    enemyIds,
    hazardIds: mission.hazards,
    ...(typeof moonLabel === 'string' ? { moonLabelJa: moonLabel } : {}),
  };
}

/**
 * 達成の条件の文（v0.9.0 IP2。未達の Result の「達成の条件: …」）: Briefing の「成功」の文（ハードの文があればそれ）。「成功」が達成の規則（core/store の sortieAchieved＝
 * 目的を果たして帰投）と食い違う任務だけ、missions_seed の任意の achieve_ja（us_02・jp_06: 「成功」は帰投だけを言うが、達成は撃沈して帰投）。任務が無ければ ''
 */
export function missionAchieveJa(data: GameData, missionId: string, hard: boolean = false): string {
  const m = data.missionsSeed.missions.find((x) => x.id === missionId) as Record<string, unknown> | undefined;
  if (!m) return '';
  const a = m['achieve_ja'];
  if (a !== undefined) {
    if (typeof a !== 'string' || a.trim() === '') throw new Error(`${missionId}.achieve_ja は空でない文字列（Result の達成の条件）`);
    return a;
  }
  const ht = hard ? readHardText((m['v0_1_prototype'] as Record<string, unknown> | undefined)?.['hard'], missionId) : null;
  const s = m['success'];
  return ht ? ht.success : typeof s === 'string' ? s : '';
}

/** 敵の名前（enemies.json の name_ja から資料の注記「（…）」を落とす） */
export function enemyNameJa(data: GameData, id: string): string {
  const e = (data.enemies.enemies as readonly Record<string, unknown>[]).find((x) => x['id'] === id);
  const name = e?.['name_ja'];
  if (typeof name !== 'string') throw new Error(`enemies.json の ${id}.name_ja が無い`);
  return shortLabelJa(name);
}

/** 危険の名前（risk_events.json の label_ja から資料の注記を落とす） */
export function riskLabelJa(data: GameData, id: string): string {
  const e = (data.riskEvents.events as readonly Record<string, unknown>[]).find((x) => x['id'] === id);
  const label = e?.['label_ja'];
  if (typeof label !== 'string') throw new Error(`risk_events.json に ${id}（label_ja）が無い`);
  return shortLabelJa(label);
}
