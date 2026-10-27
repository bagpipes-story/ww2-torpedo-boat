// 兵装の文（v0.6.8。spec-v068 §4.5）: 右の兵装の上の 1 行（ui/weapon-cue）の文と色。番号は core/arms-cue（世界の systems/arms-step が書く出来事・状態と、HUD だけの EV_TORP_EMPTY）。
// DOM 無し（色は hud-text-config と arms-config。tests が node で読む）。どの文も 22 px で 264 px 以内（tests/arms-lines）。
// 出来事: 狙う艦の無い魚雷（大発の下・PT の下・艦なし）・撃墜（空襲の機は「残り N 機」＝この波の生きている機）・0 本で魚雷を押した。状態（機銃を押している間）: 艦には効かない・対空・射界外・射程に敵なし・煙幕・弾倉交換。
import { ARMS_CUE_DOWN_MS, ARMS_CUE_TORP_MS, CUE_DOWN_COLOR } from '../config/arms-config';
import { HUD_COLOR_STRONG, HUD_COLOR_WARN } from '../config/hud-text-config';
import {
  CUE_NONE,
  EV_DOWN_SEAPLANE,
  EV_DOWN_SORTIE,
  EV_DOWN_STRIKE,
  EV_TORP_BARGE,
  EV_TORP_EMPTY,
  EV_TORP_NOSHIP,
  EV_TORP_PT,
  ST_AA,
  ST_ARC,
  ST_NONE,
  ST_RELOAD,
  ST_SHIP,
  ST_SMOKE,
  type ArmsTelemetry,
} from '../core/arms-cue';

/** 1 行の文と色（毎回作らない: 呼ぶ側は番号・数が変わったときだけ呼ぶ） */
export interface ArmsCueLine {
  text: string;
  color: string;
}

/** 文の番号と数 → 文と色。知らない番号（CUE_NONE を含む）は空の文 */
export function armsCueJa(code: number, n: number): ArmsCueLine {
  switch (code) {
    case EV_TORP_BARGE:
      return { text: '大発の下を抜ける', color: HUD_COLOR_STRONG };
    case EV_TORP_PT:
      return { text: 'PTの下を抜ける', color: HUD_COLOR_STRONG };
    case EV_TORP_NOSHIP:
      return { text: '狙う艦がいない', color: HUD_COLOR_STRONG };
    case EV_DOWN_STRIKE:
      return { text: `敵機 撃墜！ 残り ${n} 機`, color: CUE_DOWN_COLOR };
    case EV_DOWN_SEAPLANE:
      return { text: '水上機 撃墜！', color: CUE_DOWN_COLOR };
    case EV_DOWN_SORTIE:
      return { text: '哨戒機 撃墜！', color: CUE_DOWN_COLOR };
    case EV_TORP_EMPTY:
      return { text: '魚雷は撃ち尽くした', color: HUD_COLOR_STRONG };
    case ST_SHIP:
      return { text: '艦には効かない', color: HUD_COLOR_WARN };
    case ST_AA:
      return { text: '対空 ・ まず当たらない', color: HUD_COLOR_STRONG };
    case ST_ARC:
      return { text: '射界外 ・ 舷側に向けよ', color: HUD_COLOR_STRONG };
    case ST_NONE:
      return { text: '射程に敵なし', color: HUD_COLOR_STRONG };
    case ST_SMOKE:
      return { text: '煙幕で見えない', color: HUD_COLOR_STRONG };
    case ST_RELOAD:
      return { text: `弾倉交換 ・ あと ${n} 秒`, color: HUD_COLOR_STRONG };
    default:
      return { text: '', color: HUD_COLOR_STRONG };
  }
}

/** 出来事の文が魚雷のもの（魚雷のボタンの上に出す。ほかの出来事と状態の文は機銃のボタンの上） */
export function armsCueOverTorpedo(code: number): boolean {
  return code === EV_TORP_BARGE || code === EV_TORP_PT || code === EV_TORP_NOSHIP || code === EV_TORP_EMPTY;
}

/** 出来事の文が撃墜（金色で、出るときに少し大きく飛び出す） */
export function armsCueIsDown(code: number): boolean {
  return code === EV_DOWN_STRIKE || code === EV_DOWN_SEAPLANE || code === EV_DOWN_SORTIE;
}

/** 出来事の文を出すミリ秒（撃墜は長め） */
export function armsCueDurationMs(code: number): number {
  return armsCueIsDown(code) ? ARMS_CUE_DOWN_MS : ARMS_CUE_TORP_MS;
}

/**
 * どの文を出すか（ui/weapon-cue が毎フレーム呼ぶ。Phaser 非依存でテストする。確保しない）: 魚雷を押している間は無し > 出ている出来事 > 状態 > 無し。
 * 世界の出来事は通し番号（evSeq）が変わったときに始め、HUD だけの出来事（EV_TORP_EMPTY）は local で始める。Hud を作ったときの通し番号は出さない
 */
export class ArmsCuePicker {
  /** 選んだ文の番号（CUE_NONE は無し）と数 */
  code = CUE_NONE;
  n = 0;
  /** 撃墜の出来事を始めた（見せる側が飛び出しに使って false に戻す） */
  popPending = false;
  private lastSeq: number;
  private evCode = CUE_NONE;
  private evN = 0;
  private evUntilMs = -Infinity;

  constructor(startSeq: number) {
    this.lastSeq = startSeq;
  }

  /** HUD だけの出来事を今から出す */
  local(code: number, nowMs: number): void {
    this.start(code, 0, nowMs);
  }

  pick(a: Readonly<Pick<ArmsTelemetry, 'evCode' | 'evN' | 'evSeq' | 'stCode' | 'stN'>>, nowMs: number, torpedoHeld: boolean): void {
    if (a.evSeq !== this.lastSeq) {
      this.lastSeq = a.evSeq;
      if (a.evCode !== CUE_NONE) this.start(a.evCode, a.evN, nowMs);
    }
    let code = CUE_NONE;
    let n = 0;
    if (!torpedoHeld) {
      if (nowMs < this.evUntilMs) {
        code = this.evCode;
        n = this.evN;
      } else if (a.stCode !== CUE_NONE) {
        code = a.stCode;
        n = a.stN;
      }
    }
    this.code = code;
    this.n = n;
  }

  private start(code: number, n: number, nowMs: number): void {
    this.evCode = code;
    this.evN = n;
    this.evUntilMs = nowMs + armsCueDurationMs(code);
    if (armsCueIsDown(code)) this.popPending = true;
  }
}
