// 上中央の 2 行目のモード（v0.6.1 で ui/mission-line.ts から切り出し。v0.6.0 のモードはそのまま、夜明けの空襲の 2 つを足した）: どの行を出すかの優先順だけを決める。
// 文は ui/hud-lines.ts、setText のキャッシュは ui/mission-line.ts。テレメトリを読むだけで、毎フレーム呼んでも確保しない（§7）。
// v0.6.5: 機関の不調（jp_05）の 3 つ（28〜30。文は ui/engine-lines）。v0.6.7: 夜の哨戒機（jp_02）の 4 つ（31〜34。文は ui/patrol-lines。哨戒の無い任務は t.patrol.enabled が偽で 1 ビットも変わらない）。
import { AS_T_FALLING, AS_T_INBOUND, AS_T_NONE, AS_T_ORBIT, AS_T_REST } from '../core/air-strike';
import { CALL_DAWN } from '../core/mission-flow';
import type { BoatTelemetry } from '../core/boat-motion';
import { ENGINE_FINAL } from '../core/engine-trouble';
import { FF_CHALLENGE, FF_LEAVING, FF_OUT_GAVE_UP, FF_OUT_IDENTIFIED, FF_STRAFE } from '../core/friendly';
import { GUN_FIRING, GUN_OUT_OF_ARC, GUN_SAFE } from '../core/gun-battery';
import { PA_HUNT, PA_ORBIT, PA_PASS, patrolWakeLine } from '../core/patrol-air';
import { PT_ALERT, PT_CHASE, PT_RUN_IN } from '../core/pt-boats';
import { PT_GUN_RELOAD } from '../core/pt-gun';
import { SHALLOW_GROUNDED } from '../core/shallows';
import { STORM_INSIDE, STORM_NEAR } from '../core/storm';
import { planeApproaching, planeAttacking, planeLeaving } from './hud-lines';

/** 2 行目の状態: 0 平常、1 帰投せよ、2 燃料切れ、3 輪の中で魚雷待ち、4 浅瀬（接近・中・座礁）、5 味方機（識別要求・航過）、6 味方機の結果（去る間） */
export const MISSION_NORMAL = 0;
export const MISSION_CALL = 1;
export const MISSION_ADRIFT = 2;
export const MISSION_WAITING = 3;
export const MISSION_SHALLOWS = 4;
export const MISSION_FRIENDLY = 5;
export const MISSION_FRIENDLY_RESULT = 6;
/** 7 暴風の警告（近い・中で速すぎる）、8 暴風の情報（近い・中で安全速力以下） */
export const MISSION_STORM_WARN = 7;
export const MISSION_STORM = 8;
/** 9 水上機の攻撃（発見確定〜爆撃）、10 水上機の未確定の接近、11 水上機の結果（去る間）。v0.4.1 */
export const MISSION_PLANE_ATTACK = 9;
export const MISSION_PLANE = 10;
export const MISSION_PLANE_RESULT = 11;
/** 12 射撃（ボタンを押している間）、13 大発が岸へ逃げている、14 大発の撃破・上陸の直後（BARGE_EVENT_SHOW_MS）。v0.4.2 */
export const MISSION_GUN = 12;
export const MISSION_BARGE_RUN = 13;
export const MISSION_BARGE_EVENT = 14;
/** 15 撃つ前の手引き（押していない・大発が見えている・逃げている大発がいない）。v0.4.2 */
export const MISSION_BARGE_SIGHTED = 15;
/** 16 沿岸砲の射界の中（上のどれでもないとき。射撃・逃走・手引きの行には末尾に付く）。v0.4.3 */
export const MISSION_BATTERY = 16;
/** 17 僚艇が沈んだ（燃料切れの下）、18 僚艇が撃たれた直後（ESCORT_EVENT_SHOW_MS。座礁の下）、19 僚艇が遅れている（沿岸砲の下・浅瀬の上）。v0.4.4 */
export const MISSION_ESCORT_LOST = 17;
export const MISSION_ESCORT_HIT = 18;
export const MISSION_ESCORT_LAG = 19;
/** 20 夜明けの空襲（落下中・爆撃進路・接近・旋回。燃料切れの下・僚艇の沈没の上＝沈没の行が爆弾の警告を隠さない）、21 波の合間（帰投せよの上）。v0.6.1 */
export const MISSION_STRIKE = 20;
export const MISSION_STRIKE_REST = 21;
/** 22 米PT の航過（赤い線〜掃射。空襲の下）、23 米PT との接触（航過の結果の直後・突撃・離脱）、24 米PT の任務の平常（「命中 0」の平常の代わり。文は ui/pt-lines）。v0.6.3。実機 2 回目: 22 に連射、23 に追ってくる PT と連射の結果 */
export const MISSION_PT_PASS = 22;
export const MISSION_PT_CONTACT = 23;
export const MISSION_PT = 24;
/** 25 T-14 の 13mm の射撃（ボタンを押している間・生きた PT がいる）、26 13mm の出来事（撃退・撃沈の直後 PT_RESULT_SHOW_MS）。v0.6.3 実機 1 回目（文は ui/pt-gun-lines） */
export const MISSION_PT_GUN = 25;
export const MISSION_PT_GUN_EVENT = 26;
/** 27 味方の大発の輸送隊の出来事（沈没・上陸の直後 CONVOY_EVENT_SHOW_MS。13mm の出来事の下・航過の結果の上）。v0.6.4（文は ui/convoy-lines） */
export const MISSION_CONVOY_EVENT = 27;
/**
 * 機関の不調（v0.6.5。spec-v065 §D.1・R3・R5）: 28 過熱の出来事（熱が warn_heat を下から越えた後 ENGINE_EVENT_SHOW_MS。輸送隊の出来事の下・航過の結果の上）、
 * 29 限界で全速の帯（航過の結果の下・13mm の射撃と米PT との接触の上）、30 機関の状態（不調の間と、限界で全速の帯でない間。米PT との接触の下・帰投せよと米PT の平常の上）
 */
export const MISSION_ENGINE_EVENT = 28;
export const MISSION_ENGINE_FINAL = 29;
export const MISSION_ENGINE_STATUS = 30;
/**
 * 夜の哨戒機（v0.6.7。jp_02。spec-v067 §D.1。文とキーは ui/patrol-lines）: 31 発見と夜の出撃（接近・旋回・爆撃進路・落下。夜明けの空襲の下、落下中だけは夜明けの接近・旋回より上）、
 * 32 捜索（接近・付近の捜索）、33 結果（見つけられずに去る・出撃が去る）、34 平常（帰投せよの下・「命中 0」の平常の代わり）
 */
export const MISSION_PATROL_ATTACK = 31;
export const MISSION_PATROL_PASS = 32;
export const MISSION_PATROL_RESULT = 33;
export const MISSION_PATROL = 34;

/**
 * missionMode の flags（MissionLine が時刻と前のフレームで決める 6 つ）: 大発の撃破・上陸の直後の表示中、僚艇の被弾の直後の表示中、米PT の航過の結果の表示中（v0.6.3）、13mm の出来事の表示中（v0.6.3 実機 1 回目）、
 * 米PT の赤い線の行を保つ（実機 2 回目。攻撃の後に弾がまだ飛んでいる間。ui/pt-chase-lines の ptHoldPass）
 */
export const MODE_FLAG_BARGE_EVENT = 1;
export const MODE_FLAG_ESCORT_HIT = 2;
export const MODE_FLAG_PT_RESULT = 4;
export const MODE_FLAG_PT_GUN_EVENT = 8;
export const MODE_FLAG_PT_HOLD = 16;
/** 輸送隊の出来事の表示中（v0.6.4。ui/pt-line-clock が沈没・上陸の数の立ち上がりで立てる） */
export const MODE_FLAG_CONVOY_EVENT = 32;
/** 機関の過熱の出来事の表示中（v0.6.5。ui/pt-line-clock が機関の出来事の通し番号の増えで立てる。段が過熱のままの間だけ） */
export const MODE_FLAG_ENGINE_EVENT = 64;

/** 暴風の近く・中で安全速力を超えている（警告。ほかの行の末尾にも付く） */
export function stormWarning(t: BoatTelemetry): boolean {
  return (t.stormState === STORM_NEAR || t.stormState === STORM_INSIDE) && t.stormFast;
}

/**
 * 米PT の航過の結果を出す（v0.6.3）: 表示の秒の内（MODE_FLAG_PT_RESULT。通し番号は撃った弾がみな落ちてから増える）。
 * 撃った航過は「かわした！」か「被弾」、撃たなかった航過（転舵で艇首尾の円錐・射程の外へ抜けた）は「撃たせなかった！」（v0.6.3 レビュー: いちばん良いかわし方に何も出なかった。ui/pt-lines）
 */
export function ptResultShown(t: BoatTelemetry, flags: number): boolean {
  return t.pt.enabled && (flags & MODE_FLAG_PT_RESULT) !== 0;
}

/**
 * T-14 の 13mm の行を出す（v0.6.3 実機 1 回目）: 射撃を押していて撃てる（状態 ≠ SAFE。弾倉の交換中も）・生きた PT（去っていない・沈んでいない）がいる。
 * 撃っている・弾倉交換はいつも出す。ほかは見つかってから（レビュー ux-3: 見つかる前は「静音でやり過ごせ」の行を「引きつけよ」で消し、閃光で見つかる撃ち合いへ誘っていた。
 * 撃てば閃光で同じステップに見つかる。押したままでも帰投せよ（夜明け・燃料）の行を隠さない＝NP-1）。射界外は出す。撃てるものが無い（射程外・見えない・煙幕）は
 * 突撃の行（どこから来るか）に勝たない（ux-1: 押したままだと突撃の行が 1 夜に 1 度しか出ず、挟み撃ちの左右が文で見えなかった）。
 * v0.6.3 実機 2 回目: 追ってくる PT（追撃）の行にも勝たない（どの舷から来るか・撃ち返せ）
 */
export function ptGunShown(t: BoatTelemetry): boolean {
  const p = t.pt;
  if (!(p.enabled && p.gunEnabled && p.gunStatus !== GUN_SAFE && p.alive > 0)) return false;
  if (t.aaFiring) return false; // 機銃で機を撃っている（v0.6.8。PT の標的が無いときだけ＝撃てるものが無い 13mm/25mm の行を出さない）
  if (p.gunStatus === GUN_FIRING || p.gunStatus === PT_GUN_RELOAD) return true;
  if (!p.detected) return false;
  return p.gunStatus === GUN_OUT_OF_ARC || (p.threatPhase !== PT_ALERT && p.threatPhase !== PT_RUN_IN && p.threatPhase !== PT_CHASE);
}

/** 機関の限界で全速の帯（v0.6.5。モード 29。13mm の射撃・米PT との接触より上＝全速を続けている人にだけ上に出す。R5） */
export function engineFinalFull(t: BoatTelemetry): boolean {
  return t.engine.on && t.engine.stage === ENGINE_FINAL && t.targetStep === 'full';
}

/** 機関の状態の行（v0.6.5。モード 30）: 不調の間と、限界で全速の帯でない間（全速の帯の限界は engineFinalFull が先に取る） */
export function engineStatusShown(t: BoatTelemetry): boolean {
  return t.engine.on && t.engine.stage >= ENGINE_FINAL;
}

/** 大発が岸へ逃げている（大発の任務だけ） */
export function bargeRunning(t: BoatTelemetry): boolean {
  return t.gunMission && !Number.isNaN(t.bargeEscapeS);
}

/**
 * 2 行目のモード。call は topCall(t.callFlags)、flags は MODE_FLAG_*。
 * 優先順: 魚雷待ち > 燃料切れ > 夜明けの空襲（夜の哨戒機の落下中の爆弾は夜明けの接近・旋回より上。v0.6.7）> 夜の哨戒機の発見・出撃 > 捜索 > 結果（v0.6.7）> 米PT の航過（赤い線）> 13mm の出来事 > 輸送隊の出来事（v0.6.4）> 機関の過熱の出来事（v0.6.5）> 米PT の航過の結果 >
 * 機関の限界（全速の帯）> 13mm の射撃 > 米PT との接触（突撃・離脱）> 機関の状態（不調・限界で冷やしている）> 僚艇の沈没 > 水上機の攻撃 > 味方機（要求・航過）> 座礁 > 僚艇の被弾 > 射撃 > 大発の逃走 > 撃つ前の手引き > 沿岸砲の射界 > 僚艇の遅れ > 浅瀬 > 暴風の警告 > 水上機の接近 > 大発の結果 > 味方機の結果 > 水上機の結果 > 暴風の情報 > 空襲の波の合間 > 帰投せよ > 米PT の平常 > 夜の哨戒機の平常（v0.6.7）> 平常（docs/02 §6.7・§6.8。米PT がみな去る（去った）夜明けの後だけ「夜明け ・ 米PT は東へ去る／去った ・ 帰投せよ」が夜明けの帰投せよより上。v0.6.3）
 */
export function missionMode(t: BoatTelemetry, call: number, flags: number): number {
  if (t.homeWaiting) return MISSION_WAITING;
  if (t.fuelEmpty) return MISSION_ADRIFT;
  const pa = t.patrol;
  // 夜明けのラッチの瞬間に落ちている夜の 1 発（最大 1.28 秒）は夜明けの 4 機の接近・旋回の行に隠さない（R6。夜明けの最初の進路はラッチから first_run_s 後で重ならない）
  if (pa.enabled && pa.threat === AS_T_FALLING && (t.dawn.threat === AS_T_INBOUND || t.dawn.threat === AS_T_ORBIT)) return MISSION_PATROL_ATTACK;
  if (t.dawn.threat !== AS_T_NONE && t.dawn.threat !== AS_T_REST) return MISSION_STRIKE;
  if (pa.enabled) {
    // 夜の哨戒機（v0.6.7。jp_02 に他の敵はいない）: 発見と夜の出撃 > 捜索 > 結果（平常は下の帰投せよの下。出撃の後の哨戒で航跡の行が出るなら結果より航跡。レビュー ux:ux-4）
    if (pa.threat !== AS_T_NONE && pa.threat !== AS_T_REST) return MISSION_PATROL_ATTACK;
    if (pa.phase === PA_PASS || pa.phase === PA_ORBIT) return MISSION_PATROL_PASS;
    if (pa.resultKind !== 0 && !(pa.phase === PA_HUNT && patrolWakeLine(pa, t.targetStep))) return MISSION_PATROL_RESULT;
  }
  if (t.pt.enabled) {
    // 米PT（v0.6.3）: 赤い線（航過・連射。終わって弾が飛んでいる間も MODE_FLAG_PT_HOLD で保つ）がいちばん上のまま。13mm（実機 1 回目）の撃退・撃沈・制圧の直後 > 航過・連射の結果 > 射撃中 > 突撃・追撃・離脱（何も撃てない射撃の行は突撃・追撃の下。ptGunShown）
    // v0.6.4 レビュー ux-3: 航過中に標的の大発が沈んだ・上陸した（passTargetLost。jp_01 だけ）なら赤い線の行を降ろす（沈没・上陸の出来事がすぐ出る）
    if ((t.pt.passing && !t.pt.passTargetLost) || (flags & MODE_FLAG_PT_HOLD) !== 0) return MISSION_PT_PASS;
    if ((flags & MODE_FLAG_PT_GUN_EVENT) !== 0) return MISSION_PT_GUN_EVENT;
    if ((flags & MODE_FLAG_CONVOY_EVENT) !== 0) return MISSION_CONVOY_EVENT; // 大発の沈没・上陸（v0.6.4。沈んだ航過の結果より上）
    if ((flags & MODE_FLAG_ENGINE_EVENT) !== 0) return MISSION_ENGINE_EVENT; // 機関の過熱（v0.6.5。13mm の出来事と同じ 1 回きり。接触の下だと追われている間ずっと出ない）
    if (ptResultShown(t, flags)) return MISSION_PT_CONTACT;
    if (engineFinalFull(t)) return MISSION_ENGINE_FINAL; // 機関の限界で全速の帯（v0.6.5）。冷やしている間・不調は接触の下（札で出る）
    if (ptGunShown(t)) return MISSION_PT_GUN;
    // ux-4: 輸送隊が決着した後（jp_01 だけ）は、呼びかけ「大発 上陸 k/3 ・ 帰投せよ」が突撃・追撃・離脱の行に勝つ（赤い線・出来事・結果・射撃は上のまま）
    if (t.pt.detected && t.pt.alive > 0 && !(t.convoy.resolved && call !== 0)) return MISSION_PT_CONTACT;
    if (engineStatusShown(t)) return MISSION_ENGINE_STATUS;
  }
  if (t.escortEnabled && t.escortSunk) return MISSION_ESCORT_LOST;
  if (planeAttacking(t)) return MISSION_PLANE_ATTACK;
  if (t.friendlyPhase === FF_CHALLENGE || t.friendlyPhase === FF_STRAFE) return MISSION_FRIENDLY;
  if (t.shallowState === SHALLOW_GROUNDED) return MISSION_SHALLOWS;
  if ((flags & MODE_FLAG_ESCORT_HIT) !== 0) return MISSION_ESCORT_HIT;
  // 射撃（押している間）と大発の逃走は浅瀬の警告を後ろに付けて浅瀬より上（v0.4.2。浅瀬が狩り場）。座礁だけはその上
  if (t.gunMission && t.gunStatus !== GUN_SAFE && !t.aaFiring && t.bargesSunk + t.bargesBeached < t.bargesTotal) return MISSION_GUN; // 機を撃っている間（v0.6.8）は「射程に大発なし」を出さない
  if (bargeRunning(t)) return MISSION_BARGE_RUN;
  if (t.gunMission && t.gunStatus === GUN_SAFE && t.enemySighted) return MISSION_BARGE_SIGHTED;
  if (t.batteryInArc) return MISSION_BATTERY;
  if (t.escortEnabled && !t.escortSunk && t.escortDistM > t.escortLagWarnM) return MISSION_ESCORT_LAG;
  if (t.shallowState !== 0) return MISSION_SHALLOWS;
  if (stormWarning(t)) return MISSION_STORM_WARN;
  if (planeApproaching(t)) return MISSION_PLANE;
  if ((flags & MODE_FLAG_BARGE_EVENT) !== 0) return MISSION_BARGE_EVENT;
  if (t.friendlyPhase === FF_LEAVING && (t.friendlyOutcome === FF_OUT_IDENTIFIED || t.friendlyOutcome === FF_OUT_GAVE_UP)) return MISSION_FRIENDLY_RESULT;
  if (planeLeaving(t)) return MISSION_PLANE_RESULT;
  if ((t.stormState === STORM_NEAR || t.stormState === STORM_INSIDE) && !t.stormFast) return MISSION_STORM;
  if (t.dawn.threat === AS_T_REST) return MISSION_STRIKE_REST;
  if (t.pt.enabled && t.pt.alive === 0 && t.dawn.reached && call === CALL_DAWN) return MISSION_PT;
  if (call !== 0) return MISSION_CALL;
  if (t.pt.enabled) return MISSION_PT;
  if (pa.enabled) return MISSION_PATROL;
  return MISSION_NORMAL;
}
