// 空襲下の退避（v0.6.11 S5。jp_03。spec-v0611-r2 §10.1・§10.2・§10.3）の HUD の文: 上中央の 2 行目（ui/mission-mode の MISSION_EVAC の中の行。上ほど優先＝evacLineMode）・
// そのキャッシュのキー（evacLineKey。ui/mission-line-keys が lKey の欄で渡す＝mission-line は差し引き 0 行）・3 行目（evacStatusLine。ui/boat-hud の statusText の枝。20 px で ≤ 596 px）・
// 予告の中央の帯と決着の帯の文（ui/dawn-banner・ui/dawn-lines）・地図の上の隊の番号の見え方（ui/evac-markers）。
// 予告の行・そのキー・中央の帯は ui/evac-announce（S8b で分けた。尾の規則 r2 M10・1 編隊ごとの機の数・始まる前に隠れた狙いは「第6隊を見失う」）。
// S8b: スティックを倒したまま引き継いだ（latch SW_WAIT_NEUTRAL）直後の EVAC_TAKE_HOLD_S は「…を引き継いだ ・ 離してから倒すと操る」を予告・出来事より上に（落下の行の下）。
// 文の幅は tests/pt-ui-kit の textWidthPx と同じ見積もり（22 px・U+2000 未満は 0.602 em）。長い場所の名は 840 px を超える時だけ短く（「屋我地の陰（東）」→「陰（東）」。spec §18）。
// jp_03 の文に「夜明け」は無い（tests/evac-lines）。Phaser も DOM を読む config も使わない。毎フレームはキーだけ（数の足し算と掛け算。確保しない）、文は変わったときだけ組む。
import { EVAC_DIST_STEP_M, EVAC_NUM_FOUND, EVAC_NUM_GONE, EVAC_NUM_HIDDEN, EVAC_NUM_MOORED, EVAC_NUM_TARGET, EVAC_NUM_UNDERWAY } from '../config/evac-config';
import { HUD_COLOR_STRONG, HUD_COLOR_WARN } from '../config/hud-text-config';
import { G_ENTERING, G_FOUND, G_GONE, G_HAULING, G_HIDDEN, G_MOORED, G_UNDERWAY, SW_FREE, SW_WAIT_NEUTRAL } from '../core/evac-data';
import { EVAC_HINT_FOUND, EVAC_HINT_FULL } from '../core/evac-squadron';
import {
  EVA_NONE, EVE_DOWN, EVE_FOUND, EVE_GUN, EVE_HIDDEN, EVE_LOST, EVE_SETTLE, EVE_SINK, EVS_GONE, EVS_LEADER, EVS_SEAT, EVS_SEAT_END, type EvacTelemetry,
} from '../core/evac-telemetry';
import { evacAnnounceJa, evacAnnounceKey } from './evac-announce';
import { EVAC_LINE_MAX_PX, EVAC_LINE_PX as LINE_PX, evacGroupJa as groupJa, evacPlaceJa as placeJa, jaWidthPx, mssJa, shortPlaceJa } from './evac-text';
import type { HudLine } from './hud-lines';

// S8b で分けた道具と予告の行（今までの名のまま出す）
export { EVAC_LINE_MAX_PX, EVAC_STATUS_MAX_PX, jaWidthPx, mssJa, shortPlaceJa } from './evac-text';
export { evacAnnounceJa, evacBannerLines } from './evac-announce';

/** 2 行目の行（上ほど優先。evacLineMode） */
export const EVL_FALL = 1;
export const EVL_ANNOUNCE = 2;
export const EVL_SETTLE = 3;
export const EVL_LOST = 4;
export const EVL_SINK = 5;
export const EVL_DOWN = 6;
export const EVL_OUTSIDE = 7;
export const EVL_TAKEN = 8;
export const EVL_NO_ENTRY = 9;
export const EVL_FOUND = 10;
export const EVL_FULL = 11;
export const EVL_HAULING = 12;
export const EVL_ENTERING = 13;
export const EVL_HIDDEN = 14;
export const EVL_FIRE = 15;
export const EVL_GUN = 16;
export const EVL_WAIT = 17;
export const EVL_NO_SHELTER = 18;
export const EVL_NORMAL = 19;

const distJa = (m: number): string => `${Math.ceil(m / EVAC_DIST_STEP_M) * EVAC_DIST_STEP_M} m`;

/** 長い方が 840 px に収まればそれ、収まらなければ場所の名を短くした方 */
function fit(make: (place: string) => string, place: string): string {
  const full = make(place);
  return jaWidthPx(full, LINE_PX) <= EVAC_LINE_MAX_PX ? full : make(shortPlaceJa(place));
}

/** 引き継いだ隊がまだ操れない段階（走る・停泊・見つかった陰。latch が SW_FREE でない間は前の動きか中立） */
const takenPhase = (ph: number): boolean => ph === G_UNDERWAY || ph === G_MOORED || ph === G_FOUND;
/** 引き継いだ行の頭に全滅を言う（全滅の後の自動の切替の直後。全滅の出来事より上に出る間） */
const takenGone = (e: EvacTelemetry): boolean => e.event === EVE_SINK && e.eventSub === EVS_GONE && e.eventGroup !== e.control;

/** 2 行目の行（上ほど優先。spec §10.1 の表の順。入っている途中の行は表に無い＝spec §18 の既定で足した） */
export function evacLineMode(e: EvacTelemetry): number {
  const ph = e.phase;
  const k = e.event;
  const taken = e.latch !== SW_FREE && takenPhase(ph);
  if (e.falling) return EVL_FALL;
  // 倒したまま引き継いだ直後は、スティックが効かない理由を予告・出来事より先に（S8b。予告は赤い輪と端の矢印に出たまま、EVAC_TAKE_HOLD_S の後に戻る）
  if (taken && e.takeHold && e.latch === SW_WAIT_NEUTRAL) return EVL_TAKEN;
  if (e.annKind !== EVA_NONE) return EVL_ANNOUNCE;
  if (k === EVE_SETTLE) return EVL_SETTLE;
  if (k === EVE_LOST) return EVL_LOST;
  if (k === EVE_SINK) return EVL_SINK;
  if (k === EVE_DOWN) return EVL_DOWN;
  if (e.settled) return EVL_OUTSIDE;
  if (taken) return EVL_TAKEN;
  if (e.hint === EVAC_HINT_FOUND) return EVL_NO_ENTRY;
  if (k === EVE_FOUND || ph === G_FOUND) return EVL_FOUND;
  if (e.hint === EVAC_HINT_FULL) return EVL_FULL;
  if (ph === G_HAULING) return EVL_HAULING;
  if (ph === G_ENTERING) return EVL_ENTERING;
  if (k === EVE_HIDDEN) return EVL_HIDDEN;
  if (e.fireGroup >= 0) return EVL_FIRE;
  if (k === EVE_GUN) return EVL_GUN;
  if (ph === G_HIDDEN) return EVL_WAIT;
  if (e.near < 0) return EVL_NO_SHELTER;
  return EVL_NORMAL;
}

/** 2 行目のキー（文が変わる値だけ。出来事の行は通し番号＝中身は出来事ごとに固定）。2^53 未満の整数 */
export function evacLineKey(e: EvacTelemetry): number {
  const m = evacLineMode(e);
  let k = 0;
  switch (m) {
    case EVL_FALL:
      k = e.latch === SW_WAIT_NEUTRAL ? 1 : 0;
      break;
    case EVL_ANNOUNCE:
      k = evacAnnounceKey(e);
      break;
    case EVL_SETTLE: case EVL_LOST: case EVL_SINK: case EVL_DOWN: case EVL_HIDDEN: case EVL_GUN:
      k = e.eventSeq;
      break;
    case EVL_OUTSIDE: case EVL_NORMAL:
      k = ((e.control * 8 + e.near + 1) * 8 + e.nearFree) * 1024 + Math.min(1023, Math.ceil(e.nearEdgeM / EVAC_DIST_STEP_M));
      break;
    case EVL_TAKEN:
      k = ((((e.control * 8 + e.phase) * 8 + e.shelter + 1) * 4 + e.latch) * 2 + (takenGone(e) ? 1 : 0)) * 8 + (takenGone(e) ? e.eventGroup : 0);
      break;
    case EVL_ENTERING:
      k = (e.control * 8 + e.phase) * 8 + e.shelter + 1;
      break;
    case EVL_NO_ENTRY:
      k = e.hintShelter + 1;
      break;
    case EVL_FOUND:
      k = e.event === EVE_FOUND ? e.eventSeq * 2 : (e.control * 8 + e.shelter + 1) * 2 + 1;
      break;
    case EVL_FULL:
      k = ((e.hintShelter + 1) * 8 + e.hintFree) * 8 * 8 + e.control * 8 + e.afloat;
      break;
    case EVL_HAULING:
      k = (((e.shelter + 1) * 8 + e.upCount) * 16 + e.afloat * 2 + (e.hauling ? 1 : 0)) * 128 + e.haulPct + 1;
      break;
    case EVL_FIRE:
      k = e.fireGroup;
      break;
    case EVL_WAIT:
      k = e.coverHold > 0 ? -e.coverHold : (((e.control * 8 + e.shelter + 1) * 4 + e.latch) * 512) + Math.min(511, Math.ceil(e.leftS));
      break;
    default:
      k = 0;
  }
  return m * 2 ** 40 + k;
}

/**
 * 沈没の行（spec §10.1。r2 H2: 狙われていなければ尾なし）。座席の隊長艇が乗り移らずに沈む（S8b の EVS_SEAT_END: 決着の後か浮いている艇がほかに無い＝任務は沈没で終わる）は
 * 「空襲の後は乗り移れない」「全 18 隻が沈んだ」（今まで「僚艇に乗り移った」と出た）
 */
function sinkJa(e: EvacTelemetry): string {
  const g = groupJa(e, e.eventGroup);
  const n = e.eventN;
  if (e.eventSub === EVS_SEAT_END) return n === 0 ? `隊長艇 沈没！ 全 ${e.total} 隻が沈んだ` : `隊長艇 沈没！ 空襲の後は乗り移れない（残存 ${n}）`;
  if (e.eventSub === EVS_GONE) return `${g} 全滅（残存 ${n}）${e.eventTargeted ? ` ・ ${g}を狙った編隊が去る` : ''}`;
  if (e.eventSub === EVS_SEAT) return `隊長艇 沈没！ 僚艇に乗り移った（残存 ${n}）${e.eventTargeted ? ' ・ 編隊はまだ追ってくる' : ''}`;
  if (e.eventSub === EVS_LEADER) return `${g}の隊長艇 沈没 ・ 僚艇が隊長艇に（残存 ${n}）${e.eventTargeted ? ` ・ 編隊は${g}を追う` : ''}`;
  return `${g}の僚艇 沈没（残存 ${n}）`;
}

/** 2 行目の文と色（モードが変わったか evacLineKey が変わったときだけ呼ぶ） */
export function evacLine(e: EvacTelemetry): HudLine {
  const g = groupJa(e, e.control);
  const warn = (text: string): HudLine => ({ text, color: HUD_COLOR_WARN });
  const strong = (text: string): HudLine => ({ text, color: HUD_COLOR_STRONG });
  switch (evacLineMode(e)) {
    case EVL_FALL:
      return warn(e.latch === SW_WAIT_NEUTRAL ? '爆弾投下！ 一度離してから転舵！' : '爆弾投下！ 転舵！'); // 倒したまま引き継いだ直後はスティックが効かない（S8b）
    case EVL_ANNOUNCE:
      return warn(evacAnnounceJa(e));
    case EVL_SETTLE:
      // 全艇が隠れて空襲を待たずに決着（v0.6.11 IP1 の U8。この後すぐ Result）
      return strong(e.early ? `全艇が隠れた ・ 空襲を待たずに退避完了（残存 ${e.eventN}）` : `第1次の空襲が去った ・ 残存 ${e.eventN} で確定`);
    case EVL_LOST:
      return strong(`${groupJa(e, e.eventGroup)}を見失った！ ${e.eventSub}機が引き返す`);
    case EVL_SINK:
      return warn(sinkJa(e));
    case EVL_DOWN:
      return strong(e.eventN > 0 ? `敵機 1 機を撃墜（${groupJa(e, e.eventGroup)}を狙う編隊は残り ${e.eventN} 機）` : `敵機 1 機を撃墜（${groupJa(e, e.eventGroup)}を狙った編隊は全機撃墜）`);
    case EVL_OUTSIDE: {
      const chase = e.dawnPlanes > 0 ? `（敵機 ${e.dawnPlanes} 機が追う）` : '';
      return warn(e.near >= 0 ? fit((p) => `${g}を壕か陰へ${chase} ・ ${p} ${distJa(e.nearEdgeM)}`, placeJa(e, e.near)) : `${g}を壕か陰へ${chase}`);
    }
    case EVL_TAKEN: {
      // 倒したまま（SW_WAIT_NEUTRAL）はスティックが効かない＝「離してから」と警告の色で（S8b）。全滅の後の自動の切替の直後は頭に全滅（逃げる針路の句は 840 px に収めるため落とす）
      const held = e.latch === SW_WAIT_NEUTRAL;
      const gone = takenGone(e) ? `${groupJa(e, e.eventGroup)} 全滅 ・ ` : '';
      const mid = e.phase === G_UNDERWAY && gone === '' ? ' ・ 逃げる針路と速さのまま' : '';
      const text = `${gone}${g}を引き継いだ${mid} ・ ${held ? '離してから倒すと操る' : '倒すと操る'}`;
      return held ? warn(text) : strong(text);
    }
    case EVL_NO_ENTRY:
      return warn(fit((p) => `${p}は見つかった ・ 輪の外へ出てから入り直せ`, placeJa(e, e.hintShelter)));
    case EVL_FOUND: {
      const ev = e.event === EVE_FOUND;
      return warn(fit((p) => `${p}が見つかった！ ${groupJa(e, ev ? e.eventGroup : e.control)}を動かせ`, placeJa(e, ev ? e.eventShelter : e.shelter)));
    }
    case EVL_FULL:
      return warn(fit((p) => `${p}は満杯（空き ${e.hintFree} ・ ${g}は ${e.afloat} 隻）`, placeJa(e, e.hintShelter)));
    case EVL_HAULING: {
      // レールの上の艇の進み %（v0.6.11 IP1 の U9。地図の上のレールの下の札と同じ数）。840 px を超えれば尾を「倒すと下ろす」に、まだ超えれば % を落とす
      const n = `${Math.min(e.afloat, e.upCount + (e.hauling ? 1 : 0))}/${e.afloat}`;
      const pct = e.haulPct >= 0 ? `（${e.haulPct}%）` : '';
      const make = (tail: string, k: string) => (p: string): string => `${p} レールで上げている ${n}${k} ・ 隊長艇は最後 ・ ${tail}`;
      const place = placeJa(e, e.shelter);
      for (const [tail, k] of [['倒すとやめて下ろす', pct], ['倒すと下ろす', pct]] as const) {
        const text = fit(make(tail, k), place);
        if (jaWidthPx(text, LINE_PX) <= EVAC_LINE_MAX_PX) return strong(text);
      }
      return strong(fit(make('倒すとやめて下ろす', ''), place));
    }
    case EVL_ENTERING:
      return strong(fit((p) => `${g} ${p}に入る ・ 僚艇が寄るまで止まれ`, placeJa(e, e.shelter)));
    case EVL_HIDDEN:
      return strong(fit((p) => `${groupJa(e, e.eventGroup)} ${p}に隠れた ・ ［切替］で次の隊へ`, placeJa(e, e.eventShelter)));
    case EVL_FIRE:
      return warn(`${groupJa(e, e.fireGroup)}の隊長艇が燃えている ・ 切り替えて消火`);
    case EVL_GUN:
      return strong(`機銃は僚艇も撃つ（${e.eventN}隻で対空）`);
    case EVL_WAIT: {
      // 全艇が隠れたが陰の隊が予告で見つかりうる間（IP1 の案 B）は、早く終わらない訳と終わる時を言う
      if (e.coverHold > 0) return strong(`陰の隊は予告で見つかることがある ・ 第${e.coverHold}波の予告の後に退避完了`);
      const tail = e.latch === SW_WAIT_NEUTRAL ? '離してから倒すと出る' : '倒すと出る';
      return strong(fit((p) => `${g} ${p}で待機 ・ 空襲が去るまで ${mssJa(e.leftS)} ・ ${tail}`, placeJa(e, e.shelter)));
    }
    case EVL_NO_SHELTER:
      return warn('隠れる所が無い ・ 切り替えてほかの隊を見よ');
    default:
      return strong(fit((p) => `${g}を操作中 ・ 近い隠れ場所 ${p} 空き ${e.nearFree} ・ ${distJa(e.nearEdgeM)}`, placeJa(e, e.near)));
  }
}

/** 3 行目のキー（操作中の隊・3 隻の HP（切り上げ）・残存・隠れている艇・次の波の秒か「波なし」「確定」）。2^53 未満 */
export function evacStatusKey(e: EvacTelemetry): number {
  let k = e.control;
  for (let i = 0; i < 3; i++) k = k * 128 + (e.hp[i]! < 0 ? 127 : Math.ceil(e.hp[i]!));
  k = k * 32 + e.survivors;
  k = k * 32 + e.hiddenBoats;
  return k * 1024 + (e.settled ? 1023 : Number.isNaN(e.nextWaveS) ? 1022 : Math.min(1021, Math.ceil(e.nextWaveS)));
}

/** 3 行目（20 px で ≤ 596 px）: 「第3隊 HP 60・60・60 ・ 残 18／18 ・ 隠 15 ・ 次 0:18」（沈んだ艇は「沈」、最後の波の後は「波なし」、決着の後は「確定」） */
export function evacStatusLine(e: EvacTelemetry): string {
  let hp = '';
  for (let i = 0; i < 3; i++) hp += `${i > 0 ? '・' : ''}${e.hp[i]! < 0 ? '沈' : Math.ceil(e.hp[i]!)}`;
  const next = e.settled ? '確定' : Number.isNaN(e.nextWaveS) ? '波なし' : `次 ${mssJa(e.nextWaveS)}`;
  return `${groupJa(e, e.control)} HP ${hp} ・ 残 ${e.survivors}／${e.total} ・ 隠 ${e.hiddenBoats} ・ ${next}`;
}

/**
 * 決着（240 秒）の中央の帯（ui/dawn-lines の dawnBannerLines が day_start の任務だけ呼ぶ）。strike は §2 の 4 機の説明（来ない夜は ''）。
 * 外の夜（strike あり）は「確定」と言わない（v0.6.11 S8: 外の座席が追撃で沈めば残存は 1 減る＝core/evac-seat の evacSinkLeader）
 */
export function evacSettleBannerLines(e: EvacTelemetry, strike: string): readonly string[] {
  if (e.early) return ['全艇が隠れた ・ 空襲を待たずに退避完了', `残存 ${e.survivors}／${e.total} で確定（${e.quota} 隻以上で達成）`]; // v0.6.11 IP1 の U8（操作中の隊は隠れている＝追撃なし）
  const head = '第1次の空襲が去った';
  if (!strike) return [head, `残存 ${e.survivors}／${e.total} で確定（${e.quota} 隻以上で達成）`];
  return [head, `残存 ${e.survivors}／${e.total}（${e.quota} 隻以上で達成 ・ 隊長艇が沈めば 1 減る）`, `${strike} ・ 壕か陰へ`];
}

/** 地図の上の隊の番号の見え方（ui/evac-markers。変わったときだけ色と字を書く）: 0 停泊・1 走る・2 隠れた・3 見つかった・4 狙われている・5 全滅 */
export function evacNumberLook(phase: number, targeted: boolean): number {
  if (phase === G_GONE) return 5;
  if (targeted) return 4;
  if (phase === G_FOUND) return 3;
  if (phase === G_HIDDEN) return 2;
  return phase === G_MOORED ? 0 : 1;
}

/** 見え方の色（evacNumberLook の順） */
export const EVAC_NUMBER_COLORS: readonly string[] = [EVAC_NUM_MOORED, EVAC_NUM_UNDERWAY, EVAC_NUM_HIDDEN, EVAC_NUM_FOUND, EVAC_NUM_TARGET, EVAC_NUM_GONE];

/** 入っている途中（ENTERING）・上げている（HAULING）も「隠れ場所の中」に数える段階か（端の矢印を出さない） */
export function evacInShelterPhase(phase: number): boolean {
  return phase === G_ENTERING || phase === G_HAULING || phase === G_HIDDEN;
}
