# v0.8.3 brief (lead → implementer)「静音ボタンと倍速ボタン」

Branch `claude/v0.8.3-controls` (from main b7e9f44 = v0.8.2 merged). Do NOT commit or push the work branch — the lead reviews, runs the gates, commits and pushes. Do not run `vitest -u`. Machine: 4 CPUs, parallel jobs ≤ 2. Back up regularly to `scratchpad/notes70` (branch `claude/v0.7.0-notes`) under `wip/v0830/` (copy `scratchpad/v0820/tools/backup-s2c.sh` → `scratchpad/v0830/tools/backup.sh` with the new dir; push with 4/8/16/32 s backoff). `npm test` is `vitest run --testTimeout=90000` — always run tests through `npm test` (plain `npx vitest run` times out the heavy sim tests).

## The user's words (2026-11-23, verbatim)
①「左の速度スティックの操作で、静音の速度上限までしかどれだけスティック倒しても速度が出ない「静音」ボタンを作ってください。ボタン表示は「静音」で小さいボタンで構いません。静音の速度内で制御するのが難しいためです。」
②「倍速ボタンの新設。時間の流れを2倍にできるボタンを作ってください。FPSなどのカクツキは一切考慮不要です。」

## Goal / Done
Goal: two small toggle buttons usable in every mission: 「静音」 caps the boat at its silent max speed with finer stick control, 「倍速」 runs the game world at 2× time.
Done: both work in all 12 missions (incl. jp_03 squad command and evac); with both off every mission's replays, sims and world are bit-identical to main b7e9f44 (gates); HUD layout test passes at 1280–1584 px; screenshots checked; docs/CHANGELOG/CLAUDE.md updated.

## Facts already found (verify, file:line from a survey)
- Stick → `speed01`: `core/input-state.ts` `stickToCommand` (L60–66); `systems/virtual-stick.ts:80`. `core/boat-motion.ts:128` target = speed01 × speedMaxMps; `silentMaxMps` at :81.
- An existing cap: `core/engine-trouble.ts` `engineCap01` (silent/max) and `engineInput` (pre-allocated `capInput`, min). Applied in `systems/world-boat.ts:43` (`w.fuel.empty ? DRIFT : w.engine ? w.engine.input(w) : w.evac ? w.evac.command(w.input) : w.input`).
- Boot draws a silent-ratio ring on the stick base (`scenes/boot-scene.ts:114–116`).
- Pause button: `systems/pause-control.ts:28` `HoldButton`, constants `config/ui-config.ts:219–222` (scale 0.75, left column, y 270 between fuel gauge bottom 162 and stick top 436). **Pause calls `resetInput` (pause-control.ts:39/48)** — a toggle stored in InputState must survive pause/resume.
- Right column (煙幕・消火・見張り・識別) is full: `config/hud-layout-config.ts:44–45`. `tests/hud-layout.test.ts` checks overlap, 12 px gaps, min hit size, widths 1280–1584.
- Loop: `config/step-config.ts` FIXED_STEP_S 1/60, MAX_STEPS_PER_FRAME 4; `core/fixed-stepper.ts:21` clamps; `systems/mission-world.ts:127` stepper, `updateFrame` L241–247: `consumeFrameInput(realDt)` → `stepper.advance(realDt, stepFn)` → `slowMoLeftS -= realDt` → visuals. `stepFn` L131–136 (slow-mo factor 0.3 for 1.2 s; `stepTimeS += realDt` drives the dawn clock in mission-scene:210).
- Per-frame realDt users outside the step: mission-scene `elapsedS` (:209) and `refreshReturnState(realDt)`, world-input extinguish hold (:47), `stepLauncher(w, realDt)` (:48).
- Phaser tweens (sinking), HUD `scene.time.now` line clocks, hold buttons stay real time. Audio slow-mo in `systems/sfx-slowmo.ts` keyed on `slowMoLeftS > 0`.
- Headless tools set `w.input` directly each frame (`scripts/headless/lib.mjs:71`, `ab-replay.mjs:113`); no input recording.

## Lead decisions
- **D1 静音 = scale, not clamp.** While on, the full stick deflection maps to the boat's silent max (`speed01 × silentMax/speedMax`), so the whole stick travel controls 0…silent (the user's reason is fine control). Apply it in the same chain as the engine cap (combine with engine/evac/fuel paths: engine limp already caps at silent, so min() is fine; jp_03 evac: scale the command the evac squad reads). No allocation per frame (pre-allocated input copy like `engineInput`). The flag lives where pause's `resetInput` does not clear it. It stays on until pressed again; it resets at each mission start (default off). When on, the stick base's silent ring is the outer limit — optionally show the ring brighter; no new texture key unless unavoidable (say why).
- **D2 倍速 = more fixed steps, same dt.** While on, feed the stepper 2 × realDt and let it run up to 2 × MAX_STEPS_PER_FRAME steps (so 2× stays 2× at 30 fps; the user accepts stutter). Every per-frame realDt use that is game time (elapsedS, return wait, extinguish hold, launcher, `slowMoLeftS` countdown, anything else you find) gets the same scaled dt. Phaser tweens, HUD line clocks, music and sfx stay real time. **Hit slow-mo wins:** while `slowMoLeftS > 0` the 2× factor is 1 (the hit moment keeps today's look and length). Pause stops everything as today. Resets at each mission start (default off). Physics and rng draws per step are unchanged ⇒ a night at 2× must produce the same world as at 1× step for step — add a test that steps the same mission N steps at 1× and 2× frame pacing and compares the world state (or the telemetry) bit for bit.
- **D3 Buttons.** Two small round buttons (pause's 0.75 scale or smaller, same `roundButton` texture, tint/alpha for on/off like other toggles), labels 「静音」 and 「倍速」 (on: 「倍速」 lit; you may show 「2×」 in the label when on if it fits). Place them on the left near 一時停止 without touching the stick zone, the fuel gauge, the HP bar or the build label; satisfy `tests/hud-layout` at 1280–1584. Every mission shows both (jp_03 too). setText/tint only on change (§7). Constants in `config/ui-config.ts` (or a new small config), no magic numbers.
- **D4 Determinism and gates.** With both off nothing changes: g2, ab-*, us04/us05/us06 sets, tex-ab, snapshots must be identical to main b7e9f44. hud-* will gain the new button objects — make the HUD dump comparison show only those additions (or report exactly which entries differ). Build the base site of main b7e9f44 once: `git worktree add scratchpad/v0830/wt-b7e9f44 b7e9f44` and `VITE_BASE=/ww2-torpedo-boat/ VITE_BUILD_REF=main VITE_BUILD_SHA=b7e9f44 npx vite build --outDir scratchpad/v0830/base-b7e9f44`; copy `scratchpad/v0820/tools/run-gates.sh` to `scratchpad/v0830/tools/run-gates.sh` with the base and the tree's build label set to main@b7e9f44 and the default A05 = that base. Headless tools may get a query flag (e.g. `?debug&fast2`) to exercise 2× for a check; not required in the game.
- **D5 Docs.** `package.json` 0.8.3; CHANGELOG v0.8.3 (目的・変更点・既知の制約, the user's words, D1–D4, files with line counts, tests, gates line placeholder `    - 門: （lead が別に回した run-gates の結果をここに足す）`); docs/02 (controls section: the two buttons); docs/03: insert this version as v0.8.3 「操作の改修：静音ボタン・倍速」 with the iPhone 3 checks, renumber the old v0.8.3 us_07 row to v0.8.5, and add v0.8.4 「史実モード：至近の煙幕へ乱射」 (the user's ④, to be planned) — keep the language request out (the lead asks the user where it goes). CLAUDE.md: one line in §2 兵装-style table only if a rule changes (a new row 「操作」 with the two buttons and D1/D2 as user requests + design defaults), §4 new files, change history line.

## Must not change
Frozen files (`tests/frozen-files`), any data/*.json number, every mission's world/replay with the buttons off, every texture, sound/music behaviour (except nothing — they stay real time). ≤ 300 lines per file (mission-scene is at 300 — do not grow it; move code out if you must touch it). No Math.random; no model identifiers anywhere.

## Gates
`JOBS=2 bash scratchpad/v0830/tools/run-gates.sh v0830-impl` once your tree is final.

## Hand-back (Japanese)
- Files and line counts; how D1/D2 are wired (the realDt list you scaled); the 1× vs 2× determinism test.
- Button positions at 1280 and 1560; screenshots (W 1280 and 1560, dpr 2) in `scratchpad/v0830/shots/`: both off, both on, 2× during a hit slow-mo, jp_03.
- Tests added/changed; gates SUMMARY.
