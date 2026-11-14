// v0.7.1 S1（アートと音②：合成の効果音。spec-v0710 §2・§13 の 10）: 再生の API の、音のエンジンが使う所だけの形（構造の型）。ブラウザの本物（再生の context とそのノード）が
// そのまま満たすので、systems/sfx-boot は Phaser の context をこの型として渡すだけ。ブラウザの型の名前を使わない＝DOM の無い node の型検査で通り、tests/sfx-engine の偽の
// context も同じ型で書ける。型だけ（実行時には何も無い）。
/** 音量などの値（今すぐの値と、時刻つきの予約） */
export interface SfxParam {
  value: number;
  setValueAtTime(value: number, timeS: number): unknown;
  linearRampToValueAtTime(value: number, timeS: number): unknown;
  setTargetAtTime(value: number, timeS: number, timeConstantS: number): unknown;
  cancelScheduledValues(timeS: number): unknown;
}
export interface SfxNode {
  connect(to: unknown): unknown;
}
export interface SfxGainNode extends SfxNode {
  readonly gain: SfxParam;
}
export interface SfxPanNode extends SfxNode {
  readonly pan: SfxParam;
}
export interface SfxLimiterNode extends SfxNode {
  readonly threshold: SfxParam;
  readonly knee: SfxParam;
  readonly ratio: SfxParam;
  readonly attack: SfxParam;
  readonly release: SfxParam;
}
/** v0.7.2 S3: 2 次の濾波器（命中スローのベッドの濾波器だけ。type は 'lowpass'・frequency は Hz。Q は既定のまま） */
export interface SfxFilterNode extends SfxNode {
  type: string;
  readonly frequency: SfxParam;
}
export interface SfxBuffer {
  getChannelData(channel: number): { set(samples: Float32Array): void };
}
export interface SfxSource extends SfxNode {
  buffer: SfxBuffer | null;
  /** buffer 全体を繰り返す（S3 のループ 5 本だけ true。単発は触らない） */
  loop: boolean;
  readonly playbackRate: SfxParam;
  start(whenS?: number): void;
  stop(whenS?: number): void;
}
/** 約束（resume・suspend の戻り）。古い端末は何も返さないことがある */
export interface SfxThenable {
  catch(onRejected: (e: unknown) => void): unknown;
}
export interface SfxCtx {
  readonly state: string;
  readonly currentTime: number;
  readonly destination: unknown;
  createGain(): SfxGainNode;
  /** 無い端末（古い iOS）は中央で鳴らす（R7） */
  createStereoPanner?: () => SfxPanNode;
  createDynamicsCompressor(): SfxLimiterNode;
  /** v0.7.2 S3: ベッドの濾波器（起動時に 1 つだけ） */
  createBiquadFilter(): SfxFilterNode;
  createBufferSource(): SfxSource;
  createBuffer(channels: number, length: number, sampleRate: number): SfxBuffer;
  resume(): SfxThenable | undefined;
  suspend(): SfxThenable | undefined;
}
