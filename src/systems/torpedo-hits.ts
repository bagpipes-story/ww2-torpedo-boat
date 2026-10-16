// 魚雷の命中・外れの記録と撃沈の開始（v0.4.2 で mission-world から切り出し。中身は v0.4.1 のまま。v0.4.5 から駆逐艦の隊＝当たった艦を添字で受ける）。
// 命中（不発でなければ）で命中スロー。当たった艦が沈み始め、それで隊のすべてが沈み始めたら残りの一斉発射を捨て、最後の演出の後に走っている魚雷を外れとして確定する。
import type { ShotRecord } from '../core/hit-rate';
import type { DestroyerGroup } from './destroyer-group';
import type { TorpedoLauncher } from './torpedo-launcher';
import type { TorpedoEvents } from './torpedo-pool';
import type { WorldEvents } from './world-events';

/** 記録と命中スローの書き先（MissionWorld がそのまま満たす） */
export interface TorpedoHitWorld {
  readonly shots: ShotRecord[];
  hits: number;
  slowMoLeftS: number;
  readonly setup: { readonly slowMoSeconds: number };
  readonly destroyers: DestroyerGroup | null;
  readonly launcher: TorpedoLauncher;
  resolveRemainingAsMisses(): void;
}

export function torpedoEventsFor(w: TorpedoHitWorld, events: WorldEvents): TorpedoEvents {
  return {
    onHit: (target, x, y, dud, erratic, rangeAtLaunchM) => {
      w.shots.push({ rangeM: rangeAtLaunchM, hit: true, dud, erratic });
      const g = w.destroyers;
      const d = g ? g.ships[target] : undefined;
      if (!dud && g && d) {
        w.hits++;
        w.slowMoLeftS = w.setup.slowMoSeconds;
        if (d.takeHit()) {
          d.playSinking(() => {
            // 最後の艦の演出が終わったら、走っている魚雷を外れとして確定する（v0.2 の「撃沈で終了」と同じ記録。艦が無いと通過判定が無く、海域を出るまで決着しないため）
            if (!g.allSunk) return;
            w.resolveRemainingAsMisses();
            events.onDestroyerSunk();
          });
          // すべて沈み始めたら残りの一斉発射は撃たない（残りの艦がいれば撃ち続けられる）
          if (g.allSinking) w.launcher.clearQueue();
        }
      }
      events.onTorpedoHit(x, y, dud);
    },
    onMiss: (erratic, rangeAtLaunchM) => {
      w.shots.push({ rangeM: rangeAtLaunchM, hit: false, dud: false, erratic });
    },
  };
}
