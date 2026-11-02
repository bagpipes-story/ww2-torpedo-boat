// v0.6.9 S6a-fix（spec-v069 R14 A5 の (b)）: 停泊して揚陸する輸送船の任務（jp_04）は、揚陸の決着（揚陸完了か沈没）の前に帰投の輪に入っても終えない（輪の中で待つ）。
// systems/mission-end の landingHold（世界の形だけを受ける）と、輪の中の待ちの 2 行目・燃料少の後ろ・Briefing の句が同じ事を言うこと。決着の後はいつもどおり帰投、
// 揚陸の無い任務は前のまま（tests/landing-neutral・tests/mission-end）。
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { LANDING_RING_WAIT_JA } from '../src/core/briefing';
import { LD_DONE, LD_SUNK } from '../src/core/landing';
import { CALL_FUEL } from '../src/core/mission-flow';
import { landingHold, MissionEnd, type MissionEndWorld } from '../src/systems/mission-end';
import { buildWorldSetup } from '../src/systems/world-setup';
import { MISSION_WAITING } from '../src/ui/mission-mode';
import { frame, tl } from './landing-ui-kit';

const RP = buildWorldSetup(gameData, 'jp_04').mission.returnPoint;
const QUIET = { alive: 2, detected: false, sighted: false, passing: false };

/** jp_04 の世界の形（揚陸の決着は resolved で変える） */
function world(over: Partial<{ atHome: boolean; resolved: boolean; sinking: boolean; fuelEmpty: boolean; band: string; unresolved: number; t: number }> = {}): MissionEndWorld & { landing: { resolved: boolean } } {
  const o = { atHome: true, resolved: false, sinking: false, fuelEmpty: false, band: 'stop', unresolved: 0, t: 30, ...over };
  return {
    boat: { sinking: o.sinking }, atHome: o.atHome, grounded: false, torpedoesRunning: o.unresolved > 0, torpedoes: { unresolvedCount: o.unresolved },
    enemy: { sinkPlaying: false, allOut: false }, fuel: { empty: o.fuelEmpty }, band: o.band, stepTimeS: o.t, landing: { resolved: o.resolved },
  };
}

describe('揚陸の決着の前に帰投の輪に入っても終わらない（R14 A5）', () => {
  it('輪の中・決着の前: 何フレーム待っても帰投にならない（燃料 0 で止まっていても漂流にしない）。決着したフレームに帰投', () => {
    const e = new MissionEnd(RP, 1.5, false);
    for (let k = 0; k < 600; k++) expect(e.step(world({ t: 30 + k / 60 }), k / 60, 100)).toBeNull();
    expect(e.step(world({ fuelEmpty: true, t: 41 }), 60, 100)).toBeNull();
    expect(landingHold(world())).toBe(true);
    expect(e.step(world({ resolved: true, t: 42 }), 61, 100)).toBe('returned');
  });
  it('決着の後に走っている自艇の魚雷は前と同じ待ち（輪の中の秒が torpedo_settle_max_s を超えていれば帰投）', () => {
    const e = new MissionEnd(RP, 1.5, false);
    expect(e.step(world({ resolved: true, unresolved: 1 }), 0, 100)).toBeNull();
    expect(e.step(world({ resolved: true, unresolved: 1 }), RP.torpedoSettleMaxS, 100)).toBe('returned');
  });
  it('輪の外・沈み始めた艇は待たない（landingHold は偽）: 輪の外の漂流はいつもどおり', () => {
    expect(landingHold(world({ atHome: false }))).toBe(false);
    expect(landingHold(world({ sinking: true }))).toBe(false);
    expect(new MissionEnd(RP, 1.5, false).step(world({ atHome: false, fuelEmpty: true }), 1.5, 100)).toBe('adrift');
  });
  it('2 行目: 輪の中は「帰投の輪 ・ 揚陸を見届けるまで待て あと N 秒」、燃料少は「帰投の輪で止まって待て」、Briefing の句は「帰投の輪で待てる」（同じ事）', () => {
    const f = frame(tl({ leftS: 88.4 }, QUIET, { atHome: true }));
    expect([f.mode, f.text]).toEqual([MISSION_WAITING, '帰投の輪 ・ 揚陸を見届けるまで待て あと 89 秒']);
    expect(frame(tl({ leftS: 88.4 }, QUIET), CALL_FUEL).text).toBe('燃料少 ・ 揚陸まで あと 89 秒 ・ 帰投の輪で止まって待て');
    expect(LANDING_RING_WAIT_JA).toBe('帰投の輪で待てる');
    // 決着の後は輪の中の待ちの文を出さない（世界は帰投で終える）
    for (const phase of [LD_DONE, LD_SUNK]) expect(frame(tl({ resolved: true, phase, leftS: 0 }, QUIET, { atHome: true })).mode).not.toBe(MISSION_WAITING);
  });
});
