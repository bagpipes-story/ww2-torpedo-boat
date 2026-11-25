// 救助の任務の絵（v0.8.5 S2。us_07。spec-v0850 §6・§7 S2）: 掃海済みの水路の帯（任務の開始に 1 回描く Graphics）・水路のブイ・フィッチ（味方のフレッチャー級と渡す輪）・
// 沈んでいくコリー（暗く・傾き・救助の時間につれて薄れる。油の輪）・生存者の群（人数の frame と札）・見えた機雷・フィッチの砲火（S ボートが砲火の距離の内に居る間の砲口の閃光と周りの水柱）。
// 読むだけ（世界の状態・AI・乱数に書かない）。フィッチの砲火の閃光と水柱は世界の水柱のプール（SplashPool の muzzle・splash）＝絵が出すので音（遠い砲・水柱）も鳴る（音は絵と HUD に従う）。
// 機雷原の区画（data の fields の矩形）は描かない（v0.8.5 IP1。実機 1 回目のユーザー「わざわざ赤くエリアを示さなくていい」。機雷は見えた物だけ＝昼の 150 m）。
// §7: 物は起動時に数を決めて作り（群 ≤ 16・機雷 ≤ 64・ブイ ≤ BUOY_MAX）、毎フレームは変わった時だけ setVisible・setFrame・setText・setAlpha。平方根なし。
import type Phaser from 'phaser';
import { DEPTH, RENDER_SCALE, TEXTURE_KEYS, artImageScale } from '../config/game-config';
import { hudTextStyle, RETURN_RING_TEX_RADIUS_UNITS } from '../config/ui-config';
import { EXPLOSION_RING_RADIUS_UNITS } from '../assets/art-dims';
import { rescueArtScale } from '../assets/rescue-art';
import {
  BUOY_INSET_M, BUOY_MAX, BUOY_SPACING_M,
  CORRY_ALPHA_FROM, CORRY_ALPHA_STEPS, CORRY_ALPHA_TO, CORRY_LIST_SCALE_X, CORRY_OIL_ALPHA, CORRY_OIL_RADIUS_M, CORRY_SETTLE_DEG, CORRY_TINT,
  FITCH_FIRE_INTERVAL_S, FITCH_RING_ALPHA, FITCH_RING_COLOR, FITCH_SPLASH_OFFSETS,
  LANE_FILL_ALPHA, LANE_FILL_COLOR,
  RESCUE_TEX_ALLY_SHIP, RESCUE_TEX_BUOY, RESCUE_TEX_MINE, RESCUE_TEX_SURVIVORS, SHIP_LABEL_COLOR, SHIP_LABEL_FONT_PX, SHIP_LABEL_GAP,
  SURVIVOR_HEADS_MAX, SURVIVOR_LABEL_COLOR, SURVIVOR_LABEL_DY, SURVIVOR_LABEL_FONT_PX, SURVIVOR_TEX_UNITS,
} from '../config/rescue-art-config';
import { corryLabelSpot } from '../ui/rescue-label-spot';
import { MINE_SEEN } from '../core/minefield';
import type { PtSection } from '../core/pt-boats';
import type { SplashPool } from './splash-pool';
import type { WorldSetup } from './world-setup';

/** 読む救助の世界の部分（systems/world-rescue の WorldRescue がそのまま満たす） */
export interface RescueViewSource {
  readonly state: { readonly n: number; readonly gx: Float64Array; readonly gy: Float64Array; readonly left: Int16Array };
  readonly mines: { readonly max: number; readonly x: Float64Array; readonly y: Float64Array; readonly state: Uint8Array } | null;
  readonly cover: { readonly inS: Float64Array } | null;
}

/** 毎フレーム読む世界の部分 */
export interface RescueViewWorld {
  readonly stepTimeS: number;
  readonly pts: { readonly section: PtSection } | null;
}

export class RescueView {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly fitch: Phaser.GameObjects.Image;
  private readonly ring: Phaser.GameObjects.Image;
  private readonly corry: Phaser.GameObjects.Image;
  private readonly oil: Phaser.GameObjects.Image;
  private readonly labels: Phaser.GameObjects.Text[] = [];
  private readonly groups: Phaser.GameObjects.Image[] = [];
  private readonly counts: Phaser.GameObjects.Text[] = [];
  private readonly shownLeft: Int16Array;
  private readonly mines: Phaser.GameObjects.Image[] = [];
  private readonly mineShown: Uint8Array;
  private readonly buoys: Phaser.GameObjects.Image[] = [];
  private corryStep = -1;
  private readonly corryHeading: number;
  private readonly durationS: number;
  private fireS = 0;
  private fireN = 0;
  private readonly fitchX: number;
  private readonly fitchY: number;

  constructor(
    scene: Phaser.Scene,
    s: WorldSetup,
    private readonly src: RescueViewSource,
    private readonly splashes: SplashPool | null = null,
  ) {
    const r = s.rescue!;
    const mf = s.minefield ?? null;
    this.durationS = s.durationS;
    // 水路の帯（任務の開始に 1 回だけ描く。毎フレームは触らない）。機雷原の区画は描かない（IP1）
    const g = scene.add.graphics().setDepth(DEPTH.returnRing);
    if (mf) {
      for (const l of mf.lanes) g.lineStyle(l.widthM, LANE_FILL_COLOR, LANE_FILL_ALPHA).lineBetween(l.x0, l.y0, l.x1, l.y1);
      this.placeBuoys(scene, mf.lanes, r.fitch.x, r.fitch.y, r.fitch.ringM + BUOY_INSET_M * 4, s.mission.returnPoint);
    }
    this.g = g;
    // フィッチ（渡す先の輪と艦）・沈んでいくコリー（油の輪の上に暗く）
    this.fitchX = r.fitch.x;
    this.fitchY = r.fitch.y;
    this.ring = scene.add.image(r.fitch.x, r.fitch.y, TEXTURE_KEYS.returnRing).setScale(r.fitch.ringM / RETURN_RING_TEX_RADIUS_UNITS / RENDER_SCALE).setTint(FITCH_RING_COLOR).setAlpha(FITCH_RING_ALPHA).setDepth(DEPTH.returnRing);
    const shipScale = artImageScale(RESCUE_TEX_ALLY_SHIP);
    this.fitch = scene.add.image(r.fitch.x, r.fitch.y, RESCUE_TEX_ALLY_SHIP).setScale(shipScale).setAngle(r.fitch.headingDeg).setDepth(DEPTH.destroyer);
    this.oil = scene.add.image(r.corry.x, r.corry.y, TEXTURE_KEYS.oilSlick).setScale(CORRY_OIL_RADIUS_M / EXPLOSION_RING_RADIUS_UNITS / RENDER_SCALE).setAlpha(CORRY_OIL_ALPHA).setDepth(DEPTH.wake);
    this.corryHeading = r.corry.headingDeg;
    this.corry = scene.add.image(r.corry.x, r.corry.y, RESCUE_TEX_ALLY_SHIP).setScale(shipScale * CORRY_LIST_SCALE_X, shipScale).setAngle(r.corry.headingDeg).setTint(CORRY_TINT).setAlpha(CORRY_ALPHA_FROM).setDepth(DEPTH.destroyer);
    const style = hudTextStyle(SHIP_LABEL_FONT_PX, SHIP_LABEL_COLOR);
    this.labels.push(scene.add.text(r.fitch.x, r.fitch.y + this.fitch.displayHeight / 2 + SHIP_LABEL_GAP, r.fitch.labelJa, style).setOrigin(0.5, 0).setDepth(DEPTH.destroyer));
    // コリーの名は今夜の群の札・絵と重ならない候補の所（v0.8.5 S4。ui/rescue-label-spot。S2 は艦の真下 80 m で南の群の札に重なった）
    const spot = corryLabelSpot(r.corry.x, r.corry.y, src.state, SURVIVOR_LABEL_DY, SURVIVOR_TEX_UNITS / 2, { x: 0, y: 0 });
    this.labels.push(scene.add.text(spot.x, spot.y, r.corry.labelJa, style).setOrigin(0.5, 0).setDepth(DEPTH.destroyer));
    // 生存者の群（今夜の位置）と人数の札
    const st = src.state;
    const sc = rescueArtScale();
    const cs = hudTextStyle(SURVIVOR_LABEL_FONT_PX, SURVIVOR_LABEL_COLOR);
    this.shownLeft = new Int16Array(st.n).fill(-1);
    for (let i = 0; i < st.n; i++) {
      this.groups.push(scene.add.image(st.gx[i]!, st.gy[i]!, RESCUE_TEX_SURVIVORS, 'p0').setScale(sc).setDepth(DEPTH.wake).setVisible(false));
      this.counts.push(scene.add.text(st.gx[i]!, st.gy[i]! + SURVIVOR_LABEL_DY, '', cs).setOrigin(0.5, 0).setDepth(DEPTH.wake).setVisible(false));
    }
    // 機雷（見えた物だけ出す。置かなかった枠も作る＝数は data の上限で固定）
    const m = src.mines;
    this.mineShown = new Uint8Array(m ? m.max : 0);
    if (m) for (let k = 0; k < m.max; k++) this.mines.push(scene.add.image(m.x[k]!, m.y[k]!, RESCUE_TEX_MINE).setScale(sc).setDepth(DEPTH.wake).setVisible(false));
    this.refresh();
  }

  /** 水路の両舷にブイ（左舷 赤・右舷 緑。帯の縁から少し内・BUOY_SPACING_M ごと・フィッチの輪と帰投の輪の内には置かない・合計 BUOY_MAX まで） */
  private placeBuoys(scene: Phaser.Scene, lanes: NonNullable<WorldSetup['minefield']>['lanes'], fx: number, fy: number, fitchClearM: number, rp: { x: number; y: number; radiusM: number }): void {
    const sc = rescueArtScale();
    for (const l of lanes) {
      const dx = l.x1 - l.x0;
      const dy = l.y1 - l.y0;
      const len = Math.hypot(dx, dy);
      const ux = dx / len;
      const uy = dy / len;
      const off = l.widthM / 2 - BUOY_INSET_M;
      for (let t = BUOY_SPACING_M / 2; t < len; t += BUOY_SPACING_M) {
        for (let side = 0; side < 2; side++) {
          const sgn = side === 0 ? 1 : -1; // 進む向きの左（左舷。画面の y は下向き＝左の法線は (uy, −ux)）が赤
          const x = l.x0 + ux * t + uy * off * sgn;
          const y = l.y0 + uy * t - ux * off * sgn;
          const dfx = x - fx;
          const dfy = y - fy;
          const drx = x - rp.x;
          const dry = y - rp.y;
          if (this.buoys.length >= BUOY_MAX || dfx * dfx + dfy * dfy <= fitchClearM * fitchClearM || drx * drx + dry * dry <= rp.radiusM * rp.radiusM) continue;
          this.buoys.push(scene.add.image(x, y, RESCUE_TEX_BUOY, side === 0 ? 'p0' : 'p1').setScale(sc).setDepth(DEPTH.wake));
        }
      }
    }
  }

  /** 群と機雷の表示を状態に合わせる（変わった時だけ触る） */
  private refresh(): void {
    const st = this.src.state;
    for (let i = 0; i < st.n; i++) {
      const left = st.left[i]!;
      if (left === this.shownLeft[i]) continue;
      this.shownLeft[i] = left;
      const img = this.groups[i]!;
      const txt = this.counts[i]!;
      if (left <= 0) {
        img.setVisible(false);
        txt.setVisible(false);
        continue;
      }
      img.setFrame(`p${Math.min(left, SURVIVOR_HEADS_MAX) - 1}`).setVisible(true);
      txt.setText(`${left} 名`).setVisible(true);
    }
    const m = this.src.mines;
    if (!m) return;
    for (let k = 0; k < m.max; k++) {
      const show = m.state[k] === MINE_SEEN ? 1 : 0;
      if (show === this.mineShown[k]) continue;
      this.mineShown[k] = show;
      this.mines[k]!.setVisible(show === 1);
    }
  }

  /** 毎フレーム: 群・機雷・コリーの沈み（救助の時間につれて薄れる。段が変わった時だけ）・フィッチの砲火（S ボートが砲火の距離の内に居る間） */
  update(realDt: number, w: RescueViewWorld): void {
    this.refresh();
    const p = Math.min(1, Math.max(0, w.stepTimeS / this.durationS));
    const k = Math.round(p * CORRY_ALPHA_STEPS);
    if (k !== this.corryStep) {
      this.corryStep = k;
      const q = k / CORRY_ALPHA_STEPS;
      this.corry.setAlpha(CORRY_ALPHA_FROM + (CORRY_ALPHA_TO - CORRY_ALPHA_FROM) * q).setAngle(this.corryHeading + CORRY_SETTLE_DEG * q);
    }
    const c = this.src.cover;
    const q = w.pts ? w.pts.section : null;
    if (!c || !q || !this.splashes) return;
    let target = -1;
    for (let i = 0; i < c.inS.length; i++) if (c.inS[i]! > 0) { target = i; break; }
    if (target < 0) {
      this.fireS = 0;
      return;
    }
    this.fireS += realDt;
    if (this.fireS < FITCH_FIRE_INTERVAL_S) return;
    this.fireS -= FITCH_FIRE_INTERVAL_S;
    const b = q.boats[target]!;
    const o = FITCH_SPLASH_OFFSETS[this.fireN % FITCH_SPLASH_OFFSETS.length]!;
    this.fireN++;
    this.splashes.muzzle(this.fitchX, this.fitchY, true);
    this.splashes.splash(b.x + o[0], b.y + o[1], false);
  }

  destroy(): void {
    this.g.destroy();
    this.fitch.destroy();
    this.ring.destroy();
    this.corry.destroy();
    this.oil.destroy();
    for (const o of this.labels) o.destroy();
    for (const o of this.groups) o.destroy();
    for (const o of this.counts) o.destroy();
    for (const o of this.mines) o.destroy();
    for (const o of this.buoys) o.destroy();
  }
}
