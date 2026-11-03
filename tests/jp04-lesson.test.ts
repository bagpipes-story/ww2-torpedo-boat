// jp_04 の教え「輸送船から離れて戦え」（v0.6.9 S4a。spec-v069 R12）: 目的（missions_seed の objective・hard の objective_ja）と「条件」の句（core/briefing の landingBriefingJa。
// S7 から briefingNumbers の landingJa を briefingRows が条件の行に足す）が同じ句で言い、幅はこの repo の見積もり（tests/pt-ui-kit の textWidthPx: 半角 0.602 em・全角 1 em）で Phaser の折り返し（Text.advancedWordWrap:
// 半角スペースで語に分け、行に入らない語は次の行へ送り、行の頭の語が幅を超えれば字で切る）を写して数える: 目的は 24 px・1,056 px で 2 行、条件は 3 行。
import { describe, expect, it } from 'vitest';
import { getBriefingRecord, enemyNameJa, riskLabelJa } from '../src/config/briefing-data';
import { gameData } from '../src/config/game-data';
import { LANDING_FIGHT_AWAY_JA, LANDING_RING_WAIT_JA, briefingRows, landingBriefingJa } from '../src/core/briefing';
import { briefingNumbers, buildWorldSetup } from '../src/systems/world-setup';
import { textWidthPx } from './pt-ui-kit';
import { BRIEF_ROW_PX, BRIEF_WRAP, phaserWrap } from './wrap-kit';

type Rec = Record<string, unknown>;
/** Briefing の値の行（tests/wrap-kit。v0.6.10 S7 で折り返しの写しをそこへ移した） */
const ROW_PX = BRIEF_ROW_PX;
const WRAP = BRIEF_WRAP;
const M = (gameData.missionsSeed.missions as unknown as Rec[]).find((m) => m['id'] === 'jp_04')!;
const HARD = (M['v0_1_prototype'] as Rec)['hard'] as Rec;

describe('R12 の教え「輸送船から離れて戦え」', () => {
  it('目的（ノーマル・ハード）と条件の句が同じ句を含む', () => {
    expect(LANDING_FIGHT_AWAY_JA).toBe('輸送船から離れて戦え');
    for (const obj of [String(M['objective']), String(HARD['objective_ja'])]) expect(obj).toContain(`${LANDING_FIGHT_AWAY_JA}。生きて帰れ`);
    expect(landingBriefingJa(140, 2)).toBe('帰投の輪で待てる ・ 揚陸 140 秒（被雷 2 で沈む。輸送船から離れて戦え。米PTの魚雷も自艇の下を抜ける）'); // S7: 「魚雷 2 本で沈む」→「被雷 2 で沈む」（下の余白の検査）
    expect(LANDING_RING_WAIT_JA).toBe('帰投の輪で待てる'); // R14 A5: 揚陸の決着の前に輪に入っても終わらない（HUD の輪の中の行・燃料少の後ろと同じ事）
    expect(landingBriefingJa(139.6, 1)).toContain('揚陸 140 秒（被雷 1 で沈む。');
  });
  it('目的は半角スペースを含まず（数と単位の間はノーブレークスペース）、24 px・1,056 px で 2 行（S4a の前は「900 m」の半角スペースで折れて 3 行）。1 字の余白でも 2 行（S7）', () => {
    for (const [obj, hard] of [[String(M['objective']), false], [String(HARD['objective_ja']), true]] as const) {
      expect(obj).not.toContain(' ');
      const lines = phaserWrap(obj);
      expect(lines.length, obj).toBe(2);
      expect(phaserWrap(obj, ROW_PX, WRAP - ROW_PX).length, obj).toBe(2); // S7: 1 字の余白でも 2 行（前の「停泊して揚陸する…」はヘッドレスで「れ」が 3 行目に落ちた）
      for (const l of lines) expect(textWidthPx(l, ROW_PX)).toBeLessThanOrEqual(WRAP);
      expect(getBriefingRecord(gameData, 'jp_04', hard).objective).toBe(obj);
    }
    // 写しの確かめ: 前の目的は「900」の後の半角スペースで折れ、2 行目が字で切れて 3 行
    expect(phaserWrap('停泊して揚陸する輸送船を米PTの雷撃から守る。気づかれていないPTは900 mで魚雷を撃つ。速く走るか撃てばPTは自艇へ来る（近いPTは慌てて撃つ）。揚陸まで引きつけて生きて帰れ').length).toBe(3);
  });
  it('条件の行（S7: briefingNumbers の landingJa を briefingRows が最後に「 ・」＋ノーブレークスペースで足す）は 24 px・1,056 px で 3 行（ノーマル・ハード）。句の無い行は 2 行', () => {
    for (const hard of [false, true]) {
      const s = buildWorldSetup(gameData, 'jp_04', { hard });
      const rec = { ...getBriefingRecord(gameData, 'jp_04', hard), hazardIds: s.hazardsTonight, absentHazardIds: s.absentHazards };
      const n = briefingNumbers(s);
      const L = s.landing!.params;
      expect(n.landingJa).toBe(landingBriefingJa(L.unloadS, L.hitsToSink));
      const line = briefingRows(rec, n, (e) => enemyNameJa(gameData, e), (h) => riskLabelJa(gameData, h))[5]!.text;
      const tail = ` ・ ${landingBriefingJa(L.unloadS, L.hitsToSink)}`;
      expect(line.endsWith(tail), line).toBe(true);
      const { landingJa: _omit, ...without } = n;
      const now = briefingRows(rec, without, (e) => enemyNameJa(gameData, e), (h) => riskLabelJa(gameData, h))[5]!.text;
      expect(now + tail).toBe(line);
      expect(phaserWrap(now).length).toBe(2);
      const lines = phaserWrap(line);
      expect(lines.length, lines.join('\n')).toBe(3);
      expect(lines[2]!.startsWith('・ 揚陸 140 秒')).toBe(true);
      expect(lines[1]!.endsWith(`・ ${LANDING_RING_WAIT_JA}`), lines[1]).toBe(true); // R14 A5 の帰投の句は武器の句の行の後ろ（3 行のまま）
      // S7: 1 字（24 px）の余白でも 3 行（ヘッドレスの本当の折り返しは見積もりより約 1% 広く、字で切る行は最大 1 字を余らせる。前の「魚雷 2 本で沈む」は句が 4 px 越えて「）」が 4 行目に落ちた）
      expect(phaserWrap(line, ROW_PX, WRAP - ROW_PX).length, line).toBe(3);
    }
  });
});

describe('Briefing の史実メモ（S7。20 px・1,056 px）', () => {
  it('ノーマル・ハードとも半角スペースを含まず（「米PT 2隻」「約900 m」はノーブレークスペース＝語で折れて短い行を作らない）、1 字（20 px）の余白でも 3 行（前の文はヘッドレスで 4 行になり出撃のボタンに重なった）', () => {
    const NOTE_PX = 20;
    for (const note of [String(M['briefing_note_ja']), String(HARD['note_ja'])]) {
      expect(note).not.toContain(' ');
      expect(phaserWrap(note, NOTE_PX).length, note).toBe(3);
      expect(phaserWrap(note, NOTE_PX, WRAP - NOTE_PX).length, note).toBe(3);
    }
  });
});
