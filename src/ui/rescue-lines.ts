// 救助の任務（v0.8.5 S4。us_07）の 2 行目の出来事の時計（spec-v0850 §8.2 のモード 46）。ui/strait-line-clock が 1 つ持ち flags・shown を毎フレーム呼ぶ（レーダー・止まった艦・報告の
// 出来事と同じ作法: 2 行目に出ていた ms の和が RESCUE_EVENT_SHOW_MS に届くまで旗＝上の行に隠れている間は待つ）。文は ui/rescue-texts。
// 出来事はテレメトリの数の変わり目で拾う（1 フレームに固定ステップが幾つあっても読み落とさない）:
// - 収容した・移した: 拾った／移した 1 名ごとの通し番号を足しておき、拾う／移すのが止まった時に 1 回（群を替えながら続けて拾えば 1 つにまとめる）。
// - 40 名を渡した（1 回。v0.8.5 IP3: 味方の艇が出れば文に足す）・フィッチの砲火で S ボートが退いた（退いた通し番号）・S ボートが来た（隊を初めて見たか、隊に初めて見つかった時。1 回）・第二波が出た（v0.8.5 IP2。1 回）・
//   砲弾で生存者を失った（通し番号。IP2 から生存者の海へ撃った弾なら文を替える）・
//   機雷が見えた（見えた通し番号。方角と距離は出来事の 1 回だけ atan2・平方根）・触雷（爆発の通し番号。HP の減りは前のフレームの HP から）。
// 出ている間に来た出来事: 同じ種類は数を足して言い直す（砲弾・機雷）、重い物は出ている物に替わり（替わられた物は空いていれば後ろに待つ）、軽い物は後ろに 1 つ待つ。
// 旗は出来事がある間 MODE_FLAG_RESCUE_EVENT、急ぎ（S ボート・砲弾・機雷・触雷）の間は MODE_FLAG_RESCUE_URGENT も（ui/mission-mode が米PT の赤い線のすぐ下に出す）。
// 救助の無い任務は旗 0 のまま（ほかの任務は 1 ビットも変わらない）。音の警報の合図にしない（音の層はこのファイルを import しない＝tests/sfx-rules）。Phaser・DOM を読まない。
import { RESCUE_EVENT_SHOW_MS, RESCUE_MINE_STEP_M } from '../config/rescue-hud-config';
import type { BoatTelemetry } from '../core/boat-telemetry';
import { bearingJa } from '../core/briefing';
import { MISSION_RESCUE_EVENT, MODE_FLAG_RESCUE_EVENT, MODE_FLAG_RESCUE_URGENT } from './mission-mode';
import {
  RESCUE_EV_BLOW, RESCUE_EV_MINE, RESCUE_EV_NONE, RESCUE_EV_OBJECTIVE, RESCUE_EV_PICKED, RESCUE_EV_RETREAT, RESCUE_EV_SBOAT, RESCUE_EV_SHELL, RESCUE_EV_TRANSFER, rescueBlowJa, rescueEventUrgent, rescueMineJa,
  rescueObjectiveFriendlyJa, rescueObjectiveJa, rescuePickedJa, rescuePtNameJa, rescueRetreatJa, rescueSboatJa, rescueSeaShellJa, rescueShellJa, rescueTransferJa, rescueWave2Ja, type RescueLineView,
} from './rescue-texts';

export { RESCUE_EV_BLOW, RESCUE_EV_MINE, RESCUE_EV_NONE, RESCUE_EV_OBJECTIVE, RESCUE_EV_PICKED, RESCUE_EV_RETREAT, RESCUE_EV_SBOAT, RESCUE_EV_SHELL, RESCUE_EV_TRANSFER } from './rescue-texts';

export class RescueLineClock implements RescueLineView {
  /** 出している出来事（RESCUE_EV_*）と文 */
  kind = RESCUE_EV_NONE;
  text = '';
  /** 始めた通し番号・出ていた ms の和・前のフレームに出ていた・後ろに待つ出来事と文 */
  private seq = 0; private onMs = 0; private onPrev = false; private prevShownMs = 0;
  private nextKind = RESCUE_EV_NONE; private nextText = '';
  /** 見た通し番号（初めのフレームに写す）・まとめている収容と移した数・出ている（待っている）砲弾と機雷の数・済んだ 1 回の出来事・前のフレームの HP */
  private init = false;
  private pickSeen = 0; private trSeen = 0; private shellSeen = 0; private mineSeen = 0; private blowSeen = 0; private retreatSeen = 0; private seaSeen = 0; private wave2Seen = 0;
  private pickRun = 0; private trRun = 0; private shellN = 0; private mineN = 0; private shellSea = false;
  private objDone = false; private sboatDone = false; private hp = 0;
  /** 2 行目のキー（ui/mission-line-keys の lKey）: 始めた通し番号 */
  get key(): number { return this.seq; }

  /** 毎フレーム（モードを決める前）: MODE_FLAG_RESCUE_EVENT（急ぎは MODE_FLAG_RESCUE_URGENT も）。救助の無い任務は 0 */
  flags(t: BoatTelemetry, _nowMs: number): number {
    const r = t.rescue;
    if (!r) return 0;
    if (!this.init) {
      this.init = true;
      this.pickSeen = r.pickSeq; this.trSeen = r.transferSeq; this.shellSeen = r.shellSeq; this.mineSeen = r.mineSeenSeq; this.blowSeen = r.mineBlowSeq; this.retreatSeen = r.sboatRetreatSeq; this.seaSeen = r.seaShellSeq; this.wave2Seen = r.wave2Seq;
      this.objDone = r.objectiveReached; this.hp = t.hp;
    }
    if (r.pickSeq > this.pickSeen) { this.pickRun += r.pickSeq - this.pickSeen; this.pickSeen = r.pickSeq; }
    if (!r.picking && this.pickRun > 0) { this.push(RESCUE_EV_PICKED, rescuePickedJa(this.pickRun, r.aboard, r.capacity)); this.pickRun = 0; }
    if (r.transferSeq > this.trSeen) { this.trRun += r.transferSeq - this.trSeen; this.trSeen = r.transferSeq; }
    if (!this.objDone && r.objectiveReached) { this.objDone = true; this.push(RESCUE_EV_OBJECTIVE, r.friendlyCount > 0 ? rescueObjectiveFriendlyJa(r.objective, r.friendlyJa, r.friendlyCount) : rescueObjectiveJa(r.objective)); } // 味方の艇（v0.8.5 IP3）は同じステップに出る
    if (!r.transferring && this.trRun > 0) { this.push(RESCUE_EV_TRANSFER, rescueTransferJa(r.fitchJa, this.trRun, r.delivered)); this.trRun = 0; }
    const p = t.pt;
    if (r.sboatRetreatSeq > this.retreatSeen) { this.retreatSeen = r.sboatRetreatSeq; this.push(RESCUE_EV_RETREAT, rescueRetreatJa(r.fitchJa, rescuePtNameJa(t))); }
    if (!this.sboatDone && p.enabled && p.total > 0 && (p.sighted || p.detected) && !Number.isNaN(p.dx)) {
      this.sboatDone = true;
      this.push(RESCUE_EV_SBOAT, rescueSboatJa(rescuePtNameJa(t), p.alive, bearingJa((Math.atan2(p.dx, -p.dy) * 180) / Math.PI), r.fitchJa, r.coverM));
    }
    if (r.wave2Seq > this.wave2Seen && !Number.isNaN(r.wave2Dx)) {
      // S ボートの第二波（v0.8.5 IP2。1 回）: 第一波の「来た」がまだなら済ませる（第二波の後に第一波の隻数で出さない）
      this.wave2Seen = r.wave2Seq;
      this.sboatDone = true;
      this.push(RESCUE_EV_SBOAT, rescueWave2Ja(rescuePtNameJa(t), r.wave2Count, bearingJa((Math.atan2(r.wave2Dx, -r.wave2Dy) * 180) / Math.PI), r.fitchJa, r.coverM));
    }
    if (r.shellSeq > this.shellSeen) {
      const n = r.shellSeq - this.shellSeen;
      this.shellSeen = r.shellSeq;
      const again = this.kind === RESCUE_EV_SHELL || this.nextKind === RESCUE_EV_SHELL;
      this.shellN = again ? this.shellN + n : n;
      // 生存者の海へ撃った弾（v0.8.5 IP2）が混じれば「砲台が生存者の海を砲撃」（自艇の近くの弾だけなら今の文）
      this.shellSea = (again && this.shellSea) || r.seaShellSeq > this.seaSeen;
      this.seaSeen = r.seaShellSeq;
      this.push(RESCUE_EV_SHELL, this.shellSea ? rescueSeaShellJa(this.shellN) : rescueShellJa(this.shellN));
    }
    if (r.mineSeenSeq > this.mineSeen) {
      const n = r.mineSeenSeq - this.mineSeen;
      this.mineSeen = r.mineSeenSeq;
      this.mineN = this.kind === RESCUE_EV_MINE || this.nextKind === RESCUE_EV_MINE ? this.mineN + n : n;
      const dx = r.mineDx;
      const dy = r.mineDy;
      if (!Number.isNaN(dx)) this.push(RESCUE_EV_MINE, rescueMineJa(bearingJa((Math.atan2(dx, -dy) * 180) / Math.PI), Math.round(Math.sqrt(dx * dx + dy * dy) / RESCUE_MINE_STEP_M) * RESCUE_MINE_STEP_M, this.mineN));
    }
    if (r.mineBlowSeq > this.blowSeen) { this.blowSeen = r.mineBlowSeq; this.push(RESCUE_EV_BLOW, rescueBlowJa(Math.max(0, Math.round(this.hp - t.hp)))); }
    this.hp = t.hp;
    if (this.kind !== RESCUE_EV_NONE && this.onMs >= RESCUE_EVENT_SHOW_MS) {
      if (this.nextKind !== RESCUE_EV_NONE) this.start(this.nextKind, this.nextText);
      else this.kind = RESCUE_EV_NONE;
      this.nextKind = RESCUE_EV_NONE;
    }
    if (this.kind === RESCUE_EV_NONE) return 0;
    return MODE_FLAG_RESCUE_EVENT | (rescueEventUrgent(this.kind) ? MODE_FLAG_RESCUE_URGENT : 0);
  }

  /** モードが決まった後（nowMs は flags と同じ時刻）: 前のフレームから今まで出ていた ms を足す */
  shown(mode: number, nowMs: number): void {
    if (this.onPrev) this.onMs += nowMs - this.prevShownMs;
    this.onPrev = mode === MISSION_RESCUE_EVENT;
    this.prevShownMs = nowMs;
  }

  /** 出来事を出す（同じ種類は言い直す・重い物は出ている物に替わる・軽い物は後ろに 1 つ。文は呼ぶ側が今のテレメトリから 1 回だけ組む） */
  private push(kind: number, text: string): void {
    const cur = this.kind;
    if (cur === RESCUE_EV_NONE || cur === kind) return this.start(kind, text);
    if (this.nextKind === kind) { this.nextText = text; return; }
    if (kind > cur) {
      if (this.nextKind === RESCUE_EV_NONE || cur >= this.nextKind) { this.nextKind = cur; this.nextText = this.text; }
      return this.start(kind, text);
    }
    if (this.nextKind === RESCUE_EV_NONE || kind >= this.nextKind) { this.nextKind = kind; this.nextText = text; }
  }

  private start(kind: number, text: string): void {
    this.kind = kind;
    this.text = text;
    this.onMs = 0;
    this.seq++;
  }
}
