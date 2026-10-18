// 扇状一斉発射（docs/02 §5: 長押し→離す。v0.4.8 から長押しの長さで本数 2 → 3 → 4、扇は隣どうしの間隔が固定（本数で開く））。Phaser 非依存。
export interface SpreadConfig {
  /** 隣どうしの魚雷の角度の間隔（度。固定）。扇の開き角 = 間隔 × (本数 − 1) */
  spacingDeg: number;
  /** 長押しの始まり（秒）: これより短い押下はタップ（1 本）。これ以上押して離すと 2 本から */
  holdStartS: number;
  /** 本数の刻み（秒）: holdStartS で 2 本、以後この秒ごとに 1 本増える（残弾まで）。0 以下なら長押しは残弾すべて */
  countStepS: number;
}

/** 押していた時間（秒）から発射する本数: holdStartS 未満は 1 本（タップ）、以後 2 本から countStepS ごとに 1 本増える。残弾 remaining が上限（1 なら 1、0 なら 0） */
export function salvoCountForHold(holdS: number, cfg: SpreadConfig, remaining: number): number {
  if (remaining <= 1) return Math.max(0, remaining);
  if (!(holdS >= cfg.holdStartS)) return 1;
  if (cfg.countStepS <= 0) return remaining;
  const n = 2 + Math.floor((holdS - cfg.holdStartS) / cfg.countStepS);
  return n < remaining ? n : remaining;
}

/** 本数から扇の開き角（度）。1 本以下は 0 */
export function salvoSpreadDeg(count: number, cfg: SpreadConfig): number {
  return count <= 1 ? 0 : cfg.spacingDeg * (count - 1);
}

/**
 * count 本を開き角 spreadDeg の扇に等間隔で並べた方位を out に書く（確保しない）。
 * count=1 なら base のみ。count>=2 なら両端が base±spread/2。
 */
export function fillSalvoHeadings(baseHeadingDeg: number, count: number, spreadDeg: number, out: number[]): number {
  if (count <= 0) return 0;
  if (count === 1) {
    out[0] = baseHeadingDeg;
    return 1;
  }
  for (let i = 0; i < count; i++) {
    out[i] = baseHeadingDeg - spreadDeg / 2 + (spreadDeg * i) / (count - 1);
  }
  return count;
}

/**
 * 扇の間隔の選択肢（v0.5.1 実機 1 回目。魚雷ボタンの下のボタンで 狭 → 中 → 広 → 狭 …）を検査して返す。
 * 正の数が小さい順に並び、最初の選択（salvo_spacing_deg）を含むこと。壊れていれば例外（起動時に分かる）
 */
export function spacingChoices(choices: readonly number[], defaultDeg: number, labelCount: number): number[] {
  const ok = choices.length === labelCount && choices.every((c, i) => Number.isFinite(c) && c > 0 && (i === 0 || c > choices[i - 1]!)) && choices.includes(defaultDeg);
  if (!ok) throw new Error(`hit_rate_model.torpedo_launch.salvo_spacing_choices_deg は ${labelCount} 個の正の数（小さい順）で salvo_spacing_deg ${defaultDeg} を含む`);
  return [...choices];
}

/** 押したときの次の間隔（最後の次は最初）。今の間隔が選択肢に無ければ最初の選択 */
export function nextSpacing(choices: readonly number[], currentDeg: number, defaultDeg: number): number {
  const i = choices.indexOf(currentDeg);
  return i < 0 ? defaultDeg : choices[(i + 1) % choices.length]!;
}
