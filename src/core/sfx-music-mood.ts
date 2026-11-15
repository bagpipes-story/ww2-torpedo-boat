// v0.7.2 S2（アートと音③：BGM と命中スローの音。spec-v0720 §5・D5・brief L19〜L21）: 任務の曲の段（MUSIC_MOOD_*: 0 静か・1 緊張・2 戦闘・3 沈み始め）を、HUD のテレメトリから決める
// 純粋な観測器（ユーザーの決め U-M1「見つかったら緊張・撃たれたら戦闘」）。読むだけ（テレメトリにも世界にも書かない）・乱数なし・確保しない（作るのは createSfxMoodState の 1 回）。
// 毎フレーム 1 回、HudScene から systems/sfx-mission が呼び、戻りの段を systems/sfx-bus の sfxMusicMood へ（3 層の音量をノードへ書くのは曲の再生＝段が変わった時だけ）。
// 表（spec §5.1。出どころの最大。どれも HUD が文・色・帯で出している状態）:
// - 戦闘（撃たれている）: illuminated・starLit（3 行目「探照灯に照射中！／照明弾！」。駆逐艦は照らした時だけ撃つ）／ HP が 1 フレームに hitMinDropHp より多く減った（HP の帯。火災の継続は除く・
//   jp_03 の座席が替わったフレームは写すだけ＝core/sfx-cues と同じ）／ 米PT の航過・連射（赤い線）で標的が自艇／ 沿岸砲の射界の中で撃ってくる（「沿岸砲！」）／ 水上機の爆撃進路・爆弾の落下／
//   味方機の誤射（掃射）／ 夜明けの空襲・夜の出撃の旋回・突入・落下／ jp_03 の操作中の隊を狙う編隊・操作中の隊への爆弾の落下（「爆弾！」）。
// - 緊張（見つかった）: playerDetected（3 行目「発見された！」・大発の「気づかれた！」）／ 米PT の隊が捉えている（まだ戦う PT がいる）・標的が大発か隼艇の航過／ 水上機に発見された・照明弾の航過・旋回／
//   味方機の識別の要求／ 夜明けの空襲・夜の出撃の接近と波の合間／ 夜の哨戒機の捜索の接近・付近の捜索／ jp_03 の予告の行・ほかの隊の狙い／ jp_04 の輸送船への脅威（見張りの報告・雷跡・射線。設計の既定）。
// - 静か: 上のどれでもない（敵影ありだけ・浅瀬・暴風・燃料・帰投せよ・レーダーの前の哨戒機）。 沈み始め: hp <= 0（曲の再生が sinkFadeS で 0 へ）。
// 読み替え（§5.1 の欄がテレメトリで別の意味の所。CHANGELOG の S2 にも書いた）:
// - pt.passing は標的が自艇の時だけ戦闘（jp_01 の大発・隼艇への航過は HUD の文も「大発へ」で自艇は撃たれていない＝緊張。航過中に標的を失った passTargetLost は HUD が赤い線を降ろすので数えない）。
// - pt.detected は「まだ戦う PT がいる」（pt.alive > 0）時だけ（HUD の接触の行と同じ）。jp_01 は大発が見つかっても立つ（輸送隊への脅威＝緊張。jp_04 と同じ扱い）。
// - batteryAlerted は batteryInArc と一緒の時だけ（沿岸砲は射界の中でしか撃たない・HUD の「沿岸砲！」も射界の中だけ）。
// - 水上機の planeLocked は接近の段の時だけ（HUD の planeAttacking と同じ。照明弾の航過・旋回は locked に依らず緊張、爆撃進路は戦闘）。
// - jp_04 の輸送船への脅威は揚陸の決着の前だけ（HUD の landingThreatShown・landingFireLineShown と同じ）。jp_03 は決着の前だけ（決着の後の 4 機は夜明けの空襲の欄）。
// 間（SFX_MUSIC_MOOD。時計はゲームの時計＝見たフレームの dt の和。一時停止の間は Hud が止まる＝進まない）: 信号は毎フレーム見て最後の時刻を覚え、段は 10 Hz で決める（上がるのは次の
//   10 Hz の決め・下がるのは最後の信号から 戦闘 6 秒・緊張 8 秒の後。戦闘の信号は緊張の時刻も進める＝戦闘から落ちると緊張）。始めのフレームは HP と座席を写すだけ（被弾と読まない）。
// 漏らさない（D5）: 敵の位置・見えているか・距離・見つかる距離の欄（enemyDx・enemyDy・enemySighted・pt.dx・pt.dy・pt.sighted・planeDistM・patrol.distM・detectRangeM）は読まない
//   （tests/sfx-rules で固定）。「敵影あり」だけでは上げない。
// 段の聞かせ方（時定数と層の音量。曲の再生と scripts/sfx-music-stem が同じ物を使う）: musicMoodTc・musicMoodGain。
import {
  MUSIC_GAIN, MUSIC_LAYER_KEYS, MUSIC_MOOD_BATTLE, MUSIC_MOOD_QUIET, MUSIC_MOOD_SINK, MUSIC_MOOD_TENSE, MUSIC_MOOD_WEIGHTS, MUSIC_PLAYER, SFX_MUSIC_MOOD,
} from '../config/sfx-music-config';
import { AS_T_FALLING, AS_T_INBOUND, AS_T_ORBIT, AS_T_REST, AS_T_RUN } from './air-strike-state';
import type { BoatTelemetry } from './boat-telemetry';
import { EVA_NONE } from './evac-telemetry';
import { FF_CHALLENGE, FF_STRAFE } from './friendly';
import { LANDING_REPORT_NONE } from './landing';
import { PA_ORBIT, PA_PASS } from './patrol-air-state';
import { SP_APPROACH, SP_FLARE_PASS, SP_ORBIT, SP_RUN } from './seaplane';

/** 米PT の標的の種類の自艇（PtTelemetry.targetKind: 0 自艇・1 大発・2 隼艇。core/pt-state の注） */
const PT_TARGET_SELF = 0;
const TICK_S = 1 / SFX_MUSIC_MOOD.updateHz;

/** 観測器の覚え（任務ごとに 1 つ） */
export interface SfxMoodState {
  /** まだ 1 フレームも見ていない */
  first: boolean;
  /** ゲームの時計（見たフレームの dt の和）と 10 Hz の決めの積み */
  clockS: number;
  accS: number;
  /** 最後に戦闘・緊張の信号を見たゲームの時計（まだなら −Infinity） */
  battleAtS: number;
  tenseAtS: number;
  /** 前のフレームの HP と座席の通し番号（jp_03 の［切替］・乗り移り） */
  lastHp: number;
  seatSeq: number;
  /** 今の段（MUSIC_MOOD_*）と、段が変わった回数（確かめ用） */
  level: number;
  moves: number;
}

export function createSfxMoodState(): SfxMoodState {
  return { first: true, clockS: 0, accS: 0, battleAtS: -Infinity, tenseAtS: -Infinity, lastHp: 0, seatSeq: 0, level: MUSIC_MOOD_QUIET, moves: 0 };
}

/** 夜明けの空襲・夜の出撃の脅威の段（AS_T_*）→ 信号: 旋回・突入・落下は戦闘、接近と波の合間は緊張 */
function raidSignal(threat: number): number {
  if (threat === AS_T_ORBIT || threat === AS_T_RUN || threat === AS_T_FALLING) return MUSIC_MOOD_BATTLE;
  return threat === AS_T_INBOUND || threat === AS_T_REST ? MUSIC_MOOD_TENSE : MUSIC_MOOD_QUIET;
}

/** そのフレームの信号（出どころの最大。HP の被弾は呼ぶ側）: 戦闘・緊張・静か */
function moodSignal(t: BoatTelemetry): number {
  const p = t.pt;
  const ptPass = p.enabled && p.passing && !p.passTargetLost;
  const sp = t.planePhase;
  const pa = t.patrol;
  const ev = t.evac;
  const evac = ev.enabled && !ev.settled;
  const dawn = raidSignal(t.dawn.threat);
  const sortie = pa.enabled ? raidSignal(pa.threat) : MUSIC_MOOD_QUIET;
  // 戦闘（撃たれている）
  if (t.illuminated || t.starLit || (t.batteryInArc && t.batteryAlerted) || (ptPass && p.targetKind === PT_TARGET_SELF)) return MUSIC_MOOD_BATTLE;
  if (sp === SP_RUN || t.planeBombAir || t.friendlyPhase === FF_STRAFE || dawn === MUSIC_MOOD_BATTLE || sortie === MUSIC_MOOD_BATTLE) return MUSIC_MOOD_BATTLE;
  if (evac && ((ev.targetedMask & (1 << ev.control)) !== 0 || ev.falling)) return MUSIC_MOOD_BATTLE;
  // 緊張（見つかった）
  if (t.playerDetected || ptPass || (p.enabled && p.detected && p.alive > 0)) return MUSIC_MOOD_TENSE;
  if ((sp === SP_APPROACH && t.planeLocked) || sp === SP_FLARE_PASS || sp === SP_ORBIT || t.friendlyPhase === FF_CHALLENGE) return MUSIC_MOOD_TENSE;
  if (dawn === MUSIC_MOOD_TENSE || sortie === MUSIC_MOOD_TENSE || (pa.enabled && (pa.phase === PA_PASS || pa.phase === PA_ORBIT))) return MUSIC_MOOD_TENSE;
  if (evac && (ev.annKind !== EVA_NONE || ev.targetedMask !== 0)) return MUSIC_MOOD_TENSE;
  const l = t.landing;
  if (l.enabled && !l.resolved && (l.reportSub !== LANDING_REPORT_NONE || l.wakes > 0 || l.fireLineI >= 0)) return MUSIC_MOOD_TENSE;
  return MUSIC_MOOD_QUIET;
}

/**
 * 毎フレーム 1 回: テレメトリから段を決めて返す（dtS はそのフレームの秒）。段が変わるのは 10 Hz の決めの時だけ（沈み始めはそのフレーム）
 */
export function stepSfxMood(s: SfxMoodState, t: BoatTelemetry, dtS: number): number {
  const m = SFX_MUSIC_MOOD;
  s.clockS += dtS;
  const seatSeq = t.evac.seatSeq;
  if (s.first) {
    s.first = false;
    s.lastHp = t.hp;
    s.seatSeq = seatSeq;
  }
  const seat = seatSeq !== s.seatSeq;
  const hit = !seat && t.hp < s.lastHp - m.hitMinDropHp;
  s.lastHp = t.hp;
  s.seatSeq = seatSeq;
  if (s.level === MUSIC_MOOD_SINK) return MUSIC_MOOD_SINK;
  if (t.hp <= 0 && !seat) {
    s.level = MUSIC_MOOD_SINK;
    s.moves++;
    return MUSIC_MOOD_SINK;
  }
  const sig = hit ? MUSIC_MOOD_BATTLE : moodSignal(t);
  if (sig === MUSIC_MOOD_BATTLE) s.battleAtS = s.clockS;
  if (sig !== MUSIC_MOOD_QUIET) s.tenseAtS = s.clockS;
  s.accS += dtS;
  if (s.accS < TICK_S) return s.level;
  s.accS = s.accS < 2 * TICK_S ? s.accS - TICK_S : 0; // 余りは次へ（長いフレームの後にまとめて決めない）
  const want = s.clockS - s.battleAtS < m.holdBattleS ? MUSIC_MOOD_BATTLE : s.clockS - s.tenseAtS < m.holdTenseS ? MUSIC_MOOD_TENSE : MUSIC_MOOD_QUIET;
  if (want !== s.level) {
    s.level = want;
    s.moves++;
  }
  return s.level;
}

/** 段の移りの時定数（秒。曲の再生が 3 層に同じ値で書く）: 上がりは戦闘 0.6・緊張 1.5、下がりは戦闘から 3 秒・緊張から 4 秒、沈み始めは 2.5 秒（秒 × MUSIC_PLAYER.fadeTc） */
export function musicMoodTc(from: number, to: number): number {
  const m = SFX_MUSIC_MOOD;
  if (to === MUSIC_MOOD_SINK) return m.sinkFadeS * MUSIC_PLAYER.fadeTc;
  if (to > from) return to === MUSIC_MOOD_BATTLE ? m.riseTcBattleS : m.riseTcTenseS;
  return (from === MUSIC_MOOD_BATTLE ? m.fallBattleS : m.fallTenseS) * MUSIC_PLAYER.fadeTc;
}

/** 層 layer（MUSIC_LAYER_KEYS の添字）の段 mood の音量: 鍵の音量 × 段の重さ（沈み始めは 0） */
export function musicMoodGain(layer: number, mood: number): number {
  return mood === MUSIC_MOOD_SINK ? 0 : MUSIC_GAIN[MUSIC_LAYER_KEYS[layer]!] * MUSIC_MOOD_WEIGHTS[mood]![layer]!;
}
