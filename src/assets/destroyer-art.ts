// v0.7.0 S2a（アートと音①：コードで描く絵。spec-v0700 §4.2）: 駆逐艦の絵。日本の駆逐艦（陽炎型の簡略。tex-destroyer。us_01・us_02）・米駆逐艦（フレッチャー級。新しい鍵 tex-destroyer-us。
// jp_06。決め D3: 鍵は ship-art-config の shipArtKey(敵の id)）・味方の駆逐艦 卯月（睦月型。tex-destroyer-friendly。jp_04。寸法は厳守＝名前の y は displayWidth/Height から）。
// generateDestroyerTexture は placeholders と同じ名前・引数・鍵・寸法（Boot の呼び出しの行は変えない＝R14。import の行だけこのファイルに）。
// 米駆逐艦の見た目は 236 × 21.6 → 229.6 × 24 単位に変わり、前からの当たりの大きさ（data の us_destroyer）に揃う（R23。当たりは変えない）。
// IP2（実機 2 回目。U8「駆逐艦のグラフィックを見直してクオリティを上げてください。でも、色は現在と同じ単系統のままで」）: Graphics の平たい部品から、Canvas の 2D に陰影つきで描く形へ
//   （assets/destroyer-plan の置き方・destroyer-paint の描き方。色は陣営のパレットの地の色の明るさだけを変える）。鍵・寸法（hullTexSize）・原点（中央）は同じ。起動時に 1 回だけ。
// v0.8.2 S2b（spec-v0820 D-A1・D-A2・L30）: us_05 の列の戦艦 tex-battleship-fuso・重巡 tex-cruiser-mogami（置き方は assets/capital-plan・同じ描き方）を generateColumnTextures が Boot で 1 回ずつ。
import type Phaser from 'phaser';
import { RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import { PALETTE_ALLY, PALETTE_ENEMY } from '../config/boat-art-config';
import { SHIP_ART_DEFAULT_KEY, artTexDensity, shipArtKey, shipArtKind } from '../config/ship-art-config';
import { getEnemyRecord, getPrototypeMission, type GameData } from '../config/game-data';
import { hasHardVariant } from '../config/mission-data';
import { hullTexSize, type BoatTextureSpec } from './art-dims';
import { capitalPlan, isCapitalKind } from './capital-plan';
import { destroyerPlan, type CapitalKind, type DestroyerKind } from './destroyer-plan';
import { paintDestroyer } from './destroyer-paint';
import { paintCanvas } from './sea-art';

/**
 * 1 枚を key のテクスチャに（論理の寸法は placeholder と同じ ceil(B·k) × ceil(L·k)。原点は表示側の既定＝中央）。IP2b: 画素はその S 倍（S＝artTexDensity(key)。2 の冪）で描き、
 * 表示は Destroyer・AllyDestroyer が 1 / (k·S) に縮める（世界の大きさと displayWidth/Height は今のまま）
 */
function paintDestroyerTexture(scene: Phaser.Scene, key: string, spec: BoatTextureSpec, kind: DestroyerKind | CapitalKind, base: number): void {
  const k = RENDER_SCALE;
  const S = artTexDensity(key);
  const size = hullTexSize(spec.lengthUnits, spec.beamUnits, k);
  paintCanvas(scene, key, size.w * S, size.h * S, (ctx) => {
    ctx.scale(k * S, k * S);
    paintDestroyer(ctx, isCapitalKind(kind) ? capitalPlan(kind, spec.lengthUnits, spec.beamUnits) : destroyerPlan(kind, spec.lengthUnits, spec.beamUnits), base);
  });
  Object.assign(scene.textures.get(key).customData, { density: S }); // 道具（tex-ab）が論理の寸法＝画素 / S で比べる
}

/**
 * 敵の駆逐艦: 艦首を上にした絵。原点はテクスチャ中央。key の形は鍵 → 形の表をそのまま（tex-destroyer＝陽炎型・tex-destroyer-us＝フレッチャー級・v0.8.1 S2 の tex-destroyer-mutsuki＝睦月型・
 * S2b の tex-subchaser＝駆潜艇・v0.8.2 S2b の戦艦と重巡＝assets/capital-plan。艦の形でない鍵＝輸送船は陽炎型＝v0.8.0 までの選び方と同じ画素）
 */
export function generateDestroyerTexture(scene: Phaser.Scene, spec: BoatTextureSpec, key: string = TEXTURE_KEYS.destroyer): void {
  const kind = shipArtKind(key);
  paintDestroyerTexture(scene, key, spec, kind === 'transport' ? 'kagero' : kind, PALETTE_ENEMY.deck);
}

/**
 * 既定でない駆逐艦の鍵（us_destroyer → tex-destroyer-us。jp_06。v0.8.1 S2 から ijn_destroyer_mutsuki_enemy → tex-destroyer-mutsuki。us_06）を、遊べる任務（ハードも）の駆逐艦の id から 1 枚ずつ（寸法はその敵の記録 × sprite_scale）。
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

/**
 * ハードの駆潜艇の絵（v0.8.1 S2b。spec-v0810 §3.6 D-A2。ijn_subchaser → tex-subchaser）: v0_1_prototype の hard に picket_enemy_id を持つ任務（us_06）の記録から 1 枚ずつ
 * （寸法は記録 × sprite_scale＝102 × 13.4 単位・敵の色。generateExtraDestroyerTextures と同じ読み＝任務の表を 1 回）。鍵の無い id は作らない（既定の 1 枚を上書きしない）。setup には何も足さない
 */
export function generatePicketTextures(scene: Phaser.Scene, data: GameData, spriteScale: number): void {
  const done = new Set<string>([SHIP_ART_DEFAULT_KEY]);
  for (const m of data.missionsSeed.missions as readonly Record<string, unknown>[]) {
    const hard = (m['v0_1_prototype'] as Record<string, unknown> | undefined)?.['hard'] as Record<string, unknown> | undefined;
    const id = hard?.['picket_enemy_id'];
    if (typeof id !== 'string' || done.has(shipArtKey(id))) continue;
    done.add(shipArtKey(id));
    const r = getEnemyRecord(data, id);
    generateDestroyerTexture(scene, { lengthUnits: r.length_m * spriteScale, beamUnits: r.beam_m * spriteScale }, shipArtKey(id));
  }
}

/**
 * 列の戦艦・重巡の絵（v0.8.2 S2b。spec-v0820 §4.11 D-A1・D-A2。us_05 の山城・扶桑 → tex-battleship-fuso、最上 → tex-cruiser-mogami）: v0_1_prototype の transit.column と hard の extra_column の
 * enemy_id のうち、絵の鍵の形が戦艦・重巡の物を 1 枚ずつ（寸法は記録 × sprite_scale＝425.5 × 66.2・401.2 × 40.4 単位＝当たりと同じ大きさ・敵の色）。列の駆逐艦（陽炎型の代用）は作らない（既定の 1 枚）。
 * generatePicketTextures と同じ読み（任務の表を 1 回）。setup には何も足さない
 */
export function generateColumnTextures(scene: Phaser.Scene, data: GameData, spriteScale: number): void {
  const done = new Set<string>();
  for (const m of data.missionsSeed.missions as readonly Record<string, unknown>[]) {
    const p = m['v0_1_prototype'] as Record<string, unknown> | undefined;
    const column = (p?.['transit'] as Record<string, unknown> | undefined)?.['column'];
    const extra = (p?.['hard'] as Record<string, unknown> | undefined)?.['extra_column'];
    for (const list of [column, extra]) {
      if (!Array.isArray(list)) continue;
      for (const ship of list as readonly Record<string, unknown>[]) {
        const id = ship['enemy_id'];
        if (typeof id !== 'string' || done.has(shipArtKey(id)) || !isCapitalKind(shipArtKind(shipArtKey(id)))) continue;
        done.add(shipArtKey(id));
        const r = getEnemyRecord(data, id);
        generateDestroyerTexture(scene, { lengthUnits: r.length_m * spriteScale, beamUnits: r.beam_m * spriteScale }, shipArtKey(id));
      }
    }
  }
}

/** 味方の駆逐艦 卯月（睦月型）を薄い青で（ally-destroyer-placeholder の generateAllyDestroyerTextures が艦の 1 枚にこれを呼ぶ。扇は今のまま） */
export function paintAllyDestroyerTexture(scene: Phaser.Scene, spec: BoatTextureSpec): void {
  paintDestroyerTexture(scene, TEXTURE_KEYS.destroyerFriendly, spec, 'mutsuki', PALETTE_ALLY.deck);
}
