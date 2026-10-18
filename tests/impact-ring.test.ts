// 夜明けの空襲の着弾点の輪と爆弾の大きさ（v0.6.1 レビュー [14]。config/dawn-config・assets/impact-ring-placeholder）
// 輪の線がスマホで見える太さか、着弾時の爆弾（爆発リングの絵）が輪の線の内側で終わるか（輪より大きな白い円が爆風の範囲に見えない）を、空襲のある任務ごとに確かめる。
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { playableMissionIds } from '../src/config/campaign-data';
import {
  AIR_STRIKE_BOMB_SCALE_FROM,
  AIR_STRIKE_BOMB_SCALE_TO,
  AIR_STRIKE_RING_FILL_ALPHA,
  AIR_STRIKE_RING_LINE_UNITS,
  AIR_STRIKE_RING_TEX_RADIUS_UNITS,
} from '../src/config/dawn-config';
import { buildWorldSetup } from '../src/systems/world-setup';

/** assets/placeholders.ts の爆発リングの絵（EXPLOSION_RING_RADIUS_UNITS 40・線 4 単位）。空襲の爆弾はこの絵を AIR_STRIKE_BOMB_SCALE_* 倍で描く */
const EXPLOSION_RING_RADIUS_UNITS = 40;
const EXPLOSION_RING_LINE_UNITS = 4;

const STRIKE_IDS = [...playableMissionIds(gameData, 'us_pt'), ...playableMissionIds(gameData, 'jp_hard')].filter((id) => buildWorldSetup(gameData, id).airStrike !== null);

describe('着弾点の輪と空襲の爆弾の大きさ（v0.6.1）', () => {
  it('空襲のある任務がある（us_01・jp_06）', () => {
    expect(STRIKE_IDS).toEqual(expect.arrayContaining(['us_01', 'jp_06']));
  });

  it('輪の線は見張りのいちばん引いたズームでも論理 2 px 以上（帰投地点の輪の流用は 1 px 未満だった）', () => {
    const zoomMin = gameData.hitRateModel.world.camera_zoom_min;
    for (const id of STRIKE_IDS) {
      const r = buildWorldSetup(gameData, id).airStrike!.playerHitRadiusM;
      const lineM = (r * AIR_STRIKE_RING_LINE_UNITS) / AIR_STRIKE_RING_TEX_RADIUS_UNITS;
      expect(lineM * zoomMin, id).toBeGreaterThanOrEqual(2);
      expect(lineM, id).toBeLessThan(r / 4); // 輪に見える（円盤にならない）
    }
    expect(AIR_STRIKE_RING_FILL_ALPHA).toBeLessThanOrEqual(0.2);
  });

  it('着弾時の爆弾の外周は輪の線の内側（爆弾は投下から着弾へ大きくなる）', () => {
    expect(AIR_STRIKE_BOMB_SCALE_FROM).toBeGreaterThan(0);
    expect(AIR_STRIKE_BOMB_SCALE_FROM).toBeLessThan(AIR_STRIKE_BOMB_SCALE_TO);
    expect(AIR_STRIKE_BOMB_SCALE_TO).toBeLessThanOrEqual(0.7);
    const bombOuterM = (EXPLOSION_RING_RADIUS_UNITS + EXPLOSION_RING_LINE_UNITS / 2) * AIR_STRIKE_BOMB_SCALE_TO;
    for (const id of STRIKE_IDS) {
      const r = buildWorldSetup(gameData, id).airStrike!.playerHitRadiusM;
      const ringInnerM = r - (r * AIR_STRIKE_RING_LINE_UNITS) / AIR_STRIKE_RING_TEX_RADIUS_UNITS / 2;
      expect(bombOuterM, id).toBeLessThan(ringInnerM);
    }
  });
});
