# v0.7.2 S3 brief (lead → implementer)

Stage: **S3 命中スローの音** of v0.7.2. Branch `claude/v0.7.2-bgm`. S0–S2 are committed and pushed by the lead before you start (check `git log`). You work on top and do NOT commit; the lead runs the full gates, commits and pushes.

Background: the hit slow-mo has existed since v0.1 (`data/hit_rate_model.json` `feel.hit_slowmo_factor` 0.3, `hit_slowmo_seconds` 1.2; `MissionWorld.slowMoLeftS`, set on a non-dud torpedo hit / kill (not jp_03) / own boat starting to sink, counted down with real dt). The user decided in v0.7.0 (U11) to keep the slow-mo as it is. v0.7.2 adds only a sound treatment during it; the slow-mo logic and data stay untouched. v0.7.1 D6 deferred "pitch during slow-mo" to v0.7.2 — this stage decides it with lab variants (spec §11 O2, design default A until the user picks).

## Read first
1. `scratchpad/v0720/plan/spec-v0720.md` §6 (all), §7 rows 2–3, §8, §9 (S3), §10, §12 (items 5, 8, 10), §13. This brief's "Lead decisions" win.
2. CHANGELOG v0.7.2 (S0, S1, S2 blocks and their 既知の制約).
3. Code: `src/systems/sfx-engine.ts`, `sfx-audio-types.ts`, `sfx-bus.ts` (`sfxLoops`, `registerSfxListener` pattern), `sfx-loop-player.ts`, `sfx-music-player.ts`, `sfx-music-slots.ts`, `sfx-mission.ts`, `src/core/sfx-loops.ts`, `src/systems/world-art.ts` (constructor/destroy register the listener), `src/systems/mission-world.ts` (read only: `slowMoLeftS`), `src/scenes/music-lab-scene.ts`, `src/systems/sfx-lab-demo.ts`, `src/config/music-lab-config.ts`, `src/config/sfx-music-config.ts` (`SFX_SLOW`, `SFX_SLOW_DEFAULT_ID`, `SFX_SLOW_SHAPE`), tests `tests/sfx-engine*.test.ts`, `tests/sfx-engine-kit.ts`, `tests/sfx-music-kit.ts`, `tests/sfx-rules*.test.ts`, `tests/music-lab.test.ts`, scripts `scripts/headless/{sfx-probe,sfx-music-live,sfx-offline}.mjs`, `scripts/sfx-music-stem.ts`.

## What S2 left for S3 (from the S2 hand-back)
- Slots: one `playbackRate` write that applies the same value and time to all three family layers (sync); a group started during the slow-mo must start at the slow rate.
- Graph: a low-pass for the "bed": loopBus + music duck → filter → master (one-shots bypass it). Add `createBiquadFilter` / a filter node type to the structural `SfxCtx` and to the test fake contexts (`tests/sfx-engine-kit`, `tests/sfx-music-kit`), and update the node-count pins.
- Reset: filter and rates go back on Hud SHUTDOWN (`sfxLoopsStop`) and whenever the player is asked for MENU or LAB, so Result/Title music never stays muffled even if the mission ends mid-slow-mo.
- Lab: row 2's 4th button 「命中＋スロー」 (`MUSIC_LAB_ROW2_COLS` 4 → 5, `MUSIC_LAB_DEMOS`, `DEMO_*`, tests/music-lab pins) and row 3 「命中スロー: A 低く遅く／B 低くだけ／C なし」. The scene has ~14 lines left under 250 — move layout/state helpers out if needed.
- The mood observer ignores slow-mo (keep it that way). Own-boat sinking sets SINK in the same frame the slow-mo starts; the bed treatment must not fight the 2.5 s sink fade (both may apply; music ends silent either way).
- Tools: if you add slow-mo windows to the offline mix, `scripts/sfx-music-stem.ts` needs a rate model.

## Lead decisions for S3
- **L28 reading the slow-mo.** `world-art` (already in the import allowlist) registers a read-only view `{ readonly slowMoLeftS: number }` of the world on create (`registerSfxSlowMo(w)`) and null on destroy, exactly like the listener. Read it once per frame inside `sfxLoops` (Hud update path) and pass a boolean to the engine; the engine writes only on rising and falling edges. Do not touch mission-world, the telemetry writer, data, or any frozen file.
- **L29 variants.** `SFX_SLOW` A/B/C as configured (A default: bed low-pass 20 kHz → 1,100 Hz with time constant 0.04 s; loop rate × 0.8 and music rate × 0.85 with time constant 0.06 s; release time constant 0.25 s. B: filter only. C: nothing). One-shots (blasts, torpedo hit) stay untouched in every variant. Loop rates go through a pure `applySfxSlowRate(targets, factor)` before the loop player so the existing "write only on change" logic still holds; check the engine's minimum rate (0.75 × 0.8 = 0.6 ≥ 0.5).
- **L30 always-on filter.** The bed filter sits in the graph permanently at `SFX_SLOW_SHAPE.idleHz` (20 kHz ≈ transparent at 22,050 Hz samples, ≤ 0.3 dB). Prove "transparent" with the existing offline mix numbers (exit peak, level per window within ±0.3 dB of S2) and with A/B identity of gameplay/HUD.
- **L31 lab choice.** The lab row 3 marks the default 「（今）」 from `SFX_SLOW_DEFAULT_ID`; when the user picks, the lead changes that one constant. The lab plays the treatment on the current bed (if nothing is playing, start 「静か＋エンジンと海」) plus `torp_hit` and a 1.2 s slow window, same code path as the game.
- **L32 budget.** JS bundle gzip has ~5.0 kB left for S3–S4 (+20 kB version gate vs main 35e9e77). Keep S3 ≤ +2 kB if you can and report the delta.

## Must not change
Gameplay and HUD (A/B identical in three audio states), slow-mo logic and data, hud-scene, briefing-scene, mission-scene (300 lines), mission-world, world-visuals, mission-effects, frozen files, existing core logic, `data/*.json`, `TEXTURE_KEYS`, the 26 SFX samples/levels/cooldowns, the S2 mood table and duck table (unless a test proves a conflict — then explain). CLAUDE.md §7 rules (no per-frame allocation/closures, writes only on change ≤ 10 Hz, cancel before automation, no read-back, no Math.random, no suspend for mute, one context, ≤ 300 lines per file). No model identifiers in files.

## Tests and tools (spec §6.4, §8)
- Fake context: rising edge writes filter 1 + music rate (one write covering the 3 layers, or 3 writes at the same time — state which) + loop rates via the loop player's change detection; nothing while the slow-mo continues; falling edge restores; variants B and C; pause / mute / 曲オフ during slow-mo; Hud SHUTDOWN during slow-mo; MENU/LAB request resets; a group started during slow-mo starts slow. `applySfxSlowRate` allocates nothing.
- tests/sfx-rules*: world-art hook pins (+2), `registerSfxSlowMo` reads only `slowMoLeftS`, no new importers outside the allowlist.
- Headless (AUDIO=1): set `world.slowMoLeftS = 1.2` via `?debug` and measure on a master AnalyserNode: energy above 2 kHz drops ≥ 12 dB within 0.2 s and recovers after 1.5 s (variant A); variant C shows no drop. Probe: count slow-mo windows per case. sfx-music-live: Result/Title music not muffled after a mission that ended during slow-mo.
- Re-run S2's offline mix to show the always-on filter changes nothing (±0.3 dB).

## Deliverables (working tree uncommitted)
- CHANGELOG v0.7.2: an `S3` block ending with `    - 門: （lead が別に回した run-gates の結果をここに足す）`, plus 既知の制約（S3）. docs/03 v0.7.2 row: mark S3 and add the S3 iPhone items: ① 魚雷の命中・撃沈の瞬間に周りの音が低く遅くなり 1 秒ほどで戻るか（`?sfxlab` で A〜C を比べて選ぶ） ② スローが操作の邪魔にならないか ③ 自艇が沈む時に不自然でないか.
- WIP backups to `scratchpad/notes70` under `wip/v0720-S3/` (branch `claude/v0.7.0-notes`, push with 503 backoff 4/8/16/32 s).
- Hand-back report: files and line counts, graph diagram as built, deviations, all numbers (unit gates, reduced run-gates in three audio states, analyser drop/recovery per variant, offline mix ±0.3 dB check, live checks, bundle delta), open risks, what S4 needs (docs: CLAUDE.md §2 アート and §4 tree and change history, docs/02 §4 and §7.1 BGM section, docs/03; final gates).
