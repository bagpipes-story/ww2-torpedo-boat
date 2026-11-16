// 海峡の夜（v0.8.0 S4。us_04）の 2 行目の出来事の時計（spec-v0800 §4.9「1 回・4 秒（今の出来事の文の待ちの鎖に入れる）」、brief L26・L28）。ui/pt-line-clock が 1 つ持ち、
// その flags・shown から毎フレーム呼ぶ（2 行目のモードを決める前・決めた後。機関・揚陸の出来事と同じ作法: 2 行目に出ていた ms の和が STRAIT_EVENT_SHOW_MS に届くまで旗を立てる＝
// 上の行に隠れている間は待ち、隠れなくなってから 4 秒出す）。
// - レーダーの出来事（t.radar だけを読む。文は ui/radar-lines が出来事の時に 1 回組む）: 夜の最初の接触・接触が増えた（10 秒に 1 回まで）・東の縁で消えた（1 夜に 1 回）・
//   東へ消えた後に東の縁に現れた（1 夜に 1 回）。出ている間に次が来たら後ろに 1 つ待たせる（待っているものに替わるのは同じかより重い出来事だけ）。
// - 衝突の危険（t.strait の bowOnMask・bowOnM）: 艦のビットが新しく立った時（1 回の接近で 1 回。円錐か距離の外へ出れば次に備える）から 4 秒。距離は危険の間は毎フレームの一番近い艦まで。
// レーダーも列の通過も無い任務は何も始めない（旗は 0 のまま＝ほかの任務は 1 ビットも変わらない）。Phaser・DOM を読まない。確保は出来事の文を組む時だけ。
import { BOW_ON_STEP_M, RADAR_NEW_MIN_GAP_MS, STRAIT_EVENT_SHOW_MS } from '../config/strait-hud-config';
import type { BoatTelemetry } from '../core/boat-telemetry';
import { MISSION_BOW_ON, MISSION_RADAR_EVENT, MODE_FLAG_BOW_ON, MODE_FLAG_RADAR_EVENT } from './mission-mode';
import { RADAR_EV_FIRST, RADAR_EV_NEW, RADAR_EV_NONE, RADAR_EV_RETURN, RADAR_EV_VILA, radarEventLineJa, radarLostAtEastEdge, radarNewAtEastEdge } from './radar-lines';

export class StraitLineClock {
  /** 見たレーダーの出来事（最初の接触・新しい接触と消えた接触の回数）・1 夜に 1 回の 2 つ・最後に「新しい接触」を始めた ms */
  private seenFirst = false;
  private seenNew = 0;
  private seenLost = 0;
  private vilaDone = false;
  private returnDone = false;
  private lastNewMs = -Infinity;
  /** 2 行目に出すレーダーの出来事（RADAR_EV_*）と文・出ていた ms の和・前のフレームに出ていた、その後ろに 1 つ待つ出来事 */
  radarKind = RADAR_EV_NONE;
  radarText = '';
  private radarOnMs = 0;
  private radarOnPrev = false;
  private nextKind = RADAR_EV_NONE;
  private nextText = '';
  /** 始めたレーダーの出来事の通し番号（2 行目のキー） */
  private radarSeq = 0;
  /** 衝突の危険: 前のフレームの艦のビット・始めた回数・出ている・出ていた ms の和・前のフレームに出ていた・距離の刻み（BOW_ON_STEP_M の数。1 以上） */
  private prevMask = 0;
  private bowSeq = 0;
  private bowActive = false;
  private bowOnMs = 0;
  private bowOnPrev = false;
  bowStep = 1;
  private prevShownMs = 0;

  /** 2 行目のキー（ui/mission-line-keys の lKey）: レーダーの出来事は通し番号、衝突の危険は通し番号と距離の刻み */
  get radarKey(): number {
    return this.radarSeq;
  }
  get bowKey(): number {
    return this.bowSeq * 64 + this.bowStep;
  }

  /** 毎フレーム（2 行目のモードを決める前）: MODE_FLAG_RADAR_EVENT・MODE_FLAG_BOW_ON。レーダーも列の通過も無い任務は 0 */
  flags(t: BoatTelemetry, nowMs: number): number {
    const r = t.radar;
    if (r && r.enabled) {
      if (!this.seenFirst && !Number.isNaN(r.firstS)) {
        this.seenFirst = true;
        this.push(RADAR_EV_FIRST, t);
      }
      if (r.newCount > this.seenNew) {
        this.seenNew = r.newCount;
        if (this.vilaDone && !this.returnDone && radarNewAtEastEdge(r)) {
          this.returnDone = true;
          this.push(RADAR_EV_RETURN, t);
        } else if (nowMs - this.lastNewMs >= RADAR_NEW_MIN_GAP_MS) {
          this.lastNewMs = nowMs;
          this.push(RADAR_EV_NEW, t);
        }
      }
      if (r.lostCount > this.seenLost) {
        this.seenLost = r.lostCount;
        if (!this.vilaDone && radarLostAtEastEdge(r)) {
          this.vilaDone = true;
          this.push(RADAR_EV_VILA, t);
        }
      }
      if (this.radarKind !== RADAR_EV_NONE && this.radarOnMs >= STRAIT_EVENT_SHOW_MS) {
        // 出し終えた: 待っていた出来事があれば今から
        if (this.nextKind !== RADAR_EV_NONE) this.start(this.nextKind, this.nextText);
        else this.radarKind = RADAR_EV_NONE;
        this.nextKind = RADAR_EV_NONE;
      }
    }
    const st = t.strait;
    if (st && st.enabled) {
      const fresh = st.bowOnMask & ~this.prevMask;
      this.prevMask = st.bowOnMask;
      if (!Number.isNaN(st.bowOnM)) this.bowStep = Math.max(1, Math.ceil(st.bowOnM / BOW_ON_STEP_M));
      if (fresh !== 0) {
        this.bowSeq++;
        this.bowActive = true;
        this.bowOnMs = 0;
      } else if (this.bowActive && this.bowOnMs >= STRAIT_EVENT_SHOW_MS) {
        this.bowActive = false;
      }
    }
    return (this.radarKind !== RADAR_EV_NONE ? MODE_FLAG_RADAR_EVENT : 0) | (this.bowActive ? MODE_FLAG_BOW_ON : 0);
  }

  /** そのフレームのモードが決まった後（nowMs は flags と同じ時刻）: 前のフレームから今まで出ていた ms を足す */
  shown(mode: number, nowMs: number): void {
    const dMs = nowMs - this.prevShownMs;
    if (this.radarOnPrev) this.radarOnMs += dMs;
    if (this.bowOnPrev) this.bowOnMs += dMs;
    this.radarOnPrev = mode === MISSION_RADAR_EVENT;
    this.bowOnPrev = mode === MISSION_BOW_ON;
    this.prevShownMs = nowMs;
  }

  /** 出来事を出す（今出していなければ今から、出している間は後ろに 1 つ。文は今のテレメトリから 1 回だけ組む） */
  private push(kind: number, t: BoatTelemetry): void {
    const text = radarEventLineJa(kind, t.radar);
    if (this.radarKind === RADAR_EV_NONE) {
      this.start(kind, text);
      return;
    }
    if (this.nextKind === RADAR_EV_NONE || kind >= this.nextKind) {
      this.nextKind = kind;
      this.nextText = text;
    }
  }

  private start(kind: number, text: string): void {
    this.radarKind = kind;
    this.radarText = text;
    this.radarOnMs = 0;
    this.radarSeq++;
  }
}
