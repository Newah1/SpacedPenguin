# Rust/Wasm simulator core

This crate contains the deterministic flight, gravity, collision, bonus,
portal, speed-booster, target, crash/reset, and rule transitions used by the
browser and the batched Node headless backend. The existing deterministic
orbit/waypoint graph remains the source of world motion in both environments;
headless execution uploads its compiled candidate-independent positions once
when a Wasm simulator is created.

The browser explicitly loads the packaged module during bootstrap. It keeps one
persistent Rust runtime state handle for each live simulation, updates moving
world positions through a reusable `Float64Array` buffer, and falls back to the
JavaScript transition kernel if Wasm initialization fails. The headless runner
uses the same Rust candidate-transition function; its batch trajectory result
envelopes may remain JSON because they are outside the per-frame hot path.

Serializable Rust object/state/event models are generated from the canonical
schemas in `domain/` and included from `generated/rust/`. Do not edit those Rust
files directly. `npm run generate:domain` regenerates them and
`npm run check:domain` verifies repository parity. Browser step input uses the
versioned generated binary wire codecs for both the step input and the
`StepPatch`/event-union output. Their ordered records are declared by
`x-spaced-penguin-wire` in `domain/simulation.schema.json`; adding a reachable
field requires either a wire entry or an explicit exclusion reason. The same
declaration generates both JavaScript and Rust sides, with versions and
fingerprints recorded in `domain/simulation-wire-versions.json`. Batch
initialization and trajectory result envelopes retain JSON where they are
outside the per-frame hot path.

Build both targets from the repository root:

```powershell
npm.cmd run build:simulator-wasm
npm.cmd run build:simulator-native
```

The generated static artifact is written to
`rust/simulator/pkg/spaced_penguin_simulator.wasm`. It has a deliberately small
raw WebAssembly ABI so the same binary can be instantiated by Node or a browser
without a generated bundler wrapper.

The native release executable is written to
`rust/simulator/target/release/spaced-penguin-headless.exe` on Windows and
`rust/simulator/target/release/spaced-penguin-headless` on Unix. The supported
authored-level facade validates and normalizes JSON, compiles the exact shared
world timeline, and sends one sweep request to that executable:

```powershell
npm.cmd run headless:native -- --level .\levels\level10.json --samples 10000 --max-time 5
```

The executable itself accepts a prepared request on stdin or through
`--request`, and prints protocol help with `--help`. Candidate simulation,
success filtering, near-miss ranking, and detailed trajectory capture all run
inside native Rust; it reuses the same `Simulator::simulate` and
`step_candidate` implementation as Wasm.
