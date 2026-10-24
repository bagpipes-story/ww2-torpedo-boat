// 米PT の 2 行目の時刻の旗（v0.6.3 実機 2 回目のレビュー R2・ux-3 で ui/mission-line から切り出した。tests/pt-gun-result の夜の行も同じものを使う＝写しが本体とずれない）:
// 航過・連射の結果と T-14 の 13mm の出来事を、通し番号が増えてから PT_RESULT_SHOW_MS 出す。赤い線 > 出来事 > 結果で、上の行に隠れている間は始めない（ui/pt-gun-lines の holdShowUntil）。
// R2: 出来事は 1 度も出ていない間だけ赤い線の下で待つ。出た後に次の赤い線に替わられたら、その時計のまま終わる（前は線のたびに 2.5 秒から出し直した。連射の合間は 2 秒なので、
//   相方の線の後に「制圧！ 追撃をやめて離れる」がもう一度まるごと出て、その PT はもう追撃に戻っていた）。
// ux-3: 連射の結果が同じ PT の 13mm の出来事（制圧・撃退・撃沈）とまだ出ている・待っている間に届いたら、結果は出来事の行に足して 1 行で出す（前は出来事の 2.5 秒の後が結果の番で、
//   連射の合間 2 秒に次の線が来て、撃ち返す遊び方で連射の結果の 26% が出なかった）。
// v0.6.4（jp_01。味方の大発の輸送隊）: 大発の沈没・上陸の出来事も同じ作法（上陸・沈没の数の立ち上がりから CONVOY_EVENT_SHOW_MS。赤い線・13mm の出来事の下では 1 度出るまで待ち、
//   航過の結果はその下で待つ＝沈んだ航過の結果「大発への航過 撃たず」は出来事の後に出る）。最後の 1 隻の上陸（決着）は出来事「大発 上陸 k/n ・ 帰投せよ」（実機 1 回目のレビュー ux-2）。
// v0.6.5（jp_05。機関の不調）: 過熱の出来事（熱が warn_heat を下から越えた）も同じ作法（ENGINE_EVENT_SHOW_MS。赤い線・13mm の出来事・輸送隊の出来事の下では待ち、
//   航過の結果はその下でも待つ）。段が過熱でなくなったら（限界・不調へ進んだ・冷えた）待っている出来事は捨てる（右下の帯と札・限界の行が今の段を言う）。
//   レビュー ux-2: 「出た」は 2 行目に出ていた ms の和が ENGINE_EVENT_MIN_SHOWN_MS（2 秒）に届いたとき（前は 1 フレーム出たら出たとみなし、1 秒で赤い線に替わられると
//   規則の文「巡航以下で冷える」が二度と出なかった）。届く前に赤い線などに隠れたら、隠れている間は待ち、消えた後にまた ENGINE_EVENT_SHOW_MS 出す。
// Phaser 非依存・確保しない。毎フレーム flags → missionMode → shown の順に 1 回ずつ。
import { CONVOY_EVENT_SHOW_MS } from '../config/convoy-config';
import { ENGINE_EVENT_MIN_SHOWN_MS, ENGINE_EVENT_SHOW_MS } from '../config/engine-config';
import { PT_RESULT_SHOW_MS } from '../config/pt-config';
import type { BoatTelemetry } from '../core/boat-motion';
import { ENGINE_EV_WARN, ENGINE_WARN } from '../core/engine-trouble';
import { CONVOY_EV_ARRIVED, CONVOY_EV_SUNK } from './convoy-lines';
import { MISSION_CONVOY_EVENT, MISSION_ENGINE_EVENT, MISSION_PT_GUN_EVENT, MODE_FLAG_CONVOY_EVENT, MODE_FLAG_ENGINE_EVENT, MODE_FLAG_PT_GUN_EVENT, MODE_FLAG_PT_HOLD, MODE_FLAG_PT_RESULT } from './mission-mode';
import { ptHoldPass } from './pt-chase-lines';
import { holdShowUntil, mergeBurstBits } from './pt-gun-lines';

export class PtLineClock {
  /** 見た攻撃の結果の通し番号とその表示の終わり ms */
  private seenPassSeq = 0;
  private resultUntil = 0;
  /** 見た 13mm の出来事の通し番号とその表示の終わり ms、その出来事が 1 度でも 2 行目に出た */
  private seenEventSeq = 0;
  private eventUntil = 0;
  private eventShown = false;
  /** 出来事の行に足した連射の結果（ui/pt-gun-lines の mergeBurstBits。0 は足していない）。ptKey が出来事のキーに足す */
  merge = 0;
  /** 輸送隊の出来事（v0.6.4）: 見た上陸・沈没の数、表示の終わり ms、1 度でも 2 行目に出た、種類（CONVOY_EV_*。ui/convoy-lines の convoyEventLine と convoyKey が読む） */
  private seenArrived = 0;
  private seenSunk = 0;
  private convoyUntil = 0;
  private convoyShown = false;
  convoyEvent = 0;
  /** 機関の過熱の出来事（v0.6.5）: 見た出来事の通し番号、表示の終わり ms、出た（2 行目に出ていた ms の和が ENGINE_EVENT_MIN_SHOWN_MS に届いた）、
   * 出ていた ms の和、前のフレームに出ていた・その時刻（shown が次のフレームで和に足す） */
  private seenEngineSeq = 0;
  private engineUntil = 0;
  private engineShown = false;
  private engineOnMs = 0;
  private engineOnPrev = false;
  private prevShownMs = 0;

  /** 毎フレーム（2 行目のモードを決める前）: MODE_FLAG_PT_RESULT・MODE_FLAG_PT_GUN_EVENT・MODE_FLAG_PT_HOLD・MODE_FLAG_CONVOY_EVENT・MODE_FLAG_ENGINE_EVENT。lastMode は前に組んだ 2 行目のモード。米PT の無い任務は 0 */
  flags(t: BoatTelemetry, nowMs: number, lastMode: number): number {
    const p = t.pt;
    const cv = t.convoy;
    if (cv.enabled && (cv.sunk > this.seenSunk || cv.arrived > this.seenArrived)) {
      const sunk = cv.sunk > this.seenSunk;
      this.seenSunk = cv.sunk;
      this.seenArrived = cv.arrived;
      // 沈没と上陸はいつも出来事を始める。最後の 1 隻の上陸（決着）は「大発 上陸 k/n ・ 帰投せよ」（ui/convoy-lines。v0.6.4 実機 1 回目のレビュー ux-2: 浜の上陸は 3.3 秒おきで、
      // 前は待っている上陸の出来事を捨てて呼びかけへ回し、呼びかけは赤い線・結果・射撃中の行に負けて「上陸 3/3」がほぼ出なかった）。ただし沈没の出来事が出ている・待っている間の
      // 決着の上陸はそれを残す（afloat 0 の文「沈没 ・ 上陸 k/n ・ 帰投せよ」が決着を言う）
      if (sunk || !(cv.resolved && this.convoyEvent === CONVOY_EV_SUNK && nowMs < this.convoyUntil)) {
        this.convoyEvent = sunk ? CONVOY_EV_SUNK : CONVOY_EV_ARRIVED;
        this.convoyUntil = nowMs + CONVOY_EVENT_SHOW_MS;
        this.convoyShown = false;
      }
    }
    if (p.gunEventSeq > this.seenEventSeq) {
      this.seenEventSeq = p.gunEventSeq;
      this.eventUntil = nowMs + PT_RESULT_SHOW_MS;
      this.eventShown = false;
      this.merge = 0;
    }
    const e = t.engine;
    if (e.on && e.eventSeq > this.seenEngineSeq) {
      this.seenEngineSeq = e.eventSeq;
      if (e.lastEvent === ENGINE_EV_WARN) {
        this.engineUntil = nowMs + ENGINE_EVENT_SHOW_MS;
        this.engineShown = false;
        this.engineOnMs = 0;
        this.engineOnPrev = false;
      }
    }
    if (e.stage !== ENGINE_WARN) this.engineUntil = 0; // 過熱の段のままの間だけ（機関の無い任務は 0 のまま）
    if (p.passSeq > this.seenPassSeq) {
      this.seenPassSeq = p.passSeq;
      if (p.burstFired && p.gunEventBoat === p.lastPassBoat && nowMs < this.eventUntil) {
        // 同じ PT の連射の結果は出来事の行へ（出来事は今から少なくとも PT_RESULT_SHOW_MS）
        this.merge = mergeBurstBits(p);
        this.eventUntil = Math.max(this.eventUntil, nowMs + PT_RESULT_SHOW_MS);
        this.resultUntil = 0;
      } else this.resultUntil = nowMs + PT_RESULT_SHOW_MS;
    }
    // 攻撃が終わって弾がまだ飛んでいる間は赤い線の行を前のキーのまま保つ（ptHoldPass。結果の前に追ってくる PT・射撃中の行が一瞬出ない）
    const hold = ptHoldPass(t, lastMode);
    const passShown = (p.passing && !p.passTargetLost) || hold; // 標的の大発を失った航過は赤い線の行を出さない（mission-mode と同じ。v0.6.4 レビュー ux-3）
    this.eventUntil = holdShowUntil(this.eventUntil, passShown && !this.eventShown, nowMs);
    // 輸送隊の出来事は赤い線・13mm の出来事の下で 1 度出るまで待ち、航過の結果はそのどちらの下でも待つ（輸送隊の無い任務は convoyUntil 0 のまま＝v0.6.3 と同じ）
    this.convoyUntil = holdShowUntil(this.convoyUntil, (passShown || nowMs < this.eventUntil) && !this.convoyShown, nowMs, CONVOY_EVENT_SHOW_MS);
    // 機関の過熱の出来事は赤い線・13mm の出来事・輸送隊の出来事の下で 1 度出るまで待ち、航過の結果はその下でも待つ（v0.6.5）
    this.engineUntil = holdShowUntil(this.engineUntil, (passShown || nowMs < this.eventUntil || nowMs < this.convoyUntil) && !this.engineShown, nowMs, ENGINE_EVENT_SHOW_MS);
    this.resultUntil = holdShowUntil(this.resultUntil, !passShown && (nowMs < this.eventUntil || nowMs < this.convoyUntil || nowMs < this.engineUntil), nowMs);
    return (
      (nowMs < this.resultUntil ? MODE_FLAG_PT_RESULT : 0) | (nowMs < this.eventUntil ? MODE_FLAG_PT_GUN_EVENT : 0) | (hold ? MODE_FLAG_PT_HOLD : 0) | (nowMs < this.convoyUntil ? MODE_FLAG_CONVOY_EVENT : 0) |
      (nowMs < this.engineUntil ? MODE_FLAG_ENGINE_EVENT : 0)
    );
  }

  /**
   * そのフレームのモードが決まった後（nowMs は flags と同じ時刻）: 出来事の行が出たら、もう赤い線の下で待たない（R2。輸送隊の出来事も同じ）。
   * 機関の過熱の出来事は、前のフレームから今までそれが出ていた ms を足し、和が ENGINE_EVENT_MIN_SHOWN_MS に届いたら出たとみなす（ux-2）
   */
  shown(mode: number, nowMs: number): void {
    if (mode === MISSION_PT_GUN_EVENT) this.eventShown = true;
    if (mode === MISSION_CONVOY_EVENT) this.convoyShown = true;
    if (this.engineOnPrev) this.engineOnMs += nowMs - this.prevShownMs;
    this.engineOnPrev = mode === MISSION_ENGINE_EVENT;
    this.prevShownMs = nowMs;
    if (this.engineOnMs >= ENGINE_EVENT_MIN_SHOWN_MS) this.engineShown = true;
  }
}
