// レーダーの 2 行目の出来事の文（v0.8.0 S4。spec-v0800 §4.9・§3.2 D-R2・D-R10、brief L26）: 夜の最初の接触・接触が増えた・東の縁で消えた（ビラ）・東の縁に現れた（帰りの列か）。
// 読むのはレーダーのテレメトリ（t.radar: 丸めた輝点・数・最初／新しい／消えた接触と、掃引の時の自艇の位置）だけ。艦の正体・列の段階・AI・本当の位置は読まない（tests/radar-lines が
// ソースの走査で読む欄を固定）。方位と距離は掃引の時の自艇から（atan2 は出来事の 1 回だけ＝§7）。東の縁の帯は config/strait-hud-config（見せ方の値・理由はそこ）。Phaser・DOM を読まない。
// v0.8.2 S4: 片道の列（us_05。r.eastOneWay）は「接触が東（スリガオ海峡）へ消えた」で戻りの尾を付けず、帰りの列の判定はいつも偽（us_04 の文は同じ）。
import { RADAR_EAST_EDGE_MARGIN_M, RADAR_LINE_STEP_M } from '../config/strait-hud-config';
import type { RadarTelemetry } from '../core/boat-telemetry';
import { bearingJa } from '../core/briefing';

/** 出来事の種類（ui/strait-line-clock の待ちの重さの順: 新しい接触 < 最初の接触 < ビラへ消えた < 帰りの列） */
export const RADAR_EV_NONE = 0;
export const RADAR_EV_NEW = 1;
export const RADAR_EV_FIRST = 2;
export const RADAR_EV_VILA = 3;
export const RADAR_EV_RETURN = 4;

/** (fromX, fromY) から (x, y) への 8 方位（北 0・時計回り。x 東・y 南） */
function dirJa(fromX: number, fromY: number, x: number, y: number): string {
  return bearingJa((Math.atan2(x - fromX, fromY - y) * 180) / Math.PI);
}

/** 距離の刻み（四捨五入。spec §4.9 の「北西 2300 m」） */
function distStepM(fromX: number, fromY: number, x: number, y: number): number {
  return Math.round(Math.hypot(x - fromX, y - fromY) / RADAR_LINE_STEP_M) * RADAR_LINE_STEP_M;
}

/** 東の縁の帯の内（東へ抜けて戻る列のある任務だけ＝eastJa があるとき） */
function nearEastEdge(r: RadarTelemetry, x: number): boolean {
  return r.eastJa !== '' && x >= r.widthM - RADAR_EAST_EDGE_MARGIN_M;
}

/** 最後に消えた接触の最後の輝点が東の縁の帯の内（「東（ビラ）へ消えた」） */
export function radarLostAtEastEdge(r: RadarTelemetry): boolean {
  return nearEastEdge(r, r.lostX);
}

/** 最後の新しい接触の輝点が東の縁の帯の内（ビラへ消えた後なら「帰りの列か」。片道の列＝v0.8.2 は戻りが無いのでいつも偽） */
export function radarNewAtEastEdge(r: RadarTelemetry): boolean {
  return !r.eastOneWay && nearEastEdge(r, r.newX);
}

/** 夜の最初の接触: 「レーダー探知！ 北西 2300 m ・ 接触 1 ・ 目では見えない」（us_04 の最初の掃引は出発点から 2 km 余りの護衛＝目の外。tests/radar-lines が今夜の揺らぎで確かめる） */
export function radarFirstLineJa(r: RadarTelemetry): string {
  return `レーダー探知！ ${dirJa(r.firstFromX, r.firstFromY, r.firstX, r.firstY)} ${distStepM(r.firstFromX, r.firstFromY, r.firstX, r.firstY)} m ・ 接触 ${r.contacts} ・ 目では見えない`;
}

/** 接触が増えた: 「レーダー: 西に新しい接触 3600 m ・ 接触 2」 */
export function radarNewLineJa(r: RadarTelemetry): string {
  return `レーダー: ${dirJa(r.fromX, r.fromY, r.newX, r.newY)}に新しい接触 ${distStepM(r.fromX, r.fromY, r.newX, r.newY)} m ・ 接触 ${r.contacts}`;
}

/** 接触が東の縁で消えた（1 夜に 1 回）: 「接触が東（ビラ）へ消えた ・ 揚陸を終えると同じ海峡を戻ってくる」。片道の列（v0.8.2 S4。us_05）は戻らないので尾なし「接触が東（スリガオ海峡）へ消えた」 */
export function radarVilaLineJa(r: RadarTelemetry): string {
  return `接触が東（${r.eastJa}）へ消えた${r.eastOneWay ? '' : ' ・ 揚陸を終えると同じ海峡を戻ってくる'}`;
}

/** ビラへ消えた後に東の縁に現れた接触（1 夜に 1 回）: 「レーダー: 東に新しい接触 2300 m ・ 帰りの列か ・ 進路から離れよ」 */
export function radarReturnLineJa(r: RadarTelemetry): string {
  return `レーダー: 東に新しい接触 ${distStepM(r.fromX, r.fromY, r.newX, r.newY)} m ・ 帰りの列か ・ 進路から離れよ`;
}

/** 出来事の種類の文（RADAR_EV_*。今のテレメトリの最後の出来事から。種類の無いものは ''） */
export function radarEventLineJa(kind: number, r: RadarTelemetry): string {
  if (kind === RADAR_EV_FIRST) return radarFirstLineJa(r);
  if (kind === RADAR_EV_NEW) return radarNewLineJa(r);
  if (kind === RADAR_EV_VILA) return radarVilaLineJa(r);
  if (kind === RADAR_EV_RETURN) return radarReturnLineJa(r);
  return '';
}
