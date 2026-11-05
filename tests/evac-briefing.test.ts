// v0.6.11 S6（spec-v0611-r2 §10.5・r2 M11・§13 の S6）: 空襲下の退避（jp_03）の Briefing。行は足さず、今の 6 行（目的・成功・月→時・敵・危険・条件）＋史実の中身だけを
// BriefingNumbers の任意の鍵（core/evac-briefing。systems/briefing-numbers が WorldSetup の evac から）で差し替える。隠れ場所は 4（壕 3 ＋ 陰 1。S3b で陰（西）を外した）、
// 波と編隊の数は data から（ユーザーの U5）、もう一度来る編隊（S3b の U7）は条件の行の 2 行目に入る長さで。行の数（1 字の余白でも＝tests/wrap-kit）と下端 ≤ 584 − 8、
// jp_03 の文（ノーマル・ハード）に「夜明け」なし、ほかの 8 任務の文は v0.6.10（88c9f19）の式とバイト同一。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { enemyNameJa, getBriefingRecord, riskLabelJa } from '../src/config/briefing-data';
import { playableMissionIds } from '../src/config/campaign-data';
import { gameData } from '../src/config/game-data';
import { RAID_EVENT_ID, directSortie } from '../src/core/sortie';
import { absentJa, briefingRows, compassJa, enemyCountsJa, hazardsJa, moonLabelJa, type BriefingNumbers, type BriefingText } from '../src/core/briefing';
import { EVAC_FUEL_NOTE_JA, EVAC_RAID_HAZARD_JA, EVAC_REPASS_JA, EVAC_SUCCESS_TAIL_JA, EVAC_WEAPON_JA, evacDayRowJa, evacEnemyRowJa } from '../src/core/evac-briefing';
import { SHELTER_CAVE } from '../src/core/evac-data';
import { briefingNumbers, buildWorldSetup } from '../src/systems/world-setup';
import { BRIEF_NOTE_PX, BRIEF_ROW_PX, BRIEF_WRAP, phaserWrap } from './wrap-kit';

type Rec = Record<string, unknown>;
const NBSP = ' ';
const M = (gameData.missionsSeed.missions as unknown as Rec[]).find((m) => m['id'] === 'jp_03')!;
const PROTO = M['v0_1_prototype'] as Rec;
const HARD = PROTO['hard'] as Rec;
const AIM = '見越し点マーカー（テスト）';

const recOf = (id: string, hard: boolean, seed = 1): { rec: BriefingText; n: BriefingNumbers } => {
  const s = buildWorldSetup(gameData, id, { hard, sortie: directSortie(id, seed, 'none', hard, false) });
  return { rec: { ...getBriefingRecord(gameData, id, hard), hazardIds: s.hazardsTonight, absentHazardIds: s.absentHazards }, n: briefingNumbers(s, AIM) };
};
const rowsOf = (id: string, hard: boolean, seed = 1): { label: string; text: string }[] => {
  const { rec, n } = recOf(id, hard, seed);
  return briefingRows(rec, n, (e) => enemyNameJa(gameData, e), (h) => riskLabelJa(gameData, h));
};

describe('jp_03 の 6 行と史実（ノーマル・ハード）', () => {
  it('行の文: 目的・成功（空襲が去る時に隊を壕か陰へ）・時（昼。壕 3 と陰 1）・敵（東から・4 波・同時の編隊）・危険（昼の言い方）・条件（空襲が去るまで・燃料は減らない・機銃は僚艇も・もう一度来る編隊）', () => {
    for (const hard of [false, true]) {
      const f = hard ? 3 : 2;
      expect(rowsOf('jp_03', hard)).toEqual([
        { label: '目的', text: '空襲の下、3隻ずつ6つの隊を壕や陰へ隠せ（スティックで隊長艇、［切替］で隊を替える）' },
        { label: '成功', text: '18隻中6隻以上を残す（史実は5隻）（空襲が去る時に操作中の隊を壕か陰へ）' },
        { label: '時', text: '昼（07:00 空襲警報） ・ 壕 3 と陰 1 の外の艇は見える ・ 陰は見つかることがある' },
        { label: '敵', text: `米艦載機（東から） ・ 4波（2機の編隊が${f}つ同時 → 3機×${f} → 3機×${f} → 4機×${f}）` },
        { label: '危険', text: '港の空襲（予告の後、編隊が別々の隊を狙う）、空襲が去った後の追撃（敵機 4 機）' },
        { label: '条件', text: `空襲が去るまで 240 秒 ・ 燃料 16 gal（空襲の間は減らない） ・${NBSP}機銃は僚艇も撃つ（機にまず当たらない） ・${NBSP}編隊は次の波までに間があればもう一度来る` },
      ]);
    }
  });
  it('数は data から: 隠れ場所の種類（S3b で陰（西）を外した＝壕 3・陰 1）・波の機数と同時の編隊（U5）・240 秒・16 gal・§2 の 4 機・東 70°。passes_max 1 なら最後の句は出ない', () => {
    const s = buildWorldSetup(gameData, 'jp_03');
    const ev = s.evac!;
    expect(ev.params.shelters.length).toBe(4);
    expect(ev.params.shelters.filter((x) => x.kind === SHELTER_CAVE).length).toBe(3);
    expect(ev.params.shelters.map((x) => x.labelJa)).not.toContain('屋我地の陰（西）');
    expect(evacDayRowJa(ev.params)).toBe('壕 3 と陰 1 の外の艇は見える ・ 陰は見つかることがある');
    expect(evacDayRowJa({ shelters: ev.params.shelters.filter((x) => x.kind === SHELTER_CAVE) })).toBe('壕 3 の外の艇は見える');
    expect(evacEnemyRowJa({ waves: [{ announceS: 0, planes: 2 }, { announceS: 0, planes: 4 }], flights: 3 })).toBe('2波（2機の編隊が3つ同時 → 4機×3）');
    expect([s.durationS, s.fuelAllotmentGal, s.mission.dawnStrike!.count, ev.raid.fromBearingDeg, ev.raid.passesMax]).toEqual([240, 16, 4, 70, 2]);
    const one = briefingNumbers({ ...s, evac: { ...ev, raid: { ...ev.raid, passesMax: 1 } } });
    expect('repassJa' in one).toBe(false);
    const n = briefingNumbers(s, AIM);
    expect([n.successTailJa, n.fuelNoteJa, n.weaponJa, n.repassJa]).toEqual([EVAC_SUCCESS_TAIL_JA, EVAC_FUEL_NOTE_JA, EVAC_WEAPON_JA, EVAC_REPASS_JA]);
    // 見越し点マーカーは出さない（狙う艦が無い）
    expect('aimAssistJa' in n).toBe(false);
  });
  it('成功の数は data の evac_raid（ノルマ 6・18 隻・史実 5）と同じ。危険の港の空襲の名は risk_events の label_ja の全文（夜明けの空襲の label_ja は変えない）', () => {
    const r = PROTO['evac_raid'] as Rec;
    const want = `${r['survivors_total']}隻中${r['survivor_quota']}隻以上を残す（史実は${r['historical_survivors']}隻）`;
    expect([M['success'], HARD['success_ja']]).toEqual([want, want]);
    const ev = (gameData.riskEvents.events as unknown as Rec[]).find((e) => e['id'] === 'unten_air_raid')!;
    expect(ev['label_ja']).toBe(EVAC_RAID_HAZARD_JA);
    expect(riskLabelJa(gameData, 'dawn_air_strike')).toBe('夜明けの空襲');
    // 目的のボタンの名は HUD の［切替］と同じ字
    expect(String(M['objective'])).toContain('［切替］');
  });
  it('行の数（24 px・1,056 px。1 字の余白でも）: 目的 1・成功 1・時 1・敵 1・危険 1・条件 2、史実 3（20 px）。行の頭に「、」「。」「）」「・」が来ない（史実の幅 1,020〜1,070 px のどれでも）', () => {
    for (const hard of [false, true]) {
      const r = rowsOf('jp_03', hard).map((x) => x.text);
      for (const W of [BRIEF_WRAP, BRIEF_WRAP - BRIEF_ROW_PX]) expect(r.map((t) => phaserWrap(t, BRIEF_ROW_PX, W).length), `${hard} ${W}`).toEqual([1, 1, 1, 1, 1, 2]);
      // 条件の 2 行目はもう一度来る編隊の句まで（3 行目へ送らない）
      expect(phaserWrap(r[5]!)[1]).toBe(`・${NBSP}機銃は僚艇も撃つ（機にまず当たらない） ・${NBSP}編隊は次の波までに間があればもう一度来る`);
      const note = getBriefingRecord(gameData, 'jp_03', hard).noteJa;
      for (let W = 1020; W <= 1070; W++) {
        const l = phaserWrap(note, BRIEF_NOTE_PX, W);
        expect(l.length, `${hard} ${W}`).toBe(3);
        for (const x of l.slice(1)) expect(x, `${hard} ${W}`).not.toMatch(/^[、。）・]/);
      }
    }
  });
  it('下端 ≤ 出撃のボタンの上端 584 − 8（論理幅 1,280・1,584 で同じ置き方＝行の x・折り返し・ボタンの y は幅に依らない）。行の高さは字の大きさ × 1.25 で多めに（jp_04 で多めを確かめる）', () => {
    const lh = (px: number): number => Math.ceil(px * 1.25);
    const bottom = (rows: number[], note: number): number => 148 + rows.reduce((a, n) => a + n * lh(BRIEF_ROW_PX) + 10, 0) + 8 + note * lh(BRIEF_NOTE_PX);
    for (const hard of [false, true]) expect(bottom([1, 1, 1, 1, 1, 2], 3), String(hard)).toBeLessThanOrEqual(584 - 8);
    expect(bottom([1, 1, 1, 1, 1, 2], 3)).toBe(501);
    // jp_04（目的 2・成功 1・月 1・敵 1・危険 1・条件 3・史実 3）のヘッドレスの本当の下端は 549（v0.6.10 S7）＝この見積もりは多め
    expect(bottom([2, 1, 1, 1, 1, 3], 3)).toBeGreaterThanOrEqual(549);
    const menu = readFileSync(join(__dirname, '..', 'src', 'config', 'menu-config.ts'), 'utf8');
    for (const l of ['export const BRIEF_ROW_TOP = 148;', 'export const BRIEF_ROW_GAP = 10;', 'export const BRIEF_VALUE_X = 160;', 'export const BRIEF_VALUE_WRAP = 1056;', 'export const BRIEF_NOTE_GAP = 8;', 'export const BRIEF_SORTIE_H = 112;', 'export const BRIEF_SORTIE_Y = GAME_HEIGHT - HUD_MARGIN - BRIEF_SORTIE_H;']) expect(menu, l).toContain(l);
  });
  it('「夜明け」なし・外した陰（西）なし・人物名なし（ノーマル・ハード・seed 1〜5）。ハードの史実だけ同時の編隊の数も作りと言う', () => {
    for (const hard of [false, true]) {
      for (let seed = 1; seed <= 5; seed++) {
        const all = [...rowsOf('jp_03', hard, seed).map((x) => `${x.label} ${x.text}`), getBriefingRecord(gameData, 'jp_03', hard).noteJa].join('\n');
        expect(all, `${hard} ${seed}`).not.toContain('夜明け');
        expect(all).not.toContain('（西）');
        expect(all).not.toContain('帰投地点');
        expect(all).toContain('作り（史料に無い）');
      }
    }
    expect(String(HARD['note_ja'])).toContain('ハードは同時に3つ');
    expect(String(M['briefing_note_ja'])).not.toContain('ハード');
    expect([HARD['objective_ja'], HARD['success_ja']]).toEqual([M['objective'], M['success']]);
  });
});

/** v0.6.10（88c9f19）の briefingRows の式（core/briefing.ts L237–246 の写し。ほかの任務がバイト同一かを見る） */
function oldRows(t: BriefingText, n: BriefingNumbers, nameOf: (id: string) => string, labelOf: (id: string) => string): string[] {
  const gal = Number.isInteger(n.fuelGal) ? String(n.fuelGal) : n.fuelGal.toFixed(1);
  const sec = n.secondaryJa ? ` ・${NBSP}${n.secondaryJa}` : '';
  const weapon = n.weaponJa !== undefined ? `・${NBSP}${n.weaponJa}${sec}` : `・ ${n.gunsLabel ? `砲${NBSP}${n.gunsLabel}` : `魚雷 ${n.torpedoes} 本`}${sec}`;
  return [
    `目的|${t.objective}`,
    `成功|${t.success}（帰投地点は${n.homeFromJa ?? compassJa(n.homeX, n.homeY, n.boundsW, n.boundsH)}の青い輪）`,
    `月|${t.moonLabelJa ?? moonLabelJa(t.moon)} ・ 見える ${Math.round(n.visM)} m ・ ${n.airDetectJa ?? `見つかる 巡航 ${Math.round(n.detectCruiseM)} m／静音 ${Math.round(n.detectSilentM)} m`}`,
    `敵|${enemyCountsJa(t.enemyIds, nameOf)}${n.enemyFromJa ? `（${n.enemyFromJa}から）` : ''}${n.allyJa ? ` ・${NBSP}${n.allyJa}` : ''}`,
    `危険|${hazardsJa(t.hazardIds, labelOf, [RAID_EVENT_ID])}${absentJa(t.absentHazardIds ?? [], labelOf)}`,
    `条件|夜明けまで ${Math.round(n.durationS)} 秒${n.dawnJa} ・ 燃料 ${gal} gal ${weapon}${n.aimAssistJa ? ` ・ ${n.aimAssistJa}` : ''}${n.landingJa ? ` ・${NBSP}${n.landingJa}` : ''}`,
  ];
}

describe('ほかの 8 任務の Briefing はバイト同一', () => {
  const others = [...playableMissionIds(gameData, 'us_pt'), ...playableMissionIds(gameData, 'jp_hard')].filter((id) => id !== 'jp_03');
  it('8 任務 × ノーマル・ハード × seed 1〜4（今夜の揺らぎ・見越し点の句あり）で v0.6.10 の式と同じ文。evac の鍵は 1 つも出ない', () => {
    expect(others).toEqual(['us_01', 'us_02', 'us_03', 'jp_01', 'jp_02', 'jp_04', 'jp_05', 'jp_06']);
    const keys = ['successTailJa', 'dayRowJa', 'enemyRowJa', 'clockJa', 'fuelNoteJa', 'repassJa', 'hazardLabelsJa'];
    for (const id of others) {
      for (const hard of [false, true]) {
        for (let seed = 1; seed <= 4; seed++) {
          const { rec, n } = recOf(id, hard, seed);
          for (const k of keys) expect(k in n, `${id} ${k}`).toBe(false);
          const nameOf = (e: string): string => enemyNameJa(gameData, e);
          const labelOf = (h: string): string => riskLabelJa(gameData, h);
          expect(briefingRows(rec, n, nameOf, labelOf).map((r) => `${r.label}|${r.text}`), `${id} ${hard} ${seed}`).toEqual(oldRows(rec, n, nameOf, labelOf));
        }
      }
    }
  });
});
