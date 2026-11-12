// v0.7.0 S3c（アートと音①：コードで描く絵。spec-v0700 §5.4・R10・R26）: 火災の炎と煙。発生源の枠 FIRE_SOURCES（自艇＝jp_03 は座席の隊長艇の火災 damage.fireLeftS > 0、
// 被弾して沈んでいない僚艇、命中して沈んでいない駆逐艦・輸送船、被弾して浮いている米PT、被雷して沈んでいない味方の輸送船）。枠ごとに炎 1 枚（tex-flame・ADD・実秒の正弦でちらつく・
// 小艇は船幅の 0.8 倍まで）と、共有の煙の玉 FIRE_PUFFS（tex-smoke-puff を暗く tint・風下へ流れて膨らみ 2.5 秒で消える・0.25 秒ごと・尽きたら一番古い玉）。
// 煙幕と見分ける（R10）: 玉は半径 ≤ 15 m（小艇 9 m）・黒に近い茶灰・α ≤ 0.5。見えない発生源（visible false・α < 0.1）は出さない。玉は持ち主の番号を持ち、持ち主が見えなくなれば
// 0.3 秒で消す（隠れた敵の位置を指さない＝R26）。沈没の始まり（見えていた発生源の sinking が立ったフレーム）: 泡と油の輪（S4 から tex-oil-slick＝暗い油膜と縁の光と泡・5 秒）と、沈んだ所から煙の玉 4 秒。
// S4: 1 つの火災の物は炎 1 ＋ 玉 5（間隔 0.5 秒・寿命 2.4 秒）＝6 まで・玉のプール 12（jp_03 ハードの見える物の門 ≤ +40）。
// §7: 確保は constructor だけ（Image・型付き配列・発生源の読み口）。update は読んで書くだけ。論理の状態には書かない（art-rules）。乱数は絵だけ（ART_SEED_FX + 1）。
// IP1b（U3）: 玉 12 → 30（1 つの火災は炎 1 ＋ 玉 11）・煙の柱 4 → 7 秒・燃えている間の火の粉（fx-bus → spark-fx）・沈没の始まりで沈没の段（systems/sink-fx: 2 次の爆発・艦の上の炎・泡）。
import type Phaser from 'phaser';
import { assignFireSlots, flameDiameterM, flameFlicker, puffAlpha, puffMaxRadiusM, puffRadiusM } from '../assets/fire-shape';
import {
  ADD_DEPTH_STEP, ART_SEED_FX, BLEND_ADD, FIRE_ALLY_SHIP_BEAM_M, FIRE_DRIFT_DEG, FIRE_DRIFT_MPS, FIRE_PUFF_INTERVAL_S, FIRE_PUFF_JITTER_SHARE, FIRE_PUFF_LIFE_S, FIRE_PUFFS, FIRE_SMOKE_DEPTH, FIRE_SMOKE_TINT,
  FIRE_SOURCES, FLAME_BODY_SHARE, FLAME_FRAME_S, FLAME_TEX_PX, SINK_PLUME_S, SINK_RING_ALPHA, SINK_RING_DEPTH, SINK_RING_HOLD_SHARE, SINK_RING_RADIUS_M, SINK_RING_S, SINK_RINGS,
} from '../config/fx-art-config';
import { RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import { RENDERER_WEBGL } from '../config/sea-art-config';
import { EXPLOSION_RING_RADIUS_UNITS } from '../assets/art-dims';
import { SMOKE_PUFF_TEX_RADIUS_UNITS } from '../config/ui-config';
import { PT_FATE_SUNK } from '../core/pt-state';
import { SeededRng } from '../core/rng';
import { EMBER_INTERVAL_S } from '../config/blast-art-config';
import { emitEmber } from './fx-bus';
import type { SinkFx } from './sink-fx';

type Img = { readonly visible: boolean; readonly alpha: number; readonly displayWidth: number; readonly displayHeight: number; readonly rotation: number };
type Pos = { readonly x: number; readonly y: number };

/** 世界から読む物（MissionWorld がそのまま満たす。world-art の ArtWorldView に入る） */
export interface FireWorldView {
  readonly boat: { readonly sprite: Img; readonly state: Pos; readonly sinking: boolean };
  readonly damage: { readonly fireLeftS: number; readonly hp: number };
  readonly escort: { readonly sprite: Img; readonly state: { readonly boat: Pos; readonly hits: number; readonly sunk: boolean } } | null;
  readonly destroyers: { readonly ships: readonly { readonly sprite: Img; readonly state: Pos; readonly hitsTaken: number; readonly sinking: boolean }[] } | null;
  readonly pts: { readonly sprites: readonly Img[]; readonly section: { readonly boats: readonly (Pos & { readonly hp: number; readonly hitsTaken: number; readonly fate: number })[] } } | null;
  readonly landing: { readonly state: Pos & { readonly hits: number; readonly sinking: boolean } } | null;
}

/** 発生源の読み口（constructor で 1 回作る。read が毎フレーム欄を書き直す） */
interface Probe {
  burning: boolean;
  sink: boolean;
  visible: boolean;
  x: number;
  y: number;
  /** 艇首の向き（絵の rotation・ラジアン）と船体の長さ m（沈没の段の置く所。IP1b） */
  rot: number;
  lenM: number;
  readonly beamM: number;
  readonly ship: boolean;
  read(): void;
}
const MIN_ALPHA = 0.1;
const shown = (s: Img): boolean => s.visible && s.alpha >= MIN_ALPHA;

export class FireFx {
  private readonly probes: Probe[] = [];
  private readonly flames: Phaser.GameObjects.Image[] = [];
  private readonly puffs: Phaser.GameObjects.Image[] = [];
  private readonly rings: Phaser.GameObjects.Image[] = [];
  private readonly active: Uint8Array;
  private readonly slotOf: Int16Array;
  private readonly probeOf = new Int16Array(FIRE_SOURCES).fill(-1);
  private readonly emitIn = new Float32Array(FIRE_SOURCES);
  private readonly emberIn = new Float32Array(FIRE_SOURCES);
  private readonly phase = new Float32Array(FIRE_SOURCES);
  private readonly prevSink: Uint8Array;
  private readonly prevVis: Uint8Array;
  private readonly plumeS: Float32Array;
  private readonly plumeX: Float32Array;
  private readonly plumeY: Float32Array;
  private readonly owner = new Int16Array(FIRE_PUFFS).fill(-1);
  private readonly age = new Float32Array(FIRE_PUFFS).fill(Infinity);
  private readonly hidden = new Float32Array(FIRE_PUFFS);
  private readonly maxR = new Float32Array(FIRE_PUFFS);
  private readonly px = new Float32Array(FIRE_PUFFS);
  private readonly py = new Float32Array(FIRE_PUFFS);
  private readonly vx = new Float32Array(FIRE_PUFFS);
  private readonly vy = new Float32Array(FIRE_PUFFS);
  private readonly ringAge = new Float32Array(SINK_RINGS).fill(Infinity);
  private readonly ringR = new Float32Array(SINK_RINGS);
  private readonly flick = new Float32Array(2);
  private readonly rng = new SeededRng(ART_SEED_FX + 1);
  private nextPuff = 0;
  private nextRing = 0;
  private t = 0;
  private readonly puffPerM = 1 / SMOKE_PUFF_TEX_RADIUS_UNITS / RENDER_SCALE;
  private readonly ringPerM = 1 / EXPLOSION_RING_RADIUS_UNITS / RENDER_SCALE;

  constructor(scene: Phaser.Scene, w: FireWorldView, private readonly sink: SinkFx) {
    const P = this.probes;
    const b = w.boat;
    const d = w.damage;
    P.push(probe(b.sprite.displayWidth, false, (p) => set(p, d.fireLeftS > 0 && d.hp > 0, b.sinking, shown(b.sprite), b.state, b.sprite)));
    const e = w.escort;
    if (e) P.push(probe(e.sprite.displayWidth, false, (p) => set(p, e.state.hits > 0 && !e.state.sunk, e.state.sunk, shown(e.sprite), e.state.boat, e.sprite)));
    if (w.destroyers) for (const s of w.destroyers.ships) P.push(probe(s.sprite.displayWidth, true, (p) => set(p, s.hitsTaken > 0 && !s.sinking, s.sinking, shown(s.sprite), s.state, s.sprite)));
    const pts = w.pts;
    if (pts) pts.section.boats.forEach((pb, i) => P.push(probe(pts.sprites[i]!.displayWidth, false, (p) => set(p, pb.hitsTaken > 0 && pb.hp > 0 && pb.fate !== PT_FATE_SUNK, false, shown(pts.sprites[i]!), pb, pts.sprites[i]!))));
    const ld = w.landing;
    if (ld) P.push(probe(FIRE_ALLY_SHIP_BEAM_M, true, (p) => set(p, ld.state.hits > 0 && !ld.state.sinking, ld.state.sinking, true, ld.state, null)));
    const n = P.length;
    this.active = new Uint8Array(n);
    this.slotOf = new Int16Array(n).fill(-1);
    this.prevSink = new Uint8Array(n);
    this.prevVis = new Uint8Array(n);
    this.plumeS = new Float32Array(n);
    this.plumeX = new Float32Array(n);
    this.plumeY = new Float32Array(n);
    const add = scene.sys.game.renderer.type === RENDERER_WEBGL;
    for (let s = 0; s < FIRE_SOURCES; s++) {
      const f = scene.add.image(0, 0, TEXTURE_KEYS.flame, 'p0').setDepth(FIRE_SMOKE_DEPTH + ADD_DEPTH_STEP).setVisible(false);
      if (add) f.setBlendMode(BLEND_ADD);
      this.flames.push(f);
      this.phase[s] = this.rng.nextRange(0, Math.PI * 2);
    }
    for (let i = 0; i < FIRE_PUFFS; i++) this.puffs.push(scene.add.image(0, 0, TEXTURE_KEYS.smokePuff).setTint(FIRE_SMOKE_TINT).setDepth(FIRE_SMOKE_DEPTH).setVisible(false));
    for (let i = 0; i < SINK_RINGS; i++) this.rings.push(scene.add.image(0, 0, TEXTURE_KEYS.oilSlick).setDepth(SINK_RING_DEPTH).setVisible(false));
  }

  /** 毎フレーム（world-art から。船体の絵の同期の後＝このフレームの位置と見え方） */
  update(realDt: number): void {
    this.t += realDt;
    const P = this.probes;
    for (let i = 0; i < P.length; i++) {
      const p = P[i]!;
      p.read();
      if (p.sink && !this.prevSink[i] && this.prevVis[i]) this.startSink(i, p);
      this.prevSink[i] = p.sink ? 1 : 0;
      this.prevVis[i] = p.visible ? 1 : 0;
      if (this.plumeS[i]! > 0) this.plumeS[i] = this.plumeS[i]! - realDt;
      this.active[i] = (p.burning && p.visible) || this.plumeS[i]! > 0 ? 1 : 0;
    }
    assignFireSlots(this.active, this.slotOf, this.probeOf);
    for (let s = 0; s < FIRE_SOURCES; s++) this.updateSlot(s, realDt);
    this.updatePuffs(realDt);
    this.updateRings(realDt);
  }

  private startSink(i: number, p: Probe): void {
    this.plumeS[i] = SINK_PLUME_S;
    this.plumeX[i] = p.x;
    this.plumeY[i] = p.y;
    const r = this.nextRing;
    this.nextRing = (r + 1) % SINK_RINGS;
    this.ringAge[r] = 0;
    this.ringR[r] = SINK_RING_RADIUS_M[p.ship ? 0 : 1];
    this.rings[r]!.setPosition(p.x, p.y).setAlpha(SINK_RING_ALPHA).setVisible(true);
    this.sink.start(p.x, p.y, p.rot, p.lenM, p.beamM, p.ship);
  }

  private updateSlot(s: number, dt: number): void {
    const f = this.flames[s]!;
    const i = this.probeOf[s]!;
    if (i < 0) {
      if (f.visible) f.setVisible(false);
      return;
    }
    const p = this.probes[i]!;
    const plume = this.plumeS[i]! > 0;
    const x = plume ? this.plumeX[i]! : p.x;
    const y = plume ? this.plumeY[i]! : p.y;
    if (!plume && p.burning) {
      flameFlicker(this.t, this.phase[s]!, this.flick);
      const frame = Math.floor((this.t + this.phase[s]!) / FLAME_FRAME_S) % 2 === 0 ? 'p0' : 'p1';
      if (f.frame.name !== frame) f.setFrame(frame);
      f.setPosition(x, y).setScale((flameDiameterM(p.beamM) / FLAME_BODY_SHARE / FLAME_TEX_PX) * this.flick[1]!).setAlpha(this.flick[0]!).setAngle((this.phase[s]! * 180) / Math.PI);
      if (!f.visible) f.setVisible(true);
      this.emberIn[s] = this.emberIn[s]! - dt;
      if (p.visible && this.emberIn[s]! <= 0) {
        this.emberIn[s] = EMBER_INTERVAL_S;
        emitEmber(x, y);
      }
    } else if (f.visible) f.setVisible(false);
    this.emitIn[s] = this.emitIn[s]! - dt;
    if (this.emitIn[s]! > 0) return;
    this.emitIn[s] = FIRE_PUFF_INTERVAL_S;
    const k = this.nextPuff;
    this.nextPuff = (k + 1) % FIRE_PUFFS;
    const j = p.beamM * FIRE_PUFF_JITTER_SHARE;
    const sp = FIRE_DRIFT_MPS * this.rng.nextRange(0.7, 1.3);
    const ang = ((FIRE_DRIFT_DEG + this.rng.nextRange(-12, 12)) * Math.PI) / 180;
    this.owner[k] = i;
    this.age[k] = 0;
    this.hidden[k] = 0;
    this.maxR[k] = puffMaxRadiusM(p.ship);
    this.px[k] = x + this.rng.nextRange(-j, j);
    this.py[k] = y + this.rng.nextRange(-j, j);
    this.vx[k] = Math.sin(ang) * sp;
    this.vy[k] = -Math.cos(ang) * sp;
  }

  private updatePuffs(dt: number): void {
    for (let k = 0; k < FIRE_PUFFS; k++) {
      const img = this.puffs[k]!;
      if (this.age[k] === Infinity) continue;
      this.age[k] = this.age[k]! + dt;
      const o = this.owner[k]!;
      if (o >= 0 && !this.probes[o]!.visible && !(this.plumeS[o]! > 0)) this.hidden[k] = this.hidden[k]! + dt;
      const a = puffAlpha(this.age[k]!, FIRE_PUFF_LIFE_S, this.hidden[k]!);
      if (a <= 0) {
        this.age[k] = Infinity;
        if (img.visible) img.setVisible(false);
        continue;
      }
      this.px[k] = this.px[k]! + this.vx[k]! * dt;
      this.py[k] = this.py[k]! + this.vy[k]! * dt;
      img.setPosition(this.px[k]!, this.py[k]!).setScale(puffRadiusM(this.age[k]!, FIRE_PUFF_LIFE_S, this.maxR[k]!) * this.puffPerM).setAlpha(a);
      if (!img.visible) img.setVisible(true);
    }
  }

  private updateRings(dt: number): void {
    for (let r = 0; r < SINK_RINGS; r++) {
      if (this.ringAge[r] === Infinity) continue;
      const img = this.rings[r]!;
      this.ringAge[r] = this.ringAge[r]! + dt;
      const t = this.ringAge[r]! / SINK_RING_S;
      if (t >= 1) {
        this.ringAge[r] = Infinity;
        img.setVisible(false);
        continue;
      }
      img.setScale(this.ringR[r]! * (0.4 + 0.6 * (1 - (1 - t) * (1 - t))) * this.ringPerM).setAlpha(SINK_RING_ALPHA * Math.min(1, (1 - t) / (1 - SINK_RING_HOLD_SHARE)));
    }
  }

  destroy(): void {
    for (const g of this.flames) g.destroy();
    for (const g of this.puffs) g.destroy();
    for (const g of this.rings) g.destroy();
    this.flames.length = 0;
    this.puffs.length = 0;
    this.rings.length = 0;
  }
}

function probe(beamM: number, ship: boolean, read: (p: Probe) => void): Probe {
  const p: Probe = { burning: false, sink: false, visible: false, x: 0, y: 0, rot: 0, lenM: beamM * 4, beamM, ship, read: () => read(p) };
  return p;
}

function set(p: Probe, burning: boolean, sink: boolean, visible: boolean, at: Pos, img: Img | null): void {
  p.burning = burning;
  p.sink = sink;
  p.visible = visible;
  p.x = at.x;
  p.y = at.y;
  if (img && !sink) {
    p.rot = img.rotation;
    p.lenM = img.displayHeight;
  }
}
