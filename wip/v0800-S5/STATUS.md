# v0.8.0 S5 (implementer) — status: STOPPED at L50/L55 (report to lead)

Base HEAD 1c3898b (S4). Working tree uncommitted. Patch: notes70 wip/v0800-S5/S5.patch.

## Why stopped
The US tab with 4 missions uses the existing 2-column grid (TITLE_GRID_FROM 4, subtitle cut at the first 「（」), with no code change.
In that grid the us_01 card's subtitle 「1942年3月11日 ・ コレヒドール→ミンダナオ」 (20 px, real width 426 px, x 63..489 at W 1280) runs into the
status 「出撃準備 →」 (24 px, x 471..596, y 249.5..278.5 vs the subtitle's y 272..296): the boxes overlap by 18 × 6.5 px (same at W 1584).
The JP-grid rule in tests/title-grid is a gap of 16 px or more, so it is 34 px short. Screenshots: S5-dev/title1/title-fresh-w1280-B.png, -w1584-B.png.
Any fix needs code (L50: "if the grid needs code, stop and report") or a us_01 `place` change (that changes us_01's Briefing: not allowed).
Options: (1, recommended) the grid also cuts the subtitle at the first 「→」 (us_01 → 「1942年3月11日 ・ コレヒドール」, about 307 px, gap about 100 px; no JP or
other US subtitle has 「→」, so the JP tab stays object-identical): a small helper in core/briefing plus one line in title-scene and the pin in tests/title-grid.
(2) a new optional data key for a short Title place, read only by the grid. (3) a smaller grid subtitle or a shorter status for all cards: changes the JP tab.

## Done so far
- data/missions_seed.json us_04: playable_from v0.8.0; objective without the ship count (L57); dawn_air.source → U1; duration_s_source and transit.source → S3 final state.
  dawn_strike.source left as is (it is in the setup-us04 snapshot; changing it would rewrite 8 snapshot lines).
- Test pins updated (7 files pass, typecheck passes): briefing, campaign (+ the L50 (a)/(b) test), dawn-air, evac-briefing, jp05-mission, title-grid (US ids, 2 × 2 rects), comments in setup-us04 and dawn-withdraw.
- Title dump (tools/title-play.mjs dump, A = base 2afe092, B = this tree, W 1280 and 1584, 4 storage states): JP tab object-identical (47 objects) in every state;
  US tab 35 → 39 objects (3 rows of 960 → 4 cards of 597); the JP tab's status line 「未解放 ・ 米PTの 3 任務を帰投で（済 0/3）」 with nothing stored and with us_04 only; us_01..03 → JP opens.

## Not done (after the decision)
docs/01, docs/02, docs/03, CLAUDE.md, CHANGELOG S5 block and top part; scripts/headless/strait-perf.mjs; brief-result us_04; run-gates us04 sets;
touch play and the remaining screenshots; the US-tab subtitle gap test; full npm test and run-gates S5-impl.
