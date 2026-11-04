export const meta = {
  name: 'v0611-s3b-repass',
  description: 'v0.6.11 S3b: add a default-off re-pass rule for jp_03 flights, measure bands with it, verify on fresh seeds, record and push',
  phases: [
    { title: 'Implement', detail: 'passes_max knob (default 1 = byte-identical), core + data + check + sim knob + tests + gates' },
    { title: 'Measure', detail: 'staged knob grid with passes_max 2/3, nearest configs at N 400 x 2' },
    { title: 'Verify', detail: 'independent re-run on fresh seeds 2001-2400 and 3001-3400' },
    { title: 'Record', detail: 'CHANGELOG S3b, gates, commit, push' },
  ],
}

const CTX = `
Repo /home/user/ww2-torpedo-boat, branch claude/v0.6.11-next (HEAD 333c8ec = "v0.6.11 S3"). Version v0.6.11 builds jp_03「運天港・空襲下の退避」(18 boats = 6 groups of 3, player steers one group's leader, a 切替 button switches group, uncontrolled groups evade randomly, 4 waves of flights; normal 2 flights at once with 2/3/3/4 planes, hard 3 flights at once; clear = >= 6 of 18 survive).
Spec: /tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0611/plan/spec-v0611-r2.md (read §3.5, §3.7, §7, §8, §12 fully) and user-decisions.md in the same folder (binding user decisions U1-U6; U5 wave counts are the user's and must NOT change: 4 waves, planes 2/3/3/4 per flight, 2 flights normal / 3 hard, 1 flight goes for the controlled group, the others for other exposed groups).
Read CHANGELOG.md's v0.6.11 entry (S0-S3) first: it is the record of what exists. The S3 result: with data defaults normal is far too easy (seq 99.6%, stay 41%, dodge_only 95.8%) and NO knob point inside the §12.5 ranges satisfies the normal bands of spec §12.4. Nearest: dodge.success 0, full_p 0, haul_s 24, announce_lead_s 8, west_cover removed, cover_reveal_chance 0.5 with pick_s 60 (outside range) fails only seq_shoot 61.8 (limit seq+5=60.3) and dodge_only 77.6 (limit seq-15=40.3). Structural reason: each flight attacks ONE group of 3 boats once (2 bombs per plane, then it leaves), so in normal only 8 flights exist; with the player dodging one flight per wave, the un-dodged flights can sink at most ~4 x 3 = 12 boats, so "never hide, only switch and dodge" (dodge_only) cannot fall below ~55-70% clear. The user's design words (U5): 「他の隊はランダム機動なので残りの敵編隊の攻撃に晒され続けることになります。なのでプレイヤーは急いで退避しつつ、他の隊の面倒も見なければいけなくなる」 — exposed groups should stay under attack.
The candidate rule being evaluated now (lead proposal, NOT yet approved by the user, so data default must keep today's behaviour): a flight that has finished its sortie (airSortieComplete) comes back for another pass, up to passes_max passes in total per flight, but only if the whole new pass fits before the next wave's start (announce_s of the next wave + announce_lead_s; for the last wave: duration_s 240, i.e. before settlement). The plane count per wave is unchanged; only the number of bomb passes grows.
Hard rules: the 20 frozen files (tests/frozen-files.test.ts sha256) must not change by one byte; reuse core/air-sortie restartAirSortie / airSortieComplete as evac-plan already does. src/core never imports phaser. No magic numbers in code: values live in data/*.json with a source field ("design (v0.6.11 S3b。…)" in Japanese like the neighbouring keys). Files <= 300 lines (src/core/evac-plan.ts is already 286 lines: put the new rule in a new module, e.g. src/core/evac-repass.ts, and keep evac-plan's call site small). §7 performance: no per-step allocation, nothing new allocated after setup; flights stay pre-allocated (normal 8 / hard 12). Seeded RNG only; re-passes must not add draws on any stream when passes_max is 1, and when > 1 the draw counting in tests/evac-sim-a and core/evac-sim must still match expectations (update the expected-count formula, do not loosen the check).
Neutrality gates (all must stay green): npm test, npm run typecheck (if the script exists; otherwise tsc via lint), npm run lint, VITE_BASE=/ww2-torpedo-boat/ npm run build, tests/frozen-files unchanged, setup snapshots never updated with -u except tests/setup-jp03 (only if a new data key changes it; say so), scripts/headless/g2.sh with G6=1 ALLY=1 → OK 35 DIFF 0 (other missions' sim md5s), and with passes_max 1 the jp_03 tables must be byte-identical to S3: scripts/evac-sim.ts TABLE=2 md5 normal 6ee38964, hard 1365b542 (check how S3 computed them in CHANGELOG/scripts and reproduce exactly).
Write Japanese for every comment, data source text and CHANGELOG text, in the same style as the existing v0.6.11 code (short, concrete, cites spec sections).
`

const IMPL = await agent(`${CTX}
TASK (Implement): add the default-off re-pass rule.
1. Data: add to data/missions_seed.json jp_03 v0_1_prototype.evac_raid a key passes_max (integer, default 1) with its source text (design, v0.6.11 S3b, explain the rule and that 1 = today's behaviour, pending the user's answer). Optionally hard override hard.evac_passes_max if the existing hard override pattern makes that natural (follow how hard.evac_flights / hard.evac_cover_reveal_chance are read). Add the boot check in src/config/evac-mission-data.ts (V-E13 or the next free id): integer 1..3, message names the key in Japanese.
2. Core: parse into evac params (core/evac-params / evac-data as the existing keys do). New module (e.g. src/core/evac-repass.ts) called from the plan's step where a flight becomes complete: if the flight's passes used < passes_max and a new pass fits (now + announce_lead_s + estimated pass duration <= next wave start, or <= duration_s for the last wave; estimate the duration from the sortie params: first_run_s + (planes*bombs_per_plane - 1)*run_gap_s + fall time + leave_s + fade, computed once at setup per flight, not per step), then re-arm the flight as a NEW announce on the same slot: pick its target with the same slot rule as the wave's first announce (slot 0 = controlled group if exposed, others = other exposed groups, nearest to the slot's spawn point first, one flight per group at a time among the flights active in this wave, flights_per_group_max respected), set the warning ("狙われている" / red-ring state, the same fields the first announce sets so policies and the future HUD react identically), and start it announce_lead_s later through the existing start path (restartAirSortie, retry next step if it returns false, lose the target if it hid, same 終わり方 bookkeeping). Decide and document whether a re-announce draws the cover reveal (seed+29): recommended NO (re-pass is not a new wave), so the +29 count stays per wave. The flight's scatter stream (+32+wave*3+slot) simply continues. Record per flight the number of passes flown (for the tables). If no target is available the flight ends as today (目標なし).
3. Sim knob: scripts/evac-sim.ts / systems/evac-sim-setup.ts get an env knob for passes_max (and hard), like the other §12.5 knobs. core/evac-sim-cell: add to the table "passes flown per flight (mean)" and "share of flights that flew >= 2 passes" (monitor only, not a band). Make sure adding these columns does NOT change the TABLE=2 md5 at passes_max 1 — if the md5 covers the printed table, print the new columns only when passes_max > 1, and say so.
4. Tests: extend tests (new tests/evac-repass.test.ts or in evac-plan tests): passes_max 1 → identical runs to S3 (same draws, same results); passes_max 2 → a flight re-announces after completion only when it fits, never overlaps the next wave's start, the target rule matches, the warning fires, draw counts as expected, nothing allocated after setup (follow existing alloc checks if any), settlement cancels as before. Also V-E13 boot check tests in tests/evac-mission-data.
5. Run every gate listed above, including the md5 identity at passes_max 1 and g2. Do NOT commit. Do NOT touch CHANGELOG (a later stage writes it).
Return a precise summary: files changed with line counts, the exact rule as implemented (incl. edge cases you decided), env knob names, how to run a table with passes_max 2, gate results with numbers, and quick sanity numbers: one normal TABLE run (N 100 is fine) of seq/dodge_only/stay/own_only at passes_max 2 with data defaults otherwise, plus the share of flights that got a 2nd pass per wave index.`, { label: 'implement repass', phase: 'Implement', effort: 'high', schema: {
  type: 'object',
  properties: {
    ok: { type: 'boolean', description: 'all gates green and md5 identity at passes_max 1 held' },
    summary: { type: 'string' },
    envKnobs: { type: 'string' },
    sanity: { type: 'string' },
    problems: { type: 'string' },
  },
  required: ['ok', 'summary', 'envKnobs', 'sanity', 'problems'],
} })

if (!IMPL || !IMPL.ok) {
  return { stage: 'implement', impl: IMPL }
}

const MEASURE = await agent(`${CTX}
The re-pass rule is now implemented in the working tree (uncommitted). Implementer's report:
${IMPL.summary}
Env knobs: ${IMPL.envKnobs}
Sanity: ${IMPL.sanity}

TASK (Measure): find knob points where ALL normal bands of spec §12.4 hold AND all hard bands hold, using the §12.5 knobs (ranges as S3 read them: dodge.success 0-0.5, pick_s 5-30 s, haul_s 6-24 s, removing one shelter (a cave or a cover; never change slot sizes), cover_reveal_chance 0.25-0.6 (normal and hard), announce_lead_s 10 or 8, first_run_s 6.5-9, run_gap_s 1.7-2.2, flights_per_group_max 1 or 2, full_p 0-0.5) plus passes_max 2 and 3 (hard may use the same or its own override if implemented). Do NOT change the bands, the U5 counts, us_carrier_aircraft or the quota 6. Prefer points that stay closest to data defaults (fewest knobs moved, smallest moves) and keep pick_s <= 30 (U3 「ランダムに回避」).
Method: like S3 — a staged grid at N 100 (first the outside-group knobs × passes_max, then the hide-side knobs around the best), then the nearest 3-5 points at N 400 × 2 seed sets (1-400, 1001-1400) for normal and hard with TABLE=2. Run independent sim processes in parallel up to the CPU count (nproc) but not more. Write raw outputs to /tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0611/s3b/ (create it). Do not edit src or data (data stays at defaults; knobs via env only). Do not commit.
Report for each finalist: the knob settings, every normal and hard row (P(clear), median survivors p10-p90, drift, shoot-down mean, the monitor columns incl. passes per flight and share with >= 2 passes, sunk per arriving flight, the structural floor P(3 caves x 3 hauled)), which bands pass/fail with margins, and the TABLE=2 md5s. If no point satisfies everything, report the nearest ones and the structural reason precisely (which band, why, what number would be needed). Also give, for the best finalist, the same table with flash_reveal true for seq_shoot (spec §12.3 asks for it side by side).`, { label: 'measure grid', phase: 'Measure', effort: 'high', schema: {
  type: 'object',
  properties: {
    feasible: { type: 'boolean' },
    best: { type: 'string', description: 'best knob point as env assignments' },
    finalists: { type: 'string', description: 'full tables per finalist with pass/fail and margins and md5s' },
    reason: { type: 'string' },
  },
  required: ['feasible', 'best', 'finalists', 'reason'],
} })

if (!MEASURE) return { stage: 'measure', impl: IMPL }

const VERIFY = await agent(`${CTX}
The re-pass rule is implemented in the working tree (uncommitted). A measurement agent reports:
feasible=${MEASURE.feasible}
best=${MEASURE.best}
${MEASURE.finalists}
reason: ${MEASURE.reason}

TASK (Verify, adversarial): try to REFUTE that the best point is robust and correct.
1. Re-run the best point (and the runner-up) at N 400 on two FRESH seed sets 2001-2400 and 3001-3400 (check scripts/evac-sim.ts for how to set the seed base; add nothing to src — if the script cannot take a seed base, run it via a tiny scratch wrapper in the scratchpad that imports the same modules). Report every band with margins; a band that flips on fresh seeds is a finding.
2. Read the re-pass implementation diff (git diff) against spec §3.7/§8 and the user's U5: check that no second pass can overlap the next wave's start (peak flights stay 2/3, peak planes 8/12 — the §7 budget), that slot 0 still goes only to the controlled group, that a hidden group is never targeted unless found, that passes_max 1 is byte-identical (re-run TABLE=2 md5 normal 6ee38964 / hard 1365b542 yourself), that the +29/+30/+31/flight draw counts are right, that nothing allocates per step, and that the new code is <= 300 lines per file. Run npm test once.
3. Sanity of the game feel numbers: for the best point, does hiding (seq) beat not hiding (dodge_only, fight, stay) clearly in normal AND hard? Is bot >= 90% normal, and is 18-of-18 survival <= 10%?
Return findings (each with evidence), and an overall verdict.`, { label: 'verify fresh seeds', phase: 'Verify', effort: 'high', schema: {
  type: 'object',
  properties: {
    robust: { type: 'boolean' },
    implementationIssues: { type: 'string' },
    freshSeedTables: { type: 'string' },
    verdict: { type: 'string' },
  },
  required: ['robust', 'implementationIssues', 'freshSeedTables', 'verdict'],
} })

const RECORD = await agent(`${CTX}
The re-pass rule is implemented in the working tree (uncommitted; data default passes_max 1 = no game change).
Implementer: ${IMPL.summary}
Measurement: feasible=${MEASURE.feasible}; best=${MEASURE.best}
${MEASURE.finalists}
reason: ${MEASURE.reason}
Verification: robust=${VERIFY ? VERIFY.robust : 'n/a'}; issues: ${VERIFY ? VERIFY.implementationIssues : 'n/a'}
${VERIFY ? VERIFY.freshSeedTables : ''}
verdict: ${VERIFY ? VERIFY.verdict : 'n/a'}

TASK (Record):
1. If the verifier reported concrete implementation issues (not band results), fix them minimally and re-run the affected gates. Do not change data defaults (passes_max stays 1; the knob values are applied only after the user answers).
2. Before committing: git fetch origin claude/v0.6.11-next; if a commit whose message starts with "v0.6.11 S3b" is already there, stop and report it.
3. CHANGELOG.md v0.6.11: add an S3b bullet after S3 in the same style: the re-pass rule (what, why = the S3 structural reason and U5's 「晒され続ける」, default 1 = no game change pending the user's answer), the module/keys/check/env knobs, the measured finalist tables (normal and hard, both seed sets and the fresh seeds, with pass/fail and margins, md5s), and the verifier's result. Update the 既知の制約 line about the S3 bands accordingly (still unresolved until the user answers).
4. Run all gates again (npm test, typecheck/lint, build, frozen, snapshots without -u except setup-jp03 if needed, g2 G6=1 ALLY=1 OK 35 DIFF 0, TABLE=2 md5 identity at passes_max 1).
5. Commit with a message starting "v0.6.11 S3b: " (Japanese summary like the earlier stage commits, ending exactly with the two lines:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FFamytCg2edHr8RBr7eBa7
) and git push -u origin claude/v0.6.11-next (retry up to 4 times with 2/4/8/16 s on network errors). Never include a model identifier anywhere else.
Return the commit hash, gate results and a 10-line Japanese digest of the tables (normal/hard, defaults vs best point) suitable to show the user.`, { label: 'record and push', phase: 'Record', effort: 'medium', schema: {
  type: 'object',
  properties: {
    commit: { type: 'string' },
    pushed: { type: 'boolean' },
    gates: { type: 'string' },
    digestJa: { type: 'string' },
  },
  required: ['commit', 'pushed', 'gates', 'digestJa'],
} })

return { impl: IMPL, measure: MEASURE, verify: VERIFY, record: RECORD }
