// jp_05「鹵獲艇の哨戒」（v0.6.3。日本ハードモード②：敵の米PT）: 任務の data・世界の組み立て・今夜の揺らぎ・Briefing の行・終了理由・得点の順、
// HUD の 2 行目（ui/mission-mode の米PT のモードと ui/pt-lines の文・キー。幅は 840 px 以内＝縮まない。13mm の行は tests/pt-gun-ui）、テレメトリ（systems/pt-telemetry）、Result の本文と頭、
// Title の日本の操作の一言（config/title-hint-config。魚雷のある jp_06 と 13mm 機銃の jp_05 のどちらでも本当・行の幅の内）。
// ui-config・game-config は DOM を読むので使わない（色は hud-text-config、文の幅は tests/dawn-clock と同じ見積もり）。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { gameData, getPrototypeMission, getScoringParams } from '../src/config/game-data';
import { HOME_COLOR_TEXT, HUD_COLOR_STRONG, HUD_COLOR_WARN } from '../src/config/hud-text-config';
import type { BoatTelemetry } from '../src/core/boat-motion';
import { createDawnTelemetry } from '../src/core/dawn-air';
import { CALL_DAWN, CALL_FUEL } from '../src/core/mission-flow';
import { PT_ALERT, PT_BREAK, PT_LEAVE, PT_PASS, PT_PATROL, PT_RUN_IN, createPtTelemetry, type PtTelemetry } from '../src/core/pt-boats';
import { initPtTelemetry, ptResult, refreshPtTelemetry } from '../src/systems/pt-telemetry';
import { MISSION_ADRIFT, MISSION_CALL, MISSION_NORMAL, MISSION_PT, MISSION_PT_CONTACT, MISSION_PT_PASS, MODE_FLAG_PT_RESULT, missionMode, ptResultShown } from '../src/ui/mission-mode';
import { TITLE_HINT_BY_CAMPAIGN_JA, TITLE_HINT_PX } from '../src/config/title-hint-config';
import { PT_DISTANCE_STEP_M, ptHeadJa, ptKey, ptResultLines } from '../src/ui/pt-lines';
import type { PtResult } from '../src/ui/result-types';
import { enemyNameJa, getBriefingRecord, riskLabelJa } from '../src/config/briefing-data';
import { playableMissionIds } from '../src/config/campaign-data';
import { getDawnAir } from '../src/config/dawn-data';
import { NO_WEAPON_BRIEFING_JA, PT_GUN_BRIEFING_JA, bearingJa, briefingRows, compassJa, difficultyJa, formatDateJa } from '../src/core/briefing';
import { bearingDeg } from '../src/core/ship-ai';
import { hasHardVariant } from '../src/config/mission-data';
import { endCountsAsReturn } from '../src/core/mission-flow';
import { SeededRng } from '../src/core/rng';
import { computeScore, type ScoreInput } from '../src/core/scoring';
import { directSortie } from '../src/core/sortie';
import { briefingNumbers, buildWorldSetup } from '../src/systems/world-setup';
import { REASON_LABEL, resultHeadingJa } from '../src/ui/result-heading';
import { LINE2_MAX_PX, PT0, ptWorld, row, tele, textWidthPx } from './pt-ui-kit';

type Rec = Record<string, unknown>;
const byId = (id: string): Rec => (gameData.missionsSeed.missions as unknown as Rec[]).find((m) => m['id'] === id)!;
const protoOf = (id: string): Rec => byId(id)['v0_1_prototype'] as Rec;
const nameOf = (e: string): string => enemyNameJa(gameData, e);
const labelOf = (h: string): string => riskLabelJa(gameData, h);
const sortie = (seed: number): ReturnType<typeof directSortie> => directSortie('jp_05', seed, 'none', false, false);

describe('jp_05 の任務と世界（v0.6.3）', () => {
  afterEach(() => vi.restoreAllMocks());
  it('任務: T-14・主兵装 guns（13mm 機銃。v0.6.3 実機 1 回目。前は none）・米PT 2 隻の隊（駆逐艦・大発なし）・新月・夜明け 170 秒・燃料 32 gal（前は 23）・浅瀬なし。危険は米PT の掃射だけ', () => {
    const m = getPrototypeMission(gameData, 'jp_05');
    expect([m.playerBoatId, m.mainWeapon, m.enemyId, m.enemyCount, m.moon, m.durationS, m.fuelAllotmentGal]).toEqual(['jp_t14', 'guns', 'us_pt_enemy', 2, 'dark', 170, 32]);
    expect(m.ptBoats).not.toBeNull();
    expect([m.enemyStart, m.enemyStarts, m.barges, m.escort, m.transport, m.dawnStrike, m.storm, m.enemyAircraft]).toEqual([null, [], null, null, null, null, null, null]);
    expect(m.shallows).toEqual([]);
    expect(m.hazards).toEqual(['enemy_ship_gunfire_or_ram']);
    expect(m.playerStart).toEqual({ x: 4300, y: 450, headingDeg: 225 });
    expect([m.returnPoint.x, m.returnPoint.y, m.returnPoint.radiusM, m.returnPoint.callMargin, m.returnPoint.torpedoEndSettleS]).toEqual([1700, 3200, 250, 1.5, 5]);
    expect(m.bounds).toEqual({ width: 6000, height: 4000 });
  });
  it('世界: 魚雷 0 本・発見の基準 2,000 m（停止で 480 m）・敵の来る位置は 1 隻目の PT・夜明けの空襲なし・駆逐艦／大発なし・砲は T-14 の 13mm（30 発の弾倉・交換 3.2 秒）・煙幕なし', () => {
    const s = buildWorldSetup(gameData, 'jp_05');
    expect([s.mainWeapon, s.torpedoCapacity, s.baseDetectM, s.durationS, s.fuelAllotmentGal]).toEqual(['guns', 0, 2000, 170, 32]);
    expect(s.detectRangeAtStartM).toBeCloseTo(480, 9);
    expect(s.enemyFrom).toEqual({ x: 2000, y: 2200 });
    expect([s.airStrike, s.destroyer, s.barges, s.escort, s.transport, s.smokeParams, s.seaplane, s.storm]).toEqual([null, null, null, null, null, null, null, null]);
    const g = s.guns!;
    expect([g.label, g.rangeM, g.effectiveM, g.deadConeDeg, g.flashRevealM, g.magazine]).toEqual(['13mm機銃', 600, 300, 30, 1200, { rounds: 30, reloadS: 3.2 }]);
    expect(g.groups.map((x) => [x.id, x.roundsPerMin, x.damage, x.shellSpeedMps, x.dispersionM, x.splashRadiusM])).toEqual([['13mm_type93', 450, 2, 500, 64, 1]]);
    expect(g.spreadFactor).toEqual({ stop: 1, silent: 1, cruise: 1.6, full: 2.5 });
    // 弾倉は jp_t14 だけ（us_03 の us_elco80 の砲には鍵ごと無い）
    expect('magazine' in buildWorldSetup(gameData, 'us_03').guns!).toBe(false);
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
  it('今夜（seed+16）: 引くのは 5 回（隊 3・大発の先頭 1・反転 1）。同じ seed なら同じ夜。どの夜も出発点は自艇から史実モードの巡航で見つかる 1,560 m より遠い（v0.6.3 レビュー）。反転した夜は西へ哨戒', () => {
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
    expect(minM).toBeGreaterThanOrEqual(1560);
    // 史実モードの世界の見つかる距離（巡航）もこれより近い（出発で見つからない）
    const h = buildWorldSetup(gameData, 'jp_05', { sortie: directSortie('jp_05', 1, 'none', false, true), historical: true });
    expect(h.vis.detectionMultiplier).toBe(1.3);
    expect(h.baseDetectM * h.vis.speedFactor.cruise * h.vis.moonFactor * h.vis.detectionMultiplier).toBeCloseTo(1560, 6);
    expect(mirrored).toBeGreaterThan(100);
    expect(mirrored).toBeLessThan(200);
    // ?debug&fixed と Briefing（出撃前）は data のまま
    expect(buildWorldSetup(gameData, 'jp_05', { sortie: sortie(1), fixedNight: true }).enemyFrom).toEqual({ x: 2000, y: 2200 });
  });
  it('Briefing の 6 行（spec §B.9。和文と英字・数字の間に半角スペースを入れない＝Phaser が半角スペースで折り返して「2⏎隻組」と割れない）。敵の方角は自艇の出発点から見た 1 隻目の PT（v0.6.3 レビュー: 海域の中心から見た「東から」は真南の PT だった）', () => {
    const s = buildWorldSetup(gameData, 'jp_05');
    const rec = { ...getBriefingRecord(gameData, 'jp_05'), hazardIds: s.hazardsTonight, absentHazardIds: s.absentHazards };
    const rows = briefingRows(rec, briefingNumbers(s), nameOf, labelOf);
    expect(rows.map((r) => [r.label, r.text])).toEqual([
      ['目的', '哨戒の帰り道に米PTの2隻組。振り切れず、左右から何度も来る。赤い線で転舵してかわし、機銃で撃ち返してラバウルへ帰る'],
      ['成功', '生還。PTに一度も見つからずに帰れば回避の点。PTを沈めれば撃沈の点、ただし撃てば閃光で見つかる（帰投地点は南西の青い輪）'],
      ['月', '新月 ・ 見える 900 m ・ 見つかる 巡航 1200 m／静音 600 m'],
      ['敵', '米PTボート ×2（南西から）'],
      ['危険', '敵艦艇の砲撃・衝突'],
      // 昼の空は争奪で味方として遊ぶので「おおむね」（label_ja・夜明けの帯と同じ）。武器の句は「・」の後がノーブレークスペース（「・」が行末に残らない）
      // v0.6.3 実機 1 回目: 武器の句は T-14 の 13mm（PT_GUN_BRIEFING_JA。前は撃たない NO_WEAPON_BRIEFING_JA）
      ['条件', `夜明けまで 170 秒（昼の空はおおむね味方） ・ 燃料 32 gal ・\u00a0${PT_GUN_BRIEFING_JA}`],
    ]);
    // 条件の行（24 px・折り返し 1,056 px）は「gal」の後で折り返し、2 行目が「・ 13mm機銃…」で始まる（「・」が行末に残らない）
    const cond = rows[5]!.text;
    const brk = cond.lastIndexOf(' ', cond.indexOf('\u00a0'));
    expect(cond.slice(brk + 1).startsWith('・\u00a013mm機銃')).toBe(true);
    expect(textWidthPx(cond, 24)).toBeGreaterThan(1056);
    expect(textWidthPx(cond.slice(0, brk), 24)).toBeLessThanOrEqual(1056);
    expect(textWidthPx(cond.slice(brk + 1), 24)).toBeLessThanOrEqual(1056);
    // 他の任務の条件の行は今までどおり「・ 」（区切りの後は半角スペース）
    const us02 = buildWorldSetup(gameData, 'us_02');
    expect(briefingRows({ ...getBriefingRecord(gameData, 'us_02'), hazardIds: us02.hazardsTonight }, briefingNumbers(us02), nameOf, labelOf)[5]!.text).not.toContain('\u00a0魚雷');
    expect(NO_WEAPON_BRIEFING_JA).toBe('魚雷はPTの下を抜ける（撃たない）');
    expect(PT_GUN_BRIEFING_JA).toBe('13mm機銃1挺（撃つと閃光で見つかる。魚雷はPTの下を抜ける）');
    // 目的・成功・史実と武器の句: 和文の中に半角スペースが無い（「条件」は「 ・ 」の区切りだけで折り返す）
    const r = getBriefingRecord(gameData, 'jp_05');
    for (const t of [r.objective, r.success, r.noteJa, NO_WEAPON_BRIEFING_JA, PT_GUN_BRIEFING_JA]) expect(t, t).not.toContain(' ');
    // 目的は 24 px・1,056 px で 2 行に折り返す（Phaser は和文を字で切る）。「13mm」を目的に書くと「13⏎mm機銃」と割れたので、目的では「機銃」とだけ言う（13mm は条件の行）
    expect(r.objective).not.toMatch(/\dmm/);
    expect(briefingNumbers(s).weaponJa).toBe(PT_GUN_BRIEFING_JA);
    // 撃たない米PT の任務（main_weapon none。v0.6.3 の最初の形）なら撃たない句（「砲 13mm機銃」とは出さない）
    expect(briefingNumbers({ ...s, mainWeapon: 'none', guns: null }).weaponJa).toBe(NO_WEAPON_BRIEFING_JA);
    // us_03（砲の任務・米PT なし）は今までどおり「砲 …」の句で、武器の鍵は無い
    expect('weaponJa' in briefingNumbers(buildWorldSetup(gameData, 'us_03'))).toBe(false);
    // 他の任務は鍵ごと無い（us_02 の toEqual が変わらない）
    expect('weaponJa' in briefingNumbers(buildWorldSetup(gameData, 'us_02'))).toBe(false);
    // 見越し点マーカーの解放の状態は魚雷を撃たない jp_05 には付けない（他の任務は今までどおり付く）
    const marker = '見越し点マーカー: あと 3 回の任務で解放（終えた任務 0 回）';
    expect('aimAssistJa' in briefingNumbers(s, marker)).toBe(false);
    expect(briefingRows(rec, briefingNumbers(s, marker), nameOf, labelOf)[5]!.text).toBe(`夜明けまで 170 秒（昼の空はおおむね味方） ・ 燃料 32 gal ・\u00a0${PT_GUN_BRIEFING_JA}`);
    expect(briefingNumbers(s, '史実モード: 見越し点マーカーなし').aimAssistJa).toBeUndefined();
    for (const id of ['us_02', 'us_03', 'jp_06']) expect(briefingNumbers(buildWorldSetup(gameData, id), marker).aimAssistJa, id).toBe(marker);
    const dirs = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const t = buildWorldSetup(gameData, 'jp_05', { sortie: sortie(seed) });
      const d = briefingNumbers(t).enemyFromJa;
      dirs.add(d);
      expect(d, `${seed}`).toBe(bearingJa(bearingDeg(t.playerStart.x, t.playerStart.y, t.ptBoats!.startX[0]!, t.ptBoats!.startY[0]!)));
      // 反転した夜で PT が出発点の真南の側にいれば「南から」（前は海域の中心から見て「東から」と出た）
      if (t.night.mirrored && Math.abs(t.ptBoats!.startX[0]! - t.playerStart.x) < 600) expect(d, `${seed}`).toBe('南');
    }
    expect([...dirs].sort()).toEqual(['南', '南西'].sort());
    // 他の任務は今までどおり海域の中心から見た方角
    expect(briefingNumbers(us02).enemyFromJa).toBe(compassJa(us02.enemyFrom!.x, us02.enemyFrom!.y, us02.mission.bounds.width, us02.mission.bounds.height));
  });
  it('史実: 1944-02-18 ラバウル沖・ゲーム上の想定（艇は T-14 で代用）。人物名なし。dawn_air は争奪で、遊び方は味方の空（夜明けに敵機は来ない）・米PT は夜明けに去る', () => {
    const r = getBriefingRecord(gameData, 'jp_05');
    expect([r.date, r.place, r.titleJa]).toEqual(['1944-02-18', 'ラバウル沖（セント・ジョージ海峡）', '鹵獲艇の哨戒']);
    expect(r.noteJa).toContain('ゲーム上の想定');
    expect(r.noteJa).toContain('T-14で代用');
    // 機銃の句は数字を続けない（レビュー ux-9: 「13mm1挺」は「13mm1」と読めた。条件の行は「13mm機銃1挺」）
    expect(r.noteJa).toContain('T-14型の機銃は13mmが1挺（25mmの艇もあった）');
    expect(r.noteJa).not.toMatch(/mm\d/);
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

describe('jp_05 のハード（v0.6.3 レビュー: ハードの違いが無い任務に「ハード」と出していた）', () => {
  it('ハードの違い（v0_1_prototype.hard）があるのは us_01・us_02・us_03・jp_06。jp_05 は無い＝Briefing は「（この任務は同じ）」、Result の見出しに「（ハード）」を付けない', () => {
    const ids = [...playableMissionIds(gameData, 'us_pt'), ...playableMissionIds(gameData, 'jp_hard')];
    expect(ids.filter((id) => hasHardVariant(gameData, id)).sort()).toEqual(['jp_06', 'us_01', 'us_02', 'us_03']);
    expect(hasHardVariant(gameData, 'jp_05')).toBe(false);
    expect(difficultyJa(false, true)).toBe('');
    expect(difficultyJa(false, false)).toBe('');
    expect(difficultyJa(true, true)).toBe(' ・ 難易度 ハード'); // 他の任務は今までどおり
    expect(difficultyJa(true, false)).toBe(' ・ 難易度 ハード（この任務は同じ）');
    // Result の見出し（result-scene は hard && hasHardVariant を渡す）
    expect(resultHeadingJa('returned', NaN, true && hasHardVariant(gameData, 'jp_05'), false)).toBe('任務終了 — 帰投した');
    expect(resultHeadingJa('returned', NaN, true && hasHardVariant(gameData, 'us_02'), false)).toBe('任務終了 — 帰投した（ハード）');
    // Briefing の副題の幅（20 px・縮めない行）: いちばん長い形でも論理幅 1280 − 左右の余白の内
    const r = getBriefingRecord(gameData, 'jp_05');
    const sub = `${formatDateJa(r.date)} ・ ${r.place}${difficultyJa(true, false)} ・ 史実モード`; // 史実モードの句は config/menu-config の BRIEF_HISTORICAL_JA（DOM を読むので import しない）
    expect(textWidthPx(sub, 20)).toBeLessThanOrEqual(1280 - 2 * 24);
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
    // v0.6.3 実機 1 回目: 13mm で沈めた米PT 1 隻 140 点（撃退は点なし）。見つからずに帰投 > 撃ち返して 1 隻沈めて帰投 > 転舵でかわして帰投 > 2 隻沈めて沈没（生還が先）
    expect(sp.killPoints['us_pt_enemy']).toBe(140);
    const shotOne = computeScore({ ...base, detections: 1, fuelLeftPct: 43, crewAlive: 6, kills: 1, killEnemyId: 'us_pt_enemy' }, sp).total;
    const sunkTwoKills = computeScore({ ...base, returned: false, objectiveDone: false, detections: 2, crewAlive: 2, kills: 2, killEnemyId: 'us_pt_enemy' }, sp).total;
    expect([shotOne, sunkTwoKills]).toEqual([1269, 280]);
    expect(unseen > shotOne && shotOne > dodged && dodged > sunkTwoKills).toBe(true);
    // 見つからずに帰るのがいちばん上（撃てば閃光で見つかる）: 隊を全部沈めて帰っても回避の点に届かない（レビュー F1: 200 点では 2 隻で 400 > 回避 300 となり、
    // 模擬の 2 隻撃沈の帰投 1,528〜1,566 点が見つからずに帰投の最高 1,471 点を超えた）。同じ燃料・乗員なら全部沈めた帰投 < 見つからずに帰投
    const ptCount = buildWorldSetup(gameData, 'jp_05').ptBoats!.count;
    expect(ptCount * sp.killPoints['us_pt_enemy']!).toBeLessThan(sp.evadeByType['patrol_and_evade']!);
    const allKilledHome = computeScore({ ...base, detections: 1, kills: ptCount, killEnemyId: 'us_pt_enemy' }, sp).total;
    expect([allKilledHome, allKilledHome < unseen]).toEqual([1440, true]);
    // 模擬の最良の夜（燃料 66% で 2 隻沈めて無傷で帰投）も、見つからずに帰投の最良（燃料 71%）に届かない
    expect(computeScore({ ...base, detections: 1, fuelLeftPct: 66, kills: 2, killEnemyId: 'us_pt_enemy' }, sp).total).toBeLessThan(computeScore({ ...base, fuelLeftPct: 71 }, sp).total);
  });
});

const RESULT = MODE_FLAG_PT_RESULT;
/** 脅威の PT が艇から北東 500 m（300, −400） */
const NE500 = { dx: 300, dy: -400 };

describe('jp_05 の HUD の 2 行目（v0.6.3。spec §D.1）', () => {
  it('出撃時のテレメトリ: 2 隻・航過の上限 8（2 隻 × 4 回。v0.6.3 実機 1 回目で 2 → 4 回）・1 発 HP 4・静音の上限 14 kt・去る方角は東。PT は哨戒で見えていない（出発点から 1,200 m より遠い）', () => {
    expect([PT0.enabled, PT0.total, PT0.alive, PT0.maxPasses, PT0.damagePerHit, PT0.silentMaxKt, PT0.leaveDirJa]).toEqual([true, 2, 2, 8, 4, 14, '東']);
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
  it('接触: 突撃（見えている＝方角と距離・音だけ＝方角）、離脱（残りの航過）。航過の結果は撃った航過の表示中だけ（被弾なし＝味方の青・被弾＝HP）', () => {
    const det = { detected: true, ...NE500 };
    expect(row(tele({ ...det, threatPhase: PT_ALERT, sighted: true }))).toEqual([MISSION_PT_CONTACT, '米PT 北東から突撃 500 m ・ 赤い線で転舵', HUD_COLOR_WARN]);
    expect(row(tele({ detected: true, threatPhase: PT_RUN_IN, dx: 0, dy: 1000 }))).toEqual([MISSION_PT_CONTACT, '米PT のエンジン音 ・ 南から突撃', HUD_COLOR_WARN]);
    // 離脱の末尾（v0.6.3 実機 1 回目）: 13mm を撃つ前は右下の射撃を勧める（前は「静音で見失わせろ」。模擬で見失わせた夜は 0 だった）。撃った後は tests/pt-gun-ui
    expect(row(tele({ ...det, threatPhase: PT_BREAK, passes: 1 }))).toEqual([MISSION_PT_CONTACT, '米PT 離脱 ・ 残り 7 回 ・ 右下の射撃で撃ち返せ', HUD_COLOR_STRONG]);
    expect(row(tele({ ...det, threatPhase: PT_ALERT, passes: 1, passSeq: 1, lastPassHits: 0, lastPassFired: true }), 0, RESULT)).toEqual([MISSION_PT_CONTACT, 'かわした！ 被弾なし ・ 航過 1/8', HOME_COLOR_TEXT]);
    expect(row(tele({ ...det, threatPhase: PT_BREAK, passes: 2, passSeq: 2, lastPassHits: 3, lastPassFired: true }), 0, RESULT)).toEqual([MISSION_PT_CONTACT, '被弾 3 発（HP −12） ・ 航過 2/8', HUD_COLOR_STRONG]);
    // 結果の表示は見失った後・夜明けに去った後も出る（表示の秒が終われば平常へ）
    expect(row(tele({ passes: 8, passSeq: 8, alive: 0, lastPassHits: 0, lastPassFired: true }), 0, RESULT)[0]).toBe(MISSION_PT_CONTACT);
    expect(row(tele({ passes: 8, passSeq: 8, alive: 0, out: 2 }))).toEqual([MISSION_PT, '米PT は東へ去った ・ 帰投せよ  2000 m', HUD_COLOR_STRONG]);
  });
  it('撃たなかった航過（転舵で艇首尾の円錐・射程の外へ抜けた）の後は「撃たせなかった！」（味方の青。v0.6.3 レビュー: いちばん良いかわし方に何も出ず、航過の数が飛んで見えた）。見失った後・みな去った後も出る', () => {
    const det = { detected: true, ...NE500 };
    const unfired = { passes: 1, passSeq: 1, lastPassHits: 0, lastPassFired: false };
    expect(ptResultShown(tele(unfired), RESULT)).toBe(true);
    expect(ptResultShown(tele(unfired), 0)).toBe(false);
    expect(ptResultShown({ ...tele(unfired), pt: createPtTelemetry() }, RESULT)).toBe(false); // 米PT の無い任務は出さない
    expect(row(tele({ ...det, ...unfired, threatPhase: PT_BREAK }), 0, RESULT)).toEqual([MISSION_PT_CONTACT, '撃たせなかった！ ・ 航過 1/8', HOME_COLOR_TEXT]);
    expect(row(tele({ ...det, ...unfired, threatPhase: PT_ALERT, sighted: true }), 0, RESULT)[1]).toBe('撃たせなかった！ ・ 航過 1/8');
    expect(row(tele(unfired), 0, RESULT)).toEqual([MISSION_PT_CONTACT, '撃たせなかった！ ・ 航過 1/8', HOME_COLOR_TEXT]);
    expect(row(tele({ ...unfired, passes: 8, passSeq: 8, alive: 0 }), 0, RESULT)[1]).toBe('撃たせなかった！ ・ 航過 8/8');
    // 表示の秒が過ぎればいつもの行
    expect(row(tele({ ...det, ...unfired, threatPhase: PT_BREAK }), 0, 0)[1]).toBe('米PT 離脱 ・ 残り 7 回 ・ 右下の射撃で撃ち返せ');
    // キーは撃った航過の結果（被弾なし）と違う
    const k = (t: BoatTelemetry, flags: number): number => ptKey(t, missionMode(t, 0, flags), flags);
    expect(k(tele({ ...det, ...unfired, threatPhase: PT_BREAK }), RESULT)).not.toBe(k(tele({ ...det, ...unfired, lastPassFired: true, threatPhase: PT_BREAK }), RESULT));
  });
  it('みな去る途中は「去る」、みな海域の外へ出たら「去った」（夜明けの前と後）。後ろに帰投の輪の縁までの距離（100 m 刻みの切り上げ。v0.6.3 レビュー: 夜明けの後に距離が消えた）。キーは変わる', () => {
    const dawn = { ...createDawnTelemetry(), reached: true };
    expect(row(tele({ alive: 0, out: 0 }))[1]).toBe('米PT は東へ去る ・ 帰投せよ  2000 m');
    expect(row(tele({ alive: 0, out: 1 }))[1]).toBe('米PT は東へ去る ・ 帰投せよ  2000 m');
    expect(row(tele({ alive: 0, out: 2 }))[1]).toBe('米PT は東へ去った ・ 帰投せよ  2000 m');
    expect(row(tele({ alive: 0, out: 1, leftAtDawn: true }, { dawn }))).toEqual([MISSION_PT, '夜明け ・ 米PT は東へ去る ・ 帰投せよ  2000 m', HUD_COLOR_STRONG]);
    expect(row(tele({ alive: 0, out: 2, leftAtDawn: true }, { dawn, homeEdgeM: 301 }))).toEqual([MISSION_PT, '夜明け ・ 米PT は東へ去った ・ 帰投せよ  400 m', HUD_COLOR_STRONG]);
    const k = (t: BoatTelemetry): number => ptKey(t, missionMode(t, 0, 0), 0);
    expect(k(tele({ alive: 0, out: 1 }))).not.toBe(k(tele({ alive: 0, out: 2 })));
    expect(k(tele({ alive: 0, out: 0 }))).toBe(k(tele({ alive: 0, out: 1 }))); // 文が同じなら組み直さない
    expect(k(tele({ alive: 0, out: 2 }))).not.toBe(k(tele({ alive: 0, out: 2 }, { dawn })));
    expect(k(tele({ alive: 0, out: 2 }, { homeEdgeM: 1901 }))).toBe(k(tele({ alive: 0, out: 2 }, { homeEdgeM: 1999 }))); // 同じ 100 m の刻み
    expect(k(tele({ alive: 0, out: 2 }, { homeEdgeM: 1899 }))).not.toBe(k(tele({ alive: 0, out: 2 }, { homeEdgeM: 1901 })));
    expect(k(tele({ alive: 2 }, { homeEdgeM: 1000 }))).toBe(k(tele({ alive: 2 }, { homeEdgeM: 3000 }))); // 哨戒中の行には距離が出ない
  });
  it('航過: 撃つ前は「航過！」、撃ち始めたら「掃射！」。かわし方は固めたときの 1 つ: 逃げる針路の方角（スティックの向き）へ転舵、もう向いていればそのまま（v0.6.3 レビュー: 「右へ／左へ」は艇から見た回り方で、南へ走る艇では画面の逆だった）', () => {
    const pass = { detected: true, passing: true, threatPhase: PT_PASS, ...NE500, sighted: true };
    expect(row(tele({ ...pass, dodge: 1, escapeDeg: 315 }))).toEqual([MISSION_PT_PASS, '米PT 航過！ 北西へ転舵・全速', HUD_COLOR_WARN]);
    expect(row(tele({ ...pass, dodge: -1, escapeDeg: 135 }))[1]).toBe('米PT 航過！ 南東へ転舵・全速');
    expect(row(tele({ ...pass, dodge: 1, escapeDeg: 10 }))[1]).toBe('米PT 航過！ 北へ転舵・全速'); // 8 方位に丸める
    expect(row(tele({ ...pass, dodge: 0, escapeDeg: 225 }))[1]).toBe('米PT 航過！ そのまま全速で離れろ');
    expect(row(tele({ ...pass, dodge: 1, escapeDeg: 315, fired: true }))[1]).toBe('米PT 掃射！ 北西へ転舵・全速');
    expect(row(tele({ ...pass, dodge: -1, escapeDeg: 90, fired: true }))[1]).toBe('米PT 掃射！ 東へ転舵・全速');
    expect(row(tele({ ...pass, dodge: 0, escapeDeg: 90, fired: true }))[1]).toBe('米PT 掃射！ そのまま全速で離れろ');
    // 回り方（dodge ±1）が違っても方角が同じなら同じ文・同じキー（文はスティックの向きだけを言う）
    const k = (t: BoatTelemetry): number => ptKey(t, missionMode(t, 0, 0), 0);
    expect(k(tele({ ...pass, dodge: 1, escapeDeg: 315 }))).toBe(k(tele({ ...pass, dodge: -1, escapeDeg: 320 })));
    expect(k(tele({ ...pass, dodge: 0, escapeDeg: 315 }))).toBe(k(tele({ ...pass, dodge: 0, escapeDeg: 90 })));
    // 航過は結果の表示より上、燃料切れ（漂流）は航過より上
    expect(row(tele({ ...pass, dodge: 1 }), 0, RESULT)[0]).toBe(MISSION_PT_PASS);
    expect(row(tele({ ...pass, dodge: 1 }, { fuelEmpty: true }))[0]).toBe(MISSION_ADRIFT);
  });
  it('帰投せよ（燃料・夜明け近し）は平常の米PT の行より上。夜明けの後に米PT がみな去っていれば「夜明け ・ 米PT は東へ去る／去った」', () => {
    expect(row(tele(), CALL_DAWN)[0]).toBe(MISSION_CALL);
    expect(row(tele({ alive: 0 }), CALL_DAWN)[0]).toBe(MISSION_CALL); // 夜明け前の「夜明け近し」は消さない
    const dawn = { ...createDawnTelemetry(), reached: true };
    expect(row(tele({ alive: 0, leftAtDawn: true }, { dawn }), CALL_DAWN)).toEqual([MISSION_PT, '夜明け ・ 米PT は東へ去る ・ 帰投せよ  2000 m', HUD_COLOR_STRONG]);
    expect(row(tele({ alive: 0, out: 2, leftAtDawn: true }, { dawn }), CALL_DAWN)).toEqual([MISSION_PT, '夜明け ・ 米PT は東へ去った ・ 帰投せよ  2000 m', HUD_COLOR_STRONG]);
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
    expect(k(tele({ detected: true, passes: 1, lastPassHits: 1, lastPassFired: true }), RESULT)).not.toBe(k(tele({ detected: true, passes: 1, lastPassHits: 2, lastPassFired: true }), RESULT));
    for (const t of [tele(), tele({ ...seen, passing: true, detected: true, dodge: 1, escapeDeg: 315, fired: true }), tele({ alive: 0, out: 2 }, { dawn: { ...createDawnTelemetry(), reached: true }, homeEdgeM: 6300 })]) {
      const key = k(t);
      expect(Number.isInteger(key) && key >= 0 && key < 2 ** 31).toBe(true);
    }
  });
  it('どの文もいちばん長い値で 840 px 以内（論理幅 1280 で左上の時計を避けても縮まない）', () => {
    const far = { dx: -2200, dy: -2200 }; // 北西・刻みの上限（3,150 m）
    const det = { detected: true, ...far, passes: 15, maxPasses: 15, lastPassHits: 63, lastPassFired: true, damagePerHit: 4 };
    const cases: [Partial<PtTelemetry>, Partial<BoatTelemetry>, number][] = [
      [{ ...det, passing: true, fired: true, dodge: 0 }, {}, 0],
      [{ ...det, passing: true, dodge: 1, escapeDeg: 315 }, {}, 0],
      [{ ...det, passing: true, fired: true, dodge: -1, escapeDeg: 135 }, {}, 0],
      [det, {}, RESULT],
      [{ ...det, lastPassHits: 0 }, {}, RESULT],
      [{ ...det, lastPassHits: 0, lastPassFired: false }, {}, RESULT],
      [{ ...det, threatPhase: PT_RUN_IN, sighted: true }, {}, 0],
      [{ ...det, threatPhase: PT_RUN_IN }, {}, 0],
      [{ ...det, threatPhase: PT_BREAK, passes: 0 }, {}, 0],
      [{ ...far, sighted: true }, { targetStep: 'silent' }, 0],
      [{ ...far, sighted: true }, { targetStep: 'full', detectRangeM: 3150 }, 0],
      [{ alive: 4 }, {}, 0],
      [{ alive: 0 }, { dawn: { ...createDawnTelemetry(), reached: true } }, 0],
      [{ alive: 0, out: 2 }, { dawn: { ...createDawnTelemetry(), reached: true }, homeEdgeM: 6300 }, 0],
      [{ alive: 0, out: 1 }, { dawn: { ...createDawnTelemetry(), reached: true }, homeEdgeM: 6300 }, 0],
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
    q.boats[0]!.passes = 2; // 隊の航過の数は PT ごとの数の和（航過の上限 = 終わった 2 + 残り 2 + 4。撃退・撃沈が無ければ去っても 8 のまま）
    q.owner = -1;
    q.passes = 2;
    q.passSeq = 2;
    q.lastPassHits = 1;
    q.lastPassFired = true;
    q.out = 0;
    refreshPtTelemetry(t, w);
    expect([t.alive, t.passing, t.fired, t.dodge, t.passes, t.passSeq, t.lastPassHits, t.lastPassFired]).toEqual([1, false, false, 0, 2, 2, 1, true]);
    q.closest2 = 250000;
    q.firstDetectM = 1180;
    const r = ptResult(w)!;
    expect([r.total, r.alive, r.maxPasses, r.passes, r.damagePerHit, r.hpMax, r.closestM, r.firstDetectM, r.firstDetectBand]).toEqual([2, 1, 8, 2, 4, 50, 500, 1180, '']);
    expect(ptResult({ ...w, pts: null })).toBeNull();
  });
  it('Result の材料: 終わる瞬間に撃っていた航過も航過・撃った航過に数える（命中があれば無傷に数えない）。撃つ前の航過は数えない。隊の KPI は変えない', () => {
    const w = ptWorld();
    const q = w.pts!.section;
    q.passes = 1;
    q.firedPasses = 1;
    q.cleanPasses = 1;
    q.boats[0]!.phase = PT_LEAVE;
    q.boats[1]!.phase = PT_PASS;
    q.owner = 1;
    q.boats[1]!.firedThisPass = 0;
    let r = ptResult(w)!;
    expect([r.passes, r.firedPasses, r.cleanPasses, r.alive]).toEqual([1, 1, 1, 1]); // 固めただけ（撃つ前）
    q.boats[1]!.firedThisPass = 8;
    q.passHits = 13;
    r = ptResult(w)!;
    expect([r.passes, r.firedPasses, r.cleanPasses]).toEqual([2, 2, 1]); // 沈んだ航過（「かわした 1/1 ・ 被弾 13 発」と出ない）
    q.passHits = 0;
    r = ptResult(w)!;
    expect([r.passes, r.firedPasses, r.cleanPasses]).toEqual([2, 2, 2]); // 撃たれながら輪に入った（無傷）
    expect([q.passes, q.firedPasses, q.cleanPasses]).toEqual([1, 1, 1]);
  });
});

describe('jp_05 の Result（v0.6.3。spec §D.4）', () => {
  // 13mm（v0.6.3 実機 1 回目）は撃たなかった夜（4 行目「13mm は撃たなかった」）。撃った夜の 4 行目・閃光・頭の撃沈・撃退は tests/pt-gun-ui
  const base: PtResult = {
    enemyId: 'us_pt_enemy', total: 2, out: 2, alive: 0, leftAtDawn: false, passes: 0, maxPasses: 8, firedPasses: 0, cleanPasses: 0, shots: 0, hits: 0, damagePerHit: 4, hpMax: 50,
    firstDetectM: NaN, firstDetectBand: '', lostContacts: 0, closestM: 812.4, minWarnS: Infinity,
    gunEnabled: true, gunShots: 0, gunHits: 0, retired: 0, sunk: 0, flashFirst: false,
  };
  it('一度も見つからずに抜けた: 最接近と「—」（撃たれていない）。帰投しなかった（漂流）なら「抜けた」と言わない', () => {
    expect(ptResultLines(base, 0, true)).toEqual(['米PT に一度も見つからずに抜けた', '見つからず ・ PT の最接近 812 m', '予告から初弾まで 最短 — 秒 ・ 撃たれた弾 0 発', '13mm は撃たなかった']);
    expect(ptResultLines(base, 0, false)[0]).toBe('米PT に一度も見つからなかった');
    expect(ptHeadJa(base)).toBe('米PT: 去った');
  });
  it('見つかって転舵でかわした: 航過・かわした（撃たれた航過のうち）・被弾と HP、最初の距離と速力帯・見失わせた回数、予告から初弾', () => {
    const r: PtResult = { ...base, passes: 4, firedPasses: 3, cleanPasses: 2, shots: 30, hits: 3, firstDetectM: 1199.6, firstDetectBand: 'cruise', lostContacts: 1, minWarnS: 2.52 };
    expect(ptResultLines(r, 1, true)).toEqual(['米PT 航過 4 回 ・ かわした 2/3 ・ 被弾 3 発（HP −12）', '見つかった 1 回（最初 1200 m ・ 巡航） ・ 見失わせた 1 回', '予告から初弾まで 最短 2.5 秒 ・ 撃たれた弾 30 発', '13mm は撃たなかった']);
  });
  it('沈んだ: PT は「健在 N 隻」（去っていない数）。みな去る途中・去った後は「去った」、夜明けに去った夜は「夜明けに去った」', () => {
    const r: PtResult = { ...base, out: 0, alive: 2, passes: 2, firedPasses: 2, shots: 24, hits: 13, firstDetectM: 1200, firstDetectBand: 'cruise', minWarnS: 2.5 };
    expect(ptResultLines(r, 2, false)[0]).toBe('米PT 航過 2 回 ・ かわした 0/2 ・ 被弾 13 発（HP −50）');
    expect(ptHeadJa(r)).toBe('米PT: 健在 2 隻');
    expect(ptHeadJa({ ...r, alive: 1 })).toBe('米PT: 健在 1 隻');
    expect(ptHeadJa({ ...r, alive: 0, out: 1 })).toBe('米PT: 去った'); // 去る途中も
    expect(ptHeadJa({ ...r, alive: 0, out: 2 })).toBe('米PT: 去った');
    expect(ptHeadJa({ ...r, alive: 0, leftAtDawn: true })).toBe('米PT: 夜明けに去った');
  });
  it('被弾 0 は「被弾なし」。撃たれた航過が無ければ「かわした」を出さない（「かわした 0/0」と出ない）', () => {
    const r: PtResult = { ...base, passes: 4, firedPasses: 3, cleanPasses: 3, shots: 30, hits: 0, firstDetectM: 1200, firstDetectBand: 'cruise', minWarnS: 2.6 };
    expect(ptResultLines(r, 1, true)[0]).toBe('米PT 航過 4 回 ・ かわした 3/3 ・ 被弾なし');
    expect(ptResultLines({ ...r, passes: 1, firedPasses: 0, cleanPasses: 0, shots: 0, minWarnS: Infinity }, 1, true)[0]).toBe('米PT 航過 1 回 ・ 被弾なし');
    expect(ptResultLines({ ...r, passes: 0, firedPasses: 0, cleanPasses: 0, shots: 0, minWarnS: Infinity }, 1, true)[0]).toBe('米PT 航過 0 回 ・ 被弾なし');
  });
  it('Result の行は縮めずに画面の幅に収まる（本文 24 px・20 px・20 px と状況の行 20 px。見積もりが論理幅 1280 − 左右の HUD_MARGIN 48 の内）', () => {
    const wide: PtResult = { ...base, out: 0, alive: 2, passes: 15, maxPasses: 15, firedPasses: 15, cleanPasses: 15, shots: 999, hits: 99, firstDetectM: 3150, firstDetectBand: 'cruise', lostContacts: 99, minWarnS: 99.9 };
    const [a, b, c, d] = ptResultLines(wide, 99, true);
    const MAX = 1280 - 2 * 24;
    expect(textWidthPx(a, 24), a).toBeLessThanOrEqual(MAX); // HUD_FONT_STEP_PX
    expect(textWidthPx(b, 20), b).toBeLessThanOrEqual(MAX); // HUD_FONT_HEADING_PX
    expect(textWidthPx(c, 20), c).toBeLessThanOrEqual(MAX); // HUD_FONT_STATUS_PX
    expect(textWidthPx(d, 20), d).toBeLessThanOrEqual(MAX); // HUD_FONT_STATUS_PX（13mm。撃った夜のいちばん長い形は tests/pt-gun-ui）
    // 状況の行（result-scene: 頭・帰投・HP・乗員・燃料・秒。米PT の任務は初発射の燃料なし）
    for (const head of [ptHeadJa(wide), ptHeadJa({ ...wide, alive: 0 }), ptHeadJa({ ...wide, leftAtDawn: true })]) {
      const status = `${head}   帰投: なし   艇 HP 50 / 50   乗員 7/7   燃料 100%   9999 秒`;
      expect(textWidthPx(status, 20), status).toBeLessThanOrEqual(MAX);
    }
  });
});

/** Title の任務の行の幅（config/menu-config の TITLE_ROW_W。menu-config は game-config → DOM を読むので import しない） */
const TITLE_ROW_W_PX = 960;

describe('Title の日本の操作の一言（v0.6.3）', () => {
  it('魚雷のある任務（jp_06）と 13mm 機銃の任務（jp_05「鹵獲艇の哨戒」。v0.6.3 実機 1 回目から）のどちらでも本当。煙幕なし。任務の行の幅（TITLE_ROW_W）の内', () => {
    const hint = TITLE_HINT_BY_CAMPAIGN_JA['jp_hard']!;
    // 任務の名前で言う（「哨戒は撃たない」は米PT の哨戒が撃たないとも読めた。v0.6.3 レビュー）
    expect(hint).toBe('操作: 左下のスティックで進む ・ 右下で魚雷（鹵獲艇の哨戒は13mm機銃）・ 煙幕なし（暗さと静音が頼り）');
    expect(hint).toContain(getBriefingRecord(gameData, 'jp_05').titleJa); // 「鹵獲艇の哨戒」で指す任務
    expect(getPrototypeMission(gameData, 'jp_05').mainWeapon).toBe('guns');
    expect(hint).toContain(buildWorldSetup(gameData, 'jp_05').guns!.label); // 「13mm機銃」は jp_t14 の gun_battery.label_ja
    expect(getPrototypeMission(gameData, 'jp_06').mainWeapon).not.toBe('none');
    for (const [k, v] of Object.entries(TITLE_HINT_BY_CAMPAIGN_JA)) expect(textWidthPx(v, TITLE_HINT_PX), k).toBeLessThanOrEqual(TITLE_ROW_W_PX);
  });
});
