// 実機 1 回目の調べ: 海域の中（out でない）の艦が南北の縁の外（陸）へ出る夜を数える（迎撃の模擬＝世界と同じ core）
import { gameData } from '/home/user/ww2-torpedo-boat/src/config/game-data';
import { runInterceptTrial } from '/home/user/ww2-torpedo-boat/src/core/intercept-sim';
import { INTERCEPT_POLICIES } from '/home/user/ww2-torpedo-boat/src/core/intercept-sim-policy';
import { interceptNightSetup } from '/home/user/ww2-torpedo-boat/src/systems/intercept-sim-setup';
const N = Number(process.env.N ?? 200); const hard = process.env.HARD === '1';
for (const pol of INTERCEPT_POLICIES) {
  let nights = 0, colN = 0, covN = 0, maxOver = 0; const modes = new Map<string, number>();
  for (let seed = 1; seed <= N; seed++) {
    const s = interceptNightSetup(gameData, seed, hard);
    const H = s.bounds.height; let hit = false, col = false, cov = false;
    runInterceptTrial(s, pol, seed, (w) => {
      w.ships.forEach((sh) => {
        if (sh.out) return;
        const over = Math.max(-sh.state.y, sh.state.y - H);
        if (over > 0) { hit = true; if (sh.transitShip) col = true; else cov = true; maxOver = Math.max(maxOver, over); const k = `${sh.transitShip ? 'col' : 'cover'}:${sh.ai.mode}${sh.ai.retiring ? '+ret' : ''}`; modes.set(k, (modes.get(k) ?? 0) + 1); }
      });
    });
    if (hit) nights++; if (col) colN++; if (cov) covN++;
  }
  console.log(`${pol.padEnd(20)} nights on land ${nights}/${N} (column ${colN}, cover ${covN}) max beyond edge ${maxOver.toFixed(0)} m  steps by mode ${[...modes].map(([k, v]) => `${k} ${v}`).join(', ')}`);
}
