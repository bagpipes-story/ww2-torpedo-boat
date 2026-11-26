// v0.8.5 IP5（実機 2 回目）: 救助の任務（us_07）の上中央 4 行目「任務の行」と、砲台を見えるように（210 mm の絵・陸の塗り・端の印「砲台 N m」）。
// - 任務の行（ui/rescue-mission-line・ui/rescue-texts の rescueMissionLineJa）: 乗せている・渡した・海に をいつも出す（2 行目の出来事・呼びかけに替えられない）。キーは数だけ。
//   置き場所: 3 行目の下・上の縁の端の印より上・左上の燃料の注意と右の技能の列に掛からない幅。IP7 で板を外し、置き場所と配線の検査は tests/objective-line（全シナリオの任務の行）へ移した。
// - 砲台: 位置は data のまま（岸の線 ＋ inland_m）。絵だけ倍率（us_03 は 1 のまま）・陸の塗りを砲台の後ろへ。テレメトリは砲台ごとの相対位置・射界・撃った数（ui/rescue-markers が読む）。
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { RESCUE_BATTERY_MARKER_HOLD_MS, RESCUE_BATTERY_PULSE_MS } from '../src/config/rescue-hud-config';
import { SHORE_GUNS_ART_SCALE, SHORE_GUNS_LAND_PAD_M } from '../src/config/rescue-art-config';
import type { BoatState } from '../src/core/boat-motion';
import type { RescueTelemetry } from '../src/core/rescue-telemetry';
import { rescueFieldOf } from '../src/systems/rescue-field-setup';
import { rescueTelemetryPart } from '../src/systems/rescue-telemetry';
import { WorldRescue } from '../src/systems/world-rescue';
import { rescueMissionLineJa, rescueMissionLineKey } from '../src/ui/rescue-texts';
import { setupOf } from './column-world-kit';
import { code } from './core-rules-kit';
import { chain } from './torpedo-free-kit';

type Shores = { shores: { p: { x: number; y: number }; state: { inArc: boolean }; fireCount: number }[] };
type BuildEnemies = (...a: unknown[]) => { shoreGuns: Shores | null };
const { buildEnemies } = (await import(/* @vite-ignore */ ['..', 'src', 'systems', 'world-enemies'].join('/'))) as { buildEnemies: BuildEnemies };
const fakeScene = (): unknown => ({ add: { image: () => chain, text: () => chain, graphics: () => chain }, tweens: { add: () => chain }, textures: { exists: () => true, get: () => ({ customData: {} }) } });

const S = setupOf('us_07');
const R = S.rescue!;
const r0 = (o: Partial<RescueTelemetry> = {}): RescueTelemetry => ({ capacity: R.capacity, objective: R.objectiveDelivered, aboard: 0, delivered: 0, onWater: R.total, ...o }) as RescueTelemetry;
describe('任務の行の文とキー（v0.8.5 IP5）', () => {
  it('乗せている・渡した・海に（達成の数に届けば「帰投で達成」・満員なら「満員 20/20」）', () => {
    expect(rescueMissionLineJa(r0({ aboard: 3, delivered: 12, onWater: 33 }))).toBe('［任務］乗せている 3/20 ・ 渡した 12/40 ・ 海に 33');
    expect(rescueMissionLineJa(r0({ aboard: 20, delivered: 12, onWater: 8 }))).toBe('［任務］満員 20/20 ・ 渡した 12/40 ・ 海に 8');
    expect(rescueMissionLineJa(r0({ aboard: 0, delivered: 42, onWater: 10 }))).toBe('［任務］乗せている 0/20 ・ 渡した 42/40 ・ 帰投で達成 ・ 海に 10');
  });
  it('キーは 3 つの数のどれが変わっても変わり、同じ数なら同じ（setText は変わった時だけ）', () => {
    const k = rescueMissionLineKey(r0({ aboard: 3, delivered: 12, onWater: 33 }));
    expect(rescueMissionLineKey(r0({ aboard: 3, delivered: 12, onWater: 33, picking: true, nearCount: 4 }))).toBe(k);
    for (const o of [{ aboard: 4 }, { delivered: 13 }, { onWater: 32 }]) expect(rescueMissionLineKey(r0({ aboard: 3, delivered: 12, onWater: 33, ...o }))).not.toBe(k);
  });
});

describe('砲台を見えるように（位置は data のまま）', () => {
  const enemies = (hard: boolean): Shores => {
    const s = setupOf('us_07', hard, 4);
    const boat = { x: 2600, y: 2600, headingDeg: 0, speedMps: 0 } as BoatState;
    return buildEnemies(fakeScene(), s, 4, boat, chain, {}, () => undefined, () => undefined, { stepTimeS: 0 }, null, gameData, null).shoreGuns!;
  };
  it('テレメトリ: 砲台ごとの相対位置・射界・撃った数（ノーマル 1・ハード 3。位置は岸の線 ＋ inland_m）', () => {
    for (const hard of [false, true]) {
      const s = setupOf('us_07', hard, 4);
      const sg = enemies(hard);
      const f = rescueFieldOf(s, 4)!;
      const r = new WorldRescue(s, f, { splash: () => {} }, () => {});
      const boat = { state: { x: 2600, y: 2600, headingDeg: 0, speedMps: 0 } as BoatState };
      expect(sg.shores.map((x) => x.p.y)).toEqual(s.shoreBatteries.map(() => s.mission.bounds.height + 600));
      sg.shores[0]!.fireCount = 3;
      const t = rescueTelemetryPart({ rescue: r, boat, pts: null, shoreGuns: sg }).rescue!;
      expect(t.batteryDx.length).toBe(hard ? 3 : 1);
      expect(Array.from(t.batteryDx)).toEqual(s.shoreBatteries.map((b) => b.x - 2600));
      expect(Array.from(t.batteryDy)).toEqual(s.shoreBatteries.map((b) => b.y - 2600));
      expect(t.batteryFired[0]).toBe(3);
      expect(rescueTelemetryPart({ rescue: r, boat, pts: null }).rescue!.batteryDx.length).toBe(0); // 砲台の無い世界は長さ 0
    }
  });
  it('絵だけ: us_07 は倍率 SHORE_GUNS_ART_SCALE・陸の塗りは砲台の後ろへ。ShoreBattery の倍率は省けば 1（us_03 の大発の狩りは渡さない）', () => {
    expect(SHORE_GUNS_ART_SCALE).toBeGreaterThan(1);
    expect(SHORE_GUNS_LAND_PAD_M).toBeGreaterThan(0);
    expect(code('src/systems/shore-battery.ts')).toContain('private readonly artScale: number = 1,');
    expect(code('src/systems/shore-guns.ts')).toContain('onLand, SHORE_GUNS_ART_SCALE));');
    expect(code('src/systems/barge-hunt.ts')).not.toContain('ART_SCALE');
    expect(RESCUE_BATTERY_PULSE_MS).toBeLessThan(RESCUE_BATTERY_MARKER_HOLD_MS);
    expect(code('src/ui/hud-markers.ts')).toContain('this.pauseKeep, telemetry.rescue.batteryDx.length);');
  });
});
