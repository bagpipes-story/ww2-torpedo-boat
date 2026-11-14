// v0.7.2 S0・S1（アートと音③：BGM と命中スローの音。spec-v0720 §8.1・§9・brief L13〜L18）: 曲のファイルの作法を source で確かめる（tests/sfx-rules から分けた。取り出しは tests/sfx-rules-kit）。
// - S0: 曲の純粋な層（config/sfx-music-config・assets/sfx-music-*）にも sfx-rules の作法が全部効く（毎フレームの口＝stepBuild・stepTone などの本体に確保なし）。
// - S1: 再生の層に曲の再生 systems/sfx-music-player と作る列 systems/sfx-music-build（brief の 260 行に収めるため分けた）。曲の音源を作るのは再生の組を始める 1 か所・start は組の
//   when だけ・stop は今の組を止める 1 か所・曲の buffer を作るのは作る列の 1 か所。束は master へ直に（リミッタを通さない）・値は読み返さない・予約の前に消す。
//   ゲーム側で sfx-music-* を import するのは定数（config/sfx-music-config）と、曲の試聴の場の既定の id（assets/sfx-music-themes）だけ。
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PLAYBACK, PURE, SFX, SRC, code, hotBodies, imports } from './sfx-rules-kit';

describe('曲の再生の作法（v0.7.2 S1）', () => {
  it('曲（v0.7.2 S1）: 曲の音源を作るのは再生の組を始める 1 か所・start は組の when だけ・stop は今の組を止める 1 か所。曲の buffer を作るのは作る列の 1 か所。束は master へ直に（リミッタを通さない）。値は読み返さない', () => {
    const p = code('src/systems/sfx-music-player.ts');
    expect(p.match(/\.createBufferSource\(/g)!.length).toBe(1);
    expect(p.indexOf('.createBufferSource(')).toBeGreaterThan(p.indexOf('private stepStart(now: number, k: number): void {'));
    expect(p.match(/\.start\(([^)]*)\)/g)).toEqual(['.start(when)']);
    expect(p.match(/\.stop\(([^)]*)\)/g)).toEqual(['.stop(end)']);
    expect(p).toContain('      src.loop = true;\n');
    expect(p).not.toMatch(/\.createBuffer\(|loopStart|loopEnd|\.suspend\(|\.resume\(|onended|addEventListener|setTimeout|setInterval|\.then\(|\.value\b(?!\s*=)/);
    expect(p.match(/\.createGain\(/g)!.length).toBe(3); // 下げる音量・曲の束・音量の節（constructor の中）
    expect(p.lastIndexOf('.createGain(')).toBeLessThan(p.indexOf('  request(ctx: number'));
    expect(p.match(/setTargetAtTime\(/g)!.length).toBe(4); // 束・急いで 0・止める・始める
    expect(p.match(/cancelScheduledValues\(/g)!.length).toBe(4); // 予約の前に必ず消す
    expect(p).toContain('    this.duck.connect(master);\n    this.bus = ctx.createGain();\n    this.bus.connect(this.duck);\n');
    const b = code('src/systems/sfx-music-build.ts');
    expect(b.match(/\.createBuffer\(/g)!.length).toBe(1);
    expect(b.indexOf('.createBuffer(')).toBeGreaterThan(b.indexOf('private renderFinish(b: MusicBuilder): void {'));
    expect(b).not.toMatch(/\.createBufferSource\(|\.create(?:Gain|StereoPanner|DynamicsCompressor)\(|\.start\(|\.stop\(|setTimeout|setInterval|\.then\(/);
    expect(b).toContain('        b.stepBuild(MUSIC_BUILD_BUDGET);\n');
    // 確保は作る時だけの render*（表・作業用の配列・作り手）。毎フレームの口 step は render* を呼ぶだけ
    expect(b.match(/\bnew (?:MusicTables|Float32Array|MusicBuilder)\(/g)!.length).toBe(3);
    expect(b.indexOf('new MusicTables(')).toBeGreaterThan(b.indexOf('private renderStart(k: number): void {'));
    const e = code('src/systems/sfx-engine.ts');
    expect(e).toContain('    this.music = new SfxMusicPlayer(ctx, this.master, wall);\n');
    expect(e).not.toMatch(/SfxMusicPlayer\(ctx, limiter|music\.\w+\.connect\(limiter/);
    // 毎フレームの口の検査に掛かる（空の検査にしない）
    expect(hotBodies(p).length).toBeGreaterThanOrEqual(5);
    expect(hotBodies(b).length).toBeGreaterThanOrEqual(2);
    expect(hotBodies(code('src/systems/sfx-watchdog.ts')).length).toBe(1);
  });
});

describe('曲の骨組み（v0.7.2 S0）と再生（S1）', () => {
  const MUSIC = SFX.filter((f) => basename(f).startsWith('sfx-music-'));
  it('曲のファイル: 純粋な層（config・assets）に 5 本、再生の層（systems）に S1 の 2 本。どれにも上の作法（乱数・毎フレームの口・import・300 行）が効く', () => {
    expect(MUSIC.filter((f) => PURE.includes(f))).toEqual(['src/assets/sfx-music-compose.ts', 'src/assets/sfx-music-render.ts', 'src/assets/sfx-music-synth.ts', 'src/assets/sfx-music-themes.ts', 'src/config/sfx-music-config.ts']);
    expect(MUSIC.filter((f) => PLAYBACK.includes(f))).toEqual(['src/systems/sfx-music-build.ts', 'src/systems/sfx-music-player.ts']);
    expect(MUSIC.length).toBe(7);
    expect(readFileSync('src/systems/sfx-music-player.ts', 'utf8').split('\n').length).toBeLessThanOrEqual(261); // brief: 260 行以下
    expect(readFileSync('src/scenes/music-lab-scene.ts', 'utf8').split('\n').length).toBeLessThanOrEqual(251); // 250 行以下
  });
  it('毎フレームの口（作る口 stepBuild・表を埋める stepTables・音符を書く stepTone／stepFm／stepNoise・段の step*）は検査に掛かる（空の検査にしない）', () => {
    expect(hotBodies(code('src/assets/sfx-music-render.ts')).length).toBeGreaterThanOrEqual(5);
    expect(hotBodies(code('src/assets/sfx-music-synth.ts')).length).toBeGreaterThanOrEqual(5);
    expect(code('src/assets/sfx-music-render.ts')).toMatch(/\bstepBuild\(budget: number\): number \{/);
  });
  it('S1: ゲーム側で sfx-music-* を import するのは定数（config/sfx-music-config。Title・Result・2 つの試聴の場）と、曲の試聴の場の既定の id（assets/sfx-music-themes）だけ（作曲・合成は再生の層から）', () => {
    const users: string[] = [];
    for (const f of SRC) {
      if (basename(f).startsWith('sfx-')) continue;
      const ps = imports(code(f)).filter((p) => basename(p).startsWith('sfx-music-'));
      if (ps.length === 0) continue;
      users.push(f);
      for (const p of ps) expect(p, f).toMatch(f.endsWith('/music-lab-scene.ts') ? /^\.\.\/(?:config\/sfx-music-config|assets\/sfx-music-themes)$/ : /^\.\.\/config\/sfx-music-config$/);
    }
    expect(users.sort()).toEqual(['src/scenes/music-lab-scene.ts', 'src/scenes/result-scene.ts', 'src/scenes/sound-lab-scene.ts', 'src/scenes/title-scene.ts']);
  });
});

