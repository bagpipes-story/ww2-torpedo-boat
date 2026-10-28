// 海の上の味方の輸送船の文と置き場所（v0.6.9 S5a。jp_04。spec-v069 §5.4）: 船の下の状態の行（「揚陸 45%」「雷跡！ 12 秒」「被雷 1 ・ 揚陸 55%」「揚陸完了」「沈没（揚陸 62%）」）の鍵と文と色、
// 浜の揚陸地点の帯の中心（艇首の先が浜の線に届く点）、ラベルと状態の行の y（R14 A6: 船体の上＝北。浜は南で、南の縁に近い船の下の字は画面の外や HUD の下に入った）。entities/ally-ship が使う。Phaser 非依存（tests から読める）・確保しない（鍵は数、文は鍵が変わったときだけ作る）。
// 鍵 = 種類（0〜5）+ 8 × 値（% か秒。0〜127）+ 1024 × 被雷（0〜3。文に出る「被雷 N」の行だけ）。鍵と文・色は 1 対 1（setText は鍵が変わったときだけ＝文が変わったときだけ）。色は調子（味方・警告・沈没）で返し、色の値は絵の側
// （ui-config・game-config は DOM を読むので、ここは config/landing-config だけを読む）。
import { LANDING_PCT_LABEL_STEP, LANDING_WAKE_S_MAX } from '../config/landing-config';
import { LD_DONE, type LandingState, type LandingWakes } from '../core/landing';
import { degToRad } from '../core/units';

/** 状態の行の種類: 揚陸中（被雷なし）・揚陸中（被雷あり）・雷跡が走っている・揚陸完了・揚陸の前に沈んだ・揚陸の後に沈んだ */
export const SHIP_ST_PCT = 0;
export const SHIP_ST_HIT = 1;
export const SHIP_ST_WAKES = 2;
export const SHIP_ST_DONE = 3;
export const SHIP_ST_SUNK = 4;
export const SHIP_ST_SUNK_DONE = 5;
const VAL_MUL = 8;
const VAL_SPAN = 128;
const HITS_MUL = VAL_MUL * VAL_SPAN;

/**
 * 状態の行の鍵: 沈み始めたら沈没（揚陸の前なら沈んだときの %。1% 刻み）、浮いていて雷跡が走っていれば最接近までの秒（切り上げ・1 以上＝R14 A7）、揚陸完了、揚陸中は LANDING_PCT_LABEL_STEP 刻みの %
 * （被雷があれば被雷の数も）。wakes は core/landing の landingWakes（このフレームの値）
 */
export function allyShipStatusKey(st: LandingState, wakes: LandingWakes): number {
  if (st.sinking) return st.sunkAfterDone ? SHIP_ST_SUNK_DONE : SHIP_ST_SUNK + VAL_MUL * Math.min(VAL_SPAN - 1, Math.floor(st.pctAtSink * 100));
  if (wakes.count > 0) return SHIP_ST_WAKES + VAL_MUL * Math.min(LANDING_WAKE_S_MAX, Math.max(1, Math.ceil(wakes.cpaS)));
  if (st.phase === LD_DONE) return SHIP_ST_DONE;
  const pct = Math.floor((st.pct * 100) / LANDING_PCT_LABEL_STEP) * LANDING_PCT_LABEL_STEP;
  return (st.hits > 0 ? SHIP_ST_HIT : SHIP_ST_PCT) + VAL_MUL * pct + HITS_MUL * st.hits;
}

/** 鍵の文（鍵が変わったときだけ呼ぶ） */
export function allyShipStatusText(key: number): string {
  const kind = key % VAL_MUL;
  const v = Math.floor(key / VAL_MUL) % VAL_SPAN;
  const hits = Math.floor(key / HITS_MUL);
  switch (kind) {
    case SHIP_ST_WAKES: return `雷跡！ ${v} 秒`;
    case SHIP_ST_DONE: return '揚陸完了';
    case SHIP_ST_SUNK: return `沈没（揚陸 ${v}%）`;
    case SHIP_ST_SUNK_DONE: return '沈没（揚陸完了）';
    case SHIP_ST_HIT: return `被雷 ${hits} ・ 揚陸 ${v}%`;
    default: return `揚陸 ${v}%`;
  }
}

/** 状態の行の色の調子（entities/ally-ship が ESCORT_TEXT_COLOR・HUD_COLOR_WARN・LANDING_SUNK_TEXT_COLOR にする）: 味方の青・警告（雷跡）・灰色（沈没） */
export const SHIP_TONE_FRIENDLY = 0;
export const SHIP_TONE_WARN = 1;
export const SHIP_TONE_SUNK = 2;

/** 鍵の色の調子 */
export function allyShipStatusTone(key: number): number {
  const kind = key % VAL_MUL;
  return kind === SHIP_ST_WAKES ? SHIP_TONE_WARN : kind === SHIP_ST_SUNK || kind === SHIP_ST_SUNK_DONE ? SHIP_TONE_SUNK : SHIP_TONE_FRIENDLY;
}

/**
 * ラベル「輸送船」と状態の行の下端の y（どちらも origin (0.5, 1) で置く。R14 A6）: ラベルは回った絵の外接の箱の上端（y − halfY）から offsetM 上、状態の行はラベルの下端から statusDyM 上。
 * 出撃の組み立てで 1 回（船は動かない）
 */
export function allyShipLabelYs(y: number, halfY: number, offsetM: number, statusDyM: number): { labelY: number; statusY: number } {
  const labelY = y - halfY - offsetM;
  return { labelY, statusY: labelY - statusDyM };
}

/** 揚陸地点の帯の中心の x: 艇首の向きの先が浜の線（shoreY。南の縁）に届く点（艇首が浜を向いていなければ泊地の真南）。海域の幅に収める */
export function landingMarkX(p: { readonly x: number; readonly y: number; readonly headingDeg: number }, shoreY: number, width: number): number {
  const h = degToRad(p.headingDeg);
  const south = -Math.cos(h); // 北 0・時計回りの針路の y の成分（下が +）
  const x = south > 0 ? p.x + (Math.sin(h) * (shoreY - p.y)) / south : p.x;
  return Math.max(0, Math.min(width, x));
}
