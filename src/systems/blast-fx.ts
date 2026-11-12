// v0.7.0 IP1b（U3「もっと派手な演出、数でも大丈夫」）: 爆発の 2 段目。explosion-fx の枠と同じ番号の枠ごとに 4 部品（2 つ目の閃光・2 つ目の火球＝ADD、水柱の白い柱、水面の衝撃波の輪）と、
// 共有の爆発の煙のプール（暗い玉が遅れて湧き、風下へ流れて膨らむ）。破片の火花と水滴は spark-fx。
// 大きい版（命中・撃破・沈没）: 2 つ目の閃光（0.12 秒遅れ・少しずれた所）＋2 つ目の火球＋水柱の柱（上がって落ちる白い柱）＋衝撃波（艦艇の下の白い輪が 150 m へ）＋煙 5＋破片 16＋水滴 12。
// 小さい版（dud）: 煙 1＋破片 5（柱・衝撃波なし＝艇に当たった弾が水柱に見えない＝R11）。2 次の爆発（沈没の段）: 2 つ目の閃光と火球だけ＋煙 2＋破片 8（輪・柱・衝撃波なし）。
// IP2（U6「眩しい」）: 2 つ目の閃光は通常の重ね（ADD をやめた）・橙・α 0.5、水柱の柱は薄い灰青・α 0.7、衝撃波 α 0.5。昼の海は ADD の火球の α を下げる（setAddMul）。
//   魚雷の命中（torpedo）は水柱の柱と爆発の水滴を出さない（torpedo-column-fx の大きな水柱が代わり＝U7）。
// §7: 確保は constructor だけ。play・update は書くだけ。乱数は絵だけ（ART_SEED_BLAST）。
import type Phaser from 'phaser';
import { columnPoseInto, shockPoseInto } from '../assets/blast-shape';
import { partFade, partGrow } from '../assets/fx-shape';
import { EXPLOSION_RING_RADIUS_UNITS } from '../assets/art-dims';
import {
  ART_SEED_BLAST, BLAST_COLUMN_RADIUS_M, BLAST_COLUMN_S, BLAST_COLUMN_TINT, BLAST_FIRE2_DELAY_S, BLAST_FIRE2_FROM, BLAST_FIRE2_RADIUS_M, BLAST_FIRE2_S, BLAST_FIRE2_TINT, BLAST_FLASH2_ALPHA, BLAST_FLASH2_DELAY_S, BLAST_FLASH2_RADIUS_M,
  BLAST_FLASH2_S, BLAST_FLASH2_TINT, BLAST_OFFSET_M, BLAST_SHOCK_DEPTH, BLAST_SHOCK_RADIUS_M, BLAST_SHOCK_S, BLAST_SMOKE_ALPHA, BLAST_SMOKE_BIG, BLAST_SMOKE_DELAY_S, BLAST_SMOKE_DRIFT_MPS, BLAST_SMOKE_POOL,
  BLAST_SMOKE_RADIUS_M, BLAST_SMOKE_S, BLAST_SMOKE_SECONDARY, BLAST_SMOKE_SMALL, BLAST_SMOKE_SPREAD_M, BLAST_SMOKE_TINT, SHOCK_TEX_RING_PX, SPARK_DEBRIS_BIG, SPARK_DEBRIS_SECONDARY, SPARK_DEBRIS_SMALL, SPARK_DROPS_BIG,
} from '../config/blast-art-config';
import { ADD_DEPTH_STEP, BLEND_ADD, EXPLOSION_SLOTS, FIRE_DRIFT_DEG, FIRE_SMOKE_DEPTH } from '../config/fx-art-config';
import { DEPTH, RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import { RENDERER_WEBGL } from '../config/sea-art-config';
import { SMOKE_PUFF_TEX_RADIUS_UNITS } from '../config/ui-config';
import { SeededRng } from '../core/rng';
import type { SparkFx } from './spark-fx';

const KIND_BIG = 0;
const KIND_SMALL = 1;
const KIND_SECONDARY = 2;
/** 魚雷の命中の大きい版（柱なし。IP2） */
const KIND_TORPEDO = 3;

export class BlastFx {
  private readonly flash2: Phaser.GameObjects.Image[] = [];
  private readonly fire2: Phaser.GameObjects.Image[] = [];
  private readonly column: Phaser.GameObjects.Image[] = [];
  private readonly shock: Phaser.GameObjects.Image[] = [];
  private readonly smoke: Phaser.GameObjects.Image[] = [];
  private readonly age = new Float32Array(EXPLOSION_SLOTS).fill(Infinity);
  private readonly kind = new Uint8Array(EXPLOSION_SLOTS);
  private readonly sx = new Float32Array(EXPLOSION_SLOTS);
  private readonly sy = new Float32Array(EXPLOSION_SLOTS);
  private readonly cx = new Float32Array(EXPLOSION_SLOTS);
  private readonly cy = new Float32Array(EXPLOSION_SLOTS);
  private readonly smokeAge = new Float32Array(BLAST_SMOKE_POOL).fill(Infinity);
  private readonly smokeX = new Float32Array(BLAST_SMOKE_POOL);
  private readonly smokeY = new Float32Array(BLAST_SMOKE_POOL);
  private readonly smokeR = new Float32Array(BLAST_SMOKE_POOL);
  private readonly rng = new SeededRng(ART_SEED_BLAST);
  private readonly pose = new Float32Array(4);
  private nextSmoke = 0;
  private nextSecondary = 0;
  /** 昼の海で ADD の火球の α に掛ける（explosion-fx の setDaylight から。夜は 1） */
  private addMul = 1;
  private readonly perM = 1 / EXPLOSION_RING_RADIUS_UNITS / RENDER_SCALE;
  private readonly shockPerM = 1 / SHOCK_TEX_RING_PX;
  private readonly puffPerM = 1 / SMOKE_PUFF_TEX_RADIUS_UNITS / RENDER_SCALE;
  private readonly driftX = Math.sin((FIRE_DRIFT_DEG * Math.PI) / 180) * BLAST_SMOKE_DRIFT_MPS;
  private readonly driftY = -Math.cos((FIRE_DRIFT_DEG * Math.PI) / 180) * BLAST_SMOKE_DRIFT_MPS;

  constructor(scene: Phaser.Scene, private readonly sparks: SparkFx) {
    const add = scene.sys.game.renderer.type === RENDERER_WEBGL;
    const light = DEPTH.effects + ADD_DEPTH_STEP;
    for (let i = 0; i < EXPLOSION_SLOTS; i++) {
      const fl = scene.add.image(0, 0, TEXTURE_KEYS.muzzleFlash).setTint(BLAST_FLASH2_TINT).setDepth(DEPTH.effects).setVisible(false);
      const fi = scene.add.image(0, 0, TEXTURE_KEYS.fireball).setTint(BLAST_FIRE2_TINT).setDepth(light).setVisible(false);
      if (add) fi.setBlendMode(BLEND_ADD);
      this.flash2.push(fl);
      this.fire2.push(fi);
      this.column.push(scene.add.image(0, 0, TEXTURE_KEYS.splash).setTint(BLAST_COLUMN_TINT).setDepth(DEPTH.effects - ADD_DEPTH_STEP).setVisible(false));
      this.shock.push(scene.add.image(0, 0, TEXTURE_KEYS.shockwave).setDepth(BLAST_SHOCK_DEPTH).setVisible(false));
    }
    for (let i = 0; i < BLAST_SMOKE_POOL; i++) this.smoke.push(scene.add.image(0, 0, TEXTURE_KEYS.smokePuff).setTint(BLAST_SMOKE_TINT).setDepth(FIRE_SMOKE_DEPTH).setVisible(false));
  }

  /** explosion-fx の play から（同じ枠の番号 i）。dud は小さい版、torpedo は魚雷の命中（柱と水滴は水柱の演出が出す＝IP2） */
  play(i: number, x: number, y: number, dud: boolean, torpedo: boolean): void {
    this.open(i, x, y, dud ? KIND_SMALL : torpedo ? KIND_TORPEDO : KIND_BIG);
    if (dud) {
      this.puffs(x, y, BLAST_SMOKE_SMALL, 0.5);
      this.sparks.debris(x, y, SPARK_DEBRIS_SMALL);
      return;
    }
    this.puffs(x, y, BLAST_SMOKE_BIG, 1);
    this.sparks.debris(x, y, SPARK_DEBRIS_BIG);
    if (!torpedo) this.sparks.drops(x, y, SPARK_DROPS_BIG);
  }

  /** 昼の海の ADD の α の掛け（explosion-fx の setDaylight から） */
  setAddMul(m: number): void {
    this.addMul = m;
  }

  /** 沈没の段の 2 次の爆発（sink-fx から。輪・柱・衝撃波なし＝結果の印ではない）。枠は 2 次の爆発の番の枠（大きい版の枠と別の番を回す） */
  secondary(x: number, y: number): void {
    const i = this.nextSecondary;
    this.nextSecondary = (i + 1) % EXPLOSION_SLOTS;
    if (this.age[i] !== Infinity && (this.kind[i] === KIND_BIG || this.kind[i] === KIND_TORPEDO)) return; // 大きい版の途中は上書きしない
    this.open(i, x, y, KIND_SECONDARY);
    this.age[i] = BLAST_FLASH2_DELAY_S; // 閃光と火球を遅れなしで（2 段目の遅れの分だけ年を進めて始める）
    this.puffs(x, y, BLAST_SMOKE_SECONDARY, 0.8);
    this.sparks.debris(x, y, SPARK_DEBRIS_SECONDARY);
  }

  private open(i: number, x: number, y: number, kind: number): void {
    this.age[i] = 0;
    this.kind[i] = kind;
    this.cx[i] = x;
    this.cy[i] = y;
    this.sx[i] = x + this.rng.nextRange(-BLAST_OFFSET_M, BLAST_OFFSET_M);
    this.sy[i] = y + this.rng.nextRange(-BLAST_OFFSET_M, BLAST_OFFSET_M);
    this.flash2[i]!.setVisible(false);
    this.fire2[i]!.setVisible(false);
    this.column[i]!.setPosition(x, y).setVisible(false);
    this.shock[i]!.setPosition(x, y).setVisible(false);
  }

  private puffs(x: number, y: number, n: number, size: number): void {
    for (let k = 0; k < n; k++) {
      const j = this.nextSmoke;
      this.nextSmoke = (j + 1) % BLAST_SMOKE_POOL;
      this.smokeAge[j] = -this.rng.nextRange(BLAST_SMOKE_DELAY_S[0], BLAST_SMOKE_DELAY_S[1]); // 負の年＝遅れて湧く
      this.smokeX[j] = x + this.rng.nextRange(-BLAST_SMOKE_SPREAD_M, BLAST_SMOKE_SPREAD_M);
      this.smokeY[j] = y + this.rng.nextRange(-BLAST_SMOKE_SPREAD_M, BLAST_SMOKE_SPREAD_M);
      this.smokeR[j] = BLAST_SMOKE_RADIUS_M[1] * size * this.rng.nextRange(0.75, 1);
      this.smoke[j]!.setVisible(false);
    }
  }

  /** 毎フレーム（explosion-fx の update から） */
  update(realDt: number): void {
    const o = this.pose;
    for (let i = 0; i < EXPLOSION_SLOTS; i++) {
      if (this.age[i] === Infinity) continue;
      const a = this.age[i]! + realDt;
      this.age[i] = a;
      const k = this.kind[i]!;
      const fa = a - BLAST_FLASH2_DELAY_S;
      const fl = this.flash2[i]!;
      if (fa >= 0 && fa < BLAST_FLASH2_S && k !== KIND_SMALL) fl.setPosition(this.sx[i]!, this.sy[i]!).setScale(BLAST_FLASH2_RADIUS_M * this.perM).setAlpha(BLAST_FLASH2_ALPHA * (1 - fa / BLAST_FLASH2_S)).setVisible(true);
      else if (fl.visible) fl.setVisible(false);
      const ga = a - BLAST_FIRE2_DELAY_S;
      const fi = this.fire2[i]!;
      if (ga >= 0 && ga < BLAST_FIRE2_S && k !== KIND_SMALL) {
        fi.setPosition(this.sx[i]!, this.sy[i]!).setScale(BLAST_FIRE2_RADIUS_M * this.perM * partGrow(ga, BLAST_FIRE2_S, BLAST_FIRE2_FROM)).setAlpha(partFade(ga, BLAST_FIRE2_S, this.addMul)).setVisible(true);
      } else if (fi.visible) fi.setVisible(false);
      const col = this.column[i]!;
      const sh = this.shock[i]!;
      if (k === KIND_BIG && a < BLAST_COLUMN_S) {
        columnPoseInto(o, a);
        const s = BLAST_COLUMN_RADIUS_M * this.perM;
        col.setPosition(this.cx[i]!, this.cy[i]! - o[2]!).setScale(s * o[0]!, s * o[1]!).setAlpha(o[3]!).setVisible(true);
      } else if (col.visible) col.setVisible(false);
      if ((k === KIND_BIG || k === KIND_TORPEDO) && a < BLAST_SHOCK_S) {
        shockPoseInto(o, a);
        sh.setScale(BLAST_SHOCK_RADIUS_M * this.shockPerM * o[0]!).setAlpha(o[1]!).setVisible(true);
      } else if (sh.visible) sh.setVisible(false);
      if (a >= BLAST_COLUMN_S && a >= BLAST_FIRE2_DELAY_S + BLAST_FIRE2_S && a >= BLAST_FLASH2_DELAY_S + BLAST_FLASH2_S) this.age[i] = Infinity;
    }
    this.updateSmoke(realDt);
  }

  private updateSmoke(dt: number): void {
    for (let j = 0; j < BLAST_SMOKE_POOL; j++) {
      if (this.smokeAge[j] === Infinity) continue;
      const img = this.smoke[j]!;
      const a = this.smokeAge[j]! + dt;
      this.smokeAge[j] = a;
      if (a < 0) continue;
      if (a >= BLAST_SMOKE_S) {
        this.smokeAge[j] = Infinity;
        img.setVisible(false);
        continue;
      }
      const t = a / BLAST_SMOKE_S;
      const r = this.smokeR[j]! * (BLAST_SMOKE_RADIUS_M[0] / BLAST_SMOKE_RADIUS_M[1] + (1 - BLAST_SMOKE_RADIUS_M[0] / BLAST_SMOKE_RADIUS_M[1]) * (1 - (1 - t) * (1 - t)));
      const alpha = BLAST_SMOKE_ALPHA * Math.min(1, a / 0.2) * Math.min(1, (1 - t) / 0.5);
      img.setPosition(this.smokeX[j]! + this.driftX * a, this.smokeY[j]! + this.driftY * a).setScale(r * this.puffPerM).setAlpha(alpha);
      if (!img.visible) img.setVisible(true);
    }
  }

  destroy(): void {
    for (let i = 0; i < EXPLOSION_SLOTS; i++) {
      this.flash2[i]!.destroy();
      this.fire2[i]!.destroy();
      this.column[i]!.destroy();
      this.shock[i]!.destroy();
    }
    for (const s of this.smoke) s.destroy();
    this.smoke.length = 0;
  }
}
