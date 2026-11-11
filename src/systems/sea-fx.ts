// v0.7.0 S3a（アートと音①：コードで描く絵。spec-v0700 §5.1・§5.6・R3・R4・R5・R9）: 海の面の演出＝海の面の TileSprite 1 枚・夜明けの光の Image 1 枚・月のきらめき（昼は白波）の Image の輪。
// - 海の面（IP1a。ユーザーの U2「波の模様が波に見えずにゴミのように見えます」で S3a の波頭の群れ（patches）をやめ、第 1 案の全面の層に。U3「FPS は問題なく動く」で全面の層 1 枚の塗りを許す）:
//   世界の座標の TileSprite 1 枚（R5。画面に貼るとカメラの追従の 1 フレーム遅れで陸・航跡に対して泳ぐ）: 位置は周期（1,024 m）の倍数、camera.worldView ＋ 余白を覆う大きさ。
//   動かすのは揃えた升が変わった時だけ（setPosition・setScale・setTileScale。WebGL の TileSprite はこれらで canvas を描き直さない）。局所 128 × 64 px のまま setScale で広げる（R21）。
//   波はゆっくり流れる（tilePosition を毎フレーム。WebGL では uv のずれだけ＝描き直さない）。深さは格子の線（DEPTH.sea）の下＝格子は波の上に見える（ユーザーの決め「格子の線はあった方がいい」）。
//   Canvas レンダラーでは出さない（毎フレーム描き直すため。spec §5.1）。
// - 光（dark・half・full・day）の tint と α、夜明けの段（WorldDawn.lightStep。0〜16）で昼の値へ。段が変わった時だけ書く。
// - 夜明けの光: setScrollFactor(0) の Image を画面より各辺 3% 大きく（揺れの縁）、深さは海の模様の直上＝陸・艇・艦・字の下（R3）。α ＝ 0.22 × sin(π × 段/16)（R4）。ズームが変わった時だけ大きさを書く。
// - きらめき: 世界の座標に N 個。置く時は升の内の候補 GLINT_TRIES か所から波頭の高い所（assets/sea-shape の seaCrestScore）を選び、波の筋の向きに傾け、波と一緒に流す。
//   画面＋余白の外へ出たら反対側へ（横ずれは絵だけの乱数 ART_SEED_GLINT＝世界の絵を作る時に new。R30）。ゆっくり明滅（R9）。昼（whitecaps）は白い泡の色。世界の内に収まる所だけ出す（S4）。
// §7: 確保は constructor だけ。update は読んで書くだけ（配列・オブジェクトを作らない）。論理の状態には書かない（art-rules）。
import type Phaser from 'phaser';
import { dawnGlowAlpha, glintBlink, mixRgb, SEA_TILE_TEX_PX, seaCellInto, seaCrestScore, seaDriftInto, seaField, wrapInto, type SeaField } from '../assets/sea-shape';
import { SEA_LIGHT_STEPS } from '../config/dawn-config';
import { TEXTURE_KEYS } from '../config/game-config';
import {
  ART_SEED_GLINT, ART_SEED_SEA, DAWN_GLOW_DEPTH, DAWN_GLOW_OVERSCAN, DAWN_GLOW_SCREEN_SHARE, DAWN_GLOW_TEX_H, DAWN_GLOW_TEX_W, GLINT_ALPHA_MAX, GLINT_ANGLE_JITTER_DEG, GLINT_COLOR, GLINT_COLS,
  GLINT_DEPTH, GLINT_H_M, GLINT_PERIOD_MIN_S, GLINT_SIZE_RANGE, GLINT_TEX_H, GLINT_TEX_W, GLINT_TRIES, GLINT_W_M, RENDERER_WEBGL, SEA_ART_DEPTH, SEA_ART_PX_PER_M, SEA_DRIFT_MPS, SEA_LIGHT_ART, SEA_TEX,
  SEA_TILE_LOCAL_H, SEA_TILE_LOCAL_W, SEA_TILE_PERIOD_M, SEA_VIEW_MARGIN_M, WHITECAP_ALPHA_MAX, WHITECAP_COLOR, WHITECAP_H_M, WHITECAP_W_M, type SeaLightArt,
} from '../config/sea-art-config';
import { SeededRng } from '../core/rng';
import type { MoonPhase } from '../core/visibility';

type View = { readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly right: number; readonly bottom: number };

/** 世界の大きさ m と、絵 1 つの半分の幅・高さ m（世界の内に収まる所だけ出す） */
interface DriftBox {
  readonly bw: number;
  readonly bh: number;
  readonly hw: number;
  readonly hh: number;
}

/** 置く所の点（大きいほど良い。候補から選ぶ） */
type Score = (x: number, y: number) => number;

/**
 * 世界の座標に置いた Image の輪（きらめき）: 画面を cols × rows の升に分け、i 番は升 (i % cols, floor(i / cols)) の中の点に置く（偏らない）。
 * 置く点は升の内の候補 tries か所から score の高い所。画面＋余白の外へ出たら反対側へ（横切った軸と直交する向きは自分の行（列）の帯の内で引き直す）。
 * 置いた所が世界の内に収まらなければ隠す（S4。見え方が変わった時だけ setVisible）。shift で全部を流す（波と一緒に）
 */
class DriftPool {
  readonly imgs: Phaser.GameObjects.Image[] = [];
  private readonly xs: Float32Array;
  private readonly ys: Float32Array;
  private readonly rows: number;
  private on = false;
  placed = false;

  constructor(n: number, private readonly cols: number, private readonly marginM: number, private readonly box: DriftBox, private readonly tries: number, private readonly score: Score, make: (i: number) => Phaser.GameObjects.Image) {
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

  /** i 番を升の内（keepX・keepY なら その軸は今の値のまま）の候補から波頭の高い所へ */
  private pick(i: number, v: View, rng: SeededRng, keepX: boolean, keepY: boolean): void {
    let bx = keepX ? this.xs[i]! : this.stratX(i, v, rng);
    let by = keepY ? this.ys[i]! : this.stratY(i, v, rng);
    let best = this.score(bx, by);
    for (let k = 1; k < this.tries; k++) {
      const x = keepX ? bx : this.stratX(i, v, rng);
      const y = keepY ? by : this.stratY(i, v, rng);
      const s = this.score(x, y);
      if (s > best) {
        best = s;
        bx = x;
        by = y;
      }
    }
    this.xs[i] = bx;
    this.ys[i] = by;
  }

  update(v: View, rng: SeededRng, dx: number, dy: number): void {
    const n = this.imgs.length;
    if (!this.placed) {
      this.placed = true;
      for (let i = 0; i < n; i++) {
        this.pick(i, v, rng, false, false);
        this.imgs[i]!.setPosition(this.xs[i]!, this.ys[i]!);
        this.apply(i);
      }
      return;
    }
    const m = this.marginM;
    for (let i = 0; i < n; i++) {
      const x0 = this.xs[i]! + dx;
      const y0 = this.ys[i]! + dy;
      const x1 = wrapInto(x0, v.x, v.right, m);
      const y1 = wrapInto(y0, v.y, v.bottom, m);
      this.xs[i] = x1;
      this.ys[i] = y1;
      if (x1 !== x0 || y1 !== y0) {
        this.pick(i, v, rng, x1 !== x0, y1 !== y0); // 横切った軸は反対側の点のまま、直交の軸を自分の帯の内で引き直す
        this.apply(i);
      }
      this.imgs[i]!.setPosition(this.xs[i]!, this.ys[i]!);
    }
  }

  /** i 番の見え方: 出す時（on）で、置いた所が世界の内に収まる時だけ */
  private apply(i: number): void {
    const b = this.box;
    const x = this.xs[i]!;
    const y = this.ys[i]!;
    const v = this.on && x - b.hw >= 0 && x + b.hw <= b.bw && y - b.hh >= 0 && y + b.hh <= b.bh;
    const img = this.imgs[i]!;
    if (img.visible !== v) img.setVisible(v);
  }

  setVisibleAll(on: boolean): void {
    this.on = on;
    for (let i = 0; i < this.imgs.length; i++) this.apply(i);
  }

  destroy(): void {
    for (const g of this.imgs) g.destroy();
    this.imgs.length = 0;
  }
}

export class SeaFx {
  private readonly cam: Phaser.Cameras.Scene2D.Camera;
  private readonly tile: Phaser.GameObjects.TileSprite | null;
  private readonly glow: Phaser.GameObjects.Image;
  private readonly glints: DriftPool;
  private readonly gPeriod: Float32Array;
  private readonly gPhase: Float32Array;
  /** 升の [左, 上, 横の数, 縦の数]（周期の単位）。前の値と比べて変わった時だけ TileSprite を動かす */
  private readonly cell = new Int32Array(4);
  /** 波の流れ（tilePosition の px。[x, y]）と、波頭の点を読む式・その出力 */
  private readonly drift = new Float32Array(2);
  private readonly field: SeaField;
  private readonly shade = new Float32Array(3);
  private readonly rng = new SeededRng(ART_SEED_GLINT);
  private readonly light: SeaLightArt;
  private readonly dayStart: boolean;
  /** 模様の流れ m/秒（x, y） */
  private readonly vx: number;
  private readonly vy: number;
  private step = -1;
  private zoom = NaN;
  private cx = NaN;
  private cy = NaN;
  private nx = 0;
  private ny = 0;
  private t = 0;
  private glintBase = 0;
  /** 世界の幅・高さ m（海の面を世界の内に切る） */
  private readonly bw: number;
  private readonly bh: number;

  constructor(scene: Phaser.Scene, moon: MoonPhase, dayStart: boolean, bounds: { readonly width: number; readonly height: number }) {
    this.cam = scene.cameras.main;
    this.light = SEA_LIGHT_ART[moon];
    this.dayStart = dayStart;
    this.bw = bounds.width;
    this.bh = bounds.height;
    const r = (SEA_TEX.dirDeg * Math.PI) / 180;
    this.vx = Math.cos(r) * SEA_DRIFT_MPS;
    this.vy = Math.sin(r) * SEA_DRIFT_MPS;
    this.field = seaField(ART_SEED_SEA);
    const webgl = scene.sys.game.renderer.type === RENDERER_WEBGL;
    this.tile = webgl ? scene.add.tileSprite(0, 0, SEA_TILE_LOCAL_W, SEA_TILE_LOCAL_H, TEXTURE_KEYS.seaTile).setOrigin(0, 0).setDepth(SEA_ART_DEPTH).setVisible(false) : null;
    this.glow = scene.add.image(0, 0, TEXTURE_KEYS.dawnGlow).setScrollFactor(0).setOrigin(1, 0.5).setDepth(DAWN_GLOW_DEPTH).setVisible(false);
    const n = this.light.glints;
    const color = this.light.whitecaps ? WHITECAP_COLOR : GLINT_COLOR;
    const crestDeg = SEA_TEX.dirDeg - 90; // 波の筋の向き（波の進む向きに直交）
    const score: Score = (x, y) => this.crestAt(x, y);
    const gw = this.light.whitecaps ? WHITECAP_W_M : GLINT_W_M;
    const gh = this.light.whitecaps ? WHITECAP_H_M : GLINT_H_M;
    const box = { bw: bounds.width, bh: bounds.height, hw: gw / 2, hh: gw / 2 };
    this.glints = new DriftPool(n, GLINT_COLS, gw, box, GLINT_TRIES, score, () => {
      const sz = this.rng.nextRange(GLINT_SIZE_RANGE[0], GLINT_SIZE_RANGE[1]);
      const ang = crestDeg + this.rng.nextRange(-GLINT_ANGLE_JITTER_DEG, GLINT_ANGLE_JITTER_DEG);
      return scene.add.image(0, 0, TEXTURE_KEYS.glint).setDepth(GLINT_DEPTH).setScale((gw * sz) / GLINT_TEX_W, (gh * sz) / GLINT_TEX_H).setAngle(ang).setTint(color).setVisible(false);
    });
    this.gPeriod = new Float32Array(n);
    this.gPhase = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.gPeriod[i] = this.rng.nextRange(GLINT_PERIOD_MIN_S, GLINT_PERIOD_MIN_S * 2);
      this.gPhase[i] = this.rng.next() * Math.PI * 2;
    }
  }

  /** 世界の (x, y) m の波頭の点（今の流れの分だけずらしてタイルの式を読む。確保しない） */
  private crestAt(x: number, y: number): number {
    return seaCrestScore(this.shade, this.field, x + this.drift[0]! / SEA_ART_PX_PER_M, y + this.drift[1]! / SEA_ART_PX_PER_M);
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
    seaDriftInto(this.drift, realDt, SEA_TEX.dirDeg, SEA_DRIFT_MPS, SEA_ART_PX_PER_M, SEA_TILE_TEX_PX);
    if (this.tile) {
      const c = this.cell;
      seaCellInto(c, v.x, v.y, v.width, v.height, SEA_TILE_PERIOD_M, SEA_VIEW_MARGIN_M);
      if (c[0] !== this.cx || c[1] !== this.cy || c[2] !== this.nx || c[3] !== this.ny) this.moveTile(c[0]!, c[1]!, c[2]!, c[3]!);
      this.tile.setTilePosition(this.drift[0]!, this.drift[1]!);
    }
    this.glints.update(v, this.rng, this.vx * realDt, this.vy * realDt);
    if (first) this.glints.setVisibleAll(this.glintBase > 0);
    const imgs = this.glints.imgs;
    for (let i = 0; i < imgs.length; i++) imgs[i]!.setAlpha(this.glintBase * glintBlink(this.t, this.gPeriod[i]!, this.gPhase[i]!));
  }

  /**
   * 升が変わった時だけ: 升（周期の倍数）を世界の内（0〜幅 × 0〜高さ。S4 のきらめきと同じ＝世界の縁の外の格子の無い海は無地のまま）に切った矩形に置き、模様の周期は世界で 1,024 m のまま。
   * 左上は 0 か周期の倍数なので模様の位置は升が変わってもずれない
   */
  private moveTile(cx: number, cy: number, nx: number, ny: number): void {
    this.cx = cx;
    this.cy = cy;
    this.nx = nx;
    this.ny = ny;
    const P = SEA_TILE_PERIOD_M;
    const x0 = Math.max(0, cx * P);
    const y0 = Math.max(0, cy * P);
    const w = Math.min(this.bw, (cx + nx) * P) - x0;
    const h = Math.min(this.bh, (cy + ny) * P) - y0;
    if (!(w > 0 && h > 0)) {
      this.tile!.setVisible(false);
      return;
    }
    this.tile!.setPosition(x0, y0).setScale(w / SEA_TILE_LOCAL_W, h / SEA_TILE_LOCAL_H).setTileScale((SEA_TILE_LOCAL_W * P) / (SEA_TILE_TEX_PX * w), (SEA_TILE_LOCAL_H * P) / (SEA_TILE_TEX_PX * h)).setVisible(true);
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
    this.glow.destroy();
    this.glints.destroy();
  }
}
