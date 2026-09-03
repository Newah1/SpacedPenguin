---
name: spaced-penguin
description: Explore, implement, and document product features, Rust-core gameplay behavior, gameplay objects, architecture, level capabilities, editor behavior, community services, and verification coverage in the Spaced Penguin repository. Use for feature inventories, feature discovery, simulation or gameplay-object changes, scope definition, capability audits, and project onboarding.
---

# Spaced Penguin Project Skill

Use this repository-specific skill to answer questions about what Spaced Penguin does, where a capability is implemented, and whether it is complete, optional, historical, or unsupported.

Start with `AGENTS.md`. Treat `ARCHITECTURE.md` as the architecture authority, `rust/simulator/README.md` and the Rust implementation as the authority for deterministic gameplay behavior, and `README.md` as the operational entry point. The domain schemas remain authoritative for declarative vocabulary and wire layouts. Verify feature claims against current source and tests because documentation can lag recent work. Treat `OldSource/` and historical documents as provenance, not current product behavior.

## Rust gameplay authority

For any change or investigation involving flight, gravity, launch, collision, bonuses, targets, portals, boosters, deflectors, crash/reset behavior, enforced rules, simulation counters, headless trajectories, or Gravity Sculpt evaluation, read `rust/simulator/README.md` before acting. Start behavioral changes in `rust/simulator/src/`; then keep the JavaScript fallback and cross-language parity coverage aligned. Do not infer authority from a parity test that happens to place a JavaScript value in the expected-value position. Final level/campaign score assembly is JavaScript-owned policy outside the Rust step boundary.

Keep the authority boundaries distinct: schemas own data contracts, Rust owns deterministic gameplay behavior, `orbitSimulation.js` owns dependency-ordered moving-world advancement, and browser adapters/effects own environment-facing work. Treat an equivalent-input disagreement as a fallback, wire, adapter, or world-synchronization defect unless the task intentionally changes the Rust semantics.

## Feature mapping

For a complete inventory, capability audit, or generated feature document, read [references/feature-mapping.md](references/feature-mapping.md) and follow it. The default deliverable is `FEATURE_MAP.md` at the repository root unless the user names another output.

## Architecture placement

For decisions about where a new feature belongs, also use the repository's `architecture-compass` skill when it is available. Preserve the deterministic simulation boundary, validation-before-mutation rule, single animation-frame owner, world-coordinate contract, and browser/headless parity.

## Gameplay object implementation

When adding or changing a gameplay-authored object, read [references/gameplay-object-implementation.md](references/gameplay-object-implementation.md) before editing. It covers schema and wire migrations, Rust-first behavior changes, compatibility-fallback parity, moving-world ordering, editor/runtime synchronization, browser presentation, and the verification traps that are easy to miss.

## Maintaining this skill

Validate skill edits with the `skill-creator` skill's `scripts/quick_validate.py`. That validator imports PyYAML; `ModuleNotFoundError: No module named 'yaml'` means the selected Python environment lacks the validator dependency, not that this skill failed validation. Use a Python environment with PyYAML or reproduce the validator's frontmatter, naming, description, and unfinished-placeholder checks before accepting the edit.

