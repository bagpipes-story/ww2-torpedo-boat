// 魚雷の命中・外れの記録と撃沈の開始（v0.4.2 で mission-world から切り出し。中身は v0.4.1 のまま。v0.4.5 から駆逐艦の隊＝当たった艦を添字で受ける）。
// 命中（不発でなければ）で命中スロー。当たった艦が沈み始め、それで隊のすべてが沈み始めたら残りの一斉発射を捨てる（走っている魚雷の外れの確定は destroyer-step）。
// v0.6.2: 「すべて」は夜明けに退いて海域を出た艦も含む（allOut・allSettled。退く艦がいなければ v0.6.1 と同じ。最後に出たのが退いた艦なら destroyer-step が一斉発射を捨てる）。
// v0.6.2: 艦が退く任務では夜明けのラッチの後に決着した魚雷を通算の命中率に入れない（core/dawn-withdraw の shotKpiTarget。退かない任務と夜明け前は v0.6.1 のまま）。
// v0.6.2 実機 1 回目: すべて出た後に沈む船体へ当たった魚雷（終わり際の当たり。core/torpedo-targets）は命中として記録だけする（onLateHit）。走っている魚雷を外れで
// 確定するのは、最後の艦の演出の終わりではなく、終わり際の当たりの窓が閉じた後（destroyer-step が毎ステップ見る）。
import { shotKpiTarget } from '../core/dawn-withdraw';
import type { ShotRecord } from '../core/hit-rate';
import type { TorpedoState } from '../core/torpedo';
import type { TorpedoEvents } from '../core/torpedo-targets';
import type { WorldEvents } from './world-events';

/** 当たった艦と隊の形（systems/destroyer-group・entities/destroyer がそのまま満たす。v0.6.2 実機 1 回目で構造の型に。tests から作れる） */
export interface TorpedoHitGroup {
  readonly ships: readonly { takeHit(): boolean; playSinking(nowS: number, onDone: () => void): void }[];
  readonly allOut: boolean;
  readonly allSettled: boolean;
}

/** 記録と命中スローの書き先（MissionWorld がそのまま満たす） */
export interface TorpedoHitWorld {
  readonly shots: ShotRecord[];
  hits: number;
  slowMoLeftS: number;
  readonly setup: { readonly slowMoSeconds: number };
  readonly destroyers: TorpedoHitGroup | null;
  readonly launcher: { clearQueue(): void };
  /** 夜明けのラッチと退く向き（systems/world-dawn。退かない任務は NaN）。記録の kpiTarget を決める */
  readonly dawn: { readonly reached: boolean; readonly retireHeadingDeg: number };
  /** 固定ステップで進んだ実秒（沈み始めた時計。終わり際の当たりの窓） */
  readonly stepTimeS: number;
}

/** 記録の 1 行（命中・終わり際の当たり・外れで同じ形） */
function shotOf(w: TorpedoHitWorld, s: TorpedoState, hit: boolean): ShotRecord {
  return { rangeM: s.rangeAtLaunchM, hit, dud: hit && s.dud, erratic: s.erratic, leadErrDeg: s.leadErrDeg, kpiTarget: shotKpiTarget(s.kpiTarget, w.dawn.reached, w.dawn.retireHeadingDeg) };
}

export function torpedoEventsFor(w: TorpedoHitWorld, events: WorldEvents): TorpedoEvents {
  return {
    onHit: (target, x, y, s) => {
      const dud = s.dud;
      w.shots.push(shotOf(w, s, true));
      const g = w.destroyers;
      const d = g ? g.ships[target] : undefined;
      if (!dud && g && d) {
        w.hits++;
        w.slowMoLeftS = w.setup.slowMoSeconds;
        if (d.takeHit()) {
          d.playSinking(w.stepTimeS, () => {
            // 最後の艦の演出が終わった（走っている魚雷の外れの確定は終わり際の当たりの窓の後。destroyer-step。v0.6.2 実機 1 回目までは、ここで確定していた）
            if (g.allSettled) events.onDestroyerSunk();
          });
          // すべて沈み始めたら残りの一斉発射は撃たない（残りの艦がいれば撃ち続けられる）
          if (g.allOut) w.launcher.clearQueue();
        }
      }
      events.onTorpedoHit(x, y, dud);
    },
    // 終わり際の当たり（v0.6.2 実機 1 回目）: 記録と爆発だけ。艦の被弾・撃沈・命中スロー・一斉発射の破棄は触らない（すべて出た後なので艦・乱数・AI は変わらない）
    onLateHit: (_target, x, y, s) => {
      w.shots.push(shotOf(w, s, true));
      if (!s.dud) w.hits++;
      events.onTorpedoHit(x, y, s.dud);
    },
    onMiss: (s) => {
      w.shots.push(shotOf(w, s, false));
    },
  };
}
