// 報告の任務（v0.8.2 S4。us_05「スリガオ海峡・最初の接触」の type recon_and_attack）の 2 行目の文（spec-v0820 §4.13 D-H1・D-H2、lead の L42・L43）。時計は ui/recon-lines（ここを再 export する）。
// - 出来事（モード 42。1 回・4 秒）: 戦艦を確認・報告を送った・無線が壊れた・報告を中継した・戦艦／重巡に命中（沈まなかった時）・弾薬庫が誘爆（警告の色）。文は出来事の時に 1 回だけ組む。
// - 常の文（モード 43。ほかの行が無い時と、報告が届く前の「魚雷なし 帰投せよ」の代わり）: 戦艦を目で確かめよ → 追尾 N 秒・あと N 秒 → 中継待ち（届いた後は呼びかけの行「報告済み ・ 帰投せよ」）。
// 数と名はどれも data と setup から（艦種の名詞・追う秒・列の向きと速さ・中継の輪の名＝telemetry の recon）。言葉は見張りの鎖（data の screen_chase_s）と食い違わない
// （「見失うまで追う」と言わない＝lead の L43）。読むのは t.recon と t.magazine の数だけ（艦の AI・本当の位置は読まない＝tests/recon-lines の走査）。Phaser・DOM を読まない。
import { HUD_COLOR_STRONG, HUD_COLOR_WARN } from '../config/hud-text-config';
import type { BoatTelemetry, ReconTelemetry } from '../core/boat-telemetry';
import { CALL_EXPENDED, CALL_SUNK } from '../core/mission-flow';
import { RECON_PENDING, RECON_RELAYED, RECON_SENT, RECON_TRACKING } from '../core/recon-report';
import type { HudLine } from './hud-lines';

/** 出来事の種類（重さの順: 命中 < 確認 < 送った・中継した < 無線 < 誘爆。無線と誘爆は出ている出来事に替わる＝ui/recon-lines） */
export const RECON_LN_NONE = 0, RECON_LN_CAP = 1, RECON_LN_SEEN = 2, RECON_LN_SENT = 3, RECON_LN_RELAYED = 4, RECON_LN_RADIO = 5, RECON_LN_BOOM = 6;
const WEIGHT: readonly number[] = [0, 1, 2, 3, 3, 4, 5];
export const reconLineWeight = (kind: number): number => WEIGHT[kind] ?? 0;

export const reconSeenLineJa = (identifyJa: string, trackS: number): string => `${identifyJa}を確認！ ・ レーダーで追って報告せよ（${trackS} 秒）`;
export const reconSentLineJa = (identifyJa: string, count: number, fleetJa: string): string => `報告を送った！ ${identifyJa} ${count} を含む艦隊 ・ ${fleetJa}`;
export const reconRadioLineJa = (dirJa: string, relayJa: string): string => `無線が壊れた！ 報告は${dirJa}の黄色い輪（${relayJa}）へ`;
export const RECON_RELAYED_JA = '報告を中継した！ ・ 生きて帰れ';
export const reconCapHitLineJa = (nounJa: string, n: number): string => `${nounJa}に命中！ ${n} 本目 ・ まだ沈まない`;
export const RECON_BOOM_JA = '弾薬庫が誘爆！ 戦艦が轟沈した';

/** 常の文（段ごと）。追尾の秒は v0.8.5 IP7 から任務の行（ui/objective-specs の RECON_OBJECTIVE。「追った秒（切り捨て）・あと（切り上げ）」＝和は追う秒） */
export function reconStandingJa(r: ReconTelemetry): string {
  const radio = r.radioBroken ? ' ・ 無線故障' : '';
  if (r.stage === RECON_TRACKING) return `報告: 追尾中 ・ レーダーで追い続けよ${radio}`; // 追った秒・あと何秒は 4 行目の任務の行（v0.8.5 IP7。ui/objective-specs）
  if (r.stage === RECON_PENDING) return `無線故障 ・ ${r.relayJa}（黄色い輪）で中継`;
  if (r.stage === RECON_SENT || r.stage === RECON_RELAYED) return '報告済み ・ 帰投せよ';
  return `報告: ${r.identifyJa}を目で確かめよ（レーダーでは艦種が分からない）${radio}`;
}

/** 常の文のキー（段・無線。追尾の秒は v0.8.5 IP7 から任務の行のキー） */
export function reconStandingKey(r: ReconTelemetry): number {
  return r.stage * 8192 + (r.radioBroken ? 4096 : 0);
}

/** 届いた（送ったか中継した） */
export const reconDeliveredStage = (stage: number): boolean => stage === RECON_SENT || stage === RECON_RELAYED;

/** 常の文（モード 43）を出す: 報告の任務で、呼びかけが無いか、届く前の「魚雷なし」「撃沈！」の呼びかけ（報告が仕事なので常の文が勝つ。燃料少・夜明け近しは呼びかけのまま） */
export function reconStandingShown(t: BoatTelemetry, call: number): boolean {
  const r = t.recon;
  return r !== undefined && (call === 0 || ((call === CALL_EXPENDED || call === CALL_SUNK) && !reconDeliveredStage(r.stage)));
}

/** 呼びかけの行の頭（ui/dawn-lines の callLineText）: 報告が届いた任務の「撃沈！」の代わり（報告の無い任務・届く前は ''） */
export function reconCallJa(t: BoatTelemetry): string {
  return t.recon && reconDeliveredStage(t.recon.stage) ? '報告済み ・ ' : '';
}

/** 2 行目の文が読む時計の部分（ReconLineClock がそのまま満たす） */
export interface ReconLineView { readonly kind: number; readonly text: string }
/** モード 42 の出来事の行（誘爆と無線は警告の色）か、モード 43 の常の文（standing が真）。報告の無い任務は null */
export function reconLine(t: BoatTelemetry, standing: boolean, c: ReconLineView | undefined): HudLine | null {
  if (!t.recon) return null;
  if (standing) return { text: reconStandingJa(t.recon), color: t.recon.stage === RECON_PENDING ? HUD_COLOR_WARN : HUD_COLOR_STRONG };
  if (!c || c.kind === RECON_LN_NONE) return null;
  return { text: c.text, color: c.kind === RECON_LN_BOOM || c.kind === RECON_LN_RADIO ? HUD_COLOR_WARN : HUD_COLOR_STRONG };
}

