// 世界の見た目の同期と破棄（v0.6.9 S0 で systems/mission-world の updateFrame の後半と destroy() の中身から移した。順と式は v0.6.8 のまま）。
// updateFrame は入力の消費 → 固定ステップ → 命中スローの残り → 浅瀬の状態の後に updateWorldVisuals を 1 回呼ぶ。§7: 確保しない（絵の位置・向き・透明度だけ）。
// 移すために MissionWorld.smokeScreen を private readonly から readonly にした（ここが読む。ほかに private から出したものは無い）。
import type { MissionWorld } from './mission-world';

/** 毎フレーム: 暴風の帯 → 自艇 → 僚艇 → 駆逐艦 → 魚雷 → 大発 → 米PT → 輸送隊 → 水柱 → 煙幕 → 味方機 → 水上機 → 夜の哨戒機 → 夜明け → 兵装（v0.6.8 と同じ順）→ 揚陸（v0.6.9）→ 卯月（v0.6.10） */
export function updateWorldVisuals(w: MissionWorld, realDt: number): void {
  const g = w.destroyers;
  w.storm?.updateVisuals(realDt, w.boat.state);
  w.boat.syncSprite(w.storm ? w.storm.rollDeg : 0);
  w.escort?.syncSprite();
  g?.syncSprites();
  w.torpedoes.updateVisuals(realDt);
  g?.updateVisuals(realDt);
  w.hunt?.updateVisuals(realDt, w.visRange2);
  w.pts?.updateVisuals(realDt, w.visRange2);
  w.convoy?.updateVisuals(w.boat.state, w.visRange2, w.pts?.targets ? w.pts.targets.aimedBarge : -1);
  w.splashes.updateVisuals(realDt);
  if (w.smokeScreen && w.smoke && w.smokeParams) w.smokeScreen.updateVisuals(w.smoke, w.smokeParams);
  w.friendly?.updateVisuals(realDt, w);
  w.seaplane?.updateVisuals(w.boat.state);
  w.patrol?.updateVisuals(w.boat.state, w.escort ? w.escort.state.boat : null);
  w.dawn.updateVisuals(w);
  w.arms?.updateVisuals(realDt, w);
  w.landing?.updateVisuals(realDt, w); // 味方の輸送船と敵の魚雷（v0.6.9 S5a。jp_04 だけ。最後に足した＝ほかの絵の順は v0.6.8 のまま）・▼「雷撃」（S6b）
  w.landing?.ally?.updateVisuals(realDt); // 味方の駆逐艦 卯月の扇・探照灯・砲弾（v0.6.10 S5a。jp_04 だけ・?debug&noally は無い。揚陸の絵の後）
  w.evac?.updateVisuals(realDt); // 空襲下の退避の編隊・18 隻（v0.6.11 S4。jp_03 だけ。最後）
  w.art.update(realDt, w); // 世界の絵＝海の模様・夜明けの光・きらめき（v0.7.0 S3a。systems/world-art。全任務。夜明けの段の後＝最後）
}

/** 任務の終わり: 世界の絵と物をみな破棄する（v0.6.8 の MissionWorld.destroy() と同じ順。揚陸（v0.6.9）・卯月（v0.6.10）は最後） */
export function destroyWorldVisuals(w: MissionWorld): void {
  w.storm?.destroy();
  w.seaplane?.destroy();
  w.patrol?.destroy();
  w.dawn.destroy();
  w.arms?.destroy();
  w.friendly?.destroy();
  w.torpedoes.destroy();
  w.hunt?.destroy();
  w.pts?.destroy();
  w.convoy?.destroy();
  w.escort?.destroy();
  w.splashes.destroy();
  w.smokeScreen?.destroy();
  w.destroyers?.destroy();
  w.boat.destroy();
  w.landing?.destroy(); // v0.6.9 S5a（jp_04 だけ。最後に足した）
  w.landing?.ally?.destroy(); // v0.6.10 S5a（卯月。揚陸の後）
  w.evac?.destroy(); // v0.6.11 S4（jp_03。最後）
  w.art.destroy(); // v0.7.0 S3a（世界の絵。最後）
}
