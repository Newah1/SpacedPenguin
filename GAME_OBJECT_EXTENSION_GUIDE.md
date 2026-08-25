# Game Object Extension Guide

**Status:** Current implementation guide and architecture review

**Last verified:** 2026-08-25 against the repository source

This guide describes the actual path for adding a level-authored game object. Structural integration now runs through the domain registry: schema defaults and capabilities, normalization, property validation, runtime construction, collection/physics membership, editor behavior, and runtime serialization are descriptor-driven. Gameplay semantics remain explicit in the deterministic simulation kernel.

## First classify the object

The amount of integration depends on behavior, not appearance.

| Kind | Examples | Required integration |
|---|---|---|
| Visual-only | `TextObject`, `PointingArrow` | Runtime class, schema type/defaults, registry descriptor, inspector/serialization metadata, validation/tests/docs |
| Orbiting visual | A decoration that follows another object | Visual-only path plus orbit source/target capability and serializable orbit state |
| Gameplay participant | `Planet`, `Bonus`, `Portal` | All above plus deterministic simulation state, transition logic, browser state application/events, reset/clone behavior, and browser/headless parity tests |
| Singleton/controller | `Target`, `Slingshot` | All relevant behavior plus singleton ownership, fallback creation, position synchronization, and lifecycle rules |
| Editor group | Portal pair | Descriptor-owned multi-definition create/clone behavior and a deletion strategy when references must be repaired atomically |

Extending `GameObject` is appropriate for a drawable runtime entity, but inheritance alone does not register level-format or gameplay semantics. A gameplay object must have a plain-data representation in the deterministic simulation; the visual class must not independently advance authoritative physics.

## Current end-to-end process

### 1. Implement the runtime class

Add a class in `js/gameObjects.js` or a focused module (as `BlackHole` does). A normal visual entity extends `GameObject` and supplies its rendering and non-authoritative animation behavior.

- Keep position in the representation expected by `GameObject` and the browser adapter.
- Accept dependencies such as the shared `AssetLoader`; do not create per-object audio or browser services.
- Do not advance flight, collisions, gameplay outcomes, or normal-frame orbit physics in the class.
- Add required image/audio files to `assets/manifest.json` and preserve graceful visual/audio fallback behavior.

### 2. Add shared level vocabulary and defaults

Update `js/levelSchema.js`:

- Add the canonical JSON type to `LevelObjectType`.
- Add its class-name mapping to `LEVEL_OBJECT_TYPE_BY_CLASS_NAME`.
- Add aliases only for an intentional compatibility format.
- Return normalized property defaults from `getLevelObjectPropertyDefaults`.
- Add the type to `ORBIT_SOURCE_TYPES` or `ORBIT_LOOKUP_TARGET_TYPES` only if its runtime and simulation representations support that capability.
- Add exceptional normalization only when it is a true invariant, not merely a constructor convenience.

Defaults shared by browser and headless execution belong in `js/config/gameConfig.js`. Preserve meaningful `0` and `false` values with nullish defaults.

### 3. Register construction and editor behavior

Add the imported constructor to `GameObjectFactory.constructors` in `js/levelLoader.js`, then add one descriptor in `js/gameObjectRegistry.js`. The descriptor is the authoritative extension seam and owns:

- `createRuntime`: complete runtime construction from normalized position/properties;
- `createAuthoringDefinitions`: canonical definition(s) created by the editor;
- `collections`: typed `Game` arrays in addition to `gameObjects`;
- `physicsAdd` and `physicsRemove`: physics registry hooks, if any;
- `singleton`: the owning `Game` property, if any;
- editor capabilities, group clone behavior, and transient property hooks;
- inspector fields and serialized property names supplied by `js/config/editorInspectorConfig.js`.

`GameObjectFactory` should remain generic dispatch plus shared orbit configuration. Do not add a new type switch there.

### 4. Validate the authored contract

Add type-specific checks to `js/levelValidation.js` for properties that affect correctness. Validate shape, ranges, required IDs, and cross-object references before runtime mutation. Add examples/property documentation to `levels/README.md`.

Type-specific property validation is a descriptor hook. Cross-object algorithms such as unique IDs and orbit-cycle detection remain centralized; relationship-specific validation is selected by the descriptor.

### 5. Integrate runtime ownership

Every instantiated entity belongs in `game.gameObjects`. If it needs a typed collection, physics registration, or singleton reference, those must also remain synchronized on load, editor add/replace/delete, and level clear.

Both normal loading and editor mutation use `RuntimeObjectMembership`, which reads `collections`, `physicsAdd`, `physicsRemove`, and `singleton` from the registry. Level reset derives its managed collections and singletons from exportable descriptors.

If the object can be an orbit target, ensure it is inserted in the ID lookup before the second-pass orbit application. Object-reference graphs must remain uniquely identified and acyclic.

### 6. Add deterministic gameplay support when needed

Skip this section only for presentation-only entities.

- Add a normalized plain-data shape in `createSimulationStateFromLevel` in `js/simulationState.js`.
- Clone and reset that shape explicitly in `cloneSimulationState` and `resetSimulationAttempt`.
- Capture and apply its live representation in `js/gameSimulationAdapter.js`.
- Implement authoritative interactions in `js/simulationEngine.js`; emit domain events for sound, animation, messages, and other browser effects.
- Translate new events in `applyGameSimulationEvents`.
- Include moving state in `orbitSimulation.js`/`compiledWorldTimeline.js` when repeated headless trajectories depend on it.

The simulation currently uses named arrays (`planets`, `bonuses`, and `portals`) and direct target/slingshot fields. Registration cannot infer gameplay semantics, so each new interactive category requires explicit kernel work.

### 7. Make round-trip serialization complete

The editor's canonical export is `LevelDocument.toDefinition()`, so authored definitions survive without being reconstructed from disposable runtime objects. Keep registry inspector/serialization metadata complete so editing and projection do not lose fields.

`Game.exportCurrentLevel()` is still used outside an active editor document. It enumerates the canonical `gameObjects` collection and delegates to explicit descriptor-owned serialization. Runtime objects receive a stable `levelType`; constructor names are only a construction-time fallback and are not the serialized identity. Verify:

`level JSON -> validation/normalization -> runtime -> export -> validation/normalization -> runtime`

Every authored property must be explicitly listed or transformed by its descriptor. Runtime animation/cache fields are intentionally excluded.

### 8. Verify the complete path

At minimum, add tests for:

- normalization and invalid property diagnostics;
- registry authoring and runtime construction;
- load-time collection/physics/singleton registration;
- editor create, edit, clone/delete (when allowed), undo/redo, and projection;
- export/reload round-trip;
- orbit lookup and ordering when applicable;
- deterministic transition behavior and browser/headless parity when gameplay-relevant;
- missing assets or optional effects when applicable.

Run from `testing/`:

```powershell
npm.cmd test
node .\levelTester.js --validate-only --level ..\levels\level10.json
```

Use the relevant browser harness or Playwright scenario for Canvas, editor, input, and asset behavior.

## Validated architecture and remaining boundaries

The 2026-08-25 refactor completed these structural changes:

- `gameObjectRegistry.js` is the single domain registry; the former editor-named compatibility module was removed and all consumers cut over.
- `levelObjectVocabulary.js` is dependency-free and contains only stable type/orbit/camera vocabulary.
- Schema defaults, orbit capabilities, per-type normalization, property validation, construction, authoring hooks, membership metadata, inspector metadata references, and serialization allowlists are registry-derived.
- `RuntimeObjectMembership` is shared by JSON loading and editor mutation. It owns stable type stamping, idempotent add/remove, typed collections, physics hooks, singletons, ordering restoration, and descriptor-derived level reset.
- Runtime export uses stable `levelType` identity and explicit allowlists; the constructor-name property map and greedy primitive scan were removed.
- Orbit fallback construction is synchronous, eliminating the unawaited dynamic-import race.

Two boundaries intentionally remain explicit:

1. `GameObjectFactory.constructors` is the browser composition map that injects runtime classes into the headless-safe registry creators. A new runtime class needs one import/map entry in addition to its descriptor.
2. Gameplay participants need deliberate changes to `simulationState`, `simulationEngine`, `gameSimulationAdapter`, reset/clone logic, and compiled orbit timelines. Collision ordering and domain transitions are not generic registration concerns. The adapter still reconciles some simulation arrays by ordering; stable ID reconciliation is a future hardening opportunity.

For a presentation-only object, the steady-state addition is therefore one class, one constructor-composition entry, and one descriptor (plus assets/tests/docs). Gameplay objects add only their irreducible deterministic state and interaction policy.

## Validation record

Validated on 2026-08-25:

- All 270 Node tests passed on the repository's intended runtime.
- All 25 shipped and 20 archived manual levels validated without errors or warnings.
- Focused registry/membership/serialization tests passed, including stable identity, idempotent physics membership, descriptor-derived reset, singleton protection, explicit export allowlists, orbit serialization, and editor construction hooks.
- `git diff --check` passed.
- All 21 Chromium smoke tests passed. Local Playwright concurrency is capped at four workers and the whole-test timeout is 60 seconds because every page bootstraps and decodes the complete audio manifest; Stellar Mode's asynchronous MP3 decode/restore checks allow 15 seconds.
