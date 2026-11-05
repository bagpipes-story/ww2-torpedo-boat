// v0.6.11 S5（spec-v0611-r2 §13 の S5・§10.1〜§10.3・「S3b の追記」）: 空襲下の退避（jp_03）の HUD の文（ui/evac-lines）とテレメトリ（systems/evac-telemetry）。
// - どの行も 22 px で ≤ 840 px（予告の尾の全部の組 × 狙いの数 0〜3 × 波 × 機数 × 編隊 2／3。尾が 2 つなら「東から」を落とす＝r2 M10）、3 行目の全部の形は 20 px で ≤ 596 px（r2 H4）。
// - もう一度来る編隊の予告し直し（repass.ev のビット・plan.evWave は立たない）も最初の予告と同じ形の警告の行と赤い輪（sq.targeted）。
// - jp_03 の文（2 行目・3 行目・中央の帯・時計）に「夜明け」が無い。テレメトリは世界と模擬の突き合わせが比べる物（sq.order など）を書かない。
// 小さな世界（tests/evac-world-kit）を模擬の台本（core/evac-sim の mirror）で歩かせ、フレームごとにテレメトリと文を組む（HUD と同じ: キーが変わったときだけ文）。
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { DAWN_AIR_ENEMY, createDawnTelemetry } from '../src/core/dawn-air';
import { G_ENTERING, G_FOUND, G_HAULING, G_HIDDEN, G_MOORED, G_UNDERWAY, SW_FREE, SW_WAIT_INPUT, SW_WAIT_NEUTRAL } from '../src/core/evac-data';
import { EF_ANNOUNCED } from '../src/core/evac-plan';
import type { EvacMirror } from '../src/core/evac-replay';
import { runEvacTrial } from '../src/core/evac-sim';
import type { EvacPolicy } from '../src/core/evac-sim-policy';
import { EVAC_HINT_FOUND, EVAC_HINT_FULL, EVAC_HINT_NONE } from '../src/core/evac-squadron';
import {
  EVA_NONE, EVA_REPASS, EVA_WAVE, EVE_DOWN, EVE_FOUND, EVE_GUN, EVE_HIDDEN, EVE_LOST, EVE_NONE, EVE_SETTLE, EVE_SINK, EVS_GONE, EVS_LEADER, EVS_SEAT, EVS_SEAT_END, EVS_WINGMAN, type EvacTelemetry,
} from '../src/core/evac-telemetry';
import { evacSimSetup } from '../src/systems/evac-sim-setup';
import { initEvacTelemetry, refreshEvacTelemetry } from '../src/systems/evac-telemetry';
import { clockJa, dawnBannerLines, strikeLine } from '../src/ui/dawn-lines';
import {
  EVAC_LINE_MAX_PX, EVAC_STATUS_MAX_PX, EVL_ANNOUNCE, EVL_NORMAL, evacAnnounceJa, evacBannerLines, evacLine, evacLineKey, evacLineMode, evacSettleBannerLines, evacStatusKey, evacStatusLine, jaWidthPx, mssJa, shortPlaceJa,
} from '../src/ui/evac-lines';
import { composeLineKeys, createLineKeys } from '../src/ui/mission-line-keys';
import { MISSION_ADRIFT, MISSION_EVAC, MISSION_STRIKE, MISSION_WAITING, missionMode } from '../src/ui/mission-mode';
import { specialLine } from '../src/ui/special-line';
import { AS_T_FALLING, AS_T_INBOUND, AS_T_REST } from '../src/core/air-strike';
import { CALL_DAWN } from '../src/core/mission-flow';
import { miniWorld, type MiniWorld } from './evac-world-kit';
import { tele, textWidthPx } from './pt-ui-kit';

/** 実際の呼び名（data）の入ったテレメトリ（世界を作った直後） */
const base = (): EvacTelemetry => initEvacTelemetry(miniWorld(1));
const clone = (e: EvacTelemetry, over: Partial<EvacTelemetry> = {}): EvacTelemetry => ({
  ...e, hp: Float64Array.from(e.hp), annTargets: Int32Array.from(e.annTargets), annTargetPlanes: Int32Array.from(e.annTargetPlanes), groupDx: Float64Array.from(e.groupDx), groupDy: Float64Array.from(e.groupDy), ...over,
});

describe('文の見積もりと形', () => {
  it('jaWidthPx は tests/pt-ui-kit の textWidthPx と同じ・m:ss・長い場所の名だけ短く', () => {
    for (const s of ['第1隊 屋我地の陰（東）で待機', '爆弾投下！ 転舵！', 'HP 60・沈・60', '1420 m']) expect(jaWidthPx(s, 22)).toBeCloseTo(textWidthPx(s, 22), 9);
    expect([mssJa(0), mssJa(5.2), mssJa(65), mssJa(240), mssJa(1224)]).toEqual(['0:00', '0:06', '1:05', '4:00', '20:24']);
    expect([shortPlaceJa('屋我地の陰（東）'), shortPlaceJa('西の壕'), shortPlaceJa('中の壕')]).toEqual(['陰（東）', '西の壕', '中の壕']);
    const e = base();
    expect(e.enabled).toBe(true);
    expect([e.groupLabels.length, e.shelterLabels, e.total, e.quota, e.historical, e.fromJa, e.dawnPlanes]).toEqual([6, ['中の壕', '西の壕', '東の壕', '屋我地の陰（東）'], 18, 6, 5, '東', 4]);
  });
});

/**
 * 予告の行の全部の組（波 × 機数 × 編隊 2／3 × 狙いの数 0〜3 × 操作中の隊が隠れている × 目標なしの編隊 0〜2 × 予告し直し）。狙った隊が始まる前に隠れた組と、
 * 予告し直しの編隊ごとの機数の違う組は tests/evac-lines-s8b（v0.6.11 S8b）
 */
function announceCases(e0: EvacTelemetry): EvacTelemetry[] {
  const out: EvacTelemetry[] = [];
  for (const kind of [EVA_WAVE, EVA_REPASS])
    for (let w = 0; w < 4; w++)
      for (const planes of [2, 3, 4])
        for (const flights of [2, 3])
          for (let n = 0; n <= Math.min(3, flights); n++)
            for (const hidden of [false, true])
              for (let none = 0; none <= flights - n; none++)
                for (const ctl of [0, 5]) {
                  const e = clone(e0, { annKind: kind, annWave: w, annPlanes: kind === EVA_WAVE ? planes : planes * n, annFlights: flights, annCount: n, annNoTarget: none, phase: hidden ? G_HIDDEN : G_UNDERWAY, control: ctl });
                  e.annTargetPlanes.fill(planes);
                  // 狙い: 操作中の隊（隠れていなければ枠 0）とほかの隊
                  for (let i = 0; i < n; i++) e.annTargets[i] = !hidden && i === 0 ? ctl : (ctl + 1 + i) % 6;
                  out.push(e);
                }
  return out;
}

describe('2 行目（22 px で ≤ 840 px。spec §10.1）', () => {
  it('予告: 尾の全部の組で ≤ 840 px。尾が 2 つ（操作中の隊が隠れている ＋ 目標なし）なら「東から」を落とす（r2 M10）。予告し直しは「戻ってきた」で同じ形', () => {
    const cases = announceCases(base());
    let max = 0;
    for (const e of cases) {
      const s = evacAnnounceJa(e);
      max = Math.max(max, jaWidthPx(s, 22));
      expect(jaWidthPx(s, 22), s).toBeLessThanOrEqual(EVAC_LINE_MAX_PX);
      const twoTails = e.phase === G_HIDDEN && e.annKind === EVA_WAVE && e.annNoTarget > 0 && e.annCount > 0;
      if (twoTails) expect(s, s).not.toContain('東から');
      expect(s.includes('戻ってきた')).toBe(e.annKind === EVA_REPASS);
      expect(s).not.toContain('夜明け');
      expect(evacLineMode(e)).toBe(EVL_ANNOUNCE);
    }
    expect(cases.length).toBeGreaterThan(1000);
    expect(max).toBeGreaterThan(700); // 見積もりがきちんと長い行を作っている
    const e = clone(base(), { annKind: EVA_WAVE, annWave: 3, annPlanes: 4, annFlights: 3, annCount: 3, phase: G_UNDERWAY, control: 0 });
    e.annTargets.set([0, 3, 5]);
    expect(evacAnnounceJa(e)).toBe('第4波 4機×3 東から ・ 狙い 第1隊（操作中）、第4隊、第6隊');
    const h = clone(e, { annWave: 0, annPlanes: 2, annCount: 2, annNoTarget: 1, phase: G_HIDDEN });
    h.annTargets.set([1, 3, 0]);
    expect(evacAnnounceJa(h)).toBe('第1波 2機×3 ・ 狙い 第2隊、第4隊 ・ 第1隊は隠れている ・ 1編隊 目標なし');
    const r = clone(e, { annKind: EVA_REPASS, annWave: 1, annPlanes: 3, annCount: 1, phase: G_UNDERWAY });
    r.annTargets.set([3, 0, 0]);
    r.annTargetPlanes.set([3, 0, 0]);
    expect(evacAnnounceJa(r)).toBe('第2波 3機 戻ってきた 東から ・ 狙い 第4隊');
    expect(evacBannerLines(r)).toEqual(['第2波 — 編隊が戻ってきた']);
    expect(evacBannerLines(e)).toEqual(['第4波 — 空襲 4機×3']);
  });

  it('全部の行のいちばん長い値で ≤ 840 px・「夜明け」なし（場所の名は長い陰（東）、距離は 4 桁、残存 18）', () => {
    const e0 = base();
    const texts: string[] = [];
    const push = (over: Partial<EvacTelemetry>): void => {
      for (const ctl of [0, 5])
        for (let s = 0; s < 4; s++) {
          const e = clone(e0, { control: ctl, shelter: s, hintShelter: s, near: s, eventShelter: s, eventGroup: 5 - ctl, fireGroup: 5 - ctl, nearFree: 3, hintFree: 2, afloat: 3, upCount: 2, hauling: true, nearEdgeM: 3180, leftS: 239.2, ...over });
          texts.push(evacLine(e).text);
        }
    };
    push({ falling: true });
    for (const ev of [EVE_SETTLE, EVE_LOST, EVE_DOWN, EVE_FOUND, EVE_HIDDEN, EVE_GUN]) push({ event: ev, eventN: ev === EVE_DOWN ? 3 : 18, eventSub: 4 });
    push({ event: EVE_DOWN, eventN: 0 });
    for (const sub of [EVS_WINGMAN, EVS_LEADER, EVS_SEAT, EVS_GONE, EVS_SEAT_END]) for (const tg of [false, true]) push({ event: EVE_SINK, eventSub: sub, eventN: 17, eventTargeted: tg });
    push({ event: EVE_SINK, eventSub: EVS_SEAT_END, eventN: 0 });
    push({ settled: true });
    push({ settled: true, near: -1 });
    push({ settled: true, dawnPlanes: 0 });
    for (const ph of [G_UNDERWAY, G_MOORED, G_FOUND]) for (const latch of [SW_WAIT_INPUT, SW_WAIT_NEUTRAL]) push({ latch, phase: ph });
    for (const ph of [G_UNDERWAY, G_MOORED]) push({ latch: SW_WAIT_NEUTRAL, phase: ph, takeHold: true, event: EVE_SINK, eventSub: EVS_GONE, eventN: 12 }); // 全滅の後の自動の切替（S8b）
    push({ hint: EVAC_HINT_FOUND });
    push({ phase: G_FOUND });
    push({ hint: EVAC_HINT_FULL });
    push({ phase: G_HAULING });
    push({ phase: G_ENTERING });
    push({ phase: G_HIDDEN, latch: SW_WAIT_NEUTRAL });
    push({ phase: G_HIDDEN, latch: SW_FREE });
    push({ near: -1 });
    push({});
    push({ fireGroup: -1, nearEdgeM: 0 });
    for (const s of texts) {
      expect(jaWidthPx(s, 22), s).toBeLessThanOrEqual(EVAC_LINE_MAX_PX);
      expect(s).not.toContain('夜明け');
    }
    expect(new Set(texts).size).toBeGreaterThan(60);
    // 待機の行は陰（東）では「陰（東）」に縮む（840 px を超えるため。spec §18）、壕は名のまま
    const wait = (s: number, latch: number): string => evacLine(clone(e0, { phase: G_HIDDEN, shelter: s, latch, leftS: 65 })).text;
    expect(wait(3, SW_WAIT_NEUTRAL)).toBe('第1隊 陰（東）で待機 ・ 空襲が去るまで 1:05 ・ 離してから倒すと出る');
    expect(wait(0, SW_WAIT_INPUT)).toBe('第1隊 中の壕で待機 ・ 空襲が去るまで 1:05 ・ 倒すと出る');
    expect(evacLine(clone(e0, { near: 3, nearFree: 3, nearEdgeM: 1407 })).text).toBe('第1隊を操作中 ・ 近い隠れ場所 屋我地の陰（東） 空き 3 ・ 1420 m');
    expect(evacLine(clone(e0, { event: EVE_SINK, eventSub: EVS_LEADER, eventGroup: 1, eventN: 14, eventTargeted: true })).text).toBe('第2隊の隊長艇 沈没 ・ 僚艇が隊長艇に（残存 14） ・ 編隊は第2隊を追う');
    expect(evacLine(clone(e0, { event: EVE_SINK, eventSub: EVS_SEAT, eventN: 14, eventTargeted: false })).text).toBe('隊長艇 沈没！ 僚艇に乗り移った（残存 14）');
    expect(evacLine(clone(e0, { event: EVE_LOST, eventGroup: 3, eventSub: 3 })).text).toBe('第4隊を見失った！ 3機が引き返す');
    expect(evacLine(clone(e0, { event: EVE_DOWN, eventGroup: 3, eventN: 3 })).text).toBe('敵機 1 機を撃墜（第4隊を狙う編隊は残り 3 機）');
  });

  it('上ほど優先（spec §10.1 の表の順）: 落下 > 予告 > 決着 > 見失った > 沈没 > 撃墜 > 決着の後 > 引き継いだ > 入れない陰 > 見つかった > 満杯 > 上げている > 入る > 隠れた > 火災 > 機銃 > 待機 > 隠れる所なし > 平常', () => {
    const e = clone(base(), { near: 1, fireGroup: -1, latch: SW_FREE });
    expect(evacLineMode(e)).toBe(EVL_NORMAL);
    const order: [Partial<EvacTelemetry>, string][] = [
      [{ near: -1 }, '隠れる所が無い'], [{ phase: G_HIDDEN }, 'で待機'], [{ event: EVE_GUN, eventN: 3 }, '機銃は僚艇も撃つ'], [{ fireGroup: 2 }, '第3隊の隊長艇が燃えている'],
      [{ event: EVE_HIDDEN, eventGroup: 0, eventShelter: 1 }, '西の壕に隠れた'], [{ phase: G_ENTERING, shelter: 1 }, '西の壕に入る'], [{ phase: G_HAULING, shelter: 1 }, 'レールで上げている'],
      [{ hint: EVAC_HINT_FULL, hintShelter: 2 }, '東の壕は満杯'], [{ phase: G_FOUND, shelter: 3 }, 'が見つかった！'], [{ hint: EVAC_HINT_FOUND, hintShelter: 3 }, '輪の外へ出てから'],
      [{ latch: SW_WAIT_INPUT, phase: G_UNDERWAY }, '引き継いだ'], [{ settled: true }, '壕か陰へ'], [{ event: EVE_DOWN, eventGroup: 1, eventN: 2 }, '撃墜'], [{ event: EVE_SINK, eventSub: EVS_WINGMAN, eventGroup: 1 }, '僚艇 沈没'],
      [{ event: EVE_LOST, eventGroup: 1, eventSub: 2 }, '見失った'], [{ event: EVE_SETTLE, eventN: 8 }, '第1次の空襲が去った ・ 残存 8 で確定'], [{ annKind: EVA_WAVE, annWave: 0, annPlanes: 2, annCount: 0 }, '第1波'], [{ falling: true }, '爆弾投下！ 転舵！'],
    ];
    let cur: Partial<EvacTelemetry> = { fireGroup: -1 };
    for (const [o, want] of order) {
      cur = { ...cur, ...o };
      const t = evacLine(clone(e, cur)).text;
      expect(t, JSON.stringify(o)).toContain(want);
    }
  });
});

describe('3 行目（20 px で ≤ 596 px＝W 1280 で左上の HP の箱に触れない。r2 H4）', () => {
  it('全部の形（HP 60・1・沈、残存 0〜18、隠れ 0〜18、次の波 0〜4:00・波なし・確定）で ≤ 596 px・「夜明け」なし', () => {
    const e0 = base();
    let max = 0;
    for (const hp of [[60, 60, 60], [1, -1, 60], [-1, -1, 9]])
      for (const n of [0, 9, 18])
        for (const next of [0, 18.2, 240, NaN, -1]) {
          const e = clone(e0, { control: 5, survivors: n, hiddenBoats: n, nextWaveS: next < 0 ? NaN : next, settled: next < 0 });
          e.hp.set(hp);
          const s = evacStatusLine(e);
          max = Math.max(max, jaWidthPx(s, 20));
          expect(jaWidthPx(s, 20), s).toBeLessThanOrEqual(EVAC_STATUS_MAX_PX);
          expect(s).not.toContain('夜明け');
        }
    expect(max).toBeGreaterThan(500);
    const e = clone(e0, { control: 2, survivors: 18, hiddenBoats: 15, nextWaveS: 17.4 });
    e.hp.set([60, -1, 42.5]);
    expect(evacStatusLine(e)).toBe('第3隊 HP 60・沈・43 ・ 残 18／18 ・ 隠 15 ・ 次 0:18');
    expect(evacStatusLine(clone(e, { nextWaveS: NaN }))).toBe('第3隊 HP 60・沈・43 ・ 残 18／18 ・ 隠 15 ・ 波なし');
    expect(evacStatusLine(clone(e, { settled: true }))).toBe('第3隊 HP 60・沈・43 ・ 残 18／18 ・ 隠 15 ・ 確定');
    // キー: 次の波の秒が変われば変わり、文に出ない値（座席の位置）では変わらない
    const k = evacStatusKey(e);
    expect(evacStatusKey(clone(e, { nextWaveS: 16.2 }))).not.toBe(k);
    expect(evacStatusKey(clone(e, { nextWaveS: 17.1 }))).toBe(k);
    expect(evacStatusKey(clone(e, { nearDx: 5 }))).toBe(k);
    expect(Number.isSafeInteger(k)).toBe(true);
  });
});

describe('昼の言い方（day_start の任務だけ。spec §10.3・r2 M9）', () => {
  it('時計は「空襲 残り 1:35」「空襲後 0:12」（≤ 184 px）、240 秒の帯は「第1次の空襲が去った」。ほかの任務の文は今のまま', () => {
    const t = tele({}, { timeLeftS: 94.2, dawn: { ...createDawnTelemetry(), dayStart: true } });
    expect(clockJa(t)).toBe('空襲 残り 1:35');
    const a = tele({}, { dawn: { ...createDawnTelemetry(), dayStart: true, reached: true, daylightS: 12.7 } });
    expect(clockJa(a)).toBe('空襲後 0:12');
    expect(clockJa(tele({}, { dawn: { ...createDawnTelemetry(), dayStart: true, reached: true, daylightS: 1224.4 } }))).toBe('空襲後 20:24');
    for (const s of ['空襲 残り 4:00', '空襲後 99:59']) expect(textWidthPx(s, 20)).toBeLessThanOrEqual(184);
    expect(clockJa(tele({}, { timeLeftS: 94.2 }))).toBe('夜明けまで 95 秒');
    const e = clone(base(), { survivors: 8 });
    const d = { ...createDawnTelemetry(), dayStart: true, reached: true, air: DAWN_AIR_ENEMY, strikeEnabled: true, nameJa: '米艦載機', count: 4, fromJa: '東' };
    const lines = dawnBannerLines(tele({}, { dawn: d, evac: e }));
    expect(lines).toEqual(evacSettleBannerLines(e, '米艦載機 4 機が東から来る ・ 投下で転舵（旋回中は逆へ）'));
    expect(lines[0]).toBe('第1次の空襲が去った');
    // 外の夜は「確定」と言わない（外の座席が追撃で沈めば 1 減る。v0.6.11 S8）、中の夜は「確定」
    expect(lines[1]).toBe('残存 8／18（6 隻以上で達成 ・ 隊長艇が沈めば 1 減る）');
    expect(evacSettleBannerLines(e, '')).toEqual(['第1次の空襲が去った', '残存 8／18 で確定（6 隻以上で達成）']);
    for (const s of lines) expect(s).not.toContain('夜明け');
  });
  it('240 秒の後の §2 の 4 機の接近の行は「追撃！ … 壕か陰へ急げ」（jp_03 は「帰投」と言わない。v0.6.11 S8）。ほかの任務は「空襲！ … 帰投を急げ」のまま', () => {
    const d = { ...createDawnTelemetry(), reached: true, air: DAWN_AIR_ENEMY, strikeEnabled: true, nameJa: '米艦載機', count: 4, fromJa: '東', threat: AS_T_INBOUND, inboundDistM: 2480 };
    const day = strikeLine(tele({}, { dawn: { ...d, dayStart: true }, evac: base() }), 0, false, false).text;
    expect(day).toBe('追撃！ 敵機 4 機 ・ 東から 2500 m ・ 壕か陰へ急げ');
    expect(textWidthPx(day, 22)).toBeLessThanOrEqual(EVAC_LINE_MAX_PX);
    for (const w of ['帰投', '夜明け']) expect(day).not.toContain(w);
    expect(strikeLine(tele({}, { dawn: d }), 0, false, false).text).toBe('空襲！ 敵機 4 機 ・ 東から 2500 m ・ 帰投を急げ');
  });
});

interface Seen {
  lines: Set<string>;
  status: Set<string>;
  banners: string[];
  repassFrames: number;
  repassRingOk: boolean;
  waveFrames: number;
  events: Set<number>;
  orderTouched: boolean;
  keySame: number;
}

/** 小さな世界を模擬の台本で maxS 秒歩かせ、フレームごとにテレメトリと HUD の文（キーが変わったときだけ）を組む */
function hudRun(seed: number, hard: boolean, policy: EvacPolicy, maxS: number): Seen {
  const w: MiniWorld = miniWorld(seed, hard);
  const t = initEvacTelemetry(w);
  const seen: Seen = { lines: new Set(), status: new Set(), banners: [], repassFrames: 0, repassRingOk: true, waveFrames: 0, events: new Set(), orderTouched: false, keySame: 0 };
  let lastKey = NaN;
  let lastText = '';
  let lastStatus = NaN;
  let lastAnn = t.annSeq;
  const m: EvacMirror = {
    begin: () => {},
    frame: (k, fo) => {
      if (k >= maxS * 60) throw new Error('stop');
      w.input.stickActive = true;
      w.input.headingDeg = fo.headingDeg;
      w.input.speed01 = fo.speed01;
      w.input.gunHeld = fo.gunHeld;
      w.input.extinguishHeld = fo.extHeld;
      w.input.switchTap = fo.switchTap;
      w.frame();
    },
    after: () => {
      const sq = w.evac.sq;
      const order = Array.from(sq.order);
      const len = sq.orderLen;
      refreshEvacTelemetry(t, w);
      if (len !== sq.orderLen || order.some((v, i) => v !== sq.order[i])) seen.orderTouched = true;
      if (t.event !== EVE_NONE) seen.events.add(t.event * 10 + (t.event === EVE_SINK ? t.eventSub : 0));
      const key = evacLineKey(t);
      const text = evacLine(t).text;
      if (key === lastKey && text !== lastText) seen.keySame++;
      lastKey = key;
      lastText = text;
      seen.lines.add(text);
      const sk = evacStatusKey(t);
      if (sk !== lastStatus) seen.status.add(evacStatusLine(t));
      lastStatus = sk;
      if (t.annSeq !== lastAnn) {
        lastAnn = t.annSeq;
        if (t.annKind !== EVA_NONE) seen.banners.push(...evacBannerLines(t));
      }
      if (t.annKind === EVA_WAVE) seen.waveFrames++;
      if (t.annKind === EVA_REPASS) {
        seen.repassFrames++;
        // 予告し直しの狙いはいま予告している編隊の狙いと同じで、赤い輪（sq.targeted）が立っている
        for (let i = 0; i < t.annCount; i++) if (!sq.targeted[t.annTargets[i]!]) seen.repassRingOk = false;
        const ann = w.evac.plan.flights.filter((f) => f.phase === EF_ANNOUNCED && f.passes > 0).map((f) => f.target);
        if (ann.join() !== Array.from(t.annTargets.subarray(0, t.annCount)).join()) seen.repassRingOk = false;
      }
    },
  };
  try {
    runEvacTrial(evacSimSetup(gameData, hard), policy, seed, null, m);
  } catch (e) {
    if (!(e instanceof Error) || e.message !== 'stop') throw e;
  }
  return seen;
}

describe('小さな世界の夜の HUD（台本 seq・seq_shoot・stay。キーが変わったときだけ文）', () => {
  const all = new Set<number>();
  const allLines = new Set<string>();
  it.each([
    [1, false, 'seq'],
    [3, false, 'seq_shoot'],
    [2, true, 'seq'],
    [1, true, 'stay'],
  ] as const)('seed %i ハード %s %s: 文はみな ≤ 840／596 px・「夜明け」なし・キーが同じなら文も同じ・予告し直しは同じ形の警告と赤い輪・sq.order を書かない', (seed, hard, policy) => {
    const s = hudRun(seed, hard, policy, 250);
    for (const k of s.events) all.add(k);
    for (const x of s.lines) allLines.add(x);
    for (const x of s.lines) {
      expect(jaWidthPx(x, 22), x).toBeLessThanOrEqual(EVAC_LINE_MAX_PX);
      expect(x).not.toContain('夜明け');
    }
    for (const x of s.status) {
      expect(jaWidthPx(x, 20), x).toBeLessThanOrEqual(EVAC_STATUS_MAX_PX);
      expect(x).not.toContain('夜明け');
    }
    for (const x of s.banners) expect(x).not.toContain('夜明け');
    expect(s.keySame).toBe(0);
    expect(s.orderTouched).toBe(false);
    expect(s.waveFrames).toBeGreaterThan(3 * 9 * 60); // 3 波以上 × 予告から始まるまで約 10 秒（ハードの stay は第 4 波の前に全部沈む）
    expect(s.repassFrames).toBeGreaterThan(0); // もう一度来る編隊（S3b の U7）は 18 夜すべてにある
    expect(s.repassRingOk).toBe(true);
    expect([...s.lines].some((x) => x.includes('戻ってきた'))).toBe(true);
    expect(s.banners.some((x) => x.includes('編隊が戻ってきた'))).toBe(true);
    expect(s.events.has(EVE_SINK * 10 + EVS_LEADER) || s.events.has(EVE_SINK * 10 + EVS_SEAT)).toBe(true);
    if (policy !== 'stay') {
      expect([...s.lines].some((x) => x.includes('レールで上げている'))).toBe(true);
      expect([...s.lines].some((x) => x.includes('を引き継いだ'))).toBe(true);
      expect([...s.lines].some((x) => x.includes('で待機 ・ 空襲が去るまで'))).toBe(true);
    }
    if (policy === 'seq_shoot') expect(s.events.has(EVE_GUN * 10)).toBe(true);
  });
  it('4 夜を合わせると、出来事の行（隠れた・沈没の 3 種以上・見失った・決着）と平常・予告の行がどれも出た（重い出来事が出ている間の軽い出来事は出さない＝隠れた・機銃は夜によっては出ない）', () => {
    for (const k of [EVE_HIDDEN * 10, EVE_SETTLE * 10, EVE_LOST * 10]) expect(all.has(k), String(k)).toBe(true);
    expect([EVS_WINGMAN, EVS_LEADER, EVS_SEAT, EVS_GONE].filter((v) => all.has(EVE_SINK * 10 + v)).length).toBeGreaterThanOrEqual(3);
    for (const w of ['を操作中 ・ 近い隠れ場所', '第1波 2機×', 'に隠れた ・ ［切替］で次の隊へ', '第1次の空襲が去った']) expect([...allLines].some((x) => x.includes(w)), w).toBe(true);
  });
});

describe('2 行目のモード（ui/mission-mode の MISSION_EVAC・ui/special-line・ui/mission-line-keys）', () => {
  it('evac の任務は 38（240 秒の後の §2 の 4 機が来ている間・魚雷待ち・漂流はそれが上）。ほかの任務は 38 にならない。文は special-line、キーは lKey の欄', () => {
    const e = base();
    const t = tele({}, { evac: e });
    expect(missionMode(t, 0, 0)).toBe(MISSION_EVAC);
    expect(missionMode(tele({}, { evac: e, dawn: { ...createDawnTelemetry(), reached: true, threat: AS_T_FALLING } }), 0, 0)).toBe(MISSION_STRIKE);
    expect(missionMode(tele({}, { evac: e, dawn: { ...createDawnTelemetry(), reached: true, threat: AS_T_REST } }), CALL_DAWN, 0)).toBe(MISSION_EVAC);
    expect(missionMode(tele({}, { evac: e, fuelEmpty: true }), 0, 0)).toBe(MISSION_ADRIFT);
    // 決着の前に隠れて魚雷が走っている（v0.6.11 S8）: 任務は終わらない（evacHold）ので「帰投 — 魚雷の決着待ち」は出さない。決着の後と、ほかの任務は今までどおり待ち
    expect(missionMode(tele({}, { evac: e, homeWaiting: true }), 0, 0)).toBe(MISSION_EVAC);
    expect(missionMode(tele({}, { evac: clone(e, { settled: true }), homeWaiting: true }), 0, 0)).toBe(MISSION_WAITING);
    expect(missionMode(tele({}, { homeWaiting: true }), 0, 0)).toBe(MISSION_WAITING);
    expect(missionMode(tele({}, {}), 0, 0)).not.toBe(MISSION_EVAC);
    expect(specialLine(t, MISSION_EVAC, { landingEv: t.landing })).toEqual(evacLine(e));
    expect(specialLine(tele({}, {}), MISSION_EVAC, { landingEv: t.landing })).toBeNull();
    const k = composeLineKeys(createLineKeys(), t, MISSION_EVAC, 0, 0, 0, 0);
    expect(k.lKey).toBe(evacLineKey(e));
    expect(composeLineKeys(createLineKeys(), tele({}, {}), 0, 0, 0, 0, 0).lKey).toBe(0);
  });
});
