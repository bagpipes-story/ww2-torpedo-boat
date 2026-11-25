// 救助の任務（v0.8.5 S4。us_07「D-Day・生存者救助」の type rescue）の 2 行目の文・呼びかけの頭・中央の帯（spec-v0850 §8.2）。時計は ui/rescue-lines（ここを再 export する）。
// - 出来事（モード 46。1 回・4 秒）: 収容した・フィッチへ移した・40 名を渡した・フィッチの砲火で S ボートが退いた（ここまで知らせ）／S ボートが来た・砲弾で生存者を失った・機雷が見えた・
//   触雷（ここから急ぎ＝米PT の赤い線のすぐ下に出る。ui/mission-mode）。文は出来事の時に 1 回だけ組む。v0.8.5 IP2: S ボートの第二波（S ボートが来たと同じ種類）・
//   砲台が生存者の海を撃った弾で失った（砲弾と同じ種類。文だけ替える）。v0.8.5 IP3: 40 名を渡した時に味方の艇が出れば「 ・ 味方の艇 2 隻が救助に来る」を足す（同じ種類）。
// - 常の文（モード 47。値が変わった時だけ）: 移している・収容中・満員・フィッチの輪で速い・群のそばで速い・平常（乗せている・渡した・海に）。後ろに今の沿岸砲の句（hud-lines の withWarnings）。
//   出すのは救助の任務で、燃料少でなく・浅瀬の外で、拾っている／移している間か、呼びかけ（救助の時間の終わり・40 名を渡した）が無い時（rescueStandingShown。見えている S ボートの平常の行より上）。
// - 呼びかけの頭（rescueCallHeadJa）: 魚雷なし（狙う艦が無い任務）と救助の時間の終わりの前の「夜明け近し」は呼びかけにしない（rescueCallOf）。救助の時間の後は「救助の時間の終わり ・ 」、
//   40 名を渡したら「40 名を渡した ・ 」。文に「夜明け」「空襲」と言わない（昼の任務）。
// S3b の開いた問題（「フィッチの方へ引き込め」と燃料）: S ボートの文は全速で逃げよと言わない。フィッチの砲火の規則（距離と退くこと）だけを言う（逃げる／戦うはプレイヤーが決める。
// 全速で逃げる台本は燃料が尽きた＝CHANGELOG v0.8.5 S3b）。読むのは t.rescue・t.pt の数と名・3 行目と同じ沿岸砲の旗だけ。Phaser・DOM を読まない。確保は文を組む時だけ。
import { HOME_COLOR_TEXT, HUD_COLOR_STRONG, HUD_COLOR_WARN } from '../config/hud-text-config';
import { PT_NAME_DEFAULT_JA } from '../config/pt-config';
import { RESCUE_HOME_JA, RESCUE_NEAR_HINT_M, RESCUE_OTHER_SHIPS_JA } from '../config/rescue-hud-config';
import type { BoatTelemetry } from '../core/boat-telemetry';
import { CALL_DAWN, CALL_EXPENDED, CALL_FUEL, CALL_SUNK, topCall } from '../core/mission-flow';
import type { RescueTelemetry } from '../core/rescue-telemetry';
import { withWarnings, type HudLine } from './hud-lines';

/** 出来事の種類（重さの順。SBOAT から上は急ぎ＝米PT の接触の行より上に出す） */
export const RESCUE_EV_NONE = 0, RESCUE_EV_PICKED = 1, RESCUE_EV_TRANSFER = 2, RESCUE_EV_RETREAT = 3, RESCUE_EV_OBJECTIVE = 4, RESCUE_EV_SBOAT = 5, RESCUE_EV_SHELL = 6, RESCUE_EV_MINE = 7, RESCUE_EV_BLOW = 8;
export const rescueEventUrgent = (kind: number): boolean => kind >= RESCUE_EV_SBOAT;

export const rescuePickedJa = (n: number, aboard: number, cap: number): string => `収容 ${n} 名 ・ 乗せている ${aboard}/${cap}${aboard >= cap ? ' ・ 満員' : ''}`;
export const rescueTransferJa = (fitchJa: string, n: number, delivered: number): string => `${fitchJa}へ ${n} 名を移した ・ 計 ${delivered} 名`;
export const rescueObjectiveJa = (n: number): string => `${n} 名を渡した ・ 帰投すれば達成`;
/** 40 名を渡して味方の艇が出た（v0.8.5 IP3。実機 1 回目のユーザー「40人救助達成したら帰投水域の方から味方の艇が救助応援に駆けつける演出にする？」。拾い続けても帰投してもよい） */
export const rescueObjectiveFriendlyJa = (n: number, nm: string, k: number): string => `${n} 名を渡した ・ 帰投すれば達成 ・ ${nm} ${k} 隻が救助に来る`;
export const rescueShellJa = (n: number): string => `砲弾が生存者のそばに落ちた ・ ${n} 名を失った ・ 煙幕で砲台の目を切れ`;
/** 砲台が自艇でなく生存者の海を撃った弾で失った（v0.8.5 IP2。自艇がどこにいても出る） */
export const rescueSeaShellJa = (n: number): string => `砲台が生存者の海を砲撃 ・ ${n} 名を失った ・ 急いで拾え`;
export const rescueMineJa = (dirJa: string, m: number, n: number): string => `機雷！ ${n > 1 ? `${n} 個 ・ ` : ''}${dirJa} ${m} m ・ 水路の外`;
export const rescueBlowJa = (hpLoss: number): string => `触雷！ HP −${hpLoss} ・ 水路を通れ`;
export const rescueSboatJa = (nm: string, n: number, dirJa: string, fitchJa: string, coverM: number): string => `${nm} ${n} 隻 ${dirJa}から ・ ${fitchJa}の ${coverM} m の内なら砲火で退く`;
export const rescueRetreatJa = (fitchJa: string, nm: string): string => `${fitchJa}の砲火 ・ ${nm}が退いた`;
/** S ボートの第二波が出た（v0.8.5 IP2。1 回。方角は出た時の第二波の先頭） */
export const rescueWave2Ja = (nm: string, n: number, dirJa: string, fitchJa: string, coverM: number): string => `${nm}の第二波 ${n} 隻 ${dirJa}から ・ ${fitchJa}の ${coverM} m の内なら砲火で退く`;

/** 隊の名（記録の name_short_ja。無ければ「米PT」） */
export const rescuePtNameJa = (t: BoatTelemetry): string => (t.ptNames ? t.ptNames.nameJa : PT_NAME_DEFAULT_JA);

/** 救助の任務の呼びかけ（立っている旗から、魚雷なしと救助の時間の終わりの前の「夜明け近し」を除いた最上位。救助の無い任務・何も無ければ 0） */
export function rescueCallOf(t: BoatTelemetry): number {
  if (!t.rescue) return 0;
  return topCall(t.callFlags & ~CALL_EXPENDED & ~(t.dawn.reached ? 0 : CALL_DAWN));
}

/**
 * 常の文を出す（モード 47）: 救助の任務で浅瀬の外・燃料少でなく、拾っている／移している間か、呼びかけが無い時。見えている（まだ気づいていない）S ボートの平常の行には勝つ
 * （昼の視程 2,700 m ではコリーのそばから西の S ボートがほぼいつも見え、その行が常の文を隠した＝S4 の画面写し。S ボートは来た時の出来事・端の印・3 行目「敵影あり」が言い、気づかれれば接触の行が上）
 */
export function rescueStandingShown(t: BoatTelemetry): boolean {
  const r = t.rescue;
  if (!r || t.shallowState !== 0) return false;
  const c = rescueCallOf(t);
  if (c === CALL_FUEL) return false;
  return r.picking || r.transferring || c === 0;
}

/** 常の文の種類（キーの下 3 ビット） */
const S_PLAIN = 0, S_TRANSFER = 1, S_PICK = 2, S_FULL = 3, S_RING = 4, S_NEAR = 5;

function standingSub(r: RescueTelemetry): number {
  if (r.transferring) return S_TRANSFER;
  if (r.picking) return S_PICK;
  if (r.aboard >= r.capacity) return S_FULL;
  if (r.aboard > 0 && r.fitchDx * r.fitchDx + r.fitchDy * r.fitchDy <= r.fitchRingM * r.fitchRingM) return S_RING;
  if (r.nearCount > 0 && r.nearDx * r.nearDx + r.nearDy * r.nearDy <= RESCUE_NEAR_HINT_M * RESCUE_NEAR_HINT_M) return S_NEAR;
  return S_PLAIN;
}

/** 常の文の本文（沿岸砲の句の前） */
export function rescueStandingBodyJa(r: RescueTelemetry): string {
  const cap = r.capacity;
  const sub = standingSub(r);
  if (sub === S_TRANSFER) return `${r.fitchJa}へ移している ・ 乗せている ${r.aboard}/${cap} ・ 渡した ${r.delivered} 名`;
  if (sub === S_PICK) return `収容中 ・ 乗せている ${r.aboard}/${cap} ・ この群に ${r.nearCount} 名`;
  if (sub === S_FULL) return `満員 ${r.aboard}/${cap} 名 ・ ${r.fitchJa}の輪へ（水路を通れ）`;
  if (sub === S_RING) return `${r.fitchJa}の輪 ・ ${r.pickupMaxKt} kt 以下で移す（静音が効く）`;
  if (sub === S_NEAR) return `生存者 ${r.nearCount} 名 ・ ${r.pickupMaxKt} kt 以下で寄せて拾う（静音が効く）`;
  return `乗せている ${r.aboard}/${cap} 名 ・ 渡した ${r.delivered}${r.delivered < r.objective ? `/${r.objective}` : ''} 名 ・ 海に ${r.onWater} 名`;
}

/** 常の文（後ろに今の沿岸砲の句「 ・ 沿岸砲！」「 ・ 沿岸砲の射界」。浅瀬の間は出さないので浅瀬の句は付かない） */
export function rescueStandingJa(t: BoatTelemetry): string {
  return withWarnings(rescueStandingBodyJa(t.rescue!), t, 0, false, true);
}

/** 常の文のキー（種類・乗せている・渡した・海に／この群の人数・沿岸砲の 2 つの旗。値が変わった時だけ組み直す） */
export function rescueStandingKey(t: BoatTelemetry): number {
  const r = t.rescue;
  if (!r) return 0;
  const sub = standingSub(r);
  const n = sub === S_PICK || sub === S_NEAR ? r.nearCount : sub === S_PLAIN ? r.onWater : 0;
  return sub | (Math.min(63, r.aboard) << 3) | (Math.min(127, r.delivered) << 9) | (Math.min(127, n) << 16) | (t.batteryInArc ? 1 << 23 : 0) | (t.batteryAlerted ? 1 << 24 : 0);
}

/** 2 行目の文が読む時計の部分（RescueLineClock がそのまま満たす） */
export interface RescueLineView { readonly kind: number; readonly text: string }
/** モード 46 の出来事の行（急ぎは警告の色、退いた・達成は味方の青）か、モード 47 の常の文（standing が真。2 行目の平常の色）。救助の無い任務は null */
export function rescueLine(t: BoatTelemetry, standing: boolean, c: RescueLineView | undefined): HudLine | null {
  if (!t.rescue) return null;
  if (standing) return { text: rescueStandingJa(t), color: HUD_COLOR_STRONG };
  if (!c || c.kind === RESCUE_EV_NONE) return null;
  const color = rescueEventUrgent(c.kind) ? HUD_COLOR_WARN : c.kind === RESCUE_EV_RETREAT || c.kind === RESCUE_EV_OBJECTIVE ? HOME_COLOR_TEXT : HUD_COLOR_STRONG;
  return { text: c.text, color };
}

/** 呼びかけの行の頭（ui/dawn-lines の callLineText。救助の任務だけ）: 燃料少・救助の時間の終わり・40 名を渡した（後ろは「帰投せよ  N m」） */
export function rescueCallHeadJa(t: BoatTelemetry): string {
  const c = rescueCallOf(t);
  if (c === CALL_FUEL) return '燃料少 ';
  if (c === CALL_DAWN) return '救助の時間の終わり ・ ';
  return c === CALL_SUNK ? `${t.rescue!.objective} 名を渡した ・ ` : '';
}

/** 左上の時計（ui/dawn-lines の clockJa）: 「救助 残り 4:12」「救助の後 0:20」（m:ss の文は呼ぶ側から） */
export const rescueClockJa = (reached: boolean, mss: string): string => (reached ? `救助の後 ${mss}` : `救助 残り ${mss}`);

/** 救助の時間の終わりの中央の帯（ui/dawn-lines の dawnBannerLines）: 見出し・他艦が拾う（S ボートが残っていれば去る句）・乗せている人の行方と帰投 */
export function rescueBannerLines(t: BoatTelemetry): readonly string[] {
  const r = t.rescue!;
  const p = t.pt;
  const sboat = p.enabled && p.alive > 0 ? ` ・ ${rescuePtNameJa(t)}は${p.leaveDirJa}へ去る` : '';
  const home = r.aboard > 0 ? `乗せている ${r.aboard} 名は${r.fitchJa}へ移すか、${RESCUE_HOME_JA}へ帰投して渡す` : `${RESCUE_HOME_JA}へ帰投せよ`;
  const rest = r.friendlyCount > 0 ? r.friendlyJa : `${RESCUE_OTHER_SHIPS_JA}の内火艇`; // 味方の艇が出ていれば艇が拾い続ける（v0.8.5 IP3）
  return ['救助の時間が終わった', `残りは${rest}が拾う${sboat}`, home];
}

/** 3 行目（ui/boat-hud。救助の任務だけ）の倍率: 幅 maxPx に収める（収まれば 1）。文を組み直した時だけ呼ぶ */
export function statusFitScale(textW: number, maxPx: number): number {
  return textW > maxPx && textW > 0 ? maxPx / textW : 1;
}

/** Briefing の時の行（v0.8.5 S4。systems/briefing-numbers の dayRowJa＝ラベル「時」。月の行と同じ数）: 「見える 2700 m ・ 見つかる 巡航 3600 m／静音 1800 m」 */
export const rescueDayRowJa = (visM: number, cruiseM: number, silentM: number): string => `見える ${Math.round(visM)} m ・ 見つかる 巡航 ${Math.round(cruiseM)} m／静音 ${Math.round(silentM)} m`;
/** Briefing の条件の時計（「夜明けまで N 秒」の代わり）: 「救助の時間 300 秒（昼の空は味方）」 */
export const rescueClockBriefingJa = (durationS: number, skyJa: string): string => `救助の時間 ${Math.round(durationS)} 秒${skyJa}`;
/** Briefing の条件の武器の句（砲が 3 種＝「1挺」と言わない。和文に半角スペースを入れない） */
export const rescueWeaponBriefingJa = (label: string, ptNameJa: string): string => `機銃${label}（撃つと閃光で見つかる。魚雷は${ptNameJa}の下を抜ける）`;
