// 固定ステップの敵の側の段（v0.6.7 S0 で systems/mission-world の stepFn から移した。順と文は v0.6.6 のまま）: 駆逐艦の隊（destroyer-step）か大発の隊（barge-hunt）→ 米PT の隊 → 機関の不調。
// 自艇・速力帯・発見距離・水上機の後、火災の前に mission-world が 1 回呼ぶ（模擬 core/pt-pass-sim・core/pt-sim-engine と同じ順）。§7: 確保しない。
// v0.6.8 S2: 駆逐艦のいない任務は、大発の隊の後・米PT の前に走っている魚雷を進める（systems/torpedo-free。狙う艦の無い魚雷だけ＝的は空・乱数なし。撃たなければ何も変わらない）。
// v0.6.8 S3（spec-v068 §5.1）: 兵装（systems/arms-step）は最初に 自分の弾倉・艦への機銃 → 閃光（敵の見つける距離。駆逐艦・大発・沿岸砲・米PT が同じステップから読む）、
// 最後に対空（艦艇が先＝砲は 1 つ。撃墜の後は順番を飛ばす。夜明けの空襲の段の前）。押さなければ何も変わらない（乱数も閃光も無い）。
// v0.6.9 S5a（spec-v069 §4.1）: 米PT の隊の段の直後・機関の不調の前に揚陸の段（systems/world-landing の stepAfterPts。jp_04 だけ。ほかの任務は w.landing が null で何もしない）。
import type { BoatState } from '../core/boat-motion';
import type { DestroyerGroup } from './destroyer-group';
import { stepDestroyerSide } from './destroyer-step';
import type { MissionWorld } from './mission-world';
import { stepFreeTorpedoes } from './torpedo-free';

export function stepEnemySide(w: MissionWorld, g: DestroyerGroup | null, dt: number, feelDt: number, boat: BoatState): void {
  w.arms?.stepShips(w, g, dt, feelDt); // 自分の弾倉の交換（jp_06・jp_02）と艦への機銃（駆逐艦の任務だけ。v0.6.8）。撃てば閃光
  w.arms?.applyFlash(w); // 閃光の間は敵の見つける距離を閃光の距離以上に（照明弾の上書きと同じ形。v0.6.8）
  if (g) stepDestroyerSide(w, g, dt, feelDt, boat);
  else if (w.hunt) {
    // 大発の任務（v0.4.2）: 艇の砲 → 大発（発見・逃走・13mm）。3 行目の「煙幕に隠れている」は浮いている大発すべてから隠れているとき
    w.hunt.step(dt, feelDt, w, w.input.gunHeld);
    w.hiddenBySmoke = w.hunt.flotilla.allBlocked;
  }
  if (!g) stepFreeTorpedoes(w, dt, feelDt); // 駆逐艦のいない任務の魚雷（v0.6.8。駆逐艦の任務は destroyer-step が進める）
  w.pts?.step(dt, feelDt, w, w.input.gunHeld); // 米PT の隊（v0.6.3。艇の 13mm が先）は自艇・速力帯・発見距離の後、火災の前（模擬 core/pt-pass-sim と同じ順）。米PT の無い任務は何もしない
  w.landing?.stepAfterPts(w, dt, feelDt); // 米PT の雷撃 → 敵の魚雷 → 揚陸の時計（v0.6.9。jp_04 だけ。systems/world-landing。凍結の隊の段の直後＝模擬 core/landing-sim と同じ順）。揚陸の無い任務は何もしない
  w.engine?.step(w, feelDt); // 機関の熱と不調（v0.6.5）は米PT の段の直後（このステップに固めた赤い線も見る）・火災の前（模擬 core/pt-sim-engine と同じ順・同じ時計）
  w.arms?.stepAir(w, dt, feelDt); // 対空（v0.6.8）は最後: 艦艇の標的が無いときだけ機へ。撃墜の後は毎ステップ順番を飛ばす（夜明けの空襲の段の前）
}
