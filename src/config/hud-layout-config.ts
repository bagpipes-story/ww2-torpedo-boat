// 右下の兵装と右端の技能の置き方（v0.6.8。spec-v068 §1.2・§4.1・§4.2、実機 1 回目の直し spec-ip1 D5〜D7。論理 px、高さ 720・幅 W 1280〜1584）。重なりの検査は tests/hud-layout。
// 兵装は全任務で同じ位置（実機 1 回目「主兵装である魚雷が右側。機銃が魚雷の左側側に固定」）: 右下の角（列 1・R64）に魚雷、そのすぐ左（列 2・R56）に機銃、扇は魚雷の下（v0.5.1 のユーザーの要望
// 「発射ボタンの下に小さく」。見た目はホームバーの帯 682〜720 より上）。missions_seed の main_weapon は置き場所も大きさも決めない（Briefing の順と 2 行目の「魚雷なし／大発なし」だけ）。
// 技能（R44）は右端に縦一列（実機 1 回目「魚雷の上に並べていた変更前のように」。右端を魚雷の右端 W − 24 に揃えた x = W − 68）、上から 煙幕・消火・見張り・識別の決まった段（y 68・180・292・404）。
// 無いボタン（日本の艇の煙幕・味方機の来ない夜の識別）の段は空ける（v0.6.7 も位置を詰めなかった）。
// 速力・機関の表示の右端は W − 312、端の印の右の余白 352、つまむ帯は W/2〜W − 304。何も import しない（tests が node で読んでも DOM を引かない。title-layout-config と同じ）。

export const HUD_LAYOUT_H = 720;
export const HUD_LAYOUT_M = 24;
/** 円の半径: 魚雷（右下の角）・機銃（その左）・技能（右端の縦一列。実機 1 回目に 48 → 44。直径 88＝iPhone 15 で約 48 pt・SE で約 46 pt、Apple の 44 pt 以上） */
export const R_TORPEDO = 64;
export const R_GUN = 56;
export const R_SKILL = 44;
/** 魚雷の円の縁 → 機銃の円の縁 */
export const COL_GAP = 24;
/** 扇（v0.5.1 の見た目のまま）: 高さ、見た目の上端（642〜682）、魚雷の円の下端 → 扇の上端、当たりの上端（638〜720 の枠の下端まで） */
export const SPREAD_H = 40;
export const SPREAD_TOP_Y = 642;
export const SPREAD_GAP = 18;
export const SPREAD_HIT_TOP_Y = 638;
/** 技能の縦一列: 円の縁と縁の間（段の中心の間 = 88 + 24 = 112）と、ボタンの文字 px（機銃と同じ 20。22 は R44 には重い） */
export const SKILL_GAP = 24;
export const SKILL_FONT_PX = 20;
/** 兵装の上の 1 行の文（ui/weapon-cue）: 文字 px・最大の幅・下端と兵装の円の間 */
export const CUE_PX = 22;
export const CUE_MAX_W = 264;
export const TEXT_GAP = 8;
/** TorpedoButton・HoldButton の当たり = テクスチャの枠 (ceil(2R·k)+4)/k ≒ 円 ± 1.8 */
export const HIT_PAD = 1.8;
/** 当たりの最小（44 pt） */
export const MIN_HIT = 81;
/** 端の印の文の半幅（4 桁の「帰投 9900 m」18 px の 111.85 px の半分を切り上げ。地図は 6 km 四方までなので 4 桁まで。52 だと文の右端がパネルの左 − 4 px＝レビュー ux-marker-cue-4px）・
 * つまむ帯と兵装の間・舵の棒の半幅・端の印の文字 px（速力の表示の避ける角の左端） */
export const MARKER_LABEL_HALF = 56;
export const PINCH_GAP = 16;
export const RUDDER_HALF = 120;
export const MARKER_PX = 18;
/** ホームバーの帯の上端 */
export const HOME_BAND_Y = 682;

export type SkillKind = 'smoke' | 'extinguish' | 'lookout' | 'identify';
/** 技能の段の並び（上から。段 i の中心 y は skillSlotY(i)。無いボタンの段は空ける）とボタンの文字 */
export const SKILL_ORDER: readonly SkillKind[] = ['smoke', 'extinguish', 'lookout', 'identify'];
const SKILL_LABELS: Readonly<Record<SkillKind, string>> = { smoke: '煙幕', extinguish: '消火', lookout: '見張り', identify: '識別' };

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
  /** 列 1（右下の角・魚雷）・列 2（機銃）の中心 x */
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
  /** 技能（右端の縦一列。SKILL_ORDER の順で、在るものだけ） */
  skills: PanelSkill[];
  speedRight: number;
  panelLeft: number;
}

/** 列の中心: C1 = W − 88（魚雷）、C2 = C1 − 64 − 24 − 56 = W − 232（機銃） */
export function panelColumns(W: number): { c1: number; c2: number } {
  const c1 = W - HUD_LAYOUT_M - R_TORPEDO;
  return { c1, c2: c1 - R_TORPEDO - COL_GAP - R_GUN };
}

/** パネルの左端（W − 288。機銃の円の左端） */
export function panelLeftX(W: number): number {
  return panelColumns(W).c2 - R_GUN;
}

/** 速力・機関の表示の右端（W − 312） */
export function speedHudRightX(W: number): number {
  return panelLeftX(W) - HUD_LAYOUT_M;
}

/** 端の印の右の余白（352。印の文の右端 ≤ パネルの左端 − 8） */
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

/** 技能の縦一列の中心 x（W − 68。円の右端を魚雷の右端 W − 24 に揃える） */
export function skillColumnX(W: number): number {
  return W - HUD_LAYOUT_M - R_SKILL;
}

/** 技能の段 i（0 から。SKILL_ORDER の順）の中心 y: 24 + 44 + i·(88 + 24) = 68・180・292・404 */
export function skillSlotY(i: number): number {
  return HUD_LAYOUT_M + R_SKILL + i * (2 * R_SKILL + SKILL_GAP);
}

/**
 * パネルの置き方（HUD を作るとき 1 回）。has は煙幕・識別のボタンがあるか（消火と見張りはいつも）。どの任務も兵装の位置と大きさは同じ（v0.6.8 実機 1 回目）。
 * 魚雷の中心 y = 642 − 18 − 64 = 560、機銃の中心 y = round((魚雷の上端 496 + 扇の下端 682) / 2) = 589（v0.6.8 の us_02 で試した位置）
 */
export function panelLayout(W: number, has: { smoke: boolean; identify: boolean }): PanelLayout {
  const { c1, c2 } = panelColumns(W);
  const torpY = SPREAD_TOP_Y - SPREAD_GAP - R_TORPEDO;
  const gunY = Math.round((torpY - R_TORPEDO + SPREAD_TOP_Y + SPREAD_H) / 2);
  const sx = skillColumnX(W);
  const skills: PanelSkill[] = [];
  for (let i = 0; i < SKILL_ORDER.length; i++) {
    const kind = SKILL_ORDER[i]!;
    if ((kind === 'smoke' && !has.smoke) || (kind === 'identify' && !has.identify)) continue;
    skills.push({ kind, label: SKILL_LABELS[kind], x: sx, y: skillSlotY(i) });
  }
  const spreadW = 2 * R_TORPEDO;
  return {
    W,
    c1,
    c2,
    torpedo: { x: c1, y: torpY, r: R_TORPEDO },
    gun: { x: c2, y: gunY, r: R_GUN },
    spread: { x: c1, y: SPREAD_TOP_Y + SPREAD_H / 2, w: spreadW, h: SPREAD_H, hit: { x0: c1 - spreadW / 2, y0: SPREAD_HIT_TOP_Y, x1: c1 + spreadW / 2, y1: HUD_LAYOUT_H } },
    salvoLabel: { x: c1, bottom: torpY - R_TORPEDO - TEXT_GAP },
    cue: { left: panelLeftX(W), right: W - HUD_LAYOUT_M, bottom: torpY - R_TORPEDO - TEXT_GAP, px: CUE_PX, maxW: CUE_MAX_W },
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
