// 達成の表示（v0.9.0 IP2。ユーザーの言葉 2026-11-27「各シナリオとも、終了時、終了後にクリアしたのかどうかがよくわかりません。」）と史実モードのカスタムの印（IP1）:
// - Title の行の印の文の規則（ui/achieved-texts）と 2 段への分け方・置き方（遊べる 13 任務の本当の行 × 全部の形 × 論理幅 1,280〜1,584 で題・副題・状態「出撃準備 →」に重ならない）
// - Result の見出しの頭の語（任務達成／任務未達）と「達成の条件: …」の文（13 任務 × ハード。Briefing の「成功」と同じ文・食い違う us_02・jp_06 だけ achieve_ja）
// - 配線（ソース）: 見出しの色・未達の 1 行・Title の印とタブの数・HUD の「［史実・カスタム］」・達成の形のビット・?debug&achieved
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  RESULT_ACHIEVED_JA,
  RESULT_NOT_ACHIEVED_JA,
  TITLE_ACHIEVED_GAP,
  TITLE_ACHIEVED_PAD_X,
  TITLE_ACHIEVED_PAD_Y,
  TITLE_ACHIEVED_PAD_Y_COMPACT,
  TITLE_ACHIEVED_PX,
  titleTabAchievedJa,
} from '../src/config/achieved-config';
import { getBriefingRecord, missionAchieveJa } from '../src/config/briefing-data';
import { getMenuEntries, playableMissionIds } from '../src/config/campaign-data';
import { gameData } from '../src/config/game-data';
import { hasHardVariant } from '../src/config/mission-data';
import { HUD_CUSTOM_BADGE_JA, HUD_HIST_CUSTOM_BADGE_JA, RESULT_CUSTOM_TAG_JA } from '../src/config/store-layout-config';
import { TITLE_ROW_STATUS_PX } from '../src/config/title-layout-config';
import { achievedVariantBit } from '../src/core/achieved-record';
import { sortieAchieved } from '../src/core/store';
import { achievedMarkJa, achievedMarkPiecesJa, titleMarkLayout } from '../src/ui/achieved-texts';
import { REASON_LABEL, RESULT_HISTORICAL_TAG_JA, resultConditionJa, resultHeadingJa } from '../src/ui/result-heading';
import { resultCustomTagJa } from '../src/ui/store-texts';
import { titleCompactOn, titleGridSubJa, titleRowLook, titleRowRect } from '../src/ui/title-grid';
import { textWidthPx } from './pt-ui-kit';

const src = (f: string): string => readFileSync(join(__dirname, '..', 'src', f), 'utf8');
const bit = (hard: boolean, historical: boolean, custom: boolean): number => achievedVariantBit({ hard, historical, custom });
const P = bit(false, false, false), H = bit(true, false, false), S = bit(false, true, false), HS = bit(true, true, false);
const C = bit(false, false, true), HC = bit(true, false, true), SC = bit(false, true, true), HSC = bit(true, true, true);

describe('Title の行の印の文（achievedMarkJa）', () => {
  it('達成・ハード・史実。その形がカスタムでだけなら「（カスタム）」', () => {
    expect(achievedMarkJa(0)).toBe('');
    expect(achievedMarkJa(P)).toBe('✓ 達成');
    expect(achievedMarkJa(P | H)).toBe('✓ 達成 ・ ハード');
    expect(achievedMarkJa(P | S)).toBe('✓ 達成 ・ 史実');
    expect(achievedMarkJa(P | H | S)).toBe('✓ 達成 ・ ハード ・ 史実');
    expect(achievedMarkJa(P | H | SC)).toBe('✓ 達成 ・ ハード ・ 史実（カスタム）'); // 史実でカスタムを使った表示（IP1）
    expect(achievedMarkJa(P | HC | SC)).toBe('✓ 達成 ・ ハード（カスタム） ・ 史実（カスタム）');
    expect(achievedMarkJa(P | HC | S)).toBe('✓ 達成 ・ ハード（カスタム） ・ 史実');
    expect(achievedMarkJa(H)).toBe('✓ 達成 ・ ハード'); // ハードだけで達成（ノーマルは未達）でも頭は「✓ 達成」
    expect(achievedMarkJa(HS)).toBe('✓ 達成 ・ ハード ・ 史実');
  });
  it('カスタムでしか達成していない任務は頭に「（カスタム）」（後ろの札には重ねない）', () => {
    expect(achievedMarkJa(C)).toBe('✓ 達成（カスタム）');
    expect(achievedMarkJa(C | HC)).toBe('✓ 達成（カスタム） ・ ハード');
    expect(achievedMarkJa(C | HC | SC)).toBe('✓ 達成（カスタム） ・ ハード ・ 史実');
    expect(achievedMarkJa(HSC)).toBe('✓ 達成（カスタム） ・ ハード ・ 史実');
    // デフォルトで 1 度でも達成していれば頭は素のまま・札ごとに付ける
    expect(achievedMarkJa(S | HC)).toBe('✓ 達成 ・ ハード（カスタム） ・ 史実');
  });
  it('255 通りの全部: 句は 1〜3 つ・「（カスタム）」は多くて 2 つ・1 行の文は句を「 ・ 」でつないだ物', () => {
    for (let m = 1; m <= 255; m++) {
      const pieces = achievedMarkPiecesJa(m);
      expect(pieces.length).toBeGreaterThanOrEqual(1);
      expect(pieces.length).toBeLessThanOrEqual(3);
      expect(pieces[0]!.startsWith('✓ 達成')).toBe(true);
      expect(achievedMarkJa(m)).toBe(pieces.join(' ・ '));
      expect(achievedMarkJa(m).split(RESULT_CUSTOM_TAG_JA).length - 1).toBeLessThanOrEqual(2);
    }
    expect(titleTabAchievedJa('選択中', 3, 7)).toBe('選択中 ・ 達成 3/7');
    expect(titleTabAchievedJa('タップで切替', 0, 6)).toBe('タップで切替 ・ 達成 0/6');
  });
});

/** config/menu-config の値（DOM を読む config なのでソースから読む） */
const menuConst = (name: string): number => Number(new RegExp(`export const ${name} = (\\d+);`).exec(src('config/menu-config.ts'))![1]);
const MENU_PAD_X = menuConst('MENU_PAD_X');
const WIDTHS: number[] = [];
for (let w = 1280; w <= 1584; w += 8) WIDTHS.push(w);
/** 印と状態の文の行の高さ（ヘッドレスの測り: 16 px の文は 19・24 px の状態は 29＝字の大きさ × 1.21 を切り上げ） */
const lineH = (px: number): number => Math.ceil(px * 1.21);

describe('Title の行の印の置き方（titleMarkLayout。本当の 13 行）', () => {
  const rows = (campaign: string) => {
    const es = getMenuEntries(gameData, campaign).entries;
    const look = titleRowLook(es.length);
    return es.map((e, i) => ({ e, i, n: es.length, look, title: textWidthPx(e.title, look.titlePx), sub: textWidthPx(titleGridSubJa(e.sub), look.subPx) }));
  };
  it('達成していない行は何も置かない（null）＝保存が空の端末の行は今のまま', () => {
    expect(titleMarkLayout(0, 600, 100, 100)).toBeNull();
  });
  it('どの任務・どの形・どの論理幅でも: 句は欠けず順のまま 2 段に分かれ、縮めは 0.8 以上、題・副題の右端から 16 空き、行の右 − 32 に収まる', () => {
    let worst = 1;
    let cases = 0;
    for (const campaign of ['us_pt', 'jp_hard']) {
      // 日本の艇に品は無い（カスタムの形は立たない）＝デフォルトの装備の 15 通り。米は 255 通り
      const masks = campaign === 'jp_hard' ? Array.from({ length: 15 }, (_, k) => k + 1) : Array.from({ length: 255 }, (_, k) => k + 1);
      for (const w of WIDTHS) {
        for (const r of rows(campaign)) {
          const rect = titleRowRect(r.i, r.n, w);
          const titleRight = rect.x + MENU_PAD_X + r.title;
          const subRight = rect.x + MENU_PAD_X + r.sub;
          for (const m of masks) {
            const l = titleMarkLayout(m, rect.x + rect.w, titleRight, subRight)!;
            cases++;
            expect([l.top, l.bottom].filter((x) => x !== '').join(' ・ '), `${r.e.id} ${m}`).toBe(achievedMarkJa(m));
            expect(l.top).not.toBe('');
            expect(l.topMaxW).toBeCloseTo(rect.x + rect.w - TITLE_ACHIEVED_PAD_X - titleRight - TITLE_ACHIEVED_GAP, 6);
            expect(l.bottomMaxW).toBeCloseTo(rect.x + rect.w - TITLE_ACHIEVED_PAD_X - subRight - TITLE_ACHIEVED_GAP, 6);
            const scale = Math.min(1, l.topMaxW / textWidthPx(l.top, TITLE_ACHIEVED_PX), l.bottom === '' ? 1 : l.bottomMaxW / textWidthPx(l.bottom, TITLE_ACHIEVED_PX));
            worst = Math.min(worst, scale);
            expect(scale, `${r.e.id} ${m} w ${w}: ${l.top} / ${l.bottom}`).toBeGreaterThanOrEqual(0.8);
          }
        }
      }
    }
    expect(cases).toBe(WIDTHS.length * (7 * 255 + 6 * 15));
    // いちばん狭いのは us_05（題 12 字）の「✓ 達成 ・ ハード（カスタム）」＋「史実（カスタム）」（上の段を 0.86 に縮める）
    expect(worst).toBeGreaterThanOrEqual(0.85);
    expect(worst).toBeLessThan(1);
  });
  it('収まる時は 1 段（上）。収まらなければ上に多く・下に残り（同じ縮めなら上に多い方）', () => {
    // 行の右 1000・題の右端 700 → 上の段 252 px。副題の右端 600 → 下の段 352 px
    expect(titleMarkLayout(P | H | S, 1000, 700, 600)).toMatchObject({ top: '✓ 達成 ・ ハード ・ 史実', bottom: '', topMaxW: 252, bottomMaxW: 352 });
    expect(titleMarkLayout(P | HC | SC, 1000, 700, 600)).toMatchObject({ top: '✓ 達成 ・ ハード（カスタム）', bottom: '史実（カスタム）' });
    // 上が狭い行（題が長い）は頭だけ上・札は下
    expect(titleMarkLayout(P | H | S, 1000, 880, 600)).toMatchObject({ top: '✓ 達成', bottom: 'ハード ・ 史実' });
    // 幅が負になる行でも投げない（0 に丸める）
    expect(titleMarkLayout(P, 100, 400, 400)).toMatchObject({ top: '✓ 達成', topMaxW: 0, bottomMaxW: 0 });
  });
  it('縦: 上の段は状態の文「出撃準備 →」（行の中央・24 px）の上、下の段はその下に収まる（詰めた行 76・今の行 96）', () => {
    for (const n of [6, 7]) {
      const look = titleRowLook(n);
      const pad = titleCompactOn(n) ? TITLE_ACHIEVED_PAD_Y_COMPACT : TITLE_ACHIEVED_PAD_Y;
      const statusTop = look.h / 2 - lineH(TITLE_ROW_STATUS_PX) / 2;
      const statusBottom = look.h / 2 + lineH(TITLE_ROW_STATUS_PX) / 2;
      expect(pad + lineH(TITLE_ACHIEVED_PX), `n ${n}`).toBeLessThanOrEqual(statusTop);
      expect(look.h - pad - lineH(TITLE_ACHIEVED_PX), `n ${n}`).toBeGreaterThanOrEqual(statusBottom);
      expect(pad).toBeGreaterThanOrEqual(3);
    }
    expect([titleRowLook(7).h, titleRowLook(6).h, TITLE_ACHIEVED_PX]).toEqual([76, 96, 16]);
    expect(TITLE_ACHIEVED_PAD_X).toBe(MENU_PAD_X); // 状態の文と同じ右端
  });
});

describe('Result の見出しの頭の語と達成の条件', () => {
  it('達成は「任務達成 — 」、未達は「任務未達 — 」（理由・夜明けの尾・ハード・史実・カスタムの印は同じ。順は ハード → 史実 → カスタム）', () => {
    expect([RESULT_ACHIEVED_JA, RESULT_NOT_ACHIEVED_JA]).toEqual(['任務達成', '任務未達']);
    for (const reason of Object.keys(REASON_LABEL) as (keyof typeof REASON_LABEL)[]) {
      const a = resultHeadingJa(true, reason, 12, true, true);
      const b = resultHeadingJa(false, reason, 12, true, true);
      expect(a).toBe(`任務達成 — ${REASON_LABEL[reason]}（夜明け後 12 秒）（ハード）${RESULT_HISTORICAL_TAG_JA}`);
      expect(b).toBe(a.replace('任務達成', '任務未達'));
    }
    const custom = { custom: { items: ['fuel_tank'] } };
    expect(resultHeadingJa(true, 'returned', NaN, true, true) + resultCustomTagJa(custom)).toBe('任務達成 — 帰投した（ハード）（史実）（カスタム）');
    expect(resultHeadingJa(false, 'returned', NaN, false, true) + resultCustomTagJa(custom)).toBe('任務未達 — 帰投した（史実）（カスタム）');
    expect(resultHeadingJa(false, 'returned', NaN, false, true) + resultCustomTagJa({})).toBe('任務未達 — 帰投した（史実）'); // 史実モードのデフォルトは今の印のまま
  });
  it('達成の規則は 1 つ（core/store の sortieAchieved）: 目的を果たして帰投。帰投だけ・目的だけ（沈んだ）は未達', () => {
    expect(sortieAchieved({ returned: true, objectiveDone: true })).toBe(true);
    expect(sortieAchieved({ returned: true, objectiveDone: false })).toBe(false);
    expect(sortieAchieved({ returned: false, objectiveDone: true })).toBe(false);
  });
  it('達成の条件の文: Briefing の「成功」の文（ハードの文があればそれ）。食い違う us_02・jp_06 だけ achieve_ja。13 任務 × ハードで空でなく 1 行に収まる', () => {
    const ids = [...playableMissionIds(gameData, 'us_pt'), ...playableMissionIds(gameData, 'jp_hard')];
    expect(ids).toHaveLength(13);
    for (const id of ids) {
      for (const hard of hasHardVariant(gameData, id) ? [false, true] : [false]) {
        const t = missionAchieveJa(gameData, id, hard);
        expect(t.length, `${id} ${hard}`).toBeGreaterThan(0);
        if (id !== 'us_02' && id !== 'jp_06') expect(t, `${id} ${hard}`).toBe(getBriefingRecord(gameData, id, hard).success);
        // 20 px の 1 行（論理幅 1,280 − 左右 24）に縮めずに収まる
        expect(textWidthPx(resultConditionJa(t), 20), `${id} ${hard}`).toBeLessThanOrEqual(1280 - 2 * 24);
      }
    }
    expect(missionAchieveJa(gameData, 'us_02')).toBe('駆逐艦を撃沈して帰投（ハードは2隻とも。敵艦隊がいなくなれば帰投は不要）');
    expect(missionAchieveJa(gameData, 'jp_06', true)).toBe('米駆逐艦を1隻撃沈して帰投');
    expect(missionAchieveJa(gameData, 'jp_01', true)).toBe('大発3隻とも浜に届けて帰投。1隻でも失えば達成の点は無い');
    expect(missionAchieveJa(gameData, 'nope')).toBe('');
    expect(resultConditionJa('生還')).toBe('達成の条件: 生還');
    expect(resultConditionJa('')).toBe('');
  });
});

describe('配線（ソース）', () => {
  it('Result: 見出しの色は達成で分け、未達だけ見出しの下に達成の条件の 1 行', () => {
    const rs = src('scenes/result-scene.ts');
    expect(rs).toContain('const achieved = sortieAchieved(r);');
    expect(rs).toContain('HUD_FONT_SPEED_PX, achieved ? HOME_COLOR_TEXT : HUD_COLOR_WARN);');
    expect(rs).toContain("const cond = achieved ? '' : resultConditionJa(missionAchieveJa(base, r.sortie.missionId, hardV));");
    expect(rs).toContain('if (cond) line(cond, HUD_FONT_HEADING_PX);');
    expect(src('ui/rescue-result.ts')).toContain('return resultHeadingJa(sortieAchieved(m), m.reason,');
    expect(rs.split('\n').length).toBeLessThanOrEqual(301);
  });
  it('Title: 行ごとに印（達成していなければ何も作らない）・開いているタブの 2 行目に達成の数。記録は保存 ＋ ?debug&achieved（保存は変えない）', () => {
    const ts = src('scenes/title-scene.ts');
    expect(ts).toContain('const achieved = titleAchievedRecord(data);');
    expect(ts).toContain('addTitleAchievedMark(this, row, r, look.h, titleCompactOn(n), achieved.get(e.id) ?? 0);');
    expect(ts).toContain('titleTabAchievedJa(c.id === selected.id ? TITLE_TAB_SELECTED_SUB_JA : TITLE_TAB_SUB_JA, achievedCount(achieved, ids), ids.length)');
    expect(ts.split('\n').length).toBeLessThanOrEqual(301);
    const ta = src('ui/title-achieved.ts');
    expect(ta).toContain('if (!l) return;');
    expect(ta).toContain('if (t.width > maxW && maxW > 0) t.setScale(maxW / t.width);');
    const sl = src('systems/sortie-loadout.ts');
    expect(sl).toContain('if (dbg !== null) for (const id of dbg.includes(DEBUG_CUSTOM_ALL) ? getStoreCatalogue(data).openMissionIds : dbg) addAchieved(rec, id, ACH_BIT_PLAIN);');
    expect(src('config/debug-achieved.ts')).toContain("new URLSearchParams(window.location.search).get('achieved')");
  });
  it('達成の形: ハードはハードの違いのある任務だけ・史実モード・カスタム（任務の終わりの 1 回。Mission の endMission は変えない）', () => {
    const sl = src('systems/sortie-loadout.ts');
    expect(sl).toContain('const bit = achievedVariantBit({ hard: s.hard && hasHardVariant(base, s.missionId), historical: s.historical, custom: s.custom !== undefined });');
    expect(sl).toContain('recordStoreSortie(base, s.missionId, sortieAchieved(result), missionStorePoints(result, base), bit);');
    const ms = src('scenes/mission-scene.ts');
    expect(ms).toContain('recordSortieStore(result, base);');
    expect(ms).toContain('if (w.destroyers && !this.sortie.historical && !this.sortie.custom && recordsHitKpi(base, this.sortie.missionId)) result.kpi = recordKpi(base, result.shots);'); // KPI は史実・カスタムを数えないまま
    expect(ms.split('\n').length).toBeLessThanOrEqual(301);
  });
  it('HUD の印: 史実モードのカスタムは 1 つの文「［史実・カスタム］」。史実だけ・カスタムだけは今の文', () => {
    expect([HUD_HIST_CUSTOM_BADGE_JA, HUD_CUSTOM_BADGE_JA]).toEqual(['［史実・カスタム］', '［カスタム］']);
    expect(src('config/ui-config.ts')).toContain("export const HUD_HIST_BADGE_JA = '［史実］';");
    const hs = src('scenes/hud-scene.ts');
    expect(hs).toContain('if (this.historical) this.add.text(HUD_HIST_BADGE_X, HUD_MARGIN, this.sortie?.custom ? HUD_HIST_CUSTOM_BADGE_JA : HUD_HIST_BADGE_JA, hudTextStyle(HUD_FONT_DEBUG_PX, HUD_COLOR_KPI))');
    expect(hs).toContain('else if (this.sortie?.custom) this.add.text(HUD_HIST_BADGE_X, HUD_MARGIN, HUD_CUSTOM_BADGE_JA, hudTextStyle(HUD_FONT_DEBUG_PX, HOME_COLOR_TEXT))');
  });
  it('史実モードはデフォルトに固定、の規則は無い（IP1）', () => {
    const cl = src('config/custom-loadout.ts');
    expect(cl).toContain('if (!c) return base;');
    expect(cl).not.toContain('sortie.historical');
    expect(src('systems/sortie-loadout.ts')).not.toContain('!historical');
    expect(src('core/store.ts')).toContain('return o.open && !o.raid && o.effectiveItems > 0;');
    expect(src('config/store-layout-config.ts')).not.toContain('史実モードはデフォルトのまま');
  });
});
