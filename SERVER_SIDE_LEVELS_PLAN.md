# Server-Side Levels and Leaderboards Plan

## 1. Final product decisions

- The server is an optional Node.js component backed by SQLite.
- The static client remains fully usable when no server is configured.
- Local saves and remote publishing are separate, explicit actions.
- A published level is immutable. There is no public update, overwrite, or delete API.
- Editing a local copy of a published level and publishing it creates a new level ID.
- Every publication includes a completion proof that the server independently replays.
- Every published level has its own leaderboard.
- Score submission is opt-in and uses exactly three ASCII letters for initials.
- The server calculates scores by replaying player actions; client-supplied scores are never authoritative.
- IP addresses are used only for abuse controls. They are not authorship or ownership credentials.
- Level screenshots are generated and cached by clients from downloaded definitions. The server does not store screenshots in v1.

## 2. Scope and non-goals

### In scope

- Publish verified user-made levels.
- Browse and search published levels with stable cursor pagination.
- Sort by newest publication, oldest publication, and name.
- Download immutable level definitions.
- Submit and browse server-validated per-level scores.
- Preserve local-only behavior and local saves.
- Bound payload size, structural complexity, simulation cost, and request frequency.
- Hide a publication administratively without modifying its contents.

### Deferred

- Accounts, public author profiles, ownership, and editing publications.
- Ratings, comments, reports UI, favorites, and play-count ranking.
- Server-rendered thumbnails.
- Multiple writable server instances.
- General full-text search infrastructure beyond SQLite capabilities.

## 3. Required deterministic simulation work

Server verification must use the same level normalization, physics, collision, orbit, rule, reset, and scoring code as the browser. No server-specific physics implementation is permitted.

The current `GameManager` already advances gameplay through an exact 1/60-second accumulator, matching the normal Node trajectory step. Community proof recording should preserve that contract and make its tick identity explicit:

1. Add an integer `runTick` advanced once for every existing fixed 60 Hz gameplay step.
2. Queue gameplay actions to the next simulation tick boundary.
3. Verify that pause produces no ticks and fast-forward consumes ticks faster without changing their size.
4. Create one shared attempt-reset function used by the browser and verifier. It must explicitly define which state is preserved:
   - Preserve the global run tick and total tries.
   - Preserve rule counters that intentionally span attempts, such as planet collisions.
   - Preserve or reset moving-world state according to the chosen gameplay behavior, identically in both environments.
   - Reset the penguin, bonuses, successful-attempt distance, and attempt bonus score.
5. Extract a production-neutral verifier from the current Node headless tooling. It belongs under `js/`, not `testing/`.
6. Add golden fixtures proving that browser execution and Node replay produce identical events and scores.

Recommended shared modules:

```text
js/replay/runTranscript.js
js/replay/runReplay.js
js/replay/communityScore.js
js/levelPublishingPolicy.js
```

## 4. Proof protocol

Both level publication and leaderboard submission use the same versioned run transcript. Sampled trajectory coordinates, reported collisions, reported bonuses, and reported outcomes are not accepted.

```json
{
  "proofVersion": 1,
  "simulationVersion": 1,
  "actions": [
    {
      "tick": 30,
      "type": "launch",
      "angle": 48.04387568555759,
      "power": 53.76599634369287
    },
    {
      "tick": 300,
      "type": "retry"
    },
    {
      "tick": 330,
      "type": "launch",
      "angle": 51.5,
      "power": 61.25
    }
  ]
}
```

Rules for a valid transcript:

- Ticks are non-negative, safe integers in strictly increasing order.
- Only `launch` and explicit player `retry` actions are recorded in v1.
- Launch angle and power must be finite and legal for the stored slingshot.
- A launch is legal only when the penguin is ready at the slingshot.
- A retry is legal only when gameplay permits it.
- Automatic collisions, target outcomes, bonus collection, out-of-bounds outcomes, and automatic resets are derived by replay and are not client claims.
- Replay begins from a fresh normalized level state at tick zero.
- Replay ends at the first target hit or terminal rule failure.
- Actions after a terminal event are invalid.
- A publication proof is accepted only if replay reaches the target and satisfies all victory rules.
- A score proof is accepted only if replay reaches the target and its computed score equals `claimedScore`.

Initial resource limits, kept in one server policy module:

- At most 20 recorded actions.
- At most 10 launches, further restricted by the level's `maxTries` rule.
- At most 7,200 flight ticks for any single attempt.
- At most 10,800 total run ticks, including waiting and retries.
- At most five seconds of verifier wall-clock time.
- A bounded worker pool with no more than four verification workers and a bounded pending queue.

These are initial operational values and should be adjusted only after benchmark tests with worst-case accepted levels.

## 5. Community score definition

Community scores are isolated per-level scores. They do not include campaign totals or previous completions. The existing shared score function should be invoked with a neutral level factor and zero prior score, producing:

```text
baseScore  = floor(successfulAttemptDistance / totalTries)
rawScore   = baseScore + successfulAttemptBonusPoints
finalScore = floor(rawScore * levelScoreMultiplier)
```

The server returns and stores the calculated breakdown. The client may calculate the same value for immediate display, but ranking always uses the server result.

The current formula rewards distance rather than efficiency. That behavior is preserved for compatibility, but it means deliberately long successful paths can score better. Changing that is a separate game-design decision and would require a new `simulationVersion` or `scoreVersion`.

## 6. Client configuration and fallback

Deployment configuration is separate from gameplay/debug configuration:

```js
globalThis.__SPACED_PENGUIN_APP_CONFIG__ = {
    levelServer: {
        baseUrl: null,
        requestTimeoutMs: 8000
    }
};
```

A small external `app-config.js` loaded before the main module is recommended. The default checked-in file sets `baseUrl` to `null`; a deployment can replace it without rebuilding the game.

Behavior:

| State | Behavior |
| --- | --- |
| No server URL | Register the local catalog only. Do not probe a server. |
| Server configured and healthy | Show `My Levels` and `Community Levels` sources. |
| Server configured but unavailable | Keep all local behavior working and show a retryable community-source error. |
| Invalid server configuration | Log a clear configuration error and use local-only mode. |

Saving locally never uploads. Publishing is an explicit action available only when a server is configured and the current local revision has a successful proof. Any edit invalidates that proof.

Add a `RemoteLevelCatalogSource` implementing the existing `query`, `getDetails`, and `getDefinition` interface. Keep source-qualified references such as `{ source: "community", id: "..." }` to prevent collisions with local IDs.

Community definitions may be cached in IndexedDB by level ID plus definition hash. Local authored levels may continue using the existing local repository initially. A remote failure must never be represented as an empty catalog result.

For separate-origin hosting, require HTTPS outside local development and configure an explicit server CORS allowlist. Never accept a server URL from an untrusted query parameter.

## 7. User flows

### Local authoring and publication

1. The user edits and saves locally.
2. Any edit clears the previous completion proof.
3. Test mode starts a fresh fixed-tick run and records actions.
4. A target hit freezes a valid proof for that exact local definition hash.
5. Publish sends the definition and proof.
6. The server validates, replays, and creates an immutable publication.
7. The local record stores the returned community reference for navigation only; it grants no ownership.
8. Further editing and publishing creates another independent publication.

### Playing and optional score upload

1. Loading or restarting a community level starts a fresh scored run.
2. The client records actions until target completion.
3. The client displays its locally calculated score immediately.
4. The client asks whether the player wants to upload the score.
5. If accepted, prompt for exactly three initials, remembering the last valid value locally.
6. Submit the immutable level ID, claimed score, and transcript.
7. The server replays and returns the authoritative score and rank.
8. Network failure leaves a manual Retry Upload option. Upload is never retried automatically.

## 8. HTTP API

All endpoints are under `/api/v1`. Errors use a stable envelope:

```json
{
  "error": {
    "code": "COMPLETION_PROOF_FAILED",
    "message": "The submitted run did not complete the level.",
    "details": { "reason": "planet_collision" }
  }
}
```

### `GET /api/v1/status`

Returns API, schema, proof, simulation, and score versions. The client can detect incompatibility without attempting a publication.

### `GET /api/v1/levels`

Query parameters:

- `sort=newest|oldest|name`, default `newest`.
- `limit`, default 24 and maximum 100.
- `cursor`, an opaque keyset cursor.
- `q`, optional search text with a conservative length limit.

Results contain summaries only: ID, name, description, object count, timestamps, and definition hash. `newest` uses `(published_at DESC, id DESC)` and its cursor contains both values. Do not use offset pagination.

### `GET /api/v1/levels/:id`

Returns immutable metadata and the normalized definition. Support `ETag`, `If-None-Match`, cache headers, and HTTP gzip/Brotli compression.

### `POST /api/v1/levels`

```json
{
  "schemaVersion": 1,
  "simulationVersion": 1,
  "level": {},
  "completionProof": {}
}
```

Returns `201` with the new level summary. Exact canonical duplicates return `409 DUPLICATE_LEVEL`, optionally including the existing public ID.

### `GET /api/v1/levels/:id/scores`

Accepts `limit`, default 10 and maximum 100, plus an optional keyset cursor. Sort by `(score DESC, achieved_at ASC, id ASC)`.

### `POST /api/v1/levels/:id/scores`

```json
{
  "initials": "KEV",
  "claimedScore": 1450,
  "simulationVersion": 1,
  "scoreVersion": 1,
  "proof": {},
  "idempotencyKey": "client-generated-uuid"
}
```

Initials are trimmed, uppercased, and then required to match `^[A-Z]{3}$`; malformed values are rejected rather than truncated. The idempotency key makes a user-directed retry safe. A successful response includes authoritative score, tries, distance, bonus score, multiplier, and current rank.

Two players can legitimately produce the same action transcript, so proof hashes are not globally unique. A unique idempotency key prevents accidental duplicate insertion without treating the proof as personal identity.

## 9. Validation and publication pipeline

Apply these stages in order:

1. **Transport policy**
   - Require JSON.
   - Level publication decoded-body limit: 128 KiB.
   - Score submission decoded-body limit: 16 KiB.
   - Do not accept compressed request bodies initially. Compress responses instead.
2. **API schema validation**
   - Reject unknown top-level fields.
   - Validate versions, finite numbers, strings, arrays, and transcript shape.
3. **Complexity policy**
   - Maximum 128 level objects.
   - Maximum JSON nesting depth 12.
   - Name maximum 80 characters.
   - Description maximum 1,000 characters.
   - Bound per-object and aggregate text, orbit-source counts, and nested arrays.
4. **Shared level validation**
   - Run `validateLevelDefinition`.
   - Apply a stricter public publishing policy that whitelists supported properties.
   - Reject custom behaviors, executable concepts, unenforced rules, and custom-orbit fallbacks.
   - Bound positions, dimensions, radii, mass, gravitational reach, orbit speed, bonus values, multipliers, and rule values.
5. **Canonicalization**
   - Normalize with shared code.
   - Serialize with stable key order.
   - Calculate SHA-256 for duplicate detection and ETags.
6. **Worker replay**
   - Replay from the canonical definition using the shared fixed-tick engine.
   - Enforce tick, action, queue, and wall-clock limits.
7. **Transaction**
   - Insert only after replay succeeds.
   - Recheck duplicate or idempotency constraints within the transaction.

Never return complete failed trajectories from validation endpoints; that would expose a server-hosted trajectory-solving service.

## 10. SQLite data model

Use random UUIDs for public IDs and integer UTC epoch milliseconds for timestamps.

```sql
CREATE TABLE levels (
    id                   TEXT PRIMARY KEY,
    name                 TEXT NOT NULL,
    description          TEXT NOT NULL DEFAULT '',
    definition_json      TEXT NOT NULL,
    definition_hash      TEXT NOT NULL UNIQUE,
    completion_proof_json TEXT NOT NULL,
    schema_version       INTEGER NOT NULL,
    simulation_version   INTEGER NOT NULL,
    object_count         INTEGER NOT NULL,
    status               TEXT NOT NULL DEFAULT 'published',
    published_at         INTEGER NOT NULL,

    CHECK (status IN ('published', 'hidden')),
    CHECK (object_count >= 0)
) STRICT;

CREATE INDEX levels_newest
    ON levels(status, published_at DESC, id DESC);

CREATE INDEX levels_oldest
    ON levels(status, published_at ASC, id ASC);

CREATE INDEX levels_name
    ON levels(status, name COLLATE NOCASE, id);

CREATE TABLE level_scores (
    id                  TEXT PRIMARY KEY,
    level_id            TEXT NOT NULL REFERENCES levels(id),
    initials            TEXT NOT NULL,
    score               INTEGER NOT NULL,
    tries               INTEGER NOT NULL,
    distance            REAL NOT NULL,
    bonus_score         INTEGER NOT NULL,
    multiplier          REAL NOT NULL,
    proof_json          TEXT NOT NULL,
    proof_hash          TEXT NOT NULL,
    simulation_version  INTEGER NOT NULL,
    score_version       INTEGER NOT NULL,
    idempotency_key     TEXT NOT NULL,
    achieved_at         INTEGER NOT NULL,

    CHECK (length(initials) = 3),
    CHECK (score >= 0),
    CHECK (tries > 0)
) STRICT;

CREATE INDEX level_scores_ranking
    ON level_scores(level_id, score DESC, achieved_at ASC, id ASC);

CREATE UNIQUE INDEX level_scores_idempotency
    ON level_scores(level_id, idempotency_key);
```

Retain at most the best 1,000 entries per level initially. After a verified insertion, trim lower-ranked entries in the same transaction. A valid score below the retention cutoff returns a valid-but-not-ranked result and need not be stored.

Use foreign keys, prepared statements, a busy timeout, and WAL mode. Keep the SQLite file and its WAL files on one host-local persistent volume. Back up using a SQLite-aware backup operation rather than copying only the main file while it is active.

## 11. Server implementation

Recommended stack:

- Node.js ESM, pinned to a Node 22 release that provides `node:sqlite` without a command-line flag.
- Fastify for routing and JSON-schema validation.
- `@fastify/compress` for responses.
- `@fastify/rate-limit` for initial abuse controls.
- `node:worker_threads` for simulation verification.
- `node:crypto` for UUIDs and SHA-256.

Hide SQLite behind a repository interface because `node:sqlite` is synchronous and remains an implementation choice rather than a domain dependency.

```text
server/
  app.js
  config.js
  routes/
    status.js
    levels.js
    scores.js
  services/
    publishLevel.js
    submitScore.js
  workers/
    verifierPool.js
    verifierWorker.js
  db/
    database.js
    migrations/
  validation/
    apiSchemas.js
```

## 12. Abuse, privacy, and content controls

- Apply separate read, publication, and score-submission rate limits.
- Initial publication limit: approximately 5 attempts per hour per IP.
- Initial score limit: approximately 20 attempts per hour per IP.
- Bound the verification queue and return `429` or `503` when saturated.
- Resolve client IP from the socket unless requests arrive through explicitly trusted proxy ranges or hop counts.
- Never enable unrestricted proxy trust.
- Use IP only for transient or short-retention abuse records, not public identity.
- Treat all level metadata and initials as untrusted display text; never inject them as HTML.
- Maintain a small configurable blocked-initials/content list if needed.
- Keep `hidden` status and a private administrative hide operation from the beginning.
- Log publication and score rejection codes, not entire user payloads by default.

The server proves that a transcript is valid, not that a human personally performed it. Without accounts or server-issued live challenges, a player can share or generate a valid proof offline. That limitation is acceptable for v1 and should be stated plainly.

## 13. Versioning

Maintain independent integers:

- `schemaVersion`: level JSON contract.
- `proofVersion`: transcript structure and action semantics.
- `simulationVersion`: physics, reset, orbit, and rule semantics.
- `scoreVersion`: leaderboard formula.

Reject incompatible clients with a stable `409 CLIENT_VERSION_UNSUPPORTED` response. Store all relevant versions with each publication and score. Before changing simulation or scoring behavior, replay the golden corpus and run an offline compatibility report over existing publications.

## 14. Testing and acceptance criteria

### Shared simulation tests

- Browser fixed-tick execution equals Node replay.
- Waiting before launch preserves moving-object phase.
- Manual and automatic retries behave identically.
- Fast-forward changes wall time only.
- Bonus, collision, target, and rule events match exactly.
- Community score breakdown matches the shared formula.

### Validation and security tests

- Oversized, deeply nested, unknown-field, non-finite, and excessive-object payloads fail before replay.
- Extreme numeric values and unsupported behaviors are rejected.
- Illegal, unordered, post-terminal, and overly long transcripts are rejected.
- Claimed-score mismatches are rejected.
- Duplicate publication and idempotent score retry behavior is stable.
- User text is rendered as text, not HTML.

### API and database tests

- Cursor pagination has no duplicates or skips during concurrent publication.
- All supported sorts use deterministic tie-breakers.
- Hidden levels disappear from public reads without being rewritten.
- A failed replay never writes a level or score.
- Concurrent score insertions produce deterministic ranks and bounded retention.
- ETags and conditional definition reads work.
- Restart and backup/restore preserve data.

### Client tests

- No configuration produces a fully functional local-only game.
- A healthy server adds the community source.
- An unavailable server does not break local save, edit, browse, or play.
- Editing invalidates publication proof.
- Score upload is opt-in and never silently retried.
- Three-letter initials are normalized and validated consistently.

## 15. Delivery phases

1. **Determinism foundation**
   - True fixed-step run ticks, shared reset semantics, transcript recorder, replay service, and golden tests.
2. **Optional remote catalog**
   - Deployment configuration, remote source, local fallback, read API, SQLite migrations, caching, and pagination.
3. **Immutable publishing**
   - Public-level policy, canonicalization, verifier pool, publication endpoint, and editor Publish flow.
4. **Leaderboards**
   - Community score function, score verifier, initials prompt, score endpoints, ranking, and retention.
5. **Hardening and operations**
   - Rate limits, queue limits, moderation hook, metrics, backups, restore test, load tests, and deployment documentation.

Each phase should land with its tests before the next begins. The server is not authoritative until Phase 1 has eliminated browser/server timing and reset drift.
