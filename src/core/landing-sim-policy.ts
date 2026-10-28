// 停泊して揚陸する味方の輸送船を守る模擬（core/landing-sim）の遊び方の台本（v0.6.9 S3。jp_04。spec-v069 §8・R1・R2）。pt-sim-policy・convoy-sim-policy と同じ考え: 艇長に見えるもの
// （見張りの報告＝遠い・近い・その PT の印、視程 900 m の内の PT、「発見された！」、赤い線、決着）だけを使う。Phaser 非依存・毎ステップ確保しない（書き先は 1 夜に 1 個）。
// 動き（move）: hide 出発点で止まる / circle 出発点で巡航のまま回り続ける（R1: 出発点のそばで速く走っても引きつけられないか）/ picket 泊地の北東 1,000 m へ静音で行って止まる /
//   station 輸送船のそば（泊地から出発点の側へ stationM）へ静音で行って止まる / lure 報告が出たらその PT へ巡航（react 1 は遠い報告から、2 は近い報告だけ）、見つかったら輸送船から離れる向きへ
//   静音の上限（jp_05 の HUD の教え＝pt-sim-policy の slow: 見つかったら静音の上限で撃ち返す。kite は全速）、見失ったら輸送船のそばへ静音で戻り、次の報告でまた行く。kite は一度見つかったら PT がみな去るまで全速で
//   見つかり続ける（見失えば最寄りの PT へ全速）。
// 撃つ（shoot）: contact 見つかっている間に射程 600 m・視程の内の PT へ / eff 有効射程 300 m・視程の内の PT へ（見つかっていなくても）/ range 射程・視程の内の PT へ（見つかっていなくても）。
// 決着（揚陸完了か沈没）の後は巡航で帰投（kite は PT がみな去ってから）。赤い線の転舵（dodge）は core/landing-sim で HUD どおり: 航過は線から離れる直角へ全速 4 秒（線の間は延ばす）、
// 連射は針路そのまま（ui/pt-chase-lines の「針路そのまま撃ち返せ」。pt-pass-sim の既定 keep と同じ）。
import type { BoatState } from './boat-motion';
import { LANDING_REPORT_FAR, LANDING_REPORT_NEAR, type LandingReport } from './landing';
import { PT_LEAVE, type PtSection } from './pt-boats';
import { allLeft } from './pt-sim-policy';
import { bearingDeg } from './ship-ai';
import { degToRad, wrapDeg360 } from './units';

/** 遊び方（表の順。spec §8 の 7 と R1 の circle_start） */
export const LANDING_POLICIES = ['hide', 'circle_start', 'picket', 'lure', 'lure_noshoot', 'lure_late', 'kite', 'shoot_near'] as const;
export type LandingPolicy = (typeof LANDING_POLICIES)[number];
export type LandingMove = 'hide' | 'circle' | 'picket' | 'station' | 'lure';
export type LandingShoot = 'none' | 'contact' | 'eff' | 'range';

export interface LandingPolicySpec {
  move: LandingMove;
  /** 報告への反応（lure の動きだけ）: 0 なし・LANDING_REPORT_FAR（遠い報告から）・LANDING_REPORT_NEAR（近い報告だけ） */
  react: number;
  shoot: LandingShoot;
  dodge: boolean;
  kite: boolean;
}

const spec = (move: LandingMove, react: number, shoot: LandingShoot, dodge: boolean, kite = false): LandingPolicySpec => ({ move, react, shoot, dodge, kite });
export const LANDING_POLICY_SPECS: Readonly<Record<LandingPolicy, LandingPolicySpec>> = {
  hide: spec('hide', 0, 'none', false),
  circle_start: spec('circle', 0, 'none', true),
  picket: spec('picket', 0, 'eff', true),
  lure: spec('lure', LANDING_REPORT_FAR, 'contact', true),
  lure_noshoot: spec('lure', LANDING_REPORT_FAR, 'none', true),
  lure_late: spec('lure', LANDING_REPORT_NEAR, 'contact', true),
  kite: spec('lure', LANDING_REPORT_FAR, 'contact', true, true),
  shoot_near: spec('station', 0, 'range', true),
};

/** 台本の距離 m（模擬の設定。ゲームの値ではない）: 輸送船のそばの待つ点（泊地から出発点の側へ）・picket の点（泊地から北東）・着いたとみなす */
export const LANDING_PLAY = { stationM: 250, picketM: 1000, picketBrgDeg: 45, arriveM: 60 } as const;

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
  if (sp.move === 'circle') {
    out.headingDeg = wrapDeg360(c.boat.headingDeg + 90);
    out.wantMps = c.cruiseMps;
    return;
  }
  if (sp.move === 'picket') return toward(c, c.picket.x, c.picket.y, c.silentMps, out);
  if (sp.move === 'station') return toward(c, c.station.x, c.station.y, c.silentMps, out);
  // lure: 見つかっている間は輸送船から離れる向きへ（kite は全速）、kite は見失っても最寄りの PT へ全速、報告に反応して PT へ巡航、ほかは輸送船のそばへ静音
  if (q.detected) {
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
