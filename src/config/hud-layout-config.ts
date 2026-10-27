// 右側の 2 列の兵装パネルの置き方（v0.6.8。spec-v068 §1.2・§4.1・§4.2。論理 px、高さ 720・幅 W 1280〜1584）。spec の layout.mjs を 1 対 1 に写した（重なりの検査は tests/hud-layout）。
// 右下の角（列 1）に主兵装（R64。v0.6.7 と同じ位置の類）、そのすぐ左（列 2）にもう一つの兵装（R56）、扇は魚雷の下（v0.5.1 のユーザーの要望「発射ボタンの下に小さく」。
// 見た目はホームバーの帯 682〜720 より上）、技能（R48）はその上の 2 段（1 段目 y 400: 外 = 煙幕（米）／見張り（日）・内 = 消火、2 段目 y 280（米だけ）: 外 = 識別・内 = 見張り）。
// 速力・機関の表示の右端は W − 312、端の印の右の余白 348、つまむ帯は W/2〜W − 304。何も import しない（tests が node で読んでも DOM を引かない。title-layout-config と同じ）。

export const HUD_LAYOUT_H = 720;
export const HUD_LAYOUT_M = 24;
/** 円の半径: 主兵装・副兵装・技能 */
export const R_PRIMARY = 64;
export const R_SECONDARY = 56;
export const R_SKILL = 48;
/** 主兵装の円の縁 → 副兵装の円の縁 */
export const COL_GAP = 24;
/** 扇（v0.5.1 の見た目のまま）: 高さ、見た目の上端（642〜682）、魚雷の円の下端 → 扇の上端、当たりの上端（638〜720 の枠の下端まで） */
export const SPREAD_H = 40;
export const SPREAD_TOP_Y = 642;
export const SPREAD_GAP = 18;
export const SPREAD_HIT_TOP_Y = 638;
/** 技能の 1 段目の中心と段の間（2 段目の中心 = 400 − 96 − 24 = 280） */
export const SKILL_ROW1_Y = 400;
export const SKILL_ROW_GAP = 24;
/** 兵装の上の 1 行の文（ui/weapon-cue）: 文字 px・最大の幅・下端と兵装の円の間 */
export const CUE_PX = 22;
export const CUE_MAX_W = 264;
export const TEXT_GAP = 8;
/** TorpedoButton・HoldButton の当たり = テクスチャの枠 (ceil(2R·k)+4)/k ≒ 円 ± 1.8 */
export const HIT_PAD = 1.8;
/** 当たりの最小（44 pt） */
export const MIN_HIT = 81;
/** 端の印の文の半幅・つまむ帯と兵装の間・舵の棒の半幅・端の印の文字 px（速力の表示の避ける角の左端） */
export const MARKER_LABEL_HALF = 52;
export const PINCH_GAP = 16;
export const RUDDER_HALF = 120;
export const MARKER_PX = 18;
/** ホームバーの帯の上端 */
export const HOME_BAND_Y = 682;

export type PanelPrimary = 'torpedo' | 'guns';
export type SkillKind = 'smoke' | 'extinguish' | 'lookout' | 'identify';

export interface PanelCircle {
  x: number;
  y: number;
  r: number;
}

export interface PanelRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface PanelSkill {
  kind: SkillKind;
  label: string;
  x: number;
  y: number;
}

export interface PanelLayout {
  W: number;
  primary: PanelPrimary;
  /** 列 1（右下の角）・列 2 の中心 x */
  c1: number;
  c2: number;
  torpedo: PanelCircle;
  gun: PanelCircle;
  /** 扇: 中心・幅・高さ（見た目）と当たり */
  spread: { x: number; y: number; w: number; h: number; hit: PanelRect };
  /** 「一斉 N 本」の文の中心 x と下端 */
  salvoLabel: { x: number; bottom: number };
  /** 兵装の上の 1 行の文の帯（左・右・下端・文字 px・最大の幅） */
  cue: { left: number; right: number; bottom: number; px: number; maxW: number };
  skills: PanelSkill[];
  speedRight: number;
  panelLeft: number;
}

/** 列の中心: C1 = W − 88、C2 = C1 − 64 − 24 − 56 = W − 232 */
export function panelColumns(W: number): { c1: number; c2: number } {
  const c1 = W - HUD_LAYOUT_M - R_PRIMARY;
  return { c1, c2: c1 - R_PRIMARY - COL_GAP - R_SECONDARY };
}

/** パネルの左端（W − 288） */
export function panelLeftX(W: number): number {
  return panelColumns(W).c2 - R_SECONDARY;
}

/** 速力・機関の表示の右端（W − 312） */
export function speedHudRightX(W: number): number {
  return panelLeftX(W) - HUD_LAYOUT_M;
}

/** 端の印の右の余白（348。印の文の右端 ≤ パネルの左端 − 8） */
export function markerRightMargin(W: number): number {
  return W - panelLeftX(W) + TEXT_GAP + MARKER_LABEL_HALF;
}

/** つまむ帯の右端（W − 304） */
export function pinchMaxX(W: number): number {
  return panelLeftX(W) - PINCH_GAP;
}

/** 速力の表示の避ける角の左端（W − 624。舵の棒 + 印の文字 4 つ分） */
export function speedHudKeepLeft(W: number): number {
  return speedHudRightX(W) - 2 * RUDDER_HALF - 4 * MARKER_PX;
}

/**
 * パネルの置き方（HUD を作るとき 1 回）。primary は右下の角の兵装（mission.mainWeapon。jp_02 の none は呼ぶ側が 'guns' に）、has は煙幕・識別のボタンがあるか。
 * 魚雷の中心 y = 642 − 18 − R（主 560・副 568）、機銃の中心 y = 主 632（v0.6.7 の位置）・副 round((魚雷の上端 + 682) / 2) = 589
 */
export function panelLayout(W: number, primary: PanelPrimary, has: { smoke: boolean; identify: boolean }): PanelLayout {
  const { c1, c2 } = panelColumns(W);
  const torpP = primary === 'torpedo';
  const torpR = torpP ? R_PRIMARY : R_SECONDARY;
  const torpX = torpP ? c1 : c2;
  const torpY = SPREAD_TOP_Y - SPREAD_GAP - torpR;
  const gunR = torpP ? R_SECONDARY : R_PRIMARY;
  const gunX = torpP ? c2 : c1;
  const gunY = torpP ? Math.round((torpY - torpR + SPREAD_TOP_Y + SPREAD_H) / 2) : HUD_LAYOUT_H - HUD_LAYOUT_M - R_PRIMARY;
  const r1 = SKILL_ROW1_Y;
  const r2 = r1 - 2 * R_SKILL - SKILL_ROW_GAP;
  const skills: PanelSkill[] = [];
  if (has.smoke) skills.push({ kind: 'smoke', label: '煙幕', x: c1, y: r1 });
  skills.push({ kind: 'extinguish', label: '消火', x: c2, y: r1 });
  skills.push({ kind: 'lookout', label: '見張り', x: has.smoke ? c2 : c1, y: has.smoke ? r2 : r1 });
  if (has.identify) skills.push({ kind: 'identify', label: '識別', x: c1, y: r2 });
  const spreadW = 2 * torpR;
  return {
    W,
    primary,
    c1,
    c2,
    torpedo: { x: torpX, y: torpY, r: torpR },
    gun: { x: gunX, y: gunY, r: gunR },
    spread: { x: torpX, y: SPREAD_TOP_Y + SPREAD_H / 2, w: spreadW, h: SPREAD_H, hit: { x0: torpX - spreadW / 2, y0: SPREAD_HIT_TOP_Y, x1: torpX + spreadW / 2, y1: HUD_LAYOUT_H } },
    salvoLabel: { x: torpX, bottom: torpY - torpR - TEXT_GAP },
    cue: { left: panelLeftX(W), right: W - HUD_LAYOUT_M, bottom: SPREAD_TOP_Y - SPREAD_GAP - 2 * R_PRIMARY - TEXT_GAP, px: CUE_PX, maxW: CUE_MAX_W },
    skills,
    speedRight: speedHudRightX(W),
    panelLeft: panelLeftX(W),
  };
}

/** 兵装の上の 1 行の文の中心 x: その兵装の中心を、幅 textW の文が帯 [cue.left, cue.right] に収まるように寄せる（textW 0 なら中心を帯に収めるだけ） */
export function cueAnchorX(L: PanelLayout, which: 'torpedo' | 'gun', textW: number = 0): number {
  const x = which === 'torpedo' ? L.torpedo.x : L.gun.x;
  const half = Math.min(textW, L.cue.right - L.cue.left) / 2;
  const lo = L.cue.left + half;
  const hi = L.cue.right - half;
  return x < lo ? lo : x > hi ? hi : x;
}
