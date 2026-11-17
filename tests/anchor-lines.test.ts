// v0.8.1 S4（spec-v0810 §6 の S4、lead の L61・L62・L68）: 止まった艦の任務（us_06）の 2 行目の出来事（ui/anchor-lines）と、us_02 の枝から来た文の us_06 だけの言い方。
// - 「暗い岸を背にした ・ 見つかる距離 N m」: 背に岸のビットが立った時・20 秒に 1 回まで・N は 3 行目と同じ 50 m の四捨五入・ビットが下りたらやめる。
// - 「停泊していた艦が動き出した！」（警告の色）: 目で見えている艦（seenMask）が動き出した時・艦ごとに 1 回・夜明けの動き出しは出さない・出ている「背に岸」に替わる。
// - どちらも 22 px で 840 px の内（tests/pt-ui-kit の textWidthPx）。モードはレーダーの出来事のすぐ下。ほかの任務（t.anchor が無い）は旗 0・文は今のまま。
// - 衝突の危険の名詞（駆潜艇）・夜明けの帯の「輸送船は泊地に残る」・読む欄の走査（艦の AI・止まった段の旗・見えない艦の位置を読まない）。
import { describe, expect, it } from 'vitest';
import { ANCHOR_BACKDROP_MIN_GAP_MS, ANCHOR_EVENT_SHOW_MS } from '../src/config/anchor-hud-config';
import { HUD_COLOR_STRONG, HUD_COLOR_WARN } from '../src/config/hud-text-config';
import { ANCHOR_REASON_DAWN, ANCHOR_REASON_SEEN, ANCHOR_REASON_WAKE } from '../src/core/anchored-ship';
import type { AnchorTelemetry, BoatTelemetry } from '../src/core/boat-telemetry';
import { createDawnTelemetry } from '../src/core/dawn-air';
import { CALL_DAWN } from '../src/core/mission-flow';
import { anchorTelemetryPart, refreshAnchorTelemetry } from '../src/systems/anchor-telemetry';
import { initStraitTelemetry, type StraitTelemetryWorld } from '../src/systems/strait-telemetry';
import { ANCHOR_EV_BACKDROP, ANCHOR_EV_NONE, ANCHOR_EV_UNDERWAY, ANCHOR_UNDERWAY_JA, AnchorLineClock, anchorBackdropLineJa, anchorWithdrawJa } from '../src/ui/anchor-lines';
import { dawnBannerLines } from '../src/ui/dawn-lines';
import { DETECT_RANGE_STEP_M } from '../src/ui/hud-lines';
import { composeLineKeys, createLineKeys } from '../src/ui/mission-line-keys';
import { MISSION_ANCHOR_EVENT, MISSION_BOW_ON, MISSION_CALL, MISSION_NORMAL, MISSION_RADAR_EVENT, MODE_FLAG_ANCHOR_EVENT, MODE_FLAG_BOW_ON, MODE_FLAG_RADAR_EVENT, missionMode } from '../src/ui/mission-mode';
import { specialLine } from '../src/ui/special-line';
import { StraitLineClock } from '../src/ui/strait-line-clock';
import { bowOnLineJa } from '../src/ui/strait-lines';
import { anchorKit, runUntil } from './anchor-world-kit';
import { PERSON_DENYLIST } from './person-denylist';
import { LINE2_MAX_PX, tele, textWidthPx } from './pt-ui-kit';
import { code } from './sfx-rules-kit';

const anc = (o: Partial<AnchorTelemetry> = {}): AnchorTelemetry => ({ stage: [0, 0, 0, 0], reason: [0, 0, 0, 0], noticedAtS: [NaN, NaN, NaN, NaN], underwayAtS: [NaN, NaN, NaN, NaN], noticedCount: 0, underwayCount: 0, backdropOn: false, backdropS: 0, heldShots: 0, heldHits: 0, seenMask: 0, ...o });
const T = (a: AnchorTelemetry | undefined, over: Partial<BoatTelemetry> = {}): BoatTelemetry => tele({ enabled: false }, { detectRangeM: 360, ...over, ...(a ? { anchor: a } : {}) });
/** 1 フレーム（16 ms）: 旗を見て、2 行目に出たことを渡す（出す行が他に無い＝旗がそのまま 41） */
function frame(c: AnchorLineClock, t: BoatTelemetry, ms: number): number {
  const f = c.flags(t, ms);
  c.shown((f & MODE_FLAG_ANCHOR_EVENT) !== 0 ? MISSION_ANCHOR_EVENT : MISSION_NORMAL, ms);
  return f;
}

describe('文と幅（22 px・840 px の内）', () => {
  it('背に岸は 3 行目と同じ 50 m の刻み（360 m → 350 m）、動き出しは警告の色。どの距離の刻みでも 840 px の内（最も長いのは 4 桁）', () => {
    expect(anchorBackdropLineJa(Math.round(360 / DETECT_RANGE_STEP_M))).toBe('暗い岸を背にした ・ 見つかる距離 350 m');
    expect(ANCHOR_UNDERWAY_JA).toBe('停泊していた艦が動き出した！');
    for (let step = 1; step <= 2000 / DETECT_RANGE_STEP_M; step++) expect(textWidthPx(anchorBackdropLineJa(step), 22)).toBeLessThanOrEqual(LINE2_MAX_PX);
    expect(Math.round(textWidthPx(anchorBackdropLineJa(24), 22) * 10) / 10).toBe(449.2);
    expect(textWidthPx(ANCHOR_UNDERWAY_JA, 22)).toBe(308);
    expect(bowOnLineJa(5, true)).toBe('衝突の危険！ 駆潜艇 500 m ・ 艦首がこちらへ');
    expect(bowOnLineJa(5)).toBe('衝突の危険！ 駆逐艦 500 m ・ 艦首がこちらへ'); // ほかの任務（us_04）は今の文
    expect(textWidthPx(bowOnLineJa(5, true), 22)).toBe(textWidthPx(bowOnLineJa(5), 22));
    for (const s of [anchorBackdropLineJa(24), ANCHOR_UNDERWAY_JA, bowOnLineJa(5, true)]) {
      for (const name of PERSON_DENYLIST) expect(s).not.toContain(name);
      expect(s).not.toMatch(/PT-?\s*\d/);
    }
  });
});

describe('時計（ui/anchor-lines の AnchorLineClock。ui/strait-line-clock が持つ）', () => {
  it('止まった艦の無い任務（t.anchor が無い）は旗 0 のまま・何も始めない', () => {
    const c = new AnchorLineClock();
    for (let ms = 0; ms < 30000; ms += 16) expect(frame(c, T(undefined, { detectRangeM: 360 }), ms)).toBe(0);
    expect([c.kind, c.key]).toEqual([ANCHOR_EV_NONE, 0]);
  });
  it('背に岸: ビットが立った時に 4 秒（出ていた和）。20 秒の内は立ち直しても出さず、20 秒の後なら出す。出ている間に 3 行目の数が変われば文（キー）も。ビットが下りたらやめる', () => {
    const c = new AnchorLineClock();
    let ms = 0;
    let on = 0;
    expect(frame(c, T(anc()), ms)).toBe(0);
    for (; ms < 6000; ms += 16) if (frame(c, T(anc({ backdropOn: true })), ms) !== 0) on += 16;
    expect(on).toBeGreaterThanOrEqual(ANCHOR_EVENT_SHOW_MS - 16);
    expect(on).toBeLessThanOrEqual(ANCHOR_EVENT_SHOW_MS + 16);
    frame(c, T(anc()), (ms += 16));
    expect(frame(c, T(anc({ backdropOn: true })), (ms += 16))).toBe(0); // 20 秒の内
    for (; ms < ANCHOR_BACKDROP_MIN_GAP_MS + 100; ms += 16) frame(c, T(anc()), ms);
    expect(frame(c, T(anc({ backdropOn: true })), ms) & MODE_FLAG_ANCHOR_EVENT).not.toBe(0);
    expect([c.kind, c.step]).toEqual([ANCHOR_EV_BACKDROP, 7]);
    const k = c.key;
    frame(c, T(anc({ backdropOn: true }), { detectRangeM: 288 }), (ms += 16));
    expect([c.step, c.key !== k]).toEqual([6, true]); // 静音から停止へ＝300 m の文に組み直す
    expect(frame(c, T(anc()), (ms += 16))).toBe(0); // ビットが下りた＝出している文もやめる
    expect(c.kind).toBe(ANCHOR_EV_NONE);
  });
  it('動き出し: 目で見えている艦だけ・艦ごとに 1 回・夜明けの動き出しは出さない。出ている「背に岸」に替わる。動き出しの文の間に立った背に岸は待って後に出す（ビットが立っている間だけ）', () => {
    const c = new AnchorLineClock();
    let ms = 0;
    frame(c, T(anc({ backdropOn: true })), ms);
    expect(c.kind).toBe(ANCHOR_EV_BACKDROP);
    // 目で見えない駆潜艇（添字 2）が雷跡で動き出した: 文なし
    frame(c, T(anc({ backdropOn: true, underwayAtS: [NaN, NaN, 30, NaN], reason: [0, 0, ANCHOR_REASON_WAKE, 0], seenMask: 0b0001 })), (ms += 16));
    expect(c.kind).toBe(ANCHOR_EV_BACKDROP);
    // 目で見えている卯月（添字 0）が動き出した: 警告の色の文に替わる（出ていた背に岸はやめる）
    const moved = anc({ underwayAtS: [31, NaN, 30, NaN], reason: [ANCHOR_REASON_SEEN, 0, ANCHOR_REASON_WAKE, 0], seenMask: 0b0001 });
    frame(c, T({ ...moved, backdropOn: true }), (ms += 16));
    expect(c.kind).toBe(ANCHOR_EV_UNDERWAY);
    expect(specialLine(T(moved), MISSION_ANCHOR_EVENT, { landingEv: T(moved).landing, strait: { radarKind: 0, radarText: '', bowStep: 1, anchor: c } })).toEqual({ text: ANCHOR_UNDERWAY_JA, color: HUD_COLOR_WARN });
    frame(c, T(moved), (ms += 16)); // 背に岸のビットが下りる
    for (; ms < ANCHOR_BACKDROP_MIN_GAP_MS + 100; ms += 16) { frame(c, T(moved), ms); if (c.kind === ANCHOR_EV_UNDERWAY) continue; expect(c.kind).toBe(ANCHOR_EV_NONE); }
    // 同じ艦は 2 度出さない。次の艦の動き出しの文の間に背に岸が立てば、4 秒の後に出す
    const moved2 = anc({ ...moved, underwayAtS: [31, NaN, 30, 120], reason: [ANCHOR_REASON_SEEN, 0, ANCHOR_REASON_WAKE, ANCHOR_REASON_SEEN], seenMask: 0b1001 });
    frame(c, T(moved2), (ms += 16));
    expect(c.kind).toBe(ANCHOR_EV_UNDERWAY);
    let underwayOn = 0;
    for (let i = 0; i < 400 && c.kind === ANCHOR_EV_UNDERWAY; i++, ms += 16) if (frame(c, T({ ...moved2, backdropOn: true }), ms) !== 0) underwayOn += 16;
    expect(underwayOn).toBeGreaterThanOrEqual(ANCHOR_EVENT_SHOW_MS - 32);
    expect(c.kind).toBe(ANCHOR_EV_BACKDROP);
    for (let i = 0; i < 400; i++, ms += 16) frame(c, T({ ...moved2, backdropOn: true }), ms);
    expect(c.kind).toBe(ANCHOR_EV_NONE);
    // 夜明けに見えている駆潜艇（添字 1 を駆潜艇の代わりに）が動き出しても出さない（夜明けの帯が言う）
    frame(c, T(anc({ ...moved2, underwayAtS: [31, 200, 30, 120], reason: [ANCHOR_REASON_SEEN, ANCHOR_REASON_DAWN, ANCHOR_REASON_WAKE, ANCHOR_REASON_SEEN], seenMask: 0b1011 })), (ms += 16));
    expect(c.kind).toBe(ANCHOR_EV_NONE);
  });
  it('本当の世界の流れ（tests/anchor-world-kit の us_06）: 浜の真南で止まると背に岸、北 300 m へ出ると卯月が見て 3 秒で動き出し、目で見えている＝動き出しの文', () => {
    const w = anchorKit();
    const t = anchorTelemetryPart(w).anchor!;
    const c = new AnchorLineClock();
    const uz = w.destroyers.ships[0]!.state;
    const b = w.boat.state;
    [b.x, b.y] = [uz.x, 2900];
    runUntil(w, 1);
    refreshAnchorTelemetry(t, w);
    const tel = (): BoatTelemetry => T(t, { detectRangeM: w.destroyers.backdrop!.rangeAt(0, w.detectRangeM) });
    frame(c, tel(), 1000);
    expect([t.backdropOn, c.kind, c.step]).toEqual([true, ANCHOR_EV_BACKDROP, Math.round(w.destroyers.backdrop!.rangeAt(0, NaN) / DETECT_RANGE_STEP_M)]);
    [b.x, b.y] = [uz.x, uz.y - 300];
    let ms = 1016;
    let seenUnderway = false;
    while (w.stepTimeS < 20) {
      runUntil(w, w.stepTimeS + 1 / 60);
      refreshAnchorTelemetry(t, w);
      frame(c, tel(), (ms += 16));
      if (c.kind === ANCHOR_EV_UNDERWAY) seenUnderway = true;
    }
    expect([Number.isFinite(t.underwayAtS[0]!), (t.seenMask & 1) !== 0, seenUnderway]).toEqual([true, true, true]);
  });
});

describe('2 行目のモードとキー（ui/mission-mode・special-line・mission-line-keys・strait-line-clock）', () => {
  it('モード 41 はレーダーの出来事のすぐ下（レーダーを遅らせない）・呼びかけと平常の上・衝突の危険の下。旗が無ければ今のまま', () => {
    const base = T(undefined);
    expect(missionMode(base, 0, 0)).toBe(MISSION_NORMAL);
    expect(missionMode(base, 0, MODE_FLAG_ANCHOR_EVENT)).toBe(MISSION_ANCHOR_EVENT);
    expect(missionMode(base, CALL_DAWN, MODE_FLAG_ANCHOR_EVENT)).toBe(MISSION_ANCHOR_EVENT);
    expect(missionMode(base, CALL_DAWN, 0)).toBe(MISSION_CALL);
    expect(missionMode(base, 0, MODE_FLAG_ANCHOR_EVENT | MODE_FLAG_RADAR_EVENT)).toBe(MISSION_RADAR_EVENT);
    expect(missionMode(base, 0, MODE_FLAG_ANCHOR_EVENT | MODE_FLAG_BOW_ON)).toBe(MISSION_BOW_ON);
    expect([MISSION_ANCHOR_EVENT, MODE_FLAG_ANCHOR_EVENT]).toEqual([41, 1024]);
  });
  it('海峡の時計が anchor を持ち旗を足す（止まった艦の無い任務は 0）。2 行目のキーは anchor の key、文は special-line', () => {
    const c = new StraitLineClock();
    const t = T(anc({ backdropOn: true }), { strait: { enabled: false, eyeRange2: 0, bowOnMask: 0, bowOnM: NaN, bowOnPicket: false } } as Partial<BoatTelemetry>);
    expect(c.flags(t, 0) & MODE_FLAG_ANCHOR_EVENT).not.toBe(0);
    c.shown(MISSION_ANCHOR_EVENT, 0);
    const keys = composeLineKeys(createLineKeys(), t, MISSION_ANCHOR_EVENT, MODE_FLAG_ANCHOR_EVENT, 0, 0, 0, t.landing, c);
    expect(keys.lKey).toBe(c.anchor.key);
    expect(specialLine(t, MISSION_ANCHOR_EVENT, { landingEv: t.landing, strait: c })).toEqual({ text: '暗い岸を背にした ・ 見つかる距離 350 m', color: HUD_COLOR_STRONG });
    expect(new StraitLineClock().flags(T(undefined, { strait: { enabled: false, eyeRange2: 0, bowOnMask: 0, bowOnM: NaN, bowOnPicket: false } } as Partial<BoatTelemetry>), 0)).toBe(0);
  });
  it('衝突の危険の名詞: 一番近い危険な艦が隊の駆潜艇（picketIndex から後ろ）なら「駆潜艇」。駆潜艇のいない隊（us_04 の型）はいつも駆逐艦。キーは名詞が変われば変わる・今の任務の値は同じ', () => {
    const ship = (y: number): StraitTelemetryWorld['destroyers'] extends infer D ? D extends { ships: readonly (infer S)[] } ? S : never : never => ({ out: false, state: { x: 0, y, headingDeg: 180 } });
    const w = (pi: number | undefined): StraitTelemetryWorld => ({ visRange2: 810000, boat: { state: { x: 0, y: 0 } }, destroyers: { transit: null, ...(pi === undefined ? {} : { picketIndex: pi }), ships: [ship(-450), ship(-480), ship(-300)] }, radar: {} });
    expect([initStraitTelemetry(w(2)).bowOnPicket, initStraitTelemetry(w(-1)).bowOnPicket, initStraitTelemetry(w(undefined)).bowOnPicket]).toEqual([true, false, false]);
    expect(initStraitTelemetry(w(3)).bowOnPicket).toBe(false); // 一番近い（添字 2）は駆潜艇でない
    const c = new StraitLineClock();
    const t = (picket: boolean): BoatTelemetry => ({ radar: { enabled: false }, strait: { enabled: true, eyeRange2: 810000, bowOnMask: 1, bowOnM: 300, bowOnPicket: picket } }) as unknown as BoatTelemetry;
    c.flags(t(false), 0);
    const k = c.bowKey;
    expect(k).toBe(64 + 3); // 今の任務のキー（通し番号 1 ・ 刻み 3）のまま
    c.flags(t(true), 16);
    expect([c.bowPicket, c.bowKey !== k]).toEqual([true, true]);
    expect(specialLine(tele(), MISSION_BOW_ON, { landingEv: tele().landing, strait: c })!.text).toBe('衝突の危険！ 駆潜艇 300 m ・ 艦首がこちらへ');
  });
});

describe('夜明けの帯の退く行（anchorWithdrawJa。us_02 の枝の「日本の艦は東へ退く」の us_06 だけの言い方）', () => {
  const dawn = { ...createDawnTelemetry(), reached: true, ships: 'retire' as const, forceJa: '日本の艦', retireJa: '東', air: 2, strikeEnabled: true, nameJa: '二式水上戦闘機', count: 4, fromJa: '西' };
  const tt = (o: Partial<BoatTelemetry>, a = true): BoatTelemetry => T(a ? anc() : undefined, { dawn, transportEnabled: true, transportSunk: false, shipsSunk: 0, shipsTotal: 1, torpedoesLeft: 2, destroyerSunk: false, ...o });
  it('輸送船が浮いていれば「輸送船は泊地に残る」、卯月が沈んでいれば「退く」と言わない。輸送船も沈んだら今の文。止まった艦の無い任務（us_02）は 1 字も変わらない', () => {
    expect(anchorWithdrawJa(tt({}), '日本の艦は東へ退く ・ 追うか帰投か')).toBe('日本の艦は東へ退く ・ 輸送船は泊地に残る ・ 追うか帰投か');
    expect(anchorWithdrawJa(tt({ torpedoesLeft: 0 }), '日本の艦は東へ退く ・ 帰投せよ')).toBe('日本の艦は東へ退く ・ 輸送船は泊地に残る ・ 帰投せよ');
    expect(anchorWithdrawJa(tt({ shipsSunk: 1 }), '日本の艦は東へ退く ・ 追うか帰投か')).toBe('輸送船は泊地に残る ・ 撃つか帰投か');
    expect(anchorWithdrawJa(tt({ shipsSunk: 1, torpedoesLeft: 0 }), '日本の艦は東へ退く ・ 帰投せよ')).toBe('輸送船は泊地に残る ・ 帰投せよ');
    expect(anchorWithdrawJa(tt({ transportSunk: true }), '日本の艦は東へ退く ・ 追うか帰投か')).toBe('日本の艦は東へ退く ・ 追うか帰投か');
    expect(anchorWithdrawJa(tt({}), '')).toBe('');
    expect(anchorWithdrawJa(tt({}, false), '東京急行は北へ退く ・ 追うか帰投か')).toBe('東京急行は北へ退く ・ 追うか帰投か');
    expect(dawnBannerLines(tt({}))).toEqual(['夜明け — 空襲', '二式水上戦闘機 4 機が西から来る ・ 投下で転舵（旋回中は逆へ）', '日本の艦は東へ退く ・ 輸送船は泊地に残る ・ 追うか帰投か']);
    expect(dawnBannerLines(tt({}, false))[2]).toBe('日本の艦は東へ退く ・ 追うか帰投か');
    for (const s of ['日本の艦は東へ退く ・ 輸送船は泊地に残る ・ 追うか帰投か', '輸送船は泊地に残る ・ 撃つか帰投か']) expect(textWidthPx(s, 22)).toBeLessThanOrEqual(LINE2_MAX_PX);
  });
});

describe('読む欄の走査（L61: t.anchor・3 行目の値・HUD の数だけ。艦の AI・止まった段の旗・見えない艦の本当の位置を読まない）', () => {
  it('ui/anchor-lines は t.anchor の欄と detectRangeM・dawn・輸送船と撃沈の数・残弾だけを読み、艦・AI・世界・Phaser を読まない', () => {
    const src = code('src/ui/anchor-lines.ts');
    const reads = [...new Set([...src.matchAll(/\bt\.(\w+)(?:\.(\w+))?/g)].map((m) => (m[1] === 'dawn' ? `dawn.${m[2]}` : m[1]!)))].sort();
    expect(reads).toEqual(['anchor', 'dawn.forceJa', 'dawn.retireJa', 'detectRangeM', 'shipsSunk', 'shipsTotal', 'torpedoesLeft', 'transportEnabled', 'transportSunk']);
    const aReads = [...new Set([...src.matchAll(/\ba\.(\w+)/g)].map((m) => m[1]!))].sort();
    expect(aReads).toEqual(['backdropOn', 'reason', 'seenMask', 'underwayAtS']);
    const body = (f: string): string => code(f).replace(/^import .*$/gm, ''); // import の行（core/anchored-ship の定数の名）を除いた本体
    expect(body('src/ui/anchor-lines.ts')).not.toMatch(/\.ai\b|\banchored\b|destroyers|\bships\b|\.state\.|shipAi|from 'phaser'|document|window|Math\.random|\bnew\s/);
    expect([...code('src/ui/anchor-lines.ts').matchAll(/from '([^']+)'/g)].map((m) => m[1])).toEqual(['../config/anchor-hud-config', '../config/hud-text-config', '../core/boat-telemetry', '../core/anchored-ship', './hud-lines', './mission-mode']);
    expect(body('src/ui/anchor-result.ts')).not.toMatch(/\.ai\b|\banchored\b|destroyers|\bships\b|\.state\.|from 'phaser'|document|window|Math\.random/);
    // 目で見えている艦のビットは systems/anchor-telemetry が setSighted と同じ規則で書く（UI は位置を読まない）
    const tel = code('src/systems/anchor-telemetry.ts');
    expect(tel).toContain('if (!p.out && (p.state.x - b.x) ** 2 + (p.state.y - b.y) ** 2 <= w.visRange2) seen |= 1 << i;');
    expect(code('src/systems/mission-telemetry.ts')).toContain('d.setSighted(dx * dx + dy * dy <= w.visRange2);');
  });
  it('配線: 海峡の時計が anchor を持ち・旗を足し・shown を渡す。special-line と mission-line-keys がモード 41 を読む。mission-line は変えない（1 行も足さない）', () => {
    const sc = code('src/ui/strait-line-clock.ts');
    expect(sc).toContain('readonly anchor = new AnchorLineClock();');
    expect(sc).toContain('| this.anchor.flags(t, nowMs);');
    expect(sc).toContain('this.anchor.shown(mode, nowMs);');
    expect(code('src/ui/special-line.ts')).toContain('if (mode === MISSION_ANCHOR_EVENT) return clock.strait?.anchor ? anchorLine(clock.strait.anchor) : null;');
    expect(code('src/ui/mission-line-keys.ts')).toContain('mode === MISSION_ANCHOR_EVENT ? (strait?.anchor ? strait.anchor.key : 0)');
    expect(code('src/ui/mission-line.ts')).not.toMatch(/anchor/i);
    expect(code('src/ui/dawn-lines.ts')).toContain('const withdraw = anchorWithdrawJa(t, withdrawBannerJa(t));');
  });
});
