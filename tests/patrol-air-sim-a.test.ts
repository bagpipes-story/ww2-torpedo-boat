// 夜の哨戒機の模擬の回帰の帯（v0.6.7。spec-v067 §F.3・§F.4。tests/patrol-air-sim-kit）: 設計の行（★）の HUD どおり（hud~: 全速で輪へ・目の捜索は秒読み 0 の 0.3 秒後に止まる・
// 見つかったら全速で投下で転舵）と 14 kt＋止まる（quiet~）、抜け道でない確かめの pulse~（哨戒の間は全速と 14 kt を 2.5 秒ずつ）。N 200・seed 1。
import { describe } from 'vitest';
import { regressionCases } from './patrol-air-sim-kit';

describe('夜の哨戒機の模擬（★ HUD どおり・14 kt と止まる・pulse）', () => {
  regressionCases(['hud~', 'quiet~', 'pulse~']);
});
