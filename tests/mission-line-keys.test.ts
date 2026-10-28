// v0.6.9 S0（spec-v069 R3）: ui/mission-line-keys の composeLineKeys は、v0.6.8（main 2ad122b）の ui/mission-line.ts:130-138 の式とすべての材料で同じ値を返す。
// 下の oldInline の 9 行は 2ad122b の mission-line.ts:130-138 の写し（1 字も変えない。this は前回の米PT のキーと pt-line-clock の 2 つの値だけを持つ入れ物）。
// 材料は既存のテレメトリの kit: tests/pt-ui-kit の tele（jp_05）と tests/pt-line-bits-kit の t01（jp_01）・VARIANTS のすべての試し（base と probe）に、
// 機関（on・段）・水上機（段・距離）・輸送隊（決着・上陸）の値を重ねたもの。モードは 0〜40、旗は 0 と各ビットとその組、前回のキー・merge・convoyEvent は順に回す。
// mission-line がモードを決めて pt-line-clock の shown を呼んだ後に呼ぶこと（v0.6.8 と同じ時点）はソースの順で確かめる。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BoatTelemetry } from '../src/core/boat-motion';
import { ENGINE_FINAL, ENGINE_LIMP, ENGINE_OK, ENGINE_WARN, createEngineTelemetry, type EngineTelemetry } from '../src/core/engine-trouble';
import { PT_ALERT, PT_BREAK, PT_CHASE, PT_PASS, PT_RUN_IN } from '../src/core/pt-boats';
import { SP_APPROACH } from '../src/core/seaplane';
import { CONVOY_EV_ARRIVED, CONVOY_EV_GB_BEACH, CONVOY_EV_GB_SUNK, CONVOY_EV_SUNK, convoyKey, convoyWaiting } from '../src/ui/convoy-lines';
import { engineKey, engineTagKey } from '../src/ui/engine-lines';
import { planeKeyOf, planeModeOf } from '../src/ui/mission-line-air';
import { composeLineKeys, createLineKeys } from '../src/ui/mission-line-keys';
import {
  MISSION_CALL, MISSION_CONVOY_EVENT, MISSION_ENGINE_EVENT, MISSION_ENGINE_STATUS, MISSION_PT, MISSION_PT_CONTACT, MISSION_PT_GUN_EVENT, MISSION_PT_PASS,
  MODE_FLAG_BARGE_EVENT, MODE_FLAG_CONVOY_EVENT, MODE_FLAG_ENGINE_EVENT, MODE_FLAG_ESCORT_HIT, MODE_FLAG_PT_GUN_EVENT, MODE_FLAG_PT_HOLD, MODE_FLAG_PT_RESULT,
} from '../src/ui/mission-mode';
import { ptKey } from '../src/ui/pt-lines';
import { VARIANTS, t01 } from './pt-line-bits-kit';
import { tele } from './pt-ui-kit';

/** v0.6.8 の mission-line の this のうち、130〜138 行が読む 2 つ */
interface OldThis { lastPtKey: number; ptClock: { merge: number; convoyEvent: number } }
type Keys = [boolean, number, number, boolean, number, number, boolean, number];

/** main 2ad122b の src/ui/mission-line.ts:130-138（写し。字下げも同じ） */
function oldInline(this: OldThis, t: BoatTelemetry, mode: number, flags: number): Keys {
    const ptMode = mode >= MISSION_PT_PASS && mode <= MISSION_PT_GUN_EVENT; // 米PT の 5 つ（22〜26）。距離と方角はこのときだけ ptKey が求める
    const pKey = ptMode ? ptKey(t, mode, flags, this.lastPtKey, this.ptClock.merge) : 0;
    // 輸送隊（v0.6.4）: 浜までの刻みは平常の行（米PT が見えていない）と決着の前の呼びかけ（「大発の上陸を待て  浜まで N m」。レビュー ux-1）のときだけ求める。出来事の種類は出来事の行のときだけ
    const cKey = convoyKey(t.convoy, (mode === MISSION_PT && !t.pt.sighted) || (mode === MISSION_CALL && convoyWaiting(t.convoy)), mode === MISSION_CONVOY_EVENT ? this.ptClock.convoyEvent : 0);
    const engineMode = mode >= MISSION_ENGINE_EVENT && mode <= MISSION_ENGINE_STATUS; // 機関の 3 つ（28〜30。v0.6.5）
    const eKey = engineMode ? engineKey(t, mode) : 0;
    const eTag = mode === MISSION_PT_PASS || mode === MISSION_PT_CONTACT ? engineTagKey(t.engine) : 0; // 札は赤い線・結果・接触の行だけ（13mm の行と平常には付けない）
    const planeMode = planeModeOf(mode); // 水上機の 3 つ（9〜11）。キー（距離は接近中だけ 100 m 刻み）と文は ui/mission-line-air
    const planeKey = planeKeyOf(t, planeMode);
  return [ptMode, pKey, cKey, engineMode, eKey, eTag, planeMode, planeKey];
}

/** 材料: kit のテレメトリと、そのテレメトリの試しが持つ merge・出来事の種類 */
interface Case { name: string; t: BoatTelemetry; merge: number; event: number }

const ENGINES: EngineTelemetry[] = [
  createEngineTelemetry(),
  { ...createEngineTelemetry(), on: true, stage: ENGINE_OK },
  { ...createEngineTelemetry(), on: true, stage: ENGINE_WARN, heat: 0.7 },
  { ...createEngineTelemetry(), on: true, stage: ENGINE_FINAL, heat: 0.9 },
  { ...createEngineTelemetry(), on: true, stage: ENGINE_LIMP, heat: 1, limpLeftS: 7.3 },
];
const PLANES: Partial<BoatTelemetry>[] = [
  {},
  { planePhase: SP_APPROACH, planeDistM: 2345, planeLocked: true, planeWake: true },
  { planePhase: 3, planeFlareOn: true, planeBombAir: true, planeBombsDropped: 2, planeOutcome: 1, planeBombsHit: 1, destroyerSunk: true },
] as Partial<BoatTelemetry>[];
const PT_STATES = [
  {},
  { detected: true, passing: true, threatPhase: PT_PASS, sighted: true, dx: 0, dy: -100 },
  { detected: true, threatPhase: PT_RUN_IN, sighted: true, dx: 300, dy: -400 },
  { detected: true, threatPhase: PT_CHASE, sighted: false, dx: -900, dy: 200, burst: true },
  { detected: true, threatPhase: PT_BREAK, passes: 2, maxPasses: 4, lastPassFired: true, lastPassHits: 1 },
  { detected: false, threatPhase: PT_ALERT, sighted: true, dx: 500, dy: 600 },
];

function cases(): Case[] {
  const out: Case[] = [];
  // pt-line-bits-kit: v0.6.5 からの変種のすべての試し（jp_01・輸送隊あり）
  for (const v of VARIANTS) {
    for (const pr of [null, ...v.probes]) {
      const t = t01({ ...v.base.pt, ...pr?.pt }, { ...v.base.over, ...pr?.over }, { ...v.base.cv, ...pr?.cv });
      const merge = (pr?.merge ?? v.base.merge) ? 0x1234 : 0;
      out.push({ name: `${v.name}/${pr ? pr.fields.join('+') : 'base'}`, t, merge, event: pr?.event ?? v.base.event ?? 0 });
    }
  }
  // 輸送隊の決着・上陸・沈没（jp_01）
  for (const cv of [{}, { resolved: true, arrived: 2, afloat: 0 }, { afloat: 1, arrived: 1, sunk: 1 }, { resolved: true, arrived: 0, afloat: 0, sunk: 3 }]) {
    for (const pt of PT_STATES) out.push({ name: `t01 cv ${JSON.stringify(cv)} pt ${JSON.stringify(pt)}`, t: t01(pt, {}, cv), merge: 0, event: CONVOY_EV_SUNK });
  }
  // pt-ui-kit: jp_05 の米PT に機関・水上機の値を重ねる
  for (const pt of PT_STATES) {
    for (const engine of ENGINES) {
      for (const pl of PLANES) out.push({ name: `tele pt ${JSON.stringify(pt)} engine ${engine.stage}/${engine.on} plane ${JSON.stringify(pl)}`, t: tele(pt, { ...pl, engine }), merge: 0, event: 0 });
    }
  }
  return out;
}

const FLAGS = [
  0, MODE_FLAG_BARGE_EVENT, MODE_FLAG_ESCORT_HIT, MODE_FLAG_PT_RESULT, MODE_FLAG_PT_GUN_EVENT, MODE_FLAG_PT_HOLD, MODE_FLAG_CONVOY_EVENT, MODE_FLAG_ENGINE_EVENT,
  MODE_FLAG_PT_RESULT | MODE_FLAG_PT_HOLD, MODE_FLAG_PT_GUN_EVENT | MODE_FLAG_PT_RESULT, 127,
];
const LAST_KEYS = [-1, 0, 0x2a5, 0x7fffffff];
const MERGES = [0, 0x40, 0x1f00];
const EVENTS = [0, CONVOY_EV_SUNK, CONVOY_EV_ARRIVED, CONVOY_EV_ARRIVED | CONVOY_EV_GB_BEACH, CONVOY_EV_GB_SUNK];
const MODES = Array.from({ length: 41 }, (_, i) => i);

describe('ui/mission-line-keys（v0.6.9 S0: mission-line.ts:130-138 の切り出し）', () => {
  it('既存のテレメトリの kit のすべての材料・モード 0〜40・旗・前回のキー・merge・出来事で、v0.6.8 の行の写しと同じ 8 つの値', () => {
    const all = cases();
    expect(all.length).toBeGreaterThan(150);
    const out = createLineKeys();
    let n = 0;
    let diffs = 0;
    const seen = { pt: 0, c: 0, e: 0, tag: 0, plane: 0, ptMode: 0, engineMode: 0, planeMode: 0 };
    let first = '';
    for (const c of all) {
      for (const mode of MODES) {
        for (let fi = 0; fi < FLAGS.length; fi++) {
          // 前回のキー・merge・出来事は順に回す（材料ごとの試しの merge・出来事も 1 回は入れる）
          const combos: [number, number, number][] = [
            [LAST_KEYS[(mode + fi) % LAST_KEYS.length]!, c.merge, c.event],
            [LAST_KEYS[(mode + fi + 1) % LAST_KEYS.length]!, MERGES[(mode + fi) % MERGES.length]!, EVENTS[(mode + fi) % EVENTS.length]!],
            [LAST_KEYS[(mode + fi + 2) % LAST_KEYS.length]!, MERGES[(mode + 2 * fi + 1) % MERGES.length]!, EVENTS[(mode + 3 * fi + 2) % EVENTS.length]!],
          ];
          for (const [lastPtKey, merge, convoyEvent] of combos) {
            const want = oldInline.call({ lastPtKey, ptClock: { merge, convoyEvent } }, c.t, mode, FLAGS[fi]!);
            const r = composeLineKeys(out, c.t, mode, FLAGS[fi]!, lastPtKey, merge, convoyEvent);
            expect(r).toBe(out); // 入れ物は 1 個（確保しない）
            const got: Keys = [r.ptMode, r.pKey, r.cKey, r.engineMode, r.eKey, r.eTag, r.planeMode, r.planeKey];
            n++;
            if (JSON.stringify(got) !== JSON.stringify(want)) {
              diffs++;
              if (!first) first = `${c.name} mode ${mode} flags ${FLAGS[fi]} last ${lastPtKey} merge ${merge} ev ${convoyEvent}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`;
            }
            if (want[1] !== 0) seen.pt++;
            if (want[2] !== 0) seen.c++;
            if (want[4] !== 0) seen.e++;
            if (want[5] !== 0) seen.tag++;
            if (want[7] !== 0) seen.plane++;
            if (want[0]) seen.ptMode++;
            if (want[3]) seen.engineMode++;
            if (want[6]) seen.planeMode++;
          }
        }
      }
    }
    expect(first).toBe('');
    expect(diffs).toBe(0);
    expect(n).toBeGreaterThan(100_000);
    // 空の比べ合いではない: 4 つのキーと札とモードの判定がどれも 0 でない値を何度も取る
    for (const [k, v] of Object.entries(seen)) expect(v, k).toBeGreaterThan(100);
  });

  it('mission-line はモードを決めて pt-line-clock の shown を呼んだ後に 1 回だけ組み、4 つのキーの式はもう持たない', () => {
    const src = readFileSync(join(__dirname, '..', 'src', 'ui', 'mission-line.ts'), 'utf8');
    const mode = src.indexOf('const mode = missionMode(t, call, flags);');
    const shown = src.indexOf('this.ptClock.shown(mode, nowMs);');
    const keys = src.indexOf('composeLineKeys(this.keys, t, mode, flags, this.lastPtKey, this.ptClock.merge, this.ptClock.convoyEvent)');
    expect(mode).toBeGreaterThan(0);
    expect(shown).toBeGreaterThan(mode);
    expect(keys).toBeGreaterThan(shown);
    expect(src.split('composeLineKeys(').length - 1).toBe(1);
    for (const call of ['ptKey(', 'convoyKey(', 'engineKey(', 'engineTagKey(', 'planeKeyOf(', 'planeModeOf(']) expect(src.includes(call), call).toBe(false);
  });
});
