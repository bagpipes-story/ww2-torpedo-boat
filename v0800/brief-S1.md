# v0.8.0 S1 brief (lead → implementer)

Branch `claude/v0.8.0-us-campaign`, HEAD fb715d6 (S0 committed and pushed, PR #39). Do NOT commit; the lead runs the gates, commits and pushes.

Spec: `scratchpad/v0800/plan/spec-v0800.md` — implement stage **S1（純粋な規則）** exactly as its §6 row says, with §3.2 (D-R1〜D-R12), §3.5 (D5 tests), §4.3〜§4.5 (strait geometry, transit timeline), §5.1 gates. New files: `core/radar.ts` (≤ 220), `core/ship-transit.ts` (≤ 200), `core/strait-geometry.ts` (≤ 90) with tests `tests/radar`, `tests/ship-transit`, `tests/strait-geometry`. Pure: no Phaser import, no allocation in step functions (source scan like tests/sfx-rules), no new RNG stream, deterministic.

## Notes from the S0 implementer (facts in the committed data/setup — read them in code)
- Tonight's jitter is already applied in `TransitSetup.enterS` and both lane y values (it is `night.enemyOffsets[shipStarts.length]`); do not apply it again.
- Units: `speedMps` is game m/s (the world integrates dt × time_scale); `crossS` is real seconds without hit slow-mo. Keying phases on `stepTimeS` while positions move with the slowed dt would drift during slow-mo — key "AWAY/OUT/GONE" transitions on crossing the edge x (`goneX`) rather than on elapsed time, and key the unload wait on the fixed-step clock only while the ship is off-map (state which clock you use for each transition and test the slow-mo case).
- `transit.shipAi` is the cover's AI with `maxSpeedMps` = 30 kt; retire mode uses max speed.
- The radar data has no small-craft flag; `core/radar` takes "small" from the caller per target.
- Land-clutter bands come from `ShoresSetup` (north/south land with gaps); make `core/strait-geometry` generic so v0.8.1's south `coast` can supply bands too.
- `transitLastGoneS` (core/transit-data) can be reused.

## Lead decisions
- **L6 radar output is position-only.** The blip record type has exactly the keys the spec allows (position rounded to `position_step_m`, age/fade, and whatever index the view needs) — no heading, speed, kind, or detection flag; pin the key list in tests. Fixed capacity 16, no allocation in `step`.
- **L7 radar never reads hidden state for display decisions beyond geometry.** It may read true positions to place blips (that is what radar sees) but not `enemySighted`, `detectRangeM`, AI states or the player's visibility.
- **L8 the existing 9 missions stay bit-identical**: S1 adds only new core files and tests; nothing in the game imports them yet (bundle byte-identical to S0's with the same label — check it).

## Must not change
Everything outside the three new core files and their tests (plus test-kit helpers if needed). CLAUDE.md §7/§8/§11, ≤ 300 lines per file, no Math.random, no model identifiers.

## Deliverables (working tree uncommitted)
CHANGELOG v0.8.0: an `S1` block ending with `    - 門: （lead が別に回した run-gates の結果をここに足す）`. WIP backup to `scratchpad/notes70` `wip/v0800-S1/` (branch `claude/v0.7.0-notes`, 503 backoff). Hand-back: files and line counts, APIs, test list, bundle identity check, deviations, what S2 needs.
