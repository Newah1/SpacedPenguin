# Repository Working Guide

This file is a concise implementation guide for coding agents and contributors. The authoritative design reference is [`ARCHITECTURE.md`](ARCHITECTURE.md); deterministic gameplay work must also follow the Rust-core authority in [`rust/simulator/README.md`](rust/simulator/README.md), and level authors should read [`levels/README.md`](levels/README.md).

## Project

Spaced Penguin is a browser-native JavaScript rewrite of a Shockwave gravity-slingshot game. It runs directly as ES modules with Canvas 2D, Web Audio, JSON levels, and a packaged Rust/Wasm simulator; JavaScript has no application bundling step.

Serve the repository over HTTP because modules, levels, the asset manifest, SVGs, and animation metadata use `fetch`:

```powershell
python -m http.server 8000
```

Open `http://localhost:8000` or select an authored level with `http://localhost:8000/?level=5`.

## Verification commands

From `testing/`:

```powershell
npm.cmd test
node .\levelTester.js --validate-only --level ..\levels\level10.json
node .\levelTester.js --level ..\levels\level10.json --samples 100 --ascii
```

The Node suite uses built-in `node:test`; there are no package dependencies. Root `test_*.html` files are manual browser harnesses, not an automated suite.

## Current architecture

- `js/main.js`: composition root, browser lifecycle, one animation-frame owner, responsive sizing, and input-context updates.
- `js/game.js`: browser-runtime facade and lifecycle coordinator; delegates owned state and workflows to focused collaborators.
- `js/runtime/gameSession.js`: campaign, level, attempt, scoring, rule, and run metadata state.
- `js/runtime/runtimeWorld.js`: entity collections, singleton references, physics membership, and render revision invalidation.
- `js/rendering/gameRenderer.js` and `js/rendering/flightPresentation.js`: render pipeline, draw-order cache, trails, starfield, portals, and alpha-mask visuals.
- `js/input/gameplayController.js`: gameplay pointer, touch, keyboard, and mobile-control behavior.
- `js/runtime/gameEffectsCoordinator.js`: browser-side handling of deterministic simulation events.
- `rust/simulator/src/lib.rs`: behavioral source of truth for deterministic gameplay transitions shared by browser Wasm, Wasm/native headless runs, and supported Gravity Sculpt evaluations.
- `js/simulation/simulationEngine.js`: browser-facing simulation contract, moving-world advancement, deterministic compatibility fallback that must mirror Rust gameplay semantics, and final score helper outside the Rust step boundary.
- `js/runtime/gameSimulationAdapter.js`: browser object snapshots/state application and typed event dispatch to the effects coordinator.
- `js/simulation/orbitSimulation.js`: pure circular, elliptical, figure-8, gravity, and hierarchical orbit advancement.
- `js/simulation/simulationState.js`: normalized serializable simulation state and reset/clone operations.
- `js/simulation/compiledWorldTimeline.js`: exact headless-only cache of candidate-independent world motion.
- `js/runtime/physics.js`: entity registries, trace data, and legacy helper compatibility; it is not the active gameplay integrator.
- `js/levels/levelSchema.js` and `js/levels/levelValidation.js`: shared level vocabulary, normalization, capabilities, and executable diagnostics.
- `js/levels/levelLoader.js`: validated JSON loading and runtime entity construction.
- `testing/headlessEngine.js`: exact trajectory adapter for the Rust transition and JavaScript parity fallback.
- `rust/simulator/src/bin/spaced-penguin-headless.rs`: optimized native sweep executable; the Node adapter retains authored-level validation and compiled-world preparation.
- `js/simulation/gravitySculptor.js` and its worker pool: JavaScript optimization policy with schema-backed batched Rust/Wasm evaluation for stationary candidate worlds and deterministic JavaScript fallback for moving/custom cases.

The Rust core is the source of truth for deterministic gameplay behavior; the schemas remain authoritative for vocabulary and wire layouts. The browser explicitly loads the packaged Rust/Wasm simulator during bootstrap and falls back to a JavaScript compatibility implementation if initialization fails. Each live browser simulation reuses one Rust state handle and a moving-position buffer, receiving generated binary `StepPatch`/event-union results. Headless sweeps use the same Rust candidate-transition function with exact precompiled world frames and movement-only events disabled; batch trajectory envelopes may remain JSON outside the per-frame hot path. Resolve equivalent-input parity disagreements in favor of Rust unless intentionally changing the Rust behavior. Do not introduce separate headless physics.

For large local sweeps, `--backend native` runs the release executable through the same Node level-validation/timeline adapter. Build it with `npm.cmd run build:simulator-native` or use `npm.cmd run headless:native -- --level <path>` to verify/build it on demand.

## Important contracts

1. The logical world is 800 × 600; display scaling must not alter simulation coordinates.
2. `GameManager` owns the only recurring `requestAnimationFrame` chain.
3. Gameplay changes enter through the Rust simulation core first and are then mirrored in the JavaScript fallback. Visual objects must not independently advance flight or orbit physics during normal game frames.
4. Level validation occurs before the current world is cleared or mutated.
5. Shared declarative object vocabulary and defaults belong in `domain/` and its generated contracts; compatibility normalization and semantic validation belong in `levelSchema.js` / `levelValidation.js`, not individual loaders or tools.
6. Object-referenced orbits require unique IDs and an acyclic reference graph. Planets, black holes, and bonuses may be orbit targets; planets, black holes, bonuses, and targets may be orbit sources.
7. Shipped legacy `gravitationalReach: 0` means the effective default reach of 5000. Use `mass: 0` for a planet that exerts no gravity.
8. Preserve zero with nullish defaults where zero is meaningful, including `gravitationalConstant: 0` and `requiredBonuses: 0`.
9. Browser effects—DOM, Canvas drawing, audio, timers, and messages—stay outside the deterministic simulation modules.
10. The level editor mutates canonical `LevelDocument` definitions through commands. The disposable edit/play runtime is a projection and must never be exported back into authored state.
11. Every field reachable from the binary simulation-step input or output must appear in `domain/simulation.schema.json`'s ordered wire records, either encoded or explicitly excluded with a reason. Wire versions and fingerprints live in `domain/simulation-wire-versions.json`; never hand-edit generated codecs.

## Common changes

### Add a game object

Update `domain/gameObjects.schema.json` for vocabulary, defaults, collections, capabilities, straightforward inspector fields, serialization metadata, and gameplay-object simulation projections; regenerate contracts; then update the runtime class and handwritten registry hooks, semantic validation, simulation state if gameplay-relevant, the authoritative Rust behavior, the JavaScript fallback, export paths, tests, and level documentation. Every gameplay-authored property must map to simulation state or have a reasoned exclusion. `GameObjectFactory` should remain generic registry dispatch plus shared orbit configuration.

### Add a rule

Normalize and validate it, add it to `SimulationState.rules`, enforce it first in the Rust core at an explicit transition boundary, mirror it in the JavaScript fallback, translate any effect in the browser adapter, export it, and add browser/headless parity tests. `timeLimit` and `customBehaviors` are currently parsed but not enforced.

### Add an orbit type

Update `levelSchema.js`, pure math in `orbitSimulation.js`, factory/editor/export handling, validation, compiled-timeline parity tests, and `levels/README.md`. JSON custom functions are not supported.

### Add audio

Add the WAV to `assets/audio/`, register it in `assets/manifest.json`, trigger it from a browser-side event/effect handler, and verify graceful missing-audio behavior. Do not call audio from the simulation core.

## Documentation scope

- `ARCHITECTURE.md`: current architecture authority.
- `rust/simulator/README.md`: deterministic gameplay behavior authority and Rust-core development guide.
- `README.md`: current entry point and operations.
- `levels/README.md`: current level contract.
- `LEVEL_EDITOR_DOCUMENTATION.md`: current editor behavior and limitations.
- `SpacedPenguin_Documentation.md` and `ORIGINAL_LEVELS_ANALYSIS.md`: historical Shockwave/reference material, not current runtime design.
