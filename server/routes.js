import { API_VERSIONS, SERVER_LIMITS } from './config.js';
import { ApiError } from './errors.js';
import { readJson, sendJson } from './http.js';
import { publishLevel } from './services/publishLevel.js';
import { submitScore } from './services/submitScore.js';

function publicSummary(level) {
    return {
        id: level.id,
        name: level.name,
        description: level.description,
        objectCount: level.objectCount,
        publishedAt: level.publishedAt,
        definitionHash: level.definitionHash
    };
}

function parseLimit(value, fallback) {
    if (value == null || value === '') return fallback;
    if (!/^\d+$/.test(value)) throw new ApiError(400, 'INVALID_QUERY', 'Limit must be a positive integer.');
    const parsed = Number(value);
    if (parsed < 1 || parsed > SERVER_LIMITS.maxPageSize) throw new ApiError(400, 'INVALID_QUERY', `Limit must be between 1 and ${SERVER_LIMITS.maxPageSize}.`);
    return parsed;
}

function clientIp(request) {
    return request.socket.remoteAddress || 'unknown';
}

export function createApiRoutes({ repository, verifier, limiter }) {
    return [
        {
            method: 'GET', path: '/api/v1/status',
            handler: async ({ request, response }) => sendJson(request, response, 200, API_VERSIONS)
        },
        {
            method: 'GET', path: '/api/v1/levels',
            handler: async ({ request, response, url }) => {
                limiter.check(`read:${clientIp(request)}`, { limit: 120, windowMs: 60_000 });
                const sort = url.searchParams.get('sort') || 'newest';
                if (!['newest', 'oldest', 'name'].includes(sort)) throw new ApiError(400, 'INVALID_QUERY', 'Unsupported level sort.');
                const limit = parseLimit(url.searchParams.get('limit'), SERVER_LIMITS.defaultLevelPageSize);
                const query = (url.searchParams.get('q') || '').trim();
                if (query.length > SERVER_LIMITS.maxSearchLength) throw new ApiError(400, 'INVALID_QUERY', 'Search text is too long.');
                sendJson(request, response, 200, repository.listLevels({ sort, limit, cursor: url.searchParams.get('cursor'), query }));
            }
        },
        {
            method: 'POST', path: '/api/v1/levels',
            handler: async ({ request, response }) => {
                limiter.check(`publish:${clientIp(request)}`, { limit: 5, windowMs: 3_600_000 });
                const payload = await readJson(request, SERVER_LIMITS.publicationBodyBytes);
                const level = await publishLevel({ payload, repository, verifier });
                sendJson(request, response, 201, publicSummary(level), {
                    location: `/api/v1/levels/${level.id}`, etag: `"${level.definitionHash}"`
                });
            }
        },
        {
            method: 'GET', path: '/api/v1/levels/:levelId',
            handler: async ({ request, response, params }) => {
                limiter.check(`read:${clientIp(request)}`, { limit: 120, windowMs: 60_000 });
                const level = repository.getLevel(params.levelId);
                if (!level) throw new ApiError(404, 'LEVEL_NOT_FOUND', 'The requested level was not found.');
                const etag = `"${level.definitionHash}"`;
                const headers = { etag, 'cache-control': 'public, max-age=3600, immutable' };
                if (request.headers['if-none-match'] === etag) sendJson(request, response, 304, undefined, headers);
                else sendJson(request, response, 200, { ...publicSummary(level), definition: level.definition }, headers);
            }
        },
        {
            method: 'GET', path: '/api/v1/levels/:levelId/scores',
            handler: async ({ request, response, url, params }) => {
                limiter.check(`read:${clientIp(request)}`, { limit: 120, windowMs: 60_000 });
                if (!repository.getLevel(params.levelId)) throw new ApiError(404, 'LEVEL_NOT_FOUND', 'The requested level was not found.');
                const limit = parseLimit(url.searchParams.get('limit'), SERVER_LIMITS.defaultScorePageSize);
                sendJson(request, response, 200, repository.listScores(params.levelId, { limit, cursor: url.searchParams.get('cursor') }));
            }
        },
        {
            method: 'POST', path: '/api/v1/levels/:levelId/scores',
            handler: async ({ request, response, params }) => {
                limiter.check(`score:${clientIp(request)}`, { limit: 20, windowMs: 3_600_000 });
                const payload = await readJson(request, SERVER_LIMITS.scoreBodyBytes);
                const submission = await submitScore({ levelId: params.levelId, payload, repository, verifier });
                sendJson(request, response, submission.idempotent ? 200 : 201, {
                    accepted: true, ranked: submission.ranked, rank: submission.rank,
                    idempotent: submission.idempotent, result: submission.item
                });
            }
        }
    ];
}
