// 戦艦の弾薬庫（v0.8.2。us_05「スリガオ海峡・最初の接触」の山城・扶桑。ユーザーの決め U1・spec-v0820 §4.4 D-G1〜D-G4）の記録の読み出しと起動時の検査 V-M1〜V-M3:
// enemies.json の記録の magazine（{ on_hits, chance, source }）＝魚雷の命中（不発でない）で艦の hitsTaken が on_hits のどれかになり、まだ沈む本数に届かないとき、
// その chance で弾薬庫が誘爆して轟沈する。規則は記録ごと（v0.10 の殴り込みが同じ記録を使える・大和型の記録には置かない＝ユーザーの例外。V-M3）。
// ここは数を読むだけ（確率の引きは S1 の core/magazine・乱数 seed+33 と世界の配線は S2 の systems/ship-magazine）。読むのは config/column-mission-data（列の艦の kits）と Boot。
// ?debug&boom（MagazineSetupOptions.magazineBoom。URL の配線は S2）は確率を 1 にするだけ（規則の無い記録は null のまま＝今の任務は変わらない）。
import type { GameData } from './game-data';
import { isEnemyAiDataRecord } from '../core/ship-ai';

/** V-M1: magazine の鍵（ちょうどこの 3 つ） */
export const MAGAZINE_KEYS = ['on_hits', 'chance', 'source'] as const;
/** V-M3: magazine を置ける艦種（記録の ship_class。大和型を足す時はその記録に置かない＝ユーザーの例外。巡洋艦に広げるならこの検査を変える＝ユーザーに聞く） */
export const MAGAZINE_SHIP_CLASS = 'battleship';

/** 弾薬庫の規則（ColumnKit.magazine）: on_hits[k] 本目の命中のとき chance[k] で誘爆（on_hits は昇順・どれも沈む本数未満） */
export interface MagazineRule {
  onHits: number[];
  chance: number[];
}

/** 組み立ての上書き（SetupOptions の 1 鍵）: magazineBoom は確率を 1 に（?debug&boom。演出を確かめる夜。配線は v0.8.2 S2） */
export interface MagazineSetupOptions {
  magazineBoom?: boolean;
}

type Rec = Record<string, unknown>;
const isObj = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);

/** 記録 enemyId の弾薬庫の規則（magazine の無い記録は null）。壊れていれば「enemies.json の <id>.magazine: …（V-Mn・spec-v0820 §4.4）」 */
export function magazineRuleOf(data: GameData, enemyId: string, o: MagazineSetupOptions = {}): MagazineRule | null {
  const r = (data.enemies.enemies as readonly Rec[]).find((e) => e['id'] === enemyId);
  if (!r) throw new Error(`enemies.json に ${enemyId} が無い`);
  const raw = r['magazine'];
  if (raw === undefined) return null;
  const bad = (v: string, msg: string): never => {
    throw new Error(`enemies.json の ${enemyId}.magazine: ${msg}（${v}・spec-v0820 §4.4）`);
  };
  // V-M1 形: 鍵の閉じた集合・同じ長さ・on_hits は 1 以上の整数の昇順で沈む本数未満・chance は 0 以上 1 未満・出典
  if (!isObj(raw)) return bad('V-M1', 'object でない');
  const keys = Object.keys(raw);
  if (keys.length !== MAGAZINE_KEYS.length || !MAGAZINE_KEYS.every((k) => k in raw)) bad('V-M1', `鍵はちょうど ${MAGAZINE_KEYS.join('・')}（${keys.join('・')}）`);
  const onHits = raw['on_hits'];
  const chance = raw['chance'];
  if (!Array.isArray(onHits) || !Array.isArray(chance) || onHits.length === 0 || onHits.length !== chance.length) return bad('V-M1', 'on_hits と chance は同じ長さの空でない配列');
  const sink = r['torpedo_hits_to_sink'];
  onHits.forEach((h, k) => {
    if (!(typeof h === 'number' && Number.isInteger(h) && h >= 1)) bad('V-M1', `on_hits[${k}]（${String(h)}）は 1 以上の整数`);
    if (k > 0 && !((h as number) > (onHits[k - 1] as number))) bad('V-M1', `on_hits は昇順で重ならない（${onHits.join('・')}）`);
    if (!(typeof sink === 'number' && (h as number) < sink)) bad('V-M1', `on_hits[${k}]（${String(h)}）は torpedo_hits_to_sink（${String(sink)}）未満（沈む命中では引かない）`);
  });
  chance.forEach((c, k) => {
    if (!(typeof c === 'number' && Number.isFinite(c) && c >= 0 && c < 1)) bad('V-M1', `chance[${k}]（${String(c)}）は 0 以上 1 未満`);
  });
  if (!(typeof raw['source'] === 'string' && raw['source'].trim() !== '')) bad('V-M1', 'source は空でない文字列');
  // V-M2 AI の記録（列の艦として動く記録）だけ・V-M3 艦種は戦艦だけ
  if (!isEnemyAiDataRecord(r)) bad('V-M2', 'magazine は AI の記録（speed/turn_rate/accel/detection/evasion/ram/patrol を持つ艦）だけ');
  if (r['ship_class'] !== MAGAZINE_SHIP_CLASS) bad('V-M3', `magazine は ship_class が ${MAGAZINE_SHIP_CLASS} の記録だけ（${String(r['ship_class'] ?? 'なし')}。大和型には置かない）`);
  return { onHits: (onHits as number[]).slice(), chance: o.magazineBoom ? chance.map(() => 1) : (chance as number[]).slice() };
}

/** Boot の検査: enemies.json の magazine を持つ記録をすべて 1 回読む（壊れていれば Boot で止まる）。持つ記録の id を返す（us_05 の戦艦の 1 つ） */
export function validateMagazineRecords(data: GameData): string[] {
  const ids: string[] = [];
  for (const e of data.enemies.enemies as readonly Rec[]) {
    const id = e['id'];
    if (typeof id !== 'string' || e['magazine'] === undefined) continue;
    magazineRuleOf(data, id);
    ids.push(id);
  }
  return ids;
}
