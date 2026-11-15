# v0.8.0 S3c — lead decisions on the S3b hand-back (lead → the same S3 implementer)

Base: your S3b tree as handed back (uncommitted on f9ba94f; WIP 273fd1a in notes70 `wip/v0800-S3/`). Same rules as brief-S3 / brief-S3b (no commit; ≤ 3 jobs; one heavy job at a time; ≤ 300 lines per file; back up to `wip/v0800-S3/`). These decisions win over brief-S3b, brief-S3 and the spec where they differ. Work them in this order.

## What the lead read in your report
L36 is convincing: the per-torpedo gap is the world (a 27 kt Mk 8 against a 30 kt column that combs after the first wake; launches at 50〜64° off the bow), not the script. C1 is accepted. B1, B3〜B6 and hard pass. B2 cannot pass as written without changing what us_04 is, and F was not reached. Two facts decide B2:
- The escort is one of the four destroyers (`enemies` 4 × ijn_destroyer; `success` 「1隻撃沈で達成」), so sinking it is a legitimate way to meet the objective. Its us_02 patrol turns at every edge toward the map centre, 849 m from the start, so a stopped eye-only boat gets the us_02 duel (escort sunk on 65.0% of nights, own sinking 56.5%, 達成 40.6%).
- The return lane is 300 m from the start by design (the return danger and the 「進路から離れよ」 warning), so an eye-only boat that saved its torpedoes would also see the returning column at 900 m. The radar-only part of the night is the inbound pass (1,100 m from the start) and knowing where everything is.
The spec's R1 says B2 "shows the numbers and the iPhone test decides". The user suggested the radar may become a store item (「レーダーもストアで追加かな」), so missions must stay winnable without radar. The lead keeps the world as it is and makes B2 measure what the radar must add.

## Decisions
- **L45 B2 → B2a + B2b, plus reference lines.**
  - B2a 「列はレーダーで」: eye_only's column-ship sink ≥ 1 ≤ radar_ambush's column-ship sink ≥ 1 − 15 points (column ships only, the escort excluded; read the identity in the cell, never in a policy).
  - B2b 「目だけは危ない」: eye_only's own sinking ≥ radar_ambush's own sinking + 15 points.
  - Reference lines under the bands (no ✓/✗): the 達成 gap radar_ambush − eye_only and radar_twice − eye_only; eye_only's escort-sink share; radar_ambush's column-sink share.
  - Add a per-policy "列の撃沈≥1" column (or the escort / column split) to the table so B2a reads straight from it.
  - One-off reference run, not in g2: a sim-only `NOCOVER=1` (the escort absent from the night; same pattern as your `COVER=` override; keep it out of every file a game path imports) — 800-night normal table. Report eye_only's and radar_ambush's sink ≥ 1 / own sinking / 達成 under it. This is the honest number for "how much of the column an eye-only player gets from the return pass".
  - Reasons to record in the CHANGELOG (in your own words, with the numbers): the two facts above; R1; the store remark; B2a/B2b are what the radar adds; the known constraint that an eye-only player can win by dueling the escort about as often as the radar ambush (the 達成 gaps) and can see the return pass (the NOCOVER numbers) — the iPhone test asks the user whether the radar feels needed.
- **L46 F reads radar_twice; fuel after L45.** F becomes "radar_twice's home-night median remaining fuel 15〜35% (aim ≈ 25%)"; also print radar_ambush's value as a reference. Dry rule: each of the 7 spec policies (`INTERCEPT_POLICIES`) whose home share is ≥ 20% runs dry (漂流) on ≤ 5% of nights, in normal and hard; print every row's dry share (reference rows included, no rule for them).
  - Reason to record: F was written when radar_ambush's line escaped at full speed. After L37 it is the thriftiest line (median ≈ 18.2 gal used at 48 gal). F 25% on it (≈ 24 gal) would leave radar_twice (median ≈ 24.5, p10 ≈ 28.8 gal used) dry on most nights, though the second pass is one of the spec's lines. Measuring F on the fuel-hungriest radar line keeps fuel a real constraint without closing the second pass.
  - Method: from the 48-gal tables (used gallons = 48 × (1 − remaining)), compute the allotment for F ≈ 25%, round to a whole gallon, then run normal + hard once. Allow at most one correction step. If F and the dry rule cannot both hold, take the smallest allotment that satisfies the dry rule, report F, and stop.
  - Data: `fuel_allotment_gal` and its `_source` (reason and the measured numbers). Rewrite `tests/__snapshots__/setup-us04.test.ts.snap` with `vitest -u` on that file only and show the diff. V-* pass.
- **L47 hard** with the final data: H1 / H2 as before. Report the dry shares too.
- **L48 tests and gates.**
  - Re-check the light set (same ✓/✗ as the 800-night table; say if any band sits within ±3 points of an edge on it).
  - npm test fully green.
  - g2 `US04=1` (with `G6=1 ALLY=1 EVAC=1`) prints 「帯: すべて ✓」 for us4 and us4h and DIFF 0; the existing 37 md5s unchanged.
  - strait-probe once on a build of the final tree (real night and `NOPLANE=1 IDENT=1`), world vs sim per policy.
  - Do **not** run `run-gates.sh` — the lead runs it after your hand-back.
- **L49 CHANGELOG**: an S3c sub-block (L45〜L48: what, why, key rows, md5 heads, wall times), and update the S3 block's 既知の制約 to the final state. It still ends with `    - 門: （lead が別に回した run-gates の結果をここに足す）`.

## Timebox
About 75 minutes. If a step fails its rule, stop at the end of that step and report.

## Hand-back
- B2a / B2b and the reference lines (normal, hard).
- The NOCOVER table rows.
- The fuel steps with the tables' key rows and the dry shares.
- The snapshot diff.
- The final md5 heads (normal, hard).
- The light-set check, npm test, g2 and strait-probe results.
- Wall times, deviations, files and line counts, and what S4 needs (anything in the data that changed since S2).
