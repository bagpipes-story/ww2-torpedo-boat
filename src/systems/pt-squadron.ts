// 敵の米PT の隊（v0.6.3。docs/02 §6.4、spec §C.5〜C.6・§D.5）の世界側: core/pt-boats を固定ステップで進め、掃射の命中を世界に伝え、
// PT・航過の赤い線（予告）・曳光弾・外れ弾の水柱・砲口の閃光を描く（barge-hunt と同じ形）。
// §7: PT count 枚・線 1 本・曳光弾 24 枚・水柱 24 枚・閃光 1 枚を起動時に作り、毎フレームは transform/alpha/visible だけ触る。check と events は 1 個だけ作る。
// 乱数: seed+18（PT_SEED_OFFSET）の 1 系列だけ（1 発 2 回と命中の火災・機関）。米PT の隊の無い任務ではこのクラスを作らない（ほかの系列は動かさない）。
import Phaser from 'phaser';
import { DEPTH, RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import { AIR_STRIKE_RUN_LINE_ALPHA, AIR_STRIKE_RUN_LINE_TINT, AIR_STRIKE_RUN_LINE_WIDTH_M } from '../config/dawn-config';
import { GUN_SPLASH_SCALE_HIT, GUN_SPLASH_SCALE_MISS, MG_TRACER_TINT } from '../config/hunt-config';
import { PT_MUZZLE_FLASH_S, PT_MUZZLE_FLASH_SCALE, PT_MUZZLE_FLASH_TINT, PT_PASS_LINE_LEN_M, PT_SHELL_POOL_SIZE, PT_SPLASH_POOL_SIZE } from '../config/pt-config';
import type { BoatState, SpeedStep } from '../core/boat-motion';
import type { HitSpec } from '../core/gunnery';
import { PT_OUT, PT_SEED_OFFSET, createPtSection, stepPtSection, threatIndex, type PtCheck, type PtEvents, type PtParams, type PtSection } from '../core/pt-boats';
import { SeededRng } from '../core/rng';
import type { SmokeParams, SmokeState } from '../core/smoke';
import { radToDeg } from '../core/units';
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
  private readonly check: PtCheck;
  private readonly splashes: SplashPool;
  private readonly sprites: Phaser.GameObjects.Image[] = [];
  private readonly shown: Uint8Array;
  private readonly tracers: Phaser.GameObjects.Image[] = [];
  private readonly line: Phaser.GameObjects.Image;
  private lineShown = false;
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
    this.line.setScale(PT_PASS_LINE_LEN_M / this.line.width, AIR_STRIKE_RUN_LINE_WIDTH_M / this.line.height);
    this.flash = scene.add.image(0, 0, TEXTURE_KEYS.explosionRing).setTint(PT_MUZZLE_FLASH_TINT).setScale(PT_MUZZLE_FLASH_SCALE / RENDER_SCALE).setDepth(DEPTH.effects).setVisible(false);
  }

  /**
   * 固定ステップ（自艇・速力帯・発見距離の後、火災の前。模擬 core/pt-pass-sim と同じ順）: 材料を書いて隊を進め、
   * 隊が捉えた立ち上がりで「見つかった回数」を数える（駆逐艦の destroyer-step と同じ数え方）。最初の 1 回は自艇の速力帯を覚える
   */
  step(dt: number, feelDt: number, w: PtSquadronView): void {
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
    stepPtSection(q, this.p, c, this.rng, feelDt, dt, this.events);
    if (q.detected && !w.detect.prev) {
      w.detect.count++;
      if (this.firstDetectBand === '') this.firstDetectBand = w.band;
    }
    w.detect.prev = q.detected;
  }

  /** 自艇から見た「いまの敵」: 脅威の PT（航過中 → 突撃 → 離脱 → 哨戒。core/pt-boats の threatIndex）。去った PT だけなら null */
  focus(x: number, y: number): BoatState | null {
    const i = threatIndex(this.section, x, y);
    return i < 0 ? null : this.section.boats[i]!;
  }

  /** 毎フレーム: PT（視程の内だけ表示）、航過の赤い線（航過中の PT から固めた針路へ）、曳光弾、閃光、水柱（変わるものだけ触る） */
  updateVisuals(realDt: number, visRange2: number): void {
    const q = this.section;
    const boat = this.check.boat;
    for (let i = 0; i < this.sprites.length; i++) {
      const b = q.boats[i]!;
      const img = this.sprites[i]!;
      const show = b.phase !== PT_OUT && (b.x - boat.x) * (b.x - boat.x) + (b.y - boat.y) * (b.y - boat.y) <= visRange2;
      if (show !== (this.shown[i] === 1)) {
        this.shown[i] = show ? 1 : 0;
        img.setVisible(show);
      }
      if (show) img.setPosition(b.x, b.y).setAngle(b.headingDeg);
    }
    // 航過は同時に 1 隻だけ（core）なので線は 1 本。固めた時に出し、航過の終わり・夜明けで去ると消える
    const owner = q.owner;
    if ((owner >= 0) !== this.lineShown) {
      this.lineShown = owner >= 0;
      this.line.setVisible(this.lineShown);
    }
    if (owner >= 0) {
      const b = q.boats[owner]!;
      this.line.setPosition(b.x, b.y).setAngle(b.lockDeg - 90); // 絵の x 軸を針路へ（北 0・時計回り → 東 0 の角度）
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
  }

  destroy(): void {
    for (const s of this.sprites) s.destroy();
    for (const s of this.tracers) s.destroy();
    this.line.destroy();
    this.flash.destroy();
    this.splashes.destroy();
  }
}
