// 駆逐艦の隊の数値（v0.4.7 で world-setup から切り出し。中身は v0.4.5 のまま、輸送船の型を足した）。Phaser 非依存。起動時に 1 回だけ。
import { getEnemyRecord, getEvasionMultiplier, type GameData } from '../config/game-data';
import { gunneryParamsFromData, type GunneryParams } from '../core/gunnery';
import { shipAiParamsFromData, type ShipAiParams } from '../core/ship-ai';

/** 駆逐艦の寸法と耐久（entities/destroyer が使う。型をここに置くのは、テストの tsconfig（DOM 無し）に Phaser 側を引き込まないため） */
export interface DestroyerSpec {
  lengthM: number;
  beamM: number;
  hullCircles: number;
  hitsToSink: number;
  /** 当たり判定に使う寸法の倍率（data: world.ship_hit_scale。v0.4.8 から絵と同じ 2） */
  hitScale: number;
  /** 海域境界から押し戻す余白 m（表示上の船体半分） */
  boundsMarginM: number;
}

/** 駆逐艦（us_02）の数値: 出発点（全隻。ハードで増える。v0.4.5）・寸法・AI・反撃・魚雷の外れ確定の半径二乗（目標中心からこれより離れて遠ざかれば通過） */
export interface DestroyerSetup {
  starts: { x: number; y: number; headingDeg: number }[];
  spec: DestroyerSpec;
  shipAi: ShipAiParams;
  gunnery: GunneryParams;
  passRadius2: number;
  /** 発見の基準距離（enemies.json の detection.base_detect_m） */
  baseDetectM: number;
}

/** 輸送船（v0.4.7）: 駆逐艦の隊の 1 隻として同じ型で動く（出発点 1 つ、寸法・AI・備砲は enemies.json の輸送船から）。任務の達成には数えない */
export interface TransportSetup extends Omit<DestroyerSetup, 'starts'> {
  enemyId: string;
  start: { x: number; y: number; headingDeg: number };
}

/** 駆逐艦の数値（enemies.json の AI・反撃を持つ記録）。v0.4.2 で buildWorldSetup から切り出し（中身は v0.4.1 のまま） */
export function destroyerSetup(data: GameData, starts: DestroyerSetup['starts'], enemyId: string, hitsOverride: number | null): DestroyerSetup {
  const world = data.hitRateModel.world;
  const r = getEnemyRecord(data, enemyId);
  // 船体の当たり判定は絵と同じ倍率（v0.4.8。ship_hit_scale）。自艇・大発は hit_scale のまま
  const hitLen = r.length_m * world.ship_hit_scale;
  const hitBeam = r.beam_m * world.ship_hit_scale;
  return {
    starts,
    spec: { lengthM: r.length_m, beamM: r.beam_m, hullCircles: r.hull_circles, hitsToSink: hitsOverride ?? r.torpedo_hits_to_sink, hitScale: world.ship_hit_scale, boundsMarginM: (r.length_m * world.sprite_scale) / 2 },
    shipAi: shipAiParamsFromData(r, getEvasionMultiplier(data)),
    gunnery: gunneryParamsFromData(r),
    passRadius2: (hitLen / 2 + hitBeam) * (hitLen / 2 + hitBeam),
    baseDetectM: r.detection.base_detect_m,
  };
}
