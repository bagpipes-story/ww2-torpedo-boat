// jp_05「鹵獲艇の哨戒」（v0.6.3。日本ハードモード②：敵の米PT）: 任務の data・世界の組み立て・今夜の揺らぎ・Briefing の行・終了理由・得点の順、
// HUD の 2 行目（ui/mission-mode の 3 つのモードと ui/pt-lines の文・キー。幅は 840 px 以内＝縮まない）、テレメトリ（systems/pt-telemetry）、Result の本文と頭。
// ui-config・game-config は DOM を読むので使わない（色は hud-text-config、文の幅は tests/dawn-clock と同じ見積もり）。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { gameData, getPrototypeMission, getScoringParams } from '../src/config/game-data';
import { HOME_COLOR_TEXT, HUD_COLOR_STRONG, HUD_COLOR_WARN } from '../src/config/hud-text-config';
import { PT_SHELL_POOL_SIZE } from '../src/config/pt-config';
import type { BoatState, BoatTelemetry } from '../src/core/boat-motion';
import { createDawnTelemetry } from '../src/core/dawn-air';
import { CALL_DAWN, CALL_FUEL } from '../src/core/mission-flow';
import { PT_ALERT, PT_BREAK, PT_PASS, PT_PATROL, PT_RUN_IN, createPtSection, createPtTelemetry, type PtTelemetry } from '../src/core/pt-boats';
import { initPtTelemetry, ptResult, refreshPtTelemetry, type PtTelemetryWorld } from '../src/systems/pt-telemetry';
import { MISSION_ADRIFT, MISSION_CALL, MISSION_NORMAL, MISSION_PT, MISSION_PT_CONTACT, MISSION_PT_PASS, MODE_FLAG_PT_RESULT, missionMode } from '../src/ui/mission-mode';
import { PT_DISTANCE_STEP_M, ptHeadJa, ptKey, ptLine, ptResultLines } from '../src/ui/pt-lines';
import type { PtResult } from '../src/ui/result-types';
import { enemyNameJa, getBriefingRecord, riskLabelJa } from '../src/config/briefing-data';
import { playableMissionIds } from '../src/config/campaign-data';
import { getDawnAir } from '../src/config/dawn-data';
import { NO_WEAPON_BRIEFING_JA, briefingRows } from '../src/core/briefing';
import { endCountsAsReturn } from '../src/core/mission-flow';
import { SeededRng } from '../src/core/rng';
import { computeScore, type ScoreInput } from '../src/core/scoring';
import { directSortie } from '../src/core/sortie';
import { briefingNumbers, buildWorldSetup } from '../src/systems/world-setup';
import { REASON_LABEL, resultHeadingJa } from '../src/ui/result-heading';

type Rec = Record<string, unknown>;
const byId = (id: string): Rec => (gameData.missionsSeed.missions as unknown as Rec[]).find((m) => m['id'] === id)!;
const protoOf = (id: string): Rec => byId(id)['v0_1_prototype'] as Rec;
const nameOf = (e: string): string => enemyNameJa(gameData, e);
const labelOf = (h: string): string => riskLabelJa(gameData, h);
const sortie = (seed: number): ReturnType<typeof directSortie> => directSortie('jp_05', seed, 'none', false, false);

describe('jp_05 の任務と世界（v0.6.3）', () => {
  afterEach(() => vi.restoreAllMocks());
  it('任務: T-14・主兵装 none・米PT 2 隻の隊（駆逐艦・大発なし）・新月・夜明け 170 秒・燃料 23 gal・浅瀬なし。危険は米PT の掃射だけ', () => {
    const m = getPrototypeMission(gameData, 'jp_05');
    expect([m.playerBoatId, m.mainWeapon, m.enemyId, m.enemyCount, m.moon, m.durationS, m.fuelAllotmentGal]).toEqual(['jp_t14', 'none', 'us_pt_enemy', 2, 'dark', 170, 23]);
    expect(m.ptBoats).not.toBeNull();
    expect([m.enemyStart, m.enemyStarts, m.barges, m.escort, m.transport, m.dawnStrike, m.storm, m.enemyAircraft]).toEqual([null, [], null, null, null, null, null, null]);
    expect(m.shallows).toEqual([]);
    expect(m.hazards).toEqual(['enemy_ship_gunfire_or_ram']);
    expect(m.playerStart).toEqual({ x: 4300, y: 600, headingDeg: 225 });
    expect([m.returnPoint.x, m.returnPoint.y, m.returnPoint.radiusM, m.returnPoint.callMargin, m.returnPoint.torpedoEndSettleS]).toEqual([1700, 3200, 250, 1.5, 5]);
    expect(m.bounds).toEqual({ width: 6000, height: 4000 });
  });
  it('世界: 魚雷 0 本・発見の基準 2,000 m（停止で 480 m）・敵の来る位置は 1 隻目の PT・夜明けの空襲なし・駆逐艦／大発／砲なし・煙幕なし', () => {
    const s = buildWorldSetup(gameData, 'jp_05');
    expect([s.mainWeapon, s.torpedoCapacity, s.baseDetectM, s.durationS, s.fuelAllotmentGal]).toEqual(['none', 0, 2000, 170, 23]);
    expect(s.detectRangeAtStartM).toBeCloseTo(480, 9);
    expect(s.enemyFrom).toEqual({ x: 2000, y: 2000 });
    expect([s.airStrike, s.destroyer, s.barges, s.guns, s.escort, s.transport, s.smokeParams, s.seaplane, s.storm]).toEqual([null, null, null, null, null, null, null, null, null]);
    expect(s.ptBoats!.count).toBe(2);
    expect(s.dawnAir.playAs).toBe('own');
    expect(s.dawnAir.shipsAtDawn).toBe('none');
    expect(s.boatParams.silentMaxMps).toBeGreaterThan(s.boatParams.speedSilentMps); // 静音の帯は 14 kt まで
  });
  it('米PT は jp_05 だけ: 他の遊べる任務の世界に ptBoats は無い（null）', () => {
    const ids = [...playableMissionIds(gameData, 'us_pt'), ...playableMissionIds(gameData, 'jp_hard')];
    expect(ids).toContain('jp_05');
    for (const id of ids) {
      for (const hard of [false, true]) {
        const s = buildWorldSetup(gameData, id, { hard });
        expect(s.ptBoats === null, `${id} ${hard}`).toBe(id !== 'jp_05');
        expect(s.mission.ptBoats === null, `${id} ${hard}`).toBe(id !== 'jp_05');
      }
    }
  });
  it('今夜（seed+16）: 引くのは 5 回（隊 3・大発の先頭 1・反転 1）。同じ seed なら同じ夜。どの夜も出発点は自艇から巡航で見つかる 1,200 m より遠い。反転した夜は西へ哨戒', () => {
    const spy = vi.spyOn(SeededRng.prototype, 'next');
    buildWorldSetup(gameData, 'jp_05', { sortie: sortie(1) });
    expect(spy.mock.calls.length).toBe(5);
    spy.mockRestore();
    const a = buildWorldSetup(gameData, 'jp_05', { sortie: sortie(42) });
    const b = buildWorldSetup(gameData, 'jp_05', { sortie: sortie(42) });
    expect([...a.ptBoats!.startX, ...a.ptBoats!.startY]).toEqual([...b.ptBoats!.startX, ...b.ptBoats!.startY]);
    let mirrored = 0;
    let minM = Infinity;
    for (let seed = 1; seed <= 300; seed++) {
      const s = buildWorldSetup(gameData, 'jp_05', { sortie: sortie(seed) });
      const p = s.ptBoats!;
      for (let i = 0; i < p.count; i++) {
        minM = Math.min(minM, Math.hypot(p.startX[i]! - s.playerStart.x, p.startY[i]! - s.playerStart.y));
        expect(p.startHeadingDeg[i], `${seed}`).toBe(s.night.mirrored ? 270 : 90);
        expect(p.startX[i]! >= 1200 && p.startX[i]! <= 4800, `${seed}`).toBe(true);
      }
      expect(p.startY[1]! - p.startY[0]!).toBeCloseTo(200, 9); // 2 隻は 200 m 離れて並ぶ
      if (s.night.mirrored) mirrored++;
    }
    expect(minM).toBeGreaterThanOrEqual(1200);
    expect(mirrored).toBeGreaterThan(100);
    expect(mirrored).toBeLessThan(200);
    // ?debug&fixed と Briefing（出撃前）は data のまま
    expect(buildWorldSetup(gameData, 'jp_05', { sortie: sortie(1), fixedNight: true }).enemyFrom).toEqual({ x: 2000, y: 2000 });
  });
  it('Briefing の 6 行（spec §B.9。出撃前は揺らぎなし＝敵は西から）。反転した夜は東から', () => {
    const s = buildWorldSetup(gameData, 'jp_05');
    const rec = { ...getBriefingRecord(gameData, 'jp_05'), hazardIds: s.hazardsTonight, absentHazardIds: s.absentHazards };
    const rows = briefingRows(rec, briefingNumbers(s), nameOf, labelOf);
    expect(rows.map((r) => [r.label, r.text])).toEqual([
      ['目的', '哨戒の帰り道に米PTの 2 隻組。速さでは振り切れない。静音で暗さに隠れ、航過は転舵でかわしてラバウルへ帰る'],
      ['成功', '生還（PT に一度も見つからずに帰れば回避の点）（帰投地点は南西の青い輪）'],
      ['月', '新月 ・ 見える 900 m ・ 見つかる 巡航 1200 m／静音 600 m'],
      ['敵', '米PTボート ×2（西から）'],
      ['危険', '敵艦艇の砲撃・衝突'],
      ['条件', `夜明けまで 170 秒（昼の空は味方） ・ 燃料 23 gal ・ ${NO_WEAPON_BRIEFING_JA}`],
    ]);
    expect(NO_WEAPON_BRIEFING_JA).toBe('魚雷は PT の下を抜ける（撃たない）');
    expect(briefingNumbers(s).weaponJa).toBe(NO_WEAPON_BRIEFING_JA);
    // 他の任務は鍵ごと無い（us_02 の toEqual が変わらない）
    expect('weaponJa' in briefingNumbers(buildWorldSetup(gameData, 'us_02'))).toBe(false);
    const dirs = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const t = buildWorldSetup(gameData, 'jp_05', { sortie: sortie(seed) });
      const d = briefingNumbers(t).enemyFromJa;
      dirs.add(d);
      if (t.night.mirrored && t.ptBoats!.startX[0]! > 3600) expect(d, `${seed}`).toBe('東');
    }
    expect([...dirs].sort()).toEqual(['中央', '東', '西'].sort());
  });
  it('史実: 1944-02-18 ラバウル沖・ゲーム上の想定（艇は T-14 で代用）。人物名なし。dawn_air は争奪で、遊び方は味方の空（夜明けに敵機は来ない）・米PT は夜明けに去る', () => {
    const r = getBriefingRecord(gameData, 'jp_05');
    expect([r.date, r.place, r.titleJa]).toEqual(['1944-02-18', 'ラバウル沖（セント・ジョージ海峡）', '鹵獲艇の哨戒']);
    expect(r.noteJa).toContain('ゲーム上の想定');
    expect(r.noteJa).toContain('T-14 で代用');
    expect(String(byId('jp_05')['historical_note'])).toContain('抜粋のみ・本文未読');
    expect(byId('jp_05')['playable_from']).toBe('v0.6.3');
    expect(byId('jp_01')['playable_from']).toBe('v0.6.4');
    const a = getDawnAir(gameData, 'jp_05');
    expect([a.control, a.playAs, a.shipsAtDawn, a.labelJa]).toEqual(['contested', 'own', 'none', '昼の空はおおむね味方（ラバウルの零戦）']);
    expect(a.refs.length).toBe(3);
    // 終わり際の魚雷待ちの理由は jp_06 の文をそのまま（jp_05 は魚雷を撃たないので効かない）
    const src = String((protoOf('jp_05')['return_point'] as Rec)['torpedo_end_settle_s_source']);
    expect(src).toBe(`${String((protoOf('jp_06')['return_point'] as Rec)['torpedo_end_settle_s_source'])}（jp_05 は魚雷を撃たないので効かない）`);
    for (const k of ['main_weapon_source', 'duration_s_source', 'fuel_allotment_gal_source', 'hazards_source']) expect(String(protoOf('jp_05')[k]), k).toContain('design (v0.6.3');
  });
});

describe('jp_05 の終わりと得点（v0.6.3）', () => {
  it('米PT の掃射で沈没は pt_fire（「任務終了 — PTの掃射で沈没」）。帰投と同じには数えない', () => {
    expect(REASON_LABEL.pt_fire).toBe('PTの掃射で沈没');
    expect(resultHeadingJa('pt_fire', NaN, false, false)).toBe('任務終了 — PTの掃射で沈没');
    expect(endCountsAsReturn('pt_fire')).toBe(false);
  });
  it('patrol_and_evade: 達成 300（帰投）・回避 300（一度も見つからず夜明け前）。見つからずに帰投 > 見つかって転舵でかわして帰投 > 夜明けまで隠れて帰投 > 沈没', () => {
    const sp = getScoringParams(gameData);
    expect([sp.objectiveByType['patrol_and_evade'], sp.evadeByType['patrol_and_evade']]).toEqual([300, 300]);
    const base: ScoreInput = { returned: true, objectiveDone: true, missionType: 'patrol_and_evade', bands: [], kills: 0, killEnemyId: '', fuelLeftPct: 60, detections: 0, crewAlive: 7, crewTotal: 7 };
    const unseen = computeScore(base, sp).total;
    const dodged = computeScore({ ...base, detections: 1, fuelLeftPct: 43, crewAlive: 6 }, sp).total;
    const hidUntilDawn = computeScore({ ...base, afterDawn: true, fuelLeftPct: 43 }, sp).total;
    const sunk = computeScore({ ...base, returned: false, objectiveDone: false, detections: 2, crewAlive: 2 }, sp).total;
    expect([unseen, dodged, hidUntilDawn, sunk]).toEqual([1460, 1129, 1073, 0]);
  });
});

/** HUD の文の幅の見積もり px（Menlo の半角 0.602 em・全角 1 em。tests/dawn-clock と同じ） */
function textWidthPx(str: string, px: number): number {
  let w = 0;
  for (const ch of str) w += (ch.charCodeAt(0) < 0x2000 ? 0.602 : 1) * px;
  return w;
}
/** 2 行目（22 px）が縮まない幅: 論理幅 1280 − 左右の時計の避け 220（HUD_MARGIN 24 + 時計 184 + 隙間 12） */
const LINE2_MAX_PX = 1280 - 2 * 220;

const S05 = buildWorldSetup(gameData, 'jp_05');
/** 米PT の隊と自艇（出発点）だけの世界（systems/pt-telemetry が読む部分） */
function ptWorld(): PtTelemetryWorld & { boat: { state: BoatState } } {
  const p = S05.ptBoats!;
  return { pts: { section: createPtSection(p, PT_SHELL_POOL_SIZE), p, firstDetectBand: '' }, boat: { state: { ...S05.playerStart, speedMps: 0 } }, params: S05.boatParams, visRange2: S05.visRange2 };
}
const PT0 = initPtTelemetry(ptWorld());

/** 2 行目の優先順と文が読む項目だけの中立のテレメトリ（tests/dawn-lines と同じ形）に、jp_05 の出撃時の米PT（initPtTelemetry）を重ねる */
function tele(pt: Partial<PtTelemetry> = {}, over: Partial<BoatTelemetry> = {}): BoatTelemetry {
  return {
    timeLeftS: 100, homeWaiting: false, fuelEmpty: false, escortEnabled: false, escortSunk: false, escortDistM: 0, escortLagWarnM: 400,
    planePhase: 0, planeLocked: false, planeOutcome: 0, planeDx: NaN, planeDy: NaN, friendlyPhase: 0, friendlyOutcome: 0,
    shallowState: 0, shallowAheadM: 0, shallowSafeKt: 10, gunMission: false, gunStatus: 0, bargesSunk: 0, bargesBeached: 0, bargesTotal: 0, bargeEscapeS: NaN,
    enemySighted: false, batteryInArc: false, batteryAlerted: false, stormState: 0, stormFast: false, stormSafeKt: 12,
    targetStep: 'silent', detectRangeM: 600,
    ...over,
    dawn: { ...createDawnTelemetry(), ...(over.dawn ?? {}) },
    pt: { ...PT0, ...pt },
  } as BoatTelemetry;
}

/** モード・文・色（call は topCall の値、flags は MODE_FLAG_*） */
function row(t: BoatTelemetry, call = 0, flags = 0): [number, string, string] {
  const mode = missionMode(t, call, flags);
  if (mode !== MISSION_PT_PASS && mode !== MISSION_PT_CONTACT && mode !== MISSION_PT) return [mode, '', ''];
  const l = ptLine(t, mode, ptKey(t, mode, flags));
  return [mode, l.text, l.color];
}

const RESULT = MODE_FLAG_PT_RESULT;
/** 脅威の PT が艇から北東 500 m（300, −400） */
const NE500 = { dx: 300, dy: -400 };

describe('jp_05 の HUD の 2 行目（v0.6.3。spec §D.1）', () => {
  it('出撃時のテレメトリ: 2 隻・航過の上限 4（2 隻 × 2 回）・1 発 HP 4・静音の上限 14 kt・去る方角は東。PT は哨戒で見えていない（出発点から 1,200 m より遠い）', () => {
    expect([PT0.enabled, PT0.total, PT0.alive, PT0.maxPasses, PT0.damagePerHit, PT0.silentMaxKt, PT0.leaveDirJa]).toEqual([true, 2, 2, 4, 4, 14, '東']);
    expect([PT0.detected, PT0.passing, PT0.threatPhase, PT0.sighted, PT0.passSeq]).toEqual([false, false, PT_PATROL, false, 0]);
    expect(Math.hypot(PT0.dx, PT0.dy)).toBeGreaterThan(1200);
    // 米PT の無い任務は enabled false のまま（平常の行は今までどおり）
    expect(initPtTelemetry({ ...ptWorld(), pts: null })).toEqual(createPtTelemetry());
    expect(missionMode({ ...tele(), pt: createPtTelemetry() }, 0, 0)).toBe(MISSION_NORMAL);
  });
  it('平常（見つかっていない）: 哨戒中の隻数、見えている PT は距離と方角（静音・停止）か「速い！」（巡航・全速）。距離は 50 m 刻みの切り上げ', () => {
    expect(row(tele())).toEqual([MISSION_PT, '米PT 2 隻が哨戒中 ・ 静音で抜けて帰投', HUD_COLOR_STRONG]);
    expect(row(tele({ ...NE500, sighted: true }))).toEqual([MISSION_PT, '米PT 500 m（北東） ・ 気づかれていない ・ 静音でやり過ごせ', HUD_COLOR_STRONG]);
    expect(row(tele({ dx: 0, dy: 501, sighted: true }, { targetStep: 'stop', detectRangeM: 480 }))[1]).toBe('米PT 550 m（南） ・ 気づかれていない ・ 静音でやり過ごせ');
    expect(row(tele({ ...NE500, sighted: true }, { targetStep: 'cruise', detectRangeM: 1200 }))).toEqual([MISSION_PT, '米PT 500 m ・ 速い！ 1200 m で見つかる ・ 14 kt 以下に', HUD_COLOR_WARN]);
    expect(row(tele({ ...NE500, sighted: true }, { targetStep: 'full', detectRangeM: 1920 }))[1]).toBe('米PT 500 m ・ 速い！ 1900 m で見つかる ・ 14 kt 以下に');
    expect(PT_DISTANCE_STEP_M).toBe(50);
  });
  it('接触: 突撃（見えている＝方角と距離・音だけ＝方角）、離脱（残りの航過）。航過の結果は表示中だけ（被弾なし＝味方の青・被弾＝HP）', () => {
    const det = { detected: true, ...NE500 };
    expect(row(tele({ ...det, threatPhase: PT_ALERT, sighted: true }))).toEqual([MISSION_PT_CONTACT, '米PT 北東から突撃 500 m ・ 赤い線で転舵', HUD_COLOR_WARN]);
    expect(row(tele({ detected: true, threatPhase: PT_RUN_IN, dx: 0, dy: 1000 }))).toEqual([MISSION_PT_CONTACT, '米PT のエンジン音 ・ 南から突撃', HUD_COLOR_WARN]);
    expect(row(tele({ ...det, threatPhase: PT_BREAK, passes: 1 }))).toEqual([MISSION_PT_CONTACT, '米PT 離脱 ・ 残り 3 回 ・ 静音で見失わせろ', HUD_COLOR_STRONG]);
    expect(row(tele({ ...det, threatPhase: PT_ALERT, passes: 1, passSeq: 1, lastPassHits: 0 }), 0, RESULT)).toEqual([MISSION_PT_CONTACT, 'かわした！ 被弾なし ・ 航過 1/4', HOME_COLOR_TEXT]);
    expect(row(tele({ ...det, threatPhase: PT_BREAK, passes: 2, passSeq: 2, lastPassHits: 3 }), 0, RESULT)).toEqual([MISSION_PT_CONTACT, '被弾 3 発（HP −12） ・ 航過 2/4', HUD_COLOR_STRONG]);
    // 結果の表示は見失った後・夜明けに去った後も出る（表示の秒が終われば平常へ）
    expect(row(tele({ passes: 4, passSeq: 4, alive: 0, lastPassHits: 0 }), 0, RESULT)[0]).toBe(MISSION_PT_CONTACT);
    expect(row(tele({ passes: 4, passSeq: 4, alive: 0 }))).toEqual([MISSION_PT, '米PT は東へ去った ・ 帰投せよ', HUD_COLOR_STRONG]);
  });
  it('航過: 撃つ前は「航過！」、撃ち始めたら「掃射！」。かわす向きは固めたときの 1 つ（右・左・そのまま）', () => {
    const pass = { detected: true, passing: true, threatPhase: PT_PASS, ...NE500, sighted: true };
    expect(row(tele({ ...pass, dodge: 1 }))).toEqual([MISSION_PT_PASS, 'PT 航過！ 右へ転舵・全速', HUD_COLOR_WARN]);
    expect(row(tele({ ...pass, dodge: -1 }))[1]).toBe('PT 航過！ 左へ転舵・全速');
    expect(row(tele({ ...pass, dodge: 0 }))[1]).toBe('PT 航過！ そのまま全速で離れろ');
    expect(row(tele({ ...pass, dodge: 1, fired: true }))[1]).toBe('PT 掃射！ 右へ転舵・全速');
    expect(row(tele({ ...pass, dodge: -1, fired: true }))[1]).toBe('PT 掃射！ 左へ転舵・全速');
    expect(row(tele({ ...pass, dodge: 0, fired: true }))[1]).toBe('PT 掃射！ そのまま全速で離れろ');
    // 航過は結果の表示より上、燃料切れ（漂流）は航過より上
    expect(row(tele({ ...pass, dodge: 1 }), 0, RESULT)[0]).toBe(MISSION_PT_PASS);
    expect(row(tele({ ...pass, dodge: 1 }, { fuelEmpty: true }))[0]).toBe(MISSION_ADRIFT);
  });
  it('帰投せよ（燃料・夜明け近し）は平常の米PT の行より上。夜明けの後に米PT がみな去っていれば「夜明け ・ 米PT は東へ去った」', () => {
    expect(row(tele(), CALL_DAWN)[0]).toBe(MISSION_CALL);
    expect(row(tele({ alive: 0 }), CALL_DAWN)[0]).toBe(MISSION_CALL); // 夜明け前の「夜明け近し」は消さない
    const dawn = { ...createDawnTelemetry(), reached: true };
    expect(row(tele({ alive: 0, leftAtDawn: true }, { dawn }), CALL_DAWN)).toEqual([MISSION_PT, '夜明け ・ 米PT は東へ去った ・ 帰投せよ', HUD_COLOR_STRONG]);
    expect(row(tele({ alive: 0, leftAtDawn: true }, { dawn }), CALL_FUEL)[0]).toBe(MISSION_CALL); // 燃料の帰投せよは残す
    // 接触中（見つかっている）は帰投せよより上
    expect(row(tele({ detected: true, threatPhase: PT_RUN_IN, ...NE500 }), CALL_DAWN)[0]).toBe(MISSION_PT_CONTACT);
  });
  it('キー: 表示が変わるときだけ変わる（同じ 50 m の刻みの中・行に出ない値では変わらない）', () => {
    const k = (t: BoatTelemetry, flags = 0): number => ptKey(t, missionMode(t, 0, flags), flags);
    const seen = { ...NE500, sighted: true };
    expect(k(tele(seen))).toBe(k(tele({ dx: 301, dy: -399, sighted: true })));
    expect(k(tele(seen))).not.toBe(k(tele({ dx: 330, dy: -400, sighted: true })));
    expect(k(tele())).toBe(k(tele({ dx: 100, dy: 2000 }))); // 見えていない PT の位置は出さない
    expect(k(tele({ ...seen, passing: true, detected: true, dodge: 1 }))).not.toBe(k(tele({ ...seen, passing: true, detected: true, dodge: 1, fired: true })));
    expect(k(tele({ detected: true, threatPhase: PT_BREAK, passes: 1 }))).not.toBe(k(tele({ detected: true, threatPhase: PT_BREAK, passes: 2 })));
    expect(k(tele({ detected: true, passes: 1, lastPassHits: 1 }), RESULT)).not.toBe(k(tele({ detected: true, passes: 1, lastPassHits: 2 }), RESULT));
    for (const t of [tele(), tele({ ...seen, passing: true, detected: true }), tele({ alive: 0 }, { dawn: { ...createDawnTelemetry(), reached: true } })]) {
      const key = k(t);
      expect(Number.isInteger(key) && key >= 0 && key < 2 ** 31).toBe(true);
    }
  });
  it('どの文もいちばん長い値で 840 px 以内（論理幅 1280 で左上の時計を避けても縮まない）', () => {
    const far = { dx: -2200, dy: -2200 }; // 北西・刻みの上限（3,150 m）
    const det = { detected: true, ...far, passes: 15, maxPasses: 15, lastPassHits: 63, damagePerHit: 4 };
    const cases: [Partial<PtTelemetry>, Partial<BoatTelemetry>, number][] = [
      [{ ...det, passing: true, fired: true, dodge: 0 }, {}, 0],
      [{ ...det, passing: true, dodge: 1 }, {}, 0],
      [det, {}, RESULT],
      [{ ...det, lastPassHits: 0 }, {}, RESULT],
      [{ ...det, threatPhase: PT_RUN_IN, sighted: true }, {}, 0],
      [{ ...det, threatPhase: PT_RUN_IN }, {}, 0],
      [{ ...det, threatPhase: PT_BREAK, passes: 0 }, {}, 0],
      [{ ...far, sighted: true }, { targetStep: 'silent' }, 0],
      [{ ...far, sighted: true }, { targetStep: 'full', detectRangeM: 3150 }, 0],
      [{ alive: 4 }, {}, 0],
      [{ alive: 0 }, { dawn: { ...createDawnTelemetry(), reached: true } }, 0],
    ];
    for (const [pt, over, flags] of cases) {
      const [, text] = row(tele(pt, over), 0, flags);
      expect(text, JSON.stringify(pt)).not.toBe('');
      expect(textWidthPx(text, 22), text).toBeLessThanOrEqual(LINE2_MAX_PX);
    }
  });
});

describe('jp_05 のテレメトリ（systems/pt-telemetry。v0.6.3）', () => {
  it('脅威の PT（航過中が先）の相対位置・視程の内か・航過中の撃った／かわす向き・去った数。Result の材料は隊の KPI', () => {
    const w = ptWorld();
    const t = initPtTelemetry(w);
    const q = w.pts!.section;
    const b = w.boat.state;
    q.boats[1]!.x = b.x + 300;
    q.boats[1]!.y = b.y - 400;
    refreshPtTelemetry(t, w);
    expect([t.threatPhase, t.dx, t.dy, t.sighted]).toEqual([PT_PATROL, 300, -400, true]);
    q.boats[0]!.phase = PT_PASS;
    q.boats[0]!.firedThisPass = 2;
    q.owner = 0;
    q.dodge = -1;
    q.detected = true;
    refreshPtTelemetry(t, w);
    expect([t.passing, t.fired, t.dodge, t.detected, t.threatPhase, t.sighted]).toEqual([true, true, -1, true, PT_PASS, false]);
    q.boats[0]!.phase = 5; // 去る
    q.owner = -1;
    q.passes = 2;
    q.passSeq = 2;
    q.lastPassHits = 1;
    q.out = 0;
    refreshPtTelemetry(t, w);
    expect([t.alive, t.passing, t.fired, t.dodge, t.passes, t.passSeq, t.lastPassHits]).toEqual([1, false, false, 0, 2, 2, 1]);
    q.closest2 = 250000;
    q.firstDetectM = 1180;
    const r = ptResult(w)!;
    expect([r.total, r.maxPasses, r.passes, r.damagePerHit, r.closestM, r.firstDetectM, r.firstDetectBand]).toEqual([2, 4, 2, 4, 500, 1180, '']);
    expect(ptResult({ ...w, pts: null })).toBeNull();
  });
});

describe('jp_05 の Result（v0.6.3。spec §D.4）', () => {
  const base: PtResult = {
    total: 2, out: 2, leftAtDawn: false, passes: 0, maxPasses: 4, firedPasses: 0, cleanPasses: 0, shots: 0, hits: 0, damagePerHit: 4,
    firstDetectM: NaN, firstDetectBand: '', lostContacts: 0, closestM: 812.4, minWarnS: Infinity,
  };
  it('一度も見つからずに抜けた: 最接近と「—」（撃たれていない）', () => {
    expect(ptResultLines(base, 0)).toEqual(['米PT に一度も見つからずに抜けた', '見つからず ・ PT の最接近 812 m', '予告から初弾まで 最短 — 秒 ・ 撃たれた弾 0 発']);
    expect(ptHeadJa(base)).toBe('米PT: 去った（2/2）');
  });
  it('見つかって転舵でかわした: 航過・かわした（撃たれた航過のうち）・被弾と HP、最初の距離と速力帯・見失わせた回数、予告から初弾', () => {
    const r: PtResult = { ...base, passes: 4, firedPasses: 3, cleanPasses: 2, shots: 30, hits: 3, firstDetectM: 1199.6, firstDetectBand: 'cruise', lostContacts: 1, minWarnS: 2.52 };
    expect(ptResultLines(r, 1)).toEqual(['米PT 航過 4 回 ・ かわした 2/3 ・ 被弾 3 発（HP −12）', '見つかった 1 回（最初 1200 m ・ 巡航） ・ 見失わせた 1 回', '予告から初弾まで 最短 2.5 秒 ・ 撃たれた弾 30 発']);
  });
  it('沈んだ: PT は健在（去った数）。夜明けに去った夜は「夜明けに去った」', () => {
    const r: PtResult = { ...base, out: 0, passes: 2, firedPasses: 2, shots: 24, hits: 13, firstDetectM: 1200, firstDetectBand: 'cruise', minWarnS: 2.5 };
    expect(ptResultLines(r, 2)[0]).toBe('米PT 航過 2 回 ・ かわした 0/2 ・ 被弾 13 発（HP −52）');
    expect(ptHeadJa(r)).toBe('米PT: 健在（0/2 去った）');
    expect(ptHeadJa({ ...r, out: 1 })).toBe('米PT: 健在（1/2 去った）');
    expect(ptHeadJa({ ...r, leftAtDawn: true })).toBe('米PT: 夜明けに去った');
  });
});
