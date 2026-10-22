// 米PT の 2 行目の時刻の旗（v0.6.3 実機 2 回目のレビュー R2・ux-3。ui/pt-line-clock、ui/mission-line と同じもの）: 13mm の出来事は 1 度出たら赤い線のたびに出し直さない、
// 同じ PT の連射の結果は出来事の行に足す。単体（テレメトリを手で組む）と、HUD の教える撃ち返し（14 kt で帰りながら押し続ける）の夜の 2 行目（tests/pt-night-lines）。
import { describe, expect, it } from 'vitest';
import { PT_RESULT_SHOW_MS } from '../src/config/pt-config';
import type { PtTelemetry } from '../src/core/pt-boats';
import { PT_GUN_EV_SUPPRESS } from '../src/core/pt-damage';
import { MISSION_PT_CONTACT, MISSION_PT_GUN_EVENT, MISSION_PT_PASS, MODE_FLAG_PT_GUN_EVENT, MODE_FLAG_PT_RESULT, missionMode } from '../src/ui/mission-mode';
import { PtLineClock } from '../src/ui/pt-line-clock';
import { ptKey, ptLine } from '../src/ui/pt-lines';
import { nightLines } from './pt-night-lines';
import { tele } from './pt-ui-kit';

const RESULT = MODE_FLAG_PT_RESULT;
const EVENT = MODE_FLAG_PT_GUN_EVENT;
const F = 1000 / 60;

/** 時計と前のフレームのモード（mission-line と同じ順で 1 フレームずつ進める） */
class Hud {
  readonly c = new PtLineClock();
  ms = 0;
  mode = -1;
  /** 1 フレーム（flags → missionMode → shown → ptKey → ptLine）。[モード, 文, flags] */
  frame(pt: Partial<PtTelemetry>): [number, string, number] {
    const t = tele({ detected: true, fighting: 2, ...pt });
    const flags = this.c.flags(t, this.ms, this.mode);
    const mode = missionMode(t, 0, flags);
    this.c.shown(mode);
    this.mode = mode;
    return [mode, ptLine(t, mode, ptKey(t, mode, flags, 0, this.c.merge)).text, flags];
  }
  /** toMs まで 1 フレームずつ同じテレメトリで進め、最後のフレームを返す */
  until(toMs: number, pt: Partial<PtTelemetry>): [number, string, number] {
    let r = this.frame(pt);
    while (this.ms + F <= toMs) {
      this.ms += F;
      r = this.frame(pt);
    }
    return r;
  }
}

describe('出来事は 1 度出たら出し直さない（R2）', () => {
  it('赤い線の下に来た出来事は線が消えてから出る（R5 のまま）。出た後に次の赤い線に替わられたら、その時計のまま終わる（線の後にもう一度 2.5 秒出ない）', () => {
    const h = new Hud();
    const ev = { gunEventSeq: 1, gunEvent: PT_GUN_EV_SUPPRESS, gunEventBoat: 1 };
    const line = { ...ev, passing: true, burst: true };
    // 0〜4 秒: 撃つ PT の線の下で制圧が来る → 4 秒たっても出来事は待っている
    const [m0, , f0] = h.until(4000, line);
    expect([m0, f0 & EVENT]).toEqual([MISSION_PT_PASS, EVENT]);
    // 線が消えた → 出来事が出る（ここから 2.5 秒）
    const shownAt = h.ms + F;
    h.ms = shownAt;
    expect(h.frame(ev)[0]).toBe(MISSION_PT_GUN_EVENT);
    h.until(shownAt + 1000, ev);
    // 1 秒後に相方の線（2 秒の合間の後の連射）が 1.4 秒
    h.ms += F;
    expect(h.until(shownAt + 2400, line)[0]).toBe(MISSION_PT_PASS);
    // 線が消えた → 残りの約 0.1 秒だけ出て、それで終わる（前は線の後にまた 2.5 秒出た）
    h.ms += F;
    expect(h.frame(ev)[0]).toBe(MISSION_PT_GUN_EVENT);
    expect(h.until(shownAt + PT_RESULT_SHOW_MS + F, ev)).toEqual([MISSION_PT_CONTACT, '米PT 離脱 ・ 右下の射撃で撃ち返せ', 0]);
    // 次の出来事は新しく線の下で待つ
    const ev2 = { ...line, gunEventSeq: 2 };
    h.ms += F;
    expect(h.until(h.ms + 4000, ev2)[2] & EVENT).toBe(EVENT);
  });
});

describe('同じ PT の連射の結果は出来事の行に足す（ux-3）', () => {
  const ev = { gunEventSeq: 1, gunEvent: PT_GUN_EV_SUPPRESS, gunEventBoat: 0 };
  const res = { passSeq: 1, burstFired: true, lastPassBoat: 0, lastPassFired: true, lastPassHits: 1, bursts: 1 };
  const silenced = { ...ev, passing: true, burst: true, passSilenced: true };
  it('連射中に制圧された PT の結果: 結果の旗は立たず、出来事の行に「連射 被弾 1 発（HP −4）」。後の攻撃で数が変わっても行は変わらない', () => {
    const h = new Hud();
    h.until(3000, silenced);
    // 窓の終わり・弾がみな落ちた（結果の通し番号が増えた）
    h.ms += F;
    const at = h.ms;
    const [mode, text, flags] = h.frame({ ...ev, ...res });
    expect([mode, text, flags & RESULT]).toEqual([MISSION_PT_GUN_EVENT, '米PT 制圧！ 追撃をやめて離れる ・ 連射 被弾 1 発（HP −4） ・ 残り 2 隻', 0]);
    expect(h.until(at + PT_RESULT_SHOW_MS - 2 * F, { ...ev, ...res, lastPassHits: 5 })[1]).toBe('米PT 制圧！ 追撃をやめて離れる ・ 連射 被弾 1 発（HP −4） ・ 残り 2 隻');
    expect(h.until(at + PT_RESULT_SHOW_MS + F, { ...ev, ...res })[2] & (EVENT | RESULT)).toBe(0); // 結果は別に出さない
  });
  it('別の PT の結果・航過の結果・出来事が時間切れの後の結果は足さない（出来事の後に結果の行）。新しい出来事は足した結果を持ち越さない', () => {
    const other = new Hud();
    other.until(3000, silenced);
    other.ms += F;
    expect(other.frame({ ...ev, ...res, lastPassBoat: 1 })[1]).toBe('米PT 制圧！ 追撃をやめて離れる ・ 残り 2 隻');
    expect(other.until(other.ms + PT_RESULT_SHOW_MS + F, { ...ev, ...res, lastPassBoat: 1 })[1]).toBe('連射 被弾 1 発（HP −4） ・ 計 1 回'); // 出来事の後に回る
    const pass = new Hud();
    pass.until(3000, { ...ev, passing: true });
    pass.ms += F;
    expect(pass.frame({ ...ev, ...res, burstFired: false })[1]).toBe('米PT 制圧！ 追撃をやめて離れる ・ 残り 2 隻');
    const late = new Hud();
    late.until(PT_RESULT_SHOW_MS + F, ev);
    late.ms += F;
    expect(late.frame({ ...ev, ...res })[0]).toBe(MISSION_PT_CONTACT);
    const next = new Hud();
    next.until(1000, silenced);
    next.ms += F;
    next.frame({ ...ev, ...res });
    expect(next.c.merge).not.toBe(0);
    next.ms += F;
    next.frame({ ...ev, ...res, gunEventSeq: 2 });
    expect(next.c.merge).toBe(0);
  });
  it('米PT の無い任務は旗を立てない', () => {
    const c = new PtLineClock();
    expect(c.flags(tele({ enabled: false }), 0, -1)).toBe(0);
  });
});

describe('HUD の教える撃ち返しの夜（14 kt で帰りながら押し続ける。seed 1〜30）', () => {
  it('出来事は 2.5 秒まで（出し直さない）・「制圧！」はその PT が追撃に戻った後にほぼ出ない・連射の結果は 95% 以上が行に出て、出来事に足したものがある', () => {
    let [over, stale, missed, burstResults, burstShown, merged, events] = [0, 0, 0, 0, 0, 0, 0];
    for (let seed = 1; seed <= 30; seed++) {
      const r = nightLines(seed, true, 'slow');
      for (const ms of r.showMs) if (ms !== undefined && ms > PT_RESULT_SHOW_MS + 2 * F) over++;
      for (const l of r.lines) expect(l.includes('連射が止んだ'), l).toBe(false);
      [stale, missed, burstResults, burstShown, merged, events] = [stale + r.staleSuppress, missed + r.missed, burstResults + r.burstResults, burstShown + r.burstShown, merged + r.merged, events + r.events];
    }
    expect(events).toBeGreaterThan(50); // 確かめが空でない（制圧・撃退が出る夜）
    expect(over).toBe(0);
    expect(missed).toBe(0);
    // 前は 30 夜で 648 フレーム（約 11 秒）。今は制圧の行が出ている途中で PT が追撃に戻った数フレームだけ
    expect(stale).toBeLessThanOrEqual(10);
    expect(burstShown / burstResults).toBeGreaterThanOrEqual(0.95); // 前は 79%
    expect(merged).toBeGreaterThan(10);
  });
  it('撃ち合う夜（止まって撃つ。seed 1〜12）でも出来事は 2.5 秒まで（前は線の後に出し直して最長 4.9 秒）', () => {
    for (let seed = 1; seed <= 12; seed++) {
      for (const ms of nightLines(seed, true, 'fight').showMs) if (ms !== undefined) expect(ms, `${seed}`).toBeLessThanOrEqual(PT_RESULT_SHOW_MS + 2 * F);
    }
  });
});
