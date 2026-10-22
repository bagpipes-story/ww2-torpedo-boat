// 米PT の 2 行目の時刻の旗（v0.6.3 実機 2 回目のレビュー R2・ux-3 で ui/mission-line から切り出した。tests/pt-gun-result の夜の行も同じものを使う＝写しが本体とずれない）:
// 航過・連射の結果と T-14 の 13mm の出来事を、通し番号が増えてから PT_RESULT_SHOW_MS 出す。赤い線 > 出来事 > 結果で、上の行に隠れている間は始めない（ui/pt-gun-lines の holdShowUntil）。
// R2: 出来事は 1 度も出ていない間だけ赤い線の下で待つ。出た後に次の赤い線に替わられたら、その時計のまま終わる（前は線のたびに 2.5 秒から出し直した。連射の合間は 2 秒なので、
//   相方の線の後に「制圧！ 追撃をやめて離れる」がもう一度まるごと出て、その PT はもう追撃に戻っていた）。
// ux-3: 連射の結果が同じ PT の 13mm の出来事（制圧・撃退・撃沈）とまだ出ている・待っている間に届いたら、結果は出来事の行に足して 1 行で出す（前は出来事の 2.5 秒の後が結果の番で、
//   連射の合間 2 秒に次の線が来て、撃ち返す遊び方で連射の結果の 26% が出なかった）。
// v0.6.4（jp_01。味方の大発の輸送隊）: 大発の沈没・上陸の出来事も同じ作法（上陸・沈没の数の立ち上がりから CONVOY_EVENT_SHOW_MS。赤い線・13mm の出来事の下では 1 度出るまで待ち、
//   航過の結果はその下で待つ＝沈んだ航過の結果「大発への航過 撃たず」は出来事の後に出る）。最後の 1 隻の上陸は出来事を出さず呼びかけ「大発 上陸 k/n ・ 帰投せよ」へ。
// Phaser 非依存・確保しない。毎フレーム flags → missionMode → shown の順に 1 回ずつ。
import { CONVOY_EVENT_SHOW_MS } from '../config/convoy-config';
import { PT_RESULT_SHOW_MS } from '../config/pt-config';
import type { BoatTelemetry } from '../core/boat-motion';
import { CONVOY_EV_ARRIVED, CONVOY_EV_SUNK } from './convoy-lines';
import { MISSION_CONVOY_EVENT, MISSION_PT_GUN_EVENT, MODE_FLAG_CONVOY_EVENT, MODE_FLAG_PT_GUN_EVENT, MODE_FLAG_PT_HOLD, MODE_FLAG_PT_RESULT } from './mission-mode';
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

  /** 毎フレーム（2 行目のモードを決める前）: MODE_FLAG_PT_RESULT・MODE_FLAG_PT_GUN_EVENT・MODE_FLAG_PT_HOLD・MODE_FLAG_CONVOY_EVENT。lastMode は前に組んだ 2 行目のモード。米PT の無い任務は 0 */
  flags(t: BoatTelemetry, nowMs: number, lastMode: number): number {
    const p = t.pt;
    const cv = t.convoy;
    if (cv.enabled && (cv.sunk > this.seenSunk || cv.arrived > this.seenArrived)) {
      const sunk = cv.sunk > this.seenSunk;
      this.seenSunk = cv.sunk;
      this.seenArrived = cv.arrived;
      // 最後の 1 隻の上陸（決着）は出来事を出さず呼びかけへ。沈没はいつも出す（全滅・上陸 k/n と帰投）
      if (sunk || !cv.resolved) {
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
    const passShown = p.passing || hold;
    this.eventUntil = holdShowUntil(this.eventUntil, passShown && !this.eventShown, nowMs);
    // 輸送隊の出来事は赤い線・13mm の出来事の下で 1 度出るまで待ち、航過の結果はそのどちらの下でも待つ（輸送隊の無い任務は convoyUntil 0 のまま＝v0.6.3 と同じ）
    this.convoyUntil = holdShowUntil(this.convoyUntil, (passShown || nowMs < this.eventUntil) && !this.convoyShown, nowMs);
    this.resultUntil = holdShowUntil(this.resultUntil, !passShown && (nowMs < this.eventUntil || nowMs < this.convoyUntil), nowMs);
    return (nowMs < this.resultUntil ? MODE_FLAG_PT_RESULT : 0) | (nowMs < this.eventUntil ? MODE_FLAG_PT_GUN_EVENT : 0) | (hold ? MODE_FLAG_PT_HOLD : 0) | (nowMs < this.convoyUntil ? MODE_FLAG_CONVOY_EVENT : 0);
  }

  /** そのフレームのモードが決まった後: 出来事の行が出たら、もう赤い線の下で待たない（R2。輸送隊の出来事も同じ） */
  shown(mode: number): void {
    if (mode === MISSION_PT_GUN_EVENT) this.eventShown = true;
    if (mode === MISSION_CONVOY_EVENT) this.convoyShown = true;
  }
}
