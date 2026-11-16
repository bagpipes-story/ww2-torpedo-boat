// 止まった艦（v0.8.1 S2。us_06「オルモック湾の決着」のパロンポン沖の卯月と空知丸。spec-v0810 §3.2 D-S3〜D-S7、lead の L30〜L33）の世界の側: core/anchored-ship の段を隊の艦に当てる
// （systems/destroyer-transit と同じ形）。隊（systems/destroyer-group）が setup.anchors の任務だけ持ち（world-enemies が作った後に 1 回付ける）、作る時に計画の艦をみな止める
// （速さ 0・Destroyer.anchored。位置・針路・当たりの円は作った時のまま＝entities/destroyer が止まっている間は舵・縁・円を飛ばす）。見張り（core/ship-ai の発見・雷跡・seed+17）は止まっていても今のまま走る。
// 固定ステップでは艦を動かした後（systems/destroyer-step。列の段階の後・魚雷・体当たり・反撃の前）に 1 回: stepAnchors が気づいた艦と動き出した艦を決め、動き出した艦は anchored を下ろすだけ
// （Destroyer を作り直さない。以後は us_02 の AI のまま＝速さ 0 から加速）。夜明けは世界の夜明けのラッチ（w.dawn.reached）を渡す＝止まっている駆逐艦は遅れなしで動き出し、隊の withdraw が東へ退かせる。
// 動かない艦（空知丸＝underwayS が null）は一晩じゅう止まったまま: 夜明けの withdraw で retiring は立つが、止まった艦は舵を使わないので退かず、退いた（withdrawn）にもならない
// （隊の allOut・allSettled は空知丸が浮いている間は偽のまま＝夜は帰投・沈没・漂流で終わる。us_06 に fleet_gone_clears は無い）。
// 計画は setup.anchors の先頭 count 隻だけ（S2 は駆逐艦と輸送船。ハードの駆潜艇は S2b が隊の輸送船の後ろに並べる＝それまで計画の尾は使わない。setup は書き換えず、作る時に 1 回切り出す）。
// 記録（気づいた・動き出した世界の秒・背に岸の秒・止まった艦への魚雷）は systems/anchor-telemetry の AnchorLog。Phaser 非依存（艦は構造の型 AnchorShip＝Destroyer が満たす）・乱数なし。確保は constructor だけ。
import type { AnchorSetup } from '../config/anchor-mission-data';
import { anchorHeld, createAnchorState, stepAnchors, type AnchorPlan, type AnchorShipView, type AnchorState } from '../core/anchored-ship';
import { AnchorLog } from './anchor-telemetry';

/** 隊の艦（entities/destroyer の Destroyer がそのまま満たす。止める・動かすは anchored と速さだけ） */
export interface AnchorShip extends AnchorShipView {
  readonly state: { speedMps: number };
  anchored: boolean;
}

/** 固定ステップで読む世界の部分（MissionWorld がそのまま満たす）: 夜明けのラッチ（このステップの頭で立つ）と、記録の材料（固定ステップの時計・自艇・隊の背に岸と最寄りの艦） */
export interface AnchorWorldView {
  readonly dawn: { readonly reached: boolean };
  readonly stepTimeS: number;
  readonly boat: { readonly state: { readonly x: number; readonly y: number } };
  readonly destroyers: { readonly backdrop: { readonly behindMask: number } | null; nearestAfloatIndex(x: number, y: number): number } | null;
}

export class DestroyerAnchor {
  /** 隊の先頭 count 隻の計画（setup.anchors の切り出し。艦 i＝隊の艦 i） */
  readonly plan: AnchorPlan;
  readonly state: AnchorState;
  readonly log: AnchorLog;

  constructor(
    /** 隊の艦の全部（駆逐艦 → 輸送船。隊の ships をそのまま） */
    private readonly ships: readonly AnchorShip[],
    setup: AnchorSetup,
    /** 止まった艦の数（隊の先頭から。駆逐艦と輸送船＝S2 の切り出し） */
    count: number,
  ) {
    this.plan = { underwayS: setup.underwayS.slice(0, Math.min(count, ships.length)), alarmS: setup.alarmS };
    const n = this.plan.underwayS.length;
    this.state = createAnchorState(n);
    this.log = new AnchorLog(n);
    for (let i = 0; i < n; i++) {
      const s = ships[i]!;
      s.state.speedMps = 0;
      s.anchored = true;
    }
  }

  /** 1 固定ステップ（艦を動かし列の段階を当てた後）。feelDt は命中スロー込みの実秒（AI の反応遅れと同じ体感の時計） */
  step(w: AnchorWorldView, feelDt: number): void {
    const st = this.state;
    const up = stepAnchors(st, this.plan, this.ships, feelDt, w.dawn.reached);
    if (up !== 0) for (let i = 0; i < st.n; i++) if ((up & (1 << i)) !== 0) this.ships[i]!.anchored = false;
    this.log.step(st, w);
  }

  /** 隊の艦 i が止まっている（気づく前か、気づいて動き出す前か。計画の外の艦・-1 は偽） */
  held(i: number): boolean {
    return i >= 0 && i < this.state.n && anchorHeld(this.state, i);
  }

  /** 魚雷を 1 本撃った（systems/torpedo-free。targetIndex は狙った最寄りの浮いている艦の添字）・当たった（systems/torpedo-hits。不発でない時） */
  noteLaunch(torpedo: object, targetIndex: number): void {
    this.log.noteLaunch(torpedo, this.held(targetIndex));
  }

  noteHit(torpedo: object): void {
    this.log.noteHit(torpedo);
  }
}
