// v0.8.5 IP7（実機 3 回目）: 上中央 4 行目の任務の行を全シナリオへ（ui/objective-line・ui/objective-specs）・板（囲い・塗り）を外す。
// - 文とキーと色の段（任務ごと）: 救助 us_07・空襲下の退避 jp_03・揚陸 jp_04・大発の輸送隊 jp_01・報告 us_05・大発掃討 us_03・僚艇 us_01。成否の数の無い任務は null。
// - 変わった時だけ: 毎フレームは spec.key を比べるだけ・同じキーなら setText も色も倍率も触らない（偽の scene の Text で数える）。
// - 置き場所（W 1280・1560）: どの文も 3 行目の下・端の印の上・燃料の注意と技能の列に掛からない（縮めた後）。
// - 同じ数を 2 段に出さない: 2 行目・3 行目の常の文から数を抜いた（平常の僚艇の HP・大発の撃破・輸送隊の数・揚陸の %・報告の追尾の秒・退避の残存と隠れた艇と空襲が去るまで）。
import { describe, expect, it } from 'vitest';
import { HOME_COLOR_TEXT, HUD_COLOR_WARN } from '../src/config/hud-text-config';
import { HUD_LAYOUT_M, R_SKILL } from '../src/config/hud-layout-config';
import { OBJECTIVE_LINE_COLOR, OBJECTIVE_LINE_DY, OBJECTIVE_LINE_PX, OBJECTIVE_LINE_SIDE_KEEP_PX } from '../src/config/objective-hud-config';
import { SURVIVOR_LABEL_COLOR } from '../src/config/rescue-art-config';
import type { BoatTelemetry } from '../src/core/boat-telemetry';
import { createConvoyTelemetry } from '../src/core/convoy';
import { createEvacTelemetry } from '../src/core/evac-telemetry';
import { LD_DONE, LD_SUNK, LD_UNLOADING, createLandingTelemetry } from '../src/core/landing';
import { RECON_NONE, RECON_PENDING, RECON_RELAYED, RECON_SENT, RECON_TRACKING } from '../src/core/recon-report';
import {
  BARGE_OBJECTIVE, ESCORT_OBJECTIVE, EVAC_OBJECTIVE, LANDING_OBJECTIVE, OBJ_TONE_DONE, OBJ_TONE_NORMAL, OBJ_TONE_WARN, RECON_OBJECTIVE, RESCUE_OBJECTIVE, convoyObjective, objectiveSpecOf, type ObjectiveSpec,
} from '../src/ui/objective-specs';
import { statusFitScale } from '../src/ui/rescue-texts';
import { code } from './core-rules-kit';
import { textWidthPx } from './pt-ui-kit';

type T = BoatTelemetry;
/** 任務の鍵の無い（成否の数の無い任務の）テレメトリの部分。任務ごとに上書きする */
const base = (o: Record<string, unknown> = {}): T =>
  ({ evac: createEvacTelemetry(), landing: createLandingTelemetry(), convoy: createConvoyTelemetry(), gunMission: false, escortEnabled: false, bargesSunk: 0, bargesBeached: 0, bargesTotal: 0, bargesQuota: 0, escortHp: 0, escortHpMax: 0, escortSunk: false, ...o }) as unknown as T;
const evac = (o: Record<string, unknown> = {}): T => base({ evac: { ...createEvacTelemetry(), enabled: true, total: 18, quota: 6, survivors: 18, hiddenBoats: 15, leftS: 199.2, settled: false, ...o } });
const landing = (o: Record<string, unknown> = {}): T => base({ landing: { ...createLandingTelemetry(), enabled: true, hitsToSink: 3, phase: LD_UNLOADING, pct: 0.634, hits: 0, ...o } });
const convoy = (o: Record<string, unknown> = {}): T => base({ convoy: { ...createConvoyTelemetry(), enabled: true, total: 3, afloat: 3, arrived: 0, sunk: 0, ...o } });
const recon = (o: Record<string, unknown> = {}): T => base({ recon: { stage: RECON_NONE, radioBroken: false, trackedS: 0, trackLeftS: 0, identifyJa: '戦艦', ...o } });
const barge = (o: Record<string, unknown> = {}): T => base({ gunMission: true, bargesSunk: 2, bargesBeached: 1, bargesTotal: 6, bargesQuota: 3, ...o });
const escort = (o: Record<string, unknown> = {}): T => base({ escortEnabled: true, escortHp: 84.2, escortHpMax: 100, escortSunk: false, ...o });
const rescue = (o: Record<string, unknown> = {}): T => base({ rescue: { capacity: 20, objective: 40, aboard: 3, delivered: 12, onWater: 33, ...o } });
const CONVOY = convoyObjective(2);

describe('任務の行の文と色の段（任務ごと）', () => {
  const cases: [ObjectiveSpec, T, string, number][] = [
    [RESCUE_OBJECTIVE, rescue(), '［任務］乗せている 3/20 ・ 渡した 12/40 ・ 海に 33', OBJ_TONE_NORMAL],
    [RESCUE_OBJECTIVE, rescue({ delivered: 42, aboard: 0, onWater: 10 }), '［任務］乗せている 0/20 ・ 渡した 42/40 ・ 帰投で達成 ・ 海に 10', OBJ_TONE_DONE],
    [EVAC_OBJECTIVE, evac(), '［任務］残存 18/18（6 隻で達成） ・ 隠れた 15', OBJ_TONE_NORMAL],
    [EVAC_OBJECTIVE, evac({ settled: true, survivors: 12, hiddenBoats: 12 }), '［任務］残存 12/18（6 隻で達成） ・ 隠れた 12 ・ 空襲が去った', OBJ_TONE_DONE],
    [EVAC_OBJECTIVE, evac({ survivors: 5, hiddenBoats: 2, leftS: 30 }), '［任務］残存 5/18（6 隻で達成） ・ 隠れた 2 ・ 未達', OBJ_TONE_WARN],
    [LANDING_OBJECTIVE, landing(), '［任務］輸送船 揚陸 63% ・ 被雷 0/3 ・ 見届けて帰投', OBJ_TONE_NORMAL],
    [LANDING_OBJECTIVE, landing({ hits: 1, pct: 0.9 }), '［任務］輸送船 揚陸 90% ・ 被雷 1/3 ・ 見届けて帰投', OBJ_TONE_NORMAL],
    [LANDING_OBJECTIVE, landing({ phase: LD_DONE, pct: 1 }), '［任務］揚陸完了 ・ 帰投で達成', OBJ_TONE_DONE],
    [LANDING_OBJECTIVE, landing({ phase: LD_DONE, pct: 1, sunkAfterDone: true }), '［任務］揚陸完了（輸送船は沈没） ・ 帰投で達成', OBJ_TONE_DONE],
    [LANDING_OBJECTIVE, landing({ phase: LD_SUNK }), '［任務］輸送船 沈没 ・ 未達', OBJ_TONE_WARN],
    [CONVOY, convoy(), '［任務］大発 上陸 0/3（2 隻で達成） ・ 航行中 3', OBJ_TONE_NORMAL],
    [CONVOY, convoy({ afloat: 1, arrived: 2 }), '［任務］大発 上陸 2/3 ・ 帰投で達成 ・ 航行中 1', OBJ_TONE_DONE],
    [CONVOY, convoy({ afloat: 0, arrived: 3 }), '［任務］大発 上陸 3/3 ・ 帰投で達成', OBJ_TONE_DONE],
    [CONVOY, convoy({ afloat: 0, arrived: 1, sunk: 2 }), '［任務］大発 上陸 1/3（2 隻で達成） ・ 航行中 0 ・ 未達', OBJ_TONE_WARN],
    [convoyObjective(3), convoy({ afloat: 2, arrived: 0, sunk: 1 }), '［任務］大発 上陸 0/3（3 隻で達成） ・ 航行中 2 ・ 未達', OBJ_TONE_WARN],
    [RECON_OBJECTIVE, recon(), '［任務］報告: 戦艦を目で確かめ、レーダーで追う', OBJ_TONE_NORMAL],
    [RECON_OBJECTIVE, recon({ stage: RECON_TRACKING, trackedS: 12.7, trackLeftS: 7.3 }), '［任務］報告: 追尾 12 秒 ・ あと 8 秒', OBJ_TONE_NORMAL],
    [RECON_OBJECTIVE, recon({ stage: RECON_TRACKING, trackedS: 3, trackLeftS: 17, radioBroken: true }), '［任務］報告: 追尾 3 秒 ・ あと 17 秒 ・ 無線故障', OBJ_TONE_NORMAL],
    [RECON_OBJECTIVE, recon({ stage: RECON_PENDING, radioBroken: true }), '［任務］報告: 無線故障 ・ 黄色い輪で中継', OBJ_TONE_WARN],
    [RECON_OBJECTIVE, recon({ stage: RECON_SENT }), '［任務］報告済み ・ 帰投で達成', OBJ_TONE_DONE],
    [RECON_OBJECTIVE, recon({ stage: RECON_RELAYED, radioBroken: true }), '［任務］報告済み ・ 帰投で達成', OBJ_TONE_DONE],
    [BARGE_OBJECTIVE, barge(), '［任務］大発 撃破 2/3 ・ 上陸 1 ・ 残り 3', OBJ_TONE_NORMAL],
    [BARGE_OBJECTIVE, barge({ bargesSunk: 3 }), '［任務］大発 撃破 3/3 ・ 帰投で達成 ・ 残り 2', OBJ_TONE_DONE],
    [BARGE_OBJECTIVE, barge({ bargesSunk: 1, bargesBeached: 4 }), '［任務］大発 撃破 1/3 ・ 上陸 4 ・ 残り 1 ・ 未達', OBJ_TONE_WARN],
    [ESCORT_OBJECTIVE, escort(), '［任務］要人の僚艇 HP 85/100 ・ 連れて帰投で達成', OBJ_TONE_NORMAL],
    [ESCORT_OBJECTIVE, escort({ escortSunk: true, escortHp: 0 }), '［任務］要人の僚艇 沈没 ・ 未達', OBJ_TONE_WARN],
  ];
  it('文と色の段', () => {
    for (const [s, t, text, tone] of cases) {
      expect(s.text(t), s.id).toBe(text);
      expect(s.tone(t), text).toBe(tone);
    }
  });
  it('色: 常は IP5 の生存者の橙と同じ・達成は味方の青・未達は警告の色（ui/objective-line の objectiveToneColor）', () => {
    expect(OBJECTIVE_LINE_COLOR).toBe(SURVIVOR_LABEL_COLOR);
    const line = code('src/ui/objective-line.ts');
    expect(line).toContain('tone === OBJ_TONE_DONE ? HOME_COLOR_TEXT : tone === OBJ_TONE_WARN ? HUD_COLOR_WARN : OBJECTIVE_LINE_COLOR');
    expect([HOME_COLOR_TEXT, HUD_COLOR_WARN]).not.toContain(OBJECTIVE_LINE_COLOR);
  });
  it('どの任務の行か: 鍵のある任務だけ・成否の数の無い任務（沈めて帰る・生きて帰る）は null', () => {
    expect(objectiveSpecOf(base(), 0)).toBeNull();
    expect(objectiveSpecOf(rescue(), 0)).toBe(RESCUE_OBJECTIVE);
    expect(objectiveSpecOf(evac(), 0)).toBe(EVAC_OBJECTIVE);
    expect(objectiveSpecOf(landing(), 0)).toBe(LANDING_OBJECTIVE);
    expect(objectiveSpecOf(convoy(), 2)!.id).toBe('convoy');
    expect(objectiveSpecOf(convoy(), 2)!.text(convoy())).toBe(CONVOY.text(convoy()));
    expect(objectiveSpecOf(recon(), 0)).toBe(RECON_OBJECTIVE);
    expect(objectiveSpecOf(barge(), 0)).toBe(BARGE_OBJECTIVE);
    expect(objectiveSpecOf(escort(), 0)).toBe(ESCORT_OBJECTIVE);
  });
});

describe('キー: 文が変わる数で変わり、同じ数なら同じ（setText は変わった時だけ）', () => {
  const keyCases: [ObjectiveSpec, (o: Record<string, unknown>) => T, Record<string, unknown>, Record<string, unknown>[], Record<string, unknown>[]][] = [
    [EVAC_OBJECTIVE, evac, {}, [{ survivors: 17 }, { hiddenBoats: 16 }, { settled: true }], [{ leftS: 12 }, { control: 3 }, { nextWaveS: 4 }]],
    [LANDING_OBJECTIVE, landing, {}, [{ pct: 0.65 }, { hits: 1 }, { phase: LD_DONE }, { phase: LD_SUNK }], [{ pct: 0.6349 }, { leftS: 12 }, { armed: 1 }]],
    [CONVOY, convoy, {}, [{ afloat: 2 }, { arrived: 1 }], [{ leftM: 300 }, { nearestM: 20 }]],
    [RECON_OBJECTIVE, recon, { stage: RECON_TRACKING, trackedS: 12.2, trackLeftS: 7.8 }, [{ trackedS: 13.0 }, { trackLeftS: 6.9 }, { radioBroken: true }, { stage: RECON_PENDING }], [{ trackedS: 12.9 }, { trackLeftS: 7.1 }, { seenCount: 2 }]],
    [BARGE_OBJECTIVE, barge, {}, [{ bargesSunk: 3 }, { bargesBeached: 2 }, { bargesTotal: 7 }], [{ enemySighted: true }, { gunStatus: 1 }]],
    [ESCORT_OBJECTIVE, escort, {}, [{ escortHp: 83.9 }, { escortSunk: true }], [{ escortHp: 84.01 }, { escortDistM: 900 }]],
    [RESCUE_OBJECTIVE, rescue, {}, [{ aboard: 4 }, { delivered: 13 }, { onWater: 32 }], [{ picking: true }, { nearCount: 4 }]],
  ];
  it('変わる数・変わらない値', () => {
    for (const [s, make, at, changes, same] of keyCases) {
      const k = s.key(make(at));
      expect(Number.isInteger(k) && k >= 0, s.id).toBe(true);
      for (const o of changes) expect(s.key(make({ ...at, ...o })), `${s.id} ${JSON.stringify(o)}`).not.toBe(k);
      for (const o of same) {
        expect(s.key(make({ ...at, ...o })), `${s.id} ${JSON.stringify(o)}`).toBe(k);
        expect(s.text(make({ ...at, ...o }))).toBe(s.text(make(at))); // 同じキーなら同じ文
      }
    }
  });

  it('ObjectiveLine: 同じキーのフレームは setText・setColor・setScale を呼ばない（偽の scene の Text で数える）', async () => {
    const calls = { setText: 0, setColor: 0, setScale: 0 };
    const txt = {
      width: 300, scaleX: 1, text: '',
      setOrigin() { return this; }, setDepth() { return this; }, destroy() {},
      setText(s: string) { calls.setText++; this.text = s; return this; },
      setColor() { calls.setColor++; return this; },
      setScale(k: number) { calls.setScale++; this.scaleX = k; return this; },
    };
    const scene = { add: { text: () => txt } };
    const { ObjectiveLine } = (await import(/* @vite-ignore */ ['..', 'src', 'ui', 'objective-line'].join('/'))) as { ObjectiveLine: new (s: unknown, spec: ObjectiveSpec) => { refresh(t: T): void } };
    let keyCalls = 0;
    let n = 3;
    const spec: ObjectiveSpec = { id: 'fake', key: () => (keyCalls++, n), text: () => `［任務］${n}`, tone: () => (n >= 5 ? OBJ_TONE_DONE : OBJ_TONE_NORMAL) };
    const line = new ObjectiveLine(scene, spec);
    const t = base();
    for (let i = 0; i < 60; i++) line.refresh(t);
    expect([keyCalls, calls.setText, calls.setColor, calls.setScale, txt.text]).toEqual([60, 1, 1, 0, '［任務］3']);
    n = 4;
    for (let i = 0; i < 60; i++) line.refresh(t);
    expect([calls.setText, calls.setColor]).toEqual([2, 1]); // 色の段が同じなら色は触らない
    n = 5;
    line.refresh(t);
    expect([calls.setText, calls.setColor, txt.text]).toEqual([3, 2, '［任務］5']);
  });
});

/** 置き場所（IP5 の tests/rescue-mission-line と同じ見積もり。ui-config: HUD_MARGIN 24・3 行目の上端 80・字の高さは px × 1.3） */
const LINE3_TOP = 24 + 26 + 22 + 8;
const LINE_H = (px: number): number => px * 1.3;
const TOP_MARKER_Y = Math.min(179 - 9, 217 - 0.35 * 56 - LINE_H(18));
const FUEL_FLAG_RIGHT = 24 + 120 + textWidthPx('全速では届かない・減速', 18);
const maxPx = (w: number): number => w - 2 * OBJECTIVE_LINE_SIDE_KEEP_PX;

describe('任務の行の置き場所（W 1280・1560）', () => {
  /** 任務ごとのいちばん長い文（数の桁がいちばん多い形） */
  const longest: string[] = [
    RESCUE_OBJECTIVE.text(rescue({ aboard: 19, delivered: 60, onWater: 60 })),
    EVAC_OBJECTIVE.text(evac({ survivors: 18, hiddenBoats: 18, settled: true })),
    EVAC_OBJECTIVE.text(evac({ survivors: 5, hiddenBoats: 5, leftS: 239 })),
    LANDING_OBJECTIVE.text(landing({ pct: 0.99, hits: 2 })),
    LANDING_OBJECTIVE.text(landing({ phase: LD_DONE, sunkAfterDone: true })),
    convoyObjective(3).text(convoy({ afloat: 0, arrived: 1, sunk: 2 })),
    CONVOY.text(convoy({ afloat: 1, arrived: 2 })),
    RECON_OBJECTIVE.text(recon({ radioBroken: true })),
    RECON_OBJECTIVE.text(recon({ stage: RECON_TRACKING, trackedS: 19, trackLeftS: 20, radioBroken: true })),
    BARGE_OBJECTIVE.text(barge({ bargesSunk: 1, bargesBeached: 10, bargesTotal: 12 })),
    BARGE_OBJECTIVE.text(barge({ bargesSunk: 3, bargesTotal: 12 })),
    ESCORT_OBJECTIVE.text(escort({ escortHp: 100 })),
  ];
  it('字は 3 行目の下端より下・上の縁の端の印より上', () => {
    const top = LINE3_TOP + OBJECTIVE_LINE_DY;
    expect(top).toBeGreaterThanOrEqual(LINE3_TOP + LINE_H(20));
    expect(top + LINE_H(OBJECTIVE_LINE_PX)).toBeLessThan(TOP_MARKER_Y);
    expect(code('src/config/ui-config.ts')).toContain('export const HUD_STATUS_OFFSET_Y = HUD_DEBUG_LINE_HEIGHT + HUD_FONT_MISSION_PX + 8;');
  });
  it('どの文も縮めた後に燃料の注意の右・技能の列の左。W 1560 は等倍、W 1280 は 0.8 倍まで', () => {
    for (const w of [1280, 1560]) {
      for (const s of longest) {
        const tw = textWidthPx(s, OBJECTIVE_LINE_PX);
        const k = statusFitScale(tw, maxPx(w));
        const half = (tw * k) / 2;
        expect(w / 2 - half, s).toBeGreaterThan(FUEL_FLAG_RIGHT);
        expect(w / 2 + half, s).toBeLessThan(w - HUD_LAYOUT_M - 2 * R_SKILL);
        if (w === 1560) expect(k, s).toBe(1);
        else expect(k, s).toBeGreaterThanOrEqual(0.8);
      }
    }
  });
  it('配線: Hud は鍵のある任務だけ作る・板は無い・2 行目（boat-hud・mission-line）は任務の行に触らない', () => {
    const hud = code('src/scenes/hud-scene.ts');
    expect(hud).toContain('const objective = objectiveSpecOf(this.telemetry, mission.convoy?.arrive_quota ?? 0);');
    expect(hud).toContain('if (objective) this.objectiveLine = new ObjectiveLine(this, objective);');
    expect(hud).toContain('this.objectiveLine?.refresh(this.telemetry);');
    const line = code('src/ui/objective-line.ts');
    expect(line).toContain('if (key === this.lastKey) return;');
    expect(line).not.toMatch(/rectangle|setStrokeStyle|setRounded|graphics/);
    expect(code('src/ui/boat-hud.ts')).not.toContain('objective-');
    expect(code('src/ui/mission-line.ts')).not.toContain('objective-');
  });
});
