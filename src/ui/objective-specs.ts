// 任務の行（v0.8.5 IP7。ui/objective-line）の任務ごとの文・キー・色の段。どの任務の行かはテレメトリの鍵で 1 回だけ決める（objectiveSpecOf。Hud の create）。
// 成否に関わる数のある任務だけ（CHANGELOG v0.8.5 IP7 の棚卸し）: 救助 us_07・空襲下の退避 jp_03・揚陸 jp_04・大発の輸送隊 jp_01・報告 us_05・大発掃討 us_03・僚艇 us_01。
// 沈めて帰る（us_02・us_04・us_06・jp_06）と生きて帰る（jp_02・jp_05）は成否の数が無いので行を作らない（null）＝HUD は IP5 のまま。
// - key: 文が変わる数だけを詰めた 0 以上の整数（毎フレーム。確保しない）。text: key が変わった時だけ組む。tone: 色の段（常・達成の青・警告の色）。
// - 2 行目・3 行目の常の文からは同じ数を抜いた（同じ数を 2 段に出さない。出来事の行は今のまま）: ui/mission-line の平常（僚艇の HP・大発の撃破）・ui/convoy-lines の平常・ui/landing-lines の平常・
//   ui/recon-texts の追尾・ui/evac-lines の 3 行目（残存・隠れた）と待機（空襲が去るまで＝左上の時計と同じ数）。
// 読むのはテレメトリの数だけ（世界は読まない）。Phaser・DOM を読まない（tests が node で読む）。
import { OBJECTIVE_DONE_JA, OBJECTIVE_FAIL_JA, OBJECTIVE_TAG_JA } from '../config/objective-hud-config';
import type { BoatTelemetry } from '../core/boat-telemetry';
import { LD_DONE, LD_SUNK } from '../core/landing';
import { RECON_PENDING, RECON_RELAYED, RECON_SENT, RECON_TRACKING } from '../core/recon-report';
import { landingPct } from './landing-lines';
import { rescueMissionLineJa, rescueMissionLineKey } from './rescue-texts';

/** 色の段: 常（任務の橙）・達成の数に届いた（味方の青）・届かない／危うい（警告の色） */
export const OBJ_TONE_NORMAL = 0, OBJ_TONE_DONE = 1, OBJ_TONE_WARN = 2;

/** 任務ごとの文の差し替え（ui/objective-line が持つ。作るのは Hud の create で 1 回） */
export interface ObjectiveSpec {
  /** 種類の名（tests と道具の見分け） */
  readonly id: string;
  key(t: BoatTelemetry): number;
  text(t: BoatTelemetry): string;
  tone(t: BoatTelemetry): number;
}

const DONE = ` ・ ${OBJECTIVE_DONE_JA}`;
const FAIL = ` ・ ${OBJECTIVE_FAIL_JA}`;

/** 救助（us_07。IP5 の文とキーのまま＝ui/rescue-texts） */
export const RESCUE_OBJECTIVE: ObjectiveSpec = {
  id: 'rescue',
  key: (t) => rescueMissionLineKey(t.rescue!),
  text: (t) => rescueMissionLineJa(t.rescue!),
  tone: (t) => (t.rescue!.delivered >= t.rescue!.objective ? OBJ_TONE_DONE : OBJ_TONE_NORMAL),
};

/**
 * 空襲下の退避（jp_03）: 「［任務］残存 18/18（6 隻で達成） ・ 隠れた 15」。決着の後は「 ・ 空襲が去った」、ノルマを割れば（もう届かない）「 ・ 未達」。
 * 空襲が去るまでの時計は左上の「空襲 残り m:ss」（ui/dawn-clock）が出すので入れない
 */
export const EVAC_OBJECTIVE: ObjectiveSpec = {
  id: 'evac',
  key: (t) => {
    const e = t.evac;
    return ((e.settled ? 1 : 0) * 32 + Math.min(31, e.hiddenBoats)) * 32 + Math.min(31, e.survivors);
  },
  text: (t) => {
    const e = t.evac;
    const tail = e.survivors < e.quota ? FAIL : e.settled ? ' ・ 空襲が去った' : '';
    return `${OBJECTIVE_TAG_JA}残存 ${e.survivors}/${e.total}（${e.quota} 隻で達成） ・ 隠れた ${e.hiddenBoats}${tail}`;
  },
  tone: (t) => (t.evac.survivors < t.evac.quota ? OBJ_TONE_WARN : t.evac.settled ? OBJ_TONE_DONE : OBJ_TONE_NORMAL),
};

/** 揚陸（jp_04）: 「［任務］輸送船 揚陸 63% ・ 被雷 0/3 ・ 見届けて帰投」。完了は「揚陸完了 ・ 帰投で達成」、揚陸の前に沈めば「輸送船 沈没 ・ 未達」 */
export const LANDING_OBJECTIVE: ObjectiveSpec = {
  id: 'landing',
  key: (t) => {
    const l = t.landing;
    return l.phase | (l.sunkAfterDone ? 4 : 0) | (landingPct(l.pct) << 3) | (Math.min(63, l.hits) << 10);
  },
  text: (t) => {
    const l = t.landing;
    if (l.phase === LD_DONE) return `${OBJECTIVE_TAG_JA}揚陸完了${l.sunkAfterDone ? '（輸送船は沈没）' : ''}${DONE}`;
    if (l.phase === LD_SUNK) return `${OBJECTIVE_TAG_JA}輸送船 沈没${FAIL}`;
    return `${OBJECTIVE_TAG_JA}輸送船 揚陸 ${landingPct(l.pct)}% ・ 被雷 ${l.hits}/${l.hitsToSink} ・ 見届けて帰投`;
  },
  tone: (t) => (t.landing.phase === LD_DONE ? OBJ_TONE_DONE : t.landing.phase === LD_SUNK ? OBJ_TONE_WARN : OBJ_TONE_NORMAL),
};

/** 大発の輸送隊（jp_01）: 「［任務］大発 上陸 1/3（2 隻で達成） ・ 航行中 2」。ノルマに届けば「帰投で達成」、届かなくなれば「未達」。quota は data の arrive_quota（ハードの上書き込み） */
export function convoyObjective(quota: number): ObjectiveSpec {
  return {
    id: 'convoy',
    key: (t) => Math.min(7, t.convoy.afloat) | (Math.min(7, t.convoy.arrived) << 3),
    text: (t) => {
      const c = t.convoy;
      const head = `${OBJECTIVE_TAG_JA}大発 上陸 ${c.arrived}/${c.total}`;
      if (c.arrived >= quota) return `${head}${DONE}${c.afloat > 0 ? ` ・ 航行中 ${c.afloat}` : ''}`;
      return `${head}（${quota} 隻で達成） ・ 航行中 ${c.afloat}${c.arrived + c.afloat < quota ? FAIL : ''}`;
    },
    tone: (t) => (t.convoy.arrived >= quota ? OBJ_TONE_DONE : t.convoy.arrived + t.convoy.afloat < quota ? OBJ_TONE_WARN : OBJ_TONE_NORMAL),
  };
}

/** 報告（us_05）: 確かめる前「報告: 戦艦を目で確かめ、レーダーで追う」→「報告: 追尾 12 秒 ・ あと 8 秒」→ 中継待ち（警告の色）→「報告済み ・ 帰投で達成」 */
export const RECON_OBJECTIVE: ObjectiveSpec = {
  id: 'recon',
  key: (t) => {
    const r = t.recon!;
    return r.stage * 1048576 + (r.radioBroken ? 524288 : 0) + (r.stage === RECON_TRACKING ? Math.min(511, Math.floor(r.trackedS)) * 512 + Math.min(511, Math.ceil(r.trackLeftS)) : 0);
  },
  text: (t) => {
    const r = t.recon!;
    const radio = r.radioBroken ? ' ・ 無線故障' : '';
    if (r.stage === RECON_SENT || r.stage === RECON_RELAYED) return `${OBJECTIVE_TAG_JA}報告済み${DONE}`;
    if (r.stage === RECON_PENDING) return `${OBJECTIVE_TAG_JA}報告: 無線故障 ・ 黄色い輪で中継`;
    if (r.stage === RECON_TRACKING) return `${OBJECTIVE_TAG_JA}報告: 追尾 ${Math.floor(r.trackedS)} 秒 ・ あと ${Math.ceil(r.trackLeftS)} 秒${radio}`;
    return `${OBJECTIVE_TAG_JA}報告: ${r.identifyJa}を目で確かめ、レーダーで追う${radio}`;
  },
  tone: (t) => {
    const s = t.recon!.stage;
    return s === RECON_SENT || s === RECON_RELAYED ? OBJ_TONE_DONE : s === RECON_PENDING ? OBJ_TONE_WARN : OBJ_TONE_NORMAL;
  },
};

/** 大発掃討（us_03）: 「［任務］大発 撃破 2/3 ・ 上陸 1 ・ 残り 3」。ノルマに届けば「帰投で達成 ・ 残り N」、届かなくなれば「未達」 */
const bargesLeft = (t: BoatTelemetry): number => Math.max(0, t.bargesTotal - t.bargesSunk - t.bargesBeached);
export const BARGE_OBJECTIVE: ObjectiveSpec = {
  id: 'barge',
  key: (t) => Math.min(31, t.bargesSunk) | (Math.min(31, t.bargesBeached) << 5) | (Math.min(31, t.bargesTotal) << 10),
  text: (t) => {
    const head = `${OBJECTIVE_TAG_JA}大発 撃破 ${t.bargesSunk}/${t.bargesQuota}`;
    if (t.bargesSunk >= t.bargesQuota) return `${head}${DONE} ・ 残り ${bargesLeft(t)}`;
    return `${head} ・ 上陸 ${t.bargesBeached} ・ 残り ${bargesLeft(t)}${t.bargesSunk + bargesLeft(t) < t.bargesQuota ? FAIL : ''}`;
  },
  tone: (t) => (t.bargesSunk >= t.bargesQuota ? OBJ_TONE_DONE : t.bargesSunk + bargesLeft(t) < t.bargesQuota ? OBJ_TONE_WARN : OBJ_TONE_NORMAL),
};

/** 僚艇（us_01）: 「［任務］要人の僚艇 HP 85/100 ・ 連れて帰投で達成」。沈めば「要人の僚艇 沈没 ・ 未達」 */
export const ESCORT_OBJECTIVE: ObjectiveSpec = {
  id: 'escort',
  key: (t) => (t.escortSunk ? 4096 : Math.min(4095, Math.max(0, Math.ceil(t.escortHp)))),
  text: (t) => (t.escortSunk ? `${OBJECTIVE_TAG_JA}要人の僚艇 沈没${FAIL}` : `${OBJECTIVE_TAG_JA}要人の僚艇 HP ${Math.max(0, Math.ceil(t.escortHp))}/${t.escortHpMax} ・ 連れて${OBJECTIVE_DONE_JA}`),
  tone: (t) => (t.escortSunk ? OBJ_TONE_WARN : OBJ_TONE_NORMAL),
};

/**
 * どの任務の行か（Hud の create で 1 回。Mission が launch の前にテレメトリを 1 回書く）。成否の数の無い任務は null（行を作らない）。
 * 順は任務の鍵の重ならない順（救助・退避・揚陸・輸送隊・報告・大発・僚艇）。convoyQuota は data の arrive_quota（輸送隊の無い任務は使わない）
 */
export function objectiveSpecOf(t: BoatTelemetry, convoyQuota: number): ObjectiveSpec | null {
  if (t.rescue) return RESCUE_OBJECTIVE;
  if (t.evac.enabled) return EVAC_OBJECTIVE;
  if (t.landing.enabled) return LANDING_OBJECTIVE;
  if (t.convoy.enabled) return convoyObjective(convoyQuota);
  if (t.recon) return RECON_OBJECTIVE;
  if (t.gunMission) return BARGE_OBJECTIVE;
  if (t.escortEnabled) return ESCORT_OBJECTIVE;
  return null;
}
