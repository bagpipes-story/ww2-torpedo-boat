// 任務一覧（Title）と Briefing の文（docs/02 §4、v0.4.0）。Phaser 非依存。data の文と数値から組む（確保は画面を作るときだけ）。
// 史実メモは表示専用の briefing_note_ja だけを使い、調査の記録 historical_note は画面に出さない（CLAUDE.md §11: 実在の人物を出さない）。
import { RAID_EVENT_ID } from './sortie';
import { wrapDeg360 } from './units';
import type { MoonPhase } from './visibility';

export const MENU_STATUS_PLAYABLE = '出撃準備 →';
/** 撃たない任務（v0.6.3。main_weapon none＝米PT）の「条件」の武器の句。和文と英字の間に半角スペースを入れない（Phaser の折り返しは半角スペースで切るので「魚雷は PT⏎の下」と割れた） */
export const NO_WEAPON_BRIEFING_JA = '魚雷はPTの下を抜ける（撃たない）';
/** 米PT の任務で主兵装が砲（v0.6.3 実機 1 回目。jp_05 の T-14 の 13mm）の「条件」の武器の句。和文の中に半角スペースを入れない（同じ理由）。v0.6.4 から ptGunBriefingJa('13mm機銃') と同じ文 */
export const PT_GUN_BRIEFING_JA = '13mm機銃1挺（撃つと閃光で見つかる。魚雷はPTの下を抜ける）';
/** 夜の哨戒機の任務（v0.6.7。jp_02。main_weapon none・魚雷なし）の「条件」の武器の句と、月の行の「見つかる…」の差し替え（空からの見え方。距離は門番の値から） */
export const PATROL_WEAPON_BRIEFING_JA = '武器なし（止まって隠れ、投下で転舵）';
export const patrolAirDetectJa = (wakeM: number, nearM: number): string => `空から 航跡 ${Math.round(wakeM)} m／動く船体 ${Math.round(nearM)} m／停止は見えない`;

/** 米PT の任務の「条件」の武器の句を砲の名（boats.json の gun_battery.label_ja。「13mm機銃」「25mm機銃」）から（v0.6.4。jp_01 の T-38 の 25mm）。数字の後に「機銃」が続くので「13mm1挺」とは読めない */
export function ptGunBriefingJa(label: string): string {
  return `${label}1挺（撃つと閃光で見つかる。魚雷はPTの下を抜ける）`;
}

export interface MenuEntry {
  id: string;
  title: string;
  /** 日付 ・ 場所 */
  sub: string;
  playable: boolean;
  /** 右端の文（出撃準備 → ／ 準備中 ・ 版） */
  status: string;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const VERSION_RE = /^v\d+\.\d+\.\d+$/;

/** '1942-12-11' → '1942年12月11日'（月・日の先頭の 0 は落とす）。書式違いは例外 */
/** Briefing の副題の難易度（v0.6.3 レビュー）: ノーマルは無し、ハードは「 ・ 難易度 ハード」、ハードの違いが無い任務（jp_05）は「（この任務は同じ）」を足す */
export function difficultyJa(hard: boolean, hasHardVariant: boolean): string {
  return hard ? ` ・ 難易度 ハード${hasHardVariant ? '' : '（この任務は同じ）'}` : '';
}

export function formatDateJa(iso: string): string {
  const m = DATE_RE.exec(iso);
  if (!m) throw new Error(`missions_seed.json の date が YYYY-MM-DD でない（${iso}）`);
  return `${m[1]}年${Number(m[2])}月${Number(m[3])}日`;
}

function str(r: Record<string, unknown>, key: string): string | null {
  const v = r[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/**
 * campaignId の任務のうち playable_from を持つものを order 順に。playable = v0_1_prototype が object（遊べる世界がある）。
 * 検査（例外）: playable_from が vX.Y.Z でない、order・title_ja・date・place が無い、日付の書式違い、order の重複、出撃できる任務が 1 件も無い
 */
export function menuEntries(missions: readonly unknown[], campaignId: string): MenuEntry[] {
  const rows: { order: number; e: MenuEntry }[] = [];
  const seen = new Set<number>();
  for (const raw of missions) {
    if (typeof raw !== 'object' || raw === null) continue;
    const r = raw as Record<string, unknown>;
    if (r['campaign'] !== campaignId || r['playable_from'] === undefined) continue;
    const id = str(r, 'id') ?? '?';
    const from = r['playable_from'];
    if (typeof from !== 'string' || !VERSION_RE.test(from)) throw new Error(`missions_seed.json の ${id}.playable_from が vX.Y.Z でない（${String(from)}）`);
    const order = r['order'];
    const title = str(r, 'title_ja');
    const date = str(r, 'date');
    const place = str(r, 'place');
    if (typeof order !== 'number' || !Number.isFinite(order) || !title || !date || !place) throw new Error(`missions_seed.json の ${id} に order / title_ja / date / place が無い`);
    if (seen.has(order)) throw new Error(`missions_seed.json の ${campaignId} で order ${order} が重複している`);
    seen.add(order);
    const proto = r['v0_1_prototype'];
    const playable = typeof proto === 'object' && proto !== null && !Array.isArray(proto);
    rows.push({ order, e: { id, title, sub: `${formatDateJa(date)} ・ ${place}`, playable, status: playable ? MENU_STATUS_PLAYABLE : `準備中 ・ ${from}` } });
  }
  rows.sort((a, b) => a.order - b.order);
  const out = rows.map((x) => x.e);
  if (!out.some((e) => e.playable)) throw new Error(`missions_seed.json の ${campaignId} に出撃できる任務（v0_1_prototype）が無い`);
  return out;
}

/** 資料の注記を落とす: 最初の「（」が 1 文字目より後にあれば、その前を trim。無ければそのまま */
export function shortLabelJa(label: string): string {
  const i = label.indexOf('（');
  return i > 0 ? label.slice(0, i).trim() : label;
}

export function moonLabelJa(m: MoonPhase): string {
  return m === 'dark' ? '新月' : m === 'half' ? '半月' : '満月';
}

/** 出てきた順に、同じ id はまとめて「名前 ×N」、「、」でつなぐ。空なら 'なし' */
export function enemyCountsJa(ids: readonly string[], nameOf: (id: string) => string): string {
  const order: string[] = [];
  const count = new Map<string, number>();
  for (const id of ids) {
    if (!count.has(id)) order.push(id);
    count.set(id, (count.get(id) ?? 0) + 1);
  }
  return order.length === 0 ? 'なし' : order.map((id) => `${nameOf(id)} ×${count.get(id)!}`).join('、');
}

/** skip を除いて「、」でつなぐ。空なら 'なし' */
export function hazardsJa(ids: readonly string[], labelOf: (id: string) => string, skip: readonly string[]): string {
  const out = ids.filter((id) => !skip.includes(id)).map(labelOf);
  return out.length === 0 ? 'なし' : out.join('、');
}

/** 方角の「中央」の幅（海域の幅・高さに対する割合） */
export const COMPASS_CENTER_FRACTION = 0.1;
const COMPASS_JA = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'] as const;

/** 海域の中心から見た 8 方位（y は南が正。北が上） */
export function compassJa(x: number, y: number, w: number, h: number): string {
  const dx = x - w / 2;
  const dy = h / 2 - y;
  if (Math.abs(dx) <= w * COMPASS_CENTER_FRACTION && Math.abs(dy) <= h * COMPASS_CENTER_FRACTION) return '中央';
  const deg = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
  return COMPASS_JA[Math.round(deg / 45) % 8]!;
}

/** 方位 deg（北 0・時計回り）の 8 方位。2 行目の「大発は東から」（航路の向き + 180°、v0.4.2） */
export function bearingJa(deg: number): string {
  return COMPASS_JA[Math.round(wrapDeg360(deg) / 45) % 8]!;
}

export interface BriefingText {
  objective: string;
  success: string;
  moon: MoonPhase;
  enemyIds: readonly string[];
  hazardIds: readonly string[];
  /** 今夜いない危険（v0.4.6。夜の揺らぎ。無ければ []）。「危険」の行の後ろに「（今夜は … なし）」 */
  absentHazardIds?: readonly string[];
  /** 月の行の頭の差し替え（v0.6.7。missions_seed の任意の moon_label_ja。jp_02 の「月没後」＝dark でも新月ではない）。無い任務では鍵ごと出ない */
  moonLabelJa?: string;
}

/** Briefing の数値（world-setup の briefingNumbers が ?debug の上書き込みで作る。Mission と同じ値） */
export interface BriefingNumbers {
  visM: number;
  detectCruiseM: number;
  detectSilentM: number;
  durationS: number;
  /** 「夜明けまで N 秒」の後ろの句（v0.6.1。dawn_air.play_as: enemy は「以後は空襲」、own は「昼の空は味方」。v0.6.2 から夜明けの敵艦: retire は「敵は北へ退く」、hide は「大発は岸へ隠れる」。core/dawn-air の dawnConditionJa） */
  dawnJa: string;
  fuelGal: number;
  torpedoes: number;
  /** 主兵装が砲の任務（v0.4.2）は砲の名前（boats.json の gun_battery.label_ja）。魚雷の任務は '' */
  gunsLabel: string;
  /** 敵の来る方角（8 方位。v0.4.6。夜ごとに変わる。無ければ ''） */
  enemyFromJa: string;
  homeX: number;
  homeY: number;
  boundsW: number;
  boundsH: number;
  /**
   * 帰投地点の方角の差し替え（v0.6.4 レビュー ux-6。輸送隊の任務だけ: 自艇の出発点から見た帰投地点。「敵（東から）」と同じ基準）。
   * 無ければ海域の中心から（compassJa。ほかの任務の文は変わらない）
   */
  homeFromJa?: string;
  /** 「条件」に足す一言（v0.5.2。見越し点マーカーの解放の状態。無ければ ''） */
  aimAssistJa?: string;
  /** 「条件」の武器の句の差し替え（v0.6.3。撃たない任務だけ。無ければ砲か魚雷の本数） */
  weaponJa?: string;
  /** 月の行の「見つかる 巡航 N m／静音 N m」の差し替え（v0.6.7。夜の哨戒機の任務だけ＝patrolAirDetectJa。無い任務では鍵ごと出ない） */
  airDetectJa?: string;
}

export interface BriefingRow {
  label: string;
  text: string;
}

/** 今夜いない危険の後ろ書き（v0.4.6）: 「（今夜は 暴風・友軍誤射 なし）」。無ければ '' */
export function absentJa(ids: readonly string[], labelOf: (id: string) => string): string {
  return ids.length === 0 ? '' : `（今夜は ${ids.map(labelOf).join('・')} なし）`;
}

/**
 * 条件の武器の句（区切りの「・」から）。撃たない任務（v0.6.3）の句は「・」の後をノーブレークスペースにする（v0.6.3 レビュー: 長い句が次の行へ送られ、
 * 「・」が行末に残った。区切りの前の半角スペースで折り返す）。ほかの任務は今までどおり「・ 」
 */
function weaponPartJa(n: BriefingNumbers): string {
  if (n.weaponJa !== undefined) return `・\u00a0${n.weaponJa}`;
  return `・ ${n.gunsLabel ? `砲\u00a0${n.gunsLabel}` : `魚雷 ${n.torpedoes} 本`}`;
}

/**
 * Briefing の 6 行（目的・成功・月・敵・危険・条件）。距離・秒は Math.round、燃料は整数ならそのまま・違えば小数 1 桁。危険から港内空襲を除く（2 択の欄に出す）。
 * 条件の「砲」と砲の名前の間はノーブレークスペース（v0.6.2 レビュー: Phaser の折り返しは半角スペースだけで切るので、us_03 で「砲」が行末に 1 字だけ残った）
 */
export function briefingRows(t: BriefingText, n: BriefingNumbers, nameOf: (id: string) => string, labelOf: (id: string) => string): BriefingRow[] {
  const gal = Number.isInteger(n.fuelGal) ? String(n.fuelGal) : n.fuelGal.toFixed(1);
  return [
    { label: '目的', text: t.objective },
    { label: '成功', text: `${t.success}（帰投地点は${n.homeFromJa ?? compassJa(n.homeX, n.homeY, n.boundsW, n.boundsH)}の青い輪）` },
    { label: '月', text: `${t.moonLabelJa ?? moonLabelJa(t.moon)} ・ 見える ${Math.round(n.visM)} m ・ ${n.airDetectJa ?? `見つかる 巡航 ${Math.round(n.detectCruiseM)} m／静音 ${Math.round(n.detectSilentM)} m`}` },
    { label: '敵', text: `${enemyCountsJa(t.enemyIds, nameOf)}${n.enemyFromJa ? `（${n.enemyFromJa}から）` : ''}` },
    { label: '危険', text: `${hazardsJa(t.hazardIds, labelOf, [RAID_EVENT_ID])}${absentJa(t.absentHazardIds ?? [], labelOf)}` },
    { label: '条件', text: `夜明けまで ${Math.round(n.durationS)} 秒${n.dawnJa} ・ 燃料 ${gal} gal ${weaponPartJa(n)}${n.aimAssistJa ? ` ・ ${n.aimAssistJa}` : ''}` },
  ];
}
