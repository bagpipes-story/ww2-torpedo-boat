// v0.7.0 S3b（アートと音①：コードで描く絵。spec-v0700 §5.2・R1・R7）＋ IP1a（ユーザーの U5「航跡が直線すぎるので少し揺らぎを出してください」）: 船体の航跡。
// - 尾（IP1a）: 船体ごとに泡（tex-wake-puff）の輪を持ち、艇尾が spacingM 進むごとに艇尾に 1 つ置く（距離は 2 乗で比べる）。泡は置いた時の針路の向きで、
//   寿命の間に広がり（w0 → w1）薄れて消える＝道のりのとおりに曲がる尾。置く所は横に揺らす（2 つの正弦の和の位相を泡ごとに進める・絵だけの乱数 ART_SEED_WAKE）。
//   輪がいっぱいなら一番古い泡を使い回す。船体の絵が見えない・薄くなったら、その船体の泡はすぐ消す（敵の位置をばらさない）。
// - V の印（S3b の tex-wake-boat／tex-wake-ship。頂点＝艇尾・原点 (0.5, 0)）は艇尾の近くだけに短く（WAKE_V_LEN_SHARE）。
// 自艇（jp_03 は座席の隊長艇）だけ世界の速力帯 w.band で段を決める（停止 なし・静音 薄い泡だけ（V なし）・巡航・全速＝R1・D9）。濃さは船体の状態の速さ（読むだけ）から。
// 対象: 自艇・僚艇・隼艇・駆逐艦と輸送船（destroyers.ships）・大発（敵 hunt・味方 convoy）・米PT・jp_03 の 18 隻（IP1a から僚艇も。U3「数でも大丈夫」。輪は隊長艇 8・僚艇 3）。
// 卯月と味方の輸送船は動かない（停泊）ので対象にしない。式は assets/fx-shape・wake-shape。§7: 確保は constructor だけ。update は読んで書くだけ（配列・オブジェクトを作らない）。論理の状態には書かない（art-rules）。
import type Phaser from 'phaser';
import { playerWakePose, sternOffsetInto, wakePose, type SpeedBand, type WakePose } from '../assets/fx-shape';
import { puffAlpha, puffWidth, swayAt, trailEmit, trailStep, type TrailEmit } from '../assets/wake-shape';
import { WAKE_DEPTH, WAKE_FRAME_V, WAKE_KIND_ART, WAKE_TEX_H, type WakeKindArt } from '../config/fx-art-config';
import { TEXTURE_KEYS } from '../config/game-config';
import {
  ART_SEED_WAKE, WAKE_PUFF_ANGLE_JITTER_DEG, WAKE_PUFF_FRAME_BUBBLE, WAKE_PUFF_FRAME_FOAM, WAKE_PUFF_TEX_H, WAKE_PUFF_TEX_W, WAKE_SWAY_JITTER_BEAMS, WAKE_SWAY_STEP, WAKE_TRAIL_ART,
  WAKE_V_ALPHA_SHARE, WAKE_V_LEN_SHARE, type WakeTrailArt,
} from '../config/wake-art-config';
import { SeededRng } from '../core/rng';

/** 船体の絵から読む物（Phaser の Image が満たす） */
export interface HullImg {
  readonly visible: boolean;
  readonly alpha: number;
  readonly displayHeight: number;
  readonly displayWidth: number;
}
/** 船体の状態から読む物（core の BoatState が満たす） */
export interface HullState {
  readonly x: number;
  readonly y: number;
  readonly headingDeg: number;
  readonly speedMps: number;
}
type Hull = { readonly sprite: HullImg; readonly state: HullState };
type EvacSq = { readonly boats: readonly { readonly group: number; readonly slot: number; readonly state: HullState }[]; readonly groups: readonly { readonly leader: number }[] };

/** 世界から読む物（MissionWorld がそのまま満たす。world-art の ArtWorldView に入る） */
export interface WakeWorldView {
  readonly band: SpeedBand;
  readonly boat: Hull;
  readonly escort: { readonly sprite: HullImg; readonly state: { readonly boat: HullState } } | null;
  readonly gunboat: { readonly sprite: HullImg; readonly state: { readonly boat: HullState } } | null;
  readonly destroyers: { readonly ships: readonly Hull[] } | null;
  readonly hunt: { readonly sprites: readonly HullImg[]; readonly flotilla: { readonly barges: readonly HullState[] } } | null;
  readonly convoy: { readonly sprites: readonly HullImg[]; readonly state: { readonly barges: readonly HullState[] } } | null;
  readonly pts: { readonly sprites: readonly HullImg[]; readonly section: { readonly boats: readonly HullState[] } } | null;
  readonly evac: { readonly sq: EvacSq; readonly view: { readonly boats: { readonly imgs: readonly HullImg[] } } | null } | null;
}

const DEG = Math.PI / 180;

export class WakeFx {
  private readonly imgs: Phaser.GameObjects.Image[] = [];
  private readonly hulls: HullImg[] = [];
  private readonly states: HullState[] = [];
  private readonly kinds: WakeKindArt[] = [];
  private readonly trails: WakeTrailArt[] = [];
  /** 船体ごと: 船体の半長・船幅（作った時の絵から 1 回）、泡の輪の始まりと数と次の番、前に泡を置いた艇尾の点、揺れの位相、点があるか */
  private readonly halfLen: Float32Array;
  private readonly beam: Float32Array;
  private readonly ringAt: Int32Array;
  private readonly ringN: Int32Array;
  private readonly ringCur: Int32Array;
  private readonly lastX: Float32Array;
  private readonly lastY: Float32Array;
  private readonly swayPh: Float32Array;
  private readonly hasLast: Uint8Array;
  /** 泡ごと（全部の輪を 1 列に）: 絵・位置・幅（始め・終わり）・長さ・α の上限・年齢・寿命（0 なら空き） */
  private readonly puffs: Phaser.GameObjects.Image[] = [];
  private readonly pW0: Float32Array;
  private readonly pW1: Float32Array;
  private readonly pLen: Float32Array;
  private readonly pA0: Float32Array;
  private readonly pAge: Float32Array;
  private readonly pLife: Float32Array;
  private readonly tmp = new Float32Array(2);
  private readonly pose: WakePose = { visible: false, lengthM: 0, alpha: 0, frame: WAKE_FRAME_V };
  private readonly emit: TrailEmit = { on: false, a0: 0, lifeShare: 1, widthShare: 1, bubble: false };
  private readonly rng = new SeededRng(ART_SEED_WAKE);

  constructor(scene: Phaser.Scene, w: WakeWorldView) {
    const T = WAKE_TRAIL_ART;
    const K = WAKE_KIND_ART;
    const add = (hull: HullImg, st: HullState, kind: WakeKindArt, trail: WakeTrailArt): void => {
      this.hulls.push(hull);
      this.states.push(st);
      this.kinds.push(kind);
      this.trails.push(trail);
      this.imgs.push(scene.add.image(0, 0, kind.ship ? TEXTURE_KEYS.wakeShip : TEXTURE_KEYS.wakeBoat, WAKE_FRAME_V).setOrigin(0.5, 0).setDepth(WAKE_DEPTH).setVisible(false));
    };
    add(w.boat.sprite, w.boat.state, K.boat, T.player); // 0 番＝自艇（速力帯）
    if (w.escort) add(w.escort.sprite, w.escort.state.boat, K.boat, T.boat);
    if (w.gunboat) add(w.gunboat.sprite, w.gunboat.state.boat, K.boat, T.boat);
    if (w.destroyers) for (const s of w.destroyers.ships) add(s.sprite, s.state, K.ship, T.ship);
    if (w.hunt) for (let i = 0; i < w.hunt.sprites.length; i++) add(w.hunt.sprites[i]!, w.hunt.flotilla.barges[i]!, K.barge, T.barge);
    if (w.convoy) for (let i = 0; i < w.convoy.sprites.length; i++) add(w.convoy.sprites[i]!, w.convoy.state.barges[i]!, K.barge, T.barge);
    if (w.pts) for (let i = 0; i < w.pts.sprites.length; i++) add(w.pts.sprites[i]!, w.pts.section.boats[i]!, K.boat, T.boat);
    const sq = w.evac ? w.evac.sq : null;
    if (sq && w.evac!.view) {
      const imgs = w.evac!.view.boats.imgs;
      for (let i = 0; i < imgs.length; i++) add(imgs[i]!, sq.boats[i]!.state, K.boat, sq.groups[sq.boats[i]!.group]!.leader === sq.boats[i]!.slot ? T.evacLeader : T.evacFollower);
    }
    const n = this.imgs.length;
    this.halfLen = new Float32Array(n);
    this.beam = new Float32Array(n);
    this.ringAt = new Int32Array(n);
    this.ringN = new Int32Array(n);
    this.ringCur = new Int32Array(n);
    this.lastX = new Float32Array(n);
    this.lastY = new Float32Array(n);
    this.swayPh = new Float32Array(n);
    this.hasLast = new Uint8Array(n);
    let total = 0;
    for (let i = 0; i < n; i++) {
      this.halfLen[i] = this.hulls[i]!.displayHeight / 2; // 船体の長さ・幅（世界単位）は作った時の絵から 1 回（沈没の tween で縮む前）
      this.beam[i] = this.hulls[i]!.displayWidth;
      this.ringAt[i] = total;
      this.ringN[i] = this.trails[i]!.cap;
      this.swayPh[i] = this.rng.next() * Math.PI * 2;
      total += this.trails[i]!.cap;
    }
    this.pW0 = new Float32Array(total);
    this.pW1 = new Float32Array(total);
    this.pLen = new Float32Array(total);
    this.pA0 = new Float32Array(total);
    this.pAge = new Float32Array(total);
    this.pLife = new Float32Array(total);
    for (let j = 0; j < total; j++) this.puffs.push(scene.add.image(0, 0, TEXTURE_KEYS.wakePuff, WAKE_PUFF_FRAME_FOAM).setDepth(WAKE_DEPTH).setVisible(false));
  }

  /** 毎フレーム（world-art から。船体の絵の同期の後＝このフレームの位置。realDt は見た目の時計） */
  update(realDt: number, w: WakeWorldView): void {
    const pose = this.pose;
    const em = this.emit;
    for (let i = 0; i < this.imgs.length; i++) {
      const hull = this.hulls[i]!;
      const st = this.states[i]!;
      const len = this.halfLen[i]! * 2;
      const band = i === 0 ? w.band : null;
      trailEmit(band, this.kinds[i]!, st.speedMps, hull.visible, hull.alpha, em);
      if (i === 0) playerWakePose(w.band, this.kinds[0]!, st.speedMps, len, hull.visible, hull.alpha, pose);
      else wakePose(this.kinds[i]!, st.speedMps, len, hull.visible, hull.alpha, pose);
      sternOffsetInto(this.tmp, st.headingDeg, this.halfLen[i]!);
      const sx = st.x + this.tmp[0]!;
      const sy = st.y + this.tmp[1]!;
      this.stepTrail(i, sx, sy, st.headingDeg, hull);
      const img = this.imgs[i]!;
      if (!pose.visible || pose.frame !== WAKE_FRAME_V) {
        if (img.visible) img.setVisible(false); // 静音は V を出さない（薄い泡の尾だけ）
        continue;
      }
      img.setPosition(sx, sy).setAngle(st.headingDeg).setScale((pose.lengthM * WAKE_V_LEN_SHARE) / WAKE_TEX_H).setAlpha(pose.alpha * WAKE_V_ALPHA_SHARE);
      if (!img.visible) img.setVisible(true);
    }
    this.agePuffs(realDt);
  }

  /** 船体 i の尾: 見えない船体はその泡を消す。艇尾が間隔だけ進んだら泡を 1 つ置く（遠すぎれば置かずに点だけ直す） */
  private stepTrail(i: number, sx: number, sy: number, headingDeg: number, hull: HullImg): void {
    const em = this.emit;
    if (!hull.visible || hull.alpha <= 0) this.clearHull(i);
    if (!em.on) {
      this.hasLast[i] = 0;
      return;
    }
    const tr = this.trails[i]!;
    if (this.hasLast[i] === 0) {
      this.lastX[i] = sx;
      this.lastY[i] = sy;
      this.hasLast[i] = 1;
      return;
    }
    const step = trailStep(sx - this.lastX[i]!, sy - this.lastY[i]!, tr.spacingM);
    if (step === 0) return;
    this.lastX[i] = sx;
    this.lastY[i] = sy;
    if (step === 2) return;
    const rng = this.rng;
    const beam = this.beam[i]!;
    this.swayPh[i] = this.swayPh[i]! + rng.nextRange(WAKE_SWAY_STEP[0], WAKE_SWAY_STEP[1]);
    const side = beam * (tr.swayBeams * swayAt(this.swayPh[i]!) + rng.nextRange(-WAKE_SWAY_JITTER_BEAMS, WAKE_SWAY_JITTER_BEAMS));
    const r = headingDeg * DEG;
    const j = this.ringAt[i]! + this.ringCur[i]!;
    this.ringCur[i] = (this.ringCur[i]! + 1) % this.ringN[i]!;
    const p = this.puffs[j]!;
    p.setPosition(sx + Math.cos(r) * side, sy + Math.sin(r) * side).setAngle(headingDeg + rng.nextRange(-WAKE_PUFF_ANGLE_JITTER_DEG, WAKE_PUFF_ANGLE_JITTER_DEG)).setAlpha(0);
    const frame = em.bubble ? WAKE_PUFF_FRAME_BUBBLE : WAKE_PUFF_FRAME_FOAM;
    if (p.frame.name !== frame) p.setFrame(frame);
    if (!p.visible) p.setVisible(true);
    this.pW0[j] = beam * tr.w0Beams * em.widthShare;
    this.pW1[j] = beam * tr.w1Beams * em.widthShare;
    this.pLen[j] = tr.spacingM * tr.lenShare;
    this.pA0[j] = em.a0 * tr.alphaMul;
    this.pAge[j] = 0;
    this.pLife[j] = tr.lifeS * em.lifeShare;
  }

  /** 船体 i の泡を全部消す */
  private clearHull(i: number): void {
    const a = this.ringAt[i]!;
    for (let j = a; j < a + this.ringN[i]!; j++) {
      if (this.pLife[j]! <= 0) continue;
      this.pLife[j] = 0;
      this.puffs[j]!.setVisible(false);
    }
  }

  /** 泡の年齢を進め、α と広がりを書く。寿命が来たら隠して空きに */
  private agePuffs(dt: number): void {
    for (let j = 0; j < this.puffs.length; j++) {
      const life = this.pLife[j]!;
      if (life <= 0) continue;
      const age = this.pAge[j]! + dt;
      const p = this.puffs[j]!;
      if (age >= life) {
        this.pLife[j] = 0;
        p.setVisible(false);
        continue;
      }
      this.pAge[j] = age;
      p.setAlpha(puffAlpha(age, life, this.pA0[j]!)).setScale(puffWidth(age, life, this.pW0[j]!, this.pW1[j]!) / WAKE_PUFF_TEX_W, (this.pLen[j]! * (1 + 0.4 * (age / life))) / WAKE_PUFF_TEX_H);
    }
  }

  destroy(): void {
    for (const g of this.imgs) g.destroy();
    for (const g of this.puffs) g.destroy();
    this.imgs.length = 0;
    this.puffs.length = 0;
  }
}
