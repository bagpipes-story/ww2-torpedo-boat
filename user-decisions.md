# v0.6.11 user decisions (binding; 2026-11-04)

User (iPhone, verbatim):
「3隻ごとに隊を組んでいるのであれば、切り替えボタンで操作する隊を変更しつつ、自分で3隻の隊を操作（先頭の一台を自機として残り2台は後ろをついて来させる。自機が機銃を打てば僚機も機銃を撃つ）して待避場所まで各隊を移動させるのはどうでしょうか？
自分が操作していない隊はランダムに回避行動をとりつつ爆撃から逃げる。
それぞれ隊長機を自機とするため、隊長機ごとにHPなどのステータスを持つ必要がありますね。
また、六機残ればクリアということなので空襲らしく敵機の数は増やした方が面白い。ノーマルは 4 波（2×2・3×2・3×2・4×2 編隊）。ハードは×3とする。」

This REPLACES spec-v0611 Q1 (the ［隠れ］［散れ］ order buttons are dropped). Lead interpretation:
- U1 18 boats = 6 groups × 3 (leader + 2 wingmen). The player directly steers the leader of the controlled group; the 2 wingmen follow in column behind it (station keeping, no player input). A 切り替え button (right-edge skill column) cycles control to the next group that still has a boat afloat; the camera and HUD move to that group's leader. If a leader sinks, the next afloat boat of that group becomes its leader (control stays on the group). A group whose boats are all hidden in a shelter can still be selected (to bring it out) but cycling prefers groups outside shelters.
- U2 When the controlled leader fires the gun, its wingmen fire too (same AA rule as today: tiny hit chance; flash reveals hidden boats nearby — keep v0.6.8 rules).
- U3 Groups not under control: if hidden in a shelter they stay hidden; otherwise they take seeded-random evasive action (zig-zag / turns / speed changes, fleeing incoming bomb runs) — they do not go to shelters by themselves. New RNG stream for this (+29 and up are free; +21 reserved).
- U4 Every group leader has its own full status (HP, crew, fire, engine damage, as the player boat today); wingmen may be HP-only. The HUD shows the controlled leader's status. Fuel: not consumed during the 4-minute raid (lead decision, T-38 full speed burns out in ~68 s).
- U5 Waves: normal 4 waves of 4, 6, 6, 8 flights (= 2×2, 3×2, 3×2, 4×2); hard 6, 9, 9, 12 flights (= the base 2·3·3·4 × 3). One flight = the frozen air-strike core's group of ≤ 4 planes (one AirStrikeFlight each, reused). Peak simultaneous planes: normal 32, hard 48. Calibrate wave timing/damage with the sim (do not change the flight counts).
- U6 Clear: at least 6 of 18 boats survive (history 5). End: lead default A of spec §13 Q2 (survivors fixed at 4 min; the controlled group in a shelter ends there, otherwise the existing 4-plane chase until it reaches one).
- Keep from spec-v0611: day Unten-ko map, shelters (caves = historical, Yagaji cover = design) with limited capacity so not all groups fit, 10-s target warning (red ring) if it fits the performance budget, harbor_fire_explosion dropped, day wording instead of 夜明け for jp_03 only, score keys, neutrality of the other 8 missions.
- PERFORMANCE (CLAUDE.md §7, must be designed in, not after): up to 48 planes + bombs + 18 boats + tracers at once. All sprites pooled and from Boot textures; flights/planes pre-allocated for the peak (12 flights); per-frame no allocation; bomb splash checks squared distances over 18 boats only on impact; AA fed only the nearest 8 planes; HUD setText on change only; measure step cost headless at hard wave 4 and record it; iPhone item asks the user to read the FPS counter at hard's last wave.
- Calibration targets (human-like rows primary): normal human-like ~50–70% clear (≥6 survive), hard clearly lower; "stay in place / do nothing" well below; record numbers.
