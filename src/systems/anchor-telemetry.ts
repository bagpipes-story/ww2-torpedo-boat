// 止まった艦と暗い岸を背にの記録とテレメトリ（v0.8.1 S2。us_06。spec-v0810 §3.2 D-S4・§3.3 D-B4・§3.7 D-O4 の材料、lead の L37）。AnchorLog は systems/destroyer-anchor が持ち、止まった艦の段の後に 1 回 step:
// 艦ごとの気づいた・動き出した世界の秒（core/anchored-ship の時計は体感＝命中スロー込みなので、ビットが立ったステップの stepTimeS を別に刻む）と通算、最寄りの浮いている艦（enemy.focus と同じ nearestAfloatIndex）に
// 対して背に岸が効いていた世界の秒、止まった艦へ撃った魚雷とその命中（印は world-radar の目で見えない魚雷と同じ WeakSet。発射は systems/torpedo-free、命中は systems/torpedo-hits が渡す＝数えるだけ）。
// テレメトリは数を写すだけ（配列は参照）・setup.anchors の無い任務は鍵ごと出ない。世界・艦・AI には何も書かない。Phaser 非依存・乱数なし。確保は作る時と発射の時の印だけ。HUD の文と Result の行は S4。
import type { AnchorState } from '../core/anchored-ship';
import type { AnchorTelemetry } from '../core/boat-telemetry';
import type { AnchorWorldView } from './destroyer-anchor';

export class AnchorLog {
  /** 艦ごとの気づいた・動き出した世界の秒（固定ステップの時計。NaN は未だ） */
  readonly noticedAtS: Float64Array;
  readonly underwayAtS: Float64Array;
  /** 気づいた・動き出した艦の通算・最寄りの艦に対して背に岸が効いている（このステップ）とその秒の和・止まった艦へ撃った魚雷とその命中（不発を除く） */
  noticedCount = 0;
  underwayCount = 0;
  backdropOn = false;
  backdropS = 0;
  heldShots = 0;
  heldHits = 0;
  private lastS = 0;
  private readonly held = new WeakSet<object>();

  constructor(n: number) {
    this.noticedAtS = new Float64Array(n).fill(NaN);
    this.underwayAtS = new Float64Array(n).fill(NaN);
  }

  /** 1 固定ステップ（stepAnchors の後。st の noticed・underway はこのステップのビット） */
  step(st: AnchorState, w: AnchorWorldView): void {
    const now = w.stepTimeS;
    for (let i = 0; i < st.n; i++) {
      if ((st.noticed & (1 << i)) !== 0) { this.noticedAtS[i] = now; this.noticedCount++; }
      if ((st.underway & (1 << i)) !== 0) { this.underwayAtS[i] = now; this.underwayCount++; }
    }
    const g = w.destroyers;
    const bd = g ? g.backdrop : null;
    const f = g && bd ? g.nearestAfloatIndex(w.boat.state.x, w.boat.state.y) : -1;
    this.backdropOn = bd !== null && f >= 0 && (bd.behindMask & (1 << f)) !== 0;
    if (this.backdropOn) this.backdropS += now - this.lastS;
    this.lastS = now;
  }

  /** 魚雷を 1 本撃った（狙える艦がある間の発射。held は発射の時の最寄りの浮いている艦が止まっていたか）・当たった（不発でない。終わり際の当たりも） */
  noteLaunch(torpedo: object, held: boolean): void { if (held) { this.held.add(torpedo); this.heldShots++; } }
  noteHit(torpedo: object): void { if (this.held.has(torpedo)) this.heldHits++; }
}

type AnchorTelemetryWorld = { readonly destroyers: { readonly anchors: { readonly state: AnchorState; readonly log: AnchorLog } | null } | null };

/** 出発時の anchor（止まった艦の任務だけ鍵が出る。無い任務は {}＝ほかの任務のテレメトリは今のまま） */
export function anchorTelemetryPart(w: AnchorTelemetryWorld): { anchor?: AnchorTelemetry } {
  const a = w.destroyers ? w.destroyers.anchors : null;
  if (!a) return {};
  const t: AnchorTelemetry = { stage: a.state.stage, reason: a.state.reason, noticedAtS: a.log.noticedAtS, underwayAtS: a.log.underwayAtS, noticedCount: 0, underwayCount: 0, backdropOn: false, backdropS: 0, heldShots: 0, heldHits: 0 };
  refreshAnchorTelemetry(t, w);
  return { anchor: t };
}

/** 毎フレーム 1 回（鍵の無い任務は何もしない。確保しない） */
export function refreshAnchorTelemetry(t: AnchorTelemetry | undefined, w: AnchorTelemetryWorld): void {
  const l = w.destroyers?.anchors?.log;
  if (!t || !l) return;
  t.noticedCount = l.noticedCount;
  t.underwayCount = l.underwayCount;
  t.backdropOn = l.backdropOn;
  t.backdropS = l.backdropS;
  t.heldShots = l.heldShots;
  t.heldHits = l.heldHits;
}
