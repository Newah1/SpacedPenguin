const DEFAULT_REQUEST_TIMEOUT_MS = 8000;
const MAX_REQUEST_TIMEOUT_MS = 60000;

function isLocalHostname(hostname) {
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1';
}

function normalizeBaseUrl(value, location = globalThis.location) {
    if (value == null || String(value).trim() === '') return null;
    if (typeof value !== 'string') throw new TypeError('levelServer.baseUrl must be a string or null.');

    const input = value.trim();
    let parsed;
    try {
        parsed = new URL(input, location?.href || 'http://localhost/');
    } catch {
        throw new TypeError('levelServer.baseUrl must be a valid HTTP(S) URL.');
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new TypeError('levelServer.baseUrl must use HTTP or HTTPS.');
    }
    if (parsed.username || parsed.password || parsed.search || parsed.hash) {
        throw new TypeError('levelServer.baseUrl cannot contain credentials, a query, or a fragment.');
    }
    if (parsed.protocol !== 'https:' && !isLocalHostname(parsed.hostname)) {
        throw new TypeError('levelServer.baseUrl must use HTTPS outside local development.');
    }

    // Preserve deployment-relative URLs so a static build can be moved between hosts.
    if (input.startsWith('/')) return parsed.pathname.replace(/\/$/, '') || '/';
    return parsed.href.replace(/\/$/, '');
}

function normalizeTimeout(value) {
    if (value == null) return DEFAULT_REQUEST_TIMEOUT_MS;
    const timeout = Number(value);
    if (!Number.isInteger(timeout) || timeout <= 0 || timeout > MAX_REQUEST_TIMEOUT_MS) {
        throw new TypeError(`levelServer.requestTimeoutMs must be an integer from 1 to ${MAX_REQUEST_TIMEOUT_MS}.`);
    }
    return timeout;
}

/**
 * Reads deployment-owned configuration without allowing a bad optional server
 * setting to prevent the standalone game from starting.
 */
export function readAppConfig(raw = globalThis.__SPACED_PENGUIN_APP_CONFIG__, {
    location = globalThis.location,
    logger = globalThis.console
} = {}) {
    const fallback = {
        levelServer: {
            baseUrl: null,
            requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS
        }
    };
    if (raw == null) return fallback;

    try {
        if (typeof raw !== 'object' || Array.isArray(raw)) throw new TypeError('App configuration must be an object.');
        const levelServer = raw.levelServer;
        if (levelServer == null) return fallback;
        if (typeof levelServer !== 'object' || Array.isArray(levelServer)) {
            throw new TypeError('levelServer configuration must be an object.');
        }
        return {
            levelServer: {
                baseUrl: normalizeBaseUrl(levelServer.baseUrl, location),
                requestTimeoutMs: normalizeTimeout(levelServer.requestTimeoutMs)
            }
        };
    } catch (error) {
        logger?.error?.(`Invalid Spaced Penguin app configuration; using local levels only. ${error.message}`);
        return fallback;
    }
}

export { DEFAULT_REQUEST_TIMEOUT_MS };
