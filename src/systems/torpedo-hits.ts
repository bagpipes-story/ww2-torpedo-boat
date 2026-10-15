// 魚雷の命中・外れの記録と撃沈の開始（v0.4.2 で mission-world から切り出し。中身は v0.4.1 のまま）。
// 命中（不発でなければ）で命中スロー、駆逐艦が沈み始めたら残りの一斉発射を捨て、演出の後に走っている魚雷を外れとして確定する。
import type { ShotRecord } from '../core/hit-rate';
import type { Destroyer } from '../entities/destroyer';
import type { TorpedoLauncher } from './torpedo-launcher';
import type { TorpedoEvents } from './torpedo-pool';
import type { WorldEvents } from './world-events';

/** 記録と命中スローの書き先（MissionWorld がそのまま満たす） */
export interface TorpedoHitWorld {
  readonly shots: ShotRecord[];
  hits: number;
  slowMoLeftS: number;
  readonly setup: { readonly slowMoSeconds: number };
  readonly destroyer: Destroyer | null;
  readonly launcher: TorpedoLauncher;
  resolveRemainingAsMisses(): void;
}

export function torpedoEventsFor(w: TorpedoHitWorld, events: WorldEvents): TorpedoEvents {
  return {
    onHit: (x, y, dud, erratic, rangeAtLaunchM) => {
      w.shots.push({ rangeM: rangeAtLaunchM, hit: true, dud, erratic });
      const d = w.destroyer;
      if (!dud && d) {
        w.hits++;
        w.slowMoLeftS = w.setup.slowMoSeconds;
        if (d.takeHit()) {
          // 沈み始めたら残りの一斉発射は撃たない。演出が終わったら走っている魚雷を外れとして確定する（v0.2 の「撃沈で終了」と同じ記録。艦が無いと通過判定が無く、海域を出るまで決着しないため）
          w.launcher.clearQueue();
          d.playSinking(() => {
            w.resolveRemainingAsMisses();
            events.onDestroyerSunk();
          });
        }
      }
      events.onTorpedoHit(x, y, dud);
    },
    onMiss: (erratic, rangeAtLaunchM) => {
      w.shots.push({ rangeM: rangeAtLaunchM, hit: false, dud: false, erratic });
    },
  };
}
