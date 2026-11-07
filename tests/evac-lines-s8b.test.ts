// v0.6.11 S8b（S6 の後の触る遊びの見つけ。jp_03 の HUD だけ）: 2 行目の文（ui/evac-lines・ui/evac-announce）とテレメトリ（systems/evac-telemetry・core/evac-telemetry）。
// 1. スティックを倒したまま引き継いだ（latch SW_WAIT_NEUTRAL）: 「…離してから倒すと操る」（警告の色）、切り替えてから EVAC_TAKE_HOLD_S は予告・出来事より上（落下の行の下。
//    落下の行も「一度離してから転舵！」）。全滅の後の自動の切替の直後は頭に「第3隊 全滅」。同じ隊の交代（僚艇に乗り移った）は押さえを立てない。
// 2. 予告の行: 始まる前に隠れた狙いは「狙い」に並べず「第6隊を見失う」（「狙い 第6隊（操作中）」と「第6隊は隠れている」が並んだ）、予告し直しの機の数は 1 編隊ごと
//    （「6機」→「2機×3」・撃墜で違えば「2〜3機×2」）。全部の組（ハードの 3 編隊 × 4 機まで）で 22 px ≤ 840 px・矛盾なし・狙いは 1 回ずつ。
// 3. 座席の隊長艇が乗り移らずに沈む（決着の後・浮いている艇がほかに無い）は EVS_SEAT_END「空襲の後は乗り移れない」「全 18 隻が沈んだ」（今まで「僚艇に乗り移った」）。
// 4. 操作中の隊が隠れ場所の中ならカメラの見越しを 0（WorldEvac.camCentred）・端の矢印のラベルを画面の枠の内に・上下の縁の矢印はラベルの幅で離す。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EVAC_TAKE_HOLD_S } from '../src/config/evac-config';
import { HUD_COLOR_STRONG, HUD_COLOR_WARN } from '../src/config/hud-text-config';
import { G_ENTERING, G_FOUND, G_HAULING, G_HIDDEN, G_MOORED, G_UNDERWAY, SW_FREE, SW_WAIT_INPUT, SW_WAIT_NEUTRAL } from '../src/core/evac-data';
import { evacSettle } from '../src/core/evac-seat';
import { evacMarkSunk } from '../src/core/evac-shelter';
import { evacLeader } from '../src/core/evac-squadron';
import {
  EVA_NONE, EVA_REPASS, EVA_WAVE, EVE_LOST, EVE_SINK, EVS_GONE, EVS_LEADER, EVS_SEAT, EVS_SEAT_END, EVS_WINGMAN, createEvacFeed, feedBoatSunk, type EvacTelemetry,
} from '../src/core/evac-telemetry';
import { SeededRng } from '../src/core/rng';
import { initEvacTelemetry, refreshEvacTelemetry } from '../src/systems/evac-telemetry';
import { EVAC_LINE_MAX_PX, EVL_ANNOUNCE, EVL_FALL, EVL_SINK, EVL_TAKEN, evacAnnounceJa, evacLine, evacLineKey, evacLineMode, jaWidthPx } from '../src/ui/evac-lines';
import { miniWorld } from './evac-world-kit';

const base = (): EvacTelemetry => initEvacTelemetry(miniWorld(1));
const clone = (e: EvacTelemetry, over: Partial<EvacTelemetry> = {}): EvacTelemetry => ({
  ...e, hp: Float64Array.from(e.hp), annTargets: Int32Array.from(e.annTargets), annTargetPlanes: Int32Array.from(e.annTargetPlanes), groupDx: Float64Array.from(e.groupDx), groupDy: Float64Array.from(e.groupDy), ...over,
});
const LABELS = ['第1隊', '第2隊', '第3隊', '第4隊', '第5隊', '第6隊'];
const strip = (code: string): string => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const src = (p: string): string => strip(readFileSync(p, 'utf8'));

/** 文の部分（「 ・ 」で切る）から: 狙いに並んだ隊・「を見失う」の隊・「は隠れている」の隊 */
function parts(s: string): { aim: string[]; lost: string[]; hid: string[] } {
  const out = { aim: [] as string[], lost: [] as string[], hid: [] as string[] };
  const groups = (x: string): string[] => LABELS.filter((g) => x.includes(g));
  for (const p of s.split(' ・ ')) {
    if (p.startsWith('狙い ')) out.aim.push(...groups(p));
    else if (p.endsWith('を見失う')) out.lost.push(...groups(p));
    else if (p.endsWith('は隠れている')) out.hid.push(...groups(p));
  }
  return out;
}

/** 予告の行の全部の組: 波／予告し直し × 波 × 編隊 2／3 × 狙いの数 × 操作中の隊を狙うか × 隠れた狙いのビット × 操作中の隊が隠れている × 機数（予告し直しは編隊ごとに 1〜4）× 目標なし × 操作中の隊 */
function cases(e0: EvacTelemetry): EvacTelemetry[] {
  const out: EvacTelemetry[] = [];
  for (const kind of [EVA_WAVE, EVA_REPASS])
    for (const w of [0, 1, 3])
      for (const flights of [2, 3])
        for (let n = 0; n <= flights; n++)
          for (const withCtl of n > 0 ? [false, true] : [false])
            for (let lost = 0; lost < 1 << n; lost++)
              for (const ctlHidden of [false, true]) {
                // 操作中の隊が隠れていて狙われていれば、その狙いは隠れている（同じフレームの値）。隠れていない操作中の隊の狙いは見失わない
                if (withCtl && ((lost & 1) !== 0) !== ctlHidden) continue;
                const planeSets: number[][] = [];
                if (kind === EVA_WAVE) for (const p of [2, 3, 4]) planeSets.push([p, p, p]);
                else for (let a = 1; a <= 4; a++) for (let b = 1; b <= 4; b++) for (let c = 1; c <= 4; c++) planeSets.push([a, b, c]);
                for (const ps of planeSets)
                  for (let none = 0; none <= (kind === EVA_WAVE ? flights - n : 0); none++)
                    for (const ctl of [0, 5]) {
                      let sum = 0;
                      for (let i = 0; i < n; i++) sum += ps[i]!;
                      const e = clone(e0, {
                        annKind: kind, annWave: w, annPlanes: kind === EVA_WAVE ? ps[0]! : sum, annFlights: flights, annCount: n, annNoTarget: none, annLost: lost,
                        phase: ctlHidden ? G_HIDDEN : G_UNDERWAY, control: ctl, latch: SW_FREE,
                      });
                      for (let i = 0; i < 3; i++) {
                        e.annTargets[i] = withCtl && i === 0 ? ctl : (ctl + 1 + i) % 6;
                        e.annTargetPlanes[i] = i < n ? ps[i]! : 0;
                      }
                      out.push(e);
                    }
              }
  return out;
}

describe('2. 予告の行（ui/evac-announce）', () => {
  it('全部の組で 22 px ≤ 840 px（縮めない）・狙いと隠れたの矛盾なし・狙いは 1 回ずつ・（操作中）は操作中の隊が狙われて見失わない時だけ・予告し直しは 1 編隊ごとの機数', () => {
    const all = cases(base());
    let max = 0;
    let lostSeen = 0;
    let ctlLostSeen = 0;
    let hidDropped = 0;
    for (const e of all) {
      const s = evacAnnounceJa(e);
      const wpx = jaWidthPx(s, 22);
      max = Math.max(max, wpx);
      expect(wpx, s).toBeLessThanOrEqual(EVAC_LINE_MAX_PX);
      expect(s).not.toContain('夜明け');
      const p = parts(s);
      const ctlLabel = LABELS[e.control]!;
      // 矛盾なし: 狙いに並んだ隊は隠れていない（見失う・隠れているのどちらにも出ない）
      for (const g of p.aim) expect(p.lost.includes(g) || p.hid.includes(g), s).toBe(false);
      if (e.phase === G_HIDDEN) expect(s, s).not.toContain('（操作中）');
      // 狙いは 1 回ずつ（狙いか見失うのどちらか）。見失うのビットどおり
      for (let i = 0; i < e.annCount; i++) {
        const g = LABELS[e.annTargets[i]!]!;
        const inLost = (e.annLost & (1 << i)) !== 0;
        expect([p.aim.includes(g), p.lost.includes(g)], s).toEqual([!inLost, inLost]);
        if (inLost) lostSeen++;
        if (inLost && e.annTargets[i] === e.control) ctlLostSeen++;
      }
      const ctlAimed = Array.from(e.annTargets.subarray(0, e.annCount)).some((gi, i) => gi === e.control && (e.annLost & (1 << i)) === 0);
      expect(s.includes(`${ctlLabel}（操作中）`), s).toBe(ctlAimed);
      // 操作中の隊が隠れていて、隠れた狙いが無ければ「は隠れている」（「東から」を落としても 840 px を超える組だけ落とす）
      if (e.phase !== G_HIDDEN || p.lost.length > 0) expect(p.hid, s).toEqual([]);
      else if (p.hid.length === 0) {
        hidDropped++;
        expect(jaWidthPx(`${s} ・ ${ctlLabel}は隠れている`, 22), s).toBeGreaterThan(EVAC_LINE_MAX_PX);
      } else expect(p.hid, s).toEqual([ctlLabel]);
      // 機の数: 1 編隊ごと（予告し直しで「N機」の N は 1 編隊の 4 機まで＝和を出さない）
      const head = s.split(' ・ ')[0]!;
      for (const m of head.matchAll(/(\d+)機/g)) expect(Number(m[1]), head).toBeLessThanOrEqual(4);
      if (e.annKind === EVA_WAVE) expect(head.startsWith(`第${e.annWave + 1}波 ${e.annPlanes}機×${e.annFlights}`), head).toBe(true);
      else {
        const ps = Array.from(e.annTargetPlanes.subarray(0, e.annCount));
        const lo = Math.min(...ps);
        const hi = Math.max(...ps);
        const want = ps.length === 0 ? `${e.annPlanes}機` : ps.length === 1 ? `${lo}機` : lo === hi ? `${lo}機×${ps.length}` : `${lo}〜${hi}機×${ps.length}`;
        expect(head.startsWith(`第${e.annWave + 1}波 ${want} 戻ってきた`), head).toBe(true);
      }
      // 尾が 2 つ以上なら「東から」を落とす（r2 M10）
      const tails = (p.lost.length > 0 ? 1 : 0) + (p.hid.length > 0 ? 1 : 0) + (s.includes('編隊 目標なし') ? 1 : 0);
      if (tails >= 2) expect(s, s).not.toContain('東から');
    }
    expect(all.length).toBeGreaterThan(10000);
    expect(lostSeen).toBeGreaterThan(1000);
    expect(ctlLostSeen).toBeGreaterThan(100);
    expect(hidDropped).toBeGreaterThan(0); // 予告し直しの 3 編隊・撃墜で機数が違う「1〜2機×3」の組だけ
    expect(max).toBeGreaterThan(780); // 見積もりが長い行を作っている
  });

  it('文の例: 見つけた組（狙い 第6隊（操作中） ・ 第6隊は隠れている）・ハードの 3 編隊・予告し直し（1 編隊・同じ機数・撃墜で違う）', () => {
    const e0 = base();
    const mk = (over: Partial<EvacTelemetry>, targets: number[], planes: number[]): EvacTelemetry => {
      const e = clone(e0, { annCount: targets.length, latch: SW_FREE, ...over });
      e.annTargets.set([...targets, 0, 0, 0].slice(0, 3));
      e.annTargetPlanes.set([...planes, 0, 0, 0].slice(0, 3));
      return e;
    };
    // S6 の触る遊び（W 1280・ノーマル）の行「第4波 4機×2 ・ 狙い 第6隊（操作中） ・ 第6隊は隠れている ・ 1編隊 目標なし」
    expect(evacAnnounceJa(mk({ annKind: EVA_WAVE, annWave: 3, annPlanes: 4, annFlights: 2, annNoTarget: 1, annLost: 1, phase: G_HIDDEN, control: 5 }, [5], [4]))).toBe('第4波 4機×2 ・ 第6隊を見失う ・ 1編隊 目標なし');
    expect(evacAnnounceJa(mk({ annKind: EVA_WAVE, annWave: 3, annPlanes: 4, annFlights: 3, annLost: 1, phase: G_HIDDEN, control: 5 }, [5, 0, 1], [4, 4, 4]))).toBe('第4波 4機×3 東から ・ 狙い 第1隊、第2隊 ・ 第6隊を見失う');
    // 上げている途中に狙われてほかの隊へ切り替えた隊が始まる前に隠れた（操作中の隊は外）
    expect(evacAnnounceJa(mk({ annKind: EVA_WAVE, annWave: 2, annPlanes: 3, annFlights: 3, annLost: 2, phase: G_UNDERWAY, control: 0 }, [0, 3, 4], [3, 3, 3]))).toBe('第3波 3機×3 東から ・ 狙い 第1隊（操作中）、第5隊 ・ 第4隊を見失う');
    // 見失う ＋ 目標なし（尾が 2 つ＝「東から」を落とす）。「は隠れた（見失う）」では 915 px だった組
    expect(evacAnnounceJa(mk({ annKind: EVA_WAVE, annWave: 0, annPlanes: 2, annFlights: 3, annNoTarget: 1, annLost: 2, phase: G_UNDERWAY, control: 0 }, [0, 2], [2, 2]))).toBe('第1波 2機×3 ・ 狙い 第1隊（操作中） ・ 第3隊を見失う ・ 1編隊 目標なし');
    expect(evacAnnounceJa(mk({ annKind: EVA_WAVE, annWave: 0, annPlanes: 2, annFlights: 2, annLost: 3, phase: G_UNDERWAY, control: 0 }, [1, 2], [2, 2]))).toBe('第1波 2機×2 東から ・ 第2隊、第3隊を見失う');
    // 予告し直し（最初の予告「第1波 2機×3」と同じ 1 編隊ごと。今まで 3 編隊の和「第1波 6機 戻ってきた」）
    expect(evacAnnounceJa(mk({ annKind: EVA_REPASS, annWave: 0, annPlanes: 6, annFlights: 3, control: 0 }, [1, 2, 3], [2, 2, 2]))).toBe('第1波 2機×3 戻ってきた 東から ・ 狙い 第2隊、第3隊、第4隊');
    expect(evacAnnounceJa(mk({ annKind: EVA_REPASS, annWave: 1, annPlanes: 5, annFlights: 2, control: 0 }, [3, 4], [3, 2]))).toBe('第2波 2〜3機×2 戻ってきた 東から ・ 狙い 第4隊、第5隊');
    expect(evacAnnounceJa(mk({ annKind: EVA_REPASS, annWave: 1, annPlanes: 3, annFlights: 2, control: 0 }, [3], [3]))).toBe('第2波 3機 戻ってきた 東から ・ 狙い 第4隊');
    // キー: 見失うビット・編隊ごとの機数が変われば変わる（文が変わる）
    const a = mk({ annKind: EVA_REPASS, annWave: 1, annPlanes: 6, annFlights: 2, control: 0 }, [3, 4], [3, 3]);
    const k = evacLineKey(a);
    expect(evacLineMode(a)).toBe(EVL_ANNOUNCE);
    expect(evacLineKey(clone(a, { annLost: 2 }))).not.toBe(k);
    const b = clone(a);
    b.annTargetPlanes.set([3, 2, 0]);
    expect(evacLineKey(b)).not.toBe(k);
    expect(Number.isSafeInteger(k)).toBe(true);
    expect(k % 2 ** 40).toBeLessThan(2 ** 40);
  });

  it('テレメトリ: 予告の狙いが始まる前に隠れたら annLost のビットが立ち、狙いの編隊ごとの撃墜されていない機の数を annTargetPlanes に写す', () => {
    const w = miniWorld(2);
    const t = initEvacTelemetry(w);
    let k = 0;
    while (t.annKind === EVA_NONE && k++ < 60 * 60) {
      w.frame();
      refreshEvacTelemetry(t, w);
    }
    expect(t.annKind).toBe(EVA_WAVE);
    expect(t.annCount).toBeGreaterThan(0);
    expect(Array.from(t.annTargetPlanes.subarray(0, t.annCount))).toEqual(new Array(t.annCount).fill(t.annPlanes));
    expect(t.annLost).toBe(0);
    const gi = t.annTargets[t.annCount - 1]!;
    const g = w.evac.sq.groups[gi]!;
    const ph = g.phase;
    g.phase = G_HIDDEN; // 上げ終えて隠れた隊（試しのために段階だけ置く）
    refreshEvacTelemetry(t, w);
    expect(t.annLost).toBe(1 << (t.annCount - 1));
    const s = evacAnnounceJa(t);
    expect(s).toContain(`${LABELS[gi]}を見失う`);
    expect(parts(s).aim).not.toContain(LABELS[gi]);
    g.phase = ph;
    refreshEvacTelemetry(t, w);
    expect(t.annLost).toBe(0);
  });
});

describe('1. 倒したまま引き継いだ（latch SW_WAIT_NEUTRAL）', () => {
  it('文: 「離してから倒すと操る」（警告の色）、倒していなければ「倒すと操る」（今の色）。全滅の後の自動の切替の直後は頭に全滅。どの組も ≤ 840 px', () => {
    const e0 = clone(base(), { control: 3, phase: G_UNDERWAY, latch: SW_WAIT_NEUTRAL });
    const held = evacLine(e0);
    expect(held).toEqual({ text: '第4隊を引き継いだ ・ 逃げる針路と速さのまま ・ 離してから倒すと操る', color: HUD_COLOR_WARN });
    expect(evacLine(clone(e0, { latch: SW_WAIT_INPUT }))).toEqual({ text: '第4隊を引き継いだ ・ 逃げる針路と速さのまま ・ 倒すと操る', color: HUD_COLOR_STRONG });
    expect(evacLine(clone(e0, { phase: G_MOORED })).text).toBe('第4隊を引き継いだ ・ 離してから倒すと操る');
    const gone = clone(e0, { takeHold: true, event: EVE_SINK, eventSub: EVS_GONE, eventGroup: 2, eventN: 12 });
    expect(evacLineMode(gone)).toBe(EVL_TAKEN);
    expect(evacLine(gone).text).toBe('第3隊 全滅 ・ 第4隊を引き継いだ ・ 離してから倒すと操る');
    // キー: latch と全滅の頭で変わる（文が変わる）
    expect(evacLineKey(clone(e0, { latch: SW_WAIT_INPUT }))).not.toBe(evacLineKey(e0));
    expect(evacLineKey(clone(gone, { annKind: EVA_NONE }))).not.toBe(evacLineKey(clone(e0, { takeHold: true })));
    for (let c = 0; c < 6; c++)
      for (const ph of [G_UNDERWAY, G_MOORED])
        for (const latch of [SW_WAIT_INPUT, SW_WAIT_NEUTRAL])
          for (const ev of [false, true]) {
            const e = clone(e0, { control: c, phase: ph, latch, takeHold: true, ...(ev ? { event: EVE_SINK, eventSub: EVS_GONE, eventGroup: (c + 1) % 6 } : {}) });
            const s = evacLine(e).text;
            expect(jaWidthPx(s, 22), s).toBeLessThanOrEqual(EVAC_LINE_MAX_PX);
            expect(s.includes('離してから'), s).toBe(latch === SW_WAIT_NEUTRAL);
          }
  });

  it('上ほど優先: 切り替えてから EVAC_TAKE_HOLD_S の間は引き継いだ行が予告・沈没・見失ったより上（落下の行の下。落下の行も「一度離してから転舵！」）。倒していない引き継ぎは今までどおり予告の下', () => {
    const ann = clone(base(), { control: 3, phase: G_UNDERWAY, latch: SW_WAIT_NEUTRAL, annKind: EVA_WAVE, annWave: 1, annPlanes: 3, annFlights: 2, annCount: 1 });
    ann.annTargets.set([3, 0, 0]);
    ann.annTargetPlanes.set([3, 0, 0]);
    expect(evacLineMode(ann)).toBe(EVL_ANNOUNCE); // 押さえの秒の後は予告に戻る
    expect(evacLineMode(clone(ann, { takeHold: true }))).toBe(EVL_TAKEN);
    expect(evacLineMode(clone(ann, { takeHold: true, latch: SW_WAIT_INPUT }))).toBe(EVL_ANNOUNCE);
    expect(evacLineMode(clone(ann, { takeHold: true, latch: SW_FREE }))).toBe(EVL_ANNOUNCE);
    expect(evacLineMode(clone(ann, { takeHold: true, phase: G_HAULING }))).toBe(EVL_ANNOUNCE); // 上げている隊は引き継いだ行の段階でない
    expect(evacLineMode(clone(ann, { takeHold: true, event: EVE_LOST, eventGroup: 1, eventSub: 2 }))).toBe(EVL_TAKEN);
    expect(evacLineMode(clone(ann, { takeHold: true, annKind: EVA_NONE, event: EVE_SINK, eventSub: EVS_WINGMAN, eventGroup: 1 }))).toBe(EVL_TAKEN);
    expect(evacLineMode(clone(ann, { annKind: EVA_NONE, event: EVE_SINK, eventSub: EVS_WINGMAN, eventGroup: 1 }))).toBe(EVL_SINK);
    const fall = clone(ann, { takeHold: true, falling: true });
    expect(evacLineMode(fall)).toBe(EVL_FALL);
    expect(evacLine(fall).text).toBe('爆弾投下！ 一度離してから転舵！');
    expect(evacLine(clone(fall, { latch: SW_WAIT_INPUT })).text).toBe('爆弾投下！ 転舵！');
    expect(evacLine(clone(fall, { latch: SW_FREE })).text).toBe('爆弾投下！ 転舵！');
    expect(evacLineKey(fall)).not.toBe(evacLineKey(clone(fall, { latch: SW_FREE })));
  });

  it('テレメトリ: ［切替］を倒したまま押すと latch SW_WAIT_NEUTRAL・takeHold が EVAC_TAKE_HOLD_S だけ立ち、その間は引き継いだ行。離せば「倒すと操る」', () => {
    const w = miniWorld(3);
    const t = initEvacTelemetry(w);
    for (let i = 0; i < 30; i++) {
      w.frame();
      refreshEvacTelemetry(t, w);
    }
    expect(t.takeHold).toBe(false);
    const before = t.control;
    w.input.stickActive = true;
    w.input.headingDeg = 90;
    w.input.speed01 = 0.8;
    w.input.switchTap = true;
    w.frame();
    refreshEvacTelemetry(t, w);
    const t0 = w.stepTimeS;
    expect(t.control).not.toBe(before);
    expect([t.latch, t.takeHold]).toEqual([SW_WAIT_NEUTRAL, true]);
    expect(evacLineMode(t)).toBe(t.falling ? EVL_FALL : EVL_TAKEN);
    expect(evacLine(t).text).toContain('を引き継いだ');
    expect(evacLine(t).text).toContain('離してから倒すと操る');
    let held = 0;
    while (t.takeHold && held < 600) {
      w.frame();
      refreshEvacTelemetry(t, w);
      held++;
    }
    expect(w.stepTimeS - t0).toBeGreaterThanOrEqual(EVAC_TAKE_HOLD_S - 1e-9);
    expect(w.stepTimeS - t0).toBeLessThan(EVAC_TAKE_HOLD_S + 0.05);
    expect(t.latch).toBe(SW_WAIT_NEUTRAL); // 倒したまま＝まだ効かない（押さえの後は予告がまた上に出る）
    w.input.speed01 = 0;
    w.frame();
    refreshEvacTelemetry(t, w);
    expect(t.latch).toBe(SW_WAIT_INPUT);
    if (t.annKind === EVA_NONE && !t.falling && t.event === 0) expect(evacLine(t).text).toContain('倒すと操る');
  });

  it('テレメトリ: 全滅の後の自動の切替を倒したまま受けると押さえが立ち「第N隊 全滅 ・ …離してから倒すと操る」。同じ隊の交代（僚艇に乗り移った）は押さえを立てない', () => {
    const big = { damage: 9999, fireChance: 0, engineDamageChance: 0 };
    const w = miniWorld(9);
    const t = initEvacTelemetry(w);
    w.input.stickActive = true;
    w.input.headingDeg = 90;
    w.input.speed01 = 0.8;
    w.frame(); // スティックを倒したまま（stickOut）
    refreshEvacTelemetry(t, w);
    const sq = w.evac.sq;
    const gi = sq.control;
    // 同じ隊の交代: latch は置き直さない＝押さえなし・沈没の行
    sq.latch = SW_WAIT_NEUTRAL;
    expect(w.bd.applyHit(big, new SeededRng(1), 0, 0, 'air_strike')).toBe(false);
    refreshEvacTelemetry(t, w);
    expect([t.control, t.eventSub, t.takeHold]).toEqual([gi, EVS_SEAT, false]);
    expect([t.falling, t.annKind]).toEqual([false, EVA_NONE]); // この seed の 2 秒は予告も落下も無い
    expect(evacLine(t).text).toBe('隊長艇 沈没！ 僚艇に乗り移った（残存 17）');
    // 隊の残りの艇を沈めて座席を沈める＝全滅 → 並びの先頭の隊へ自動で切り替え（倒したまま＝SW_WAIT_NEUTRAL）
    for (const b of sq.groups[gi]!.boats) if (b.slot !== sq.groups[gi]!.leader) b.sunk = true;
    expect(w.bd.applyHit(big, new SeededRng(2), 0, 0, 'air_strike')).toBe(false);
    refreshEvacTelemetry(t, w);
    expect(t.control).not.toBe(gi);
    expect([t.latch, t.takeHold, t.event, t.eventSub, t.eventGroup]).toEqual([SW_WAIT_NEUTRAL, true, EVE_SINK, EVS_GONE, gi]);
    expect([t.falling, takenOk(t.phase)]).toEqual([false, true]);
    expect(evacLineMode(t)).toBe(EVL_TAKEN);
    expect(evacLine(t).text).toBe(`${LABELS[gi]} 全滅 ・ ${LABELS[t.control]}を引き継いだ ・ 離してから倒すと操る`);
  });
});

/** 引き継いだ行の段階（走る・停泊・見つかった陰） */
const takenOk = (ph: number): boolean => ph === G_UNDERWAY || ph === G_MOORED || ph === G_FOUND;

describe('3. 座席の隊長艇が乗り移らずに沈む（EVS_SEAT_END）', () => {
  it('feedBoatSunk: 決着の後か浮いている艇がほかに無ければ EVS_SEAT_END、決着の前で浮いている艇があれば EVS_SEAT。操作していない隊長艇・僚艇は今のまま', () => {
    const w = miniWorld(4);
    const sq = w.evac.sq;
    const g = sq.groups[sq.control]!;
    const kind = (b: ReturnType<typeof evacLeader>): number => {
      const f = createEvacFeed(sq.groups.length);
      feedBoatSunk(f, sq, b!);
      return f.sinkKind;
    };
    const lead = evacLeader(g)!;
    evacMarkSunk(lead, 10);
    expect(kind(lead)).toBe(EVS_SEAT);
    const other = evacLeader(sq.groups[(sq.control + 1) % 6]!)!;
    expect(kind(other)).toBe(EVS_LEADER);
    expect(kind(g.boats[1]!)).toBe(EVS_WINGMAN);
    evacSettle(sq);
    expect(kind(lead)).toBe(EVS_SEAT_END);
    sq.settled = false;
    for (const b of sq.boats) b.sunk = true;
    expect(kind(lead)).toBe(EVS_SEAT_END);
  });

  it('世界: 決着の後に座席が沈むと 2 行目は「空襲の後は乗り移れない（残存 17）」、18 隻目なら「全 18 隻が沈んだ」（「僚艇に乗り移った」と言わない）', () => {
    const big = { damage: 9999, fireChance: 0, engineDamageChance: 0 };
    const w = miniWorld(5);
    const t = initEvacTelemetry(w);
    evacSettle(w.evac.sq);
    expect(w.bd.applyHit(big, new SeededRng(1), 0, 0, 'air_strike')).toBe(true);
    refreshEvacTelemetry(t, w);
    expect([t.event, t.eventSub, t.eventN]).toEqual([EVE_SINK, EVS_SEAT_END, 17]);
    expect(evacLineMode(t)).toBe(EVL_SINK);
    expect(evacLine(t).text).toBe('隊長艇 沈没！ 空襲の後は乗り移れない（残存 17）');
    const v = miniWorld(6);
    const u = initEvacTelemetry(v);
    for (const b of v.evac.sq.boats) if (b.group !== v.evac.sq.control || b.slot !== 0) b.sunk = true;
    expect(v.bd.applyHit(big, new SeededRng(1), 0, 0, 'air_strike')).toBe(true);
    refreshEvacTelemetry(u, v);
    expect([u.eventSub, u.eventN]).toEqual([EVS_SEAT_END, 0]);
    expect(evacLine(u).text).toBe('隊長艇 沈没！ 全 18 隻が沈んだ');
    for (const s of [evacLine(t).text, evacLine(u).text]) {
      expect(s).not.toContain('乗り移った');
      expect(jaWidthPx(s, 22)).toBeLessThanOrEqual(EVAC_LINE_MAX_PX);
    }
    // 決着の前に浮いている艇があれば今までどおり乗り移る
    const x = miniWorld(7);
    const y = initEvacTelemetry(x);
    expect(x.bd.applyHit(big, new SeededRng(1), 0, 0, 'air_strike')).toBe(false);
    refreshEvacTelemetry(y, x);
    expect(y.eventSub).toBe(EVS_SEAT);
    expect(evacLine(y).text).toBe('隊長艇 沈没！ 僚艇に乗り移った（残存 17）');
  });
});

describe('4. カメラと端の矢印（jp_03 だけ）', () => {
  it('WorldEvac.camCentred: 操作中の隊が隠れ場所の中（入っている・上げている・隠れている）の間だけ真（scenes/mission-scene の見越しを 0 に）。ほかの任務は evac が無い＝今までの見越し', () => {
    const w = miniWorld(8);
    const g = w.evac.sq.groups[w.evac.sq.control]!;
    const ph = g.phase;
    const seen: boolean[] = [];
    for (const p of [G_MOORED, G_UNDERWAY, G_FOUND, G_ENTERING, G_HAULING, G_HIDDEN]) {
      g.phase = p;
      seen.push(w.evac.camCentred);
    }
    g.phase = ph;
    expect(seen).toEqual([false, false, false, true, true, true]);
    const scene = src('src/scenes/mission-scene.ts');
    expect(scene).toContain('const a = this.world.evac?.camCentred ? 0 : CAMERA_LOOK_AHEAD_M;');
    expect(scene).toContain('this.cameras.main.setFollowOffset(-Math.sin(h) * a, Math.cos(h) * a);');
  });
  it('端の矢印: evac の矢印だけラベルを画面の枠の左右 HUD_MARGIN の内に（labelInset。ほかの任務の矢印は省く＝今のまま）、上下の縁ではラベルの幅で離す', () => {
    const m = src('src/ui/evac-markers.ts');
    expect(m.match(/hideMargin: 0, labelInset: HUD_MARGIN \}/g)?.length).toBe(2);
    expect(m).toContain('const sep = side ? SEP_PX : Math.max(SEP_PX, (a.labelWidth + m.labelWidth) / 2 + LABEL_SEP_GAP_PX);');
    const e = src('src/ui/edge-marker.ts');
    expect(e).toContain('if (inset === undefined) return;');
    expect(e).toContain('const x = Math.min(Math.max(this.label.x, inset + half), GAME_WIDTH - inset - half);');
    for (const f of ['src/ui/hud-markers.ts', 'src/ui/landing-markers.ts']) expect(src(f), f).not.toContain('labelInset');
  });
});
