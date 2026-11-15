# v0.8.0 S2 — implementer notes (WIP; restore with `git apply wip/v0800-S2/s2.patch` on 67299e7)

## Design (decided)
- Column ships are `Destroyer`s inside `DestroyerGroup.ships`, after the cover(s) (`ds.starts`), before any transport.
  `destroyerCount` includes them. Group ctor gets `transit: TransitSetup | null` as 4th arg (after transport) —
  keeps tests/ship-art pin `splashes, shipArtKey(mission.enemyId)) : null;` (texture key stays the last arg).
- world-enemies hit handlers: `i < ds.starts.length ? ds.gunnery : transport.gunnery` -> `i < destroyers.destroyerCount ? ...`
  (same value for existing missions; column ships would otherwise read transport!.gunnery = crash).
- `Destroyer`: new `offMap` (WAIT/AWAY) folded into `out`; `transitShip` flag skips the built-in retire withdrawal
  (must-fix: 118 m < goneX 150 m). `goAway(gone)`: AWAY -> offMap, GONE -> withdrawn (counts as 退いた), hide sprite,
  sighted=false, reset AI contact (playerDetected/hold/wake). `reappear(x,y,h,v)`: place, offMap=false, refreshHull.
- `systems/destroyer-transit.ts` `DestroyerTransit` (Phaser-free, structural TransitShip): owns ShipTransitState,
  step(w, feelDt) right after the ship move loop in destroyer-step; entered/returned -> reappear + startRetire(leg heading);
  arrived -> goAway(false); gone -> goAway(true); coverLeaves -> startRetire(cover, outbound heading 270);
  returns true if any ship left (arrived|gone) so destroyer-step's `left && g.allOut` clears the salvo queue.
  allOut/allSettled: pending===0 && every ship out (offMap counts once pending is 0 = after dawn).
- DestroyerGroup: `transit` field; allOut/allSettled branch on `this.transit` (existing missions keep allShipsOut/Settled);
  `pendingReturns` getter. destroyer-step gates `remainingTorpedoesSettled` with `g.pendingReturns === 0`.
- Radar: `systems/world-radar.ts` (Phaser-free `WorldRadar`: state, targets, geo; step(w) only when sweep due; fills group ships,
  kind SHIP, afloat = !out), `systems/radar-view.ts` (Phaser: 16 Images, positions on sweep change, alpha 10 steps on change;
  exports `buildRadar(scene, w)` and re-exports type WorldRadar so mission-world adds ONE import line),
  `assets/radar-art.ts` (ring texture on first use), `config/radar-art-config.ts`.
  mission-world: +import +field +create (= 286). Radar step = last line of stepEnemySide (world-enemy-step 27->28).
  world-visuals: radar updateVisuals/destroy before art lines (update tests/world-visuals pins).
- Shores art: `assets/coast-shape.ts` gets pure `coastLines(setup)` (existing 2 lines unchanged, + shores spans);
  coast-fx iterates it. `systems/strait-terrain.ts` (land fills + 5 labels) owned by WorldArt. `config/strait-art-config.ts`.
- Telemetry: types in core/boat-telemetry (RadarTelemetry, TransitTelemetry); systems/radar-telemetry.ts,
  systems/transit-telemetry.ts (init + refresh; null check for other missions). No HUD text.
- debug: `DEBUG_RADAR_OFF` (?debug&noradar) in game-config + debug-setup radarOff.
- Headless: ab-replay NORADAR=1 (B gets &noradar, radar excluded from snapshot), SET=us04 (normal/hard x seed 1,2 x 260 s),
  snapshot adds `tr` (transit phases) and `rd` (radar sweeps/n/blips) only when present.
- Tests: radar-world, transit-world (incl. L11 slow-mo order/lanes), radar-neutral, strait-art; update radar.test pin.

## Progress log
- (start) design written, no code yet.
- step 1: src wiring done (destroyer, destroyer-transit, group, world-enemies, destroyer-step, radar x4, mission-world 286, world-enemy-step, world-visuals, debug noradar, coast-shape coastLines, coast-fx, strait-terrain, world-art, telemetry x2). typecheck OK. Next: npm test, new tests, headless.
- step 2: tests added and passing alone: transit-world (12), radar-world (7), radar-neutral (12), strait-art (7); pins updated: radar.test (importers), world-visuals (radar lines). Full suite before new tests: 3 pin fails only (fixed).
  Mutation check: world-radar write `b.x =` is caught by radar-neutral. Next: ab-replay NORADAR/us04, gates, screenshots, perf, CHANGELOG.
- step 3: ab-replay NORADAR/us04 added; NORADAR us04: 3/4 same, hard s1 last-frame .t flake -> JOBS=1 rerun same x2; hud-ab us04 NORADAR 4/4; us04 A=B 4/4.
  Screenshots in impl/S2-shots (noplane set + shore set). CHANGELOG S2 block written. run-gates S2-impl running (build/typecheck/lint/test 3743 OK so far).
