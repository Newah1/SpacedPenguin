import { DatabaseSync } from 'node:sqlite';

const MIGRATION = `
CREATE TABLE IF NOT EXISTS levels (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    definition_json TEXT NOT NULL,
    definition_hash TEXT NOT NULL UNIQUE,
    completion_proof_json TEXT NOT NULL,
    schema_version INTEGER NOT NULL,
    simulation_version INTEGER NOT NULL,
    object_count INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'published',
    published_at INTEGER NOT NULL,
    CHECK (status IN ('published', 'hidden')),
    CHECK (object_count >= 0)
) STRICT;
CREATE INDEX IF NOT EXISTS levels_newest ON levels(status, published_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS levels_oldest ON levels(status, published_at ASC, id ASC);
CREATE INDEX IF NOT EXISTS levels_name ON levels(status, name COLLATE NOCASE, id);

CREATE TABLE IF NOT EXISTS level_scores (
    id TEXT PRIMARY KEY,
    level_id TEXT NOT NULL REFERENCES levels(id),
    initials TEXT NOT NULL,
    score INTEGER NOT NULL,
    tries INTEGER NOT NULL,
    distance REAL NOT NULL,
    bonus_score INTEGER NOT NULL,
    multiplier REAL NOT NULL,
    proof_json TEXT NOT NULL,
    proof_hash TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    simulation_version INTEGER NOT NULL,
    score_version INTEGER NOT NULL,
    idempotency_key TEXT NOT NULL,
    achieved_at INTEGER NOT NULL,
    CHECK (length(initials) = 3),
    CHECK (score >= 0),
    CHECK (tries > 0)
) STRICT;
CREATE INDEX IF NOT EXISTS level_scores_ranking
    ON level_scores(level_id, score DESC, achieved_at ASC, id ASC);
CREATE UNIQUE INDEX IF NOT EXISTS level_scores_idempotency
    ON level_scores(level_id, idempotency_key);
`;

export function openDatabase(path = ':memory:') {
    const database = new DatabaseSync(path);
    database.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    if (path !== ':memory:') database.exec('PRAGMA journal_mode = WAL;');
    database.exec(MIGRATION);
    return database;
}
