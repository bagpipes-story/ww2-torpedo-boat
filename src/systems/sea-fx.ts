// v0.7.0 S3a（アートと音①：コードで描く絵。spec-v0700 §5.1・§5.6・R3・R4・R5・R9）: 海の面の演出＝海の模様・夜明けの光の Image 1 枚・月のきらめき（昼は白波）の Image の輪。
// - 海の模様は 2 つの出し方（config の SEA_LAYER_MODE。S3a の計測で 'patches' を既定にした）:
//   'patches'（第 2 案）: 波頭の群れの小さな Image（tex-sea-tile の frame p0〜）を SEA_PATCH_COUNT 個、世界の座標に置き、画面＋余白の外へ出たら反対側へ置き直す（きらめきと同じ輪）。
//     全面の層を塗らない（ヘッドレスの SwiftShader で全面の層 1 枚は jp_03 ハードの p95 ×1.27 だった）。
//   'tile'（第 1 案）: 世界の座標の TileSprite 1 枚（R5。画面に貼るとカメラの追従の 1 フレーム遅れで陸・航跡に対して泳ぐ）: 位置は周期（1,024 m）の倍数、camera.worldView ＋ 余白を覆う大きさ。
//     動かすのは揃えた升が変わった時だけ（setPosition・setScale・setTileScale。WebGL の TileSprite はこれらで canvas を描き直さない）。局所 128 × 64 px のまま setScale で広げる（R21）。
//     Canvas レンダラーでは出さない（毎フレーム描き直すため。spec §5.1）。
// - 光（dark・half・full・day）の tint と α、夜明けの段（WorldDawn.lightStep。0〜16）で昼の値へ。段が変わった時だけ書く。
// - 夜明けの光: setScrollFactor(0) の Image を画面より各辺 3% 大きく（揺れの縁）、深さは海の模様の直上＝陸・艇・艦・字の下（R3）。α ＝ 0.22 × sin(π × 段/16)（R4）。ズームが変わった時だけ大きさを書く。
// - きらめき: 世界の座標に N 個。画面＋余白の外へ出たら反対側へ（横ずれは絵だけの乱数 ART_SEED_GLINT＝世界の絵を作る時に new。R30）。ゆっくり明滅（R9）。昼（whitecaps）は白い泡の色。
// §7: 確保は constructor だけ。update は読んで書くだけ（配列・オブジェクトを作らない）。論理の状態には書かない（art-rules）。
import type Phaser from 'phaser';
import { dawnGlowAlpha, glintBlink, mixRgb, SEA_TILE_TEX_PX, seaCellInto, wrapInto } from '../assets/sea-shape';
import { SEA_LIGHT_STEPS } from '../config/dawn-config';
import { TEXTURE_KEYS } from '../config/game-config';
import {
  ART_SEED_GLINT, DAWN_GLOW_DEPTH, DAWN_GLOW_OVERSCAN, DAWN_GLOW_SCREEN_SHARE, DAWN_GLOW_TEX_H, DAWN_GLOW_TEX_W, GLINT_ALPHA_MAX, GLINT_COLOR, GLINT_DEPTH, GLINT_H_M, GLINT_PERIOD_MIN_S, GLINT_TEX_H, GLINT_TEX_W,
  GLINT_COLS, GLINT_W_M, RENDERER_WEBGL, SEA_ART_DEPTH, SEA_ART_PX_PER_M, SEA_LAYER_MODE, SEA_LIGHT_ART, SEA_PATCH_COLS, SEA_PATCH_COUNT, SEA_PATCH_FRAMES, SEA_PATCH_H_PX, SEA_PATCH_W_PX,
  SEA_TILE_LOCAL_H, SEA_TILE_LOCAL_W,
  SEA_TILE_PERIOD_M, SEA_VIEW_MARGIN_M, WHITECAP_ALPHA_MAX, WHITECAP_COLOR, type SeaLightArt,
} from '../config/sea-art-config';
import { SeededRng } from '../core/rng';
import type { MoonPhase } from '../core/visibility';

type View = { readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly right: number; readonly bottom: number };

/**
 * 世界の座標に置いた Image の輪（きらめき・波頭の群れ）: 画面を cols × rows の升に分け、i 番は升 (i % cols, floor(i / cols)) の中の乱数の位置に置く（偏らない）。
 * 画面＋余白の外へ出たら反対側へ。横切った軸と直交する向きは自分の行（列）の帯の内で引き直す＝動き回ってもおおむね升に 1 つ
 */
class DriftPool {
  readonly imgs: Phaser.GameObjects.Image[] = [];
  private readonly xs: Float32Array;
  private readonly ys: Float32Array;
  private readonly rows: number;
  placed = false;

  constructor(n: number, private readonly cols: number, private readonly marginM: number, make: (i: number) => Phaser.GameObjects.Image) {
    this.xs = new Float32Array(n);
    this.ys = new Float32Array(n);
    this.rows = Math.max(1, Math.ceil(n / cols));
    for (let i = 0; i < n; i++) this.imgs.push(make(i));
  }

  private stratX(i: number, v: View, rng: SeededRng): number {
    return v.x + (((i % this.cols) + rng.next()) / this.cols) * v.width;
  }
  private stratY(i: number, v: View, rng: SeededRng): number {
    return v.y + ((Math.floor(i / this.cols) + rng.next()) / this.rows) * v.height;
  }

  update(v: View, rng: SeededRng): void {
    const n = this.imgs.length;
    if (!this.placed) {
      this.placed = true;
      for (let i = 0; i < n; i++) {
        this.xs[i] = this.stratX(i, v, rng);
        this.ys[i] = this.stratY(i, v, rng);
        this.imgs[i]!.setPosition(this.xs[i]!, this.ys[i]!);
      }
      return;
    }
    const m = this.marginM;
    for (let i = 0; i < n; i++) {
      const x0 = this.xs[i]!;
      const y0 = this.ys[i]!;
      const x1 = wrapInto(x0, v.x, v.right, m);
      const y1 = wrapInto(y0, v.y, v.bottom, m);
      if (x1 === x0 && y1 === y0) continue;
      this.xs[i] = x1 !== x0 ? x1 : this.stratX(i, v, rng);
      this.ys[i] = y1 !== y0 ? y1 : this.stratY(i, v, rng);
      this.imgs[i]!.setPosition(this.xs[i]!, this.ys[i]!);
    }
  }

  setVisibleAll(on: boolean): void {
    for (const g of this.imgs) g.setVisible(on);
  }

  destroy(): void {
    for (const g of this.imgs) g.destroy();
    this.imgs.length = 0;
  }
}

export class SeaFx {
  private readonly cam: Phaser.Cameras.Scene2D.Camera;
  private readonly tile: Phaser.GameObjects.TileSprite | null;
  private readonly patches: DriftPool | null;
  private readonly glow: Phaser.GameObjects.Image;
  private readonly glints: DriftPool;
  private readonly gPeriod: Float32Array;
  private readonly gPhase: Float32Array;
  /** 升の [左, 上, 横の数, 縦の数]（周期の単位）。前の値と比べて変わった時だけ TileSprite を動かす */
  private readonly cell = new Int32Array(4);
  private readonly rng = new SeededRng(ART_SEED_GLINT);
  private readonly light: SeaLightArt;
  private readonly dayStart: boolean;
  private step = -1;
  private zoom = NaN;
  private cx = NaN;
  private cy = NaN;
  private nx = 0;
  private ny = 0;
  private t = 0;
  private glintBase = 0;

  constructor(scene: Phaser.Scene, moon: MoonPhase, dayStart: boolean) {
    this.cam = scene.cameras.main;
    this.light = SEA_LIGHT_ART[moon];
    this.dayStart = dayStart;
    const webgl = scene.sys.game.renderer.type === RENDERER_WEBGL;
    const tileMode = SEA_LAYER_MODE === 'tile';
    this.tile = tileMode && webgl ? scene.add.tileSprite(0, 0, SEA_TILE_LOCAL_W, SEA_TILE_LOCAL_H, TEXTURE_KEYS.seaTile).setOrigin(0, 0).setDepth(SEA_ART_DEPTH).setVisible(false) : null;
    const k = 1 / SEA_ART_PX_PER_M;
    this.patches = tileMode
      ? null
      : new DriftPool(SEA_PATCH_COUNT, SEA_PATCH_COLS, (SEA_PATCH_W_PX * k) / 2, (i) =>
          scene.add.image(0, 0, TEXTURE_KEYS.seaTile, `p${i % SEA_PATCH_FRAMES}`).setDepth(SEA_ART_DEPTH).setScale(k).setFlipX(i % 2 === 1).setVisible(false),
        );
    this.glow = scene.add.image(0, 0, TEXTURE_KEYS.dawnGlow).setScrollFactor(0).setOrigin(1, 0.5).setDepth(DAWN_GLOW_DEPTH).setVisible(false);
    const n = this.light.glints;
    const color = this.light.whitecaps ? WHITECAP_COLOR : GLINT_COLOR;
    this.glints = new DriftPool(n, GLINT_COLS, GLINT_W_M, () => scene.add.image(0, 0, TEXTURE_KEYS.glint).setDepth(GLINT_DEPTH).setScale(GLINT_W_M / GLINT_TEX_W, GLINT_H_M / GLINT_TEX_H).setTint(color).setVisible(false));
    this.gPeriod = new Float32Array(n);
    this.gPhase = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.gPeriod[i] = this.rng.nextRange(GLINT_PERIOD_MIN_S, GLINT_PERIOD_MIN_S * 2);
      this.gPhase[i] = this.rng.next() * Math.PI * 2;
    }
  }

  /** 毎フレーム（world-art から。realDt は見た目の時計、step は WorldDawn.lightStep） */
  update(realDt: number, step: number): void {
    const cam = this.cam;
    const v = cam.worldView;
    if (!(v.width > 0)) return;
    this.t += realDt;
    const first = !this.glints.placed;
    if (step !== this.step) this.applyStep(step);
    if (cam.zoom !== this.zoom) this.applyZoom(cam.zoom);
    if (this.tile) {
      const c = this.cell;
      seaCellInto(c, v.x, v.y, v.width, v.height, SEA_TILE_PERIOD_M, SEA_VIEW_MARGIN_M);
      if (c[0] !== this.cx || c[1] !== this.cy || c[2] !== this.nx || c[3] !== this.ny) this.moveTile(c[0]!, c[1]!, c[2]!, c[3]!);
    }
    if (this.patches) this.patches.update(v, this.rng);
    this.glints.update(v, this.rng);
    if (first) {
      this.patches?.setVisibleAll(true);
      this.glints.setVisibleAll(this.glintBase > 0);
    }
    const imgs = this.glints.imgs;
    for (let i = 0; i < imgs.length; i++) imgs[i]!.setAlpha(this.glintBase * glintBlink(this.t, this.gPeriod[i]!, this.gPhase[i]!));
  }

  /** 升が変わった時だけ: 位置は周期の倍数、大きさは升の数 × 周期、模様の周期は世界で 1,024 m のまま */
  private moveTile(cx: number, cy: number, nx: number, ny: number): void {
    this.cx = cx;
    this.cy = cy;
    this.nx = nx;
    this.ny = ny;
    const P = SEA_TILE_PERIOD_M;
    this.tile!.setPosition(cx * P, cy * P).setScale((nx * P) / SEA_TILE_LOCAL_W, (ny * P) / SEA_TILE_LOCAL_H).setTileScale(SEA_TILE_LOCAL_W / (SEA_TILE_TEX_PX * nx), SEA_TILE_LOCAL_H / (SEA_TILE_TEX_PX * ny)).setVisible(true);
  }

  /** 段が変わった時だけ: 模様の tint と α（光 → 昼）、夜明けの光の α、きらめきの α の上限（月のきらめきは昼へ向けて薄く。白波はそのまま） */
  private applyStep(step: number): void {
    this.step = step;
    const f = step <= 0 ? 0 : step >= SEA_LIGHT_STEPS ? 1 : step / SEA_LIGHT_STEPS;
    const day = SEA_LIGHT_ART.day;
    const L = this.light;
    const tint = mixRgb(L.crest, day.crest, f);
    const alpha = L.crestAlpha + (day.crestAlpha - L.crestAlpha) * f;
    this.tile?.setTint(tint).setAlpha(alpha);
    if (this.patches) for (const g of this.patches.imgs) g.setTint(tint).setAlpha(alpha);
    const a = dawnGlowAlpha(step, SEA_LIGHT_STEPS, this.dayStart);
    this.glow.setAlpha(a).setVisible(a > 0);
    this.glintBase = L.whitecaps ? WHITECAP_ALPHA_MAX : GLINT_ALPHA_MAX * (1 - f);
    if (this.glints.placed) this.glints.setVisibleAll(this.glintBase > 0);
  }

  /**
   * ズームが変わった時だけ: 夜明けの光を画面の右端の帯（幅の DAWN_GLOW_SCREEN_SHARE ＋ はみ出し 3%・高さは画面＋各辺 3%）に。
   * scrollFactor 0 の物は (x − 幅/2) × zoom ＋ 幅/2 に出るので、右端（原点 (1, 0.5)）を 幅/2 ＋ 幅 × (0.5 ＋ 3%) / zoom に置いて 1/zoom 倍
   */
  private applyZoom(zoom: number): void {
    this.zoom = zoom;
    const cam = this.cam;
    const W = cam.width;
    const H = cam.height;
    this.glow
      .setPosition(W / 2 + (W * (0.5 + DAWN_GLOW_OVERSCAN)) / zoom, H / 2)
      .setScale((W * (DAWN_GLOW_SCREEN_SHARE + DAWN_GLOW_OVERSCAN)) / zoom / DAWN_GLOW_TEX_W, (H * (1 + 2 * DAWN_GLOW_OVERSCAN)) / zoom / DAWN_GLOW_TEX_H);
  }

  destroy(): void {
    this.tile?.destroy();
    this.patches?.destroy();
    this.glow.destroy();
    this.glints.destroy();
  }
}
