// v0.7.0 S2b（アートと音①：コードで描く絵。spec-v0700 §4.3・決め D4）: 機の絵。味方機 tex-aircraft（us_02 の誤射の機＝SBD 級・薄い青）は Boot で 1 回、敵機 tex-aircraft-enemy は Boot で
// 既定の形を 1 回描き、任務の世界を作る時に paintMissionAircraft がその任務の機の種類（data の id → aircraft-art-config の表）で 1 回だけ描き直す（66×53 px。1 任務 1 回）。
// 凍結の air-strike-flight・patrol-air・enemy-seaplane・world-arms（残骸）が同じ鍵 1 つを使うので鍵は増やさない。generateTexture は既存の鍵の canvas へは消さずに重ねる
// （Phaser 3.90 の Graphics.generateTexture）ので、先に canvas を clearRect してから描く（refresh は generateTexture の中）。寸法・原点は placeholder と同じ（art-dims の aircraftTexSize）。
// generateAircraftTexture は aircraft-placeholder と同じ名前・引数（Boot の 2 行は変えない＝R14。import の行だけこのファイルに）。色の意味（敵＝薄い赤・味方＝薄い青）は陣営のパレット。
import type Phaser from 'phaser';
import { RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import { AIRCRAFT_LENGTH_UNITS, AIRCRAFT_SPAN_UNITS, HOME_COLOR } from '../config/ui-config';
import { PALETTE_ALLY, PALETTE_ALLY_MID, PALETTE_ENEMY, PALETTE_ENEMY_MID, type HullPalette } from '../config/boat-art-config';
import { AIRCRAFT_ART_DEFAULT, AIRCRAFT_ART_LAYOUTS, FRIENDLY_AIRCRAFT_ART, aircraftArtShape, type AircraftArtShape } from '../config/aircraft-art-config';
import type { PrototypeMission } from '../config/mission-data';
import { aircraftTexSize } from './art-dims';
import { paintTexture, type ArtPen } from './art-pen';
import { aircraftShape, type AircraftShape, type AircraftTone } from './aircraft-shapes';

function toneColor(tone: AircraftTone, pal: HullPalette, mid: number): number {
  switch (tone) {
    case 'rim': return pal.rim;
    case 'skin': return pal.deck;
    case 'mid': return mid;
    case 'detail': return pal.detail;
    default: return pal.highlight;
  }
}

/** 形をパレットで描く */
export function paintAircraft(pen: ArtPen, shape: AircraftShape, pal: HullPalette, mid: number): void {
  pen.parts(shape.parts, (t) => toneColor(t, pal, mid));
}

/** key に shape の機を描く（味方＝薄い青・敵＝薄い赤。寸法は placeholder と同じ ceil(60·k) × ceil(48·k)。幅・高さを必ず渡す＝省くとゲームの画面の大きさで描く） */
function paintAircraftTexture(scene: Phaser.Scene, key: string, shape: AircraftArtShape, ally: boolean): void {
  const s = aircraftShape(AIRCRAFT_ART_LAYOUTS[shape], AIRCRAFT_SPAN_UNITS, AIRCRAFT_LENGTH_UNITS);
  const size = aircraftTexSize(AIRCRAFT_SPAN_UNITS, AIRCRAFT_LENGTH_UNITS, RENDER_SCALE);
  paintTexture(scene, key, size, RENDER_SCALE, (pen) => paintAircraft(pen, s, ally ? PALETTE_ALLY : PALETTE_ENEMY, ally ? PALETTE_ALLY_MID : PALETTE_ENEMY_MID));
}

/**
 * Boot の 2 行（aircraft-placeholder と同じ名前・引数）: 味方機（color が HOME_COLOR＝薄い青の系統。SBD 級）と敵機（それ以外の色＝薄い赤の系統。既定の形。
 * 任務の開始に paintMissionAircraft が描き直す）。色の値そのものは使わず、陣営のパレットで描く（v0.4.1 の「色と key を引数に」の呼び方を保つ）
 */
export function generateAircraftTexture(scene: Phaser.Scene, key: string = TEXTURE_KEYS.aircraft, color: number = HOME_COLOR): void {
  const ally = color === HOME_COLOR;
  paintAircraftTexture(scene, key, ally ? FRIENDLY_AIRCRAFT_ART : AIRCRAFT_ART_DEFAULT, ally);
}

/** 任務の敵機の id（data で 1 種類: 夜明けの空襲 dawn_strike.aircraft_id → 水上機 enemy_aircraft.enemy_id。jp_02 の哨戒機は dawn_strike と同じ機体。無ければ null＝既定の形） */
export function missionAircraftId(mission: PrototypeMission): string | null {
  return mission.dawnStrike?.aircraft_id ?? mission.enemyAircraft?.enemyId ?? null;
}

/** 任務の世界を作る時に 1 回: 敵機の鍵の canvas を消して、その任務の機の形で描き直す（既存の鍵へ generateTexture は重ね描きなので先に clearRect。refresh は generateTexture の中） */
export function paintMissionAircraft(scene: Phaser.Scene, aircraftId: string | null): void {
  const key = TEXTURE_KEYS.enemyAircraft;
  if (scene.textures.exists(key)) {
    const src = scene.textures.get(key).getSourceImage();
    if (src instanceof HTMLCanvasElement) src.getContext('2d')?.clearRect(0, 0, src.width, src.height);
  }
  paintAircraftTexture(scene, key, aircraftArtShape(aircraftId), false);
}
