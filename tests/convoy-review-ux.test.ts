// v0.6.4 レビュー（ux の指摘。jp_01「夜の輸送護衛」）の直しの pin: 決着の前に「帰投せよ」と言わない（ux-1）、大発だけが見つかっている間は「発見された！」と言わない（ux-2）、
// 標的の大発を失った航過の赤い線の行を降ろす（ux-3）、決着の後は呼びかけが接触の行に勝つ（ux-4）、狙われている大発の印（ux-5）、帰投地点の方角は自艇の出発点から（ux-6）、
// 撃つ前に 25mm で黙らせた大発への航過の結果（ux-7）、Result の航行中の数（ux-9）。どれも jp_05（輸送隊の無い任務）の文・キー・優先は変わらないことも並べて確かめる。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONVOY_EVENT_SHOW_MS } from '../src/config/convoy-config';
import { HOME_COLOR_TEXT, HUD_COLOR_STRONG } from '../src/config/hud-text-config';
import { gameData } from '../src/config/game-data';
import type { BoatState, BoatTelemetry } from '../src/core/boat-motion';
import { CV_ARRIVED, CV_SUNK, createConvoy, createConvoyTelemetry, hitConvoyBarge, type ConvoyState, type ConvoyTelemetry } from '../src/core/convoy';
import { DAWN_AIR_ENEMY } from '../src/core/dawn-air';
import { CALL_DAWN, CALL_FUEL, CALL_SUNK } from '../src/core/mission-flow';
import { GUN_FIRING } from '../src/core/gun-battery';
import { PT_BREAK, PT_CHASE, PT_FATE_HULL, PT_FATE_SUNK, PT_LEAVE, PT_PASS, PT_RUN_IN, createPtSection, type PtTelemetry } from '../src/core/pt-boats';
import { PT_GUN_EV_CREW, PT_GUN_EV_HULL } from '../src/core/pt-damage';
import { enemyDetectRangeM, speedFactorForBand } from '../src/core/visibility';
import { briefingNumbers } from '../src/systems/briefing-numbers';
import { PtTargets, type PtTargetConvoy } from '../src/systems/pt-target';
import { initPtTelemetry, refreshPtTelemetry } from '../src/systems/pt-telemetry';
import { buildWorldSetup } from '../src/systems/world-setup';
import { CONVOY_EV_ARRIVED, CONVOY_EV_SUNK, convoyEventLine, convoyResultLine, convoyWaiting } from '../src/ui/convoy-lines';
import { callLineText } from '../src/ui/dawn-lines';
import {
  MISSION_CALL, MISSION_CONVOY_EVENT, MISSION_PT, MISSION_PT_CONTACT, MISSION_PT_GUN, MISSION_PT_GUN_EVENT, MISSION_PT_PASS, MODE_FLAG_CONVOY_EVENT, MODE_FLAG_PT_GUN_EVENT, MODE_FLAG_PT_RESULT, missionMode,
} from '../src/ui/mission-mode';
import { PtLineClock } from '../src/ui/pt-line-clock';
import { LINE2_MAX_PX, isPtMode, keyOf, ptWorld, row, tele, textWidthPx } from './pt-ui-kit';
import { ptKey, ptLine } from '../src/ui/pt-lines';
import { mergeBurstBits } from '../src/ui/pt-gun-lines';

const S = buildWorldSetup(gameData, 'jp_01');
const RESULT = MODE_FLAG_PT_RESULT;
const GUN_EV = MODE_FLAG_PT_GUN_EVENT;
const CV_EVENT = MODE_FLAG_CONVOY_EVENT;

/** jp_01 の出撃時の輸送隊（tests/convoy-lines と同じ: 3 隻・浜まで 3,040 m・米PT は東から）に上書き。DONE は決着（2 隻上陸・1 隻沈没） */
function cv(over: Partial<ConvoyTelemetry> = {}): ConvoyTelemetry {
  return { ...createConvoyTelemetry(), enabled: true, total: 3, afloat: 3, arrived: 0, sunk: 0, resolved: false, leftM: 3040, nearestDx: 0, nearestDy: 150, nearestM: 150, fromDirJa: '東', ...over };
}
const DONE: Partial<ConvoyTelemetry> = { afloat: 0, arrived: 2, sunk: 1, resolved: true };
const t01 = (pt: Partial<PtTelemetry> = {}, convoy: Partial<ConvoyTelemetry> = {}, over: Partial<BoatTelemetry> = {}): BoatTelemetry =>
  tele({ silentMaxKt: 13, leaveDirJa: '北東', ...pt }, { ...over, convoy: cv(convoy) });
const DAWN = { dawn: { ...tele().dawn, reached: true, air: DAWN_AIR_ENEMY } };
const GONE: Partial<PtTelemetry> = { alive: 0, out: 2, fighting: 0, threatPhase: -1, sighted: false };
const BREAK: Partial<PtTelemetry> = { detected: true, threatPhase: PT_BREAK, gunEverFired: true };
const PASS_BARGE: Partial<PtTelemetry> = { detected: true, sighted: true, dx: 300, dy: -400, passing: true, threatPhase: PT_PASS, targetKind: 1 };

/** mission-line と同じ組み方の 2 行目（米PT のモード・呼びかけ・輸送隊の出来事。ほかは ''） */
function line2(t: BoatTelemetry, call: number, flags: number, ev = CONVOY_EV_SUNK): string {
  const mode = missionMode(t, call, flags);
  if (isPtMode(mode)) return ptLine(t, mode, ptKey(t, mode, flags)).text;
  if (mode === MISSION_CALL) return callLineText(t, call, 20);
  return mode === MISSION_CONVOY_EVENT ? convoyEventLine(t.convoy, ev).text : '';
}

describe('ux-1: 輸送隊の決着の前は「帰投せよ」と言わない', () => {
  it('みな去った平常の行は「大発の上陸を待て  浜まで N m」（平常のキーの bit 30・浜までの刻みで組み直し、輪までの距離では組み直さない）。決着の後と jp_05 は「帰投せよ  N m」', () => {
    expect(row(t01(GONE))).toEqual([MISSION_PT, '米PT は北東へ去った ・ 大発の上陸を待て  浜まで 3100 m', HUD_COLOR_STRONG]);
    expect(row(t01({ ...GONE, out: 0 }, {}, DAWN), CALL_DAWN)[1]).toBe('夜明け ・ 米PT は北東へ去る ・ 大発の上陸を待て  浜まで 3100 m');
    expect((keyOf(t01(GONE)) >> 30) & 1).toBe(1);
    expect(keyOf(t01(GONE, { leftM: 2999 }))).not.toBe(keyOf(t01(GONE)));
    expect(keyOf(t01(GONE, {}, { homeEdgeM: 950 }))).toBe(keyOf(t01(GONE)));
    expect(row(t01(GONE, DONE))[1]).toBe('米PT は北東へ去った ・ 帰投せよ  2000 m');
    expect((keyOf(t01(GONE, DONE)) >> 30) & 1).toBe(0);
    expect(row(tele(GONE))[1]).toBe('米PT は東へ去った ・ 帰投せよ  2000 m');
    expect(keyOf(tele(GONE)) >>> 0).toBeLessThan(2 ** 30);
  });
  it('25mm の出来事で戦う PT が残らなければ「・ 大発の上陸を待て」（キーの bit 14）。残っていれば「残り N 隻」でキーは同じ。決着の後と jp_05 は「帰投せよ」', () => {
    const ev: Partial<PtTelemetry> = { gunEvent: PT_GUN_EV_HULL, alive: 1, fighting: 0, detected: true, threatPhase: PT_BREAK };
    expect(row(t01(ev), 0, GUN_EV)).toEqual([MISSION_PT_GUN_EVENT, '米PT 撃退！ 穴だらけで離脱 ・ 大発の上陸を待て', HOME_COLOR_TEXT]);
    expect(row(t01(ev, DONE), 0, GUN_EV)[1]).toBe('米PT 撃退！ 穴だらけで離脱 ・ 帰投せよ');
    expect(row(tele(ev), 0, GUN_EV)[1]).toBe('米PT 撃退！ 穴だらけで離脱 ・ 帰投せよ');
    expect(row(t01({ ...ev, fighting: 1 }), 0, GUN_EV)[1]).toBe('米PT 撃退！ 穴だらけで離脱 ・ 残り 1 隻');
    expect(keyOf(t01({ ...ev, fighting: 1 }), 0, GUN_EV)).toBe(keyOf(t01({ ...ev, fighting: 1 }, DONE), 0, GUN_EV));
    expect(keyOf(t01(ev), 0, GUN_EV) - keyOf(t01(ev, DONE), 0, GUN_EV)).toBe(1 << 14);
    // 連射の結果を足した行（ux-3 の merge）は短い「上陸を待て」で 22 px・840 px の内（1 回の連射の弾をみな受けた撃退がいちばん長い）
    const hits = S.ptBoats!.burstRounds;
    const wide = t01({ ...ev, gunEvent: PT_GUN_EV_CREW });
    const text = ptLine(wide, MISSION_PT_GUN_EVENT, ptKey(wide, MISSION_PT_GUN_EVENT, GUN_EV, 0, mergeBurstBits(tele({ lastPassFired: true, lastPassHits: hits }).pt))).text;
    expect(text).toBe(`米PT 撃退！ 死傷者が出て離脱 ・ 連射 被弾 ${hits} 発（HP −${hits * S.ptBoats!.hit.damage}） ・ 上陸を待て`);
    expect(textWidthPx(text, 22), text).toBeLessThanOrEqual(LINE2_MAX_PX);
    expect(textWidthPx(row(t01({ ...ev, gunEvent: PT_GUN_EV_CREW }), 0, GUN_EV)[1], 22)).toBeLessThanOrEqual(LINE2_MAX_PX);
  });
  it('呼びかけ: 決着の前の夜明け近しは「夜明け近し 大発の上陸を待て  浜まで N m」。燃料少は帰投せよのまま（漂流すれば何も残らない）。決着の後・jp_05 の文は前と同じ', () => {
    expect(callLineText(t01(), CALL_DAWN, 20)).toBe('夜明け近し 大発の上陸を待て  浜まで 3100 m');
    expect(callLineText(t01({}, { leftM: 1250 }), CALL_DAWN, 20)).toBe('夜明け近し 大発の上陸を待て  浜まで 1300 m');
    expect(callLineText(t01(), CALL_FUEL, 20)).toBe('燃料少 帰投せよ  2000 m');
    expect(callLineText(t01({}, DONE), CALL_DAWN, 20)).toBe('夜明け近し 帰投せよ  2000 m');
    expect(callLineText(t01({}, DONE), CALL_SUNK, 20)).toBe('大発 上陸 2/3 ・ 帰投せよ  2000 m');
    expect(callLineText(t01({}, DONE, DAWN), CALL_DAWN, 20)).toBe('空襲下 帰投せよ  2000 m');
    expect(callLineText(tele(), CALL_DAWN, 20)).toBe('夜明け近し 帰投せよ  2000 m');
    expect(callLineText(tele({}, { gunMission: true }), CALL_SUNK, 31)).toBe('撃破！帰投せよ  3100 m');
    expect([convoyWaiting(cv()), convoyWaiting(cv(DONE)), convoyWaiting(createConvoyTelemetry())]).toEqual([true, false, false]);
    for (const l of [callLineText(t01({}, { leftM: 6300 }), CALL_DAWN, 20), row(t01({ ...GONE, out: 0 }, { leftM: 6300 }, DAWN), CALL_DAWN)[1]]) expect(textWidthPx(l, 22), l).toBeLessThanOrEqual(LINE2_MAX_PX);
  });
  it('一覧: 決着の前（3 隻航行中・2 隻上陸・1 隻沈没 1 隻上陸）の 2 行目のどの形にも「帰投」が無い（燃料少の呼びかけだけは帰投せよ）。決着の後は出る', () => {
    const pts: Partial<PtTelemetry>[] = [
      {}, GONE, { ...GONE, out: 0 }, { ...GONE, sunk: 2, out: 0 }, BREAK, { ...BREAK, gunEverFired: false }, { ...BREAK, threatPhase: PT_RUN_IN, sighted: true, dx: 300, dy: -400 },
      { ...BREAK, threatPhase: PT_CHASE }, PASS_BARGE, { ...BREAK, lastPassTargetKind: 1, lastPassFired: false, passes: 1, maxPasses: 8 },
      { gunEvent: PT_GUN_EV_HULL, alive: 1, fighting: 0 }, { gunEvent: PT_GUN_EV_HULL, alive: 0, fighting: 0, out: 1 },
    ];
    const convoys: Partial<ConvoyTelemetry>[] = [{}, { afloat: 1, arrived: 2 }, { afloat: 1, arrived: 1, sunk: 1 }];
    let n = 0;
    for (const c of convoys) {
      for (const p of pts) {
        for (const over of [{}, DAWN]) {
          for (const call of [0, CALL_DAWN]) {
            for (const flags of [0, RESULT, GUN_EV, CV_EVENT]) {
              for (const ev of [CONVOY_EV_SUNK, CONVOY_EV_ARRIVED]) {
                const l = line2(t01(p, c, over), call, flags, ev);
                expect(l, JSON.stringify([p, c, call, flags])).not.toContain('帰投');
                n++;
              }
            }
          }
        }
      }
    }
    expect(n).toBe(3 * 12 * 2 * 2 * 4 * 2);
    expect(line2(t01(BREAK), CALL_FUEL, 0)).toBe('米PT 離脱 ・ 次の赤い線に備えよ'); // 接触の行が上（呼びかけは決着の後だけ上。ux-4）
    expect(line2(t01(), CALL_FUEL, 0)).toBe('燃料少 帰投せよ  2000 m');
    expect(line2(t01(GONE, DONE), 0, 0)).toContain('帰投せよ');
    expect(line2(t01({ gunEvent: PT_GUN_EV_HULL, alive: 1, fighting: 0 }, DONE), 0, GUN_EV)).toContain('帰投せよ');
  });
});

describe('ux-3・ux-4: 標的の大発を失った赤い線の行・決着の後の呼びかけ', () => {
  it('ux-3: 航過中に標的の大発が沈んだ・上陸した（passTargetLost）なら赤い線の行を降ろし、沈没の出来事がすぐ出る（線の下で待たない）。jp_05 は false のまま', () => {
    const lost = t01({ ...PASS_BARGE, fired: true, passTargetLost: true }, { afloat: 2, sunk: 1 });
    expect(missionMode(lost, 0, CV_EVENT)).toBe(MISSION_CONVOY_EVENT);
    expect(missionMode(t01({ ...PASS_BARGE, fired: true }, { afloat: 2, sunk: 1 }), 0, CV_EVENT)).toBe(MISSION_PT_PASS);
    const clk = new PtLineClock();
    clk.flags(t01({ ...PASS_BARGE, fired: true }), 500, -1);
    expect(missionMode(lost, 0, clk.flags(lost, 1000, MISSION_PT_PASS))).toBe(MISSION_CONVOY_EVENT);
    // 時計も標的を失った航過を「赤い線に隠れている」と見ない（shown の前でも CONVOY_EVENT_SHOW_MS で終わる。mission-mode と同じ条件）
    expect(clk.flags(lost, 2000, MISSION_CONVOY_EVENT) & CV_EVENT).toBe(CV_EVENT);
    expect(clk.flags(lost, 1000 + CONVOY_EVENT_SHOW_MS - 100, MISSION_CONVOY_EVENT) & CV_EVENT).toBe(CV_EVENT);
    expect(clk.flags(lost, 1000 + CONVOY_EVENT_SHOW_MS + 100, MISSION_CONVOY_EVENT) & CV_EVENT).toBe(0);
    expect(tele().pt.passTargetLost).toBe(false);
    // テレメトリ: 航過中（owner ≥ 0）で今の標的の大発が valid でない
    const { t, q, w } = targetsWorld();
    const tel = initPtTelemetry(w);
    q.owner = 0;
    t.set.current = 1;
    refreshPtTelemetry(tel, w);
    expect(tel.passTargetLost).toBe(false);
    t.hulls[1]!.valid = false;
    refreshPtTelemetry(tel, w);
    expect(tel.passTargetLost).toBe(true);
    q.owner = -1;
    refreshPtTelemetry(tel, w);
    expect(tel.passTargetLost).toBe(false);
  });
  it('ux-4: 決着の後（呼びかけあり）は離脱・突撃・追撃の行より呼びかけ。赤い線・結果・射撃は上のまま。決着の前と jp_05 は接触の行', () => {
    for (const p of [BREAK, { ...BREAK, threatPhase: PT_RUN_IN }, { ...BREAK, threatPhase: PT_CHASE }]) {
      expect(missionMode(t01(p, DONE), CALL_SUNK, 0)).toBe(MISSION_CALL);
      expect(missionMode(t01(p), CALL_DAWN, 0)).toBe(MISSION_PT_CONTACT);
      expect(missionMode(tele(p), CALL_SUNK, 0)).toBe(MISSION_PT_CONTACT);
    }
    expect(missionMode(t01(BREAK, DONE), 0, 0)).toBe(MISSION_PT_CONTACT);
    expect(missionMode(t01(PASS_BARGE, DONE), CALL_SUNK, 0)).toBe(MISSION_PT_PASS);
    expect(missionMode(t01(BREAK, DONE), CALL_SUNK, RESULT)).toBe(MISSION_PT_CONTACT);
    expect(missionMode(t01({ ...BREAK, gunEnabled: true, gunStatus: GUN_FIRING }, DONE), CALL_SUNK, 0)).toBe(MISSION_PT_GUN);
    expect(line2(t01(BREAK, DONE), CALL_SUNK, 0)).toBe('大発 上陸 2/3 ・ 帰投せよ  2000 m');
  });
});

/** Phaser 無しの輸送隊と標的スロット（tests/pt-target-world と同じ口）。PT1 は去っている */
function targetsWorld(): { t: PtTargets; q: ReturnType<typeof createPtSection>; state: ConvoyState; player: BoatState; w: Parameters<typeof initPtTelemetry>[0] } {
  const CV = S.convoy!;
  const PT = S.ptBoats!;
  const state = createConvoy(CV.params);
  const convoy: PtTargetConvoy = {
    state, p: CV.params, rule: CV.rule, detectM: enemyDetectRangeM(PT.baseDetectM, speedFactorForBand(CV.detectBand, S.vis.speedFactor), S.vis, false),
    hit: (i, dmg, now) => hitConvoyBarge(state, i, dmg, now, { onArrived: () => {}, onSunk: () => {} }),
  };
  const player: BoatState = { ...S.playerStart, speedMps: 0 };
  const q = createPtSection(PT, 24);
  const t = new PtTargets(player, S.boatHalfLengthM, S.boatHalfBeamM, convoy, q);
  Object.assign(q.boats[1]!, { phase: PT_LEAVE });
  const base = ptWorld();
  return { t, q, state, player, w: { ...base, boat: { state: player }, pts: { ...base.pts, section: q, p: PT, targets: t } } };
}

describe('ux-2・ux-5・ux-7: 標的スロットの HUD の読み（systems/pt-target）', () => {
  it('ux-2 playerSeen: 隊が捉えていて標的が自艇か、戦う PT が自艇の見つかる距離（閃光の記憶込み）の内。大発だけが見つかっている間は偽。配線は mission-telemetry の 1 行', () => {
    const { t, q, state, player } = targetsWorld();
    const b0 = state.barges[0]!;
    Object.assign(q.boats[0]!, { x: b0.x + 300, y: b0.y, phase: PT_RUN_IN });
    player.x = b0.x + 300 + 2239;
    player.y = b0.y;
    t.begin(600, true);
    t.apply(q, { boat: player, boatHalfLengthM: 1, boatHalfBeamM: 1, detectOpenM: 0, smokeFactor: 1, smoke: null, smokeParams: null, targetValid: true, visRange2: 0, dawn: false, timeS: 10, targets: t.hulls }, 0, 10);
    expect(t.set.current).toBe(1);
    expect(t.playerSeen()).toBe(false); // まだ捉えていない
    q.detected = true;
    expect(t.playerSeen()).toBe(false); // 大発だけ（自艇は 2,239 m 先）
    player.x = b0.x + 300 + 590;
    expect(t.playerSeen()).toBe(true); // 静音 600 m の内
    player.x = b0.x + 300 + 900;
    expect(t.playerSeen()).toBe(false);
    t.apply(q, { boat: player, boatHalfLengthM: 1, boatHalfBeamM: 1, detectOpenM: 0, smokeFactor: 1, smoke: null, smokeParams: null, targetValid: true, visRange2: 0, dawn: false, timeS: 10.1, targets: t.hulls }, 1200, 10.1);
    expect(t.playerSeen()).toBe(true); // 25mm の閃光の記憶 1,200 m
    t.hulls[0]!.valid = false;
    expect(t.playerSeen()).toBe(false); // 輪の中・沈み始めは見つからない
    t.set.current = 0;
    expect(t.playerSeen()).toBe(true); // 標的が自艇なら隊の detected のまま（前と同じ）
    // 標的の大発が沈んで自艇へ替わった（受け継いだ接触）: 自艇が見つかる距離の外なら偽、内なら真
    t.set.current = 1;
    t.hulls[0]!.valid = true;
    for (const b of state.barges) b.phase = CV_SUNK; // 最後の大発（none の夜の 3 隻目）
    player.x = b0.x + 300 + 1966;
    t.begin(600, true);
    t.apply(q, { boat: player, boatHalfLengthM: 1, boatHalfBeamM: 1, detectOpenM: 0, smokeFactor: 1, smoke: null, smokeParams: null, targetValid: true, visRange2: 0, dawn: false, timeS: 20, targets: t.hulls }, 0, 20);
    expect([t.set.current, q.detected, t.playerSeen()]).toEqual([0, true, false]);
    player.x = b0.x + 300 + 590;
    expect(t.playerSeen()).toBe(true);
    q.boats[0]!.phase = PT_LEAVE;
    t.set.current = 1;
    t.hulls[0]!.valid = true;
    expect(t.playerSeen()).toBe(false); // 戦う PT がいない
    expect(readFileSync('src/systems/mission-telemetry.ts', 'utf8')).toContain('t.playerDetected = w.pts?.targets ? w.pts.targets.playerSeen() : w.enemy.detected;');
  });
  it('ux-5 aimedBarge: 捉えているか攻撃中で、標的が航行中の大発なら その index、ほかは −1（自艇・哨戒・沈没・上陸）。配線は mission-world の 1 行', () => {
    const { t, q, state } = targetsWorld();
    t.set.current = 2;
    expect(t.aimedBarge).toBe(-1);
    q.detected = true;
    expect(t.aimedBarge).toBe(1);
    q.detected = false;
    q.owner = 0;
    expect(t.aimedBarge).toBe(1);
    state.barges[1]!.phase = CV_ARRIVED;
    t.begin(600, true);
    expect(t.aimedBarge).toBe(-1);
    state.barges[1]!.phase = CV_SUNK;
    t.set.current = 0;
    expect(t.aimedBarge).toBe(-1);
    expect(readFileSync('src/systems/mission-world.ts', 'utf8')).toContain('this.convoy?.updateVisuals(this.boat.state, this.visRange2, this.pts?.targets ? this.pts.targets.aimedBarge : -1);');
  });
  it('ux-7: 撃たずに終わった大発への航過の PT が 25mm で黙っていれば「大発を守った！ 撃たせなかった」（接触のキーの bit 29）。黙っていなければ「撃たず」、自艇への航過と jp_05 は前のまま', () => {
    const { t, q } = targetsWorld();
    t.set.current = 1;
    t.onCommit(0);
    q.boats[0]!.fate = PT_FATE_HULL;
    t.onPassEnd(false);
    expect(t.lastPassSilenced).toBe(true);
    t.onCommit(0);
    t.onPassEnd(true);
    expect(t.lastPassSilenced).toBe(false); // 撃ってから黙った航過は命中か無傷の文
    q.boats[0]!.fate = PT_FATE_SUNK;
    t.onCommit(0);
    t.dropAttack(0, false); // 25mm で沈んだ（PtSquadron の onFate）
    expect(t.lastPassSilenced).toBe(true);
    const r: Partial<PtTelemetry> = { ...BREAK, passes: 2, maxPasses: 8, lastPassFired: false, lastPassHits: 0, lastPassTargetKind: 1 };
    expect(row(t01({ ...r, lastPassSilenced: true }), 0, RESULT)).toEqual([MISSION_PT_CONTACT, '大発を守った！ 撃たせなかった ・ 航過 2/8', HOME_COLOR_TEXT]);
    expect(row(t01(r), 0, RESULT)).toEqual([MISSION_PT_CONTACT, '大発への航過 撃たず ・ 航過 2/8', HUD_COLOR_STRONG]);
    expect(keyOf(t01({ ...r, lastPassSilenced: true }), 0, RESULT) - keyOf(t01(r), 0, RESULT)).toBe(1 << 29);
    expect(row(t01({ ...r, lastPassTargetKind: 0, lastPassSilenced: true }), 0, RESULT)[1]).toBe('撃たせなかった！ ・ 航過 2/8');
    expect(keyOf(t01({ ...r, lastPassTargetKind: 0, lastPassSilenced: true }), 0, RESULT)).toBe(keyOf(t01({ ...r, lastPassTargetKind: 0 }), 0, RESULT));
    expect(tele().pt.lastPassSilenced).toBe(false);
    expect(textWidthPx(row(t01({ ...r, passes: 15, maxPasses: 15, lastPassSilenced: true }), 0, RESULT)[1], 22)).toBeLessThanOrEqual(LINE2_MAX_PX);
  });
});

describe('ux-6・ux-9: Briefing の帰投地点の方角・Result の航行中', () => {
  it('ux-6: jp_01 の帰投地点は自艇の出発点から「東」（中心からは南東）。輸送隊の無い任務は鍵ごと無い（文は前のまま）', () => {
    expect(briefingNumbers(S).homeFromJa).toBe('東');
    for (const id of ['us_01', 'us_02', 'us_03', 'jp_05', 'jp_06']) expect('homeFromJa' in briefingNumbers(buildWorldSetup(gameData, id)), id).toBe(false);
  });
  it('ux-9: 航行中の大発が残って終わった夜は 1 行目の後ろに「航行中 N」。みな決着していれば前のまま。24 px で画面の幅の内', () => {
    expect(convoyResultLine({ total: 3, arrived: 1, sunk: 0, quota: 2, hitsTaken: 4 })).toBe('大発 上陸 1/3 ・ 沈没 0（ノルマ 2） ・ 大発の被弾 4 発 ・ 航行中 2');
    expect(convoyResultLine({ total: 3, arrived: 0, sunk: 0, quota: 2, hitsTaken: 0 })).toBe('大発 上陸 0/3 ・ 沈没 0（ノルマ 2） ・ 大発の被弾 0 発 ・ 航行中 3');
    expect(convoyResultLine({ total: 3, arrived: 2, sunk: 1, quota: 2, hitsTaken: 9 })).toBe('大発 上陸 2/3 ・ 沈没 1（ノルマ 2） ・ 大発の被弾 9 発');
    expect(textWidthPx(convoyResultLine({ total: 3, arrived: 0, sunk: 1, quota: 2, hitsTaken: 99 }), 24)).toBeLessThanOrEqual(1280 - 2 * 24);
  });
});
