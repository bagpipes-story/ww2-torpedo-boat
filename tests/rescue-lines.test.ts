// v0.8.5 S4（spec-v0850 §8.2）: 救助の任務（us_07）の 2 行目（ui/rescue-lines の時計・ui/rescue-texts の文）・左上の時計・呼びかけ・救助の時間の終わりの帯。
// - 出来事（モード 46・4 秒）: 収容（群を替えても続けて拾えば 1 つ）・移した・40 名を渡した・フィッチの砲火で退いた・S ボートが来た（1 回）・砲弾（数を足す）・機雷（方角と距離・数を足す）・触雷（HP の減り）。
//   急ぎ（S ボート・砲弾・機雷・触雷）は米PT の接触の行より上（赤い線の下）、知らせは米PT の行の下で沿岸砲の射界の行の上。
// - 常の文（モード 47）: 沿岸砲の射界の行・見えている S ボートの平常の行の代わり（後ろに今の沿岸砲の句）。拾っている／移している間は呼びかけにも勝つ（燃料少を除く）。浅瀬は今のまま。
// - 幅: どの文も 22 px で 840 px の内・3 行目（今の文のまま）は 20 px で 596 px の内・人名と PT の番号なし。ほかの任務（t.rescue が無い）は旗 0・モードと文は今のまま。
import { describe, expect, it } from 'vitest';
import { HOME_COLOR_TEXT, HUD_COLOR_STRONG, HUD_COLOR_WARN } from '../src/config/hud-text-config';
import { RESCUE_EVENT_SHOW_MS } from '../src/config/rescue-hud-config';
import type { BoatTelemetry } from '../src/core/boat-telemetry';
import { CALL_DAWN, CALL_EXPENDED, CALL_FUEL, CALL_SUNK, topCall } from '../src/core/mission-flow';
import type { RescueTelemetry } from '../src/core/rescue-telemetry';
import { callLineText, clockJa, dawnBannerLines } from '../src/ui/dawn-lines';
import { DETECT_RANGE_STEP_M, STATUS_LABEL } from '../src/ui/hud-lines';
import { composeLineKeys, createLineKeys } from '../src/ui/mission-line-keys';
import {
  MISSION_BATTERY, MISSION_CALL, MISSION_NORMAL, MISSION_PT, MISSION_PT_CONTACT, MISSION_PT_PASS, MISSION_RESCUE, MISSION_RESCUE_EVENT, MODE_FLAG_RESCUE_EVENT, MODE_FLAG_RESCUE_URGENT, missionMode,
} from '../src/ui/mission-mode';
import { PT_ALERT } from '../src/core/pt-boats';
import { ptGunLine, ptGunKey } from '../src/ui/pt-gun-lines';
import { RESCUE_EV_BLOW, RESCUE_EV_MINE, RESCUE_EV_NONE, RESCUE_EV_OBJECTIVE, RESCUE_EV_PICKED, RESCUE_EV_RETREAT, RESCUE_EV_SBOAT, RESCUE_EV_SHELL, RESCUE_EV_TRANSFER, RescueLineClock } from '../src/ui/rescue-lines';
import {
  rescueBannerLines, rescueBlowJa, rescueCallHeadJa, rescueCallOf, rescueLine, rescueMineJa, rescueObjectiveJa, rescuePickedJa, rescueRetreatJa, rescueSboatJa, rescueShellJa, rescueStandingJa, rescueStandingKey,
  rescueStandingShown, rescueTransferJa, statusFitScale,
} from '../src/ui/rescue-texts';
import { specialLine } from '../src/ui/special-line';
import { StraitLineClock } from '../src/ui/strait-line-clock';
import { setupOf } from './column-world-kit';
import { code } from './core-rules-kit';
import { PERSON_DENYLIST, PT_NUMBER_RE, RANK_RE } from './person-denylist';
import { LINE2_MAX_PX, tele, textWidthPx } from './pt-ui-kit';

const S = setupOf('us_07');
const R = S.rescue!;
/** 3 行目（20 px）の上限（ui/evac-text の EVAC_STATUS_MAX_PX） */
const LINE3_MAX_PX = 596;
const DIRS = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'];
/** 救助のテレメトリ（us_07 の setup の名と数。読む欄だけ値を入れる） */
const res = (o: Partial<RescueTelemetry> = {}): RescueTelemetry => ({
  capacity: R.capacity, objective: R.objectiveDelivered, total: R.total, fitchJa: R.fitch.labelJa, corryJa: R.corry.labelJa, fitchRingM: R.fitch.ringM, pickupMaxKt: R.pickupMaxKt, coverM: R.fitch.coverM,
  aboard: 0, delivered: 0, deliveredAtReturn: 0, onWater: R.total, lostShell: 0, byOthers: 0, lostSunk: 0, objectiveReached: false, timeUp: false, picking: false, transferring: false,
  pickSeq: 0, pickRun: 0, transferSeq: 0, transferRun: 0, shellSeq: 0, nearDx: 900, nearDy: 600, nearCount: 7, fitchDx: -1200, fitchDy: 700,
  minesSeen: 0, minesBlown: 0, mineSeenSeq: 0, mineDx: NaN, mineDy: NaN, mineBlowSeq: 0, sboatRetreated: 0, sboatRetreatSeq: 0, sboatCovered: 0, ...o,
});
const NAMES = { nameJa: 'Sボート', sunkJa: '炎上' };
const T = (r: RescueTelemetry | undefined, over: Partial<BoatTelemetry> = {}, pt: Parameters<typeof tele>[0] = { enabled: false }): BoatTelemetry =>
  tele(pt, { hp: 100, callFlags: 0, ...over, ...(r ? { rescue: r, ptNames: NAMES } : {}) });
/** 1 フレーム（16 ms）: 旗を見て、出す行が他に無い＝旗があれば 46 */
function frame(c: RescueLineClock, t: BoatTelemetry, ms: number): number {
  const f = c.flags(t, ms);
  c.shown((f & MODE_FLAG_RESCUE_EVENT) !== 0 ? MISSION_RESCUE_EVENT : MISSION_NORMAL, ms);
  return f;
}
const standing = (o: Partial<RescueTelemetry>, over: Partial<BoatTelemetry> = {}): string => rescueStandingJa(T(res(o), over));
const ALL_TEXTS = (): string[] => [
  rescuePickedJa(20, 20, 20), rescuePickedJa(7, 13, 20), rescueTransferJa('フィッチ', 20, 60), rescueObjectiveJa(40), rescueShellJa(12), ...DIRS.map((d) => rescueMineJa(d, 150, 1)), ...DIRS.map((d) => rescueMineJa(d, 150, 12)),
  rescueBlowJa(100), ...DIRS.map((d) => rescueSboatJa('Sボート', 3, d, 'フィッチ', 1200)), rescueRetreatJa('フィッチ', 'Sボート'),
  ...[false, true].flatMap((al) => [
    standing({ transferring: true, aboard: 20, delivered: 60 }, { batteryInArc: true, batteryAlerted: al }),
    standing({ picking: true, aboard: 19, nearCount: 7 }, { batteryInArc: true, batteryAlerted: al }),
    standing({ aboard: 20 }, { batteryInArc: true, batteryAlerted: al }),
    standing({ aboard: 19, fitchDx: 10, fitchDy: 10 }, { batteryInArc: true, batteryAlerted: al }),
    standing({ nearDx: 50, nearDy: 50, nearCount: 7 }, { batteryInArc: true, batteryAlerted: al }),
    standing({ aboard: 19, delivered: 39, onWater: 60 }, { batteryInArc: true, batteryAlerted: al }),
  ]),
  callLineText(T(res(), { callFlags: CALL_FUEL }), CALL_FUEL, 63), callLineText(T(res(), { callFlags: CALL_SUNK | CALL_DAWN, dawn: { reached: true } as BoatTelemetry['dawn'] }), CALL_DAWN, 63),
  callLineText(T(res({ objectiveReached: true }), { callFlags: CALL_SUNK }), CALL_SUNK, 63),
];

describe('文と幅（22 px・840 px の内。数と名は data と setup から）', () => {
  it('出来事と常の文の形（spec §8.2）', () => {
    expect(rescuePickedJa(5, 17, 20)).toBe('収容 5 名 ・ 乗せている 17/20');
    expect(rescuePickedJa(3, 20, 20)).toBe('収容 3 名 ・ 乗せている 20/20 ・ 満員');
    expect(rescueTransferJa('フィッチ', 17, 35)).toBe('フィッチへ 17 名を移した ・ 計 35 名');
    expect(rescueObjectiveJa(R.objectiveDelivered)).toBe('40 名を渡した ・ 帰投すれば達成');
    expect(rescueShellJa(1)).toBe('砲弾が生存者のそばに落ちた ・ 1 名を失った ・ 煙幕で砲台の目を切れ');
    expect(rescueMineJa('北西', 140, 1)).toBe('機雷！ 北西 140 m ・ 水路の外');
    expect(rescueMineJa('北西', 140, 2)).toBe('機雷！ 2 個 ・ 北西 140 m ・ 水路の外');
    expect(rescueSboatJa('Sボート', 2, '西', 'フィッチ', R.fitch.coverM)).toBe('Sボート 2 隻 西から ・ フィッチの 1550 m の内なら砲火で退く');
    expect(rescueRetreatJa('フィッチ', 'Sボート')).toBe('フィッチの砲火 ・ Sボートが退いた');
    expect(standing({ aboard: 12, delivered: 18, onWater: 30 })).toBe('乗せている 12/20 名 ・ 渡した 18/40 名 ・ 海に 30 名');
    expect(standing({ aboard: 0, delivered: 44, onWater: 3 }, { batteryInArc: true, batteryAlerted: true })).toBe('乗せている 0/20 名 ・ 渡した 44 名 ・ 海に 3 名 ・ 沿岸砲！');
    expect(standing({ aboard: 20 })).toBe('満員 20/20 名 ・ フィッチの輪へ（水路を通れ）');
    expect(standing({ nearDx: 60, nearDy: 80, nearCount: 5 }, { batteryInArc: true })).toBe('生存者 5 名 ・ 5 kt 以下で寄せて拾う（静音が効く） ・ 沿岸砲の射界');
    expect(standing({ aboard: 7, fitchDx: 100, fitchDy: 100 })).toBe('フィッチの輪 ・ 5 kt 以下で移す（静音が効く）');
    expect(standing({ picking: true, aboard: 15, nearCount: 2 })).toBe('収容中 ・ 乗せている 15/20 ・ この群に 2 名');
    expect(standing({ transferring: true, aboard: 8, delivered: 32 })).toBe('フィッチへ移している ・ 乗せている 8/20 ・ 渡した 32 名');
  });
  it('どの文も 22 px で 840 px の内（沿岸砲の句・2 桁の数・8 方位込み）。人名・階級・PT の番号なし', () => {
    for (const s of ALL_TEXTS()) {
      expect(textWidthPx(s, 22), s).toBeLessThanOrEqual(LINE2_MAX_PX);
      expect(PT_NUMBER_RE.test(s) || RANK_RE.test(s) || PERSON_DENYLIST.some((n) => s.includes(n)), s).toBe(false);
    }
    expect(Math.round(Math.max(...ALL_TEXTS().map((s) => textWidthPx(s, 22))))).toBe(828); // いちばん広い文の px（固定）
  });
  it('3 行目は今の文のまま（新しい尾なし）: us_07 で出る状態・見つかる距離（昼の倍率込み 4 桁）で 20 px で 596 px の内（煙幕の行は boat-hud が組み直した時に縮める）', () => {
    // us_07 で出る状態（敵影・発見・煙幕。昼で駆逐艦も照明弾も無いので探照灯・照明弾の文は出ない）
    for (const s of STATUS_LABEL.filter((_, i) => (i & 28) === 0)) for (let step = 1; step <= 5000 / DETECT_RANGE_STEP_M; step++) expect(textWidthPx(`${s} ・ 見つかる距離 ${step * DETECT_RANGE_STEP_M} m`, 20), s).toBeLessThanOrEqual(LINE3_MAX_PX);
    const smoke = textWidthPx(`${STATUS_LABEL[16]!} ・ 見つかる距離 1450 m`, 20);
    expect([Math.round(smoke), Math.round(statusFitScale(smoke, LINE3_MAX_PX) * smoke)]).toEqual([637, 596]); // 3 桁でも 612 px（ほかの任務の煙幕の行も 596 を越える＝今のまま。us_07 だけ縮める）
    expect(statusFitScale(500, LINE3_MAX_PX)).toBe(1);
    const hud = code('src/ui/boat-hud.ts');
    expect(hud).toContain('if (t.rescue) {');
    expect(hud).toContain('const k = statusFitScale(this.statusText.width, EVAC_STATUS_MAX_PX);');
  });
  it('左上の時計は「救助 残り 4:12」「救助の後 0:20」（昼でも「空襲」「夜明け」と言わない）・ほかの任務は今のまま', () => {
    expect(clockJa(T(res(), { timeLeftS: 251.2 }))).toBe('救助 残り 4:12');
    expect(clockJa(T(res(), { dawn: { reached: true, daylightS: 20.7 } as BoatTelemetry['dawn'] }))).toBe('救助の後 0:20');
    expect(clockJa(T(undefined, { timeLeftS: 251.2 }))).toBe('夜明けまで 252 秒');
  });
  it('救助の時間の終わりの帯: 見出し・他艦（ホブソンとバトラー）・残っている S ボートは去る・乗せている人の行方', () => {
    expect(rescueBannerLines(T(res({ aboard: 12 }), {}, { enabled: true, alive: 2, leaveDirJa: '西' }))).toEqual(['救助の時間が終わった', '残りはホブソンとバトラーの内火艇が拾う ・ Sボートは西へ去る', '乗せている 12 名はフィッチへ移すか、沖の集合点へ帰投して渡す']);
    expect(dawnBannerLines(T(res(), {}, { enabled: true, alive: 0, leaveDirJa: '西' }))).toEqual(['救助の時間が終わった', '残りはホブソンとバトラーの内火艇が拾う', '沖の集合点へ帰投せよ']);
    for (const l of rescueBannerLines(T(res({ aboard: 20 }), {}, { enabled: true, alive: 3, leaveDirJa: '西' }))) expect(textWidthPx(l, 22), l).toBeLessThanOrEqual(LINE2_MAX_PX);
  });
  it('呼びかけの頭: 燃料少・救助の時間の終わり・40 名を渡した。魚雷なしと終わりの前の「夜明け近し」は呼びかけにしない', () => {
    const at = (flags: number, reached = false, o: Partial<RescueTelemetry> = {}): BoatTelemetry => T(res(o), { callFlags: flags, dawn: { reached } as BoatTelemetry['dawn'] });
    expect([rescueCallOf(at(CALL_EXPENDED)), rescueCallOf(at(CALL_DAWN)), rescueCallOf(at(CALL_DAWN, true)), rescueCallOf(at(CALL_SUNK | CALL_DAWN)), rescueCallOf(at(CALL_FUEL | CALL_SUNK))]).toEqual([0, 0, CALL_DAWN, CALL_SUNK, CALL_FUEL]);
    expect(rescueCallOf(T(undefined, { callFlags: CALL_SUNK }))).toBe(0);
    expect(callLineText(at(CALL_SUNK), CALL_SUNK, 7)).toBe('40 名を渡した ・ 帰投せよ  700 m');
    expect(callLineText(at(CALL_DAWN | CALL_SUNK, true), CALL_DAWN, 4)).toBe('救助の時間の終わり ・ 帰投せよ  400 m');
    expect(callLineText(at(CALL_FUEL, false), CALL_FUEL, 12)).toBe('燃料少 帰投せよ  1200 m');
    expect(rescueCallHeadJa(at(0))).toBe('');
    expect(topCall(CALL_DAWN | CALL_SUNK)).toBe(CALL_DAWN); // 呼びかけの行の色（mission-line）は今の topCall のまま
  });
  it('S ボートの名: 機銃の行も「Sボート」（米PT の任務は今の「PT」）', () => {
    const p = { enabled: true, gunEnabled: true, gunStatus: 0 };
    const t = (named: boolean): BoatTelemetry => tele({ ...p }, named ? { ptNames: NAMES } : {});
    expect(ptGunLine(t(true), ptGunKey(t(true))).text).toBe('撃てる Sボート が見えない');
    expect(ptGunLine(t(false), ptGunKey(t(false))).text).toBe('撃てる PT が見えない');
  });
});

describe('2 行目のモード（ui/mission-mode）', () => {
  const pt = { enabled: true, alive: 2, total: 2, detected: false, sighted: false };
  it('常の文は沿岸砲の射界の行の代わり。救助の無い任務は今のまま', () => {
    expect(missionMode(T(res(), { batteryInArc: true }, pt), 0, 0)).toBe(MISSION_RESCUE);
    expect(missionMode(T(undefined, { batteryInArc: true }, pt), 0, 0)).toBe(MISSION_BATTERY);
    expect(missionMode(T(res(), {}, pt), 0, 0)).toBe(MISSION_RESCUE);
    expect(missionMode(T(undefined, {}, pt), 0, 0)).toBe(MISSION_PT);
  });
  it('呼びかけ: 40 名を渡した・救助の時間の終わり・燃料少は呼びかけ。拾っている／移している間は常の文（燃料少を除く）。魚雷なしは常の文', () => {
    expect(missionMode(T(res(), { callFlags: CALL_SUNK }, pt), CALL_SUNK, 0)).toBe(MISSION_CALL);
    expect(missionMode(T(res({ transferring: true }), { callFlags: CALL_SUNK }, pt), CALL_SUNK, 0)).toBe(MISSION_RESCUE);
    expect(missionMode(T(res({ picking: true }), { callFlags: CALL_FUEL }, pt), CALL_FUEL, 0)).toBe(MISSION_CALL);
    expect(missionMode(T(res(), { callFlags: CALL_EXPENDED }, pt), CALL_EXPENDED, 0)).toBe(MISSION_RESCUE);
    expect(missionMode(T(res(), { callFlags: CALL_DAWN }, pt), CALL_DAWN, 0)).toBe(MISSION_RESCUE);
    expect(missionMode(T(res(), { callFlags: CALL_DAWN, dawn: { reached: true } as BoatTelemetry['dawn'] }, { ...pt, alive: 0 }), CALL_DAWN, 0)).toBe(MISSION_CALL);
  });
  it('見えている（まだ気づいていない）S ボートの平常の行より常の文（昼はコリーのそばから西の S ボートがほぼいつも見える）。救助の無い任務は今のまま。浅瀬の間は今の順', () => {
    expect(missionMode(T(res(), {}, { ...pt, sighted: true }), 0, 0)).toBe(MISSION_RESCUE);
    expect(missionMode(T(res(), { callFlags: CALL_SUNK }, { ...pt, sighted: true }), CALL_SUNK, 0)).toBe(MISSION_CALL);
    expect(missionMode(T(undefined, {}, { ...pt, sighted: true }), 0, 0)).toBe(MISSION_PT);
    expect(missionMode(T(res(), { shallowState: 1, batteryInArc: true }, pt), 0, 0)).toBe(MISSION_BATTERY);
  });
  it('出来事: 知らせは S ボートの接触の行の下、急ぎは接触の上・赤い線の下', () => {
    const contact = { ...pt, detected: true, threatPhase: PT_ALERT, sighted: true, dx: 500, dy: 0 };
    expect(missionMode(T(res(), {}, contact), 0, MODE_FLAG_RESCUE_EVENT)).toBe(MISSION_PT_CONTACT);
    expect(missionMode(T(res(), {}, contact), 0, MODE_FLAG_RESCUE_EVENT | MODE_FLAG_RESCUE_URGENT)).toBe(MISSION_RESCUE_EVENT);
    expect(missionMode(T(res(), {}, { ...contact, passing: true }), 0, MODE_FLAG_RESCUE_EVENT | MODE_FLAG_RESCUE_URGENT)).toBe(MISSION_PT_PASS);
    expect(missionMode(T(res(), { batteryInArc: true }, pt), 0, MODE_FLAG_RESCUE_EVENT)).toBe(MISSION_RESCUE_EVENT);
  });
  it('文とキー: special-line・mission-line-keys（47 は値が変わった時だけ・46 は通し番号）', () => {
    const clock = new StraitLineClock();
    const t = T(res({ aboard: 3 }), { batteryInArc: true });
    expect(specialLine(t, MISSION_RESCUE, { landingEv: t.landing, strait: clock })).toEqual({ text: '乗せている 3/20 名 ・ 渡した 0/40 名 ・ 海に 60 名 ・ 沿岸砲の射界', color: HUD_COLOR_STRONG });
    const k = composeLineKeys(createLineKeys(), t, MISSION_RESCUE, 0, 0, 0, 0, t.landing, clock).lKey;
    expect(k).toBe(rescueStandingKey(t));
    expect(rescueStandingKey(T(res({ aboard: 4 }), { batteryInArc: true }))).not.toBe(k);
    expect(rescueStandingKey(T(res({ aboard: 3 }), { batteryInArc: true, batteryAlerted: true }))).not.toBe(k);
    expect(rescueStandingKey(T(res({ aboard: 3, nearDx: 899 }), { batteryInArc: true }))).toBe(k); // 一番近い群の位置は文に出ない（遠い間）
    expect(rescueLine(T(undefined), true, undefined)).toBeNull();
  });
});

describe('出来事の時計（ui/rescue-lines）', () => {
  it('救助の無い任務は旗 0・文なし', () => {
    const c = new RescueLineClock();
    expect(frame(c, T(undefined), 0)).toBe(0);
    expect(c.kind).toBe(RESCUE_EV_NONE);
  });
  it('収容: 群を替えても続けて拾えば 1 つ。止まった時に 1 回。4 秒（出ていた ms の和）で消える', () => {
    const c = new RescueLineClock();
    let ms = 0;
    frame(c, T(res()), ms);
    for (let i = 1; i <= 5; i++) expect(frame(c, T(res({ picking: true, pickSeq: i, aboard: i })), (ms += 16))).toBe(0);
    expect(frame(c, T(res({ picking: true, pickSeq: 7, aboard: 7 })), (ms += 16))).toBe(0); // 次の群（1 フレームに 2 名）
    expect(frame(c, T(res({ picking: false, pickSeq: 7, aboard: 7 })), (ms += 16))).toBe(MODE_FLAG_RESCUE_EVENT);
    expect([c.kind, c.text]).toEqual([RESCUE_EV_PICKED, '収容 7 名 ・ 乗せている 7/20']);
    const t = T(res({ pickSeq: 7, aboard: 7 }));
    let f = MODE_FLAG_RESCUE_EVENT;
    let n = 0;
    while (f !== 0 && n < 1000) { f = frame(c, t, (ms += 16)); n++; }
    expect(n * 16).toBeGreaterThanOrEqual(RESCUE_EVENT_SHOW_MS);
    expect(n * 16).toBeLessThan(RESCUE_EVENT_SHOW_MS + 40);
  });
  it('上の行に隠れている間は 4 秒を数えない', () => {
    const c = new RescueLineClock();
    c.flags(T(res()), 0);
    c.flags(T(res({ transferring: true, transferSeq: 3, aboard: 2 })), 16);
    c.flags(T(res({ transferSeq: 3, aboard: 2, delivered: 3 })), 32);
    expect([c.kind, c.text]).toEqual([RESCUE_EV_TRANSFER, 'フィッチへ 3 名を移した ・ 計 3 名']);
    for (let ms = 48; ms < 20000; ms += 16) { c.flags(T(res({ transferSeq: 3 })), ms); c.shown(MISSION_PT_CONTACT, ms); }
    expect(c.kind).toBe(RESCUE_EV_TRANSFER);
  });
  it('40 名を渡したは移している間に 1 回（味方の青）。移し終えた時の「移した」はその後に待つ', () => {
    const c = new RescueLineClock();
    let ms = 0;
    frame(c, T(res({ delivered: 38, aboard: 5 })), ms);
    frame(c, T(res({ transferring: true, transferSeq: 2, delivered: 40, aboard: 3, objectiveReached: true })), (ms += 16));
    expect([c.kind, c.text]).toEqual([RESCUE_EV_OBJECTIVE, '40 名を渡した ・ 帰投すれば達成']);
    expect(rescueLine(T(res()), false, c)!.color).toBe(HOME_COLOR_TEXT);
    frame(c, T(res({ transferSeq: 5, delivered: 43, aboard: 0, objectiveReached: true })), (ms += 16));
    expect(c.kind).toBe(RESCUE_EV_OBJECTIVE);
    for (let i = 0; i < 300 && c.kind === RESCUE_EV_OBJECTIVE; i++) frame(c, T(res({ transferSeq: 5, delivered: 43, objectiveReached: true })), (ms += 16));
    expect([c.kind, c.text]).toEqual([RESCUE_EV_TRANSFER, 'フィッチへ 5 名を移した ・ 計 43 名']);
  });
  it('急ぎ: 砲弾は数を足して言い直す・機雷は方角と距離・重い物が出ている物に替わり替わられた物は後に。旗に急ぎ', () => {
    const c = new RescueLineClock();
    let ms = 0;
    frame(c, T(res()), ms);
    frame(c, T(res({ pickSeq: 3, aboard: 3 })), (ms += 16));
    expect(c.kind).toBe(RESCUE_EV_PICKED);
    expect(frame(c, T(res({ pickSeq: 3, aboard: 3, shellSeq: 1 })), (ms += 16))).toBe(MODE_FLAG_RESCUE_EVENT | MODE_FLAG_RESCUE_URGENT);
    expect([c.kind, c.text]).toEqual([RESCUE_EV_SHELL, rescueShellJa(1)]);
    frame(c, T(res({ pickSeq: 3, aboard: 3, shellSeq: 3 })), (ms += 16));
    expect(c.text).toBe(rescueShellJa(3));
    frame(c, T(res({ pickSeq: 3, aboard: 3, shellSeq: 3, mineSeenSeq: 1, mineDx: -100, mineDy: -104 })), (ms += 16));
    expect([c.kind, c.text]).toEqual([RESCUE_EV_MINE, '機雷！ 北西 140 m ・ 水路の外']);
    frame(c, T(res({ pickSeq: 3, aboard: 3, shellSeq: 3, mineSeenSeq: 2, mineDx: 0, mineDy: 150 })), (ms += 16));
    expect(c.text).toBe('機雷！ 2 個 ・ 南 150 m ・ 水路の外');
    for (let i = 0; i < 300 && c.kind === RESCUE_EV_MINE; i++) frame(c, T(res({ pickSeq: 3, aboard: 3, shellSeq: 3, mineSeenSeq: 2 })), (ms += 16));
    expect([c.kind, c.text]).toEqual([RESCUE_EV_SHELL, rescueShellJa(3)]); // 替わられた砲弾が後に（収容は落ちる＝後ろは 1 つ）
  });
  it('触雷は前のフレームの HP からの減り。S ボートは隊を初めて見たか見つかった時に 1 回（方角は脅威の PT へ）・退いたは通し番号', () => {
    const c = new RescueLineClock();
    let ms = 0;
    frame(c, T(res(), { hp: 100 }), ms);
    frame(c, T(res({ mineBlowSeq: 1 }), { hp: 40 }), (ms += 16));
    expect([c.kind, c.text]).toEqual([RESCUE_EV_BLOW, '触雷！ HP −60 ・ 水路を通れ']);
    const p = { enabled: true, total: 2, alive: 2, sighted: true, dx: -2000, dy: 100 };
    const d = new RescueLineClock();
    frame(d, T(res(), {}, { enabled: true, total: 2, alive: 2 }), 0);
    frame(d, T(res(), {}, p), 16);
    expect([d.kind, d.text]).toEqual([RESCUE_EV_SBOAT, 'Sボート 2 隻 西から ・ フィッチの 1550 m の内なら砲火で退く']);
    for (let i = 0, m = 32; i < 400; i++, m += 16) frame(d, T(res(), {}, p), m);
    expect(d.kind).toBe(RESCUE_EV_NONE);
    frame(d, T(res({ sboatRetreatSeq: 1 }), {}, p), 99999);
    expect([d.kind, d.text]).toEqual([RESCUE_EV_RETREAT, 'フィッチの砲火 ・ Sボートが退いた']);
    expect(rescueLine(T(res()), false, d)!.color).toBe(HOME_COLOR_TEXT);
    expect(rescueLine(T(res()), false, c)!.color).toBe(HUD_COLOR_WARN);
  });
  it('strait-line-clock が持つ（救助の無い任務は旗 0）。読む欄は t.rescue・t.pt・t.hp・t.ptNames だけ（AI・本当の位置は読まない）', () => {
    const s = new StraitLineClock();
    expect(s.flags(T(undefined), 0)).toBe(0);
    expect(s.rescue).toBeInstanceOf(RescueLineClock);
    const src = code('src/ui/rescue-lines.ts');
    for (const bad of ['world', 'section', 'boats[', 'state.']) expect(src.includes(bad), bad).toBe(false);
  });
});
