// v0.7.2 S0・S1（アートと音③：BGM と命中スローの音。spec-v0720 §8.1・§9・brief L13〜L18）: 曲のファイルの作法を source で確かめる（tests/sfx-rules から分けた。取り出しは tests/sfx-rules-kit）。
// - S0: 曲の純粋な層（config/sfx-music-config・assets/sfx-music-*）にも sfx-rules の作法が全部効く（毎フレームの口＝stepBuild・stepTone などの本体に確保なし）。
// - S1: 再生の層に曲の再生 systems/sfx-music-player と作る列 systems/sfx-music-build（brief の 260 行に収めるため分けた）。曲の音源を作るのは再生の組を始める 1 か所・start は組の
//   when だけ・stop は今の組を止める 1 か所・曲の buffer を作るのは作る列の 1 か所。束は master へ直に（リミッタを通さない）・値は読み返さない・予約の前に消す。
//   ゲーム側で sfx-music-* を import するのは定数（config/sfx-music-config）と、曲の試聴の場の既定の id（assets/sfx-music-themes）だけ。
// - S2: 音源の組を systems/sfx-music-slots へ分けた（曲の音源を作る・start・stop・組の音量はそこ。再生は束と決めだけ）。曲を下げる systems/sfx-music-duck は下げる音量のノードだけに書く
//   （予約の前に消す・鳴り始める時刻で・確保しない）。段の音量と時定数は core/sfx-music-mood の関数（再生と道具が同じ物）。
// - S3（spec-v0720 §6・brief L28〜L30）: 命中スローの音 systems/sfx-slowmo。ベッドの濾波器はエンジンの constructor の 1 か所で作り（ループの束と曲 → 濾波器 → master）、書くのは
//   予約の前に消してからの setTargetAtTime だけ（値は読み返さない・音源を作らない）。曲の rate は音源の組の stepRate（3 層に同じ時刻）。読み口は slowMoLeftS だけを読み、sfxLoops で 1 回。
//   ループの rate は applySfxSlowRate（確保しない・目標そのものは書き換えない）を通してループの再生へ。戻すのは sfxLoopsStop とメニュー・試聴の場の sfxMusic。
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PLAYBACK, PURE, SFX, SRC, code, hotBodies, imports } from './sfx-rules-kit';

describe('曲の再生の作法（v0.7.2 S1）', () => {
  it('曲（v0.7.2 S1・S2）: 曲の音源を作るのは音源の組を始める 1 か所・start は組の when だけ・stop は今の組を止める 1 か所。曲の buffer を作るのは作る列の 1 か所。束は master へ直に（リミッタを通さない）。値は読み返さない', () => {
    const sl = code('src/systems/sfx-music-slots.ts');
    expect(sl.match(/\.createBufferSource\(/g)!.length).toBe(1);
    expect(sl.indexOf('.createBufferSource(')).toBeGreaterThan(sl.indexOf('  stepStart(now: number, k: number, n: number,'));
    expect(sl.match(/\.start\(([^)]*)\)/g)).toEqual(['.start(when)']);
    expect(sl.match(/\.stop\(([^)]*)\)/g)).toEqual(['.stop(end)']);
    expect(sl).toContain('      src.loop = true;\n');
    expect(sl.match(/\.createGain\(/g)!.length).toBe(1); // 音量の節（constructor の中）
    expect(sl.lastIndexOf('.createGain(')).toBeLessThan(sl.indexOf('  live(now: number): number {'));
    expect(sl.match(/setTargetAtTime\(/g)!.length).toBe(5); // 急いで 0・止める・始める・段・速さ（S3）
    expect(sl.match(/cancelScheduledValues\(/g)!.length).toBe(5); // 予約の前に必ず消す
    const p = code('src/systems/sfx-music-player.ts');
    expect(p).not.toMatch(/\.createBufferSource\(|\.start\(|\.stop\(/);
    for (const x of [p, sl]) expect(x).not.toMatch(/\.createBuffer\(|loopStart|loopEnd|\.suspend\(|\.resume\(|onended|addEventListener|setTimeout|setInterval|\.then\(|\.value\b(?!\s*=)/);
    expect(p.match(/\.createGain\(/g)!.length).toBe(2); // 下げる音量・曲の束（constructor の中）
    expect(p.lastIndexOf('.createGain(')).toBeLessThan(p.indexOf('  request(ctx: number'));
    expect(p.match(/setTargetAtTime\(/g)!.length).toBe(1); // 束（一時停止）
    expect(p.match(/setValueAtTime\(/g)!.length).toBe(1); // 一時停止のまま動き出した時に束を今すぐ 0（L24）
    expect(p.match(/cancelScheduledValues\(/g)!.length).toBe(1);
    expect(p).toContain('    this.duck.connect(out);\n    this.bus = ctx.createGain();\n    this.bus.connect(this.duck);\n');
    // S2: 曲を下げるのは下げる音量のノードだけ（予約の前に消す・2 つの予約）。エンジンは単発を鳴らせた時（fire の最後）に 1 回呼ぶ
    const d = code('src/systems/sfx-music-duck.ts');
    expect(d).not.toMatch(/\.create\w*\(|\.start\(|\.stop\(|\.suspend\(|\.resume\(|onended|addEventListener|setTimeout|setInterval|\.then\(|\.value\b/);
    expect(d.match(/cancelScheduledValues\(/g)!.length).toBe(1);
    expect(d.match(/setTargetAtTime\(/g)!.length).toBe(2);
    expect(d).toContain('    const p = this.node.gain;\n    p.cancelScheduledValues(whenS);\n');
    const eng = code('src/systems/sfx-engine.ts');
    expect(eng).toContain('    this.duck = new SfxMusicDuck(this.music.duck);\n');
    expect(eng.match(/this\.duck\.play\(/g)!.length).toBe(1);
    expect(eng).toContain('    this.sources++;\n    this.duck.play(keyIndex, m.band, delayS > 0 ? ctx.currentTime + delayS : ctx.currentTime);\n  }\n');
    const b = code('src/systems/sfx-music-build.ts');
    expect(b.match(/\.createBuffer\(/g)!.length).toBe(1);
    expect(b.indexOf('.createBuffer(')).toBeGreaterThan(b.indexOf('private renderFinish(b: MusicBuilder): void {'));
    expect(b).not.toMatch(/\.createBufferSource\(|\.create(?:Gain|StereoPanner|DynamicsCompressor)\(|\.start\(|\.stop\(|setTimeout|setInterval|\.then\(/);
    expect(b).toContain('        b.stepBuild(MUSIC_BUILD_BUDGET);\n');
    // 確保は作る時だけの render*（表・作業用の配列・作り手）。毎フレームの口 step は render* を呼ぶだけ
    expect(b.match(/\bnew (?:MusicTables|Float32Array|MusicBuilder)\(/g)!.length).toBe(3);
    expect(b.indexOf('new MusicTables(')).toBeGreaterThan(b.indexOf('private renderStart(k: number): void {'));
    const e = code('src/systems/sfx-engine.ts');
    expect(e).toContain('    this.music = new SfxMusicPlayer(ctx, bed, wall);\n');
    expect(e).not.toMatch(/SfxMusicPlayer\(ctx, limiter|music\.\w+\.connect\(limiter/);
    // 毎フレームの口の検査に掛かる（空の検査にしない）
    expect(hotBodies(p).length).toBeGreaterThanOrEqual(4);
    expect(hotBodies(sl).length).toBeGreaterThanOrEqual(3);
    expect(hotBodies(d).length).toBe(1);
    expect(hotBodies(b).length).toBeGreaterThanOrEqual(2);
    expect(hotBodies(code('src/systems/sfx-watchdog.ts')).length).toBe(1);
  });
});

describe('曲の骨組み（v0.7.2 S0）と再生（S1）', () => {
  const MUSIC = SFX.filter((f) => basename(f).startsWith('sfx-music-'));
  it('曲のファイル: 純粋な層（config・assets・core）に 6 本、再生の層（systems）に S1 の 2 本と S2 の 2 本。どれにも上の作法（乱数・毎フレームの口・import・300 行）が効く', () => {
    expect(MUSIC.filter((f) => PURE.includes(f))).toEqual([
      'src/assets/sfx-music-compose.ts', 'src/assets/sfx-music-render.ts', 'src/assets/sfx-music-synth.ts', 'src/assets/sfx-music-themes.ts', 'src/config/sfx-music-config.ts', 'src/core/sfx-music-mood.ts',
    ]);
    expect(MUSIC.filter((f) => PLAYBACK.includes(f))).toEqual(['src/systems/sfx-music-build.ts', 'src/systems/sfx-music-duck.ts', 'src/systems/sfx-music-player.ts', 'src/systems/sfx-music-slots.ts']);
    expect(MUSIC.length).toBe(10);
    expect(readFileSync('src/systems/sfx-music-player.ts', 'utf8').split('\n').length).toBeLessThanOrEqual(261); // S1 の brief: 260 行以下（S2 は音源の組を sfx-music-slots へ分けて保つ）
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

describe('命中スローの音の作法（v0.7.2 S3）', () => {
  it('ベッドの濾波器はエンジンの constructor の 1 か所（ループの束と曲 → 濾波器 → master・単発は通らない）。書くのは予約の前に消した setTargetAtTime だけ・値は読み返さない・音源を作らない', () => {
    const e = code('src/systems/sfx-engine.ts');
    expect(e.match(/\.createBiquadFilter\(/g)!.length).toBe(1);
    expect(e.indexOf('.createBiquadFilter(')).toBeLessThan(e.indexOf('setBuffer(key: SfxKey'));
    expect(e).toContain('    this.slow = new SfxSlowMo(ctx, bed, this.music.slots);\n');
    expect(e).toContain('    this.slow.step();\n    this.music.update(dtS);\n');
    expect(e).not.toMatch(/shots\.connect\(bed|limiter\.connect\(bed|fade\.connect\(bed/);
    for (const f of SRC) if (f !== 'src/systems/sfx-engine.ts') expect(code(f), f).not.toMatch(/\.createBiquadFilter\(/);
    const w = code('src/systems/sfx-slowmo.ts');
    expect(w).not.toMatch(/\.create\w*\(|\.start\(|\.stop\(|\.suspend\(|\.resume\(|onended|addEventListener|setTimeout|setInterval|\.then\(|\.value\b(?!\s*=)|setValueAtTime|linearRamp/);
    expect(w.match(/cancelScheduledValues\(/g)!.length).toBe(1);
    expect(w.match(/setTargetAtTime\(/g)!.length).toBe(1);
    expect(w).toContain("    if (want === this.shown || this.ctx.state !== RUNNING) return;\n");
    expect(hotBodies(w).length).toBeGreaterThanOrEqual(2); // update・step（確保なしの検査に掛かる）
    // applySfxSlowRate（毎フレーム。名前が口の検査に当たらないのでここで見る）: 確保しない・src を書き換えない・factor 1 は写さない
    const a = w.slice(w.indexOf('export function applySfxSlowRate('), w.indexOf('export class SfxSlowMo'));
    expect(a.length).toBeGreaterThan(100);
    expect(a.slice(a.indexOf('{'))).not.toMatch(/\bnew\s|=>|\.(map|filter|slice|concat|fill)\(|\{\s*\w+\s*:|=\s*\[|src\.\w+\[i\]\s*=(?!=)/);
    expect(a).toContain('  if (factor === 1) return src;\n');
  });
  it('読み口: 読むのは slowMoLeftS だけ（型は 1 欄・sfxLoops でフレームに 1 回）。戻すのは sfxLoopsStop とメニュー・試聴の場の sfxMusic。案を替えるのは曲の試聴の場だけ', () => {
    const b = code('src/systems/sfx-bus.ts');
    expect(b).toContain('export interface SfxSlowMoSource {\n  readonly slowMoLeftS: number;\n}\n');
    expect(b.match(/\bslowMo\b/g)!.length).toBe(3); // 宣言・登録・sfxLoops の 1 回
    expect(b).toContain('  const s = slowMo;\n  engine.slow.update(s !== null && s.slowMoLeftS > 0);\n  engine.loops.update(applySfxSlowRate(targets, engine.slow.loopFactor, engine.slow.targets), dtS, engine.muted);\n');
    expect(b).toContain('  engine.loops.stop();\n  engine.slow.reset();\n');
    expect(b).toContain('  if (ctx === MUSIC_CTX_MENU || ctx === MUSIC_CTX_LAB) engine.slow.reset();');
    expect(b.match(/engine\.slow\.reset\(\)/g)!.length).toBe(2);
    const users = SRC.filter((f) => f !== 'src/systems/sfx-bus.ts' && /\bsfxSlowVariant\(/.test(code(f)));
    expect(users).toEqual(['src/scenes/music-lab-scene.ts']);
    const registrants = SRC.filter((f) => f !== 'src/systems/sfx-bus.ts' && /\bregisterSfxSlowMo\(/.test(code(f))).sort();
    expect(registrants).toEqual(['src/systems/sfx-lab-demo.ts', 'src/systems/world-art.ts']);
    // world-art の見方は読むだけ（readonly）。論理のファイルは音を import しない（許可表は tests/sfx-rules）
    expect(code('src/systems/world-art.ts')).toContain('    readonly slowMoLeftS: number;\n');
  });
});
