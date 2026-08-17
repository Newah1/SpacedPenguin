import { randomUUID } from 'node:crypto';
import { ApiError } from '../errors.js';
import { decodeCursor, encodeCursor } from '../utils/canonicalJson.js';

function levelSummary(row) {
    return {
        id: row.id,
        name: row.name,
        description: row.description,
        objectCount: row.object_count,
        publishedAt: new Date(row.published_at).toISOString(),
        definitionHash: row.definition_hash
    };
}

function scoreSummary(row) {
    return {
        id: row.id,
        initials: row.initials,
        score: row.score,
        tries: row.tries,
        distance: row.distance,
        bonusScore: row.bonus_score,
        multiplier: row.multiplier,
        achievedAt: new Date(row.achieved_at).toISOString()
    };
}

function escapeLike(value) {
    return value.replace(/[\\%_]/g, character => `\\${character}`);
}

export class LevelRepository {
    constructor(database, { now = Date.now, retainedScores = 1000 } = {}) {
        this.database = database;
        this.now = now;
        this.retainedScores = retainedScores;
    }

    findLevelByHash(hash) {
        return this.database.prepare("SELECT id FROM levels WHERE definition_hash = ?").get(hash);
    }

    insertLevel(record) {
        const id = record.id || randomUUID();
        const publishedAt = record.publishedAt ?? this.now();
        this.database.prepare(`INSERT INTO levels (
            id, name, description, definition_json, definition_hash, completion_proof_json,
            schema_version, simulation_version, object_count, published_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(id, record.name, record.description, record.definitionJson, record.definitionHash,
                record.completionProofJson, record.schemaVersion, record.simulationVersion,
                record.objectCount, publishedAt);
        return this.getLevel(id, { publicOnly: false });
    }

    getLevel(id, { publicOnly = true } = {}) {
        const row = this.database.prepare(`SELECT * FROM levels WHERE id = ? ${publicOnly ? "AND status = 'published'" : ''}`).get(id);
        if (!row) return null;
        return { ...levelSummary(row), definition: JSON.parse(row.definition_json), _row: row };
    }

    listLevels({ sort, limit, cursor, query }) {
        const decoded = cursor ? decodeCursor(cursor) : null;
        if (cursor && (!decoded || decoded.sort !== sort)) throw new ApiError(400, 'INVALID_CURSOR', 'The level cursor is invalid for this sort.');
        const where = ["status = 'published'"];
        const parameters = [];
        if (query) {
            where.push("(name LIKE ? ESCAPE '\\' COLLATE NOCASE OR description LIKE ? ESCAPE '\\' COLLATE NOCASE)");
            const term = `%${escapeLike(query)}%`;
            parameters.push(term, term);
        }
        let order;
        if (sort === 'newest' || sort === 'oldest') {
            const comparison = sort === 'newest' ? '<' : '>';
            const direction = sort === 'newest' ? 'DESC' : 'ASC';
            if (decoded) {
                if (!Number.isSafeInteger(decoded.publishedAt) || typeof decoded.id !== 'string') throw new ApiError(400, 'INVALID_CURSOR', 'Malformed level cursor.');
                where.push(`(published_at ${comparison} ? OR (published_at = ? AND id ${comparison} ?))`);
                parameters.push(decoded.publishedAt, decoded.publishedAt, decoded.id);
            }
            order = `published_at ${direction}, id ${direction}`;
        } else {
            if (decoded) {
                if (typeof decoded.name !== 'string' || typeof decoded.id !== 'string') throw new ApiError(400, 'INVALID_CURSOR', 'Malformed level cursor.');
                where.push('(name COLLATE NOCASE > ? COLLATE NOCASE OR (name COLLATE NOCASE = ? COLLATE NOCASE AND id > ?))');
                parameters.push(decoded.name, decoded.name, decoded.id);
            }
            order = 'name COLLATE NOCASE ASC, id ASC';
        }
        parameters.push(limit + 1);
        const rows = this.database.prepare(`SELECT * FROM levels WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ?`).all(...parameters);
        const hasMore = rows.length > limit;
        const page = rows.slice(0, limit);
        const last = page.at(-1);
        const nextCursor = hasMore ? encodeCursor(sort === 'name'
            ? { sort, name: last.name, id: last.id }
            : { sort, publishedAt: last.published_at, id: last.id }) : null;
        return { items: page.map(levelSummary), nextCursor };
    }

    findScoreByIdempotency(levelId, key) {
        return this.database.prepare('SELECT * FROM level_scores WHERE level_id = ? AND idempotency_key = ?').get(levelId, key);
    }

    insertScore(record) {
        this.database.exec('BEGIN IMMEDIATE');
        try {
            const existing = this.findScoreByIdempotency(record.levelId, record.idempotencyKey);
            if (existing) {
                if (existing.request_hash !== record.requestHash) throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency key was already used for a different submission.');
                this.database.exec('COMMIT');
                return { item: scoreSummary(existing), rank: this.rankScore(existing), idempotent: true, ranked: true };
            }
            const id = record.id || randomUUID();
            const achievedAt = record.achievedAt ?? this.now();
            this.database.prepare(`INSERT INTO level_scores (
                id, level_id, initials, score, tries, distance, bonus_score, multiplier,
                proof_json, proof_hash, request_hash, simulation_version, score_version,
                idempotency_key, achieved_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
                .run(id, record.levelId, record.initials, record.score, record.tries, record.distance,
                    record.bonusScore, record.multiplier, record.proofJson, record.proofHash,
                    record.requestHash, record.simulationVersion, record.scoreVersion,
                    record.idempotencyKey, achievedAt);
            const inserted = this.database.prepare('SELECT * FROM level_scores WHERE id = ?').get(id);
            const rank = this.rankScore(inserted);
            if (rank > this.retainedScores) {
                this.database.prepare('DELETE FROM level_scores WHERE id = ?').run(id);
                this.database.exec('COMMIT');
                return { item: scoreSummary(inserted), rank: null, idempotent: false, ranked: false };
            }
            this.database.prepare(`DELETE FROM level_scores WHERE level_id = ? AND id IN (
                SELECT id FROM level_scores WHERE level_id = ? ORDER BY score DESC, achieved_at ASC, id ASC LIMIT -1 OFFSET ?
            )`).run(record.levelId, record.levelId, this.retainedScores);
            this.database.exec('COMMIT');
            return { item: scoreSummary(inserted), rank, idempotent: false, ranked: true };
        } catch (error) {
            try { this.database.exec('ROLLBACK'); } catch { /* transaction already closed */ }
            throw error;
        }
    }

    rankScore(row) {
        const result = this.database.prepare(`SELECT COUNT(*) + 1 AS rank FROM level_scores
            WHERE level_id = ? AND (score > ? OR (score = ? AND achieved_at < ?)
            OR (score = ? AND achieved_at = ? AND id < ?))`)
            .get(row.level_id, row.score, row.score, row.achieved_at, row.score, row.achieved_at, row.id);
        return Number(result.rank);
    }

    listScores(levelId, { limit, cursor }) {
        const decoded = cursor ? decodeCursor(cursor) : null;
        if (cursor && (!decoded || !Number.isSafeInteger(decoded.score) || !Number.isSafeInteger(decoded.achievedAt) || typeof decoded.id !== 'string')) {
            throw new ApiError(400, 'INVALID_CURSOR', 'The score cursor is invalid.');
        }
        const parameters = [levelId];
        let continuation = '';
        if (decoded) {
            continuation = `AND (score < ? OR (score = ? AND achieved_at > ?)
                OR (score = ? AND achieved_at = ? AND id > ?))`;
            parameters.push(decoded.score, decoded.score, decoded.achievedAt, decoded.score, decoded.achievedAt, decoded.id);
        }
        parameters.push(limit + 1);
        const rows = this.database.prepare(`SELECT * FROM level_scores WHERE level_id = ? ${continuation}
            ORDER BY score DESC, achieved_at ASC, id ASC LIMIT ?`).all(...parameters);
        const hasMore = rows.length > limit;
        const page = rows.slice(0, limit);
        const last = page.at(-1);
        return {
            items: page.map(scoreSummary),
            nextCursor: hasMore ? encodeCursor({ score: last.score, achievedAt: last.achieved_at, id: last.id }) : null
        };
    }
}
