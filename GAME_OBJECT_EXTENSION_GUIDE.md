# Game Object Extension Guide

**Status:** Current implementation guide and architecture review

**Last verified:** 2026-08-29 against the repository source

This guide describes the actual path for adding a level-authored game object. Declarative contracts originate in `domain/gameObjects.schema.json` and generate the JavaScript descriptors consumed by the registry, editor, validation, membership, and serialization paths. Handwritten runtime construction and exceptional behavior remain in `gameObjectRegistry.js`. Gameplay semantics remain explicit in the deterministic simulation kernel, with its state and JS-to-Wasm input/output layouts declared in `domain/simulation.schema.json`. The browser explicitly loads the packaged Wasm module, keeps one persistent Rust state handle with a reusable moving-position buffer, and consumes the generated versioned binary `StepPatch`/event-union output; if initialization fails, the JavaScript transition kernel is the browser fallback.

## First classify the object

The amount of integration depends on behavior, not appearance.

| Kind | Examples | Required integration |
|---|---|---|
| Visual-only | `TextObject`, `PointingArrow` | Runtime class, object-schema entry, generated inspector/serialization metadata, handwritten registry hooks, validation/tests/docs |
| Orbiting visual | A decoration that follows another object | Visual-only path plus orbit source/target capability and serializable orbit state |
| Gameplay participant | `Planet`, `Bonus`, `Portal` | All above plus deterministic simulation state, transition logic, browser state application/events, reset/clone behavior, and browser/headless parity tests |
| Singleton/controller | `Target`, `Slingshot` | All relevant behavior plus singleton ownership, fallback creation, position synchronization, and lifecycle rules |
| Editor group | Portal pair | Registry-hook-owned multi-definition create/clone behavior and a deletion strategy when references must be repaired atomically |

Extending `GameObject` is appropriate for a drawable runtime entity, but inheritance alone does not register level-format or gameplay semantics. A gameplay object must have a plain-data representation in the deterministic simulation; the visual class must not independently advance authoritative physics.

## Current end-to-end process

### 1. Implement the runtime class

Add a class in `js/runtime/entities/gameObjects.js` or a focused module (as `BlackHole` does). A normal visual entity extends `GameObject` and supplies its rendering and non-authoritative animation behavior.

- Keep position in the representation expected by `GameObject` and the browser adapter.
- Accept dependencies such as the shared `AssetLoader`; do not create per-object audio or browser services.
- Do not advance flight, collisions, gameplay outcomes, or normal-frame orbit physics in the class.
- Add required image/audio files to `assets/manifest.json` and preserve graceful visual/audio fallback behavior.

### 2. Define the declarative contract in the object schema

Add one entry to `x-spaced-penguin-objects` in `domain/gameObjects.schema.json`. This is the source of truth for:

- canonical type, class name, label, and intentional compatibility aliases;
- properties, authored defaults, basic constraints, and straightforward `x-editor` metadata;
- capabilities such as editability, gameplay participation, orbit membership, and waypoint support;
- typed collections, singleton/level-role ownership, and physics membership hook names;
- serialized property names and relationship-validator selection;
- the explicit `x-spaced-penguin-level-defaults` compatibility view, when one is required.

Do not copy generated defaults into `gameConfig.js` or the registry. The full object contract and the narrower public `LEVEL_DEFAULTS` view are generated from the schema. Preserve meaningful `0`, `false`, and intentional `null` values with nullish handling.

Run from the repository root:

```powershell
npm.cmd run generate:domain
npm.cmd run check:domain
```

Never hand-edit files under `generated/`.

### 3. Compose the runtime class and handwritten hooks

Export a class from one of the modules composed by `js/runtime/runtimeConstructorCatalog.js`. Classes exported from `gameObjects.js`, `blackHole.js`, or `penguin.js` are discovered automatically. If a focused new module is appropriate, add that module once to the composition list; there is no per-class constructor map and `LevelLoader` does not import concrete object classes.

Add or extend the matching base entry in `js/runtime/gameObjectRegistry.js`. Generated contracts are composed with these handwritten hooks. The registry owns:

- `createRuntime`: complete runtime construction from normalized position/properties;
- `createAuthoringDefinitions`: canonical definition(s) created by the editor;
- exceptional normalization and type-specific validation hooks that cannot be expressed declaratively;
- group creation/clone behavior and transient property hooks;
- runtime construction and authoring factories.

Collections, physics hook names, singleton ownership, capabilities, inspector metadata, and serialization allowlists come from the generated contract. Do not duplicate them in the handwritten base entry.

`GameObjectFactory` should remain generic dispatch plus shared orbit configuration. Do not add a new type switch there.

### 4. Validate the authored contract

Put basic field types, ranges, enums, constants, and defaults in `domain/gameObjects.schema.json`. Add handwritten checks to `js/levels/levelValidation.js` only for semantic or cross-object correctness that JSON Schema cannot express, such as uniqueness, reference validity, and graph cycles. Validation must finish before runtime mutation. Add examples/property documentation to `levels/README.md`.

Type-specific property validation is a descriptor hook. Cross-object algorithms such as unique IDs and orbit-cycle detection remain centralized; relationship-specific validation is selected by the descriptor.

### 5. Integrate runtime ownership

Every instantiated entity belongs in `game.gameObjects`. If it needs a typed collection, physics registration, or singleton reference, those must also remain synchronized on load, editor add/replace/delete, and level clear.

Both normal loading and editor mutation use `RuntimeObjectMembership`, which reads `collections`, `physicsAdd`, `physicsRemove`, and `singleton` from the registry. Level reset derives its managed collections and singletons from exportable descriptors.

If the object can be an orbit target, ensure it is inserted in the ID lookup before the second-pass orbit application. Object-reference graphs must remain uniquely identified and acyclic.

### 6. Add deterministic gameplay support when needed

Skip this section only for presentation-only entities.

- Add the normalized plain-data object/state shape to `domain/simulation.schema.json` and regenerate the Rust/JavaScript contracts.
- Add every new field reachable from `SimulationStepInput` to the ordered `x-spaced-penguin-wire.records` layout. Encode it in the required byte order or explicitly exclude it with a non-empty reason. Adding an uncovered reachable field intentionally fails generation.
- Add every new `StepPatch` or simulation-event field to the ordered output wire layout as well; the generated binary output codec and event union are part of the same declarative contract.
- Ensure every gameplay-authored property has a simulation projection mapping or a non-empty reasoned exclusion in `domain/gameObjects.schema.json`.
- Add the normalized level-to-state projection in `createSimulationStateFromLevel` in `js/simulation/simulationState.js`.
- Clone and reset that shape explicitly in `cloneSimulationState` and `resetSimulationAttempt`.
- Capture and apply its live representation in `js/runtime/gameSimulationAdapter.js`.
- Implement authoritative interactions in `js/simulation/simulationEngine.js`; emit domain events for sound, animation, messages, and other browser effects.
- Declare new event payloads in the `SimulationEvent` union in `domain/simulation.schema.json`, regenerate, and translate browser effects through the adapter/effects coordinator.
- Include moving state in `orbitSimulation.js`/`compiledWorldTimeline.js` when repeated headless trajectories depend on it.
- Rebuild the shared artifact with `npm.cmd run build:simulator-wasm`; the generator records wire versions/fingerprints in `domain/simulation-wire-versions.json`. Never hand-edit generated codecs or Rust models.

The simulation currently uses named arrays (`planets`, `bonuses`, `portals`, and `speedBoosters`) and direct target/slingshot fields. Registration cannot infer gameplay semantics, so each new interactive category requires explicit kernel work.

### 7. Make round-trip serialization complete

The editor's canonical export is `LevelDocument.toDefinition()`, so authored definitions survive without being reconstructed from disposable runtime objects. Keep schema inspector/serialization metadata complete so editing and projection do not lose fields.

`Game.exportCurrentLevel()` is still used outside an active editor document. It enumerates the canonical `gameObjects` collection and delegates to explicit descriptor-owned serialization. Runtime objects receive a stable `levelType`; constructor names are only a construction-time fallback and are not the serialized identity. Verify:

`level JSON -> validation/normalization -> runtime -> export -> validation/normalization -> runtime`

Every authored property must be listed in the schema serialization contract or explicitly transformed by handwritten behavior. Runtime animation/cache fields are intentionally excluded.

### 8. Verify the complete path

At minimum, add tests for:

- normalization and invalid property diagnostics;
- registry authoring and runtime construction;
- load-time collection/physics/singleton registration;
- editor create, edit, clone/delete (when allowed), undo/redo, and projection;
- export/reload round-trip;
- orbit lookup and ordering when applicable;
- deterministic transition behavior and browser/headless parity when gameplay-relevant;
- generated JavaScript/Rust contract parity and binary-wire coverage when gameplay-relevant;
- missing assets or optional effects when applicable.

Run from the repository root:

```powershell
npm.cmd test
npm.cmd run check:domain
node .\testing\levelTester.js --validate-only --level .\levels\level10.json
```

Use the relevant browser harness or Playwright scenario for Canvas, editor, input, and asset behavior.

## Validated architecture and remaining boundaries

The 2026-08-25 refactor completed these structural changes:

- `domain/gameObjects.schema.json` is the declarative object-contract authority; generated descriptors are consumed by `gameObjectRegistry.js` and downstream tools.
- `levelObjectVocabulary.js` is dependency-free and contains only orbit/camera vocabulary; serialized object types, aliases, defaults, capabilities, membership, editor metadata, and serialization allowlists are schema-generated.
- `gameObjectRegistry.js` owns only handwritten construction, authoring, exceptional normalization/validation, clone, and transient behavior hooks.
- `RuntimeObjectMembership` is shared by JSON loading and editor mutation. It owns stable type stamping, idempotent add/remove, typed collections, physics hooks, singletons, ordering restoration, and descriptor-derived level reset.
- Runtime export uses stable `levelType` identity and explicit allowlists; the constructor-name property map and greedy primitive scan were removed.
- Orbit fallback construction is synchronous, eliminating the unawaited dynamic-import race.
- `domain/simulation.schema.json` owns generated Rust simulation models, event shapes, and the ordered binary step-input/output records used to generate both sides of the JS-to-Wasm boundary.
- `domain/gameObjects.schema.json` declares gameplay-object-to-simulation projection coverage; every gameplay-authored field is mapped or explicitly excluded with a reason.
- `domain/simulation-wire-versions.json` records the checked-in input/output layout versions and fingerprints. `npm.cmd run check:domain` verifies generated output and the manifest, while CI and Pages rebuild and deploy the exact verified Wasm artifact.

One boundary intentionally remains explicit:

1. Gameplay participants need deliberate changes to `simulationState`, `simulationEngine`, `gameSimulationAdapter`, reset/clone logic, and compiled orbit timelines. Collision ordering and domain transitions are not generic registration concerns. Browser reconciliation is ID-based, so runtime collection order is not part of the adapter contract.

For a presentation-only object exported from an already composed runtime module, the steady-state addition is therefore one schema entry, one class, and the necessary handwritten registry hooks (plus assets/tests/docs). Gameplay objects additionally require simulation-schema state/wire coverage and their irreducible deterministic interaction policy.

## Validation record

Validated on 2026-08-29:

- All 344 Node unit tests passed on the repository's intended runtime.
- All 25 shipped and 20 archived manual levels validated without errors or warnings.
- All 25 original-level ports passed recorded headless trajectory verification.
- Focused contract generation, uncovered-wire-field rejection, Rust compilation, browser Wasm parity, headless Wasm/native parity, portal, speed-booster, registry, membership, and serialization tests passed.
- `git diff --check` passed.
