// 岸の陰の絵（v0.8.1 IP1。us_06。実機 1 回目のユーザー「暗い岸という視覚的表現がマップになく、いつもの普通の岸なのに見つかる距離だけ謎に短くなってる」）の持ち主。
// systems/world-art が背に岸のある任務（setup.backdrop と隊の backdrop）だけ 1 つ作る（ほかの任務は物も絵の鍵も増えない）:
// - 暗い陸: 南の岸の線に沿って tex-backdrop-hills を Blitter で並べる（1 枚おきに左右を返す）。動かない。
// - 岸の陰の海: 隊の艦のうち作った時に止まっている艦ごとに、背に岸が効く自艇の位置の集合（core/backdrop-zone。判定は shore-backdrop と同じ線と X²）を 1 枚の Image に。
//   見せるのは最寄りの浮いている艦（HUD の 3 行目・2 行目と同じ nearestAfloatIndex）の 1 枚だけで、その艦が止まっていて、自艇が照らされていない（ビットが立ちうる）間。
//   動き出した艦の陰（陰が動く）・照らされている間は見せない。まだ知らない艦（一度も目の視程に入らず、レーダーの輝点も出ていない＝陸のそばで映らない空知丸）の陰も見せない
//   （陰の頂点が艦の位置なので、見えない艦の場所を絵が明かさない。卯月と駆潜艇はレーダーの最初の掃引で知る）。替わる時は BACKDROP_ZONE_FADE_MS で α を替える（替わっている間だけ α を書く＝毎フレーム描き直さない）。
// 論理の状態は読むだけ（世界はこの絵を読まない）。§7: 確保は constructor だけ。乱数なし。
import type Phaser from 'phaser';
import { ensureBackdropHillsTexture, paintBackdropZoneTexture, removeBackdropZoneTexture } from '../assets/backdrop-art';
import {
  BACKDROP_HILLS_DEPTH, BACKDROP_HILLS_LEN_M, BACKDROP_HILLS_PX_PER_M, BACKDROP_HILLS_TEX_KEY, BACKDROP_ZONE_DEPTH, BACKDROP_ZONE_FADE_MS, BACKDROP_ZONE_GRID_M,
  BACKDROP_ZONE_RADAR_NEAR_M, BACKDROP_ZONE_TEX_PREFIX,
} from '../config/backdrop-art-config';
import { backdropZone, type BackdropZone } from '../core/backdrop-zone';
import { landBehind, type LandLine } from '../core/strait-geometry';

type Pt = { readonly x: number; readonly y: number };
/** 世界から読む物（MissionWorld がそのまま満たす） */
export interface BackdropFxWorldView {
  readonly setup: { readonly mission: { readonly coast: { readonly landM: number } | null; readonly bounds: { readonly width: number; readonly height: number } } };
  readonly destroyers: {
    readonly backdrop: { readonly lines: readonly LandLine[]; readonly p: { readonly behindM2: number } } | null;
    readonly ships: readonly { readonly anchored: boolean; readonly state: Pt }[];
    nearestAfloatIndex(x: number, y: number): number;
  } | null;
  readonly enemy: { readonly illuminated: boolean };
  readonly boat: { readonly state: Pt };
  /** 目の視程の 2 乗（mission-telemetry の目で見えている艦と同じ比べ） */
  readonly visRange2: number;
  /** レーダーの輝点（無い任務・?debug&noradar は null） */
  readonly radar: { readonly state: { readonly n: number; readonly blips: readonly Pt[] } } | null;
}

export class BackdropFx {
  /** 艦ごとの岸の陰（作った時に止まっていなかった艦・升の無い艦は null）と、その Image・今の α */
  readonly zones: (BackdropZone | null)[] = [];
  private readonly images: (Phaser.GameObjects.Image | null)[] = [];
  private readonly alpha: Float64Array;
  private readonly hills: Phaser.GameObjects.Blitter | null = null;
  /** 見せている艦の添字（-1 はなし）と、α を替えている途中か */
  shown = -1;
  private fading = false;
  /** 知った艦のビット（目の視程に入ったか、近くにレーダーの輝点が出た。止まった艦は動かないので一度知れば知ったまま） */
  private known = 0;

  constructor(private readonly scene: Phaser.Scene, w: BackdropFxWorldView) {
    const g = w.destroyers;
    const bd = g ? g.backdrop : null;
    const { width, height } = w.setup.mission.bounds;
    const coast = w.setup.mission.coast;
    this.alpha = new Float64Array(g ? g.ships.length : 0);
    if (coast) {
      ensureBackdropHillsTexture(scene);
      const bl = scene.add.blitter(0, height, BACKDROP_HILLS_TEX_KEY).setDepth(BACKDROP_HILLS_DEPTH).setScale(1 / BACKDROP_HILLS_PX_PER_M);
      const tex = scene.textures.get(BACKDROP_HILLS_TEX_KEY);
      const P = BACKDROP_HILLS_LEN_M;
      for (let x = -coast.landM, k = 0; x < width + coast.landM; x += P, k++) {
        const w1 = Math.min(P, width + coast.landM - x);
        const name = w1 === P ? '__BASE' : `c${Math.round(w1)}`;
        if (w1 !== P && !tex.has(name)) tex.add(name, 0, 0, 0, w1 * BACKDROP_HILLS_PX_PER_M, tex.source[0]!.height);
        bl.create(x * BACKDROP_HILLS_PX_PER_M, 0, name).setFlip(k % 2 === 1 && w1 === P, false);
      }
      this.hills = bl;
    }
    for (let i = 0; g && bd && i < g.ships.length; i++) {
      const s = g.ships[i]!;
      const z = s.anchored ? backdropZone(bd.lines, s.state.x, s.state.y, bd.p.behindM2, width, height, BACKDROP_ZONE_GRID_M) : null;
      const key = BACKDROP_ZONE_TEX_PREFIX + i;
      removeBackdropZoneTexture(scene, key);
      const sx = s.state.x, sy = s.state.y;
      const ok = z !== null && paintBackdropZoneTexture(scene, key, z, (x, y) => landBehind(bd.lines, sx, sy, x, y, bd.p.behindM2));
      this.zones.push(ok ? z : null);
      this.images.push(ok ? scene.add.image(z.x0, z.y0, key).setOrigin(0, 0).setScale(z.stepM).setDepth(BACKDROP_ZONE_DEPTH).setAlpha(0).setVisible(false) : null);
    }
  }

  /** 知った艦のビットを足す（陰のある艦のうち、まだ知らない艦だけを見る。確保しない） */
  private noteKnown(w: BackdropFxWorldView): void {
    const g = w.destroyers!;
    const b = w.boat.state;
    const r = w.radar ? w.radar.state : null;
    const near2 = BACKDROP_ZONE_RADAR_NEAR_M * BACKDROP_ZONE_RADAR_NEAR_M;
    for (let i = 0; i < this.images.length; i++) {
      if (!this.images[i] || (this.known & (1 << i)) !== 0) continue;
      const p = g.ships[i]!.state;
      let k = (p.x - b.x) ** 2 + (p.y - b.y) ** 2 <= w.visRange2;
      for (let j = 0; !k && r && j < r.n; j++) k = (r.blips[j]!.x - p.x) ** 2 + (r.blips[j]!.y - p.y) ** 2 <= near2;
      if (k) this.known |= 1 << i;
    }
  }

  /** 見せる艦の添字: 最寄りの浮いている艦が止まっていて陰があり、知っていて、自艇が照らされていなければその艦（-1 はなし） */
  private targetOf(w: BackdropFxWorldView): number {
    const g = w.destroyers;
    if (!g) return -1;
    this.noteKnown(w);
    if (w.enemy.illuminated) return -1;
    const i = g.nearestAfloatIndex(w.boat.state.x, w.boat.state.y);
    return i >= 0 && i < this.images.length && this.images[i] !== null && (this.known & (1 << i)) !== 0 && g.ships[i]!.anchored ? i : -1;
  }

  /** 毎フレーム（world-art から。realDt は見た目の時計の秒）: 見せる艦が替わった時と α を替えている間だけ書く */
  update(realDt: number, w: BackdropFxWorldView): void {
    const t = this.targetOf(w);
    if (t !== this.shown) {
      this.shown = t;
      this.fading = true;
    }
    if (!this.fading) return;
    const d = (realDt * 1000) / BACKDROP_ZONE_FADE_MS;
    let still = false;
    for (let i = 0; i < this.images.length; i++) {
      const im = this.images[i];
      if (!im) continue;
      const goal = i === t ? 1 : 0;
      let a = this.alpha[i]!;
      if (a === goal) continue;
      a = goal > a ? Math.min(goal, a + d) : Math.max(goal, a - d);
      this.alpha[i] = a;
      im.setAlpha(a).setVisible(a > 0);
      if (a !== goal) still = true;
    }
    this.fading = still;
  }

  destroy(): void {
    this.hills?.destroy();
    for (let i = 0; i < this.images.length; i++) {
      this.images[i]?.destroy();
      if (this.images[i]) removeBackdropZoneTexture(this.scene, BACKDROP_ZONE_TEX_PREFIX + i);
    }
    this.images.length = 0;
  }
}
