// jp_04 の教え「輸送船から離れて戦え」（v0.6.9 S4a。spec-v069 R12）: 目的（missions_seed の objective・hard の objective_ja）と「条件」の句（core/briefing の landingBriefingJa。
// S7 が条件の行に足す）が同じ句で言い、幅はこの repo の見積もり（tests/pt-ui-kit の textWidthPx: 半角 0.602 em・全角 1 em）で Phaser の折り返し（Text.advancedWordWrap:
// 半角スペースで語に分け、行に入らない語は次の行へ送り、行の頭の語が幅を超えれば字で切る）を写して数える: 目的は 24 px・1,056 px で 2 行、条件は 3 行。
import { describe, expect, it } from 'vitest';
import { getBriefingRecord, enemyNameJa, riskLabelJa } from '../src/config/briefing-data';
import { gameData } from '../src/config/game-data';
import { LANDING_FIGHT_AWAY_JA, briefingRows, landingBriefingJa } from '../src/core/briefing';
import { briefingNumbers, buildWorldSetup } from '../src/systems/world-setup';
import { textWidthPx } from './pt-ui-kit';

type Rec = Record<string, unknown>;
/** Briefing の値の行（menu-config の BRIEF_ROW_PX 24・BRIEF_VALUE_WRAP 1056。menu-config は DOM を読むので値で書く） */
const ROW_PX = 24;
const WRAP = 1056;
const M = (gameData.missionsSeed.missions as unknown as Rec[]).find((m) => m['id'] === 'jp_04')!;
const HARD = (M['v0_1_prototype'] as Rec)['hard'] as Rec;

/** Phaser 3 の Text.advancedWordWrap を幅の見積もりで写したもの（行の配列） */
function phaserWrap(text: string, px = ROW_PX, width = WRAP): string[] {
  const w = (s: string): number => textWidthPx(s, px);
  const lines = [text.replace(/ +/g, ' ')];
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.replace(/^ *|\s*$/g, '');
    if (w(line) < width) {
      out.push(line);
      continue;
    }
    let left = width;
    const words = line.split(' ');
    let o = '';
    for (let j = 0; j < words.length; j++) {
      const word = words[j]!;
      if (w(`${word} `) > left) {
        if (j === 0) {
          let nw = `${word} `;
          while (nw.length > 0) {
            nw = nw.slice(0, -1);
            if (w(nw) <= left) break;
          }
          words[j] = word.slice(nw.length);
          o += nw;
        }
        const off = words[j]!.length > 0 ? j : j + 1;
        lines.splice(i + 1, 0, words.slice(off).join(' ').replace(/[ \n]*$/g, ''));
        break;
      }
      o += `${word} `;
      left -= w(`${word} `);
    }
    out.push(o.replace(/[ \n]*$/g, ''));
  }
  return out.filter((l) => l.length > 0);
}

describe('R12 の教え「輸送船から離れて戦え」', () => {
  it('目的（ノーマル・ハード）と条件の句が同じ句を含む', () => {
    expect(LANDING_FIGHT_AWAY_JA).toBe('輸送船から離れて戦え');
    for (const obj of [String(M['objective']), String(HARD['objective_ja'])]) expect(obj).toContain(`${LANDING_FIGHT_AWAY_JA}。生きて帰れ`);
    expect(landingBriefingJa(140, 2)).toBe('揚陸 140 秒（魚雷 2 本で沈む。輸送船から離れて戦え。米PTの魚雷も自艇の下を抜ける）');
    expect(landingBriefingJa(139.6, 1)).toContain('揚陸 140 秒（魚雷 1 本で沈む。');
  });
  it('目的は半角スペースを含まず（数と単位の間はノーブレークスペース）、24 px・1,056 px で 2 行（S4a の前は「900 m」の半角スペースで折れて 3 行）', () => {
    for (const [obj, hard] of [[String(M['objective']), false], [String(HARD['objective_ja']), true]] as const) {
      expect(obj).not.toContain(' ');
      const lines = phaserWrap(obj);
      expect(lines.length, obj).toBe(2);
      for (const l of lines) expect(textWidthPx(l, ROW_PX)).toBeLessThanOrEqual(WRAP);
      expect(getBriefingRecord(gameData, 'jp_04', hard).objective).toBe(obj);
    }
    // 写しの確かめ: 前の目的は「900」の後の半角スペースで折れ、2 行目が字で切れて 3 行
    expect(phaserWrap('停泊して揚陸する輸送船を米PTの雷撃から守る。気づかれていないPTは900 mで魚雷を撃つ。速く走るか撃てばPTは自艇へ来る（近いPTは慌てて撃つ）。揚陸まで引きつけて生きて帰れ').length).toBe(3);
  });
  it('条件の行（今の行に「 ・」＋ノーブレークスペースで句を足す。S7 の形）は 24 px・1,056 px で 3 行（ノーマル・ハード）', () => {
    for (const hard of [false, true]) {
      const s = buildWorldSetup(gameData, 'jp_04', { hard });
      const rec = { ...getBriefingRecord(gameData, 'jp_04', hard), hazardIds: s.hazardsTonight, absentHazardIds: s.absentHazards };
      const now = briefingRows(rec, briefingNumbers(s), (e) => enemyNameJa(gameData, e), (h) => riskLabelJa(gameData, h))[5]!.text;
      expect(phaserWrap(now).length).toBe(2);
      const L = s.landing!.params;
      const line = `${now} ・ ${landingBriefingJa(L.unloadS, L.hitsToSink)}`;
      const lines = phaserWrap(line);
      expect(lines.length, lines.join('\n')).toBe(3);
      expect(lines[2]!.startsWith('・ 揚陸 140 秒')).toBe(true);
    }
  });
});
