// 夜の哨戒機の模擬の回帰の帯（v0.6.7。spec-v067 §F.3・§F.4。tests/patrol-air-sim-kit）: 14 kt で止まらない（quiet_dodge~。動く船体は 900 m で見つかる）・14 kt のまま見つかっても 14 kt で転舵
// （quiet_nostop。転舵は全速でないと効かない）・巡航 20 kt で止まらない（cruise~）。N 200・seed 1。
import { describe } from 'vitest';
import { regressionCases } from './patrol-air-sim-kit';

describe('夜の哨戒機の模擬（14 kt で止まらない・14 kt のまま・巡航）', () => {
  regressionCases(['quiet_dodge~', 'quiet_nostop', 'cruise~']);
});
