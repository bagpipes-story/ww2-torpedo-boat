// v0.7.2 S2（アートと音③：BGM と命中スローの音。spec-v0720 §5・§8.1・D5・brief L19〜L21）: 任務の曲の段の観測器 core/sfx-music-mood を、偽のテレメトリ（tests/sfx-loops-kit。凍らせる＝読むだけ）
// で確かめる。§5.1 の行ごと（戦闘・緊張・静か・沈み始め）・読み替え（米PT の標的・沿岸砲の射界・水上機の接近の段・jp_04 の決着の前・jp_03 の決着の前）・間（上がるのは次の 10 Hz・
// 下がるのは戦闘 6 秒・緊張 8 秒の後・戦闘から落ちると緊張）・沈み始め・始めのフレーム・jp_03 の座席の移り（HP を写すだけ）・漏らさない（見えていない敵の距離の欄が小さくても静か）・
// 段の聞かせ方の関数（時定数と層の音量）・確保しない。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  MUSIC_GAIN, MUSIC_LAYER_KEYS, MUSIC_MOOD_BATTLE, MUSIC_MOOD_QUIET, MUSIC_MOOD_SINK, MUSIC_MOOD_TENSE, MUSIC_MOOD_WEIGHTS, MUSIC_PLAYER, SFX_MUSIC_MOOD,
} from '../src/config/sfx-music-config';
import { AS_T_FALLING, AS_T_INBOUND, AS_T_NONE, AS_T_ORBIT, AS_T_REST, AS_T_RUN } from '../src/core/air-strike-state';
import type { BoatTelemetry } from '../src/core/boat-telemetry';
import { EVA_NONE, EVA_REPASS, EVA_WAVE } from '../src/core/evac-telemetry';
import { FF_CHALLENGE, FF_LEAVING, FF_STRAFE } from '../src/core/friendly';
import { LANDING_REPORT_FAR, LANDING_REPORT_NEAR } from '../src/core/landing';
import { PA_HUNT, PA_LEAVE, PA_ORBIT, PA_PASS, PA_SORTIE } from '../src/core/patrol-air-state';
import { SP_APPROACH, SP_FLARE_PASS, SP_LEAVING, SP_ORBIT, SP_PATROL, SP_RUN } from '../src/core/seaplane';
import { createSfxMoodState, musicMoodGain, musicMoodTc, stepSfxMood, type SfxMoodState } from '../src/core/sfx-music-mood';
import { STORM_INSIDE } from '../src/core/storm';
import { tel, type FakeOver } from './sfx-loops-kit';

const DT = 1 / 60;
const Q = MUSIC_MOOD_QUIET, T = MUSIC_MOOD_TENSE, B = MUSIC_MOOD_BATTLE;
/** s 秒、同じテレメトリで回して最後の段を返す（s が無ければ 0.2 秒＝10 Hz の決めを 2 回） */
function run(st: SfxMoodState, t: BoatTelemetry, s = 0.2): number {
  let lv = st.level;
  for (let i = Math.round(s / DT); i > 0; i--) lv = stepSfxMood(st, t, DT);
  return lv;
}
const levelOf = (over: FakeOver): number => run(createSfxMoodState(), tel(over));

describe('段の表（spec §5.1。出どころの最大。HUD が出している状態だけ）', () => {
  it.each<[string, FakeOver]>([
    ['探照灯に照らされている', { illuminated: true }],
    ['星弾に照らされている', { illuminated: true, starLit: true }],
    ['星弾（starLit だけ）', { starLit: true }],
    ['米PT の航過・連射（標的が自艇）', { pt: { enabled: true, passing: true, targetKind: 0, alive: 1, detected: true } }],
    ['沿岸砲の射界の中で撃ってくる', { batteryInArc: true, batteryAlerted: true }],
    ['水上機の爆撃進路', { planePhase: SP_RUN, planeLocked: true }],
    ['水上機の爆弾が落下中', { planePhase: SP_ORBIT, planeBombAir: true }],
    ['味方機の誤射（掃射）', { friendlyPhase: FF_STRAFE }],
    ['夜明けの空襲の旋回', { dawn: { threat: AS_T_ORBIT } }],
    ['夜明けの空襲の突入', { dawn: { threat: AS_T_RUN } }],
    ['夜明けの空襲の落下', { dawn: { threat: AS_T_FALLING } }],
    ['夜の出撃の旋回', { patrol: { enabled: true, phase: PA_SORTIE, threat: AS_T_ORBIT } }],
    ['夜の出撃の突入', { patrol: { enabled: true, phase: PA_SORTIE, threat: AS_T_RUN } }],
    ['夜の出撃の落下', { patrol: { enabled: true, phase: PA_SORTIE, threat: AS_T_FALLING } }],
    ['jp_03 の操作中の隊を狙う編隊', { evac: { enabled: true, control: 2, targetedMask: 0b000100 } }],
    ['jp_03 の操作中の隊への爆弾の落下', { evac: { enabled: true, control: 0, falling: true } }],
  ])('戦闘: %s', (_, over) => {
    expect(levelOf(over)).toBe(B);
  });
  it.each<[string, FakeOver]>([
    ['発見された（大発の「気づかれた！」も同じ欄）', { playerDetected: true }],
    ['米PT の隊が捉えている（まだ戦う PT がいる）', { pt: { enabled: true, detected: true, alive: 2 } }],
    ['米PT の航過で標的が大発（jp_01）', { pt: { enabled: true, passing: true, targetKind: 1, alive: 1 } }],
    ['米PT の航過で標的が隼艇（jp_01 のハード）', { pt: { enabled: true, passing: true, targetKind: 2, alive: 1 } }],
    ['水上機に発見された（接近の段）', { planePhase: SP_APPROACH, planeLocked: true }],
    ['水上機の照明弾の航過', { planePhase: SP_FLARE_PASS }],
    ['水上機の旋回', { planePhase: SP_ORBIT }],
    ['味方機の識別の要求', { friendlyPhase: FF_CHALLENGE }],
    ['夜明けの空襲の接近', { dawn: { threat: AS_T_INBOUND } }],
    ['夜明けの空襲の波の合間', { dawn: { threat: AS_T_REST } }],
    ['夜の出撃の接近', { patrol: { enabled: true, phase: PA_SORTIE, threat: AS_T_INBOUND } }],
    ['夜の出撃の波の合間', { patrol: { enabled: true, phase: PA_SORTIE, threat: AS_T_REST } }],
    ['夜の哨戒機の捜索の接近', { patrol: { enabled: true, phase: PA_PASS } }],
    ['夜の哨戒機の付近の捜索', { patrol: { enabled: true, phase: PA_ORBIT } }],
    ['jp_03 の波の予告', { evac: { enabled: true, annKind: EVA_WAVE } }],
    ['jp_03 の戻ってくる編隊の予告', { evac: { enabled: true, annKind: EVA_REPASS } }],
    ['jp_03 のほかの隊の狙い', { evac: { enabled: true, control: 0, targetedMask: 0b011000 } }],
    ['jp_04 の見張りの報告（遠い）', { landing: { enabled: true, reportSub: LANDING_REPORT_FAR } }],
    ['jp_04 の見張りの報告（近い）', { landing: { enabled: true, reportSub: LANDING_REPORT_NEAR } }],
    ['jp_04 の輸送船へ走る雷跡', { landing: { enabled: true, wakes: 2 } }],
    ['jp_04 の輸送船が射線に入る', { landing: { enabled: true, fireLineI: 1 } }],
  ])('緊張: %s', (_, over) => {
    expect(levelOf(over)).toBe(T);
  });
  it.each<[string, FakeOver]>([
    ['何も無い夜', {}],
    ['暴風・火災・燃料切れ・帰投せよ', { stormState: STORM_INSIDE, onFire: true, fuelEmpty: true, callFlags: 1 }],
    ['沿岸砲の射界の中（気づかれていない＝「沿岸砲の射界」）', { batteryInArc: true }],
    ['沿岸砲が気づいているが射界の外（撃たない）', { batteryAlerted: true }],
    ['水上機の接近（まだ見つかっていない＝「航跡なし」）', { planePhase: SP_APPROACH, planeLocked: false, planeDistM: 300 }],
    ['水上機の哨戒（HUD に出ない）', { planePhase: SP_PATROL, planeDistM: 100 }],
    ['水上機が去る', { planePhase: SP_LEAVING, planeLocked: true }],
    ['味方機が離れる', { friendlyPhase: FF_LEAVING }],
    ['空襲なし', { dawn: { threat: AS_T_NONE, reached: true } }],
    ['夜の哨戒機のレーダーの前（PA_HUNT）・去る', { patrol: { enabled: true, phase: PA_HUNT, distM: 200 } }],
    ['夜の哨戒機が去る', { patrol: { enabled: true, phase: PA_LEAVE, resultKind: 1 } }],
    ['米PT がいるだけ（捉えていない）', { pt: { enabled: true, alive: 2 } }],
    ['米PT がみな去った（捉えていたが戦う PT がいない）', { pt: { enabled: true, detected: true, alive: 0 } }],
    ['米PT の航過で標的を失った（HUD が赤い線を降ろす）', { pt: { enabled: true, passing: true, passTargetLost: true, targetKind: 1, alive: 1 } }],
    ['米PT の欄があっても任務に米PT がいない', { pt: { enabled: false, detected: true, passing: true, alive: 1 } }],
    ['jp_03 の決着の後（狙いの欄が残っていても）', { evac: { enabled: true, settled: true, annKind: EVA_WAVE, targetedMask: 0b111, falling: true } }],
    ['jp_03 が無い任務の evac の欄', { evac: { enabled: false, annKind: EVA_WAVE, targetedMask: 1, falling: true } }],
    ['jp_04 の揚陸の決着の後', { landing: { enabled: true, resolved: true, reportSub: LANDING_REPORT_NEAR, wakes: 1, fireLineI: 0 } }],
    ['jp_04 が無い任務の landing の欄', { landing: { enabled: false, reportSub: LANDING_REPORT_NEAR, wakes: 1, fireLineI: 0 } }],
  ])('静か: %s', (_, over) => {
    expect(levelOf(over)).toBe(Q);
  });
  it('出どころの最大を取る（戦闘と緊張が同時なら戦闘）', () => {
    expect(levelOf({ playerDetected: true, illuminated: true })).toBe(B);
    expect(levelOf({ playerDetected: true, planePhase: SP_ORBIT, dawn: { threat: AS_T_REST } })).toBe(T);
    expect(levelOf({ evac: { enabled: true, control: 1, targetedMask: 0b11, annKind: EVA_WAVE } })).toBe(B);
  });
});

describe('漏らさない（D5・brief L20）', () => {
  it('見えていない駆逐艦・米PT・水上機・哨戒機が近い（距離の欄だけ小さい・見つかる距離が大きい・敵影あり）偽物でも静か。「敵影あり」だけでは上げない', () => {
    const base = tel({ planePhase: SP_APPROACH, planeLocked: false, planeDistM: 20, patrol: { enabled: true, phase: PA_HUNT, distM: 30 }, pt: { enabled: true, alive: 3 } }) as unknown as Record<string, unknown>;
    const leak = Object.freeze({
      ...base, enemyDx: 15, enemyDy: -10, enemySighted: true, detectRangeM: 1e9, planeDx: 5, planeDy: 5,
      pt: Object.freeze({ ...(base.pt as object), dx: 12, dy: 8, sighted: true, threatPhase: 2 }),
      patrol: Object.freeze({ ...(base.patrol as object), bearingDeg: 0, seen: true }),
      dawn: Object.freeze({ ...(base.dawn as object), inboundDistM: 50 }),
      landing: Object.freeze({ ...(base.landing as object), reportDx: 10, reportDy: 10, reportSighted: true, shipDistM: 20 }),
    }) as unknown as BoatTelemetry;
    const st = createSfxMoodState();
    expect(run(st, leak, 30)).toBe(Q);
    expect(st.moves).toBe(0);
    expect(levelOf({})).toBe(Q);
  });
  it('観測器の source は距離・位置・見えているかの欄の名前を持たない（tests/sfx-rules と同じ固定）', () => {
    const src = readFileSync('src/core/sfx-music-mood.ts', 'utf8').replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
    for (const f of ['enemyDx', 'enemyDy', 'enemySighted', 'planeDistM', 'distM', 'detectRangeM', 'sighted', '.dx', '.dy']) expect(src, f).not.toContain(f);
  });
});

describe('間と移り（spec §5.2。ゲームの時計・10 Hz の決め）', () => {
  it('上がるのは次の 10 Hz の決めで（1 フレームの信号でも拾う）。戦闘は最後の信号から 6 秒、その後は緊張が 8 秒まで残り、静かへ', () => {
    const st = createSfxMoodState();
    run(st, tel(), 1);
    let t = 0;
    const lit = tel({ illuminated: true }), calm = tel();
    stepSfxMood(st, lit, DT); // 1 フレームだけ照らされた
    t += DT;
    let rose = NaN;
    for (let i = 0; i < 12; i++) { if (stepSfxMood(st, calm, DT) === B && Number.isNaN(rose)) rose = t; t += DT; }
    expect(rose).toBeLessThanOrEqual(0.1 + DT + 1e-9);
    const levels: [number, number][] = [];
    for (let i = 0; i < 12 * 60; i++) { const lv = stepSfxMood(st, calm, DT); if (levels.length === 0 || levels[levels.length - 1]![1] !== lv) levels.push([t, lv]); t += DT; }
    expect(levels.map((x) => x[1])).toEqual([B, T, Q]);
    expect(levels[1]![0]).toBeGreaterThanOrEqual(SFX_MUSIC_MOOD.holdBattleS - 2 * DT);
    expect(levels[1]![0]).toBeLessThanOrEqual(SFX_MUSIC_MOOD.holdBattleS + 0.1 + DT);
    expect(levels[2]![0]).toBeGreaterThanOrEqual(SFX_MUSIC_MOOD.holdTenseS - 2 * DT);
    expect(levels[2]![0]).toBeLessThanOrEqual(SFX_MUSIC_MOOD.holdTenseS + 0.1 + DT);
    expect(st.moves).toBe(3);
  });
  it('緊張は最後の信号から 8 秒。信号が続く間は保つ（書き換えない）。探照灯の往復（6 秒の内の見え隠れ）は戦闘のまま', () => {
    const st = createSfxMoodState();
    expect(run(st, tel({ playerDetected: true }), 20)).toBe(T);
    expect(st.moves).toBe(1);
    expect(run(st, tel(), SFX_MUSIC_MOOD.holdTenseS - 0.3)).toBe(T);
    expect(run(st, tel(), 0.5)).toBe(Q);
    const sw = createSfxMoodState();
    for (let k = 0; k < 6; k++) { run(sw, tel({ playerDetected: true, illuminated: true }), 1); run(sw, tel({ playerDetected: true }), 4); }
    expect([sw.level, sw.moves]).toEqual([B, 1]);
  });
  it('一時停止の間は呼ばれない（Hud が止まる）＝時計は進まない: 止める前の残りの hold は再開の後に続く', () => {
    const st = createSfxMoodState();
    run(st, tel({ playerDetected: true }), 1);
    run(st, tel(), 5);
    const clock = st.clockS;
    // （一時停止の 60 秒＝呼ばれない）
    expect(st.clockS).toBe(clock);
    expect(run(st, tel(), 2.5)).toBe(T);
    expect(run(st, tel(), 1)).toBe(Q);
  });
  it('長いフレーム（0.5 秒）の後に 10 Hz の決めをまとめて回さない（1 回だけ）・dt の和がゲームの時計', () => {
    const st = createSfxMoodState();
    stepSfxMood(st, tel({ playerDetected: true }), 0.5);
    expect(st.level).toBe(T);
    expect(st.accS).toBe(0);
    expect(st.clockS).toBeCloseTo(0.5, 12);
  });
});

describe('沈み始め・始めのフレーム・座席の移り（spec §5.4・brief L19）', () => {
  it('hp <= 0 でそのフレームに沈み始め（10 Hz を待たない）。以後は戻らない（Result へ）', () => {
    const st = createSfxMoodState();
    run(st, tel({ hp: 30, playerDetected: true }), 1);
    expect(stepSfxMood(st, tel({ hp: 0, playerDetected: true }), DT)).toBe(MUSIC_MOOD_SINK);
    expect(run(st, tel({ hp: 40 }), 3)).toBe(MUSIC_MOOD_SINK);
    expect(levelOf({ hp: -5 })).toBe(MUSIC_MOOD_SINK);
  });
  it('始めのフレームは HP を写すだけ（傷んだ艇で始まる夜を被弾と読まない）', () => {
    const st = createSfxMoodState();
    expect(run(st, tel({ hp: 35 }), 1)).toBe(Q);
    expect(st.moves).toBe(0);
  });
  it('被弾: HP が 1 フレームに 0.5 より多く減ると戦闘。火災の継続の被害（毎秒 2 HP 以下＝1 フレーム 0.14 HP 以下）では上げない', () => {
    const st = createSfxMoodState();
    let hp = 100;
    for (let i = 0; i < 600; i++) { hp -= 2 * DT; stepSfxMood(st, tel({ hp, onFire: true }), DT); }
    expect([st.level, st.moves]).toEqual([Q, 0]);
    stepSfxMood(st, tel({ hp: hp - 0.6 }), DT);
    expect(run(st, tel({ hp: hp - 0.6 }), 0.2)).toBe(B);
    const small = createSfxMoodState();
    run(small, tel({ hp: 80 }), 0.5);
    stepSfxMood(small, tel({ hp: 79.6 }), DT);
    expect(run(small, tel({ hp: 79.6 }), 0.2)).toBe(Q);
  });
  it('jp_03 の［切替］・乗り移り（座席の通し番号が変わった）のフレームは HP を写すだけ（別の艇の HP の差を被弾と読まない）。次のフレームからは被弾を拾う', () => {
    const st = createSfxMoodState();
    run(st, tel({ hp: 100, evac: { enabled: true, seatSeq: 1 } }), 1);
    stepSfxMood(st, tel({ hp: 40, evac: { enabled: true, seatSeq: 2 } }), DT);
    expect(run(st, tel({ hp: 40, evac: { enabled: true, seatSeq: 2 } }), 1)).toBe(Q);
    // 座席が替わったフレームに HP 0 が見えても沈み始めにしない（乗り移った艇）
    const s2 = createSfxMoodState();
    run(s2, tel({ hp: 10, evac: { enabled: true, seatSeq: 3 } }), 1);
    expect(stepSfxMood(s2, tel({ hp: 0, evac: { enabled: true, seatSeq: 4 } }), DT)).not.toBe(MUSIC_MOOD_SINK);
    stepSfxMood(st, tel({ hp: 30, evac: { enabled: true, seatSeq: 2 } }), DT);
    expect(run(st, tel({ hp: 30, evac: { enabled: true, seatSeq: 2 } }), 0.2)).toBe(B);
  });
});

describe('段の聞かせ方（曲の再生と道具が同じ関数）', () => {
  it('時定数: 上がりは戦闘 0.6・緊張 1.5 秒、下がりは戦闘から 3 秒・緊張から 4 秒（× fadeTc）、沈み始めは 2.5 秒（× fadeTc）', () => {
    const tc = MUSIC_PLAYER.fadeTc;
    expect([musicMoodTc(Q, T), musicMoodTc(Q, B), musicMoodTc(T, B)]).toEqual([1.5, 0.6, 0.6]);
    expect([musicMoodTc(B, T), musicMoodTc(B, Q), musicMoodTc(T, Q)]).toEqual([3 * tc, 3 * tc, 4 * tc]);
    for (const from of [Q, T, B]) expect(musicMoodTc(from, MUSIC_MOOD_SINK)).toBe(2.5 * tc);
  });
  it('層の音量 = 鍵の音量 × 段の重さ（静か (1, 0, 0)・緊張 (0.8, 1, 0)・戦闘 (0.6, 0.8, 1)）・沈み始めは 0', () => {
    for (const m of [Q, T, B]) for (let i = 0; i < 3; i++) expect(musicMoodGain(i, m)).toBe(MUSIC_GAIN[MUSIC_LAYER_KEYS[i]!] * MUSIC_MOOD_WEIGHTS[m]![i]!);
    expect([0, 1, 2].map((i) => musicMoodGain(i, MUSIC_MOOD_SINK))).toEqual([0, 0, 0]);
    expect([0, 1, 2].map((i) => musicMoodGain(i, Q) > 0)).toEqual([true, false, false]);
  });
});

describe('観測器の作法（読むだけ・確保しない）', () => {
  it('凍らせたテレメトリで全部の出どころを通しても投げない（どの欄にも書かない）。戻りは段の数だけ', () => {
    const st = createSfxMoodState();
    const busy = tel({
      illuminated: true, starLit: true, playerDetected: true, batteryInArc: true, batteryAlerted: true, planePhase: SP_RUN, planeBombAir: true, friendlyPhase: FF_STRAFE,
      dawn: { threat: AS_T_FALLING }, patrol: { enabled: true, phase: PA_SORTIE, threat: AS_T_RUN }, evac: { enabled: true, targetedMask: 7, annKind: EVA_WAVE, falling: true },
      landing: { enabled: true, reportSub: LANDING_REPORT_NEAR, wakes: 3, fireLineI: 1 }, pt: { enabled: true, passing: true, detected: true, alive: 2 },
    });
    expect(() => { for (let i = 0; i < 120; i++) stepSfxMood(st, busy, DT); }).not.toThrow();
    expect(st.level).toBe(B);
    expect(EVA_NONE).toBe(0);
  });
  it('source: 口の本体は確保しない（new・閉包・配列とオブジェクトのリテラルなし）・乱数と時計の口を使わない・テレメトリへ書かない', () => {
    const src = readFileSync('src/core/sfx-music-mood.ts', 'utf8').replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
    const body = src.slice(src.indexOf('function raidSignal'));
    expect(body).not.toMatch(/\bnew\s|=>|\.(map|filter|slice|concat)\(|\{\s*\w+\s*:|=\s*\[/);
    expect(src).not.toMatch(/Math\.random|SeededRng|Date\.now|performance/);
    expect(src).not.toMatch(/\b(t|p|pa|ev|l)\.[\w.]+\s*(?:[-+*/|&]?=(?!=)|\+\+|--)/);
    expect(src.split('\n').length).toBeLessThanOrEqual(201);
  });
});
