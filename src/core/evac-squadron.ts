// 空襲下の退避（v0.6.11。jp_03「運天港・空襲下の退避」。spec-v0611-r2 §3.2・§3.6）の隊の記録: 18 隻（6 隊 × 3）の運動・被害・段階・隠れ場所の枠・
// 隊長艇（浮いている艇のうち番号が最小）・残存と、小さな読み書き（輪・枠・止める点・機関）。確保は createEvacSquadron だけ（起動時に 1 回）。
// Phaser 非依存。乱数は生成の時の離岸 6 回（seed+30 の系列。呼び手が渡す）だけ。毎ステップの関数は確保しない。
// 分け方（1 ファイル 300 行の内）: 航跡・僚艇・操作していない隊は core/evac-follow、隠れ場所の段（入る・上げる・出る・見つかる）と交代・僚艇の沈没は core/evac-shelter、
// 座席・［切替］・スティックの latch・沈没の振り替え・被弾は core/evac-seat、1 ステップの順（spec §8 の段 3）は core/evac-boats。
import type { BoatParams, BoatState, SeaBounds, SpeedStep } from './boat-motion';
import type { CrewEffects, CrewParams } from './crew';
import { G_HIDDEN, G_MOORED, SW_FREE } from './evac-data';
import type { EvacParams } from './evac-params';
import { createDamageState, type DamageParams, type DamageState } from './gunnery';
import type { SeededRng } from './rng';
import { degToRad } from './units';

/** 1 隻の記録。隊長艇は全部の状態（HP・火災・機関・乗員の倍率）を持ち、僚艇は HP だけ使う（火災・機関の乱数を引かない） */
export interface EvacBoat {
  /** 0〜17（隊 × group_size ＋ 番号） */
  readonly index: number;
  readonly group: number;
  /** 隊の中の番号（0・1・2。浮いている最小の番号が隊長艇） */
  readonly slot: number;
  readonly state: BoatState;
  readonly damage: DamageState;
  /** 艇ごとの写し（機関損傷で最高速・巡航を下げ、操作していない隊長艇は乗員の倍率を旋回・加速に掛ける） */
  readonly params: BoatParams;
  /** 速力帯（隊長艇の記録は毎ステップ nextSpeedBand。座席へは代入だけ。r2 L17） */
  band: SpeedStep;
  sunk: boolean;
  /** 沈んだ実秒（沈んでいなければ NaN。沈む絵の秒） */
  sunkAtS: number;
  /** 壕に上げ終えた（爆弾にも巻き添えにも当たらない） */
  up: boolean;
}

/** 1 つの隊（3 隻）。段階は隊ごと（艇ごとではない。M5） */
export interface EvacGroup {
  readonly index: number;
  readonly boats: readonly EvacBoat[];
  /** G_*（core/evac-data） */
  phase: number;
  /** 隊長艇の番号（全滅で −1） */
  leader: number;
  /** 取った隠れ場所の番号と枠（無ければ −1・0） */
  shelter: number;
  slotsHeld: number;
  /** レールで上げている艇の番号（−1）と残りの実秒 */
  hauling: number;
  haulLeftS: number;
  /** 止めた隊長艇の点と針路（G_HAULING・G_HIDDEN の間、座席をここへ戻す。r2 L14） */
  holdX: number;
  holdY: number;
  holdHeadingDeg: number;
  /** その波で見つかった陰（隊長艇がその輪の外へ出るまで入れない。r2 M14。−1）と、操作していない隊が陰を出るまでの実秒 */
  foundCover: number;
  foundLeftS: number;
  /** 出た・下ろした後、隊長艇が hide_max を超えるまで入らない（入口の点は輪の中なので、出た同じステップに入り直さない） */
  launched: boolean;
  /** 操作していない停泊の隊が岸を離れる実秒（生成の時に seed+30 から） */
  castOffS: number;
  /** AI の最後の指令（操作していない隊の針路・速さ。引き継いだ時の latch も使う。r2 M3） */
  aiHeadingDeg: number;
  aiSpeed01: number;
  /** 爆撃から逃げる転舵の残りの実秒（この間は pick を引くが使わない） */
  dodgeLeftS: number;
  /** 隊長艇の航跡の輪（r2 M4。点と、1 つ前の点からの区間の長さ。起動時に確保） */
  readonly trailX: Float64Array;
  readonly trailY: Float64Array;
  readonly trailSeg: Float64Array;
  trailHead: number;
  trailCount: number;
}

/** 隊を組む値（世界は WorldSetup から、模擬も同じ）。boat は T-38 の無傷の値（写して使う＝setup は書き換えない） */
export interface EvacSquadronConfig {
  p: EvacParams;
  boat: BoatParams;
  damage: DamageParams;
  crew: CrewParams;
  crewEffects: CrewEffects;
  bounds: SeaBounds;
  boundsMarginM: number;
  /** 決着の実秒（操作していない隊の pick はこの秒より前の境だけ引く） */
  durationS: number;
}

export interface EvacSquadron {
  readonly cfg: EvacSquadronConfig;
  readonly p: EvacParams;
  readonly groups: readonly EvacGroup[];
  readonly boats: readonly EvacBoat[];
  /** 隠れ場所ごとに取られた枠 */
  readonly shelterUsed: Int32Array;
  /** 隊ごとの「狙われている」（spec §3.5 の定義。S2 の狙いが毎ステップ書く。乱数なし） */
  readonly targeted: Uint8Array;
  /** ［切替］の並び（押した瞬間に作る。固定長＝隊の数） */
  readonly order: Int32Array;
  orderLen: number;
  /** 操作中の隊（座席＝その隊長艇） */
  control: number;
  /** スティックの latch（SW_*。r2 M3）と、今のフレームでスティックがデッドゾーンの外か */
  latch: number;
  stickOut: boolean;
  /** 決着（240 秒）の後（残存は確定・切替なし・枠を数えない） */
  settled: boolean;
  /**
   * 全艇が隠れて敵機が誰も捕まえられなくなった時計の秒（v0.6.11 IP1 の U8。core/evac-early。まだなら NaN）。次のステップで 240 秒を待たずに決着する
   * （夜明けのラッチも同じステップ＝世界の WorldDawn と模擬が evacSettleDue で読む）
   */
  earlyS: number;
  /** 次の pick の時計の秒（dawnReached と同じ形。r2 M13） */
  nextPickS: number;
  /** HUD の札（EVAC_HINT_*）とその隠れ場所（毎ステップ書き直す） */
  hint: number;
  hintShelter: number;
  /** telemetry: ［切替］・隊長艇の交代・全滅の後の自動の切替の回数 */
  switches: number;
  promotions: number;
  autoSwitches: number;
}

/** HUD の札: なし・満杯（空き枠が隊の隻数より少ない）・見つかった陰（輪の外へ出るまで入れない） */
export const EVAC_HINT_NONE = 0;
export const EVAC_HINT_FULL = 1;
export const EVAC_HINT_FOUND = 2;

/** 縦列の k 隻目（0＝先頭）の点を out に書く: 艇首 headingDeg の艇尾の方向へ k × gap（x 東・y 南・北 0 時計回り） */
export function evacColumnPoint(out: BoatState, x: number, y: number, headingDeg: number, k: number, gapM: number): void {
  const h = degToRad(headingDeg);
  out.x = x - Math.sin(h) * k * gapM;
  out.y = y + Math.cos(h) * k * gapM;
}

/** 18 隻を停泊地の縦列に置いて作る（全隊 G_MOORED・無傷・最初の隊を操作）。離岸の秒を隊の順に aiRng（seed+30）から 1 回ずつ引く（計 6 回） */
export function createEvacSquadron(cfg: EvacSquadronConfig, aiRng: SeededRng): EvacSquadron {
  const p = cfg.p;
  const boats: EvacBoat[] = [];
  const groups: EvacGroup[] = [];
  for (let gi = 0; gi < p.groups.length; gi++) {
    const gp = p.groups[gi]!;
    const gb: EvacBoat[] = [];
    for (let k = 0; k < p.groupSize; k++) {
      const state: BoatState = { x: 0, y: 0, headingDeg: gp.headingDeg, speedMps: 0 };
      evacColumnPoint(state, gp.x, gp.y, gp.headingDeg, k, p.mooredGapM);
      const b: EvacBoat = { index: gi * p.groupSize + k, group: gi, slot: k, state, damage: createDamageState(cfg.damage), params: { ...cfg.boat }, band: 'stop', sunk: false, sunkAtS: NaN, up: false };
      gb.push(b);
      boats.push(b);
    }
    const g: EvacGroup = {
      index: gi, boats: gb, phase: G_MOORED, leader: 0, shelter: -1, slotsHeld: 0, hauling: -1, haulLeftS: 0,
      holdX: gp.x, holdY: gp.y, holdHeadingDeg: gp.headingDeg, foundCover: -1, foundLeftS: 0, launched: false,
      castOffS: p.castOffMinS + (p.castOffMaxS - p.castOffMinS) * aiRng.next(), aiHeadingDeg: gp.headingDeg, aiSpeed01: 0, dodgeLeftS: 0,
      trailX: new Float64Array(p.trailLen), trailY: new Float64Array(p.trailLen), trailSeg: new Float64Array(p.trailLen), trailHead: 0, trailCount: 0,
    };
    evacTrailReset(g, p.trailStepM);
    groups.push(g);
  }
  return {
    cfg, p, groups, boats, shelterUsed: new Int32Array(p.shelters.length), targeted: new Uint8Array(groups.length), order: new Int32Array(groups.length), orderLen: 0,
    control: p.startGroup, latch: SW_FREE, stickOut: false, settled: false, earlyS: NaN, nextPickS: p.pickS, hint: EVAC_HINT_NONE, hintShelter: -1, switches: 0, promotions: 0, autoSwitches: 0,
  };
}

/** 航跡の輪を隊長艇の艇尾方向の直線で満たし直す（停泊・隊長艇の交代・壕や陰から出た時。旧隊長艇の跡を新しい隊長艇が逆にたどらない。r2 M4） */
export function evacTrailReset(g: EvacGroup, stepM: number): void {
  if (g.leader < 0) return;
  const lead = g.boats[g.leader]!.state;
  const n = g.trailX.length;
  const h = degToRad(lead.headingDeg);
  const ax = -Math.sin(h);
  const ay = Math.cos(h);
  for (let i = 0; i < n; i++) {
    const d = (n - 1 - i) * stepM;
    g.trailX[i] = lead.x + ax * d;
    g.trailY[i] = lead.y + ay * d;
    g.trailSeg[i] = stepM;
  }
  g.trailHead = n - 1;
  g.trailCount = n;
}

/** 隊長艇の記録（全滅なら null） */
export function evacLeader(g: EvacGroup): EvacBoat | null {
  return g.leader >= 0 ? g.boats[g.leader]! : null;
}

/** 隊の浮いている隻数 */
export function evacAfloat(g: EvacGroup): number {
  let n = 0;
  for (let i = 0; i < g.boats.length; i++) if (!g.boats[i]!.sunk) n++;
  return n;
}

/** 残存（座席の艇＝操作中の隊長艇を含む 18 中。r1 L2） */
export function evacSurvivors(sq: EvacSquadron): number {
  let n = 0;
  for (let i = 0; i < sq.boats.length; i++) if (!sq.boats[i]!.sunk) n++;
  return n;
}

/** 爆弾・巻き添えの的になる艇か: 浮いていて、上げ終えておらず、隊が隠れていない（隠れるのは隊ごと＝入っている途中の艇は見えている。H2） */
export function evacExposed(sq: EvacSquadron, b: EvacBoat): boolean {
  return !b.sunk && !b.up && sq.groups[b.group]!.phase !== G_HIDDEN;
}

/** 点が隠れ場所 s の輪の中か（輪の縁ちょうどは中。2 乗の距離） */
export function evacInRing(sq: EvacSquadron, s: number, x: number, y: number): boolean {
  const sh = sq.p.shelters[s];
  if (!sh) return false;
  const dx = x - sh.x;
  const dy = y - sh.y;
  return dx * dx + dy * dy <= sq.p.shelterRingM * sq.p.shelterRingM;
}

/** 点のある隠れ場所の輪（無ければ −1。輪は重ならない＝V-E3） */
export function evacShelterAt(sq: EvacSquadron, x: number, y: number): number {
  for (let s = 0; s < sq.p.shelters.length; s++) if (evacInRing(sq, s, x, y)) return s;
  return -1;
}

/** 機関の状態を最高速・巡航に写す（基準 × engine_damage_speed_factor。巡航は最高速で頭打ち＝systems/boat-damage の命中と同じ式） */
export function evacSyncEngine(sq: EvacSquadron, params: BoatParams, engineDamaged: boolean): void {
  const base = sq.cfg.boat;
  params.speedMaxMps = engineDamaged ? base.speedMaxMps * sq.cfg.damage.engineSpeedFactor : base.speedMaxMps;
  params.speedCruiseMps = base.speedCruiseMps > params.speedMaxMps ? params.speedMaxMps : base.speedCruiseMps;
}

/** 隊長艇の今の点と針路を止める点にする（速さ 0） */
export function evacSetHold(g: EvacGroup): void {
  const lead = evacLeader(g);
  if (!lead) return;
  g.holdX = lead.state.x;
  g.holdY = lead.state.y;
  g.holdHeadingDeg = lead.state.headingDeg;
  lead.state.speedMps = 0;
}

/** 取った枠を返す（隠れ場所を離れる・全滅） */
export function evacReleaseShelter(sq: EvacSquadron, g: EvacGroup): void {
  if (g.shelter >= 0) sq.shelterUsed[g.shelter] = sq.shelterUsed[g.shelter]! - g.slotsHeld;
  g.shelter = -1;
  g.slotsHeld = 0;
  g.hauling = -1;
}

/** 取った枠を浮いている隻数に取り直す（艇が沈んだ時。余りを返す。r2 M12 (b)） */
export function evacReslot(sq: EvacSquadron, g: EvacGroup): void {
  if (g.shelter < 0) return;
  const n = evacAfloat(g);
  sq.shelterUsed[g.shelter] = sq.shelterUsed[g.shelter]! + n - g.slotsHeld;
  g.slotsHeld = n;
}
