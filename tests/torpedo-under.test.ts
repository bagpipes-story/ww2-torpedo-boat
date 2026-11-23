// v0.8.2 IP1（ユーザーの決め 2026-11-19「推奨通り知らせを出してください。でもメッセージは「近すぎて船体の下を通過」にしてください」）: 武装の前（100 m の内）に狙える艦の船体の下を通った
// 自艇の魚雷（入って武装の前に抜けた＝中で武装して当たった魚雷は数えない）を数える systems/torpedo-under（本物の TorpedoPool の直後・同じ位置と円）と、2 行目の出来事 ui/under-lines（ui/strait-line-clock が持つ・モード 44・旗 4096）。
// 武装した魚雷は今のまま当たる（数えない）・船体の外は数えない・出た艦（沈み始めた・退いた）は数えない・1 本につき 1 回・世界は読むだけ・文はユーザーの言葉そのままで 22 px の 840 px の内。
import { describe, expect, it } from 'vitest';
import { gameData, getBoatTorpedoCount } from '../src/config/game-data';
import { HUD_COLOR_WARN } from '../src/config/hud-text-config';
import { UNDER_EVENT_SHOW_MS } from '../src/config/under-hud-config';
import { TorpedoUnder } from '../src/systems/torpedo-under';
import { buildWorldSetup } from '../src/systems/world-setup';
import { composeLineKeys, createLineKeys } from '../src/ui/mission-line-keys';
import { MISSION_UNDER_EVENT, MODE_FLAG_UNDER_EVENT, missionMode } from '../src/ui/mission-mode';
import { specialLine } from '../src/ui/special-line';
import { StraitLineClock } from '../src/ui/strait-line-clock';
import { UNDER_LINE, UNDER_LINE_JA } from '../src/ui/under-lines';
import { code } from './core-rules-kit';
import { SFX } from './sfx-rules-kit';
import { LINE2_MAX_PX, tele, textWidthPx } from './pt-ui-kit';
import { DT, TorpedoPool, fakeShip, scene, spies, type FakeShip } from './torpedo-free-kit';
import { fillHullCircles } from '../src/core/torpedo-solver';

/** us_02 の艇と魚雷で、偽の艦（東西 100 m・幅 12 m・中心 (3000, 1000)）の南 gap m（船体の縁から）から北へ 1 本 */
function shoot(gap: number, ships: FakeShip[] = [fakeShip(3000, 1000)], dx = 0): { hit: number; under: number; states: string } {
  const s = buildWorldSetup(gameData, 'us_02');
  const pool = new TorpedoPool(scene, s.torpedoParams, getBoatTorpedoCount(gameData, s.mission.playerBoatId), s.mission.bounds);
  const under = new TorpedoUnder(pool.capacity, s.torpedoParams.armingM);
  const ev = spies();
  pool.fire(3000 + dx, 1000 + 6 + gap, 0, false, false, 0, gap);
  let before = '';
  let after = '';
  for (let k = 0; k < 600; k++) {
    pool.step(DT * s.timeScale, DT, ships, 1e12, ev);
    before = JSON.stringify(pool.states);
    under.step(pool.states, ships);
    after = JSON.stringify(pool.states);
    if (before !== after) break;
  }
  return { hit: ev.hit, under: under.count, states: before === after ? 'same' : 'changed' };
}

describe('systems/torpedo-under（武装の前に船体の下を通った魚雷）', () => {
  it('武装の距離は data の 100 m（hit_rate_model.torpedo_launch.arming_distance_m）', () => {
    expect(buildWorldSetup(gameData, 'us_02').torpedoParams.armingM).toBe(gameData.hitRateModel.torpedo_launch.arming_distance_m);
    expect(gameData.hitRateModel.torpedo_launch.arming_distance_m).toBe(100);
  });
  it('縁から 40 m で撃つ: 当たらず（幅 12 m を武装の前に抜ける）1 回数える。縁から 200 m: 今のまま命中・数えない。船体の外を通れば数えない。世界の魚雷の状態は変えない', () => {
    expect(shoot(40)).toEqual({ hit: 0, under: 1, states: 'same' });
    expect(shoot(200)).toEqual({ hit: 1, under: 0, states: 'same' });
    expect(shoot(40, [fakeShip(3000, 1000)], 200)).toEqual({ hit: 0, under: 0, states: 'same' });
  });
  it('武装の前に入っても中で武装すれば今のまま命中・数えない（幅 80 m の船体の真横 40 m・向かう向きに長い船体の端 40 m＝艦首から撃つ形）', () => {
    const wide = fakeShip(3000, 1000);
    fillHullCircles(wide.circles, 3000, 1000, 90, 200, 80);
    expect(shoot(40 + 34, [wide])).toEqual({ hit: 1, under: 0, states: 'same' }); // 縁から南 40 m（shoot は幅 12 m の縁から測るので ＋34）
    const along = fakeShip(3000, 1000);
    fillHullCircles(along.circles, 3000, 1000, 0, 200, 12); // 南北に長い（魚雷は船体に沿って走る）
    expect(shoot(40 + 94, [along])).toEqual({ hit: 1, under: 0, states: 'same' }); // 南の端から 40 m
  });
  it('1 本につき 1 回: 武装の前に 2 隻の船体を続けて抜けても 1。出た艦（沈み始めた・退いた・海域の外）は数えない', () => {
    expect(shoot(30, [fakeShip(3000, 1000), fakeShip(3000, 970)])).toEqual({ hit: 0, under: 1, states: 'same' });
    const out = fakeShip(3000, 1000);
    out.out = true;
    out.sinking = true;
    expect(shoot(40, [out])).toEqual({ hit: 0, under: 0, states: 'same' });
  });
  it('source: 確保は constructor だけ（Uint8Array 1 つ）。凍結の torpedo-pool・torpedo-targets は import しない（型と pointHitsHull だけ）。destroyer-step がプールの step の直後に呼ぶ', () => {
    const src = code('src/systems/torpedo-under.ts');
    expect(src.match(/new /g)).toEqual(['new ']);
    expect(src).toContain('new Uint8Array(capacity)');
    expect(src).not.toMatch(/torpedo-pool|Math\.random|\.push\(|\.map\(|\.filter\(/);
    const step = code('src/systems/destroyer-step.ts');
    const a = step.indexOf('w.torpedoes.step(dt, feelDt, g.ships, g.passRadius2, w.torpedoEvents, w.stepTimeS, settleS);');
    const b = step.indexOf('w.torpedoUnder.step(w.torpedoes.states, g.ships);');
    expect(a >= 0 && b > a).toBe(true);
  });
});

describe('2 行目「近すぎて船体の下を通過」（ui/under-lines。モード 44）', () => {
  const frame = (c: StraitLineClock, n: number, ms: number): number => {
    const t = tele({}, { torpedoUnder: n });
    const f = c.flags(t, ms);
    const mode = missionMode(t, 0, f);
    c.shown(mode, ms);
    return mode;
  };
  it('文はユーザーの言葉そのまま・警告の色・22 px で 840 px の内', () => {
    expect(UNDER_LINE_JA).toBe('近すぎて船体の下を通過');
    expect(UNDER_LINE).toEqual({ text: '近すぎて船体の下を通過', color: HUD_COLOR_WARN });
    expect(textWidthPx(UNDER_LINE_JA, 22)).toBe(242);
    expect(textWidthPx(UNDER_LINE_JA, 22)).toBeLessThanOrEqual(LINE2_MAX_PX);
  });
  it('数が増えた時に出し、2 行目に出ていた ms の和が 4 秒に届くまで（出ている間の次の 1 本は数え直さない）。その後の 1 本でまた出す。数が 0 の任務は出ない', () => {
    const c = new StraitLineClock();
    expect(frame(c, 0, 0)).not.toBe(MISSION_UNDER_EVENT); // tele の既定は米PT の任務の平常（MISSION_PT）
    expect(c.under.key).toBe(0);
    let ms = 0;
    expect(frame(c, 1, (ms += 16))).toBe(MISSION_UNDER_EVENT);
    expect(c.under.key).toBe(1);
    const t = tele({}, { torpedoUnder: 1 });
    expect(specialLine(t, MISSION_UNDER_EVENT, { landingEv: null as never, strait: c })).toEqual(UNDER_LINE);
    expect(composeLineKeys(createLineKeys(), t, MISSION_UNDER_EVENT, MODE_FLAG_UNDER_EVENT, -1, 0, 0, null as never, c).lKey).toBe(1);
    expect(frame(c, 2, (ms += 16))).toBe(MISSION_UNDER_EVENT); // 出ている間の 2 本目
    let shown = 0;
    while (frame(c, 2, (ms += 16)) === MISSION_UNDER_EVENT) shown += 16;
    expect(shown).toBeGreaterThanOrEqual(UNDER_EVENT_SHOW_MS - 32);
    expect(shown).toBeLessThanOrEqual(UNDER_EVENT_SHOW_MS);
    expect(c.under.key).toBe(1);
    expect(frame(c, 3, (ms += 16))).toBe(MISSION_UNDER_EVENT);
    expect(c.under.key).toBe(2);
  });
  it('上の行（燃料切れ）に隠れている間は数えず待つ', () => {
    const c = new StraitLineClock();
    let ms = 0;
    for (let i = 0; i < 400; i++) {
      const t = tele({}, { torpedoUnder: 1, fuelEmpty: true });
      c.shown(missionMode(t, 0, c.flags(t, (ms += 16))), ms);
    }
    expect(frame(c, 1, (ms += 16))).toBe(MISSION_UNDER_EVENT);
  });
  it('配線: 海峡の時計が under を持ち旗を足し shown を渡す・special-line と mission-line-keys がモード 44 を読む・mission-line は変えない・音の層は読まない', () => {
    const clock = code('src/ui/strait-line-clock.ts');
    expect(clock).toContain('readonly under = new UnderLineClock();');
    expect(clock).toContain('const under = this.under.flags(t, nowMs);');
    expect(clock).toContain('this.under.shown(mode, nowMs);');
    expect(code('src/ui/special-line.ts')).toContain('if (mode === MISSION_UNDER_EVENT) return UNDER_LINE;');
    expect(code('src/ui/mission-line-keys.ts')).toContain('mode === MISSION_UNDER_EVENT ? (strait?.under ? strait.under.key : 0)');
    expect(code('src/ui/mission-line.ts')).not.toContain('UNDER');
    for (const f of SFX) expect(code(f), f).not.toMatch(/under-lines|torpedoUnder|torpedo-under/); // 音は絵と HUD に従う＝新しい合図を作らない
  });
});
