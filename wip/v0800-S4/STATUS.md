# v0.8.0 S4 wip（implementer）
- 17:52 UTC: first working piece — telemetry (radar blips/from/boat/width/eastJa, strait eye+bow-on), radar/strait 2nd-line events via ui/strait-line-clock in pt-line-clock chain, modes 39/40, green edge marker (ui/radar-marker*), Briefing (radar tail, 西と北西, hard ×5), Result lines (radar/strait) + unseen-shot hooks (torpedo-free/torpedo-hits → world-radar). Headless trace OK (first/new/Vila/return/3rd line). Tests: pins updated (radar, radar-world, radar-neutral, mission-line-keys). New tests not yet written.
- Base HEAD e8be5eb. Apply: git apply S4.patch
