// v0.7.1 S1（アートと音②：合成の効果音。spec-v0710 §8・D6）: 音のオン／オフの保存 systems/sfx-settings。鍵は night-hunters.sound（'0' で消音）。
// 無い・読めない・書けない（プライベートブラウズ・容量・無効）時は音オンで、例外を外へ出さない（progress-storage の見越し点マーカーと同じ作法）。
// 選んだ値はこのページの間は覚える（保存が効かない端末でも「音: オフ」が効く）。選ぶとエンジンの消音が切り替わり、オンにした時はボタンの音が鳴る。
import { afterEach, describe, expect, it } from 'vitest';
import { SFX_STORAGE_KEY } from '../src/config/sfx-config';
import { registerSfxEngine } from '../src/systems/sfx-bus';
import type { SfxEngine } from '../src/systems/sfx-engine';
import { forgetSoundChoice, setSoundEnabled, soundEnabled } from '../src/systems/sfx-settings';

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
