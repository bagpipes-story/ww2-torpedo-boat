// 任務の種の難易度ハード（v0_1_prototype.hard。v0.4.5）の読み出し（v0.6.4 で config/mission-data の getPrototypeMission から切り出し。中身はそのまま）:
// extra_enemy_starts（駆逐艦を足す。enemy_start の任務だけ）・objective_sink_count（撃沈の達成の隻数。v0.6.0）・extra_shore_battery_x_m（沿岸砲を足す。shore_battery の任務だけ）。
// v0.6.6（jp_01）: extra_pt_legs_m（米PT の哨戒線を足す。pt_boats の任務だけ）・convoy_arrive_quota（上陸のノルマ。convoy の任務だけ）・objective_ja／success_ja／note_ja（ハードの Briefing の文。3 つとも有るか無いか）。
// 鍵は hard が偽でも検査し、足す・置き換えるのは hard のときだけ（今までと同じ）。知らない鍵は見ない（他の任務の hard block は今のまま）。
// isNum・readStart もここ（mission-data が import し、isNum は今までの import のために再 export する。ここから mission-data を import すると循環になる）。

/** 出発点（x_m / y_m / heading_deg） */
export interface StartPoint {
  x: number;
  y: number;
  headingDeg: number;
}

export function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function readStart(v: unknown, label: string): { x: number; y: number; headingDeg: number } {
  const r = v as Record<string, unknown> | undefined;
  if (!r || !isNum(r['x_m']) || !isNum(r['y_m']) || !isNum(r['heading_deg'])) {
    throw new Error(`${label} に x_m / y_m / heading_deg が無い`);
  }
  return { x: r['x_m'], y: r['y_m'], headingDeg: r['heading_deg'] };
}

/** ハードの Briefing の文（v0.6.6。objective_ja・success_ja・note_ja）: ノーマルの objective・success・briefing_note_ja の全文の置き換え */
export interface HardText {
  objective: string;
  success: string;
  note: string;
}

/**
 * ハードの読み出しの結果: 全隻の出発点（ハードなら extra_enemy_starts を足す）・全門の沿岸砲（extra_shore_battery_x_m を足す）・撃沈の達成の隻数（無ければ null）。
 * v0.6.6: 足す米PT の哨戒線（extra_pt_legs_m の写し）・上陸のノルマ（convoy_arrive_quota）・Briefing の文。どれもハードでなければ・無ければ null
 */
export interface HardBlock {
  enemyStarts: StartPoint[];
  shoreBatteryXs: number[];
  objectiveSinkCount: number | null;
  ptLegs: number[][] | null;
  convoyQuota: number | null;
  text: HardText | null;
}

const HARD_TEXT_KEYS = ['objective_ja', 'success_ja', 'note_ja'] as const;

/** ハードの Briefing の文（v0.6.6）を検査して読む: 3 つとも空でない文字列か、3 つとも無い（null）。hardRaw は v0_1_prototype.hard（無い・object でなければ null） */
export function readHardText(hardRaw: unknown, missionId: string): HardText | null {
  if (typeof hardRaw !== 'object' || hardRaw === null) return null;
  const r = hardRaw as Record<string, unknown>;
  if (HARD_TEXT_KEYS.every((k) => r[k] === undefined)) return null;
  for (const k of HARD_TEXT_KEYS) {
    const v = r[k];
    if (typeof v !== 'string' || v.length === 0) throw new Error(`${missionId}.v0_1_prototype.hard の ${HARD_TEXT_KEYS.join('・')} は 3 つとも空でない文字列か、3 つとも無い（${k} が違う）`);
  }
  return { objective: r['objective_ja'] as string, success: r['success_ja'] as string, note: r['note_ja'] as string };
}

/** v0_1_prototype.hard を検査して読む（hard block の無い任務ではノーマルと同じ）。enemyStart は駆逐艦の出発点（大発・米PT の任務は null）、b は海域、hosts は米PT の隊・輸送隊の有無（v0.6.6） */
export function readHardBlock(proto: Record<string, unknown>, missionId: string, hard: boolean, enemyStart: StartPoint | null, shoreBattery: { xM: number } | null, b: { width: number; height: number }, hosts: { ptBoats: boolean; convoy: boolean }): HardBlock {
  // 難易度ハード（v0.4.5）: hard block の extra_enemy_starts（駆逐艦を足す。enemy_start の任務だけ）と extra_shore_battery_x_m（沿岸砲を足す。shore_battery の任務だけ）
  const hardRaw = proto['hard'] as Record<string, unknown> | undefined;
  const enemyStarts = enemyStart ? [enemyStart] : [];
  const shoreBatteryXs = shoreBattery ? [shoreBattery.xM] : [];
  let objectiveSinkCount: number | null = null;
  let ptLegs: number[][] | null = null;
  let convoyQuota: number | null = null;
  let text: HardText | null = null;
  if (hardRaw !== undefined) {
    if (typeof hardRaw !== 'object' || hardRaw === null) throw new Error(`${missionId}.v0_1_prototype.hard が object でない（docs/02 §6.4）`);
    const es = hardRaw['extra_enemy_starts'];
    if (es !== undefined) {
      if (!Array.isArray(es) || es.length === 0) throw new Error(`${missionId}.v0_1_prototype.hard.extra_enemy_starts は空でない配列`);
      if (!enemyStart) throw new Error(`${missionId}.v0_1_prototype.hard.extra_enemy_starts は駆逐艦（enemy_start）の任務だけ`);
      if (hard) for (let i = 0; i < es.length; i++) enemyStarts.push(readStart(es[i], `${missionId}.v0_1_prototype.hard.extra_enemy_starts[${i}]`));
    }
    // 撃沈の達成の隻数（v0.6.0。jp_06: T-38 は魚雷 2 本なので、ハードで 2 隻にしても達成は 1 隻）
    const osc = hardRaw['objective_sink_count'];
    if (osc !== undefined && (!Number.isInteger(osc) || (osc as number) < 1 || !Array.isArray(es) || (osc as number) > 1 + (es as unknown[]).length)) throw new Error(`${missionId}.v0_1_prototype.hard.objective_sink_count は 1〜ハードの隻数の整数`);
    if (hard && osc !== undefined) objectiveSinkCount = osc as number;
    const xs = hardRaw['extra_shore_battery_x_m'];
    if (xs !== undefined) {
      if (!Array.isArray(xs) || xs.length === 0 || !xs.every((x) => isNum(x) && x >= 0 && x <= b.width)) throw new Error(`${missionId}.v0_1_prototype.hard.extra_shore_battery_x_m は海域の幅の中の数の配列`);
      if (!shoreBattery) throw new Error(`${missionId}.v0_1_prototype.hard.extra_shore_battery_x_m は沿岸砲（shore_battery）の任務だけ`);
      if (hard) for (const x of xs as number[]) shoreBatteryXs.push(x);
    }
    // 米PT の哨戒線を足す（v0.6.6。jp_01 の 3 隻目）: 4 つの数の線。合計の本数（PT_MAX_COUNT まで）・線の縁・長さは core/pt-data、出発点の検査は config/pt-mission-data がハードの組み立てで見る
    const pl = hardRaw['extra_pt_legs_m'];
    if (pl !== undefined) {
      if (!Array.isArray(pl) || pl.length === 0 || !pl.every((l) => Array.isArray(l) && l.length === 4 && l.every(isNum))) throw new Error(`${missionId}.v0_1_prototype.hard.extra_pt_legs_m は 4 つの数（x0, y0, x1, y1）の線の、空でない配列`);
      if (!hosts.ptBoats) throw new Error(`${missionId}.v0_1_prototype.hard.extra_pt_legs_m は米PT の隊（pt_boats）の任務だけ`);
      if (hard) ptLegs = (pl as number[][]).map((l) => l.slice());
    }
    // 上陸のノルマ（v0.6.6。jp_01 は 3 隻とも）: 1 以上の整数。大発の数以下かは core/convoy-data がハードの組み立てで見る
    const q = hardRaw['convoy_arrive_quota'];
    if (q !== undefined) {
      if (!Number.isInteger(q) || (q as number) < 1) throw new Error(`${missionId}.v0_1_prototype.hard.convoy_arrive_quota は 1 以上の整数`);
      if (!hosts.convoy) throw new Error(`${missionId}.v0_1_prototype.hard.convoy_arrive_quota は輸送隊（convoy）の任務だけ`);
      if (hard) convoyQuota = q as number;
    }
    const t = readHardText(hardRaw, missionId);
    if (hard) text = t;
  }
  return { enemyStarts, shoreBatteryXs, objectiveSinkCount, ptLegs, convoyQuota, text };
}
