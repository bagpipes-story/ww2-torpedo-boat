// 空襲下の退避（v0.6.11 S5。jp_03。spec-v0611-r2 §10.4・§11 の L4・L8）の印: 地図の上（Mission のシーン）の輪と字、画面の端（Hud のシーン）の矢印。
// - EvacMarks（systems/evac-flights の buildEvac が作り、世界のフレームの絵で毎フレーム）: 隠れ場所の輪（Boot の tex-evac-ring。満杯は薄く）と札「西の壕 空き 3/3」（4 つ。空きが変わったときだけ）、
//   操作中の隊の白い輪 1・狙われた隊の赤い輪（隊ごとに 1 つ＝6。点滅は tween なしで世界の秒から濃さ）・見つかった陰の黄の輪（陰ごと）、隊の番号「1」〜「6」（隊長艇の上。位置は毎フレーム、
//   色と字は見え方が変わったときだけ＝灰 停泊・白 走る・暗い緑 隠れた・黄 見つかった・赤 狙われている・灰の × 全滅、操作中は太字）。字はズームが変わった時だけ setScale(1/zoom)
//   （見張り 0.5 でも画面上 EVAC_NUMBER_PX）。Text は番号 6 ＋ 札 4＝10。
// - EvacEdgeMarkers（ui/hud-markers が evac の任務だけ作る。帰投の印「帰投 N m」は出さない＝r2 L8）: 画面の外の狙われた隊（操作中の隊を除く）への赤い「第4隊 600 m」を ≤ EVAC_EDGE_TARGETS、
//   近い空いた隠れ場所への青い「西の壕 800 m」1 本（入っている・上げている・隠れている間は出さない）。ラベルの名は替わったときだけ（EdgeMarker.setPrefix）。右下の速力の角を避け、近い矢印から縁に沿ってずらす。
//   ラベルは画面の枠の左右 HUD_MARGIN の内（S8b の labelInset。左の縁の「西の壕 1200 m」が W 1280 で画面の外へ出た）。上下の縁で横に並ぶ矢印はラベルの幅で離す（S8b）。
//   画面の点はカメラの本当の中心から（t.evac.camDx/Dy。jp_03 の海は 3,200 × 1,250 m と小さく、見張り 0.5 ではカメラが海の縁で止まって自艇が画面の中心に無い＝EdgeMarker の「自艇＋見越し」の見方では
//   画面の内の隊にも矢印が出た。ヘッドレスの画面写しで見つけた）。「画面の内なら隠す」は本当の画面の矩形（hideMargin 0＝隼艇の矢印と同じ。上の HUD の帯の下に見えている隊の赤い輪と番号にも
//   矢印を出さない）。距離は座席から（平方根は出す矢印だけ）。
// §7: 物は constructor だけで作る（Image 4 ＋ 1 ＋ 6 ＋ 陰の数・Text 10・端の矢印 4）。毎フレームは位置と濃さ、字は変わったときだけ。
import Phaser from 'phaser';
import {
  EVAC_CONTROL_TINT, EVAC_EDGE_TARGETS, EVAC_FOUND_TINT, EVAC_GROUP_RING_M, EVAC_LABEL_PX, EVAC_NUMBER_OFFSET_PX, EVAC_NUMBER_PX, EVAC_RING_TEX_RADIUS_UNITS, EVAC_SHELTER_FULL_ALPHA,
  EVAC_SHELTER_RING_ALPHA, EVAC_SHELTER_TINT, EVAC_TARGET_ALPHA_MAX, EVAC_TARGET_ALPHA_MIN, EVAC_TARGET_PULSE_HZ, EVAC_TARGET_TINT,
} from '../config/evac-config';
import { DEPTH, GAME_HEIGHT, GAME_WIDTH, HUD_MARGIN, RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import {
  CAMERA_LOOK_AHEAD_M, HOME_COLOR_TEXT, HOME_MARKER_DISTANCE_STEP_M, HOME_MARKER_TOP_MARGIN, HUD_COLOR_WARN, HUD_FONT_MARKER_PX, PLANE_DISTANCE_STEP_M, TARGET_MARKER_MARGIN, TARGET_MARKER_RIGHT_MARGIN, TARGET_MARKER_TOP_MARGIN, hudTextStyle,
} from '../config/ui-config';
import { degToRad } from '../core/units';
import type { BoatTelemetry } from '../core/boat-motion';
import { G_FOUND, G_GONE, SHELTER_COVER } from '../core/evac-data';
import { evacAfloat, evacLeader, type EvacSquadron } from '../core/evac-squadron';
import { EdgeMarker } from './edge-marker';
import { EVAC_NUMBER_COLORS, evacNumberLook } from './evac-lines';
import { EDGE_EPS_PX, avoidCorner, separateMarker, type MarkerRect, type MarkerShift } from './marker-separation';

/** 輪の Image の倍率（半径 m へ） */
const ringScale = (radiusM: number): number => radiusM / EVAC_RING_TEX_RADIUS_UNITS / RENDER_SCALE;
/** 狙われた隊の輪は操作中の白い輪の少し外（同じ隊で重なっても両方見える） */
const TARGET_RING_K = 1.18;
/** 見つかった陰の黄の輪は隠れ場所の輪の少し外 */
const FOUND_RING_K = 1.12;
/** 札と輪の縁の間 m */
const LABEL_GAP_M = 6;

export class EvacMarks {
  private readonly shelterRings: Phaser.GameObjects.Image[] = [];
  private readonly shelterLabels: Phaser.GameObjects.Text[] = [];
  /** 陰ごとの黄の輪（壕は null） */
  private readonly foundRings: (Phaser.GameObjects.Image | null)[] = [];
  private readonly targetRings: Phaser.GameObjects.Image[] = [];
  private readonly controlRing: Phaser.GameObjects.Image;
  private readonly numbers: Phaser.GameObjects.Text[] = [];
  /** 前回の空き（札）・見え方（番号）・操作中の隊・ズーム・黄の輪・赤の輪 */
  private readonly lastFree: Int32Array;
  private readonly lastLook: Int8Array;
  private readonly lastFound: Uint8Array;
  private readonly lastTarget: Uint8Array;
  private lastControl = -1;
  private lastZoom = NaN;

  constructor(scene: Phaser.Scene, private readonly sq: EvacSquadron) {
    const p = sq.p;
    const midY = sq.cfg.bounds.height / 2;
    for (let s = 0; s < p.shelters.length; s++) {
      const sh = p.shelters[s]!;
      this.shelterRings.push(scene.add.image(sh.x, sh.y, TEXTURE_KEYS.evacRing).setScale(ringScale(p.shelterRingM)).setTint(EVAC_SHELTER_TINT).setAlpha(EVAC_SHELTER_RING_ALPHA).setDepth(DEPTH.returnRing));
      // 札は海の側（南の岸の壕は輪の上、北の岸の陰は輪の下）
      const above = sh.y > midY;
      this.shelterLabels.push(
        scene.add.text(sh.x, above ? sh.y - p.shelterRingM - LABEL_GAP_M : sh.y + p.shelterRingM + LABEL_GAP_M, '', hudTextStyle(EVAC_LABEL_PX, HOME_COLOR_TEXT)).setOrigin(0.5, above ? 1 : 0).setDepth(DEPTH.impactRing),
      );
      this.foundRings.push(sh.kind === SHELTER_COVER ? scene.add.image(sh.x, sh.y, TEXTURE_KEYS.evacRing).setScale(ringScale(p.shelterRingM * FOUND_RING_K)).setTint(EVAC_FOUND_TINT).setDepth(DEPTH.returnRing).setVisible(false) : null);
    }
    for (let gi = 0; gi < sq.groups.length; gi++) {
      this.targetRings.push(scene.add.image(0, 0, TEXTURE_KEYS.evacRing).setScale(ringScale(EVAC_GROUP_RING_M * TARGET_RING_K)).setTint(EVAC_TARGET_TINT).setDepth(DEPTH.returnRing).setVisible(false));
      this.numbers.push(scene.add.text(0, 0, '', hudTextStyle(EVAC_NUMBER_PX)).setOrigin(0.5, 1).setDepth(DEPTH.impactRing));
    }
    this.controlRing = scene.add.image(0, 0, TEXTURE_KEYS.evacRing).setScale(ringScale(EVAC_GROUP_RING_M)).setTint(EVAC_CONTROL_TINT).setDepth(DEPTH.returnRing);
    this.lastFree = new Int32Array(p.shelters.length).fill(-1);
    this.lastLook = new Int8Array(sq.groups.length).fill(-1);
    this.lastFound = new Uint8Array(p.shelters.length);
    this.lastTarget = new Uint8Array(sq.groups.length);
  }

  /** 毎フレーム（世界のフレームの絵）。nowS は世界の時計（赤い輪の点滅）、zoom は論理ズーム（カメラのズーム ÷ RENDER_SCALE） */
  update(nowS: number, zoom: number): void {
    const sq = this.sq;
    const p = sq.p;
    const zoomed = zoom !== this.lastZoom;
    if (zoomed) {
      this.lastZoom = zoom;
      for (const tx of this.numbers) tx.setScale(1 / zoom);
      for (const tx of this.shelterLabels) tx.setScale(1 / zoom);
    }
    // 隠れ場所の札と輪（空き＝枠 − 取られた枠。操作中の隊が入れない＝空きが隊の隻数より少なければ薄く）
    const need = evacAfloat(sq.groups[sq.control]!);
    for (let s = 0; s < p.shelters.length; s++) {
      const free = p.shelters[s]!.slots - sq.shelterUsed[s]!;
      const key = free * 8 + Math.min(7, need);
      if (key !== this.lastFree[s]) {
        this.lastFree[s] = key;
        this.shelterLabels[s]!.setText(`${p.shelters[s]!.labelJa} 空き ${free}/${p.shelters[s]!.slots}`);
        this.shelterRings[s]!.setAlpha(free >= need ? EVAC_SHELTER_RING_ALPHA : EVAC_SHELTER_FULL_ALPHA);
      }
      this.lastFound[s] = 0;
    }
    // 隊の番号・狙われた隊の赤い輪・見つかった陰
    const pulse = EVAC_TARGET_ALPHA_MIN + (EVAC_TARGET_ALPHA_MAX - EVAC_TARGET_ALPHA_MIN) * (0.5 + 0.5 * Math.cos(2 * Math.PI * EVAC_TARGET_PULSE_HZ * nowS));
    const off = EVAC_NUMBER_OFFSET_PX / zoom;
    for (let gi = 0; gi < sq.groups.length; gi++) {
      const g = sq.groups[gi]!;
      const lead = evacLeader(g);
      const at = lead ? lead.state : g.boats[0]!.state;
      const targeted = sq.targeted[gi] !== 0 && lead !== null;
      const look = evacNumberLook(g.phase, targeted) + (gi === sq.control ? 8 : 0);
      const tx = this.numbers[gi]!;
      if (look !== this.lastLook[gi]) {
        this.lastLook[gi] = look;
        tx.setText(g.phase === G_GONE ? '×' : String(gi + 1)).setColor(EVAC_NUMBER_COLORS[look & 7]!).setFontStyle(gi === sq.control ? 'bold' : '');
      }
      tx.setPosition(at.x, at.y - off);
      const ring = this.targetRings[gi]!;
      if ((targeted ? 1 : 0) !== this.lastTarget[gi]) {
        this.lastTarget[gi] = targeted ? 1 : 0;
        ring.setVisible(targeted);
      }
      if (targeted) ring.setPosition(at.x, at.y).setAlpha(pulse);
      if (g.phase === G_FOUND && g.shelter >= 0) this.lastFound[g.shelter] = 1;
      if (gi === sq.control && g.foundCover >= 0) this.lastFound[g.foundCover] = 1;
    }
    for (let s = 0; s < p.shelters.length; s++) {
      const fr = this.foundRings[s];
      if (fr && fr.visible !== (this.lastFound[s] === 1)) fr.setVisible(this.lastFound[s] === 1);
    }
    // 操作中の隊の白い輪（全滅の後の自動の切替で隊が替わる）
    const cl = evacLeader(sq.groups[sq.control]!);
    if (sq.control !== this.lastControl) {
      this.lastControl = sq.control;
      this.controlRing.setVisible(cl !== null);
    }
    if (cl) this.controlRing.setPosition(cl.state.x, cl.state.y);
  }

  destroy(): void {
    for (const o of this.shelterRings) o.destroy();
    for (const o of this.shelterLabels) o.destroy();
    for (const o of this.foundRings) o?.destroy();
    for (const o of this.targetRings) o.destroy();
    for (const o of this.numbers) o.destroy();
    this.controlRing.destroy();
  }
}

/** 端の矢印が止まる縁の矩形（狙われた隊は「PT」と同じ上端・ラベルは矢印の下、隠れ場所は帰投と同じ上端・ラベルは矢印の上） */
const TARGET_RECT: MarkerRect = { left: TARGET_MARKER_MARGIN, top: TARGET_MARKER_TOP_MARGIN, right: GAME_WIDTH - TARGET_MARKER_RIGHT_MARGIN, bottom: GAME_HEIGHT - TARGET_MARKER_MARGIN };
const SHELTER_RECT: MarkerRect = { left: TARGET_MARKER_MARGIN, top: HOME_MARKER_TOP_MARGIN, right: GAME_WIDTH - TARGET_MARKER_RIGHT_MARGIN, bottom: GAME_HEIGHT - TARGET_MARKER_MARGIN };
/** 2 本の矢印を離す px（字 2 行ぶん。ui/hud-markers の隼艇と同じ）。上下の縁では横に並ぶラベルが重ならないよう、2 つのラベルの幅の半分ずつ ＋ この px（S8b） */
const SEP_PX = HUD_FONT_MARKER_PX * 2 + 8;
const LABEL_SEP_GAP_PX = 12;
const shift: MarkerShift = { dx: 0, dy: 0 };

export class EvacEdgeMarkers {
  private readonly targets: EdgeMarker[] = [];
  private readonly shelter: EdgeMarker;

  /** keepLeft・keepTop は右下の速力の HUD の角（ui/hud-markers の SPEED_HUD_KEEP_*） */
  constructor(scene: Phaser.Scene, private readonly keepLeft: number, private readonly keepTop: number) {
    for (let i = 0; i < EVAC_EDGE_TARGETS; i++) {
      this.targets.push(new EdgeMarker(scene, { textureKey: TEXTURE_KEYS.targetMarker, labelPrefix: '', stepM: PLANE_DISTANCE_STEP_M, labelAbove: false, roundUp: true, topMargin: TARGET_MARKER_TOP_MARGIN, color: HUD_COLOR_WARN, hideMargin: 0, labelInset: HUD_MARGIN }));
    }
    this.shelter = new EdgeMarker(scene, { textureKey: TEXTURE_KEYS.homeMarker, labelPrefix: '', stepM: HOME_MARKER_DISTANCE_STEP_M, labelAbove: true, roundUp: true, topMargin: HOME_MARKER_TOP_MARGIN, color: HOME_COLOR_TEXT, hideMargin: 0, labelInset: HUD_MARGIN });
  }

  /** 毎フレーム（ui/hud-markers の refresh から）。狙われた隊は隊の番号の順に（操作中の隊を除く） */
  refresh(t: BoatTelemetry): void {
    const e = t.evac;
    // EdgeMarker は「自艇＋見越し」を画面の中心とみなす（sx = (dx − sin(h) × 見越し) × zoom）。カメラの本当の中心へ置き直すずれ（無ければ 0＝今までの見方）
    const h = degToRad(t.headingDeg);
    const ox = Number.isNaN(e.camDx) ? 0 : e.camDx - Math.sin(h) * CAMERA_LOOK_AHEAD_M;
    const oy = Number.isNaN(e.camDy) ? 0 : e.camDy + Math.cos(h) * CAMERA_LOOK_AHEAD_M;
    let k = 0;
    for (let gi = 0; gi < e.groupDx.length && k < this.targets.length; gi++) {
      if ((e.targetedMask & (1 << gi)) === 0 || gi === e.control || Number.isNaN(e.groupDx[gi]!)) continue;
      const m = this.targets[k++]!;
      const dx = e.groupDx[gi]!;
      const dy = e.groupDy[gi]!;
      m.setPrefix(e.groupLabels[gi] ?? '');
      m.refresh(dx - ox, dy - oy, true, t, undefined, true, ox, oy); // 距離は座席から（EdgeMarker が画面の外の時だけ平方根。v0.6.11 S8）
      this.place(m, TARGET_RECT, k - 1);
    }
    for (; k < this.targets.length; k++) this.targets[k]!.refresh(NaN, NaN, false, t);
    const sm = this.shelter;
    if (e.near >= 0) sm.setPrefix(e.shelterLabels[e.near] ?? '');
    sm.refresh(e.nearDx - ox, e.nearDy - oy, e.near >= 0 && !Number.isNaN(e.nearDx), t, e.nearEdgeM);
    this.place(sm, SHELTER_RECT, this.targets.length);
  }

  /** 右下の速力の角を避け、先に出ている矢印（0〜before − 1）から縁に沿ってずらす */
  private place(m: EdgeMarker, r: MarkerRect, before: number): void {
    if (!m.isShown) return;
    m.nudge(avoidCorner(m.shownX, m.shownY, r, this.keepLeft, this.keepTop, shift).dx, shift.dy);
    for (let j = 0; j < before; j++) {
      const a = this.targets[j]!;
      if (!a.isShown) continue;
      // 上下の縁（左右の縁でない）ではラベルが横に並ぶ: 字 2 行ぶんでは「第4隊 900 m」「第6隊 900 m」が重なった（S8b のヘッドレスの画面写し）
      const side = Math.abs(m.shownX - r.left) < EDGE_EPS_PX || Math.abs(m.shownX - r.right) < EDGE_EPS_PX;
      const sep = side ? SEP_PX : Math.max(SEP_PX, (a.labelWidth + m.labelWidth) / 2 + LABEL_SEP_GAP_PX);
      m.nudge(separateMarker(a.shownX, a.shownY, m.shownX, m.shownY, r, sep, shift).dx, shift.dy);
    }
  }

  destroy(): void {
    for (const m of this.targets) m.destroy();
    this.shelter.destroy();
  }
}
