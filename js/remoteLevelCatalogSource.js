import { createLevelSummary } from './levelCatalogService.js';

function apiRoot(baseUrl) {
    const trimmed = baseUrl.replace(/\/$/, '');
    if (/\/api\/v1$/i.test(trimmed)) return trimmed;
    if (/\/api$/i.test(trimmed)) return `${trimmed}/v1`;
    return `${trimmed}/api/v1`;
}

function abortError(reason) {
    if (reason?.name === 'AbortError') return reason;
    return new DOMException('The level catalog request was cancelled.', 'AbortError');
}

export class RemoteLevelCatalogError extends Error {
    constructor(message, { code = 'REMOTE_CATALOG_ERROR', status = null, details = null, cause } = {}) {
        super(message, { cause });
        this.name = 'RemoteLevelCatalogError';
        this.code = code;
        this.status = status;
        this.details = details;
    }
}

function remoteSummary(record, source) {
    const summary = createLevelSummary({
        ...record,
        updatedAt: record.updatedAt || record.publishedAt,
        capabilities: { play: true, edit: false }
    }, source);
    return {
        ...summary,
        objectCount: Number.isInteger(record.objectCount) ? record.objectCount : undefined,
        publishedAt: record.publishedAt || null,
        definitionHash: record.definitionHash || null
    };
}

export class RemoteLevelCatalogSource {
    constructor({
        baseUrl,
        requestTimeoutMs = 8000,
        fetchImpl = globalThis.fetch,
        id = 'community',
        label = 'Community Levels'
    } = {}) {
        if (!baseUrl || typeof baseUrl !== 'string') throw new TypeError('RemoteLevelCatalogSource requires a baseUrl.');
        if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs <= 0) {
            throw new TypeError('RemoteLevelCatalogSource requires a positive integer requestTimeoutMs.');
        }
        if (typeof fetchImpl !== 'function') throw new TypeError('RemoteLevelCatalogSource requires fetch support.');
        this.id = id;
        this.label = label;
        this.baseUrl = apiRoot(baseUrl);
        this.requestTimeoutMs = requestTimeoutMs;
        // Native browser fetch must retain Window as its receiver.
        this.fetchImpl = fetchImpl.bind(globalThis);
        this.definitionCache = new Map();
    }

    async request(path, { signal } = {}) {
        if (signal?.aborted) throw abortError(signal.reason);
        const controller = new AbortController();
        let timedOut = false;
        const onAbort = () => controller.abort(signal.reason);
        signal?.addEventListener('abort', onAbort, { once: true });
        const timer = setTimeout(() => {
            timedOut = true;
            controller.abort();
        }, this.requestTimeoutMs);

        try {
            const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
                method: 'GET',
                headers: { Accept: 'application/json' },
                signal: controller.signal
            });
            let body = null;
            try {
                body = await response.json();
            } catch (error) {
                if (response.ok) {
                    throw new RemoteLevelCatalogError('The community level server returned invalid JSON.', {
                        code: 'INVALID_SERVER_RESPONSE', status: response.status, cause: error
                    });
                }
            }
            if (!response.ok) {
                const serverError = body?.error;
                throw new RemoteLevelCatalogError(
                    serverError?.message || `The community level server returned HTTP ${response.status}.`,
                    {
                        code: serverError?.code || 'REMOTE_REQUEST_FAILED',
                        status: response.status,
                        details: serverError?.details || null
                    }
                );
            }
            if (!body || typeof body !== 'object') {
                throw new RemoteLevelCatalogError('The community level server returned an invalid response.', {
                    code: 'INVALID_SERVER_RESPONSE', status: response.status
                });
            }
            return body;
        } catch (error) {
            if (error instanceof RemoteLevelCatalogError) throw error;
            if (signal?.aborted) throw abortError(signal.reason);
            if (timedOut) {
                throw new RemoteLevelCatalogError('The community level server took too long to respond.', {
                    code: 'REQUEST_TIMEOUT', cause: error
                });
            }
            throw new RemoteLevelCatalogError('Community levels are unavailable.', {
                code: 'NETWORK_ERROR', cause: error
            });
        } finally {
            clearTimeout(timer);
            signal?.removeEventListener('abort', onAbort);
        }
    }

    async query({ text = '', cursor = null, pageSize = 24, sort = 'newest', signal } = {}) {
        const allowedSorts = new Set(['newest', 'oldest', 'name']);
        const normalizedSort = allowedSorts.has(sort) ? sort : 'newest';
        const requestedSize = Number(pageSize);
        const limit = Number.isInteger(requestedSize) && requestedSize > 0
            ? Math.min(requestedSize, 100)
            : 24;
        const params = new URLSearchParams({ sort: normalizedSort, limit: String(limit) });
        const query = String(text).trim();
        if (query) params.set('q', query);
        if (cursor) params.set('cursor', cursor);
        const result = await this.request(`/levels?${params}`, { signal });
        if (!Array.isArray(result.items)) {
            throw new RemoteLevelCatalogError('The community level server returned an invalid level list.', {
                code: 'INVALID_SERVER_RESPONSE'
            });
        }
        return {
            items: result.items.map(item => remoteSummary(item, this.id)),
            nextCursor: result.nextCursor || null,
            total: Number.isInteger(result.total) ? result.total : null
        };
    }

    async getDetails(id, { signal } = {}) {
        const result = await this.request(`/levels/${encodeURIComponent(id)}`, { signal });
        if (result.definition && typeof result.definition === 'object') {
            this.definitionCache.set(id, structuredClone(result.definition));
        }
        const metadata = result.metadata && typeof result.metadata === 'object' ? result.metadata : result;
        if (!metadata.id) metadata.id = id;
        return remoteSummary(metadata, this.id);
    }

    async getDefinition(id, { signal } = {}) {
        const cached = this.definitionCache.get(id);
        if (cached) return structuredClone(cached);
        const result = await this.request(`/levels/${encodeURIComponent(id)}`, { signal });
        const definition = result.definition || result.level;
        if (!definition || typeof definition !== 'object' || Array.isArray(definition)) {
            throw new RemoteLevelCatalogError('The community level has no playable definition.', {
                code: 'INVALID_SERVER_RESPONSE'
            });
        }
        const cloned = typeof structuredClone === 'function'
            ? structuredClone(definition)
            : JSON.parse(JSON.stringify(definition));
        this.definitionCache.set(id, cloned);
        return typeof structuredClone === 'function'
            ? structuredClone(cloned)
            : JSON.parse(JSON.stringify(cloned));
    }
}
