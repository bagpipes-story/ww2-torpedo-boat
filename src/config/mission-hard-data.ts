// 任務の種の難易度ハード（v0_1_prototype.hard。v0.4.5）の読み出し（v0.6.4 で config/mission-data の getPrototypeMission から切り出し。中身はそのまま）:
// extra_enemy_starts（駆逐艦を足す。enemy_start の任務だけ）・objective_sink_count（撃沈の達成の隻数。v0.6.0）・extra_shore_battery_x_m（沿岸砲を足す。shore_battery の任務だけ）。
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

/** ハードの読み出しの結果: 全隻の出発点（ハードなら extra_enemy_starts を足す）・全門の沿岸砲（extra_shore_battery_x_m を足す）・撃沈の達成の隻数（無ければ null） */
export interface HardBlock {
  enemyStarts: StartPoint[];
  shoreBatteryXs: number[];
  objectiveSinkCount: number | null;
}

/** v0_1_prototype.hard を検査して読む（hard block の無い任務ではノーマルと同じ）。enemyStart は駆逐艦の出発点（大発・米PT の任務は null）、b は海域 */
export function readHardBlock(proto: Record<string, unknown>, missionId: string, hard: boolean, enemyStart: StartPoint | null, shoreBattery: { xM: number } | null, b: { width: number; height: number }): HardBlock {
  // 難易度ハード（v0.4.5）: hard block の extra_enemy_starts（駆逐艦を足す。enemy_start の任務だけ）と extra_shore_battery_x_m（沿岸砲を足す。shore_battery の任務だけ）
  const hardRaw = proto['hard'] as Record<string, unknown> | undefined;
  const enemyStarts = enemyStart ? [enemyStart] : [];
  const shoreBatteryXs = shoreBattery ? [shoreBattery.xM] : [];
  let objectiveSinkCount: number | null = null;
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
  }
  return { enemyStarts, shoreBatteryXs, objectiveSinkCount };
}
