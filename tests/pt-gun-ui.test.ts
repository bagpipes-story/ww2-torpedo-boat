// T-14 の 13mm（v0.6.3 実機 1 回目。spec r1 §E・§H）の HUD と Result: 2 行目の射撃・撃退と撃沈の行（ui/pt-gun-lines）、被弾で黙った航過・離脱の末尾・全隻撃沈・
// 撃退と撃沈で減る航過の上限（ui/pt-lines・systems/pt-telemetry）、優先順（赤い線 > 13mm の出来事 > 航過の結果 > 射撃 > 突撃・離脱。ui/mission-mode）、
// 押さない夜は 13mm の無い米PT の任務と同じ行（離脱の末尾だけ違う）、Result の 4 行と頭。どの行もいちばん長い値で縮まない幅。
import { describe, expect, it } from 'vitest';
import { HOME_COLOR_TEXT, HUD_COLOR_STRONG, HUD_COLOR_WARN } from '../src/config/hud-text-config';
import type { BoatTelemetry } from '../src/core/boat-motion';
import { createDawnTelemetry } from '../src/core/dawn-air';
import { AS_T_RUN } from '../src/core/air-strike';
import { GUN_BLOCKED, GUN_FIRING, GUN_NO_TARGET, GUN_OUT_OF_ARC, GUN_OUT_OF_RANGE, GUN_SAFE } from '../src/core/gun-battery';
import { PT_BREAK, PT_FATE_CREW, PT_FATE_HULL, PT_FATE_SUNK, PT_LEAVE, PT_PASS, PT_RUN_IN, PT_SUNK, createPtTelemetry, threatIndex, type PtTelemetry } from '../src/core/pt-boats';
import { PT_GUN_EV_CREW, PT_GUN_EV_HULL, PT_GUN_EV_SUNK } from '../src/core/pt-damage';
import { PT_GUN_RELOAD } from '../src/core/pt-gun';
import { initPtTelemetry, ptMaxPasses, ptResult, refreshPtTelemetry } from '../src/systems/pt-telemetry';
import { MISSION_ADRIFT, MISSION_PT, MISSION_PT_CONTACT, MISSION_PT_GUN, MISSION_PT_GUN_EVENT, MISSION_PT_PASS, MISSION_STRIKE, MODE_FLAG_PT_GUN_EVENT, MODE_FLAG_PT_RESULT, missionMode, ptGunShown } from '../src/ui/mission-mode';
import { ptHeadJa, ptResultLines } from '../src/ui/pt-lines';
import type { PtResult } from '../src/ui/result-types';
import { CRUISE01, HOME, runPtSim, type PtSim } from './pt-kit';
import { LINE2_MAX_PX, PT0, S05, keyOf, ptWorld, row, tele, textWidthPx } from './pt-ui-kit';

const RESULT = MODE_FLAG_PT_RESULT;
const EVENT = MODE_FLAG_PT_GUN_EVENT;
/** 見つかって突撃してくる PT（北東 500 m） */
const RUSH: Partial<PtTelemetry> = { detected: true, threatPhase: PT_RUN_IN, dx: 300, dy: -400, sighted: true };
/** 射撃中（PT 250 m・命中 3） */
const FIRING: Partial<PtTelemetry> = { ...RUSH, gunStatus: GUN_FIRING, gunTargetM: 231, gunHits: 3, gunEverFired: true };

describe('13mm の 2 行目（ui/pt-gun-lines）', () => {
  it('出撃時: 砲あり（射程 600 m・有効 300 m）、押していない。砲の無い米PT の任務は gunEnabled false', () => {
    expect([PT0.gunEnabled, PT0.gunRangeM, PT0.gunEffectiveM, PT0.gunStatus, PT0.gunEverFired, PT0.gunHits, PT0.fighting, PT0.sunk, PT0.maxPasses]).toEqual([true, 600, 300, GUN_SAFE, false, 0, 2, 0, 8]);
    const none = initPtTelemetry(ptWorld(false));
    expect([none.gunEnabled, none.gunRangeM, none.maxPasses]).toEqual([false, NaN, 8]);
    expect(S05.guns!.label.startsWith('13mm')).toBe(true); // 文の「13mm」は jp_t14 の gun_battery（25mm に替えるなら文も替える）
  });
  it('射撃中: 距離（50 m 刻みの切り上げ）と命中。速い（巡航・全速）・遠い（表示の距離が有効射程の外）は警告色。弾倉交換・射界外・射程外・見えない', () => {
    expect(row(tele(FIRING))).toEqual([MISSION_PT_GUN, '射撃中 ・ PT 250 m ・ 命中 3', HUD_COLOR_STRONG]);
    expect(row(tele({ ...FIRING, gunFast: true }))).toEqual([MISSION_PT_GUN, '射撃中 ・ PT 250 m ・ 速くて散る（14 kt 以下で）', HUD_COLOR_WARN]);
    expect(row(tele({ ...FIRING, gunTargetM: 301 }))).toEqual([MISSION_PT_GUN, '射撃中 ・ PT 350 m ・ 遠い（300 m 以内で）', HUD_COLOR_WARN]);
    expect(row(tele({ ...FIRING, gunTargetM: 300 }))[1]).toBe('射撃中 ・ PT 300 m ・ 命中 3'); // 300 m は有効射程の内
    expect(row(tele({ ...FIRING, gunTargetM: 301, gunFast: true }))[1]).toBe('射撃中 ・ PT 350 m ・ 速くて散る（14 kt 以下で）'); // 速いが先
    expect(row(tele({ ...RUSH, gunStatus: PT_GUN_RELOAD, reloadLeftS: 3.2 }))).toEqual([MISSION_PT_GUN, '弾倉交換 ・ あと 4 秒', HUD_COLOR_STRONG]);
    expect(row(tele({ ...RUSH, gunStatus: PT_GUN_RELOAD, reloadLeftS: 0.01 }))[1]).toBe('弾倉交換 ・ あと 1 秒');
    expect(row(tele({ ...RUSH, gunStatus: GUN_OUT_OF_ARC }))).toEqual([MISSION_PT_GUN, '射界外 ・ 舷側に向けよ（艇首・艇尾は撃てない）', HUD_COLOR_WARN]);
    expect(row(tele({ ...RUSH, gunStatus: GUN_OUT_OF_RANGE }))).toEqual([MISSION_PT_GUN, '射程外 ・ 600 m まで引きつけよ', HUD_COLOR_WARN]);
    expect(row(tele({ ...RUSH, gunStatus: GUN_NO_TARGET }))).toEqual([MISSION_PT_GUN, '撃てる PT が見えない', HUD_COLOR_STRONG]);
    expect(row(tele({ ...RUSH, gunStatus: GUN_BLOCKED }))[1]).toBe('撃てる PT が見えない');
    // 見つかる前に撃っても射撃の行（「発見された！」は 3 行目）
    expect(row(tele({ ...FIRING, detected: false }))[0]).toBe(MISSION_PT_GUN);
  });
  it('出来事: 撃退（死傷・穴だらけ）・撃沈と、まだ戦う PT の数（0 なら帰投せよ）。味方の青', () => {
    expect(row(tele({ ...RUSH, gunEvent: PT_GUN_EV_CREW, fighting: 1 }), 0, EVENT)).toEqual([MISSION_PT_GUN_EVENT, '米PT 撃退！ 死傷者が出て離脱 ・ 残り 1 隻', HOME_COLOR_TEXT]);
    expect(row(tele({ ...RUSH, gunEvent: PT_GUN_EV_HULL, fighting: 1 }), 0, EVENT)[1]).toBe('米PT 撃退！ 穴だらけで離脱 ・ 残り 1 隻');
    expect(row(tele({ ...RUSH, gunEvent: PT_GUN_EV_SUNK, fighting: 1 }), 0, EVENT)[1]).toBe('米PT 撃沈！ ガソリンに引火 ・ 残り 1 隻');
    expect(row(tele({ gunEvent: PT_GUN_EV_SUNK, fighting: 0, alive: 0 }), 0, EVENT)).toEqual([MISSION_PT_GUN_EVENT, '米PT 撃沈！ ガソリンに引火 ・ 帰投せよ', HOME_COLOR_TEXT]);
    expect(row(tele({ gunEvent: PT_GUN_EV_CREW, fighting: 0, alive: 0 }), 0, EVENT)[1]).toBe('米PT 撃退！ 死傷者が出て離脱 ・ 帰投せよ');
  });
  it('優先順: 夜明けの空襲・燃料切れ > 赤い線 > 13mm の出来事 > 航過の結果 > 射撃 > 突撃・離脱。射撃は押していて生きた PT がいるときだけ', () => {
    const pass = { ...FIRING, passing: true, threatPhase: PT_PASS, dodge: 1, escapeDeg: 315 };
    expect(row(tele(pass), 0, EVENT | RESULT)[0]).toBe(MISSION_PT_PASS); // 撃っている間も赤い線がいちばん上
    expect(row(tele(pass), 0, 0)[1]).toBe('米PT 航過！ 北西へ転舵・全速');
    expect(row(tele(FIRING, { fuelEmpty: true }), 0, EVENT)[0]).toBe(MISSION_ADRIFT);
    expect(row(tele(pass, { dawn: { ...createDawnTelemetry(), threat: AS_T_RUN } }), 0, EVENT)[0]).toBe(MISSION_STRIKE);
    const result = { ...FIRING, passes: 1, passSeq: 1, lastPassFired: true, lastPassHits: 0, gunEvent: PT_GUN_EV_CREW, fighting: 1 };
    expect(row(tele(result), 0, EVENT | RESULT)[0]).toBe(MISSION_PT_GUN_EVENT);
    expect(row(tele(result), 0, RESULT)).toEqual([MISSION_PT_CONTACT, 'かわした！ 被弾なし ・ 航過 1/8', HOME_COLOR_TEXT]);
    expect(row(tele(result), 0, 0)[0]).toBe(MISSION_PT_GUN);
    expect(row(tele({ ...result, gunStatus: GUN_SAFE }), 0, 0)).toEqual([MISSION_PT_CONTACT, '米PT 北東から突撃 500 m ・ 赤い線で転舵', HUD_COLOR_WARN]);
    // 生きた PT がいない（みな去る・沈んだ）なら押していても射撃の行は出ない
    expect(ptGunShown(tele({ ...FIRING, alive: 0 }))).toBe(false);
    expect(row(tele({ ...FIRING, detected: false, alive: 0 }))[0]).toBe(MISSION_PT);
    // 砲の無い米PT の任務・米PT の無い任務では出ない
    expect(ptGunShown(tele({ ...FIRING, gunEnabled: false }))).toBe(false);
    expect(ptGunShown({ ...tele(), pt: { ...createPtTelemetry(), gunStatus: GUN_FIRING } })).toBe(false);
    expect(missionMode({ ...tele(), pt: createPtTelemetry() }, 0, EVENT)).not.toBe(MISSION_PT_GUN_EVENT);
  });
  it('キー: 文が変わるときだけ変わる（同じ 50 m の刻み・行に出ない値では変わらない）。どれも 31 ビットに収まる', () => {
    const k = (pt: Partial<PtTelemetry>, flags = 0): number => keyOf(tele(pt), 0, flags);
    expect(k({ ...FIRING, gunTargetM: 201 })).toBe(k({ ...FIRING, gunTargetM: 249 }));
    expect(k({ ...FIRING, gunTargetM: 249 })).not.toBe(k({ ...FIRING, gunTargetM: 251 }));
    expect(k({ ...FIRING, gunHits: 3 })).not.toBe(k({ ...FIRING, gunHits: 4 }));
    expect(k({ ...FIRING, gunFast: true, gunHits: 3 })).toBe(k({ ...FIRING, gunFast: true, gunHits: 4 })); // 速いの文に命中は出ない
    expect(k({ ...FIRING, gunTargetM: 400, gunHits: 3 })).toBe(k({ ...FIRING, gunTargetM: 400, gunHits: 9 })); // 遠いの文にも
    expect(k({ ...RUSH, gunStatus: PT_GUN_RELOAD, reloadLeftS: 3.2 })).toBe(k({ ...RUSH, gunStatus: PT_GUN_RELOAD, reloadLeftS: 3.01 }));
    expect(k({ ...RUSH, gunStatus: PT_GUN_RELOAD, reloadLeftS: 3.0 })).not.toBe(k({ ...RUSH, gunStatus: PT_GUN_RELOAD, reloadLeftS: 3.01 }));
    expect(k({ ...RUSH, gunStatus: GUN_OUT_OF_ARC, gunHits: 1, gunTargetM: 0 })).toBe(k({ ...RUSH, gunStatus: GUN_OUT_OF_ARC, gunHits: 5 }));
    expect(k({ ...RUSH, gunStatus: GUN_BLOCKED })).toBe(k({ ...RUSH, gunStatus: GUN_NO_TARGET })); // 同じ文
    expect(k({ gunEvent: PT_GUN_EV_CREW, fighting: 1 }, EVENT)).not.toBe(k({ gunEvent: PT_GUN_EV_CREW, fighting: 0 }, EVENT));
    expect(k({ gunEvent: PT_GUN_EV_CREW, fighting: 1 }, EVENT)).not.toBe(k({ gunEvent: PT_GUN_EV_HULL, fighting: 1 }, EVENT));
    expect(k({ ...RUSH, passing: true, dodge: 1, escapeDeg: 315, passSilenced: true })).toBe(k({ ...RUSH, passing: true, dodge: -1, escapeDeg: 90, fired: true, passSilenced: true }));
    for (const pt of [{ ...FIRING, gunTargetM: 3150, gunHits: 63 }, { ...RUSH, gunStatus: PT_GUN_RELOAD, reloadLeftS: 9 }, { alive: 0, sunk: 2 }]) {
      const key = k(pt);
      expect(Number.isInteger(key) && key >= 0 && key < 2 ** 31, JSON.stringify(pt)).toBe(true);
    }
    const allSunk = keyOf(tele({ alive: 0, out: 0, sunk: 2 }, { dawn: { ...createDawnTelemetry(), reached: true }, homeEdgeM: 6300 }));
    expect(allSunk >= 0 && allSunk < 2 ** 31).toBe(true);
  });
});

describe('航過・離脱・平常の行の 13mm の変化（ui/pt-lines）', () => {
  it('航過中の PT が被弾で黙った: 「もう撃ってこない」（味方の青。赤い線と航過は続く）', () => {
    const pass = { ...RUSH, passing: true, threatPhase: PT_PASS, dodge: 1, escapeDeg: 315, fired: true };
    expect(row(tele({ ...pass, passSilenced: true }))).toEqual([MISSION_PT_PASS, '米PT 被弾で沈黙！ もう撃ってこない', HOME_COLOR_TEXT]);
    expect(row(tele(pass))[1]).toBe('米PT 掃射！ 北西へ転舵・全速');
  });
  it('離脱の末尾: 13mm を撃つ前は「右下の射撃で撃ち返せ」、撃った後と砲の無い任務は「次の赤い線に備えよ」。キーも変わる', () => {
    const br = { detected: true, threatPhase: PT_BREAK, passes: 1, dx: 300, dy: -400 };
    expect(row(tele(br))).toEqual([MISSION_PT_CONTACT, '米PT 離脱 ・ 残り 7 回 ・ 右下の射撃で撃ち返せ', HUD_COLOR_STRONG]);
    expect(row(tele({ ...br, gunEverFired: true }))[1]).toBe('米PT 離脱 ・ 残り 7 回 ・ 次の赤い線に備えよ');
    expect(row(tele({ ...br, gunEnabled: false }))[1]).toBe('米PT 離脱 ・ 残り 7 回 ・ 次の赤い線に備えよ');
    expect(keyOf(tele(br))).not.toBe(keyOf(tele({ ...br, gunEverFired: true })));
    // 突撃の行は撃ったかで変わらない
    expect(keyOf(tele(RUSH))).toBe(keyOf(tele({ ...RUSH, gunEverFired: true })));
  });
  it('みな去った・沈めた: 1 隻沈めて 1 隻去る途中は「去る」、海域の外へ出たら「去った」、みな沈めたら「全隻撃沈」（夜明けの後も）', () => {
    const dawn = { ...createDawnTelemetry(), reached: true };
    expect(row(tele({ alive: 0, out: 0, sunk: 1 }))[1]).toBe('米PT は東へ去る ・ 帰投せよ  2000 m');
    expect(row(tele({ alive: 0, out: 1, sunk: 1 }))[1]).toBe('米PT は東へ去った ・ 帰投せよ  2000 m');
    expect(row(tele({ alive: 0, out: 0, sunk: 2 }))).toEqual([MISSION_PT, '米PT は全隻撃沈 ・ 帰投せよ  2000 m', HUD_COLOR_STRONG]);
    expect(row(tele({ alive: 0, out: 0, sunk: 2 }, { dawn, homeEdgeM: 301 }))[1]).toBe('夜明け ・ 米PT は全隻撃沈 ・ 帰投せよ  400 m');
    expect(keyOf(tele({ alive: 0, out: 1, sunk: 1 }))).toBe(keyOf(tele({ alive: 0, out: 2, sunk: 0 }))); // 同じ文
    expect(keyOf(tele({ alive: 0, out: 0, sunk: 2 }))).not.toBe(keyOf(tele({ alive: 0, out: 2, sunk: 0 })));
  });
  it('航過の上限は撃退・撃沈でだけ減る（終わった航過 + 結末の無い PT の残り）。「航過 n/M」「残り N 回」', () => {
    const w = ptWorld();
    const q = w.pts.section;
    const t = initPtTelemetry(w);
    expect(t.maxPasses).toBe(8);
    q.boats[0]!.passes = 1;
    q.boats[1]!.passes = 1;
    q.passes = 2;
    refreshPtTelemetry(t, w);
    expect([t.maxPasses, t.fighting]).toEqual([8, 2]);
    q.boats[0]!.phase = PT_LEAVE; // 夜明けに去っても減らない（v0.6.3 と同じ）
    expect(ptMaxPasses(q, w.pts.p)).toBe(8);
    q.boats[0]!.fate = PT_FATE_CREW; // 撃退: 残り 3 回が消える
    refreshPtTelemetry(t, w);
    expect([t.maxPasses, t.fighting]).toEqual([5, 1]);
    expect(row(tele({ ...t, detected: true, threatPhase: PT_BREAK, dx: 300, dy: -400 }))[1]).toBe('米PT 離脱 ・ 残り 3 回 ・ 右下の射撃で撃ち返せ');
    expect(row(tele({ ...t, detected: true, passSeq: 2, lastPassFired: true, lastPassHits: 0 }), 0, RESULT)[1]).toBe('かわした！ 被弾なし ・ 航過 2/5');
    q.boats[1]!.phase = PT_SUNK; // 撃沈
    q.boats[1]!.fate = PT_FATE_SUNK;
    q.sunk = 1;
    refreshPtTelemetry(t, w);
    expect([t.maxPasses, t.fighting, t.sunk, t.alive]).toEqual([2, 0, 1, 0]);
  });
});

describe('13mm のテレメトリと Result の材料（systems/pt-telemetry）', () => {
  it('状態・速い（撃っている間だけ）・距離・命中・撃ったか・交換の残り・出来事・黙った航過', () => {
    const w = ptWorld();
    const q = w.pts.section;
    const g = w.pts.gun!.state;
    const t = initPtTelemetry(w);
    g.battery.status = GUN_OUT_OF_ARC;
    g.battery.fast = true;
    refreshPtTelemetry(t, w);
    expect([t.gunStatus, t.gunFast, t.gunEverFired]).toEqual([GUN_OUT_OF_ARC, false, false]);
    Object.assign(g.battery, { status: GUN_FIRING, targetM: 412.5, shots: 7 });
    g.reloadLeftS = 1.5;
    q.gunHits = 2;
    q.gunEventSeq = 1;
    q.gunEvent = PT_GUN_EV_HULL;
    q.owner = 0;
    q.boats[0]!.phase = PT_PASS;
    q.boats[0]!.fate = PT_FATE_HULL;
    refreshPtTelemetry(t, w);
    expect([t.gunStatus, t.gunFast, t.gunTargetM, t.gunHits, t.gunEverFired, t.reloadLeftS, t.gunEventSeq, t.gunEvent, t.passSilenced, t.fighting]).toEqual([GUN_FIRING, true, 412.5, 2, true, 1.5, 1, PT_GUN_EV_HULL, true, 1]);
  });
  it('Result: 13mm の数・閃光・enemy id。撃退は今の結末で数える（撃退の後に沈んだ PT は撃沈だけ）。砲の無い任務は gunEnabled false で 0', () => {
    const w = ptWorld();
    const q = w.pts.section;
    w.pts.gun!.state.battery.shots = 120;
    Object.assign(q, { gunHits: 9, retired: 2, sunk: 1, flashFirst: true });
    q.boats[0]!.fate = PT_FATE_CREW;
    q.boats[1]!.fate = PT_FATE_SUNK; // 撃退の後に航過を抜けるところで沈んだ（q.retired は 2 のまま）
    q.boats[1]!.phase = PT_SUNK;
    const r = ptResult(w)!;
    expect([r.enemyId, r.gunEnabled, r.gunShots, r.gunHits, r.retired, r.sunk, r.flashFirst]).toEqual(['us_pt_enemy', true, 120, 9, 1, 1, true]);
    const n = ptResult(ptWorld(false))!;
    expect([n.gunEnabled, n.gunShots, n.gunHits, n.retired, n.sunk]).toEqual([false, 0, 0, 0, 0]);
  });
});

/** Result の材料（撃たなかった夜。tests/jp05-mission と同じ形） */
const BASE: PtResult = {
  enemyId: 'us_pt_enemy', total: 2, out: 0, alive: 2, leftAtDawn: false, passes: 5, maxPasses: 8, firedPasses: 4, cleanPasses: 2, shots: 40, hits: 4, damagePerHit: 4, hpMax: 50,
  firstDetectM: 1199.6, firstDetectBand: 'silent', lostContacts: 0, closestM: 120, minWarnS: 2.52,
  gunEnabled: true, gunShots: 0, gunHits: 0, retired: 0, sunk: 0, flashFirst: false,
};

describe('13mm の Result（ui/pt-lines）', () => {
  it('4 行目: 撃った夜は射撃・命中（率）・撃退・撃沈、撃たなかった夜はそう言う、砲の無い任務は出さない。最初に見つかったのが閃光なら 2 行目は「閃光」', () => {
    const fired: PtResult = { ...BASE, gunShots: 236, gunHits: 9, retired: 1, sunk: 0 };
    expect(ptResultLines(fired, 1, true)[3]).toBe('13mm 射撃 236 発 ・ 命中 9（4%） ・ 撃退 1 ・ 撃沈 0');
    expect(ptResultLines(BASE, 1, true)[3]).toBe('13mm は撃たなかった');
    expect(ptResultLines({ ...BASE, gunEnabled: false }, 1, true)[3]).toBe('');
    expect(ptResultLines(BASE, 1, true)[1]).toBe('見つかった 1 回（最初 1200 m ・ 静音） ・ 見失わせた 0 回');
    expect(ptResultLines({ ...fired, firstDetectM: 520, flashFirst: true }, 1, true)[1]).toBe('見つかった 1 回（最初 520 m ・ 閃光） ・ 見失わせた 0 回');
    // 1・3 行目は 13mm で変わらない
    expect(ptResultLines(fired, 1, true).slice(0, 3)).toEqual([ptResultLines(BASE, 1, true)[0], ptResultLines(BASE, 1, true)[1], ptResultLines(BASE, 1, true)[2]]);
  });
  it('頭: 撃沈・撃退の数（0 は出さない）の後に今までの尾。みな沈めたら尾なし。13mm の効果が無ければ v0.6.3 と同じ', () => {
    expect(ptHeadJa(BASE)).toBe('米PT: 健在 2 隻');
    expect(ptHeadJa({ ...BASE, alive: 0, out: 2 })).toBe('米PT: 去った');
    expect(ptHeadJa({ ...BASE, alive: 0, leftAtDawn: true })).toBe('米PT: 夜明けに去った');
    expect(ptHeadJa({ ...BASE, sunk: 1, retired: 1, alive: 0, out: 1 })).toBe('米PT: 撃沈 1 ・ 撃退 1 ・ 去った');
    expect(ptHeadJa({ ...BASE, sunk: 1, alive: 1 })).toBe('米PT: 撃沈 1 ・ 健在 1 隻');
    expect(ptHeadJa({ ...BASE, retired: 1, alive: 1 })).toBe('米PT: 撃退 1 ・ 健在 1 隻');
    expect(ptHeadJa({ ...BASE, retired: 2, alive: 0, leftAtDawn: true })).toBe('米PT: 撃退 2 ・ 夜明けに去った');
    expect(ptHeadJa({ ...BASE, sunk: 2, alive: 0 })).toBe('米PT: 撃沈 2');
  });
  it('幅: Result の 4 行目と頭（いちばん長い値）は縮めずに画面の幅に収まる（20 px。論理幅 1280 − 左右の HUD_MARGIN 48）', () => {
    const MAX = 1280 - 2 * 24;
    const wide: PtResult = { ...BASE, gunShots: 9999, gunHits: 999, retired: 2, sunk: 2, flashFirst: true, firstDetectM: 1200, lostContacts: 99 };
    for (const l of ptResultLines(wide, 99, true).slice(1)) expect(textWidthPx(l, 20), l).toBeLessThanOrEqual(MAX);
    for (const head of [ptHeadJa({ ...wide, sunk: 1, retired: 1, alive: 1 }), ptHeadJa({ ...wide, sunk: 1, retired: 1, alive: 0, leftAtDawn: true })]) {
      const status = `${head}   帰投: なし   艇 HP 50 / 50   乗員 7/7   燃料 100%   9999 秒`;
      expect(textWidthPx(status, 20), status).toBeLessThanOrEqual(MAX);
    }
  });
});

describe('13mm の行の幅（22 px・論理幅 1280 で左上の時計を避けても縮まない）', () => {
  it('どの新しい行もいちばん長い値で 840 px 以内', () => {
    const dawn = { ...createDawnTelemetry(), reached: true };
    const far = { ...RUSH, gunEverFired: true, gunTargetM: 3150, gunHits: 63 };
    const cases: [Partial<PtTelemetry>, Partial<BoatTelemetry>, number][] = [
      [{ ...far, gunStatus: GUN_FIRING }, {}, 0],
      [{ ...far, gunStatus: GUN_FIRING, gunFast: true }, {}, 0],
      [{ ...far, gunStatus: GUN_FIRING, gunTargetM: 600 }, {}, 0],
      [{ ...RUSH, gunStatus: PT_GUN_RELOAD, reloadLeftS: 9 }, {}, 0],
      [{ ...RUSH, gunStatus: GUN_OUT_OF_ARC }, {}, 0],
      [{ ...RUSH, gunStatus: GUN_OUT_OF_RANGE }, {}, 0],
      [{ ...RUSH, gunStatus: GUN_NO_TARGET }, {}, 0],
      ...[PT_GUN_EV_CREW, PT_GUN_EV_HULL, PT_GUN_EV_SUNK].flatMap((e): [Partial<PtTelemetry>, Partial<BoatTelemetry>, number][] => [
        [{ gunEvent: e, fighting: 7 }, {}, EVENT],
        [{ gunEvent: e, fighting: 0 }, {}, EVENT],
      ]),
      [{ ...RUSH, passing: true, passSilenced: true }, {}, 0],
      [{ detected: true, threatPhase: PT_BREAK, passes: 0, maxPasses: 15 }, {}, 0],
      [{ detected: true, threatPhase: PT_BREAK, passes: 0, maxPasses: 15, gunEverFired: true }, {}, 0],
      [{ alive: 0, out: 0, sunk: 2 }, { dawn, homeEdgeM: 6300 }, 0],
    ];
    for (const [pt, over, flags] of cases) {
      const [mode, text] = row(tele(pt, over), 0, flags);
      expect(text, `${mode} ${JSON.stringify(pt)}`).not.toBe('');
      expect(textWidthPx(text, 22), text).toBeLessThanOrEqual(LINE2_MAX_PX);
    }
  });
});

/** 撃ち合う夜の台本: 見つかったら脅威の PT に舷側を向けて止まり（止まって撃ち合う罠。命中が多く撃退・撃沈が出る）、生きた PT が見えていれば押し続ける */
function fight(s: PtSim): void {
  s.input.headingDeg = (Math.atan2(HOME.x - s.boat.x, -(HOME.y - s.boat.y)) * 180) / Math.PI;
  s.input.speed01 = CRUISE01;
  const i = s.q.detected ? threatIndex(s.q, s.boat.x, s.boat.y) : -1;
  if (i < 0) return;
  const b = s.q.boats[i]!;
  const brg = (Math.atan2(b.x - s.boat.x, -(b.y - s.boat.y)) * 180) / Math.PI;
  s.input.headingDeg = (brg + 90 + 360) % 360;
  s.input.speed01 = 0;
}
function seesLivePt(s: PtSim): boolean {
  return s.q.boats.some((b) => b.phase <= PT_BREAK && (b.x - s.boat.x) ** 2 + (b.y - s.boat.y) ** 2 <= S05.visRange2);
}

/**
 * mission-line の時刻の旗（航過の結果・13mm の出来事を通し番号が増えてから 2,500 ms）を真似て、1 夜の 2 行目を集める。shoot は撃ち合う台本（無ければ巡航で帰り、押さない）。
 * passTop は航過中（赤い線が出ている）のステップのモードがみな航過だった
 */
function nightLines(seed: number, withGun: boolean, shoot = false): { lines: string[]; modes: Set<number>; maxPasses: Set<number>; passTop: boolean; events: number } {
  const w = ptWorld(withGun);
  const lines: string[] = [];
  const modes = new Set<number>();
  const maxPasses = new Set<number>();
  let passTop = true;
  let seenPass = 0;
  let resultUntil = -1;
  let seenEvent = 0;
  let eventUntil = -1;
  let t: PtTelemetry | null = null;
  runPtSim({
    seed,
    steps: 60 * 170,
    night: true,
    stopAtHome: true,
    gunHeld: withGun ? (s) => shoot && seesLivePt(s) : undefined,
    policy: (s) => {
      if (shoot) return fight(s);
      s.input.headingDeg = (Math.atan2(HOME.x - s.boat.x, -(HOME.y - s.boat.y)) * 180) / Math.PI;
      s.input.speed01 = CRUISE01;
    },
    onStep: (s) => {
      // ptWorld の隊と砲を模擬のものに差し替える（初回だけ）
      if (!t) {
        Object.assign(w.pts, { section: s.q, p: s.p, gun: s.gun ? { state: s.gun, g: S05.guns! } : null });
        t = initPtTelemetry(w);
      }
      w.boat.state = s.boat;
      refreshPtTelemetry(t, w);
      const ms = s.t * 1000;
      if (t.passSeq > seenPass) {
        seenPass = t.passSeq;
        resultUntil = ms + 2500;
      }
      if (t.gunEventSeq > seenEvent) {
        seenEvent = t.gunEventSeq;
        eventUntil = ms + 2500;
      }
      const flags = (ms < resultUntil ? RESULT : 0) | (ms < eventUntil ? EVENT : 0);
      const [mode, text] = row(tele(t), 0, flags);
      if (s.q.owner >= 0 && mode !== MISSION_PT_PASS) passTop = false;
      modes.add(mode);
      maxPasses.add(t.maxPasses);
      if (lines[lines.length - 1] !== text) lines.push(text);
    },
  });
  return { lines, modes, maxPasses, passTop, events: seenEvent };
}

describe('射撃を押さない夜（spec r1 §H）', () => {
  it('砲を積んでいても押さなければ、13mm の無い米PT の任務と同じ行（離脱の末尾だけ違う）。13mm の行は出ず、航過の上限は 8 のまま、行はみな v0.6.3 の形', () => {
    const V063 = [
      /^米PT (航過|掃射)！ (\S+へ転舵・全速|そのまま全速で離れろ)$/,
      /^(かわした！ 被弾なし|被弾 \d+ 発（HP −\d+）|撃たせなかった！) ・ 航過 \d+\/8$/,
      /^米PT \S+から突撃 \d+ m ・ 赤い線で転舵$/,
      /^米PT のエンジン音 ・ \S+から突撃$/,
      /^米PT 離脱 ・ 残り \d+ 回 ・ (右下の射撃で撃ち返せ|次の赤い線に備えよ)$/,
      /^米PT \d+ m（\S+） ・ 気づかれていない ・ 静音でやり過ごせ$/,
      /^米PT \d+ m ・ 速い！ \d+ m で見つかる ・ 14 kt 以下に$/,
      /^米PT \d+ 隻が哨戒中 ・ 静音で抜けて帰投$/,
      /^(夜明け ・ )?米PT は東へ(去る|去った) ・ 帰投せよ {2}\d+ m$/,
      /^$/, // 米PT のモードでない（帰投せよ・平常）
    ];
    let results = 0;
    let passes = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const a = nightLines(seed, true);
      const b = nightLines(seed, false);
      const norm = (l: string): string => l.replace('右下の射撃で撃ち返せ', '〈末尾〉').replace('次の赤い線に備えよ', '〈末尾〉');
      expect(a.lines.map(norm), `${seed}`).toEqual(b.lines.map(norm));
      expect(a.modes.has(MISSION_PT_GUN) || a.modes.has(MISSION_PT_GUN_EVENT), `${seed}`).toBe(false);
      expect([...a.maxPasses], `${seed}`).toEqual([8]);
      for (const l of a.lines) expect(V063.some((re) => re.test(l)), `${seed}: ${l}`).toBe(true);
      results += a.lines.filter((l) => / ・ 航過 \d+\/8$/.test(l)).length;
      passes += a.lines.filter((l) => l.startsWith('米PT 航過！') || l.startsWith('米PT 掃射！')).length;
    }
    // 赤い線と航過の結果が出た夜がある（離脱の行は挟み撃ちでもう 1 隻がいつも突撃の行なので、まれ。末尾の違いは上の離脱の行のテスト）
    expect(passes).toBeGreaterThan(6);
    expect(results).toBeGreaterThan(6);
  });
});

describe('射撃を押し続ける夜（台本: 見つかったら舷側を向けて止まり、撃ち合う）', () => {
  it('射撃の行・弾倉交換・撃退と撃沈の行が出て、文はみな決まった形。航過中（赤い線）はいつも赤い線の行がいちばん上', () => {
    const GUN = [
      /^射撃中 ・ PT \d+ m ・ (命中 \d+|速くて散る（14 kt 以下で）|遠い（300 m 以内で）)$/,
      /^弾倉交換 ・ あと [1-4] 秒$/,
      /^射界外 ・ 舷側に向けよ（艇首・艇尾は撃てない）$/,
      /^射程外 ・ 600 m まで引きつけよ$/,
      /^撃てる PT が見えない$/,
      /^米PT (撃退！ 死傷者が出て離脱|撃退！ 穴だらけで離脱|撃沈！ ガソリンに引火) ・ (残り 1 隻|帰投せよ)$/,
    ];
    // 13mm の行でなければ、v0.6.3 の行か 13mm で変わった行（黙った航過・減る上限・全隻撃沈）
    const OTHER = [
      /^米PT (航過|掃射)！ (\S+へ転舵・全速|そのまま全速で離れろ)$/,
      /^米PT 被弾で沈黙！ もう撃ってこない$/,
      /^(かわした！ 被弾なし|被弾 \d+ 発（HP −\d+）|撃たせなかった！) ・ 航過 \d+\/[1-8]$/,
      /^米PT \S+から突撃 \d+ m ・ 赤い線で転舵$/,
      /^米PT のエンジン音 ・ \S+から突撃$/,
      /^米PT 離脱 ・ 残り \d+ 回 ・ 次の赤い線に備えよ$/,
      /^米PT \d+ m（\S+） ・ 気づかれていない ・ 静音でやり過ごせ$/,
      /^米PT \d+ m ・ 速い！ \d+ m で見つかる ・ 14 kt 以下に$/,
      /^米PT \d+ 隻が哨戒中 ・ 静音で抜けて帰投$/,
      /^(夜明け ・ )?米PT は(東へ去る|東へ去った|全隻撃沈) ・ 帰投せよ {2}\d+ m$/,
      /^$/,
    ];
    const seen = new Set<string>();
    let events = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const r = nightLines(seed, true, true);
      expect(r.passTop, `${seed}`).toBe(true);
      events += r.events;
      for (const l of r.lines) {
        const m = GUN.findIndex((re) => re.test(l));
        if (m >= 0) seen.add(String(m));
        else expect(OTHER.some((re) => re.test(l)), `${seed}: ${l}`).toBe(true);
      }
    }
    expect(seen.has('0') && seen.has('1')).toBe(true); // 射撃中・弾倉交換
    expect(events).toBeGreaterThan(0); // 撃退か撃沈が 12 夜のどこかで
    expect(seen.has('5')).toBe(true);
  });
});
