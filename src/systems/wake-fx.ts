// v0.7.0 S3b（アートと音①：コードで描く絵。spec-v0700 §5.2・R1・R7）: 船体の航跡＝船体 1 つに Image 1 枚（tex-wake-boat／tex-wake-ship。頂点＝艇尾・原点 (0.5, 0)）。
// 位置＝艇尾（中心から艇首の逆へ半長）、角度＝針路、scale ∝ 速さ（上限）、α ∝ 速さ/基準 × WAKE_ALPHA_MAX × 船体の α。0.5 m/s 未満・船体の絵が見えない（夜の sighted・jp_03 の隠れた隊・沈没の tween）なら隠す。
// 自艇（jp_03 は座席の隊長艇）だけ世界の速力帯 w.band で段を決める（停止 なし・静音 泡だけ・巡航 V・全速 長く明るい V＝R1・D9）。速さは船体の状態（読むだけ）から。
// 対象: 自艇・僚艇・隼艇・駆逐艦と輸送船（destroyers.ships）・大発（敵 hunt・味方 convoy）・米PT・jp_03 の 18 隻（WAKE_EVAC_LEADERS_ONLY なら隊長艇だけ＝見える物 +6）。
// 卯月と味方の輸送船は動かない（停泊）ので対象にしない。式は assets/fx-shape。§7: 確保は constructor だけ。update は読んで書くだけ（配列・オブジェクトを作らない）。論理の状態には書かない（art-rules）。
import type Phaser from 'phaser';
import { playerWakePose, sternOffsetInto, wakePose, type SpeedBand, type WakePose } from '../assets/fx-shape';
import { WAKE_DEPTH, WAKE_EVAC_LEADERS_ONLY, WAKE_FRAME_V, WAKE_KIND_ART, WAKE_TEX_H, type WakeKindArt } from '../config/fx-art-config';
import { TEXTURE_KEYS } from '../config/game-config';

/** 船体の絵から読む物（Phaser の Image が満たす） */
export interface HullImg {
  readonly visible: boolean;
  readonly alpha: number;
  readonly displayHeight: number;
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

export class WakeFx {
  private readonly imgs: Phaser.GameObjects.Image[] = [];
  private readonly hulls: HullImg[] = [];
  private readonly states: HullState[] = [];
  private readonly kinds: WakeKindArt[] = [];
  /** jp_03 の 18 隻の番号（隊長艇だけ出す判定に読む）。ほかは −1 */
  private readonly evacIdx: Int16Array;
  private readonly halfLen: Float32Array;
  private readonly tmp = new Float32Array(2);
  private readonly pose: WakePose = { visible: false, lengthM: 0, alpha: 0, frame: WAKE_FRAME_V };
  private readonly sq: EvacSq | null;

  constructor(scene: Phaser.Scene, w: WakeWorldView) {
    const ev: number[] = [];
    const add = (hull: HullImg, st: HullState, kind: WakeKindArt, evacI: number): void => {
      this.hulls.push(hull);
      this.states.push(st);
      this.kinds.push(kind);
      this.imgs.push(scene.add.image(0, 0, kind.ship ? TEXTURE_KEYS.wakeShip : TEXTURE_KEYS.wakeBoat, WAKE_FRAME_V).setOrigin(0.5, 0).setDepth(WAKE_DEPTH).setVisible(false));
      ev.push(evacI);
    };
    const K = WAKE_KIND_ART;
    add(w.boat.sprite, w.boat.state, K.boat, -1); // 0 番＝自艇（速力帯）
    if (w.escort) add(w.escort.sprite, w.escort.state.boat, K.boat, -1);
    if (w.gunboat) add(w.gunboat.sprite, w.gunboat.state.boat, K.boat, -1);
    if (w.destroyers) for (const s of w.destroyers.ships) add(s.sprite, s.state, K.ship, -1);
    if (w.hunt) for (let i = 0; i < w.hunt.sprites.length; i++) add(w.hunt.sprites[i]!, w.hunt.flotilla.barges[i]!, K.barge, -1);
    if (w.convoy) for (let i = 0; i < w.convoy.sprites.length; i++) add(w.convoy.sprites[i]!, w.convoy.state.barges[i]!, K.barge, -1);
    if (w.pts) for (let i = 0; i < w.pts.sprites.length; i++) add(w.pts.sprites[i]!, w.pts.section.boats[i]!, K.boat, -1);
    this.sq = w.evac ? w.evac.sq : null;
    if (w.evac && w.evac.view) for (let i = 0; i < w.evac.view.boats.imgs.length; i++) add(w.evac.view.boats.imgs[i]!, w.evac.sq.boats[i]!.state, K.boat, i);
    const n = this.imgs.length;
    this.evacIdx = Int16Array.from(ev);
    this.halfLen = new Float32Array(n);
    for (let i = 0; i < n; i++) this.halfLen[i] = this.hulls[i]!.displayHeight / 2; // 船体の長さ（世界単位）は作った時の絵から 1 回（沈没の tween で縮む前）
  }

  /** 毎フレーム（world-art から。船体の絵の同期の後＝このフレームの位置） */
  update(w: WakeWorldView): void {
    const pose = this.pose;
    const sq = this.sq;
    for (let i = 0; i < this.imgs.length; i++) {
      const hull = this.hulls[i]!;
      const st = this.states[i]!;
      const len = this.halfLen[i]! * 2;
      const ei = this.evacIdx[i]!;
      if (i === 0) playerWakePose(w.band, this.kinds[0]!, st.speedMps, len, hull.visible, hull.alpha, pose);
      else if (ei >= 0 && WAKE_EVAC_LEADERS_ONLY && sq && sq.groups[sq.boats[ei]!.group]!.leader !== sq.boats[ei]!.slot) pose.visible = false;
      else wakePose(this.kinds[i]!, st.speedMps, len, hull.visible, hull.alpha, pose);
      const img = this.imgs[i]!;
      if (!pose.visible) {
        if (img.visible) img.setVisible(false);
        continue;
      }
      sternOffsetInto(this.tmp, st.headingDeg, this.halfLen[i]!);
      img.setPosition(st.x + this.tmp[0]!, st.y + this.tmp[1]!).setAngle(st.headingDeg).setScale(pose.lengthM / WAKE_TEX_H).setAlpha(pose.alpha);
      if (img.frame.name !== pose.frame) img.setFrame(pose.frame);
      if (!img.visible) img.setVisible(true);
    }
  }

  destroy(): void {
    for (const g of this.imgs) g.destroy();
    this.imgs.length = 0;
  }
}
