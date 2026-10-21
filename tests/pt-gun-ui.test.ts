// T-14 の 13mm（v0.6.3 実機 1 回目。spec r1 §E・§H）の HUD: 2 行目の射撃・撃退と撃沈の行（ui/pt-gun-lines）、被弾で黙った航過・離脱の末尾・全隻撃沈・
// 撃退と撃沈で減る航過の上限（ui/pt-lines・systems/pt-telemetry）、優先順（赤い線 > 13mm の出来事 > 航過の結果 > 射撃 > 突撃・離脱。ui/mission-mode）、射撃ボタンの弾倉交換、
// どの行もいちばん長い値で縮まない幅。テレメトリ・Result・押す夜／押さない夜の台本は tests/pt-gun-result.test.ts（レビュー NP-5 で 300 行を超えないよう分けた）。
// レビューの直し: 何も撃てない射撃の行（射程外・見えない）は突撃の行の下（ux-1）、見つかる前は撃つまで静音の行のまま（ux-3・NP-1）、速くて遠いは 1 つの文（ux-6）、命中は計（ux-5）。
import { describe, expect, it } from 'vitest';
import { HOME_COLOR_TEXT, HUD_COLOR_STRONG, HUD_COLOR_WARN } from '../src/config/hud-text-config';
import { GUN_BUTTON_LABEL } from '../src/config/hunt-config';
import type { BoatTelemetry } from '../src/core/boat-motion';
import { createDawnTelemetry } from '../src/core/dawn-air';
import { AS_T_RUN } from '../src/core/air-strike';
import { GUN_BLOCKED, GUN_FIRING, GUN_NO_TARGET, GUN_OUT_OF_ARC, GUN_OUT_OF_RANGE, GUN_SAFE } from '../src/core/gun-battery';
import { CALL_DAWN, CALL_FUEL } from '../src/core/mission-flow';
import { PT_ALERT, PT_BREAK, PT_FATE_CREW, PT_FATE_SUNK, PT_LEAVE, PT_PASS, PT_RUN_IN, PT_SUNK, createPtTelemetry, type PtTelemetry } from '../src/core/pt-boats';
import { PT_GUN_EV_CREW, PT_GUN_EV_HULL, PT_GUN_EV_SUNK } from '../src/core/pt-damage';
import { PT_GUN_RELOAD } from '../src/core/pt-gun';
import { initPtTelemetry, ptMaxPasses, refreshPtTelemetry } from '../src/systems/pt-telemetry';
import { MISSION_ADRIFT, MISSION_CALL, MISSION_PT, MISSION_PT_CONTACT, MISSION_PT_GUN, MISSION_PT_GUN_EVENT, MISSION_PT_PASS, MISSION_STRIKE, MODE_FLAG_PT_GUN_EVENT, MODE_FLAG_PT_RESULT, missionMode, ptGunShown } from '../src/ui/mission-mode';
import { gunButtonLabel, gunButtonReloadN, holdShowUntil } from '../src/ui/pt-gun-lines';
import { LINE2_MAX_PX, PT0, S05, keyOf, ptWorld, row, tele, textWidthPx } from './pt-ui-kit';

const RESULT = MODE_FLAG_PT_RESULT;
const EVENT = MODE_FLAG_PT_GUN_EVENT;
/** 見つかって突撃してくる PT（北東 500 m） */
const RUSH: Partial<PtTelemetry> = { detected: true, threatPhase: PT_RUN_IN, dx: 300, dy: -400, sighted: true };
/** 見つかっていて、脅威の PT は離脱中（北東 500 m）。何も撃てない射撃の行（射程外・見えない）が出るのはこのとき */
const BRK: Partial<PtTelemetry> = { ...RUSH, threatPhase: PT_BREAK };
/** 射撃中（PT 250 m・命中 3） */
const FIRING: Partial<PtTelemetry> = { ...RUSH, gunStatus: GUN_FIRING, gunTargetM: 231, gunHits: 3, gunEverFired: true };

describe('13mm の 2 行目（ui/pt-gun-lines）', () => {
  it('出撃時: 砲あり（射程 600 m・有効 300 m）、押していない。砲の無い米PT の任務は gunEnabled false', () => {
    expect([PT0.gunEnabled, PT0.gunRangeM, PT0.gunEffectiveM, PT0.gunStatus, PT0.gunEverFired, PT0.gunHits, PT0.fighting, PT0.sunk, PT0.maxPasses]).toEqual([true, 600, 300, GUN_SAFE, false, 0, 2, 0, 8]);
    const none = initPtTelemetry(ptWorld(false));
    expect([none.gunEnabled, none.gunRangeM, none.maxPasses]).toEqual([false, NaN, 8]);
    expect(S05.guns!.label.startsWith('13mm')).toBe(true); // 文の「13mm」は jp_t14 の gun_battery（25mm に替えるなら文も替える）
  });
  it('射撃中: 距離（50 m 刻みの切り上げ）と命中（その夜の計）。速い（巡航・全速）・遠い（表示の距離が有効射程の外）・その両方は警告色。弾倉交換・射界外・射程外・見えない', () => {
    expect(row(tele(FIRING))).toEqual([MISSION_PT_GUN, '射撃中 ・ PT 250 m ・ 命中 計 3', HUD_COLOR_STRONG]);
    expect(row(tele({ ...FIRING, gunFast: true }))).toEqual([MISSION_PT_GUN, '射撃中 ・ PT 250 m ・ 速くて散る（14 kt 以下で）', HUD_COLOR_WARN]);
    expect(row(tele({ ...FIRING, gunTargetM: 301 }))).toEqual([MISSION_PT_GUN, '射撃中 ・ PT 350 m ・ 遠い（300 m 以内で）', HUD_COLOR_WARN]);
    expect(row(tele({ ...FIRING, gunTargetM: 300 }))[1]).toBe('射撃中 ・ PT 300 m ・ 命中 計 3'); // 300 m は有効射程の内
    // 速くて遠い: 1 つの文で両方（レビュー ux-6: 「速くて散る」だけだと 14 kt に落としても 550 m ではまだ当たらなかった）
    expect(row(tele({ ...FIRING, gunTargetM: 301, gunFast: true }))).toEqual([MISSION_PT_GUN, '射撃中 ・ PT 350 m ・ 遠くて速い（300 m 以内・14 kt 以下で）', HUD_COLOR_WARN]);
    expect(row(tele({ ...FIRING, gunTargetM: 550, gunFast: true }))[1]).toBe('射撃中 ・ PT 550 m ・ 遠くて速い（300 m 以内・14 kt 以下で）');
    expect(row(tele({ ...RUSH, gunStatus: PT_GUN_RELOAD, reloadLeftS: 3.2 }))).toEqual([MISSION_PT_GUN, '弾倉交換 ・ あと 4 秒', HUD_COLOR_STRONG]);
    expect(row(tele({ ...RUSH, gunStatus: PT_GUN_RELOAD, reloadLeftS: 0.01 }))[1]).toBe('弾倉交換 ・ あと 1 秒');
    expect(row(tele({ ...RUSH, gunStatus: GUN_OUT_OF_ARC }))).toEqual([MISSION_PT_GUN, '射界外 ・ 舷側に向けよ（艇首・艇尾は撃てない）', HUD_COLOR_WARN]);
    expect(row(tele({ ...BRK, gunStatus: GUN_OUT_OF_RANGE }))).toEqual([MISSION_PT_GUN, '射程外 ・ 600 m まで引きつけよ', HUD_COLOR_WARN]);
    expect(row(tele({ ...BRK, gunStatus: GUN_NO_TARGET }))).toEqual([MISSION_PT_GUN, '撃てる PT が見えない', HUD_COLOR_STRONG]);
    expect(row(tele({ ...BRK, gunStatus: GUN_BLOCKED }))[1]).toBe('撃てる PT が見えない');
    // 見つかる前に撃っても射撃の行（「発見された！」は 3 行目）
    expect(row(tele({ ...FIRING, detected: false }))[0]).toBe(MISSION_PT_GUN);
  });
  it('何も撃てない射撃の行（射程外・見えない・煙幕）は突撃の行に勝たない（レビュー ux-1: 押したままだと突撃の行が 1 夜に 1 度しか出ず、どちらの舷から来るかが文で見えなかった）。撃っている・交換・射界外は勝つ', () => {
    for (const st of [GUN_OUT_OF_RANGE, GUN_NO_TARGET, GUN_BLOCKED]) {
      expect(row(tele({ ...RUSH, gunStatus: st })), `${st}`).toEqual([MISSION_PT_CONTACT, '米PT 北東から突撃 500 m ・ 赤い線で転舵', HUD_COLOR_WARN]);
      expect(row(tele({ ...RUSH, threatPhase: PT_ALERT, sighted: false, gunStatus: st }))[1], `${st}`).toBe('米PT のエンジン音 ・ 北東から突撃');
      expect(row(tele({ ...BRK, gunStatus: st }))[0], `${st}`).toBe(MISSION_PT_GUN); // 離脱の間は射撃の行（押しても撃てない訳）
    }
    expect(row(tele(FIRING))[0]).toBe(MISSION_PT_GUN);
    expect(row(tele({ ...RUSH, gunStatus: PT_GUN_RELOAD, reloadLeftS: 2 }))[0]).toBe(MISSION_PT_GUN);
    expect(row(tele({ ...RUSH, gunStatus: GUN_OUT_OF_ARC }))[0]).toBe(MISSION_PT_GUN);
  });
  it('見つかる前は、撃つまで静音の行のまま（レビュー ux-3: 「引きつけよ」が気づいていない PT との撃ち合いへ誘っていた。撃てば閃光で見つかる）。押したままでも帰投せよを隠さない（NP-1）', () => {
    const quiet = { ...RUSH, detected: false, threatPhase: 0 };
    const stealth = '米PT 500 m（北東） ・ 気づかれていない ・ 静音でやり過ごせ';
    for (const st of [GUN_OUT_OF_RANGE, GUN_NO_TARGET, GUN_BLOCKED, GUN_OUT_OF_ARC]) {
      expect(row(tele({ ...quiet, gunStatus: st })), `${st}`).toEqual([MISSION_PT, stealth, HUD_COLOR_STRONG]);
      expect(row(tele({ ...quiet, gunStatus: st }, { targetStep: 'cruise', detectRangeM: 1200 }))[1], `${st}`).toBe('米PT 500 m ・ 速い！ 1200 m で見つかる ・ 14 kt 以下に');
      expect(row(tele({ ...quiet, sighted: false, gunStatus: st }))[1], `${st}`).toBe('米PT 2 隻が哨戒中 ・ 静音で抜けて帰投');
      // 夜明け・燃料の帰投せよ（PT が見えないまま押し続けても出る）
      for (const call of [CALL_DAWN, CALL_FUEL]) expect(row(tele({ ...quiet, sighted: false, gunStatus: st }), call)[0], `${st} ${call}`).toBe(MISSION_CALL);
    }
    // 撃てば（撃っている・交換）射撃の行
    expect(row(tele({ ...quiet, gunStatus: GUN_FIRING, gunTargetM: 580 }))[1]).toBe('射撃中 ・ PT 600 m ・ 遠い（300 m 以内で）');
    expect(row(tele({ ...quiet, gunStatus: PT_GUN_RELOAD, reloadLeftS: 1 }))[0]).toBe(MISSION_PT_GUN);
  });
  it('射撃ボタン: 弾倉の交換中は「弾倉交換 N」（2 行目と同じ切り上げ）で薄く、ほかは「射撃 押し続け」（レビュー ux-2: 赤い線の下で弾が止まる訳が見えなかった）。砲の無い任務は交換なし', () => {
    expect([gunButtonReloadN(tele({ reloadLeftS: 3.2 })), gunButtonReloadN(tele({ reloadLeftS: 0.01 })), gunButtonReloadN(tele({ reloadLeftS: 0 }))]).toEqual([4, 1, 0]);
    expect(gunButtonReloadN(tele({ gunEnabled: false, reloadLeftS: 2 }))).toBe(0);
    expect([gunButtonLabel(3), gunButtonLabel(0)]).toEqual(['弾倉交換\n3', GUN_BUTTON_LABEL]);
    expect(gunButtonLabel(0)).toBe('射撃\n押し続け');
  });
  it('出来事: 撃退（死傷・穴だらけ）・撃沈と、まだ戦う PT の数（0 なら帰投せよ）。味方の青', () => {
    expect(row(tele({ ...RUSH, gunEvent: PT_GUN_EV_CREW, fighting: 1 }), 0, EVENT)).toEqual([MISSION_PT_GUN_EVENT, '米PT 撃退！ 死傷者が出て離脱 ・ 残り 1 隻', HOME_COLOR_TEXT]);
    expect(row(tele({ ...RUSH, gunEvent: PT_GUN_EV_HULL, fighting: 1 }), 0, EVENT)[1]).toBe('米PT 撃退！ 穴だらけで離脱 ・ 残り 1 隻');
    expect(row(tele({ ...RUSH, gunEvent: PT_GUN_EV_SUNK, fighting: 1 }), 0, EVENT)[1]).toBe('米PT 撃沈！ ガソリンに引火 ・ 残り 1 隻');
    expect(row(tele({ gunEvent: PT_GUN_EV_SUNK, fighting: 0, alive: 0 }), 0, EVENT)).toEqual([MISSION_PT_GUN_EVENT, '米PT 撃沈！ ガソリンに引火 ・ 帰投せよ', HOME_COLOR_TEXT]);
    expect(row(tele({ gunEvent: PT_GUN_EV_CREW, fighting: 0, alive: 0 }), 0, EVENT)[1]).toBe('米PT 撃退！ 死傷者が出て離脱 ・ 帰投せよ');
  });
  it('時刻で出す行は上の行に隠れている間は始めない（R5）: 隠れている間は終わりを先へ送り、出てから 2,500 ms。隠れていない・時間切れの後は変えない', () => {
    expect(holdShowUntil(3500, true, 2000)).toBe(4500);
    expect(holdShowUntil(3500, false, 2000)).toBe(3500);
    expect(holdShowUntil(3500, true, 3500)).toBe(3500);
    expect(holdShowUntil(-1, true, 2000)).toBe(-1);
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
    expect(k({ ...FIRING, gunTargetM: 400, gunFast: true })).not.toBe(k({ ...FIRING, gunTargetM: 250, gunFast: true })); // 遠くて速い ≠ 速いだけ
    expect(k({ ...RUSH, gunStatus: PT_GUN_RELOAD, reloadLeftS: 3.2 })).toBe(k({ ...RUSH, gunStatus: PT_GUN_RELOAD, reloadLeftS: 3.01 }));
    expect(k({ ...RUSH, gunStatus: PT_GUN_RELOAD, reloadLeftS: 3.0 })).not.toBe(k({ ...RUSH, gunStatus: PT_GUN_RELOAD, reloadLeftS: 3.01 }));
    expect(k({ ...RUSH, gunStatus: GUN_OUT_OF_ARC, gunHits: 1, gunTargetM: 0 })).toBe(k({ ...RUSH, gunStatus: GUN_OUT_OF_ARC, gunHits: 5 }));
    expect(k({ ...BRK, gunStatus: GUN_BLOCKED })).toBe(k({ ...BRK, gunStatus: GUN_NO_TARGET })); // 同じ文
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

describe('13mm の行の幅（22 px・論理幅 1280 で左上の時計を避けても縮まない）', () => {
  it('どの新しい行もいちばん長い値で 840 px 以内', () => {
    const dawn = { ...createDawnTelemetry(), reached: true };
    const far = { ...RUSH, gunEverFired: true, gunTargetM: 3150, gunHits: 63 };
    const cases: [Partial<PtTelemetry>, Partial<BoatTelemetry>, number][] = [
      [{ ...far, gunStatus: GUN_FIRING }, {}, 0],
      [{ ...far, gunStatus: GUN_FIRING, gunFast: true }, {}, 0],
      [{ ...far, gunStatus: GUN_FIRING, gunTargetM: 600 }, {}, 0],
      [{ ...far, gunStatus: GUN_FIRING, gunTargetM: 3150, gunFast: true }, {}, 0],
      [{ ...RUSH, gunStatus: PT_GUN_RELOAD, reloadLeftS: 9 }, {}, 0],
      [{ ...RUSH, gunStatus: GUN_OUT_OF_ARC }, {}, 0],
      [{ ...BRK, gunStatus: GUN_OUT_OF_RANGE }, {}, 0],
      [{ ...BRK, gunStatus: GUN_NO_TARGET }, {}, 0],
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
