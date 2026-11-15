// v0.8.0 S4（spec-v0800 §4.9、brief L28・L30・L34）: 海峡の夜の衝突の危険と 2 行目の 2 つのモード、列が去った後の 3 行目。
// - 衝突の危険（systems/strait-telemetry）: 目で見えている艦だけ（out でなく d² ≤ 視程²＝setSighted と同じ規則）・艦首が自艇へ ±15°・500 m の内（config/strait-hud-config。見せ方の値）。
//   時計（ui/strait-line-clock）は 1 回の接近で 1 回（艦のビットが新しく立った時）・4 秒（2 行目に出ていた和）・距離は 100 m 刻みの切り上げで危険の間は毎フレーム。
// - モードの順（ui/mission-mode）: 衝突の危険は夜明けの空襲のすぐ下・水上機の攻撃と味方機の上、レーダーの出来事は急ぎの行の下・浅瀬・呼びかけ・平常の上。旗が無ければ今のまま。
// - 3 行目（L30）: 「東京急行は西へ去った ・ 狙う艦なし」（S2 のまま）は戻りの残りがある間は出ない（列の allOut は transitPending が 0 の時だけ）＝護衛を沈めて列がビラにいる夜でも出ない。
// - 幅（L34）: 衝突の危険の文は 22 px で 840 px の内、3 行目は 20 px で 596 px の内。人物と有名な艇の名は無い。
import { describe, expect, it } from 'vitest';
import { HUD_COLOR_WARN } from '../src/config/hud-text-config';
import { BOW_ON_HALF_ANGLE_DEG, BOW_ON_RANGE_M, BOW_ON_STEP_M, STRAIT_EVENT_SHOW_MS } from '../src/config/strait-hud-config';
import { AS_T_RUN } from '../src/core/air-strike-state';
import { createDawnTelemetry } from '../src/core/dawn-air';
import type { BoatTelemetry, StraitTelemetry } from '../src/core/boat-telemetry';
import { FF_CHALLENGE } from '../src/core/friendly';
import { CALL_DAWN } from '../src/core/mission-flow';
import { SP_RUN } from '../src/core/seaplane';
import { TRANSIT_GONE, TRANSIT_SUNK } from '../src/core/ship-transit';
import { initStraitTelemetry, refreshStraitTelemetry, type StraitTelemetryWorld } from '../src/systems/strait-telemetry';
import { shipsGoneStatusJa } from '../src/ui/dawn-lines';
import {
  MISSION_BOW_ON, MISSION_CALL, MISSION_FRIENDLY, MISSION_NORMAL, MISSION_PLANE_ATTACK, MISSION_RADAR_EVENT, MISSION_SHALLOWS, MISSION_STRIKE, MODE_FLAG_BOW_ON, MODE_FLAG_RADAR_EVENT, missionMode,
} from '../src/ui/mission-mode';
import { specialLine } from '../src/ui/special-line';
import { StraitLineClock } from '../src/ui/strait-line-clock';
import { bowOnLineJa } from '../src/ui/strait-lines';
import { FAMOUS_BOAT_RE, PERSON_DENYLIST, RANK_RE } from './person-denylist';
import { tele, textWidthPx } from './pt-ui-kit';
import { code } from './sfx-rules-kit';
import { kitStep, kitWorld } from './transit-world-kit';

type Ship = { out: boolean; state: { x: number; y: number; headingDeg: number } };
/** 自艇 (0, 0)・視程 eye m の世界と、艦の列 */
function world(ships: Ship[], eye = 900, transit = true): StraitTelemetryWorld {
  return { visRange2: eye * eye, boat: { state: { x: 0, y: 0 } }, destroyers: { transit: transit ? {} : null, ships }, radar: null };
}
/** 自艇から方位 deg・距離 m の点にいて、艦首が自艇から off deg ずれた艦 */
function ship(deg: number, m: number, off = 0, out = false): Ship {
  const r = (deg * Math.PI) / 180;
  return { out, state: { x: m * Math.sin(r), y: -m * Math.cos(r), headingDeg: (deg + 180 + off + 360) % 360 } };
}
const strait = (w: StraitTelemetryWorld): StraitTelemetry => initStraitTelemetry(w);

describe('衝突の危険のテレメトリ（systems/strait-telemetry。brief L28）', () => {
  it('目で見えている艦だけ・艦首が ±15° の内・500 m の内でビットが立つ。距離は一番近い危険な艦まで', () => {
    expect([BOW_ON_RANGE_M, BOW_ON_HALF_ANGLE_DEG, BOW_ON_STEP_M]).toEqual([500, 15, 100]);
    const t = strait(world([ship(0, 400), ship(90, 450, 14.9), ship(180, 300, 15.1), ship(270, 520), ship(45, 200, 0, true)]));
    expect([t.enabled, t.bowOnMask, Math.round(t.bowOnM)]).toEqual([true, 0b00011, 400]);
    // 視程 300 m の雨の夜: 400 m・450 m の艦は目で見えない＝危険に数えない（レーダーの輪は見えていても）
    expect(strait(world([ship(0, 400), ship(90, 450, 14.9)], 300)).bowOnMask).toBe(0);
    // 艦首が向いていない・沈み始めた／海域の外（out）の艦は数えない
    expect(strait(world([ship(0, 400, 90), ship(0, 300, 0, true)])).bowOnMask).toBe(0);
    expect(Number.isNaN(strait(world([ship(0, 400, 90)])).bowOnM)).toBe(true);
  });
  it('列の通過もレーダーも無い任務は enabled false で何も書かない。毎フレームの更新は同じ規則（視程の写しも）', () => {
    const off = initStraitTelemetry({ ...world([ship(0, 300)], 900, false), radar: null });
    expect([off.enabled, off.bowOnMask]).toEqual([false, 0]);
    refreshStraitTelemetry(off, world([ship(0, 300)], 900, false));
    expect(off.bowOnMask).toBe(0);
    const near = ship(0, 800);
    const w = world([near]);
    const t = strait(w);
    expect(t.bowOnMask).toBe(0);
    near.state.y = -450;
    refreshStraitTelemetry(t, w);
    expect([t.bowOnMask, Math.round(t.bowOnM), t.eyeRange2]).toEqual([1, 450, 810000]);
  });
  it('source: 規則は setSighted と同じ（out でなく d² ≤ 視程²）・bowOnRisk（2 乗の距離と内積）・平方根はビットのある時だけ・atan2 なし・世界へ書かない', () => {
    const src = code('src/systems/strait-telemetry.ts');
    expect(src).toContain('if (d.out) continue;');
    expect(src).toContain('if (d2 > r2 || !bowOnRisk(s.x, s.y, s.headingDeg, b.x, b.y, BOW_RANGE2, BOW_COS2)) continue;');
    expect(src).toContain('t.bowOnM = mask !== 0 ? Math.sqrt(best) : NaN;');
    expect(src).not.toMatch(/atan2|hypot/);
    expect([...src.matchAll(/\b(\w+(?:\.\w+)*)\s*=(?!=)/g)].map((m) => m[1]!).filter((l) => l.includes('.') && !l.startsWith('t.'))).toEqual([]);
    const mt = code('src/systems/mission-telemetry.ts');
    expect(mt).toContain('d.setSighted(dx * dx + dy * dy <= w.visRange2);');
    expect(mt.indexOf('refreshStraitTelemetry(t.strait, w);')).toBeGreaterThan(mt.indexOf('d.setSighted('));
  });
});

describe('衝突の危険の時計（ui/strait-line-clock）', () => {
  const tel = (mask: number, m: number): BoatTelemetry => ({ radar: { enabled: false }, strait: { enabled: true, eyeRange2: 810000, bowOnMask: mask, bowOnM: m } }) as unknown as BoatTelemetry;
  it('1 回の接近で 1 回（ビットが新しく立った時）・4 秒（出ていた和）。距離は危険の間は毎フレーム（100 m の切り上げ）、外れたら最後の距離のまま。円錐の外へ出て戻れば次の 1 回', () => {
    const c = new StraitLineClock();
    let ms = 0;
    const frame = (t: BoatTelemetry): number => { const f = c.flags(t, ms); c.shown((f & MODE_FLAG_BOW_ON) !== 0 ? MISSION_BOW_ON : 0, ms); ms += 16; return f; };
    expect(frame(tel(0, NaN))).toBe(0);
    expect(frame(tel(1, 480)) & MODE_FLAG_BOW_ON).not.toBe(0);
    const k1 = c.bowKey;
    expect([c.bowStep, specialLine(tele(), MISSION_BOW_ON, { landingEv: tele().landing, strait: c })]).toEqual([5, { text: '衝突の危険！ 駆逐艦 500 m ・ 艇首がこちらへ', color: HUD_COLOR_WARN }]);
    let on = 0;
    for (let i = 0; i < 400; i++) if ((frame(tel(1, 480 - i)) & MODE_FLAG_BOW_ON) !== 0) on += 16;
    expect(on).toBeGreaterThanOrEqual(STRAIT_EVENT_SHOW_MS - 32);
    expect(on).toBeLessThanOrEqual(STRAIT_EVENT_SHOW_MS + 16);
    expect(c.bowKey).not.toBe(k1); // 距離の刻みが変わると 2 行目のキーも変わる
    expect(frame(tel(1, 50)) & MODE_FLAG_BOW_ON).toBe(0); // 同じ接近のうちは 2 度目を出さない
    expect(frame(tel(0, NaN)) & MODE_FLAG_BOW_ON).toBe(0);
    expect(c.bowStep).toBe(1); // 外れたら最後の距離のまま
    expect(frame(tel(1, 400)) & MODE_FLAG_BOW_ON).not.toBe(0); // 円錐の外へ出て戻った＝次の 1 回
    expect(frame(tel(3, 300)) & MODE_FLAG_BOW_ON).not.toBe(0); // 2 隻目のビット＝出し直す
  });
});

describe('2 行目のモードの順（ui/mission-mode）', () => {
  it('衝突の危険は夜明けの空襲の下・水上機の攻撃と味方機の識別の上。レーダーの出来事は急ぎの行の下・浅瀬・呼びかけ・平常の上。旗が無ければ今のまま', () => {
    const base = tele({ enabled: false }, {});
    expect(missionMode(base, 0, 0)).toBe(MISSION_NORMAL);
    expect(missionMode(base, 0, MODE_FLAG_RADAR_EVENT)).toBe(MISSION_RADAR_EVENT);
    expect(missionMode(base, CALL_DAWN, MODE_FLAG_RADAR_EVENT)).toBe(MISSION_RADAR_EVENT);
    expect(missionMode(base, CALL_DAWN, 0)).toBe(MISSION_CALL);
    expect(missionMode(tele({ enabled: false }, { shallowState: 1 }), 0, MODE_FLAG_RADAR_EVENT)).toBe(MISSION_RADAR_EVENT);
    expect(missionMode(tele({ enabled: false }, { shallowState: 1 }), 0, 0)).toBe(MISSION_SHALLOWS);
    const plane = tele({ enabled: false }, { planePhase: SP_RUN, planeLocked: true });
    expect(missionMode(plane, 0, MODE_FLAG_RADAR_EVENT)).toBe(MISSION_PLANE_ATTACK);
    expect(missionMode(plane, 0, MODE_FLAG_BOW_ON | MODE_FLAG_RADAR_EVENT)).toBe(MISSION_BOW_ON);
    const ff = tele({ enabled: false }, { friendlyPhase: FF_CHALLENGE });
    expect([missionMode(ff, 0, MODE_FLAG_RADAR_EVENT), missionMode(ff, 0, MODE_FLAG_BOW_ON)]).toEqual([MISSION_FRIENDLY, MISSION_BOW_ON]);
    const strike = tele({ enabled: false }, { dawn: { ...createDawnTelemetry(), threat: AS_T_RUN } });
    expect(missionMode(strike, 0, MODE_FLAG_BOW_ON)).toBe(MISSION_STRIKE);
  });
});

describe('列が去った後の 3 行目（brief L30: S2 の夜明けの形のまま）', () => {
  it('「東京急行は西へ去った ・ 狙う艦なし」は戻りの残りがある間は出ない: 護衛を沈め列がビラにいる間も allOut は偽。最後の列の艦が去ったステップから真', () => {
    for (const hard of [false, true]) {
      const w = kitWorld({ hard });
      w.ships[0]!.sinking = true; // 護衛は出撃の時に沈んだ（列だけが残る夜）
      let firstGone = NaN;
      let lastLeft = NaN;
      while (w.stepTimeS < w.setup.durationS) {
        kitStep(w);
        const gone = w.transit.allOut && !w.ships.every((d) => d.sinking); // systems/dawn-telemetry の shipsGone と同じ式（destroyer-group の allOut は列の通過のある任務では transit.allOut）
        const ph = Array.from(w.transit.state.phase.slice(0, w.transit.state.ships));
        if (w.transit.pending > 0 || ph.some((p) => p !== TRANSIT_GONE && p !== TRANSIT_SUNK)) expect(gone, `t ${w.stepTimeS.toFixed(2)}`).toBe(false);
        else if (Number.isNaN(lastLeft)) lastLeft = w.stepTimeS;
        if (gone && Number.isNaN(firstGone)) firstGone = w.stepTimeS;
      }
      expect(firstGone).toBe(lastLeft);
      expect(firstGone).toBeLessThan(w.setup.durationS);
    }
    expect(code('src/systems/dawn-telemetry.ts')).toContain('d.shipsGone = w.enemy.allOut && !w.enemy.shipDown;');
    expect(code('src/systems/destroyer-group.ts')).toContain('return this.transit ? this.transit.allOut : allShipsOut(this.ships);');
    expect(code('src/systems/destroyer-transit.ts')).toContain('if (transitPending(this.state) > 0) return false;');
  });
  it('文と幅: 3 行目は 20 px で 596 px の内（新しい 3 行目の文は足していない＝ui/boat-hud は変えない）', () => {
    const d = { ...createDawnTelemetry(), forceJa: '東京急行', retireJa: '西' };
    const s = shipsGoneStatusJa(d);
    expect(s).toBe('東京急行は西へ去った ・ 狙う艦なし');
    expect(Math.round(textWidthPx(s, 20) * 10) / 10).toBe(344.1);
    expect(code('src/ui/boat-hud.ts')).toContain("this.statusText.setText(shipsGoneStatusJa(t.dawn)).setColor(HUD_COLOR_STRONG);");
  });
});

describe('衝突の危険の文の幅（22 px で 840 px の内）と人物の名（§4.12）', () => {
  it('どの距離の刻みでも 840 px の内（いちばん広い 500 m の形の px を固定）。人名・有名な艇の番号が無い', () => {
    for (let k = 1; k <= BOW_ON_RANGE_M / BOW_ON_STEP_M; k++) {
      const s = bowOnLineJa(k);
      expect(textWidthPx(s, 22), s).toBeLessThanOrEqual(840);
      for (const name of PERSON_DENYLIST) expect(s).not.toContain(name);
      expect(RANK_RE.test(s) || FAMOUS_BOAT_RE.test(s)).toBe(false);
    }
    expect(Math.round(textWidthPx(bowOnLineJa(5), 22) * 10) / 10).toBe(493.2);
  });
});
