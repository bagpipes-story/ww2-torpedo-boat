// 対空の模擬の表（v0.6.8。spec-v068 §5.2）: 夜明けの空襲を機銃を押し続けて受けたとき、遊び方ごとに 1 波の発数・射程の中の秒・撃墜（平均と 1 機以上の波の割合）・
// 爆弾・自艇への命中（対空なしと並べる）・波の間隔・止まった回数。中身は src/core/aa-sim.ts（tests/aa-balance.test.ts と同じ）。値は data
// （hit_rate_model.json の anti_aircraft・boats.json の gun_battery・夜明けの空襲の data）。組み立ては systems/air-strike-sim-setup の strikeSimSetup と config/loadout-data の getLoadout。
// 環境変数: N（回数。既定 1000）・P（1 発の撃墜の確率の上書き。既定 data）・R（対空の射程 m の上書き。既定 data）・WAVES（既定 3）・MISSION（既定 us_01,us_03,jp_01,jp_02,jp_06）
// 実行: npx esbuild scripts/aa-sim.ts --bundle --platform=node --format=esm --outfile=<scratch>/aa-sim.mjs && node <scratch>/aa-sim.mjs
import { gameData, getPrototypeMission } from '../src/config/game-data';
import { getLoadout } from '../src/config/loadout-data';
import { AA_SIM_POLICIES, aaSimSetup, aaWaveCell } from '../src/core/aa-sim';
import { strikeSimSetup } from '../src/systems/air-strike-sim-setup';

const num = (k: string): number | undefined => (process.env[k] !== undefined && process.env[k] !== '' ? Number(process.env[k]) : undefined);
const n = num('N') ?? 1000;
const waves = num('WAVES') ?? 3;
const missions = (process.env['MISSION'] ?? 'us_01,us_03,jp_01,jp_02,jp_06')
  .split(',')
  .map((x) => x.trim())
  .filter((x) => x !== '');
const f2 = (x: number): string => x.toFixed(2);
const seed0 = 1000;

const aa0 = getLoadout(gameData, getPrototypeMission(gameData, missions[0]!)).aa;
const aa = { ...aa0, hitChancePerRound: num('P') ?? aa0.hitChancePerRound, rangeM: num('R') ?? aa0.rangeM };
console.log(`[N ${n} × ${waves} 波・seed ${seed0}〜・1 発 ${(aa.hitChancePerRound * 100).toFixed(2)}%（停止・静音。速力帯の spread_factor で割る）・射程 ${aa.rangeM} m・射界は gun_battery.dead_cone_deg] 1 波あたり`);
for (const id of missions) {
  const lo = getLoadout(gameData, getPrototypeMission(gameData, id));
  if (!lo.gun) {
    console.log(`\n${id}: 艇の砲なし`);
    continue;
  }
  const st = strikeSimSetup(gameData, id);
  const s = aaSimSetup(st, lo.gun, aa);
  const g = lo.gun;
  console.log(`\n${id} — ${g.label} ${g.groups.map((x) => x.roundsPerMin).join('+')} 発/分${g.magazine ? `・弾倉 ${g.magazine.rounds} 発／${g.magazine.reloadS} 秒` : ''}・${st.strike.planes} 機 × ${st.strike.bombsPerPlane} 発`);
  for (const pol of AA_SIM_POLICIES) {
    const c = aaWaveCell(s, pol, n, seed0, waves);
    console.log(
      `  ${pol.padEnd(14)} 発 ${c.rounds.toFixed(0).padStart(4)}  射程の中 ${c.inRangeS.toFixed(1).padStart(5)} 秒  撃墜 ${f2(c.downs)}（1 機以上 ${(c.pAtLeast1 * 100).toFixed(0)}%）  爆弾 ${f2(c.bombs)}（対空なし ${f2(c.bombsNoAa)}）  命中 ${f2(c.hits)}（${f2(c.hitsNoAa)}）  波の間隔 ${c.gapMinS.toFixed(1)}〜${c.gapMaxS.toFixed(1)} 秒  止まった ${c.stalls}`,
    );
  }
}
