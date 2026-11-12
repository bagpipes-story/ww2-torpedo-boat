# iOS Web Audio research (2026-11-12) — condensed for stage agents

Verified by reading: WebKit main source, Capacitor main, MDN/BCD, W3C Audio Session spec, Apple HIG, Phaser 3.90 source (node_modules), headless Chrome tests.
NOT verified (snippets only): bugs.webkit.org items. Device-only checks listed at the end.

## R1 Unlock
- Context created outside a gesture starts `suspended`; `resume()` without a gesture stays pending (no reject).
- Activation events: `touchend`, `pointerup` (non-mouse), `click`, `keydown`, `mousedown`. **`touchstart` / touch `pointerdown` do NOT count.**
- Call `ctx.resume()` synchronously in the handler. No silent buffer needed. Unlock is permanent for that context; a new context needs a new gesture.
- Phaser `pointerdown` = touchstart (won't unlock). Phaser `pointerup` runs inside DOM `touchend` (will unlock).
- Standalone PWA: same in principle; one iOS 26.0.1 forum report of `resume()` rejecting with `InvalidStateError: Failed to start the audio device` (unverified) → always catch rejections.
- Capacitor WKWebView: no gesture requirement (mediaTypesRequiringUserActionForPlayback = []); keep the gesture path anyway.

## R2 Silent switch / Audio Session API
- Web Audio only → iOS category Ambient: **muted by the silent switch**, mixes with the user's music.
- `navigator.audioSession.type`: `ambient` (muted by switch, mixes) / `playback` (ignores switch, stops user's music, keeps running in background, Now Playing eligible). Reliable iOS 17+ (BCD says 16.4). Not in Chrome/Firefox → feature-detect.
- Apple HIG: silent mode should silence sound effects & game soundtracks. → Default: respect the switch; set `ambient` explicitly. A page cannot read the switch → show a hint 「音が出ない時は本体の消音を確かめる」.
- Silent `<audio>` loop hack flips page to Playback (stops music, lock-screen controls) → do not use.

## R3 Interruptions
- State `interrupted` on background/lock/call/Siri. If the page called `suspend()` itself, WebKit won't auto-resume.
- Known bug families (unverified status): dead after focus loss (17.5.1), `running` but currentTime frozen, stuck `interrupted`, iOS 26 "Failed to start the audio device".
- Recipe: on visibilitychange→visible / pageshow / focus: wait ~100 ms then suspend()+resume() (Phaser 3.88+ already does this on VISIBLE). Permanent `touchend`/`pointerup` listener calling `resume().catch(()=>{})` when state !== 'running'. Watchdog: state running but currentTime not advancing ~0.5 s → suspend/resume; if still frozen → recreate context inside next touchend, rebuild graph (keep Float32Arrays), `game.sound.setAudioContext(newCtx)`.

## R4 Phaser 3.90 WebAudioSoundManager (source read)
- Always creates `new AudioContext()` at boot even with zero audio files. `locked = state==='suspended'`; `unlock()` auto-registers body listeners (touchstart/touchend/mousedown/mouseup/keydown) calling `context.resume()`; emits UNLOCKED on next update.
- pauseOnBlur (default true): blur → `context.suspend()`, focus → resume; every update() while focused resumes if suspended/interrupted. On VISIBLE: setTimeout(100) → suspend()+resume(). Never recreates a dead context; never catches resume() rejections.
- Consequences: can't hold our own `ctx.suspend()` (Phaser resumes next frame) → **mute with a gain node**. Reuse `(game.sound as WebAudioSoundManager).context` guarded by `'context' in game.sound`; never two contexts.

## R5 Performance / limits
- sampleRate = hardware rate at creation (48000 typical, 44100 on some routes); never hardcode → synthesize at `ctx.sampleRate`. Don't request a rate.
- `latencyHint` has no effect in WebKit. AudioWorklet: avoid. OfflineAudioContext: not needed → fill Float32Array in JS + `ctx.createBuffer` + `copyToChannel`.
- One-shot AudioBufferSourceNode is the intended pattern (buffers shared). Own cap ~16–24 voices, rate-limit machine-gun retriggers, one master chain; one DynamicsCompressor on master is fine.

## R6 Loops
- Loop whole buffer (`loop=true`); make content periodic (whole cycles or crossfade tail→head). Avoid `start(when, offset, duration)` on loops.
- WebKit resamples linearly → keep playbackRate ~0.5–2×. `setTargetAtTime` on gain/playbackRate OK; a few calls per change, not per frame (event list growth). Don't read `param.value` back.

## R7 Headless Chromium
- Needs `--autoplay-policy=no-user-gesture-required` → state running, currentTime advances without an audio device. `navigator.audioSession` undefined in Chrome. Chromium can't emulate iOS gesture/silent-switch rules.

## Device-only checks (go into iPhone test items)
- Sound starts after first tap in Safari AND home-screen app; survives lock/unlock & app switch; silent switch mutes it (expected); sample rate/AirPods; iOS 26 standalone resume.
