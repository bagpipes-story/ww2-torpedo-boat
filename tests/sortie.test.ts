import { describe, expect, it } from 'vitest';
import { gameData, getBoatCrewEffects, getBoatCrewParams, getBoatDamageParams, getBoatFuelCurve, getPrototypeMission, getRaidParams } from '../src/config/game-data';
import { crewAccelFactor, crewAlive, crewExtinguishFactor, crewLost, crewTurnFactor } from '../src/core/crew';
import { SeededRng } from '../src/core/rng';
import {
  NO_SORTIE_EFFECT,
  RAID_ALERT_JA,
  RAID_CALM_JA,
  RAID_DISPERSE,
  RAID_NONE,
  RAID_STAY,
  directSortie,
  isBriefingInit,
  isRaidDataRecord,
  isSortie,
  parseRaidOverride,
  raidChoiceText,
  raidOutcomeText,
  raidParamsFromData,
  raidResultLine,
  rollRaid,
  seedForBriefing,
  sortieConditions,
  startDamageState,
  type RaidDataRecord,
  type RaidOverride,
  type RaidParams,
  type Sortie,
} from '../src/core/sortie';

const MISSION = getPrototypeMission(gameData, 'us_02');
const P: RaidParams = getRaidParams(gameData, MISSION)!;
const DP = getBoatDamageParams(gameData, MISSION.playerBoatId);
const rawRec: unknown = gameData.riskEvents.events.find((e) => e.id === 'harbor_fire_explosion');
if (!isRaidDataRecord(rawRec)) throw new Error('raid params');
const REC: RaidDataRecord = rawRec;
type Proto = { v0_1_prototype: Record<string, unknown> };
const clone = (): typeof gameData => JSON.parse(JSON.stringify(gameData)) as typeof gameData;
const protoOf = (d: typeof gameData): Record<string, unknown> => (d.missionsSeed.missions.find((x) => x.id === 'us_02') as unknown as Proto).v0_1_prototype;
const sortie = (over: Partial<Sortie>): Sortie => ({ missionId: 'us_02', seed: 1, raid: true, choice: RAID_NONE, stayHit: false, ...over });

describe('出撃と港内空襲（docs/02 §6.8、v0.4.0）', () => {
  it('data: us_02 は空襲あり（0.5・分散 0.9・至近弾 0.5・HP −20・火災）。hazards から harbor_fire_explosion を消した複製は null、params を消した複製は例外', () => {
    expect(P).toEqual({ chance: 0.5, disperseFuelFactor: 0.9, stayHitChance: 0.5, stayHitDamage: 20, stayHitFire: true });
    const noHazard = clone();
    protoOf(noHazard)['hazards'] = ['storm'];
    expect(getRaidParams(noHazard, getPrototypeMission(noHazard, 'us_02'))).toBeNull();
    const noParams = clone();
    delete (noParams.riskEvents.events.find((e) => e.id === 'harbor_fire_explosion') as Record<string, unknown>)['params'];
    expect(() => getRaidParams(noParams, MISSION)).toThrow();
  });
  it('設計値の不変条件: 空襲だけでは沈まない、分散の燃料は出発点で帰れる量より多い、至近弾の後に 127mm を 1 発受けても沈まず乗員は半数より多い', () => {
    expect(DP.maxHp - P.stayHitDamage).toBeGreaterThan(DP.fireDps * DP.fireDurationS);
    const curve = getBoatFuelCurve(gameData, MISSION.playerBoatId);
    const rp = MISSION.returnPoint;
    const edge = Math.hypot(MISSION.playerStart.x - rp.x, MISSION.playerStart.y - rp.y) - rp.radiusM;
    const disperseGal = MISSION.fuelAllotmentGal * P.disperseFuelFactor;
    expect(disperseGal).toBeCloseTo(34.2, 9);
    expect(disperseGal).toBeGreaterThan(edge * curve.galPerMCruise * rp.callMargin);
    expect(disperseGal).toBeGreaterThan(edge * curve.galPerMFull);
    const main = (gameData.enemies.enemies.find((e) => e.id === 'ijn_destroyer') as unknown as { guns: { damage: number }[] }).guns[0]!.damage;
    const hpAfter = DP.maxHp - P.stayHitDamage - main;
    expect(hpAfter).toBeGreaterThan(0);
    const crew = getBoatCrewParams(gameData, MISSION.playerBoatId);
    expect(crewAlive(crew, DP.maxHp, hpAfter)).toBeGreaterThan(Math.floor(crew.total * 0.5));
  });
  it('検査: 範囲外は例外。火災なしなら HP 減 61 は通る。stay_hit_fire が文字・params の欠けは false', () => {
    const q = REC.params;
    const w = (patch: Partial<typeof q>): (() => RaidParams) => () => raidParamsFromData({ params: { ...q, ...patch } }, DP);
    expect(w({ chance: -0.1 })).toThrow();
    expect(w({ chance: 1.1 })).toThrow();
    expect(w({ disperse_fuel_factor: 0 })).toThrow();
    expect(w({ disperse_fuel_factor: 1.2 })).toThrow();
    expect(w({ stay_hit_chance: 1.5 })).toThrow();
    expect(w({ stay_hit_damage: -1 })).toThrow();
    expect(w({ stay_hit_damage: 100 })).toThrow();
    expect(w({ stay_hit_damage: 60 })).toThrow(); // 100 − 60 = 40 は火災の 40 を超えない
    expect(w({ stay_hit_damage: 61, stay_hit_fire: false })()).toMatchObject({ stayHitDamage: 61, stayHitFire: false });
    expect(isRaidDataRecord({ params: { ...q, stay_hit_fire: 'yes' } })).toBe(false);
    expect(isRaidDataRecord({ params: { chance: 0.5 } })).toBe(false);
  });
  it('抽選は seed+4 の系列から必ず 2 回: seed 1 は空襲なし、3 は空襲・至近弾、4 は空襲・無傷。SeededRng(7) の 1・2 回目と一致し、同じ seed なら同じ', () => {
    expect(rollRaid('us_02', 1, P)).toEqual({ missionId: 'us_02', seed: 1, raid: false, choice: RAID_NONE, stayHit: false });
    expect(rollRaid('us_02', 3, P)).toEqual({ missionId: 'us_02', seed: 3, raid: true, choice: RAID_NONE, stayHit: true });
    expect(rollRaid('us_02', 4, P)).toEqual({ missionId: 'us_02', seed: 4, raid: true, choice: RAID_NONE, stayHit: false });
    const r = new SeededRng(7);
    const u1 = r.next();
    const u2 = r.next();
    expect(u1).toBeCloseTo(0.012, 3);
    expect(u2).toBeCloseTo(0.062, 3);
    expect(rollRaid('us_02', 3, P).raid).toBe(u1 < P.chance);
    expect(rollRaid('us_02', 3, P).stayHit).toBe(u2 < P.stayHitChance);
    expect(rollRaid('us_02', 12345, P)).toEqual(rollRaid('us_02', 12345, P));
  });
  it('頻度: seed 1〜2000 で空襲 998 回（0.5 ± 0.05）、そのうち至近弾 504 回（0.5 ± 0.05）', () => {
    let raids = 0;
    let hits = 0;
    for (let s = 1; s <= 2000; s++) {
      const r = rollRaid('us_02', s, P);
      if (r.raid) raids++;
      if (r.raid && r.stayHit) hits++;
    }
    expect(raids).toBe(998);
    expect(hits).toBe(504);
    expect(raids / 2000).toBeGreaterThan(0.45);
    expect(raids / 2000).toBeLessThan(0.55);
    expect(hits / raids).toBeGreaterThan(0.45);
    expect(hits / raids).toBeLessThan(0.55);
  });
  it('上書き: force・disperse・stay・hit は必ず空襲、off は無し。hit は至近弾、stay は無傷に固定。p が null ならどれでも無し。seed 3 の stayHit は none と force で同じ', () => {
    for (const o of ['force', 'disperse', 'stay', 'hit'] as RaidOverride[]) expect(rollRaid('us_02', 1, P, o).raid).toBe(true);
    expect(rollRaid('us_02', 3, P, 'off').raid).toBe(false);
    expect(rollRaid('us_02', 1, P, 'hit').stayHit).toBe(true);
    expect(rollRaid('us_02', 3, P, 'stay').stayHit).toBe(false);
    for (const o of ['none', 'force', 'off', 'disperse', 'stay', 'hit'] as RaidOverride[]) {
      expect(rollRaid('us_02', 3, null, o).raid).toBe(false);
      expect(rollRaid('us_02', 3, null, o).stayHit).toBe(false);
    }
    expect(rollRaid('us_02', 3, P, 'force').stayHit).toBe(rollRaid('us_02', 3, P, 'none').stayHit);
  });
  it('parseRaidOverride: noraid が優先、値なし・1 は force、0 は off、disperse|stay|hit はそのまま、他は none', () => {
    expect(parseRaidOverride(null, false)).toBe('none');
    expect(parseRaidOverride('', false)).toBe('force');
    expect(parseRaidOverride('1', false)).toBe('force');
    expect(parseRaidOverride('0', false)).toBe('off');
    expect(parseRaidOverride(null, true)).toBe('off');
    expect(parseRaidOverride('hit', true)).toBe('off');
    expect(parseRaidOverride('stay', false)).toBe('stay');
    expect(parseRaidOverride('disperse', false)).toBe('disperse');
    expect(parseRaidOverride('x', false)).toBe('none');
  });
  it('直行: disperse は分散、stay は残って無傷、hit は残って至近弾で出撃。none・force・off は空襲なし', () => {
    expect(directSortie('us_02', 9, 'disperse')).toEqual({ missionId: 'us_02', seed: 9, raid: true, choice: RAID_DISPERSE, stayHit: false });
    expect(directSortie('us_02', 9, 'stay')).toEqual({ missionId: 'us_02', seed: 9, raid: true, choice: RAID_STAY, stayHit: false });
    expect(directSortie('us_02', 9, 'hit')).toEqual({ missionId: 'us_02', seed: 9, raid: true, choice: RAID_STAY, stayHit: true });
    for (const o of ['none', 'force', 'off'] as RaidOverride[]) expect(directSortie('us_02', 9, o)).toEqual({ missionId: 'us_02', seed: 9, raid: false, choice: RAID_NONE, stayHit: false });
  });
  it('出撃時の状態: 空襲なし・未選択・p null は効果なし、分散は 0.9・0・なし、至近弾は 1・20・火災、無傷は効果なし', () => {
    expect(sortieConditions(sortie({ raid: false }), P)).toEqual(NO_SORTIE_EFFECT);
    expect(sortieConditions(sortie({ choice: RAID_NONE }), P)).toEqual(NO_SORTIE_EFFECT);
    expect(sortieConditions(sortie({ choice: RAID_STAY, stayHit: true }), null)).toEqual(NO_SORTIE_EFFECT);
    expect(sortieConditions(sortie({ choice: RAID_DISPERSE }), P)).toEqual({ fuelFactor: 0.9, hpLoss: 0, fireAtStart: false });
    expect(sortieConditions(sortie({ choice: RAID_STAY, stayHit: true }), P)).toEqual({ fuelFactor: 1, hpLoss: 20, fireAtStart: true });
    expect(sortieConditions(sortie({ choice: RAID_STAY, stayHit: false }), P)).toEqual(NO_SORTIE_EFFECT);
  });
  it('出撃時の被害: 至近弾は HP 80・火災 20 秒・機関損傷なし、効果なしは 100・0・なし', () => {
    expect(startDamageState(DP, { fuelFactor: 1, hpLoss: 20, fireAtStart: true })).toEqual({ hp: 80, engineDamaged: false, fireLeftS: 20 });
    expect(startDamageState(DP, NO_SORTIE_EFFECT)).toEqual({ hp: 100, engineDamaged: false, fireLeftS: 0 });
  });
  it('至近弾の後の乗員: HP 80 で 12/14・旋回と加速 0.92・消火 × 14/12、消さずに 20 秒で HP 40・8/14・0.76・× 14/8', () => {
    const crew = getBoatCrewParams(gameData, MISSION.playerBoatId);
    const fx = getBoatCrewEffects(gameData, MISSION.playerBoatId);
    const at = (hp: number): { alive: number; turn: number; accel: number; ext: number } => {
      const lost = crewLost(crew, DP.maxHp, hp);
      return { alive: crew.total - lost, turn: crewTurnFactor(fx, lost), accel: crewAccelFactor(fx, lost), ext: crewExtinguishFactor(fx, crew.total - lost, crew.total) };
    };
    const a = at(DP.maxHp - P.stayHitDamage);
    expect(a.alive).toBe(12);
    expect(a.turn).toBeCloseTo(0.92, 9);
    expect(a.accel).toBeCloseTo(0.92, 9);
    expect(a.ext).toBeCloseTo(14 / 12, 9);
    const b = at(DP.maxHp - P.stayHitDamage - DP.fireDps * DP.fireDurationS);
    expect(b.alive).toBe(8);
    expect(b.turn).toBeCloseTo(0.76, 9);
    expect(b.ext).toBeCloseTo(14 / 8, 9);
  });
  it('文言: 2 択のボタン、選んだ後の 1 行、Result の行', () => {
    expect(RAID_ALERT_JA).toBe('出撃前: 空襲警報！ 給油中の艇に火が回った。どうする？');
    expect(RAID_CALM_JA).toBe('出撃前: 異状なし（今夜は空襲なし）');
    expect(raidChoiceText(P, RAID_DISPERSE)).toEqual({ title: '分散して退避', detail: '燃料 90% ・ 被弾なし' });
    expect(raidChoiceText(P, RAID_STAY)).toEqual({ title: '残って給油・消火', detail: '燃料 100% ・ 50% で HP −20・火災' });
    expect(raidOutcomeText(sortie({ choice: RAID_DISPERSE }), P)).toBe('分散した。燃料 90% で出撃');
    expect(raidOutcomeText(sortie({ choice: RAID_STAY }), P)).toBe('被弾なし。燃料 100% で出撃');
    expect(raidOutcomeText(sortie({ choice: RAID_STAY, stayHit: true }), P)).toBe('至近弾！ HP −20・火災のまま出撃 — 出たらすぐ「消火」を長押し');
    expect(raidOutcomeText(sortie({ choice: RAID_STAY, stayHit: true }), { ...P, stayHitFire: false })).toBe('至近弾！ HP −20 で出撃');
    expect(raidOutcomeText(sortie({ choice: RAID_NONE }), P)).toBe('');
    expect(raidOutcomeText(sortie({ raid: false }), P)).toBe('');
    expect(raidResultLine(sortie({ raid: false }), P, NaN)).toBe('出撃前: 空襲なし');
    expect(raidResultLine(sortie({ choice: RAID_DISPERSE }), P, NaN)).toBe('出撃前: 港内空襲 → 分散して退避（燃料 90% で出撃）');
    expect(raidResultLine(sortie({ choice: RAID_STAY }), P, NaN)).toBe('出撃前: 港内空襲 → 残って給油・消火（被弾なし）');
    expect(raidResultLine(sortie({ choice: RAID_STAY, stayHit: true }), P, 2.44)).toBe('出撃前: 港内空襲 → 残って給油・消火 → 至近弾 HP −20・火災 2.4 秒');
    expect(raidResultLine(sortie({ choice: RAID_STAY, stayHit: true }), P, NaN)).toBe('出撃前: 港内空襲 → 残って給油・消火 → 至近弾 HP −20・火災');
    expect(raidResultLine(sortie({ choice: RAID_STAY, stayHit: true }), P, -1)).toBe('出撃前: 港内空襲 → 残って給油・消火 → 至近弾 HP −20・火災');
    expect(raidResultLine(sortie({ choice: RAID_STAY, stayHit: true }), { ...P, stayHitFire: false }, NaN)).toBe('出撃前: 港内空襲 → 残って給油・消火 → 至近弾 HP −20');
    expect(raidResultLine(sortie({ raid: false }), null, NaN)).toBe('');
  });
  it('受け渡しの検査: isSortie・isBriefingInit は正しい形だけ通す。seedForBriefing は同じ任務の保留だけを使う', () => {
    const ok = sortie({});
    expect(isSortie(ok)).toBe(true);
    for (const bad of [{}, { ...ok, seed: undefined }, { ...ok, seed: NaN }, { ...ok, seed: -1 }, { ...ok, seed: 1.5 }, { ...ok, choice: 3 }, { ...ok, choice: '1' }, { ...ok, missionId: '' }, null, 'x']) expect(isSortie(bad)).toBe(false);
    expect(isBriefingInit({ missionId: 'us_02', seed: 0 })).toBe(true);
    expect(isBriefingInit({ missionId: 'us_02', seed: 0xffffffff })).toBe(true);
    for (const bad of [{}, { missionId: 'us_02' }, { missionId: '', seed: 1 }, { missionId: 'us_02', seed: -1 }, { missionId: 'us_02', seed: 2 ** 32 }]) expect(isBriefingInit(bad)).toBe(false);
    expect(seedForBriefing({ missionId: 'us_02', seed: 77 }, 'us_02', 5)).toBe(77);
    expect(seedForBriefing({ missionId: 'us_03', seed: 77 }, 'us_02', 5)).toBe(5);
    expect(seedForBriefing(null, 'us_02', 5)).toBe(5);
    expect(seedForBriefing({ missionId: 'us_02', seed: -1 }, 'us_02', 5)).toBe(5);
  });
});
