# v0.8.2 IP1 brief (lead → implementer)「実機 1 回目の直し」

Branch `claude/v0.8.2-us05`, HEAD = the S4 commit 9d20c0f (pushed; draft PR #41). Do NOT commit or push the work branch — the lead reviews, runs the gates, commits and pushes. Do not run `vitest -u` (hand back the exact snapshot diff; the lead updates it). Machine: 4 CPUs, parallel jobs ≤ 2. Back up to `scratchpad/notes70` (branch `claude/v0.7.0-notes`) under `wip/v0820-IP1/` (copy `scratchpad/v0820/tools/backup-s2c.sh` → backup-ip1.sh with the new dir).

## The user's words (iPhone round 1, 2026-11-19)
「20 秒後に「報告を送った！」は確認できました。無線が壊れるパターンはたまたまなのか出現しませんでした。難易度的にはかなり難しいと思いますがこのままでいいと思います。強いて言うなら時雨の進行位置を若干戦艦寄りに下げてもらえるとクリアしやすいかもです。FPSは全く問題なし。そんなに気にしなくていいのでは？ あと魚雷が船体の下を通ってしまうことが多くなった気がします。気のせいなら気のせいでいいのですが、、」

## Task A — Shigure's lane slightly toward the battleships (data only)
- `transit` column: Shigure's `lane_dy_m` −560 → a little closer to the main body. Measure −540, −530, −520 with `scripts/headless/column-probe.mjs` (shadow_report, report_attack, bb_ambush; normal seeds 1–40; also hard shadow_report seeds 1–40 to see the knock-on) and pick **−530 unless the table shows a reason not to** (the user said 若干＝a little; S3 measured −550: achieve 90 / sink 8, −500: 98 / 0). The hard extra picket (−575) stays — the user asked about 時雨 only; say what hard looks like after the change.
- Keep the S3 bands as reference only: the user accepted the difficulty, so a band edge (N1 achieve ≤ 85) moving out is fine — report it, do not tune further.
- Update the record's `source` text (reason: the user's words), the tests pinning −560, CHANGELOG, docs/03.

## Task B — "torpedoes pass under the hull" (diagnose first, change nothing unless a real bug)
- Facts the lead already checked: ship hits use `pointHitsHull` (a capsule of beam × `ship_hit_scale` 2 along length × 2 = the drawn size; `fillHullCircles`), the us_05 column kits apply the hit scale per record (`config/column-mission-data` L161–165), the battleship/cruiser textures are record × sprite_scale. Duds are 3% for `us_mk13` (the hit is counted as 不発). So a geometric gap is not expected.
- Measure in the real world, headless: us_05 (aim 4-torpedo fans at the battleships, the cruiser and the destroyers, ranges 800–1,500 m, many seeds) and us_02 as the reference. For every torpedo, record whether its track crossed the drawn hull — the ship texture's opaque pixels transformed to world (sprite position, rotation, display size; use the texture's alpha) — and whether it hit, was a dud, was erratic, was still unarmed, or the ship was sinking/out/withdrawn. Report "crossed the drawn hull but no hit" per ship type and why, and the same for us_02. Also check the draw order (is the torpedo drawn above or below ships?) and whether a torpedo that hits keeps drawing after the hit.
- If you find a real mismatch (e.g. the hit capsule and the drawn hull differ for some ship, a timing issue, a draw-order issue that makes misses look like under-passes), describe it with numbers and propose the smallest fix; implement it only if it touches us_05-only paths. Anything that would change other missions: report and stop (the lead asks the user).

## Also
- FPS: the user says the frame time is no problem; record in CHANGELOG that the spec §7.2 ratio gate (×1.30 > 1.25) is closed by the iPhone result (FPS 60 throughout). No code change.
- CHANGELOG v0.8.2: an `  - IP1（実機 1 回目。…）:` block after S4's, same style, last line `    - 門: （lead が別に回した run-gates の結果をここに足す）`. docs/03: the round-1 result line. No CLAUDE.md change unless the lane is mentioned there (it is not).

## Must not change
Frozen files, `core/*` logic, other missions' data, the magazine chances, every other snapshot, every texture. ≤ 300 lines per file; no Math.random; no model identifiers.

## Gates
`JOBS=2 A05=<abs scratchpad>/v0820/site-S4-9d20c0f bash <abs scratchpad>/v0820/tools/run-gates.sh IP1-impl` (us05 expected to differ by the lane only).

## Hand-back (Japanese)
- Task A: the table per lane value, the chosen value, hard after the change, the snapshot diff.
- Task B: the measurement method, the numbers (us_05 per ship type and us_02), the cause(s), any fix.
- Files and line counts, tests changed, the gates SUMMARY.
