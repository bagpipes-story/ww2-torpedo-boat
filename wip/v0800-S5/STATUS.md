# v0.8.0 S5 (implementer) — status (after the container restart; resumed on the lead decisions L59–L63)

Base HEAD 1c3898b (S4). Working tree uncommitted (18 modified + 2 new). Patch: notes70 wip/v0800-S5/S5.patch.

## Done
- L50 data: us_04 playable_from v0.8.0. L57 objective without the ship count. L51 dawn_air.source → U1; duration_s_source and transit.source → S3 final state.
- L60: dawn_strike.source → U1; tests/__snapshots__/setup-us04.test.ts.snap rewritten: exactly 8 lines (that string), diff in S5-dev/snapshot-setup-us04.diff.
  The full suite passed at that point: 322 files, 3,810 tests.
- L59: ui/title-grid.ts titleGridSubJa (cut at the first 「（」 or 「→」); title-scene line 132 uses it (shortLabelJa import removed, 265 → 264 lines);
  comments in title-layout-config and menu-config. tests/title-grid: source pin, JP identity (titleGridSubJa = shortLabelJa for the 6 JP subtitles), US gap test (≥ 16 px at W 1280/1584),
  unit cases. Title dump re-run (S5-dev/title2): JP tab object-identical (47 objects) in 4 storage states × W 1280/1584; US cards' real gaps: subtitles 97/44/57/89 px, titles 164/135/256/133 px.
- Test pins: briefing, campaign (+ L50 (a)/(b)), dawn-air, evac-briefing, jp05-mission, title-grid, comments in setup-us04 and dawn-withdraw.
- Docs written: docs/01 (new §8 block, §5 and §10 radar fix, §6 line 131, §9 lines 666 and 670), docs/02 (§6.5 radar, §6.12, §4 Title and Campaign rows, the §6.6 collision line),
  docs/03 (v0.8.0 row done + 3 iPhone items, completion record row, v0.8.0 candidates), CLAUDE.md (§2 夜明け, §4 tree, history line).
- New scripts: scripts/headless/strait-perf.mjs (127 lines; L53); scripts/headless/brief-result-us04.mjs (L63; not yet wired into brief-result.mjs).
- Scratchpad: run-gates.sh extended (us04 sets L54, flake rerun L62). site-1c3898b = S4 commit build (same bundle as impl/S4/site; only sw.js differs).

## Done after the restart
- brief-result.mjs US04=1 (287 lines; module brief-result-us04.mjs 95): Briefing lines [2,1,2,1,1,2]+3, note bottom 549 ≤ 576 (W 1560/1280 × normal/hard);
  Result body 514 / worst 578 ≤ 592; 0 overlaps; 0 page errors. Shots in S5-dev/brief/.
- strait-perf (fresh, 2 rounds): updateFrame p95 us_04 0.290 / us_02 0.245 = ×1.18; hard 0.295 / 0.250 = ×1.18 (gate ≤ 1.2 ✓); mins constant (971/1040/822/891/955). Log S5-dev/strait-perf.log.
- Touch play (title-play.mjs play): 4/4 runs Title → US tab → (difficulty) → us_04 card → Briefing → 出撃 → stick 20 s; 0 page errors; build label visible. Shots in S5-dev/play/.
- CHANGELOG: S5 block (ends with the 門 placeholder) + final known constraints; U1 line updated.

## Left
- run-gates S5-impl (running, started 21:3x; art-perf on) → fill the CHANGELOG "agent の確かめ" line; hand-back.
