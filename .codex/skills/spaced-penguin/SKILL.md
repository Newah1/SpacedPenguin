---
name: spaced-penguin
description: Explore, implement, and document product features, gameplay objects, architecture, level capabilities, editor behavior, community services, and verification coverage in the Spaced Penguin repository. Use for feature inventories, feature discovery, gameplay-object changes, scope definition, capability audits, and project onboarding.
---

# Spaced Penguin Project Skill

Use this repository-specific skill to answer questions about what Spaced Penguin does, where a capability is implemented, and whether it is complete, optional, historical, or unsupported.

Start with `AGENTS.md`. Treat `ARCHITECTURE.md` as the architecture authority and `README.md` as the operational entry point, but verify feature claims against current source and tests because documentation can lag recent work. Treat `OldSource/` and historical documents as provenance, not current product behavior.

## Feature mapping

For a complete inventory, capability audit, or generated feature document, read [references/feature-mapping.md](references/feature-mapping.md) and follow it. The default deliverable is `FEATURE_MAP.md` at the repository root unless the user names another output.

## Architecture placement

For decisions about where a new feature belongs, also use the repository's `architecture-compass` skill when it is available. Preserve the deterministic simulation boundary, validation-before-mutation rule, single animation-frame owner, world-coordinate contract, and browser/headless parity.

## Gameplay object implementation

When adding or changing a gameplay-authored object, read [references/gameplay-object-implementation.md](references/gameplay-object-implementation.md) before editing. It covers schema and wire migrations, JavaScript/Rust parity, moving-world ordering, editor/runtime synchronization, browser presentation, and the verification traps that are easy to miss.

## Maintaining this skill

Validate skill edits with the `skill-creator` skill's `scripts/quick_validate.py`. That validator imports PyYAML; `ModuleNotFoundError: No module named 'yaml'` means the selected Python environment lacks the validator dependency, not that this skill failed validation. Use a Python environment with PyYAML or reproduce the validator's frontmatter, naming, description, and unfinished-placeholder checks before accepting the edit.

