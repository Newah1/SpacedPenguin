# Repository Working Guide

This file is a concise implementation guide for coding agents and contributors. The authoritative design reference is [`ARCHITECTURE.md`](ARCHITECTURE.md); level authors should also read [`levels/README.md`](levels/README.md).

## Project

Spaced Penguin is a browser-native JavaScript rewrite of a Shockwave gravity-slingshot game. It runs directly as ES modules with Canvas 2D, Web Audio, JSON levels, and no application build step.

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
- `js/game.js`: live runtime aggregate, attempt/level transitions, rendering, UI coordination, editor integration, and effects.
- `js/simulationEngine.js`: authoritative deterministic gameplay transitions, launch math, collisions, bonuses, target outcomes, rules, and scoring.
- `js/gameSimulationAdapter.js`: browser object snapshots/state application and translation of domain events into sound, animation, messages, and scoring flow.
- `js/orbitSimulation.js`: pure circular, elliptical, figure-8, gravity, and hierarchical orbit advancement.
- `js/simulationState.js`: normalized serializable simulation state and reset/clone operations.
- `js/compiledWorldTimeline.js`: exact headless-only cache of candidate-independent world motion.
- `js/physics.js`: entity registries, trace data, and legacy helper compatibility; it is not the active gameplay integrator.
- `js/levelSchema.js` and `js/levelValidation.js`: shared level vocabulary, normalization, capabilities, and executable diagnostics.
- `js/levelLoader.js`: validated JSON loading and runtime entity construction.
- `testing/headlessEngine.js`: exact trajectory runner over the shared transition kernel.

The browser calls the immutable `stepSimulation()` API. Headless sweeps use the same mutable transition kernel with exact precompiled world frames and movement-only events disabled. Do not introduce separate headless physics.

## Important contracts

1. The logical world is 800 × 600; display scaling must not alter simulation coordinates.
2. `GameManager` owns the only recurring `requestAnimationFrame` chain.
3. Gameplay changes enter through the shared simulation kernel. Visual objects must not independently advance flight or orbit physics during normal game frames.
4. Level validation occurs before the current world is cleared or mutated.
5. Shared object/orbit vocabulary belongs in `levelSchema.js`, not in individual loaders or tools.
6. Object-referenced orbits require unique IDs and an acyclic reference graph. Only planets and bonuses may be orbit targets; planet, bonus, and target objects may be orbit sources.
7. Shipped legacy `gravitationalReach: 0` means the effective default reach of 5000. Use `mass: 0` for a planet that exerts no gravity.
8. Preserve zero with nullish defaults where zero is meaningful, including `gravitationalConstant: 0` and `requiredBonuses: 0`.
9. Browser effects—DOM, Canvas drawing, audio, timers, and messages—stay outside the deterministic simulation modules.
10. The level editor mutates the live runtime graph. Export after play mode can contain mutated positions and orbit state and must be reviewed.

## Common changes

### Add a game object

Update the runtime class, `GameObjectFactory`, shared type vocabulary/validation, simulation state if gameplay-relevant, editor creation/property/clone/export paths, collection registration, tests, and level documentation.

### Add a rule

Normalize and validate it, add it to `SimulationState.rules`, enforce it at an explicit transition boundary, translate any effect in the browser adapter, export it, and add browser/headless parity tests. `timeLimit` and `customBehaviors` are currently parsed but not enforced.

### Add an orbit type

Update `levelSchema.js`, pure math in `orbitSimulation.js`, factory/editor/export handling, validation, compiled-timeline parity tests, and `levels/README.md`. JSON custom functions are not supported.

### Add audio

Add the WAV to `assets/audio/`, register it in `assets/manifest.json`, trigger it from a browser-side event/effect handler, and verify graceful missing-audio behavior. Do not call audio from the simulation core.

## Documentation scope

- `ARCHITECTURE.md`: current architecture authority.
- `README.md`: current entry point and operations.
- `levels/README.md`: current level contract.
- `LEVEL_EDITOR_DOCUMENTATION.md`: current editor behavior and limitations.
- `SpacedPenguin_Documentation.md` and `ORIGINAL_LEVELS_ANALYSIS.md`: historical Shockwave/reference material, not current runtime design.
