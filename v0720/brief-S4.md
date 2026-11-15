# v0.7.2 S4 brief (lead → implementer) — 仕上げ

Branch `claude/v0.7.2-bgm`, HEAD d453ac4 (S0–S3, IP1, IP2 committed and pushed, PR #38). You work on top and do NOT commit; the lead runs the final gates, commits and pushes.

## User decisions so far (verbatim, for the docs)
- U-M1 (2026-11-14): 「メニュー＋任務中も静かに（推奨）」
- 実機 1 回目 (2026-11-14): 「タイトルの曲はAでもよいのですが、もっとアップテンポでもいいかと思います。軍艦マーチくらいの。ちなみにBはファミコンのRPGみたいでださいです。また、緊張と戦闘の音楽はおなじでは？」
- U-M2 / U-S1 (2026-11-14): 「タイトルはDでいきます。Dをさらに名曲となるようにリメイクしてください。命中スローはAでいいです。」
- 実機 3 回目 (2026-11-15, after hearing the remade D in the lab): 「OKです。進めてください」 — the remade D is accepted; the lead had told the user that the unused v0.7.1 audition variants of the torpedo launch sound would be removed in S4 to bring the bundle back under the gate, and the user answered OK.

## Tasks
1. **Bundle back under the gate.** v0.7.2 is +21.30 kB gzip vs main 35e9e77 (gate +20 kB, spec §8.3). Remove audition-only code that no longer serves a decision:
   - v0.7.1 torpedo-launch variants other than the game's F (`assets/sfx-recipes-launch2`: A–E, G–I) and reload variants other than the game's B, if they are lab-only. The game's samples must stay bit-identical (the v0.7.1 fingerprint tests must pass unchanged for every game key).
   - `title_d_prev` (「D（前）」) — the user accepted the new D, so the comparison is no longer needed; lab row 0 becomes ［D（今）］［止める］ (layout and heading updated, heading test still passing).
   - Adjust the v0.7.1 sound lab (`scenes/sound-lab-scene`, `ui/sound-lab-layout`, `config/sound-lab-config`, `assets/sfx-variants`) so it still works with what remains (rows for removed variants go away or show only the chosen sound — choose the simplest that keeps the page useful; keep the music-lab ⇄ sound-lab buttons).
   - Report the bundle gzip before/after and the final v0.7.2 delta vs main 35e9e77 (target ≤ +20 kB). If it is still over, report what else could go and stop there (do not cut game features).
2. **Docs** (Japanese, project style, concise but complete — 3 months later readable):
   - `CLAUDE.md`: §2「アート」 row — add v0.7.2: synthesized BGM (no audio files), U-M1 (menus + quiet mission music with quiet/tense/battle chosen only from HUD-shown states, alarm duck), title theme D (U-M2, remade in IP2), hit slow-mo bed treatment A (U-S1), constants in `config/sfx-music-config` (presentation, not game strength), music follows art and HUD (no leaks). §4 tree — add `assets/sfx-music-*` (synth/compose/plan/arrange/theory/render/themes/score), `core/sfx-music-mood`, `systems/sfx-music-player`・`-slots`・`-duck`・`-build`・`sfx-slowmo`・`sfx-watchdog`・`sfx-lab-demo`, `scenes/music-lab-scene`. §7 — add or extend a row only if a new rule matters for future work (e.g. "曲は Boot で作らない・1 フレームに決まった量で作る・音源は running の時だけ"). Change history line: `2026-11-15 v0.7.2 …`.
   - `docs/02`: §4 (Title「曲」 button next to「音」, Pause「曲」 above「音」, `?sfxlab` opens the music lab) and §7.1 a 「BGM」 subsection (menu/mission/Result behaviour, moods and holds, ducking keys with which are user decisions vs design defaults, slow-mo A, lab).
   - `docs/03`: v0.7.2 row — S0〜S4 済み, the 実機 rounds (1: title faster/B rejected/tense=battle → IP1; 2: D chosen, remake requested, slow-mo A → IP2; 3: remade D OK), final iPhone items (3): ① タイトル・出撃準備・結果で新しい D が流れ、任務では見つかると緊張・撃たれると戦闘に変わり、警報で曲が下がるのが分かるか ② 魚雷の命中・撃沈の瞬間に周りの音がこもって 1 秒ほどで戻るか・一時停止と「曲: オン／オフ」が効くか ③ 全体の音のバランスと重さ（FPS・カクつき）で気になる所が無いか.
   - `CHANGELOG.md` v0.7.2: an `S4` block (cleanup, docs, numbers) ending with `    - 門: （lead が別に回した run-gates の結果をここに足す）`; make the entry's top summary (目的・Done・decisions) reflect the final state (U-M1, U-M2, U-S1 as user decisions; the remaining design defaults: pause stops music, Result plays the title theme after the bell, the non-alarm duck keys); update 既知の制約 into a final consolidated list (keep stage-specific ones only if still true; mark resolved ones); 実機テスト結果 line with rounds 1–3 and the user's words.
3. **Checks you run** (after `pgrep -f run-gates.sh` shows the lead's IP2 gate run has finished; do docs first): npm test, both typechecks, lint, build, the reduced run-gates in three audio states, sfx-music-live, the v0.7.1 sound-lab tests, bundle numbers.

## Must not change
Gameplay and HUD, the game's 26 SFX samples, the music (new D, mission family, moods, ducking, slow-mo A), hud-scene, briefing-scene, mission-scene, mission-world, world-visuals, mission-effects, frozen files, core logic, data, `TEXTURE_KEYS`. CLAUDE.md §7 rules, ≤ 300 lines per file. No model identifiers. No Math.random.

## Deliverables (working tree uncommitted)
WIP backup to `scratchpad/notes70` `wip/v0720-S4/` (branch `claude/v0.7.0-notes`, 503 backoff). Hand-back: files changed, bundle numbers, what was removed, doc summary, checks, open risks.
