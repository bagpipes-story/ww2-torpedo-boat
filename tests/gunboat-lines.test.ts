// 隼艇（v0.6.6「日本ハードモード⑤：隼艇」。jp_01 のハード。spec-v066 §D.6・§G）の HUD の 2 行目と Result の文（ui/gunboat-lines・ui/pt-lines・ui/pt-gun-lines・ui/pt-line-clock）:
// 米PT が隼艇を狙う赤い線・突撃・追ってくる PT・結果、隼艇の砲の出来事、輸送隊の出来事の欄の隼艇の沈没と決着の末尾「隼艇は浜に残る」（全滅には付けない）、Result の隼艇の行と自艇の 25mm の行。
// 幅（22 px で 840 px、Result の 20 px で 1,232 px）、キーは方角・HP・数が変わったときだけ変わる、隼艇のいないテレメトリでは隼艇の文にならない、優先（同じ欄・同じ旗）、人物名なし。
// 名は jp_01 のハードの data（hard.gunboat.label_ja）。ui-config・game-config は DOM を読むので使わない（色は hud-text-config、幅は tests/pt-ui-kit の見積もり）。
import { describe, expect, it } from 'vitest';
import { CONVOY_EVENT_SHOW_MS } from '../src/config/convoy-config';
import { gameData } from '../src/config/game-data';
import { HOME_COLOR_TEXT, HUD_COLOR_STRONG, HUD_COLOR_WARN } from '../src/config/hud-text-config';
import type { BoatTelemetry } from '../src/core/boat-motion';
import { createConvoyTelemetry, type ConvoyTelemetry } from '../src/core/convoy';
import { createGunboatTelemetry, type GunboatTelemetry } from '../src/core/gunboat';
import { PT_BREAK, PT_CHASE, PT_PASS, PT_RUN_IN, type PtTelemetry } from '../src/core/pt-boats';
import { PT_GUN_EV_CREW, PT_GUN_EV_HULL, PT_GUN_EV_SUNK, PT_GUN_EV_SUPPRESS } from '../src/core/pt-damage';
import { buildWorldSetup } from '../src/systems/world-setup';
import { CONVOY_EV_ARRIVED, CONVOY_EV_GB_BEACH, CONVOY_EV_GB_SUNK, CONVOY_EV_SUNK, convoyEventLine, convoyKey } from '../src/ui/convoy-lines';
import { K_GUNBOAT_EVENT, K_TARGET_GUNBOAT, convoyEventLineGb, gunboatResultLineJa } from '../src/ui/gunboat-lines';
import { MISSION_CONVOY_EVENT, MISSION_PT_CONTACT, MISSION_PT_GUN_EVENT, MISSION_PT_PASS, MODE_FLAG_CONVOY_EVENT, MODE_FLAG_PT_GUN_EVENT, MODE_FLAG_PT_RESULT, missionMode } from '../src/ui/mission-mode';
import { mergeBurstBits } from '../src/ui/pt-gun-lines';
import { PtLineClock } from '../src/ui/pt-line-clock';
import { ptKey, ptLine, ptResultLines } from '../src/ui/pt-lines';
import type { GunboatResult, PtResult } from '../src/ui/result-types';
import { PERSON_DENYLIST, RANK_RE } from './person-denylist';
import { LINE2_MAX_PX, tele, textWidthPx } from './pt-ui-kit';

const H = buildWorldSetup(gameData, 'jp_01', { hard: true });
const NAME = H.gunboat!.labelJa;
const MAX_HP = H.gunboat!.hullHp;
const RESULT = MODE_FLAG_PT_RESULT;
const EVENT = MODE_FLAG_PT_GUN_EVENT;
const CV_EVENT = MODE_FLAG_CONVOY_EVENT;

/** jp_01 の出撃時の輸送隊（tests/convoy-lines と同じ）と、自艇の南西 424 m の隼艇（HP 満タン） */
function cv(over: Partial<ConvoyTelemetry> = {}): ConvoyTelemetry {
  return { ...createConvoyTelemetry(), enabled: true, total: 3, afloat: 3, arrived: 0, sunk: 0, resolved: false, leftM: 3040, nearestDx: 0, nearestDy: 150, nearestM: 150, fromDirJa: '東', ...over };
}
function gb(over: Partial<GunboatTelemetry> = {}): GunboatTelemetry {
  return { ...createGunboatTelemetry(), enabled: true, dx: -300, dy: 300, distM: 424, hp: MAX_HP, maxHp: MAX_HP, labelJa: NAME, ...over };
}
/** jp_01 のハードのテレメトリ（米PT 3 隻・T-38 の静音の上限 13 kt・去るのは北東）。g が null なら隼艇のいないテレメトリ */
function th(pt: Partial<PtTelemetry> = {}, g: Partial<GunboatTelemetry> | null = {}, c: Partial<ConvoyTelemetry> = {}): BoatTelemetry {
  return tele({ silentMaxKt: 13, leaveDirJa: '北東', total: 3, ...pt }, { convoy: cv(c), gunboat: g ? gb(g) : createGunboatTelemetry() });
}
/** モード・文・色（flags は MODE_FLAG_*。mission-line と同じ: モード → ptKey → ptLine） */
function row(t: BoatTelemetry, flags = 0, merge = 0): [number, string, string] {
  const mode = missionMode(t, 0, flags);
  const l = ptLine(t, mode, ptKey(t, mode, flags, 0, merge));
  return [mode, l.text, l.color];
}
const keyAt = (t: BoatTelemetry, flags = 0): number => ptKey(t, missionMode(t, 0, flags), flags);

/** 北東 424 m の PT・隼艇を狙う赤い線・突撃・追ってくる PT・結果・出来事 */
const SEEN: Partial<PtTelemetry> = { detected: true, sighted: true, dx: 300, dy: -300, targetKind: 2 };
const PASS_GB: Partial<PtTelemetry> = { ...SEEN, passing: true, threatPhase: PT_PASS };
const BURST_GB: Partial<PtTelemetry> = { ...PASS_GB, burst: true };
const RUSH_GB: Partial<PtTelemetry> = { ...SEEN, threatPhase: PT_RUN_IN };
const CHASE_GB: Partial<PtTelemetry> = { ...SEEN, threatPhase: PT_CHASE };
const RES_GB: Partial<PtTelemetry> = { detected: true, threatPhase: PT_BREAK, passes: 2, maxPasses: 8, lastPassFired: true, lastPassHits: 4, lastPassTargetKind: 2, targetKind: 0 };
const EV_GB: Partial<PtTelemetry> = { detected: true, gunEventSeq: 1, gunEvent: PT_GUN_EV_CREW, gunEventBoat: 0, fighting: 2, gunEventByGunboat: true };

describe('隼艇を狙う米PT の 2 行目（spec-v066 §D.6・§N-3）', () => {
  it('赤い線: 航過・掃射・追撃（連射の撃つ前）・連射と、自艇から隼艇への方角。勧めは「近づいて撃ち返せ」（警告色）。黙った線は今の文', () => {
    expect(row(th(PASS_GB))).toEqual([MISSION_PT_PASS, `米PT 航過！ 南西の${NAME}を狙う ・ 近づいて撃ち返せ`, HUD_COLOR_WARN]);
    expect(row(th({ ...PASS_GB, fired: true }))[1]).toBe(`米PT 掃射！ 南西の${NAME}を狙う ・ 近づいて撃ち返せ`);
    expect(row(th(BURST_GB))[1]).toBe(`米PT 追撃！ 南西の${NAME}を狙う ・ 近づいて撃ち返せ`);
    expect(row(th({ ...BURST_GB, fired: true }))[1]).toBe(`米PT 連射！ 南西の${NAME}を狙う ・ 近づいて撃ち返せ`);
    expect(row(th({ ...PASS_GB, fired: true }, { dx: 0, dy: -500 }))[1]).toBe(`米PT 掃射！ 北の${NAME}を狙う ・ 近づいて撃ち返せ`);
    // 撃つ PT が黙った線（撃退・制圧）は標的が隼艇でも今の文とキー（2112 は v0.6.5 の黙った連射。tests/pt-line-bits）
    expect(row(th({ ...PASS_GB, passSilenced: true }))[1]).toBe('米PT 被弾で沈黙！ もう撃ってこない');
    expect(row(th({ ...BURST_GB, passSilenced: true }))[1]).toBe('米PT 制圧！ 連射をやめた');
    expect(keyAt(th({ ...BURST_GB, passSilenced: true }))).toBe(2112);
  });

  it('突撃（見えている・音だけ）と追ってくる PT（見えている・見えない）: PT の方角と距離の後に隼艇の方角。追ってくる PT に射撃の勧めは付けない', () => {
    expect(row(th(RUSH_GB))).toEqual([MISSION_PT_CONTACT, `米PT 北東から突撃 450 m ・ 南西の${NAME}を狙う`, HUD_COLOR_WARN]);
    expect(row(th({ ...RUSH_GB, sighted: false }))[1]).toBe(`米PT のエンジン音 ・ 北東から突撃 ・ 南西の${NAME}を狙う`);
    expect(row(th({ ...CHASE_GB, gunEverFired: false }))).toEqual([MISSION_PT_CONTACT, `米PT 北東から追撃 450 m ・ 南西の${NAME}を狙う`, HUD_COLOR_WARN]);
    expect(row(th({ ...CHASE_GB, sighted: false }))[1]).toBe(`米PT 北東から追撃 ・ 南西の${NAME}を狙う`);
    // 自艇を追う PT は今の文（v0.6.5 のまま）
    expect(row(th({ ...CHASE_GB, targetKind: 0, gunEverFired: true }))[1]).toBe('米PT 北東から追ってくる 450 m ・ 撃ち返せ');
  });

  it('攻撃の結果: 被弾（HP はその時の隼艇の HP／最大）・被弾なし・撃たず・撃つ前に黙らせた（守った）、連射の結果も（計 n 回）', () => {
    expect(row(th(RES_GB, { hp: 44 }), RESULT)).toEqual([MISSION_PT_CONTACT, `${NAME} 被弾 4 発（HP 44/${MAX_HP}） ・ 航過 2/8`, HUD_COLOR_STRONG]);
    expect(row(th({ ...RES_GB, lastPassHits: 0 }), RESULT)).toEqual([MISSION_PT_CONTACT, `${NAME} 被弾なし ・ 航過 2/8`, HOME_COLOR_TEXT]);
    expect(row(th({ ...RES_GB, lastPassFired: false, lastPassHits: 0 }), RESULT)).toEqual([MISSION_PT_CONTACT, `${NAME}への航過 撃たず ・ 航過 2/8`, HUD_COLOR_STRONG]);
    expect(row(th({ ...RES_GB, lastPassFired: false, lastPassHits: 0, lastPassSilenced: true }), RESULT)).toEqual([MISSION_PT_CONTACT, `${NAME}を守った！ 撃たせなかった ・ 航過 2/8`, HOME_COLOR_TEXT]);
    const burst = { ...RES_GB, burstFired: true, bursts: 12, lastPassHits: 6 };
    expect(row(th(burst, { hp: 36 }), RESULT)).toEqual([MISSION_PT_CONTACT, `${NAME} 連射 被弾 6 発（HP 36/${MAX_HP}） ・ 計 12 回`, HUD_COLOR_STRONG]);
    expect(row(th({ ...burst, lastPassHits: 0 }), RESULT)[1]).toBe(`${NAME} 連射 被弾なし ・ 計 12 回`);
    expect(row(th({ ...burst, lastPassHits: 0, lastPassFired: false }), RESULT)[1]).toBe(`${NAME}への連射 撃たず ・ 計 12 回`);
  });

  it('隼艇の砲が起こした出来事（モード 26・同じ旗）: 撃退（死傷・穴だらけ）・撃沈・制圧と残りの隻数。戦う PT が残らなければ今の作法。自艇の砲の出来事は今の文', () => {
    expect(row(th(EV_GB), EVENT)).toEqual([MISSION_PT_GUN_EVENT, `${NAME} 撃退！ 米PT 1 隻が離脱 ・ 残り 2 隻`, HOME_COLOR_TEXT]);
    expect(row(th({ ...EV_GB, gunEvent: PT_GUN_EV_HULL }), EVENT)[1]).toBe(`${NAME} 撃退！ 米PT 1 隻が離脱 ・ 残り 2 隻`);
    expect(row(th({ ...EV_GB, gunEvent: PT_GUN_EV_SUNK }), EVENT)[1]).toBe(`${NAME} 撃沈！ 米PT 1 隻 ・ 残り 2 隻`);
    expect(row(th({ ...EV_GB, gunEvent: PT_GUN_EV_SUPPRESS }), EVENT)[1]).toBe(`${NAME} 制圧！ 米PT 追撃をやめた ・ 残り 2 隻`);
    expect(row(th({ ...EV_GB, fighting: 0 }), EVENT)[1]).toBe(`${NAME} 撃退！ 米PT 1 隻が離脱 ・ 大発の上陸を待て`);
    expect(row(th({ ...EV_GB, fighting: 0 }, {}, { resolved: true, afloat: 0, arrived: 3 }), EVENT)[1]).toBe(`${NAME} 撃退！ 米PT 1 隻が離脱 ・ 帰投せよ`);
    expect(row(th({ ...EV_GB, gunEventByGunboat: false }), EVENT)[1]).toBe('米PT 撃退！ 死傷者が出て離脱 ・ 残り 2 隻');
    expect(keyAt(th(EV_GB), EVENT) & K_GUNBOAT_EVENT).toBe(K_GUNBOAT_EVENT);
    expect(keyAt(th({ ...EV_GB, gunEventByGunboat: false }), EVENT) & K_GUNBOAT_EVENT).toBe(0);
    // 自艇への連射の結果を足した出来事（今の merge）。隼艇の出来事では「自艇 被弾」（隼艇の被弾に読めた。レビュー ux:ux-2）、自艇の砲の出来事は今の「連射 被弾」
    const mb = (hits: number, fired = true): number => mergeBurstBits(th({ lastPassFired: fired, lastPassHits: hits }).pt);
    expect(row(th(EV_GB), EVENT, mb(6))[1]).toBe(`${NAME} 撃退！ 米PT 1 隻が離脱 ・ 自艇 被弾 6 発（HP −24） ・ 残り 2 隻`);
    expect(row(th(EV_GB), EVENT, mb(0))[1]).toBe(`${NAME} 撃退！ 米PT 1 隻が離脱 ・ 自艇 被弾なし ・ 残り 2 隻`);
    expect(row(th(EV_GB), EVENT, mb(0, false))[1]).toBe(`${NAME} 撃退！ 米PT 1 隻が離脱 ・ 連射を撃たせなかった ・ 残り 2 隻`);
    expect(row(th({ ...EV_GB, gunEventByGunboat: false }), EVENT, mb(6))[1]).toBe('米PT 撃退！ 死傷者が出て離脱 ・ 連射 被弾 6 発（HP −24） ・ 残り 2 隻');
  });
});

describe('輸送隊の出来事の欄（隼艇の沈没・決着の末尾。spec-v066 §N-10）と時計（ui/pt-line-clock）', () => {
  /** 時計を 1 フレーム進め、[旗, 種類, 文, 色]（文は mission-line と同じ convoyEventLineGb。出来事の欄が出ていなければ ''） */
  function step(c: PtLineClock, t: BoatTelemetry, ms: number): [number, number, string, string] {
    const f = c.flags(t, ms, -1);
    const mode = missionMode(t, 0, f);
    c.shown(mode, ms);
    const l = convoyEventLineGb(t, c.convoyEvent);
    return [f & CV_EVENT, c.convoyEvent, mode === MISSION_CONVOY_EVENT ? l.text : '', l.color];
  }
  it('隼艇の沈没は輸送隊の出来事（警告色・CONVOY_EVENT_SHOW_MS）。同じフレームに大発が沈んだら大発の出来事を残し、隼艇の沈没はもう出さない', () => {
    const c = new PtLineClock();
    step(c, th(), 0);
    expect(step(c, th({}, { sunk: true, hp: 0 }), 1000)).toEqual([CV_EVENT, CONVOY_EV_GB_SUNK, `${NAME} 沈没 ・ 大発は自艇で守れ`, HUD_COLOR_WARN]);
    expect(step(c, th({}, { sunk: true, hp: 0 }), 1000 + CONVOY_EVENT_SHOW_MS + 50)[0]).toBe(0);
    const d = new PtLineClock();
    step(d, th(), 0);
    expect(step(d, th({}, { sunk: true, hp: 0 }, { afloat: 2, sunk: 1 }), 1000).slice(0, 3)).toEqual([CV_EVENT, CONVOY_EV_SUNK, '大発 1 隻 沈没 ・ 残り 2 隻 ・ 近づいて撃ち返せ']);
    expect(step(d, th({}, { sunk: true, hp: 0 }, { afloat: 2, sunk: 1 }), 1100)[1]).toBe(CONVOY_EV_SUNK);
  });

  it('決着の出来事の末尾「隼艇は浜に残る」: 上陸した大発があり隼艇が浮いているときだけ（全滅・隼艇が先に沈んだ夜・隼艇のいない任務は付けない）。沈没の出来事を残した決着にも付く', () => {
    const at = (g: Partial<GunboatTelemetry> | null, done: Partial<ConvoyTelemetry>): [number, string] => {
      const c = new PtLineClock();
      step(c, th({}, g), 0);
      const r = step(c, th({}, g, done), 1000);
      return [r[1], r[2]];
    };
    expect(at({}, { afloat: 0, arrived: 3, resolved: true })).toEqual([CONVOY_EV_ARRIVED | CONVOY_EV_GB_BEACH, `大発 上陸 3/3 ・ 帰投せよ ・ ${NAME}は浜に残る`]);
    expect(at({}, { afloat: 0, arrived: 2, sunk: 1, resolved: true })).toEqual([CONVOY_EV_SUNK | CONVOY_EV_GB_BEACH, `大発 1 隻 沈没 ・ 上陸 2/3 ・ 帰投せよ ・ ${NAME}は浜に残る`]);
    expect(at({}, { afloat: 0, arrived: 0, sunk: 3, resolved: true })).toEqual([CONVOY_EV_SUNK, '大発 全滅 ・ 帰投せよ']);
    expect(at({ sunk: true, hp: 0 }, { afloat: 0, arrived: 3, resolved: true })[0]).toBe(CONVOY_EV_ARRIVED);
    expect(at(null, { afloat: 0, arrived: 3, resolved: true })).toEqual([CONVOY_EV_ARRIVED, '大発 上陸 3/3 ・ 帰投せよ']);
    // 沈没の出来事が出ている間の決着の上陸（v0.6.4 の作法で沈没の出来事を残す）にも末尾が付く
    const c = new PtLineClock();
    step(c, th(), 0);
    step(c, th({}, {}, { afloat: 1, arrived: 1, sunk: 1 }), 1000);
    expect(step(c, th({}, {}, { afloat: 0, arrived: 2, sunk: 1, resolved: true }), 2000).slice(1, 3)).toEqual([CONVOY_EV_SUNK | CONVOY_EV_GB_BEACH, `大発 1 隻 沈没 ・ 上陸 2/3 ・ 帰投せよ ・ ${NAME}は浜に残る`]);
    // 隼艇のいない任務は convoyEventLine と同じ（v0.6.5 の文）。輸送隊のキーは旗で変わる（bit 13）
    for (const ev of [CONVOY_EV_SUNK, CONVOY_EV_ARRIVED]) for (const done of [{}, { afloat: 0, arrived: 3, resolved: true }]) expect(convoyEventLineGb(th({}, null, done), ev)).toEqual(convoyEventLine(cv(done), ev));
    expect(convoyKey(cv(), false, CONVOY_EV_ARRIVED | CONVOY_EV_GB_BEACH) ^ convoyKey(cv(), false, CONVOY_EV_ARRIVED)).toBe(1 << 13);
  });

  it('出来事に足す連射の結果は、その連射の標的が自艇のときだけ（§N-7: 隼艇への連射の結果は出来事の後に別に出る）', () => {
    const run = (kind: number): [number, number] => {
      const c = new PtLineClock();
      c.flags(th(), 0, -1);
      c.flags(th(EV_GB), 100, -1);
      const f = c.flags(th({ ...EV_GB, passSeq: 1, burstFired: true, lastPassBoat: 0, lastPassFired: true, lastPassHits: 3, lastPassTargetKind: kind }), 200, -1);
      return [c.merge === 0 ? 0 : 1, f & (EVENT | RESULT)];
    };
    expect(run(0)).toEqual([1, EVENT]);
    expect(run(2)).toEqual([0, EVENT | RESULT]);
  });
});

describe('キーと幅（spec-v066 §G）', () => {
  it('キーは方角・HP・数が変わったときだけ変わる（同じ 8 方位の中で隼艇が動いても、HP を出さない結果で HP が減っても同じ）', () => {
    const k = (pt: Partial<PtTelemetry>, g: Partial<GunboatTelemetry> = {}, flags = 0): number => keyAt(th(pt, g), flags);
    expect(k(PASS_GB, { dx: -310, dy: 290 })).toBe(k(PASS_GB));
    expect(k(PASS_GB, { dx: 0, dy: 300 })).not.toBe(k(PASS_GB));
    expect(k(RUSH_GB, { dx: -280, dy: 320 })).toBe(k(RUSH_GB));
    expect(k(CHASE_GB, { dx: 300, dy: 300 })).not.toBe(k(CHASE_GB));
    expect(k(RES_GB, { hp: 40 }, RESULT)).not.toBe(k(RES_GB, { hp: 44 }, RESULT));
    expect(k({ ...RES_GB, lastPassHits: 0 }, { hp: 40 }, RESULT)).toBe(k({ ...RES_GB, lastPassHits: 0 }, { hp: 44 }, RESULT));
    expect(k({ ...RES_GB, passes: 3 }, {}, RESULT)).not.toBe(k(RES_GB, {}, RESULT));
    // 標的の種類 0 自艇・1 大発のキーには隼艇の印が立たない（隼艇のいないテレメトリでも同じ値）
    for (const kind of [0, 1]) {
      for (const [pt, flags] of [[PASS_GB, 0], [RUSH_GB, 0], [CHASE_GB, 0], [{ ...RES_GB, lastPassTargetKind: kind }, RESULT]] as const) {
        const p = { ...pt, targetKind: kind };
        expect(keyAt(th(p), flags) & K_TARGET_GUNBOAT).toBe(0);
        expect(keyAt(th(p), flags)).toBe(keyAt(th(p, null), flags));
        expect(row(th(p, null), flags)[1]).not.toContain(NAME);
      }
    }
  });

  it('いちばん長い数で組んでも 22 px で 840 px 以内（3,150 m・HP 2 桁・航過 12/12・計 15 回・1 回の連射の弾をみな受けた出来事）', () => {
    const far = { dx: 3000, dy: -3000 };
    const hits = H.ptBoats!.roundsPerPass;
    const bh = H.ptBoats!.burstRounds;
    const res = { ...RES_GB, passes: 12, maxPasses: 12, lastPassHits: hits };
    const lines = [
      row(th({ ...PASS_GB, fired: true }))[1], row(th({ ...BURST_GB, fired: true }))[1],
      row(th({ ...RUSH_GB, ...far }))[1], row(th({ ...RUSH_GB, sighted: false }))[1], row(th({ ...CHASE_GB, ...far }))[1],
      row(th(res, { hp: 12 }), RESULT)[1], row(th({ ...res, lastPassFired: false, lastPassSilenced: true }), RESULT)[1],
      row(th({ ...res, burstFired: true, bursts: 15, lastPassHits: bh }, { hp: 12 }), RESULT)[1],
      row(th({ ...EV_GB, fighting: 0 }), EVENT)[1], row(th({ ...EV_GB, gunEvent: PT_GUN_EV_SUPPRESS, fighting: 7 }), EVENT)[1],
      row(th(EV_GB), EVENT, mergeBurstBits(th({ lastPassFired: true, lastPassHits: bh }).pt))[1],
      row(th({ ...EV_GB, fighting: 0 }), EVENT, mergeBurstBits(th({ lastPassFired: true, lastPassHits: bh }).pt))[1],
      convoyEventLineGb(th(), CONVOY_EV_GB_SUNK).text, convoyEventLineGb(th({}, {}, { afloat: 0, arrived: 2, sunk: 1, resolved: true }), CONVOY_EV_SUNK | CONVOY_EV_GB_BEACH).text,
    ];
    expect(lines[2]).toBe(`米PT 北東から突撃 3150 m ・ 南西の${NAME}を狙う`);
    for (const l of lines) {
      expect(l).toContain(NAME);
      expect(textWidthPx(l, 22), l).toBeLessThanOrEqual(LINE2_MAX_PX);
      for (const n of PERSON_DENYLIST) expect(l, n).not.toContain(n);
      expect(l).not.toMatch(RANK_RE);
    }
  });
});

describe('Result（spec-v066 §D.6・§N-5・§N-8）', () => {
  const G: GunboatResult = { labelJa: NAME, hp: 44, maxHp: MAX_HP, hitsTaken: 4, sunk: false, sunkS: NaN, shots: 39, hits: 9, retired: 0, ptSunk: 0, suppressions: 1, attacked: 2 };
  /** 自艇の 25mm を撃った夜の米PT の記録（隊の数: 命中 20・撃退 1・撃沈 1・制圧 3） */
  const R: PtResult = {
    enemyId: 'us_pt_enemy', total: 3, out: 0, alive: 1, leftAtDawn: false, passes: 5, maxPasses: 12, firedPasses: 4, cleanPasses: 2, shots: 40, hits: 4, damagePerHit: 4, hpMax: 50,
    firstDetectM: 300, firstDetectBand: 'silent', lostContacts: 0, closestM: 120, minWarnS: 2.5, gunEnabled: true, gunShots: 200, gunHits: 20, retired: 1, sunk: 1, flashFirst: false, bursts: 1, suppressions: 3,
    passesOnBarges: 1, firstDetectKind: 2, gunLabel: '25mm',
  };
  it('隼艇の 1 行: 生還（HP）／沈没（秒）・命中／射撃・撃退・撃沈（あれば）・制圧・狙われ。撃たなかった夜はそう言う。20 px で 1,232 px 以内', () => {
    expect(gunboatResultLineJa(G)).toBe(`${NAME} 生還 HP 44/${MAX_HP} ・ 命中 9/39 発 ・ 撃退 0 ・ 制圧 1 ・ 狙われ 2 回`);
    expect(gunboatResultLineJa({ ...G, hp: 0, sunk: true, sunkS: 143.4, attacked: 3 })).toBe(`${NAME} 沈没（143 秒） ・ 命中 9/39 発 ・ 撃退 0 ・ 制圧 1 ・ 狙われ 3 回`);
    expect(gunboatResultLineJa({ ...G, retired: 1, ptSunk: 1 })).toBe(`${NAME} 生還 HP 44/${MAX_HP} ・ 命中 9/39 発 ・ 撃退 1 ・ 撃沈 1 ・ 制圧 1 ・ 狙われ 2 回`);
    expect(gunboatResultLineJa({ ...G, hp: MAX_HP, shots: 0, hits: 0, suppressions: 0, attacked: 0 })).toBe(`${NAME} 生還 HP ${MAX_HP}/${MAX_HP} ・ 撃たなかった ・ 狙われ 0 回`);
    const wide = gunboatResultLineJa({ ...G, sunk: true, sunkS: 999, shots: 9999, hits: 999, retired: 3, ptSunk: 3, suppressions: 15, attacked: 15 });
    expect(textWidthPx(wide, 20), wide).toBeLessThanOrEqual(1232);
  });
  it('自艇の 25mm の行（4 行目）は隊の数から隼艇の分を引いた自艇の分、最初に捉えたのが隼艇なら「隼艇」。頭の行は隊の数のまま。隼艇がいなければ今の行', () => {
    const [, b, , d] = ptResultLines(R, 3, true, true, { ...G, hits: 9, retired: 1, ptSunk: 0, suppressions: 1 });
    expect(d).toBe('25mm 射撃 200 発 ・ 命中 11（6%） ・ 制圧 2 ・ 撃退 0 ・ 撃沈 1');
    expect(b).toBe(`米PT が捉えた 3 回（最初 300 m ・ ${NAME}） ・ 見失わせた 0 回`);
    expect(ptResultLines(R, 3, true, true)[3]).toBe('25mm 射撃 200 発 ・ 命中 20（10%） ・ 制圧 3 ・ 撃退 1 ・ 撃沈 1');
    expect(ptResultLines({ ...R, firstDetectKind: 1 }, 3, true, true, G)[1]).toBe('米PT が捉えた 3 回（最初 300 m ・ 大発） ・ 見失わせた 0 回');
  });
});
