// v0.8.1 IP2（us_06 に夜の水上機・ユーザーの U3）: 1 夜に複数回の攻撃の包み（core/seaplane-night）・任務の値と検査（config/seaplane-mission-data の V-P1〜V-P3）・
// HUD の 2 行目の優先（止まった艦の任務だけ水上機の接近がレーダー・止まった艦の出来事より上）・Result の「攻撃 N 回」。
// - 回数 1 の包みは凍結の段の機械と毎ステップ同じ状態（照明弾と爆弾の 1 回で DONE）。包みの無い任務（us_02）は setup に鍵が無く、水上機の値は getSeaplaneParams のまま。
// - 回数 N は N 回の攻撃（照明弾 N・爆弾 N × bombCount）、攻撃の間は哨戒の冷却（patrol_cooldown_s）＋航跡の秒を空ける、N 回の後は DONE。積み直しの後に見失えば哨戒へ戻る。
import { describe, expect, it } from 'vitest';
import { gameData, getSeaplaneParams, type GameData } from '../src/config/game-data';
import { getPrototypeMission } from '../src/config/mission-data';
import { SEAPLANE_ATTACKS_MAX, seaplaneNightSetupPart, seaplaneParamsFor, validateSeaplaneMissions } from '../src/config/seaplane-mission-data';
import { SeededRng } from '../src/core/rng';
import { SP_APPROACH, SP_DONE, SP_EV_FLARE, SP_EV_RELEASE, SP_LEAVING, SP_OUT_LOST, SP_PATROL, createSeaplaneState, stepSeaplane, stepSeaplaneTrigger, type SeaplaneCheck, type SeaplaneParams, type SeaplaneState } from '../src/core/seaplane';
import { afterSeaplaneStep, createSeaplaneNight, type SeaplaneNightState } from '../src/core/seaplane-night';
import { ktToMps } from '../src/core/units';
import { seaplaneResultLine } from '../src/ui/hud-lines';
import { MISSION_ANCHOR_EVENT, MISSION_PLANE, MISSION_RADAR_EVENT, MODE_FLAG_ANCHOR_EVENT, MODE_FLAG_RADAR_EVENT, missionMode } from '../src/ui/mission-mode';
import { buildWorldSetup } from '../src/systems/world-setup';
import { tele } from './pt-ui-kit';
import type { AnchorTelemetry } from '../src/core/boat-telemetry';

const P: SeaplaneParams = buildWorldSetup(gameData, 'us_02').seaplane!;
const DT = 1 / 60;
type Rec = Record<string, unknown>;
const protoOf = (d: GameData, id: string): Rec => ((d.missionsSeed.missions as unknown as Rec[]).find((m) => m['id'] === id)!['v0_1_prototype'] as Rec);
const US06_ATTACKS = (protoOf(gameData, 'us_06')['enemy_aircraft'] as Rec)['attacks_per_night'] as number;

function check(): SeaplaneCheck {
  return { boat: { x: 0, y: 0, headingDeg: 0, speedMps: ktToMps(39) }, targetX: 1000, targetY: -1000, wake: true, stormInside: false, friendlyLive: false, busy: false, blocked: false, boatSinking: false, timeS: 30, shellsFired: 0, forceTrigger: false, forceSeen: false };
}
/** 1 夜を DT 刻みで回す（world の EnemySeaplane.step と同じ順: 開始条件 → 進行 → 包み）。wake(t) は航跡が見えるか。戻りは毎ステップの状態の字・事象の秒・状態 */
function night(attacks: number | null, secs: number, wake: (t: number) => boolean = () => true): { log: string[]; flares: number[]; releases: number[]; s: SeaplaneState; n: SeaplaneNightState | null; leaveEnd: number[]; approach: number[] } {
  const s = createSeaplaneState(P);
  const n = attacks === null ? null : createSeaplaneNight(s, P, attacks);
  const c = check();
  const rng = new SeededRng(5);
  const log: string[] = [], flares: number[] = [], releases: number[] = [], leaveEnd: number[] = [], approach: number[] = [];
  for (let k = 0; k < Math.round(secs / DT); k++) {
    const t = k * DT;
    c.wake = wake(t);
    c.timeS = 30 + t;
    stepSeaplaneTrigger(s, c, P, DT);
    if (s.phase === SP_APPROACH && s.timerS === 0) approach.push(t);
    const prev = s.phase;
    const ev = stepSeaplane(s, P, c, rng, DT);
    if (n) afterSeaplaneStep(n, s, P, prev);
    if (prev === SP_LEAVING && s.phase !== SP_LEAVING) leaveEnd.push(t);
    if (ev & SP_EV_FLARE) flares.push(t);
    if (ev & SP_EV_RELEASE) releases.push(t);
    const { ordnance, ...rest } = s;
    log.push(JSON.stringify([rest, ordnance.bombsLeft, ordnance.bombsDropped, ordnance.bombsHit, ordnance.flare, ordnance.bombs.slice(0, P.bombCount)]));
  }
  return { log, flares, releases, s, n, leaveEnd, approach };
}

describe('1 夜に複数回の攻撃の包み（core/seaplane-night）', () => {
  it('回数 1 の包みは凍結の段の機械と毎ステップ同じ（照明弾 1・爆弾 bombCount・DONE のまま）', () => {
    const a = night(null, 150), b = night(1, 150);
    expect(b.log).toEqual(a.log);
    expect([a.flares.length, a.releases.length, a.s.phase, b.n!.attacks]).toEqual([1, P.bombCount, SP_DONE, 1]);
    expect(b.s.ordnance.bombs.length).toBe(P.bombCount);
  });
  it.each([2, 3, SEAPLANE_ATTACKS_MAX])('回数 %i: その回数の攻撃・攻撃の間は冷却＋航跡の秒・最後は DONE。爆弾は通しで数え、HUD の分は今の攻撃だけ', (k) => {
    const r = night(k, 400);
    expect([r.flares.length, r.releases.length, r.n!.attacks, r.s.phase]).toEqual([k, k * P.bombCount, k, SP_DONE]);
    expect([r.s.ordnance.bombsDropped, r.s.ordnance.bombs.length]).toEqual([k * P.bombCount, k * P.bombCount]);
    expect(r.n!.bombBase).toBe((k - 1) * P.bombCount);
    // 2 回目からの接近は、前の攻撃の去り終わりから冷却 patrol_cooldown_s ＋ 航跡 wake_trigger_s の後
    for (let i = 1; i < k; i++) expect(r.approach[i]! - r.leaveEnd[i - 1]!).toBeCloseTo(P.patrolCooldownS + P.wakeTriggerS, 1);
  });
  it('積み直しの後の接近で減速すれば見失って哨戒へ戻り（DONE にしない）、また航跡を見せれば 2 回目の攻撃が来る', () => {
    // 1 回目の攻撃の後、2 回目の接近の 2 秒後に航跡を消して見失わせ、その 30 秒後にまた航跡
    const first = night(2, 400);
    const a2 = first.approach[1]!;
    const r = night(2, 400, (t) => t < a2 + 2 || t > a2 + 30);
    expect(r.s.lost).toBe(1);
    expect(r.s.outcome === SP_OUT_LOST || r.s.phase === SP_DONE).toBe(true);
    expect([r.flares.length, r.n!.attacks, r.s.phase]).toEqual([2, 2, SP_DONE]);
    const mid = night(2, a2 + 20, (t) => t < a2 + 2);
    expect([mid.s.phase, mid.s.lost, mid.n!.attacks]).toEqual([SP_PATROL, 1, 1]);
  });
});

describe('任務の値と検査（config/seaplane-mission-data・V-P1〜V-P3）', () => {
  const clone = (): GameData => JSON.parse(JSON.stringify(gameData)) as GameData;
  const boat = { silentMaxKt: 18, halfLengthM: 12.2, halfBeamM: 3.15 };
  it('us_06 だけ attacks_per_night を持つ（ハードも）。us_02・us_04 は鍵が無く setup に seaplaneNight が出ず、水上機の値は getSeaplaneParams のまま', () => {
    expect(validateSeaplaneMissions(gameData)).toEqual(['us_06']);
    expect(Number.isInteger(US06_ATTACKS) && US06_ATTACKS >= 2 && US06_ATTACKS <= SEAPLANE_ATTACKS_MAX).toBe(true);
    for (const hard of [false, true]) expect(buildWorldSetup(gameData, 'us_06', { hard }).seaplaneNight).toEqual({ attacksPerNight: US06_ATTACKS });
    for (const id of ['us_02', 'us_04']) {
      const m = getPrototypeMission(gameData, id);
      expect('seaplaneNight' in buildWorldSetup(gameData, id), id).toBe(false);
      expect(seaplaneParamsFor(gameData, m, 5, boat)).toEqual(getSeaplaneParams(gameData, m, 5, boat));
    }
    expect('seaplaneNight' in buildWorldSetup(gameData, 'us_06', { planeOff: true })).toBe(false); // ?debug&noplane
    expect(seaplaneNightSetupPart(gameData, getPrototypeMission(gameData, 'us_06'), null)).toEqual({});
  });
  it('壊れた値は Boot で例外（鍵を名指す）: 回数は 1〜上限の整数・知らない鍵・上書きできない params', () => {
    for (const v of [0, 1.5, SEAPLANE_ATTACKS_MAX + 1, '2', -1]) {
      const d = clone();
      (protoOf(d, 'us_06')['enemy_aircraft'] as Rec)['attacks_per_night'] = v;
      expect(() => validateSeaplaneMissions(d), String(v)).toThrow(/us_06\.v0_1_prototype\.enemy_aircraft\.attacks_per_night.*V-P2/);
    }
    const d1 = clone();
    (protoOf(d1, 'us_02')['enemy_aircraft'] as Rec)['attacks'] = 2;
    expect(() => validateSeaplaneMissions(d1)).toThrow(/us_02\.v0_1_prototype\.enemy_aircraft: 知らない鍵 attacks.*V-P1/);
    const d2 = clone();
    (protoOf(d2, 'us_06')['enemy_aircraft'] as Rec)['params'] = { run_radius_m: 500 };
    expect(() => validateSeaplaneMissions(d2)).toThrow(/上書きできない鍵 run_radius_m.*V-P3/);
    const d3 = clone();
    (protoOf(d3, 'us_06')['enemy_aircraft'] as Rec)['params'] = { lose_s: -1 };
    expect(() => validateSeaplaneMissions(d3)).toThrow(/params\.lose_s は 0 以上.*V-P3/);
  });
  it('任務の params の上書きはその任務の値だけを組み直す（us_02 の数は変えない）', () => {
    const d = clone();
    (protoOf(d, 'us_06')['enemy_aircraft'] as Rec)['params'] = { patrol_cooldown_s: 25, lose_s: 5 };
    const p6 = seaplaneParamsFor(d, getPrototypeMission(d, 'us_06'), 5, boat)!;
    const base = getSeaplaneParams(d, getPrototypeMission(d, 'us_06'), 5, boat)!;
    expect([p6.patrolCooldownS, p6.loseS]).toEqual([25, 5]);
    expect({ ...p6, patrolCooldownS: base.patrolCooldownS, loseS: base.loseS }).toEqual(base);
    expect(seaplaneParamsFor(d, getPrototypeMission(d, 'us_02'), 5, boat)).toEqual(getSeaplaneParams(gameData, getPrototypeMission(gameData, 'us_02'), 5, boat));
  });
});

describe('HUD の 2 行目と Result（止まった艦の任務だけ）', () => {
  const anc = { stage: [0], reason: [0], noticedAtS: [NaN], underwayAtS: [NaN], noticedCount: 0, underwayCount: 0, backdropOn: false, backdropS: 0, heldShots: 0, heldHits: 0, seenMask: 0 } as unknown as AnchorTelemetry;
  const approaching = { planePhase: SP_APPROACH, planeLocked: false, planeWake: true, planeDistM: 4000 };
  it('水上機の未確定の接近は、止まった艦の任務ではレーダー・止まった艦の出来事より上（出来事は待つ）。t.anchor の無い任務（us_04）は v0.8.0 の順のまま', () => {
    const t06 = tele({ enabled: false }, { ...approaching, anchor: anc });
    expect(missionMode(t06, 0, MODE_FLAG_ANCHOR_EVENT)).toBe(MISSION_PLANE);
    expect(missionMode(t06, 0, MODE_FLAG_RADAR_EVENT | MODE_FLAG_ANCHOR_EVENT)).toBe(MISSION_PLANE);
    const t04 = tele({ enabled: false }, approaching);
    expect(missionMode(t04, 0, MODE_FLAG_RADAR_EVENT)).toBe(MISSION_RADAR_EVENT);
    const quiet = tele({ enabled: false }, { anchor: anc });
    expect(missionMode(quiet, 0, MODE_FLAG_ANCHOR_EVENT)).toBe(MISSION_ANCHOR_EVENT);
    expect(missionMode(quiet, 0, MODE_FLAG_RADAR_EVENT)).toBe(MISSION_RADAR_EVENT);
  });
  it('Result の「敵機:」: 攻撃の回数の鍵がある時だけ「攻撃 N 回」（通しの爆弾と転舵）。鍵の無い任務は今の文のまま', () => {
    const base = { seaplaneOutcome: SP_OUT_LOST, seaplaneAttacked: false, seaplaneSorties: 4, seaplaneLost: 2, seaplaneSlowReactS: 1.3, seaplaneFlareLitS: 52.5, seaplaneShellsUnderFlare: 7, seaplaneBombs: 4, seaplaneBombHits: 1, seaplaneDodgeS: [1.1, NaN, 0.9, 1.4] };
    expect(seaplaneResultLine({ ...base, seaplaneAttacks: 2 })).toBe('敵機: 見失わせた 2 回（減速まで 1.3 秒） → 攻撃 2 回 ・ 照明弾の下 52.5 秒 ・ 砲撃 7 発 ・ 爆弾 4 発 命中 1 ・ 転舵 1.1/—/0.9/1.4 秒');
    expect(seaplaneResultLine({ ...base, seaplaneAttacks: 1, seaplaneAttacked: true })).toContain('攻撃 1 回＋途中 1 ・ ');
    expect(seaplaneResultLine(base)).toBe('敵機: 接近 4 回 ・ 見失わせた 2 回（減速まで 1.3 秒）');
    expect(seaplaneResultLine({ ...base, seaplaneAttacks: 0 })).toBe('敵機: 接近 4 回 ・ 見失わせた 2 回（減速まで 1.3 秒）');
  });
});
