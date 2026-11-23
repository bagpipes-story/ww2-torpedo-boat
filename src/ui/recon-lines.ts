// 報告の任務（v0.8.2 S4。us_05）の 2 行目の出来事の時計（spec-v0820 §4.13 D-H1、lead の L42）。ui/strait-line-clock が 1 つ持ち flags・shown を毎フレーム呼ぶ（レーダー・止まった艦の
// 出来事と同じ作法: 2 行目に出ていた ms の和が RECON_EVENT_SHOW_MS に届くまで旗＝上の行に隠れている間は待つ。モードは止まった艦の出来事のすぐ下＝ui/mission-mode の 42）。文は ui/recon-texts。
// 出来事はテレメトリの数の変わり目で拾う（1 フレームに固定ステップが幾つあっても読み落とさない）: 確かめた秒・無線が壊れた・送った秒・中継した秒・戦艦と重巡への沈まなかった命中の回数・
// 弾薬庫の誘爆の数。出ている間に来た出来事は後ろに 1 つ待たせる（待っている物に替わるのは同じかより重い物だけ）。無線と誘爆は出ている出来事に替わり、替わられた物は空いていれば待つ。
// 命中が続けば（扇の 2 本目・3 本目）出ている命中に替わって本数を言い直す。誘爆の文は音の警報の合図にしない（音の層はこのファイルを import しない＝tests/sfx-rules）。
// 無線の方位は出来事の 1 回だけ（atan2。自艇から中継の輪へ＝§9 の 6）。Phaser・DOM を読まない。確保は出来事の文を組む時だけ。
import { RECON_EVENT_SHOW_MS } from '../config/recon-hud-config';
import type { BoatTelemetry } from '../core/boat-telemetry';
import { bearingJa } from '../core/briefing';
import { MISSION_RECON_EVENT, MODE_FLAG_RECON_EVENT } from './mission-mode';
import {
  RECON_BOOM_JA, RECON_LN_BOOM, RECON_LN_CAP, RECON_LN_NONE, RECON_LN_RADIO, RECON_LN_RELAYED, RECON_LN_SEEN, RECON_LN_SENT, RECON_RELAYED_JA, reconCapHitLineJa, reconLineWeight, reconRadioLineJa,
  reconSeenLineJa, reconSentLineJa, type ReconLineView,
} from './recon-texts';

export { RECON_LN_BOOM, RECON_LN_CAP, RECON_LN_NONE, RECON_LN_RADIO, RECON_LN_RELAYED, RECON_LN_SEEN, RECON_LN_SENT } from './recon-texts';

export class ReconLineClock implements ReconLineView {
  /** 出している出来事（RECON_LN_*）と文 */
  kind = RECON_LN_NONE;
  text = '';
  /** 始めた通し番号・出ていた ms の和・前のフレームに出ていた・後ろに待つ出来事と文 */
  private seq = 0; private onMs = 0; private onPrev = false; private prevShownMs = 0;
  private nextKind = RECON_LN_NONE; private nextText = '';
  /** 見た物: 確かめた・無線・送った・中継した・沈まなかった命中の回数・誘爆の数 */
  private seen = false; private radio = false; private sent = false; private relayed = false; private capSeen = 0; private boomSeen = 0;
  /** 2 行目のキー（ui/mission-line-keys の lKey）: 始めた通し番号 */
  get key(): number { return this.seq; }

  /** 毎フレーム（モードを決める前）: MODE_FLAG_RECON_EVENT。報告の無い任務は 0 */
  flags(t: BoatTelemetry, nowMs: number): number {
    const r = t.recon;
    if (!r) return 0;
    if (!this.seen && !Number.isNaN(r.seenAtS)) { this.seen = true; this.push(RECON_LN_SEEN, reconSeenLineJa(r.identifyJa, Math.round(r.trackedS + r.trackLeftS))); }
    if (!this.radio && r.radioBroken) { this.radio = true; this.push(RECON_LN_RADIO, reconRadioLineJa(bearingJa((Math.atan2(r.relayDx, -r.relayDy) * 180) / Math.PI), r.relayJa)); }
    if (!this.sent && !Number.isNaN(r.sentAtS)) { this.sent = true; this.push(RECON_LN_SENT, reconSentLineJa(r.identifyJa, r.seenCount, r.fleetJa)); }
    if (!this.relayed && !Number.isNaN(r.relayedAtS)) { this.relayed = true; this.push(RECON_LN_RELAYED, RECON_RELAYED_JA); }
    if (r.capHits > this.capSeen) { this.capSeen = r.capHits; this.push(RECON_LN_CAP, reconCapHitLineJa(r.capHitJa, r.capHitN)); }
    const boom = t.magazine ? t.magazine.detonations : 0;
    if (boom > this.boomSeen) { this.boomSeen = boom; this.push(RECON_LN_BOOM, RECON_BOOM_JA); }
    if (this.kind !== RECON_LN_NONE && this.onMs >= RECON_EVENT_SHOW_MS) {
      if (this.nextKind !== RECON_LN_NONE) this.start(this.nextKind, this.nextText);
      else this.kind = RECON_LN_NONE;
      this.nextKind = RECON_LN_NONE;
    }
    return this.kind !== RECON_LN_NONE ? MODE_FLAG_RECON_EVENT : 0;
  }

  /** モードが決まった後（nowMs は flags と同じ時刻）: 前のフレームから今まで出ていた ms を足す */
  shown(mode: number, nowMs: number): void {
    if (this.onPrev) this.onMs += nowMs - this.prevShownMs;
    this.onPrev = mode === MISSION_RECON_EVENT;
    this.prevShownMs = nowMs;
  }

  /** 出来事を出す（今出していなければ今から。無線・誘爆は出ている物に替わり、命中は出ている命中を言い直す。ほかは後ろに 1 つ） */
  private push(kind: number, text: string): void {
    const cur = this.kind;
    if (cur === RECON_LN_NONE || (kind === RECON_LN_CAP && cur === RECON_LN_CAP)) return this.start(kind, text);
    if (reconLineWeight(kind) >= reconLineWeight(RECON_LN_RADIO) && reconLineWeight(kind) >= reconLineWeight(cur)) {
      if (cur !== RECON_LN_CAP && this.nextKind === RECON_LN_NONE) { this.nextKind = cur; this.nextText = this.text; }
      return this.start(kind, text);
    }
    if (this.nextKind === RECON_LN_NONE || reconLineWeight(kind) >= reconLineWeight(this.nextKind)) { this.nextKind = kind; this.nextText = text; }
  }

  private start(kind: number, text: string): void {
    this.kind = kind;
    this.text = text;
    this.onMs = 0;
    this.seq++;
  }
}
