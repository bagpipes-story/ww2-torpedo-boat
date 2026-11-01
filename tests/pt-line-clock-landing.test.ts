// v0.6.9 S6a（spec-v069 R5/F5）: 揚陸の出来事（モード 35）は ui/pt-line-clock の待ちの鎖の中（赤い線・13mm の出来事・輸送隊の出来事の下で 1 度出るまで待ち、
// 機関の出来事と航過の結果はその下で待つ）。赤い線の間に来た被雷は線が消えてから出る・揚陸の出来事の下で航過の結果を失わない・新しい出来事は前の出来事に替わる・
// 揚陸の無い任務は旗も待ちも前と同じ。1 フレームずつ mission-line と同じ順（flags → missionMode → shown → キー → 文。tests/landing-ui-kit の frame）。
// R14 A2: 「出た」は 2 行目に出ていた ms の和が LANDING_EVENT_MIN_SHOWN_MS（2 秒）に届いたとき（機関の出来事の規則）。届く前に赤い線・13mm の出来事に替わられたら、その後にまた出る。
// R14 A1: 輸送船が射線に入る（モード 37）の間も出来事と航過の結果は待つ。
// S8 のレビュー（game-2・docs-9）: 出たとみなす前の出来事は次の出来事に替わらない（同じ種類の斉射は足す・ほかは 1 つ待つ・斉射は待っている被雷・沈没に替わらない）。
import { describe, expect, it } from 'vitest';
import { LANDING_EVENT_MIN_SHOWN_MS, LANDING_EVENT_SHOW_MS } from '../src/config/landing-config';
import { ENGINE_EVENT_MIN_SHOWN_MS } from '../src/config/engine-config';
import { PT_RESULT_SHOW_MS } from '../src/config/pt-config';
import type { BoatTelemetry } from '../src/core/boat-motion';
import { LE_CALM, LE_ENGAGED, LE_HIT, LE_SUNK, type LandingTelemetry } from '../src/core/landing';
import { PT_BREAK, PT_PASS, type PtTelemetry } from '../src/core/pt-boats';
import { PT_GUN_EV_SUPPRESS } from '../src/core/pt-damage';
import { MISSION_LANDING_EVENT, MISSION_LANDING_FIRE_LINE, MISSION_PT, MISSION_PT_CONTACT, MISSION_PT_GUN_EVENT, MISSION_PT_PASS, MODE_FLAG_LANDING_EVENT, MODE_FLAG_PT_RESULT } from '../src/ui/mission-mode';
import { PtLineClock } from '../src/ui/pt-line-clock';
import { frame, tl } from './landing-ui-kit';
import { tele } from './pt-ui-kit';

const F = 1000 / 60;
const QUIET: Partial<PtTelemetry> = { alive: 2, detected: false, sighted: false, passing: false };
const LINE: Partial<PtTelemetry> = { ...QUIET, detected: true, passing: true, threatPhase: PT_PASS };
const HIT: Partial<LandingTelemetry> = { eventSeq: 1, eventKind: LE_HIT, eventHits: 1, eventBoat: 0, eventM: NaN, eventPct: 0.5 };

/** 時計と前のフレームのモード（mission-line と同じ順で 1 フレームずつ進める） */
class Hud {
  readonly c = new PtLineClock();
  ms = 0;
  mode = -1;
  frame(t: BoatTelemetry): [number, string, number] {
    const flags = this.c.flags(t, this.ms, this.mode);
    const f = frame(t, 0, flags, 0, this.c.merge, this.c.landingEv);
    this.c.shown(f.mode, this.ms);
    this.mode = f.mode;
    return [f.mode, f.text, flags];
  }
  /** toMs まで 1 フレームずつ同じテレメトリで進め、最後のフレームと、各モードが出ていた ms を返す */
  until(toMs: number, t: BoatTelemetry): { last: [number, string, number]; shownMs: Map<number, number> } {
    const shownMs = new Map<number, number>();
    let last = this.frame(t);
    shownMs.set(last[0], (shownMs.get(last[0]) ?? 0) + F);
    while (this.ms + F <= toMs) {
      this.ms += F;
      last = this.frame(t);
      shownMs.set(last[0], (shownMs.get(last[0]) ?? 0) + F);
    }
    return { last, shownMs };
  }
}

describe('揚陸の出来事は pt-line-clock の待ちの鎖の中（R5）', () => {
  it('赤い線の間に来た被雷は線が消えてから出る（LANDING_EVENT_SHOW_MS）、その後は平常', () => {
    const h = new Hud();
    h.until(1000, tl({}, LINE));
    h.ms += F;
    // 1 秒: 線の下で被雷 → 4 秒たっても線のまま、旗は立って待っている
    const under = h.until(5000, tl(HIT, LINE));
    expect(under.last[0]).toBe(MISSION_PT_PASS);
    expect(under.last[2] & MODE_FLAG_LANDING_EVENT).toBe(MODE_FLAG_LANDING_EVENT);
    expect(under.shownMs.has(MISSION_LANDING_EVENT)).toBe(false);
    // 線が消えた → 被雷の行が LANDING_EVENT_SHOW_MS 出る
    h.ms += F;
    const after = h.until(h.ms + LANDING_EVENT_SHOW_MS + 10 * F, tl(HIT, QUIET));
    expect(after.shownMs.get(MISSION_LANDING_EVENT)! / LANDING_EVENT_SHOW_MS).toBeCloseTo(1, 1);
    expect(after.last[0]).toBe(MISSION_PT);
    const h2 = new Hud();
    h2.until(1000, tl({}, LINE));
    h2.ms += F;
    h2.until(5000, tl(HIT, LINE));
    h2.ms += F;
    expect(h2.frame(tl(HIT, QUIET))).toEqual([MISSION_LANDING_EVENT, '輸送船 被雷！ あと 1 本で沈む', MODE_FLAG_LANDING_EVENT]);
  });

  it('航過の結果は揚陸の出来事の下で待ち、出来事の後に PT_RESULT_SHOW_MS 出る（失わない）', () => {
    const h = new Hud();
    // 被雷の行が出ている（0.5 秒）
    h.until(500, tl(HIT, QUIET));
    expect(h.mode).toBe(MISSION_LANDING_EVENT);
    // 0.5 秒: 自艇への航過の結果（被弾なし）が来る → 出来事が終わるまで出来事の行
    h.ms += F;
    const res: Partial<PtTelemetry> = { ...QUIET, detected: true, threatPhase: PT_BREAK, passSeq: 1, lastPassFired: true, lastPassHits: 0, lastPassBoat: 1, passes: 1 };
    const under = h.until(LANDING_EVENT_SHOW_MS - 2 * F, tl(HIT, res));
    expect(under.last[0]).toBe(MISSION_LANDING_EVENT);
    expect(under.last[2] & MODE_FLAG_PT_RESULT).toBe(MODE_FLAG_PT_RESULT);
    // 出来事が終わった → 結果が PT_RESULT_SHOW_MS 出る
    h.ms += F;
    const after = h.until(h.ms + PT_RESULT_SHOW_MS + LANDING_EVENT_SHOW_MS, tl(HIT, res));
    expect(after.shownMs.get(MISSION_PT_CONTACT)!).toBeGreaterThanOrEqual(PT_RESULT_SHOW_MS);
    // 1 フレームずつ: 出来事の行（3.5 秒）→ 結果「かわした！」が PT_RESULT_SHOW_MS → 離脱の行
    const h3 = new Hud();
    h3.until(500, tl(HIT, QUIET));
    const spans: Array<[string, number, number]> = [];
    for (h3.ms += F; h3.ms < 8000; h3.ms += F) {
      const text = h3.frame(tl(HIT, res))[1].slice(0, 5);
      const last = spans[spans.length - 1];
      if (last && last[0] === text) last[2] = h3.ms;
      else spans.push([text, h3.ms, h3.ms]);
    }
    expect(spans.map((x) => x[0])).toEqual(['輸送船 被', 'かわした！', '米PT 離']);
    expect(Math.abs(spans[0]![2] + F - LANDING_EVENT_SHOW_MS)).toBeLessThanOrEqual(2 * F);
    expect(Math.abs(spans[1]![2] - spans[1]![1] + F - PT_RESULT_SHOW_MS)).toBeLessThanOrEqual(2 * F);
  });

  it('13mm の出来事の下でも 1 度出るまで待つ。出たとみなされた（2 秒）後の新しい出来事は前の出来事に替わる（その時から LANDING_EVENT_SHOW_MS）。出た後に赤い線に替わられたら時計のまま終わる', () => {
    const gun: Partial<PtTelemetry> = { ...QUIET, gunEventSeq: 1, gunEvent: PT_GUN_EV_SUPPRESS, gunEventBoat: 1, fighting: 1 };
    const h = new Hud();
    const a = h.until(1000, tl(HIT, gun));
    expect(a.last[0]).toBe(MISSION_PT_GUN_EVENT);
    h.ms += F;
    const b = h.until(h.ms + PT_RESULT_SHOW_MS + LANDING_EVENT_SHOW_MS, tl(HIT, gun));
    expect(b.shownMs.get(MISSION_LANDING_EVENT)! / LANDING_EVENT_SHOW_MS).toBeCloseTo(1, 1);
    // 雷撃 → 2.5 秒後（出たとみなされた後）に沈没: 沈没の行がその時から 3.5 秒
    const k = new Hud();
    const calm: Partial<LandingTelemetry> = { eventSeq: 1, eventKind: LE_CALM, eventDirIdx: 0, eventCount: 3, eventM: 880 };
    expect(k.until(2500, tl(calm, QUIET)).last[1]).toBe('米PT 雷撃！ 北から輸送船へ 3 本');
    k.ms += F;
    const sunk: Partial<LandingTelemetry> = { eventSeq: 2, eventKind: LE_SUNK, eventPct: 0.62, eventHits: 2 };
    expect(k.frame(tl(sunk, QUIET))[1]).toBe('輸送船 撃沈… 揚陸は 62% で止まった ・ 帰投せよ');
    k.ms += F;
    const s = k.until(2500 + LANDING_EVENT_SHOW_MS + 5 * F, tl(sunk, QUIET));
    expect((s.shownMs.get(MISSION_LANDING_EVENT)! + F) / LANDING_EVENT_SHOW_MS).toBeCloseTo(1, 1);
    // 出た後（LANDING_EVENT_MIN_SHOWN_MS を過ぎた 2.5 秒）に赤い線 0.5 秒 → 線の後は残り（3.5 − 3 = 0.5 秒）だけ（出し直さない）
    const r = new Hud();
    r.until(2500, tl(HIT, QUIET));
    r.ms += F;
    r.until(3000, tl(HIT, LINE));
    r.ms += F;
    const rest = r.until(3000 + LANDING_EVENT_SHOW_MS, tl(HIT, QUIET));
    expect(rest.shownMs.get(MISSION_LANDING_EVENT)!).toBeLessThan(LANDING_EVENT_SHOW_MS - 2000);
  });

  it('R14 A2: 出たとみなすのは 2 行目に出ていた ms の和が 2 秒（機関の出来事と同じ値）に届いたとき', () => {
    expect(LANDING_EVENT_MIN_SHOWN_MS).toBe(2000);
    expect(LANDING_EVENT_MIN_SHOWN_MS).toBe(ENGINE_EVENT_MIN_SHOWN_MS);
  });

  it('R14 A2 (a): 沈没の行が出て 0.2 秒で赤い線に替わられても、線の後にまた LANDING_EVENT_SHOW_MS 出る（前は二度と出なかった）', () => {
    const sunk: Partial<LandingTelemetry> = { eventSeq: 1, eventKind: LE_SUNK, eventPct: 0.39, eventHits: 2 };
    const h = new Hud();
    const first = h.until(200, tl(sunk, QUIET));
    expect(first.shownMs.get(MISSION_LANDING_EVENT)!).toBeGreaterThan(0);
    h.ms += F;
    const under = h.until(4200, tl(sunk, LINE)); // 4 秒の赤い線（出来事の 3.5 秒より長い）
    expect(under.last[0]).toBe(MISSION_PT_PASS);
    expect(under.last[2] & MODE_FLAG_LANDING_EVENT).toBe(MODE_FLAG_LANDING_EVENT);
    h.ms += F;
    const after = h.until(h.ms + LANDING_EVENT_SHOW_MS + 10 * F, tl(sunk, QUIET));
    expect(after.shownMs.get(MISSION_LANDING_EVENT)! / LANDING_EVENT_SHOW_MS).toBeCloseTo(1, 1);
    expect(after.last[0]).toBe(MISSION_PT);
  });

  it('R14 A2 (b): 被雷の行が 1 フレームだけ出て 13mm の出来事（制圧）に替わられても、出来事の後に戻る', () => {
    const gun: Partial<PtTelemetry> = { ...QUIET, gunEventSeq: 1, gunEvent: PT_GUN_EV_SUPPRESS, gunEventBoat: 1, fighting: 1 };
    const h = new Hud();
    expect(h.frame(tl(HIT, QUIET))[0]).toBe(MISSION_LANDING_EVENT);
    h.ms += F;
    const g = h.until(PT_RESULT_SHOW_MS, tl(HIT, gun));
    expect(g.last[0]).toBe(MISSION_PT_GUN_EVENT);
    expect(g.shownMs.has(MISSION_LANDING_EVENT)).toBe(false);
    h.ms += F;
    const after = h.until(h.ms + LANDING_EVENT_SHOW_MS + PT_RESULT_SHOW_MS, tl(HIT, gun));
    expect(after.shownMs.get(MISSION_LANDING_EVENT)! / LANDING_EVENT_SHOW_MS).toBeCloseTo(1, 1);
    expect(h.frame(tl(HIT, gun))[1]).not.toBe('輸送船 被雷！ あと 1 本で沈む');
  });

  it('R14 A1: 輸送船が射線に入る行（37）の下で被雷の行と航過の結果は待ち、37 が消えてから出る（被雷 → 結果）', () => {
    const fire: Partial<LandingTelemetry> = { ...HIT, fireLineI: 0, fireLineDirIdx: 1, fireLineStep: 8 };
    const res: Partial<PtTelemetry> = { ...QUIET, detected: true, threatPhase: PT_BREAK, passSeq: 1, lastPassFired: true, lastPassHits: 0, lastPassBoat: 1, passes: 1 };
    const h = new Hud();
    const under = h.until(5000, tl(fire, res));
    expect(under.last[0]).toBe(MISSION_LANDING_FIRE_LINE);
    expect(under.shownMs.has(MISSION_LANDING_EVENT)).toBe(false);
    expect(under.last[2] & (MODE_FLAG_LANDING_EVENT | MODE_FLAG_PT_RESULT)).toBe(MODE_FLAG_LANDING_EVENT | MODE_FLAG_PT_RESULT);
    h.ms += F;
    const spans: string[] = [];
    for (; h.ms < 14000; h.ms += F) {
      const text = h.frame(tl(HIT, res))[1].slice(0, 5);
      if (spans[spans.length - 1] !== text) spans.push(text);
    }
    expect(spans).toEqual(['輸送船 被', 'かわした！', '米PT 離']);
  });

  /** 1 フレームずつ toMs まで進め、出た 2 行目の文の並び（同じ文の続きは 1 つ）と、文ごとの出ていた ms */
  function spans(h: Hud, toMs: number, t: (ms: number) => BoatTelemetry): Array<[string, number]> {
    const out: Array<[string, number]> = [];
    for (; h.ms < toMs; h.ms += F) {
      const text = h.frame(t(h.ms))[1];
      const last = out[out.length - 1];
      if (last && last[0] === text) last[1] += F;
      else out.push([text, F]);
    }
    return out;
  }

  it('S8 のレビュー docs-9: 被雷の行が出て 1 秒で沈没が来ても、被雷は 2 秒（LANDING_EVENT_MIN_SHOWN_MS）出てから沈没が LANDING_EVENT_SHOW_MS（前は 1 秒で替わった）', () => {
    const h = new Hud();
    const sunk: Partial<LandingTelemetry> = { eventSeq: 2, eventKind: LE_SUNK, eventPct: 0.53, eventHits: 2 };
    const got = spans(h, 8000, (ms) => tl(ms < 1000 ? HIT : sunk, QUIET));
    expect(got.map((x) => x[0])).toEqual(['輸送船 被雷！ あと 1 本で沈む', '輸送船 撃沈… 揚陸は 53% で止まった ・ 帰投せよ', expect.any(String)]);
    expect(Math.abs(got[0]![1] - LANDING_EVENT_MIN_SHOWN_MS)).toBeLessThanOrEqual(2 * F);
    expect(Math.abs(got[1]![1] - LANDING_EVENT_SHOW_MS)).toBeLessThanOrEqual(2 * F);
  });

  it('S8 のレビュー game-2 (a): 37 の下で待っている戦いながらの斉射に別の PT の同じ種類の斉射が来たら、足した 1 つの行「米PT 2 隻が…輸送船へ 6 本」（前は後の斉射だけが出た）', () => {
    const a: Partial<LandingTelemetry> = { eventSeq: 1, eventKind: LE_ENGAGED, eventDirIdx: 0, eventCount: 3, eventBoats: 1, eventM: 899 };
    const b: Partial<LandingTelemetry> = { eventSeq: 2, eventKind: LE_ENGAGED, eventDirIdx: 2, eventCount: 3, eventBoats: 1, eventM: 900 };
    const fire: Partial<LandingTelemetry> = { fireLineI: 1, fireLineDirIdx: 2, fireLineStep: 10 };
    const h = new Hud();
    const got = spans(h, 9000, (ms) => tl({ ...(ms < 2000 ? a : b), ...(ms < 5000 ? fire : {}) }, QUIET));
    expect(got.map((x) => x[0]).filter((x) => x.includes('発射'))).toEqual(['米PT 2 隻が戦いながら発射！ 輸送船へ 6 本 ・ 離れて戦え']);
  });

  it('S8 のレビュー game-2 (b): 赤い線の下で待っている被雷に斉射が来ても被雷を替えない（被雷 → 斉射の順に出る）。被雷が出ているうちの次の被雷・沈没は 1 つだけ待つ（新しい方）', () => {
    const salvo: Partial<LandingTelemetry> = { eventSeq: 2, eventKind: LE_ENGAGED, eventDirIdx: 2, eventCount: 3, eventBoats: 1, eventM: 900 };
    const h = new Hud();
    const got = spans(h, 12000, (ms) => tl(ms < 1500 ? HIT : salvo, ms < 3000 ? LINE : QUIET));
    const texts = got.map((x) => x[0]).filter((x) => !x.startsWith('米PT 航過') && !x.startsWith('米PT 掃射'));
    expect(texts.slice(0, 2)).toEqual(['輸送船 被雷！ あと 1 本で沈む', '米PT 戦いながら発射！ 輸送船の東 900 m から 3 本 ・ 離れて戦え']);
    // 斉射が出て 0.5 秒で被雷、さらに 0.5 秒で沈没: 斉射 2 秒 → 沈没（待っていた被雷は沈没に替わる）
    const k = new Hud();
    const hit2: Partial<LandingTelemetry> = { eventSeq: 3, eventKind: LE_HIT, eventHits: 1 };
    const sunk: Partial<LandingTelemetry> = { eventSeq: 4, eventKind: LE_SUNK, eventPct: 0.5, eventHits: 2 };
    const got2 = spans(k, 9000, (ms) => tl(ms < 500 ? salvo : ms < 1000 ? hit2 : sunk, QUIET));
    expect(got2.map((x) => x[0]).slice(0, 2)).toEqual(['米PT 戦いながら発射！ 輸送船の東 900 m から 3 本 ・ 離れて戦え', '輸送船 撃沈… 揚陸は 50% で止まった ・ 帰投せよ']);
    expect(Math.abs(got2[0]![1] - LANDING_EVENT_MIN_SHOWN_MS)).toBeLessThanOrEqual(2 * F);
    // 待っている沈没は後の斉射に替わらない
    const m = new Hud();
    const late: Partial<LandingTelemetry> = { eventSeq: 5, eventKind: LE_CALM, eventDirIdx: 0, eventCount: 3, eventBoats: 1, eventM: 880 };
    const got3 = spans(m, 9000, (ms) => tl(ms < 500 ? salvo : ms < 1000 ? sunk : late, QUIET));
    expect(got3.map((x) => x[0]).slice(0, 2)).toEqual(['米PT 戦いながら発射！ 輸送船の東 900 m から 3 本 ・ 離れて戦え', '輸送船 撃沈… 揚陸は 50% で止まった ・ 帰投せよ']);
  });

  it('揚陸の無い任務は旗を立てない（出来事の通し番号があっても）', () => {
    const c = new PtLineClock();
    const t = tele(QUIET, { landing: { ...tl().landing, enabled: false, eventSeq: 3, eventKind: LE_HIT } });
    for (let ms = 0; ms < 5000; ms += F) expect(c.flags(t, ms, MISSION_PT) & MODE_FLAG_LANDING_EVENT).toBe(0);
  });
});
