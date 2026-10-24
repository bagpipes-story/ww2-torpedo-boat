// 機関の不調（v0.6.5。jp_05。spec-v065 §D.2・§G.1）の右下の熱の帯の Phaser を使わない部分（ui/engine-lines の写像。ui/engine-hud はこれを値の変わったときだけ書く）:
// 字（段と不調の残りの秒の整数）・帯の色と字の色（段）・帯の幅の刻み（熱の 1/50）・点滅する段。fixture（tests/engine-trouble-kit。jp_05 と同じ数）で全速 → 不調 → 回復を回し、
// 写像の値が変わる回数（ui/engine-hud はこの回数だけ書く）が少ないこと。レビュー: 平常の字は「機関の熱」（ux-5）、不調は「機関 不調 あと N 秒」（ux-4）。
import { describe, expect, it } from 'vitest';
import { ENGINE_GAUGE_STEPS, ENGINE_TEXT_FINAL, ENGINE_TEXT_OK, ENGINE_TEXT_WARN, ENGINE_TINT_FINAL, ENGINE_TINT_OK, ENGINE_TINT_WARN } from '../src/config/engine-config';
import { FIXED_STEP_S } from '../src/config/step-config';
import type { SpeedStep } from '../src/core/boat-motion';
import { ENGINE_FINAL, ENGINE_LIMP, ENGINE_OK, ENGINE_WARN, createEngineState, createEngineTelemetry, stepEngine, writeEngineTelemetry, type EngineStage, type EngineTelemetry } from '../src/core/engine-trouble';
import { engineGaugeLabel, engineGaugePulses, engineGaugeStep, engineGaugeTextColor, engineGaugeTint, engineStageKey } from '../src/ui/engine-lines';
import { P } from './engine-trouble-kit';
import { textWidthPx } from './pt-ui-kit';

const tel = (stage: EngineStage, over: Partial<EngineTelemetry> = {}): EngineTelemetry => ({ ...createEngineTelemetry(), on: true, stage, limpLeftS: stage === ENGINE_LIMP ? 8 : 0, ...over });

describe('右下の字・色・点滅（段の写像）', () => {
  it('字: 「機関の熱」「機関 過熱」「機関 限界」「機関 不調 あと 8 秒」（数は残りの秒の切り上げ）。いちばん長い字は 18 px で 185 px 以内。機関の無い夜は「機関の熱」', () => {
    const labels = [ENGINE_OK, ENGINE_WARN, ENGINE_FINAL, ENGINE_LIMP].map((s) => engineGaugeLabel(engineStageKey(tel(s as EngineStage))));
    expect(labels).toEqual(['機関の熱', '機関 過熱', '機関 限界', '機関 不調 あと 8 秒']);
    expect(engineGaugeLabel(engineStageKey(tel(ENGINE_LIMP, { limpLeftS: 0.3 })))).toBe('機関 不調 あと 1 秒');
    expect(engineGaugeLabel(engineStageKey(tel(ENGINE_LIMP, { limpLeftS: 8.0000001 })))).toBe('機関 不調 あと 8 秒');
    // 平常の字は HP の旗「機関損傷」（PT の命中）と別の言葉（E11。レビュー ux-5: 「機関」だけだと「機関は平常」と読めた）
    expect(labels[0]).not.toBe('機関');
    // 不調の字は単位つき（ux-4）。右寄せで左は空いている（速力の表示の上の段。帯 80 px の左）
    expect(Math.round(textWidthPx(labels[3]!, 18))).toBe(180);
    expect(Math.max(...labels.map((s) => textWidthPx(s, 18)))).toBeLessThanOrEqual(185);
    expect(engineGaugeLabel(engineStageKey({ ...createEngineTelemetry(), stage: ENGINE_LIMP, limpLeftS: 5 }))).toBe('機関の熱');
  });
  it('キーは段か残りの秒の整数が変わったときだけ変わる（熱が動いても同じ）', () => {
    expect(engineStageKey(tel(ENGINE_FINAL, { heat: 0.86 }))).toBe(engineStageKey(tel(ENGINE_FINAL, { heat: 0.99 })));
    expect(engineStageKey(tel(ENGINE_WARN, { heat: 0.61 }))).toBe(engineStageKey(tel(ENGINE_WARN, { heat: 0.84 })));
    expect(engineStageKey(tel(ENGINE_LIMP, { limpLeftS: 7.9 }))).toBe(engineStageKey(tel(ENGINE_LIMP, { limpLeftS: 7.01 })));
    expect(engineStageKey(tel(ENGINE_LIMP, { limpLeftS: 7.01 }))).not.toBe(engineStageKey(tel(ENGINE_LIMP, { limpLeftS: 6.99 })));
    expect(new Set([ENGINE_OK, ENGINE_WARN, ENGINE_FINAL, ENGINE_LIMP].map((s) => engineStageKey(tel(s as EngineStage)))).size).toBe(4);
  });
  it('帯の色（平常 緑・過熱 黄・限界と不調 赤）と字の色（地の色・黄・警告色）。点滅は限界と不調だけ', () => {
    expect([ENGINE_OK, ENGINE_WARN, ENGINE_FINAL, ENGINE_LIMP].map((s) => engineGaugeTint(s as EngineStage))).toEqual([ENGINE_TINT_OK, ENGINE_TINT_WARN, ENGINE_TINT_FINAL, ENGINE_TINT_FINAL]);
    expect([ENGINE_TINT_OK, ENGINE_TINT_WARN, ENGINE_TINT_FINAL]).toEqual([0x8fbf8f, 0xffd060, 0xff8a7a]);
    expect([ENGINE_OK, ENGINE_WARN, ENGINE_FINAL, ENGINE_LIMP].map((s) => engineGaugeTextColor(s as EngineStage))).toEqual([ENGINE_TEXT_OK, ENGINE_TEXT_WARN, ENGINE_TEXT_FINAL, ENGINE_TEXT_FINAL]);
    expect([ENGINE_OK, ENGINE_WARN, ENGINE_FINAL, ENGINE_LIMP].map((s) => engineGaugePulses(s as EngineStage))).toEqual([false, false, true, true]);
  });
  it('帯の幅の刻み: 熱を 1/50 に丸める（0〜50。範囲の外は収める）', () => {
    expect(ENGINE_GAUGE_STEPS).toBe(50);
    expect([0, 0.009, 0.011, 0.6, 0.85, 1, -0.2, 1.3].map(engineGaugeStep)).toEqual([0, 0, 1, 30, 43, 50, 0, 50]);
    expect(engineGaugeStep(0.601)).toBe(engineGaugeStep(0.609));
  });
});

describe('写像の値が変わる回数（ui/engine-hud はこの回数だけ書く。レビュー F9: engine-hud そのものは Phaser なのでここでは回さない）', () => {
  it('全速 40 秒 → 静音 30 秒: 字のキーが変わるのは 13 回（機関の熱→過熱→限界→不調 あと 8〜1 秒→過熱→機関の熱）・帯の幅の刻みは 107 回・色の段は 6 回', () => {
    const s = createEngineState(P);
    const t = createEngineTelemetry();
    let lastKey = -1;
    let lastStep = -1;
    let lastStage = -1;
    const labels: string[] = [];
    let widthWrites = 0;
    let colorWrites = 0;
    const frame = (band: SpeedStep, seconds: number): void => {
      for (let i = 0; i < Math.round(seconds / FIXED_STEP_S); i++) {
        stepEngine(s, P, band, false, true, FIXED_STEP_S, 0);
        writeEngineTelemetry(t, s, P);
        const key = engineStageKey(t);
        if (key !== lastKey) {
          lastKey = key;
          labels.push(engineGaugeLabel(key));
        }
        const step = engineGaugeStep(t.heat);
        if (step !== lastStep) {
          lastStep = step;
          widthWrites++;
        }
        if (t.stage !== lastStage) {
          lastStage = t.stage;
          colorWrites++;
        }
      }
    };
    frame('full', 40);
    frame('silent', 30);
    expect(labels).toEqual(['機関の熱', '機関 過熱', '機関 限界', ...[8, 7, 6, 5, 4, 3, 2, 1].map((n) => `機関 不調 あと ${n} 秒`), '機関 過熱', '機関の熱']);
    expect(colorWrites).toBe(6); // 平常・過熱・限界・不調・過熱（回復。熱が warn_rearm_heat を割るまで）・平常
    expect(widthWrites).toBe(107); // 4,200 ステップのうち（0 → 50・不調で 50 → 30・戻って 2 秒の全速で +3・静音 30 秒で 33 → 0。1 刻みに 1 回）
  });
});
