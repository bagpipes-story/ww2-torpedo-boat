// v0.7.1 S0（アートと音②：合成の効果音。spec-v0710 §9.1・R14・R17）: 音のファイルの作法を source で確かめる（tests/art-rules の型）。
// 対象は src の下の sfx-*.ts 全部（段で増えると自動で入る。S0 は config/sfx-config・assets/sfx-dsp・sfx-bank・sfx-recipes-*・core/sfx-mix）。
// - 乱数は音だけの SeededRng（種は SFX_SEED_*）で、Math.random もゲームの乱数の系列も使わない＝ゲームの系列の引く回数を変えない。
// - 毎フレーム・1 発ごとに通る口（update・step・tick・play・emit・cue・alloc・sfxAt など）の本体で new・.map(・.filter(・オブジェクトのリテラルを作らない（CLAUDE.md §7）。
// - 音は論理の状態を読むだけで書かない。
// - config・assets・core の sfx は再生の API・DOM・Phaser に触らない（node の型検査とテストで回る）。import は sfx-* どうしと core/rng だけ。
//   S3: core の sfx（core/sfx-loops＝テレメトリの観測器）だけは、同じ core の中のファイル（テレメトリの型と段の定数）も import してよい（core は Phaser を引かない＝tests/core-no-phaser）。
//   S4: 合図の観測器 core/sfx-cues も同じ（テレメトリの型と段の定数だけ）。
// - import の許可表: sfx-* を import してよいのは sfx-* と、絵の層の口・シーン・UI の 10 本だけ（論理から音へ届く道が無いことの証＝R14）。
//   今の段で実際に import しているゲーム側のファイルは GAME_IMPORTERS_NOW（S0 は 0 本＝束ねが変わらない。S1 は 6 本、S2 は sink-fx を足して 7 本、S3 は hud-scene・pause-scene を足して 9 本、S4 は result-scene（Result の鐘）を足して 10 本＝許可表の全部。
//   hook を足すたびにここと HOOK_PINS を直す）。
//   S2 の「既知の穴」（大発の 13mm の発砲は絵の層を通らない）: barge-hunt は音を import しない＝着弾音だけ（絵の無い所で音だけ鳴らさない＝D5）。
// - S1 から: 再生の層（systems/sfx-*）のうち DOM に触るのは sfx-boot だけ（エンジン・口は偽の context で回る。保存は globalThis.localStorage だけ）。
// - S3: ループの再生（systems/sfx-loop-player）は、音量 5 本を作るのは constructor だけ・音源を作るのは begin の 1 か所だけ・buffer 全体を繰り返す（start の位置・長さを使わない＝L6）。
//   任務の音（systems/sfx-mission）は Phaser を import しない（出来事の口は構造の型）。
// - sfx-* と、音のために触った既存のファイルは 300 行以下。
// - v0.7.2 S0（曲の骨組み。spec-v0720 §9 S0）: 曲の純粋な層（config/sfx-music-config・assets/sfx-music-*）も名前が sfx- なので上の作法が全部効く（毎フレームの口＝stepBuild・stepTone など
//   の本体に確保なし）。S0 ではゲーム側のどのファイルも sfx-music-* を import しない（束がバイトで同じ。GAME_IMPORTERS_NOW は v0.7.1 のまま）。
// - v0.7.2 S1（spec-v0720 §8.1・brief L13〜L18）: 見張りを systems/sfx-watchdog へ分けた（context を止めるのはそこの 1 か所）。曲の再生 systems/sfx-music-player と作る列
//   systems/sfx-music-build（brief の 260 行に収めるため分けた）が再生の層に入る（10 本）。曲の音源を作るのは再生の 1 か所・曲の buffer を作るのは作る列の 1 か所・start は組の when だけ。
//   許可表に曲の試聴の場 music-lab-scene。ゲーム側で sfx-music-* を import するのは定数の config/sfx-music-config（Title・Result・試聴の場 2 つ）と、曲の試聴の場の既定の id だけ。
//   hook の pin は Title 2（メニューの曲・「曲」ボタン）・Result 1（鐘の後の曲）・Pause 1（「曲」ボタン）・効果音の試聴の場 1（曲を止める）・曲の試聴の場 2（場面と候補）＝24 行。
// - v0.7.2 S2（spec-v0720 §5.5・brief L19〜L22・L25）: 任務の曲の段の観測器 core/sfx-music-mood が純粋な層に入る（import はテレメトリの型と段の定数だけ・敵の位置・距離・見えているかの欄を
//   読まない＝D5）。再生の層に曲を下げる systems/sfx-music-duck・音源の組 systems/sfx-music-slots（sfx-music-player から分けた）・曲の試聴の場の「効果音と一緒に」の台本 systems/sfx-lab-demo（13 本）。
//   sfx-mission は段の 1 行（sfxMusicMood(stepSfxMood(…))）。
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PLAYBACK, PURE, SFX, SRC, code, hotBodies, imports, strip } from './sfx-rules-kit';

/** sfx-* を import してよいゲーム側のファイル（spec §9.1 の許可表。絵の層の口 5・UI 1・シーン 4） */
const ALLOWED_IMPORTERS = [
  'src/scenes/boot-scene.ts', 'src/systems/world-art.ts', 'src/systems/fx-bus.ts', 'src/systems/explosion-fx.ts', 'src/systems/sink-fx.ts',
  'src/ui/menu-ui.ts', 'src/scenes/hud-scene.ts', 'src/scenes/title-scene.ts', 'src/scenes/pause-scene.ts', 'src/scenes/result-scene.ts',
  // IP2（実機 2 回目）: 音の試聴の場（?sfxlab の時だけ Boot から。案の標本を作って鍵に差し替え、合図の口で鳴らす）
  'src/scenes/sound-lab-scene.ts',
  // v0.7.2 S1: 曲の試聴の場（?sfxlab の時だけ Boot から。候補を作って曲の口で鳴らす）
  'src/scenes/music-lab-scene.ts',
];
/** 今の段で sfx-* を import しているゲーム側のファイル（S1: Boot・聞き手の登録・砲と水柱の口・爆発の口・ボタン・Title の「音」ボタン。S2: 沈没の口 sink-fx。S3: hud-scene（任務の音）・pause-scene（「音」ボタン）。S4: result-scene（鐘）） */
const GAME_IMPORTERS_NOW: readonly string[] = [
  'src/scenes/boot-scene.ts', 'src/systems/world-art.ts', 'src/systems/fx-bus.ts', 'src/systems/explosion-fx.ts', 'src/systems/sink-fx.ts', 'src/ui/menu-ui.ts', 'src/scenes/title-scene.ts',
  'src/scenes/hud-scene.ts', 'src/scenes/pause-scene.ts', 'src/scenes/result-scene.ts', 'src/scenes/sound-lab-scene.ts', 'src/scenes/music-lab-scene.ts',
];
/** hook の行の pin（S1 から: ファイルとその中に在るべき 1 行。spec §2 の「触る既存ファイル」） */
const HOOK_PINS: readonly { readonly file: string; readonly line: string }[] = [
  { file: 'src/scenes/boot-scene.ts', line: '    createSfx(this.game); //' },
  { file: 'src/systems/world-art.ts', line: '    registerSfxListener(w.boat.state); //' },
  { file: 'src/systems/world-art.ts', line: '    registerSfxListener(null);\n' },
  // S2: 絵の層の口 5 行（spec §3.1）＝水柱・砲口（大砲／機銃）・爆発・2 次の爆発・沈み始め
  { file: 'src/systems/fx-bus.ts', line: "  sparks?.spray(x, y, hit);\n  sfxAt(hit ? 'splash_l' : 'splash_s', x, y);\n" },
  { file: 'src/systems/fx-bus.ts', line: "  sparks?.muzzle(x, y, big);\n  if (big) sfxGunAt(x, y);\n  else sfxAt('mg', x, y);\n" },
  { file: 'src/systems/explosion-fx.ts', line: "    sfxAt(dud ? 'blast_s' : torpedo ? 'torp_hit' : 'blast_l', x, y); //" },
  { file: 'src/systems/explosion-fx.ts', line: "    this.blast.secondary(x, y);\n    sfxAt('blast_s', x, y, SFX_SECONDARY_BLAST.gain, 1, SFX_SECONDARY_BLAST.minIntervalS); //" },
  { file: 'src/systems/sink-fx.ts', line: "    sfxAt('sink', x, y, 1, ship ? 1 : SFX_SINK_SMALL_RATE); //" },
  { file: 'src/ui/menu-ui.ts', line: "    if (!this.enabled || p.wasCanceled) return;\n    if (!this.silent) sfxUi('ui_tap'); //" }, // IP2: 試聴の場の案のボタンだけ silent
  { file: 'src/scenes/title-scene.ts', line: '      setSoundEnabled(!soundEnabled());\n' },
  // S3: Hud が任務の音を作り（艇の最大速力を 1 回渡す）、update の最後に 1 回呼ぶ。一時停止の画面の「音」ボタンと、開いた合図
  { file: 'src/scenes/hud-scene.ts', line: '    this.sfx = new MissionSfx(this.events, getBoatRecord(data, mission.playerBoatId).speed_max_kt);\n' },
  { file: 'src/scenes/hud-scene.ts', line: '    this.panel?.update(this.telemetry, this.time.now);\n    this.sfx?.update(this.telemetry, delta); //' },
  { file: 'src/scenes/pause-scene.ts', line: '      setSoundEnabled(!soundEnabled());\n      this.soundBtn?.setTitle(soundTitle());\n' },
  { file: 'src/scenes/pause-scene.ts', line: "    sfxCue('ui_tap', SFX_PAUSE_OPEN.gain, 0, SFX_PAUSE_OPEN.rate);\n" },
  // S4: Result の鐘（create の 1 行。帰投 2 打・それ以外は低く 1 打）
  { file: 'src/scenes/result-scene.ts', line: '    addBuildLabel(this);\n    sfxResultBell(r.returned); //' },
  // IP2: 試聴の場は案の標本を鍵に差し替えて合図の口で鳴らし、場を出る時に既定の標本へ戻す
  { file: 'src/scenes/sound-lab-scene.ts', line: '    sfxSetBuffer(g.key, x);\n    sfxCue(g.key, 1, delayS, v.rate);\n' },
  { file: 'src/scenes/sound-lab-scene.ts', line: '      for (const g of SFX_VARIANT_GROUPS) sfxSetBuffer(g.key, renderSfx(g.key)); // 既定の標本へ戻す\n      sfxSetMuted(!soundEnabled());\n' },
  // v0.7.2 S1: メニューの曲（Title の create・Result の鐘の後）、「曲」ボタン（Title・Pause）、効果音の試聴の場は曲を止め、曲の試聴の場は場面と候補
  { file: 'src/scenes/title-scene.ts', line: '    sfxMusic(MUSIC_CTX_MENU); //' },
  { file: 'src/scenes/title-scene.ts', line: '      setMusicEnabled(!musicEnabled());\n' },
  { file: 'src/scenes/result-scene.ts', line: '    sfxResultBell(r.returned); // 任務の終わりの鐘（v0.7.1 S4。帰投 2 打・それ以外は低く 1 打）\n    sfxMusic(MUSIC_CTX_MENU, r.returned ? MUSIC_FADE.resultReturnedDelayS : MUSIC_FADE.resultLostDelayS); //' },
  { file: 'src/scenes/pause-scene.ts', line: '      setMusicEnabled(!musicEnabled());\n      this.musicBtn?.setTitle(musicTitle());\n' },
  { file: 'src/scenes/sound-lab-scene.ts', line: '    sfxMusic(MUSIC_CTX_NONE); //' },
  { file: 'src/scenes/music-lab-scene.ts', line: '    sfxSetMuted(false);\n    sfxMusicEnabled(true);\n    sfxMusic(MUSIC_CTX_LAB);\n' },
  { file: 'src/scenes/music-lab-scene.ts', line: '    if (stop) {\n      sfxMusicAudition(null);\n    } else if (row === ROW_TITLE) {\n      sfxMusicAudition(MUSIC_TITLE_KEYS[col]!);\n' },
];
/** 音のために触った既存の src のファイル（300 行以下を見る） */
const TOUCHED: readonly string[] = [
  ...GAME_IMPORTERS_NOW, 'src/config/menu-config.ts', 'src/config/title-layout-config.ts', 'src/config/game-config.ts', 'src/config/phaser-config.ts', 'src/config/sound-lab-config.ts', 'src/ui/sound-lab-layout.ts',
  'src/config/music-lab-config.ts', 'src/ui/music-lab-layout.ts',
];

function sfxImporters(): string[] {
  return SRC.filter((f) => !basename(f).startsWith('sfx-') && imports(code(f)).some((p) => basename(p).startsWith('sfx-')));
}

describe('音のファイルの作法（v0.7.1 S0。R14）', () => {
  it('対象のファイルがある（S0 の 7 本・S2 の水柱の作り方・S3 のループの作り方と観測器・再生の層 7 本。空の検査にしない）', () => {
    for (const f of ['src/config/sfx-config.ts', 'src/assets/sfx-dsp.ts', 'src/assets/sfx-bank.ts', 'src/assets/sfx-recipes-guns.ts', 'src/assets/sfx-recipes-splashes.ts', 'src/assets/sfx-recipes-blasts.ts', 'src/assets/sfx-recipes-cues.ts', 'src/core/sfx-mix.ts']) {
      expect(SFX).toContain(f);
      expect(PURE).toContain(f);
    }
    for (const f of ['src/assets/sfx-recipes-loops.ts', 'src/core/sfx-loops.ts', 'src/assets/sfx-recipes-events.ts', 'src/core/sfx-cues.ts']) expect(PURE).toContain(f);
    expect(PLAYBACK).toEqual([
      'src/systems/sfx-audio-types.ts', 'src/systems/sfx-boot.ts', 'src/systems/sfx-bus.ts', 'src/systems/sfx-engine.ts', 'src/systems/sfx-lab-demo.ts', 'src/systems/sfx-loop-player.ts',
      'src/systems/sfx-mission.ts', 'src/systems/sfx-music-build.ts', 'src/systems/sfx-music-duck.ts', 'src/systems/sfx-music-player.ts', 'src/systems/sfx-music-slots.ts',
      'src/systems/sfx-settings.ts', 'src/systems/sfx-watchdog.ts',
    ]);
    expect(PURE).toContain('src/core/sfx-music-mood.ts');
  });
  it.each(PLAYBACK)('%s: DOM・ブラウザの再生の型の名前・Phaser に触るのは sfx-boot だけ（エンジンと口は構造の型。保存は globalThis.localStorage だけ）', (f) => {
    const s = code(f);
    if (f.endsWith('/sfx-boot.ts')) {
      // 自前の context は作らない（D3）・context は止めない（L4）・裏技の <audio> は使わない（L1）
      expect(s).not.toMatch(/new\s+(?:window\.)?(?:webkit)?AudioContext|OfflineAudioContext|AudioWorklet|createElement|\.suspend\(/);
      expect(s).toContain("if (engine !== null || !('context' in game.sound) || !game.sound.context) return;");
      expect(s).toContain("window.addEventListener('touchend', onGesture, opts);");
      expect(s).toContain("window.addEventListener('pointerup', onGesture, opts);");
      expect(s).toContain("window.addEventListener('pageshow', onGesture);");
      expect(s).toContain('const opts = { capture: true, passive: true } as const;');
      expect(s).toContain('game.events.on(Phaser.Core.Events.PRE_STEP, onPreStep);');
      expect(s).not.toMatch(/touchstart|pointerdown/); // unlock に効かない（L2）
      // S2（spec §7.4）: Boot で作る標本は SFX_BUILD_FIRST だけ。残りは PRE_STEP で 1 フレームに 1 本（setBuffer はこの 2 か所だけ）
      expect(s).toContain('for (const key of keys) if (SFX_BUILD_FIRST.includes(key)) e.setBuffer(key, renderSfx(key));');
      expect(s).toContain('  buildNext(engine);\n  engine.tick(deltaMs / MS_PER_S, performance.now());');
      expect(s.match(/\.setBuffer\(/g)!.length).toBe(2);
      expect(s.match(/renderSfx\(/g)!.length).toBe(2);
      return;
    }
    expect(s).not.toMatch(/\b(AudioContext|webkitAudioContext|AudioBuffer|GainNode|window|document|navigator|Phaser|performance)\b/);
    if (f.endsWith('/sfx-settings.ts')) expect(s.match(/localStorage/g)!.length).toBe(2);
    else expect(s).not.toMatch(/localStorage|globalThis/);
  });
  it('エンジン: 1 発ごとに作るのは音源 1 個だけ（createBufferSource は 1 か所）。声・束・リミッタ・標本を作るのは constructor と setBuffer だけ。context を止めるのは見張りの 1 か所', () => {
    const s = code('src/systems/sfx-engine.ts');
    expect(s.match(/\.createBufferSource\(/g)!.length).toBe(1);
    const ctorEnd = s.indexOf('setBuffer(key: SfxKey');
    const afterSetBuffer = s.indexOf('get muted()');
    expect(ctorEnd).toBeGreaterThan(0);
    expect(afterSetBuffer).toBeGreaterThan(ctorEnd);
    expect(s.slice(afterSetBuffer)).not.toMatch(/\.create(?:Gain|StereoPanner|DynamicsCompressor|Buffer)\(/);
    expect(s).not.toMatch(/onended|addEventListener|setTimeout|setInterval|\.then\(/);
    // v0.7.2 S1: 見張りは systems/sfx-watchdog（context を止める .suspend() は音の層でそこの 1 か所。エンジンの tick から毎フレーム）
    expect(s).not.toMatch(/\.suspend\(/);
    expect(s).toContain('    this.music.update(dtS);\n    this.watchdog.tick(wallMs);\n');
    const w = code('src/systems/sfx-watchdog.ts');
    expect(w.match(/\.suspend\(\)/g)!.length).toBe(1);
    expect(w).not.toMatch(/onended|addEventListener|setTimeout|setInterval|\.then\(|\.create\w*\(/);
    for (const f of PLAYBACK) if (!f.endsWith('/sfx-watchdog.ts')) expect(code(f), f).not.toMatch(/\.suspend\(/);
  });
  it('ループの再生（S3）: 音量 5 本を作るのは constructor だけ・音源を作るのは begin の 1 か所・buffer 全体を繰り返す（start は 0 だけ）・context は止めない。エンジンはループの束を master へつなぐ', () => {
    const s = code('src/systems/sfx-loop-player.ts');
    expect(s.match(/\.createBufferSource\(/g)!.length).toBe(1);
    expect(s.match(/\.createGain\(/g)!.length).toBe(1);
    const ctorEnd = s.indexOf('get liveSources()');
    const begin = s.indexOf('private begin(): void');
    expect(ctorEnd).toBeGreaterThan(0);
    expect(begin).toBeGreaterThan(ctorEnd);
    expect(s.indexOf('.createGain(')).toBeLessThan(ctorEnd);
    expect(s.indexOf('.createBufferSource(')).toBeGreaterThan(begin);
    expect(s).toContain('      src.loop = true;\n');
    expect(s.match(/\.start\(([^)]*)\)/g)).toEqual(['.start(0)']);
    expect(s).not.toMatch(/loopStart|loopEnd|\.suspend\(|\.resume\(|onended|addEventListener|setTimeout|setInterval|\.then\(|\.value\b(?!\s*=)/); // 値は読み返さない（L6）
    expect(s.match(/setTargetAtTime\(/g)!.length).toBe(4); // 音量・rate・一時停止の束・止める時の絞り
    const e = code('src/systems/sfx-engine.ts');
    expect(e).toContain('    this.loopBus.connect(this.master);\n');
    expect(e).toContain('    this.loops = new SfxLoopPlayer(ctx, this.loopBus, this.buffers);\n');
    expect(e).not.toContain('this.loopBus.connect(limiter)');
    // 任務の音は Phaser を import せず、ループの口 3 つと合図の口 sfxCue だけを呼ぶ（S4: 合図の観測器 core/sfx-cues）
    const m = code('src/systems/sfx-mission.ts');
    expect(imports(m).sort()).toEqual(['../config/sfx-config', '../config/sfx-music-config', '../core/boat-telemetry', '../core/sfx-cues', '../core/sfx-loops', '../core/sfx-music-mood', '../core/units', './sfx-bus']);
    // v0.7.2 S1: 作る時に任務の曲の場面・PAUSE・RESUME で曲の束・SHUTDOWN で「今も任務なら」外す
    expect(m).toContain('    sfxMusic(MUSIC_CTX_MISSION);\n');
    expect(m).toContain('    sfxLoopsStop();\n    sfxMusicRelease(MUSIC_CTX_MISSION);\n');
    expect(m).toContain('    stepSfxCues(this.cueState, t, dtS, this);\n    stepSfxLoops(this.loopState, t, dtS, this.loopTargets);\n');
    // v0.7.2 S2: 同じ update の最後に任務の曲の段（観測器の戻りをそのまま口へ）
    expect(m).toContain('    sfxLoops(this.loopTargets, dtS);\n    sfxMusicMood(stepSfxMood(this.moodState, t, dtS));\n  }\n');
    expect(m.match(/sfxMusicMood\(/g)!.length).toBe(1);
  });
  it.each(SFX)('%s: 乱数は音だけの SeededRng（種は SFX_SEED_*）で、Math.random もゲームの乱数の系列も使わない', (f) => {
    const s = code(f);
    expect(s).not.toMatch(/Math\.random/);
    expect(s).not.toMatch(/\b(gunRng|lookoutRng|nightRng|aiRng|rngFor|seedFor)\b/);
    expect(s).not.toMatch(/\b(setup|sortie|mission|world|w)\.seed\b/);
    for (const m of s.matchAll(/new SeededRng\(([^)]*)\)/g)) expect(m[1]!.trim(), f).toMatch(/^SFX_SEED_[A-Z_0-9]+$/);
  });
  it.each(SFX)('%s: 毎フレーム・1 発ごとの口の本体で new・.map(・.filter(・オブジェクトのリテラルを作らない', (f) => {
    for (const b of hotBodies(code(f))) {
      expect(b, f).not.toMatch(/\bnew\s/);
      expect(b, f).not.toMatch(/\.(map|filter|slice|concat)\(/);
      expect(b, f).not.toMatch(/\{\s*\w+\s*:/);
      expect(b, f).not.toMatch(/=>/);
    }
  });
  it.each(SFX)('%s: 論理の状態へ代入しない', (f) => {
    const s = code(f);
    expect(s).not.toMatch(/\.state\.\w+\s*[-+*/]?=(?!=)/);
    expect(s).not.toMatch(/\.(speedMps|headingDeg|hp|phase|fireLeftS|sinking|sighted)\s*[-+*/]?=(?!=)/);
    expect(s).not.toMatch(/\b(state|boat|ship|hull|barge|leader)\.(x|y)\s*[-+*/]?=(?!=)/);
  });
  it.each(PURE)('%s: 再生の API・DOM・Phaser に触らず、import は sfx-* どうしと core/rng だけ（core の sfx は同じ core の中のファイルも）', (f) => {
    const s = code(f);
    expect(s).not.toMatch(/\b(AudioContext|webkitAudioContext|AudioBuffer|window|document|navigator|localStorage|Phaser|globalThis)\b/);
    const inCore = f.startsWith('src/core/');
    for (const p of imports(s)) {
      if (inCore && /^\.\/[\w-]+$/.test(p)) continue; // 同じ core の中（テレメトリの型・段の定数）
      expect(p, f).toMatch(/^\.\.?\/(?:(?:config|assets|core)\/)?(?:sfx-[\w-]+|rng)$/);
    }
  });
  it('core/sfx-loops（S3 の観測器）が import する core のファイルは、テレメトリの型と段の定数だけ（世界・模擬・乱数を引かない）', () => {
    expect(imports(code('src/core/sfx-loops.ts')).sort()).toEqual([
      '../config/sfx-config', './air-strike-state', './boat-telemetry', './engine-trouble', './evac-telemetry', './friendly', './patrol-air-state', './seaplane', './storm',
    ]);
  });
  it('core/sfx-music-mood（v0.7.2 S2 の段の観測器）が import する core のファイルは、テレメトリの型と段の定数だけ。敵の位置・距離・見えているか・見つかる距離の欄を読まない（D5）。口を呼ばない', () => {
    const s = code('src/core/sfx-music-mood.ts');
    expect(imports(s).sort()).toEqual([
      '../config/sfx-music-config', './air-strike-state', './boat-telemetry', './evac-telemetry', './friendly', './landing', './patrol-air-state', './seaplane',
    ]);
    for (const f of ['enemyDx', 'enemyDy', 'enemySighted', 'planeDistM', 'distM', 'detectRangeM', 'sighted', 'dx', 'dy', 'inboundDistM', 'reportDx', 'reportDy', 'reportSighted', 'shipDx', 'shipDy', 'shipDistM']) {
      expect(s, f).not.toMatch(new RegExp(`\\.${f}\\b`));
    }
    expect(s).not.toMatch(/sfxMusic|sfxCue|playFlat|registerSfx/);
    expect(readFileSync('src/core/sfx-music-mood.ts', 'utf8').split('\n').length).toBeLessThanOrEqual(201); // brief L19: 200 行以下
  });
  it('core/sfx-cues（S4 の合図の観測器）が import する core のファイルは、テレメトリの型と段の定数だけ。鳴らすのは渡された口の cue だけ（エンジン・口を import しない）', () => {
    const s = code('src/core/sfx-cues.ts');
    expect(imports(s).sort()).toEqual(['../config/sfx-config', './air-strike-state', './boat-telemetry', './engine-trouble', './friendly', './landing', './shallows']);
    expect(s).not.toMatch(/sfxCue|sfxUi|playFlat/);
  });
  it('遅らせる単発（S4）は再生の時計の予約だけ（タイマー・閉包なし）。sfxCue は遅らせをエンジンへ渡す', () => {
    const e = code('src/systems/sfx-engine.ts');
    expect(e).toContain('    src.start(delayS > 0 ? ctx.currentTime + delayS : 0);\n');
    expect(code('src/systems/sfx-bus.ts')).toContain('  if (engine !== null) engine.playFlat(key, rate, gain, delayS);\n');
    for (const f of SFX) expect(code(f), f).not.toMatch(/setTimeout|setInterval|delayedCall|requestAnimationFrame/);
  });
  it.each(SFX)('%s: 300 行以下', (f) => {
    expect(readFileSync(f, 'utf8').split('\n').length).toBeLessThanOrEqual(301);
  });
});

describe('音へ届く道は許可表の口だけ（import の許可表。R14）', () => {
  it('sfx-* を import しているゲーム側のファイルは許可表の中', () => {
    for (const f of sfxImporters()) expect(ALLOWED_IMPORTERS, f).toContain(f);
  });
  it('許可表のファイルは今もある（名前が変わったら表を直す）・論理のファイル（core・entities）は入っていない', () => {
    for (const f of ALLOWED_IMPORTERS) {
      expect(SRC, f).toContain(f);
      expect(f).not.toMatch(/^src\/(core|entities)\//);
    }
    for (const f of ['src/scenes/mission-scene.ts', 'src/systems/mission-world.ts', 'src/systems/world-visuals.ts', 'src/systems/mission-effects.ts']) expect(ALLOWED_IMPORTERS).not.toContain(f);
  });
  it('今の段で import しているゲーム側のファイルは表のとおり（S4: 10 本＝許可表の全部。IP2 で試聴の場を足して 11 本・v0.7.2 S1 で曲の試聴の場を足して 12 本。大発の 13mm の発砲＝barge-hunt は入れない）', () => {
    expect(sfxImporters()).toEqual([...GAME_IMPORTERS_NOW].sort());
    expect(GAME_IMPORTERS_NOW).not.toContain('src/systems/barge-hunt.ts');
    expect(readFileSync('src/systems/barge-hunt.ts', 'utf8')).toContain('    onFire: () => {},\n');
  });
  it('hook の行の pin（S4: 10 本に 15 行。絵の層の口は 5 行。IP2: 試聴の場の 2 行で 11 本に 17 行。v0.7.2 S1: 曲の 7 行で 12 本に 24 行）と、触った既存のファイルは 300 行以下', () => {
    for (const p of HOOK_PINS) expect(readFileSync(p.file, 'utf8'), p.file).toContain(p.line);
    expect(HOOK_PINS.length).toBe(24);
    expect([...GAME_IMPORTERS_NOW].sort()).toEqual([...ALLOWED_IMPORTERS].sort());
    // 絵の層の口から呼ぶ位置つきの音は 6 か所だけ（水柱・大砲・機銃・爆発・2 次の爆発・沈み始め）。S1 の代わりの音は残っていない
    const calls = ['src/systems/fx-bus.ts', 'src/systems/explosion-fx.ts', 'src/systems/sink-fx.ts'].map((f) => (code(f).match(/\bsfx(?:Gun)?At\(/g) ?? []).length);
    expect(calls).toEqual([3, 2, 1]);
    expect(SRC.filter((f) => /SFX_S1_SMALL_BLAST/.test(readFileSync(f, 'utf8')))).toEqual([]);
    expect([...new Set(HOOK_PINS.map((p) => p.file))].sort()).toEqual([...GAME_IMPORTERS_NOW].sort());
    for (const f of TOUCHED) expect(readFileSync(f, 'utf8').split('\n').length, f).toBeLessThanOrEqual(301);
  });
  it('検査の取り出しが効く（import・口の本体・種・DOM の名前を見つける）', () => {
    expect(imports("import { sfxAt } from './sfx-bus';\nimport type { A } from '../core/rng';\nconst m = await import('../systems/sfx-boot');")).toEqual(['./sfx-bus', '../core/rng', '../systems/sfx-boot']);
    const bad = 'class A { playAt(key: SfxKey, x: number): number { const p = new Foo(); return this.list.map((v) => v).length; } sfxCue(k: string): void { send({ key: k }); } }';
    expect(hotBodies(bad)).toHaveLength(2);
    expect(hotBodies(bad)[0]).toMatch(/\bnew\s/);
    expect(hotBodies(bad)[0]).toMatch(/\.(map|filter|slice|concat)\(/);
    expect(hotBodies(bad)[1]).toMatch(/\{\s*\w+\s*:/);
    expect('new SeededRng(SFX_SEED_MG)'.match(/new SeededRng\(([^)]*)\)/)![1]).toMatch(/^SFX_SEED_[A-Z_0-9]+$/);
    expect('new SeededRng(w.seed + 1)'.match(/new SeededRng\(([^)]*)\)/)![1]).not.toMatch(/^SFX_SEED_[A-Z_0-9]+$/);
    expect(strip('// window は使わない\nconst a = 1; /* document */')).not.toMatch(/\b(window|document)\b/);
    expect(strip("// data/*.json を読む\nimport { createSfx } from '../systems/sfx-boot';\n/* 塊 */ const b = 2;")).toBe("\nimport { createSfx } from '../systems/sfx-boot';\n const b = 2;");
    expect('const c = new AudioContext();').toMatch(/\b(AudioContext|window|document)\b/);
    expect('./sfx-dsp').toMatch(/^\.\.?\/(?:(?:config|assets|core)\/)?(?:sfx-[\w-]+|rng)$/);
    expect('../systems/sfx-bus').not.toMatch(/^\.\.?\/(?:(?:config|assets|core)\/)?(?:sfx-[\w-]+|rng)$/);
    expect('phaser').not.toMatch(/^\.\.?\/(?:(?:config|assets|core)\/)?(?:sfx-[\w-]+|rng)$/);
  });
});
