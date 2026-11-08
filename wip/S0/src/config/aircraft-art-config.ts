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
