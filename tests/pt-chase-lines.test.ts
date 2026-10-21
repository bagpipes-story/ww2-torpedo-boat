// 米PT の追撃（v0.6.3 実機 2 回目。spec r2 §F.1・§F.4・§I.1）の HUD と Result: 2 行目の連射（予告・撃ち始め・黙った）・追ってくる PT・連射の結果・制圧の出来事・
// 「全速で」の航過と「残り N 回」のない離脱（ui/pt-chase-lines・ui/pt-lines・ui/pt-gun-lines）、キー、幅（22 px で 840 px 以内）、Result の 1 行目と 4 行目、
// テレメトリと Result の材料（systems/pt-telemetry）。ui-config・game-config は DOM を読むので使わない（色は hud-text-config、幅は tests/pt-ui-kit の見積もり）。
// 実機 2 回目のレビュー: 射界の外の連射（ux-2）・撃退と制圧で黙った連射の文（ux-4）・射程の外の追ってくる PT（ux-8）・連射の結果の「計 n 回」（ux-7）・出来事に足した連射の結果（ux-3）。
import { describe, expect, it } from 'vitest';
import { HOME_COLOR_TEXT, HUD_COLOR_STRONG, HUD_COLOR_WARN } from '../src/config/hud-text-config';
import type { BoatTelemetry } from '../src/core/boat-motion';
import { GUN_FIRING, GUN_OUT_OF_ARC, GUN_OUT_OF_RANGE } from '../src/core/gun-battery';
import { PT_BREAK, PT_CHASE, PT_FATE_CREW, PT_LEAVE, PT_PASS, PT_RUN_IN, type PtTelemetry } from '../src/core/pt-boats';
import { PT_GUN_EV_CREW, PT_GUN_EV_SUNK, PT_GUN_EV_SUPPRESS } from '../src/core/pt-damage';
import { initPtTelemetry, ptResult, refreshPtTelemetry } from '../src/systems/pt-telemetry';
import { MISSION_ADRIFT, MISSION_PT_CONTACT, MISSION_PT_GUN, MISSION_PT_GUN_EVENT, MISSION_PT_PASS, MODE_FLAG_PT_GUN_EVENT, MODE_FLAG_PT_HOLD, MODE_FLAG_PT_RESULT, missionMode } from '../src/ui/mission-mode';
import { ptHoldPass } from '../src/ui/pt-chase-lines';
import { mergeBurstBits } from '../src/ui/pt-gun-lines';
import { ptHeadJa, ptKey, ptLine, ptResultLines } from '../src/ui/pt-lines';
import type { PtResult } from '../src/ui/result-types';
import { LINE2_MAX_PX, S05, keyOf, ptWorld, row, tele, textWidthPx } from './pt-ui-kit';

const RESULT = MODE_FLAG_PT_RESULT;
const EVENT = MODE_FLAG_PT_GUN_EVENT;
const HOLD = MODE_FLAG_PT_HOLD;
/** 連射を固めた PT（艇から南東 283 m） */
const BURST: Partial<PtTelemetry> = { detected: true, passing: true, burst: true, threatPhase: PT_PASS, dx: 200, dy: 200, sighted: true, dodge: 1, escapeDeg: 315 };
/** 追ってくる PT（撃つ権利なし。艇から南東 283 m → 300 m） */
const CHASE: Partial<PtTelemetry> = { detected: true, threatPhase: PT_CHASE, dx: 200, dy: 200, sighted: true };
/** 連射の結果の表示中（3 回目の連射） */
const BRES: Partial<PtTelemetry> = { detected: true, threatPhase: PT_CHASE, burstFired: true, bursts: 3, passes: 1, passSeq: 4, lastPassFired: true, lastPassHits: 0 };
/** 射撃を押していて射界の外（艇は北西へ。南東の PT は艇尾の側） */
const ARC: Partial<PtTelemetry> = { ...BURST, fired: true, gunStatus: GUN_OUT_OF_ARC };
const k = (pt: Partial<PtTelemetry>, flags = 0, over: Partial<BoatTelemetry> = {}): number => keyOf(tele(pt, over), 0, flags);

describe('2 行目の文（spec r2 §F.1 のとおり）', () => {
  it('連射: 撃つ前は「追撃！」、撃ち始めたら「連射！」（方角は艇から連射の PT への 8 方位）、制圧・撃退で黙ったら味方の青。航過のかわす向きは使わない', () => {
    expect(row(tele(BURST))).toEqual([MISSION_PT_PASS, '米PT 追撃！ 南東から ・ 針路そのまま撃ち返せ', HUD_COLOR_WARN]);
    expect(row(tele({ ...BURST, fired: true }))).toEqual([MISSION_PT_PASS, '米PT 連射！ 南東から ・ 針路そのまま撃ち返せ', HUD_COLOR_WARN]);
    expect(row(tele({ ...BURST, dx: -10, dy: -300 }))[1]).toBe('米PT 追撃！ 北から ・ 針路そのまま撃ち返せ');
    // 黙った連射（ux-4）: 制圧は「連射をやめた」（撃つ前でも本当）、撃退は航過と同じ「被弾で沈黙」
    expect(row(tele({ ...BURST, fired: true, passSilenced: true }))).toEqual([MISSION_PT_PASS, '米PT 制圧！ 連射をやめた', HOME_COLOR_TEXT]);
    expect(row(tele({ ...BURST, passSilenced: true }))[1]).toBe('米PT 制圧！ 連射をやめた');
    expect(row(tele({ ...BURST, fired: true, passSilenced: true, passRetired: true }))).toEqual([MISSION_PT_PASS, '米PT 被弾で沈黙！ もう撃ってこない', HOME_COLOR_TEXT]);
    // 射撃を押していて 13mm が射界の外（ux-2）: 撃ち返せの代わりに理由（連射の PT が艇尾の側か艇首の側か）。針路そのままは変えない
    expect(row(tele(ARC, { headingDeg: 315 }))).toEqual([MISSION_PT_PASS, '米PT 連射！ 南東から ・ 針路そのまま 艇尾は撃てない', HUD_COLOR_WARN]);
    expect(row(tele(ARC, { headingDeg: 135 }))[1]).toBe('米PT 連射！ 南東から ・ 針路そのまま 艇首は撃てない');
    expect(row(tele({ ...ARC, fired: false }, { headingDeg: 315 }))[1]).toBe('米PT 追撃！ 南東から ・ 針路そのまま 艇尾は撃てない');
    expect(row(tele({ ...ARC, gunStatus: GUN_FIRING, gunTargetM: 280 }, { headingDeg: 315 }))[1]).toBe('米PT 連射！ 南東から ・ 針路そのまま撃ち返せ'); // もう 1 隻を撃っている
    // 航過（連射でない）は「全速で」・黙った航過は今のまま
    expect(row(tele({ ...BURST, burst: false }))).toEqual([MISSION_PT_PASS, '米PT 航過！ 北西へ全速で転舵', HUD_COLOR_WARN]);
    expect(row(tele({ ...BURST, burst: false, fired: true, dodge: 0 }))[1]).toBe('米PT 掃射！ そのまま全速で離れろ');
    expect(row(tele({ ...BURST, burst: false, fired: true, passSilenced: true }))).toEqual([MISSION_PT_PASS, '米PT 被弾で沈黙！ もう撃ってこない', HOME_COLOR_TEXT]);
    // 赤い線（連射も）は 13mm の出来事・結果・射撃より上
    expect(row(tele({ ...BURST, gunStatus: GUN_FIRING, gunEverFired: true, gunTargetM: 280 }), 0, EVENT | RESULT)[0]).toBe(MISSION_PT_PASS);
  });
  it('追ってくる PT（撃つ権利なし）: 方角と距離（50 m 刻みの切り上げ。見えていなければ距離なし）・13mm を撃つ前は「右下の射撃で撃ち返せ」、撃った後は「撃ち返せ」', () => {
    expect(row(tele(CHASE))).toEqual([MISSION_PT_CONTACT, '米PT 南東から追ってくる 300 m ・ 右下の射撃で撃ち返せ', HUD_COLOR_WARN]);
    expect(row(tele({ ...CHASE, gunEverFired: true }))).toEqual([MISSION_PT_CONTACT, '米PT 南東から追ってくる 300 m ・ 撃ち返せ', HUD_COLOR_WARN]);
    expect(row(tele({ ...CHASE, dx: -150, dy: 0 }))[1]).toBe('米PT 西から追ってくる 150 m ・ 右下の射撃で撃ち返せ');
    expect(row(tele({ ...CHASE, sighted: false }))[1]).toBe('米PT 南東から追ってくる ・ 右下の射撃で撃ち返せ');
    // 13mm の射程（600 m）の外（ux-8）: 「撃ち返せ」の代わりに引きつけよ（押していても射程外の行は追ってくる PT の行に勝たない）
    expect(row(tele({ ...CHASE, dx: 0, dy: 640, gunEverFired: true, gunStatus: GUN_OUT_OF_RANGE }))[1]).toBe('米PT 南から追ってくる 650 m ・ 600 m まで引きつけよ');
    expect(row(tele({ ...CHASE, dx: 0, dy: 640 }))[1]).toBe('米PT 南から追ってくる 650 m ・ 600 m まで引きつけよ');
    expect(row(tele({ ...CHASE, dx: 0, dy: 600 }))[1]).toBe('米PT 南から追ってくる 600 m ・ 右下の射撃で撃ち返せ');
    // 何も撃てない射撃の行（射程外）は追ってくる PT の行に勝たない。撃っていれば射撃の行
    expect(row(tele({ ...CHASE, gunStatus: GUN_OUT_OF_RANGE }))[0]).toBe(MISSION_PT_CONTACT);
    expect(row(tele({ ...CHASE, gunStatus: GUN_FIRING, gunTargetM: 280, gunEverFired: true }))[0]).toBe(MISSION_PT_GUN);
  });
  it('連射の結果（最後に終えた攻撃が連射）: 無傷・被弾・撃たせなかったと撃たれた連射の「計 n 回」（上限は出さない＝ux-7）。航過の結果は今のまま', () => {
    expect(row(tele(BRES), 0, RESULT)).toEqual([MISSION_PT_CONTACT, '連射 被弾なし ・ 計 3 回', HOME_COLOR_TEXT]);
    expect(row(tele({ ...BRES, lastPassHits: 2 }), 0, RESULT)).toEqual([MISSION_PT_CONTACT, '連射 被弾 2 発（HP −8） ・ 計 3 回', HUD_COLOR_STRONG]);
    expect(row(tele({ ...BRES, lastPassFired: false }), 0, RESULT)).toEqual([MISSION_PT_CONTACT, '連射を撃たせなかった！ ・ 計 3 回', HOME_COLOR_TEXT]);
    expect(row(tele({ ...BRES, burstFired: false, maxPasses: 8 }), 0, RESULT)[1]).toBe('かわした！ 被弾なし ・ 航過 1/8');
  });
  it('制圧の出来事（PT_GUN_EV_SUPPRESS = 4。2.5 秒）・離脱（「残り N 回」なし）', () => {
    expect(row(tele({ ...CHASE, gunEvent: PT_GUN_EV_SUPPRESS, fighting: 2 }), 0, EVENT)).toEqual([MISSION_PT_GUN_EVENT, '米PT 制圧！ 追撃をやめて離れる ・ 残り 2 隻', HOME_COLOR_TEXT]);
    expect(row(tele({ gunEvent: PT_GUN_EV_SUPPRESS, fighting: 0, alive: 0 }), 0, EVENT)[1]).toBe('米PT 制圧！ 追撃をやめて離れる ・ 帰投せよ');
    // 同じ PT の連射の結果を足した出来事（ux-3。ui/pt-line-clock が merge を渡す）: 撃たせなかった・被弾なし・被弾。色は出来事の青のまま
    const ev = (pt: Partial<PtTelemetry>, res: Partial<PtTelemetry>): [string, string] => {
      const t = tele({ ...CHASE, fighting: 2, ...pt });
      const key = ptKey(t, MISSION_PT_GUN_EVENT, EVENT, 0, mergeBurstBits(tele(res).pt));
      const l = ptLine(t, MISSION_PT_GUN_EVENT, key);
      return [l.text, l.color];
    };
    expect(ev({ gunEvent: PT_GUN_EV_SUPPRESS }, { lastPassFired: false })).toEqual(['米PT 制圧！ 追撃をやめて離れる ・ 連射を撃たせなかった ・ 残り 2 隻', HOME_COLOR_TEXT]);
    expect(ev({ gunEvent: PT_GUN_EV_SUPPRESS }, { lastPassFired: true, lastPassHits: 0 })[0]).toBe('米PT 制圧！ 追撃をやめて離れる ・ 連射 被弾なし ・ 残り 2 隻');
    expect(ev({ gunEvent: PT_GUN_EV_CREW, fighting: 1 }, { lastPassFired: true, lastPassHits: 2 })[0]).toBe('米PT 撃退！ 死傷者が出て離脱 ・ 連射 被弾 2 発（HP −8） ・ 残り 1 隻');
    expect(ev({ gunEvent: PT_GUN_EV_SUNK, fighting: 0 }, { lastPassFired: true, lastPassHits: 1 })[0]).toBe('米PT 撃沈！ ガソリンに引火 ・ 連射 被弾 1 発（HP −4） ・ 帰投せよ');
    expect(row(tele({ ...CHASE, threatPhase: PT_BREAK }))).toEqual([MISSION_PT_CONTACT, '米PT 離脱 ・ 右下の射撃で撃ち返せ', HUD_COLOR_STRONG]);
    expect(row(tele({ ...CHASE, threatPhase: PT_BREAK, gunEverFired: true }))).toEqual([MISSION_PT_CONTACT, '米PT 離脱 ・ 次の赤い線に備えよ', HUD_COLOR_STRONG]);
    expect(row(tele({ ...CHASE, threatPhase: PT_RUN_IN }))[1]).toBe('米PT 南東から突撃 300 m ・ 赤い線で転舵'); // 突撃は今のまま
  });
});

describe('攻撃の終わりから結果まで（実機 2 回目のヘッドレス確認の直し）', () => {
  it('攻撃が終わって撃った弾がまだ飛んでいる間は赤い線の行を前のキーのまま保つ（追ってくる PT・射撃中の行が一瞬出てから結果へ変わらない）', () => {
    // ui/mission-line の 1 フレーム: 前のフレームのモードで ptHoldPass → flags に HOLD → missionMode → ptKey（前のキー）
    const frame = (t: BoatTelemetry, lastMode: number, lastKey: number, flags = 0): [number, number, string] => {
      const f = flags | (ptHoldPass(t, lastMode) ? HOLD : 0);
      const mode = missionMode(t, 0, f);
      const key = ptKey(t, mode, f, lastKey);
      return [mode, key, ptLine(t, mode, key).text];
    };
    const firing = tele({ ...BURST, fired: true, gunStatus: GUN_FIRING, gunTargetM: 280, gunEverFired: true });
    const [m1, k1, l1] = frame(firing, MISSION_PT_PASS, -1);
    expect([m1, l1]).toEqual([MISSION_PT_PASS, '米PT 連射！ 南東から ・ 針路そのまま撃ち返せ']);
    // 撃ち切って線が消えた次のフレーム（撃つ PT なし・弾が飛んでいる・その PT は追撃へ戻った・13mm は撃っている）
    const pending = tele({ ...CHASE, resultPending: true, gunStatus: GUN_FIRING, gunTargetM: 280, gunEverFired: true });
    expect(row(pending)[0]).toBe(MISSION_PT_GUN); // 保たなければ射撃中の行が数フレーム出ていた
    expect(frame(pending, m1, k1)).toEqual([MISSION_PT_PASS, k1, l1]);
    expect(frame(tele({ ...CHASE, resultPending: true }), m1, k1)).toEqual([MISSION_PT_PASS, k1, l1]); // 追ってくる PT の行も出ない
    const passK = keyOf(tele({ ...BURST, burst: false, fired: true }));
    expect(frame(tele({ ...CHASE, resultPending: true }), MISSION_PT_PASS, passK)[2]).toBe('米PT 掃射！ 北西へ全速で転舵'); // 航過も同じ
    // 弾がみな落ちたら結果（通し番号が増えて RESULT）
    expect(frame(tele({ ...BRES }), MISSION_PT_PASS, k1, RESULT)).toEqual([MISSION_PT_CONTACT, keyOf(tele(BRES), 0, RESULT), '連射 被弾なし ・ 計 3 回']);
    // 保たない: 前のフレームが赤い線の行でない・弾が飛んでいない・撃つ PT がいる（いつもの線）・米PT の無い任務。上の行（燃料切れ）はいつも勝つ
    expect(ptHoldPass(pending, MISSION_PT_CONTACT)).toBe(false);
    expect(ptHoldPass(tele(CHASE), MISSION_PT_PASS)).toBe(false);
    expect(ptHoldPass(tele({ ...BURST, resultPending: true }), MISSION_PT_PASS)).toBe(false);
    expect(ptHoldPass(tele({ enabled: false, resultPending: true }), MISSION_PT_PASS)).toBe(false);
    expect(missionMode(tele({ ...CHASE, resultPending: true }, { fuelEmpty: true }), 0, HOLD)).toBe(MISSION_ADRIFT);
  });
  it('テレメトリ: 隊の seqPending（攻撃の終わりに撃った弾がまだ飛んでいる）をそのまま', () => {
    const w = ptWorld();
    const t = initPtTelemetry(w);
    expect(t.resultPending).toBe(false);
    w.pts.section.seqPending = true;
    refreshPtTelemetry(t, w);
    expect(t.resultPending).toBe(true);
    w.pts.section.seqPending = false;
    refreshPtTelemetry(t, w);
    expect(t.resultPending).toBe(false);
  });
});

describe('キー（文が変わるときだけ変わる。31 ビットに収まる）', () => {
  it('連射: 同じ 8 方位なら同じ・撃ち始めで変わる・航過のキーと違う・黙った連射は方角で変わらない', () => {
    expect(k(BURST)).toBe(k({ ...BURST, dx: 210, dy: 190, dodge: -1, escapeDeg: 90 }));
    expect(k(BURST)).not.toBe(k({ ...BURST, dx: 0, dy: 300 }));
    expect(k(BURST)).not.toBe(k({ ...BURST, fired: true }));
    expect(k(BURST)).not.toBe(k({ ...BURST, burst: false }));
    expect(k({ ...BURST, passSilenced: true })).toBe(k({ ...BURST, passSilenced: true, fired: true, dx: -300, dy: 0 }));
    expect(k({ ...BURST, passSilenced: true })).not.toBe(k({ ...BURST, burst: false, passSilenced: true }));
    expect(k({ ...BURST, passSilenced: true })).not.toBe(k({ ...BURST, passSilenced: true, passRetired: true })); // ux-4
    // 射界の外（ux-2）: 押していなければ（SAFE）いつものキー、艇尾と艇首で違う、同じ側なら針路が少し変わっても同じ
    expect(k(ARC, 0, { headingDeg: 315 })).not.toBe(k({ ...ARC, gunStatus: 0 }, 0, { headingDeg: 315 }));
    expect(k(ARC, 0, { headingDeg: 315 })).not.toBe(k(ARC, 0, { headingDeg: 135 }));
    expect(k(ARC, 0, { headingDeg: 315 })).toBe(k(ARC, 0, { headingDeg: 300 }));
  });
  it('追ってくる PT: 同じ 50 m の刻みと 8 方位なら同じ・13mm を撃つと変わる・見えなくなると変わる。連射の結果は航過の結果と違い、数で変わる', () => {
    expect(k(CHASE)).toBe(k({ ...CHASE, dx: 210, dy: 205 }));
    expect(k(CHASE)).not.toBe(k({ ...CHASE, dx: 240, dy: 240 }));
    expect(k(CHASE)).not.toBe(k({ ...CHASE, gunEverFired: true }));
    expect(k(CHASE)).not.toBe(k({ ...CHASE, sighted: false }));
    expect(k(CHASE)).not.toBe(k({ ...CHASE, threatPhase: PT_BREAK }));
    expect(k(BRES, RESULT)).not.toBe(k({ ...BRES, burstFired: false }, RESULT));
    expect(k(BRES, RESULT)).not.toBe(k({ ...BRES, bursts: 4 }, RESULT));
    expect(k(BRES, RESULT)).toBe(k({ ...BRES, passes: 2, maxPasses: 3, dx: 5, dy: 5 }, RESULT)); // 連射の結果の行に航過の数と上限・位置は出ない
    expect(k({ ...CHASE, dx: 0, dy: 640 })).not.toBe(k({ ...CHASE, dx: 0, dy: 600 })); // 射程の外の文（ux-8）は距離の刻みで変わる
    for (const pt of [{ ...BURST, fired: true, dx: -2200, dy: -2200 }, { ...CHASE, dx: -2200, dy: -2200 }, { ...BRES, bursts: 15, lastPassHits: 63 }, { ...ARC, dx: -2200, dy: -2200 }]) {
      for (const flags of [0, RESULT]) {
        const key = k(pt, flags);
        expect(Number.isInteger(key) && key >= 0 && key < 2 ** 31, JSON.stringify(pt)).toBe(true);
      }
    }
  });
});

describe('幅（22 px・論理幅 1280 で左上の時計を避けても縮まない）', () => {
  it('追撃の新しい行と「全速で」の航過・離脱はいちばん長い値で 840 px 以内', () => {
    const far = { dx: -2200, dy: -2200 }; // 北西・刻みの上限（3,150 m）
    const cases: [Partial<PtTelemetry>, number][] = [
      [{ ...BURST, ...far }, 0],
      [{ ...BURST, ...far, fired: true }, 0],
      [{ ...BURST, passSilenced: true }, 0],
      [{ ...BURST, passSilenced: true, passRetired: true }, 0],
      [{ ...ARC, ...far }, 0],
      [{ ...CHASE, ...far }, 0],
      [{ ...CHASE, ...far, gunEverFired: true }, 0],
      [{ ...BRES, bursts: 15, lastPassHits: 63, damagePerHit: 4 }, RESULT],
      [{ ...BRES, bursts: 15, lastPassFired: false }, RESULT],
      [{ ...BRES, bursts: 15 }, RESULT],
      [{ ...CHASE, gunEvent: PT_GUN_EV_SUPPRESS, fighting: 7 }, EVENT],
      [{ ...BURST, burst: false, dodge: 0, fired: true }, 0],
      [{ ...BURST, burst: false, escapeDeg: 315, fired: true }, 0],
      [{ ...CHASE, threatPhase: PT_BREAK }, 0],
    ];
    for (const [pt, flags] of cases) {
      const [, text] = row(tele(pt, { headingDeg: 135 }), 0, flags);
      expect(text, JSON.stringify(pt)).not.toBe('');
      expect(textWidthPx(text, 22), text).toBeLessThanOrEqual(LINE2_MAX_PX);
    }
    // 出来事に足した連射の結果（ux-3）: いちばん長い種類（撃退）・1 回の連射の弾をみな受けた（burst_rounds 発）・残り 7 隻
    const wide = tele({ ...CHASE, gunEvent: PT_GUN_EV_CREW, fighting: 7 });
    const hits = S05.ptBoats!.burstRounds;
    const text = ptLine(wide, MISSION_PT_GUN_EVENT, ptKey(wide, MISSION_PT_GUN_EVENT, EVENT, 0, mergeBurstBits(tele({ lastPassFired: true, lastPassHits: hits }).pt))).text;
    expect(text).toBe(`米PT 撃退！ 死傷者が出て離脱 ・ 連射 被弾 ${hits} 発（HP −${hits * S05.ptBoats!.hit.damage}） ・ 残り 7 隻`);
    expect(textWidthPx(text, 22), text).toBeLessThanOrEqual(LINE2_MAX_PX);
  });
});

/** Result の材料（13mm を撃った夜） */
const BASE: PtResult = {
  enemyId: 'us_pt_enemy', total: 2, out: 0, alive: 2, leftAtDawn: false, passes: 3, maxPasses: 8, firedPasses: 7, cleanPasses: 2, shots: 70, hits: 9, damagePerHit: 4, hpMax: 50,
  firstDetectM: 1199.6, firstDetectBand: 'cruise', lostContacts: 0, closestM: 120, minWarnS: 2.52,
  gunEnabled: true, gunShots: 223, gunHits: 25, retired: 1, sunk: 0, flashFirst: false, bursts: 4, suppressions: 4,
};

describe('Result（spec r2 §F.4）', () => {
  it('1 行目: 航過・連射（0 回なら出さない）・かわした（撃たれた航過と連射のうち無傷）・被弾。4 行目: 制圧（0 なら出さない）を命中と撃退の間に', () => {
    const [a, , , d] = ptResultLines(BASE, 1, true);
    expect(a).toBe('米PT 航過 3 回 ・ 連射 4 回 ・ かわした 2/7 ・ 被弾 9 発（HP −36）');
    expect(d).toBe('13mm 射撃 223 発 ・ 命中 25（11%） ・ 制圧 4 ・ 撃退 1 ・ 撃沈 0');
    const none = ptResultLines({ ...BASE, bursts: 0, firedPasses: 3, suppressions: 0 }, 1, true);
    expect(none[0]).toBe('米PT 航過 3 回 ・ かわした 2/3 ・ 被弾 9 発（HP −36）');
    expect(none[3]).toBe('13mm 射撃 223 発 ・ 命中 25（11%） ・ 撃退 1 ・ 撃沈 0');
    expect(ptResultLines({ ...BASE, gunShots: 0, gunHits: 0, suppressions: 0 }, 1, true)[3]).toBe('13mm は撃たなかった');
  });
  it('幅: 1 行目（24 px）と 4 行目（20 px）はいちばん長い値で論理幅 1280 − 左右の HUD_MARGIN 48 の内', () => {
    const MAX = 1280 - 2 * 24;
    const wide: PtResult = { ...BASE, passes: 15, bursts: 15, firedPasses: 30, cleanPasses: 30, hits: 99, gunShots: 9999, gunHits: 999, suppressions: 99, retired: 2, sunk: 2 };
    const [a, , , d] = ptResultLines(wide, 99, true);
    expect(textWidthPx(a, 24), a).toBeLessThanOrEqual(MAX);
    expect(textWidthPx(d, 20), d).toBeLessThanOrEqual(MAX);
  });
});

describe('テレメトリと Result の材料（systems/pt-telemetry）', () => {
  it('連射中・黙った連射（制圧も。制圧の旗が残った PT の航過は黙ったと言わない）と撃退で黙った・最後の攻撃が連射とその PT・撃った連射の数・13mm の出来事の PT', () => {
    const w = ptWorld();
    const q = w.pts.section;
    const t = initPtTelemetry(w);
    expect([t.burst, t.burstFired, t.bursts, t.lastPassBoat, t.gunEventBoat, t.passRetired]).toEqual([false, false, 0, -1, -1, false]);
    q.detected = true;
    q.boats[0]!.phase = PT_CHASE;
    Object.assign(q.boats[1]!, { phase: PT_PASS, burst: true, firedThisPass: 2 });
    q.owner = 1;
    refreshPtTelemetry(t, w);
    expect([t.passing, t.burst, t.fired, t.passSilenced, t.passRetired, t.threatPhase]).toEqual([true, true, true, false, false, PT_PASS]);
    q.boats[1]!.suppressed = true;
    refreshPtTelemetry(t, w);
    expect([t.passSilenced, t.passRetired]).toEqual([true, false]);
    q.boats[1]!.fate = PT_FATE_CREW;
    refreshPtTelemetry(t, w);
    expect([t.passSilenced, t.passRetired]).toEqual([true, true]);
    Object.assign(q.boats[1]!, { burst: false, fate: 0 }); // 制圧の後の航過（旗が残っている）
    refreshPtTelemetry(t, w);
    expect([t.burst, t.passSilenced]).toEqual([false, false]);
    Object.assign(q, { firedBursts: 3, lastPassBurst: true, lastPassBoat: 1, gunEventBoat: 0 });
    refreshPtTelemetry(t, w);
    expect([t.bursts, t.burstFired, t.lastPassBoat, t.gunEventBoat]).toEqual([3, true, 1, 0]);
  });
  it('Result: 終わる瞬間に撃っていた連射は航過ではなく連射に数える（撃った・無傷の数はどちらも）。制圧の数。隊の KPI は変えない', () => {
    const w = ptWorld();
    const q = w.pts.section;
    Object.assign(q, { passes: 2, firedPasses: 5, cleanPasses: 2, firedBursts: 3, bursts: 3, suppressions: 2 });
    let r = ptResult(w)!;
    expect([r.passes, r.bursts, r.firedPasses, r.cleanPasses, r.suppressions]).toEqual([2, 3, 5, 2, 2]);
    Object.assign(q.boats[1]!, { phase: PT_PASS, burst: true, firedThisPass: 3 });
    q.owner = 1;
    r = ptResult(w)!;
    expect([r.passes, r.bursts, r.firedPasses, r.cleanPasses]).toEqual([2, 4, 6, 3]);
    q.boats[1]!.burst = false; // 航過なら航過に
    r = ptResult(w)!;
    expect([r.passes, r.bursts, r.firedPasses, r.cleanPasses]).toEqual([3, 3, 6, 3]);
    expect([q.passes, q.firedBursts, q.firedPasses]).toEqual([2, 3, 5]);
  });
  it('Result の健在（実機 2 回目のヘッドレス確認の直し）: 撃退で黙った連射・航過の線が残る間に任務が終わっても、撃退した PT は健在に数えない', () => {
    const w = ptWorld();
    const q = w.pts.section;
    Object.assign(q.boats[0]!, { phase: PT_PASS, burst: true, fate: PT_FATE_CREW, firedThisPass: 3 }); // 撃退で黙った連射（線は窓の終わりまで）
    q.owner = 0;
    q.boats[1]!.phase = PT_CHASE;
    const r = ptResult(w)!;
    expect([r.alive, r.retired]).toEqual([1, 1]);
    expect(ptHeadJa(r)).toBe('米PT: 撃退 1 ・ 健在 1 隻'); // 前は「撃退 1 ・ 健在 2 隻」（2 隻の隊）
    q.boats[0]!.burst = false; // 黙った航過も同じ
    expect(ptHeadJa(ptResult(w)!)).toBe('米PT: 撃退 1 ・ 健在 1 隻');
    q.boats[1]!.phase = PT_LEAVE;
    expect(ptHeadJa(ptResult(w)!)).toBe('米PT: 撃退 1 ・ 去った');
  });
});
