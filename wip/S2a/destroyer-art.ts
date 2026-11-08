// v0.7.0 S2a（アートと音①：コードで描く絵。spec-v0700 §4.2）: 駆逐艦の絵。日本の駆逐艦（陽炎型の簡略。tex-destroyer。us_01・us_02）・米駆逐艦（フレッチャー級。新しい鍵 tex-destroyer-us。
// jp_06。決め D3: 鍵は ship-art-config の shipArtKey(敵の id)）・味方の駆逐艦 卯月（睦月型。tex-destroyer-friendly。jp_04。寸法は厳守＝名前の y は displayWidth/Height から）。
// generateDestroyerTexture は placeholders と同じ名前・引数・鍵・寸法（Boot の呼び出しの行は変えない＝R14。import の行だけこのファイルに）。
// 米駆逐艦の見た目は 236 × 21.6 → 229.6 × 24 単位に変わり、前からの当たりの大きさ（data の us_destroyer）に揃う（R23。当たりは変えない）。
import type Phaser from 'phaser';
import { TEXTURE_KEYS } from '../config/game-config';
import { PALETTE_ALLY, PALETTE_ALLY_MID, PALETTE_ENEMY, PALETTE_ENEMY_MID } from '../config/boat-art-config';
import { SHIP_ART_DEFAULT_KEY, SHIP_ART_LAYOUTS, shipArtKey, shipArtKind } from '../config/ship-art-config';
import { getEnemyRecord, getPrototypeMission, type GameData } from '../config/game-data';
import { hasHardVariant } from '../config/mission-data';
import type { BoatTextureSpec } from './art-dims';
import { paintShipTexture } from './ship-art';
import { shipShape } from './ship-shape';

/** 敵の駆逐艦: 艦首を上にした絵。原点はテクスチャ中央。key の形は鍵 → 形の表（tex-destroyer＝陽炎型・tex-destroyer-us＝フレッチャー級） */
export function generateDestroyerTexture(scene: Phaser.Scene, spec: BoatTextureSpec, key: string = TEXTURE_KEYS.destroyer): void {
  paintShipTexture(scene, key, spec, shipShape(SHIP_ART_LAYOUTS[shipArtKind(key)], spec.lengthUnits, spec.beamUnits), PALETTE_ENEMY, PALETTE_ENEMY_MID);
}

/**
 * 既定でない駆逐艦の鍵（今は us_destroyer → tex-destroyer-us。jp_06）を、遊べる任務（ハードも）の駆逐艦の id から 1 枚ずつ（寸法はその敵の記録 × sprite_scale）。
 * 駆逐艦の任務＝enemy_start があり、大発の隊・米PT の隊でない任務（tests/art-inventory と同じ読み）。setup には何も足さない（R15）
 */
export function generateExtraDestroyerTextures(scene: Phaser.Scene, data: GameData, spriteScale: number): void {
  const done = new Set<string>([SHIP_ART_DEFAULT_KEY]);
  for (const m of data.missionsSeed.missions as readonly Record<string, unknown>[]) {
    if (!m['v0_1_prototype'] || typeof m['id'] !== 'string') continue;
    for (const hard of hasHardVariant(data, m['id']) ? [false, true] : [false]) {
      const pm = getPrototypeMission(data, m['id'], hard);
      const key = shipArtKey(pm.enemyId);
      if (done.has(key) || !pm.enemyStart || pm.barges || pm.ptBoats) continue;
      done.add(key);
      const r = getEnemyRecord(data, pm.enemyId);
      generateDestroyerTexture(scene, { lengthUnits: r.length_m * spriteScale, beamUnits: r.beam_m * spriteScale }, key);
    }
  }
}

/** 味方の駆逐艦 卯月（睦月型）を薄い青で（ally-destroyer-placeholder の generateAllyDestroyerTextures が艦の 1 枚にこれを呼ぶ。扇は今のまま） */
export function paintAllyDestroyerTexture(scene: Phaser.Scene, spec: BoatTextureSpec): void {
  paintShipTexture(scene, TEXTURE_KEYS.destroyerFriendly, spec, shipShape(SHIP_ART_LAYOUTS.mutsuki, spec.lengthUnits, spec.beamUnits), PALETTE_ALLY, PALETTE_ALLY_MID);
}
