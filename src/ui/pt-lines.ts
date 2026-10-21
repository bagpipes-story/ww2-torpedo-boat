// 敵の米PT（v0.6.3。docs/02 §6.4、spec §D.1・§D.4）の HUD と Result の文: 2 行目の航過（予告・掃射とかわす向き）・接触（航過の結果・突撃・離脱）・
// 平常（見えている PT・哨戒・去る／去った）とそのキャッシュのキー、Result の本文の 4 行と状況の行の頭。
// Phaser も DOM を読む config も使わない（文を組むだけ。tests から型検査ごと読める）。距離（平方根 1 回）と方角（atan2 1 回）は ptKey が、それを出すモードのときだけ
// 1 フレーム 1 回求めてキーに詰める。文（ptLine）はキーから距離と方角を読み、キーが変わったときだけ組む（ui/mission-line がキーでキャッシュする）。
// v0.6.3 実機 1 回目: T-14 の 13mm の 2 つのモード（射撃・撃退と撃沈）は ui/pt-gun-lines へ渡す。被弾で黙った航過、離脱の行の末尾（撃つ前は射撃ボタン・撃った後は次の赤い線）、
// 全隻撃沈、航過の上限は撃退・撃沈で減る（テレメトリ）。Result の 4 行目は 13mm の記録、最初に見つかったのが閃光なら「閃光」、頭に撃沈・撃退の数。
import { HOME_COLOR_TEXT, HOME_MARKER_DISTANCE_STEP_M, HUD_COLOR_STRONG, HUD_COLOR_WARN } from '../config/hud-text-config';
import { PT_DISTANCE_STEP_M } from '../config/pt-config';
import type { BoatTelemetry } from '../core/boat-motion';
import { bearingJa } from '../core/briefing';
import { PT_ALERT, PT_RUN_IN } from '../core/pt-boats';
import { radToDeg, wrapDeg360 } from '../core/units';
import { DETECT_RANGE_STEP_M, STEP_LABEL, type HudLine } from './hud-lines';
import { MISSION_PT_CONTACT, MISSION_PT_GUN, MISSION_PT_GUN_EVENT, MISSION_PT_PASS, ptResultShown } from './mission-mode';
import { ptGunEventKey, ptGunEventLine, ptGunKey, ptGunLine } from './pt-gun-lines';
import type { PtResult } from './result-types';

export { PT_DISTANCE_STEP_M }; // 今までの import のため（v0.6.3 実機 1 回目から config/pt-config に置く。13mm の行も同じ刻み）

/** 航過のキーの「航過中の PT が被弾で黙った」、離脱のキーの「13mm を撃つ前（右下の射撃を勧める）」、平常のキーの去り方（夜明け・みな去った・みな沈めた）の位置 */
const K_SILENCED = 1 << 5;
const K_FIRE_HINT = 1 << 26;
const K_GONE = 21;
const K_HOME = 24;

/**
 * 航過の行のかわし方（航過を固めた瞬間に 1 回決まり点滅しない）: 逃げる針路の方角へ転舵（core の escapeDeg。「北西へ転舵」）か、もう向いていれば（dodge 0）そのまま。
 * v0.6.3 レビュー: 「右へ／左へ」は艇から見た回り方で、スティックは画面の向き（北が上・画面は回らない）なので、南へ走る jp_05 では毎回逆に読めた。方角ならスティックの向きそのまま
 * v0.6.3 実機 1 回目: 「・全速」を外した（赤い線の間ずっと全速で走ると 32 gal でも帰り道で尽きる夜があった。模擬（N 400）で巡航のまま転舵しても沈む率は 1.8%（全速 1.5%）。転舵を 8 秒続けると全速は 96% が漂流、巡航は 0%）
 */
const DODGE_STRAIGHT_JA = 'そのまま離れろ';

/** 接触の行の種類（キーの下 3 ビット）: 航過の結果（被弾なし・被弾・撃たせなかった）、突撃（PT が見えている・音だけ）、離脱 */
const C_CLEAN = 1;
const C_HIT = 2;
const C_RUSH_SEEN = 3;
const C_RUSH_HEARD = 4;
const C_BREAK = 5;
const C_NOFIRE = 6;
/** 平常の行の種類: 見えている PT（停止・静音／巡航・全速）、見えていない、みな去る（海域の外へ出たかはキーの別のビット） */
const N_SLOW = 1;
const N_FAST = 2;
const N_UNSEEN = 3;
const N_GONE = 4;

/** 方位 deg（北 0・時計回り）の 8 方位の添字（bearingJa と同じ丸め） */
function headingIndex(deg: number): number {
  return Math.round(wrapDeg360(deg) / 45) % 8;
}

/** 艇から (dx, dy) の 8 方位の添字 */
function dirIndex(dx: number, dy: number): number {
  return headingIndex(radToDeg(Math.atan2(dx, -dy)));
}

/** 距離の刻み（切り上げ、63 まで＝3,150 m。見えている PT は視程の内なので届かない） */
function distStep(dx: number, dy: number): number {
  return Math.min(63, Math.ceil(Math.sqrt(dx * dx + dy * dy) / PT_DISTANCE_STEP_M));
}

/** 接触の行の種類: 航過の結果の表示中（ui/mission-mode の ptResultShown）→ 結果（撃たなかった航過は「撃たせなかった！」）、脅威の PT が警戒・突撃 → 突撃、ほか（離脱・航過の合間）→ 離脱 */
function contactSub(t: BoatTelemetry, flags: number): number {
  const p = t.pt;
  if (ptResultShown(t, flags)) return !p.lastPassFired ? C_NOFIRE : p.lastPassHits > 0 ? C_HIT : C_CLEAN;
  if (p.threatPhase === PT_ALERT || p.threatPhase === PT_RUN_IN) return p.sighted ? C_RUSH_SEEN : C_RUSH_HEARD;
  return C_BREAK;
}

/**
 * 2 行目のキー（mode は MISSION_PT_PASS / MISSION_PT_CONTACT / MISSION_PT / MISSION_PT_GUN / MISSION_PT_GUN_EVENT、flags は MODE_FLAG_*）。整数だけで、モードごとに 1 つの詰め方（どれも 32 ビットに収まる）。
 * 航過: 撃った | そのまま（dodge 0）<< 1 | 逃げる方角 << 2（被弾で黙った航過は 1 << 5 だけ）。接触: 種類 | 方位 << 3 | 距離の刻み << 6 | 残り << 12 | 航過の数 << 16 | 被弾 << 20 | 13mm を撃つ前 << 26（離脱だけ）。
 * 平常: 種類 | 方位 << 3 | 距離の刻み << 6 | 見つかる距離の刻み << 12 | 隻数 << 18 | 夜明け << 21 | みな去った（海域の外か沈んだ）<< 22 | みな沈めた << 23 | 帰投の輪の縁までの 100 m の刻み（みな去った後だけ）<< 24。
 * 13mm の 2 つは ui/pt-gun-lines。行に出ない値は 0（無駄に組み直さない）
 */
export function ptKey(t: BoatTelemetry, mode: number, flags: number): number {
  const p = t.pt;
  if (mode === MISSION_PT_GUN) return ptGunKey(t);
  if (mode === MISSION_PT_GUN_EVENT) return ptGunEventKey(t);
  if (mode === MISSION_PT_PASS) {
    if (p.passSilenced) return K_SILENCED;
    const straight = p.dodge === 0;
    return (p.fired ? 1 : 0) | ((straight ? 1 : 0) << 1) | ((straight || Number.isNaN(p.escapeDeg) ? 0 : headingIndex(p.escapeDeg)) << 2);
  }
  if (mode === MISSION_PT_CONTACT) {
    const sub = contactSub(t, flags);
    const rush = sub === C_RUSH_SEEN || sub === C_RUSH_HEARD;
    const left = sub === C_BREAK ? Math.min(15, Math.max(0, p.maxPasses - p.passes)) : 0;
    const n = sub === C_CLEAN || sub === C_HIT || sub === C_NOFIRE ? Math.min(15, p.passes) : 0;
    const h = sub === C_HIT ? Math.min(63, p.lastPassHits) : 0;
    const hint = sub === C_BREAK && p.gunEnabled && !p.gunEverFired ? K_FIRE_HINT : 0;
    return sub | ((rush ? dirIndex(p.dx, p.dy) : 0) << 3) | ((sub === C_RUSH_SEEN ? distStep(p.dx, p.dy) : 0) << 6) | (left << 12) | (n << 16) | (h << 20) | hint;
  }
  const slow = t.targetStep === 'stop' || t.targetStep === 'silent';
  const sub = p.alive === 0 ? N_GONE : p.sighted ? (slow ? N_SLOW : N_FAST) : N_UNSEEN;
  const det = sub === N_FAST ? Math.min(63, Math.round(t.detectRangeM / DETECT_RANGE_STEP_M)) : 0;
  const d = sub === N_SLOW || sub === N_FAST ? distStep(p.dx, p.dy) : 0;
  // みな去った: 海域の外へ出たか 13mm で沈んだ（v0.6.3 実機 1 回目）。みな沈めたら「全隻撃沈」
  const gone = sub === N_GONE ? (t.dawn.reached ? 1 : 0) | (p.out + p.sunk >= p.total ? 2 : 0) | (p.sunk >= p.total ? 4 : 0) : 0;
  // みな去った後の帰投の距離（v0.6.3 レビュー: 夜明けの後は「夜明け 帰投せよ N m」の行の代わりに出るので、距離を消さない。切り上げで輪の外では 0 にならない）
  const home = sub === N_GONE ? Math.min(63, Math.max(0, Math.ceil(t.homeEdgeM / HOME_MARKER_DISTANCE_STEP_M))) : 0;
  return sub | ((sub === N_SLOW ? dirIndex(p.dx, p.dy) : 0) << 3) | (d << 6) | (det << 12) | ((sub === N_UNSEEN ? Math.min(7, p.alive) : 0) << 18) | (gone << K_GONE) | (home << K_HOME);
}

/** 2 行目の文と色（key は同じフレームの ptKey。距離・方角・見つかる距離はキーから、航過の数・被弾・隻数はテレメトリから） */
export function ptLine(t: BoatTelemetry, mode: number, key: number): HudLine {
  const p = t.pt;
  if (mode === MISSION_PT_GUN) return ptGunLine(t, key);
  if (mode === MISSION_PT_GUN_EVENT) return ptGunEventLine(key);
  if (mode === MISSION_PT_PASS && (key & K_SILENCED) !== 0) return { text: '米PT 被弾で沈黙！ もう撃ってこない', color: HOME_COLOR_TEXT };
  if (mode === MISSION_PT_PASS) return { text: `米PT ${(key & 1) !== 0 ? '掃射' : '航過'}！ ${(key & 2) !== 0 ? DODGE_STRAIGHT_JA : `${bearingJa(((key >> 2) & 7) * 45)}へ転舵`}`, color: HUD_COLOR_WARN };
  const sub = key & 7;
  const dir = bearingJa(((key >> 3) & 7) * 45);
  const d = ((key >> 6) & 63) * PT_DISTANCE_STEP_M;
  if (mode === MISSION_PT_CONTACT) {
    const tally = `航過 ${p.passes}/${p.maxPasses}`;
    if (sub === C_CLEAN) return { text: `かわした！ 被弾なし ・ ${tally}`, color: HOME_COLOR_TEXT };
    if (sub === C_HIT) return { text: `被弾 ${p.lastPassHits} 発（HP −${p.lastPassHits * p.damagePerHit}） ・ ${tally}`, color: HUD_COLOR_STRONG };
    if (sub === C_NOFIRE) return { text: `撃たせなかった！ ・ ${tally}`, color: HOME_COLOR_TEXT };
    if (sub === C_RUSH_SEEN) return { text: `米PT ${dir}から突撃 ${d} m ・ 赤い線で転舵`, color: HUD_COLOR_WARN };
    if (sub === C_RUSH_HEARD) return { text: `米PT のエンジン音 ・ ${dir}から突撃`, color: HUD_COLOR_WARN };
    // 末尾（v0.6.3 実機 1 回目）: 13mm を撃つ前は右下の射撃を勧め、撃った後は次の赤い線（「静音で見失わせろ」は模擬で見失わせた夜が 0 で、本当でなかった）
    return { text: `米PT 離脱 ・ 残り ${Math.max(0, p.maxPasses - p.passes)} 回 ・ ${(key & K_FIRE_HINT) !== 0 ? '右下の射撃で撃ち返せ' : '次の赤い線に備えよ'}`, color: HUD_COLOR_STRONG };
  }
  if (sub === N_SLOW) return { text: `米PT ${d} m（${dir}） ・ 気づかれていない ・ 静音でやり過ごせ`, color: HUD_COLOR_STRONG };
  if (sub === N_FAST) return { text: `米PT ${d} m ・ 速い！ ${((key >> 12) & 63) * DETECT_RANGE_STEP_M} m で見つかる ・ ${p.silentMaxKt} kt 以下に`, color: HUD_COLOR_WARN };
  if (sub === N_UNSEEN) return { text: `米PT ${p.alive} 隻が哨戒中 ・ 静音で抜けて帰投`, color: HUD_COLOR_STRONG };
  // みな去る: 去る途中（海域の外へ出ていない PT がいる）は「去る」、みな出たか沈んだら「去った」、みな沈めたら「全隻撃沈」。後ろに帰投の輪の縁までの距離（帰投せよの行と同じ書き方）
  const gone = (key >> K_GONE) & 7;
  const what = (gone & 4) !== 0 ? '米PT は全隻撃沈' : `米PT は${p.leaveDirJa}へ${(gone & 2) !== 0 ? '去った' : '去る'}`;
  return { text: `${(gone & 1) !== 0 ? '夜明け ・ ' : ''}${what} ・ 帰投せよ  ${((key >> K_HOME) & 63) * HOME_MARKER_DISTANCE_STEP_M} m`, color: HUD_COLOR_STRONG };
}

/** Result の被弾の句: 0 発は「被弾なし」、ほかは「被弾 N 発（HP −x）」。x は最大 HP まで（沈めた 1 発は残りの HP を超えることがある） */
function hitsJa(r: PtResult): string {
  return r.hits === 0 ? '被弾なし' : `被弾 ${r.hits} 発（HP −${Math.min(r.hits * r.damagePerHit, r.hpMax)}）`;
}

/** Result の 4 行目（v0.6.3 実機 1 回目。data/boats.json の jp_t14.gun_battery を合わせる根拠）: 13mm の射撃・命中（率）・撃退・撃沈。撃たなかった夜はそう言う。砲の無い任務は ''（出さない） */
function gunResultJa(r: PtResult): string {
  if (!r.gunEnabled) return '';
  if (r.gunShots === 0) return '13mm は撃たなかった';
  // 当てたのに 0% と出さない（レビュー ux-4: 240 発で 1 発は「命中 1（0%）」と読めた）
  const pct = (100 * r.gunHits) / r.gunShots;
  return `13mm 射撃 ${r.gunShots} 発 ・ 命中 ${r.gunHits}（${r.gunHits > 0 && pct < 1 ? '1% 未満' : `${Math.round(pct)}%`}） ・ 撃退 ${r.retired} ・ 撃沈 ${r.sunk}`;
}

/**
 * Result の本文（spec §D.4。魚雷の行の代わり）: 1 行目 航過・かわした（撃たれた航過のうち無傷。撃たれた航過が無ければ出さない）・被弾、2 行目 見つかった回数と最初の距離・速力帯
 * （最初が 13mm の閃光なら「閃光」）・見失わせた回数（一度も見つからなければ PT の最接近）、3 行目 予告から初弾までの最短秒と撃たれた弾（data/enemies.json の調整の根拠。CLAUDE.md §9）、
 * 4 行目 13mm の記録（砲の無い任務は ''）。detections は MissionResult.detections、returned は帰投した（見つからずに漂流で終わった夜を「抜けた」と言わない）
 */
export function ptResultLines(r: PtResult, detections: number, returned: boolean): [string, string, string, string] {
  const seen = detections > 0;
  const band = r.flashFirst ? '閃光' : r.firstDetectBand === '' ? '—' : STEP_LABEL[r.firstDetectBand];
  const dodged = r.firedPasses > 0 ? ` ・ かわした ${r.cleanPasses}/${r.firedPasses}` : '';
  return [
    seen ? `米PT 航過 ${r.passes} 回${dodged} ・ ${hitsJa(r)}` : returned ? '米PT に一度も見つからずに抜けた' : '米PT に一度も見つからなかった',
    seen ? `見つかった ${detections} 回（最初 ${Math.round(r.firstDetectM)} m ・ ${band}） ・ 見失わせた ${r.lostContacts} 回` : `見つからず ・ PT の最接近 ${Number.isFinite(r.closestM) ? Math.round(r.closestM) : '—'} m`,
    `予告から初弾まで 最短 ${Number.isFinite(r.minWarnS) ? r.minWarnS.toFixed(1) : '—'} 秒 ・ 撃たれた弾 ${r.shots} 発`,
    gunResultJa(r),
  ];
}

/**
 * Result の状況の行の頭（駆逐艦の「駆逐艦: 撃沈」の代わり）: 13mm で沈めた・撃退した数（v0.6.3 実機 1 回目。0 なら出さない）の後に、夜明けに去った／みな去った（去る途中も）／
 * 健在 N 隻（去っていない PT）。みな沈めたら後ろは付けない。13mm の効果が無ければ v0.6.3 と同じ
 */
export function ptHeadJa(r: PtResult): string {
  const parts: string[] = [];
  if (r.sunk > 0) parts.push(`撃沈 ${r.sunk}`);
  if (r.retired > 0) parts.push(`撃退 ${r.retired}`);
  if (r.sunk < r.total) parts.push(r.leftAtDawn ? '夜明けに去った' : r.alive === 0 ? '去った' : `健在 ${r.alive} 隻`);
  return `米PT: ${parts.join(' ・ ')}`;
}
