// v0.7.2 S2（アートと音③：BGM と命中スローの音。spec-v0720 §7・brief L25）: 曲の試聴の場（scenes/music-lab-scene）の行 2「効果音と一緒に」の台本。ゲームと同じ口で鳴らす＝聞き手を (0, 0) に
// 登録して sfxAt・sfxGunAt で本物の距離の帯（音量・パン・届く帯・大砲の近い音／遠雷）、合図は sfxCue、ループは sfxLoops（ループの再生の 10 Hz・変わった時だけ）。曲を下げる表（警報・探照灯・
// 魚雷の命中・近い大きい爆発）はエンジンの中で同じに効く（試聴の場は何もしない）。段は場が sfxMusicMood で渡し、台本は曲の家族が鳴ってから場が始める。
// 台本の表は config/music-lab-config の MUSIC_LAB_DEMOS（ループの音量と rate はゲームの式＝core/sfx-loops と同じ: エンジンは速力帯の音量・rate は 0.75 ＋ 0.75 × 速さの割合、海は 0.08 ＋ 0.11 × 割合）。
// 止める（stop）でループを止めて聞き手を外す（場の SHUTDOWN・別のボタン・「止める」）。ゲームの中では使わない（任務の聞き手は world-art・ループは systems/sfx-mission）。
// §7: update は確保しない（表を読むだけ・ループの目標の配列は作る時に 1 回）。
import { SFX_LOOP_ENGINE, SFX_LOOP_SEA, type SfxKey } from '../config/sfx-config';
import { MUSIC_LAB_DEMOS } from '../config/music-lab-config';
import { LOOP_ENGINE, LOOP_SEA, createSfxLoopTargets } from '../core/sfx-loops';
import { registerSfxListener, sfxAt, sfxCue, sfxGunAt, sfxLoops, sfxLoopsStop } from './sfx-bus';

const NONE = -1;
/** 台本の種類 → 鍵（MUSIC_LAB_DEMOS の種類の並び。大砲は距離の帯で鍵を選ぶ＝sfxGunAt。合図は位置なし） */
const DEMO_KEYS: readonly SfxKey[] = ['gun_near', 'mg', 'splash_l', 'blast_l', 'torp_hit', 'alarm', 'light_on', 'hull_hit'];
const KIND_GUN = 0;
/** ここから後ろの種類は位置なしの合図（sfxCue） */
const KIND_FIRST_CUE = 5;
/** 出来事の欄: [秒, 種類, x, y] */
const EV_AT = 0, EV_KIND = 1, EV_X = 2, EV_Y = 3;
/** 聞き手（世界の原点。登録している間だけ位置つきの音が鳴る） */
const ORIGIN = { x: 0, y: 0 };

export class SfxLabDemo {
  private readonly targets = createSfxLoopTargets();
  private demo = NONE;
  private tS = 0;
  private next = 0;

  /** 鳴らしている台本の番号（MUSIC_LAB_DEMOS の添字。無ければ −1） */
  get active(): number {
    return this.demo;
  }

  /** 台本 i を頭から（前の台本は続けて止めずに替える）: 聞き手を (0, 0) に・ループの目標を台本の速さで */
  start(i: number): void {
    const d = MUSIC_LAB_DEMOS[i]!;
    const e = SFX_LOOP_ENGINE;
    this.demo = i;
    this.tS = 0;
    this.next = 0;
    registerSfxListener(ORIGIN);
    const g = this.targets.gain;
    const r = this.targets.rate;
    g.fill(0);
    r.fill(1);
    g[LOOP_ENGINE] = d.step === 'full' ? e.gainFull : d.step === 'cruise' ? e.gainCruise : e.gainSilent;
    r[LOOP_ENGINE] = e.rateBase + e.rateSpan * d.speed;
    g[LOOP_SEA] = SFX_LOOP_SEA.gainBase + SFX_LOOP_SEA.gainSpeed * d.speed;
  }

  /** 止める（鳴らしていなければ何もしない）: ループを止め、聞き手を外す */
  stop(): void {
    if (this.demo === NONE) return;
    this.demo = NONE;
    sfxLoopsStop();
    registerSfxListener(null);
  }

  /** 毎フレーム（場の update。dtS は秒）: ループの目標を渡し、台本の出来事を時刻の順に鳴らす（くり返しの秒で頭へ） */
  update(dtS: number): void {
    if (this.demo === NONE) return;
    sfxLoops(this.targets, dtS);
    const d = MUSIC_LAB_DEMOS[this.demo]!;
    const ev = d.events;
    this.tS += dtS;
    while (this.next < ev.length && ev[this.next]![EV_AT]! <= this.tS) this.emitOne(ev[this.next++]!);
    if (this.tS >= d.periodS) {
      this.tS -= d.periodS;
      this.next = 0;
    }
  }

  /** 出来事 1 つを鳴らす（大砲は距離の帯で近い音／遠雷・合図は位置なし・ほかは位置つき） */
  private emitOne(e: readonly number[]): void {
    const k = e[EV_KIND]!;
    if (k === KIND_GUN) sfxGunAt(e[EV_X]!, e[EV_Y]!);
    else if (k >= KIND_FIRST_CUE) sfxCue(DEMO_KEYS[k]!);
    else sfxAt(DEMO_KEYS[k]!, e[EV_X]!, e[EV_Y]!);
  }
}
