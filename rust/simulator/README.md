# Rust Simulation Core

The `spaced-penguin-simulator` crate is the behavioral source of truth for deterministic gameplay inside the simulation boundary. New or changed flight, gravity, collision, bonus, target, portal, booster, deflector, crash/reset, enforced-rule, launch, and in-flight counter behavior must be defined here first. The browser's JavaScript fallback must reproduce the Rust result; it does not define competing gameplay semantics.

This behavioral authority is intentionally narrower than the repository's other authorities:

- `domain/gameObjects.schema.json`, `domain/simulation.schema.json`, and `domain/level.schema.json` are the source of truth for declarative vocabulary, defaults, state/event shapes, and ordered wire records.
- `rust/simulator/src/lib.rs` is the source of truth for deterministic transition behavior shared by the live browser, Wasm headless runs, native headless runs, and supported Gravity Sculpt evaluations.
- `js/simulation/simulationEngine.js` is the browser-facing contract, moving-world coordinator, and graceful compatibility fallback. When it duplicates a Rust transition, it must follow Rust.
- `js/simulation/orbitSimulation.js` remains the source of truth for dependency-ordered orbit and waypoint world advancement. Candidate-independent positions are synchronized into or precompiled for the Rust transition.
- Final level/campaign score assembly remains session/replay policy in JavaScript and is outside the Rust step wire; `scoreMultiplier` is explicitly excluded in `domain/simulation.schema.json` for that reason.
- Browser input, Canvas/DOM rendering, Web Audio, messages, and other effects remain outside the Rust core.

If implementations disagree, first rule out wire, time-step, and world-ordering defects. Once the inputs are equivalent, preserve the Rust result and repair the fallback or adapter unless an intentional gameplay change is being made in Rust.

## Execution surfaces

One Rust transition implementation serves four paths:

1. The production browser loads `pkg/spaced_penguin_simulator.wasm`, holds one persistent runtime state handle, synchronizes moving world positions in wire order, and applies a binary `StepPatch` plus typed events each fixed tick.
2. The portable headless backend uses the same Wasm candidate transition with an exact precompiled world timeline.
3. `src/bin/spaced-penguin-headless.rs` exposes the optimized native sweep CLI. Node retains level validation and world-timeline compilation; Rust owns candidate stepping, filtering, near-miss ranking, and capture.
4. `gravity_sculpt.rs` evaluates supported stationary-world optimizer batches. JavaScript owns optimization policy and uses its compatibility evaluator for moving worlds or custom variables not represented by the Rust context.

The important crate paths are:

```text
src/lib.rs                         Runtime handles, authoritative transition, Wasm ABI, candidate simulation
src/gravity_sculpt.rs              Rust-side Gravity Sculpt evaluation
src/native_headless.rs             Native sweep request and result orchestration
src/bin/spaced-penguin-headless.rs Native CLI entry point
../../../generated/rust/           Generated schema models and binary codecs; never hand-edit
pkg/                               Packaged browser Wasm artifact
```

The crate exposes a deliberately small raw WebAssembly ABI, so the same packaged binary can be instantiated directly by a browser or Node without a generated bundler wrapper. Builds write the browser artifact to `pkg/spaced_penguin_simulator.wasm` and the native CLI to `target/release/spaced-penguin-headless` (with `.exe` on Windows).

## Boundary contracts

- Gameplay runs in exact 1/60-second ticks. The display frame rate must not change results.
- Moving positions use this fixed order on both sides of the Wasm boundary: planets, bonuses, portals, speed boosters, deflector bumpers, then target.
- The Rust core emits deterministic state patches and domain events. It must not call DOM, Canvas, audio, timers, storage, or network APIs.
- Every field reachable from step input or output must be encoded in `domain/simulation.schema.json` or explicitly excluded there with a reason.
- Generated wire versions and fingerprints live in `domain/simulation-wire-versions.json`. Never hand-edit generated JavaScript or Rust codecs.
- The packaged Wasm used by the browser must be rebuilt from the same reviewed source and generated contracts; do not treat `pkg/` as editable source.
- Headless optimizations may precompute candidate-independent motion or suppress movement-only events, but they must not fork gameplay rules.

## Changing gameplay behavior

For a transition change:

1. Update the domain schemas first when state, events, object projections, or wire layouts change. Regenerate contracts and perform the required wire-version migration.
2. Implement the intended behavior in the Rust core. Update all Rust state constructors and execution surfaces that reach the transition.
3. Mirror the behavior in `js/simulation/simulationEngine.js` so Wasm initialization failure remains deterministic and usable. Treat this as a compatibility port of Rust semantics.
4. Keep orbit/waypoint advancement and browser effects in their existing JavaScript boundaries; pass normalized positions and consume typed events instead of moving those concerns into the core.
5. Add focused Rust behavior coverage plus Rust/Wasm/JavaScript parity coverage. A parity test proves the fallback agrees; its JavaScript assertion operand does not make JavaScript authoritative.
6. Rebuild both Rust artifacts and run the repository gates.

Use tight tolerances for cross-language floating-point values where square roots, normalization, or platform math can differ at the last bit. Compare event types and identifiers exactly.

## Build and verification

From the repository root:

```powershell
npm.cmd run generate:domain
npm.cmd run check:domain
npm.cmd run build:simulator-native
npm.cmd run build:simulator-wasm
npm.cmd test
```

When `cargo` is available on `PATH`, also run the crate's focused tests directly:

```powershell
cargo test --manifest-path .\rust\simulator\Cargo.toml
```

For a focused headless smoke run:

```powershell
node .\testing\levelTester.js --level .\levels\level10.json --samples 100 --backend wasm
npm.cmd run headless:native -- --level .\levels\level10.json --samples 100
```

The npm build scripts regenerate contracts before compilation and locate the configured Rust toolchain on Windows even when `cargo` is not on `PATH`. CI runs the crate tests, rebuilds the native executable, and rebuilds the exact Wasm artifact exercised and deployed by the browser tests.
