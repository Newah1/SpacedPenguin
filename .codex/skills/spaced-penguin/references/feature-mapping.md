# Feature Mapping Workflow

Use this workflow to discover, define, and maintain an evidence-backed feature map for Spaced Penguin.

## Scope and evidence

Map current product behavior across the browser game, level format, embedded editor, local persistence, optional community server, developer tooling, and quality gates. Exclude `OldSource/` behavior unless it is explicitly implemented in current `js/`, `server/`, `levels/`, or tooling code.

Inspect, at minimum:

- `README.md`, `ARCHITECTURE.md`, `LEVEL_EDITOR_DOCUMENTATION.md`, and `levels/README.md`.
- `package.json` and `app-config.js` for runnable surfaces and optional configuration.
- `js/main.js`, `js/game.js`, `js/simulationEngine.js`, `js/simulationState.js`, and `js/gameSimulationAdapter.js` for player-visible behavior.
- `js/levelSchema.js`, `js/levelValidation.js`, `js/levelLoader.js`, and object implementations for authored capabilities.
- Catalog, save, score, settings, audio, input, viewport, editor, replay, and headless modules relevant to claims being added.
- `server/routes.js`, server services, validation, and storage code for community features.
- Automated and manual test filenames to record meaningful coverage without claiming that a test proves more than it asserts.

When documentation conflicts with executable code, record the discrepancy and prefer current source plus tests. Do not count a class, configuration field, or parser branch as a finished feature unless a user or supported integration path reaches it.

## Status vocabulary

Assign one primary status to every feature or cohesive feature group:

- **Implemented:** reachable in the supported product and backed by current code.
- **Optional:** implemented but activated only by configuration, user opt-in, or an optional service.
- **Editor-only:** available to level authors but not a distinct player-facing mechanic.
- **Compatibility:** retained for shipped, historical, or exported data; not recommended for new authoring.
- **Parsed only:** accepted or retained but not enforced or dispatched.
- **Internal/tooling:** developer, testing, conversion, or diagnostic capability.
- **Unsupported:** explicitly rejected, absent, or documented as a non-goal.
- **Unverified:** plausible from code or documentation but not sufficiently traced to a supported path.

Use specific limitations instead of upgrading partial behavior to “implemented.” For example, distinguish local saves from file import, immutable community publication from editable cloud projects, and parsed level rules from enforced rules.

## Feature record

For each material feature, capture the fields that add useful information:

- Feature name and status.
- User or operator value.
- Entry point or trigger.
- Behavioral definition and important edge cases.
- Owning modules and major collaborators.
- Persistence or external dependency, if any.
- Level/schema impact, if any.
- Verification evidence or test surface.
- Known limitations, exclusions, or follow-on work.

Group small, tightly related capabilities into a table or subsection. Give complex mechanics—simulation, editor, level model, community publication, and replay verification—enough prose to define their contract.

## Required output structure

Generate a navigable Markdown document with:

1. Purpose, snapshot date, scope, and status legend.
2. Product surfaces and user roles.
3. Player/gameplay features.
4. World objects, level format, orbits, cameras, and rules.
5. Rendering, input, audio, accessibility/responsiveness, and settings.
6. Level editor and local authoring lifecycle.
7. Catalog, local persistence, community publication, and leaderboards.
8. Deterministic simulation, headless tools, diagnostics, and conversion tooling.
9. Verification coverage by feature area.
10. Unsupported, parsed-only, historical, and deferred capabilities.
11. Feature-to-code index and documentation freshness notes.

Use relative repository links in the generated Markdown. Keep the map detailed enough for planning and onboarding, while avoiding line-by-line module summaries or duplicated architecture prose.

## Refresh procedure

When updating an existing feature map:

1. Read its snapshot metadata and freshness notes.
2. Inspect changes since the map's last revision when Git history is available; otherwise rescan relevant feature entry points.
3. Update status, behavior, owners, tests, and limitations together.
4. Search for newly added source modules and test files that are absent from the map.
5. Recheck all “unsupported” and “parsed only” claims against current schema, runtime, editor, and server code.
6. Leave architectural debt in `ARCHITECTURE.md`; the feature map should link to it and explain only product-facing impact.

