// 迎撃の模擬の遊び方（v0.8.0 S3。us_04。spec-v0800 §4.11、lead の L17・L19）。人が画面から知れる物だけを読む（漏らさない）: レーダーの輝点
// （core/radar の状態そのまま。航跡は core/intercept-sim-tracks が人のように作る）・目で見える最寄りの艦（世界と同じ規則＝setup.visRange2 の内の位置と、
// ゲームと同じ core/torpedo-solver の見越し点マーカーの方位）・自艇・地図（Briefing の輪・礁・海域）。艦の AI・発見・段階・本当の位置は読まない（tests/intercept-sim-a の走査）。
// 人の揺らぎ（反応 0.5〜2 秒・狙い ±2°）は模擬だけの系列（seed × INTERCEPT_HUMAN_SEED_MUL ＋ ADD。ゲームの seed〜seed+43 に触らない）。台本（spec §4.11 の 7 行と試しの stay）:
//   radar_ambush 往路の列の道（航跡）の 650 m 脇へ静音で回って止まり、目で見えた列の艦（航跡と合う艦。護衛は撃たない）へ 4 本の扇、道から静音で離れて帰る
//   （lead の L37: spec の「全速で離れ」は世界の発見の規則＝全速は 1,920 m で見つかる、に反するので参考の行 radar_ambush_full に残す）
//   radar_twice 同じく往路へ 2 本、静音で離れて待ち、復路の列の 650 m 脇から 2 本 ／ eye_only レーダーを読まず出発点（海峡の中ほど）で止まって待ち、目で見えた艦へ 4 本
//   idle_lane 復路の最初の接触の道の上へ静音で出て止まる（アイドル＝史実の危険の形。撃たない）／ radar_dodge 出発点で待ち、近づく接触（復路の列も）から離れる（撃たない）
//   charge 往路の列の先頭へ全速で突っ込み、見えたら 4 本 ／ home_after_inbound 史実の先頭の艇: 出発点からレーダーの方位（航跡の見越し）で 1,650 m の内に 4 本撃って帰る
// レーダーを読む台本は待つ間と帰り道で近づく接触から離れ、帰り道は接触が近い間は静音。どの台本も夜明けの 60 秒前には帰る（stay は動かない）。確保は作る時だけ。Phaser 非依存。
import type { BoatState } from './boat-motion';
import { TRACK_READ, columnPassed, createInterceptTracks, trackAvoid, trackLane, trackNear, trackNearest2, updateTracks, type InterceptTracks } from './intercept-sim-tracks';
import type { RadarState } from './radar';
import { SeededRng } from './rng';
import { interceptHeadingDeg } from './torpedo-solver';
import { radToDeg, wrapDeg180, wrapDeg360 } from './units';

export const INTERCEPT_POLICIES = ['radar_ambush', 'radar_twice', 'eye_only', 'idle_lane', 'radar_dodge', 'charge', 'home_after_inbound'] as const;
/** 帯の無い参考の行: radar_ambush_full（spec の文のまま全速で離れる radar_ambush＝L37 で静音に替えた訳を表に残す）・stay（出発点で止まったまま。tests の突き合わせ） */
export type InterceptPolicy = (typeof INTERCEPT_POLICIES)[number] | 'radar_ambush_full' | 'stay';
/** 人の揺らぎの系列（模擬だけ。core/evac-sim-rows・landing-sim-policy と同じ形で別の足し算） */
export const INTERCEPT_HUMAN_SEED_MUL = 7907;
export const INTERCEPT_HUMAN_SEED_ADD = 40483;
/**
 * 人の揺らぎ（spec §4.11）と台本の目安（design。ゲームの強さの値ではない）: 反応の秒・狙いの ±度・脇の m・狙いの許し・列の艦と読む m・離れ終える m と秒の上限・
 * 方位で撃つ m・着いた m・道の上に止まる m と落とし始める m と最低の速さの比・帰る秒・輪の手前 m・静音へ落とす m・帰り道を静音にする m・礁と岸の手前 m・
 * 静音の速さ（静音の帯の上限の比＝帯を跨がない）
 */
export const INTERCEPT_HUMAN = {
  reactS: [0.5, 2] as const, aimDeg: 2, ambushM: 650, aimTolDeg: 1.5, matchM: 400, escapeClearM: 2000, escapeMaxS: 25, bearingFireM: 1650,
  arriveM: 40, parkM: 6, parkBrakeM: 150, parkMinFrac: 0.12, dawnHomeS: 60, homeLeadM: 200, homeSlowM: 400, quietM: 1800, reefGuardM: 200, shoreGuardM: 400, silentFrac: 0.95,
} as const;

/** 台本が読む物（core/intercept-sim が毎フレームの頭に書く） */
export interface InterceptView {
  t: number;
  readonly boat: BoatState;
  torpedoes: number;
  atHome: boolean;
  radar: RadarState | null;
  /** 目で見える最寄りの艦の位置（見えなければ NaN）と見越し点マーカーの方位（解けなければ NaN） */
  eyeX: number; eyeY: number; markerDeg: number;
}

/** 地図と艇の知れる値（Briefing・画面）。レーダーの射程（無ければ NaN）、速さは画面の m/s（実秒あたり）、speed01 は全速の比、礁は地図の矩形 */
export interface InterceptPlan {
  readonly width: number; readonly height: number; readonly radarRangeM: number; readonly ringX: number; readonly ringY: number; readonly ringR: number; readonly dawnS: number;
  readonly silent01: number; readonly cruise01: number; readonly spacingDeg: number; readonly torpedoScreenMps: number; readonly fullScreenMps: number;
  readonly reefs: readonly { readonly x: number; readonly y: number; readonly w: number; readonly h: number }[];
}

export interface InterceptOut { headingDeg: number; speed01: number; fireN: number; fireSpreadDeg: number }

type How = 'ambush' | 'start' | 'lane' | 'charge' | 'bearing' | 'stay';
/** radar: 輝点を読む・how: 待ち方・fan1/fan2: 往路と復路の扇の本数・column: 列の艦（航跡と合う艦）だけ撃つ・avoid: 近づく接触から離れる・quiet: 離れるのも静音 */
interface Spec { readonly radar: boolean; readonly how: How; readonly fan1: number; readonly fan2: number; readonly column: boolean; readonly avoid: boolean; readonly quiet?: boolean }
const SPECS: Readonly<Record<InterceptPolicy, Spec>> = {
  radar_ambush: { radar: true, how: 'ambush', fan1: 4, fan2: 0, column: true, avoid: true, quiet: true }, radar_twice: { radar: true, how: 'ambush', fan1: 2, fan2: 2, column: true, avoid: true, quiet: true },
  eye_only: { radar: false, how: 'start', fan1: 4, fan2: 0, column: false, avoid: false }, idle_lane: { radar: true, how: 'lane', fan1: 0, fan2: 0, column: false, avoid: true },
  radar_dodge: { radar: true, how: 'start', fan1: 0, fan2: 0, column: false, avoid: true }, charge: { radar: true, how: 'charge', fan1: 4, fan2: 0, column: false, avoid: false },
  home_after_inbound: { radar: true, how: 'bearing', fan1: 4, fan2: 0, column: true, avoid: true }, stay: { radar: false, how: 'stay', fan1: 0, fan2: 0, column: false, avoid: false },
  radar_ambush_full: { radar: true, how: 'ambush', fan1: 4, fan2: 0, column: true, avoid: true },
};
/** 段: 待つ（回り込む・突っ込む）・狙う・離れる・帰る・道の上で止まる */
export const DRIVE_WAIT = 0, DRIVE_AIM = 1, DRIVE_ESCAPE = 2, DRIVE_HOME = 3, DRIVE_IDLE = 4;

export interface InterceptDriver {
  readonly sp: Spec; readonly rng: SeededRng; readonly plan: InterceptPlan; readonly tracks: InterceptTracks;
  mode: number; pass: number; actAt: number; aimErr: number; threatAt: number;
  /** 離れる: 向き・終わりの秒の上限・離れる元（列の道の y か、撃った艦の位置） */
  escH: number; escUntil: number; escLaneY: number; escX: number; escY: number;
}

export function createInterceptDriver(policy: InterceptPolicy, seed: number, plan: InterceptPlan): InterceptDriver {
  const rng = new SeededRng((seed * INTERCEPT_HUMAN_SEED_MUL + INTERCEPT_HUMAN_SEED_ADD) >>> 0);
  return { sp: SPECS[policy], rng, plan, tracks: createInterceptTracks(plan.width, plan.radarRangeM), mode: DRIVE_WAIT, pass: 0, actAt: NaN, aimErr: 0, threatAt: NaN, escH: 0, escUntil: 0, escLaneY: NaN, escX: NaN, escY: NaN };
}

const bearing = (x: number, y: number, tx: number, ty: number): number => wrapDeg360(radToDeg(Math.atan2(tx - x, -(ty - y))));
const react = (d: InterceptDriver, t: number): number => t + d.rng.nextRange(INTERCEPT_HUMAN.reactS[0], INTERCEPT_HUMAN.reactS[1]);
const LANE = { y: NaN, lead: -1 };
const AV = { h: NaN, full: false };

/** 航跡 j の今の見越し（速さ speed の弾が当たる方位。解けなければ NaN） */
function leadOn(d: InterceptDriver, j: number, b: BoatState, t: number, speed: number): number {
  const k = d.tracks;
  const age = t - k.at[j]!;
  return interceptHeadingDeg(b.x, b.y, speed, k.x[j]! + k.vx[j]! * age, k.y[j]! + k.vy[j]! * age, k.vx[j]!, k.vy[j]!) ?? NaN;
}

/** 目で見えた艦を撃ってよいか（列だけ撃つ台本は、その艦が今の段の列の航跡と合う時だけ） */
function shootable(d: InterceptDriver, v: InterceptView): boolean {
  return Number.isFinite(v.markerDeg) && (!d.sp.column || trackNear(d.tracks, v.eyeX, v.eyeY, v.t, d.pass === 1 ? 2 : 1, INTERCEPT_HUMAN.matchM));
}

/** 1 フレームの台本（固定ステップの前）。o に針路（NaN は保つ）・速さ・撃つ本数と扇の開き角を書く */
export function stepInterceptDriver(d: InterceptDriver, v: InterceptView, o: InterceptOut): void {
  const sp = d.sp;
  o.headingDeg = NaN;
  o.speed01 = 0;
  o.fireN = 0;
  o.fireSpreadDeg = 0;
  if (sp.radar && v.radar) updateTracks(d.tracks, v.radar);
  if (sp.how === 'stay') return;
  if (v.atHome) {
    d.mode = DRIVE_HOME;
    return;
  }
  if ((d.mode === DRIVE_WAIT || d.mode === DRIVE_IDLE) && v.t >= d.plan.dawnS - INTERCEPT_HUMAN.dawnHomeS) d.mode = DRIVE_HOME;
  if (d.mode === DRIVE_WAIT) wait(d, v, o);
  if (d.mode === DRIVE_AIM) aim(d, v, o);
  else if (d.mode === DRIVE_ESCAPE) escape(d, v, o);
  else if (d.mode === DRIVE_IDLE && d.tracks.outSeen && columnPassed(d.tracks, v.boat)) d.mode = DRIVE_HOME;
  if (d.mode === DRIVE_HOME) home(d, v, o);
}

/** 待つ段: 見えたら狙う（方位で撃つ台本は航跡の距離で）。回り込む台本は列の航跡を読んで（反応の後）脇か道の上へ、突っ込む台本は先頭の見越しへ全速 */
function wait(d: InterceptDriver, v: InterceptView, o: InterceptOut): void {
  const sp = d.sp;
  const b = v.boat;
  const t = v.t;
  const k = d.tracks;
  const fan = d.pass === 0 ? sp.fan1 : sp.fan2;
  trackLane(k, d.pass === 1 || sp.how === 'lane', LANE);
  const lead = LANE.lead;
  const fire = fan > 0 && v.torpedoes > 0 && (sp.how === 'bearing' ? lead >= 0 && k.seen[lead]! >= 3 && Math.hypot(k.x[lead]! - b.x, k.y[lead]! - b.y) <= INTERCEPT_HUMAN.bearingFireM : shootable(d, v));
  if (fire) {
    d.mode = DRIVE_AIM;
    d.actAt = react(d, t);
    d.aimErr = d.rng.nextRange(-INTERCEPT_HUMAN.aimDeg, INTERCEPT_HUMAN.aimDeg);
    return;
  }
  if ((sp.how === 'ambush' || sp.how === 'lane' || sp.how === 'charge') && lead >= 0) {
    if (Number.isNaN(d.actAt)) d.actAt = react(d, t);
    if (t >= d.actAt) {
      if (sp.how === 'charge') {
        const h = leadOn(d, lead, b, t, d.plan.fullScreenMps);
        o.headingDeg = Number.isNaN(h) ? bearing(b.x, b.y, k.x[lead]!, k.y[lead]!) : h;
        o.speed01 = 1;
        return;
      }
      const gy = sp.how === 'lane' ? LANE.y : LANE.y + (b.y >= LANE.y ? 1 : -1) * INTERCEPT_HUMAN.ambushM;
      const gap = Math.abs(gy - b.y);
      // 道の上に止まる台本は道の手前で落として、輝点の y にちょうど止まる（人が PPI の線に艇を重ねる）
      if (gap > (sp.how === 'lane' ? INTERCEPT_HUMAN.parkM : INTERCEPT_HUMAN.arriveM)) {
        o.headingDeg = gy > b.y ? 180 : 0;
        o.speed01 = sp.how === 'lane' ? d.plan.silent01 * Math.min(1, Math.max(INTERCEPT_HUMAN.parkMinFrac, gap / INTERCEPT_HUMAN.parkBrakeM)) : d.plan.silent01;
      } else if (sp.how === 'lane') d.mode = DRIVE_IDLE;
    }
  }
  if (sp.how === 'start' && fan === 0 && k.outSeen && columnPassed(k, b)) d.mode = DRIVE_HOME;
  if (d.mode === DRIVE_WAIT && sp.avoid) avoid(d, v, o, sp.how === 'ambush' ? 1 + d.pass : sp.how === 'bearing' ? 1 : sp.how === 'lane' && lead >= 0 ? 2 : 0);
}

/** 狙う段: 反応の遅れの後、マーカー（方位で撃つ台本は航跡の見越し）＋ 狙いのずれへ向き、向けば扇を撃って離れる段へ。的が消えたら待つ段へ戻る */
function aim(d: InterceptDriver, v: InterceptView, o: InterceptOut): void {
  const sp = d.sp;
  const b = v.boat;
  const t = v.t;
  trackLane(d.tracks, d.pass === 1, LANE);
  const a = sp.how === 'bearing' ? (LANE.lead >= 0 ? leadOn(d, LANE.lead, b, t, d.plan.torpedoScreenMps) : NaN) : shootable(d, v) ? v.markerDeg : NaN;
  if (Number.isNaN(a)) {
    d.mode = DRIVE_WAIT;
    d.actAt = NaN;
    return;
  }
  if (t < d.actAt) {
    if (sp.how === 'charge') o.speed01 = 1;
    return;
  }
  o.headingDeg = wrapDeg360(a + d.aimErr);
  o.speed01 = sp.how === 'charge' ? 1 : 0;
  if (Math.abs(wrapDeg180(b.headingDeg - o.headingDeg)) > INTERCEPT_HUMAN.aimTolDeg) return;
  const fan = d.pass === 0 ? sp.fan1 : sp.fan2;
  o.fireN = fan;
  o.fireSpreadDeg = d.plan.spacingDeg * (fan - 1);
  d.actAt = NaN;
  if (sp.how === 'bearing') {
    d.mode = DRIVE_HOME;
    return;
  }
  // 列の艦を撃ったら道から直角に、ほかは撃った艦から真っ直ぐ離れる
  d.escLaneY = sp.column ? LANE.y : NaN;
  d.escX = Number.isFinite(v.eyeX) ? v.eyeX : b.x;
  d.escY = Number.isFinite(v.eyeY) ? v.eyeY : b.y;
  d.escH = Number.isFinite(d.escLaneY) ? (b.y >= d.escLaneY ? 180 : 0) : bearing(d.escX, d.escY, b.x, b.y);
  d.escUntil = t + INTERCEPT_HUMAN.escapeMaxS;
  d.mode = DRIVE_ESCAPE;
}

/** 離れる段: 静音（quiet の無い台本＝radar_ambush_full・eye_only・charge は全速）で、元（道か撃った艦）から escapeClearM 離れるか秒の上限か礁・岸の手前まで。復路の扇が残れば待つ段へ、ほかは帰る */
function escape(d: InterceptDriver, v: InterceptView, o: InterceptOut): void {
  const b = v.boat;
  const g = INTERCEPT_HUMAN.reefGuardM;
  o.headingDeg = d.escH;
  o.speed01 = d.sp.quiet ? d.plan.silent01 : 1;
  const far = Number.isFinite(d.escLaneY) ? Math.abs(b.y - d.escLaneY) >= INTERCEPT_HUMAN.escapeClearM : Math.hypot(b.x - d.escX, b.y - d.escY) >= INTERCEPT_HUMAN.escapeClearM;
  let reef = b.y < INTERCEPT_HUMAN.shoreGuardM || b.y > d.plan.height - INTERCEPT_HUMAN.shoreGuardM;
  for (const r of d.plan.reefs) if (b.x >= r.x - g && b.x <= r.x + r.w + g && b.y >= r.y - g && b.y <= r.y + r.h + g) reef = true;
  if (!far && !reef && v.t < d.escUntil) return;
  if (d.pass === 0 && d.sp.fan2 > 0 && v.torpedoes > 0) {
    d.pass = 1;
    d.mode = DRIVE_WAIT;
  } else d.mode = DRIVE_HOME;
}

/** 近づく接触から離れる（よけ始めは反応の遅れの後。よけている間は最接近が clearM を越えるまで続ける。急ぐ時は全速、ほかは静音）。脅威が無ければ何もしない */
function avoid(d: InterceptDriver, v: InterceptView, o: InterceptOut, skip: number): void {
  const dodging = Number.isFinite(d.threatAt) && v.t >= d.threatAt;
  trackAvoid(d.tracks, v.boat, v.t, skip, dodging ? TRACK_READ.clearM : TRACK_READ.avoidM, AV);
  if (Number.isNaN(AV.h)) {
    d.threatAt = NaN;
    return;
  }
  if (Number.isNaN(d.threatAt)) d.threatAt = react(d, v.t);
  if (v.t < d.threatAt) return;
  o.headingDeg = AV.h;
  o.speed01 = AV.full ? 1 : d.plan.silent01;
}

/** 帰る: 輪の北の入口（礁の間の水道の上）を経て輪の中心へ（水道の外で入口の線より南なら先に北へ）。巡航、輪の近くと接触（輝点か目）が近い間は静音。接触をよける台本は帰り道もよける */
function home(d: InterceptDriver, v: InterceptView, o: InterceptOut): void {
  const p = d.plan;
  const b = v.boat;
  const gateY = p.ringY - p.ringR - INTERCEPT_HUMAN.homeLeadM;
  const inPass = Math.abs(b.x - p.ringX) <= p.ringR;
  // 輪の北の線より南で水道の外にいれば、まず北へ（礁の帯を横切らない）
  if (!inPass && b.y > gateY + INTERCEPT_HUMAN.arriveM) o.headingDeg = 0;
  else o.headingDeg = bearing(b.x, b.y, p.ringX, inPass && b.y >= gateY - INTERCEPT_HUMAN.arriveM ? p.ringY : gateY);
  const near = Math.hypot(p.ringX - b.x, p.ringY - b.y) < INTERCEPT_HUMAN.homeSlowM || Number.isFinite(v.eyeX) || trackNearest2(d.tracks, b, v.t) < INTERCEPT_HUMAN.quietM * INTERCEPT_HUMAN.quietM;
  o.speed01 = near ? p.silent01 : p.cruise01;
  if (d.sp.avoid) avoid(d, v, o, 0);
}
