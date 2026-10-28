// 上中央の 2 行目のキャッシュのキーのうち、米PT・輸送隊・機関・水上機の 4 つ（v0.6.9 S0 で ui/mission-line の refresh から移した。式と順は v0.6.8 のまま）。
// 純粋な関数（Phaser・DOM を読まない）: そのフレームのモード・旗と、前回の米PT のキー・pt-line-clock の 2 つの値（merge・convoyEvent）から、
// mission-line が 1 個だけ持つ入れ物に書く（§7: 毎フレーム確保しない）。mission-line はモードを決めて pt-line-clock の shown を呼んだ後に呼ぶ（v0.6.8 と同じ時点）。
// tests/mission-line-keys が v0.6.8（main 2ad122b）の mission-line.ts:130-138 の写しと、既存のテレメトリの材料のすべてで比べる。
// v0.6.9 S6a: 揚陸（jp_04）の 2 つのキー（ui/landing-lines の landingKey・landingEventKey）を cKey の隣に足した。揚陸の無い任務はどちらも 0（上の 8 つの値は変わらない）。
import type { BoatTelemetry } from '../core/boat-motion';
import { convoyKey, convoyWaiting } from './convoy-lines';
import { engineKey, engineTagKey } from './engine-lines';
import { landingEventKey, landingKey } from './landing-lines';
import { planeKeyOf, planeModeOf } from './mission-line-air';
import { MISSION_CALL, MISSION_CONVOY_EVENT, MISSION_ENGINE_EVENT, MISSION_ENGINE_STATUS, MISSION_LANDING_EVENT, MISSION_PT, MISSION_PT_CONTACT, MISSION_PT_GUN_EVENT, MISSION_PT_PASS } from './mission-mode';
import { ptKey } from './pt-lines';

/** 4 つのキーと、文を選ぶモードの判定（米PT の 5 つ・機関の 3 つ・水上機の 3 つ） */
export interface LineKeys {
  /** 米PT の 5 つ（22〜26）のどれか。距離と方角はこのときだけ ptKey が求める */
  ptMode: boolean;
  pKey: number;
  /** 輸送隊（v0.6.4）。輸送隊の無い任務は 0 */
  cKey: number;
  /** 機関の 3 つ（28〜30。v0.6.5） */
  engineMode: boolean;
  eKey: number;
  /** 赤い線・結果・接触の行の末尾の札（0 なし・1 限界・2 不調） */
  eTag: number;
  /** 水上機の 3 つ（9〜11） */
  planeMode: boolean;
  planeKey: number;
  /** 揚陸（v0.6.9。jp_04）: 平常・呼びかけ・モード 36 の行のキー（landingKey）と、モード 35 の出来事の行のキー（landingEventKey。そのモードのときだけ）。揚陸の無い任務は 0 */
  lKey: number;
  leKey: number;
}

/** mission-line が 1 回だけ作る入れ物 */
export function createLineKeys(): LineKeys {
  return { ptMode: false, pKey: 0, cKey: 0, engineMode: false, eKey: 0, eTag: 0, planeMode: false, planeKey: 0, lKey: 0, leKey: 0 };
}

/** そのフレームの 4 つのキーを out に書いて返す。lastPtKey は前回組み直したときの米PT のキー、merge・convoyEvent は pt-line-clock の同じ名の値 */
export function composeLineKeys(out: LineKeys, t: BoatTelemetry, mode: number, flags: number, lastPtKey: number, merge: number, convoyEvent: number): LineKeys {
  const ptMode = mode >= MISSION_PT_PASS && mode <= MISSION_PT_GUN_EVENT; // 米PT の 5 つ（22〜26）。距離と方角はこのときだけ ptKey が求める
  out.ptMode = ptMode;
  out.pKey = ptMode ? ptKey(t, mode, flags, lastPtKey, merge) : 0;
  // 輸送隊（v0.6.4）: 浜までの刻みは平常の行（米PT が見えていない）と決着の前の呼びかけ（「大発の上陸を待て  浜まで N m」。レビュー ux-1）のときだけ求める。出来事の種類は出来事の行のときだけ
  out.cKey = convoyKey(t.convoy, (mode === MISSION_PT && !t.pt.sighted) || (mode === MISSION_CALL && convoyWaiting(t.convoy)), mode === MISSION_CONVOY_EVENT ? convoyEvent : 0);
  const engineMode = mode >= MISSION_ENGINE_EVENT && mode <= MISSION_ENGINE_STATUS; // 機関の 3 つ（28〜30。v0.6.5）
  out.engineMode = engineMode;
  out.eKey = engineMode ? engineKey(t, mode) : 0;
  out.eTag = mode === MISSION_PT_PASS || mode === MISSION_PT_CONTACT ? engineTagKey(t.engine) : 0; // 札は赤い線・結果・接触の行だけ（13mm の行と平常には付けない）
  const planeMode = planeModeOf(mode); // 水上機の 3 つ（9〜11）。キー（距離は接近中だけ 100 m 刻み）と文は ui/mission-line-air
  out.planeMode = planeMode;
  out.planeKey = planeKeyOf(t, planeMode);
  out.lKey = landingKey(t, mode); // 揚陸（v0.6.9）: 揚陸の無い任務は 0
  out.leKey = mode === MISSION_LANDING_EVENT && t.landing.enabled ? landingEventKey(t.landing) : 0;
  return out;
}
