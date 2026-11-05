// 空襲下の退避（v0.6.11 S6。jp_03「運天港・空襲下の退避」）の Briefing の差し替えの句（spec-v0611-r2 §10.5。r2 M11: 行は足さず、今の 6 行の中身だけ jp_03 で差し替える）。
// systems/briefing-numbers が WorldSetup の evac から 1 回だけ組み、core/briefing の briefingRows が BriefingNumbers の任意の鍵として読む（無い任務は鍵ごと出ない＝文はバイト同一）。
// 昼の任務なので「夜明け」と言わない（H6）。隠れ場所の数は data の隠れ場所の種類から（S3b で陰（西）を外した＝壕 3・陰 1）、波と編隊の数は data の evac_raid から（ユーザーの U5）、
// もう一度来る編隊（S3b の U7）は passes_max が 2 以上の時だけ、条件の行の 2 行目に入る長さの句で言う（24 px・1,056 px で条件は 2 行のまま＝tests/evac-briefing）。Phaser 非依存。
import { SHELTER_CAVE } from './evac-data';
import type { EvacParams, EvacRaidParams } from './evac-params';

/** 成功の「（帰投地点は…の青い輪）」の代わり（240 秒の決着に操作中の隊が隠れていれば帰投＝spec §3.8） */
export const EVAC_SUCCESS_TAIL_JA = '（空襲が去る時に操作中の隊を壕か陰へ）';
/** 条件の燃料の後ろ（fuel_free_until_s。空襲の間は燃料を数えない＝U4） */
export const EVAC_FUEL_NOTE_JA = '（空襲の間は減らない）';
/** 条件の武器の句（main_weapon none。ユーザーの U2「自機が機銃を打てば僚機も機銃を撃つ」。1 発 0.5% は v0.6.8 のまま＝jp_02 の「機銃は機にまず当たらない」と同じ言い方） */
export const EVAC_WEAPON_JA = '機銃は僚艇も撃つ（機にまず当たらない）';
/** 条件の最後の句（S3b の U7: 爆撃を終えた編隊は、次の波の始まりまでに 1 回の出撃が収まればもう一度来る＝core/evac-repass。passes_max 2＝「もう一度」） */
export const EVAC_REPASS_JA = '編隊は次の波までに間があればもう一度来る';
/** 危険の行の港の空襲の名（risk_events の unten_air_raid の label_ja の全文。riskLabelJa は「（」の前までに縮めるので、昼の任務は全文で読む。tests が data と同じ文かを見る） */
export const EVAC_RAID_HAZARD_JA = '港の空襲（予告の後、編隊が別々の隊を狙う）';

/** 条件の時計（「夜明けまで N 秒（以後は空襲）」の代わり） */
export function evacClockJa(durationS: number): string {
  return `空襲が去るまで ${Math.round(durationS)} 秒`;
}

/** 危険の行の 240 秒の後の空襲の名（risk_events の dawn_air_strike の「夜明けの空襲」の代わり。label_ja は変えない＝tests/dawn-air の固定のまま） */
export function evacAfterRaidHazardJa(planes: number): string {
  return `空襲が去った後の追撃（敵機 ${planes} 機）`;
}

/** 時の行の「昼（…）」の後ろ（夜の「見える N m ・ 見つかる…」の代わり）: 隠れ場所の種類の数と、外は見える・陰は見つかることがある */
export function evacDayRowJa(p: Pick<EvacParams, 'shelters'>): string {
  let caves = 0;
  for (const s of p.shelters) if (s.kind === SHELTER_CAVE) caves++;
  const covers = p.shelters.length - caves;
  return covers > 0 ? `壕 ${caves} と陰 ${covers} の外の艇は見える ・ 陰は見つかることがある` : `壕 ${caves} の外の艇は見える`;
}

/** 敵の行の名前と方角の後ろ: 「4波（2機の編隊が2つ同時 → 3機×2 → 3機×2 → 4機×2）」（ユーザーの U5 の書き方。×は同時に来る編隊の数） */
export function evacEnemyRowJa(r: Pick<EvacRaidParams, 'waves' | 'flights'>): string {
  const w = r.waves;
  let rest = '';
  for (let i = 1; i < w.length; i++) rest += ` → ${w[i]!.planes}機×${r.flights}`;
  return `${w.length}波（${w[0]!.planes}機の編隊が${r.flights}つ同時${rest}）`;
}
