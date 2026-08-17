import { SIMULATION_VERSION } from './runTranscript.js';
import { SCORE_VERSION } from './communityScore.js';

function resolveApiRoot(baseUrl) {
    const trimmed = String(baseUrl || '').replace(/\/$/, '');
    if (!trimmed) throw new TypeError('CommunityLevelClient requires a baseUrl.');
    if (/\/api\/v1$/i.test(trimmed)) return trimmed;
    if (/\/api$/i.test(trimmed)) return `${trimmed}/v1`;
    return `${trimmed}/api/v1`;
}

function cancelled(reason) {
    if (reason?.name === 'AbortError') return reason;
    return new DOMException('The community server request was cancelled.', 'AbortError');
}

export class CommunityLevelApiError extends Error {
    constructor(message, { code = 'COMMUNITY_API_ERROR', status = null, details = null, cause } = {}) {
        super(message, { cause });
        this.name = 'CommunityLevelApiError';
        this.code = code;
        this.status = status;
        this.details = details;
    }
}

export class CommunityLevelClient {
    constructor({ baseUrl, requestTimeoutMs = 8000, fetchImpl = globalThis.fetch } = {}) {
        if (typeof fetchImpl !== 'function') throw new TypeError('CommunityLevelClient requires fetch support.');
        if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs <= 0) {
            throw new TypeError('CommunityLevelClient requires a positive integer requestTimeoutMs.');
        }
        this.baseUrl = resolveApiRoot(baseUrl);
        this.requestTimeoutMs = requestTimeoutMs;
        // Browser fetch requires its receiver to be Window; invoking a stored
        // reference as this.fetchImpl() otherwise throws "Illegal invocation".
        this.fetchImpl = fetchImpl.bind(globalThis);
    }

    async request(path, { method = 'GET', body, signal } = {}) {
        if (signal?.aborted) throw cancelled(signal.reason);
        let encodedBody;
        try {
            encodedBody = body === undefined ? undefined : JSON.stringify(body);
        } catch (error) {
            throw new CommunityLevelApiError('The community submission could not be encoded.', {
                code: 'INVALID_REQUEST_PAYLOAD', cause: error
            });
        }
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
                method,
                headers: {
                    Accept: 'application/json',
                    ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
                },
                body: encodedBody,
                signal: controller.signal
            });
            let result = null;
            try {
                result = await response.json();
            } catch (error) {
                if (response.ok) {
                    throw new CommunityLevelApiError('The community server returned invalid JSON.', {
                        code: 'INVALID_SERVER_RESPONSE', status: response.status, cause: error
                    });
                }
            }
            if (!response.ok) {
                const serverError = result?.error;
                throw new CommunityLevelApiError(
                    serverError?.message || `The community server returned HTTP ${response.status}.`,
                    {
                        code: serverError?.code || 'COMMUNITY_REQUEST_FAILED',
                        status: response.status,
                        details: serverError?.details || null
                    }
                );
            }
            if (!result || typeof result !== 'object') {
                throw new CommunityLevelApiError('The community server returned an invalid response.', {
                    code: 'INVALID_SERVER_RESPONSE', status: response.status
                });
            }
            return result;
        } catch (error) {
            if (error instanceof CommunityLevelApiError) throw error;
            if (signal?.aborted) throw cancelled(signal.reason);
            if (timedOut) {
                throw new CommunityLevelApiError('The community server took too long to respond.', {
                    code: 'REQUEST_TIMEOUT', cause: error
                });
            }
            throw new CommunityLevelApiError('The community server is unavailable.', {
                code: 'NETWORK_ERROR', cause: error
            });
        } finally {
            clearTimeout(timer);
            signal?.removeEventListener('abort', onAbort);
        }
    }

    publishLevel(level, completionProof, { signal } = {}) {
        return this.request('/levels', {
            method: 'POST',
            signal,
            body: {
                schemaVersion: 1,
                simulationVersion: completionProof?.simulationVersion ?? SIMULATION_VERSION,
                level,
                completionProof
            }
        });
    }

    getScores(levelId, { limit = 10, cursor = null, signal } = {}) {
        const size = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : 10;
        const params = new URLSearchParams({ limit: String(size) });
        if (cursor) params.set('cursor', cursor);
        return this.request(`/levels/${encodeURIComponent(levelId)}/scores?${params}`, { signal });
    }

    submitScore(levelId, { initials, claimedScore, proof, idempotencyKey }, { signal } = {}) {
        return this.request(`/levels/${encodeURIComponent(levelId)}/scores`, {
            method: 'POST',
            signal,
            body: {
                initials: String(initials || '').trim().toUpperCase(),
                claimedScore,
                simulationVersion: proof?.simulationVersion ?? SIMULATION_VERSION,
                scoreVersion: SCORE_VERSION,
                proof,
                idempotencyKey
            }
        });
    }
}

export function createIdempotencyKey(cryptoImpl = globalThis.crypto) {
    if (typeof cryptoImpl?.randomUUID === 'function') return cryptoImpl.randomUUID();
    const bytes = new Uint8Array(16);
    if (typeof cryptoImpl?.getRandomValues !== 'function') {
        throw new Error('Secure random values are unavailable.');
    }
    cryptoImpl.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export { resolveApiRoot as resolveCommunityApiRoot };
