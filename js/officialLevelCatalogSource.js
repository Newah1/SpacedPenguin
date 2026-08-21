import { LEVEL_CATALOG_CONFIG, builtInLevelPath } from './config/gameConfig.js';
import { createLevelSummary } from './levelCatalogService.js';

function clone(value) {
    return typeof structuredClone === 'function'
        ? structuredClone(value)
        : JSON.parse(JSON.stringify(value));
}

function throwIfAborted(signal) {
    if (!signal?.aborted) return;
    if (typeof signal.throwIfAborted === 'function') signal.throwIfAborted();
    throw new DOMException('The official level request was cancelled.', 'AbortError');
}

function parseLevelId(id) {
    const level = Number(id);
    if (!Number.isInteger(level) || level < LEVEL_CATALOG_CONFIG.firstLevel ||
        level > LEVEL_CATALOG_CONFIG.shippedLevelCount) {
        throw new Error(`Official level "${id}" was not found.`);
    }
    return level;
}

export class OfficialLevelCatalogSource {
    constructor(levelLoader, {
        id = 'official',
        label = 'Official',
        fetchImpl = globalThis.fetch
    } = {}) {
        if (!levelLoader) throw new TypeError('OfficialLevelCatalogSource requires a level loader.');
        if (typeof fetchImpl !== 'function') throw new TypeError('OfficialLevelCatalogSource requires fetch support.');
        this.levelLoader = levelLoader;
        this.id = id;
        this.label = label;
        this.fetchImpl = fetchImpl.bind(globalThis);
        this.definitions = new Map();
    }

    captureLoadedDefinitions() {
        if (this.levelLoader.activeCollection !== 'shipped') return;
        for (const [level, definition] of this.levelLoader.levels) {
            if (Number.isInteger(level) && definition) this.definitions.set(level, clone(definition));
        }
    }

    async definitionFor(level, { signal } = {}) {
        throwIfAborted(signal);
        this.captureLoadedDefinitions();
        if (!this.definitions.has(level)) {
            const response = await this.fetchImpl(builtInLevelPath(level), { cache: 'no-store', signal });
            if (!response.ok) throw new Error(`Unable to load official level ${level}.`);
            this.definitions.set(level, await response.json());
        }
        throwIfAborted(signal);
        return clone(this.definitions.get(level));
    }

    async allDefinitions(options = {}) {
        const levels = [];
        for (let level = LEVEL_CATALOG_CONFIG.firstLevel;
            level <= LEVEL_CATALOG_CONFIG.shippedLevelCount; level++) {
            levels.push([level, await this.definitionFor(level, options)]);
        }
        return levels;
    }

    async query({ text = '', cursor = null, pageSize = 24, signal } = {}) {
        const normalizedText = String(text).trim().toLocaleLowerCase();
        const offset = cursor == null || cursor === '' ? 0 : Number(cursor);
        if (!Number.isSafeInteger(offset) || offset < 0) throw new TypeError('Invalid official level catalog cursor.');
        const size = Math.min(Math.max(Number(pageSize) || 24, 1), 100);
        const definitions = await this.allDefinitions({ signal });
        const matches = definitions.filter(([, definition]) => {
            if (!normalizedText) return true;
            return [definition.name, definition.description]
                .filter(Boolean).join('\n').toLocaleLowerCase().includes(normalizedText);
        });
        const page = matches.slice(offset, offset + size);
        const nextOffset = offset + page.length;
        return {
            items: page.map(([level, definition]) => createLevelSummary({
                id: String(level),
                name: definition.name || `Level ${level}`,
                description: definition.description || '',
                objectCount: Array.isArray(definition.objects) ? definition.objects.length : 0,
                capabilities: { play: true, edit: false }
            }, this.id)),
            nextCursor: nextOffset < matches.length ? String(nextOffset) : null,
            total: matches.length
        };
    }

    async getDefinition(id, options = {}) {
        return this.definitionFor(parseLevelId(id), options);
    }

    async getDetails(id, options = {}) {
        const level = parseLevelId(id);
        const definition = await this.definitionFor(level, options);
        return createLevelSummary({
            id: String(level),
            name: definition.name || `Level ${level}`,
            description: definition.description || '',
            objectCount: Array.isArray(definition.objects) ? definition.objects.length : 0,
            capabilities: { play: true, edit: false }
        }, this.id);
    }
}

export default OfficialLevelCatalogSource;
