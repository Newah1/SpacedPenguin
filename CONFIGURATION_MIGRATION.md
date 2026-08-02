# Configuration Migration

## Objective

Move product policy, gameplay tuning, environment paths, and reusable defaults out of implementation code without changing shipped-level behavior. Authored level values remain in level JSON; mathematical identities, transient state, loop mechanics, and one-off test inputs remain local.

## Configuration ownership

- `js/config/gameConfig.js`: stage and flight bounds, level catalog policy, deterministic simulation tuning, physics defaults, and fallback entity defaults.
- `js/config/renderConfig.js`: render layers, starfield, camera, sprite, and effect tuning.
- `js/config/uiConfig.js`: shared theme tokens and screen/component layout. DOM presentation should prefer CSS classes and custom properties.
- `js/config/inputConfig.js`: responsive breakpoints, tap/press timing, vibration, and orientation settling.
- `js/config/editorConfig.js`: editor interaction policy, authoring defaults, property metadata, grid, and overlays.
- `js/config/assetConfig.js`: asset roots, manifest paths, resolvers, and supported media types.
- `js/config/audioConfig.js`: master volume and semantic event-to-cue settings.
- `testing/trajectoryConfig.js`: CLI search, worker, capture, and ASCII presentation defaults that are not runtime behavior.

Configuration objects are deeply frozen. Existing exported constants may temporarily re-export configuration values while consumers migrate.

## Migration phases

1. Establish the configuration modules and invariant tests. Characterize browser/headless parity before replacing duplicated values.
2. Migrate high-risk shared behavior: stage/bounds, level catalog ranges, gravity, entity defaults, slingshot launch curve, orbit physics, and collision response.
3. Make level normalization the common defaulting boundary for the loader, simulation state, runtime factories, editor creation/repair, and export.
4. Migrate runtime timing, responsive/input policy, rendering, editor interaction, and UI theme/layout. Move inline DOM styling to CSS variables where practical.
5. Migrate headless/CLI search policy, worker thresholds, asset resolution, and semantic audio cues.
6. Update documentation and add contract/static checks for duplicated critical defaults.

## Compatibility rules

- Use nullish fallback (`??`) whenever zero, false, or an empty string can be a valid override.
- Preserve the existing 19 shipped levels and the separate procedural range through level 25.
- Preserve the existing expanded flight bounds exactly; extraction must not silently "correct" their geometry.
- Keep legacy 60 Hz calibration explicit until simulation tuning is intentionally redesigned.
- Do not make level-authored positions, orbits, rules, or object properties global configuration.
- Do not turn mathematical identities or derived values into tuning knobs.

## Verification gates

- All shipped levels validate.
- Browser/runtime and headless state construction share the same defaults.
- Sequential and worker simulations remain deterministic.
- Explicit zero-valued overrides survive normalization.
- Every phase passes the full Node test suite and `git diff --check`.

## Completion status

All six migration phases are implemented. The central configuration modules now own shared gameplay, schema defaults, simulation, rendering, UI, input, editor, assets, audio, runtime, and trajectory-tool policy. `LevelSchema.normalizeLevelDefinition` is the common boundary for browser loading, runtime factories, deterministic state construction, and editor round-tripping.

The remaining numeric literals in implementation code are deliberately local: mathematical identities, Canvas geometry percentages, authored CSS dimensions, loop/index mechanics, transient state, and scenario-specific test inputs. New reusable policy belongs in the domain configuration module above and should be protected by a focused invariant or policy-location test.
