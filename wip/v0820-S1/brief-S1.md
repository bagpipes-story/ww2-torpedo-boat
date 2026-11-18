# v0.8.2 S1 brief (lead → implementer)「純粋な規則」（ゲームの誰も import しない）

Branch `claude/v0.8.2-us05`, HEAD = the S0 commit 8a9e698 (pushed; draft PR #41). Spec: `scratchpad/v0820/plan/spec-v0820.md` — do stage **S1** as its §8 S1 row says, with §4.2 D-C7 (screen), §4.4 D-G1〜D-G5 (magazine), §4.5 D-N1〜D-N7 (report/radio/relay), §9 warnings 2・4・6, §14 defaults. Where this brief differs, this brief wins. Do NOT commit or push the work branch — the lead reviews, runs the gates, commits, pushes.
Machine: 4 CPUs, parallel jobs ≤ 2. Back up regularly to `scratchpad/notes70` (branch `claude/v0.7.0-notes`) under `wip/v0820-S1/` (copy `scratchpad/v0820/tools/backup-s0.sh` → backup-s1.sh with the new dir; push with 4/8/16/32 s backoff).

## Lead decisions
- **L10 the bundle does not change.** Nobody in the game imports the new code in S1. Prove it: the sha256 of every `dist/assets/*.js` built from the S0 commit (a worktree at 8a9e698) and from your tree, both with `VITE_BASE=/ww2-torpedo-boat/ VITE_BUILD_REF=main VITE_BUILD_SHA=0176202`, are equal. Tests and scripts may import the new files.
- **L11 `core/scoring` moves to S2.** The spec's S1 row adds `shipKills` (+4) to `core/scoring`, but the game imports that file, so L10 would fail. Leave `core/scoring` and the `scoring-recon` test for S2 (the lead will put them in the S2 brief). Write this move in the CHANGELOG S1 block.
- **L12 `core/column-screen.ts`** (≤ 80 lines; D-C7).
  - State: fixed-length typed arrays made once by `createScreenState(n)` (n ≤ `TRANSIT_MAX_SHIPS`) and reset per night. No allocation in the step.
  - Plan: the screen mask (bit i = column index i has role `screen`; build it from S0's `ColumnPlan`/kits in a small pure helper) and `rejoinS`.
  - Step: `stepScreens(st, plan, view, onMapMask, feelDtS, dawn)` returns this step's bits through fields on the state (`left`, `rejoined`), the `ship-transit` way. The per-ship view should be the smallest readonly shape the world can pass without adapters. Read `entities/destroyer` and `core/ship-ai` and use their names (`ai.playerDetected`, `sinking`).
  - Rules:
    - A screen ship on the map that detects the boat leaves the column at that step.
    - While it is away, being detected again resets the lost clock.
    - It rejoins when the feel clock has run `rejoinS` since it lost the boat.
    - It can leave again on a new detection. Count the leaves per ship.
    - A sinking ship never leaves or rejoins.
    - After dawn nobody leaves. A ship still away at dawn is reported as rejoined at the dawn step, so S2 hands everyone to the group's `withdraw`. Say in the hand-back if you think this is wrong.
    - Ships not on the map are ignored.
  - Export the per-ship read accessors S2's telemetry needs: away or not, leave count, last left and rejoined seconds.
- **L13 `core/recon-report.ts`** (≤ 140 lines; D-N1〜D-N6).
  - Stages: NONE → SEEN → TRACKED/SENT or PENDING → RELAYED, as small exported integer constants. The spec's TRACKED is the counting phase after SEEN; name the phases so the HUD can tell 「追尾 N 秒」 from 「送った」.
  - Plan: S0's `ReconSetup`.
  - Per step, `stepRecon(st, plan, view, dtS)`. dtS is the **fixed-step real seconds** (slow motion does not stretch the 20 s). The view is plain numbers and booleans that S2 computes:
    - how many identify-class ships are within sight this step;
    - the column contacts in the last radar sweep (S2 passes the visible count on a `noradar` night: core just reads a number);
    - whether the boat is inside the relay ring.
  - Radio: an event function, e.g. `reconOnShellHit(st, plan, damage, rng)`.
    - It draws exactly once when `damage >= radioMinDamage`, the report is not yet sent and the radio is not yet broken. Otherwise it draws nothing.
    - It latches the radio as broken.
    - The rng is the project's seeded rng (`core/rng`); its system offset is **seed+34**, exported as a constant (`RECON_RADIO_SEED_OFFSET = 34`).
  - Tracking counts while the radio is broken too. When tracking reaches `trackS`, the report is SENT if the radio is alive, else PENDING. Relay only from PENDING, also after dawn. Entering the ring before tracking is done does nothing.
  - Achievement helper: report delivered (sent or relayed) AND the end counts as a return. If the boat sank, it is not achieved, but "delivered" stays readable for Result.
  - Record the seconds and counts for D-G5-style telemetry: seen at, seen count, tracked seconds, sent at, radio broken at, relayed at, draws.
  - No sqrt or atan2 here.
- **L14 `core/magazine.ts`** (≤ 60 lines; D-G1〜D-G3, D-G5).
  - `magazineChanceAt(rule, hitsTaken)`: 0 when the rule is null or hitsTaken is not in `onHits`.
  - A roll function draws **exactly once iff the rule exists and hitsTaken is in `onHits`**, whatever the chance value. So `?debug&boom` (chance 1) and chance 0 keep the same stream.
  - `MAGAZINE_SEED_OFFSET = 33`.
  - A fixed-length record per ship: detonated at second, which hit, draws, and the sum of the chances drawn (the expected value for S3).
  - Duds and late hits are S2's job (the world does not call). Say so in the file header.
- **L15 tests** (new files, `tests/core-rules-kit` style like v0.8.1's `anchored-ship`):
  - `column-screen`: leave, re-detect resets, 40 s on a slow-motion feel clock, leave again, sinking, dawn, not on map, determinism over two runs, no allocation in the step.
  - `recon-report`: confirm; 20 s on the fixed clock (not stretched by slow motion); radio before and after the report; no draw under min damage, after sent, or after broken; PENDING → RELAYED; relay after dawn; ring before tracking does nothing; sunk = not achieved but delivered; determinism.
  - `magazine`:
    - only the 3rd and 4th hits draw;
    - no rule = no draw;
    - chance 0 or 1 draws the same number of times;
    - **100,000 draws with seed+33 from at least 3 base seeds → 3% and 6% within ±0.2 points**;
    - the 4-hit compound 1 − 0.97 × 0.94 = 8.8% (±0.3 points over 100,000 simulated 4-hit ships).
  - A source scan that `src/` (outside tests) imports none of the three files (the L10 guard, kept until S2 replaces it).
- **L16 docs.**
  - CHANGELOG v0.8.2: an `  - S1（純粋な規則。…）:` block after S0's, in the same style. Files with line counts, one line per rule, the tests, the L11 move, and a last line `    - 門: （lead が別に回した run-gates の結果をここに足す）`.
  - docs/03 v0.8.2 row: mark S0 and S1 done in a short clause.
  - No CLAUDE.md change (§4 lines come in S4).

## Must not change
Everything the game runs (L10): src outside the 3 new core files, data, snapshots, frozen files, sound/music. Also ≤ 300 lines per file, no Math.random, no Phaser in core, no model identifiers anywhere.

## Gates
`JOBS=2 bash scratchpad/v0820/tools/run-gates.sh S1-impl` once your tree is final. Expect everything same and no snapshot change.

## Hand-back (Japanese)
- Files and line counts.
- The three APIs (signatures, field names and where they come from).
- Decisions beyond the brief.
- Tests added and pins changed.
- The L10 sha256 list.
- The gates SUMMARY.
