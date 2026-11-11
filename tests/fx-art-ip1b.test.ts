// v0.7.0 IP1b（実機 1 回目の直し②。ユーザーの U3「もっと派手な演出、数でも大丈夫」・U4「沿岸砲もリメイクお願いします」）: Phaser に依らない式・数の上限・同じ種で同じ・作法の pin。
// - 火花・水滴の弧（跳んで落ちる・寿命で 0）、水柱の柱・衝撃波の曲線、沈没の段の 2 次の爆発の時刻と置く所、1 回の演出の見える物の数（U3 の予算 +150 の内）。
// - 火花と衝撃波の画素（frame 2 枚・縁の外は 0）。沿岸砲の形（絵の一辺の内・赤い印・後ろの口・同じ種で同じ）と砲の向き（射界の限り・回る速さ）。
// - source の pin: 確保は constructor だけ・乱数は絵だけの種・fx-bus の登録と破棄・SplashPool の飛沫と砲口・7 か所の砲口・沿岸砲は Graphics の四角をやめた・300 行。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { blastObjects, columnPoseInto, shockPoseInto, shockwavePixels, sinkBlastAtInto, sinkBlastTimes, sparkPixels, sparkPoseInto } from '../src/assets/blast-shape';
import { batteryAimDeg, batteryBags, batteryFits, batteryNet, batteryRedMarks, turnToward } from '../src/assets/battery-shape';
import {
  ART_SEED_BATTERY, BATTERY_AIM_LIMIT_DEG, BATTERY_ART_SIZE_M, BATTERY_BAG_GAP_DEG, BATTERY_BAGS, BATTERY_IDLE_SWING_DEG, BATTERY_NET_BLOBS, BATTERY_RED_MARKS, BLAST_COLUMN_RISE_M, BLAST_COLUMN_S,
  BLAST_SHOCK_ALPHA, BLAST_SHOCK_S, BLAST_SMOKE_ALPHA, BLAST_SMOKE_POOL, BLAST_SMOKE_RADIUS_M, GUN_SMOKE_POOL, SHOCK_TEX_PX, SHOCK_TEX_RING_PX, SHOCK_TEX_WIDTH_PX, SINK_BLAST_TIMES_BOAT,
  SINK_BLAST_TIMES_SHIP, SINK_FLAMES_PER_SLOT, SINK_SLOTS, SPARK_DROP_POOL, SPARK_HOT_POOL, SPARK_KINDS, SPARK_TEX_H, SPARK_TEX_W,
} from '../src/config/blast-art-config';
import { EXPLOSION_PARTS, EXPLOSION_SLOTS, FIRE_OBJECTS_PER_SOURCE, FIRE_PUFF_INTERVAL_S, FIRE_PUFF_LIFE_S, FIRE_PUFFS, FIRE_SMOKE_MAX_ALPHA, FIRE_SMOKE_MAX_RADIUS_M } from '../src/config/fx-art-config';

const read = (f: string): string => readFileSync(f, 'utf8');
const lines = (f: string): number => read(f).split('\n').length - 1;

describe('火花と水滴・2 段目の爆発の式（IP1b。U3）', () => {
  it('火花の弧: 0 秒は置いた所・跳んで画面の上へずれ・落ちて地の位置に戻る・寿命で α 0・抵抗で遠くへは行かない', () => {
    const o = new Float32Array(3);
    sparkPoseInto(o, 0, 1, 10, 20, 50, 0, 40);
    expect([o[0], o[1], o[2]]).toEqual([10, 20, 1]);
    sparkPoseInto(o, 0.3, 1, 10, 20, 0, 0, 40);
    expect(o[1]).toBeLessThan(20); // 跳んでいる＝上へ
    sparkPoseInto(o, 0.99, 1, 10, 20, 0, 0, 40);
    expect(o[1]).toBe(20); // 落ちた（高さ 0）
    sparkPoseInto(o, 1, 1, 0, 0, 100, 0, 0);
    expect(o[2]).toBe(0);
    expect(o[0]).toBeLessThan(100); // 抵抗
    for (const k of Object.values(SPARK_KINDS)) {
      expect(k.speed[0]).toBeLessThanOrEqual(k.speed[1]);
      expect(k.life[0]).toBeGreaterThan(0);
      expect(k.life[1]).toBeLessThanOrEqual(1.5); // 短い弧（プールが早く空く）
    }
  });
  it('水柱の柱は上がって落ち（高さ ≤ BLAST_COLUMN_RISE_M・終わりで α 0）、衝撃波は広がり（始まりの割合 → 1）α は単調に下がって 0', () => {
    const o = new Float32Array(4);
    let maxRise = 0;
    for (let t = 0; t <= BLAST_COLUMN_S; t += 0.05) {
      columnPoseInto(o, t);
      maxRise = Math.max(maxRise, o[2]!);
      expect(o[2]).toBeLessThanOrEqual(BLAST_COLUMN_RISE_M + 1e-6);
      expect(o[1]).toBeGreaterThanOrEqual(o[0]! - 1e-6);
    }
    expect(maxRise).toBeGreaterThan(BLAST_COLUMN_RISE_M * 0.9);
    columnPoseInto(o, BLAST_COLUMN_S);
    expect(o[3]).toBe(0);
    let pr = 0;
    let pa = 2;
    for (let t = 0; t <= BLAST_SHOCK_S; t += 0.05) {
      shockPoseInto(o, t);
      expect(o[0]).toBeGreaterThanOrEqual(pr);
      expect(o[1]).toBeLessThanOrEqual(pa);
      pr = o[0]!;
      pa = o[1]!;
    }
    shockPoseInto(o, 0);
    expect(o[1]).toBeCloseTo(BLAST_SHOCK_ALPHA);
    shockPoseInto(o, BLAST_SHOCK_S);
    expect(o[0]).toBeCloseTo(1);
    expect(o[1]).toBe(0);
  });
  it('沈没の段: 2 次の爆発は艦 5 回・小艇 2 回（時刻は増える）、置く所は船体の長さの ±0.42 の内', () => {
    expect(sinkBlastTimes(true)).toBe(SINK_BLAST_TIMES_SHIP);
    expect(sinkBlastTimes(false)).toBe(SINK_BLAST_TIMES_BOAT);
    for (const ts of [SINK_BLAST_TIMES_SHIP, SINK_BLAST_TIMES_BOAT]) for (let i = 1; i < ts.length; i++) expect(ts[i]).toBeGreaterThan(ts[i - 1]!);
    const o = new Float32Array(2);
    sinkBlastAtInto(o, 0, 0, 0, 100, 10, 0.5, 0); // 北向き・艇首の側の端
    expect(o[0]).toBeCloseTo(0);
    expect(o[1]).toBeCloseTo(-42);
    sinkBlastAtInto(o, 0, 0, Math.PI / 2, 100, 10, -0.5, 0); // 東向き・艦尾の側
    expect(o[0]).toBeCloseTo(-42);
  });
  it('数（U3 の予算: 見える物 ≤ 基準 +150）: 大きい版 1 回 ≤ 50・2 回が重なっても ≤ 100、プールは固定（枠 6・火花 48・水滴 40・煙 18・硝煙 12・沈没 2 × 炎 3）、1 つの火災は炎 1 ＋ 玉 11', () => {
    expect(blastObjects('big')).toBeLessThanOrEqual(50);
    expect(2 * blastObjects('big')).toBeLessThanOrEqual(100);
    expect(blastObjects('small')).toBeLessThanOrEqual(12);
    expect(blastObjects('secondary')).toBeLessThanOrEqual(14);
    expect([EXPLOSION_SLOTS, EXPLOSION_PARTS, SPARK_HOT_POOL, SPARK_DROP_POOL, BLAST_SMOKE_POOL, GUN_SMOKE_POOL, SINK_SLOTS, SINK_FLAMES_PER_SLOT]).toEqual([6, 4, 48, 40, 18, 12, 2, 3]);
    expect(FIRE_PUFFS).toBe(30);
    expect(1 + Math.ceil(FIRE_PUFF_LIFE_S / FIRE_PUFF_INTERVAL_S)).toBeLessThanOrEqual(FIRE_OBJECTS_PER_SOURCE);
    expect(FIRE_OBJECTS_PER_SOURCE).toBe(12);
  });
  it('煙は煙幕と見分けられる（R10）: 火災の玉は半径 ≤ 15 m・α ≤ 0.5 のまま、爆発の煙は半径 ≤ 30 m（煙幕 60 m の半分）・α ≤ 0.6 で 4.5 秒で消える', () => {
    expect(FIRE_SMOKE_MAX_RADIUS_M).toBeLessThanOrEqual(15);
    expect(FIRE_SMOKE_MAX_ALPHA).toBeLessThanOrEqual(0.5);
    expect(BLAST_SMOKE_RADIUS_M[1]).toBeLessThanOrEqual(30);
    expect(BLAST_SMOKE_ALPHA).toBeLessThanOrEqual(0.6);
  });
});

describe('火花と衝撃波の絵（IP1b）', () => {
  it('火花: frame 2 枚（p0 は先が明るく尾へ薄い横長の筋・p1 は丸）、白、縁の行は暗い', () => {
    const px = sparkPixels(SPARK_TEX_W, SPARK_TEX_H);
    expect(px.length).toBe(SPARK_TEX_W * SPARK_TEX_H * 2 * 4);
    const a = (x: number, y: number): number => px[(y * SPARK_TEX_W + x) * 4 + 3]!;
    const mid = Math.floor(SPARK_TEX_H / 2);
    expect(a(Math.floor(SPARK_TEX_W * 0.8), mid)).toBeGreaterThan(200);
    expect(a(1, mid)).toBeLessThan(40);
    expect(a(Math.floor(SPARK_TEX_W / 2), 0)).toBeLessThan(a(Math.floor(SPARK_TEX_W / 2), mid));
    expect(a(Math.floor(SPARK_TEX_W / 2), SPARK_TEX_H + mid)).toBe(255);
    expect(a(0, SPARK_TEX_H + mid)).toBe(0);
    for (let i = 0; i < px.length; i += 4) expect(px[i]! + px[i + 1]! + px[i + 2]!).toBe(765);
  });
  it('衝撃波: 輪の半径で一番明るく、外は 0、内は薄い', () => {
    const d = SHOCK_TEX_PX;
    const px = shockwavePixels(d, SHOCK_TEX_RING_PX, SHOCK_TEX_WIDTH_PX);
    const c = (d - 1) / 2;
    const a = (r: number): number => px[(Math.round(c) * d + Math.round(c - r)) * 4 + 3]!; // 左へ（右は枠の外へ出る）
    expect(a(SHOCK_TEX_RING_PX)).toBeGreaterThan(230);
    expect(SHOCK_TEX_RING_PX + SHOCK_TEX_WIDTH_PX).toBeLessThan(SHOCK_TEX_PX / 2 - 1); // 輪は枠の内
    expect(a(SHOCK_TEX_RING_PX + SHOCK_TEX_WIDTH_PX + 0.5)).toBe(0);
    expect(a(SHOCK_TEX_RING_PX * 0.5)).toBeLessThan(40);
    expect(px[3]).toBe(0);
  });
});

describe('沿岸砲の絵（IP1b。U4）', () => {
  it('形: 土嚢 22 個は後ろ（南）の口を空ける・擬装の塊は海の側 ±40° を空ける・赤い印 4 つ・どれも絵の一辺の内・同じ種で同じ', () => {
    const bags = batteryBags();
    expect(bags).toHaveLength(BATTERY_BAGS);
    for (const b of bags) {
      const deg = ((Math.atan2(b.x, -b.y) * 180) / Math.PI + 360) % 360;
      expect(Math.abs(deg - 180)).toBeGreaterThanOrEqual(BATTERY_BAG_GAP_DEG / 2 - 1e-6);
    }
    const net = batteryNet(ART_SEED_BATTERY);
    expect(net).toHaveLength(BATTERY_NET_BLOBS);
    expect(net).toEqual(batteryNet(ART_SEED_BATTERY));
    expect(net).not.toEqual(batteryNet(ART_SEED_BATTERY + 1));
    for (const n of net) {
      const deg = ((Math.atan2(n.x, -n.y) * 180) / Math.PI + 360) % 360;
      expect(deg).toBeGreaterThanOrEqual(40);
      expect(deg).toBeLessThanOrEqual(320);
    }
    expect(batteryRedMarks()).toHaveLength(BATTERY_RED_MARKS);
    expect(batteryFits(BATTERY_ART_SIZE_M, ART_SEED_BATTERY)).toBe(true);
    expect(batteryFits(BATTERY_ART_SIZE_M * 0.6, ART_SEED_BATTERY)).toBe(false);
  });
  it('砲の向き: 気づいて射界の中なら艇の方位（±85° に収める）、ふだんは海へ ±24° の首振り。回る速さは 1 回の上限まで', () => {
    expect(batteryAimDeg(true, 0, -100, 0)).toBeCloseTo(0);
    expect(batteryAimDeg(true, 100, -100, 0)).toBeCloseTo(45);
    expect(batteryAimDeg(true, 100, 50, 0)).toBe(BATTERY_AIM_LIMIT_DEG);
    expect(batteryAimDeg(true, -100, 50, 0)).toBe(-BATTERY_AIM_LIMIT_DEG);
    for (let t = 0; t < 30; t += 0.7) expect(Math.abs(batteryAimDeg(false, 999, 999, t))).toBeLessThanOrEqual(BATTERY_IDLE_SWING_DEG + 1e-9);
    expect(turnToward(0, 30, 5)).toBe(5);
    expect(turnToward(0, -30, 5)).toBe(-5);
    expect(turnToward(28, 30, 5)).toBe(30);
  });
});

describe('作法の pin（IP1b）', () => {
  it('新しい演出は確保を constructor だけでし、乱数は絵だけの種（火花・2 段目・沈没）', () => {
    for (const [f, seed] of [['src/systems/spark-fx.ts', 'ART_SEED_SPARK'], ['src/systems/blast-fx.ts', 'ART_SEED_BLAST'], ['src/systems/sink-fx.ts', 'ART_SEED_SINK']] as const) {
      const s = read(f).replace(/\/\/[^\n]*/g, '');
      expect(s, f).toContain(`new SeededRng(${seed})`);
      const rest = s.slice(s.lastIndexOf('  constructor('));
      const body = rest.slice(rest.indexOf('\n  }\n') + 4);
      expect(body, f).not.toMatch(/scene\.add\.|tweens|\.push\(/);
      expect(body.replace(/new (Float32Array|Uint8Array|Pool)\([^)]*\)/g, ''), f).not.toMatch(/\bnew\s/);
    }
    expect(read('src/assets/battery-shape.ts')).not.toMatch(/Math\.random/);
  });
  it('world-art は火花のプールを fx-bus に登録して破棄で外し、爆発・沈没・炎に渡す。SplashPool は置くたびに飛沫、muzzle で砲口の火花', () => {
    const wa = read('src/systems/world-art.ts');
    for (const line of ['registerSparkFx(this.sparks);', 'registerSparkFx(null);', 'this.explosions = new ExplosionFx(scene, this.sparks);', 'this.sink = new SinkFx(scene, this.explosions, this.sparks);', 'this.sink.update(realDt);', 'this.sparks.update(realDt);']) expect(wa).toContain(line);
    expect(wa.indexOf('registerSparkFx(null);')).toBeLessThan(wa.indexOf('this.sparks.destroy();'));
    const sp = read('src/systems/splash-pool.ts');
    expect(sp).toContain('emitSpray(x, y, hit);');
    expect(sp).toContain('emitMuzzle(x, y, big);');
    for (const [f, big] of [['src/systems/enemy-fire.ts', true], ['src/systems/pt-gun.ts', false], ['src/systems/world-arms.ts', false], ['src/systems/barge-hunt.ts', false], ['src/systems/pt-squadron.ts', false], ['src/entities/ally-destroyer.ts', true], ['src/systems/shore-battery.ts', true]] as const) {
      expect(read(f).split('this.splashes.muzzle(').length - 1, f).toBe(1);
      expect(read(f), f).toContain(big ? ', true); // 砲口の火花と硝煙' : ', false); // 砲口の火花');
    }
  });
  it('沿岸砲: Graphics の赤い四角と線の砲身をやめ、砲台と回る砲の絵（鍵は新しい 2 つ）。射界の半円・ラベル・砲弾・閃光の鍵はそのまま', () => {
    const s = read('src/systems/shore-battery.ts').replace(/\/\/[^\n]*/g, '');
    expect(s).not.toMatch(/fillRect|strokeRect|lineBetween|BATTERY_COLOR/);
    expect(s).toContain('TEXTURE_KEYS.shoreBattery');
    expect(s).toContain('TEXTURE_KEYS.shoreGun');
    expect(s).toContain('g.slice(p.x, p.y, r, Math.PI, 2 * Math.PI, false);');
    expect(s).toContain('scene.add.text(p.x, p.y + half + BATTERY_LABEL_GAP_M, BATTERY_LABEL,');
    expect(s).toContain('stepShoreBattery(this.state, this.p, c, this.rng, feelDt, dt, this.events);');
    expect(s).not.toMatch(/this\.state\.\w+\s*=(?!=)/);
  });
  it('触った・作った src は 300 行以下（pt-squadron は 300 のまま）', () => {
    for (const f of ['src/systems/spark-fx.ts', 'src/systems/blast-fx.ts', 'src/systems/sink-fx.ts', 'src/systems/fx-bus.ts', 'src/systems/fire-fx.ts', 'src/systems/explosion-fx.ts', 'src/systems/world-art.ts', 'src/systems/shore-battery.ts', 'src/systems/splash-pool.ts', 'src/assets/blast-shape.ts', 'src/assets/battery-shape.ts', 'src/assets/battery-art.ts', 'src/assets/fx-art.ts', 'src/config/blast-art-config.ts', 'src/config/fx-art-config.ts', 'src/systems/pt-squadron.ts']) expect(lines(f), f).toBeLessThanOrEqual(300);
  });
});
