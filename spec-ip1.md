# v0.6.10 実機 1 回目 — spec (binding)

User (iPhone, verbatim): 「卯月が強すぎてPTが瞬殺される。卯月を弱めたところであまり意味がないので、当初の設計どおり、PTが発射後も去らずに銃撃してくる設計に戻してください。」
Lead asked: keep 卯月? User chose: 「A: 卯月は残し、PT を撃った後も去らない形に戻す」 (A = 卯月 stays with today's values; lit PTs are no longer forced to leave; a lit PT in position may still fire a hurried salvo and then keeps fighting; 卯月 only shoots).

Rules (version stays 0.6.10; commits start "v0.6.10 実機1回目"):
- R1 No salvo kind (calm, hurried, engaged, lit) makes a PT leave. After firing, the PT keeps its phase / goes on with the frozen AI (patrol, contact, chase and strafe the T-38). Data: `us_pt_enemy.torpedo_attack.retreat_after_salvo` false (V11 must accept false; source text explains, quoting the user). Keep 1 salvo per PT, RNG +26 order unchanged.
- R2 `ptLitReact`: in position → hurried salvo (litSalvo flag) and NO leave; otherwise nothing (no LIT_AWAY forced leave, no LE_LIT_AWAY event). Light still targets guns.
- R3 Everything else unchanged (卯月 station/values, rule "離れて戦え" engaged salvo, dawn 160, ring call, S0a).
- Sim: recalibrate bands to the new rule (report full tables normal/hard, both blocks, with and without ally; human rows primary). Bands may move because the user changed the rule; record old→new and why. Hard must stay harder than normal.
- HUD/Result/Briefing/docs: remove or rewrite every text that says the PT leaves after firing or after being lit (「米PT は去る」, 「撃たずに去る」, 「撃てる米PT はもういない」 etc. where now false), Result outcome wording, docs/02 §6.11, docs/03 (v0.6.10 row, iPhone items ≤3), CHANGELOG v0.6.10 実機1回目 part + 実機テスト結果 1 回目 line, CLAUDE.md §2 row 「輸送の護衛（jp_04）」 rewritten to the user's new decision + change-history line.
- Gates: npm test/typecheck/lint/build; scripts/headless/g2.sh (17 old md5s unchanged; ALLY_OFF tables will change — record new); frozen 20; snapshots other than setup-jp04 without -u; scripts/headless ab-replay/hud-ab other missions vs a 6856840 build same; world-vs-sim jp_04 ≥ 10 nights diffSteps 0; jp04-probe 0 page errors, line 2 ≤ 840 px, screenshots opened (a PT strafing after its salvo; 卯月 hit).
