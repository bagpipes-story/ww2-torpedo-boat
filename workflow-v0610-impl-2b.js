export const meta = {
  name: 'v0610-impl-2b',
  description: 'v0.6.10 part 2 (rebuilt after reset): world wiring, squadron/telemetry, HUD, Briefing/Result/docs, review, verify, fix, final',
  phases: [
    { title: 'S5a', detail: 'world-ally, entity, textures, harnesses, parity' },
    { title: 'S5b', detail: 'PtSquadron lit/fate/credit, telemetry, A/B gates' },
    { title: 'S6', detail: 'HUD lines' },
    { title: 'S7', detail: 'Briefing, Result, docs' },
    { title: 'Review', detail: 'two reviewers' },
    { title: 'Verify', detail: 'check findings' },
    { title: 'Fix', detail: 'fix verified findings' },
    { title: 'Final', detail: 'all gates' },
  ],
}
const SP = '/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad'
const CTX = `CONTEXT: Repo /home/user/ww2-torpedo-boat, branch claude/v0.6.10-ally-destroyer (HEAD at the start 4dc26f8 = S4, pushed; draft PR #34). Version 0.6.10 adds the allied destroyer 卯月 to jp_04. READ FIRST: ${SP}/v0610/plan/spec-v0610-p2.md (binding; it restates the lead decisions after a container reset wiped the old spec and the scratch harnesses; a copy is on GitHub branch claude/v0.6.10-notes), then CHANGELOG.md v0.6.10 (detailed record of S0a–S4) and git log 6856840..HEAD. Follow the spec's process rules: fetch first and skip your stage if a commit starting with your stage tag is already on origin; commit your stage once and PUSH it right away (git push -u origin claude/v0.6.10-ally-destroyer, retry on network errors); harnesses go in scripts/headless/. Rules: never edit the 20 frozen files (tests/frozen-files); src/core never imports phaser; seeded RNG only; CLAUDE.md §7 (no per-frame allocation, Graphics.clear or unchanged setText; textures generated once in Boot); data values only in data/*.json; ≤ 300 lines per new/touched src file, never edit a file already over 300; never put model identifiers in commits or files; end every commit message with exactly:\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01FFamytCg2edHr8RBr7eBa7\nScratch work under ${SP}/v0610/impl2/<stage>/. The machine may be loaded: generous timeouts; rerun a timing-only headless failure alone before calling it a failure. Leave the tree clean.`
const STAGE = { type: 'object', properties: { ok: { type: 'boolean' }, commit: { type: 'string' }, summary: { type: 'string' }, problems: { type: 'array', items: { type: 'string' } } }, required: ['ok', 'commit', 'summary', 'problems'] }
const FINDINGS = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string', enum: ['high', 'medium', 'low'] }, file: { type: 'string' }, title: { type: 'string' }, detail: { type: 'string' } }, required: ['id', 'severity', 'file', 'title', 'detail'] } } }, required: ['findings'] }
const VERDICTS = { type: 'object', properties: { verdicts: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, real: { type: 'boolean' }, evidence: { type: 'string' } }, required: ['id', 'real', 'evidence'] } } }, required: ['verdicts'] }
const FIX = { type: 'object', properties: { ok: { type: 'boolean' }, commit: { type: 'string' }, fixed: { type: 'array', items: { type: 'string' } }, skipped: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, why: { type: 'string' } }, required: ['id', 'why'] } }, summary: { type: 'string' } }, required: ['ok', 'commit', 'fixed', 'skipped', 'summary'] }
const FINAL = { type: 'object', properties: { ok: { type: 'boolean' }, head: { type: 'string' }, summary: { type: 'string' }, problems: { type: 'array', items: { type: 'string' } } }, required: ['ok', 'head', 'summary', 'problems'] }

const stages = [
  ['S5a', 'Implement stage S5a of the spec (world core + harnesses + baseline site + G7 world-vs-sim parity).'],
  ['S5b', 'Implement stage S5b of the spec (PtSquadron lit mask, visual-only fate arrow, ally credit setter, telemetry credit lines, score; G6w, G4, G5 with the repo harnesses; jp_04 headless 24 nights; heap).'],
  ['S6', 'Implement stage S6 of the spec (HUD lines with LD3 and LD4, events, gun-event name, widths ≤ 840 px, G5, screenshots opened and checked).'],
  ['S7', 'Implement stage S7 of the spec (Briefing, Result, docs/01–03, CHANGELOG v0.6.10 complete with 目的・変更点・既知の制約 and a 実機テスト結果 placeholder; iPhone items from the spec; LD12, LD13, LD16 wording; wrap and Result bottom checks).'],
]
const results = {}
let prev = ''
for (const [k, task] of stages) {
  phase(k)
  const r = await agent(`${CTX}\n\nPrevious stages in this run: ${prev || '(none)'}\n\nYOUR STAGE: ${k} (commit message must start with "v0.6.10 ${k}"). ${task}`, { label: `impl:${k}`, phase: k, schema: STAGE })
  results[k] = r
  if (!r || !r.ok) return { stopped: k, results }
  prev += `\n${k} = ${r.commit}: ${r.summary.slice(0, 1800)}`
}
phase('Review')
const reviews = await parallel([
  () => agent(`${CTX}\n\nCommits: ${prev}\n\nYOU ARE REVIEWER code-game. Review git diff 4dc26f8..HEAD (and how it uses S1–S4 code) for real defects, verifying by running things (tests, sim, the repo headless harnesses on a VITE_BASE build). Focus: world vs sim parity and step order; RNG +26/+27/+28; forced leave/hurried salvo from the light (PASS/owner safety, rule A); credit and score; HUD lines that mislead (does the text match what 卯月 can see/do; ring call; tail); §7 performance in the new world/entity code; neutrality of the other 7 missions; harness correctness (would it detect a real difference?). Do not fix. Findings with evidence (ids code-1…); empty list if nothing real.`, { label: 'review:code-game', phase: 'Review', schema: FINDINGS }),
  () => agent(`${CTX}\n\nCommits: ${prev}\n\nYOU ARE REVIEWER docs-ux. Check every number and claim in CHANGELOG v0.6.10, docs/01–03, data sources, Briefing/HUD/Result texts against reality (rerun scripts/landing-sim.ts N 400 × 2 normal and HARD=1, TABLE=1/2/3/4; read the code); user-facing Japanese is short and plain for a phone; the 3 iPhone items are accurate; screenshots of the fan, beam and splashes at W 1280 and 1560 (build with VITE_BASE, use scripts/headless/jp04-probe.mjs, open the PNGs). Do not fix. Findings with evidence (ids docs-1…); empty list if nothing real.`, { label: 'review:docs-ux', phase: 'Review', schema: FINDINGS }),
])
const findings = reviews.filter(Boolean).flatMap((r) => r.findings)
log(`findings: ${findings.length}`)
let verdicts = { verdicts: [] }
let fix = null
if (findings.length > 0) {
  phase('Verify')
  verdicts = await agent(`${CTX}\n\nCommits: ${prev}\n\nVerify each finding independently; try to refute it (default real=false if you cannot reproduce or show it). Concrete evidence.\n\nFINDINGS:\n${JSON.stringify(findings, null, 1)}`, { label: 'verify', phase: 'Verify', schema: VERDICTS })
  const real = (verdicts?.verdicts ?? []).filter((v) => v.real).map((v) => v.id)
  const toFix = findings.filter((f) => real.includes(f.id))
  if (toFix.length > 0) {
    phase('Fix')
    fix = await agent(`${CTX}\n\nCommits: ${prev}\n\nFix these verified findings within the spec (no data value change unless proven necessary and the bands still pass; then rerun the sim twice and update md5s/CHANGELOG). Run all gates. Commit once (message starts with "v0.6.10 F") and push.\n\nFINDINGS:\n${JSON.stringify(toFix, null, 1)}\n\nVERDICTS:\n${JSON.stringify((verdicts?.verdicts ?? []).filter((v) => v.real), null, 1)}`, { label: 'fix', phase: 'Fix', schema: FIX })
  }
}
phase('Final')
const final = await agent(`${CTX}\n\nCommits: ${prev}${fix?.commit ? `\nfix = ${fix.commit}` : ''}\n\nYOU ARE THE FINAL CHECK of HEAD. Run every gate; fix only small mechanical problems (one commit starting "v0.6.10 final", push), report bigger ones. Gates: test/typecheck/lint/build; the 17 old md5s; frozen 20; setup snapshots without -u; landing-sim N 400 × 2 (normal and HARD; TABLE none/1/2/3/4) twice → identical and equal to CHANGELOG, all bands ✓; ALLY_OFF = the 8 S0b md5s; ab-replay of the other missions vs the 6856840 build (primary and both sets) same:true; hud-ab same; noally jp_04 = 6856840 build; world-vs-sim ≥ 10 nights diffSteps 0; sim-only names absent from dist; ≤ 300 lines; git clean. jp_04 headless at W 1560 and 1280, normal and hard: nights showing (a) the east PT lit and leaving / a lit salvo, (b) a 卯月 hit with splashes, (c) the ring call — screenshots opened; 0 page errors; line 2 ≤ 840 px. Report the build label claude/v0.6.10-ally-destroyer@<sha7 of HEAD>, key numbers and screenshot paths.`, { label: 'final', phase: 'Final', schema: FINAL })
return { results, findings, verdicts, fix, final }
