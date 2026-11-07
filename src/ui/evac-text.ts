// 空襲下の退避（v0.6.11。jp_03）の HUD の文の道具（S8b で ui/evac-lines から分けた。ui/evac-lines・ui/evac-announce が使い、ui/evac-lines が今までの名で出し直す）:
// 行の幅の上限・文の幅の見積もり（tests/pt-ui-kit の textWidthPx と同じ式）・m:ss・長い場所の名を短く・隊と隠れ場所の呼び名。Phaser も DOM も読まない。確保しない（文を組む時だけ）。
import type { EvacTelemetry } from '../core/evac-telemetry';

/** 2 行目の幅の上限（22 px。W 1280 で左上の時計を左右対称に避けた幅＝tests/pt-ui-kit の LINE2_MAX_PX）・3 行目の上限（20 px。W 1280 で左上の HP の箱 x ≤ 342 に触れない） */
export const EVAC_LINE_MAX_PX = 840;
export const EVAC_STATUS_MAX_PX = 596;
/** 2 行目の字の大きさ px（見積もりに使う） */
export const EVAC_LINE_PX = 22;

/** 文の幅の見積もり px（tests/pt-ui-kit の textWidthPx と同じ式） */
export function jaWidthPx(s: string, px: number): number {
  let w = 0;
  for (const ch of s) w += (ch.charCodeAt(0) < 0x2000 ? 0.602 : 1) * px;
  return w;
}

/** 秒を m:ss（切り上げの整数秒） */
export function mssJa(s: number): string {
  const n = Math.max(0, Math.ceil(s));
  const m = Math.floor(n / 60);
  const r = n - m * 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}

/** 長い場所の名を短く（「屋我地の陰（東）」→「陰（東）」。最後の「の」の後ろ。840 px を超える行だけ） */
export function shortPlaceJa(label: string): string {
  const i = label.lastIndexOf('の');
  return i >= 0 && label.length - i - 1 >= 2 ? label.slice(i + 1) : label;
}

/** 隊の呼び名（data の label_ja。「第4隊」）・隠れ場所の呼び名（「西の壕」） */
export const evacGroupJa = (e: EvacTelemetry, gi: number): string => e.groupLabels[gi] ?? '';
export const evacPlaceJa = (e: EvacTelemetry, s: number): string => e.shelterLabels[s] ?? '';
