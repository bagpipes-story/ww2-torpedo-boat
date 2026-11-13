// v0.7.1 S0（アートと音②：合成の効果音。spec-v0710 §6.2・§7.3・§9.1）: 単発の音の判断 core/sfx-mix。帯の境・音量の単調・パンの範囲・鍵ごとの届く帯・大砲の音の切り替え・
// 最小間隔（ゲームの時計）・声の上限・優先の奪い方（自分より低い声のうち一番低くて古い声。同じか高ければ新しい方を捨てる）。
// S2: 1 発だけの最小間隔（沈没の 2 次の爆発）・頼まれた音の帯は落とした時も読める（probe）・大砲の鍵は距離で決まる・帯ごとの音量は鍵 × 帯。
import { describe, expect, it } from 'vitest';
import { SFX_BAND_GAIN, SFX_BAND_MAX_M, SFX_KEYS, SFX_PAN_MAX, SFX_TABLE, SFX_VOICES } from '../src/config/sfx-config';
import { SFX_DROP_FAR, SFX_DROP_NONE, SFX_DROP_RATE, SFX_DROP_VOICES, SfxMixer, sfxBand, sfxBandGain, sfxGunKey, sfxKeyIndex, sfxPan } from '../src/core/sfx-mix';

const sq = (m: number): number => m * m;

describe('距離の帯とパン（spec §6.2。平方根なし＝距離の 2 乗で比べる）', () => {
  it('帯の境: 400・1,500・4,000・16,000 m はその帯の内、少しでも遠ければ次の帯、16 km より遠ければ捨てる', () => {
    expect(sfxBand(0)).toBe(0);
    SFX_BAND_MAX_M.forEach((m, b) => {
      expect(sfxBand(sq(m)), `${m} m`).toBe(b);
      expect(sfxBand(sq(m + 0.01)), `${m} m の少し外`).toBe(b + 1 < SFX_BAND_MAX_M.length ? b + 1 : -1);
    });
    expect(sfxBand(sq(399))).toBe(0);
    expect(sfxBand(sq(10000))).toBe(3);
    expect(sfxBand(sq(20000))).toBe(-1);
  });
  it('帯の音量は 1.0・0.55・0.30・0.16 で、遠いほど小さく、帯の外は 0', () => {
    expect([0, 1, 2, 3].map(sfxBandGain)).toEqual([1.0, 0.55, 0.3, 0.16]);
    for (let b = 1; b < SFX_BAND_GAIN.length; b++) expect(sfxBandGain(b)).toBeLessThan(sfxBandGain(b - 1));
    expect(sfxBandGain(-1)).toBe(0);
    expect(sfxBandGain(4)).toBe(0);
  });
  it('パン: 右が正・900 m で ±0.7 に張り付く・30 m 以内は中央・範囲は −0.7〜0.7', () => {
    expect(sfxPan(450, sq(450))).toBeCloseTo(0.35, 6);
    expect(sfxPan(-450, sq(450))).toBeCloseTo(-0.35, 6);
    expect(sfxPan(900, sq(900))).toBeCloseTo(SFX_PAN_MAX, 6);
    expect(sfxPan(9000, sq(9000))).toBeCloseTo(SFX_PAN_MAX, 6);
    expect(sfxPan(-9000, sq(9000))).toBeCloseTo(-SFX_PAN_MAX, 6);
    expect(sfxPan(30, sq(30))).toBe(0);
    expect(sfxPan(20, sq(20) + sq(20))).toBe(0);
    expect(sfxPan(0, sq(5000))).toBe(0); // 真上・真下は中央
    for (let dx = -20000; dx <= 20000; dx += 250) expect(Math.abs(sfxPan(dx, sq(dx)))).toBeLessThanOrEqual(SFX_PAN_MAX);
  });
  it('大砲の音: 帯 0〜1 は gun_near、帯 2〜3 は gun_far（こもった遠雷）', () => {
    expect([0, 1, 2, 3].map(sfxGunKey)).toEqual(['gun_near', 'gun_near', 'gun_far', 'gun_far']);
  });
  it('大砲の鍵は距離で決まる: 1,500 m までは gun_near、それより遠ければ gun_far、16 km より遠ければ（どちらの鍵でも）届かない', () => {
    const key = (m: number): string => sfxGunKey(sfxBand(sq(m)));
    expect([0, 399, 400, 1500].map(key)).toEqual(['gun_near', 'gun_near', 'gun_near', 'gun_near']);
    expect([1501, 4000, 10000, 16000].map(key)).toEqual(['gun_far', 'gun_far', 'gun_far', 'gun_far']);
    const m = new SfxMixer();
    expect(m.playAt(sfxGunKey(sfxBand(sq(20000))), 0, 20000, 0, 0)).toBe(-1);
    expect(m.lastDrop).toBe(SFX_DROP_FAR);
    // 自艇の砲（距離 0）は一番大きい帯
    expect(m.playAt('mg', 0, 0, 0, 0)).toBeGreaterThanOrEqual(0);
    expect(m.gain).toBeCloseTo(SFX_TABLE.mg.gain * SFX_BAND_GAIN[0]!, 6);
  });
  it('鍵の添字は SFX_KEYS の順', () => {
    SFX_KEYS.forEach((k, i) => expect(sfxKeyIndex(k)).toBe(i));
  });
});

describe('SfxMixer（最小間隔・届く帯・声 16 本と優先。spec §7.3）', () => {
  it('位置つき: 音量＝鍵 × 帯 × 倍率、パンは dx から、鳴らした数を数える', () => {
    const m = new SfxMixer();
    const v = m.playAt('blast_l', 450, 600, 0, 0, 1, 0.7);
    expect(v).toBe(0);
    expect(m.band).toBe(1);
    expect(m.gain).toBeCloseTo(SFX_TABLE.blast_l.gain * 0.55 * 0.7, 6);
    expect(m.pan).toBeCloseTo(0.35, 6);
    expect(m.stole).toBe(false);
    expect(m.lastDrop).toBe(SFX_DROP_NONE);
    expect(m.played[sfxKeyIndex('blast_l')]).toBe(1);
    expect(m.playAt('mg', 0, 0, 0, 0)).toBe(1);
    expect(m.gain).toBeCloseTo(SFX_TABLE.mg.gain, 6);
    expect(m.pan).toBe(0);
    expect(m.busyVoices(0)).toBe(2);
    expect(m.maxBusy).toBe(2);
  });
  it('届く帯: 小さい水柱は 1,500 m まで・機銃と大きい水柱は 4,000 m まで・砲と爆発は 16,000 m まで', () => {
    const m = new SfxMixer();
    const reach = (key: 'splash_s' | 'mg' | 'splash_l' | 'gun_far' | 'blast_l' | 'sink', distM: number): boolean => { m.reset(); return m.playAt(key, 0, distM, 0, 0) >= 0; };
    expect(reach('splash_s', 1500)).toBe(true);
    expect(reach('splash_s', 1501)).toBe(false);
    expect(m.lastDrop).toBe(SFX_DROP_FAR);
    expect(reach('mg', 4000)).toBe(true);
    expect(reach('mg', 4001)).toBe(false);
    expect(reach('splash_l', 4000)).toBe(true);
    expect(reach('splash_l', 4001)).toBe(false);
    for (const k of ['gun_far', 'blast_l', 'sink'] as const) {
      expect(reach(k, 16000), k).toBe(true);
      expect(reach(k, 16001), k).toBe(false);
    }
    expect(m.dropped[SFX_DROP_FAR]).toBe(6);
  });
  it('最小間隔はゲームの時計で鍵ごと: mg は 0.07 秒・ほかの鍵は別に数える・位置なしも同じ', () => {
    const m = new SfxMixer();
    expect(m.playAt('mg', 0, 0, 10, 0)).toBeGreaterThanOrEqual(0);
    expect(m.playAt('mg', 0, 0, 10.05, 0.05)).toBe(-1);
    expect(m.lastDrop).toBe(SFX_DROP_RATE);
    expect(m.playAt('blast_l', 0, 0, 10.05, 0.05)).toBeGreaterThanOrEqual(0);
    expect(m.playAt('mg', 0, 0, 10.07, 0.07)).toBeGreaterThanOrEqual(0);
    expect(m.playFlat('ui_tap', 10.07, 0.07)).toBeGreaterThanOrEqual(0);
    expect(m.playFlat('ui_tap', 10.07, 0.07)).toBeGreaterThanOrEqual(0); // 合図・UI は最小間隔 0（冷却は core/sfx-cues）
    expect(m.dropped[SFX_DROP_RATE]).toBe(1);
    // 1 秒に 60 回の機銃（固定ステップごと）は 0.07 秒に 1 発＝毎秒 14 発以下に間引かれる
    const n = new SfxMixer();
    let played = 0;
    for (let i = 0; i < 600; i++) if (n.playAt('mg', 0, 0, i / 60, i / 60) >= 0) played++;
    expect(played).toBeLessThanOrEqual(Math.ceil(10 / SFX_TABLE.mg.minIntervalS));
    expect(played).toBeGreaterThanOrEqual(110);
  });
  it('帯ごとの音量: 同じ鍵は遠いほど小さい（鍵 × 帯）。頼まれた音の帯は、落とした時も band に残る（帯の外は −1・位置なしは 0）', () => {
    const m = new SfxMixer();
    const gains = [100, 1000, 3000, 10000].map((d, i) => { m.reset(); expect(m.playAt('blast_l', d, 0, i, 0)).toBeGreaterThanOrEqual(0); expect(m.band).toBe(i); return m.gain; });
    expect(gains).toEqual(SFX_BAND_GAIN.map((b) => SFX_TABLE.blast_l.gain * b));
    m.reset();
    expect(m.playAt('splash_s', 0, 3000, 50, 0)).toBe(-1); // 届かない（帯 2）
    expect([m.lastDrop, m.band]).toEqual([SFX_DROP_FAR, 2]);
    expect(m.playAt('mg', 0, 30000, 50, 0)).toBe(-1);
    expect(m.band).toBe(-1);
    expect(m.playAt('mg', 0, 100, 50, 0)).toBeGreaterThanOrEqual(0);
    expect(m.playAt('mg', 0, 2000, 50.01, 0)).toBe(-1); // 最小間隔で落とした時も帯は書く
    expect([m.lastDrop, m.band]).toEqual([SFX_DROP_RATE, 2]);
    m.playFlat('ui_tap', 51, 0);
    expect(m.band).toBe(0);
  });
  it('1 発だけの最小間隔（S2。沈没の 2 次の爆発）: 同じ鍵が鳴ってからその秒の内は落とす。表の値より短い指定は表の値のまま。ほかの鍵には効かない', () => {
    const tab = SFX_TABLE.blast_s.minIntervalS; // S5: 0.35 秒
    const sec = 0.5; // 2 次の爆発の指定（SFX_SECONDARY_BLAST）
    const m = new SfxMixer();
    expect(m.playAt('blast_s', 0, 0, 10, 0)).toBeGreaterThanOrEqual(0);
    expect(m.playAt('blast_s', 0, 0, 10 + tab + 0.05, tab + 0.05, 1, 0.7, sec)).toBe(-1); // 2 次の爆発: 0.5 秒の内
    expect(m.lastDrop).toBe(SFX_DROP_RATE);
    expect(m.playAt('blast_s', 0, 0, 10 + tab + 0.05, tab + 0.05)).toBeGreaterThanOrEqual(0); // ふつうの小さい爆発は表の秒だけ
    const t1 = 10 + tab + 0.05;
    expect(m.playAt('blast_s', 0, 0, t1 + sec - 0.05, t1 - 10 + sec - 0.05, 1, 0.7, sec)).toBe(-1); // 直前の小さい爆発から 0.45 秒
    expect(m.playAt('blast_s', 0, 0, t1 + sec, t1 - 10 + sec, 1, 0.7, sec)).toBeGreaterThanOrEqual(0);
    expect(m.gain).toBeCloseTo(SFX_TABLE.blast_s.gain * 0.7, 6);
    expect(m.playAt('blast_s', 0, 0, t1 + sec + tab - 0.05, t1 - 10 + sec + tab - 0.05, 1, 1, 0.01)).toBe(-1); // 表の秒より短い指定は効かない
    expect(m.playAt('blast_l', 0, 0, t1 + sec + 0.05, t1 - 10 + sec + 0.05, 1, 1, sec)).toBeGreaterThanOrEqual(0); // ほかの鍵の時刻は見ない
  });
  it('届かない遠い音・声の無い音は最小間隔の時刻を進めない（次の近い音を間引かない）', () => {
    const m = new SfxMixer();
    expect(m.playAt('mg', 0, 9000, 5, 0)).toBe(-1);
    expect(m.lastDrop).toBe(SFX_DROP_FAR);
    expect(m.playAt('mg', 0, 100, 5, 0)).toBeGreaterThanOrEqual(0);
    const one = new SfxMixer(1);
    expect(one.playFlat('ui_tap', 0, 0)).toBe(0);
    expect(one.playAt('mg', 0, 0, 0, 0)).toBe(-1);
    expect(one.lastDrop).toBe(SFX_DROP_VOICES);
    expect(one.playAt('mg', 0, 0, 0.01, SFX_TABLE.ui_tap.seconds)).toBe(0); // ui_tap が鳴り終わった時刻
  });
  it('声は 16 本まで。鳴り終わった声（再生の時計）は空く。rate が速いほど早く空く', () => {
    const m = new SfxMixer();
    for (let i = 0; i < SFX_VOICES; i++) expect(m.playFlat('bell', i, 0)).toBe(i);
    expect(m.busyVoices(0)).toBe(SFX_VOICES);
    expect(m.playFlat('bell', 99, 0.5)).toBe(-1);
    expect(m.lastDrop).toBe(SFX_DROP_VOICES);
    expect(m.busyVoices(SFX_TABLE.bell.seconds)).toBe(0);
    expect(m.playFlat('bell', 100, SFX_TABLE.bell.seconds)).toBe(0);
    expect(m.stole).toBe(false);
    expect(m.maxBusy).toBe(SFX_VOICES);
    const r = new SfxMixer(1);
    r.playFlat('bell', 0, 0, 2);
    expect(r.busyVoices(SFX_TABLE.bell.seconds / 2 - 0.01)).toBe(1);
    expect(r.busyVoices(SFX_TABLE.bell.seconds / 2)).toBe(0);
  });
  it('優先: 満ちていれば自分より低い声のうち一番低くて古い声を奪う。同じか高い声しか無ければ新しい方を捨てる', () => {
    const m = new SfxMixer(4);
    // 声 0: 爆発（優先 2）・声 1: 水柱（0。古い）・声 2: 砲（1）・声 3: 水柱（0。新しい）
    expect(m.playAt('torp_hit', 0, 0, 0, 0.0)).toBe(0);
    expect(m.playAt('splash_l', 0, 0, 0, 0.1)).toBe(1);
    expect(m.playAt('gun_far', 0, 0, 0, 0.2)).toBe(2);
    expect(m.playAt('splash_s', 0, 0, 0, 0.3)).toBe(3);
    // 砲（1）は水柱（0）の古い方を奪う
    expect(m.playAt('gun_near', 0, 0, 0, 0.32)).toBe(1);
    expect(m.stole).toBe(true);
    // 水柱（0）は自分より低い声が無い＝捨てる
    expect(m.playAt('splash_l', 0, 0, 1, 0.33)).toBe(-1);
    expect(m.lastDrop).toBe(SFX_DROP_VOICES);
    // 爆発（2）は一番低い水柱（声 3）を奪い、次の爆発は砲のうち古い方（声 2 の gun_far 0.2 秒）を奪う
    expect(m.playAt('blast_l', 0, 0, 1, 0.34)).toBe(3);
    expect(m.playAt('blast_s', 0, 0, 1, 0.35)).toBe(2);
    // 合図（3）は残った砲（声 1）、その次は爆発のうち一番古い声 0 を奪う
    expect(m.playFlat('alarm', 1, 0.36)).toBe(1);
    expect(m.playFlat('bell', 1, 0.37)).toBe(0);
    expect(m.stolen).toBe(5);
    expect(m.busyVoices(0.37)).toBe(4);
    expect(m.maxBusy).toBe(4);
  });
  it('合図・UI は奪われない（16 本が合図なら、爆発も次の合図も捨てる）', () => {
    const m = new SfxMixer();
    for (let i = 0; i < SFX_VOICES; i++) m.playFlat('bell', i, 0);
    expect(m.playAt('torp_hit', 0, 0, 50, 0.1)).toBe(-1);
    expect(m.playFlat('alarm', 50, 0.1)).toBe(-1);
    expect(m.stolen).toBe(0);
    expect(m.dropped[SFX_DROP_VOICES]).toBe(2);
  });
  it('reset: 声と最小間隔を空ける（数は残す）', () => {
    const m = new SfxMixer(1);
    expect(m.playAt('mg', 0, 0, 0, 0)).toBe(0);
    expect(m.playAt('mg', 0, 0, 0.01, 0.01)).toBe(-1);
    m.reset();
    expect(m.playAt('mg', 0, 0, 0.01, 0.01)).toBe(0);
    expect(m.played[sfxKeyIndex('mg')]).toBe(2);
  });
});
