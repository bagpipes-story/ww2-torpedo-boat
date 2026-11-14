# v0.7.2 IP1 brief (lead → implementer) — 実機 1 回目の直し（曲）

Branch `claude/v0.7.2-bgm`. S0–S3 are committed and pushed by the lead before you start (check `git log`). You work on top and do NOT commit; the lead runs the full gates, commits and pushes.

## User feedback (2026-11-14, iPhone, verbatim)
「タイトルの曲はAでもよいのですが、もっとアップテンポでもいいかと思います。軍艦マーチくらいの。ちなみにBはファミコンのRPGみたいでださいです。また、緊張と戦闘の音楽はおなじでは？」

Lead reading:
1. A is acceptable, but the user would like a more up-tempo title theme, about the tempo of 軍艦行進曲 (a quick march, ≈ 120 BPM). "くらいの" is a tempo reference — do NOT imitate that march (or any known tune): no hand-written melodies, the anti-cliché rules stay, the seeded composer writes the melody.
2. B is rejected: "sounds like a Famicom RPG, uncool". Likely causes: bright buzzy brass/pluck tables (chiptune-like), major-key oom-pah + offbeat chords (RPG overworld cliché), dry mono sound.
3. Tense and battle sound the same. By design battle = tense + one percussion layer, only +3 dB overall (tense −30, battle −27 dBFS), and both are rhythmically busy (tense already has a 16th shaker and 8th plucks; battle adds 16th snare in the same register). On a phone speaker the difference vanishes.

## Goals
1. **Title candidates.** Keep A unchanged as the default (`MUSIC_TITLE_DEFAULT_ID` stays `title_a` until the user picks). Remove B (rejected) and replace C with two new up-tempo candidates at **126 BPM** (the only sample-exact tempo near 120 in `MUSIC_BPMS`):
   - **D「A を行進の速さで」**: A's key and progression (D aeolian, Dm B♭ F C Dm B♭ Gm A or a close variant), 126 BPM, 4/4 × 16 bars or 2/4 × 32 bars (≈ 30 s; 672,000 samples), driving 8th-note ostinato in the low-mid register (fundamentals ≥ 200 Hz — the IP1/IP2 lesson: iPhone speakers lose < 300–400 Hz; long low sines sound like a dull "pon"), snare march pattern with rolls at phrase ends, a booming tom/timpani-like hit on strong beats, A's pad, and a stronger lead than the bell (muted brass or strings) carrying A's mood.
   - **E「短調の勇ましい行進」**: a minor-key brisk march (e.g. G or C minor / harmonic minor), 126 BPM, 2/4, dotted march rhythms in the melody, low brass on the beats with warm (low-passed) chords on the off-beats, snare with rolls, a soft noise crash at phrase starts.
   - Both: no chiptune feel — no bright saw/pulse leads; use warm tables (fewer high partials), ensemble voices (2–3 voices ±3–8 cents), and if it still reads "8-bit" in the numbers (high-partial share, spectral flatness) add a light build-time "room" (a few comb + all-pass stages or a short multi-tap delay, cheap, inside the build budget, tail wrapped into the loop like everything else) applied per theme by a flag (A stays bit-identical unless you have a strong reason — then explain).
   - Lab row 0 becomes [A（今）][D][E][止める] (letters D/E so the user does not confuse them with the rejected B/C). Rename keys `title_b`/`title_c` to `title_d`/`title_e` (or equivalent) and update every pin; seeds stay in 7601–7699 and are found by the existing first-passing-seed search.
2. **Tense vs battle must be clearly different.**
   - Tense (L1) = suspense: sparse — e.g. a low "heartbeat" pulse on quarter notes (tom/timpani-like, ≥ 200 Hz body), a quiet high tremolo or trill, an ostinato of 2 notes at most in 8ths; remove the 16th shaker.
   - Battle (L2) = drive: 16th snare with rolls, a booming hit on every beat, a rhythmic brass riff or stabs (not only a pedal), double-time feel. L2 may become longer than 2 bars (it must still divide L0's 8 bars).
   - Revisit `MUSIC_MOOD_WEIGHTS` so battle is not just tense + drums (for example battle (0.5, 0.3, 1)); keep quiet (1, 0, 0). Raise the battle target above −27 dBFS only if the offline mix still passes (exit peak < 0.9, 0% over 1.0, menu UI ≥ 12 dB) — report the numbers either way.
   - Prove the contrast with numbers between the tense mix and the battle mix (e.g. onset density per second, energy share 2–5 kHz, RMS) and state targets you met (suggestion: battle ≥ 2× onset density of tense and ≥ +4 dB in 2–5 kHz).
3. Keep everything else from S0–S3 (mood observer, ducking, slow-mo, lab rows 1–3, release semantics, budgets). Bundle gzip: report the delta against the S3 commit and the remaining v0.7.2 budget (+20 kB vs main 35e9e77).

## Must not change
Gameplay and HUD (A/B identical in three audio states), the 26 SFX, hud-scene, briefing-scene, mission-scene, mission-world, world-visuals, mission-effects, frozen files, existing core logic, `data/*.json`, `TEXTURE_KEYS`. CLAUDE.md §7 rules. In-game resident music ≤ 1.8M samples for every possible title choice (A, D, E) + family; lab ≤ 2.8M. Build stays at 150,000 units/frame; report build frames per key and Chromium per-call timing as in S0. No model identifiers in files. No Math.random.

## Tests and tools
Update tests/sfx-music-{synth,compose,render,inventory}, tests/music-lab, tests/sfx-music-build, tests/sfx-engine-music/mood as needed; keep the anti-cliché and melody-rule tests and add the contrast metrics test for tense vs battle. Re-run `scripts/sfx-music.ts` metrics (levels, band shares, seams, build cost), the offline mix gates (sfx-offline with the S2 stem model), sfx-music-live, and the reduced run-gates in three audio states.

## Deliverables (working tree uncommitted)
- CHANGELOG v0.7.2: a block 「実機 1 回目の直し（IP1）」 with the user's words verbatim, what changed and why, numbers, and the 門 placeholder line `    - 門: （lead が別に回した run-gates の結果をここに足す）`; 既知の制約（IP1）.
- docs/03 v0.7.2 row: record 実機 1 回目 and the IP1 iPhone items: ① `?sfxlab` でタイトルの曲 A・D・E を聞き比べて選ぶ（知っている曲に似ていたら一言） ② 試聴の場の「任務の曲」で 静か・緊張・戦闘 がはっきり違って聞こえるか ③ 任務の中で、見つかった時と撃たれた時に曲が変わるのが分かるか・うるさくないか.
- WIP backups to `scratchpad/notes70` `wip/v0720-IP1/` (branch `claude/v0.7.0-notes`, push with 503 backoff).
- Hand-back: files and line counts, the new themes described in words (key, tempo, form, instruments), all numbers, open risks.
