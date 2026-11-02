// 停泊して揚陸する味方の輸送船を守る模擬（core/landing-sim）の遊び方の台本（v0.6.9 S3・S4a・S4。jp_04。spec-v069 §8・R1・R2・R12・R13）。pt-sim-policy・convoy-sim-policy と同じ考え: 艇長に見えるもの
// （見張りの報告＝遠い・近い・その PT の印、視程 900 m の内の PT、「発見された！」、赤い線、決着）だけを使う。Phaser 非依存・毎ステップ確保しない（書き先は 1 夜に 1 個）。
// 動き（move）: hide 出発点で止まる / circle 出発点で巡航のまま回り続ける（R1: 出発点のそばで速く走っても引きつけられないか）/ picket 泊地の北東 1,000 m へ静音で行って止まる /
//   station 輸送船のそば（泊地から出発点の側へ stationM）へ静音で行って止まる / lure 報告が出たらその PT へ巡航（react 1 は遠い報告から、2 は近い報告だけ）、見つかったら輸送船から離れる向きへ
//   静音の上限（jp_05 の HUD の教え＝pt-sim-policy の slow: 見つかったら静音の上限で撃ち返す。kite は全速）、見失ったら輸送船のそばへ静音で戻り、次の報告でまた行く。kite は一度見つかったら PT がみな去るまで全速で
//   見つかり続ける（見失えば最寄りの PT へ全速）。lure_away（R12「輸送船から離れて戦え」）は lure と同じ（見つかっている間は輸送船から離れる向きへ静音の上限）で、そのうえ戦いを輸送船から
//   awayM の外に保つ: 一度見つかった後は見失っても輸送船のそばへ戻らず、awayM の内なら静音で離れ、外なら止まって待つ（報告にはまた行く）。lure_away は表だけ（R13: lure がもう離れて戦うので
//   lure と同じに遊ぶ）。lure_near（R13 の対の相手「輸送船のそばで戦う」）は lure と同じで、見つかっている間だけ輸送船のそば（待つ点＝泊地から stationM 250 m。400 m の内）へ静音で戻って止まる（赤い線の転舵で一時
//   外へ出て戻る: S4 の N 400 で見つかっている間の泊地からの距離 p50 260・p90 386・p99 532 m）。lure_cue（R14 A1・表だけ）は lure_near と同じで、HUD の「輸送船が射線に入る！ 離れて戦え」が出る間
//   （core/landing の landingFireLine。前のステップの終わりの値＝HUD）だけ輸送船から離れる向きへ静音の上限。home_early（R14 A5・表だけ）は出発の遅れを待たずに巡航で帰投の輪へ行き、
//   輪の中で止まって揚陸の決着を待つ（揚陸の前に輪に入っても任務は終わらない）。
// 撃つ（shoot）: contact 見つかっている間に射程 600 m・視程の内の PT へ / eff 有効射程 300 m・視程の内の PT へ（見つかっていなくても）/ range 射程・視程の内の PT へ（見つかっていなくても）。
// 決着（揚陸完了か沈没）の後は巡航で帰投（kite は PT がみな去ってから）。赤い線の転舵（dodge）は core/landing-sim で HUD どおり: 航過は線から離れる直角へ全速 4 秒（線の間は延ばす）、
// 連射は針路そのまま（ui/pt-chase-lines の「針路そのまま撃ち返せ」。pt-pass-sim の既定 keep と同じ）。
// 人に近い遊び方（v0.6.9 実機 1 回目・表だけ。spec-ip1 §4。ユーザーの報告「１艇に対して惹きつけるまで近づくともう１艇が輸送船に近づいて撃沈される」）: face は lure と同じで、見つかっていて
// 決着の前は最寄りの去っていない PT へ巡航（割って入る。fight face）。human は lure に人の遅れと乱れ（LANDING_HUMAN。core/landing-sim が「人の乱れ」の列で回す）、human_face は両方。
import type { BoatState } from './boat-motion';
import { LANDING_REPORT_FAR, LANDING_REPORT_NEAR, type LandingReport } from './landing';
import { PT_LEAVE, type PtSection } from './pt-boats';
import { allLeft } from './pt-sim-policy';
import type { SeededRng } from './rng';
import { bearingDeg } from './ship-ai';
import { degToRad, wrapDeg360 } from './units';

/**
 * 遊び方（表の順）: 較正の 12（spec §8 の 7 と R1 の circle_start・R12 の lure_away・R13 の lure_near・R14 の lure_cue と home_early）の後に、人に近い 3 つ（v0.6.9 実機 1 回目の face・human・
 * human_face。表だけ）
 */
export const LANDING_POLICIES = ['hide', 'circle_start', 'picket', 'lure', 'lure_away', 'lure_near', 'lure_cue', 'lure_noshoot', 'lure_late', 'kite', 'shoot_near', 'home_early', 'face', 'human', 'human_face'] as const;
export type LandingPolicy = (typeof LANDING_POLICIES)[number];
/** 人に近い遊び方（表だけ: 帯も ✓/✗ も無く、斉射の数え・斉射の帯・R2 の期待値の分布に入れない＝較正の 12 の数を動かさない。systems/landing-sim-setup の landingCalibrationRun） */
export const LANDING_HUMAN_POLICIES: readonly LandingPolicy[] = ['face', 'human', 'human_face'];
/** 較正の 12（帯・斉射の数え・斉射の帯・R2 の期待値の分布） */
export const LANDING_CALIBRATION_POLICIES: readonly LandingPolicy[] = LANDING_POLICIES.filter((p) => !LANDING_HUMAN_POLICIES.includes(p));
export type LandingMove = 'hide' | 'circle' | 'picket' | 'station' | 'lure' | 'home';
export type LandingShoot = 'none' | 'contact' | 'eff' | 'range';
/**
 * 見つかっている間の戦い方（lure の動きだけ）: flee 輸送船から離れる向きへ（lure）/ stay_out flee に加えて一度見つかった後は awayM の内へ戻らない（lure_away）/ near 輸送船のそばへ戻る（lure_near）/
 * cue near と同じで、輸送船が射線に入る（HUD の警告）間だけ離れる向きへ（lure_cue）/ face 最寄りの去っていない PT へ巡航（割って入る。face・human_face。去っていない PT が無ければ flee）
 */
export type LandingFight = 'flee' | 'stay_out' | 'near' | 'cue' | 'face';

export interface LandingPolicySpec {
  move: LandingMove;
  /** 報告への反応（lure の動きだけ）: 0 なし・LANDING_REPORT_FAR（遠い報告から）・LANDING_REPORT_NEAR（近い報告だけ） */
  react: number;
  shoot: LandingShoot;
  dodge: boolean;
  kite: boolean;
  /** 見つかっている間の戦い方（R12 の lure_away は stay_out・R13 の lure_near は near・R14 の lure_cue は cue・face と human_face は face。ほかは flee） */
  fight: LandingFight;
  /** 人の遅れと乱れ（human・human_face だけ true。ほかの遊び方は鍵が無い）: 最初の報告に遅れて反応・赤い線は dodgeP だけかわす・射撃ボタンは周期の前半だけ（LANDING_HUMAN） */
  human?: boolean;
}

const spec = (move: LandingMove, react: number, shoot: LandingShoot, dodge: boolean, kite = false, fight: LandingFight = 'flee'): LandingPolicySpec => ({ move, react, shoot, dodge, kite, fight });
export const LANDING_POLICY_SPECS: Readonly<Record<LandingPolicy, LandingPolicySpec>> = {
  hide: spec('hide', 0, 'none', false),
  circle_start: spec('circle', 0, 'none', true),
  picket: spec('picket', 0, 'eff', true),
  lure: spec('lure', LANDING_REPORT_FAR, 'contact', true),
  lure_away: spec('lure', LANDING_REPORT_FAR, 'contact', true, false, 'stay_out'),
  lure_near: spec('lure', LANDING_REPORT_FAR, 'contact', true, false, 'near'),
  lure_cue: spec('lure', LANDING_REPORT_FAR, 'contact', true, false, 'cue'),
  lure_noshoot: spec('lure', LANDING_REPORT_FAR, 'none', true),
  lure_late: spec('lure', LANDING_REPORT_NEAR, 'contact', true),
  kite: spec('lure', LANDING_REPORT_FAR, 'contact', true, true),
  shoot_near: spec('station', 0, 'range', true),
  home_early: spec('home', 0, 'none', false),
  face: spec('lure', LANDING_REPORT_FAR, 'contact', true, false, 'face'),
  human: { ...spec('lure', LANDING_REPORT_FAR, 'contact', true), human: true },
  human_face: { ...spec('lure', LANDING_REPORT_FAR, 'contact', true, false, 'face'), human: true },
};

/** 台本の距離 m（模擬の設定。ゲームの値ではない）: 輸送船のそばの待つ点（泊地から出発点の側へ）・picket の点（泊地から北東）・着いたとみなす・lure_away が戦いを離す泊地からの距離（R12） */
export const LANDING_PLAY = { stationM: 250, picketM: 1000, picketBrgDeg: 45, arriveM: 60, awayM: 1200 } as const;

/** 人の遅れと乱れの設定（模擬の仮定。ゲームの値ではない）。core/landing-sim の runLandingTrial は既定でこれ（テストは中立の写しを渡して lure・face と同じ夜になるのを見る） */
export interface LandingHumanPlay {
  /** 最初の見張りの報告に反応するまでの遅れ U(delayMinS, delayMaxS) 秒（1 夜に 1 回引く。その前の報告は見ない） */
  delayMinS: number; delayMaxS: number;
  /** 赤い線ごとに dodgeP の確率でだけかわし、そのときの反応に U(0, reactExtraS) 秒を足す */
  dodgeP: number; reactExtraS: number;
  /** 射撃ボタン: 出撃からの秒の gunCycleS ごとの初めの gunOnS 秒だけ、lure が押す間に押す（乱数なし） */
  gunOnS: number; gunCycleS: number;
}
/** v0.6.9 実機 1 回目の仮定（spec-ip1 §4: リードの写しの human＝遅れ 5〜12 秒・赤い線の半分・機銃の半分。機銃は乱数でなく 4 秒ごとの初め 2 秒） */
export const LANDING_HUMAN: Readonly<LandingHumanPlay> = { delayMinS: 5, delayMaxS: 12, dodgeP: 0.5, reactExtraS: 1, gunOnS: 2, gunCycleS: 4 };
/** 「人の乱れ」の乱数の列（1 夜ごと。seed × MUL + ADD。human・human_face だけが引く: 遅れ 1 回 → 赤い線ごとに humanReactAt の 2 回） */
export const LANDING_HUMAN_SEED_MUL = 7907;
export const LANDING_HUMAN_SEED_ADD = 31337;

/** 人が見張りの報告を見るか: 最初の報告の秒 reportS（NaN は無し）から delayS 秒の後だけ（報告が無い間も見ない） */
export function humanSeesReport(t0: number, reportS: number, delayS: number): boolean {
  return t0 >= reportS + delayS;
}

/** 人の赤い線への反応の秒: 台本の反応の秒 at に人の乱れから U(0, reactExtraS) を足し、dodgeP の確率でだけかわす（かわさない線は NaN）。線ごとにいつも 2 回引く（足し → かわすか） */
export function humanReactAt(at: number, hp: Readonly<LandingHumanPlay>, hr: SeededRng): number {
  const late = at + hr.nextRange(0, hp.reactExtraS);
  return hr.next() < hp.dodgeP ? late : NaN;
}

/** 人が射撃ボタンを押せる秒か: 出撃からの秒 t0 の gunCycleS ごとの初めの gunOnS 秒だけ（乱数なし。押すのは lure が押す間） */
export function humanGunOn(t0: number, hp: Readonly<LandingHumanPlay>): boolean {
  return t0 % hp.gunCycleS < hp.gunOnS;
}

/** 台本の出力（1 夜に 1 個）: 針路 deg（NaN は保つ）と欲しい速さ（実 m/s。0 は止まる・Infinity は全速） */
export interface LandingSteer {
  headingDeg: number;
  wantMps: number;
}

/** 台本の覚え（1 夜に 1 個）: 一度見つかった（kite の続き） */
export interface LandingSteerMem {
  lured: boolean;
}

/** 台本が読む世界（1 夜に 1 個。boat・q・report は参照）。点は組み立てで 1 回（landingPlayPoints） */
export interface LandingSteerCtx {
  boat: BoatState;
  q: PtSection;
  report: LandingReport;
  start: { x: number; y: number };
  anchor: { x: number; y: number };
  station: { x: number; y: number };
  picket: { x: number; y: number };
  ring: { x: number; y: number };
  silentMps: number;
  cruiseMps: number;
  /** 輸送船が射線に入る（core/landing の landingFireLine が PT を返した。前のステップの終わりの値＝HUD の警告。lure_cue だけが読み、模擬はその遊び方のときだけ書く） */
  cue: boolean;
}

/** 待つ点（泊地から出発点の側へ stationM）と picket の点（泊地から picketBrgDeg の方位へ picketM） */
export function landingPlayPoints(anchor: { x: number; y: number }, start: { x: number; y: number }): { station: { x: number; y: number }; picket: { x: number; y: number } } {
  const dx = start.x - anchor.x;
  const dy = start.y - anchor.y;
  const d = Math.hypot(dx, dy) || 1;
  const r = degToRad(LANDING_PLAY.picketBrgDeg);
  return {
    station: { x: anchor.x + (dx / d) * LANDING_PLAY.stationM, y: anchor.y + (dy / d) * LANDING_PLAY.stationM },
    picket: { x: anchor.x + Math.sin(r) * LANDING_PLAY.picketM, y: anchor.y - Math.cos(r) * LANDING_PLAY.picketM },
  };
}

/** (x, y) へ maxMps、着いたら（arriveM の内）止まる */
function toward(c: LandingSteerCtx, x: number, y: number, maxMps: number, out: LandingSteer): void {
  const dx = x - c.boat.x;
  const dy = y - c.boat.y;
  const near = dx * dx + dy * dy <= LANDING_PLAY.arriveM * LANDING_PLAY.arriveM;
  out.headingDeg = near ? NaN : bearingDeg(c.boat.x, c.boat.y, x, y);
  out.wantMps = near ? 0 : maxMps;
}

/** 去っていない PT のうち自艇に最も近い 1 隻（無ければ −1） */
function nearestLive(c: LandingSteerCtx): number {
  let best = -1;
  let bd = Infinity;
  for (let i = 0; i < c.q.boats.length; i++) {
    const b = c.q.boats[i]!;
    if (b.phase >= PT_LEAVE) continue;
    const d2 = (b.x - c.boat.x) * (b.x - c.boat.x) + (b.y - c.boat.y) * (b.y - c.boat.y);
    if (d2 < bd) {
      bd = d2;
      best = i;
    }
  }
  return best;
}

/** 1 ステップの行き先と速さ（出発の遅れの後。赤い線の転舵は呼ぶ側が上書きする）。resolved は揚陸の決着 */
export function landingSteer(sp: LandingPolicySpec, c: LandingSteerCtx, resolved: boolean, mem: LandingSteerMem, out: LandingSteer): void {
  out.headingDeg = NaN;
  out.wantMps = 0;
  const q = c.q;
  if (q.detected) mem.lured = true;
  const kiting = sp.kite && mem.lured && !allLeft(q.boats);
  if (resolved && !kiting) {
    toward(c, c.ring.x, c.ring.y, c.cruiseMps, out);
    if (out.wantMps === 0) out.wantMps = c.cruiseMps; // 輪の中心のそばでも輪に入るまで進む
    return;
  }
  if (sp.move === 'hide') return;
  if (sp.move === 'home') return toward(c, c.ring.x, c.ring.y, c.cruiseMps, out); // home_early: 輪の中心へ巡航、着いたら止まって待つ（輪の半径の内）
  if (sp.move === 'circle') {
    out.headingDeg = wrapDeg360(c.boat.headingDeg + 90);
    out.wantMps = c.cruiseMps;
    return;
  }
  if (sp.move === 'picket') return toward(c, c.picket.x, c.picket.y, c.silentMps, out);
  if (sp.move === 'station') return toward(c, c.station.x, c.station.y, c.silentMps, out);
  // lure: 見つかっている間は輸送船から離れる向きへ（kite は全速。lure_near は輸送船のそばへ静音で戻って止まる。lure_cue は警告の間だけ離れ、ほかは lure_near と同じ。face は最寄りの
  // 去っていない PT へ巡航）、kite は見失っても最寄りの PT へ全速、報告に反応して PT へ巡航、ほかは輸送船のそばへ静音
  if (sp.fight === 'cue' && c.cue) {
    out.headingDeg = bearingDeg(c.anchor.x, c.anchor.y, c.boat.x, c.boat.y);
    out.wantMps = c.silentMps;
    return;
  }
  if (q.detected) {
    const i = sp.fight === 'face' ? nearestLive(c) : -1;
    if (i >= 0) {
      out.headingDeg = bearingDeg(c.boat.x, c.boat.y, q.boats[i]!.x, q.boats[i]!.y);
      out.wantMps = c.cruiseMps;
      return;
    }
    if (sp.fight === 'near' || sp.fight === 'cue') return toward(c, c.station.x, c.station.y, c.silentMps, out);
    out.headingDeg = bearingDeg(c.anchor.x, c.anchor.y, c.boat.x, c.boat.y);
    out.wantMps = sp.kite ? Infinity : c.silentMps;
    return;
  }
  if (kiting) {
    const i = nearestLive(c);
    if (i >= 0) {
      out.headingDeg = bearingDeg(c.boat.x, c.boat.y, q.boats[i]!.x, q.boats[i]!.y);
      out.wantMps = Infinity;
      return;
    }
  }
  const r = c.report;
  if (!resolved && r.i >= 0 && r.sub >= sp.react) {
    const b = q.boats[r.i]!;
    out.headingDeg = bearingDeg(c.boat.x, c.boat.y, b.x, b.y);
    out.wantMps = c.cruiseMps;
    return;
  }
  if (sp.fight === 'stay_out' && mem.lured) {
    // lure_away: 一度見つかった後は輸送船のそばへ戻らず、awayM の内なら静音で離れ、外なら止まって待つ
    const ax = c.boat.x - c.anchor.x;
    const ay = c.boat.y - c.anchor.y;
    const inside = ax * ax + ay * ay < LANDING_PLAY.awayM * LANDING_PLAY.awayM;
    out.headingDeg = inside ? bearingDeg(c.anchor.x, c.anchor.y, c.boat.x, c.boat.y) : NaN;
    out.wantMps = inside ? c.silentMps : 0;
    return;
  }
  toward(c, c.station.x, c.station.y, c.silentMps, out);
}

/** 射撃ボタン: 撃つ遊び方の距離 m（contact・range は射程、eff は有効射程）と視程の内に去っていない PT がいる間（contact は見つかっている間だけ） */
export function landingGunHeld(sp: LandingPolicySpec, c: LandingSteerCtx, rangeM: number, effectiveM: number, visRange2: number): boolean {
  if (sp.shoot === 'none' || (sp.shoot === 'contact' && !c.q.detected)) return false;
  const r = sp.shoot === 'eff' ? effectiveM : rangeM;
  const r2 = Math.min(r * r, visRange2);
  for (let i = 0; i < c.q.boats.length; i++) {
    const b = c.q.boats[i]!;
    if (b.phase < PT_LEAVE && (b.x - c.boat.x) * (b.x - c.boat.x) + (b.y - c.boat.y) * (b.y - c.boat.y) <= r2) return true;
  }
  return false;
}
