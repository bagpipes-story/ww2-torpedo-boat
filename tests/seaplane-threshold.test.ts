// v0.6.7 S1（spec-v067 §B.2・§E.3）: 敵の水上機の航跡の閾値 kt は data に持たず、自艇の静音の上限（boats.json の speed_bands_kt.silent_max）から取る。
// Elco 18・T-14 14・T-38 13 kt で params が組め、HUD の「N kt 以下に減速！」がその値になる。us_02 の params は今と同じ（鍵の順も。N1 の snapshot と同じ値）。
import { describe, expect, it } from 'vitest';
import { gameData, getBoatRecord } from '../src/config/game-data';
import { HUD_COLOR_WARN, PLANE_DISTANCE_STEP_M } from '../src/config/hud-text-config';
import { SP_APPROACH } from '../src/core/seaplane';
import { isSeaplaneDataRecord, seaplaneParamsFromData, type EnemyAircraftEventRecord, type SeaplaneDataRecord, type SeaplaneParams } from '../src/core/seaplane-data';
import { buildWorldSetup } from '../src/systems/world-setup';
import { seaplaneLine } from '../src/ui/hud-lines';
import { tele } from './pt-ui-kit';

type Rec = Record<string, unknown>;
const PLANE = gameData.enemies.enemies.find((e) => e.id === 'ijn_seaplane_jake') as unknown as SeaplaneDataRecord;
const EVENT = gameData.riskEvents.events.find((e) => e.id === 'enemy_aircraft') as unknown as EnemyAircraftEventRecord;
const W = gameData.hitRateModel.world;
/** world-setup と同じ組み方（静音の上限と、当たり判定の船体の半長・半幅） */
function paramsFor(boatId: string): SeaplaneParams {
  const b = getBoatRecord(gameData, boatId);
  return seaplaneParamsFromData(PLANE, EVENT, W.time_scale, { silentMaxKt: b.speed_bands_kt.silent_max, halfLengthM: (b.length_m * W.hit_scale) / 2, halfBeamM: (b.beam_m * W.hit_scale) / 2 });
}
/** 未確定の接近で航跡を見られた 2 行目（距離 4,500 m） */
const wakeLine = (kt: number): { text: string; color: string } => {
  const t = tele({ enabled: false }, { planePhase: SP_APPROACH, planeLocked: false, planeWake: true, planeWakeKt: kt, planeDistM: 4500 });
  return seaplaneLine(t, Math.ceil(t.planeDistM / PLANE_DISTANCE_STEP_M), 0, false);
};

describe('水上機の航跡の閾値は艇の静音の上限（v0.6.7）', () => {
  it('data に閾値の値を持たない（死んだ値を残さない）。記録は id と detection の 2 値で水上機の形。source の文', () => {
    const det = (PLANE as unknown as Rec)['detection'] as Rec;
    expect(Object.keys(det)).toEqual(['base_detect_m', 'wake_detect_m']);
    expect(isSeaplaneDataRecord(PLANE)).toBe(true);
    const noId = JSON.parse(JSON.stringify(PLANE)) as Rec;
    delete noId['id'];
    expect(isSeaplaneDataRecord(noId)).toBe(false);
    const notes = ((PLANE as unknown as Rec)['source'] as Rec)['design_notes'] as string;
    expect(notes).toContain('航跡の閾値は自艇の静音の上限（boats.json の speed_bands_kt.silent_max。Elco 18・T-14 14・T-38 13 kt）。v0.6.7 から data に持たない');
    expect(notes).not.toContain('wake_speed_threshold_kt 18（20 から）');
  });
  it.each([
    ['us_elco80', 18],
    ['jp_t14', 14],
    ['jp_t38', 13],
  ] as const)('%s: wakeThresholdKt %i・HUD「%i kt 以下に減速！」。閾値のほかは艇で変わらない（船体の 2 値を除く）', (id, kt) => {
    const p = paramsFor(id);
    expect(p.wakeThresholdKt).toBe(kt);
    expect(getBoatRecord(gameData, id).speed_bands_kt.silent_max).toBe(kt);
    const elco = paramsFor('us_elco80');
    expect({ ...p, wakeThresholdKt: 0, boatHalfLengthM: 0, bombHitRadiusM: 0 }).toEqual({ ...elco, wakeThresholdKt: 0, boatHalfLengthM: 0, bombHitRadiusM: 0 });
    const l = wakeLine(p.wakeThresholdKt);
    expect(l.text).toBe(`敵機 4500 m ・ 航跡を見られた ・ ${kt} kt 以下に減速！`);
    expect(l.color).toBe(HUD_COLOR_WARN);
  });
  it('us_02（Elco）の params は今と同じ: 閾値 18・鍵の順（SeaplaneParams の鍵と順は変えない＝N1）・world-setup の値と一致', () => {
    const s = buildWorldSetup(gameData, 'us_02').seaplane!;
    expect(s.wakeThresholdKt).toBe(18);
    expect(s).toEqual(paramsFor('us_elco80'));
    expect(Object.keys(s)).toEqual([
      'flightMps', 'spawnM', 'wakeDetectM', 'baseDetectM', 'wakeThresholdKt', 'patrolFromS', 'wakeTriggerS', 'loseS', 'patrolCooldownS',
      'runRadiusM', 'overpassS', 'passS', 'orbitDegPerS', 'orbitS', 'leaveS', 'flareRadius2', 'flareDurationS', 'flareRevealM',
      'bombCount', 'bombHit', 'bombFallFeelS', 'bombFallGameS', 'bombLeadGameS', 'bombScatterM', 'boatHalfLengthM', 'bombHitRadiusM',
    ]);
    expect(wakeLine(s.wakeThresholdKt).text).toBe('敵機 4500 m ・ 航跡を見られた ・ 18 kt 以下に減速！');
  });
});
