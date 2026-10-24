// 敵の側（駆逐艦の隊・僚艇・大発の隊・米PT の隊）の生成（v0.6.3 で mission-world の constructor から切り出し。中身と生成の順はそのまま。米PT は大発の後）。
// 乱数は別系列: 砲撃 seed+1（隊は艦の順に同じ系列を消費する）、見張り seed+17、大発と艇の砲・沿岸砲は BargeHunt の中（seed+6〜）、米PT と T-14 の 13mm は PtSquadron の中（seed+18・+20）。
// 被害はすべて世界の hitBoat を通り、撃破・僚艇の沈没は世界の onSunk（命中スロー＋Scene の爆発）。
import type Phaser from 'phaser';
import { boatTextureKey } from '../config/game-config';
import type { BoatState } from '../core/boat-motion';
import type { HitSpec } from '../core/gunnery';
import type { MissionEndReason } from '../core/mission-flow';
import { SeededRng } from '../core/rng';
import { LOOKOUT_SEED_OFFSET } from '../core/ship-ai';
import { BargeHunt } from './barge-hunt';
import { DestroyerGroup } from './destroyer-group';
import { EnemySide } from './enemy-side';
import { EscortBoat } from './escort-boat';
import { PtSquadron } from './pt-squadron';
import type { PtTargetConvoy } from './pt-target';
import type { SplashPool } from './splash-pool';
import type { WorldEvents } from './world-events';
import type { WorldSetup } from './world-setup';

export interface Enemies {
  /** 砲撃のばらつきの系列（seed+1）。世界が持つ（ヘッドレスの再生が状態を読む） */
  gunRng: SeededRng;
  destroyers: DestroyerGroup | null;
  escort: EscortBoat | null;
  /** 僚艇（要人）への命中（被害 HP と位置。乱数は引かない）。夜明けの空襲も使う */
  escortHit: (damage: number, x: number, y: number) => void;
  hunt: BargeHunt | null;
  /** 米PT の隊（v0.6.3）。任務に pt_boats が無ければ null */
  pts: PtSquadron | null;
  enemy: EnemySide;
}

export function buildEnemies(
  scene: Phaser.Scene,
  s: WorldSetup,
  seed: number,
  boat: BoatState,
  splashes: SplashPool,
  events: WorldEvents,
  hitBoat: (spec: HitSpec, rng: SeededRng, x: number, y: number, reason: MissionEndReason) => void,
  onSunk: (x: number, y: number) => void,
  /** 僚艇の沈んだ実秒に使う時計（世界の stepTimeS を命中のときに読む） */
  clock: { readonly stepTimeS: number },
  /** 味方の大発の輸送隊（v0.6.4。systems/convoy。米PT の隊の標的スロットの的。無い任務は null） */
  convoy: PtTargetConvoy | null = null,
): Enemies {
  const mission = s.mission;
  const ds = s.destroyer;
  // 砲撃のばらつきは別系列（seed+1）で、発射順に影響されない（隊は艦の順に同じ系列を消費する。v0.4.5）
  const gunRng = new SeededRng((seed + 1) >>> 0);
  // 見張り（雷跡に気づく抽選。v0.5.0）も別系列（seed+17。seed+16 は今夜の揺らぎ）。気づくまで 1 ステップ 1 回だけ引く
  const destroyers = ds ? new DestroyerGroup(scene, ds, s.transport, mission.bounds, gunRng, new SeededRng((seed + LOOKOUT_SEED_OFFSET) >>> 0), splashes) : null;
  // 砲の命中: 艦ごとの砲（駆逐艦の 127mm・25mm、輸送船の 76mm。v0.4.7）
  destroyers?.fires.forEach((f, i) => f.setHitHandler((gunIndex, x, y) => hitBoat((i < ds!.starts.length ? ds!.gunnery : s.transport!.gunnery).guns[gunIndex]!, gunRng, x, y, 'destroyed')));
  // 僚艇（v0.4.4）: 駆逐艦の任務だけ。被弾（砲弾・夜明けの空襲）は小さな爆発、沈没は大発の撃破と同じ演出（命中スロー＋爆発・揺れ）
  const escort = s.escort && ds ? new EscortBoat(scene, s.escort, boat, mission.bounds, boatTextureKey(mission.escort!.boat)) : null;
  const escortHit = (damage: number, x: number, y: number): void => (escort!.hit(damage, clock.stepTimeS) ? onSunk(x, y) : events.onShellHit(x, y, true, false));
  destroyers?.fires.forEach((f, i) => f.setEscortHitHandler((gi, x, y) => escortHit((i < ds!.starts.length ? ds!.gunnery : s.transport!.gunnery).guns[gi]!.damage, x, y)));
  // 大発と艇の砲（v0.4.2）: 13mm の被害は砲弾と同じ経路（終了理由 barge_fire）、撃破は命中スロー＋Scene の爆発
  const hunt = s.barges && s.guns ? new BargeHunt(scene, s.barges, s.guns, seed, boat, s.boatHalfLengthM, s.boatHalfBeamM, hitBoat, onSunk, s.shoreBatteries, splashes) : null;
  // 米PT の隊（v0.6.3）: 掃射の被害は砲弾と同じ経路（終了理由 pt_fire）。seed+18 の系列は米PT の任務でだけ作る（ほかの任務の生成と乱数は変えない）。
  // 艇の砲（実機 1 回目から jp_05 の T-14 の 13mm。seed+20 は PtSquadron が砲のあるときだけ作る）で沈めた PT は大発の撃破と同じ onSunk
  const pts = s.ptBoats ? new PtSquadron(scene, s.ptBoats, seed, boat, s.boatHalfLengthM, s.boatHalfBeamM, hitBoat, s.guns, mission.enemyId, onSunk, convoy) : null;
  const enemy = new EnemySide(destroyers, hunt, pts);
  return { gunRng, destroyers, escort, escortHit, hunt, pts, enemy };
}
