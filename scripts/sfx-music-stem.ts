// 任務の曲の束の模型（v0.7.2 S2。spec-v0720 §8.2・§8.3・brief L23。scripts/sfx-mix.ts の RAW=1 MUSIC=1 が使う。開発の道具だけ＝ゲームは import しない）。
// probe の記録（scripts/headless/sfx-probe.mjs の OUT。段の移りの行 mood と、鳴らすと決まった単発の行 log）から、ゲームの曲の束（3 層 × 層の音量 × 下げる音量）を標本で作る:
// - 3 層は任務の始め（記録の t0 ＋ MUSIC_PLAYER.startLeadS）に同じ時刻で始め、buffer 全体を繰り返す（L2 は 4 回で L0 の長さ）。標本は assets/sfx-music-* でゲームと同じに作る（ビット同一）。
// - 層の音量は曲の再生（systems/sfx-music-slots）と同じ予約: 始めは 0 から段の音量へ missionInS（× fadeTc）、段が変わった時に core/sfx-music-mood の musicMoodGain・musicMoodTc で 3 層へ。
// - 下げる音量は systems/sfx-music-duck そのもの（予約を AudioParam の模型 ParamModel に書かせる＝同じ表・同じ直し方）。鳴り始める時刻と距離の帯は probe の行（遅らせる合図は鳴り始める時刻）。
// - AudioParam の模型: setValueAtTime・setTargetAtTime・cancelScheduledValues（WebAudio の式＝target は v(t) = T + (v0 − T)·exp(−(t − t0)/τ)、同じ時刻の予約は後ろへ並ぶ、cancel は時刻 ≥ t の予約を消す）。
//   区間 [from, to) の値は、前の予約を式で追ってから標本ごとに出す（窓だけを作る＝長い任務でも軽い）。
// 比べ（L23 の案）: 下げる表 table と層の音量の倍率 layerMul（L0・L1・L2）を渡せる（ゲームの値は config/sfx-music-config。案を試す時だけ変える）。
import { MUSIC_FADE, MUSIC_LAYER_KEYS, MUSIC_PLAYER, MUSIC_SAMPLE_RATE, MUSIC_WORK_SAMPLES, MUSIC_BUILD_BUDGET, type MusicKey } from '../src/config/sfx-music-config';
import { SFX_KEYS, type SfxKey } from '../src/config/sfx-config';
import { MusicBuilder, composeMusicKey } from '../src/assets/sfx-music-render';
import { MusicTables } from '../src/assets/sfx-music-synth';
import { musicMoodGain, musicMoodTc } from '../src/core/sfx-music-mood';
import { SfxMusicDuck, type SfxDuckTable } from '../src/systems/sfx-music-duck';
import type { ProbeRow } from './sfx-mixdown';

const SR = MUSIC_SAMPLE_RATE;
type Ev = { t: number; v: number; tc: number };

/** AudioParam の模型（tc 0 は setValueAtTime） */
export class ParamModel {
  private evs: Ev[] = [];
  value: number;
  constructor(v0: number) {
    this.value = v0;
  }
  setValueAtTime(v: number, t: number): void {
    this.add({ t, v, tc: 0 });
  }
  setTargetAtTime(v: number, t: number, tc: number): void {
    this.add({ t, v, tc });
  }
  linearRampToValueAtTime(): void {
    throw new Error('曲の模型は直線の予約を使わない');
  }
  cancelScheduledValues(t: number): void {
    this.evs = this.evs.filter((e) => e.t < t);
  }
  /** 標本 [from, to) の値（時刻 = t0 ＋ 標本 / SR） */
  render(from: number, to: number, t0: number): Float32Array {
    const out = new Float32Array(Math.max(0, to - from));
    let v = this.value, cv = v, j = 0;
    let cur = null as Ev | null; // 閉包の中で書く（TS の狭めを避ける）
    const step = (e: Ev): void => {
      if (cur) v = cur.v + (cv - cur.v) * Math.exp(-(e.t - cur.t) / cur.tc);
      if (e.tc === 0) { v = e.v; cur = null; } else { cur = e; cv = v; }
    };
    const tA = t0 + from / SR;
    while (j < this.evs.length && this.evs[j]!.t <= tA) step(this.evs[j++]!);
    for (let s = from; s < to; s++) {
      const t = t0 + s / SR;
      while (j < this.evs.length && this.evs[j]!.t <= t) step(this.evs[j++]!);
      out[s - from] = cur ? cur.v + (cv - cur.v) * Math.exp(-(t - cur.t) / cur.tc) : v;
    }
    return out;
  }
  private add(e: Ev): void {
    let i = this.evs.length;
    while (i > 0 && this.evs[i - 1]!.t > e.t) i--;
    this.evs.splice(i, 0, e);
  }
}

const layers = new Map<MusicKey, Float32Array>();
/** 任務の家族の 3 層（ゲームと同じ作り方。1 回だけ作って使い回す） */
export function familyLayers(): Float32Array[] {
  if (layers.size === 0) {
    const tables = new MusicTables(), work = new Float32Array(MUSIC_WORK_SAMPLES);
    while (!tables.ready) tables.stepTables(MUSIC_BUILD_BUDGET);
    for (const k of MUSIC_LAYER_KEYS) {
      const b = new MusicBuilder(tables, work, composeMusicKey(k));
      while (!b.done) b.stepBuild(MUSIC_BUILD_BUDGET);
      layers.set(k, b.result().slice());
    }
  }
  return MUSIC_LAYER_KEYS.map((k) => layers.get(k)!);
}

export interface StemCase { t0: number; log: ProbeRow[]; mood?: [number, number][] }
export interface StemOptions { table?: SfxDuckTable; layerMul?: readonly number[] }

/** 下げる音量の予約（ゲームの SfxMusicDuck に probe の鳴らした行を時刻の順に渡す）。ducks は下げた回数 */
export function duckParam(c: StemCase, table?: SfxDuckTable): { p: ParamModel; ducks: number; reworked: number } {
  const p = new ParamModel(1);
  const d = new SfxMusicDuck({ gain: p, connect: () => undefined } as never, table);
  const rows = c.log.filter((r) => r[6] >= 0).slice().sort((a, b) => a[0] - b[0]);
  for (const r of rows) d.play(SFX_KEYS.indexOf(r[1] as SfxKey), r[12] === 1 ? 0 : r[10], r[0]);
  return { p, ducks: d.ducks, reworked: d.reworked };
}

/** 曲の束（master の前。標本 [from, to)。時刻 0 は記録の t0）と、下げた回数 */
export function musicStem(c: StemCase, from: number, to: number, o: StemOptions = {}): { x: Float32Array; ducks: number; reworked: number } {
  const xs = familyLayers();
  const when = c.t0 + MUSIC_PLAYER.startLeadS;
  const rows = c.mood && c.mood.length ? c.mood : [[c.t0, 0] as [number, number]];
  const mul = o.layerMul ?? [1, 1, 1];
  const gains = xs.map((_, i) => {
    const p = new ParamModel(0);
    p.cancelScheduledValues(c.t0);
    p.setValueAtTime(0, c.t0);
    p.setTargetAtTime(musicMoodGain(i, rows[0]![1]) * mul[i]!, when, MUSIC_FADE.missionInS * MUSIC_PLAYER.fadeTc);
    for (let r = 1; r < rows.length; r++) {
      p.cancelScheduledValues(rows[r]![0]);
      p.setTargetAtTime(musicMoodGain(i, rows[r]![1]) * mul[i]!, rows[r]![0], musicMoodTc(rows[r - 1]![1], rows[r]![1]));
    }
    return p.render(from, to, c.t0);
  });
  const dk = duckParam(c, o.table);
  const duck = dk.p.render(from, to, c.t0);
  const start = Math.round((when - c.t0) * SR);
  const x = new Float32Array(Math.max(0, to - from));
  for (let s = Math.max(from, start); s < to; s++) {
    let v = 0;
    for (let i = 0; i < xs.length; i++) v += xs[i]![(s - start) % xs[i]!.length]! * gains[i]![s - from]!;
    x[s - from] = v * duck[s - from]!;
  }
  return { x, ducks: dk.ducks, reworked: dk.reworked };
}
