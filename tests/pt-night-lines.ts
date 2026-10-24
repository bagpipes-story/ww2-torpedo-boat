// 1 夜の 2 行目を模擬（tests/pt-kit の runPtSim）の上で集める（v0.6.3 実機 1 回目に tests/pt-gun-result から。実機 2 回目のレビュー R2・ux-3 で、時刻の旗の写しをやめて
// ui/mission-line と同じ ui/pt-line-clock を使う＝本体の旗の規則がそのまま測られる）。順は mission-line と同じ: PtLineClock.flags → missionMode → shown → ptKey（merge）→ ptLine。
// 台本: cruise（巡航でまっすぐ帰り、押さない）・fight（見つかったら脅威の PT に舷側を向けて止まり、生きた PT が見えていれば押し続ける＝止まって撃ち合う罠。追撃されない）・
// slow（見つかったら 14 kt で帰投地点へまっすぐ、生きた PT が見えていれば押し続ける＝HUD の教える撃ち返し。追撃の連射と制圧が出る）。
import { PT_CHASE, PT_PASS, ptFighting, threatIndex, type PtTelemetry } from '../src/core/pt-boats';
import { PT_GUN_EV_SUPPRESS } from '../src/core/pt-damage';
import { initPtTelemetry, refreshPtTelemetry } from '../src/systems/pt-telemetry';
import { MISSION_PT_CONTACT, MISSION_PT_GUN_EVENT, MISSION_PT_PASS, MODE_FLAG_PT_GUN_EVENT, MODE_FLAG_PT_RESULT, missionMode } from '../src/ui/mission-mode';
import { PtLineClock } from '../src/ui/pt-line-clock';
import { ptKey, ptLine } from '../src/ui/pt-lines';
import { CRUISE01, HOME, SILENT01, runPtSim, type PtSim } from './pt-kit';
import { S05, isPtMode, ptWorld, tele } from './pt-ui-kit';

export type NightStyle = 'cruise' | 'fight' | 'slow';

/**
 * lines は 2 行目の文の移り（米PT のモードでなければ ''）、passTop は撃つ PT がいるステップのモードがみな航過（赤い線）だった。
 * 出来事: events は数、shown は行に出た出来事、hidden は通し番号から 2.5 秒たっても赤い線の下で 1 度も出ていなかった出来事（R5 の前はそのまま出なかった）、
 * missed は 1 度も出ずに時間切れになった出来事、showMs は出来事ごとの行に出た ms の計（R2: 出た後に赤い線に替わられても出し直さないので 2.5 秒まで）、
 * staleSuppress は「制圧！ 追撃をやめて離れる」が、その PT がもう追撃・連射に戻っている間に出たフレーム。
 * 結果: shortResults は赤い線に替わられずに 2.5 秒より短くしか出なかった（出来事の行に足したものは除く）、heldResults は出来事の後に回った、
 * burstResults は連射の結果の数と、そのうち行に出た（結果の行か、足した出来事の行）数・出来事の行に足した数
 */
export interface NightLines {
  lines: string[]; modes: Set<number>; maxPasses: Set<number>; passTop: boolean;
  events: number; shown: Set<number>; hidden: Set<number>; missed: number; showMs: number[]; staleSuppress: number;
  shortResults: number; heldResults: number; burstResults: number; burstShown: number; merged: number;
}

const FRAME_MS = 1000 / 60;

export function nightLines(seed: number, withGun: boolean, style: NightStyle = 'cruise'): NightLines {
  const w = ptWorld(withGun);
  const clock = new PtLineClock();
  const r: NightLines = {
    lines: [], modes: new Set(), maxPasses: new Set(), passTop: true, events: 0, shown: new Set(), hidden: new Set(), missed: 0, showMs: [], staleSuppress: 0,
    shortResults: 0, heldResults: 0, burstResults: 0, burstShown: 0, merged: 0,
  };
  let t: PtTelemetry | null = null;
  let lastMode = -1;
  let lastKey = -1;
  let seenPass = 0;
  let eventAt = -1;
  let eventFlag = false;
  // 今の結果: 行に出たフレーム・赤い線に替わられた・出来事の後に回った・連射・行に出た・足した
  let resSteps = 0;
  let resCut = false;
  let resHeld = false;
  let resBurst = false;
  let resSeen = false;
  let resMerged = false;
  let resOn = false;
  const closeResult = (final: boolean): void => {
    if (seenPass === 0) return;
    if (!resMerged && !resCut && resSteps < 149 && !(final && resOn)) r.shortResults++; // 夜の終わりに出ている途中の結果は数えない
    if (resHeld) r.heldResults++;
    if (resBurst) {
      r.burstResults++;
      if (resSeen) r.burstShown++;
      if (resMerged) r.merged++;
    }
  };
  runPtSim({
    seed,
    steps: 60 * 170,
    night: true,
    stopAtHome: true,
    gunHeld: withGun && style !== 'cruise' ? (s) => seesLivePt(s) : undefined,
    policy: (s) => {
      s.input.headingDeg = (Math.atan2(HOME.x - s.boat.x, -(HOME.y - s.boat.y)) * 180) / Math.PI;
      s.input.speed01 = style === 'slow' && s.q.detected ? SILENT01 : CRUISE01;
      if (style === 'fight') fight(s);
    },
    onStep: (s) => {
      // ptWorld の隊と砲を模擬のものに差し替える（初回だけ）
      if (!t) {
        Object.assign(w.pts, { section: s.q, p: s.p, gun: s.gun ? { state: s.gun, g: S05.guns! } : null });
        t = initPtTelemetry(w);
      }
      w.boat.state = s.boat;
      refreshPtTelemetry(t, w);
      const ms = s.t * 1000;
      const newResult = t.passSeq > seenPass;
      if (newResult) {
        closeResult(false);
        seenPass = t.passSeq;
        [resSteps, resCut, resHeld, resBurst, resSeen, resMerged] = [0, false, false, t.burstFired, false, false];
      }
      if (t.gunEventSeq > r.events) {
        r.events = t.gunEventSeq;
        r.showMs[r.events] = 0;
        eventAt = ms;
      }
      const bt = tele(t, { headingDeg: s.boat.headingDeg });
      const flags = clock.flags(bt, ms, lastMode);
      const mode = missionMode(bt, 0, flags);
      clock.shown(mode, ms);
      const key = isPtMode(mode) ? ptKey(bt, mode, flags, lastKey, clock.merge) : 0;
      const text = isPtMode(mode) ? ptLine(bt, mode, key).text : '';
      lastMode = mode;
      lastKey = key;
      resOn = (flags & MODE_FLAG_PT_RESULT) !== 0;
      if (newResult && !resOn) resMerged = true; // 足していない結果はこのフレームから PT_RESULT_SHOW_MS の旗が立つ
      if (resOn && mode === MISSION_PT_CONTACT) {
        resSteps++;
        resSeen = true;
      }
      if (resOn && t.passing) resCut = true; // 結果の間に次の赤い線（線が勝つ）
      if (resOn && mode === MISSION_PT_GUN_EVENT) resHeld = true;
      if (mode === MISSION_PT_GUN_EVENT) {
        r.shown.add(r.events);
        r.showMs[r.events]! += FRAME_MS;
        if (resMerged) resSeen = true;
        const b = s.q.boats[s.q.gunEventBoat];
        if (t.gunEvent === PT_GUN_EV_SUPPRESS && b && (b.phase === PT_CHASE || (b.phase === PT_PASS && !b.suppressed))) r.staleSuppress++;
      }
      if (t.passing && r.events > 0 && !r.shown.has(r.events) && ms >= eventAt + 2500) r.hidden.add(r.events);
      const evOn = (flags & MODE_FLAG_PT_GUN_EVENT) !== 0;
      if (eventFlag && !evOn && !r.shown.has(r.events)) r.missed++;
      eventFlag = evOn;
      if (s.q.owner >= 0 && mode !== MISSION_PT_PASS) r.passTop = false;
      r.modes.add(mode);
      r.maxPasses.add(t.maxPasses);
      if (r.lines[r.lines.length - 1] !== text) r.lines.push(text);
    },
  });
  closeResult(true);
  return r;
}

/** 撃ち合う夜の台本: 見つかったら脅威の PT に舷側を向けて止まる（止まって撃ち合う罠。命中が多く撃退・撃沈が出る） */
function fight(s: PtSim): void {
  const i = s.q.detected ? threatIndex(s.q, s.boat.x, s.boat.y) : -1;
  if (i < 0) return;
  const b = s.q.boats[i]!;
  const brg = (Math.atan2(b.x - s.boat.x, -(b.y - s.boat.y)) * 180) / Math.PI;
  s.input.headingDeg = (brg + 90 + 360) % 360;
  s.input.speed01 = 0;
}

function seesLivePt(s: PtSim): boolean {
  return s.q.boats.some((b) => ptFighting(b.phase) && (b.x - s.boat.x) ** 2 + (b.y - s.boat.y) ** 2 <= S05.visRange2);
}
