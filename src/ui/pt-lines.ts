// 敵の米PT（v0.6.3。docs/02 §6.4、spec §D.1・§D.4）の HUD と Result の文: 2 行目の航過（予告・掃射とかわす向き）・接触（航過の結果・突撃・離脱）・
// 平常（見えている PT・哨戒・去る／去った）とそのキャッシュのキー、Result の本文の 4 行と状況の行の頭。
// Phaser も DOM を読む config も使わない（文を組むだけ。tests から型検査ごと読める）。距離（平方根 1 回）と方角（atan2 1 回）は ptKey が、それを出すモードのときだけ
// 1 フレーム 1 回求めてキーに詰める。文（ptLine）はキーから距離と方角を読み、キーが変わったときだけ組む（ui/mission-line がキーでキャッシュする）。
// v0.6.3 実機 1 回目: T-14 の 13mm の 2 つのモード（射撃・撃退と撃沈）は ui/pt-gun-lines へ渡す。被弾で黙った航過、離脱の行の末尾（撃つ前は射撃ボタン・撃った後は次の赤い線）、
// 全隻撃沈、航過の上限は撃退・撃沈で減る（テレメトリ）。Result の 4 行目は 13mm の記録、最初に見つかったのが閃光なら「閃光」、頭に撃沈・撃退の数。
// v0.6.3 実機 2 回目（追撃。spec r2 §F）: 連射の行・追ってくる PT の行・連射の結果・Result の連射と制圧の句は ui/pt-chase-lines へ渡す。航過の行に「全速で」を戻し、
// 離脱の行から「残り N 回」を外した（追撃があるので回数はもう次を言い当てない）。レビュー: 13mm の出来事の行に同じ PT の連射の結果を足す（merge。ui/pt-line-clock）、
// 方角と距離は HUD の脅威の PT（core の hudThreatIndex。次の航過の PT を追ってくる PT より先に）。
// v0.6.4（jp_01。味方の大発の輸送隊）: 隊の標的が大発のとき（PtTelemetry.targetKind / lastPassTargetKind。キーの bit 28）は航過・突撃・結果を大発の文（ui/convoy-lines）に、平常は輸送隊の行、
// 離脱の行に「大発のそばへ戻れ（N m）」（刻みは接触の距離のビット）。Result の砲の行の頭は砲の名（25mm／13mm）、航過の後に「（大発へ N）」、「米PT が捉えた」と最初に捉えたのが大発。
// v0.6.4 レビュー: 輸送隊が決着する前にみな去ったら「帰投せよ  N m」の代わりに「大発の上陸を待て  浜まで N m」（平常のキーの bit 30。ux-1）、撃つ前に 25mm で黙らせた大発への航過の結果は
// 「大発を守った！」（接触のキーの bit 29。ux-7）。どちらも jp_05 では立たない。
// v0.6.6（隼艇。jp_01 のハード）: 標的が隼艇（PtTelemetry.targetKind / lastPassTargetKind が 2）の航過・連射・突撃・追ってくる PT・結果は ui/gunboat-lines の文（キーの bit 30 と方角 16〜18、
// 被弾の結果は HP 6〜11）。大発は bit 28 のまま。Result の 4 行目は自艇の分（隼艇の分を引く）、最初に捉えたのが隼艇なら「隼艇」。
import { HOME_COLOR_TEXT, HOME_MARKER_DISTANCE_STEP_M, HUD_COLOR_STRONG, HUD_COLOR_WARN } from '../config/hud-text-config';
import { PT_DISTANCE_STEP_M } from '../config/pt-config';
import type { BoatTelemetry } from '../core/boat-motion';
import { bearingJa } from '../core/briefing';
import { PT_ALERT, PT_CHASE, PT_RUN_IN } from '../core/pt-boats';
import { radToDeg, wrapDeg360 } from '../core/units';
import { DETECT_RANGE_STEP_M, STEP_LABEL, type HudLine } from './hud-lines';
import { MISSION_PT_CONTACT, MISSION_PT_GUN, MISSION_PT_GUN_EVENT, MISSION_PT_PASS, ptResultShown } from './mission-mode';
import { C_CHASE, K_BURST, K_BURST_RESULT, burstKey, burstLine, burstResultLine, burstsResultJa, chaseKey, chaseLine, suppressResultJa } from './pt-chase-lines';
import { convoyBreakTailJa, convoyLeftStep, convoyNearStep, convoyNormalLine, convoyPassLine, convoyPassResultLine, convoyRushLine, convoySlowLine, convoyWaitShoreJa, convoyWaiting } from './convoy-lines';
import { K_GB_DIR, K_TARGET_GUNBOAT, gunboatChaseLine, gunboatHpBits, gunboatPassKey, gunboatPassLine, gunboatResultLine, gunboatRushLine } from './gunboat-lines';
import { ptGunEventKey, ptGunEventLine, ptGunKey, ptGunLine } from './pt-gun-lines';
import type { GunboatResult, PtResult } from './result-types';

export { PT_DISTANCE_STEP_M }; // 今までの import のため（v0.6.3 実機 1 回目から config/pt-config に置く。13mm の行も同じ刻み）

/** 航過のキーの「航過中の PT が被弾で黙った」、離脱・追ってくる PT のキーの「13mm を撃つ前（右下の射撃を勧める）」、平常のキーの去り方（夜明け・みな去った・みな沈めた）の位置 */
const K_SILENCED = 1 << 5;
const K_FIRE_HINT = 1 << 26;
const K_GONE = 21;
const K_HOME = 24;
/** 航過・接触のキーの「標的が大発」（v0.6.4。航過は今の標的、結果は最後の攻撃の標的、突撃は今の標的。平常のキー（K_HOME + 6 ビット = 29 まで）には足さない） */
const K_TARGET = 28;
/** 接触のキーの「撃たなかった大発への航過の PT は 25mm で黙っていた」（v0.6.4 レビュー ux-7）、平常のキーの「輸送隊の決着を待つ」（K_HOME の 6 ビットは浜までの刻み。ux-1） */
const K_SILENCED_RESULT = 1 << 29;
const K_WAIT = 1 << 30;

/**
 * 航過の行のかわし方（航過を固めた瞬間に 1 回決まり点滅しない）: 逃げる針路の方角へ転舵（core の escapeDeg。「北西へ転舵」）か、もう向いていれば（dodge 0）そのまま。
 * v0.6.3 レビュー: 「右へ／左へ」は艇から見た回り方で、スティックは画面の向き（北が上・画面は回らない）なので、南へ走る jp_05 では毎回逆に読めた。方角ならスティックの向きそのまま
 * v0.6.3 実機 1 回目: 「・全速」を外した（赤い線の間ずっと全速で走ると 32 gal でも帰り道で尽きる夜があった）。
 * 実機 2 回目: 「全速で」を戻した（spec r2 §F.1。線が撃ち切りと離れていくことで消えるので全速の時間が短く、全速で逃げ回っても漂流 0.5% 以下。HUD どおり全速で線の間かわすと巡航より 7〜10 点沈みにくい）
 */
const DODGE_STRAIGHT_JA = 'そのまま全速で離れろ';

/** 接触の行の種類（キーの下 3 ビット）: 航過の結果（被弾なし・被弾・撃たせなかった）、突撃（PT が見えている・音だけ）、離脱。7 は追ってくる PT（ui/pt-chase-lines の C_CHASE） */
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

/** 接触の行の種類: 航過・連射の結果の表示中（ui/mission-mode の ptResultShown）→ 結果（撃たなかった攻撃は「撃たせなかった！」）、脅威の PT が警戒・突撃 → 突撃、追撃 → 追ってくる、ほか（離脱・合間）→ 離脱 */
function contactSub(t: BoatTelemetry, flags: number): number {
  const p = t.pt;
  if (ptResultShown(t, flags)) return !p.lastPassFired ? C_NOFIRE : p.lastPassHits > 0 ? C_HIT : C_CLEAN;
  if (p.threatPhase === PT_ALERT || p.threatPhase === PT_RUN_IN) return p.sighted ? C_RUSH_SEEN : C_RUSH_HEARD;
  return p.threatPhase === PT_CHASE ? C_CHASE : C_BREAK;
}

/**
 * 2 行目のキー（mode は MISSION_PT_PASS / MISSION_PT_CONTACT / MISSION_PT / MISSION_PT_GUN / MISSION_PT_GUN_EVENT、flags は MODE_FLAG_*）。整数だけで、モードごとに 1 つの詰め方（どれも 32 ビットに収まる）。
 * 航過: 撃った | そのまま（dodge 0）<< 1 | 逃げる方角 << 2 | 標的が大発 << 28（被弾で黙った航過は 1 << 5 だけ。連射は ui/pt-chase-lines の burstKey）。
 * 接触: 種類 | 方位 << 3 | 距離の刻み << 6（突撃は PT まで 50 m 刻み、離脱は「大発のそばへ戻れ」の 100 m 刻み）| 上限 << 12 | 攻撃の数 << 16 | 被弾 << 20 | 13mm を撃つ前 << 26（離脱・追ってくる）|
 * 結果が連射 << 27（追ってくる PT は chaseKey）| 標的が大発 << 28（突撃は今の標的・結果は最後の攻撃の標的）| 撃たなかった大発・隼艇への航過の PT は 25mm で黙っていた << 29。
 * 隼艇（v0.6.6。ui/gunboat-lines）: 航過・連射・突撃・追ってくる PT・結果に標的が隼艇 << 30、航過・連射・突撃・追ってくる PT に隼艇の方角 << 16、被弾の結果に隼艇の HP << 6。
 * 平常: 種類 | 方位 << 3 | 距離の刻み << 6 | 見つかる距離の刻み << 12 | 隻数 << 18 | 夜明け << 21 | みな去った（海域の外か沈んだ）<< 22 | みな沈めた << 23 | 帰投の輪の縁までの 100 m の刻み（みな去った後だけ）<< 24
 * （輸送隊の決着の前は浜までの 100 m の刻み）| 輸送隊の決着を待つ << 30。
 * 13mm の 2 つは ui/pt-gun-lines（出来事に足した連射の結果 merge は ui/pt-line-clock の merge）。行に出ない値は 0（無駄に組み直さない）。
 * 攻撃が終わって赤い線の行を保つ間（航過のモードで撃つ PT がいない。ptHoldPass）は前のキー lastKey
 */
export function ptKey(t: BoatTelemetry, mode: number, flags: number, lastKey = 0, merge = 0): number {
  const p = t.pt;
  if (mode === MISSION_PT_PASS && !p.passing) return lastKey;
  if (mode === MISSION_PT_GUN) return ptGunKey(t);
  if (mode === MISSION_PT_GUN_EVENT) return ptGunEventKey(t) | merge;
  if (mode === MISSION_PT_PASS) {
    if (p.targetKind === 2 && !p.passSilenced) return gunboatPassKey(p, dirIndex(t.gunboat.dx, t.gunboat.dy)); // 隼艇への航過・連射（v0.6.6。方角は自艇から隼艇へ）
    if (p.burst) return burstKey(t, dirIndex(p.dx, p.dy));
    if (p.passSilenced) return K_SILENCED;
    if (p.targetKind !== 0) return (p.fired ? 1 : 0) | (1 << K_TARGET); // 大発への線はかわす向きを出さない（向きのビットで組み直さない）
    const straight = p.dodge === 0;
    return (p.fired ? 1 : 0) | ((straight ? 1 : 0) << 1) | ((straight || Number.isNaN(p.escapeDeg) ? 0 : headingIndex(p.escapeDeg)) << 2);
  }
  if (mode === MISSION_PT_CONTACT) {
    const sub = contactSub(t, flags);
    const rush = sub === C_RUSH_SEEN || sub === C_RUSH_HEARD;
    // 今の標的が隼艇の突撃・追ってくる PT（v0.6.6）: 隼艇の印と自艇から隼艇への方角（追ってくる PT に射撃の勧めは付けない）。隼艇が沈んだか決着の後は付けない（追撃中の PT は
    // 最後に見た隼艇を detect_hold_s まで追うので標的は隼艇のまま。沈んだ隼艇を「狙う」と出さない。レビュー ai:gb-chase-stale-target）
    const gbAim = (rush || sub === C_CHASE) && p.targetKind === 2 && !t.gunboat.sunk && !t.gunboat.resolved ? K_TARGET_GUNBOAT | (dirIndex(t.gunboat.dx, t.gunboat.dy) << K_GB_DIR) : 0;
    const hint = (sub === C_BREAK || sub === C_CHASE) && gbAim === 0 && p.gunEnabled && !p.gunEverFired ? K_FIRE_HINT : 0;
    if (sub === C_CHASE) return chaseKey(dirIndex(p.dx, p.dy), p.sighted ? distStep(p.dx, p.dy) : 0, hint) | gbAim;
    const result = sub === C_CLEAN || sub === C_HIT || sub === C_NOFIRE;
    const burst = result && p.burstFired; // 結果が連射なら「計 n 回」（撃った連射の数。上限は出さない＝レビュー ux-7）
    const n = result ? Math.min(15, burst ? p.bursts : p.passes) : 0;
    const m = result && !burst ? Math.min(15, p.maxPasses) : 0;
    const h = sub === C_HIT ? Math.min(63, p.lastPassHits) : 0;
    // 距離の刻み: 突撃は PT まで、離脱は最寄りの大発まで（輸送隊の任務だけ。jp_05 は 0 のまま）。標的の種類: 結果は最後の攻撃の、突撃は今の（連射は自艇だけなので 0）
    const d = sub === C_RUSH_SEEN ? distStep(p.dx, p.dy) : sub === C_BREAK ? convoyNearStep(t.convoy) : 0;
    const kind = result && !burst ? p.lastPassTargetKind : rush ? p.targetKind : 0;
    // 結果の標的が隼艇（連射の結果も。v0.6.6）なら印と、被弾の結果は隼艇の HP。撃たなかった航過の「守った！」は大発か隼艇（kind 0 自艇は「撃たせなかった！」）
    const gbResult = result && p.lastPassTargetKind === 2 ? K_TARGET_GUNBOAT | (sub === C_HIT ? gunboatHpBits(t) : 0) : 0;
    const silenced = sub === C_NOFIRE && !burst && kind !== 0 && p.lastPassSilenced ? K_SILENCED_RESULT : 0;
    return sub | ((rush ? dirIndex(p.dx, p.dy) : 0) << 3) | (d << 6) | (m << 12) | (n << 16) | (h << 20) | hint | (burst ? K_BURST_RESULT : 0) | (kind === 1 ? 1 << K_TARGET : 0) | gbAim | gbResult | silenced;
  }
  const slow = t.targetStep === 'stop' || t.targetStep === 'silent';
  const sub = p.alive === 0 ? N_GONE : p.sighted ? (slow ? N_SLOW : N_FAST) : N_UNSEEN;
  const det = sub === N_FAST ? Math.min(63, Math.round(t.detectRangeM / DETECT_RANGE_STEP_M)) : 0;
  const d = sub === N_SLOW || sub === N_FAST ? distStep(p.dx, p.dy) : 0;
  // みな去った: 海域の外へ出たか 13mm で沈んだ（v0.6.3 実機 1 回目）。みな沈めたら「全隻撃沈」
  const gone = sub === N_GONE ? (t.dawn.reached ? 1 : 0) | (p.out + p.sunk >= p.total ? 2 : 0) | (p.sunk >= p.total ? 4 : 0) : 0;
  // みな去った後の帰投の距離（v0.6.3 レビュー: 夜明けの後は「夜明け 帰投せよ N m」の行の代わりに出るので、距離を消さない。切り上げで輪の外では 0 にならない）。
  // 輸送隊がまだ決着していなければ（v0.6.4 レビュー ux-1）帰投の距離の代わりに浜までの刻みと待ちの旗
  const wait = sub === N_GONE && convoyWaiting(t.convoy);
  const home = sub !== N_GONE ? 0 : wait ? convoyLeftStep(t.convoy) : Math.min(63, Math.max(0, Math.ceil(t.homeEdgeM / HOME_MARKER_DISTANCE_STEP_M)));
  return sub | ((sub === N_SLOW ? dirIndex(p.dx, p.dy) : 0) << 3) | (d << 6) | (det << 12) | ((sub === N_UNSEEN ? Math.min(7, p.alive) : 0) << 18) | (gone << K_GONE) | (home << K_HOME) | (wait ? K_WAIT : 0);
}

/** 2 行目の文と色（key は同じフレームの ptKey。距離・方角・見つかる距離はキーから、航過の数・被弾・隻数はテレメトリから） */
export function ptLine(t: BoatTelemetry, mode: number, key: number): HudLine {
  const p = t.pt;
  if (mode === MISSION_PT_GUN) return ptGunLine(t, key);
  if (mode === MISSION_PT_GUN_EVENT) return ptGunEventLine(key, p.damagePerHit, t.gunboat.labelJa);
  if (mode === MISSION_PT_PASS && (key & K_TARGET_GUNBOAT) !== 0) return gunboatPassLine(key, t.gunboat.labelJa); // 隼艇への航過・連射（v0.6.6）
  if (mode === MISSION_PT_PASS && (key & K_BURST) !== 0) return burstLine(key);
  if (mode === MISSION_PT_PASS && (key & K_SILENCED) !== 0) return { text: '米PT 被弾で沈黙！ もう撃ってこない', color: HOME_COLOR_TEXT };
  const barge = ((key >> K_TARGET) & 1) !== 0; // 標的が大発（v0.6.4。jp_01 だけ立つ）
  if (mode === MISSION_PT_PASS && barge) return convoyPassLine((key & 1) !== 0);
  if (mode === MISSION_PT_PASS) return { text: `米PT ${(key & 1) !== 0 ? '掃射' : '航過'}！ ${(key & 2) !== 0 ? DODGE_STRAIGHT_JA : `${bearingJa(((key >> 2) & 7) * 45)}へ全速で転舵`}`, color: HUD_COLOR_WARN };
  const sub = key & 7;
  const dir = bearingJa(((key >> 3) & 7) * 45);
  const d = ((key >> 6) & 63) * PT_DISTANCE_STEP_M;
  if (mode === MISSION_PT_CONTACT) {
    const gb = (key & K_TARGET_GUNBOAT) !== 0; // 標的が隼艇（v0.6.6。jp_01 のハードだけ立つ）
    if (sub === C_CHASE) return gb ? gunboatChaseLine(key, t.gunboat.labelJa) : chaseLine(key, (key & K_FIRE_HINT) !== 0, p.gunRangeM);
    if (gb && (sub === C_RUSH_SEEN || sub === C_RUSH_HEARD)) return gunboatRushLine(key, dir, d, sub === C_RUSH_SEEN, t.gunboat.labelJa);
    if (gb) return gunboatResultLine(t, key, sub === C_NOFIRE ? -1 : sub === C_HIT ? p.lastPassHits : 0, (key & K_SILENCED_RESULT) !== 0);
    if ((key & K_BURST_RESULT) !== 0) return burstResultLine(p);
    const tally = `航過 ${p.passes}/${p.maxPasses}`;
    if (barge && sub <= C_HIT) return convoyPassResultLine(sub === C_HIT ? p.lastPassHits : 0, p.damagePerHit, tally);
    if (barge && sub === C_NOFIRE) return convoyPassResultLine(-1, p.damagePerHit, tally, (key & K_SILENCED_RESULT) !== 0);
    if (sub === C_CLEAN) return { text: `かわした！ 被弾なし ・ ${tally}`, color: HOME_COLOR_TEXT };
    if (sub === C_HIT) return { text: `被弾 ${p.lastPassHits} 発（HP −${p.lastPassHits * p.damagePerHit}） ・ ${tally}`, color: HUD_COLOR_STRONG };
    if (sub === C_NOFIRE) return { text: `撃たせなかった！ ・ ${tally}`, color: HOME_COLOR_TEXT };
    if (barge && (sub === C_RUSH_SEEN || sub === C_RUSH_HEARD)) return convoyRushLine(dir, d, sub === C_RUSH_SEEN);
    if (sub === C_RUSH_SEEN) return { text: `米PT ${dir}から突撃 ${d} m ・ 赤い線で転舵`, color: HUD_COLOR_WARN };
    if (sub === C_RUSH_HEARD) return { text: `米PT のエンジン音 ・ ${dir}から突撃`, color: HUD_COLOR_WARN };
    // 末尾（v0.6.3 実機 1 回目）: 13mm を撃つ前は右下の射撃を勧め、撃った後は次の赤い線（「静音で見失わせろ」は模擬で見失わせた夜が 0 で、本当でなかった）。
    // 輸送隊（v0.6.4）: 最寄りの大発が遠ければ間に「大発のそばへ戻れ（N m）」（刻みは距離のビット。無ければ ''）
    return { text: `米PT 離脱 ・ ${convoyBreakTailJa((key >> 6) & 63)}${(key & K_FIRE_HINT) !== 0 ? '右下の射撃で撃ち返せ' : '次の赤い線に備えよ'}`, color: HUD_COLOR_STRONG };
  }
  if (sub === N_SLOW) return t.convoy.enabled ? convoySlowLine(d, dir) : { text: `米PT ${d} m（${dir}） ・ 気づかれていない ・ 静音でやり過ごせ`, color: HUD_COLOR_STRONG };
  if (sub === N_FAST) return { text: `米PT ${d} m ・ 速い！ ${((key >> 12) & 63) * DETECT_RANGE_STEP_M} m で見つかる ・ ${p.silentMaxKt} kt 以下に`, color: HUD_COLOR_WARN };
  if (sub === N_UNSEEN) return t.convoy.enabled ? convoyNormalLine(t) : { text: `米PT ${p.alive} 隻が哨戒中 ・ 静音で抜けて帰投`, color: HUD_COLOR_STRONG };
  // みな去る: 去る途中（海域の外へ出ていない PT がいる）は「去る」、みな出たか沈んだら「去った」、みな沈めたら「全隻撃沈」。後ろに帰投の輪の縁までの距離（帰投せよの行と同じ書き方）、
  // 輸送隊の決着の前は「大発の上陸を待て  浜まで N m」
  const gone = (key >> K_GONE) & 7;
  const what = (gone & 4) !== 0 ? '米PT は全隻撃沈' : `米PT は${p.leaveDirJa}へ${(gone & 2) !== 0 ? '去った' : '去る'}`;
  const step = (key >> K_HOME) & 63;
  const tail = (key & K_WAIT) !== 0 ? convoyWaitShoreJa(step) : `帰投せよ  ${step * HOME_MARKER_DISTANCE_STEP_M} m`;
  return { text: `${(gone & 1) !== 0 ? '夜明け ・ ' : ''}${what} ・ ${tail}`, color: HUD_COLOR_STRONG };
}

/** Result の被弾の句: 0 発は「被弾なし」、ほかは「被弾 N 発（HP −x）」。x は最大 HP まで（沈めた 1 発は残りの HP を超えることがある） */
function hitsJa(r: PtResult): string {
  return r.hits === 0 ? '被弾なし' : `被弾 ${r.hits} 発（HP −${Math.min(r.hits * r.damagePerHit, r.hpMax)}）`;
}

/**
 * Result の 4 行目（v0.6.3 実機 1 回目。data/boats.json の gun_battery を合わせる根拠）: 砲の射撃・命中（率）・制圧（実機 2 回目。0 なら出さない）・撃退・撃沈。撃たなかった夜はそう言う。
 * 頭は砲の名（PtResult.gunLabel。jp_05 は「13mm」・jp_01 は「25mm」。v0.6.4）。砲の無い任務は ''（出さない）
 */
function gunResultJa(r: PtResult, gb: GunboatResult | null): string {
  if (!r.gunEnabled) return '';
  if (r.gunShots === 0) return `${r.gunLabel} は撃たなかった`;
  // 自艇の分（v0.6.6。隼艇のいる任務は隊の数から隼艇の分を引く。撃退・撃沈は最後の結末を決めた砲＝和が隊の数）
  const hits = r.gunHits - (gb ? gb.hits : 0);
  // 当てたのに 0% と出さない（レビュー ux-4: 240 発で 1 発は「命中 1（0%）」と読めた）
  const pct = (100 * hits) / r.gunShots;
  return `${r.gunLabel} 射撃 ${r.gunShots} 発 ・ 命中 ${hits}（${hits > 0 && pct < 1 ? '1% 未満' : `${Math.round(pct)}%`}）${suppressResultJa({ suppressions: r.suppressions - (gb ? gb.suppressions : 0) })} ・ 撃退 ${r.retired - (gb ? gb.retired : 0)} ・ 撃沈 ${r.sunk - (gb ? gb.ptSunk : 0)}`;
}

/**
 * Result の本文（spec §D.4。魚雷の行の代わり）: 1 行目 航過・連射（実機 2 回目。0 回なら出さない）・かわした（撃たれた航過と連射のうち無傷。撃たれていなければ出さない）・被弾、2 行目 見つかった回数と最初の距離・速力帯
 * （最初が 13mm の閃光なら「閃光」）・見失わせた回数（一度も見つからなければ PT の最接近）、3 行目 予告から初弾までの最短秒と撃たれた弾（data/enemies.json の調整の根拠。CLAUDE.md §9）、
 * 4 行目 砲の記録（砲の無い任務は ''）。detections は MissionResult.detections、returned は帰投した（見つからずに漂流で終わった夜を「抜けた」と言わない）。
 * 輸送隊の任務（convoy。v0.6.4 の jp_01）: 航過の後に「（大発へ N）」（0 なら出さない）、「見つかった」は「米PT が捉えた」（大発が見つかっても数える）、最初に捉えたのが大発なら帯の代わりに「大発」。
 * 隼艇（gb。v0.6.6 の jp_01 のハード）: 最初に捉えたのが隼艇なら「隼艇」、4 行目は自艇の分
 */
export function ptResultLines(r: PtResult, detections: number, returned: boolean, convoy = false, gb: GunboatResult | null = null): [string, string, string, string] {
  const seen = detections > 0;
  const band = r.firstDetectKind === 1 ? '大発' : r.firstDetectKind === 2 && gb ? gb.labelJa : r.flashFirst ? '閃光' : r.firstDetectBand === '' ? '—' : STEP_LABEL[r.firstDetectBand];
  const onBarges = r.passesOnBarges > 0 ? `（大発へ ${r.passesOnBarges}）` : '';
  const dodged = r.firedPasses > 0 ? ` ・ かわした ${r.cleanPasses}/${r.firedPasses}` : '';
  return [
    seen ? `米PT 航過 ${r.passes} 回${onBarges}${burstsResultJa(r)}${dodged} ・ ${hitsJa(r)}` : returned ? '米PT に一度も見つからずに抜けた' : '米PT に一度も見つからなかった',
    seen ? `${convoy ? '米PT が捉えた' : '見つかった'} ${detections} 回（最初 ${Math.round(r.firstDetectM)} m ・ ${band}） ・ 見失わせた ${r.lostContacts} 回` : `見つからず ・ PT の最接近 ${Number.isFinite(r.closestM) ? Math.round(r.closestM) : '—'} m`,
    `予告から初弾まで 最短 ${Number.isFinite(r.minWarnS) ? r.minWarnS.toFixed(1) : '—'} 秒 ・ 撃たれた弾 ${r.shots} 発`,
    gunResultJa(r, gb),
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
