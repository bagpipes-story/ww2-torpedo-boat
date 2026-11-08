// v0.7.0（アートと音①：コードで描く絵）の機の絵の定数。S2b の assets/aircraft-art が描く（味方機 tex-aircraft は Boot で 1 回、敵機 tex-aircraft-enemy は
// 任務の世界を作る時に 1 回だけ、その任務の機の種類で描き直す＝spec-v0700 D4。凍結の air-strike-flight が鍵 1 つを使うので鍵は増やさない）。何も import しない。
// 全種を同じ箱（翼幅 AIRCRAFT_SPAN_UNITS 60 × 長さ 48 単位。ui-config）に収めるアイコン。国籍の標識は描かない（2〜3 px で読めず、色の意味と混ざる）。

/** 機の形（平面形）の種類 */
export const AIRCRAFT_ART_SHAPES = ['generic', 'pete', 'jake', 'rufe', 'sbd', 'pb2y', 'f6f', 'f4u'] as const;
export type AircraftArtShape = (typeof AIRCRAFT_ART_SHAPES)[number];

/**
 * data の機の id（enemies.json）→ 形。任務ごとの敵機は data で 1 種類（夜明けの空襲 dawn_strike.aircraft_id・水上機 enemy_aircraft.enemy_id・夜の哨戒機 patrol_air.aircraft_id）。
 * us_01 Pete・us_02 Jake・us_03 Rufe・jp_01 SBD・jp_02 PB2Y（哨戒と空襲）・jp_03／jp_06 F6F・jp_04 F4U。表に無い id と敵機の無い任務（jp_05）は AIRCRAFT_ART_DEFAULT
 */
export const AIRCRAFT_ART_BY_ID: Readonly<Record<string, AircraftArtShape>> = {
  ijn_f1m2_pete: 'pete',
  ijn_seaplane_jake: 'jake',
  ijn_a6m2n_rufe: 'rufe',
  us_henderson_aircraft: 'sbd',
  us_patrol_bomber: 'pb2y',
  us_carrier_aircraft: 'f6f',
  us_tacloban_aircraft: 'f4u',
};
export const AIRCRAFT_ART_DEFAULT: AircraftArtShape = 'generic';
/** 味方機（us_02 の誤射の機。data の注「SBD・TBF 級」。描き直さない） */
export const FRIENDLY_AIRCRAFT_ART: AircraftArtShape = 'sbd';
export function aircraftArtShape(aircraftId: string | null): AircraftArtShape {
  return (aircraftId !== null && AIRCRAFT_ART_BY_ID[aircraftId]) || AIRCRAFT_ART_DEFAULT;
}

/** どの種類も翼幅 ≥ 箱の幅 × この割合（見張りで「十字」に読める） */
export const AIRCRAFT_ART_MIN_SPAN_SHARE = 0.8;

/** 機の絵の乱れの乱数の種（絵だけ。ゲームの乱数とは別） */
export const ART_SEED_AIRCRAFT = 7201;

/** 縁の明るい帯（リム。単位）。機は胴が細い（幅 6〜7 単位）ので艦の 1.5 より細い 1.2（k 1.09 で 1.3 px） */
export const AIRCRAFT_RIM_UNITS = 1.2;
/** 細部（風防・発動機・フロート・尾翼の垂直板）の最小の大きさ（単位。R17） */
export const AIRCRAFT_DETAIL_MIN_UNITS = 2;
/** 風防の幅（単位）と前の明るい帯（単位）。プロペラの円の α。逆ガルの折れの明るい線の幅（単位）と α */
export const AIRCRAFT_CANOPY_W = 3;
export const AIRCRAFT_WINDSHIELD_UNITS = 2;
export const AIRCRAFT_PROP_ALPHA = 0.28;
export const AIRCRAFT_GULL_LINE_W = 2;
export const AIRCRAFT_GULL_LINE_ALPHA = 0.85;
/** 発動機のナセル（翼の前縁の前 3 単位から後ろへ 12 単位・幅 4）と、翼端の小フロート（幅 3・長さ 6・翼端から 3.5 内）、垂直尾翼の板（幅 2・長さ 5） */
export const AIRCRAFT_NACELLE = { ahead: 3, len: 12, w: 4 } as const;
export const AIRCRAFT_TIP_FLOAT = { w: 3, len: 6, inset: 3.5 } as const;
export const AIRCRAFT_FIN = { w: 2, len: 5 } as const;

/**
 * 主翼（平面形）: y＝前縁の付け根（長さの割合）・span＝翼幅（単位。≥ 箱 × AIRCRAFT_ART_MIN_SPAN_SHARE）・root／tip＝付け根と翼端の翼弦（単位）・
 * sweep＝翼端の前縁の後退（単位）・tipRound＝翼端の丸み（面取りの単位。0 で角ばる＝F6F）・gull＝逆ガルの折れ [中心からの x, 折れでの前縁の下がり]（F4U だけ）
 */
export interface AircraftWing {
  readonly y: number;
  readonly span: number;
  readonly root: number;
  readonly tip: number;
  readonly sweep: number;
  readonly tipRound: number;
  readonly gull: readonly [number, number] | null;
}
/**
 * 機の絵の置き方（世界単位。箱は翼幅 60 × 長さ 48・機首が上 y 0・中心線 x 30。y は長さの割合、x は中心線からの単位）。
 * fuselage: [割合, 半幅] を機首から機尾へ（フロートが機首の前へ出る機は 0 より後ろから始まる）。upperWing: 複葉の上翼（Pete）。tail: [位置, 翼幅, 翼弦] 水平尾翼。
 * fins: 垂直尾翼 1 枚（中心線）か双垂直尾翼（PB2Y）。canopy: [前, 後] 風防（割合）。nacelles: 翼の発動機の中心の x（±。PB2Y の 4 発）。propR: 機首のプロペラの円の半径（0 で無し。F6F）。
 * centerFloat: [前, 後, 半幅] 中央の大きなフロート（Pete・Rufe）。twinFloats: [x, 前, 後, 半幅] 双フロート（Jake）。tipFloats: 翼端の小フロート。
 */
export interface AircraftArtLayout {
  readonly fuselage: readonly (readonly [number, number])[];
  readonly wing: AircraftWing;
  readonly upperWing: AircraftWing | null;
  readonly tail: readonly [number, number, number];
  readonly fins: 'single' | 'twin';
  readonly canopy: readonly [number, number] | null;
  readonly nacelles: readonly number[];
  readonly propR: number;
  readonly centerFloat: readonly [number, number, number] | null;
  readonly twinFloats: readonly [number, number, number, number] | null;
  readonly tipFloats: boolean;
}
const NO_GULL = null;
export const AIRCRAFT_ART_LAYOUTS: Readonly<Record<AircraftArtShape, AircraftArtLayout>> = {
  // 既定（表に無い id・敵機の無い任務）: 今の十字に近い単発機
  generic: {
    fuselage: [[0, 1.5], [0.1, 3.2], [0.5, 3], [0.86, 2], [1, 1.5]],
    wing: { y: 0.32, span: 58, root: 11, tip: 6, sweep: 1, tipRound: 1.5, gull: NO_GULL }, upperWing: null,
    tail: [0.86, 22, 5], fins: 'single', canopy: [0.3, 0.5], nacelles: [], propR: 0, centerFloat: null, twinFloats: null, tipFloats: false,
  },
  // 零式水上観測機（us_01）: 複葉（上翼をやや前）・中央の大きなフロートが機首の前へ出る・翼端の小フロート
  pete: {
    fuselage: [[0.12, 1.5], [0.2, 3], [0.55, 2.8], [0.88, 1.8], [1, 1.2]],
    wing: { y: 0.42, span: 52, root: 9, tip: 7, sweep: 0, tipRound: 2, gull: NO_GULL },
    upperWing: { y: 0.28, span: 60, root: 10, tip: 8, sweep: 0, tipRound: 2, gull: NO_GULL },
    tail: [0.86, 20, 5], fins: 'single', canopy: [0.4, 0.58], nacelles: [], propR: 0, centerFloat: [0, 0.72, 2.2], twinFloats: null, tipFloats: true,
  },
  // 零式水偵（us_02 の水上機）: 低翼単葉・双フロート（胴の左右）・長い風防
  jake: {
    fuselage: [[0, 1.6], [0.08, 3], [0.5, 3], [0.88, 1.8], [1, 1.3]],
    wing: { y: 0.34, span: 60, root: 12, tip: 5, sweep: 1, tipRound: 2, gull: NO_GULL }, upperWing: null,
    tail: [0.86, 22, 5], fins: 'single', canopy: [0.26, 0.62], nacelles: [], propR: 0, centerFloat: null, twinFloats: [7, 0.1, 0.78, 2.2], tipFloats: false,
  },
  // 二式水戦（us_03）: 零戦の平面形（丸い翼端）＋中央フロート＋翼端の小フロート
  rufe: {
    fuselage: [[0.1, 1.6], [0.18, 3], [0.5, 2.8], [0.88, 1.8], [1, 1.3]],
    wing: { y: 0.36, span: 60, root: 12, tip: 6, sweep: 0.5, tipRound: 3, gull: NO_GULL }, upperWing: null,
    tail: [0.86, 22, 5], fins: 'single', canopy: [0.33, 0.5], nacelles: [], propR: 0, centerFloat: [0, 0.7, 2.2], twinFloats: null, tipFloats: true,
  },
  // SBD（jp_01・味方機 tex-aircraft）: 直線テーパーの翼（前縁は真っ直ぐ）・長い風防。穴あきフラップは描かない
  sbd: {
    fuselage: [[0, 1.8], [0.08, 3.2], [0.5, 3], [0.88, 1.8], [1, 1.3]],
    wing: { y: 0.34, span: 60, root: 12, tip: 5, sweep: 0, tipRound: 1.5, gull: NO_GULL }, upperWing: null,
    tail: [0.86, 24, 5], fins: 'single', canopy: [0.28, 0.62], nacelles: [], propR: 0, centerFloat: null, twinFloats: null, tipFloats: false,
  },
  // PB2Y（jp_02 の哨戒機と空襲）: 4 発（翼のナセル 4）・艇体・双垂直尾翼・翼端フロート
  pb2y: {
    fuselage: [[0, 2.2], [0.06, 3.6], [0.5, 3.6], [0.85, 2.6], [1, 2.2]],
    wing: { y: 0.3, span: 60, root: 10, tip: 5, sweep: 1, tipRound: 1, gull: NO_GULL }, upperWing: null,
    tail: [0.87, 26, 5], fins: 'twin', canopy: [0.1, 0.2], nacelles: [8, 19], propR: 0, centerFloat: null, twinFloats: null, tipFloats: true,
  },
  // F6F（jp_03・jp_06）: 角ばった翼端・太い胴・プロペラの円（薄い）
  f6f: {
    fuselage: [[0, 2.2], [0.08, 3.6], [0.5, 3.4], [0.88, 2], [1, 1.4]],
    wing: { y: 0.36, span: 60, root: 12, tip: 7, sweep: 1, tipRound: 0, gull: NO_GULL }, upperWing: null,
    tail: [0.86, 24, 5], fins: 'single', canopy: [0.3, 0.46], nacelles: [], propR: 6, centerFloat: null, twinFloats: null, tipFloats: false,
  },
  // F4U（jp_04）: 逆ガル翼（折れの位置に明るい線）・長い機首（翼が後ろ寄り）
  f4u: {
    fuselage: [[0, 1.8], [0.06, 3.2], [0.55, 3], [0.9, 1.8], [1, 1.2]],
    wing: { y: 0.42, span: 60, root: 11, tip: 5, sweep: 0, tipRound: 2, gull: [9, 2] }, upperWing: null,
    tail: [0.87, 22, 5], fins: 'single', canopy: [0.45, 0.58], nacelles: [], propR: 0, centerFloat: null, twinFloats: null, tipFloats: false,
  },
};
