// jp_05「鹵獲艇の哨戒」（v0.6.3。日本ハードモード②：敵の米PT）: 任務の data・世界の組み立て・今夜の揺らぎ・Briefing の行・終了理由・得点の順。
// HUD の 2 行目と Result の本文は米PT の配線（pt-lines）の後で足す。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { gameData, getPrototypeMission, getScoringParams } from '../src/config/game-data';
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
