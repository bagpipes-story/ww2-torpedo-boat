# v0.8.0 S0 brief (lead → implementer)

Branch `claude/v0.8.0-us-campaign` (HEAD f59c9ba = main 2afe092 + the docs/03 roadmap rewrite). Do NOT commit; the lead runs the gates, commits and pushes.

Spec: `scratchpad/v0800/plan/spec-v0800.md` — implement stage **S0（data と検査。遊べない）** exactly as its §6 row says, with §2.0 (seed fixes), §2.4 (Japanese-tab unlock), §3.3 (radar data keys and V-R1〜V-R5), §4.3〜§4.8 (us_04 data: map/shores, transit block, enemies, timeline check V-T3, objective, difficulty, data keys), §4.12 (no persons/famous boat in us_04 data; denylist test), §5.1 gates.

## Lead decisions (win over the spec where they differ)
- **L1 Q1 default**: us_04 dawn = enemy-held sky (raid of 4 floatplanes outside the ring), following the user's rule "制空権がない限り夜明けの後は空襲" (the sky was contested in Aug 1943; Japanese aircraft bombed the PT base that afternoon). The data is prepared in S0; `playable_from` and the final `dawn_air.play_as` land in S5 as the spec says.
- **L2 Q3 default**: the Japanese tab still opens after the current 3 US missions (explicit list `us_01`〜`us_03`); a device that already opened it is unaffected.
- **L3 order**: v0.8.0 us_04 + radar → v0.8.1 us_06 → v0.8.2 us_05 → v0.8.3 us_07. Split the docs/03 v0.8.x row into four rows (v0.8.0〜v0.8.3) with Done, iPhone items and estimates (total 9〜12 sessions; say plainly that it is above the earlier 4〜8 and why). Record the history corrections the research forced (us_04 Mk 8 from tubes; us_05 the first contact was the battleship column, half moon; us_06 sinking off Palompon, no "suicide boats"; us_07 the mine hit after sunrise, shore battery and mines, no E-boats) in the seed data notes where S0 touches them, and as notes in docs/03 for the later rows (the user decides Q5/Q6/Q7 at those plans).
- **L4 CHANGELOG**: start `## v0.8.0 — 2026-11-15（米PT キャンペーン②：ブラケット海峡の夜とレーダー）` with the user's requests verbatim (2026-11-15: 「us_04〜us_07 の 4 つも作ってくださいね。進め方はAでよいです。ストアも殴り込みもシナリオ全クリア後のお楽しみで課金の仕組みもできれば入れたいです。あとレーダーも実装するっていってたよね。レーダーもストアで追加かな。」 and 「殴り込みは初期は絶対に勝てないようにして、ストアで味方の魚雷艇や駆逐艦などを追加してようやくクリアできるようにしてください。また、やり込みモードで敵を増強したり増やしたりする機能も入れてください」), 目的・Done (spec §0), the design defaults L1/L2/Q2 (player is the radar-equipped section leader), and an S0 block ending with `    - 門: （lead が別に回した run-gates の結果をここに足す）`. Version 0.8.0 in package.json and package-lock.json.
- **L5 gates tooling**: base site `scratchpad/v0800/base-2afe092` (main 2afe092, label main@2afe092), gate script `scratchpad/v0800/tools/run-gates.sh <stage>` (same as v0.7.2's; reduced run: `SKIP="test g2 art-perf" AB_ENV="MISSION=us_02 SECS=20" SMALL_AUDIO_STATES="default audio noaudio"`). In S0 the nine existing missions must be bit-identical: their setup snapshots unchanged, g2 OK 37, ab-replay/hud-ab same in three audio states, tex-ab ✗ 0, frozen 20 files unchanged.

## Must not change
Every existing mission's behaviour, HUD, art and sound (bit-identical), frozen files, `TEXTURE_KEYS` (unless the spec's S0 requires — it should not), the hit-rate model's existing values (only the new `radar` block is added), scoring. CLAUDE.md §7/§8/§11, ≤ 300 lines per file, no Math.random, no model identifiers in files.

## Deliverables (working tree uncommitted)
WIP backups to `scratchpad/notes70` `wip/v0800-S0/` (branch `claude/v0.7.0-notes`, 503 backoff 4/8/16/32 s). Hand-back: files and line counts, data changes (diff summary per data file), validators and their messages, tests added/changed, reduced-gate results, deviations from the spec, what S1 needs.
