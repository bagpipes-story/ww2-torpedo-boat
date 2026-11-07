// 空襲下の退避の模擬（core/evac-sim）の遊び方の行（v0.6.11 S3。jp_03。spec-v0611-r2 §12.2・§12.3）: 行の名前と中身（何を隠すか・陰を先に・見届ける・巡航だけ・赤い輪に従う・
// 機銃・240 秒の直前に隠れた隊へ戻る・bot）、人の揺らぎの幅（EVAC_HUMAN）、台本の出力（EvacFrameOut）。台本の動きは core/evac-sim-policy、舵取りは core/evac-sim-steer。Phaser 非依存。
/** 遊び方（spec §12.3 の表の順） */
export const EVAC_POLICIES = ['seq', 'seq_slow', 'seq_cover', 'follow_ring', 'seq_shoot', 'own_only', 'dodge_only', 'fight', 'stay', 'bot'] as const;
export type EvacPolicy = (typeof EVAC_POLICIES)[number];

/** 決着の前に何を隠すか: 順に（seq）・自分の隊だけ（own）・隠さない（none） */
export type EvacHide = 'seq' | 'own' | 'none';
/** 隠さない時の操作中の隊: 止まる（stay・fight）・走り回る（dodge_only） */
export type EvacIdle = 'stop' | 'roam';

export interface EvacPolicySpec {
  hide: EvacHide;
  idle: EvacIdle;
  /** 陰を先に（seq_cover） */
  cover: boolean;
  /** 上げ終わる（隠れた）のを見届けてから切り替える（seq_slow） */
  waitUp: boolean;
  /** 巡航だけ（seq_slow） */
  cruise: boolean;
  /** 予告のたびに狙われたほかの隊へ切り替える（follow_ring・dodge_only） */
  ring: boolean;
  /** 機銃: 押さない・射程に機がいる間・いつも */
  gun: 'none' | 'range' | 'always';
  /** 240 秒の直前に隠れた隊へ戻る（seq 系・follow_ring・bot。r2 H1 (4)） */
  back: boolean;
  /** 最良の順で選ぶ（bot。人の揺らぎなし・回避 100%） */
  bot: boolean;
  /** 反応の幅（秒。null は既定の人の幅） */
  react: readonly [number, number] | null;
}

const spec = (hide: EvacHide, o: Partial<EvacPolicySpec> = {}): EvacPolicySpec => ({ hide, idle: 'roam', cover: false, waitUp: false, cruise: false, ring: false, gun: 'none', back: hide === 'seq', bot: false, react: null, ...o });
export const EVAC_POLICY_SPECS: Readonly<Record<EvacPolicy, EvacPolicySpec>> = {
  seq: spec('seq'),
  seq_slow: spec('seq', { waitUp: true, cruise: true, react: [4, 10] }),
  seq_cover: spec('seq', { cover: true }),
  follow_ring: spec('seq', { ring: true }),
  seq_shoot: spec('seq', { gun: 'range' }),
  own_only: spec('own', { back: false }),
  dodge_only: spec('none', { ring: true }),
  fight: spec('none', { idle: 'stop', gun: 'always' }),
  stay: spec('none', { idle: 'stop' }),
  bot: spec('seq', { bot: true }),
};

/** 人の揺らぎ（spec §12.2）。秒は実秒 */
export const EVAC_HUMAN = {
  moveDelayS: [2, 6] as const,
  reactS: [5, 12] as const,
  holdStickP: 0.5,
  releaseS: [0.3, 1] as const,
  headingJitterDeg: 10,
  jitterEveryS: 1.5,
  brakeErr: 0.3,
  dodgeP: 0.5,
  dodgeReactS: [0.3, 0.8] as const,
  dodgeHoldS: 1.5,
  extinguishS: [1, 3] as const,
  secondShelterP: 0.2,
  tapGapS: 0.25,
  /** 240 秒の直前に隠れた隊へ戻り始める秒（決着の秒からの前） */
  backBeforeS: [6, 14] as const,
  /** bot が戻り始める秒（決着の前） */
  botBackBeforeS: 2,
} as const;
export const EVAC_HUMAN_SEED_MUL = 7907;
export const EVAC_HUMAN_SEED_ADD = 52711;
export interface EvacFrameOut {
  headingDeg: number;
  speed01: number;
  switchTap: boolean;
  extHeld: boolean;
  gunHeld: boolean;
}

