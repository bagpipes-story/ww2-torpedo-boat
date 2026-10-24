// 機関の不調（v0.6.5。jp_05。spec-v065 §D.1・§D.4・§G.1・R3・R5）の 2 行目と Result の文（ui/engine-lines）・優先順（ui/mission-mode）・過熱の出来事の時計（ui/pt-line-clock）。
// 2 行目は mission-line と同じ順（PtLineClock.flags → missionMode → shown → 文）で組む。ui-config・game-config は DOM を読むので使わない（色は hud-text-config、幅は tests/pt-ui-kit の見積もり）。
import { describe, expect, it } from 'vitest';
import { ENGINE_EVENT_SHOW_MS } from '../src/config/engine-config';
import { HUD_COLOR_STRONG, HUD_COLOR_WARN } from '../src/config/hud-text-config';
import { PT_RESULT_SHOW_MS } from '../src/config/pt-config';
import type { BoatTelemetry } from '../src/core/boat-motion';
import { ENGINE_EV_FINAL, ENGINE_EV_LIMP, ENGINE_EV_RECOVER, ENGINE_EV_WARN, ENGINE_FINAL, ENGINE_LIMP, ENGINE_OK, ENGINE_WARN, createEngineTelemetry, type EngineStage, type EngineTelemetry } from '../src/core/engine-trouble';
import { GUN_FIRING } from '../src/core/gun-battery';
import { CALL_DAWN } from '../src/core/mission-flow';
import { PT_BREAK, PT_CHASE, PT_PASS, PT_RUN_IN, type PtTelemetry } from '../src/core/pt-boats';
import { PT_GUN_EV_CREW } from '../src/core/pt-damage';
import { engineKey, engineLine, engineResultLine, engineTagJa, engineTagKey } from '../src/ui/engine-lines';
import {
  MISSION_ADRIFT, MISSION_CALL, MISSION_ENGINE_EVENT, MISSION_ENGINE_FINAL, MISSION_ENGINE_STATUS, MISSION_PT, MISSION_PT_CONTACT, MISSION_PT_GUN, MISSION_PT_GUN_EVENT, MISSION_PT_PASS,
  MODE_FLAG_ENGINE_EVENT, MODE_FLAG_PT_GUN_EVENT, MODE_FLAG_PT_RESULT, missionMode,
} from '../src/ui/mission-mode';
import { PtLineClock } from '../src/ui/pt-line-clock';
import { ptKey, ptLine } from '../src/ui/pt-lines';
import { PERSON_DENYLIST, RANK_RE } from './person-denylist';
import { LINE2_MAX_PX, isPtMode, tele, textWidthPx } from './pt-ui-kit';

const RESULT = MODE_FLAG_PT_RESULT;
const ENG = MODE_FLAG_ENGINE_EVENT;
const F = 1000 / 60;
const HEAT: Record<EngineStage, number> = { 0: 0.3, 1: 0.7, 2: 0.9, 3: 1 };
/** 機関のある夜のテレメトリ（段ごとの代表の熱。不調は残り 8 秒） */
const eng = (stage: EngineStage, over: Partial<EngineTelemetry> = {}): EngineTelemetry => ({ ...createEngineTelemetry(), on: true, stage, heat: HEAT[stage], limpLeftS: stage === ENGINE_LIMP ? 8 : 0, ...over });
const T = (pt: Partial<PtTelemetry>, e: EngineTelemetry, over: Partial<BoatTelemetry> = {}): BoatTelemetry => tele(pt, { targetStep: 'cruise', ...over, engine: e });

/** mission-line と同じ 2 行目の文（機関の 3 つは engine-lines、米PT の 5 つは pt-lines。赤い線・結果・接触だけ末尾に札） */
function textOf(t: BoatTelemetry, mode: number, flags: number): string {
  if (mode >= MISSION_ENGINE_EVENT && mode <= MISSION_ENGINE_STATUS) return engineLine(t, mode, engineKey(t, mode)).text;
  if (!isPtMode(mode)) return '';
  const l = ptLine(t, mode, ptKey(t, mode, flags));
  return mode === MISSION_PT_PASS || mode === MISSION_PT_CONTACT ? l.text + engineTagJa(engineTagKey(t.engine)) : l.text;
}
const rowOf = (t: BoatTelemetry, call = 0, flags = 0): [number, string] => {
  const mode = missionMode(t, call, flags);
  return [mode, textOf(t, mode, flags)];
};

describe('2 行目の機関の 3 つ（モード 28〜30）', () => {
  it('過熱の出来事・限界（全速の帯）・限界で冷やしている・不調（kt は艇の静音の上限、秒は残りの切り上げ）。過熱だけでは行を出さない（右下の帯だけ）', () => {
    const line = (t: BoatTelemetry, flags = 0): [number, string, string] => {
      const mode = missionMode(t, 0, flags);
      const l = engineLine(t, mode, engineKey(t, mode));
      return [mode, l.text, l.color];
    };
    expect(line(T({}, eng(ENGINE_WARN)), ENG)).toEqual([MISSION_ENGINE_EVENT, '機関 過熱 ・ 全速を続けると不調（巡航以下で冷える）', HUD_COLOR_WARN]);
    expect(line(T({}, eng(ENGINE_FINAL), { targetStep: 'full' }))).toEqual([MISSION_ENGINE_FINAL, '機関 限界！ 巡航以下に落とせ（このままだと不調）', HUD_COLOR_WARN]);
    expect(line(T({}, eng(ENGINE_FINAL)))).toEqual([MISSION_ENGINE_STATUS, '機関 限界 ・ 巡航以下で冷やしている', HUD_COLOR_STRONG]);
    expect(line(T({}, eng(ENGINE_LIMP)))).toEqual([MISSION_ENGINE_STATUS, '機関 不調 ・ 14 kt まで（あと 8 秒）', HUD_COLOR_WARN]);
    expect(line(T({}, eng(ENGINE_LIMP, { limpLeftS: 8.0000001 })))[1]).toBe('機関 不調 ・ 14 kt まで（あと 8 秒）'); // 丸めで 9 と出さない
    expect(line(T({}, eng(ENGINE_LIMP, { limpLeftS: 0.2 })))[1]).toBe('機関 不調 ・ 14 kt まで（あと 1 秒）');
    expect(line(T({}, eng(ENGINE_LIMP), { targetStep: 'full' }))[0]).toBe(MISSION_ENGINE_STATUS); // 不調は帯に関わらず状態の行（減速の間に帯がまだ全速でも）
    expect(missionMode(T({}, eng(ENGINE_WARN)), 0, 0)).toBe(MISSION_PT);
    expect(missionMode(T({}, eng(ENGINE_OK)), 0, 0)).toBe(MISSION_PT);
  });
  it('幅: 4 つの文も、札を付けた米PT の行（赤い線・結果・接触の各変種をいちばん長い値で）も 22 px で 840 px 以内', () => {
    const texts = [
      textOf(T({}, eng(ENGINE_WARN)), MISSION_ENGINE_EVENT, ENG),
      textOf(T({}, eng(ENGINE_FINAL), { targetStep: 'full' }), MISSION_ENGINE_FINAL, 0),
      textOf(T({}, eng(ENGINE_FINAL)), MISSION_ENGINE_STATUS, 0),
      textOf(T({}, eng(ENGINE_LIMP)), MISSION_ENGINE_STATUS, 0),
    ];
    expect(texts.map((s) => Math.round(textWidthPx(s, 22)))).toEqual([568, 532, 392, 423]); // spec §D.1 の表
    const far = { dx: -2200, dy: -2200 }; // 北西・刻みの上限（3,150 m）
    const det = { detected: true, ...far, sighted: true, passes: 15, maxPasses: 15, lastPassHits: 63, lastPassFired: true, damagePerHit: 4 };
    const burst = { ...det, passing: true, burst: true, threatPhase: PT_PASS, dodge: 1, escapeDeg: 315 };
    const cases: [Partial<PtTelemetry>, number][] = [
      [{ ...det, passing: true, fired: true, dodge: 0 }, 0], // 掃射 ・ そのまま全速で離れろ
      [{ ...det, passing: true, dodge: 1, escapeDeg: 315 }, 0], // 航過 ・ 北西へ全速で転舵
      [{ ...det, passing: true, passSilenced: true }, 0], // 被弾で沈黙
      [burst, 0], [{ ...burst, fired: true }, 0], [{ ...burst, passSilenced: true }, 0], [{ ...burst, passSilenced: true, passRetired: true }, 0], // 追撃・連射・制圧・撃退で黙った
      [det, RESULT], [{ ...det, lastPassHits: 0 }, RESULT], [{ ...det, lastPassFired: false }, RESULT], // 被弾・かわした・撃たせなかった
      [{ ...det, threatPhase: PT_CHASE, burstFired: true, bursts: 15 }, RESULT], [{ ...det, threatPhase: PT_CHASE, burstFired: true, bursts: 15, lastPassHits: 0 }, RESULT], // 連射の結果
      [{ ...det, threatPhase: PT_RUN_IN }, 0], [{ ...det, threatPhase: PT_RUN_IN, sighted: false }, 0], // 突撃・エンジン音
      [{ ...det, threatPhase: PT_CHASE }, 0], [{ ...det, threatPhase: PT_CHASE, gunEverFired: true }, 0], [{ ...det, threatPhase: PT_CHASE, dx: 400, dy: -800 }, 0], // 追ってくる（射程の外）
      [{ ...det, threatPhase: PT_BREAK }, 0], [{ ...det, threatPhase: PT_BREAK, gunEverFired: true }, 0], // 離脱
    ];
    let widest = 0;
    for (const [pt, flags] of cases) {
      for (const [stage, tag] of [[ENGINE_FINAL, ' ・ 機関 限界'], [ENGINE_LIMP, ' ・ 機関 不調']] as const) {
        const [mode, text] = rowOf(T(pt, eng(stage)), 0, flags);
        expect([MISSION_PT_PASS, MISSION_PT_CONTACT], JSON.stringify(pt)).toContain(mode);
        expect(text.endsWith(tag), text).toBe(true);
        expect(textWidthPx(text, 22), text).toBeLessThanOrEqual(LINE2_MAX_PX);
        widest = Math.max(widest, textWidthPx(text, 22));
      }
    }
    expect(widest).toBeLessThanOrEqual(790); // いちばん長いのは 3,150 m の追ってくる PT の行＋札で 784 px（spec §D.1 の表は 900 m で 771 px）
  });
  it('札は 13mm の射撃・出来事と平常の行には付けない。機関の無い夜（on false）は札が付かない（過熱の出来事の旗も立たない＝下の時計のテスト）', () => {
    const firing = { detected: true, threatPhase: PT_RUN_IN, dx: 300, dy: -400, sighted: true, gunStatus: GUN_FIRING, gunTargetM: 231, gunHits: 3, gunEverFired: true };
    expect(rowOf(T(firing, eng(ENGINE_LIMP)))).toEqual([MISSION_PT_GUN, '射撃中 ・ PT 250 m ・ 命中 計 3']);
    expect(rowOf(T({ detected: true, gunEvent: PT_GUN_EV_CREW, fighting: 1 }, eng(ENGINE_LIMP)), 0, MODE_FLAG_PT_GUN_EVENT)[1].includes('機関')).toBe(false);
    expect(rowOf(T({}, eng(ENGINE_LIMP)), CALL_DAWN)[0]).toBe(MISSION_ENGINE_STATUS); // 帰投せよより上
    const off = createEngineTelemetry();
    for (const stage of [ENGINE_FINAL, ENGINE_LIMP] as const) {
      const t = T({ detected: true, threatPhase: PT_RUN_IN, dx: 300, dy: -400, sighted: true }, { ...off, stage }, { targetStep: 'full' });
      expect(engineTagKey(t.engine)).toBe(0);
      expect(rowOf(t)).toEqual([MISSION_PT_CONTACT, '米PT 北東から突撃 500 m ・ 赤い線で転舵']);
    }
  });
});

describe('優先順（spec §G.1）', () => {
  it('燃料切れ ＞ 赤い線 ＞ 13mm の出来事 ＞ 機関の出来事 ＞ 航過の結果 ＞ 限界（全速） ＞ 13mm の射撃 ＞ 米PT との接触 ＞ 機関の状態 ＞ 帰投せよ ＞ 米PT の平常', () => {
    const pt: Partial<PtTelemetry> = { detected: true, passing: true, dodge: 1, escapeDeg: 315, threatPhase: PT_RUN_IN, dx: 300, dy: -400, sighted: true, gunStatus: GUN_FIRING, gunTargetM: 231, gunEverFired: true, passes: 1, lastPassFired: true };
    const over: Partial<BoatTelemetry> = { fuelEmpty: true, targetStep: 'full' };
    let flags = MODE_FLAG_PT_GUN_EVENT | ENG | RESULT;
    let e = eng(ENGINE_FINAL);
    let call = CALL_DAWN;
    const steps: [() => void, number][] = [
      [() => {}, MISSION_ADRIFT],
      [() => (over.fuelEmpty = false), MISSION_PT_PASS],
      [() => (pt.passing = false), MISSION_PT_GUN_EVENT],
      [() => (flags &= ~MODE_FLAG_PT_GUN_EVENT), MISSION_ENGINE_EVENT],
      [() => (flags &= ~ENG), MISSION_PT_CONTACT],
      [() => (flags &= ~RESULT), MISSION_ENGINE_FINAL],
      [() => (over.targetStep = 'cruise'), MISSION_PT_GUN],
      [() => (pt.gunStatus = 0), MISSION_PT_CONTACT],
      [() => (pt.detected = false), MISSION_ENGINE_STATUS],
      [() => (e = eng(ENGINE_OK)), MISSION_CALL],
      [() => (call = 0), MISSION_PT],
    ];
    for (const [change, want] of steps) {
      change();
      expect(missionMode(tele(pt, { ...over, engine: e }), call, flags)).toBe(want);
    }
  });
  it('R5: 突撃・追撃・離脱の行は機関の状態（限界で全速でない・不調）に勝ち、札が付く。全速の帯の限界だけが接触より上', () => {
    const rush = { detected: true, threatPhase: PT_RUN_IN, dx: 300, dy: -400, sighted: true };
    expect(rowOf(T(rush, eng(ENGINE_LIMP)))).toEqual([MISSION_PT_CONTACT, '米PT 北東から突撃 500 m ・ 赤い線で転舵 ・ 機関 不調']);
    expect(rowOf(T({ ...rush, threatPhase: PT_CHASE }, eng(ENGINE_FINAL)))[1].endsWith(' ・ 機関 限界')).toBe(true);
    expect(rowOf(T({ ...rush, threatPhase: PT_BREAK }, eng(ENGINE_LIMP)))[0]).toBe(MISSION_PT_CONTACT);
    expect(rowOf(T(rush, eng(ENGINE_FINAL), { targetStep: 'full' }))).toEqual([MISSION_ENGINE_FINAL, '機関 限界！ 巡航以下に落とせ（このままだと不調）']);
  });
});

describe('キー（文が変わるときだけ変わる）', () => {
  it('熱が動いても段と残りの秒の整数が同じなら同じ。段・モード・残りの秒の整数で変わる', () => {
    const k = (e: EngineTelemetry, over: Partial<BoatTelemetry> = {}, flags = 0): [number, number, number] => {
      const t = T({}, e, over);
      const mode = missionMode(t, 0, flags);
      return [mode, engineKey(t, mode), engineTagKey(t.engine)];
    };
    expect(k(eng(ENGINE_FINAL, { heat: 0.86 }))).toEqual(k(eng(ENGINE_FINAL, { heat: 0.99 })));
    expect(k(eng(ENGINE_FINAL, { heat: 0.86 }), { targetStep: 'full' })).toEqual(k(eng(ENGINE_FINAL, { heat: 0.97 }), { targetStep: 'full' }));
    expect(k(eng(ENGINE_WARN, { heat: 0.61 }), {}, ENG)).toEqual(k(eng(ENGINE_WARN, { heat: 0.84 }), {}, ENG));
    expect(k(eng(ENGINE_LIMP, { heat: 0.99, limpLeftS: 7.9 }))).toEqual(k(eng(ENGINE_LIMP, { heat: 0.96, limpLeftS: 7.1 })));
    expect(k(eng(ENGINE_LIMP, { limpLeftS: 7.1 }))).not.toEqual(k(eng(ENGINE_LIMP, { limpLeftS: 6.9 })));
    expect(k(eng(ENGINE_LIMP))).not.toEqual(k(eng(ENGINE_FINAL)));
    expect(k(eng(ENGINE_FINAL))).not.toEqual(k(eng(ENGINE_FINAL), { targetStep: 'full' }));
    // 札のキー: 0 なし・1 限界・2 不調（熱では変わらない）
    expect([ENGINE_OK, ENGINE_WARN, ENGINE_FINAL, ENGINE_LIMP].map((s) => engineTagKey(eng(s as EngineStage)))).toEqual([0, 0, 1, 2]);
    expect(engineTagKey(eng(ENGINE_FINAL, { heat: 0.86 }))).toBe(engineTagKey(eng(ENGINE_FINAL, { heat: 1 })));
  });
});

/** 時計と前のフレームのモード（mission-line と同じ順で 1 フレームずつ進める） */
class Hud {
  readonly c = new PtLineClock();
  ms = 0;
  mode = -1;
  frame(pt: Partial<PtTelemetry>, e: EngineTelemetry): [number, string, number] {
    const t = T({ detected: true, fighting: 2, ...pt }, e);
    const flags = this.c.flags(t, this.ms, this.mode);
    const mode = missionMode(t, 0, flags);
    this.c.shown(mode);
    this.mode = mode;
    return [mode, textOf(t, mode, flags), flags];
  }
  until(toMs: number, pt: Partial<PtTelemetry>, e: EngineTelemetry): [number, string, number] {
    let r = this.frame(pt, e);
    while (this.ms + F <= toMs) {
      this.ms += F;
      r = this.frame(pt, e);
    }
    return r;
  }
}

describe('過熱の出来事の時計（ui/pt-line-clock。R3）', () => {
  const warned = eng(ENGINE_WARN, { eventSeq: 1, lastEvent: ENGINE_EV_WARN });
  const line = { passing: true, dodge: 1, escapeDeg: 315 };
  it('赤い線の下に来た出来事は線が消えてから 3.5 秒出る。出た後に次の赤い線に替わられたら、その時計のまま終わる', () => {
    const h = new Hud();
    const [m0, t0, f0] = h.until(5000, line, warned);
    expect([m0, f0 & ENG]).toEqual([MISSION_PT_PASS, ENG]);
    expect(t0).toBe('米PT 航過！ 北西へ全速で転舵'); // 過熱では札なし
    h.ms += F;
    const shownAt = h.ms;
    expect(h.frame({}, warned)[0]).toBe(MISSION_ENGINE_EVENT);
    h.until(shownAt + 1000, {}, warned);
    h.ms += F;
    expect(h.until(shownAt + 3000, line, warned)[0]).toBe(MISSION_PT_PASS); // 2 秒の線
    h.ms += F;
    expect(h.frame({}, warned)[0]).toBe(MISSION_ENGINE_EVENT); // 残りの約 0.5 秒
    expect(h.until(shownAt + ENGINE_EVENT_SHOW_MS + 2 * F, {}, warned)[0]).toBe(MISSION_PT_CONTACT); // 出し直さない（接触の行へ）
  });
  it('航過の結果は機関の出来事の下で待ち、出来事の後に 2.5 秒出る', () => {
    const h = new Hud();
    h.frame({ passSeq: 0 }, eng(ENGINE_OK));
    h.ms += F;
    expect(h.frame({ passSeq: 0 }, warned)[0]).toBe(MISSION_ENGINE_EVENT);
    const res = { passSeq: 1, passes: 1, lastPassFired: true, lastPassHits: 0, maxPasses: 8 };
    h.ms += F;
    const [m1, , f1] = h.until(ENGINE_EVENT_SHOW_MS - 100, res, warned);
    expect([m1, f1 & RESULT]).toEqual([MISSION_ENGINE_EVENT, RESULT]);
    h.ms += 200;
    expect(h.frame(res, warned)[1]).toBe('かわした！ 被弾なし ・ 航過 1/8');
    expect(h.until(h.ms + PT_RESULT_SHOW_MS - 2 * F, res, warned)[0]).toBe(MISSION_PT_CONTACT);
  });
  it('段が過熱でなくなったら待っている出来事は捨てる（限界・不調へ進んだ・冷えた）。過熱のほかの出来事（限界・不調・回復）では始めない。機関の無い夜は立てない', () => {
    const h = new Hud();
    h.until(3000, line, warned);
    h.ms += F;
    expect(h.frame(line, eng(ENGINE_FINAL, { eventSeq: 2, lastEvent: ENGINE_EV_FINAL }))[2] & ENG).toBe(0);
    h.ms += F;
    expect(h.frame({}, eng(ENGINE_FINAL, { eventSeq: 2, lastEvent: ENGINE_EV_FINAL }))[0]).toBe(MISSION_PT_CONTACT); // 「限界」は札と右下の帯
    for (const ev of [ENGINE_EV_FINAL, ENGINE_EV_LIMP, ENGINE_EV_RECOVER] as const) {
      const g = new Hud();
      g.frame({}, eng(ENGINE_WARN));
      g.ms += F;
      expect(g.frame({}, eng(ENGINE_WARN, { eventSeq: 1, lastEvent: ev }))[2] & ENG).toBe(0); // 回復は熱 0.6＝段 1 でも過熱の行を出さない
    }
    const cool = new Hud();
    cool.frame(line, warned);
    cool.ms += F;
    expect(cool.frame({}, eng(ENGINE_OK, { eventSeq: 1, lastEvent: ENGINE_EV_WARN }))[2] & ENG).toBe(0);
    const off = new Hud();
    expect(off.frame({}, { ...createEngineTelemetry(), eventSeq: 1, lastEvent: ENGINE_EV_WARN, stage: ENGINE_WARN })[2] & ENG).toBe(0);
  });
});

describe('Result の 1 行（spec §D.4。20 px）', () => {
  it('不調があった・限界まで・過熱まで・過熱なし。秒は小数なしの整数。幅は論理幅 1280 − 左右の HUD_MARGIN の内', () => {
    const lines = [
      engineResultLine({ warns: 3, finals: 3, limps: 2, limpS: 16.03 }),
      engineResultLine({ warns: 1, finals: 1, limps: 0, limpS: 0 }),
      engineResultLine({ warns: 2, finals: 0, limps: 0, limpS: 0 }),
      engineResultLine({ warns: 0, finals: 0, limps: 0, limpS: 0 }),
    ];
    expect(lines).toEqual(['機関 不調 2 回（計 16 秒） ・ 限界 3 回', '機関 限界 1 回 ・ 不調なし', '機関 過熱 2 回 ・ 限界なし', '機関 過熱なし']);
    expect(lines.map((s) => Math.round(textWidthPx(s, 20)))).toEqual([417, 272, 272, 132]);
    expect(textWidthPx(engineResultLine({ warns: 99, finals: 99, limps: 99, limpS: 792 }), 20)).toBeLessThanOrEqual(1280 - 2 * 24);
  });
  it('人物名を出さない（CLAUDE.md §11）', () => {
    const all = [
      textOf(T({}, eng(ENGINE_WARN)), MISSION_ENGINE_EVENT, ENG), textOf(T({}, eng(ENGINE_FINAL), { targetStep: 'full' }), MISSION_ENGINE_FINAL, 0),
      textOf(T({}, eng(ENGINE_FINAL)), MISSION_ENGINE_STATUS, 0), textOf(T({}, eng(ENGINE_LIMP)), MISSION_ENGINE_STATUS, 0),
      engineTagJa(1), engineTagJa(2), engineResultLine({ warns: 3, finals: 3, limps: 2, limpS: 16 }),
    ].join('\n');
    for (const name of PERSON_DENYLIST) expect(all).not.toContain(name);
    expect(RANK_RE.test(all)).toBe(false);
  });
});
