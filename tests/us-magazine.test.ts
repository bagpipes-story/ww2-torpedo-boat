// 米の艇の機銃の弾倉（v0.6.8 実機 1 回目。spec-ip1 §4 D1〜D4。ユーザー「us_02を試したところ機銃が無限に撃てました。弾倉交換が発生するように他のイベントも確認の上修正してください」）:
// data（us_elco80 120 発・us_elco77 50 発、交換はどちらも 3.2 秒）と、凍結を 1 つの規則だけ解いた core/gun-battery（組が 2 つ以上の砲も弾倉は 1 つ）、
// 大発への砲（systems/barge-hunt の step の順: 交換 → 交換中は押していない扱い → PT_GUN_RELOAD → 撃った数だけ減らす）を、止まった大発 1 隻に押し続けて確かめる。
// 艦への機銃・対空（systems/arms-step）と HUD（2 行目・ボタン）は tests/us-magazine-arms。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { gameData, getBargeParams, getPrototypeMission } from '../src/config/game-data';
import { GUN_SHELL_POOL_SIZE } from '../src/config/hunt-config';
import { getBoatGunParams, getLoadout } from '../src/config/loadout-data';
import { FIXED_STEP_S } from '../src/config/step-config';
import type { BoatState } from '../src/core/boat-motion';
import { BARGE_SUNK, createFlotilla } from '../src/core/barges';
import { GUN_FIRING, GUN_SAFE, createGunBattery, gunBatteryParamsFromData, isGunBatteryDataRecord, stepGunBattery, type GunBatteryDataRecord, type GunBatteryParams, type GunEvents } from '../src/core/gun-battery';
import { createMagazine, magazineSpend, magazineTick } from '../src/core/magazine';
import { PT_GUN_RELOAD } from '../src/core/pt-gun';
import { SeededRng } from '../src/core/rng';
import { buildWorldSetup } from '../src/systems/world-setup';

type Rec = Record<string, unknown>;
const DT = FIXED_STEP_S;
const S03 = buildWorldSetup(gameData, 'us_03');
const P = getBargeParams(gameData, getPrototypeMission(gameData, 'us_03'))!;
const TS = S03.timeScale;
const quiet: GunEvents = { onFire: () => {}, onHit: () => {}, onMiss: () => {} };
const boatRec = (id: string): Rec => (gameData.boats.boats as unknown as Rec[]).find((b) => b['id'] === id)!;
const rawOf = (id: string): GunBatteryDataRecord => JSON.parse(JSON.stringify(boatRec(id)['gun_battery'])) as GunBatteryDataRecord;

describe('data（boats.json の gun_battery.magazine）', () => {
  it('us_elco80 120 発・us_elco77 50 発、交換はどちらも 3.2 秒（jp_t14・jp_t38 と同じ）。getBoatGunParams・us_03 の WorldSetup の guns・us_01/us_02 の兵装も同じ値', () => {
    expect([rawOf('us_elco80').magazine, rawOf('us_elco77').magazine]).toEqual([{ rounds: 120, reload_s: 3.2 }, { rounds: 50, reload_s: 3.2 }]);
    expect(getBoatGunParams(gameData, 'us_elco80')!.magazine).toEqual({ rounds: 120, reloadS: 3.2 });
    expect(getBoatGunParams(gameData, 'us_elco77')!.magazine).toEqual({ rounds: 50, reloadS: 3.2 });
    expect(S03.guns!.magazine).toEqual({ rounds: 120, reloadS: 3.2 });
    expect(getLoadout(gameData, getPrototypeMission(gameData, 'us_01')).gun!.magazine).toEqual({ rounds: 50, reloadS: 3.2 });
    expect(getLoadout(gameData, getPrototypeMission(gameData, 'us_02')).gun!.magazine).toEqual({ rounds: 120, reloadS: 3.2 });
    for (const id of ['jp_t14', 'jp_t38']) expect(rawOf(id).magazine!.reload_s, id).toBe(3.2);
    // 弾倉は最後の鍵（ほかの値は前のまま: 2 組・150 + 480 発/分、1 組 400 発/分）
    expect(Object.keys(S03.guns!).at(-1)).toBe('magazine');
    expect(getBoatGunParams(gameData, 'us_elco80')!.groups.map((g) => g.roundsPerMin)).toEqual([150, 480]);
    expect(getBoatGunParams(gameData, 'us_elco77')!.groups.map((g) => g.roundsPerMin)).toEqual([400]);
  });
  it('source: 史実の調べ（20mm の 60 発のドラム・.50 口径の 250 発の箱・交換の秒の資料なし）と設計（発の約束・模擬で 80 → 120 にした理由と数・対空の数）', () => {
    const e80 = String((boatRec('us_elco80')['source'] as Rec)['gun_battery']);
    const e77 = String((boatRec('us_elco77')['source'] as Rec)['gun_battery']);
    for (const s of ['/ historical (v0.6.8 実機 1 回目の弾倉の調べ', '60 発の弾倉（ドラム）', 'Motor Torpedo Boat Manual', '250 発の弾薬箱 4 つ', '30 発の環状の帯', '弾倉の交換の秒を書いた資料は無い', '/ design (v0.6.8 実機 1 回目', 'magazine 120 発・reload_s 3.2', '組が 2 つの砲も弾倉は 1 つ', '11.25 秒', '始めの案は 80 発', '83.1%', '89.2%', '前の方を満たす最小の 120', '1.06 → 0.87', '0.45 → 0.37'])
      expect(e80, s).toContain(s);
    expect(e80.startsWith('design (v0.4.2')).toBe(true); // 前の文はそのまま頭に
    for (const s of ['/ historical (v0.6.8 実機 1 回目の弾倉の調べ', '250 発の弾薬箱 4 つ', '銃身が焼けて', '/ design (v0.6.8 実機 1 回目', 'magazine 50 発・reload_s 3.2', '7.35 秒', '0.68 → 0.51', '0.29 → 0.21']) expect(e77, s).toContain(s);
    expect(e77.startsWith('design (v0.6.8。')).toBe(true);
    const aa = String((gameData.hitRateModel as unknown as Rec & { anti_aircraft: Rec }).anti_aircraft['source']);
    for (const s of ['Elco 80 全速の直進 0.37（1 機以上の波 31%）・止まって 0.87（59%）', 'Elco 77 0.21／0.51', '前は Elco 80 0.45／1.06、Elco 77 0.29／0.68', '4.17 発 対 全速の直進 4.51 発']) expect(aa, s).toContain(s);
  });
});

describe('core/gun-battery の弾倉の検査（v0.6.8 実機 1 回目に凍結を 1 つの規則だけ解いた: 組の数を問わない）', () => {
  it('組 2 つの us_elco80 も弾倉を持てる（前は「組 1 つ」で例外）。組 1 つ（us_elco77・jp_t14）も今までどおり', () => {
    expect(rawOf('us_elco80').groups.length).toBe(2);
    expect(gunBatteryParamsFromData(rawOf('us_elco80')).magazine).toEqual({ rounds: 120, reloadS: 3.2 });
    expect(gunBatteryParamsFromData({ ...rawOf('us_elco80'), magazine: { rounds: 1, reload_s: 0.1 } }).magazine).toEqual({ rounds: 1, reloadS: 0.1 });
    expect(gunBatteryParamsFromData(rawOf('jp_t14')).magazine).toEqual({ rounds: 30, reloadS: 3.2 });
    const { magazine: _m, ...noMag } = rawOf('us_elco80');
    expect('magazine' in gunBatteryParamsFromData(noMag)).toBe(false); // 弾倉の無い砲は鍵ごと無い（前と同じ）
  });
  it('ほかの検査は残る: 発数が小数・0、交換 0 秒は例外（新しい文）。数でない値は型の検査で落ちる', () => {
    const msg = /^boats\.json の gun_battery: magazine は rounds（1 以上の整数）・reload_s（正）。組が 2 つ以上の砲も弾倉は 1 つ（全部の組の発を数える）（docs\/02 §6\.4）$/;
    for (const m of [{ rounds: 2.5, reload_s: 3.2 }, { rounds: 0, reload_s: 3.2 }, { rounds: 120, reload_s: 0 }, { rounds: 120, reload_s: -1 }]) {
      expect(() => gunBatteryParamsFromData({ ...rawOf('us_elco80'), magazine: m }), JSON.stringify(m)).toThrow(msg);
      expect(() => gunBatteryParamsFromData({ ...rawOf('us_elco77'), magazine: m }), JSON.stringify(m)).toThrow(msg);
    }
    expect(isGunBatteryDataRecord({ ...rawOf('us_elco80'), magazine: { rounds: '120', reload_s: 3.2 } })).toBe(false);
    expect(isGunBatteryDataRecord(rawOf('us_elco80'))).toBe(true);
  });
});

/** 止まった艇（東向き）の真南 200 m に止まった大発 1 隻（ほかは沈んだ扱い。被害は呼ばない＝沈まない）。弾倉は満ちている */
function bench(g: GunBatteryParams) {
  const f = createFlotilla(P, 16);
  for (let i = 1; i < f.barges.length; i++) f.barges[i]!.phase = BARGE_SUNK;
  Object.assign(f.barges[0]!, { x: 0, y: 200, speedMps: 0, headingDeg: 270 });
  const boat: BoatState = { x: 0, y: 0, headingDeg: 90, speedMps: 0 };
  return { g, f, boat, battery: createGunBattery(g, GUN_SHELL_POOL_SIZE), mag: createMagazine(g.magazine!), rng: new SeededRng(7) };
}
type Bench = ReturnType<typeof bench>;

/** systems/barge-hunt の step の砲の段の写し（本物の順は下の source の pin）。戻り値はこのステップが交換中だったか */
function huntStep(b: Bench, held: boolean): boolean {
  const reloading = magazineTick(b.mag, b.g.magazine!, DT);
  const before = b.battery.shots;
  stepGunBattery(b.battery, b.g, b.boat, 'stop', held && !reloading, true, b.f.barges, P.halfLengthM, P.halfBeamM, S03.visRange2, b.rng, DT, DT * TS, quiet);
  if (reloading && held && b.battery.status === GUN_SAFE) b.battery.status = PT_GUN_RELOAD;
  magazineSpend(b.mag, b.g.magazine!, b.battery.shots - before);
  return reloading;
}

/** 押し続けて、交換が始まったステップと、その時の発数（3 回目まで）・交換中のステップ（撃たず・状態 6）を数える */
function cadence(id: string) {
  const b = bench(getBoatGunParams(gameData, id)!);
  const starts: Array<[number, number]> = [];
  let reloadSteps = 0;
  let firstShot = -1;
  for (let k = 0; k < 60 * 60 && starts.length < 3; k++) {
    const was = b.mag.reloadLeftS > 0;
    const before = b.battery.shots;
    const reloading = huntStep(b, true);
    if (reloading) {
      reloadSteps++;
      expect(b.battery.shots, `step ${k}`).toBe(before); // 交換中は撃たない
      expect(b.battery.status, `step ${k}`).toBe(PT_GUN_RELOAD);
    } else expect(b.battery.status, `step ${k}`).toBe(GUN_FIRING);
    if (firstShot < 0 && b.battery.shots > before) firstShot = k;
    if (!was && b.mag.reloadLeftS > 0) starts.push([k, b.battery.shots]);
  }
  return { b, starts, reloadSteps, firstShot };
}

describe('大発への砲（systems/barge-hunt の順）: 押し続けると弾倉交換が起きる', () => {
  it('Elco 80（us_03・us_02 の砲）: 最初のステップに 2 組とも撃ち、120 発で交換が始まる（11.25 秒）。交換は 192 ステップ＝3.2 秒（撃たず・状態 6）、次のステップからまた撃つ。2 回目は 240 発', () => {
    const { starts, reloadSteps, firstShot } = cadence('us_elco80');
    expect(firstShot).toBe(0);
    expect(starts[0]).toEqual([675, 120]); // 675 / 60 = 11.25 秒（120 / 630 × 60 = 11.43 秒より最初の 2 発のぶん早い）
    expect(starts[1]![1]).toBe(240);
    expect(starts[2]![1]).toBe(360);
    expect(starts[1]![0] - starts[0]![0]).toBe(starts[2]![0] - starts[1]![0]); // 同じ周期でくり返す
    expect(starts[1]![0] - starts[0]![0]).toBe(675 + 193); // 撃つ 675 ステップ + 交換の 192 ステップ + 満ちて撃つ 1 ステップ
    expect(reloadSteps).toBe(2 * 192); // 3 回目の交換は始まったところで止めた
  });
  it('Elco 77（us_01 の砲）: 1 組 400 発/分で 50 発＝441 ステップ（7.35 秒。最初の 1 発がすぐ出るので 7.5 秒より 1 間隔早い）、交換 3.2 秒', () => {
    const { starts, reloadSteps } = cadence('us_elco77');
    expect(starts.map((s) => s[1])).toEqual([50, 100, 150]);
    expect(starts[0]![0]).toBe(441);
    expect(starts[1]![0] - starts[0]![0]).toBe(441 + 193);
    expect(reloadSteps).toBe(2 * 192);
  });
  it('jp と同じ規則: 交換は押していなくても進み（離しても 3.2 秒で満ちる）、撃たない間の補充と早めの交換は無い。交換中に押し直しても一斉発射しない', () => {
    const b = bench(getBoatGunParams(gameData, 'us_elco80')!);
    for (let k = 0; k < 120; k++) huntStep(b, true); // 2 秒撃つ
    const left = b.mag.magLeft;
    expect(left).toBeLessThan(120);
    expect(left).toBeGreaterThan(90);
    for (let k = 0; k < 600; k++) huntStep(b, false); // 10 秒離す
    expect([b.mag.magLeft, b.mag.reloadLeftS, b.battery.status]).toEqual([left, 0, GUN_SAFE]);
    for (let k = 0; k < 60 * 30 && b.mag.reloadLeftS === 0; k++) huntStep(b, true);
    expect(b.mag.reloadLeftS).toBe(3.2);
    let k = 0;
    for (; b.mag.reloadLeftS > 0; k++) huntStep(b, false); // 離したまま
    expect([b.mag.magLeft, k]).toEqual([120, 193]);
    const before = b.battery.shots;
    huntStep(b, true);
    expect(b.battery.shots - before).toBeLessThanOrEqual(2); // 押し直した最初のステップは組ごとに 1 発まで（負の残りを溜めない）
  });
});

describe('ソースの pin', () => {
  const code = (p: string): string => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  it('systems/barge-hunt の step: 交換 → 押していない扱いで撃つ → PT_GUN_RELOAD → 撃った数だけ減らす → 大発（それぞれ 1 回。core/pt-gun・systems/ship-gun と同じ順）。弾倉は data の magazine から', () => {
    const s = code('systems/barge-hunt.ts');
    const body = s.slice(s.indexOf('  step(dt: number, feelDt: number, w: BargeHuntView, held: boolean): void {'), s.indexOf('  get shoreInArc()'));
    const parts = [
      'const reloading = m !== null && mp !== null && magazineTick(m, mp, feelDt);',
      'const before = this.battery.shots;',
      'stepGunBattery(this.battery, this.g, this.boat, w.band, held && !reloading, afloat, ',
      'if (reloading && held && afloat && this.battery.status === GUN_SAFE) this.battery.status = PT_GUN_RELOAD;',
      'if (m !== null && mp !== null) magazineSpend(m, mp, this.battery.shots - before);',
      'stepFlotilla(this.flotilla, this.p, c, this.bargeRng, feelDt, dt, this.flotillaEvents);',
    ];
    const idx = parts.map((p) => body.indexOf(p));
    expect(idx.every((i) => i >= 0), idx.join(' ')).toBe(true);
    for (let k = 1; k < idx.length; k++) expect(idx[k - 1]!, parts[k]).toBeLessThan(idx[k]!);
    for (const p of parts) expect(s.split(p).length, p).toBe(2);
    expect(s).toContain('this.magP = g.magazine ?? null;');
    expect(s).toContain('this.mag = this.magP ? createMagazine(this.magP) : null;');
  });
  it('core/gun-battery の弾倉の検査から「組 1 つ」だけ外した（ほかの検査は同じ）', () => {
    const s = code('core/gun-battery.ts');
    expect(s).toContain('if (mag && !(Number.isInteger(mag.rounds) && mag.rounds >= 1 && mag.reload_s > 0)) bad(');
    expect(s).not.toContain('groups.length === 1');
  });
});
