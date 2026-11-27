// v0.9.0 S1（spec-v0900 §4.6）: ストアの画面の置き方（config/store-layout-config）を論理幅 1,280〜1,584 の 8 刻みの全部で確かめる。
// - Title の左上の「ストア」: 画面の内・タブ（上端 108）の上・ロゴとビルド番号から 24 px 以上・右上の「曲」と左右対称。題と 2 行目はボタンに収まる。
// - ストアの画面: 品の枠は画面の内（左右 24 以上）・互いに重ならず・「← 任務一覧」と一言の下・説明の上。説明と左下の一言は右下の主ボタンにかからない。題・文・状態は枠に収まる。
// - Briefing の「装備」: 出撃の左 16・同じ高さ・史実メモの下端の上限 576 より下・画面の内。題と 2 行目はボタンに収まる。遊べる任務に港の空襲（同じ帯）は無い。
// menu-config・game-config は DOM を読むので import しない（DOM の側の値はソースを読んで結ぶ＝tests/title-sound と同じ）。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gameData, getRaidParams } from '../src/config/game-data';
import { getPrototypeMission, hasHardVariant } from '../src/config/mission-data';
import { getStoreCatalogue } from '../src/config/store-data';
import {
  BRIEF_LOADOUT_CUSTOM_JA,
  BRIEF_LOADOUT_DEFAULT_JA,
  BRIEF_LOADOUT_DEFAULT_SUB_JA,
  BRIEF_LOADOUT_PX,
  BRIEF_LOADOUT_SUB_MAX_PX,
  BRIEF_LOADOUT_SUB_PX,
  STORE_CARD_STATE_PX,
  STORE_CARD_SUB_PX,
  STORE_CARD_TITLE_PX,
  STORE_DESC_GAP,
  STORE_DESC_WRAP,
  STORE_HINT_JA,
  STORE_HINT_PX,
  STORE_LEAD_JA,
  STORE_LEAD_PX,
  STORE_LEAD_Y,
  STORE_MARGIN,
  STORE_TITLE_X,
  STORE_UNEQUIPPED_JA,
  TITLE_STORE_JA,
  TITLE_STORE_PX,
  TITLE_STORE_RECT,
  TITLE_STORE_SUB_PX,
  briefLoadoutRect,
  storeActionRect,
  storeBackRect,
  storeCardRect,
  storeGridBottom,
  storeGridLeft,
  type Rect,
} from '../src/config/store-layout-config';
import { TITLE_MUSIC_GAP, TITLE_SOUND_W } from '../src/config/title-layout-config';
import { formatPoints, loadoutSubJa, storeCardSubJa } from '../src/ui/store-texts';
import { textWidthPx } from './pt-ui-kit';

const src = (f: string): string => readFileSync(join(__dirname, '..', 'src', f), 'utf8');
const numConst = (file: string, name: string): number => Number(new RegExp(`export const ${name} = (\\d+);`).exec(src(file))![1]);
const HUD_MARGIN = numConst('config/game-config.ts', 'HUD_MARGIN');
const TITLE_TAB_Y = numConst('config/menu-config.ts', 'TITLE_TAB_Y');
const TITLE_LOGO_PX = numConst('config/menu-config.ts', 'TITLE_LOGO_PX');
const MENU_PAD_X = numConst('config/menu-config.ts', 'MENU_PAD_X');
const MENU_PRIMARY_W = numConst('config/menu-config.ts', 'MENU_PRIMARY_W');
const BRIEF_SORTIE_H = numConst('config/menu-config.ts', 'BRIEF_SORTIE_H');
const BRIEF_BACK_W = numConst('config/menu-config.ts', 'BRIEF_BACK_W');
const BRIEF_BACK_H = numConst('config/menu-config.ts', 'BRIEF_BACK_H');
const HUD_FONT_DEBUG_PX = numConst('config/ui-config.ts', 'HUD_FONT_DEBUG_PX');
const LOGO = /export const TITLE_LOGO_TEXT = '([^']+)';/.exec(src('config/menu-config.ts'))![1]!;
const WIDTHS: number[] = [];
for (let w = 1280; w <= 1584; w += 8) WIDTHS.push(w);
const LINE_H = 1.25;
const overlap = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const ITEMS = getStoreCatalogue(gameData).items;
/** 史実メモの下端の上限（scripts/headless/brief-result の検査: 出撃の上端 584 − 8） */
const BRIEF_NOTE_MAX_BOTTOM = 720 - 24 - 112 - 8;

describe('Title の左上の「ストア」', () => {
  it('右上の「曲」「音」と同じ 200 × 80・上端 20・左 24（ゲームの縁の HUD_MARGIN と同じ）。題「ストア」と 2 行目「43,000 点」は余白を引いた幅に収まる', () => {
    expect([STORE_MARGIN, TITLE_STORE_RECT.x, TITLE_STORE_RECT.y, TITLE_STORE_RECT.w, TITLE_STORE_RECT.h]).toEqual([HUD_MARGIN, 24, 20, 200, 80]);
    expect(TITLE_STORE_JA).toBe('ストア');
    expect(textWidthPx(TITLE_STORE_JA, TITLE_STORE_PX)).toBeLessThanOrEqual(TITLE_STORE_RECT.w - 2 * MENU_PAD_X);
    expect(textWidthPx(`${formatPoints(9_999_999)} 点`, TITLE_STORE_SUB_PX)).toBeLessThanOrEqual(TITLE_STORE_RECT.w - 2 * MENU_PAD_X);
  });
  it('論理幅 1,280〜1,584 の全部: タブの上・ロゴとビルド番号の左端から 24 px 以上離れ、右上の「曲」と左右対称', () => {
    const label = 'claude/v0.9.0-store@15ddce7';
    const r = TITLE_STORE_RECT;
    let minGap = Infinity;
    for (const w of WIDTHS) {
      expect([r.y + r.h < TITLE_TAB_Y, r.x], `${w}`).toEqual([true, HUD_MARGIN]); // 左の余白は右上の「音」の右の余白と同じ
      const logoLeft = w / 2 - textWidthPx(LOGO, TITLE_LOGO_PX) / 2;
      const labelLeft = w / 2 - textWidthPx(label, HUD_FONT_DEBUG_PX) / 2;
      expect(logoLeft - (r.x + r.w), `${w}`).toBeGreaterThanOrEqual(24);
      expect(labelLeft - (r.x + r.w), `${w}`).toBeGreaterThanOrEqual(24);
      minGap = Math.min(minGap, logoLeft - (r.x + r.w));
      const musicX = w - HUD_MARGIN - TITLE_SOUND_W - TITLE_MUSIC_GAP - TITLE_SOUND_W;
      expect(musicX - (r.x + r.w), `${w}`).toBeGreaterThan(0); // 「曲」とも重ならない
    }
    expect(Math.round(minGap)).toBe(244);
  });
  it('配線（ソース）: 開いている端末だけ作る（閉じている端末の Title は v0.8.5 と同じ）・支度金はその前に 1 回・SHUTDOWN で破棄', () => {
    const code = src('scenes/title-scene.ts');
    expect(code).toContain('    if (storeIsOpen(data)) {\n      grantStoreOpening(data);\n');
    expect(code).toContain('this.scene.start(SCENE_KEYS.store);');
    expect(code).toContain('this.storeBtn?.destroy();');
  });
});

describe('ストアの画面', () => {
  it('品の枠: 2 列（597・間 24＝1,218 を中心に）・画面の内（左右 24 以上）・互いに重ならず・一言と「← 任務一覧」の下・説明の上（論理幅の全部）', () => {
    const n = ITEMS.length;
    for (const w of WIDTHS) {
      const back = storeBackRect(w);
      expect([back.w, back.h, back.y, back.x + back.w]).toEqual([BRIEF_BACK_W, BRIEF_BACK_H, HUD_MARGIN, w - HUD_MARGIN]);
      expect(STORE_TITLE_X + textWidthPx(STORE_LEAD_JA, STORE_LEAD_PX), `${w}`).toBeLessThan(back.x - 24); // 一言は「← 任務一覧」にかからない
      const rects = ITEMS.map((_, i) => storeCardRect(i, n, w));
      expect(storeGridLeft(w), `${w}`).toBeGreaterThanOrEqual(HUD_MARGIN);
      for (const [i, r] of rects.entries()) {
        expect(r.x, `${w} ${i}`).toBeGreaterThanOrEqual(HUD_MARGIN);
        expect(r.x + r.w, `${w} ${i}`).toBeLessThanOrEqual(w - HUD_MARGIN);
        expect(r.y, `${w} ${i}`).toBeGreaterThanOrEqual(Math.max(back.y + back.h, STORE_LEAD_Y + STORE_LEAD_PX * LINE_H));
        expect(r.y + r.h, `${w} ${i}`).toBeLessThanOrEqual(storeGridBottom(n));
        for (let k = 0; k < i; k++) expect(overlap(r, rects[k]!), `${w} ${i} ${k}`).toBe(false);
      }
      const action = storeActionRect(w);
      expect([action.x + action.w, action.y + action.h, action.w, action.h]).toEqual([w - HUD_MARGIN, 720 - HUD_MARGIN, MENU_PRIMARY_W, BRIEF_SORTIE_H]);
      expect(storeGridLeft(w) + STORE_DESC_WRAP, `${w}`).toBeLessThanOrEqual(action.x - 16); // 説明と左下の一言は主ボタンにかからない
      expect(storeGridBottom(n) + STORE_DESC_GAP, `${w}`).toBeLessThan(action.y);
    }
    expect(storeCardRect(0, n, 1280).x).toBe(31);
    expect(storeCardRect(1, n, 1560).x).toBe(780 + 12);
  });
  it('左下の一言の各行（18 px）は説明の幅（832）に収まり折り返さない', () => {
    for (const l of STORE_HINT_JA.split('\n')) expect(textWidthPx(l, STORE_HINT_PX), l).toBeLessThanOrEqual(STORE_DESC_WRAP);
  });
  it('7 品からは詰めた行（76 px）でも 4 段が説明の上に収まる（殴り込みの味方などを足した時）', () => {
    expect(storeCardRect(7, 8, 1280).y + storeCardRect(7, 8, 1280).h).toBe(storeGridBottom(8));
    expect(storeGridBottom(8)).toBeLessThan(storeActionRect(1280).y - 80);
  });
  it('1 枚の題（26 px）＋右の状態（22 px）と 2 行目（18 px。効きの短い文・ご褒美は札）は枠の余白の内（品の全部・状態のいちばん長い物。ご褒美の進み 13/13 も）', () => {
    expect(ITEMS.filter((x) => x.reward).map((x) => x.id)).toEqual(['crew_veteran']); // v0.9.0 IP3
    for (const it of ITEMS) {
      const states = [it.reward ? '13/13' : `${formatPoints(it.price)} 点`, STORE_UNEQUIPPED_JA];
      for (const s of states) expect(textWidthPx(it.nameJa, STORE_CARD_TITLE_PX) + 24 + textWidthPx(s, STORE_CARD_STATE_PX), `${it.id} ${s}`).toBeLessThanOrEqual(597 - 2 * MENU_PAD_X);
      for (const s of states) expect(textWidthPx(storeCardSubJa(gameData, it), STORE_CARD_SUB_PX) + 24 + textWidthPx(s, STORE_CARD_STATE_PX), `${it.id} ${s}`).toBeLessThanOrEqual(597 - 2 * MENU_PAD_X);
    }
  });
});

describe('Briefing の「装備: デフォルト／カスタム」', () => {
  it('出撃の左 16・同じ高さ（1280 で 520〜920・1560 で 800〜1200）・画面の内・史実メモの下端の上限より下', () => {
    for (const w of WIDTHS) {
      const go = storeActionRect(w);
      const b = briefLoadoutRect(w);
      expect([b.w, b.h, b.y, go.x - (b.x + b.w)], `${w}`).toEqual([400, BRIEF_SORTIE_H, go.y, 16]);
      expect(b.x, `${w}`).toBeGreaterThanOrEqual(HUD_MARGIN);
      expect(b.y, `${w}`).toBeGreaterThan(BRIEF_NOTE_MAX_BOTTOM);
    }
    expect([briefLoadoutRect(1280).x, briefLoadoutRect(1560).x]).toEqual([520, 800]);
  });
  it('題と 2 行目（いちばん長い 22 字＋「ほか n」まで）は余白を引いた幅に収まる', () => {
    const inner = 400 - 2 * MENU_PAD_X;
    for (const t of [BRIEF_LOADOUT_DEFAULT_JA, BRIEF_LOADOUT_CUSTOM_JA]) expect(textWidthPx(t, BRIEF_LOADOUT_PX), t).toBeLessThanOrEqual(inner);
    expect(textWidthPx(BRIEF_LOADOUT_DEFAULT_SUB_JA, BRIEF_LOADOUT_SUB_PX)).toBeLessThanOrEqual(inner);
    expect(BRIEF_LOADOUT_SUB_MAX_PX).toBe(inner);
    const shorts = ITEMS.map((x) => x.shortJa);
    expect(loadoutSubJa(shorts.slice(0, 4))).toBe(shorts.slice(0, 4).join('・')); // 交換の 4 品は全部並ぶ（ご褒美も装着すれば「ほか n」。v0.9.0 IP3）
    expect(loadoutSubJa(shorts)).toMatch(/ ほか \d$/);
    expect(textWidthPx(loadoutSubJa(shorts), BRIEF_LOADOUT_SUB_PX)).toBeLessThanOrEqual(inner);
    const many = [...shorts, '40mm', '37mm', '機関の整備', 'SO レーダー'];
    expect(loadoutSubJa(many)).toMatch(/ ほか \d$/);
    expect(textWidthPx(loadoutSubJa(many), BRIEF_LOADOUT_SUB_PX)).toBeLessThanOrEqual(inner);
  });
  it('遊べる任務（13・ノーマルとハード）に港の空襲（harbor_fire_explosion の 2 択＝同じ下の帯）は無い。入れる時は切り替えを上の帯へ移す（今は空襲の夜には切り替えを出さない）', () => {
    for (const id of getStoreCatalogue(gameData).openMissionIds) {
      for (const hard of hasHardVariant(gameData, id) ? [false, true] : [false]) expect(getRaidParams(gameData, getPrototypeMission(gameData, id, hard)), `${id} ${hard}`).toBeNull();
    }
    expect(getStoreCatalogue(gameData).openMissionIds).toHaveLength(13);
  });
  it('配線（ソース）: 出撃はカスタムを選んだ時だけ印を付け、数値の行もその data で組む。押すと選びを保存して同じ夜で作り直す', () => {
    const code = src('scenes/briefing-scene.ts');
    expect(code).toContain('const loadout = briefingLoadout(base, id, p !== null);'); // v0.9.0 IP1: 史実モードでも出す（引数から史実を外した）
    expect(code).toContain('this.sortie = sortieWithBriefingLoadout(rollRaid(id, this.seed, p, DEBUG_RAID_OVERRIDE, this.hard, this.historical), base, loadout);');
    expect(code).toContain('const data = sortieGameData(base, this.sortie);');
    expect(code).toContain("setStoreLoadoutMode(base, custom ? 'custom' : 'default');");
    expect(code).toContain('this.scene.restart({ missionId: id, seed: this.seed, hard: this.hard, historical: this.historical });');
  });
});
