// v0.8.2 S0（spec-v0820 §4.4 D-G1〜D-G4・§5.3。ユーザーの決め U1）: 戦艦の弾薬庫の記録（enemies.json の magazine）の読み出しと起動時の検査 V-M1〜V-M3（config/magazine-data）。
// 既定の data（扶桑型の 3 本目 3.5%・4 本目 7%＝v0.8.2 IP1 のユーザーの決め U-Q1。S0〜S4 は 3%・6%）が通り、壊した記録は鍵を名指す日本語の文で止まる。規則は記録ごと（今の記録には無い＝今の任務は変わらない）。S0 では誰も確率を引かない。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gameData, type GameData } from '../src/config/game-data';
import { MAGAZINE_KEYS, MAGAZINE_SHIP_CLASS, magazineRuleOf, validateMagazineRecords } from '../src/config/magazine-data';

type Rec = Record<string, unknown>;
const clone = (): GameData => JSON.parse(JSON.stringify(gameData)) as GameData;
const recOf = (d: GameData, id: string): Rec => (d.enemies.enemies as unknown as Rec[]).find((e) => e['id'] === id)!;
const magOf = (d: GameData): Rec => recOf(d, 'ijn_battleship_fuso')['magazine'] as Rec;
const read = (f: (d: GameData) => void, id = 'ijn_battleship_fuso'): (() => unknown) => {
  const d = clone();
  f(d);
  return () => magazineRuleOf(d, id);
};

describe('既定の data（扶桑型。ユーザーの U1・spec §4.4 D-G3）', () => {
  it('3 本目 3.5%・4 本目 7%（4 本全部当たった艦の轟沈 10.3%＝ユーザーの U-Q1「10回に一回くらい」）。沈む本数 6 未満・持つのは戦艦の記録だけ', () => {
    expect(magazineRuleOf(gameData, 'ijn_battleship_fuso')).toEqual({ onHits: [3, 4], chance: [0.035, 0.07] });
    expect(1 - (1 - 0.035) * (1 - 0.07)).toBeCloseTo(0.10255, 5);
    expect(validateMagazineRecords(gameData)).toEqual(['ijn_battleship_fuso']);
    for (const e of gameData.enemies.enemies as unknown as Rec[]) if (e['id'] !== 'ijn_battleship_fuso') expect(magazineRuleOf(gameData, String(e['id'])), String(e['id'])).toBeNull();
    expect([MAGAZINE_KEYS, MAGAZINE_SHIP_CLASS]).toEqual([['on_hits', 'chance', 'source'], 'battleship']);
    expect(String(magOf(gameData)['source'])).toContain('ユーザーの決め U1');
    expect(String(magOf(gameData)['source'])).toContain('魚雷4本当てたときの轟沈率が10回に一回くらいになるように調整してください。');
  });
  it('?debug&boom（magazineBoom）は確率だけ 1（規則の無い記録は null のまま）。読むたびに写し（data の配列を渡さない）', () => {
    expect(magazineRuleOf(gameData, 'ijn_battleship_fuso', { magazineBoom: true })).toEqual({ onHits: [3, 4], chance: [1, 1] });
    expect(magazineRuleOf(gameData, 'ijn_destroyer', { magazineBoom: true })).toBeNull();
    const a = magazineRuleOf(gameData, 'ijn_battleship_fuso')!;
    a.chance[0] = 0.5;
    expect(magazineRuleOf(gameData, 'ijn_battleship_fuso')!.chance[0]).toBe(0.035);
  });
  it('S0 では Boot の検査と列の kits のほかに誰も読まない（確率の引きは S1 の core/magazine・配線は S2）', () => {
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith('.ts')) files.push(p);
      }
    };
    walk(join(__dirname, '..', 'src'));
    const users = files.filter((p) => /from '\.\.?\/(config\/)?magazine-data'/.test(readFileSync(p, 'utf8'))).map((p) => p.slice(p.indexOf('src')).replace(/\\/g, '/')).sort();
    expect(users).toEqual(['src/config/column-mission-data.ts', 'src/scenes/boot-scene.ts', 'src/systems/world-setup-types.ts']);
  });
});

describe('起動時の検査（V-M1〜V-M3）', () => {
  it('V-M1: 鍵の閉じた集合・同じ長さ・on_hits は 1 以上の整数の昇順で沈む本数未満・chance は 0 以上 1 未満・出典', () => {
    expect(read((d) => (magOf(d)['note'] = 'x'))).toThrow(/enemies\.json の ijn_battleship_fuso\.magazine: 鍵はちょうど on_hits・chance・source（on_hits・chance・source・note）（V-M1・spec-v0820 §4\.4）/);
    expect(read((d) => (magOf(d)['chance'] = [0.03]))).toThrow(/on_hits と chance は同じ長さの空でない配列（V-M1/);
    expect(read((d) => Object.assign(magOf(d), { on_hits: [], chance: [] }))).toThrow(/同じ長さの空でない配列/);
    expect(read((d) => (magOf(d)['on_hits'] = [0, 4]))).toThrow(/on_hits\[0\]（0）は 1 以上の整数（V-M1/);
    expect(read((d) => (magOf(d)['on_hits'] = [3, 3.5]))).toThrow(/on_hits\[1\]（3\.5）は 1 以上の整数/);
    expect(read((d) => (magOf(d)['on_hits'] = [4, 3]))).toThrow(/on_hits は昇順で重ならない（4・3）（V-M1/);
    expect(read((d) => (magOf(d)['on_hits'] = [3, 6]))).toThrow(/on_hits\[1\]（6）は torpedo_hits_to_sink（6）未満（沈む命中では引かない）（V-M1/);
    expect(read((d) => (magOf(d)['on_hits'] = [3, 5]))).not.toThrow();
    expect(read((d) => (magOf(d)['chance'] = [0.03, 1]))).toThrow(/chance\[1\]（1）は 0 以上 1 未満（V-M1/);
    expect(read((d) => (magOf(d)['chance'] = [-0.01, 0.06]))).toThrow(/chance\[0\]（-0\.01）は 0 以上 1 未満/);
    expect(read((d) => (magOf(d)['chance'] = [0, 0.999]))).not.toThrow();
    expect(read((d) => (magOf(d)['source'] = ' '))).toThrow(/source は空でない文字列（V-M1/);
    expect(read((d) => (recOf(d, 'ijn_battleship_fuso')['magazine'] = [3, 4]))).toThrow(/magazine: object でない（V-M1/);
  });
  it('V-M2: AI の記録だけ（列の艦として動く記録）・V-M3: ship_class が battleship の記録だけ（大和型には置かない＝ユーザーの例外）', () => {
    const put = (id: string, f: (r: Rec) => void = () => undefined) => (d: GameData): void => {
      const r = recOf(d, id);
      r['magazine'] = { ...magOf(d) };
      f(r);
    };
    const six = (r: Rec): void => {
      r['torpedo_hits_to_sink'] = 6;
    };
    expect(read(put('ijn_cruiser_mogami', six), 'ijn_cruiser_mogami')).toThrow(/enemies\.json の ijn_cruiser_mogami\.magazine: magazine は ship_class が battleship の記録だけ（heavy_cruiser。大和型には置かない）（V-M3/);
    expect(read(put('ijn_destroyer', six), 'ijn_destroyer')).toThrow(/magazine は ship_class が battleship の記録だけ（なし。大和型には置かない）（V-M3/);
    expect(read(put('ijn_destroyer_mutsuki', six), 'ijn_destroyer_mutsuki')).toThrow(/magazine は AI の記録（.*）だけ（V-M2/);
    const d = clone();
    put('ijn_cruiser_mogami', six)(d);
    expect(() => validateMagazineRecords(d)).toThrow(/ijn_cruiser_mogami\.magazine: .*（V-M3/);
  });
});
