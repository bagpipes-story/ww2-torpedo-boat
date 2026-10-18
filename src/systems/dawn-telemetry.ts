// 夜明け（v0.6.1。docs/02 §6.7・§6.8）の HUD 向けテレメトリと Result の材料。mission-telemetry から呼ぶ。
// テレメトリの dawn は createTelemetry で 1 回だけ作り（initDawnTelemetry）、refreshDawnTelemetry が毎フレーム 1 回だけ中身を書き換える（§7: 確保しない）。
// 空襲が来ている間は、画面外の「敵機」の矢印（t.planeDx / planeDy。夜の水上機と同じ印）を印の機（strikeFocusPlane。距離で選ばない）で上書きする。
// 世界は構造の型 DawnTelemetryWorld で読む（MissionWorld がそのまま満たす。MissionWorld を import すると Phaser と game-config の DOM がテストの node 型検査に入るため）。
import type { BoatTelemetry } from '../core/boat-motion';
import type { AircraftPose } from '../core/friendly';
import {
  AS_INBOUND,
  AS_RUN,
  AS_T_FALLING,
  AS_T_INBOUND,
  AS_T_NONE,
  AS_T_ORBIT,
  AS_T_REST,
  AS_T_RUN,
  airStrikeActive,
  strikeFocusPlane,
  strikePose,
  strikeRestLeftS,
  strikeThreat,
} from '../core/air-strike';
import { createDawnTelemetry, daylightS, type DawnResult, type DawnTelemetry } from '../core/dawn-air';
import type { WorldDawn } from './world-dawn';
import type { WorldSetup } from './world-setup';

/** テレメトリと Result が読む世界の部分 */
export interface DawnTelemetryWorld {
  /** 固定ステップで実際に進んだ実秒（夜明けの時計） */
  readonly stepTimeS: number;
  readonly setup: WorldSetup;
  readonly dawn: WorldDawn;
}

/** 出発時の dawn（任務で決まる値: 空の持ち主・空襲の有無・機数・方角・機名・空の文・僚艇を狙う機。毎フレームは変えない） */
export function initDawnTelemetry(w: DawnTelemetryWorld): DawnTelemetry {
  const d = createDawnTelemetry();
  const p = w.dawn.strike ? w.dawn.strike.p : null;
  d.air = w.dawn.air;
  d.strikeEnabled = w.setup.airStrike !== null;
  d.count = p ? p.planes : 0;
  d.fromJa = p ? p.fromJa : '';
  d.nameJa = p ? p.nameJa : '';
  d.labelJa = w.setup.dawnAir.labelJa;
  d.vip = p ? p.escortPlanes.includes(true) : false;
  fillDawn(d, w);
  return d;
}

/**
 * 毎フレーム 1 回（refreshTelemetry の水上機の後）: t.dawn を書き、空襲が来ていれば印の機の相対位置で t.planeDx / planeDy を上書きする
 * （scratch に書く。印の機が無ければ水上機の値のまま＝夜明けで去る途中の水上機の矢印は消さない）
 */
export function refreshDawnTelemetry(t: BoatTelemetry, w: DawnTelemetryWorld, scratch: AircraftPose): void {
  fillDawn(t.dawn, w);
  const st = w.dawn.strike;
  if (!st || !airStrikeActive(st.state)) return;
  const i = strikeFocusPlane(st.state, st.p);
  if (i < 0) return;
  const q = strikePose(st.state, st.p, i, scratch);
  t.planeDx = q.dx;
  t.planeDy = q.dy;
}

/** ラッチ・夜明け後の秒と、空襲の段と HUD の材料（段ごとに使う値だけ入れ、ほかは中立の値＝2 行目のキーが無駄に変わらない） */
function fillDawn(d: DawnTelemetry, w: DawnTelemetryWorld): void {
  d.reached = w.dawn.reached;
  d.caughtOutside = w.dawn.caughtOutside;
  d.daylightS = daylightS(w.setup.durationS, w.stepTimeS);
  d.toEscort = false;
  d.plane = -1;
  d.bombsLeft = 0;
  d.restS = NaN;
  d.inboundDistM = NaN;
  const st = w.dawn.strike;
  if (!st) {
    d.threat = AS_T_NONE;
    return;
  }
  const s = st.state;
  const p = st.p;
  const threat = strikeThreat(s);
  d.threat = threat;
  if (threat === AS_T_FALLING) {
    // 落下中の爆弾は常に 1 発（run_gap_s > 落下。検査済み）
    for (let i = 0; i < s.bombs.length; i++) {
      const b = s.bombs[i]!;
      if (!b.active) continue;
      d.plane = b.plane;
      d.toEscort = b.toEscort;
      break;
    }
  } else if (threat === AS_T_RUN) {
    for (let i = 0; i < s.planes.length; i++) {
      const pl = s.planes[i]!;
      if (pl.phase !== AS_RUN) continue;
      d.plane = i;
      d.toEscort = pl.toEscort;
      break;
    }
  } else if (threat === AS_T_INBOUND) {
    let r = Infinity;
    for (let i = 0; i < s.planes.length; i++) {
      const pl = s.planes[i]!;
      if (pl.phase === AS_INBOUND && pl.r < r) r = pl.r;
    }
    d.inboundDistM = r;
  } else if (threat === AS_T_ORBIT) {
    // 次の順番の機と、この波で残っている爆弾（全機の合計）
    d.plane = s.nextRun % p.planes;
    let left = 0;
    for (let i = 0; i < s.planes.length; i++) left += s.planes[i]!.bombsLeft;
    d.bombsLeft = left;
  } else if (threat === AS_T_REST) {
    d.restS = strikeRestLeftS(s, p);
  }
}

/** 終了時に 1 回だけ: MissionResult.dawn（空襲の無い任務は strike: null。転舵の秒は自艇を狙って着弾した爆弾の分だけ写す） */
export function dawnResult(w: DawnTelemetryWorld): DawnResult {
  const st = w.dawn.strike;
  const s = st ? st.state : null;
  return {
    reached: w.dawn.reached,
    caughtOutside: w.dawn.caughtOutside,
    daylightS: daylightS(w.setup.durationS, w.stepTimeS),
    timeLeftAtEndS: Math.max(0, w.setup.durationS - w.stepTimeS),
    air: w.dawn.air,
    labelJa: w.setup.dawnAir.labelJa,
    strike:
      st && s
        ? {
            waves: s.waves,
            bombs: s.bombsDropped,
            bombsAtEscort: s.bombsAtEscort,
            hitsPlayer: s.hitsPlayer,
            hitsEscort: s.hitsEscort,
            damagePlayer: s.damagePlayer,
            dodgeS: s.dodgeS.slice(0, Math.min(s.dodgeCount, s.dodgeS.length)),
            vip: st.p.escortPlanes.includes(true),
          }
        : null,
  };
}
