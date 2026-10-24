// 機関の不調の模擬（v0.6.5。core/pt-sim-engine・pt-pass-sim のつなぎ・systems/pt-pass-sim-setup の上書き、spec-v065 §F.1・§F.3 の T-E3）: 組み立て（ENG_OFF・ENG_FULL・ENG_REACT）、
// 不調を切った模擬は前（v0.6.4）と同じ演算、予告を無視する台本の不調の無い夜は機関の列を除いて ENG_OFF と全欄同一（6 台本 × 50 夜）、帯の行とファイルの分け方。
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getEngineParams } from '../src/config/engine-mission-data';
import { gameData } from '../src/config/game-data';
import { runPtTrial, type PtTrial } from '../src/core/pt-pass-sim';
import { PT_ENGINE_REACTS } from '../src/core/pt-sim-engine';
import { PT_GUN_POLICIES, PT_POLICIES, type PtPolicy } from '../src/core/pt-sim-policy';
import { createPtTrial } from '../src/core/pt-trial';
import { convoySimSetup } from '../src/systems/convoy-sim-setup';
import { ENGINE_CALIBRATION, ENGINE_HUD_POLICIES } from '../src/systems/pt-engine-calibration';
import { ptSimSetup } from '../src/systems/pt-pass-sim-setup';
import { buildWorldSetup } from '../src/systems/world-setup';
import { ENGINE_SIM_FILES, engineSetups } from './pt-sim-engine-kit';
import { SIM_FILES } from './pt-sim-kit';

/** PtTrial の機関の列（eng の後が大文字。機関損傷の engineHit は隊の列） */
const ENG_KEY = /^eng[A-Z]/;
const engCols = (r: PtTrial): Record<string, unknown> => Object.fromEntries(Object.entries(r).filter(([k]) => ENG_KEY.test(k)));
const withoutEng = (r: PtTrial): string => JSON.stringify(Object.fromEntries(Object.entries(r).filter(([k]) => !ENG_KEY.test(k))));

describe('機関の不調の模擬（v0.6.5、spec-v065 §F.1）', () => {
  const s = engineSetups();

  it('組み立て: jp_05 は世界と同じ不調の値（getEngineParams・buildWorldSetup の engine）。ENG_OFF は null、ENG_FULL は data に当てて検査を通す、ENG_REACT は台本だけ。jp_01 は不調なし', () => {
    const p = getEngineParams(gameData, 'jp_05')!;
    expect(p.fullToLimpS).toBe(30);
    expect(s.ignore.engine).toEqual(p);
    expect(ptSimSetup(gameData, 'jp_05').engine).toEqual(buildWorldSetup(gameData, 'jp_05').engine);
    expect([s.off.engine, s.ignore.engineReact, s.cool.engineReact, s.cruise.engineReact, ptSimSetup(gameData, 'jp_05').engineReact]).toEqual([null, 'ignore', 'cool', 'cruise', undefined]);
    expect(PT_ENGINE_REACTS).toEqual(['ignore', 'cool', 'cruise']);
    const long = ptSimSetup(gameData, 'jp_05', { engineFullS: 40 }).engine!;
    expect([long.fullToLimpS, long.warnHeat, long.recoverHeat]).toEqual([40, p.warnHeat, p.recoverHeat]);
    expect(() => ptSimSetup(gameData, 'jp_05', { engineFullS: 15 })).toThrow(/risk_events\.engine_failure\.params: full_to_limp_s/); // 実効の T は 20 秒以上
    expect(ptSimSetup(gameData, 'jp_05').engine!.fullToLimpS).toBe(30); // data は変えない
    // 不調を切っても米PT・艇・砲は同じ（切るのは機関だけ）
    const { engine: _e, ...rest } = s.ignore;
    const { engine: _o, ...restOff } = s.off;
    expect({ ...restOff, engineReact: 'ignore' }).toEqual(rest);
    expect(convoySimSetup(gameData, 'jp_01').engine).toBeNull(); // 輸送隊の任務には不調が無い（同居の検査）
  });

  it('不調を切った模擬（engine: null）は前と同じ演算: 機関の列は初期値のまま。ENG_OFF の組み立てと同じ夜', () => {
    const init = engCols(createPtTrial());
    expect(Object.keys(init)).toHaveLength(10);
    for (const pol of ['full', 'flee_shoot', 'slow_shoot'] as const) {
      for (const seed of [3, 11]) {
        const a = runPtTrial(s.off, pol, seed);
        expect(engCols(a), `${pol} ${seed}`).toEqual(init);
        expect(runPtTrial({ ...s.ignore, engine: null }, pol, seed)).toEqual(a);
      }
    }
  });

  it('T-E3: 予告を無視する台本の不調の無い夜は、機関の列を除いて ENG_OFF と全欄同一（6 台本 × 50 夜。予告だけの夜も）。不調のあった夜は変わる', () => {
    const pols: readonly PtPolicy[] = ['flee_full', 'flee_shoot', 'edge_flee', 'slow_shoot', 'hold_full', 'cruise'];
    let same = 0;
    let warnedOnly = 0;
    let limped = 0;
    let changed = 0;
    for (const pol of pols) {
      for (let seed = 1; seed <= 50; seed++) {
        const a = runPtTrial(s.off, pol, seed);
        const b = runPtTrial(s.ignore, pol, seed);
        if (b.engLimps === 0) {
          expect(withoutEng(b), `${pol} seed ${seed}`).toBe(withoutEng(a));
          same++;
          if (b.engWarned) warnedOnly++;
        } else {
          limped++;
          if (withoutEng(b) !== withoutEng(a)) changed++;
        }
      }
    }
    expect(same).toBeGreaterThan(150);
    expect(warnedOnly).toBeGreaterThan(5); // 縁へ逃げる・逃げるだけの夜の予告だけ（不調なし）でも同一
    expect(limped).toBeGreaterThan(20);
    expect(changed).toBeGreaterThan(0.9 * limped);
  }, 60_000);

  it('帯の行: 不調の起きる 7 台本は 1 台本 2 ファイル（tests/pt-sim-engine-a〜g が無視の代価・a2〜g2 が従う台本）・HUD どおりの 9 台本（T-E2）は別。どれも 37 の台本の中で、既定の表の 8 ファイルのどれかが回す', () => {
    const engine = ENGINE_CALIBRATION.map((r) => r.policy);
    expect(engine).toEqual(['full', 'turn_full', 'flee_full', 'flee_dodge', 'flee_hold', 'flee_shoot', 'fleedodge_shoot']);
    expect(Object.values(ENGINE_SIM_FILES)).toEqual(engine);
    for (const k of Object.keys(ENGINE_SIM_FILES)) for (const f of [k, `${k}2`]) expect(existsSync(join(__dirname, `pt-sim-engine-${f}.test.ts`)), f).toBe(true);
    const all: readonly string[] = [...PT_POLICIES, ...PT_GUN_POLICIES];
    const kit = Object.values(SIM_FILES).flat() as readonly string[];
    for (const pol of [...engine, ...ENGINE_HUD_POLICIES]) expect([all.includes(pol), kit.includes(pol)], pol).toEqual([true, true]);
    expect(ENGINE_HUD_POLICIES.filter((p) => engine.includes(p))).toEqual([]);
    expect(ENGINE_HUD_POLICIES).toHaveLength(9);
  });
});
