// 機関の不調（v0.6.5。jp_05。docs/02 §6.7・§6.8、spec-v065 §D）の文: 2 行目のモード 28〜30（過熱の出来事・限界（全速の帯）・機関の状態）とそのキー、
// 米PT の行（赤い線・航過と連射の結果・接触）の末尾の札「 ・ 機関 限界／不調」、右下の熱の帯の字・色・幅の刻み（ui/engine-hud が変わったときだけ書く）、Result の 1 行。
// Phaser も DOM を読む config も使わない（tests から型検査ごと読める）。「巡航以下」は右下の速力の段の字（停止／静音／巡航／全速）と同じ言葉。
// 熱の値そのものは文に出さない（キーは段と不調の残りの秒の整数だけ＝熱が少し動いても組み直さない）。回復の行は出さない（右下の字が「機関 過熱」に戻り、速さが戻る）。
import {
  ENGINE_GAUGE_STEPS,
  ENGINE_TEXT_FINAL,
  ENGINE_TEXT_OK,
  ENGINE_TEXT_WARN,
  ENGINE_TINT_FINAL,
  ENGINE_TINT_OK,
  ENGINE_TINT_WARN,
} from '../config/engine-config';
import { HUD_COLOR_STRONG, HUD_COLOR_WARN } from '../config/hud-text-config';
import type { BoatTelemetry } from '../core/boat-motion';
import { ENGINE_FINAL, ENGINE_LIMP, ENGINE_OK, ENGINE_WARN, type EngineStage, type EngineTelemetry } from '../core/engine-trouble';
import type { EngineResult } from './result-types';
import type { HudLine } from './hud-lines';
import { MISSION_ENGINE_EVENT, MISSION_ENGINE_FINAL, MISSION_ENGINE_STATUS } from './mission-mode';

/** 段と残りの秒の整数を 1 つの数に詰める（下 2 ビットが段、その上が不調の残りの秒の整数） */
const K_LEFT = 2;
const STAGE_MASK = 3;

/** 不調の残りの秒の整数（切り上げ。不調の始まりで 8、終わりの直前で 1。不調でなければ 0。丸めの 8.000…1 を 9 と出さない） */
export function engineLimpLeftN(e: EngineTelemetry): number {
  return e.on && e.stage === ENGINE_LIMP ? Math.max(1, Math.ceil(e.limpLeftS - 1e-6)) : 0;
}

/** 段 | 残りの秒の整数 << 2（右下の字のキー・2 行目の機関の状態のキー） */
export function engineStageKey(e: EngineTelemetry): number {
  return (e.on ? e.stage : ENGINE_OK) | (engineLimpLeftN(e) << K_LEFT);
}

/** 2 行目のキー（モード 28〜30。ほかのモードは 0）: 過熱の出来事 1・限界（全速の帯）2・機関の状態は段 | 不調の残りの秒の整数 << 2（段 2 か 3 なので 1・2 と重ならない） */
export function engineKey(t: BoatTelemetry, mode: number): number {
  if (mode === MISSION_ENGINE_EVENT) return 1;
  if (mode === MISSION_ENGINE_FINAL) return 2;
  return mode === MISSION_ENGINE_STATUS ? engineStageKey(t.engine) : 0;
}

const EVENT_LINE: Readonly<HudLine> = { text: '機関 過熱 ・ 全速を続けると不調（巡航以下で冷える）', color: HUD_COLOR_WARN };
const FINAL_LINE: Readonly<HudLine> = { text: '機関 限界！ 巡航以下に落とせ（このままだと不調）', color: HUD_COLOR_WARN };
const COOLING_LINE: Readonly<HudLine> = { text: '機関 限界 ・ 巡航以下で冷やしている', color: HUD_COLOR_STRONG };

/** 2 行目の文と色（key は同じフレームの engineKey。不調の上限の kt は艇の静音の上限＝米PT のテレメトリの silentMaxKt。機関の不調は米PT の任務だけ） */
export function engineLine(t: BoatTelemetry, mode: number, key: number): Readonly<HudLine> {
  if (mode === MISSION_ENGINE_EVENT) return EVENT_LINE;
  if (mode === MISSION_ENGINE_FINAL) return FINAL_LINE;
  if ((key & STAGE_MASK) === ENGINE_LIMP) return { text: `機関 不調 ・ ${t.pt.silentMaxKt} kt まで（あと ${key >> K_LEFT} 秒）`, color: HUD_COLOR_WARN };
  return COOLING_LINE;
}

/** 米PT の行の末尾の札のキー（spec §D.1・R3）: 0 なし・1 限界・2 不調。機関の無い任務は 0 */
export function engineTagKey(e: EngineTelemetry): number {
  if (!e.on) return 0;
  return e.stage === ENGINE_LIMP ? 2 : e.stage === ENGINE_FINAL ? 1 : 0;
}

const TAG_JA: readonly string[] = ['', ' ・ 機関 限界', ' ・ 機関 不調'];

/** 札の文（tagKey は engineTagKey。赤い線の行・結果・接触の文の後ろに足す。13mm の射撃・出来事と平常の行には付けない） */
export function engineTagJa(tagKey: number): string {
  return TAG_JA[tagKey] ?? '';
}

/** 右下の熱の帯の幅の刻み（熱を 1/ENGINE_GAUGE_STEPS に丸める。0〜ENGINE_GAUGE_STEPS） */
export function engineGaugeStep(heat: number): number {
  return Math.round((heat < 0 ? 0 : heat > 1 ? 1 : heat) * ENGINE_GAUGE_STEPS);
}

const GAUGE_JA: readonly string[] = ['機関', '機関 過熱', '機関 限界'];

/** 右下の字（key は engineStageKey）: 「機関」「機関 過熱」「機関 限界」「機関 不調 8」（数は残りの秒の切り上げ） */
export function engineGaugeLabel(key: number): string {
  const st = key & STAGE_MASK;
  return st === ENGINE_LIMP ? `機関 不調 ${key >> K_LEFT}` : GAUGE_JA[st]!;
}

/** 帯の色: 平常 緑・過熱 黄・限界と不調 赤 */
export function engineGaugeTint(stage: EngineStage): number {
  return stage === ENGINE_OK ? ENGINE_TINT_OK : stage === ENGINE_WARN ? ENGINE_TINT_WARN : ENGINE_TINT_FINAL;
}

/** 字の色: 平常は HUD の地の色・過熱 黄・限界と不調 警告色 */
export function engineGaugeTextColor(stage: EngineStage): string {
  return stage === ENGINE_OK ? ENGINE_TEXT_OK : stage === ENGINE_WARN ? ENGINE_TEXT_WARN : ENGINE_TEXT_FINAL;
}

/** 点滅する段（限界と不調。識別ボタンと同じ速さで濃さだけ） */
export function engineGaugePulses(stage: EngineStage): boolean {
  return stage >= ENGINE_FINAL;
}

/**
 * Result の 1 行（spec §D.4。20 px。CLAUDE.md §9: full_to_limp_s を動かす根拠）: 不調があれば回数・秒の和・限界の回数、限界まで行けば「不調なし」、過熱までなら「限界なし」、ほかは「過熱なし」。
 * 限界と過熱は熱が下から越えた回数（回復の後にまた全速にすれば必ず越える）。過熱の回数は限界の無い夜にだけ出す
 */
export function engineResultLine(r: EngineResult): string {
  if (r.limps > 0) return `機関 不調 ${r.limps} 回（計 ${Math.round(r.limpS)} 秒） ・ 限界 ${r.finals} 回`;
  if (r.finals > 0) return `機関 限界 ${r.finals} 回 ・ 不調なし`;
  if (r.warns > 0) return `機関 過熱 ${r.warns} 回 ・ 限界なし`;
  return '機関 過熱なし';
}
