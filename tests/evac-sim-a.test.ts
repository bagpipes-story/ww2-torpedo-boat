// 空襲下の退避の模擬（v0.6.11 S3。spec-v0611-r2 §12・§13 の S3）: 決定性（同じ seed で同じ 1 回・同じ表）、乱数の系列 +29〜+43 の引く回数
// （+29 は予告ごとに陰の数、+30 は生成の 6 回 ＋ pick の境ごとに 6 隊 × 2 回、+31 は投下ごとに 1 回、編隊の系列は投下ごとに 2 回 ＋ 隊長艇への命中の火災・機関）、
// 同時に動く編隊（ノーマル ≤ 2・ハード ≤ 3）と起動時の数（ノーマル 8・ハード 12）、終わりの形、遊び方の表、漂流の待ちが世界と同じ。帯は tests/evac-sim-b・c・d（S7。N 50 × 2 組）と scripts/headless/g2.sh の EVAC=1（N 400 × 2 組）。
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { gameData } from '../src/config/game-data';
import { runEvacTrial, type EvacTrial } from '../src/core/evac-sim';
import { evacCellOf } from '../src/core/evac-sim-cell';
import { EVAC_POLICIES, EVAC_POLICY_SPECS, type EvacPolicy } from '../src/core/evac-sim-policy';
import { evacFlightLive } from '../src/core/evac-plan';
import { EVAC_SIM_ADRIFT_DELAY_S, evacSimSetup, withEvacOverrides } from '../src/systems/evac-sim-setup';

const NORMAL = evacSimSetup(gameData, false);
const HARD = evacSimSetup(gameData, true);

function drawsOk(t: EvacTrial): void {
  expect(t.draws29).toBe(t.exp29);
  expect(t.draws30).toBe(t.exp30);
  expect(t.draws31).toBe(t.exp31);
  expect(t.drawsFlights).toBeGreaterThanOrEqual(2 * t.exp31);
  expect(t.drawsFlights).toBeLessThanOrEqual(2 * t.exp31 + 2 * t.boatHits + 2 * t.seatHits);
}

describe('空襲下の退避の模擬の決定性', () => {
  it('同じ seed・同じ遊び方なら同じ 1 回（全部の値）', () => {
    for (const p of ['seq', 'stay', 'seq_shoot'] as EvacPolicy[]) expect(runEvacTrial(NORMAL, p, 7)).toEqual(runEvacTrial(NORMAL, p, 7));
    expect(runEvacTrial(HARD, 'bot', 3)).toEqual(runEvacTrial(HARD, 'bot', 3));
  });

  it('同じ seed の組なら同じ表（セル）', () => {
    const cell = (): ReturnType<typeof evacCellOf> => evacCellOf(Array.from({ length: 6 }, (_, i) => runEvacTrial(NORMAL, 'follow_ring', 11 + i)));
    expect(cell()).toEqual(cell());
  });

  it('seed が違えば 1 回が変わる（台本の揺らぎとゲームの系列が効いている）', () => {
    expect(runEvacTrial(NORMAL, 'seq', 1)).not.toEqual(runEvacTrial(NORMAL, 'seq', 2));
  });
});

describe('乱数の系列 +29〜+43 の引く回数', () => {
  it.each(['seq', 'stay', 'dodge_only', 'bot', 'seq_shoot'] as EvacPolicy[])('ノーマル %s: 予告ごとに陰の数（S3b から 1）・6 隊 × (1 ＋ 2 × 47)・投下ごとに 1 回・編隊は 2 × 投下 ＋ 命中の分', (p) => {
    for (const seed of [1, 2, 3]) {
      const t = runEvacTrial(NORMAL, p, seed);
      drawsOk(t);
      if (t.timeS >= NORMAL.durationS) {
        expect(t.exp29).toBe(1 * NORMAL.raid.waves.length); // 陰は屋我地の陰（東）の 1 か所
        expect(t.exp30).toBe(6 * (1 + 2 * 47));
      }
    }
  });

  it('ハードも同じ式（編隊の系列は 12 本）', () => {
    for (const p of ['seq', 'stay'] as EvacPolicy[]) for (const seed of [4, 5]) drawsOk(runEvacTrial(HARD, p, seed));
  });

  it('+30 の引く回数は遊び方によらない（時計だけで決まる）・+29 は予告の数だけ', () => {
    const a = runEvacTrial(NORMAL, 'seq', 9);
    const b = runEvacTrial(NORMAL, 'stay', 9);
    if (a.timeS >= NORMAL.durationS && b.timeS >= NORMAL.durationS) {
      expect(a.draws30).toBe(b.draws30);
      expect(a.draws29).toBe(b.draws29);
    }
  });
});

describe('編隊の数と同時に動く編隊', () => {
  const peak = (s: typeof NORMAL, p: EvacPolicy, seed: number): { flights: number; live: number; planes: number } => {
    let flights = 0;
    let live = 0;
    let planes = 0;
    runEvacTrial(s, p, seed, (_t, _sq, _seat, plan) => {
      flights = plan.flights.length;
      let n = 0;
      let m = 0;
      for (const fl of plan.flights) if (evacFlightLive(fl)) (n++, (m += fl.p.planes));
      if (n > live) live = n;
      if (m > planes) planes = m;
    });
    return { flights, live, planes };
  };

  it('ノーマルは起動時に 8 編隊・同時に ≤ 2（機 ≤ 8）、ハードは 12 編隊・同時に ≤ 3（機 ≤ 12）。S3b の 2 回目（passes_max 2）があっても（stay＝全部の隊が外。第 4 波で 3 編隊）', () => {
    for (const seed of [2, 3]) {
      const n = peak(NORMAL, 'stay', seed);
      expect(n.flights).toBe(8);
      expect([n.live <= 2, n.planes <= 8]).toEqual([true, true]);
      const h = peak(HARD, 'stay', seed);
      expect(h.flights).toBe(12);
      expect(h.live).toBe(3);
      expect(h.planes).toBeLessThanOrEqual(12);
    }
  }, 60_000);
});

describe('終わりと表の形', () => {
  it('どの遊び方も終わる（帰投・沈没・漂流・打ち切りのどれか）・決着の前の帰投は早い決着（IP1 の U8）だけ・残存は 0〜18', () => {
    for (const p of EVAC_POLICIES) {
      const t = runEvacTrial(NORMAL, p, 21);
      expect(['home', 'sunk', 'adrift', 'timeout']).toContain(t.end);
      // 240 秒の前の帰投は早い決着（v0.6.11 IP1 の U8。全艇が隠れて空が空いた次のステップ）だけ
      if (t.end === 'home' && t.timeS < NORMAL.durationS) expect(t.timeS).toBeCloseTo(t.earlyS + NORMAL.stepS, 6);
      else if (t.end === 'home') expect(Number.isNaN(t.earlyS)).toBe(true);
      expect(t.survivors).toBeGreaterThanOrEqual(0);
      expect(t.survivors).toBeLessThanOrEqual(18);
      expect(t.achieved).toBe(t.end === 'home' && t.survivors >= NORMAL.raid.survivorQuota);
    }
  });

  it('遊び方は spec §12.3 の 10 行（seq が主・bot が天井・stay は動かない）', () => {
    expect(EVAC_POLICIES).toEqual(['seq', 'seq_slow', 'seq_cover', 'follow_ring', 'seq_shoot', 'own_only', 'dodge_only', 'fight', 'stay', 'bot']);
    expect(EVAC_POLICY_SPECS.stay).toMatchObject({ hide: 'none', idle: 'stop', gun: 'none', back: false });
    expect(EVAC_POLICY_SPECS.bot.bot).toBe(true);
    expect(EVAC_POLICY_SPECS.seq_slow).toMatchObject({ waitUp: true, cruise: true });
  });

  it('stay は決着まで切り替えない（全滅の後の自動の切替だけ）・own_only は 1 回も切り替えない', () => {
    for (const seed of [1, 2]) {
      expect(runEvacTrial(NORMAL, 'stay', seed).switches).toBe(0);
      expect(runEvacTrial(NORMAL, 'own_only', seed).switches).toBe(0);
    }
  });

  it('漂流の待ちは世界（MISSION_END_DELAY_MS）と同じ・つまみの無い上書きは data をそのまま返す', () => {
    // ui-config は画面の game-config を読む（node の型検査に window が入る）ので、定義の行を読む
    const m = /export const MISSION_END_DELAY_MS = (\d+);/.exec(readFileSync(new URL('../src/config/ui-config.ts', import.meta.url), 'utf8'));
    expect(m).not.toBeNull();
    expect(EVAC_SIM_ADRIFT_DELAY_S).toBe(Number(m![1]) / 1000);
    expect(withEvacOverrides(gameData, {})).toBe(gameData);
  });

  it('つまみ（spec §12.5）は data の写しを通って起動時の検査を受ける（haul_s・隠れ場所を外す・陰の発見）', () => {
    const s = evacSimSetup(gameData, false, { haulS: 18, dropShelters: ['east_cave'], coverReveal: 0.25 });
    expect(s.params.haulS).toBe(18);
    expect(s.params.shelters.map((x) => x.id)).not.toContain('east_cave');
    expect(s.raid.coverRevealChance).toBe(0.25);
    expect([NORMAL.params.haulS, NORMAL.raid.coverRevealChance]).toEqual([12, 0.5]); // S3b の data
    expect(() => evacSimSetup(gameData, false, { firstRunS: 1 })).toThrow(/first_run_s/);
  });
});
