# Spaced Penguin Feature Map

**Snapshot:** 2026-08-29

**Scope:** Current browser game, authored level format, embedded editor, local persistence, optional community service, developer tooling, and verification surfaces.  
**Authority:** Current source and tests take precedence over historical Shockwave documentation. [ARCHITECTURE.md](ARCHITECTURE.md) remains the architectural authority.

## Status legend

| Status | Meaning |
|---|---|
| Implemented | Reachable in a supported product path. |
| Optional | Implemented but requires configuration, a service, or user opt-in. |
| Editor-only | Authoring support rather than a separate gameplay mechanic. |
| Compatibility | Retained for existing level data or legacy fidelity. |
| Parsed only | Accepted or retained but not enforced or dispatched. |
| Internal/tooling | Developer, diagnostic, testing, or conversion capability. |
| Unsupported | Explicitly absent, rejected, or outside current scope. |
| Unverified | Plausible from documentation or code but not traced to a complete supported path. |
| Historical only | Present only as provenance or reference material, not current runtime behavior. |

## 1. Product surfaces and roles

Spaced Penguin is a browser-native gravity-slingshot game delivered as static HTML, ES modules, JSON, Canvas assets, audio, and a packaged Rust/Wasm simulator. The core game requires an HTTP static server but has no JavaScript application build step. An optional Node.js/SQLite service adds immutable community levels and per-level leaderboards.

| Surface | Primary role | Status | Entry point |
|---|---|---|---|
| Main game | Player launches Kevin through a gravity field toward a target ship. | Implemented | `index.html`, `js/main.js`, `js/game.js` |
| Official campaign | Player selects and advances through 25 ports of original levels. | Implemented | `levels/level01.json`–`level25.json` |
| Manual campaign | Player accesses the archived 20-level hand-authored catalog. | Compatibility | `?level=manual:N`, `levels/manual/` |
| Embedded level editor | Designer creates, edits, tests, saves, and exports levels inside the running game. | Implemented | Main-menu Level Editor, `F1`, or `/level_editor` |
| Level browser | Player/designer browses official, owned local, and optional community sources. | Implemented | Main menu and editor Open Level flow |
| Community service | Operator hosts publication, discovery, replay verification, and leaderboards. | Optional | `npm run serve:community` or `npm run serve:levels` |
| Headless trajectory tools | Maintainer validates levels and searches reproducible launches without a browser. | Internal/tooling | `testing/levelTester.js` |
| Shared Rust/WebAssembly core | Browser bootstrap explicitly loads the packaged Wasm module; one persistent Rust state handle uses a reusable position buffer and returns generated binary `StepPatch`/event-union data. Node headless tools use the same Rust candidate transition, with JavaScript retained as a fallback/reference backend. | Implemented | `rust/simulator/`, `js/simulation/wasmSimulationBridge.js` |
| Historical archive | Maintainer studies decompiled Director/Lingo behavior and regenerates ports. | Internal/tooling | `OldSource/`, `tools/` |

## 2. Player gameplay

### 2.1 Aim and launch

**Status:** Implemented  
**Value:** The player drags or touches the slingshot to choose direction and pullback power, then releases Kevin into the world.

- Mouse and touch paths feed the same logical world-coordinate handlers.
- Launch position, nonlinear power scaling, angle, and velocity are defined by the deterministic simulation API.
- Pullback respects the level's slingshot minimum, maximum, and velocity multiplier.
- A launch increments the attempt counter and is recordable as a versioned run action for replay verification.
- `/launch <angle> <power>` provides a precise developer launch, and `/last` repeats the previous launch.

**Owners:** `js/game.js`, `js/input/inputActions.js`, `js/simulation/simulationEngine.js`, `js/replay/runTranscript.js`.  
**Verification:** `testing/simulationEngine.test.js`, `testing/inputActions.test.js`, `testing/goldenTrajectory.test.js`, Playwright smoke coverage.

### 2.2 Deterministic flight and gravity

**Status:** Implemented

- Gameplay advances at exact 1/60-second ticks regardless of display refresh rate.
- Planets and black holes apply gravity within their effective reach using the level's gravitational constant.
- Moving planets, bonuses, black holes, targets, portals, speed boosters, slingshots, and decorations advance through the shared orbit/waypoint layer before transition evaluation.
- The browser explicitly loads the packaged Rust/WebAssembly module during bootstrap and falls back to the JavaScript kernel if initialization fails.
- Each live browser simulation keeps one persistent Rust state handle, synchronizes moving positions through a reusable `Float64Array`, and decodes the generated versioned binary step patch and event union.
- Headless trajectory searches default to the same Rust/Wasm core; `--backend js` remains an explicit parity/reference option.
- The headless runner invokes the same Rust candidate-transition function; batch trajectory envelopes may remain JSON outside the per-frame hot path.
- Orbit and waypoint world motion remains in the shared JavaScript deterministic layer and feeds the Rust transition slice in both browser and headless execution.
- World coordinates remain independent of CSS size, device-pixel ratio, and camera transforms.

**Owners:** `rust/simulator/src/lib.rs`, `js/simulation/wasmSimulationBridge.js`, `js/simulation/simulationEngine.js`, `js/simulation/simulationState.js`, `js/simulation/orbitSimulation.js`, `js/runtime/gameSimulationAdapter.js`.

### 2.3 Planet collisions and crash recovery

**Status:** Implemented

- Swept flight checks prevent ordinary frame-rate-dependent collision behavior.
- A planet collision emits a domain event, applies a deterministic bounce, increments miss/collision state, and begins a crash countdown.
- Restitution, minimum bounce speed, separation padding, and crash-frame timing are configuration-owned.
- When the countdown completes, the browser resets the attempt through a domain event rather than independent visual-object physics.
- A level may fail when the collision count exceeds `allowedMisses`.

**Owners:** `js/simulation/simulationEngine.js`, `js/runtime/gameSimulationAdapter.js`, `js/config/gameConfig.js`.

### 2.4 Bonuses

**Status:** Implemented

- Kevin collects bonuses by intersecting their padded collection bounds.
- Each bonus can provide an authored score value and optional orbit.
- Collected state is deterministic; audio, popup animation, and messages are browser-side effects.
- `requiredBonuses` can block target completion until enough bonuses have been collected.
- Headless searches can require every bonus with `--all-bonuses`.

**Owners:** `js/simulation/simulationEngine.js`, `js/runtime/entities/gameObjects.js`, `js/runtime/gameSimulationAdapter.js`.  
**Verification:** simulation tests, bonus manual harness, shipped-level validation.

### 2.5 Target success, attempts, and scoring

**Status:** Implemented

- Reaching the target succeeds only when enforced victory rules pass.
- Completion transitions to an animated level-end score breakdown.
- Score uses traveled distance, level/attempt contribution, bonus score, and the level multiplier.
- The last allowed try runs to a terminal outcome before `maxTries` failure is evaluated.
- Retry, advance, level completion, and high-score qualification are coordinated by the game/session layer.

**Owners:** `js/simulation/simulationEngine.js`, `js/runtime/gameSession.js`, `js/ui/views/levelEndScreen.js`, `js/platform/persistence/highScoreStore.js`.

### 2.6 Portals

**Status:** Implemented

- Portals are reciprocal red/blue endpoint pairs identified by stable IDs.
- Entry is directional: back-side passes do not activate a portal.
- Swept intersection selects the earliest eligible portal crossing in a tick.
- Exit position and velocity rotate according to source and destination orientation, with clearance outside the destination aperture.
- A portal lock prevents immediate re-entry until Kevin leaves the paired endpoint.
- The simulation emits the teleport; the browser renders clipped source/destination penguin imagery and optionally plays the woosh cue.

**Owners:** `js/simulation/simulationEngine.js`, `js/runtime/entities/gameObjects.js`, `js/runtime/gameSimulationAdapter.js`, `js/levels/levelValidation.js`.  
**Verification:** `testing/portalDirection.test.js`, simulation tests, browser integration paths.

### 2.7 Speed boosters

**Status:** Implemented

- A swept panel intersection prevents fast-moving Kevin from tunneling through the booster.
- Entry redirects velocity along the booster rotation and applies `speedMultiplier` to the incoming speed.
- A per-booster contact lock prevents repeated activation until Kevin leaves the panel.
- `playSound` controls the browser-side activation cue; deterministic state emits a typed activation event.
- The clipped animated arrow marquee scales with the configured multiplier.
- Boosters support editor creation, rotation handles, waypoint motion, serialization, browser play, and headless/Wasm simulation.

**Owners:** `js/simulation/simulationEngine.js`, `js/runtime/entities/gameObjects.js`, `js/runtime/gameSimulationAdapter.js`, `domain/gameObjects.schema.json`, `domain/simulation.schema.json`.

**Verification:** `testing/simulationEngine.test.js`, `testing/speedBoosterPresentation.test.js`, `testing/wasmSimulator.test.js`.

### 2.8 Black holes

**Status:** Implemented

- Black holes reuse planet gravity, reach, orbit, registration, and hierarchical lookup behavior.
- They are explicitly non-collidable and have zero collision radius, so Kevin can pass through the event horizon while gravity continues to act.
- Their accretion disk, halo, particles, and event horizon are render-only effects and do not affect deterministic state.
- Level JSON accepts canonical `blackhole` and compatibility alias `black_hole`.
- Black holes are creatable and editable, expose gravity properties in the inspector, and participate in generated schema/registry membership.

**Owners:** `js/runtime/entities/blackHole.js`, `js/levels/levelSchema.js`, `js/simulation/simulationState.js`, `js/levels/levelLoader.js`.  
**Verification:** `testing/blackHole.test.js`, `testing/blackHoleEditor.test.js`.

### 2.9 Aim assist

**Status:** Optional; off by default

- While aiming, a short trajectory preview simulates a cloned state through the production transition kernel.
- The preview includes gravity and portal discontinuities and stops at terminal outcomes.
- Preview duration and sample rate come from simulation configuration and can be overridden at runtime for diagnostics.
- The setting is persisted in browser settings and clearing it removes the preview immediately.

**Owners:** `js/simulation/aimAssist.js`, `js/game.js`, `js/platform/settings/settingsManager.js`.  
**Verification:** `testing/aimAssist.test.js`, settings tests.

### 2.10 Pause, quit, reset, and fast-forward

**Status:** Implemented

- Page visibility suspends useful frame work and resets timing on resume without creating a second animation chain.
- Pause/quit screens block gameplay input; retry and quit flows preserve explicit state transitions.
- `R` resets a level, `Q` opens quit, and `Space` resets after crash or target hit.
- A long flight unlocks 2× simulation consumption after five seconds. Tick size remains 1/60 second, preserving deterministic results.
- Stellar Mode can tie custom music playback to the long-flight/fast-forward experience.

**Owners:** `js/main.js`, `js/game.js`, `js/input/inputActions.js`.

## 3. Levels and authored world features

### 3.1 Level envelope and validation

**Status:** Implemented

Levels define start and target positions, object entries, rules, optional bounds, and optional camera metadata. Declarative vocabulary, defaults, aliases, capabilities, constraints, and serialization metadata originate in `domain/`; generated JavaScript contracts and `generated/level.schema.json` serve runtime/editor and external tooling consumers. Every gameplay-authored property in `domain/gameObjects.schema.json` must map to normalized simulation state or declare a reasoned projection exclusion. Every browser, editor, and headless consumer still performs compatibility normalization through `js/levels/levelSchema.js` and semantic validation through `js/levels/levelValidation.js` before the current world is cleared or mutated.

Validation covers finite coordinates, supported types, composition, numeric ranges, unique IDs, orbit references and cycles, portal pairing, cameras, bounds, and rule constraints. It accumulates stable diagnostics containing severity, code, JSON-style path, and message.

Unknown types and invalid definitions are rejected rather than partially instantiated. Missing built-in levels can fall back to generated levels when selected.

### 3.2 Authored object vocabulary

| Object | Status | Player-visible behavior | Important authored capabilities |
|---|---|---|---|
| Planet | Implemented | Gravity source and collision body. | Radius, mass, reach, sprite type, ID, name, orbit. |
| Black hole | Implemented | Gravity source without collision. | Planet-like radius/mass/reach, ID, orbit. |
| Bonus | Implemented | Collectible score item. | Value, dimensions, ID, orbit. |
| Target | Implemented | Completion destination. | Dimensions, sprite type, optional orbit. |
| Slingshot | Implemented | Launch origin and pullback model. | Velocity multiplier, min/max pullback. |
| Tutorial text (`textobject`) | Implemented | Styled in-world guidance. | Small markup parser, wrapping, sizing, fade, visibility, render order. |
| Pointing arrow (`pointingarrow`) | Implemented | Pulsing directional guidance. | Target point, delay, colors, width scaling, alpha pulse. |
| Portal | Implemented | Directional paired teleportation. | IDs, pair ID, aperture, color, rotation, sound flag. |
| Speed booster | Implemented | Redirects and scales Kevin's velocity on swept entry. | Dimensions, rotation, multiplier, sound flag, ID, waypoint motion. |
| Penguin entry | Compatibility | Accepted from old/editor exports but not instantiated as a second penguin. | Singleton position comes from `startPosition`. |
| Obstacle | Unsupported | No current runtime entity. | Dormant historical placeholder is outside shared vocabulary. |

### 3.3 Orbit system

**Status:** Implemented, with compatibility variants

| Orbit | Status | Definition |
|---|---|---|
| Circular | Implemented | Radius, angle, and angular speed around a fixed center or object ID. |
| Elliptical | Implemented | Semi-major/minor axes and rotation. |
| Figure-8 | Implemented | Parametric figure-eight around a center. |
| Gravity | Implemented | Numerically integrated velocity under configured gravity strength. |
| Director gravity | Compatibility | Discrete source-frame simulation for generated original-level ports. |
| Hierarchical/object-referenced | Implemented | Dependency-ordered parent/child orbits with forward references. |
| Custom | Compatibility/limited | Programmatic functions work in runtime objects; JSON cannot encode them and falls back to circular behavior. |

Object-referenced orbits require unique IDs and an acyclic graph. Planets, black holes, and bonuses can be lookup targets; planets, black holes, bonuses, and targets can be moving sources. Validation rejects unsupported active orbits on slingshot, text, and pointing-arrow objects.

### 3.4 Waypoint motion

**Status:** Implemented

- `pingpong` paths reverse at endpoints without overshoot; `loop` paths include the closing segment.
- Authored paths contain at least two points plus a positive speed and are mutually exclusive with orbit motion.
- Planets, black holes, bonuses, targets, slingshots, portals, speed boosters, text, and pointing arrows can be waypoint sources according to generated capabilities.
- Moving gameplay objects feed the same browser/headless world state; compiled headless frames preserve moving portal and other candidate-independent positions exactly.
- An idle penguin follows a moving slingshot, while decorative runtime objects follow their deterministic waypoint mirrors.
- The editor can create/remove paths, add/remove points, edit coordinates and speed, drag numbered waypoint handles, preview motion without changing authored positions, and undo the resulting document command.

**Owners:** `js/simulation/waypointSimulation.js`, `js/simulation/simulationEngine.js`, `js/simulation/compiledWorldTimeline.js`, editor mutation/preview/overlay modules.

**Verification:** `testing/waypointMotion.test.js`, editor architecture tests.

### 3.5 World bounds and cameras

**Status:** Implemented

- Legacy levels omit camera metadata and retain the fixed 800 × 600 identity view on landscape/desktop displays.
- Compact portrait gameplay uses a zoomed follow camera, clamped manual look-around, and edge guidance for offscreen target/landmark directions without changing simulation coordinates.
- Expanded playfields author stage bounds separately from larger terminal flight bounds.
- `fit` cameras show the complete authored stage.
- `follow` cameras smoothly track Kevin while remaining clamped inside the stage; authored zoom is raised when necessary to keep the view valid.
- The editor has an independent pan/zoom camera that is never exported as gameplay state.
- Pointer conversion applies inverse display and world-camera transforms.

**Owners:** `js/rendering/viewport.js`, `js/rendering/viewportGuidanceRenderer.js`, `js/input/gameplayController.js`, `js/game.js`, editor canvas input/controller code.
**Verification:** `testing/viewport.test.js`, responsive/mobile Playwright coverage.

### 3.6 Level rules

| Rule | Status | Runtime behavior |
|---|---|---|
| `maxTries` | Implemented | Fails after the last permitted launched attempt reaches an outcome. |
| `requiredBonuses` | Implemented | Blocks target success until the required count is collected. |
| `allowedMisses` | Implemented | Fails when planet collisions exceed the allowance. |
| `gravitationalConstant` | Implemented | Controls deterministic gravity for the level; explicit zero is meaningful. |
| `scoreMultiplier` | Implemented | Multiplies the completed level contribution. |
| `timeLimit` | Parsed only | Normalized and validated but not enforced by the game loop. |
| `customBehaviors` | Parsed only | Retained by rules code but no dispatcher executes them. |

Public community levels reject unenforced/custom rules instead of publishing silent no-ops.

## 4. Presentation, input, audio, and settings

### 4.1 Rendering

**Status:** Implemented

- Canvas 2D renders a starfield, completed paths, launch masks, trace, ordered entities, HUD, UI screens, and editor overlay.
- The backing buffer follows CSS size and device-pixel ratio while the presentation stage remains 800 × 600.
- Render order is cached and invalidated when the runtime graph changes.
- Entity sprite fallbacks and procedurally drawn visuals allow graceful degradation when media is unavailable.
- Manifest assets default to bootstrap-blocking but can opt into background loading; non-blocking media reports progress without delaying game construction.
- Shared asset lookups reuse cached images and coalesce repeated animation-metadata requests.
- Simulation-applied positions drive rendering; visual entities do not independently integrate gameplay movement.

### 4.2 Input and responsive behavior

**Status:** Implemented

- Contextual input actions activate separately for menu, gameplay, editor, blocking UI, keyboard, and window events.
- Mouse, touch, pointer, keyboard, resize, orientation, and fullscreen flows are supported.
- Modal UI gets first refusal so actions do not leak into gameplay or menu shortcuts.
- The display uses centered contain scaling with gutters where necessary.
- Fullscreen uses standard and vendor-prefixed browser APIs.

Key controls include backquote for console, `Escape` for editor exit or quit dialog, `F1` for editor, `R` reset, `Q` quit, and editor shortcuts for save, undo/redo, delete, fit, center, and pan.

### 4.3 Audio

**Status:** Implemented with optional music modes

- Manifest-defined sound effects cover launch, bonus, planet collision, target entry, portal teleportation, and speed-booster activation.
- Web Audio buffers are decoded and played through semantic cue mappings and gain nodes.
- Audio initialization and resume tolerate browser autoplay restrictions.
- Failed audio does not block visual gameplay.
- Experimental background music shuffles bundled tracks when enabled.
- Stellar Mode stores and plays a user-selected MP3 after the long-flight unlock condition.

**Persistence:** Settings use `localStorage`; Stellar MP3 data uses IndexedDB through `js/platform/persistence/stellarTrackStore.js`.  
**Owners:** `js/platform/audio/audioManager.js`, `js/platform/assets/assetLoader.js`, `js/config/audioConfig.js`, `js/platform/persistence/stellarTrackStore.js`.

### 4.4 Settings

**Status:** Implemented

The settings screen provides:

- Aim assist toggle, off by default.
- Sound-effects toggle, on by default.
- Experimental background-music toggle, off by default.
- Stellar Mode toggle/file workflow, off by default.
- Master volume from 0–100% in 5% increments.

Settings are normalized against definitions, persisted in `localStorage`, and apply live effects through `SettingsManager` callbacks.

### 4.5 UI screens and local high scores

**Status:** Implemented

- Canvas/DOM UI supports stacked screens, modal overlays, buttons, animated numbers, quit confirmation, end-of-level scoring, settings, level browsing, and score upload.
- Local high scores store up to 100 normalized entries and display top-ten all-time and today lists.
- Qualifying entries can record a name up to 20 characters and two-character uppercase region.
- Local high scores are separate from community per-level leaderboards.

## 5. Embedded level editor

### 5.1 Document-first editing model

**Status:** Implemented

`LevelDocument` is the canonical authored model. Commands transform cloned level definitions, validate the candidate, and project them transactionally into a disposable runtime mirror. Selection stores stable IDs and resolves the current mirror after rebuilds.

Projection failure restores the previous document and last-known-good runtime. Edit-to-Play clones and validates the document into a fresh simulation world; returning to Edit discards that world and rebuilds from the unchanged authored definition. Save, export, thumbnail metadata, and editor publication serialize `LevelDocument`, not mutated play state.

### 5.2 Object editing

**Status:** Implemented

- Add supported object types through registry-driven toolbar controls.
- Select from the canvas or object list and drag objects in world space.
- Edit type-specific properties in the inspector using numeric, text, color, checkbox, select, and point controls.
- Delete and clone objects while preserving singleton and collection rules.
- Portal add/delete/clone/undo operations work on complete endpoint pairs.
- Rotate supported objects with an authored rotation handle.
- Create and edit waypoint paths through inspector actions or draggable numbered canvas handles.
- Move fixed orbit centers and visualize orbit guides, waypoint routes, arrow targets, portal partners, rotation handles, and selection bounds.
- Sprite and property changes update the live preview immediately.

### 5.3 Command history

**Status:** Implemented

Typed command strategies support add, remove, group operations, object moves, rotations, orbit-center moves, waypoint-handle moves, object-property edits, level-setting edits, and planet adjustments. Undo/redo is session-local; repeated events from one focused property edit or live canvas gesture coalesce into one history entry, and cancellation restores the authored definition.

**Owners:** `js/editor/state/levelDocument.js`, `js/editor/commands/editorCommandBus.js`, `js/editor/commands/live/`, `js/editor/services/documentMutationService.js`, `js/editor/services/documentProjectionTransaction.js`.
**Verification:** editor architecture, command, projection, mutator, and runtime-controller tests.

### 5.4 Editor camera and play testing

**Status:** Implemented

- Pan with middle mouse, space-drag, or touch gestures; zoom with the wheel; fit or center through shortcuts and toolbar actions.
- Toggle between edit and a disposable play projection without leaving the editor.
- Reset and retry the play projection without mutating the authored document.
- Successful editor play tests remain in the editor and can unlock community publication.
- Unsaved-change checks protect replacing an active editor document.

### 5.5 Gravity Sculpt

**Status:** Editor-only

- A designer draws a desired route from the slingshot.
- The optimizer infers a launch and can adjust launch angle/power, selected static planet mass, and selected static planet position.
- It evaluates candidates through the production deterministic simulation kernel.
- Goals can require the target, avoid collisions, stay in bounds, and limit flight duration within the optimization objective.
- The staged search uses waypoint curricula, influence-guided differential evolution, comfort penalties, robustness scoring, progress reporting, and multiple candidates.
- Stationary-world population and influence probes run as ordered batched evaluations in a bounded Rust/Wasm worker pool; only finalists return full preview paths.
- Moving orbit/waypoint worlds and custom variable hooks fall back to the deterministic JavaScript evaluator.
- Applying a result uses editor commands so planet changes participate in undo/redo; a test mode verifies the proposed route in the live editor.

**Owners:** `js/simulation/gravitySculptor.js`, `js/simulation/gravitySculptWorkerClient.js`, `js/workers/gravitySculptWorker.js`, `rust/simulator/src/gravity_sculpt.rs`, and the gravity-sculpt controller/view modules.
**Verification:** `testing/gravitySculptor.test.js`, `testing/wasmGravitySculptor.test.js`, mass benchmark, and Wasm benchmark.

### 5.6 Save, browse, and export

**Status:** Implemented with explicit limitations

- Save creates or updates an editable local record containing metadata, definition, and thumbnail.
- Export downloads canonical JSON for manual review and source-control promotion.
- Official and community definitions open as copies; owned local definitions can open directly.
- Search, cursor pagination, detail views, cancellation, lazy thumbnails, and source-specific capabilities are shared behind the catalog interface.
- Replacing a dirty editor document requires Save & Open, Discard, or Cancel.

**Unsupported:** File-picker import, arbitrary-path loading, autosave, editable cloud projects, and server-side mutation of an already published level.

## 6. Catalogs, persistence, and community features

### 6.1 Official and local catalogs

**Status:** Implemented

- Official catalog summaries and definitions come from shipped level files.
- Local catalog records live in browser storage and are editable by their owner/browser.
- Source-qualified `{ source, id }` references avoid collisions.
- Summaries are separated from details and playable definitions to keep browsing lightweight.
- Catalog search, bounded cursor pages, abortable requests, and capability-controlled actions are source-neutral.

### 6.2 Optional remote community catalog

**Status:** Optional

- `app-config.js` can provide a community API base URL and request timeout.
- The remote source appears only when configured.
- Server failure leaves official/local browsing, saves, editing, and play available.
- Community records are immutable and expose play/open-copy behavior rather than ownership.

**Owners:** `js/config/appConfig.js`, `js/catalog/levelCatalogComposition.js`, `js/catalog/remoteLevelCatalogSource.js`, `js/catalog/communityLevelClient.js`.

### 6.3 Community publication

**Status:** Optional

- A locally authored level must be completed in the editor before publication.
- Publication accepts metadata, a canonical level definition, and a versioned deterministic run transcript.
- Server validation normalizes the level, applies public-policy restrictions, verifies the proof through the shared runner, hashes canonical JSON, and stores an immutable record.
- Unsupported custom orbit fallback and unenforced/custom rules are rejected for public levels.
- Publication is rate-limited and returns a stable community reference and immutable ETag.

**Owners:** `server/services/publishLevel.js`, `server/validation/`, `server/services/replayVerifier.js`, `server/db/levelRepository.js`.

### 6.4 Per-level leaderboards

**Status:** Optional

- Each community level has its own cursor-paginated leaderboard.
- A player may voluntarily upload a completed run with three-letter initials.
- The server validates and replays the transcript instead of trusting client-reported trajectories, bonuses, collisions, or outcomes.
- Score calculation is versioned and shared with the client-facing community score model.
- Idempotency prevents a retry from creating duplicate submissions.
- Accepted responses report ranking state and current rank when applicable.

**Owners:** `js/replay/communityScore.js`, `js/ui/views/communityScoreUploadScreen.js`, `js/ui/views/communityLeaderboardView.js`, `server/services/submitScore.js`.

### 6.5 Community HTTP API

**Status:** Optional

| Endpoint | Capability |
|---|---|
| `GET /api/v1/status` | Protocol and simulation version discovery. |
| `GET /api/v1/levels` | Search, sort, and cursor-page community summaries. |
| `POST /api/v1/levels` | Validate, replay-verify, and immutably publish a level. |
| `GET /api/v1/levels/:levelId` | Fetch immutable details and playable definition with ETag caching. |
| `GET /api/v1/levels/:levelId/scores` | Cursor-page the per-level leaderboard. |
| `POST /api/v1/levels/:levelId/scores` | Replay-verify and submit an idempotent score. |

The service includes request-size limits, query validation, CORS policy, in-memory rate limiting, canonical hashing, a bounded verifier worker pool, and SQLite storage. There are no user accounts or mutable ownership APIs.

### 6.6 Persistence matrix

| Data | Storage | Status | Notes |
|---|---|---|---|
| Local high scores | `localStorage` | Implemented | Up to 100 entries; all-time/today views. |
| Settings | `localStorage` | Implemented | Normalized versionless setting values. |
| Local authored levels | `localStorage` | Implemented | Metadata, thumbnail, and canonical definition. |
| Stellar MP3 | IndexedDB | Optional | User-selected audio blob. |
| Community levels/scores | SQLite | Optional | Server-hosted immutable levels and verified scores. |
| Campaign progress | None | Unsupported | Current level can be selected by URL; progression is not persisted. |
| User identity/accounts | None | Unsupported | Community initials are not accounts. |

## 7. Determinism, replay, and developer tools

### 7.1 Browser/headless parity

**Status:** Implemented

The browser adapter snapshots live objects into serializable state, advances candidate-independent orbit/waypoint motion, synchronizes a persistent Rust runtime handle, invokes the Rust/Wasm transition slice, applies its generated binary patch, and translates its generated event union into effects. If Wasm bootstrap fails, the browser retains the JavaScript transition kernel as a graceful fallback. The headless tester defaults to portable batched Wasm execution, exposes `--backend native` for optimized release-executable sweeps, and retains `--backend js` for comparison.

This parity path covers launch math, gravity, orbit/waypoint world motion, collision, bounce, portals, speed boosters, bonuses, targets, bounds, rules, resets, and scoring. Browser-only Canvas, DOM, audio, messages, and timers remain outside deterministic modules.

**Verification:** `testing/wasmBrowserSimulation.test.js`, `testing/wasmSimulator.test.js`, `testing/nativeSimulator.test.js`, `e2e/wasmSimulation.spec.js`.

### 7.2 Schema-generated contracts and binary wire

**Status:** Internal/tooling with production runtime output

- `domain/gameObjects.schema.json`, `domain/simulation.schema.json`, and `domain/level.schema.json` are language-neutral declarative sources of truth.
- Generation produces browser-safe object/event descriptors, Rust serde models/event unions, the external JSON level schema, and both sides of the versioned JS-to-Wasm input and output codecs.
- `LEVEL_DEFAULTS` is a generated compatibility view rather than a second handwritten defaults table.
- The ordered binary layout is declared in `x-spaced-penguin-wire`; every reachable field must be encoded or explicitly excluded with a reason. Adding an uncovered field fails generation.
- Browser step input and the per-frame `StepPatch`/event union output use generated binary codecs; batch trajectory envelopes may remain JSON outside the hot path.
- Ordered layouts, versions, and fingerprints are declared in `domain/simulation.schema.json` and `domain/simulation-wire-versions.json`. `npm run check:domain` validates generated output and the manifest; CI and Pages regenerate contracts and deploy the exact verified Wasm artifact built by `npm run build:simulator-wasm`.

**Owners:** `domain/`, `tools/generateDomainContracts.js`, `generated/`, `rust/simulator/`.

**Verification:** `testing/domainContracts.test.js`, Rust checks, Wasm browser/headless parity tests.

### 7.3 Compiled world timelines and parallel sweeps

**Status:** Internal/tooling

- Candidate-independent planet, black-hole, bonus, target, portal, speed-booster, orbit, and waypoint state is precompiled into exact fixed-step frames.
- Candidates retain independent penguin, collected-bonus, and counter state.
- Longer time horizons replace undersized caches; out-of-range application throws rather than consuming undefined frames.
- Large grids can use up to four worker threads by default and restore canonical candidate order.

**Owners:** `js/simulation/compiledWorldTimeline.js`, `testing/headlessEngine.js`, `testing/parallelTrajectoryRunner.js`, trajectory workers.

### 7.4 Level tester

**Status:** Internal/tooling

- Validate a JSON level without simulation.
- Sweep launch candidates with configurable samples and maximum time.
- Require all bonuses.
- Print ASCII trajectories and closest replayable failures.
- Use worker overrides for deterministic parallel execution.
- Select `wasm` (default), `native`, or `js`; native Rust owns simulation, filtering, ranking, and detailed capture for the sweep.

### 7.5 Run transcripts and replay proof

**Status:** Implemented infrastructure; community use is optional

- Proof and simulation versions are explicit.
- Transcripts contain bounded, validated action sequences rather than claimed results.
- Recording captures supported player actions; replay reproduces observable deterministic events and terminal outcomes.
- The server executes verification in shared or worker-isolated runners.

**Owners:** `js/replay/runTranscript.js`, `js/replay/runReplay.js`, `server/services/replayVerifier.js`, verifier worker/pool code.

### 7.6 Debug console and runtime configuration

**Status:** Internal/tooling

- Backquote toggles an in-browser console with history and tab completion.
- Commands expose help, editor entry, level information, JSON export, exact launch/repeat, clearing, and runtime configuration.
- `/setconfig` reads or overrides allowlisted configuration paths for the current runtime without rewriting frozen source configuration.
- `window.game` and `window.gameManager` remain debugging entry points.

### 7.7 Original-level conversion

**Status:** Internal/tooling/compatibility

- Extract readable intermediate definitions from the Director archive.
- Convert the 25 original levels into current JSON.
- Preserve Director-specific gravity behavior through a dedicated orbit compatibility type.
- Verify every shipped port is valid and completable with the shared headless runner.

**Owners:** `tools/extract_original_levels.py`, `tools/convert_original_levels.py`, `testing/verifyOriginalLevelPorts.js`.

## 8. Verification coverage

| Feature area | Automated evidence | Manual/operational evidence |
|---|---|---|
| Simulation, launch, rules, collisions, bonuses, targets | `simulationEngine.test.js`, `goldenTrajectory.test.js`, runtime stability tests | Gravity/orbit, bonus, and level-end harnesses |
| Portals | `portalDirection.test.js`, `portalPresentation.test.js`, simulation/Wasm tests | Production editor/play path |
| Speed boosters | simulation, presentation, browser-Wasm, and headless-Wasm tests | Production editor/play path |
| Black holes | `blackHole.test.js`, `blackHoleEditor.test.js` | Canvas rendering inspection |
| Waypoint motion | `waypointMotion.test.js`, compiled-timeline and editor tests | Editor preview and moving-world play path |
| Aim assist | `aimAssist.test.js` | Settings/gameplay preview |
| Viewport, cameras, portrait guidance, responsive input | `viewport.test.js`, input tests, Playwright mobile smoke | Responsive and mobile harnesses |
| Domain/level schemas, projections, wire layouts, and shipped content | `domainContracts.test.js`, `levelValidation.test.js`, `validateLevels.js`, original-port verification | CLI validation and ASCII searches |
| Editor document, projection, and history | editor architecture/controller, projection, mutator, object-group, level-save tests | Orbit/waypoint/editor manual paths |
| Rust browser/headless parity | `wasmBrowserSimulation.test.js`, `wasmSimulator.test.js`, `nativeSimulator.test.js`, `wasmSimulation.spec.js` | Native/Wasm backend benchmarks and browser bootstrap |
| Gravity Sculpt | `gravitySculptor.test.js`, `wasmGravitySculptor.test.js`, JS/Wasm and mass benchmarks | Editor optimization/test workflow |
| Local scores/settings | `highScoreStore.test.js`, `settingsManager.test.js` | UI screens |
| Community client integration | community client and game integration tests | Configured local server flow |
| Server/API/security behavior | CORS, router, server, and real replay tests | `npm run serve:community` |
| Static packaging and browser bootstrap | syntax, configuration policy, static-server tests, Playwright | `python -m http.server 8000` or `npm run serve` |

The full `npm test` gate runs unit, server, policy, shipped-level, original-port, syntax, and Playwright suites. Manual HTML harnesses are diagnostics and should not be described as automated assertions.

At this snapshot, the refreshed domain/Rust path passed 344 Node unit tests, validation of 25 shipped plus 20 archived manual levels, all 25 original-port trajectory checks, JavaScript syntax checks, generated-contract drift checks, Rust compilation/tests, and browser/headless Wasm/native parity tests.

## 9. Unsupported, partial, and historical capabilities

| Capability | Status | Current definition |
|---|---|---|
| Obstacle entity | Unsupported | Not in the shared loadable vocabulary. |
| File-picker level import | Unsupported | JSON export exists; arbitrary local import does not. |
| Autosave | Unsupported | Save is explicit. |
| Editable cloud levels | Unsupported | Community publications are immutable; edit a local copy and republish as a new record. |
| User accounts/authentication | Unsupported | No identity or ownership service. |
| Persistent campaign progress | Unsupported | No progress store. |
| `timeLimit` rule | Parsed only | Stored/validated but not enforced in production gameplay. |
| `customBehaviors` | Parsed only | Stored but not dispatched; arbitrary JSON code is not supported. |
| JSON custom orbit functions | Compatibility/limited | Cannot be represented; JSON custom type falls back to circular. |
| Original Big Idea Fun leaderboard | Historical only | Current local scores and optional community server are separate systems. |
| Original Shockwave networking | Historical only | `OldSource/` is not a runtime dependency. |
| JavaScript application bundling/transpilation | Unsupported by design | Production JavaScript runs as native ES modules; the Rust simulator has a separate explicit Wasm build whose static artifact is served directly. |
| Service worker/offline install | Unsupported | Static files must be served over HTTP. |

## 10. Feature-to-code index

| Domain | Primary modules |
|---|---|
| Browser lifecycle and frame ownership | `js/main.js`, `js/diagnostics/performanceUtils.js` |
| Game/session coordination | `js/game.js`, `js/runtime/gameSession.js`, `js/runtime/runtimeWorld.js`, `js/ui/views/levelEndScreen.js` |
| Deterministic gameplay | `rust/simulator/src/lib.rs`, `js/simulation/simulationEngine.js`, `js/simulation/simulationState.js`, `js/simulation/simulationGeometry.js` |
| Browser simulation adaptation | `js/runtime/gameSimulationAdapter.js`, `js/simulation/wasmSimulationBridge.js`, `js/runtime/gameEffectsCoordinator.js` |
| Orbits, waypoints, and optimized timelines | `js/simulation/orbitSimulation.js`, `js/simulation/waypointSimulation.js`, `js/simulation/compiledWorldTimeline.js` |
| Canonical schemas and generated contracts | `domain/`, `tools/generateDomainContracts.js`, `generated/` |
| Runtime objects and visuals | `js/runtime/entities/gameObjects.js`, `js/runtime/entities/blackHole.js`, `js/runtime/entities/penguin.js` |
| Levels and validation | `domain/level.schema.json`, `generated/level.schema.json`, `js/levels/levelSchema.js`, `js/levels/levelValidation.js`, `js/levels/levelLoader.js` |
| Cameras and coordinates | `js/rendering/viewport.js`, `js/rendering/viewportGuidanceRenderer.js`, `js/rendering/kevinCamRenderer.js` |
| Input and fullscreen | `js/input/inputActions.js`, `js/platform/browser/fullscreenManager.js` |
| Assets and audio | `js/platform/assets/assetLoader.js`, `js/platform/audio/audioManager.js`, `js/platform/persistence/stellarTrackStore.js` |
| Settings and local scores | `js/platform/settings/settingsManager.js`, `js/platform/settings/settingsStore.js`, `js/ui/views/settingsScreen.js`, `js/platform/persistence/highScoreStore.js` |
| Editor | `js/editor/levelEditor.js`, `js/editor/state/levelDocument.js`, `js/editor/commands/editorCommandBus.js`, `js/editor/services/`, `js/editor/views/` |
| Gravity Sculpt | `js/simulation/gravitySculptor.js`, worker client/entry point, `rust/simulator/src/gravity_sculpt.rs`, gravity-sculpt controller/view modules |
| Catalog and local saves | `js/catalog/levelCatalogService.js`, catalog sources/composition, `js/platform/persistence/levelSaveService.js` |
| Community client/UI | community client, score, upload, leaderboard, and remote catalog modules |
| Replay proof | `js/replay/runTranscript.js`, `js/replay/runReplay.js` |
| Community server | `server/app.js`, `server/routes.js`, services, validation, database, worker pool |
| Rust/Wasm simulator and build | `rust/simulator/`, `testing/buildWasmSimulator.js`, `testing/wasmHeadlessBackend.js` |
| Headless and CI tooling | `testing/headlessEngine.js`, `testing/levelTester.js`, `testing/nativeHeadlessBackend.js`, `testing/benchmarkWasmSimulator.js`, Rust native executable, workers, validators, Playwright |

## 11. Documentation freshness notes

- [README.md](README.md) reflects the optional community service, local editor saves, Rust/Wasm backend, schema generation, and headless usage at this snapshot.
- [ARCHITECTURE.md](ARCHITECTURE.md) is the authority for the document-first editor, deterministic core, schema/generated-contract boundary, and browser/headless ownership rules.
- [levels/README.md](levels/README.md) is the authoring authority for current objects, portals, speed boosters, waypoint paths, schemas, and validation.
- [LEVEL_EDITOR_DOCUMENTATION.md](LEVEL_EDITOR_DOCUMENTATION.md) describes the editor workflow and schema-first extension path; source and tests remain the tie-breaker for newly landed behavior.
- [GAME_OBJECT_EXTENSION_GUIDE.md](GAME_OBJECT_EXTENSION_GUIDE.md) contains the current end-to-end checklist for presentation-only and gameplay object additions, including binary-wire coverage.
- `SpacedPenguin_Documentation.md`, `ORIGINAL_LEVELS_ANALYSIS.md`, and `OldSource/` are historical/provenance sources, not the current runtime contract.

## 12. Maintaining this map

Refresh this document when a change alters a user-visible mechanic, supported object/rule/orbit, settings or persistence behavior, editor workflow, community API, replay protocol, or verification gate. Update status, owner, tests, and limitations together. The reusable workflow lives in [.codex/skills/spaced-penguin/references/feature-mapping.md](.codex/skills/spaced-penguin/references/feature-mapping.md).
