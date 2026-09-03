---
name: architecture-compass
description: Identify this repository's current and intended architecture, including its authoritative Rust gameplay core, then guide a change toward existing boundaries. Use for design reviews, feature placement, refactoring plans, and dependency questions in Spaced Penguin.
---

# Spaced Penguin Architecture Compass

Use this skill to decide where a change belongs and which architectural direction it should reinforce. Do not treat a named pattern as a mandate; classify the repository from evidence and distinguish the current implementation from its documented migration direction.

## Establish the architectural context

Read `AGENTS.md` and the relevant parts of `ARCHITECTURE.md` before making an architecture recommendation. For deterministic gameplay boundaries, also read `rust/simulator/README.md`; for level-format, orbit, or object-graph work, also read `levels/README.md`.

Inspect the proposed change's direct callers, collaborators, and tests. Use imports and executable behavior as the tie-breaker when documentation and code appear to differ. State the evidence behind conclusions, including the modules or documented contracts that establish an ownership boundary.

## Working classification

Describe the project in these terms when they fit the evidence:

- **Deployment shape:** a client-only, static, browser-native ES-module application; it is not a distributed service architecture.
- **Application shape:** a modular monolith. `GameManager` is the browser composition and lifecycle owner; `Game` remains the mutable runtime aggregate and integration hotspot.
- **Gameplay seam:** functional-core / imperative-shell design. The Rust simulator is the behavioral source of truth for deterministic gameplay transitions. `simulationEngine.js` preserves the browser-facing contract and JavaScript fallback, `simulationState.js` normalizes state, `orbitSimulation.js` advances the moving-world graph, and `gameSimulationAdapter.js` translates between the Rust/Wasm boundary, live browser objects, and effects.
- **Edge adapters:** Canvas/DOM rendering, Web Audio, `fetch`, `localStorage`, file download, editor UI, and Node headless tooling are environment-facing concerns. They must not drive authoritative gameplay transitions.
- **Content pipeline:** levels are data-driven JSON. Schema normalization and validation precede runtime mutation; construction uses a two-pass object/orbit resolution process.

Also note the intended direction where relevant: gradually shrink `Game` toward a composition facade by extracting explicit session, runtime-world, rendering, persistence, and browser-effect boundaries. Do not propose a wholesale rewrite or impose a framework merely to match a textbook pattern.

## Place the change

For each proposed feature or refactor, answer briefly:

1. What domain state changes, and must browser and headless execution agree?
2. Which existing boundary owns it: schema/validation, deterministic simulation, browser adapter/effects, runtime aggregate, renderer, editor, persistence/catalog, or composition root?
3. What inputs and outputs cross that boundary? Prefer normalized serializable state and domain events at the simulation boundary.
4. Which existing invariant, test surface, or compatibility contract must remain intact?
5. What is the smallest change that follows the current design, and is a separate extraction actually justified?

Apply these placement rules:

- Gameplay flight, collision, launch, bonuses, targets, enforced rules, and in-flight counters belong first in the authoritative Rust transition. Extend schema-backed state and domain events as needed, mirror Rust semantics in the JavaScript fallback, and translate visual, audio, DOM, timer, and message effects in the browser adapter. Orbit and waypoint world advancement remain in the pure JavaScript world-motion boundary and synchronize positions into Rust. Final level/campaign score assembly remains JavaScript session/replay policy outside the Rust step boundary.
- Shared authored vocabulary, aliases, defaults, and semantic validation belong in `levelSchema.js` and `levelValidation.js`, not in individual loaders, tools, or editor-only code. Validate before clearing or mutating the live world.
- Browser frame scheduling, responsive display mapping, visibility, and input-context assembly belong in `main.js` / `GameManager`. Only that lifecycle owner schedules the recurring animation frame.
- Rendering consumes simulation-applied state and must not independently advance flight or normal orbit physics. Camera and display transforms are presentation concerns, not simulation coordinates.
- Editor changes operate on the live runtime graph; keep its typed and physics collections synchronized and account for loader/export round trips.
- Headless runners reuse the authoritative Rust candidate transition. They may optimize candidate-independent world motion but must not create a second gameplay implementation. A JavaScript headless mode is a fallback/parity surface, not an alternate source of truth.

## Report architecture findings

When asked to identify or review architecture, present:

1. **Current shape:** evidence-based labels and the most important ownership boundaries.
2. **Intended direction:** only documented or clearly evidenced modernization seams.
3. **Fit for the change:** recommended placement, collaborators, and tests.
4. **Risks or boundary violations:** for example duplicate physics, browser effects in deterministic modules, bypassed validation, module cycles, or additional `window` coupling.

Mark uncertainty rather than inventing a pattern. A mixed architecture is normal here: preserve the deterministic core and improve seams incrementally while keeping compatibility behavior stable.
