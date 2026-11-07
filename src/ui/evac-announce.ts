// 空襲下の退避（v0.6.11。jp_03）の予告の行（2 行目の EVL_ANNOUNCE）・そのキー・予告の中央の帯（S8b で ui/evac-lines から分けた。ui/evac-lines が今までの名で出し直す）。
// 波の予告「第4波 4機×3 東から ・ 狙い 第1隊（操作中）、第4隊、第6隊」・もう一度来る編隊（S3b の U7）の予告し直し「第2波 3機×2 戻ってきた 東から ・ 狙い 第4隊、第5隊」。
// 機の数は 1 編隊ごと（S8b: 予告し直しは戻ってくる機の和「6機」で、最初の予告の「2機×3」と食い違った）: 1 編隊は「3機」、同じ機数なら「3機×2」、撃墜で違えば「2〜3機×2」
// （編隊ごとに並べる「1機・1機・2機」は 3 編隊の予告し直しで 889 px になった）。
// 狙った隊が始まる前に隠れた（入っている・上げている途中に狙われた。t.evac.annLost）なら「狙い」に並べず「第6隊を見失う」（S8b: 「狙い 第6隊（操作中）」と
// 「第6隊は隠れている」が同じ行に並んだ。始まる時の出来事「第6隊を見失った！」と同じ言い方。「は隠れた（見失う）」は「狙い 第1隊（操作中） ・ … ・ 1編隊 目標なし」で 915 px）。
// 尾（見失う・操作中の隊が隠れている・目標の無い編隊）が 2 つ以上か 840 px を超えれば「東から」を落とす（r2 M10）。それでも超えれば「は隠れている」を落とす（S8b）。
import { G_HIDDEN } from '../core/evac-data';
import { EVA_REPASS, type EvacTelemetry } from '../core/evac-telemetry';
import { EVAC_LINE_MAX_PX, EVAC_LINE_PX, evacGroupJa, jaWidthPx } from './evac-text';

/** 機の数（波の予告は 1 編隊の機数 × 同時の編隊、予告し直しは並べた編隊ごと） */
function planesJa(e: EvacTelemetry): string {
  if (e.annKind !== EVA_REPASS) return `${e.annPlanes}機×${e.annFlights}`;
  const n = e.annCount;
  if (n === 0) return `${e.annPlanes}機`;
  let lo = e.annTargetPlanes[0]!;
  let hi = lo;
  for (let i = 1; i < n; i++) {
    lo = Math.min(lo, e.annTargetPlanes[i]!);
    hi = Math.max(hi, e.annTargetPlanes[i]!);
  }
  if (n === 1) return `${lo}機`;
  return lo === hi ? `${lo}機×${n}` : `${lo}〜${hi}機×${n}`;
}

/** 予告の行（波の予告・予告し直し） */
export function evacAnnounceJa(e: EvacTelemetry): string {
  const repass = e.annKind === EVA_REPASS;
  const head = `第${e.annWave + 1}波 ${planesJa(e)}${repass ? ' 戻ってきた' : ''}`;
  let aim = '';
  let lost = '';
  for (let i = 0; i < e.annCount; i++) {
    const gi = e.annTargets[i]!;
    if ((e.annLost & (1 << i)) !== 0) lost += `${lost ? '、' : ''}${evacGroupJa(e, gi)}`;
    else aim += `${aim ? '、' : ''}${evacGroupJa(e, gi)}${gi === e.control ? '（操作中）' : ''}`;
  }
  const aimT = aim ? ` ・ 狙い ${aim}` : lost ? '' : ' ・ 目標なし';
  const lostT = lost ? ` ・ ${lost}を見失う` : '';
  // 操作中の隊が隠れていて狙われていない（狙われていれば見失うの尾が言う。ほかの隊を見失う時も 840 px に収めるため出さない＝3 行目と予告の後の待機の行が言う）
  const hidT = e.phase === G_HIDDEN && !lost ? ` ・ ${evacGroupJa(e, e.control)}は隠れている` : '';
  const noneT = !repass && e.annNoTarget > 0 && e.annCount > 0 ? ` ・ ${e.annNoTarget}編隊 目標なし` : '';
  const tails = (lostT ? 1 : 0) + (hidT ? 1 : 0) + (noneT ? 1 : 0);
  const full = `${head} ${e.fromJa}から${aimT}${lostT}${hidT}${noneT}`;
  if (tails < 2 && jaWidthPx(full, EVAC_LINE_PX) <= EVAC_LINE_MAX_PX) return full;
  const short = `${head}${aimT}${lostT}${hidT}${noneT}`;
  // まだ超える（予告し直しの 3 編隊の機数が撃墜で違う「1〜2機×3」＋狙い 3 つ＋操作中の隊が隠れている＝849 px）なら「は隠れている」も落とす（3 行目と予告の後の待機の行が言う）
  return jaWidthPx(short, EVAC_LINE_PX) <= EVAC_LINE_MAX_PX ? short : `${head}${aimT}${lostT}${noneT}`;
}

/** 予告の行のキー（文が変わる値だけ。< 2^40）: 種類・波・機数・狙いの数・狙いごとの隊と機数・見失うビット・目標なし・操作中の隊が隠れている・操作中の隊 */
export function evacAnnounceKey(e: EvacTelemetry): number {
  let k = e.annKind;
  k = k * 8 + e.annWave + 1;
  k = k * 64 + e.annPlanes;
  k = k * 4 + e.annCount;
  for (let i = 0; i < 3; i++) {
    const on = i < e.annCount;
    k = (k * 8 + (on ? e.annTargets[i]! + 1 : 0)) * 5 + (on ? Math.min(4, e.annTargetPlanes[i]!) : 0);
  }
  k = k * 8 + (e.annLost & 7);
  k = k * 4 + e.annNoTarget;
  k = k * 2 + (e.phase === G_HIDDEN ? 1 : 0);
  return k * 8 + e.control;
}

/**
 * 予告の中央の帯（ui/dawn-banner に 2 秒。予告の通し番号が変わったとき）: 見出しだけ（狙いは 2 行目と赤い輪が言う。説明の行は地図の上の隠れ場所の札に重なった＝ヘッドレスの画面写し）。
 * 波の予告は「第2波 — 空襲 3機×2」、予告し直しは「第2波 — 編隊が戻ってきた」
 */
export function evacBannerLines(e: EvacTelemetry): readonly string[] {
  return [e.annKind === EVA_REPASS ? `第${e.annWave + 1}波 — 編隊が戻ってきた` : `第${e.annWave + 1}波 — 空襲 ${e.annPlanes}機×${e.annFlights}`];
}
