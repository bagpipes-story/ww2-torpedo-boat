export const meta = {
  name: 'v0700-art-cont',
  description: 'v0.7.0 continuation after S0: S1 boats, S2a ships, S2b aircraft, S3a sea/dawn, S3b wakes/splashes/explosions, S3c fire/smoke/searchlight/shore; visual check; review; S4 final; push per stage',
  phases: [
    { title: 'Impl', detail: 'S1, S2a, S2b, S3a, S3b, S3c with gates and push' },
    { title: 'Visual check' },
    { title: 'Final', detail: 'review lenses, S4 fixes, docs, final gates' },
  ],
}
const SP = '/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad'
const P = `${SP}/v0700/plan`
const TRAILER = `End every commit message with exactly these two lines:\nCo-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01FFamytCg2edHr8RBr7eBa7\nNever write a model name or identifier anywhere else (files, data, docs).`
const CTX = `CONTEXT: Repo /home/user/ww2-torpedo-boat (Phaser 3 + TypeScript strict + Vite iPhone PWA "Night Hunters", 13 missions). Branch claude/v0.7.0-art; origin has S0 = d8d121d (version 0.7.0, CHANGELOG v0.7.0 started, CLAUDE.md §2「アート」 updated with U1, config/{boat,ship,aircraft,fx,sea}-art-config skeletons, assets/art-dims, tests/art-inventory (36 texture keys, sizes, origins pinned) and tests/art-rules, headless tools scripts/headless/tex-ab.mjs, art-perf.mjs, art-shots.mjs; the build JS was byte-identical to f5563ab). Read first: CHANGELOG v0.7.0 entry, ${P}/spec-v0700.md (THE spec; review already applied — follow its §3 style guide, §4/§5 per-asset instructions, §5.7 budgets, §6 §7-warnings, §7 stages and gates), ${P}/spec-review-v0700.md, ${P}/user-decisions.md (U1: all art is drawn in code, no image/audio files; the style precedent the user liked is src/assets/evac-terrain-art.ts + config/evac-art-config.ts), baseline screenshots ${SP}/v0700/before/ (INDEX.md).
Rules: CLAUDE.md §7 (textures generated ONCE in Boot via generateTexture or drawn once; keep texture keys, sizes and origins pinned by tests/art-inventory so logic/hitboxes stay identical; no per-frame Graphics.clear/alloc; pooled effects with fixed caps; art jitter only from a fixed seeded generator of its own, never the game RNG streams), §8 (art constants in config/*-art-config; logic values stay in data/*.json), ≤ 300 lines per new/touched src file, src/core Phaser-free, the 20 frozen files untouched, other missions' logic byte-neutral.
Gates for every stage: npm test, npm run typecheck, npm run lint, VITE_BASE=/ww2-torpedo-boat/ npm run build; tests/frozen-files; bash scripts/headless/g2.sh G6=1 ALLY=1 EVAC=1 → OK 37 DIFF 0; setup snapshots never -u; scripts/headless/ab-replay.mjs (all 58 + jp04base 8 + jp03 4, CAM=1) and hud-ab.mjs (base 16 + jp04base 8 + jp03 4) same:true against the f5563ab base site in ${SP}/v0700/base-f5563ab/ (build it from a git worktree if missing; known flake: nodawn/result us_02 last-frame .t under load — rerun alone); tex-ab.mjs as the spec says (texture sizes/origins unchanged; pixels may change); art-perf.mjs within the spec §5.7 budgets vs the S0 baseline numbers in CHANGELOG; 0 page errors. Process: git fetch; if a commit whose message starts with your stage tag is already on origin/claude/v0.7.0-art, report it (ok=true) and stop. One commit per stage, then git push -u origin claude/v0.7.0-art (retry 2/4/8/16 s). Back up uncommitted work every ~30 min to ${SP}/notes70/wip/<stage>/ on branch claude/v0.7.0-notes (git -C ${SP}/notes70 fetch && reset --hard origin/claude/v0.7.0-notes first; remove wip after commit). Scratch under ${SP}/v0700/impl/<stage>/. Add a CHANGELOG v0.7.0 bullet per stage (Japanese, concrete: what is drawn, constants, budgets measured, gates). ${TRAILER}`
const S = { type: 'object', properties: { ok: { type: 'boolean' }, commit: { type: 'string' }, summary: { type: 'string' }, problems: { type: 'array', items: { type: 'string' } } }, required: ['ok', 'commit', 'summary', 'problems'] }

phase('Impl')
const res = {}
let prev = 'S0 d8d121d: inventory tools and skeleton only (no visual change).'
const STAGES = [
  ['S1', 'spec §7.3 S1 — 自艇・僚艇・隼艇（米と日本の艇）: Elco 80/77, T-38, T-14, H-38 and any wingman textures per spec §4.1 (hull, chine, cockpit, tubes, gun tubs; neutral greys so tint still works), damage/sinking look per §3.6'],
  ['S2a', 'spec §7.4 S2a — 敵と米側の艦・大発・米PT・魚雷・味方の艦 per §4.2 (destroyers, transport, barges, enemy US PT, torpedo, Mutsuki, friendly transport/gunboat)'],
  ['S2b', 'spec §7.5 S2b — 機の 8 種と任務ごとの描き直し per §4.3 (the enemy aircraft texture redrawn once at mission start for the mission\'s type)'],
  ['S3a', 'spec §7.6 S3a — 海の面・夜明けの光・月のきらめき・格子の切り替え per §5.1/§5.6; this is the full-screen-layer stage: measure fill cost with art-perf at W 1280/1560 before and after, stay within §5.7'],
  ['S3b', 'spec §7.7 S3b — 航跡・水柱・砲口炎・爆発のプール per §5.2/§5.3 with the pool caps of §5.7'],
  ['S3c', 'spec §7.8 S3c — 炎と煙・探照灯・星弾・煙幕・岸の帯 per §5.4/§5.5/§4.4'],
]
for (const [k, t] of STAGES) {
  const r = await agent(`${CTX}\n\nPrevious: ${prev}\nYOUR STAGE: ${t}. Commit message starts "v0.7.0 ${k}". Use scripts/headless/art-shots.mjs to take screenshots of the affected missions at W 1280 and 1560 (default zoom and lookout, with the asset on screen), OPEN them, compare with ${SP}/v0700/before/, describe honestly what improved and what is still unclear, and iterate until each asset is clearly recognisable at iPhone scale (silhouettes distinguishable: PT vs barge vs destroyer vs transport vs friendly; friend/foe readable). Put the best screenshot paths in the summary.`, { label: `impl:${k}`, phase: 'Impl', schema: S })
  res[k] = r
  if (!r || !r.ok) return { stopped: k, res }
  prev = `${k} ${r.commit}: ${r.summary.slice(0, 1000)}`
}

phase('Visual check')
const vis = await agent(`${CTX}\n\nS0–S3c are committed. TASK (independent visual check, read-only except scratch ${SP}/v0700/impl/vcheck/): build HEAD and run every one of the 13 missions headless (?debug&mission=<id>; normal, plus hard where it differs) at W 1280 and 1560 with action on screen (enemies, gunfire, a torpedo hit/explosion, searchlight, dawn where possible, jp_03 day). Open the screenshots and compare with ${SP}/v0700/before/. Judge as a first-time iPhone player: is every boat/ship/plane recognisable and distinguishable, friend/foe clear, anything too dark/busy/ugly, overlap with HUD/labels, visual bugs (rotation, origin offset, z-order, sinking look, tint lost). Run art-perf and heap vs the base build and report numbers vs spec §5.7. Return blockers/majors with screenshot paths.`, { label: 'visual check', phase: 'Visual check', schema: { type: 'object', properties: { blockers: { type: 'array', items: { type: 'string' } }, notes: { type: 'string' } }, required: ['blockers', 'notes'] } })

phase('Final')
const LENSES = [['code', 'correctness: gameplay byte-neutral (hitboxes, logic sizes, RNG draw counts), §7 per-frame cost, pool caps, texture memory, 300 lines, frozen files, no model names in files'], ['ux', 'readability on iPhone at zoom 0.75/0.5 per light (moon phases, dawn, day), CHANGELOG/docs Japanese wording for a non-engineer, iPhone items ≤ 3, known constraints complete']]
const revs = await parallel(LENSES.map(([k, d]) => () => agent(`${CTX}\n\nS0–S3c committed. TASK (review lens ${k}): ${d}. Read-only. Concrete evidenced findings only (file:line, scenario, fix); none is fine.`, { label: `review:${k}`, phase: 'Final', schema: { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: { severity: { type: 'string' }, where: { type: 'string' }, what: { type: 'string' }, fix: { type: 'string' } }, required: ['severity', 'where', 'what', 'fix'] } } }, required: ['findings'] } })))
const findings = revs.filter(Boolean).flatMap(r => r.findings)
const fin = await agent(`${CTX}\n\nTASK: stage "v0.7.0 S4" (spec §7.9 仕上げ). Verify and fix the visual check's blockers/majors: ${JSON.stringify(vis ? vis.blockers : [])} (notes: ${vis ? vis.notes.slice(0, 3000) : ''}) and the review findings: ${JSON.stringify(findings)}. Report disproved ones with evidence. Then docs: docs/02 (art section), docs/03 (v0.7.0 row done + iPhone items ≤ 3 from spec §8; v0.7.1 synthesized SFX and v0.7.2 synthesized BGM + slow-mo rows as planned), CHANGELOG v0.7.0 complete (目的・変更点・既知の制約 from spec §9・計測・実機テスト結果 placeholder). All gates once more, screenshots opened. Commit "v0.7.0 S4: …", push. Summary must include: build label claude/v0.7.0-art@<7 chars>, the iPhone items (Japanese), known constraints (Japanese, short), perf numbers vs base, and the 3–5 best screenshot paths.`, { label: 'S4 final', phase: 'Final', schema: S })
return { res, vis, findings, fin }
