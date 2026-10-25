// 隼艇（H-38）の僚艇の AI（v0.6.6「日本ハードモード⑤：隼艇」。jp_01 のハードだけ。docs/02 §6.4、spec-v066 §C.3）: 自艇の針路の後ろ・右舷の定位置に付き、守りの砲だけ撃つ
// （大発か隼艇が攻撃されているとき・追撃の PT。どちらも fire_m 以内の最寄りの戦う PT）。決着（大発がみな上陸か沈没）の後は的でなくなり撃たない: 上陸した大発があれば浜
// （先頭の上陸地点の沖）へ向かって止まり、全滅ならその場で止まる。赤い線はかわさない。被弾は HP だけ（乱数なし）。
// 1 固定ステップに 1 回、輸送隊の段の直後に stepGunboat（判断 → 運動 → 帯 → valid）。砲（seed+22）・米PT の見つかる距離（target_range_factor）・着弾の振り分けは呼ぶ側（模擬・世界）。
// 試作（scratchpad の wing-sim。repo に無い）の follow・reactive2・decoy・stay・rDiv 2・dodge なしで測った形。Phaser 非依存・乱数を引かない・毎ステップ確保しない・
// atan2 は 1 ステップ 1 回まで・平方根はテレメトリの 1 回だけ。data の読み出しと検査は core/gunboat-data・config/gunboat-mission-data。
import { clampToBounds, nextSpeedBand, stepBoat, type BoatInput, type BoatParams, type BoatState, type SeaBounds, type SpeedStep } from './boat-motion';
import { CV_SAILING, convoyResolved, type ConvoyParams, type ConvoyState } from './convoy';
import type { GunBatteryParams } from './gun-battery';
import { insideRing, type ReturnPoint } from './mission-flow';
import { PT_CHASE, ptFighting, type PtSection } from './pt-boats';
import { broadsideDeg } from './pt-sim-policy';
import { bearingDeg } from './ship-ai';
import { degToRad } from './units';

/** 隼艇の値（missions_seed の v0_1_prototype.hard.gunboat の 12 鍵と boats.json の艇。WorldSetup.gunboat） */
export interface GunboatParams {
  /** boats.json の艇の id（世界の絵）・名前（ラベル「隼艇」） */
  boatId: string;
  labelJa: string;
  /** 運動（boatParamsFromData）・HP（hull_hp）・砲（gun_battery。弾倉付き）・当たりの半長・半幅 m（hit_scale 込み）・海域の縁の余白 m（絵の半長） */
  boat: BoatParams;
  hullHp: number;
  gun: GunBatteryParams;
  halfLengthM: number; halfBeamM: number; boundsMarginM: number;
  /** 定位置: 自艇の針路で後ろへ m・右舷へ m（右が正）、ここより近ければ大発の速さで寄る m、ここより近ければ輸送隊の針路に揃える m */
  stationAsternM: number; stationAbeamM: number; stationSlowM: number; headingDeadbandM: number;
  /** 撃っていない間に最寄りの航行中の大発からこれより遠ければ定位置へ戻る m・撃つ距離 m・撃つ間の速さ（game m/s。静音の上限まで） */
  rejoinM: number; fireM: number; engageMps: number;
  /** 決着の後の浜の点: 先頭の上陸地点の浜の線から沖へ m・止まる距離 m */
  beachStandoffM: number; beachArriveM: number;
  /** 米PT が隼艇の見つかる距離に掛ける倍率（0 < f ≤ 1。呼ぶ側が標的の detectM に掛ける。撃ったステップの閃光には掛けない） */
  targetRangeFactor: number;
  /** 候補（S3 の模擬の上書きだけ。data の鍵は無い＝無ければ使わない）: 追い付き（脅威が無く定位置からこれより遠ければ巡航で戻る m）・定位置の内の速さを自艇の速さまでに抑える */
  catchupM?: number; slowToPlayer?: boolean;
}

export interface GunboatState {
  boat: BoatState;
  /** 判断の結果（stepBoat に渡す入力）・速力帯・今の定位置 */
  input: BoatInput;
  band: SpeedStep;
  stationX: number; stationY: number;
  /** HP・受けた命中・沈んだ・その体感秒（NaN は無し） */
  hp: number; hitsTaken: number; sunk: boolean; sunkS: number;
  /** 帰投の輪の中・決着の後（ラッチ）・浜へ向かうか浜にいる（決着の後で上陸した大発がある）・浜の点に着いた（ラッチ） */
  home: boolean; resolved: boolean; toBeach: boolean; atBeach: boolean;
  /** 的になる（沈んでいない・輪の外・決着の前）。呼ぶ側が標的スロットの船体の valid へ写す */
  valid: boolean;
  /** 守りの砲（このステップの射撃ボタン）・脅威の PT（自艇の視程の内の最寄りの戦う PT。−1 は無し） */
  held: boolean; threat: number;
}

/** 判断の材料（1 夜・1 出撃に 1 個だけ作る。中身の state は呼ぶ側のもの）: 自艇・輸送隊（今夜の揺らぎ込みの値）・米PT の隊・帰投の輪・海域・自艇の視程の二乗 */
export interface GunboatCtx {
  player: BoatState;
  convoy: ConvoyState;
  convoyParams: ConvoyParams;
  pts: PtSection;
  ring: ReturnPoint;
  bounds: SeaBounds;
  visRange2: number;
}

/** 出撃時に 1 回: 自艇の出発点からの定位置に停止で置く（今夜の乱数を引かない。jp_01 は (1200, 2400) 東向き → (1050, 2520)） */
export function createGunboat(p: GunboatParams, start: { x: number; y: number; headingDeg: number }): GunboatState {
  const g: GunboatState = {
    boat: { x: start.x, y: start.y, headingDeg: start.headingDeg, speedMps: 0 }, input: { headingDeg: NaN, speed01: 0 }, band: 'stop', stationX: start.x, stationY: start.y,
    hp: p.hullHp, hitsTaken: 0, sunk: false, sunkS: NaN, home: false, resolved: false, toBeach: false, atBeach: false, valid: true, held: false, threat: -1,
  };
  writeStation(g, p, start.x, start.y, start.headingDeg);
  g.boat.x = g.stationX;
  g.boat.y = g.stationY;
  return g;
}

/** 1 固定ステップ（輸送隊の段の直後。dt は game 秒＝time_scale 込み）: 判断 → stepBoat → 縁 → 輪 → 帯 → valid。ptTarget は米PT の隊の今の標的（0 = 自艇）、playerSinking は自艇が沈み始めた */
export function stepGunboat(g: GunboatState, p: GunboatParams, c: GunboatCtx, ptTarget: number, playerSinking: boolean, dt: number): void {
  if (g.sunk || playerSinking) stopGunboat(g);
  else if (g.resolved || convoyResolved(c.convoy)) afterResolved(g, p, c);
  else follow(g, p, c, ptTarget);
  stepBoat(g.boat, g.input, p.boat, dt);
  clampToBounds(g.boat, c.bounds, p.boundsMarginM);
  g.home = insideRing(c.ring, g.boat.x, g.boat.y);
  g.band = nextSpeedBand(g.band, g.boat.speedMps, p.boat);
  g.valid = !g.sunk && !g.home && !g.resolved;
}

/** 守りの砲の規則（spec-v066 §C.3-3）: 脅威が fire_m 以内で、隊が攻撃中で標的が自艇でない（大発か隼艇）か、その PT が追撃中。自艇だけが狙われている航過には撃たない */
export function gunboatHeld(q: PtSection, threat: number, threatD2: number, fireM: number, ptTarget: number): boolean {
  if (threat < 0 || threatD2 > fireM * fireM) return false;
  return (q.owner >= 0 && ptTarget !== 0) || q.boats[threat]!.phase === PT_CHASE;
}

/** 決着の前: 定位置へ付き、脅威が fire_m 以内なら舷側を向けて撃つ（速さは静音の上限まで）。撃っていない間に大発から rejoin_m より遠ければ定位置へ戻る。atan2 は 1 回まで */
function follow(g: GunboatState, p: GunboatParams, c: GunboatCtx, ptTarget: number): void {
  const b = g.boat;
  writeStation(g, p, c.player.x, c.player.y, c.player.headingDeg);
  const q = c.pts;
  let pi = -1;
  let pd = Infinity;
  for (let i = 0; i < q.boats.length; i++) {
    const t = q.boats[i]!;
    if (!ptFighting(t.phase)) continue;
    const d2 = (t.x - b.x) * (t.x - b.x) + (t.y - b.y) * (t.y - b.y);
    if (d2 <= c.visRange2 && d2 < pd) {
      pd = d2;
      pi = i;
    }
  }
  g.threat = pi;
  g.held = gunboatHeld(q, pi, pd, p.fireM, ptTarget);
  const silent = p.boat.silentMaxMps;
  const sdx = g.stationX - b.x;
  const sdy = g.stationY - b.y;
  const s2 = sdx * sdx + sdy * sdy;
  if (pi < 0 && p.catchupM !== undefined && s2 > p.catchupM * p.catchupM) setInput(g, p, bearingDeg(b.x, b.y, g.stationX, g.stationY), p.boat.speedCruiseMps);
  else if (!g.held && nearestSailing2(c.convoy, b.x, b.y) > p.rejoinM * p.rejoinM) setInput(g, p, bearingDeg(b.x, b.y, g.stationX, g.stationY), silent);
  else if (pi >= 0 && pd <= p.fireM * p.fireM) setInput(g, p, broadsideDeg(b, q.boats[pi]!.x, q.boats[pi]!.y), Math.min(silent, p.engageMps));
  else if (pi >= 0 || s2 > p.stationSlowM * p.stationSlowM) setInput(g, p, bearingDeg(b.x, b.y, g.stationX, g.stationY), silent);
  else setInput(g, p, s2 > p.headingDeadbandM * p.headingDeadbandM ? bearingDeg(b.x, b.y, g.stationX, g.stationY) : c.convoyParams.headingDeg, Math.min(silent, p.slowToPlayer ? Math.min(c.convoyParams.speedMps, c.player.speedMps) : c.convoyParams.speedMps));
}

/** 決着の後（ラッチ）: 的でなく撃たない。上陸した大発があれば浜の点（先頭の上陸地点の x・浜の線から beach_standoff_m 沖）へ巡航で向かい beach_arrive_m の内で止まる。全滅ならその場で止まる */
function afterResolved(g: GunboatState, p: GunboatParams, c: GunboatCtx): void {
  g.resolved = true;
  g.held = false;
  g.threat = -1;
  const beach = c.convoyParams.beach;
  g.toBeach = c.convoy.arrived > 0 && beach !== undefined;
  if (g.toBeach && !g.atBeach && beach !== undefined) {
    const bx = beach.x[0]!;
    const by = beach.y - p.beachStandoffM;
    const dx = bx - g.boat.x;
    const dy = by - g.boat.y;
    if (dx * dx + dy * dy > p.beachArriveM * p.beachArriveM) {
      setInput(g, p, bearingDeg(g.boat.x, g.boat.y, bx, by), p.boat.speedCruiseMps);
      return;
    }
    g.atBeach = true;
  }
  stopGunboat(g);
}

/** 止まる（針路を保つ・速さ 0）・撃たない */
function stopGunboat(g: GunboatState): void {
  g.input.headingDeg = NaN;
  g.input.speed01 = 0;
  g.held = false;
  g.threat = -1;
}

function setInput(g: GunboatState, p: GunboatParams, headingDeg: number, wantMps: number): void {
  g.input.headingDeg = headingDeg;
  g.input.speed01 = wantMps > 0 ? Math.min(1, wantMps / p.boat.speedMaxMps) : 0;
}

/** 定位置 = 自艇の位置から針路で後ろへ station_astern_m・右舷へ station_abeam_m（試作の式: sx = x − sin(h)·後ろ + cos(h)·右舷、sy = y + cos(h)·後ろ + sin(h)·右舷） */
function writeStation(g: GunboatState, p: GunboatParams, x: number, y: number, headingDeg: number): void {
  const h = degToRad(headingDeg);
  const sn = Math.sin(h), cs = Math.cos(h);
  g.stationX = x - sn * p.stationAsternM + cs * p.stationAbeamM;
  g.stationY = y + cs * p.stationAsternM + sn * p.stationAbeamM;
}

/** 最寄りの航行中の大発までの距離の二乗（無ければ Infinity） */
function nearestSailing2(f: ConvoyState, x: number, y: number): number {
  let best = Infinity;
  for (let i = 0; i < f.barges.length; i++) {
    const b = f.barges[i]!;
    if (b.phase !== CV_SAILING) continue;
    const d2 = (b.x - x) * (b.x - x) + (b.y - y) * (b.y - y);
    if (d2 < best) best = d2;
  }
  return best;
}

/** PT の弾の 1 命中（damage は PT の砲の damage）: HP だけ（乱数を引かない。hitConvoyBarge と同じ作法）。HP が尽きた命中で沈没（止まる・的でなくなる）＝true。沈んだ後は当たらない（false） */
export function hitGunboat(g: GunboatState, damage: number, nowS: number): boolean {
  if (g.sunk) return false;
  g.hitsTaken++;
  g.hp -= damage;
  if (g.hp > 0) return false;
  g.hp = 0;
  g.sunk = true;
  g.sunkS = nowS;
  g.valid = false;
  stopGunboat(g);
  return true;
}

/** HUD に渡す隼艇の状態（世界が毎フレーム中身だけ書く。隼艇の無い任務は enabled false のまま。core/convoy の ConvoyTelemetry と同じ形） */
export interface GunboatTelemetry {
  enabled: boolean;
  /** 自艇から隼艇へ m とその距離 m（行の方角・画面の外の矢印。平方根は 1 フレーム 1 回） */
  dx: number; dy: number; distM: number;
  /** HP・最大・受けた命中、沈んだ・決着の後・浜へ向かうか浜にいる・守りの砲を撃っている、名（data の label_ja。画面の外の矢印「隼艇 N m」） */
  hp: number; maxHp: number; hitsTaken: number; sunk: boolean; resolved: boolean; toBeach: boolean; held: boolean; labelJa: string;
}

export function createGunboatTelemetry(): GunboatTelemetry {
  return { enabled: false, dx: NaN, dy: NaN, distM: NaN, hp: 0, maxHp: 0, hitsTaken: 0, sunk: false, resolved: false, toBeach: false, held: false, labelJa: '' };
}

/** テレメトリへ写す（確保しない。平方根 1 回） */
export function writeGunboatTelemetry(t: GunboatTelemetry, g: GunboatState, p: GunboatParams, player: BoatState): void {
  t.enabled = true;
  t.dx = g.boat.x - player.x;
  t.dy = g.boat.y - player.y;
  t.distM = Math.sqrt(t.dx * t.dx + t.dy * t.dy);
  t.hp = g.hp; t.maxHp = p.hullHp; t.hitsTaken = g.hitsTaken;
  t.sunk = g.sunk; t.resolved = g.resolved; t.toBeach = g.toBeach; t.held = g.held; t.labelJa = p.labelJa;
}
