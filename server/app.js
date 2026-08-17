import http from 'node:http';
import { SERVER_LIMITS } from './config.js';
import { openDatabase } from './db/database.js';
import { LevelRepository } from './db/levelRepository.js';
import { ApiError, errorBody } from './errors.js';
import { sendJson } from './http.js';
import { MemoryRateLimiter } from './rateLimiter.js';
import { Router } from './router.js';
import { createApiRoutes } from './routes.js';
import { VerifierPool } from './services/verifierPool.js';

function setCors(request, response, configuredOrigins) {
    if (!configuredOrigins) return;
    const origin = request.headers.origin;
    const allowedOrigins = Array.isArray(configuredOrigins) ? configuredOrigins : [configuredOrigins];
    if (allowedOrigins.includes(origin)) {
        response.setHeader('access-control-allow-origin', origin);
        response.setHeader('vary', 'Origin');
    }
}

export function createLevelServer(options = {}) {
    const database = options.database || openDatabase(options.databasePath || ':memory:');
    const repository = options.repository || new LevelRepository(database, {
        now: options.now,
        retainedScores: options.retainedScores ?? SERVER_LIMITS.retainedScoresPerLevel
    });
    const verifier = options.verifier || new VerifierPool(options.verifierPool);
    const limiter = options.rateLimiter || new MemoryRateLimiter(options.now);
    const corsOrigins = options.corsOrigins || options.corsOrigin || null;
    const logger = options.logger || console;
    const router = new Router();
    for (const route of createApiRoutes({ repository, verifier, limiter })) router.route(route);

    const server = http.createServer(async (request, response) => {
        setCors(request, response, corsOrigins);
        try {
            if (request.method === 'OPTIONS' && corsOrigins) {
                sendJson(request, response, 204, undefined, {
                    'access-control-allow-methods': 'GET, POST, OPTIONS',
                    'access-control-allow-headers': 'Content-Type, If-None-Match'
                });
                return;
            }
            const handled = await router.dispatch(request, response);
            if (!handled) throw new ApiError(404, 'NOT_FOUND', 'The requested endpoint was not found.');
        } catch (error) {
            const apiError = error instanceof ApiError ? error : new ApiError(500, null, 'Internal error');
            if (!(error instanceof ApiError)) logger.error?.(error);
            const headers = apiError.retryAfter ? { 'retry-after': String(apiError.retryAfter) } : {};
            sendJson(request, response, apiError.status || 500, errorBody(apiError), headers);
        }
    });
    server.database = database;
    server.repository = repository;
    server.verifier = verifier;
    server.router = router;
    return server;
}
