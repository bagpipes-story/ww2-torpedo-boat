// v0.7.0 IP1a（アートと音①：コードで描く絵）: 航跡の尾の定数。ユーザーの U5（実機 1 回目）「航跡が直線すぎるので少し揺らぎを出してください」から、
// 船体ごとの直線の V（S3b の tex-wake-boat・tex-wake-ship）に加えて、艇尾が通った所に泡（tex-wake-puff）を一定の間隔で置き、数秒で広がって消える尾にした（曲がれば尾も曲がる）。
// 横の揺れは絵だけの乱数（ART_SEED_WAKE。ゲームの乱数ではない）。数はすべて世界の作成時に確保するプールの大きさ（update の中で new しない＝CLAUDE.md §7）。
// ゲームの強さの値ではないので data/*.json には置かない。何も import しない。

/**
 * 船体の種類ごとの尾（距離は世界の m＝絵の単位、秒は実秒＝時間圧縮 ×5 の後）:
 * spacingM＝泡を置く間隔（艇尾が進んだ距離。2 乗で比べる）・lifeS＝泡の寿命・lenShare＝泡の長さ（間隔の倍。1 より大きく重ねて切れ目のない帯に）・
 * w0Beams・w1Beams＝泡の幅（船幅の倍。生まれた時 → 消える時＝後ろほど広い＝V の形）・swayBeams＝横の揺れの振幅（船幅の倍）・cap＝1 隻の泡の数の上限（輪）。
 * 尾の長さの上限は cap × spacingM（速い時）か 速さ × 時間圧縮 × lifeS（遅い時）
 */
export interface WakeTrailArt {
  readonly spacingM: number;
  readonly lifeS: number;
  readonly lenShare: number;
  readonly w0Beams: number;
  readonly w1Beams: number;
  readonly swayBeams: number;
  readonly cap: number;
  /** α の上限に掛ける倍率（艦の泡立った太い航跡は濃く） */
  readonly alphaMul: number;
}
export const WAKE_TRAIL_ART: Readonly<Record<'player' | 'boat' | 'barge' | 'ship' | 'evacLeader' | 'evacFollower', WakeTrailArt>> = {
  player: { spacingM: 12, lifeS: 2.8, lenShare: 2.4, w0Beams: 0.7, w1Beams: 3.2, swayBeams: 0.32, cap: 22, alphaMul: 1 },
  boat: { spacingM: 12, lifeS: 2.6, lenShare: 2.4, w0Beams: 0.7, w1Beams: 3, swayBeams: 0.32, cap: 16, alphaMul: 1 },
  barge: { spacingM: 7, lifeS: 2.6, lenShare: 2.4, w0Beams: 0.8, w1Beams: 2.4, swayBeams: 0.25, cap: 8, alphaMul: 1 },
  ship: { spacingM: 18, lifeS: 5, lenShare: 2.4, w0Beams: 0.8, w1Beams: 2.8, swayBeams: 0.2, cap: 16, alphaMul: 1.15 },
  evacLeader: { spacingM: 14, lifeS: 2.2, lenShare: 2.4, w0Beams: 0.7, w1Beams: 2.8, swayBeams: 0.32, cap: 8, alphaMul: 1 },
  evacFollower: { spacingM: 16, lifeS: 1.6, lenShare: 2.4, w0Beams: 0.7, w1Beams: 2.4, swayBeams: 0.32, cap: 3, alphaMul: 1 },
};

/**
 * 泡の α の上限（1 つ）: 帯は lenShare（約 2.4）枚が重なるので、重なった α は 1 − (1 − a)^2.4。雷跡の点 0.55 より薄く（R7。tests/wake-trail が確かめる）。
 * 自艇の速力帯（R1・D9）: 停止 なし・静音 泡だけの薄い尾（frame p1・α ≤ 0.12・寿命と幅は割合）・巡航・全速。ほかの船体は 速さ/基準（WAKE_KIND_ART の refMps）× 上限 × 船体の α
 */
export const WAKE_PUFF_ALPHA_MAX = 0.24;
/** ほかの船体の α の速さの割合の下限（ゆっくりの艦でも尾が読める）: 上限 × (FLOOR ＋ (1 − FLOOR) × min(1, 速さ/基準)) */
export const WAKE_PUFF_SPEED_FLOOR = 0.4;
export const WAKE_PUFF_SILENT_ALPHA = 0.1;
export const WAKE_PUFF_CRUISE_SHARE = 0.75;
export const WAKE_PUFF_SILENT_LIFE_SHARE = 0.45;
export const WAKE_PUFF_SILENT_WIDTH_SHARE = 0.6;
/** 生まれてから α が満ちるまでの寿命の割合（艇尾で急に出ない）・艇尾が一度にこれ（間隔の倍）より遠くへ動いたら尾をつながない（やり直し・座席の切り替え） */
export const WAKE_PUFF_FADE_IN = 0.03;
export const WAKE_JUMP_SPACINGS = 6;
/** 横の揺れ: 泡ごとに位相を [lo, hi) rad 進める（2 つの正弦の和＝規則的に見えない）・泡ごとの小さな乱れ（船幅の倍）・向きの乱れ 度 */
export const WAKE_SWAY_STEP: readonly [number, number] = [0.45, 0.8];
export const WAKE_SWAY_JITTER_BEAMS = 0.1;
export const WAKE_PUFF_ANGLE_JITTER_DEG = 7;
/**
 * 泡の絵（tex-wake-puff。k に依らない固定 px。frame p0＝泡の帯・p1＝静音の小さな泡）: 横 W × 縦 H px（縦が進む向き）。
 * 横の断面は中央 α CENTER・両側（半幅の EDGE_AT）で 1・外へ 0＝広がると両側の白が分かれて V の腕に見える。縦は両端へ柔らかく（重ねて継ぎ目なし）。
 */
export const WAKE_PUFF_TEX_W = 48;
export const WAKE_PUFF_TEX_H = 64;
export const WAKE_PUFF_CENTER_ALPHA = 0.55;
export const WAKE_PUFF_EDGE_AT = 0.62;
export const WAKE_PUFF_BUBBLES = 9;
export const WAKE_PUFF_FRAME_FOAM = 'p0';
export const WAKE_PUFF_FRAME_BUBBLE = 'p1';
/** V の印（S3b の tex-wake-boat・ship）は艇尾の近くだけに短く（尾が道のりを描く）: WAKE_KIND_ART の長さに掛ける割合と α の割合 */
export const WAKE_V_LEN_SHARE = 0.45;
export const WAKE_V_ALPHA_SHARE = 0.8;
/** 航跡の尾の乱数の種（絵だけ。ゲームの乱数とは別。世界の絵を作る時に new SeededRng(ART_SEED_WAKE)＝R30） */
export const ART_SEED_WAKE = 7302;
