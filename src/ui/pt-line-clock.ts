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
// v0.6.6（隼艇。jp_01 のハード）: 隼艇の沈没も輸送隊の出来事の欄（同じフレームの大発の出来事を残す）、決着の出来事に「隼艇は浜に残る」の旗（上陸した大発があり隼艇が浮いているときだけ。
//   全滅には付けない。spec-v066 §N-10）。出来事に足す連射の結果は、その連射の標的が自艇のときだけ（隼艇への連射を自艇の HP で言わない。§N-7）。
// v0.6.9（jp_04。停泊して揚陸する輸送船。spec-v069 R5/F5）: 揚陸の出来事（斉射・被雷・不発・外れ・沈没・揚陸完了。通し番号の増えから LANDING_EVENT_SHOW_MS）も同じ鎖に入れる:
//   赤い線・13mm の出来事・輸送隊の出来事の下では 1 度出るまで待ち、機関の出来事と航過の結果はその下でも待つ（赤い線の間に来た被雷は線が消えてから出る・揚陸の出来事の下で結果を失わない）。
//   t.landing.enabled の任務だけが始める（ほかの任務は landingUntil 0 のまま＝旗も待ちも v0.6.8 と同じ）。
//   R14 A2: 「出た」は機関の出来事と同じく 2 行目に出ていた ms の和が LANDING_EVENT_MIN_SHOWN_MS（2 秒）に届いたとき（届く前に隠れたら待って出し直す）。
//   R14 A1: 輸送船が射線に入る（モード 37。赤い線のすぐ下）の間も、出来事（13mm・輸送隊・揚陸・機関）と航過の結果は待つ（揚陸の無い任務は立たない＝前と同じ）。
// Phaser 非依存・確保しない。毎フレーム flags → missionMode → shown の順に 1 回ずつ。
import { CONVOY_EVENT_SHOW_MS } from '../config/convoy-config';
import { ENGINE_EVENT_MIN_SHOWN_MS, ENGINE_EVENT_SHOW_MS } from '../config/engine-config';
import { LANDING_EVENT_MIN_SHOWN_MS, LANDING_EVENT_SHOW_MS } from '../config/landing-config';
import { PT_RESULT_SHOW_MS } from '../config/pt-config';
import type { BoatTelemetry } from '../core/boat-motion';
import { ENGINE_EV_WARN, ENGINE_WARN } from '../core/engine-trouble';
import { CONVOY_EV_ARRIVED, CONVOY_EV_GB_BEACH, CONVOY_EV_GB_SUNK, CONVOY_EV_KIND, CONVOY_EV_SUNK } from './convoy-lines';
import {
  MISSION_CONVOY_EVENT, MISSION_ENGINE_EVENT, MISSION_LANDING_EVENT, MISSION_PT_GUN_EVENT, MODE_FLAG_CONVOY_EVENT, MODE_FLAG_ENGINE_EVENT, MODE_FLAG_LANDING_EVENT, MODE_FLAG_PT_GUN_EVENT, MODE_FLAG_PT_HOLD, MODE_FLAG_PT_RESULT,
  landingFireLineShown,
} from './mission-mode';
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
  private seenGunboatSunk = false; // 隼艇の沈没を見た（v0.6.6。隼艇のいない任務は偽のまま）
  convoyEvent = 0;
  /** 機関の過熱の出来事（v0.6.5）: 見た出来事の通し番号、表示の終わり ms、出た（2 行目に出ていた ms の和が ENGINE_EVENT_MIN_SHOWN_MS に届いた）、
   * 出ていた ms の和、前のフレームに出ていた・その時刻（shown が次のフレームで和に足す） */
  private seenEngineSeq = 0;
  private engineUntil = 0;
  private engineShown = false;
  private engineOnMs = 0;
  private engineOnPrev = false;
  private prevShownMs = 0;
  /** 揚陸の出来事（v0.6.9。jp_04）: 見た通し番号、表示の終わり ms、出た（2 行目に出ていた ms の和が LANDING_EVENT_MIN_SHOWN_MS に届いた。R14 A2）、出ていた ms の和、前のフレームに出ていた
   * （揚陸の無い任務は landingUntil 0 のまま） */
  private seenLandingSeq = 0;
  private landingUntil = 0;
  private landingShown = false;
  private landingOnMs = 0;
  private landingOnPrev = false;

  /** 毎フレーム（2 行目のモードを決める前）: MODE_FLAG_PT_RESULT・MODE_FLAG_PT_GUN_EVENT・MODE_FLAG_PT_HOLD・MODE_FLAG_CONVOY_EVENT・MODE_FLAG_ENGINE_EVENT・MODE_FLAG_LANDING_EVENT。lastMode は前に組んだ 2 行目のモード。米PT の無い任務は 0 */
  flags(t: BoatTelemetry, nowMs: number, lastMode: number): number {
    const p = t.pt;
    const cv = t.convoy;
    const bargeEvent = cv.enabled && (cv.sunk > this.seenSunk || cv.arrived > this.seenArrived);
    if (bargeEvent) {
      const sunk = cv.sunk > this.seenSunk;
      this.seenSunk = cv.sunk;
      this.seenArrived = cv.arrived;
      // 沈没と上陸はいつも出来事を始める。最後の 1 隻の上陸（決着）は「大発 上陸 k/n ・ 帰投せよ」（ui/convoy-lines。v0.6.4 実機 1 回目のレビュー ux-2: 浜の上陸は 3.3 秒おきで、
      // 前は待っている上陸の出来事を捨てて呼びかけへ回し、呼びかけは赤い線・結果・射撃中の行に負けて「上陸 3/3」がほぼ出なかった）。ただし沈没の出来事が出ている・待っている間の
      // 決着の上陸はそれを残す（afloat 0 の文「沈没 ・ 上陸 k/n ・ 帰投せよ」が決着を言う）
      if (sunk || !(cv.resolved && (this.convoyEvent & CONVOY_EV_KIND) === CONVOY_EV_SUNK && nowMs < this.convoyUntil)) this.startConvoyEvent(sunk ? CONVOY_EV_SUNK : CONVOY_EV_ARRIVED, nowMs);
      if (cv.resolved && cv.arrived > 0 && t.gunboat.enabled && !t.gunboat.sunk) this.convoyEvent |= CONVOY_EV_GB_BEACH; // 決着の出来事の末尾「隼艇は浜に残る」（v0.6.6）
    }
    if (t.gunboat.sunk && !this.seenGunboatSunk && !bargeEvent) this.startConvoyEvent(CONVOY_EV_GB_SUNK, nowMs); // 「隼艇 沈没 ・ 大発は自艇で守れ」（v0.6.6。同じフレームの大発の出来事を残す）
    this.seenGunboatSunk = t.gunboat.sunk;
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
    const ld = t.landing;
    if (ld.enabled && ld.eventSeq > this.seenLandingSeq) {
      // 新しい揚陸の出来事（v0.6.9）: 今から LANDING_EVENT_SHOW_MS、まだ出ていない（出ている・待っている前の出来事は替わる。文は今の出来事）
      this.seenLandingSeq = ld.eventSeq;
      this.landingUntil = nowMs + LANDING_EVENT_SHOW_MS;
      this.landingShown = false;
      this.landingOnMs = 0;
      this.landingOnPrev = false;
    }
    if (p.passSeq > this.seenPassSeq) {
      this.seenPassSeq = p.passSeq;
      if (p.burstFired && p.gunEventBoat === p.lastPassBoat && p.lastPassTargetKind === 0 && nowMs < this.eventUntil) {
        // 同じ PT の連射の結果は出来事の行へ（出来事は今から少なくとも PT_RESULT_SHOW_MS）
        this.merge = mergeBurstBits(p);
        this.eventUntil = Math.max(this.eventUntil, nowMs + PT_RESULT_SHOW_MS);
        this.resultUntil = 0;
      } else this.resultUntil = nowMs + PT_RESULT_SHOW_MS;
    }
    // 攻撃が終わって弾がまだ飛んでいる間は赤い線の行を前のキーのまま保つ（ptHoldPass。結果の前に追ってくる PT・射撃中の行が一瞬出ない）
    const hold = ptHoldPass(t, lastMode);
    const passShown = (p.passing && !p.passTargetLost) || hold; // 標的の大発を失った航過は赤い線の行を出さない（mission-mode と同じ。v0.6.4 レビュー ux-3）
    // 輸送船が射線に入る（v0.6.9 R14 A1。モード 37＝赤い線のすぐ下。揚陸の無い任務は偽）: 出来事と航過の結果はその下でも待つ
    const fire = landingFireLineShown(t);
    const above = passShown || fire;
    this.eventUntil = holdShowUntil(this.eventUntil, above && !this.eventShown, nowMs);
    // 輸送隊の出来事は赤い線・13mm の出来事の下で 1 度出るまで待ち、航過の結果はそのどちらの下でも待つ（輸送隊の無い任務は convoyUntil 0 のまま＝v0.6.3 と同じ）
    this.convoyUntil = holdShowUntil(this.convoyUntil, (above || nowMs < this.eventUntil) && !this.convoyShown, nowMs, CONVOY_EVENT_SHOW_MS);
    // 揚陸の出来事は赤い線・13mm の出来事・輸送隊の出来事の下で出たとみなすまで待つ（v0.6.9。R5・R14 A2。揚陸の無い任務は landingUntil 0 のまま）
    this.landingUntil = holdShowUntil(this.landingUntil, (above || nowMs < this.eventUntil || nowMs < this.convoyUntil) && !this.landingShown, nowMs, LANDING_EVENT_SHOW_MS);
    // 機関の過熱の出来事は赤い線・13mm の出来事・輸送隊の出来事（・揚陸の出来事）の下で 1 度出るまで待ち、航過の結果はその下でも待つ（v0.6.5）
    this.engineUntil = holdShowUntil(this.engineUntil, (above || nowMs < this.eventUntil || nowMs < this.convoyUntil || nowMs < this.landingUntil) && !this.engineShown, nowMs, ENGINE_EVENT_SHOW_MS);
    this.resultUntil = holdShowUntil(this.resultUntil, !passShown && (fire || nowMs < this.eventUntil || nowMs < this.convoyUntil || nowMs < this.landingUntil || nowMs < this.engineUntil), nowMs);
    return (
      (nowMs < this.resultUntil ? MODE_FLAG_PT_RESULT : 0) | (nowMs < this.eventUntil ? MODE_FLAG_PT_GUN_EVENT : 0) | (hold ? MODE_FLAG_PT_HOLD : 0) | (nowMs < this.convoyUntil ? MODE_FLAG_CONVOY_EVENT : 0) |
      (nowMs < this.engineUntil ? MODE_FLAG_ENGINE_EVENT : 0) | (nowMs < this.landingUntil ? MODE_FLAG_LANDING_EVENT : 0)
    );
  }

  /** 輸送隊の出来事を始める（種類 CONVOY_EV_*。今から CONVOY_EVENT_SHOW_MS、まだ出ていない） */
  private startConvoyEvent(kind: number, nowMs: number): void {
    this.convoyEvent = kind;
    this.convoyUntil = nowMs + CONVOY_EVENT_SHOW_MS;
    this.convoyShown = false;
  }

  /**
   * そのフレームのモードが決まった後（nowMs は flags と同じ時刻）: 出来事の行が出たら、もう赤い線の下で待たない（R2。輸送隊の出来事も同じ）。
   * 機関の過熱の出来事と揚陸の出来事（R14 A2）は、前のフレームから今までそれが出ていた ms を足し、和が ENGINE_EVENT_MIN_SHOWN_MS・LANDING_EVENT_MIN_SHOWN_MS に届いたら出たとみなす（ux-2）
   */
  shown(mode: number, nowMs: number): void {
    if (mode === MISSION_PT_GUN_EVENT) this.eventShown = true;
    if (mode === MISSION_CONVOY_EVENT) this.convoyShown = true;
    const dMs = nowMs - this.prevShownMs;
    if (this.engineOnPrev) this.engineOnMs += dMs;
    if (this.landingOnPrev) this.landingOnMs += dMs;
    this.engineOnPrev = mode === MISSION_ENGINE_EVENT;
    this.landingOnPrev = mode === MISSION_LANDING_EVENT;
    this.prevShownMs = nowMs;
    if (this.engineOnMs >= ENGINE_EVENT_MIN_SHOWN_MS) this.engineShown = true;
    if (this.landingOnMs >= LANDING_EVENT_MIN_SHOWN_MS) this.landingShown = true;
  }
}
