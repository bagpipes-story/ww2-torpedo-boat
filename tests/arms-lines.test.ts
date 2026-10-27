// 兵装の上の 1 行（v0.6.8 S4。ui/arms-lines・spec-v068 §4.5）: 文と色、どの文も 22 px で 264 px 以内（帯 W − 288〜W − 24）、魚雷の出来事は魚雷の上・ほかは機銃の上、
// 選び方（魚雷を押している間は隠す > 出ている出来事 > 状態 > 無し・出来事は通し番号が変わったときだけ・撃墜は 2.2 秒で飛び出す・Hud を作ったときの通し番号は出さない）。
// Result の 1 行と Briefing の文は S5。
import { describe, expect, it } from 'vitest';
import { ARMS_CUE_DOWN_MS, ARMS_CUE_TORP_MS, CUE_DOWN_COLOR } from '../src/config/arms-config';
import { CUE_MAX_W, CUE_PX } from '../src/config/hud-layout-config';
import { HUD_COLOR_STRONG, HUD_COLOR_WARN } from '../src/config/hud-text-config';
import {
  CUE_NONE,
  EV_DOWN_SEAPLANE,
  EV_DOWN_SORTIE,
  EV_DOWN_STRIKE,
  EV_TORP_BARGE,
  EV_TORP_EMPTY,
  EV_TORP_NOSHIP,
  EV_TORP_PT,
  ST_AA,
  ST_ARC,
  ST_NONE,
  ST_RELOAD,
  ST_SHIP,
  ST_SMOKE,
  createArmsTelemetry,
} from '../src/core/arms-cue';
import { ArmsCuePicker, armsCueDurationMs, armsCueIsDown, armsCueJa, armsCueOverTorpedo } from '../src/ui/arms-lines';
import { textWidthPx } from './pt-ui-kit';

const EVENTS = [EV_TORP_BARGE, EV_TORP_PT, EV_TORP_NOSHIP, EV_DOWN_STRIKE, EV_DOWN_SEAPLANE, EV_DOWN_SORTIE, EV_TORP_EMPTY];
const STATES = [ST_SHIP, ST_AA, ST_ARC, ST_NONE, ST_SMOKE, ST_RELOAD];

describe('文と色（spec-v068 §4.5）', () => {
  it('出来事の文', () => {
    expect(EVENTS.map((c) => armsCueJa(c, 3).text)).toEqual(['大発の下を抜ける', 'PTの下を抜ける', '狙う艦がいない', '敵機 撃墜！ 残り 3 機', '水上機 撃墜！', '哨戒機 撃墜！', '魚雷は撃ち尽くした']);
  });
  it('状態の文（機銃を押している間）', () => {
    expect(STATES.map((c) => armsCueJa(c, 4).text)).toEqual(['艦には効かない', '対空 ・ まず当たらない', '射界外 ・ 舷側に向けよ', '射程に敵なし', '煙幕で見えない', '弾倉交換 ・ あと 4 秒']);
  });
  it('色: 撃墜は金・艦には効かないは警告・ほかはいつもの白', () => {
    for (const c of [...EVENTS, ...STATES]) {
      const want = armsCueIsDown(c) ? CUE_DOWN_COLOR : c === ST_SHIP ? HUD_COLOR_WARN : HUD_COLOR_STRONG;
      expect(armsCueJa(c, 1).color, String(c)).toBe(want);
    }
  });
  it('無し（CUE_NONE）と知らない番号は空の文', () => {
    expect(armsCueJa(CUE_NONE, 0).text).toBe('');
    expect(armsCueJa(99, 0).text).toBe('');
  });
  it(`どの文も ${CUE_PX} px で ${CUE_MAX_W} px 以内（数は 2 桁まで）`, () => {
    for (const c of [...EVENTS, ...STATES]) for (const n of [0, 4, 9, 99]) expect(textWidthPx(armsCueJa(c, n).text, CUE_PX), `${c} ${n}`).toBeLessThanOrEqual(CUE_MAX_W);
  });
  it('寄せる先: 魚雷の出来事（狙う艦の無い魚雷・0 本）は魚雷の上、撃墜と状態は機銃の上', () => {
    expect(EVENTS.filter(armsCueOverTorpedo)).toEqual([EV_TORP_BARGE, EV_TORP_PT, EV_TORP_NOSHIP, EV_TORP_EMPTY]);
    expect(STATES.some(armsCueOverTorpedo)).toBe(false);
  });
  it('出す秒: 撃墜 2.2 秒・魚雷 1.6 秒', () => {
    expect([armsCueDurationMs(EV_DOWN_STRIKE), armsCueDurationMs(EV_DOWN_SEAPLANE), armsCueDurationMs(EV_DOWN_SORTIE)]).toEqual([ARMS_CUE_DOWN_MS, ARMS_CUE_DOWN_MS, ARMS_CUE_DOWN_MS]);
    expect([armsCueDurationMs(EV_TORP_BARGE), armsCueDurationMs(EV_TORP_EMPTY)]).toEqual([ARMS_CUE_TORP_MS, ARMS_CUE_TORP_MS]);
    expect([ARMS_CUE_DOWN_MS, ARMS_CUE_TORP_MS]).toEqual([2200, 1600]);
  });
});

describe('選び方（ArmsCuePicker）', () => {
  const tele = (): ReturnType<typeof createArmsTelemetry> => createArmsTelemetry();
  it('Hud を作ったときの通し番号の出来事は出さない・状態が無ければ無し', () => {
    const a = tele();
    a.evCode = EV_TORP_PT;
    a.evSeq = 5;
    const p = new ArmsCuePicker(5);
    p.pick(a, 0, false);
    expect([p.code, p.n]).toEqual([CUE_NONE, 0]);
  });
  it('通し番号が変わったら出来事をその秒だけ出し、終われば状態へ（出来事 > 状態）', () => {
    const a = tele();
    const p = new ArmsCuePicker(0);
    a.stCode = ST_AA;
    p.pick(a, 1000, false);
    expect(p.code).toBe(ST_AA);
    a.evCode = EV_DOWN_STRIKE;
    a.evN = 3;
    a.evSeq = 1;
    p.pick(a, 2000, false);
    expect([p.code, p.n, p.popPending]).toEqual([EV_DOWN_STRIKE, 3, true]);
    p.popPending = false;
    p.pick(a, 2000 + ARMS_CUE_DOWN_MS - 1, false);
    expect(p.code).toBe(EV_DOWN_STRIKE);
    p.pick(a, 2000 + ARMS_CUE_DOWN_MS, false);
    expect(p.code).toBe(ST_AA);
    a.stCode = ST_RELOAD;
    a.stN = 2;
    p.pick(a, 5000, false);
    expect([p.code, p.n, p.popPending]).toEqual([ST_RELOAD, 2, false]);
  });
  it('魚雷を押している間は何も出さない（「一斉 N 本」と重ねない）。離せば残りの秒だけ出来事', () => {
    const a = tele();
    const p = new ArmsCuePicker(0);
    a.evCode = EV_TORP_BARGE;
    a.evSeq = 1;
    a.stCode = ST_NONE;
    p.pick(a, 0, true);
    expect(p.code).toBe(CUE_NONE);
    p.pick(a, 500, false);
    expect(p.code).toBe(EV_TORP_BARGE);
    p.pick(a, ARMS_CUE_TORP_MS, false);
    expect(p.code).toBe(ST_NONE);
  });
  it('HUD だけの出来事（0 本で魚雷）: local で始まり 1.6 秒。続く世界の出来事が上書きする', () => {
    const a = tele();
    const p = new ArmsCuePicker(0);
    p.local(EV_TORP_EMPTY, 100);
    p.pick(a, 100, false);
    expect(p.code).toBe(EV_TORP_EMPTY);
    a.evCode = EV_DOWN_SEAPLANE;
    a.evSeq = 1;
    p.pick(a, 200, false);
    expect(p.code).toBe(EV_DOWN_SEAPLANE);
    p.pick(a, 200 + ARMS_CUE_DOWN_MS, false);
    expect(p.code).toBe(CUE_NONE);
  });
});
