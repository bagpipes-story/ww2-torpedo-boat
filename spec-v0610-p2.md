# spec-v0610 part 2 — 卯月 in the world, HUD, Briefing/Result, ship (rebuilt 2026-11-03)

The container was re-provisioned on 2026-11-03: the original spec (`spec-v0610.md`), plans, review files, the v0.6.9 headless harnesses and all scratch builds were lost. What survives: the branch `claude/v0.6.10-ally-destroyer` on GitHub up to **4dc26f8** (S0a, S0b, S1, S2, S3a, S3b, S4) and its CHANGELOG v0.6.10 entry (≈ 43 KB, very detailed — read it first: it is now the main record of what exists). This file restates the lead decisions and the parts of the spec that S5–S8 need. Where it is silent, follow the code that exists (core/ally-destroyer, core/ally-destroyer-data, config/ally-destroyer-mission-data, config/ally-config, core/landing-sim*, systems/ally-sim-*) and the CHANGELOG.

## Process rules (new, because of repeated container resets)

- **Push after every stage commit**: `git push -u origin claude/v0.6.10-ally-destroyer` (retry 4× with 2/4/8/16 s on network errors). Before starting, `git fetch origin claude/v0.6.10-ally-destroyer` and if a commit whose message starts with your stage tag (e.g. `v0.6.10 S5a`) is already on it, report that commit and stop (the stage is done).
- **Headless harnesses live in the repo**: `scripts/headless/*.mjs` (node ESM, Playwright from the pre-installed `require('playwright')` / `import('playwright')`, Chromium needs no options). Not type-checked (lint = tsc). Each file starts with a short Japanese header comment (what it compares, how to run). They are dev tools; the game never imports them. Rebuild what v0.6.9 had:
  - `ab-replay.mjs`: run the same mission/seed/inputs headless on two built sites (A baseline, B HEAD) with a fake clock and fixed step, record world telemetry per step (boat, enemies, PTs, torpedoes, HUD line texts, end and Result text) and report `same:true/false` with the first differing field. Case sets: `INPUT=primary` (press only the main weapon on a schedule), `INPUT=both` (also the other weapon), `INPUT=none`; options `DAWN=N` (`?dawn=`), `SECS`, `HARD`. The v0.6.9 sets were 58 primary cases (7 missions × normal/hard × default / `DAWN=20` / `NODAWN=1 SECS=200`, + PT runs + Result) and 16 both; rebuild an equivalent set over the 7 other missions (us_01, us_02, us_03, jp_01, jp_02, jp_05, jp_06) and their hard modes.
  - `hud-ab.mjs`: same idea for the HUD objects (text, size, colour, position, origin, alpha, visible) at fixed times, 16 cases over the other missions.
  - `world-vs-sim.mjs`: record the T-38 inputs of a headless jp_04 night, replay them in the sim (`core/landing-sim` with the recorded inputs) and compare step by step (PT phase/position ≤ 1e-6 m, hp, fate, detected, salvos, landing phase/hits/events, ally spotted/lit/target/fates, rng draw counts). Report diffSteps.
  - `jp04-probe.mjs`: play jp_04 headless with simple policies (lure, near, late, hide, home), screenshot at chosen events, report page errors, the widest line-2 text in px, event times.
  - Build a site with `VITE_BASE=/ww2-torpedo-boat/ npm run build` into a folder; baseline sites are built from a `git worktree` of the baseline commit into the scratchpad.
- Baselines: other missions — build of **6856840** (S0b; its other missions equal 6f952fe; S0a deliberately changed the weapon cue/Result text in every mission vs main 5605f1e). jp_04 with the ally off — the same 6856840 build (`?debug&noally` on HEAD must equal it).

## Lead decisions (binding; restated verbatim from the lost spec)

- **LD1 status.** S0b is committed (6856840) and pushed. The answer 「A: jp_04 の夜明けだけ 160 秒でお願いします」 is the user's own words. Baselines: the 8 S0b jp_04 landing-sim md5s in CHANGELOG v0.6.10 S0b (d5dce87f / 719749a2 / 6ed9e1df / 03cc68ed, HARD fc31de21 / b1e245a5 / 011274fd / 54fe5cc8).
- **LD2.** 卯月 cannot be sunk in v0.6.10 (PT shells/torpedoes pass through, the air raid ignores her). A sinkable 卯月 is a docs/03 candidate.
- **LD3.** The dawn ring call is ON (`ring_call_before_dawn` true) with the text 「夜明け近し ・ 帰投の輪で揚陸を待て あと N 秒」 — never 「卯月に任せて」 (卯月 cannot see the north/north-east PTs). (The sim side is done in S3b.) With it off the old text/behaviour return.
- **LD4.** Normal-line tail 「・ 走らせれば卯月が照らす」 only where it fits ≤ 840 px (normal); no tail in hard. Briefing must not claim 卯月 watches creeping PTs (e.g. 「卯月は走る米PT を照らして撃つ」).
- **LD5.** The lit salvo shares only the distance + bow test with the contact-hurried salvo (done in S2).
- **LD7.** The Mutsuki record has its own reader (done in S1).
- **LD8.** `fateVisual` is visual-only; the ally credit uses its own setter so `FATE_BY_ALLY` is never overwritten by PtSquadron's `onFate`. `FATE_BY_ALLY` lives next to `FATE_BY_PLAYER` / `FATE_BY_GUNBOAT` (constant done in S2).
- **LD10.** Chase fire follows only `PT_LEAVE` targets (done in S2).
- **LD12.** History text: 「卯月が撃ち返した記録は見つからない（ゲーム上の想定）」 and keep 「日本の魚雷艇がレイテにいた記録は見つからない」. CLAUDE.md §2 is NOT changed in this version (no new "decided" facts the user has not confirmed).
- **LD13.** iPhone item 1 tells the user the splashes may be off-screen and the 見張り button widens the view.
- **LD15 performance (§7).** Fan and beam are textures generated once (Boot) and rotated/positioned sprites; tracers/splashes pooled; no per-frame Graphics.clear, allocation or unchanged setText.
- **LD16 station.** (3620, 2380), north-east of the transport (727 m at bearing ≈ 58°), fan 50°–180°, `lookout_slow_m` 350. Texts say 卯月 is 「輸送船の北東」. Known constraint: the hard north-east PT's creeping calm-salvo point is 221–314 m north of 卯月, outside her fan, so she does not see it.

## Rules already implemented (S2/S3; do not change)

R-U1 stopped at the station, not a target, cannot be sunk. R-U2 lookout seed+27 (one draw per candidate per step; fast ≥ 15 kt: 800 m / 0.4 s⁻¹; slow: 350 m / 0.3 s⁻¹; the fan gates only the first spotting). R-U3 target and light (keep, nearest spotted live, chase a PT_LEAVE target 2.5 s; real `core/gunnery.updateIllumination`, cone 12°, on-delay 1.5 s, sweep 20°/s, no starshell). R-U4 guns seed+28 (`updateGuns`, 2 draws per shell, 1 per live hit, frozen `hitPt`; 12 cm hit always ends the attack, 10% sinks). R-U5 lit reaction after 1.0 s (`ptLitReact`: PASS waits; in position → hurried salvo with `litSalvo` → LE_LIT_SALVO 10; otherwise leave → LE_LIT_AWAY 11). R-U6 step order: `link.nowS` → `stepPtTorpedoes` → **`stepAllyDestroyer`** → enemy torpedo pool → `tickLanding` (world inside `WorldLanding.stepAfterPts`, the same as the sim). R-U8 credit (GunboatCredit shape, FATE_BY_ALLY 3). R-U9 ring call (LD3). R-U10 dawn: PTs leave at the frozen dawn latch; 卯月 keeps watch; the air raid targets only the T-38.

## Stages (each: npm test, typecheck, lint, build green; the 17 old sim md5s OK 17 DIFF 0 via a g2 script you rebuild from CHANGELOG v0.6.9/v0.6.10 (`scripts/pt-pass-sim.ts`, `convoy-sim.ts`, `dawn-strike-sim.ts`, `patrol-air-sim.ts` with the env sets and md5s listed there — put it in `scripts/headless/g2.sh` too); frozen-files; setup snapshots except setup-jp04 without -u; G6 `ALLY_OFF=1` jp_04 landing-sim = the 8 S0b md5s; commit, push)

- **S5a world core**: `systems/world-ally` (creates the +27/+28 RNGs outside world-landing; calls `stepAllyDestroyer` at the R-U6 position inside `WorldLanding.stepAfterPts`), `entities/ally-destroyer` (sprite in the ally colour like the transport, label 「卯月」, the fan wedge at low alpha clipped off the island, the searchlight beam sprite rotated to the target, pooled tracers and splashes), Boot textures and keys, world-visuals and destroy order, `?debug&noally` path. Build the harnesses (`scripts/headless/`), the baseline site of 6856840, and run **G7 world-vs-sim**: ≥ 10 jp_04 nights (normal and hard, including lit salvo / lit-away / a 卯月 hit if found within 40 nights) with 0 differing steps. jp_04 headless smoke 0 page errors.
- **S5b squadron and telemetry**: PtSquadron lit mask (a lit PT is drawn even beyond the T-38's 900 m sight) and visual-only fate arrow (LD8), the ally credit setter, pt-telemetry credit lines, score like 隼艇 (section totals). **G6w**: HEAD `?debug&noally` jp_04 equals the 6856840 build (ab-replay ≥ 8 nights normal and hard, hud-ab). **G4/G5** other missions vs 6856840. jp_04 headless 24 nights at W 1560 and 1280 normal and hard, 0 page errors; heap over 120 s levelling off near the v0.6.9 profile (≈ 9.2 MB).
- **S6 HUD**: `t.ally` telemetry; `ui/ally-lines` (lit salvo / lit-away / 卯月 hit-sink events; the gun-event name 「卯月」 in `ui/pt-lines`); LD4 tail; LD3 ring call in `dawn-lines`; pt-line-clock weights; all lines ≤ 840 px; keys distinct. G5 for the other missions; jp_04 longest line ≤ 840 px; fan/beam screenshots at W 1280 and 1560 opened and looked at (raise the fan alpha in config only if invisible).
- **S7 Briefing, Result, docs**: Briefing (data texts; 卯月 in 輸送船の北東; LD4/LD12 wording; real headless wrap within its lines at W 1280/1560), Result (`ui/ally-result` + `landing-result`: 卯月's lit / driven off / sunk counts; body bottom ≤ 592), docs/01 §8 (卯月 armament 1944-08-31, Type 13 air radar only, Shigure 2,000 m, LD12), docs/02 §6.11, docs/03 (v0.6.10 row done, iPhone items, candidates incl. sinkable 卯月), CHANGELOG v0.6.10 (目的・変更点・既知の制約・実機テスト結果 placeholder).
- **S8** review (code-game, docs-ux), verify, fix, final gates (all of the above + G8 sim-only names absent from dist + G9 ≤ 300 lines), then the lead pushes, marks PR #34 ready and reports.

## iPhone items (docs/03; ≤ 3)

1. ノーマルで北の米PT を引きつけると、東の米PT が走り出して卯月（輸送船の北東。海の薄い扇が見張りの範囲）に照らされ、去るか撃たずに去るか。砲の水柱は画面の外のこともある（見張りのボタンで遠くまで見える）。
2. 「夜明け近し ・ 帰投の輪で揚陸を待て」が出たら輪へ戻って待ち、揚陸完了でそのまま終われるか。ノーマルで何回中何回クリアしたかを一言（模擬: 人に近い遊び方で 5 夜に 4 夜、PT へ割って入る遊び方で 3 夜に 2 夜）。
3. どの任務でも、魚雷を撃っても「PTの下を抜けた」「大発の下を抜けた」が出ず、機を撃っても「まず当たらない」が出ないか。

## Known constraints to keep in the CHANGELOG (from S1–S4 and the lost review)

Thin hard ladder margin (−8.6 vs ≤ −8); slow lookout inert at this station; NE PT outside the fan; the ring call makes most normal nights end before dawn (home before dawn ≈ 100% normal, 73–90% hard) — it is a hint, ignoring it means returning under the air raid; 卯月 cannot be sunk; torpedoes and PT shells pass through her; the air raid ignores her.
