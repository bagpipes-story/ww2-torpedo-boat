// 夜明けに敵が退く（v0.6.2。docs/02 §6.7）: missions_seed の v0_1_prototype.dawn_withdraw（enemy_ships_at_dawn が retire の任務だけ）の読み出し、
// 退く向き（今夜の左右反転込み）、海域の外へ出たかの判定、隊の「沈んだ・退いた」の数え方。Phaser 非依存・判定の関数は確保しない。
// 退くのは夜明けのラッチ（systems/world-dawn）の 1 回だけで始まる。夜明け前は誰も retiring / withdrawn を立てないので、ここの関数の値は v0.6.1 と同じ。
import type { SeaBounds } from './boat-motion';

/** 退く先の海域の縁（retire の任務。us_02 は north＝スロットを北へ戻る） */
export type RetireEdge = 'north' | 'south' | 'east' | 'west';

export const RETIRE_EDGES: readonly RetireEdge[] = ['north', 'south', 'east', 'west'];

export interface DawnWithdraw {
  retireEdge: RetireEdge;
  /** 退く敵の呼び名（夜明けの帯の「東京急行は北へ退く」。us_02 は「東京急行」） */
  forceJa: string;
}

const DAWN_WITHDRAW_KEYS: readonly string[] = ['retire_edge', 'force_ja', 'source'];

/**
 * v0_1_prototype.dawn_withdraw を読む。例外は任務の id を付ける: object でない、知らないキー、retire_edge が north・south・east・west の外、
 * force_ja が空か文字列でない、source が無いか historical / design のどちらも書いていない（CLAUDE.md §8）。任務の種類との食い違い（retire ⇔ 駆逐艦など）は config/dawn-data の checkPlayableDawn
 */
export function dawnWithdrawFromData(raw: unknown, missionId: string): DawnWithdraw {
  const at = `missions_seed ${missionId} の v0_1_prototype.dawn_withdraw`;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`${at} は object（retire_edge / source）`);
  const r = raw as Record<string, unknown>;
  for (const k of Object.keys(r)) if (!DAWN_WITHDRAW_KEYS.includes(k)) throw new Error(`${at} に知らないキー ${k}`);
  const edge = r['retire_edge'];
  if (typeof edge !== 'string' || !(RETIRE_EDGES as readonly string[]).includes(edge)) throw new Error(`${at}.retire_edge は north・south・east・west のどれか（${String(edge)}）`);
  const source = r['source'];
  const force = r['force_ja'];
  if (typeof force !== 'string' || force.trim() === '') throw new Error(`${at}.force_ja（退く敵の呼び名。夜明けの帯）が無いか空`);
  if (typeof source !== 'string' || !/historical|design/.test(source)) throw new Error(`${at}.source が無いか、historical / design のどちらも書いていない`);
  return { retireEdge: edge as RetireEdge, forceJa: force };
}

/**
 * 退く向き（0=北、時計回り）。今夜の左右反転（systems/world-night の applyNight。東西だけ入れ替える）の夜は east と west を入れ替える
 * （敵の来た側へ帰る）。north・south は反転の影響を受けない
 */
export function retireHeadingDeg(edge: RetireEdge, mirrored: boolean): number {
  switch (edge) {
    case 'north':
      return 0;
    case 'south':
      return 180;
    case 'east':
      return mirrored ? 270 : 90;
    case 'west':
      return mirrored ? 90 : 270;
  }
}

/** 退く方角の日本語（北・東・南・西。retireHeadingDeg と同じく左右反転の夜は東西を入れ替える）。Briefing の条件・夜明けの帯・Result の行 */
export function retireDirJa(edge: RetireEdge, mirrored: boolean): string {
  const h = retireHeadingDeg(edge, mirrored);
  return h === 0 ? '北' : h === 90 ? '東' : h === 180 ? '南' : '西';
}

/** 中心が海域の外へ marginM より遠く出た（退く艦の船体が縁の外へ抜けた＝退避の完了。比較だけ・平方根なし）。marginM は艦の boundsMarginM（絵の半長） */
export function beyondBounds(x: number, y: number, b: SeaBounds, marginM: number): boolean {
  return x < -marginM || y < -marginM || x > b.width + marginM || y > b.height + marginM;
}

/**
 * 1 本の記録の kpiTarget（通算の命中率に入れるか。v0.6.2 レビュー）: 艦が退く任務（retireHeadingDeg が NaN でない）で夜明けのラッチの後に決着した魚雷は入れない
 * （夜明けの前に撃っても、走っている間に艦が全速で向きを変えるので、その外れが夜戦の調整の根拠に混ざる）。退かない任務と夜明け前は kpiTarget のまま（v0.6.1 と同じ）
 */
export function shotKpiTarget(kpiTarget: boolean, dawnReached: boolean, retireHeadingDeg: number): boolean {
  return kpiTarget && !(dawnReached && !Number.isNaN(retireHeadingDeg));
}

// ---------- 隊の数え方（systems/destroyer-group がそのまま使う。entities/destroyer が満たす） ----------

/** 隊の 1 隻の「もう狙えない」の内訳。sinking は沈没演出中か沈没済み、sunk は演出の終わり、withdrawn は夜明けに海域を出た */
export interface ShipOutState {
  readonly sinking: boolean;
  readonly sunk: boolean;
  readonly withdrawn: boolean;
}

/** 先頭 n 隻（駆逐艦。後ろは輸送船）のうち沈み始めた数。退いた艦は撃沈に数えない（撃沈の表示・任務の達成） */
export function sinkingCount(ships: readonly ShipOutState[], n: number): number {
  let k = 0;
  for (let i = 0; i < n && i < ships.length; i++) if (ships[i]!.sinking) k++;
  return k;
}

/** 先頭 n 隻（駆逐艦。後ろは輸送船）のうち夜明けに海域を出た隻数（Result の夜明けの行「駆逐艦は北へ退いた（N 隻）」。輸送船は隊の transportWithdrawn） */
export function withdrawnCount(ships: readonly ShipOutState[], n: number): number {
  let k = 0;
  for (let i = 0; i < n && i < ships.length; i++) if (ships[i]!.withdrawn) k++;
  return k;
}

/** すべて（輸送船込み）が沈み始めたか退いた＝狙える艦がいない（魚雷を撃てない・残りの一斉発射を捨てる）。退く艦がいなければ「すべて沈み始めた」と同じ */
export function allShipsOut(ships: readonly ShipOutState[]): boolean {
  for (let i = 0; i < ships.length; i++) {
    const s = ships[i]!;
    if (!s.sinking && !s.withdrawn) return false;
  }
  return true;
}

/** すべての決着がついた（沈没演出が終わったか退いた）＝走っている魚雷を外れとして確定してよい。退く艦がいなければ「すべての沈没演出が終わった」と同じ */
export function allShipsSettled(ships: readonly ShipOutState[]): boolean {
  for (let i = 0; i < ships.length; i++) {
    const s = ships[i]!;
    if (!s.sunk && !s.withdrawn) return false;
  }
  return true;
}
