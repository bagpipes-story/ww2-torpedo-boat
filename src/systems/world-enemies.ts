// 敵の側（駆逐艦の隊・僚艇・大発の隊・米PT の隊）の生成（v0.6.3 で mission-world の constructor から切り出し。中身と生成の順はそのまま。米PT は大発の後）。
// 乱数は別系列: 砲撃 seed+1（隊は艦の順に同じ系列を消費する）、見張り seed+17、大発と艇の砲・沿岸砲は BargeHunt の中（seed+6〜）、米PT と T-14 の 13mm は PtSquadron の中（seed+18・+20）。夜の哨戒機の出撃の seed+23（v0.6.7）は敵の側ではなく危険の側（world-hazards）。
// 被害はすべて世界の hitBoat を通り、撃破・僚艇の沈没は世界の onSunk（命中スロー＋Scene の爆発）。
// v0.6.6: 隼艇（jp_01 のハードの WorldSetup.gunboat だけ。systems/gunboat）は米PT の隊が隊の後に作る（判断が隊を読む・標的スロットの末尾の船体・25mm は seed+22）。
// v0.8.2 S2（us_05）: 弾薬庫（systems/ship-magazine。seed+44）は規則のある艦のいる隊だけ、報告（systems/world-recon。無線 seed+45・中継の輪の絵）は setup.recon の世界だけ作る。
// recon の世界だけ艦の砲弾の命中の手を包んで無線の故障を引く（無い任務は世界の hitBoat そのもの＝今の手）。
// v0.8.4: 煙幕への乱射（systems/smoke-barrage-fire。seed+46）は史実モードで煙幕のある艇と艦の隊のいる世界だけ、隊の全艦に付ける（無い世界は乱数の系列も作らない＝今のまま）。
// v0.8.5 S2（us_07）: 大発が無く沿岸砲がある任務だけ、沿岸砲の持ち主 systems/shore-guns（seed+8〜。着弾は survivors＝救助の群。IP2 から生存者の海への砲撃 seed+48）を作る（us_03 の大発の狩りの沿岸砲は今のまま）。
//   IP2: S ボートの第二波（rescue.sboat_wave2）は隊の後ろに確保（線と出発点の揺らぎ seed+49。core/sboat-wave）。
//   PT の隊の絵の鍵と HUD の名は記録から（config/pt-look-data。data の無い tests は米PT の既定）。
import type Phaser from 'phaser';
import { boatTextureKey } from '../config/game-config';
import type { GameData } from '../config/game-data';
import { getSmokeBarrageParams } from '../config/smoke-barrage-data';
import { SHELL_POOL_SIZE } from '../config/ui-config';
import { BARRAGE_SEED_OFFSET } from '../core/smoke-barrage';
import type { SmokeState } from '../core/smoke';
import { ShipBarrage, type BarrageShared } from './smoke-barrage-fire';
import type { BoatState } from '../core/boat-motion';
import type { PtSection } from '../core/pt-boats';
import type { HitSpec } from '../core/gunnery';
import type { MissionEndReason } from '../core/mission-flow';
import { SeededRng } from '../core/rng';
import { LOOKOUT_SEED_OFFSET } from '../core/ship-ai';
import { landLinesOf } from '../core/strait-geometry';
import { BargeHunt } from './barge-hunt';
import { RelayRingView } from '../entities/relay-ring';
import { ShipMagazine } from './ship-magazine';
import { WorldRecon } from './world-recon';
import { shipArtKey } from '../config/ship-art-config';
import { DestroyerGroup } from './destroyer-group';
import { EnemySide } from './enemy-side';
import { EscortBoat } from './escort-boat';
import { Gunboat, type GunboatGunKit } from './gunboat';
import { PtSquadron } from './pt-squadron';
import { createSboatWave, SBOAT_WAVE_SEED_OFFSET, sboatWaveParams } from '../core/sboat-wave';
import { ShoreGuns, type ShoreGunsSurvivors } from './shore-guns';
import { PT_LOOK_DEFAULT, ptLookOf } from '../config/pt-look-data';
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
  /** 米PT の隊（v0.6.3）。任務に pt_boats が無ければ null。隼艇（v0.6.6）は隊が持つ（無い任務は null） */
  pts: PtSquadron | null;
  gunboat: Gunboat | null;
  enemy: EnemySide;
  /** 報告・無線・中継（v0.8.2 S2。setup.recon の世界＝us_05 だけ）。無い任務は null */
  recon: WorldRecon | null;
  /** 大発の無い任務の沿岸砲（v0.8.5 S2。us_07）。大発の任務（沿岸砲は大発の狩りの中）・沿岸砲の無い任務は null */
  shoreGuns: ShoreGuns | null;
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
  /** 僚艇の沈んだ実秒に使う時計（世界の stepTimeS を命中のときに読む）。boat は報告の世界の無線が沈み始めた自艇を引かない（v0.8.2 S2。MissionWorld がそのまま満たす） */
  clock: { readonly stepTimeS: number; readonly boat?: { readonly sinking: boolean }; readonly smoke?: SmokeState | null },
  /** 味方の大発の輸送隊（v0.6.4。systems/convoy。米PT の隊の標的スロットの的。無い任務は null） */
  convoy: PtTargetConvoy | null = null,
  /** data（v0.8.4。煙幕への乱射の値 historical_mode.smoke_barrage を読む＝世界を作るたびに検査。省けば乱射なし） */
  data: GameData | null = null,
  /** 生存者の海（v0.8.5 S2。us_07 の救助の群＝沿岸砲の着弾が奪う。IP2 から砲台が生存者の海を撃つ。無い任務は null） */
  survivors: ShoreGunsSurvivors | null = null,
): Enemies {
  const mission = s.mission;
  const ds = s.destroyer;
  // 砲撃のばらつきは別系列（seed+1）で、発射順に影響されない（隊は艦の順に同じ系列を消費する。v0.4.5）
  const gunRng = new SeededRng((seed + 1) >>> 0);
  // 見張り（雷跡に気づく抽選。v0.5.0）も別系列（seed+17。seed+16 は今夜の揺らぎ）。気づくまで 1 ステップ 1 回だけ引く
  // 駆逐艦の絵の鍵は敵の id から（v0.7.0 S2a。jp_06 の us_destroyer はフレッチャー級の tex-destroyer-us。絵だけ＝setup・当たり・乱数は変えない）。
  // 列の通過（v0.8.0 S2。us_04 の setup.transit だけ）の艦は隊が護衛の後ろに作る（同じ id・砲。無い任務は null＝隊は v0.7.2 のまま）。ハードの駆潜艇（v0.8.1 S2b。us_06 のハードの setup.pickets）は輸送船の後ろ
  const destroyers = ds ? new DestroyerGroup(scene, ds, s.transport, s.transit ?? null, mission.bounds, gunRng, new SeededRng((seed + LOOKOUT_SEED_OFFSET) >>> 0), splashes, shipArtKey(mission.enemyId), s.pickets ?? null) : null;
  // 海峡の両岸（v0.8.0 実機 1 回目。us_04 の setup.shores）と今の岸（coast の南。v0.8.1 S2。駆逐艦の隊と岸を両方持つのは us_06 だけ＝tests/anchor-world）: 探照灯の絵を岸の線で切る
  // （陸の上に光を描かない。照らす判定は変えない）。同じ線で暗い岸を背に（setup.backdrop）、止まった艦（setup.anchors。駆潜艇も）も隊に付ける（無い任務は何もしない）
  const land = destroyers && (s.shores || mission.coast) ? landLinesOf(s.shores ?? null, mission.coast !== null, mission.bounds.width, mission.bounds.height) : null;
  if (destroyers && land) destroyers.setBeamLand(land);
  if (destroyers && land && s.backdrop) destroyers.setBackdrop(s.backdrop, land, s.seaplane ? s.seaplane.flareRevealM : 0);
  if (destroyers && s.anchors) destroyers.setAnchors(s.anchors);
  // 戦艦の弾薬庫と報告（v0.8.2 S2。us_05）: 規則のある艦のいる隊・setup.recon の世界だけ（無い任務は作らない＝乱数の系列も無い）
  const magazine = ds && destroyers ? ShipMagazine.of(s.transit?.column, ds.starts.length, destroyers.total, seed) : null;
  if (destroyers && magazine) destroyers.magazine = magazine;
  const recon = s.recon && ds && destroyers ? new WorldRecon(s.recon, s.transit?.column ?? [], ds.starts.length, seed, clock, new RelayRingView(scene, s.recon.relay, boatTextureKey(s.mission.playerBoatId))) : null;
  const shipHit = recon ? (spec: HitSpec, rng: SeededRng, x: number, y: number, reason: MissionEndReason): void => { recon.onShellHit(spec.damage); hitBoat(spec, rng, x, y, reason); } : hitBoat; // 無線（recon の世界だけ包む）
  // 砲の命中: 艦ごとの砲（駆逐艦の 127mm・25mm、輸送船の 76mm。v0.4.7。v0.8.1 S2b から駆潜艇の 76mm・13mm）＝隊の gunneryAt（駆逐艦は隊の先頭 destroyerCount 隻＝列の通過の艦も込み）
  destroyers?.fires.forEach((f, i) => f.setHitHandler((gunIndex, x, y) => shipHit(destroyers.gunneryAt(i).guns[gunIndex]!, gunRng, x, y, 'destroyed')));
  // 僚艇（v0.4.4）: 駆逐艦の任務だけ。被弾（砲弾・夜明けの空襲）は小さな爆発、沈没は大発の撃破と同じ演出（命中スロー＋爆発・揺れ）
  const escort = s.escort && ds ? new EscortBoat(scene, s.escort, boat, mission.bounds, boatTextureKey(mission.escort!.boat)) : null;
  const escortHit = (damage: number, x: number, y: number): void => (escort!.hit(damage, clock.stepTimeS) ? onSunk(x, y) : events.onShellHit(x, y, true, false));
  destroyers?.fires.forEach((f, i) => f.setEscortHitHandler((gi, x, y) => escortHit(destroyers.gunneryAt(i).guns[gi]!.damage, x, y)));
  // 煙幕への乱射（v0.8.4）: 史実モード・煙幕のある艇・艦の隊の 3 つが揃う世界だけ。乱数は seed+46 の 1 系列を隊の艦の順に引く（世界は smoke を敵の側の後に作るので固定ステップの時に読む）
  const barrageParams = data ? getSmokeBarrageParams(data) : null;
  if (destroyers && barrageParams && s.historical && s.smokeParams) {
    const shared: BarrageShared = { params: barrageParams, rng: new SeededRng((seed + BARRAGE_SEED_OFFSET) >>> 0), world: clock };
    destroyers.fires.forEach((f, i) => f.setBarrage(new ShipBarrage(shared, destroyers.gunneryAt(i).guns.length, SHELL_POOL_SIZE)));
  }
  // 大発と艇の砲（v0.4.2）: 13mm の被害は砲弾と同じ経路（終了理由 barge_fire）、撃破は命中スロー＋Scene の爆発
  const hunt = s.barges && s.guns ? new BargeHunt(scene, s.barges, s.guns, seed, boat, s.boatHalfLengthM, s.boatHalfBeamM, hitBoat, onSunk, s.shoreBatteries, splashes) : null;
  // 米PT の隊（v0.6.3）: 掃射の被害は砲弾と同じ経路（終了理由 pt_fire）。seed+18 の系列は米PT の任務でだけ作る（ほかの任務の生成と乱数は変えない）。
  // 艇の砲（実機 1 回目から jp_05 の T-14 の 13mm。seed+20 は PtSquadron が砲のあるときだけ作る）で沈めた PT は大発の撃破と同じ onSunk
  // 隼艇（v0.6.6。輸送隊と米PT の隊のある任務の WorldSetup.gunboat だけ）: 隊が隊の後・標的スロットの前に作る（乱数は 25mm の seed+22 だけ。動きと被弾は引かない）
  // S ボートの第二波（v0.8.5 IP2。us_07 の rescue.sboat_wave2 だけ）: 隊の後ろに足して確保し（線と出発点は seed+49 の揺らぎ）、出るまでは海域の外（core/sboat-wave。無い任務は今の隊のまま）
  const wave2 = s.rescue?.wave2 ?? null;
  const pt = s.ptBoats && wave2 ? sboatWaveParams(s.ptBoats, wave2, new SeededRng((seed + SBOAT_WAVE_SEED_OFFSET) >>> 0)) : s.ptBoats;
  const gb = s.gunboat;
  const makeGunboat = gb && pt && convoy ? (q: PtSection, kit: GunboatGunKit): Gunboat => new Gunboat(scene, gb, { player: boat, convoy: convoy.state, convoyParams: convoy.p, pts: q, ring: mission.returnPoint, bounds: mission.bounds, visRange2: s.visRange2 }, s.vis, pt.baseDetectM, onSunk, kit) : null;
  const pts = pt ? new PtSquadron(scene, pt, seed, boat, s.boatHalfLengthM, s.boatHalfBeamM, hitBoat, s.guns, mission.enemyId, onSunk, convoy, makeGunboat, data ? ptLookOf(data, mission.enemyId) : PT_LOOK_DEFAULT) : null;
  if (pts && wave2 && s.ptBoats) pts.wave = createSboatWave(pts.section, s.ptBoats.count);
  const enemy = new EnemySide(destroyers, hunt, pts);
  const shoreGuns = !s.barges && s.shoreBatteries.length > 0 ? new ShoreGuns(scene, s.shoreBatteries, seed, boat, s.boatHalfLengthM, s.boatHalfBeamM, splashes, hitBoat, survivors) : null;
  return { gunRng, destroyers, escort, escortHit, hunt, pts, gunboat: pts ? pts.gunboat : null, enemy, recon, shoreGuns };
}
