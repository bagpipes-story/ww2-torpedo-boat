// 迎撃の模擬（v0.8.0 S3。us_04「ブラケット海峡の夜」）の帯（spec-v0800 §4.11 の B1〜B6・ハード、§4.6 の燃料。lead の L20・L21）。帯の数は spec の決めなので動かさない
// （S3b の lead の L39: B3 は「idle_lane の自艇の沈没（衝突・体当たり・砲火）≥ 20%」＝危険がある、の読み。KPI に合わせた見張りは止まった艇を 480 m で見つけ、当たる前に砲が届く。
// S3c の L45: B2 は B2a「列はレーダーで」（eye_only の列の艦の撃沈 ≤ radar_ambush の列の撃沈 − 15 点。護衛は 4 隻の 1 隻なので撃って達成してよい）と B2b「目だけは危ない」
// （eye_only の自艇の沈没 ≥ radar_ambush ＋ 15 点）。L46: F は radar_twice の帰投の夜の燃料の中央値（一番燃料を使うレーダーの行）、D は 7 行のうち自艇が沈まない夜が 20% 以上の行の漂流 ≤ 5%。lead の S3 の門の前の直し: 帰投で選ぶと、尽きて帰れない夜の多い行ほど外れて検査が空になる）。
// 合わせるのは data のつまみだけ（spec §4.11 の順: ① B6 → transit.speed_kt ② B1・B2 → radar.models.so_early の ship_range_m・sweep_s ③ B3・B4 → transit.outbound.lane_y_m・
// unload_s ④ 燃料 → fuel_allotment_gal。敵の回避・見張り・砲・命中率の値には触れない）。scripts/intercept-sim の TABLE=2（N 400 × 2 組）と scripts/headless/g2.sh の US04=1 が
// この帯で「帯: すべて ✓」を出し、tests/intercept-sim-b が軽い組で同じ帯を見る。B6 は CLAUDE.md §2 の KPI（正しく狙った 1 本 35〜45%）を列の艦に測る（core/intercept-sim-world の
// columnShot。kpi_measurement.sim の方位・ずれ・回数・seed で、距離は 700〜1,100 m の 100 m おき＝core/hit-rate-sim の simulateBands と同じ数え方）。Phaser 非依存。
import type { GameData } from '../config/game-data';
import type { InterceptSimSetup } from '../core/intercept-sim';
import type { InterceptCell } from '../core/intercept-sim-cell';
import { INTERCEPT_POLICIES, type InterceptPolicy } from '../core/intercept-sim-policy';
import { columnShot } from '../core/intercept-sim-world';
import { simBearings } from '../core/hit-rate-sim';
import { SeededRng } from '../core/rng';
import { INTERCEPT_B6_MAX_M, INTERCEPT_B6_MIN_M } from './intercept-sim-setup';

/**
 * 帯（spec §4.11・§4.6・L39・L45・L46）: B1 撃沈・沈没・帰投、B2a 列の撃沈の差・B2b 沈没の差、B3 道の上の沈没、B4 衝突、B5 突っ込む沈没、B6 列への 1 本、ハードの B1、
 * 燃料（radar_twice の帰投の夜の中央値）、漂流（自艇が沈まない夜が dryLiveMin % 以上の行の漂流 ≤ dryMax %。ノーマル・ハード）
 */
export const INTERCEPT_BANDS = {
  b1Sink: [35, 60] as const, b1OwnMax: 15, b1HomeMin: 80, b2Gap: 15, b3OwnMin: 20, b4RamMax: 5, b5OwnMin: 40, b6: [35, 45] as const, dryLiveMin: 20, dryMax: 5,
  hardSink: [35, 65] as const, hardOwnMax: 25, fuel: [15, 35] as const,
} as const;
/** B6 の距離（m。700〜1,100 m の 100 m おき） */
export const INTERCEPT_B6_RANGES_M: readonly number[] = [700, 800, 900, 1000, 1100];

export interface InterceptBandCheck {
  id: string;
  text: string;
  ok: boolean;
}

export interface InterceptB6 {
  shots: number;
  hits: number;
  pct: number;
}

/** B6: 列の艦（setup の列の AI・列の速さ）へ正しく狙った 1 本。解けない組（艦が速い＝真横や後ろからは追いつけない）は数えない（simulateBands と同じ） */
export function interceptB6(data: GameData, s: InterceptSimSetup): InterceptB6 {
  const sim = data.hitRateModel.kpi_measurement.sim;
  const rng = new SeededRng(sim.seed >>> 0);
  const tr = s.transit;
  let shots = 0;
  let hits = 0;
  for (const r of INTERCEPT_B6_RANGES_M) {
    if (r < INTERCEPT_B6_MIN_M || r > INTERCEPT_B6_MAX_M) throw new Error(`B6 の距離 ${r} m は ${INTERCEPT_B6_MIN_M}〜${INTERCEPT_B6_MAX_M} m`);
    for (const bg of simBearings(sim.bearing_step_deg)) {
      for (const e of sim.aim_errors_deg) {
        for (let k = 0; k < sim.reps; k++) {
          const h = columnShot(s.ship, tr.shipAi, tr.speedMps, s.torpedo, s.passRadius2, s.timeScale, s.stepS, r, bg, e, rng);
          if (h === null) break;
          shots++;
          if (h) hits++;
        }
      }
    }
  }
  return { shots, hits, pct: shots > 0 ? (100 * hits) / shots : NaN };
}

const f1 = (x: number): string => (Number.isFinite(x) ? x.toFixed(1) : '—');
const inBand = (x: number, b: readonly [number, number]): boolean => Number.isFinite(x) && x >= b[0] && x <= b[1];

/** 参考の行（帯ではない。L39・L45・L46）: 達成の差（radar_ambush・radar_twice − eye_only）・eye_only の撃沈のうち護衛・radar_ambush の撃沈のうち列・radar_ambush の燃料・radar_dodge の沈没 */
export function interceptNotes(cells: ReadonlyMap<InterceptPolicy, InterceptCell>): string[] {
  const out: string[] = [];
  const amb = cells.get('radar_ambush');
  const twice = cells.get('radar_twice');
  const eye = cells.get('eye_only');
  const dodge = cells.get('radar_dodge');
  if (eye) for (const [k, c] of [['radar_ambush', amb], ['radar_twice', twice]] as const) if (c) out.push(`達成の差 ${k} ${f1(c.achievedPct)}% − eye_only ${f1(eye.achievedPct)}% = ${f1(c.achievedPct - eye.achievedPct)} 点`);
  if (eye) out.push(`eye_only の沈めた艦のうち護衛 ${f1(eye.coverSinkShare)}%`);
  if (amb) out.push(`radar_ambush の沈めた艦のうち列 ${f1(100 - amb.coverSinkShare)}%・帰投の夜の燃料の中央値 ${f1(amb.fuelMed)}%`);
  if (dodge) out.push(`radar_dodge の自艇の沈没 ${f1(dodge.ownSunkPct)}%（そのうち護衛が先に見つけた ${f1(dodge.coverFirstPct)}%）`);
  return out;
}

/** 帯の検査（行の無い帯は出さない）。b6 は interceptB6（ハードは B6 を見ない＝列の艦はノーマルと同じ） */
export function interceptBandChecks(cells: ReadonlyMap<InterceptPolicy, InterceptCell>, hard: boolean, b6: InterceptB6 | null): InterceptBandCheck[] {
  const B = INTERCEPT_BANDS;
  const out: InterceptBandCheck[] = [];
  const add = (id: string, text: string, ok: boolean): void => void out.push({ id, text, ok });
  const amb = cells.get('radar_ambush');
  // 漂流（L46）: 7 行のうち自艇が沈まない夜（100 − 沈没）が dryLiveMin 以上の行（表に無い行は数えない。帰投で選ぶと漂流の夜が帰投を減らして行が外れる）。一番多い行を出す
  const dry = (): void => {
    let worst: InterceptPolicy | null = null;
    let rows = 0;
    for (const p of INTERCEPT_POLICIES) {
      const c = cells.get(p);
      if (!c || !(100 - c.ownSunkPct >= B.dryLiveMin)) continue;
      rows++;
      if (worst === null || c.adriftPct > cells.get(worst)!.adriftPct) worst = p;
    }
    if (worst) add('D', `沈まない夜が ${B.dryLiveMin}% 以上の ${rows} 行の漂流 ≤ ${B.dryMax}%（一番多い ${worst} ${f1(cells.get(worst)!.adriftPct)}%）`, cells.get(worst)!.adriftPct <= B.dryMax);
  };
  if (hard) {
    if (amb) {
      add('H1', `ハード radar_ambush の 1 隻以上撃沈 ${f1(amb.sinkPct)}% は ${B.hardSink[0]}〜${B.hardSink[1]}%`, inBand(amb.sinkPct, B.hardSink));
      add('H2', `ハード radar_ambush の自艇の沈没 ${f1(amb.ownSunkPct)}% ≤ ${B.hardOwnMax}%`, amb.ownSunkPct <= B.hardOwnMax);
    }
    dry();
    return out;
  }
  if (amb) {
    add('B1a', `radar_ambush の 1 隻以上撃沈 ${f1(amb.sinkPct)}% は ${B.b1Sink[0]}〜${B.b1Sink[1]}%`, inBand(amb.sinkPct, B.b1Sink));
    add('B1b', `radar_ambush の自艇の沈没 ${f1(amb.ownSunkPct)}% ≤ ${B.b1OwnMax}%`, amb.ownSunkPct <= B.b1OwnMax);
    add('B1c', `radar_ambush の帰投 ${f1(amb.homePct)}% ≥ ${B.b1HomeMin}%`, amb.homePct >= B.b1HomeMin);
  }
  const eye = cells.get('eye_only');
  if (eye && amb) {
    add('B2a', `eye_only の列の艦の撃沈≥1 ${f1(eye.sinkColumnPct)}% ≤ radar_ambush ${f1(amb.sinkColumnPct)} − ${B.b2Gap} 点`, eye.sinkColumnPct <= amb.sinkColumnPct - B.b2Gap);
    add('B2b', `eye_only の自艇の沈没 ${f1(eye.ownSunkPct)}% ≥ radar_ambush ${f1(amb.ownSunkPct)} ＋ ${B.b2Gap} 点`, eye.ownSunkPct >= amb.ownSunkPct + B.b2Gap);
  }
  const idle = cells.get('idle_lane');
  if (idle) add('B3', `idle_lane の自艇の沈没（衝突・体当たり ${f1(idle.rammedPct)}%・砲火 ${f1(idle.gunSunkPct)}%）${f1(idle.ownSunkPct)}% ≥ ${B.b3OwnMin}%`, idle.ownSunkPct >= B.b3OwnMin);
  const dodge = cells.get('radar_dodge');
  if (dodge) add('B4', `radar_dodge の衝突・体当たり ${f1(dodge.rammedPct)}% ≤ ${B.b4RamMax}%`, dodge.rammedPct <= B.b4RamMax);
  const charge = cells.get('charge');
  if (charge) add('B5', `charge の自艇の沈没 ${f1(charge.ownSunkPct)}% ≥ ${B.b5OwnMin}%`, charge.ownSunkPct >= B.b5OwnMin);
  if (b6) add('B6', `列への正しく狙った 1 本（${INTERCEPT_B6_MIN_M}〜${INTERCEPT_B6_MAX_M} m）${f1(b6.pct)}%（${b6.hits}/${b6.shots}）は ${B.b6[0]}〜${B.b6[1]}%`, inBand(b6.pct, B.b6));
  const twice = cells.get('radar_twice');
  if (twice) add('F', `radar_twice の帰投の夜の燃料の中央値 ${f1(twice.fuelMed)}% は ${B.fuel[0]}〜${B.fuel[1]}%`, inBand(twice.fuelMed, B.fuel));
  dry();
  return out;
}
