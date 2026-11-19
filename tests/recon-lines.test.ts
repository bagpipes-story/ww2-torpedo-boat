// v0.8.2 S4（spec-v0820 §4.13 D-H1〜D-H3・§9 の 7、lead の L41〜L43）: 報告の任務（us_05）の 2 行目（ui/recon-lines の時計・ui/recon-texts の文）と中継の端の印・片道の列のレーダーの文。
// - 出来事（モード 42・1 回・4 秒）: 戦艦を確認・報告を送った・無線が壊れた・報告を中継した・戦艦／重巡に命中（沈まなかった時）・弾薬庫が誘爆（警告の色）。数と名は data と setup から。
// - 常の文（モード 43）: ほかの行が無い時と、届く前の「魚雷なし」「撃沈！」の代わり。燃料少・夜明け近しは呼びかけのまま。届いた後の呼びかけは「報告済み ・ 帰投せよ  N m」。
// - どの文も 22 px で 840 px の内（tests/pt-ui-kit の textWidthPx）・人名と PT の番号なし。ほかの任務（t.recon が無い）は旗 0・モードと文は今のまま。
// - 読む欄の走査（t.recon・t.magazine の数だけ。艦の AI・本当の位置を読まない）と配線（mission-line は 1 字も変えない）。
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { HUD_COLOR_STRONG, HUD_COLOR_WARN } from '../src/config/hud-text-config';
import { RECON_EVENT_SHOW_MS } from '../src/config/recon-hud-config';
import type { BoatTelemetry, ReconTelemetry } from '../src/core/boat-telemetry';
import { CALL_DAWN, CALL_EXPENDED, CALL_FUEL, CALL_SUNK } from '../src/core/mission-flow';
import { RECON_NONE, RECON_PENDING, RECON_RELAYED, RECON_SENT, RECON_TRACKING, createReconState } from '../src/core/recon-report';
import { reconTelemetryPart, refreshReconTelemetry } from '../src/systems/recon-telemetry';
import { callLineText } from '../src/ui/dawn-lines';
import { composeLineKeys, createLineKeys } from '../src/ui/mission-line-keys';
import { MISSION_ANCHOR_EVENT, MISSION_CALL, MISSION_NORMAL, MISSION_RADAR_EVENT, MISSION_RECON, MISSION_RECON_EVENT, MODE_FLAG_ANCHOR_EVENT, MODE_FLAG_RADAR_EVENT, MODE_FLAG_RECON_EVENT, missionMode } from '../src/ui/mission-mode';
import { radarVilaLineJa, radarNewAtEastEdge } from '../src/ui/radar-lines';
import { RECON_LN_BOOM, RECON_LN_CAP, RECON_LN_NONE, RECON_LN_RADIO, RECON_LN_RELAYED, RECON_LN_SEEN, RECON_LN_SENT, ReconLineClock } from '../src/ui/recon-lines';
import { RECON_BOOM_JA, RECON_RELAYED_JA, reconCapHitLineJa, reconLine, reconRadioLineJa, reconSeenLineJa, reconSentLineJa, reconStandingJa, reconStandingKey } from '../src/ui/recon-texts';
import { specialLine } from '../src/ui/special-line';
import { StraitLineClock } from '../src/ui/strait-line-clock';
import { setupOf } from './column-world-kit';
import { code } from './core-rules-kit';
import { PERSON_DENYLIST, PT_NUMBER_RE, RANK_RE } from './person-denylist';
import { LINE2_MAX_PX, tele, textWidthPx } from './pt-ui-kit';

const S = setupOf('us_05');
const P = S.recon!;
const TR = S.transit!;
/** 報告のテレメトリ（us_05 の setup の名と数。読む欄だけ値を入れる） */
const rec = (o: Partial<ReconTelemetry> = {}): ReconTelemetry => ({
  stage: RECON_NONE, radioBroken: false, trackedS: 0, trackLeftS: 0, seenAtS: NaN, seenCount: 0, sentAtS: NaN, pendingAtS: NaN, radioBrokenAtS: NaN, relayedAtS: NaN, draws: 0, eventCount: 0, events: 0,
  relayDx: -2600, relayDy: 100, relayRadiusM: P.relay.radiusM, relayJa: P.relay.labelJa, identifyJa: '戦艦', fleetJa: '東へ 18 ノット', capHits: 0, capHitN: 0, capHitJa: '', capSeen: new Uint8Array(7), ...o,
});
const T = (r: ReconTelemetry | undefined, over: Partial<BoatTelemetry> = {}): BoatTelemetry => tele({ enabled: false }, { ...over, ...(r ? { recon: r } : {}) });
/** 1 フレーム（16 ms）: 旗を見て、出す行が他に無い＝旗がそのまま 42 */
function frame(c: ReconLineClock, t: BoatTelemetry, ms: number): number {
  const f = c.flags(t, ms);
  c.shown((f & MODE_FLAG_RECON_EVENT) !== 0 ? MISSION_RECON_EVENT : MISSION_NORMAL, ms);
  return f;
}
const ALL_TEXTS = (): string[] => [
  reconSeenLineJa('戦艦', P.trackS), reconSentLineJa('戦艦', 2, '東へ 18 ノット'), ...['北', '北東', '東', '南東', '南', '南西', '西', '北西'].map((d) => reconRadioLineJa(d, P.relay.labelJa)), RECON_RELAYED_JA,
  reconCapHitLineJa('戦艦', 5), reconCapHitLineJa('重巡', 2), RECON_BOOM_JA,
  reconStandingJa(rec({ radioBroken: true })), reconStandingJa(rec({ stage: RECON_TRACKING, trackedS: 12.4, trackLeftS: 7.6, radioBroken: true })), reconStandingJa(rec({ stage: RECON_PENDING })), reconStandingJa(rec({ stage: RECON_SENT })),
];

describe('文と幅（22 px・840 px の内。数と名は data と setup から）', () => {
  it('出来事の 6 つの文（spec D-H1）。追う秒・艦種の名詞・列の向きと速さ・中継の輪の名は data から', () => {
    expect([P.trackS, P.identifyClass, P.relay.labelJa, TR.speedKt, TR.inbound.headingDeg]).toEqual([20, 'battleship', '隣の分隊', 18, 90]);
    const t = reconTelemetryPart({ recon: { plan: P, state: createReconState(), eventCount: 0, events: 0 } as never, destroyers: null, boat: { state: { x: 4200, y: 700 } }, setup: S }).recon!;
    expect([t.identifyJa, t.fleetJa, t.relayJa]).toEqual(['戦艦', '東へ 18 ノット', '隣の分隊']);
    expect(reconSeenLineJa(t.identifyJa, P.trackS)).toBe('戦艦を確認！ ・ レーダーで追って報告せよ（20 秒）');
    expect(reconSentLineJa(t.identifyJa, 2, t.fleetJa)).toBe('報告を送った！ 戦艦 2 を含む艦隊 ・ 東へ 18 ノット');
    expect(reconRadioLineJa('西', t.relayJa)).toBe('無線が壊れた！ 報告は西の黄色い輪（隣の分隊）へ');
    expect(RECON_RELAYED_JA).toBe('報告を中継した！ ・ 生きて帰れ');
    expect(reconCapHitLineJa('戦艦', 3)).toBe('戦艦に命中！ 3 本目 ・ まだ沈まない');
    expect(RECON_BOOM_JA).toBe('弾薬庫が誘爆！ 戦艦が轟沈した');
  });
  it('常の文の 4 つの段（spec D-H2）。追尾は追った秒（切り捨て）とあと（切り上げ）＝和は追う秒。無線が壊れていれば尾', () => {
    expect(reconStandingJa(rec())).toBe('報告: 戦艦を目で確かめよ（レーダーでは艦種が分からない）');
    expect(reconStandingJa(rec({ stage: RECON_TRACKING, trackedS: 12.4, trackLeftS: 7.6 }))).toBe('報告: 追尾 12 秒 ・ あと 8 秒');
    expect(reconStandingJa(rec({ stage: RECON_TRACKING, trackedS: 12.4, trackLeftS: 7.6, radioBroken: true }))).toBe('報告: 追尾 12 秒 ・ あと 8 秒 ・ 無線故障');
    expect(reconStandingJa(rec({ stage: RECON_PENDING, radioBroken: true }))).toBe('無線故障 ・ 隣の分隊（黄色い輪）で中継');
    expect(reconStandingJa(rec({ stage: RECON_SENT }))).toBe('報告済み ・ 帰投せよ');
    expect(reconStandingJa(rec({ stage: RECON_RELAYED }))).toBe('報告済み ・ 帰投せよ');
    // キーは段・無線・追尾の秒の刻みで変わる（秒の内は同じ）
    const k = (o: Partial<ReconTelemetry>): number => reconStandingKey(rec(o));
    expect(k({ stage: RECON_TRACKING, trackedS: 12.1, trackLeftS: 7.9 })).toBe(k({ stage: RECON_TRACKING, trackedS: 12.9, trackLeftS: 7.1 }));
    expect(k({ stage: RECON_TRACKING, trackedS: 12.9, trackLeftS: 7.1 })).not.toBe(k({ stage: RECON_TRACKING, trackedS: 13.0, trackLeftS: 7.0 }));
    expect(k({})).not.toBe(k({ radioBroken: true }));
  });
  it('どの文も 22 px で 840 px の内。いちばん広い常の文の px を固定。人名・階級・PT の番号なし', () => {
    for (const s of ALL_TEXTS()) {
      expect(textWidthPx(s, 22), s).toBeLessThanOrEqual(LINE2_MAX_PX);
      for (const name of PERSON_DENYLIST) expect(s).not.toContain(name);
      expect(RANK_RE.test(s) || PT_NUMBER_RE.test(s), s).toBe(false);
    }
    expect(Math.round(textWidthPx(reconStandingJa(rec({ radioBroken: true })), 22) * 10) / 10).toBe(757);
    expect(Math.round(textWidthPx(reconSentLineJa('戦艦', 2, '東へ 18 ノット'), 22) * 10) / 10).toBe(572.4);
  });
});

describe('時計（ui/recon-lines の ReconLineClock。ui/strait-line-clock が持つ）', () => {
  it('報告の無い任務（t.recon が無い）は旗 0 のまま・何も始めない', () => {
    const c = new ReconLineClock();
    for (let ms = 0; ms < 20000; ms += 16) expect(frame(c, T(undefined), ms)).toBe(0);
    expect([c.kind, c.key]).toEqual([RECON_LN_NONE, 0]);
  });
  it('確かめた → 4 秒（出ていた和）→ 送った（文は出来事の時に 1 回・隻数と向き）。上の行に隠れている間は数えない', () => {
    const c = new ReconLineClock();
    let ms = 0;
    expect(frame(c, T(rec()), ms)).toBe(0);
    const seen = rec({ stage: RECON_TRACKING, seenAtS: 140, seenCount: 1, trackedS: 0, trackLeftS: 20 });
    let on = 0;
    for (ms = 16; ms < 6000; ms += 16) if (frame(c, T(seen), ms) !== 0) on += 16;
    expect(on).toBeGreaterThanOrEqual(RECON_EVENT_SHOW_MS - 16);
    expect(on).toBeLessThanOrEqual(RECON_EVENT_SHOW_MS + 16);
    expect(c.kind).toBe(RECON_LN_NONE);
    const sent = rec({ ...seen, stage: RECON_SENT, sentAtS: 160, seenCount: 2 });
    frame(c, T(sent), (ms += 16));
    expect([c.kind, c.text]).toEqual([RECON_LN_SENT, '報告を送った！ 戦艦 2 を含む艦隊 ・ 東へ 18 ノット']);
    // 上の行（衝突の危険など）に出ている間は 4 秒を数えない
    for (let i = 0; i < 400; i++) { c.flags(T(sent), (ms += 16)); c.shown(MISSION_CALL, ms); }
    expect(c.kind).toBe(RECON_LN_SENT);
  });
  it('無線は出ている出来事に替わり（替わられた確認は後で出す）、方位は自艇から中継の輪へ（出来事の 1 回）。中継は待って出す', () => {
    const c = new ReconLineClock();
    const seen = rec({ stage: RECON_TRACKING, seenAtS: 140, seenCount: 1, trackLeftS: 20 });
    frame(c, T(seen), 0);
    expect(c.kind).toBe(RECON_LN_SEEN);
    frame(c, T({ ...seen, radioBroken: true, relayDx: -2600, relayDy: 100 }), 16);
    expect([c.kind, c.text]).toEqual([RECON_LN_RADIO, '無線が壊れた！ 報告は西の黄色い輪（隣の分隊）へ']);
    expect(reconLine(T(seen), false, c)).toEqual({ text: c.text, color: HUD_COLOR_WARN });
    let ms = 16;
    while (c.kind === RECON_LN_RADIO) frame(c, T({ ...seen, radioBroken: true }), (ms += 16));
    expect(c.kind).toBe(RECON_LN_SEEN); // 替わられた確認の文
    const relayed = rec({ ...seen, radioBroken: true, stage: RECON_RELAYED, pendingAtS: 160, relayedAtS: 190 });
    frame(c, T(relayed), (ms += 16));
    expect(c.kind).toBe(RECON_LN_SEEN); // 中継は後ろに待つ
    while (c.kind === RECON_LN_SEEN) frame(c, T(relayed), (ms += 16));
    expect([c.kind, c.text]).toEqual([RECON_LN_RELAYED, RECON_RELAYED_JA]);
  });
  it('戦艦・重巡への命中（沈まなかった）は回数の増えで出し、続けば本数を言い直す。誘爆は替わって警告の色。どれも 1 回ずつ', () => {
    const c = new ReconLineClock();
    const r = rec({ capHits: 1, capHitN: 1, capHitJa: '戦艦' });
    frame(c, T(r), 0);
    expect([c.kind, c.text]).toEqual([RECON_LN_CAP, '戦艦に命中！ 1 本目 ・ まだ沈まない']);
    const k = c.key;
    frame(c, T({ ...r, capHits: 2, capHitN: 2 }), 16);
    expect([c.text, c.key !== k]).toEqual(['戦艦に命中！ 2 本目 ・ まだ沈まない', true]);
    const boom = T({ ...r, capHits: 2, capHitN: 2 }, { magazine: { detonatedAtS: [NaN], onHit: [0], detonations: 1, draws: 1, chanceSum: 0.03 } });
    frame(c, boom, 32);
    expect([c.kind, reconLine(boom, false, c)]).toEqual([RECON_LN_BOOM, { text: RECON_BOOM_JA, color: HUD_COLOR_WARN }]);
    let ms = 32;
    for (let i = 0; i < 600; i++) frame(c, boom, (ms += 16));
    expect(c.kind).toBe(RECON_LN_NONE); // 命中の文は待たない（誘爆が言い直す）・2 度出さない
  });
  it('本当のテレメトリ（systems/recon-telemetry）: 戦艦と重巡の命中で沈まなかった時だけ数え、駆逐艦・沈み始めた艦の命中は数えない', () => {
    const ships = TR.column!.map(() => ({ hitsTaken: 0, sinking: false }));
    const w = { recon: { plan: P, state: createReconState(), eventCount: 0, events: 0 } as never, destroyers: { magazine: null, ships, kits: { classes: TR.column!.map((k) => k.shipClass) } }, boat: { state: { x: 0, y: 0 } }, setup: S };
    const t = reconTelemetryPart(w).recon!;
    const cls = TR.column!.map((k) => k.shipClass);
    const bb = cls.indexOf('battleship');
    const ca = cls.indexOf('heavy_cruiser');
    ships[0]!.hitsTaken = 1; // 駆逐艦
    refreshReconTelemetry(t, w);
    expect(t.capHits).toBe(0);
    ships[bb]!.hitsTaken = 2; // 2 本が 1 フレームに
    refreshReconTelemetry(t, w);
    expect([t.capHits, t.capHitN, t.capHitJa]).toEqual([1, 2, '戦艦']);
    ships[ca]!.hitsTaken = 3;
    ships[ca]!.sinking = true; // 3 本目で沈んだ
    refreshReconTelemetry(t, w);
    expect(t.capHits).toBe(1);
    ships[bb]!.hitsTaken = 3;
    refreshReconTelemetry(t, w);
    expect([t.capHits, t.capHitN]).toEqual([2, 3]);
    refreshReconTelemetry(t, w);
    expect(t.capHits).toBe(2);
  });
});

describe('2 行目のモードとキー（ui/mission-mode・special-line・mission-line-keys・strait-line-clock・dawn-lines）', () => {
  it('モード 42 は止まった艦の出来事のすぐ下・呼びかけと平常の上。43 は平常と、届く前の「魚雷なし」「撃沈！」の代わり（燃料少・夜明け近しは呼びかけ）。報告の無い任務は今のまま', () => {
    expect([MISSION_RECON_EVENT, MISSION_RECON, MODE_FLAG_RECON_EVENT]).toEqual([42, 43, 2048]);
    const r = T(rec());
    expect(missionMode(r, 0, 0)).toBe(MISSION_RECON);
    expect(missionMode(r, CALL_EXPENDED, 0)).toBe(MISSION_RECON);
    expect(missionMode(r, CALL_SUNK, 0)).toBe(MISSION_RECON);
    expect(missionMode(r, CALL_DAWN, 0)).toBe(MISSION_CALL);
    expect(missionMode(r, CALL_FUEL, 0)).toBe(MISSION_CALL);
    expect(missionMode(T(rec({ stage: RECON_SENT })), CALL_SUNK, 0)).toBe(MISSION_CALL);
    expect(missionMode(r, CALL_DAWN, MODE_FLAG_RECON_EVENT)).toBe(MISSION_RECON_EVENT);
    expect(missionMode(r, 0, MODE_FLAG_RECON_EVENT | MODE_FLAG_ANCHOR_EVENT)).toBe(MISSION_ANCHOR_EVENT);
    expect(missionMode(r, 0, MODE_FLAG_RECON_EVENT | MODE_FLAG_RADAR_EVENT)).toBe(MISSION_RADAR_EVENT);
    const none = T(undefined);
    expect([missionMode(none, 0, 0), missionMode(none, CALL_EXPENDED, 0), missionMode(none, CALL_SUNK, 0)]).toEqual([MISSION_NORMAL, MISSION_CALL, MISSION_CALL]);
    expect(missionMode(none, 0, MODE_FLAG_RECON_EVENT)).toBe(MISSION_RECON_EVENT); // 旗は報告の任務だけ立つ（時計が 0 を返す）
  });
  it('届いた後の呼びかけは「報告済み ・ 帰投せよ  N m」、届く前・報告の無い任務の「撃沈！」は今の文', () => {
    expect(callLineText(T(rec({ stage: RECON_SENT })), CALL_SUNK, 8)).toBe('報告済み ・ 帰投せよ  800 m');
    expect(callLineText(T(rec({ stage: RECON_RELAYED })), CALL_SUNK, 8)).toBe('報告済み ・ 帰投せよ  800 m');
    expect(callLineText(T(rec({ stage: RECON_SENT })), CALL_FUEL, 8)).toBe('燃料少 帰投せよ  800 m');
    expect(callLineText(T(undefined), CALL_SUNK, 8)).toBe('撃沈！帰投せよ  800 m');
    expect(callLineText(T(rec()), CALL_SUNK, 8)).toBe('撃沈！帰投せよ  800 m');
  });
  it('海峡の時計が recon を持ち旗を足す。キーは出来事の通し番号と常の文の刻み、文は special-line（常の文は中継待ちだけ警告の色）', () => {
    const c = new StraitLineClock();
    const st = { strait: { enabled: false, eyeRange2: 0, bowOnMask: 0, bowOnM: NaN, bowOnPicket: false } } as Partial<BoatTelemetry>;
    const t = T(rec({ stage: RECON_TRACKING, seenAtS: 1, seenCount: 1, trackLeftS: 20 }), st);
    expect(c.flags(t, 0) & MODE_FLAG_RECON_EVENT).not.toBe(0);
    c.shown(MISSION_RECON_EVENT, 0);
    expect(composeLineKeys(createLineKeys(), t, MISSION_RECON_EVENT, MODE_FLAG_RECON_EVENT, 0, 0, 0, t.landing, c).lKey).toBe(c.recon.key);
    expect(composeLineKeys(createLineKeys(), t, MISSION_RECON, 0, 0, 0, 0, t.landing, c).lKey).toBe(reconStandingKey(t.recon!));
    expect(specialLine(t, MISSION_RECON_EVENT, { landingEv: t.landing, strait: c })).toEqual({ text: '戦艦を確認！ ・ レーダーで追って報告せよ（20 秒）', color: HUD_COLOR_STRONG });
    expect(specialLine(t, MISSION_RECON, { landingEv: t.landing, strait: c })).toEqual({ text: '報告: 追尾 0 秒 ・ あと 20 秒', color: HUD_COLOR_STRONG });
    const pend = T(rec({ stage: RECON_PENDING, radioBroken: true }), st);
    expect(specialLine(pend, MISSION_RECON, { landingEv: pend.landing, strait: c })!.color).toBe(HUD_COLOR_WARN);
    expect(new StraitLineClock().flags(T(undefined, st), 0)).toBe(0);
  });
});

describe('片道の列のレーダーの文（ui/radar-lines。v0.8.0 の文に戻りの尾を付けない）', () => {
  it('us_05 は「接触が東（スリガオ海峡）へ消えた」（揚陸の尾なし）・帰りの列はいつも偽。us_04 は今の文', () => {
    const r = { ...tele().radar, enabled: true, widthM: 6500, eastJa: TR.vilaLabelJa, eastOneWay: true, newX: 6450 };
    expect(radarVilaLineJa(r)).toBe('接触が東（スリガオ海峡）へ消えた');
    expect(radarNewAtEastEdge(r)).toBe(false);
    expect(radarVilaLineJa({ ...r, eastJa: 'ビラ', eastOneWay: false })).toBe('接触が東（ビラ）へ消えた ・ 揚陸を終えると同じ海峡を戻ってくる');
    expect(radarNewAtEastEdge({ ...r, eastOneWay: false })).toBe(true);
    expect(textWidthPx(radarVilaLineJa(r), 22)).toBeLessThanOrEqual(LINE2_MAX_PX);
    expect(code('src/systems/radar-view.ts')).toContain("const oneWay = tr !== undefined && tr.outbound === null && tr.inbound.edge === 'west';");
  });
});

describe('読む欄の走査と配線', () => {
  it('ui/recon-lines・recon-texts は t.recon・t.magazine の数だけを読み、艦・AI・世界・Phaser を読まない・確保しない（文を組む時のほかに new なし）', () => {
    const src = code('src/ui/recon-lines.ts') + code('src/ui/recon-texts.ts');
    expect([...new Set([...src.matchAll(/\bt\.(\w+)/g)].map((m) => m[1]!))].sort()).toEqual(['magazine', 'recon']);
    expect([...new Set([...src.matchAll(/\br\.(\w+)/g)].map((m) => m[1]!))].sort()).toEqual(['capHitJa', 'capHitN', 'capHits', 'fleetJa', 'identifyJa', 'radioBroken', 'relayDx', 'relayDy', 'relayJa', 'relayedAtS', 'seenAtS', 'seenCount', 'sentAtS', 'stage', 'trackLeftS', 'trackedS']);
    const body = (f: string): string => code(f).replace(/^import .*$/gm, '');
    for (const f of ['src/ui/recon-lines.ts', 'src/ui/recon-texts.ts']) expect(body(f)).not.toMatch(/\.ai\b|destroyers|\bships\b|\.state\.|shipAi|from 'phaser'|document|window|Math\.random|\bnew\s/);
    expect([...code('src/ui/recon-texts.ts').matchAll(/from '([^']+)'/g)].map((m) => m[1])).toEqual(['../config/hud-text-config', '../core/boat-telemetry', '../core/mission-flow', '../core/recon-report', './hud-lines']);
  });
  it('配線: 海峡の時計が recon を持ち・旗を足し・shown を渡す。special-line と mission-line-keys がモード 42・43 を読む。mission-line は 1 字も足さない', () => {
    const sc = code('src/ui/strait-line-clock.ts');
    expect(sc).toContain('readonly recon = new ReconLineClock();');
    expect(sc).toContain('| this.recon.flags(t, nowMs) | this.anchor.flags(t, nowMs);');
    expect(sc).toContain('this.recon.shown(mode, nowMs);');
    expect(code('src/ui/special-line.ts')).toContain('if (mode === MISSION_RECON_EVENT || mode === MISSION_RECON) return reconLine(t, mode === MISSION_RECON, clock.strait?.recon);');
    expect(code('src/ui/mission-line.ts')).not.toMatch(/recon/i);
    expect(code('src/ui/mission-mode.ts')).toContain('if (reconStandingShown(t, call)) return MISSION_RECON;');
  });
  it('中継の端の印（ui/hud-markers）: 報告の任務だけ作り、中継待ちの間だけ。輪の縁まで 100 m の切り上げ・黄・帰投の印から離す', () => {
    const hm = code('src/ui/hud-markers.ts');
    expect(hm).toContain('if (telemetry.recon) this.relayMarker = new EdgeMarker(scene, { textureKey: TEXTURE_KEYS.coastMarker, labelPrefix: RELAY_MARKER_LABEL_JA, stepM: RELAY_MARKER_STEP_M, labelAbove: true, roundUp: true, topMargin: HOME_MARKER_TOP_MARGIN, color: RELAY_RING_TEXT });'); // 矢印は Boot の砂色の絵（新しい鍵なし）
    expect(hm).toContain('const show = r.stage === RECON_PENDING;');
    expect(hm).toContain('Math.max(0, Math.hypot(r.relayDx, r.relayDy) - r.relayRadiusM)');
    expect(gameData.missionsSeed.missions.filter((m) => (m as unknown as Record<string, Record<string, unknown> | undefined>)['v0_1_prototype']?.['recon'] !== undefined).map((m) => m.id)).toEqual(['us_05']);
  });
});

