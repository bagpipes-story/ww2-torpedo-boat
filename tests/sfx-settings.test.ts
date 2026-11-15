// v0.7.1 S1（アートと音②：合成の効果音。spec-v0710 §8・D6）: 音のオン／オフの保存 systems/sfx-settings。鍵は night-hunters.sound（'0' で消音）。
// 無い・読めない・書けない（プライベートブラウズ・容量・無効）時は音オンで、例外を外へ出さない（progress-storage の見越し点マーカーと同じ作法）。
// 選んだ値はこのページの間は覚える（保存が効かない端末でも「音: オフ」が効く）。選ぶとエンジンの消音が切り替わり、オンにした時はボタンの音が鳴る。
// v0.7.2 S1: 「曲: オン／オフ」も同じ作法で別の鍵 night-hunters.music（'0' でオフ・既定オン）。「音」とは別に覚え、選ぶと曲の再生に渡す。
import { afterEach, describe, expect, it } from 'vitest';
import { SFX_STORAGE_KEY } from '../src/config/sfx-config';
import { MUSIC_STORAGE_KEY } from '../src/config/sfx-music-config';
import { registerSfxEngine } from '../src/systems/sfx-bus';
import type { SfxEngine } from '../src/systems/sfx-engine';
import { forgetMusicChoice, forgetSoundChoice, musicEnabled, setMusicEnabled, setSoundEnabled, soundEnabled } from '../src/systems/sfx-settings';

type Store = { getItem(k: string): string | null; setItem(k: string, v: string): void };
const g = globalThis as unknown as { localStorage?: Store };
const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
function useStore(s: Store | undefined): void {
  Object.defineProperty(globalThis, 'localStorage', { value: s, configurable: true, writable: true });
}
function memoryStore(init: Record<string, string> = {}): Store & { data: Record<string, string> } {
  const data = { ...init };
  return { data, getItem: (k) => (k in data ? data[k]! : null), setItem: (k, v) => { data[k] = v; } };
}
const throwing: Store = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('QuotaExceededError'); } };

afterEach(() => {
  forgetSoundChoice();
  forgetMusicChoice();
  registerSfxEngine(null);
  if (original) Object.defineProperty(globalThis, 'localStorage', original);
  else delete g.localStorage;
});

describe('音のオン／オフの保存（night-hunters.sound）', () => {
  it('鍵は night-hunters.sound。無ければ音オン・\'0\' で消音・\'1\' でオン', () => {
    expect(SFX_STORAGE_KEY).toBe('night-hunters.sound');
    useStore(memoryStore());
    expect(soundEnabled()).toBe(true);
    useStore(memoryStore({ [SFX_STORAGE_KEY]: '0' }));
    expect(soundEnabled()).toBe(false);
    useStore(memoryStore({ [SFX_STORAGE_KEY]: '1' }));
    expect(soundEnabled()).toBe(true);
  });
  it('選ぶと保存する（\'0\'／\'1\'）。ページを開き直しても（選んだ値を忘れても）保存から読める', () => {
    const s = memoryStore();
    useStore(s);
    setSoundEnabled(false);
    expect(s.data[SFX_STORAGE_KEY]).toBe('0');
    forgetSoundChoice();
    expect(soundEnabled()).toBe(false);
    setSoundEnabled(true);
    expect(s.data[SFX_STORAGE_KEY]).toBe('1');
    forgetSoundChoice();
    expect(soundEnabled()).toBe(true);
  });
  it('保存が投げる・無い端末: 既定は音オンで例外を出さない。選んだ値はこのページの間は効く', () => {
    for (const s of [throwing, undefined]) {
      forgetSoundChoice();
      useStore(s);
      expect(() => soundEnabled()).not.toThrow();
      expect(soundEnabled()).toBe(true);
      expect(() => setSoundEnabled(false)).not.toThrow();
      expect(soundEnabled()).toBe(false);
      expect(() => setSoundEnabled(true)).not.toThrow();
      expect(soundEnabled()).toBe(true);
    }
  });
  it('選ぶとエンジンの消音が切り替わり、オンにした時だけボタンの音（ui_tap）を鳴らす。エンジンが無くても落ちない', () => {
    useStore(memoryStore());
    expect(() => setSoundEnabled(false)).not.toThrow();
    const calls: string[] = [];
    const fake = { setMuted: (v: boolean) => calls.push(`muted:${v}`), playFlat: (k: string) => calls.push(`play:${k}`) };
    registerSfxEngine(fake as unknown as SfxEngine);
    setSoundEnabled(false);
    expect(calls).toEqual(['muted:true']);
    setSoundEnabled(true);
    expect(calls).toEqual(['muted:true', 'muted:false', 'play:ui_tap']);
  });
});

describe('曲のオン／オフの保存（night-hunters.music。v0.7.2 S1・D7）', () => {
  it('鍵は night-hunters.music（「音」と別）。無ければ曲オン・\'0\' でオフ・\'1\' でオン。選ぶと保存し、開き直しても読める', () => {
    expect(MUSIC_STORAGE_KEY).toBe('night-hunters.music');
    expect(MUSIC_STORAGE_KEY).not.toBe(SFX_STORAGE_KEY);
    useStore(memoryStore());
    expect(musicEnabled()).toBe(true);
    useStore(memoryStore({ [MUSIC_STORAGE_KEY]: '0' }));
    expect(musicEnabled()).toBe(false);
    const s = memoryStore({ [SFX_STORAGE_KEY]: '0' });
    useStore(s);
    setMusicEnabled(false);
    expect(s.data[MUSIC_STORAGE_KEY]).toBe('0');
    forgetMusicChoice();
    expect(musicEnabled()).toBe(false);
    setMusicEnabled(true);
    forgetMusicChoice();
    expect([musicEnabled(), s.data[MUSIC_STORAGE_KEY], soundEnabled(), s.data[SFX_STORAGE_KEY]]).toEqual([true, '1', false, '0']); // 「音」の値はそのまま
  });
  it('保存が投げる・無い端末: 既定は曲オンで例外を出さない。選んだ値はこのページの間は効く', () => {
    for (const s of [throwing, undefined]) {
      forgetMusicChoice();
      useStore(s);
      expect(() => musicEnabled()).not.toThrow();
      expect(musicEnabled()).toBe(true);
      expect(() => setMusicEnabled(false)).not.toThrow();
      expect(musicEnabled()).toBe(false);
    }
  });
  it('選ぶと曲の再生に渡す（ボタンの音は鳴らさない＝MenuButton が鳴らす。消音は変えない）。エンジンが無くても落ちない', () => {
    useStore(memoryStore());
    expect(() => setMusicEnabled(false)).not.toThrow();
    const calls: string[] = [];
    const fake = { setMuted: (v: boolean) => calls.push(`muted:${v}`), playFlat: (k: string) => calls.push(`play:${k}`), music: { setEnabled: (v: boolean) => calls.push(`music:${v}`) } };
    registerSfxEngine(fake as unknown as SfxEngine);
    setMusicEnabled(true);
    setMusicEnabled(false);
    expect(calls).toEqual(['music:true', 'music:false']);
  });
});
