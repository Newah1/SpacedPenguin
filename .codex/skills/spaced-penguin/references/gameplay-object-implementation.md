# Gameplay Object Implementation

Use this checklist for a new gameplay-authored object or for a change that adds simulation-visible fields, events, motion, or editor geometry to an existing object. Start with `AGENTS.md` and `ARCHITECTURE.md`; this reference supplements rather than replaces their contracts.

## Define the canonical contract first

1. Add the object vocabulary, defaults, collection, aliases, capabilities, inspector fields, serialization metadata, and simulation projection to `domain/gameObjects.schema.json`.
2. Map every gameplay-authored property into simulation state. If a property is deliberately presentation-only, encode the exclusion and its reason in the schema rather than silently omitting it.
3. Add the corresponding state records, collections, and event definitions to `domain/simulation.schema.json`.
4. Regenerate contracts with `npm.cmd run generate:domain`, then run `npm.cmd run check:domain`. Do not hand-edit generated codecs or generated registries.

### Migrate the binary wire format deliberately

Any binary input or output layout change requires a wire-version migration:

1. Increment the version in `domain/simulation.schema.json`.
2. Compute the new input and output fingerprints with the exported `computeSimulationWireFingerprint` helper from `tools/generateDomainContracts.js`.
3. Add the new version-to-fingerprint entries to `domain/simulation-wire-versions.json`; retain old version entries.
4. Keep `x-spaced-penguin-wire.output.event.variants` in exactly the same order as `SimulationEvent.oneOf`. Append new event schemas and tags. Inserting or reordering an event can change existing numeric tags and the generator will reject a mismatched order.

One way to print the fingerprints from the repository root is:

```powershell
node --input-type=module -e "import {readFile} from 'node:fs/promises'; import {computeSimulationWireFingerprint} from './tools/generateDomainContracts.js'; const schema=JSON.parse(await readFile('./domain/simulation.schema.json','utf8')); console.log(computeSimulationWireFingerprint(schema,'input')); console.log(computeSimulationWireFingerprint(schema,'output'));"
```

## Connect authored, runtime, and editor state

- Add the runtime entity class and the handwritten registry hooks that cannot be generated. Keep `GameObjectFactory` as generic registry dispatch plus shared orbit configuration.
- Add the collection to `RuntimeWorld`, expose it through `Game`, and capture/apply it in `GameSimulationAdapter` when it is gameplay-relevant.
- Let generated editor metadata expose straightforward fields. When a property changes derived runtime geometry, add an `applyRuntimeProperty` hook in `gameObjectRegistry.js` so selection bounds and rendering update immediately. A radius field that also controls width and height is a typical example.
- Add a semantically correct entry to `EDITOR_NUMERIC_FALLBACKS` for numeric inspector fields. Otherwise clearing a field falls back to `0`, which is wrong for values such as restitution whose default is `1`.
- Verify level validation, loading, editing, export, and re-import. Validation must still finish before the current world is cleared or mutated.

## Keep simulation behavior deterministic

- Read `rust/simulator/README.md`. Implement the transition in the authoritative Rust core first, then port the same semantics to the JavaScript compatibility fallback. Do not put active collision or flight advancement in visual entity classes.
- Emit typed deterministic events for browser-visible consequences. Handle audio, flashes, messages, timers, and other presentation in `GameEffectsCoordinator` or another browser-side collaborator.
- A renderer entity may retain short-lived presentation state, such as a hit flash, when that state is driven by an emitted event and does not affect simulation.
- Update reset, clone, normalization, serialization, and headless candidate construction. If Rust `InitialState` gains a field, search every constructor, including optimizer paths such as `gravity_sculpt.rs`.

### Preserve moving-world collection order

For any moving gameplay collection, use one identical ordering across all position-buffer producers and consumers:

1. JavaScript `SimulationState` and the simulation engine's world-entity list.
2. `compiledWorldTimeline` entity counts, frame compilation, and frame application.
3. `wasmSimulationBridge` moving-world detection and `worldPositions` encoding.
4. Rust `sync_runtime_world` expected counts and decoding.
5. Rust headless timeline frame application.
6. Browser adapter capture and state application.

A count mismatch usually fails loudly, but an ordering mismatch can silently apply one object's position to another. Treat the collection order as a wire contract and cover it with a moving-world parity test.

## Build the packaged Rust artifacts

After Rust or wire changes, rebuild both artifacts used by the repository:

```powershell
npm.cmd run build:simulator-native
npm.cmd run build:simulator-wasm
```

On Windows, do not assume `cargo` is on `PATH`. The repository scripts locate the configured Rust toolchain and also perform the expected contract-generation steps.

## Verify every execution surface

Add focused coverage for:

- Authoritative Rust behavior and edge cases.
- JavaScript fallback agreement with the Rust result.
- Validation, aliases, factory construction, editor mutation, and export round trips.
- Generated binary round trips for every event variant.
- Browser Wasm slice parity.
- Wasm and native headless event parity.
- Moving-object compiled-timeline parity when the object can orbit or otherwise move.

Compare event types and identifiers exactly. For computed floating-point values involving operations such as square roots and normal vectors, use a tight numeric tolerance across JavaScript and Rust rather than deep-equality of the entire numeric payload; platform implementations can differ at roughly the last bit.

Finish with the repository verification commands from `AGENTS.md`, including `npm.cmd test`, and update the relevant level, editor, architecture, and operational documentation.
