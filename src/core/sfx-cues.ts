// v0.7.1 S4（アートと音②：合成の効果音。spec-v0710 §3.2・§6.3・D2・D5）: 状態の合図を、HUD のテレメトリの立ち上がり・通し番号の変化から決める純粋な観測器。
// 読むだけ（テレメトリにも世界にも書かない）・乱数なし・確保しない（作るのは createSfxCueState の 1 回）。毎フレーム 1 回、HudScene から systems/sfx-mission が呼ぶ
// （テレメトリは Mission が同じフレームに書き終えている）。鳴らすのは渡された口 sink の cue だけ（鍵・音量・速さ・遅らせる秒）。冷却はゲームの時計（見たフレームの dt の和＝
// 一時停止の間は進まない）。値は config/sfx-config の SFX_CUE（聞かせ方）。
// - 始めのフレームは前の値を写すだけで鳴らさない（火災つき・燃料切れで始まる夜に「火が付いた」を鳴らさない）。
// - jp_03 の［切替］（evac.seatSeq が変わった）のフレームは、座席の艇ごとの値（HP・火災・機関・煙幕・燃料・浅瀬）を写すだけ（ほかの隊長艇へ移った差を「被弾」と読まない）。
// - 漏らさない規則（D5）: どの行も HUD が既に文・色・帯で出している状態（発見・照らされている・星弾・被弾の HP・火災・煙幕・弾倉交換・機関・燃料・座礁・帰投せよ・夜明け・
//   爆弾の落下・空襲の予告・［切替］・米PT の雷撃の報告・揚陸完了・味方機の識別）。撃墜・撃沈・沈没・被雷の爆発は絵の層の口が鳴らすので、ここでは重ねない（§3.1）。
// - spec §3.2 の表に足した 1 行（設計の既定）: jp_03 で操作中の隊を狙う爆弾が落下中（evac.falling。HUD の 2 行目「爆弾！」）も bomb_fall。
import { SFX_CUE, type SfxKey } from '../config/sfx-config';
import { AS_T_FALLING } from './air-strike-state';
import type { BoatTelemetry } from './boat-telemetry';
import { ENGINE_EV_FINAL, ENGINE_EV_LIMP, ENGINE_EV_RECOVER, ENGINE_EV_WARN } from './engine-trouble';
import { FF_CHALLENGE, FF_OUT_IDENTIFIED } from './friendly';
import { LE_CALM, LE_DONE, LE_HURRIED, LE_LIT_SALVO } from './landing';
import { SHALLOW_GROUNDED } from './shallows';

/** 合図の口（systems/sfx-mission が満たす。gain は音量の倍率・rate は速さ・delayS は遅らせる秒） */
export interface SfxCueSink {
  cue(key: SfxKey, gain: number, rate: number, delayS: number): void;
}

/** 冷却の欄（SfxCueState.cool の添字） */
const CD_LAUNCH = 0;
const CD_ALARM = 1;
const CD_LIGHT = 2;
const CD_FLARE = 3;
const CD_HULL = 4;
const CD_RELOAD = 5;
const CD_BELL = 6;
const CD_BOMB = 7;
const CD_RAID = 8;
const CD_COUGH = 9;
const CD_COUNT = 10;

/** 観測器の覚え（任務ごとに 1 つ）: 前のフレームの値と冷却の残り秒 */
export interface SfxCueState {
  first: boolean;
  readonly cool: Float64Array;
  /** 鳴らす前の魚雷の発射（一斉は 1 本ずつ） */
  launchQueue: number;
  aboard: number;
  detected: boolean;
  lit: boolean;
  starLit: boolean;
  planeFlare: boolean;
  ffIdentified: boolean;
  ffChallenge: boolean;
  lastHp: number;
  onFire: boolean;
  smoking: boolean;
  reloading: boolean;
  engineDamaged: boolean;
  engineSeq: number;
  fuelEmpty: boolean;
  grounded: boolean;
  called: boolean;
  dawn: boolean;
  bombAir: boolean;
  dawnFalling: boolean;
  patrolFalling: boolean;
  evacFalling: boolean;
  annSeq: number;
  seatSeq: number;
  landingSeq: number;
}

export function createSfxCueState(): SfxCueState {
  return {
    first: true, cool: new Float64Array(CD_COUNT), launchQueue: 0, aboard: 0, detected: false, lit: false, starLit: false, planeFlare: false, ffIdentified: false, ffChallenge: false,
    lastHp: 0, onFire: false, smoking: false, reloading: false, engineDamaged: false, engineSeq: 0, fuelEmpty: false, grounded: false, called: false, dawn: false,
    bombAir: false, dawnFalling: false, patrolFalling: false, evacFalling: false, annSeq: 0, seatSeq: 0, landingSeq: 0,
  };
}

/** 冷却が空いていれば coolS を入れて true（立ち上がりは冷却の内なら捨てる＝溜めない） */
function take(s: SfxCueState, slot: number, coolS: number): boolean {
  if (s.cool[slot]! > 0) return false;
  s.cool[slot] = coolS;
  return true;
}

/** 冷却の内でも鳴らす知らせ（段が上がった・壊れた）: 鳴らして冷却を入れ直す */
function force(s: SfxCueState, slot: number, coolS: number): true {
  s.cool[slot] = coolS;
  return true;
}

/** 座席の艇ごとの値を写す（始めのフレームと jp_03 の［切替］のフレーム） */
function copyBoat(s: SfxCueState, t: BoatTelemetry): void {
  s.lastHp = t.hp;
  s.onFire = t.onFire;
  s.smoking = t.smokeLeftS > 0;
  s.engineDamaged = t.engineDamaged;
  s.fuelEmpty = t.fuelEmpty;
  s.grounded = t.shallowState === SHALLOW_GROUNDED;
}

/** 前の値を全部写す（始めのフレーム。鳴らさない） */
function copyAll(s: SfxCueState, t: BoatTelemetry): void {
  copyBoat(s, t);
  s.aboard = t.arms.torpedoesAboard;
  s.detected = t.playerDetected;
  s.lit = t.illuminated;
  s.starLit = t.starLit;
  s.planeFlare = t.planeFlareOn;
  s.ffIdentified = t.friendlyOutcome === FF_OUT_IDENTIFIED;
  s.ffChallenge = t.friendlyPhase === FF_CHALLENGE;
  s.reloading = t.arms.reloadN > 0 || t.gunReloadLeftS > 0;
  s.engineSeq = t.engine.eventSeq;
  s.called = t.callFlags !== 0;
  s.dawn = t.dawn.reached;
  s.bombAir = t.planeBombAir;
  s.dawnFalling = t.dawn.threat === AS_T_FALLING;
  s.patrolFalling = t.patrol.enabled && t.patrol.threat === AS_T_FALLING;
  s.evacFalling = t.evac.enabled && t.evac.falling;
  s.annSeq = t.evac.annSeq;
  s.seatSeq = t.evac.seatSeq;
  s.landingSeq = t.landing.eventSeq;
}

/** 艇の合図: 被弾・火災の消えた・煙幕・機関の損傷・燃料切れ・座礁（［切替］のフレームは呼ばない） */
function stepBoat(s: SfxCueState, t: BoatTelemetry, sink: SfxCueSink): void {
  const c = SFX_CUE;
  if (t.hp < s.lastHp - c.hullMinDropHp && take(s, CD_HULL, c.hullCooldownS)) sink.cue('hull_hit', 1, 1, 0);
  if (s.onFire && !t.onFire && t.hp > 0) sink.cue('smoke', 1, c.extinguishRate, 0);
  const smoking = t.smokeLeftS > 0;
  if (smoking && !s.smoking) sink.cue('smoke', 1, 1, 0);
  if (t.engineDamaged && !s.engineDamaged && force(s, CD_COUGH, c.coughCooldownS)) sink.cue('engine_cough', 1, 1, 0);
  if (t.fuelEmpty && !s.fuelEmpty && force(s, CD_COUGH, c.coughCooldownS)) sink.cue('engine_cough', 1, c.fuelEmptyRate, 0);
  const grounded = t.shallowState === SHALLOW_GROUNDED;
  if (grounded && !s.grounded) sink.cue('blast_s', 1, c.groundRate, c.groundDelayS);
  copyBoat(s, t);
}

/** 機関の不調（jp_05）の出来事 → 合図（段で低く。過熱・限界の咳は 8 秒に 1 回まで、不調は冷却の内でも鳴らす。回復はボタンの音を低く） */
function engineEvent(s: SfxCueState, ev: number, sink: SfxCueSink): void {
  const c = SFX_CUE;
  if (ev === ENGINE_EV_WARN && take(s, CD_COUGH, c.coughCooldownS)) sink.cue('engine_cough', 1, c.engineStageRate[0], 0);
  else if (ev === ENGINE_EV_FINAL && take(s, CD_COUGH, c.coughCooldownS)) sink.cue('engine_cough', 1, c.engineStageRate[1], 0);
  else if (ev === ENGINE_EV_LIMP && force(s, CD_COUGH, c.coughCooldownS)) sink.cue('engine_cough', 1, c.engineStageRate[2], 0);
  else if (ev === ENGINE_EV_RECOVER) sink.cue('ui_tap', c.recoverGain, c.recoverRate, 0);
}

/** 空の合図: 爆弾の落下・空襲の予告（jp_03）・味方機の識別の要求・星弾と照明弾と識別の信号弾 */
function stepAir(s: SfxCueState, t: BoatTelemetry, sink: SfxCueSink): void {
  const c = SFX_CUE;
  const bombAir = t.planeBombAir;
  const dawnFalling = t.dawn.threat === AS_T_FALLING;
  const patrolFalling = t.patrol.enabled && t.patrol.threat === AS_T_FALLING;
  const evacFalling = t.evac.enabled && t.evac.falling;
  const fall = (bombAir && !s.bombAir) || (dawnFalling && !s.dawnFalling) || (patrolFalling && !s.patrolFalling) || (evacFalling && !s.evacFalling);
  if (fall && take(s, CD_BOMB, c.bombCooldownS)) sink.cue('bomb_fall', 1, 1, 0);
  s.bombAir = bombAir;
  s.dawnFalling = dawnFalling;
  s.patrolFalling = patrolFalling;
  s.evacFalling = evacFalling;
  if (t.evac.enabled && t.evac.annSeq !== s.annSeq && take(s, CD_RAID, c.raidAlarmCooldownS)) sink.cue('alarm', 1, c.raidAlarmRate, 0);
  s.annSeq = t.evac.annSeq;
  const challenge = t.friendlyPhase === FF_CHALLENGE;
  if (challenge && !s.ffChallenge) sink.cue('alarm', c.friendlyAlarmGain, c.friendlyAlarmRate, 0);
  s.ffChallenge = challenge;
  const identified = t.friendlyOutcome === FF_OUT_IDENTIFIED;
  const flare = (t.starLit && !s.starLit) || (t.planeFlareOn && !s.planeFlare) || (identified && !s.ffIdentified);
  if (flare && take(s, CD_FLARE, c.flareCooldownS)) sink.cue('flare_pop', 1, 1, 0);
  s.planeFlare = t.planeFlareOn;
  s.ffIdentified = identified;
}

/**
 * 毎フレーム 1 回: テレメトリの立ち上がり・通し番号の変化から合図を sink へ（dtS はそのフレームの秒）。始めのフレームは写すだけ
 */
export function stepSfxCues(s: SfxCueState, t: BoatTelemetry, dtS: number, sink: SfxCueSink): void {
  const c = SFX_CUE;
  const cool = s.cool;
  for (let i = 0; i < CD_COUNT; i++) if (cool[i]! > 0) cool[i] = cool[i]! - dtS;
  if (s.first) {
    s.first = false;
    copyAll(s, t);
    return;
  }
  // 魚雷の発射（狙う艦の無い魚雷も。積んでいる数が減った分を 1 本ずつ）
  const aboard = t.arms.torpedoesAboard;
  if (aboard < s.aboard) s.launchQueue = Math.min(c.launchQueueMax, s.launchQueue + s.aboard - aboard);
  s.aboard = aboard;
  if (s.launchQueue > 0 && take(s, CD_LAUNCH, c.launchGapS)) {
    s.launchQueue--;
    sink.cue('torp_launch', 1, 1, 0);
  }
  // 発見・探照灯（星弾の時は星弾の音だけ）
  if (t.playerDetected && !s.detected && take(s, CD_ALARM, c.alarmCooldownS)) sink.cue('alarm', 1, 1, 0);
  s.detected = t.playerDetected;
  if (t.illuminated && !s.lit && !t.starLit && take(s, CD_LIGHT, c.lightCooldownS)) sink.cue('light_on', 1, 1, 0);
  s.lit = t.illuminated;
  stepAir(s, t, sink);
  s.starLit = t.starLit;
  // 艇（jp_03 の［切替］のフレームは写すだけ）
  const seatSeq = t.evac.seatSeq;
  if (seatSeq !== s.seatSeq) {
    copyBoat(s, t);
    sink.cue('ui_tap', 1, 1, 0);
  } else stepBoat(s, t, sink);
  s.seatSeq = seatSeq;
  // 弾倉の交換: 始めは reload（抜く）・終わりは reload_end（差し込む・槓桿。IP2 で別の鍵に＝同じ音を 2 回鳴らさない）
  const reloading = t.arms.reloadN > 0 || t.gunReloadLeftS > 0;
  if (reloading !== s.reloading && take(s, CD_RELOAD, c.reloadCooldownS)) {
    if (reloading) sink.cue('reload', 1, 1, 0);
    else sink.cue('reload_end', 1, 1, 0);
  }
  s.reloading = reloading;
  // 機関の不調（jp_05）
  if (t.engine.eventSeq !== s.engineSeq && t.engine.on) engineEvent(s, t.engine.lastEvent, sink);
  s.engineSeq = t.engine.eventSeq;
  // 鐘: 夜明け・空襲の決着（低く）・帰投せよ・揚陸完了（同じフレームに来ても 1 打）
  if (t.dawn.reached && !s.dawn && take(s, CD_BELL, c.bellCooldownS)) sink.cue('bell', 1, c.dawnBellRate, 0);
  s.dawn = t.dawn.reached;
  const called = t.callFlags !== 0;
  if (called && !s.called && take(s, CD_BELL, c.bellCooldownS)) sink.cue('bell', 1, 1, 0);
  s.called = called;
  // 米PT の雷撃の報告・揚陸完了（jp_04）
  const ld = t.landing;
  if (ld.enabled && ld.eventSeq !== s.landingSeq) {
    const k = ld.eventKind;
    if (k === LE_CALM || k === LE_HURRIED || k === LE_LIT_SALVO) sink.cue('torp_launch', c.ptSalvoGain, 1, 0);
    else if (k === LE_DONE && take(s, CD_BELL, c.bellCooldownS)) sink.cue('bell', 1, 1, 0);
  }
  s.landingSeq = ld.eventSeq;
}
