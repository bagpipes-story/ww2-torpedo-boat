// jp_01 のハード（v0.6.6「日本ハードモード⑤：隼艇」。spec-v066 §B.6・§C.6・§D.6・§G）: Title の「難易度: ハード」だけ。米PT 3 隻（3 本目の哨戒線）・3 隻とも上陸で達成・ハードの Briefing の文。
// ノーマルの jp_01 は 1 ビットも変えない（tests/jp01-mission・tests/setup-neutral-pt の pin）。隼艇（hard.gunboat）は S2 から。
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { gameData, getPrototypeMission, getScoringParams } from '../src/config/game-data';
import { enemyNameJa, getBriefingRecord, riskLabelJa } from '../src/config/briefing-data';
import { getConvoyParams } from '../src/config/convoy-mission-data';
import { hasHardVariant } from '../src/config/mission-data';
import { convoyStartClearM, getPtParams, nearestStartM } from '../src/config/pt-mission-data';
import { briefingRows, difficultyJa } from '../src/core/briefing';
import { convoyObjectiveDone } from '../src/core/mission-flow';
import { PT_ALERT, createPtSection, stepPtSection, type PtCheck, type PtEvents } from '../src/core/pt-boats';
import { SeededRng } from '../src/core/rng';
import { computeScore, type ScoreInput } from '../src/core/scoring';
import { directSortie } from '../src/core/sortie';
import { briefingNumbers, buildWorldSetup } from '../src/systems/world-setup';
import { convoyResultLine } from '../src/ui/convoy-lines';
import { PERSON_DENYLIST, RANK_RE } from './person-denylist';
import { textWidthPx } from './pt-ui-kit';

type Rec = Record<string, unknown>;
type Data = typeof gameData;
const clone = (): Data => JSON.parse(JSON.stringify(gameData)) as Data;
const protoOf = (d: Data, id: string): Rec => (d.missionsSeed.missions as unknown as Rec[]).find((m) => m['id'] === id)!['v0_1_prototype'] as Rec;
const hardOf = (d: Data): Rec => protoOf(d, 'jp_01')['hard'] as Rec;
const sortie = (seed: number): ReturnType<typeof directSortie> => directSortie('jp_01', seed, 'none', true, false);
const H = buildWorldSetup(gameData, 'jp_01', { hard: true });
const N = buildWorldSetup(gameData, 'jp_01');
const EXCERPT = 'WebSearch の抜粋のみ・本文未読';
// 自艇の仕事（寄って撃ち返す・赤い線は転舵）を残し、西へ向くと海側になる「岸側」は言わない（レビュー ux:ux-3）
const OBJECTIVE = '大発3隻を浜まで護衛する。隼艇が後ろに付き、大発・隼艇を襲うPTと追ってくるPTを撃つ。大発が狙われたら自艇も寄って撃ち返し、赤い線は全速で転舵';
const SUCCESS = '大発3隻とも浜に届けて帰投。1隻でも失えば達成の点は無い';
const NOTE =
  '1942年12月、ガダルカナル島北岸では月明かりの夜の大発の輸送が米PTと夜間機に阻まれ、計画の半分も運べなかった。12月9日夜にはPT-44とPT-59がカミンボ沖で大発を襲った。魚雷艇や隼艇が大発を護衛してPTと戦った記録は見つかっておらず、この夜はゲーム上の想定（艇は1944年のT-38、隼艇は1943〜44年のH-38で代用）。';

/** 記録の中の文字列をすべて集める */
function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) for (const x of v) strings(x, out);
  else if (typeof v === 'object' && v !== null) for (const x of Object.values(v as Rec)) strings(x, out);
  return out;
}

describe('jp_01 のハードの data（v0_1_prototype.hard。v0.6.6）', () => {
  it('3 本目の哨戒線（今の 2 本の 200 m 北・同じ東西 1,200 m）・ノルマ 3・目的／成功／史実メモの原文。source は design (v0.6.6 で、史料は抜粋の注と確度・人物名なし・「ソロモンに隼艇はいない」と言い切らない', () => {
    const h = hardOf(gameData);
    expect(h['extra_pt_legs_m']).toEqual([[4100, 1800, 2900, 1800]]);
    expect(h['convoy_arrive_quota']).toBe(3);
    expect([h['objective_ja'], h['success_ja'], h['note_ja']]).toEqual([OBJECTIVE, SUCCESS, NOTE]);
    const src = String(h['source']);
    expect(src.startsWith('design (v0.6.6。難易度ハード＝米PT 3 隻＋隼艇（H-38）の僚艇＋3 隻とも上陸')).toBe(true);
    expect(src).toContain('1.5 + 2 × 3 = 7.5 秒');
    expect(src).toContain('1,758 m ≥ 史実モードの巡航で見つかる 1,560 m');
    expect(src).toContain(`ja.wikipedia 隼艇。${EXCERPT}。high`);
    expect(src).toContain('抜粋に見つからない（medium。無いことの証拠ではない）');
    expect(src).toContain('模擬の値は CHANGELOG v0.6.6'); // repo に無い仕様の名を source に書かない（v0.6.5 レビュー F2）
    // ×1.0 の主張は本物の模擬（HARD=1 GB_FACTOR=1）で測った自艇の沈没だけ。引き受けた攻撃の割合は試作（撃たれ強い PT と組んだ形）の値なので書かない（レビュー data:D3）
    expect(src).toContain('1.0 倍だと隼艇が攻撃を多く引き受け、戦う遊び方はみなハードのほうが自艇が沈みにくかった（撃つだけで追う 3.5% 対 ノーマル 24.5% など＝模擬の値は CHANGELOG v0.6.6）');
    expect(src).not.toMatch(/\d+〜\d+% を引き受け/);
    expect(src).not.toMatch(/ソロモンに隼艇はいない|隼艇はいない/);
    for (const t of strings(h)) {
      for (const name of PERSON_DENYLIST) expect(t, name).not.toContain(name);
      expect(t).not.toMatch(RANK_RE);
    }
    // 和文に半角スペースなし・数字の後に mm を続けない（Phaser の折り返し。tests/jp01-mission と同じ作法）
    for (const t of [OBJECTIVE, SUCCESS, NOTE]) {
      expect(t, t).not.toContain(' ');
      expect(t, t).not.toMatch(/\dmm/);
    }
    // ノーマルの文・米PT・輸送隊の data は 1 文字も変えない
    const m = (gameData.missionsSeed.missions as unknown as Rec[]).find((x) => x['id'] === 'jp_01')!;
    expect(m['enemies']).toEqual(['us_pt_enemy', 'us_pt_enemy']);
    expect((protoOf(gameData, 'jp_01')['pt_boats'] as Rec)['legs_m']).toEqual([[4100, 2000, 2900, 2000], [4100, 2200, 2900, 2200]]);
    expect((protoOf(gameData, 'jp_01')['convoy'] as Rec)['arrive_quota']).toBe(2);
  });
  it('読み出し（getPrototypeMission）: ハードだけ哨戒線を後ろに足し（米PT 3 隻）・ノルマを 3 に置き換えた写し。ノーマルは 2 隻・ノルマ 2。PrototypeMission の鍵は増えない・data の配列は触らない', () => {
    const n = getPrototypeMission(gameData, 'jp_01');
    const h = getPrototypeMission(gameData, 'jp_01', true);
    expect([n.enemyCount, n.ptBoats!.legs_m.length, n.convoy!.arrive_quota, n.hard]).toEqual([2, 2, 2, false]);
    expect([h.enemyCount, h.ptBoats!.legs_m.length, h.convoy!.arrive_quota, h.hard]).toEqual([3, 3, 3, true]);
    expect(h.ptBoats!.legs_m).toEqual([[4100, 2000, 2900, 2000], [4100, 2200, 2900, 2200], [4100, 1800, 2900, 1800]]);
    expect(Object.keys(h).sort()).toEqual(Object.keys(n).sort());
    expect(Object.keys(h.ptBoats!).sort()).toEqual(Object.keys(n.ptBoats!).sort());
    expect(Object.keys(h.convoy!).sort()).toEqual(Object.keys(n.convoy!).sort());
    expect(h.ptBoats!.legs_m).not.toBe((protoOf(gameData, 'jp_01')['pt_boats'] as Rec)['legs_m']);
    expect(h.ptBoats!.legs_m[2]).not.toBe((hardOf(gameData)['extra_pt_legs_m'] as number[][])[0]);
    expect(getPrototypeMission(gameData, 'jp_01').ptBoats!.legs_m.length).toBe(2); // 組み立てても data は 2 本のまま
    expect([hasHardVariant(gameData, 'jp_01'), difficultyJa(true, hasHardVariant(gameData, 'jp_01'))]).toEqual([true, ' ・ 難易度 ハード']); // 「（この任務は同じ）」が消える
  });
});

describe('jp_01 のハードの世界（米PT 3 隻・ノルマ 3）', () => {
  afterEach(() => vi.restoreAllMocks());
  it('米PT 3 隻（3 本目も西向きに出発）・3 隻目の警戒の遅れは reaction_delay_s + 2 × wingman_delay_s = 7.5 秒（1 隻目の 6 秒後・2 隻目の 3 秒後）・輸送隊のノルマ 3（隻数・HP・浜はノーマルと同じ）', () => {
    const p = H.ptBoats!;
    expect(p.count).toBe(3);
    expect(Array.from(p.legs)).toEqual([4100, 2000, 2900, 2000, 4100, 2200, 2900, 2200, 4100, 1800, 2900, 1800]);
    expect(Array.from(p.startHeadingDeg)).toEqual([270, 270, 270]);
    expect([p.reactionDelayS, p.wingmanDelayS, p.reactionDelayS + 2 * p.wingmanDelayS]).toEqual([1.5, 3, 7.5]);
    expect(readFileSync('src/core/pt-boats.ts', 'utf8')).toContain('b.timerS = p.reactionDelayS + i * p.wingmanDelayS;'); // 隻目 i の遅れの式（core は変えない）
    // core を 1 ステップ回す（レビュー data:D7）: 隊が捉えたステップに 3 隻とも警戒へ入り、遅れは 1.5・4.5・7.5 秒（3 隻目は 1 隻目の 6 秒後）
    const q = createPtSection(p, 24);
    const chk: PtCheck = { boat: { x: p.startX[0]!, y: p.startY[0]! + 50, headingDeg: 90, speedMps: 0 }, boatHalfLengthM: 9, boatHalfBeamM: 2, detectOpenM: 1e6, smokeFactor: 1, smoke: null, smokeParams: null, targetValid: true, visRange2: 1e12, dawn: false, timeS: p.detectFromS };
    const ev: PtEvents = { onContact: () => {}, onCommit: () => {}, onFire: () => {}, onImpact: () => {}, onPassEnd: () => {}, onLeave: () => {}, onOut: () => {} };
    stepPtSection(q, p, chk, new SeededRng(1), 1 / 60, 5 / 60, ev);
    expect([q.detected, ...q.boats.map((b) => b.phase)]).toEqual([true, PT_ALERT, PT_ALERT, PT_ALERT]);
    expect(q.boats.map((b) => b.timerS)).toEqual([1.5, 4.5, 7.5]);
    expect(N.ptBoats!.count).toBe(2);
    const c = H.convoy!.params;
    expect(c.quota).toBe(3);
    expect(N.convoy!.params.quota).toBe(2);
    expect({ ...c, quota: 2 }).toEqual(N.convoy!.params);
    // 米PT の 1 隻目の出発点（Briefing の「東から」）・自艇・砲・夜明けはノーマルと同じ
    expect([H.enemyFrom, H.playerStart, H.guns, H.durationS, H.fuelAllotmentGal]).toEqual([N.enemyFrom, N.playerStart, N.guns, N.durationS, N.fuelAllotmentGal]);
    expect([H.hard, N.hard]).toEqual([true, false]);
  });
  it('今夜（seed+16）はハードでも 5 回（米PT の隊は隊ごと 1 件）。3 本目の出発点から自艇まで ≥ 1,560 m（揺らぎ込みの最短 1,758 m）・船団から ≥ 780 m', () => {
    const spy = vi.spyOn(SeededRng.prototype, 'next');
    buildWorldSetup(gameData, 'jp_01', { sortie: sortie(1), hard: true });
    expect(spy.mock.calls.length).toBe(5);
    spy.mockRestore();
    const p = H.ptBoats!;
    const night = H.mission.night;
    const third = nearestStartM({ ...p, count: 1, legs: p.legs.subarray(8, 12) }, night, H.playerStart.x, H.playerStart.y);
    expect(Math.abs(third - 1758)).toBeLessThanOrEqual(1);
    expect(nearestStartM(p, night, H.playerStart.x, H.playerStart.y)).toBeGreaterThanOrEqual(1560);
    expect(convoyStartClearM(p, H.mission)).toBeGreaterThanOrEqual(780);
    let minThirdM = Infinity;
    for (let seed = 1; seed <= 300; seed++) {
      const s = buildWorldSetup(gameData, 'jp_01', { sortie: sortie(seed), hard: true });
      expect([s.ptBoats!.count, s.night.mirrored, s.convoy!.params.quota], `${seed}`).toEqual([3, false, 3]);
      minThirdM = Math.min(minThirdM, Math.hypot(s.ptBoats!.startX[2]! - s.playerStart.x, s.ptBoats!.startY[2]! - s.playerStart.y));
    }
    expect(minThirdM).toBeGreaterThanOrEqual(1758);
  });
  it('達成（Result の objectiveDone）はノルマ 3: 帰投して 3 隻とも上陸。2/3 で帰投しても達成でない。得点の順は 3/3 帰投 ＞ 2/3 帰投（達成なし）＞ 1/3 帰投 ＞ 0/3 帰投 ＞ 3/3 届けて沈没', () => {
    const q = H.convoy!.params.quota;
    const done = (reason: Parameters<typeof convoyObjectiveDone>[0], arrived: number): boolean => convoyObjectiveDone(reason, arrived, q);
    expect([done('returned', 3), done('returned', 2), done('cleared', 3), done('pt_fire', 3)]).toEqual([true, false, true, false]);
    const base: ScoreInput = { returned: true, objectiveDone: true, missionType: 'escort_convoy', bands: [], kills: 0, killEnemyId: 'us_pt_enemy', fuelLeftPct: 58, crewAlive: 7, crewTotal: 7, detections: 1, afterDawn: false };
    const p = getScoringParams(gameData);
    const s = (arrivals: number, returned: boolean): number => computeScore({ ...base, arrivals, returned, objectiveDone: convoyObjectiveDone(returned ? 'returned' : 'pt_fire', arrivals, q), ...(returned ? {} : { kills: 2, crewAlive: 0 }) }, p).total;
    const order = [s(3, true), s(2, true), s(1, true), s(0, true), s(3, false)];
    expect(order).toEqual([1458, 900, 800, 700, 580]);
    for (let i = 1; i < order.length; i++) expect(order[i - 1]!).toBeGreaterThan(order[i]!);
  });
  it('Result の輸送隊の 1 行目（ハードだけ）: ノルマを上陸の後ろに達成／未達で（「沈没 1（ノルマ 3）」が沈んでよい数に読めた。レビュー ux:ux-7）。verdict を渡さなければノーマルの行のまま。24 px で 1 行', () => {
    const c = { total: 3, arrived: 2, sunk: 1, quota: H.convoy!.params.quota, hitsTaken: 3 };
    expect(convoyResultLine(c, false)).toBe('大発 上陸 2/3（ノルマ 3 ・ 未達） ・ 沈没 1 ・ 大発の被弾 3 発');
    expect(convoyResultLine({ ...c, arrived: 3, sunk: 0, hitsTaken: 0 }, true)).toBe('大発 上陸 3/3（ノルマ 3 ・ 達成） ・ 沈没 0 ・ 大発の被弾 0 発');
    expect(convoyResultLine({ ...c, arrived: 1, sunk: 0 }, false)).toBe('大発 上陸 1/3（ノルマ 3 ・ 未達） ・ 沈没 0 ・ 大発の被弾 3 発 ・ 航行中 2');
    expect(convoyResultLine(c)).toBe('大発 上陸 2/3 ・ 沈没 1（ノルマ 3） ・ 大発の被弾 3 発');
    const worst = convoyResultLine({ total: 3, arrived: 0, sunk: 1, quota: 3, hitsTaken: 99 }, false);
    expect(textWidthPx(worst, 24), worst).toBeLessThanOrEqual(1280 - 2 * 24);
    // result-scene はハードの違いのある任務のハードだけ objectiveDone を渡す（見出しの「（ハード）」と同じ条件）
    const rs = readFileSync('src/scenes/result-scene.ts', 'utf8');
    expect(rs).toContain('const hardV = r.sortie.hard && hasHardVariant(getGameData(this.registry, REGISTRY_KEY_DATA), r.sortie.missionId);');
    expect(rs).toContain('convoyResultLine(r.convoy, hardV ? r.objectiveDone : undefined)');
  });
  it('Result の輸送隊の 1 行目（ハード）: 3 隻とも上陸したのに帰投しなかった夜（沈没・漂流）は「未達」ではなく「帰投なし」（v0.6.6 最終確認: 「上陸 3/3（ノルマ 3 ・ 未達）」が食い違って読めた）。24 px で 1 行', () => {
    const q = H.convoy!.params.quota;
    const done = (reason: 'returned' | 'pt_fire' | 'adrift', arrived: number): string => convoyResultLine({ total: 3, arrived, sunk: 3 - arrived, quota: q, hitsTaken: 2 }, convoyObjectiveDone(reason, arrived, q));
    expect(done('pt_fire', 3)).toBe('大発 上陸 3/3（ノルマ 3 ・ 帰投なし） ・ 沈没 0 ・ 大発の被弾 2 発');
    expect(done('adrift', 3)).toBe('大発 上陸 3/3（ノルマ 3 ・ 帰投なし） ・ 沈没 0 ・ 大発の被弾 2 発');
    expect(done('returned', 3)).toBe('大発 上陸 3/3（ノルマ 3 ・ 達成） ・ 沈没 0 ・ 大発の被弾 2 発');
    expect(done('pt_fire', 2)).toBe('大発 上陸 2/3（ノルマ 3 ・ 未達） ・ 沈没 1 ・ 大発の被弾 2 発'); // ノルマに届かなければ帰投の有無に関わらず未達
    expect(done('returned', 2)).toBe('大発 上陸 2/3（ノルマ 3 ・ 未達） ・ 沈没 1 ・ 大発の被弾 2 発');
    const worst = convoyResultLine({ total: 3, arrived: 3, sunk: 0, quota: q, hitsTaken: 99 }, false);
    expect(textWidthPx(worst, 24), worst).toBeLessThanOrEqual(1280 - 2 * 24);
  });
});

describe('jp_01 のハードの Briefing（spec-v066 §D.6）', () => {
  it('6 行: 目的・成功・史実メモはハードの文、敵は「米PTボート ×3（東から）」、月・危険・条件はノーマルと同じ。幅（24 px・1 行 1,056 px）: 目的は 2 行、成功は「（帰投地点は東の青い輪）」込みで 1 行、史実メモは jp_05 のメモ以下', () => {
    const nameOf = (e: string): string => enemyNameJa(gameData, e);
    const labelOf = (h: string): string => riskLabelJa(gameData, h);
    const rows = (s: typeof H, hard: boolean): { label: string; text: string }[] => briefingRows({ ...getBriefingRecord(gameData, 'jp_01', hard), hazardIds: s.hazardsTonight, absentHazardIds: s.absentHazards }, briefingNumbers(s), nameOf, labelOf);
    const h = rows(H, true);
    const n = rows(N, false);
    expect(h.map((r) => r.label)).toEqual(['目的', '成功', '月', '敵', '危険', '条件']);
    expect(h[0]!.text).toBe(OBJECTIVE);
    expect(h[1]!.text).toBe(`${SUCCESS}（帰投地点は東の青い輪）`);
    expect(h[3]!.text).toBe('米PTボート ×3（東から）');
    expect(n[3]!.text).toBe('米PTボート ×2（東から）');
    for (const i of [2, 4, 5]) expect(h[i], h[i]!.label).toEqual(n[i]);
    const hb = getBriefingRecord(gameData, 'jp_01', true);
    const nb = getBriefingRecord(gameData, 'jp_01');
    expect(hb.noteJa).toBe(NOTE);
    expect([nb.objective, nb.success]).toEqual([String((gameData.missionsSeed.missions as unknown as Rec[]).find((x) => x['id'] === 'jp_01')!['objective']), '大発2隻以上を浜に届けて帰投。3隻なら上陸の点が増える']);
    expect([hb.titleJa, hb.date, hb.place, hb.moon]).toEqual([nb.titleJa, nb.date, nb.place, nb.moon]);
    const WRAP = 1056;
    expect(textWidthPx(h[0]!.text, 24)).toBeGreaterThan(WRAP);
    expect(textWidthPx(h[0]!.text, 24)).toBeLessThanOrEqual(1.9 * WRAP);
    expect(textWidthPx(h[1]!.text, 24)).toBeLessThanOrEqual(WRAP);
    expect(textWidthPx(h[3]!.text, 24)).toBeLessThanOrEqual(WRAP);
    expect(textWidthPx(hb.noteJa, 24)).toBeLessThanOrEqual(textWidthPx(getBriefingRecord(gameData, 'jp_05').noteJa, 24));
  });
});

describe('jp_01 のハードの data の検査（壊れた写しは起動時に例外。鍵は hard が偽でも検査する）', () => {
  const breaks: [string, (d: Data) => void, RegExp][] = [
    ['extra_pt_legs_m が空', (d) => (hardOf(d)['extra_pt_legs_m'] = []), /extra_pt_legs_m は 4 つの数/],
    ['線の数が 3 つ', (d) => (hardOf(d)['extra_pt_legs_m'] = [[4100, 1800, 2900]]), /extra_pt_legs_m は 4 つの数/],
    ['線に文字', (d) => (hardOf(d)['extra_pt_legs_m'] = [[4100, 1800, 2900, '1800']]), /extra_pt_legs_m は 4 つの数/],
    ['ノルマ 0', (d) => (hardOf(d)['convoy_arrive_quota'] = 0), /convoy_arrive_quota は 1 以上の整数/],
    ['ノルマ 2.5', (d) => (hardOf(d)['convoy_arrive_quota'] = 2.5), /convoy_arrive_quota は 1 以上の整数/],
    ['成功の文が無い', (d) => delete hardOf(d)['success_ja'], /3 つとも空でない文字列か、3 つとも無い（success_ja/],
    ['史実メモが空', (d) => (hardOf(d)['note_ja'] = ''), /3 つとも空でない文字列か、3 つとも無い（note_ja/],
  ];
  it.each(breaks)('%s: ノーマルの読み出しでも例外', (_label, breakIt, re) => {
    const d = clone();
    breakIt(d);
    expect(() => getPrototypeMission(d, 'jp_01')).toThrow(re);
    expect(() => getPrototypeMission(d, 'jp_01', true)).toThrow(re);
  });
  it('置き場: 米PT の哨戒線は米PT の隊の任務だけ・ノルマは輸送隊の任務だけ（us_02・jp_05 に置くと例外）。文 3 つが無い hard block はノーマルの文のまま', () => {
    const a = clone();
    (protoOf(a, 'us_02')['hard'] as Rec)['extra_pt_legs_m'] = [[4100, 1800, 2900, 1800]];
    expect(() => getPrototypeMission(a, 'us_02')).toThrow(/extra_pt_legs_m は米PT の隊（pt_boats）の任務だけ/);
    const b = clone();
    protoOf(b, 'jp_05')['hard'] = { convoy_arrive_quota: 2, source: 'design (test)' };
    expect(() => getPrototypeMission(b, 'jp_05')).toThrow(/convoy_arrive_quota は輸送隊（convoy）の任務だけ/);
    const c = clone();
    for (const k of ['objective_ja', 'success_ja', 'note_ja']) delete hardOf(c)[k];
    expect(getBriefingRecord(c, 'jp_01', true).objective).toBe(getBriefingRecord(c, 'jp_01').objective);
    expect(getBriefingRecord(c, 'jp_01', true).noteJa).toBe(getBriefingRecord(c, 'jp_01').noteJa);
  });
  it('ハードの組み立てで今の検査が見る: ノルマ 4 は大発 3 隻を超える（convoy-data）・線を足して 5 隻は PT_MAX_COUNT 4 を超える（pt-data）・自艇に近い 3 本目は出発で見つかる（pt-mission-data）。ノーマルの組み立ては通る', () => {
    const ts = gameData.hitRateModel.world.time_scale;
    const q = clone();
    hardOf(q)['convoy_arrive_quota'] = 4;
    expect(() => getConvoyParams(q, getPrototypeMission(q, 'jp_01', true))).toThrow(/arrive_quota は 1〜3 の整数/);
    expect(getConvoyParams(q, getPrototypeMission(q, 'jp_01'))!.params.quota).toBe(2);
    const many = clone();
    hardOf(many)['extra_pt_legs_m'] = [[4100, 1800, 2900, 1800], [4100, 1600, 2900, 1600], [4100, 1400, 2900, 1400]];
    expect(() => getPtParams(many, getPrototypeMission(many, 'jp_01', true), ts)).toThrow(/legs_m は 5 本（enemies の数。1〜4）/);
    const near = clone();
    hardOf(near)['extra_pt_legs_m'] = [[2600, 2300, 1400, 2300]];
    expect(() => getPtParams(near, getPrototypeMission(near, 'jp_01', true), ts)).toThrow(/出発で見つかる/);
    expect(getPtParams(near, getPrototypeMission(near, 'jp_01'), ts)!.count).toBe(2);
  });
});
