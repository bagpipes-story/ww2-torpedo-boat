// 報告・無線・中継（v0.8.2 S1。us_05「スリガオ海峡・最初の接触」の type recon_and_attack。spec-v0820 §4.5 D-N1〜D-N6・§9 の 6）の純粋な規則。報告の段:
//   NONE（確かめる艦種＝戦艦をまだ目で見ていない）→ TRACKING（確かめた＝spec の SEEN。その後レーダーで追っている＝spec の TRACKED。HUD の「追尾 N 秒」）
//   → 追った秒が trackS に届いたステップに、無線が生きていれば SENT（送った）、壊れていれば PENDING（中継待ち）→ PENDING からだけ RELAYED（中継の輪に入ったステップ）。
// 確かめる: 確かめる艦種の艦が自艇の視程の内に 1 隻でもいるステップ（ラッチ。秒と、報告がまとまるまでに一度に見えた最大の隻数＝報告の「戦艦 N」）。追う: TRACKING の間、
// 確かめた次のステップから、レーダーの最後の掃引に列の艦の接触が 1 つ以上あるステップの dtS を足す（無線が壊れていても数える）。中継: PENDING で輪の中のステップ（止まらなくてよい・夜明けの後も）。
// 輪に入っても追い終える前は何も起きない。時計は固定ステップの実秒（dtS＝FIXED_STEP_S の和。命中スローで 20 秒が延びない＝夜明けの時計と同じ）。夜明けの読みは無い。
// 無線（reconOnShellHit）: 報告を送る前（NONE・TRACKING）で無線がまだ生きている時に、damage ≥ radioMinDamage の敵の艦の砲弾 1 発ごとに seed+45 の系列（RECON_RADIO_SEED_OFFSET。
// recon のある世界だけが作る）をちょうど 1 回引き、radioFailChance 未満で壊れる（ラッチ）。ほかは引かない（?debug&noradio の 0・radiofail の 1 でも引く回数は同じ）。
// S2 の systems/world-recon との約束: 計画は S0 の ReconSetup が形で満たす ReconPlan、見る物 ReconView は S2 が数えて渡す数と真偽だけ（戦艦 ≤ 2 隻の 2 乗の距離・最後の掃引の接触の数・
// 中継の輪の 2 乗の距離。?debug&noradar の夜は目で見えている列の艦の数を接触の数として渡す）。stepRecon は敵の側の後に 1 回。戻りはこのステップに起きたことのビット
// （RECON_EV_*。無線が壊れた印は reconOnShellHit の後の最初の stepRecon に載る）。達成は reconObjectiveDone（届いた＝送ったか中継した、かつ帰投と同じに数える終わり）。
// Phaser 非依存・平方根・atan2 なし。作る（createReconState）のほかは確保しない。
import { endCountsAsReturn, type MissionEndReason } from './mission-flow';
import type { SeededRng } from './rng';

/** 乱数の系列 seed+45（+44 は戦艦の弾薬庫＝core/magazine-detonation。系列は仕組みごとに 1 つ＝core/night の注） */
export const RECON_RADIO_SEED_OFFSET = 45;
/** 段（HUD の 2 行目の常の文の分かれ目） */
export const RECON_NONE = 0;
export const RECON_TRACKING = 1;
export const RECON_SENT = 2;
export const RECON_PENDING = 3;
export const RECON_RELAYED = 4;
/** stepRecon の戻りのビット: 確かめた・送った・中継待ちになった・中継した・無線が壊れた */
export const RECON_EV_SEEN = 1;
export const RECON_EV_SENT = 2;
export const RECON_EV_PENDING = 4;
export const RECON_EV_RELAYED = 8;
export const RECON_EV_RADIO = 16;
/** 時計の比べの許し（固定ステップの 1/60 秒の和の丸め。core/ship-transit と同じ） */
const RECON_TIME_EPS_S = 1e-6;

/** 計画（config/recon-mission-data の ReconSetup が形で満たす） */
export interface ReconPlan { readonly trackS: number; readonly radioFailChance: number; readonly radioMinDamage: number }

/** このステップに世界が数えて渡す物（S2） */
export interface ReconView {
  /** 自艇の視程の 2 乗の内にいる確かめる艦種（identify_class）の艦の数 */
  readonly identifyInSight: number;
  /** レーダーの最後の掃引の列の艦の接触の数（noradar の夜は目で見えている列の艦の数） */
  readonly columnContacts: number;
  /** 自艇が中継の輪の中 */
  readonly inRelay: boolean;
}

export interface ReconState {
  /** 段（RECON_*）・無線が壊れたか（ラッチ）・固定ステップの時計（dtS の和） */
  stage: number; radioBroken: boolean; clockS: number;
  /** 確かめた秒・報告の隻数（確かめてから報告がまとまるまでに一度に見えた最大）・追った秒 */
  seenAtS: number; seenCount: number; trackedS: number;
  /** 送った・中継待ちになった・無線が壊れた・中継した秒（NaN は未だ） */
  sentAtS: number; pendingAtS: number; radioBrokenAtS: number; relayedAtS: number;
  /** 無線の故障を引いた回数・このステップのビット（RECON_EV_*）・次の stepRecon に載せる無線の印 */
  draws: number; changed: number; radioEvent: boolean;
}

/** 起動時に 1 回（recon のある世界だけ）。中身は resetReconState と同じ */
export function createReconState(): ReconState {
  const st: ReconState = { stage: RECON_NONE, radioBroken: false, clockS: 0, seenAtS: NaN, seenCount: 0, trackedS: 0, sentAtS: NaN, pendingAtS: NaN, radioBrokenAtS: NaN, relayedAtS: NaN, draws: 0, changed: 0, radioEvent: false };
  resetReconState(st);
  return st;
}

/** 夜の初めに戻す（NONE・無線は生きている・時計 0）。確保しない */
export function resetReconState(st: ReconState): void {
  st.stage = RECON_NONE;
  st.radioBroken = st.radioEvent = false;
  st.clockS = st.seenCount = st.trackedS = st.draws = st.changed = 0;
  st.seenAtS = st.sentAtS = st.pendingAtS = st.radioBrokenAtS = st.relayedAtS = NaN;
}

/** 1 固定ステップ（敵の側の後）。dtS は固定ステップの実秒（命中スローで縮めない）。戻りはこのステップのビット（st.changed と同じ） */
export function stepRecon(st: ReconState, plan: ReconPlan, view: ReconView, dtS: number): number {
  let bits = st.radioEvent ? RECON_EV_RADIO : 0;
  st.radioEvent = false;
  st.clockS += dtS;
  if (st.stage === RECON_TRACKING) {
    if (view.identifyInSight > st.seenCount) st.seenCount = view.identifyInSight;
    if (view.columnContacts > 0) st.trackedS += dtS;
    if (st.trackedS >= plan.trackS - RECON_TIME_EPS_S) {
      if (st.radioBroken) {
        st.stage = RECON_PENDING;
        st.pendingAtS = st.clockS;
        bits |= RECON_EV_PENDING;
      } else {
        st.stage = RECON_SENT;
        st.sentAtS = st.clockS;
        bits |= RECON_EV_SENT;
      }
    }
  } else if (st.stage === RECON_NONE && view.identifyInSight > 0) { // 確かめたステップ（追う秒はこの次のステップから）
    st.stage = RECON_TRACKING;
    st.seenAtS = st.clockS;
    st.seenCount = view.identifyInSight;
    bits |= RECON_EV_SEEN;
  }
  if (st.stage === RECON_PENDING && view.inRelay) {
    st.stage = RECON_RELAYED;
    st.relayedAtS = st.clockS;
    bits |= RECON_EV_RELAYED;
  }
  st.changed = bits;
  return bits;
}

/**
 * 敵の艦の砲弾が自艇に当たった時（S2 の world-enemies が包む命中の手から。機銃・空襲は呼ばない）。damage はその 1 発の値。
 * 報告を送る前で無線が生きていて damage ≥ radioMinDamage の時だけ rng をちょうど 1 回引く。壊れたら true（秒は最後の stepRecon の時計）
 */
export function reconOnShellHit(st: ReconState, plan: ReconPlan, damage: number, rng: SeededRng): boolean {
  if (st.radioBroken || st.stage === RECON_SENT || !(damage >= plan.radioMinDamage)) return false;
  st.draws++;
  if (!(rng.next() < plan.radioFailChance)) return false;
  st.radioBroken = st.radioEvent = true;
  st.radioBrokenAtS = st.clockS;
  return true;
}

/** 追い終えるまでの残りの秒（HUD の「あと N 秒」。TRACKING の外は 0） */
export function reconTrackLeftS(st: ReconState, plan: ReconPlan): number {
  return st.stage === RECON_TRACKING ? Math.max(0, plan.trackS - st.trackedS) : 0;
}

/** 報告が届いた（送ったか中継した）。自艇が沈んでも残る（Result の「報告は届いた」） */
export function reconDelivered(st: ReconState): boolean {
  return st.stage === RECON_SENT || st.stage === RECON_RELAYED;
}

/** 達成（type recon_and_attack）: 報告が届き、帰投と同じに数える終わり（沈没・漂流・座礁は届いていても達成でない） */
export function reconObjectiveDone(st: ReconState, reason: MissionEndReason): boolean {
  return endCountsAsReturn(reason) && reconDelivered(st);
}
