// v0.7.1 S3（アートと音②：合成の効果音。spec-v0710 §5・§6.3・D2・D5）: ループ 5 本（engine・sea・fire・rain・drone）の目標（音量・rate）を、HUD のテレメトリから決める純粋な観測器。
// 読むだけ（テレメトリにも世界にも書かない）・乱数なし・確保しない（作るのは createSfxLoopState・createSfxLoopTargets の 1 回）。毎フレーム 1 回、HudScene から
// systems/sfx-mission が呼ぶ（テレメトリは Mission が同じフレームに書き終えている）。目標をノードへ書くのは systems/sfx-loop-player（10 Hz・変わった時だけ）。値は config/sfx-config（聞かせ方）。
// 漏らさない規則（D5）: 機の爆音 drone は、HUD が既に文・予告・矢印で機を知らせている段だけ鳴らす（見つける前の哨戒 SP_PATROL・レーダーの前の PA_HUNT・中断で去る機は 0）。
// - engine: 速力帯（停止・静音・巡航・全速）で音量、速さ ÷ 艇の最大で rate。機関の損傷と機関の不調（jp_05 の WARN・FINAL・LIMP）は rate を 3 Hz で揺らす。燃料切れと沈没は 0。
// - sea: 速さで大きく、暴風の帯の中はさらに。 fire: 火災の間（立ち上がり 0.3 秒・戻り 0.5 秒。始めのフレームは火災つきの出撃ならすぐその音量）。 rain: 暴風の帯の中・近く。
// - drone: 水上機・味方機・夜明けの空襲・夜の哨戒機と出撃・港の空襲（jp_03）の出どころの最大。距離の帯は単発と同じ SFX_BAND_MAX_M。
//   jp_03（EvacTelemetry に「飛んでいる編隊」の欄は無い）: 狙われている隊のビット targetedMask（予告から、編隊が飛んでいる間＝HUD の矢印と同じ定義）と予告の行 annKind で決める。
//   決着の後の敵機 4 機は夜明けの空襲（dawn.threat）の側で鳴る。狙いを見失って引き返す編隊は鳴らない（既知の制約）。
import { SFX_BAND_MAX_M, SFX_LOOP_DRONE, SFX_LOOP_ENGINE, SFX_LOOP_FIRE, SFX_LOOP_RAIN, SFX_LOOP_RATE_MAX, SFX_LOOP_RATE_MIN, SFX_LOOP_SEA } from '../config/sfx-config';
import { AS_T_FALLING, AS_T_INBOUND, AS_T_NONE, AS_T_ORBIT, AS_T_REST, AS_T_RUN } from './air-strike-state';
import type { BoatTelemetry } from './boat-telemetry';
import { ENGINE_FINAL, ENGINE_LIMP, ENGINE_WARN } from './engine-trouble';
import { EVA_NONE, EVA_WAVE } from './evac-telemetry';
import { FF_CHALLENGE, FF_LEAVING, FF_STRAFE } from './friendly';
import { PA_LEAVE, PA_ORBIT, PA_PASS } from './patrol-air-state';
import { SP_APPROACH, SP_FLARE_PASS, SP_LEAVING, SP_ORBIT, SP_OUT_BOMBED, SP_OUT_LOST, SP_RUN } from './seaplane';
import { STORM_INSIDE, STORM_NEAR } from './storm';

/** ループの並び（SFX_KEYS のループ 5 本と同じ順。目標の配列の添字） */
export const SFX_LOOP_IDS = ['engine', 'sea', 'fire', 'rain', 'drone'] as const;
export const SFX_LOOP_COUNT = SFX_LOOP_IDS.length;
export const LOOP_ENGINE = 0;
export const LOOP_SEA = 1;
export const LOOP_FIRE = 2;
export const LOOP_RAIN = 3;
export const LOOP_DRONE = 4;

const TAU = Math.PI * 2;

/** 観測器の覚え（任務ごとに 1 つ） */
export interface SfxLoopState {
  /** 艇の最大の速さ m/s（任務の艇の data から 1 回） */
  readonly maxSpeedMps: number;
  /** まだ 1 フレームも見ていない */
  first: boolean;
  /** 揺れの時計（秒。見たフレームの dt の和） */
  clockS: number;
  /** 火の音量の今の値（立ち上がり・戻りの途中） */
  fireGain: number;
}

/** ループの目標（添字は LOOP_*。音量は 0〜1、rate は倍） */
export interface SfxLoopTargets {
  readonly gain: Float64Array;
  readonly rate: Float64Array;
}

export function createSfxLoopState(maxSpeedMps: number): SfxLoopState {
  return { maxSpeedMps, first: true, clockS: 0, fireGain: 0 };
}

export function createSfxLoopTargets(): SfxLoopTargets {
  return { gain: new Float64Array(SFX_LOOP_COUNT), rate: new Float64Array(SFX_LOOP_COUNT).fill(1) };
}

/** 距離 m → 機の爆音の音量（単発と同じ帯の境。近いほど大きい。数でなければ遠い扱い） */
function droneByDistance(distM: number): number {
  const d = SFX_LOOP_DRONE;
  for (let b = 0; b < d.gainByBand.length; b++) if (distM <= SFX_BAND_MAX_M[b]!) return d.gainByBand[b]!;
  return d.gainFar;
}

/** 空襲の段（AS_T_*。夜明けの空襲・夜の出撃）→ 音量。接近は距離の帯、旋回・突入・投下は一番大きく、波の合間は小さく */
function droneByThreat(threat: number, inboundDistM: number): number {
  if (threat === AS_T_NONE) return 0;
  if (threat === AS_T_INBOUND) return droneByDistance(inboundDistM);
  if (threat === AS_T_ORBIT || threat === AS_T_RUN || threat === AS_T_FALLING) return SFX_LOOP_DRONE.gainAttack;
  return threat === AS_T_REST ? SFX_LOOP_DRONE.gainRest : 0;
}

/** 機の爆音の音量（出どころの最大。HUD が機を知らせている段だけ＝D5） */
function droneGain(t: BoatTelemetry): number {
  const d = SFX_LOOP_DRONE;
  let g = 0;
  // 敵の水上機: 接近（発見の前後とも HUD に距離が出る）・照明弾の航過・旋回・爆撃進路・去る（結果の行が出る間だけ＝中断は鳴らさない）
  const sp = t.planePhase;
  if (sp === SP_APPROACH) g = droneByDistance(t.planeDistM);
  else if (sp === SP_FLARE_PASS || sp === SP_ORBIT) g = d.gainNear;
  else if (sp === SP_RUN) g = d.gainAttack;
  else if (sp === SP_LEAVING && (t.planeOutcome === SP_OUT_LOST || t.planeOutcome === SP_OUT_BOMBED)) g = d.gainFriendlyLeaving;
  // 味方機: 識別の要求・掃射・去る
  const ff = t.friendlyPhase;
  const fg = ff === FF_CHALLENGE || ff === FF_STRAFE ? d.gainFriendly : ff === FF_LEAVING ? d.gainFriendlyLeaving : 0;
  if (fg > g) g = fg;
  // 夜明けの空襲（jp_03 の決着の後の敵機もここ）
  const dg = droneByThreat(t.dawn.threat, t.dawn.inboundDistM);
  if (dg > g) g = dg;
  // 夜の哨戒機（jp_02）: 捜索の接近・付近の捜索は距離の帯、去る間（結果の行）は小さく、出撃は空襲と同じ
  const pa = t.patrol;
  if (pa.enabled) {
    const ph = pa.phase;
    let pg = droneByThreat(pa.threat, pa.distM);
    if (ph === PA_PASS || ph === PA_ORBIT) pg = droneByDistance(pa.distM);
    else if (ph === PA_LEAVE && pa.resultKind !== 0) pg = d.gainFriendlyLeaving;
    if (pg > g) g = pg;
  }
  // 港の空襲（jp_03。決着の前）: 操作中の隊を狙う編隊がいれば一番大きく、ほかの隊だけなら中くらい、波の予告だけ（まだ遠い）なら小さく
  const ev = t.evac;
  if (ev.enabled && !ev.settled) {
    let eg = 0;
    if (ev.annKind === EVA_WAVE) eg = d.gainFar;
    else if ((ev.targetedMask & (1 << ev.control)) !== 0) eg = d.gainAttack;
    else if (ev.targetedMask !== 0) eg = d.gainEvacOther;
    else if (ev.annKind !== EVA_NONE) eg = d.gainFar;
    if (eg > g) g = eg;
  }
  return g;
}

/**
 * 毎フレーム 1 回: テレメトリから 5 本の目標を out に書く（dtS はそのフレームの秒）。始めのフレームは火の立ち上がりを待たない（火災つきで出撃する夜はすぐ鳴る）
 */
export function stepSfxLoops(s: SfxLoopState, t: BoatTelemetry, dtS: number, out: SfxLoopTargets): void {
  const gain = out.gain;
  const rate = out.rate;
  s.clockS += dtS;
  const frac = s.maxSpeedMps > 0 ? Math.min(1, Math.max(0, t.speedMps / s.maxSpeedMps)) : 0;
  // engine
  const e = SFX_LOOP_ENGINE;
  const step = t.targetStep;
  const dead = t.fuelEmpty || t.hp <= 0;
  gain[LOOP_ENGINE] = dead ? 0 : step === 'full' ? e.gainFull : step === 'cruise' ? e.gainCruise : step === 'silent' ? e.gainSilent : e.gainStop;
  const stage = t.engine.on ? t.engine.stage : 0;
  let wobble: number = stage === ENGINE_WARN ? e.stageWobble[0] : stage === ENGINE_FINAL ? e.stageWobble[1] : stage === ENGINE_LIMP ? e.stageWobble[2] : 0;
  if (t.engineDamaged && e.damagedWobble > wobble) wobble = e.damagedWobble;
  let r = e.rateBase + e.rateSpan * frac;
  // 止まったエンジン（音量 0）は揺らさない（聞こえない rate を 10 Hz で書き続けない）
  if (wobble > 0 && !dead) r *= 1 + wobble * Math.sin(TAU * e.wobbleHz * s.clockS);
  rate[LOOP_ENGINE] = r < SFX_LOOP_RATE_MIN ? SFX_LOOP_RATE_MIN : r > SFX_LOOP_RATE_MAX ? SFX_LOOP_RATE_MAX : r;
  // sea
  const inside = t.stormState === STORM_INSIDE;
  gain[LOOP_SEA] = SFX_LOOP_SEA.gainBase + SFX_LOOP_SEA.gainSpeed * frac + (inside ? SFX_LOOP_SEA.gainStorm : 0);
  // fire（立ち上がり・戻りは音量 ÷ 秒の速さで動かす）
  const f = SFX_LOOP_FIRE;
  const want = t.onFire ? f.gain : 0;
  if (s.first) s.fireGain = want;
  else if (s.fireGain < want) s.fireGain = Math.min(want, s.fireGain + (f.gain / f.riseS) * dtS);
  else if (s.fireGain > want) s.fireGain = Math.max(want, s.fireGain - (f.gain / f.fallS) * dtS);
  gain[LOOP_FIRE] = s.fireGain;
  // rain
  gain[LOOP_RAIN] = inside ? SFX_LOOP_RAIN.gainInside : t.stormState === STORM_NEAR ? SFX_LOOP_RAIN.gainNear : 0;
  // drone（rate は音量に比例: 近い・突っ込んでくるほど高い）
  const d = SFX_LOOP_DRONE;
  const dg = droneGain(t);
  gain[LOOP_DRONE] = dg;
  rate[LOOP_DRONE] = d.rateMin + (d.rateMax - d.rateMin) * Math.min(1, dg / d.gainAttack);
  s.first = false;
}
