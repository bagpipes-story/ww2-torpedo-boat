// 敵の PT の隊の見た目と呼び名（v0.8.5 S2。us_07 の S ボート。spec-v0850 §4.4）: enemies.json の PT の記録（boat_ref・name_short_ja）と boats.json の boat_ref の燃料（fuel_type）から
// 絵の鍵・HUD の文の名・沈む時の言葉を 1 回だけ決める（world-enemies が PT の隊を作る時。setup には入れない＝setup の snapshot は変わらない）。
// 米PT の記録（boat_ref us_elco80・name_short_ja なし）は今のまま: 鍵 tex-pt-boat・名「米PT」・沈む時「ガソリンに引火」（jp_01・jp_04・jp_05 の文は 1 字も変わらない）。
import type { GameData } from './game-data';
// game-config（DOM）は引かない（node の tests から型検査ごと読める）。米PT の鍵は config/pt-config の写し
import { PT_BOAT_TEXTURE_KEY, PT_NAME_DEFAULT_JA, PT_SUNK_DEFAULT_JA, US_PT_BOAT_REF } from './pt-config';

/** S ボートの絵の鍵（v0.8.5 S2。assets/boat-art の paintSboatTexture。Boot が us_elco80 でない PT の記録の最初の任務の寸法から 1 回） */
export const SBOAT_TEXTURE_KEY = 'tex-sboat';
/** boat_ref → 絵の鍵（表に無い boat_ref は米PT の tex-pt-boat） */
export const PT_TEXTURE_KEY_BY_BOAT: Readonly<Record<string, string>> = { de_s100: SBOAT_TEXTURE_KEY };
/** 13mm・機銃で沈めた時の言葉（燃料ごと。表に無い燃料はガソリンの言葉＝config/pt-config の既定）: ガソリンは引火、ディーゼル（S ボート）は燃えにくいので「炎上」 */
export const PT_SUNK_BY_FUEL_JA: Readonly<Record<string, string>> = { gasoline: PT_SUNK_DEFAULT_JA, diesel: '炎上' };

/** PT の隊の見た目と呼び名 */
export interface PtLook {
  readonly texKey: string;
  readonly nameJa: string;
  readonly sunkJa: string;
  /** 記録に name_short_ja がある（HUD のテレメトリに名を足す。無い記録は今のテレメトリのまま） */
  readonly named: boolean;
}

/** 米PT の既定（data の無い tests・模擬） */
export const PT_LOOK_DEFAULT: PtLook = { texKey: PT_BOAT_TEXTURE_KEY, nameJa: PT_NAME_DEFAULT_JA, sunkJa: PT_SUNK_DEFAULT_JA, named: false };

type Rec = Record<string, unknown>;

/** enemies.json の PT の記録 enemyId の見た目と呼び名（記録が無ければ既定） */
export function ptLookOf(data: GameData, enemyId: string): PtLook {
  const rec = (data.enemies.enemies as readonly Rec[]).find((e) => e['id'] === enemyId);
  if (!rec) return PT_LOOK_DEFAULT;
  const ref = typeof rec['boat_ref'] === 'string' ? rec['boat_ref'] : US_PT_BOAT_REF;
  const boat = (data.boats.boats as readonly Rec[]).find((b) => b['id'] === ref);
  const fuel = boat && typeof boat['fuel_type'] === 'string' ? boat['fuel_type'] : '';
  const name = typeof rec['name_short_ja'] === 'string' ? rec['name_short_ja'] : '';
  return { texKey: PT_TEXTURE_KEY_BY_BOAT[ref] ?? PT_BOAT_TEXTURE_KEY, nameJa: name || PT_NAME_DEFAULT_JA, sunkJa: PT_SUNK_BY_FUEL_JA[fuel] ?? PT_SUNK_DEFAULT_JA, named: name !== '' };
}
