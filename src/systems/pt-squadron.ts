// 敵の米PT の隊（v0.6.3。docs/02 §6.4、spec §C.5〜C.6・§D.5）の世界側: core/pt-boats を固定ステップで進め、掃射の命中を世界に伝え、
// PT・航過の赤い線（予告）・曳光弾・外れ弾の水柱・砲口の閃光を描く（barge-hunt と同じ形）。
// v0.6.3 実機 1 回目: 艇に砲のある任務（jp_05 の T-14 の 13mm）は固定ステップで 13mm（systems/pt-gun）→ 閃光 → 隊の順（模擬 core/pt-pass-sim と同じ）。
// 撃退された PT は灰色に（1 回だけ）、沈んだ PT は沈み込みの tween（1 夜 2 回まで）と世界の onSunk（命中スロー＋爆発）。
// v0.6.3 実機 2 回目（追撃の連射。spec r2 §F.2）: 連射の赤い線は同じ 1 本を PT から艇へ（毎フレーム位置・向き・長さの倍率だけ直す。平方根と atan2 は撃つ PT の 1 回）。制圧された PT は色を変えない。
// 黙った連射の線は予告の秒の後に消す（窓は core のまま。レビュー ux-1）。
// §7: PT count 枚・線 1 本・曳光弾 24 枚・水柱 24 枚・閃光 1 枚を起動時に作り、毎フレームは transform/alpha/visible だけ触る。check と events は 1 個だけ作る。
// 乱数: seed+18（PT_SEED_OFFSET）の 1 系列（1 発 2 回と命中の火災・機関）と、艇に砲があるときだけ seed+20（PtGun）。米PT の隊の無い任務ではこのクラスを作らない（ほかの系列は動かさない）。
import Phaser from 'phaser';
import { DEPTH, RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import { AIR_STRIKE_RUN_LINE_ALPHA, AIR_STRIKE_RUN_LINE_TINT, AIR_STRIKE_RUN_LINE_WIDTH_M } from '../config/dawn-config';
import { GUN_SPLASH_SCALE_HIT, GUN_SPLASH_SCALE_MISS, MG_TRACER_TINT } from '../config/hunt-config';
import { PT_MUZZLE_FLASH_S, PT_MUZZLE_FLASH_SCALE, PT_MUZZLE_FLASH_TINT, PT_PASS_LINE_LEN_M, PT_RETIRED_TINT, PT_SHELL_POOL_SIZE, PT_SPLASH_POOL_SIZE } from '../config/pt-config';
import { SINK_DURATION_MS, SINK_SCALE_TO, SINK_TILT_DEG } from '../config/ui-config';
import type { BoatState, SpeedStep } from '../core/boat-motion';
import type { GunBatteryParams } from '../core/gun-battery';
import type { HitSpec } from '../core/gunnery';
import { PT_FATE_SUNK, PT_OUT, PT_SEED_OFFSET, PT_SUNK, createPtSection, hudThreatIndex, stepPtSection, type PtCheck, type PtEvents, type PtParams, type PtSection } from '../core/pt-boats';
import { attackLineShown } from '../core/pt-chase';
import { SeededRng } from '../core/rng';
import type { SmokeParams, SmokeState } from '../core/smoke';
import { radToDeg } from '../core/units';
import { PtGun } from './pt-gun';
import { SplashPool } from './splash-pool';

/** 固定ステップで世界から読む部分（MissionWorld がそのまま満たす）。detect は駆逐艦と同じ「見つかった回数」（Result の回避の点） */
export interface PtSquadronView {
  readonly boat: { readonly state: BoatState; readonly sinking: boolean };
  readonly atHome: boolean;
  readonly band: SpeedStep;
  /** 敵が自艇を見つける距離（月明・速力帯込み。米PT の任務に煙幕は無いが、PT ごとの煙幕の線は core が見る） */
  readonly detectRangeM: number;
  readonly visRange2: number;
  readonly vis: { readonly smokeFactor: number };
  readonly smoke: SmokeState | null;
  readonly smokeParams: SmokeParams | null;
  readonly dawn: { readonly reached: boolean };
  readonly stepTimeS: number;
  readonly detect: { count: number; prev: boolean };
}

export class PtSquadron {
  readonly section: PtSection;
  /** 射撃の散布と命中の火災・機関（seed+18） */
  readonly rng: SeededRng;
  /** 最初に見つかったときの自艇の速力帯（Result の「最初 N m ・ 巡航」。見つかっていなければ ''） */
  firstDetectBand: SpeedStep | '' = '';
  /** T-14 の 13mm（v0.6.3 実機 1 回目。艇に砲のある任務だけ。無ければ null で seed+20 も作らない） */
  readonly gun: PtGun | null;
  private readonly check: PtCheck;
  private readonly splashes: SplashPool;
  private readonly sprites: Phaser.GameObjects.Image[] = [];
  private readonly shown: Uint8Array;
  private readonly tracers: Phaser.GameObjects.Image[] = [];
  private readonly line: Phaser.GameObjects.Image;
  private lineShown = false;
  /** 線が連射の形（PT → 艇の長さ）になっている。航過へ戻すときに長さの倍率を 1 回だけ戻す */
  private lineBurst = false;
  private readonly lineScaleY: number;
  private readonly flash: Phaser.GameObjects.Image;
  private flashAge = Infinity;
  /** 固定ステップの世界（掃射の着弾で艇が沈み始めたかを読む。step で置くだけで確保しない） */
  private view: PtSquadronView | null = null;

  private readonly events: PtEvents = {
    onContact: () => {},
    onCommit: () => {},
    onFire: (_i, x, y) => {
      this.flash.setPosition(x, y).setAlpha(1).setVisible(true);
      this.flashAge = 0;
    },
    onImpact: (x, y, hit) => {
      if (hit) {
        this.onBoatHit(this.p.hit, this.rng, x, y, 'pt_fire');
        // この弾で沈み始めたら、同じステップに着く残りの弾は当たり（被弾数）に数えない
        if (this.view && this.view.boat.sinking) this.check.targetValid = false;
      } else this.splashes.splash(x, y, false);
    },
    onPassEnd: () => {},
    onLeave: () => {},
    onOut: () => {},
  };

  constructor(
    scene: Phaser.Scene,
    readonly p: PtParams,
    seed: number,
    boat: BoatState,
    boatHalfLengthM: number,
    boatHalfBeamM: number,
    /** 掃射が艇に当たった（世界が boat-damage で適用。終了理由は pt_fire。火災で沈んでも pt_fire） */
    private readonly onBoatHit: (spec: HitSpec, rng: SeededRng, x: number, y: number, reason: 'pt_fire') => void,
    /** 艇の砲（world-setup の guns。米PT を撃つ砲は弾倉がある＝config/pt-mission-data の検査）。無い任務は null */
    guns: GunBatteryParams | null,
    /** 米PT の enemies.json の id（Result の撃沈の点 scoring.json の kill.points_by_enemy のキー） */
    readonly enemyId: string,
    /** 13mm で PT を沈めた（世界が命中スローと Scene の爆発。大発の撃破と同じ） */
    private readonly onSunk: (x: number, y: number) => void,
  ) {
    this.rng = new SeededRng((seed + PT_SEED_OFFSET) >>> 0);
    this.section = createPtSection(p, PT_SHELL_POOL_SIZE);
    this.check = { boat, boatHalfLengthM, boatHalfBeamM, detectOpenM: 0, smokeFactor: 1, smoke: null, smokeParams: null, targetValid: true, visRange2: 0, dawn: false, timeS: 0 };
    this.splashes = new SplashPool(scene, PT_SPLASH_POOL_SIZE, GUN_SPLASH_SCALE_MISS, GUN_SPLASH_SCALE_HIT);
    this.shown = new Uint8Array(p.count);
    for (const b of this.section.boats) this.sprites.push(scene.add.image(b.x, b.y, TEXTURE_KEYS.ptBoat).setScale(1 / RENDER_SCALE).setAngle(b.headingDeg).setDepth(DEPTH.destroyer).setVisible(false));
    for (let i = 0; i < PT_SHELL_POOL_SIZE; i++) this.tracers.push(scene.add.image(0, 0, TEXTURE_KEYS.gunTracer).setScale(1 / RENDER_SCALE).setTint(MG_TRACER_TINT).setDepth(DEPTH.shell).setVisible(false));
    // 航過の赤い線: 夜明けの空襲の爆撃進路の線と同じ絵・色・濃さ・太さ（ユーザーが知っている「この線から離れる」）。長さは一定なので倍率は 1 回だけ
    this.line = scene.add.image(0, 0, TEXTURE_KEYS.tracer).setOrigin(0, 0.5).setTint(AIR_STRIKE_RUN_LINE_TINT).setAlpha(AIR_STRIKE_RUN_LINE_ALPHA).setDepth(DEPTH.returnRing).setVisible(false);
    this.lineScaleY = AIR_STRIKE_RUN_LINE_WIDTH_M / this.line.height;
    this.line.setScale(PT_PASS_LINE_LEN_M / this.line.width, this.lineScaleY);
    this.flash = scene.add.image(0, 0, TEXTURE_KEYS.explosionRing).setTint(PT_MUZZLE_FLASH_TINT).setScale(PT_MUZZLE_FLASH_SCALE / RENDER_SCALE).setDepth(DEPTH.effects).setVisible(false);
    this.gun = guns ? new PtGun(scene, guns, seed, boat, this.section, p, this.events, this.splashes, (i, fate) => this.onFate(scene, i, fate)) : null;
  }

  /**
   * 固定ステップ（自艇・速力帯・発見距離の後、火災の前。模擬 core/pt-pass-sim と同じ順）: 材料を書いて、艇の 13mm（held は射撃ボタン）→ 閃光 → 隊を進め、
   * 隊が捉えた立ち上がりで「見つかった回数」を数える（駆逐艦の destroyer-step と同じ数え方）。最初の 1 回は自艇の速力帯を覚える
   */
  step(dt: number, feelDt: number, w: PtSquadronView, held: boolean): void {
    this.view = w;
    const c = this.check;
    c.detectOpenM = w.detectRangeM;
    c.smokeFactor = w.vis.smokeFactor;
    c.smoke = w.smoke;
    c.smokeParams = w.smokeParams;
    c.targetValid = !w.boat.sinking && !w.atHome; // 沈み始めた艇・帰投地点の輪の中は見つけない・撃たない・当たらない（PT は動き続ける）
    c.visRange2 = w.visRange2;
    c.dawn = w.dawn.reached;
    c.timeS = w.stepTimeS;
    const q = this.section;
    // 13mm（浮いていて輪の外だけ撃つ）→ 撃ったステップは閃光の距離で PT が見つける（detect_from_s の前は見つけない）
    if (this.gun) c.flashM = this.gun.step(w.band, held, c.targetValid, w.visRange2, feelDt, dt) ? this.gun.g.flashRevealM : 0;
    stepPtSection(q, this.p, c, this.rng, feelDt, dt, this.events);
    if (q.detected && !w.detect.prev) {
      w.detect.count++;
      if (this.firstDetectBand === '') this.firstDetectBand = w.band;
    }
    w.detect.prev = q.detected;
  }

  /** 自艇から見た「いまの敵」: HUD の脅威の PT（撃つ PT → 次の航過の PT → 追撃 → 待つ突撃 → 離脱 → 哨戒。core/pt-boats の hudThreatIndex＝2 行目と同じ）。去った PT だけなら null */
  focus(x: number, y: number): BoatState | null {
    const i = hudThreatIndex(this.section, x, y);
    return i < 0 ? null : this.section.boats[i]!;
  }

  /** 13mm の結末（PtGun の onFate）: 撃退は灰色に 1 回だけ、撃沈は沈み込みの tween と世界の onSunk（大発の撃破と同じ） */
  private onFate(scene: Phaser.Scene, i: number, fate: number): void {
    const img = this.sprites[i]!;
    if (fate !== PT_FATE_SUNK) {
      img.setTint(PT_RETIRED_TINT);
      return;
    }
    const b = this.section.boats[i]!;
    this.shown[i] = 1;
    img.setVisible(true).setPosition(b.x, b.y).setAngle(b.headingDeg);
    scene.tweens.add({ targets: img, scaleX: img.scaleX * SINK_SCALE_TO, scaleY: img.scaleY * SINK_SCALE_TO, alpha: 0, angle: img.angle + SINK_TILT_DEG, duration: SINK_DURATION_MS, ease: 'Sine.easeIn' });
    this.onSunk(b.x, b.y);
  }

  /** 毎フレーム: PT（視程の内だけ表示。沈んだ PT は tween に任せる）、航過の赤い線（航過中の PT から固めた針路へ）、曳光弾、閃光、水柱、13mm（変わるものだけ触る） */
  updateVisuals(realDt: number, visRange2: number): void {
    const q = this.section;
    const boat = this.check.boat;
    for (let i = 0; i < this.sprites.length; i++) {
      const b = q.boats[i]!;
      if (b.phase === PT_SUNK) continue; // 沈み込みは tween に任せる
      const img = this.sprites[i]!;
      const show = b.phase < PT_OUT && (b.x - boat.x) * (b.x - boat.x) + (b.y - boat.y) * (b.y - boat.y) <= visRange2;
      if (show !== (this.shown[i] === 1)) {
        this.shown[i] = show ? 1 : 0;
        img.setVisible(show);
      }
      if (show) img.setPosition(b.x, b.y).setAngle(b.headingDeg);
    }
    // 航過・連射は同時に 1 隻だけ（core）なので線は 1 本。固めた時に出し、終わり（撃ち切り・離れていく・窓の終わり）・夜明けで去ると消える。
    // 制圧・撃退で黙った連射は予告の秒を過ぎたら窓の終わりを待たずに消す（core/pt-chase の attackLineShown。レビュー ux-1）
    const owner = attackLineShown(q, this.p) ? q.owner : -1;
    if ((owner >= 0) !== this.lineShown) {
      this.lineShown = owner >= 0;
      this.line.setVisible(this.lineShown);
    }
    if (owner >= 0) {
      const b = q.boats[owner]!;
      if (b.burst) {
        // 連射: PT から今の艇へ（向きは東 0・時計回りの atan2、長さは距離 / 絵の幅）
        const dx = boat.x - b.x;
        const dy = boat.y - b.y;
        this.line.setPosition(b.x, b.y).setAngle(radToDeg(Math.atan2(dy, dx))).setScale(Math.sqrt(dx * dx + dy * dy) / this.line.width, this.lineScaleY);
        this.lineBurst = true;
      } else {
        if (this.lineBurst) {
          this.lineBurst = false;
          this.line.setScale(PT_PASS_LINE_LEN_M / this.line.width, this.lineScaleY);
        }
        this.line.setPosition(b.x, b.y).setAngle(b.lockDeg - 90); // 絵の x 軸を針路へ（北 0・時計回り → 東 0 の角度）
      }
    }
    for (let i = 0; i < q.shells.length; i++) {
      const s = q.shells[i]!;
      const img = this.tracers[i]!;
      if (!s.active) {
        if (img.visible) img.setVisible(false);
        continue;
      }
      if (!img.visible) img.setVisible(true);
      img.setPosition(s.x, s.y).setAngle(radToDeg(Math.atan2(s.vx, -s.vy)));
    }
    if (this.flashAge !== Infinity) {
      this.flashAge += realDt;
      if (this.flashAge >= PT_MUZZLE_FLASH_S) {
        this.flashAge = Infinity;
        this.flash.setVisible(false);
      } else this.flash.setAlpha(1 - this.flashAge / PT_MUZZLE_FLASH_S);
    }
    this.splashes.updateVisuals(realDt);
    this.gun?.updateVisuals(realDt);
  }

  destroy(): void {
    for (const s of this.sprites) s.destroy();
    for (const s of this.tracers) s.destroy();
    this.line.destroy();
    this.flash.destroy();
    this.splashes.destroy();
    this.gun?.destroy();
  }
}
