// v0.8.0 S4（spec-v0800 §4.9・§3.2 D-R10、brief L26・L34）: レーダーの 2 行目の出来事の文（ui/radar-lines）と時計（ui/strait-line-clock）。
// - 幅: どの形も（8 方位・射程ちょうどの距離・接触 16・ハード）22 px で 840 px の内（tests/pt-ui-kit の textWidthPx。測った px は CHANGELOG と hand-back に）。
// - 東の縁の帯（config/strait-hud-config の RADAR_EAST_EDGE_MARGIN_M）は data の列の速さ × time_scale × 掃引の秒 ＋ 縁の内外 ＋ 丸めの半分以上（見せ方の値の理由の確かめ）。
// - 読む欄（L26）: ui/radar-lines はレーダーのテレメトリの欄だけ（艦の正体・列の段階・AI・本当の位置は読まない）。時計は t.radar・t.strait だけ。ソースの走査で欄の一覧を固定。
// - 流れ: Phaser なしの小さな世界（tests/transit-world-kit。自艇は出発点で止まる）を夜明けまで回し、毎ステップのテレメトリから時計が出す文の順（最初の接触 → 西に新しい接触 → 東へ消えた
//   → 帰りの列か …）、1 夜に 1 回の 2 つ、10 秒に 1 回まで、4 秒（2 行目に出ていた和）。今夜の揺らぎの seed 1〜40（ノーマル・ハード）で最初の接触は目の外（「目では見えない」の裏付け）。
// - 人物と有名な艇（§4.12）: どの文にも人名・有名な艇の番号が無い。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { RADAR_EAST_EDGE_MARGIN_M, RADAR_LINE_STEP_M, RADAR_NEW_MIN_GAP_MS, STRAIT_EVENT_SHOW_MS } from '../src/config/strait-hud-config';
import type { BoatTelemetry, RadarTelemetry } from '../src/core/boat-telemetry';
import { initRadarTelemetry, refreshRadarTelemetry } from '../src/systems/radar-telemetry';
import { MISSION_RADAR_EVENT, MODE_FLAG_RADAR_EVENT } from '../src/ui/mission-mode';
import { RADAR_EV_FIRST, RADAR_EV_NEW, RADAR_EV_RETURN, RADAR_EV_VILA, radarEventLineJa } from '../src/ui/radar-lines';
import { StraitLineClock } from '../src/ui/strait-line-clock';
import { FAMOUS_BOAT_RE, PERSON_DENYLIST, RANK_RE } from './person-denylist';
import { textWidthPx } from './pt-ui-kit';
import { code } from './sfx-rules-kit';
import { kitStep, kitWorld, type KitWorld } from './transit-world-kit';

const LINE2_PX = 22;
const LINE2_MAX = 840;
const S = kitWorld().setup;
const R = S.radar!;
const TR = S.transit!;
const W = S.mission.bounds.width;

/** 自艇 (3600, 2600) から方位 deg・距離 m の点 */
const at = (deg: number, m: number): [number, number] => [3600 + m * Math.sin((deg * Math.PI) / 180), 2600 - m * Math.cos((deg * Math.PI) / 180)];
/** レーダーのテレメトリの形（読む欄だけ値を入れる） */
function radarTel(over: Partial<RadarTelemetry>): RadarTelemetry {
  return { enabled: true, shipRangeM: R.shipRangeM, sweeps: 1, contacts: 1, nearestM: NaN, firstS: 0.02, firstX: NaN, firstY: NaN, firstFromX: 3600, firstFromY: 2600, newCount: 0, newX: NaN, newY: NaN, lostCount: 0, lostX: NaN, lostY: NaN, widthM: W, eastJa: TR.vilaLabelJa, blips: [], fromX: 3600, fromY: 2600, boatX: 3600, boatY: 2600, ...over };
}

describe('文の幅（2 行目 ≤ 840 px＝22 px。L34）', () => {
  it('どの形も 840 px の内（8 方位 × 射程ちょうど・接触 16）。いちばん広い形の px を固定', () => {
    let widest = 0;
    const widestOf: Record<string, number> = {};
    for (let deg = 0; deg < 360; deg += 45) {
      const [x, y] = at(deg, R.shipRangeM);
      const r = radarTel({ contacts: 16, firstX: x, firstY: y, newX: x, newY: y, newCount: 1, lostX: W, lostY: 2000 });
      for (const [k, name] of [[RADAR_EV_FIRST, 'first'], [RADAR_EV_NEW, 'new'], [RADAR_EV_VILA, 'vila'], [RADAR_EV_RETURN, 'return']] as const) {
        const text = radarEventLineJa(k, r);
        const w = textWidthPx(text, LINE2_PX);
        expect(w, text).toBeLessThanOrEqual(LINE2_MAX);
        widestOf[name] = Math.max(widestOf[name] ?? 0, w);
        widest = Math.max(widest, w);
      }
    }
    // 北西 4000 m ・ 接触 16（最初の接触）・北西に新しい接触 4000 m ・ 接触 16・揚陸の地の名・東 4000 m の帰りの列
    expect(Object.fromEntries(Object.entries(widestOf).map(([k, v]) => [k, Math.round(v * 10) / 10]))).toEqual({ first: 638.7, new: 515.4, vila: 686.5, return: 722.2 });
    expect(widest).toBeLessThanOrEqual(LINE2_MAX);
  });
  it('spec §4.9 の典型の文（出発点から護衛 2,280 m・列の入り 3,620 m・復路の現れ 2,270 m）', () => {
    const [ex, ey] = [1800, 1200];
    expect(radarEventLineJa(RADAR_EV_FIRST, radarTel({ firstX: ex, firstY: ey }))).toBe('レーダー探知！ 北西 2300 m ・ 接触 1 ・ 目では見えない');
    expect(radarEventLineJa(RADAR_EV_NEW, radarTel({ contacts: 2, newX: 150, newY: 1500, newCount: 1 }))).toBe('レーダー: 西に新しい接触 3600 m ・ 接触 2');
    expect(radarEventLineJa(RADAR_EV_VILA, radarTel({}))).toBe(`接触が東（${TR.vilaLabelJa}）へ消えた ・ 揚陸を終えると同じ海峡を戻ってくる`);
    expect(radarEventLineJa(RADAR_EV_RETURN, radarTel({ newX: 5850, newY: 2300 }))).toBe('レーダー: 東に新しい接触 2300 m ・ 帰りの列か ・ 進路から離れよ');
  });
});

describe('東の縁の帯（見せ方の値の理由。brief L26）', () => {
  it('帯 500 m ≥ 掃引の間の列の道のり（速さ × time_scale × 掃引の秒）＋ 縁の内外 ＋ 丸めの半分（data から）', () => {
    const drift = TR.speedMps * S.timeScale * R.sweepS;
    const inset = W - TR.outbound.appearX;
    expect(drift).toBeCloseTo(231.5, 0);
    expect(RADAR_EAST_EDGE_MARGIN_M).toBeGreaterThanOrEqual(drift + inset + R.positionStepM / 2);
    // 護衛の見回り（端から 700 m で向き直す）は帯の外＝護衛の出入りを「東へ消えた」と読まない
    expect(W - 700).toBeLessThan(W - RADAR_EAST_EDGE_MARGIN_M);
    expect(RADAR_LINE_STEP_M).toBe(100);
  });
});

describe('読む欄（brief L26: レーダーの文はレーダーのテレメトリと掃引の時の自艇の位置だけ）', () => {
  it('ui/radar-lines は RadarTelemetry の欄（数・最初／新しい／消えた接触・掃引の時の自艇・海域の幅・揚陸の地の名）だけを読み、import は見せ方の定数・型・方位の字だけ', () => {
    const src = code('src/ui/radar-lines.ts');
    const fields = [...new Set([...src.matchAll(/\br\.(\w+)/g)].map((m) => m[1]!))].sort();
    expect(fields).toEqual(['contacts', 'eastJa', 'firstFromX', 'firstFromY', 'firstX', 'firstY', 'fromX', 'fromY', 'lostX', 'newX', 'newY', 'widthM']);
    expect(src).not.toMatch(/\bt\.|\bw\.|transit|phase|enemy|sighted|visRange|ai\b|destroyer/);
    expect([...src.matchAll(/from '([^']+)'/g)].map((m) => m[1])).toEqual(['../config/strait-hud-config', '../core/boat-telemetry', '../core/briefing']);
  });
  it('ui/strait-line-clock は t.radar と t.strait だけを読む（レーダーの欄は radar-lines へ渡す・数と東の縁の判定。v0.8.1 S4: 衝突の危険の名詞の bowOnPicket・止まった艦の出来事は anchor へ t を渡すだけ）', () => {
    const src = code('src/ui/strait-line-clock.ts');
    expect([...new Set([...src.matchAll(/\bt\.(\w+)/g)].map((m) => m[1]!))].sort()).toEqual(['radar', 'strait']);
    expect([...new Set([...src.matchAll(/\br\.(\w+)/g)].map((m) => m[1]!))].sort()).toEqual(['enabled', 'firstS', 'lostCount', 'newCount']);
    expect([...new Set([...src.matchAll(/\bst\.(\w+)/g)].map((m) => m[1]!))].sort()).toEqual(['bowOnM', 'bowOnMask', 'bowOnPicket', 'enabled']);
  });
  it('レーダーのテレメトリ（systems/radar-telemetry）が書く欄は core/radar の状態の写しと、海域の幅・揚陸の地の名・自艇の位置だけ（視程・発見・艦は書かない）', () => {
    const src = code('src/systems/radar-telemetry.ts');
    const written = [...new Set([...src.matchAll(/\bt\.(\w+)\s*=(?!=)/g)].map((m) => m[1]!))].sort();
    expect(written).toEqual(['boatX', 'boatY', 'contacts', 'firstFromX', 'firstFromY', 'firstS', 'firstX', 'firstY', 'fromX', 'fromY', 'lostCount', 'lostX', 'lostY', 'nearestM', 'newCount', 'newX', 'newY', 'sweeps']);
    expect(src).toContain('blips: w.radar ? w.radar.state.blips : NO_BLIPS,'); // 輝点の枠は参照（毎フレーム写さない）
  });
});

/** 時計を小さな世界で回す: 毎ステップ（1 ステップ＝1 フレーム）テレメトリを写し、旗が立てば 2 行目はレーダーの出来事（上の行は無い）。出した文と始めた秒・出ていた秒 */
function runClock(w: KitWorld, untilS: number): { text: string; startS: number; shownS: number; kind: number }[] {
  const tele = { radar: initRadarTelemetry(w), strait: { enabled: false, eyeRange2: 0, bowOnMask: 0, bowOnM: NaN } } as unknown as BoatTelemetry;
  const c = new StraitLineClock();
  const out: { text: string; startS: number; shownS: number; kind: number }[] = [];
  let lastText = '';
  let lastKey = -1;
  while (w.stepTimeS < untilS) {
    kitStep(w);
    refreshRadarTelemetry(tele.radar, w);
    const nowMs = w.stepTimeS * 1000;
    const f = c.flags(tele, nowMs);
    const mode = (f & MODE_FLAG_RADAR_EVENT) !== 0 ? MISSION_RADAR_EVENT : 0;
    c.shown(mode, nowMs);
    if (mode === MISSION_RADAR_EVENT && (c.radarKey !== lastKey || c.radarText !== lastText)) {
      out.push({ text: c.radarText, startS: w.stepTimeS, shownS: 0, kind: c.radarKind });
      lastKey = c.radarKey;
      lastText = c.radarText;
    }
    if (mode === MISSION_RADAR_EVENT) out[out.length - 1]!.shownS += 1 / 60;
  }
  return out;
}

describe('出来事の流れ（Phaser なしの小さな世界。自艇は出発点で止まる）', () => {
  it('ノーマル・揺らぎなし: 最初の接触（北西 2300 m）→ 西に新しい接触（10 秒に 1 回まで）→ 北西の陸の反射から出た護衛 → 東（ビラ）へ消えた（1 回）→ 東に新しい接触・帰りの列か（1 回）→ 東の新しい接触。どれも 4 秒', () => {
    const ev = runClock(kitWorld(), S.durationS);
    expect(ev.map((e) => e.text)).toEqual([
      'レーダー探知！ 北西 2300 m ・ 接触 1 ・ 目では見えない',
      'レーダー: 西に新しい接触 3600 m ・ 接触 2',
      'レーダー: 北西に新しい接触 3200 m ・ 接触 4', // 護衛（北の岸の 400 m の反射から出た）。列の 2・3 隻目は 10 秒の内か、同じ掃引で護衛が反射に入った
      `接触が東（${TR.vilaLabelJa}）へ消えた ・ 揚陸を終えると同じ海峡を戻ってくる`,
      'レーダー: 東に新しい接触 2100 m ・ 帰りの列か ・ 進路から離れよ', // 現れて最初の掃引（最大 231 m 西へ進んだ所）
      'レーダー: 東に新しい接触 2300 m ・ 接触 3',
    ]);
    for (const e of ev) expect(e.shownS).toBeCloseTo(STRAIT_EVENT_SHOW_MS / 1000, 1);
    for (let i = 1; i < ev.length; i++) if (ev[i]!.kind === RADAR_EV_NEW && ev[i - 1]!.kind === RADAR_EV_NEW) expect(ev[i]!.startS - ev[i - 1]!.startS).toBeGreaterThanOrEqual(RADAR_NEW_MIN_GAP_MS / 1000);
    expect(ev.filter((e) => e.kind === RADAR_EV_VILA).length).toBe(1);
    expect(ev.filter((e) => e.kind === RADAR_EV_RETURN).length).toBe(1);
    expect(ev.findIndex((e) => e.kind === RADAR_EV_RETURN)).toBeGreaterThan(ev.findIndex((e) => e.kind === RADAR_EV_VILA));
  });
  it('今夜の揺らぎ（seed 1〜40・ノーマルとハード）: 最初の接触は最初の掃引で目の外（2 行目の「目では見えない」の裏付け）。東へ消えたと帰りの列はどの夜も 1 回ずつ・この順', () => {
    const eye = Math.sqrt(S.visRange2);
    let minFirst = Infinity;
    for (const hard of [false, true])
      for (let seed = 1; seed <= 40; seed++) {
        const w = kitWorld({ hard, seed });
        const ev = runClock(w, S.durationS);
        const s = w.radar!.state;
        const d = Math.hypot(s.firstX - s.firstFromX, s.firstY - s.firstFromY);
        minFirst = Math.min(minFirst, d);
        expect(s.firstS, `${hard} ${seed}`).toBeLessThan(0.1);
        expect(ev[0]!.kind, `${hard} ${seed}`).toBe(RADAR_EV_FIRST);
        const kinds = ev.map((e) => e.kind).filter((k) => k === RADAR_EV_VILA || k === RADAR_EV_RETURN);
        expect(kinds, `${hard} ${seed}`).toEqual([RADAR_EV_VILA, RADAR_EV_RETURN]);
      }
    expect(minFirst).toBeGreaterThan(eye + 500);
  });
  it('上の行に隠れている間は待つ（2 行目に出ていた和で 4 秒）。隠れている間に来た次の出来事は後ろに 1 つ', () => {
    const c = new StraitLineClock();
    const r = radarTel({ firstS: NaN });
    const t = { radar: r, strait: { enabled: false } } as unknown as BoatTelemetry;
    expect(c.flags(t, 0)).toBe(0);
    r.firstX = 1800;
    r.firstY = 1200;
    r.firstS = 0.02;
    let ms = 0;
    expect(c.flags(t, ms) & MODE_FLAG_RADAR_EVENT).not.toBe(0);
    for (; ms < 10000; ms += 16) { c.flags(t, ms); c.shown(0, ms); } // 10 秒ずっと上の行（隠れている）
    expect(c.radarKind).toBe(RADAR_EV_FIRST);
    r.newCount = 1;
    r.newX = 150;
    r.newY = 1500;
    r.contacts = 2;
    c.flags(t, ms);
    expect(c.radarKind).toBe(RADAR_EV_FIRST); // 出ていない間は今の出来事のまま、新しい接触は後ろに
    let shown = 0;
    for (; c.radarKind === RADAR_EV_FIRST; ms += 16) { const f = c.flags(t, ms); c.shown((f & MODE_FLAG_RADAR_EVENT) !== 0 ? MISSION_RADAR_EVENT : 0, ms); shown += 16; }
    expect(shown).toBeGreaterThanOrEqual(STRAIT_EVENT_SHOW_MS);
    expect(shown).toBeLessThanOrEqual(STRAIT_EVENT_SHOW_MS + 64);
    expect([c.radarKind, c.radarText]).toEqual([RADAR_EV_NEW, 'レーダー: 西に新しい接触 3600 m ・ 接触 2']);
  });
  it('レーダーも列の通過も無い任務（ほかの 9 任務の形）は何も始めない（旗 0）・テレメトリの欄が無い偽物でも投げない', () => {
    const c = new StraitLineClock();
    const off = { radar: { ...radarTel({ enabled: false, firstS: 0.02, newCount: 3, lostCount: 2 }) }, strait: { enabled: false, bowOnMask: 7, bowOnM: 100 } } as unknown as BoatTelemetry;
    for (let ms = 0; ms < 20000; ms += 16) { expect(c.flags(off, ms)).toBe(0); c.shown(0, ms); }
    expect(new StraitLineClock().flags({} as BoatTelemetry, 0)).toBe(0);
  });
});

describe('人物と有名な艇を出さない（§4.12）', () => {
  it('どの形の文にも人名・階級つきの呼び方・有名な艇の番号が無い', () => {
    const texts: string[] = [];
    for (let deg = 0; deg < 360; deg += 45) {
      const [x, y] = at(deg, 2300);
      const r = radarTel({ firstX: x, firstY: y, newX: x, newY: y });
      for (const k of [RADAR_EV_FIRST, RADAR_EV_NEW, RADAR_EV_VILA, RADAR_EV_RETURN]) texts.push(radarEventLineJa(k, r));
    }
    for (const t of texts) {
      for (const name of PERSON_DENYLIST) expect(t).not.toContain(name);
      expect(RANK_RE.test(t), t).toBe(false);
      expect(FAMOUS_BOAT_RE.test(t), t).toBe(false);
    }
    expect(readFileSync('src/ui/radar-lines.ts', 'utf8')).not.toMatch(FAMOUS_BOAT_RE);
    expect(gameData.missionsSeed.missions.length).toBeGreaterThan(0);
  });
});
