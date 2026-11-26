// v0.8.5 IP5（実機 2 回目）: 救助の任務（us_07）の上中央 4 行目「任務の行」と、砲台を見えるように（210 mm の絵・陸の塗り・端の印「砲台 N m」）。
// - 任務の行（ui/rescue-mission-line・ui/rescue-texts の rescueMissionLineJa）: 乗せている・渡した・海に をいつも出す（2 行目の出来事・呼びかけに替えられない）。キーは数だけ。
//   置き場所: 3 行目の下・上の縁の端の印より上・左上の燃料の注意と右の技能の列に掛からない幅（config/rescue-hud-config）。救助の無い任務は作らない。
// - 砲台: 位置は data のまま（岸の線 ＋ inland_m）。絵だけ倍率（us_03 は 1 のまま）・陸の塗りを砲台の後ろへ。テレメトリは砲台ごとの相対位置・射界・撃った数（ui/rescue-markers が読む）。
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import {
  RESCUE_BATTERY_MARKER_HOLD_MS, RESCUE_BATTERY_PULSE_MS, RESCUE_MISSION_LINE_DY, RESCUE_MISSION_LINE_PAD_X, RESCUE_MISSION_LINE_PAD_Y, RESCUE_MISSION_LINE_PX, RESCUE_MISSION_LINE_SIDE_KEEP_PX,
} from '../src/config/rescue-hud-config';
import { SHORE_GUNS_ART_SCALE, SHORE_GUNS_LAND_PAD_M } from '../src/config/rescue-art-config';
import { HUD_LAYOUT_M, R_SKILL } from '../src/config/hud-layout-config';
import type { BoatState } from '../src/core/boat-motion';
import type { RescueTelemetry } from '../src/core/rescue-telemetry';
import { rescueFieldOf } from '../src/systems/rescue-field-setup';
import { rescueTelemetryPart } from '../src/systems/rescue-telemetry';
import { WorldRescue } from '../src/systems/world-rescue';
import { rescueMissionLineJa, rescueMissionLineKey, statusFitScale } from '../src/ui/rescue-texts';
import { setupOf } from './column-world-kit';
import { code } from './core-rules-kit';
import { textWidthPx } from './pt-ui-kit';
import { chain } from './torpedo-free-kit';

type Shores = { shores: { p: { x: number; y: number }; state: { inArc: boolean }; fireCount: number }[] };
type BuildEnemies = (...a: unknown[]) => { shoreGuns: Shores | null };
const { buildEnemies } = (await import(/* @vite-ignore */ ['..', 'src', 'systems', 'world-enemies'].join('/'))) as { buildEnemies: BuildEnemies };
const fakeScene = (): unknown => ({ add: { image: () => chain, text: () => chain, graphics: () => chain }, tweens: { add: () => chain }, textures: { exists: () => true, get: () => ({ customData: {} }) } });

const S = setupOf('us_07');
const R = S.rescue!;
const r0 = (o: Partial<RescueTelemetry> = {}): RescueTelemetry => ({ capacity: R.capacity, objective: R.objectiveDelivered, aboard: 0, delivered: 0, onWater: R.total, ...o }) as RescueTelemetry;
/** 上中央の段（ui-config: HUD_MARGIN 24・HUD_STATUS_OFFSET_Y = デバッグの行 26 ＋ 2 行目 22 ＋ 8）と 3 行目の字（20 px）。字の高さは px × 1.3 で見積もる */
const LINE3_TOP = 24 + 26 + 22 + 8;
const LINE_H = (px: number): number => px * 1.3;
/** 上の縁の端の印（ui-config）: 敵の三角の上端＝TARGET_MARKER_TOP_MARGIN 179 − 9・帰投／生存者／砲台のラベルの上端＝HOME_MARKER_TOP_MARGIN 217 − 0.35 × 56 − 18 px の字 */
const TOP_MARKER_Y = Math.min(179 - 9, 217 - 0.35 * 56 - LINE_H(18));
/** 左上の燃料の注意のいちばん長い文「全速では届かない・減速」（x 24 + 120 から 18 px）の右端と行（y 24 + 102 から） */
const FUEL_FLAG_RIGHT = 24 + 120 + textWidthPx('全速では届かない・減速', 18);
const FUEL_FLAG_Y = [24 + 102, 24 + 102 + LINE_H(18)];
const maxPx = (w: number): number => w - 2 * RESCUE_MISSION_LINE_SIDE_KEEP_PX;

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

describe('任務の行の置き場所（W 1280・1560。iPhone の横持ちの論理幅）', () => {
  const texts = (): string[] => {
    const out: string[] = [];
    for (const aboard of [0, 9, 20]) for (const delivered of [0, 39, 60]) for (const onWater of [0, 60]) out.push(rescueMissionLineJa(r0({ aboard, delivered, onWater })));
    return out;
  };
  it('板は 3 行目の下端より下・上の縁の端の印より上', () => {
    const top = LINE3_TOP + RESCUE_MISSION_LINE_DY - RESCUE_MISSION_LINE_PAD_Y;
    const bottom = LINE3_TOP + RESCUE_MISSION_LINE_DY + LINE_H(RESCUE_MISSION_LINE_PX) + RESCUE_MISSION_LINE_PAD_Y;
    expect(top).toBeGreaterThanOrEqual(LINE3_TOP + LINE_H(20));
    expect(bottom).toBeLessThan(TOP_MARKER_Y);
    expect(code('src/config/ui-config.ts')).toContain('export const HUD_STATUS_OFFSET_Y = HUD_DEBUG_LINE_HEIGHT + HUD_FONT_MISSION_PX + 8;');
  });
  it('どの数でも板の左端は燃料の注意の右・右端は技能の列の左（縮めた後）。数だけの行は W 1280 でも縮めない', () => {
    for (const w of [1280, 1560]) {
      for (const s of texts()) {
        const tw = textWidthPx(s, RESCUE_MISSION_LINE_PX);
        const half = (tw * statusFitScale(tw, maxPx(w))) / 2 + RESCUE_MISSION_LINE_PAD_X;
        expect(w / 2 - half, s).toBeGreaterThan(FUEL_FLAG_RIGHT);
        expect(w / 2 + half, s).toBeLessThan(w - HUD_LAYOUT_M - 2 * R_SKILL);
      }
    }
    const plain = textWidthPx(rescueMissionLineJa(r0({ aboard: 19, delivered: 39, onWater: 60 })), RESCUE_MISSION_LINE_PX);
    expect(plain).toBeLessThanOrEqual(maxPx(1280));
    const done = textWidthPx(rescueMissionLineJa(r0({ aboard: 19, delivered: 60, onWater: 60 })), RESCUE_MISSION_LINE_PX);
    expect(statusFitScale(done, maxPx(1560))).toBe(1); // W 1560 はいちばん長い文も等倍
    expect(statusFitScale(done, maxPx(1280))).toBeGreaterThan(0.79);
    expect(FUEL_FLAG_Y[1]! > LINE3_TOP + RESCUE_MISSION_LINE_DY).toBe(true); // 燃料の注意と同じ高さ＝左右で避ける
  });
  it('配線: Hud は救助の任務だけ作る・毎フレームは数を比べるだけ・2 行目（boat-hud・mission-line）は触らない', () => {
    const hud = code('src/scenes/hud-scene.ts');
    expect(hud).toContain('if (this.telemetry.rescue) this.rescueLine = new RescueMissionLine(this);');
    expect(hud).toContain('if (this.telemetry.rescue) this.rescueLine?.refresh(this.telemetry.rescue);');
    const line = code('src/ui/rescue-mission-line.ts');
    expect(line).toContain('if (key === this.lastKey) return;');
    expect(code('src/ui/boat-hud.ts')).not.toContain('rescue-mission-line');
    expect(code('src/ui/mission-line.ts')).not.toContain('rescue-mission-line');
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
