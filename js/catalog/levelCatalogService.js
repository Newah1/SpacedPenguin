const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 100;

function clone(value) {
    if (value === undefined) return undefined;
    return typeof structuredClone === 'function'
        ? structuredClone(value)
        : JSON.parse(JSON.stringify(value));
}

function throwIfAborted(signal) {
    if (!signal?.aborted) return;
    if (typeof signal.throwIfAborted === 'function') signal.throwIfAborted();
    throw new DOMException('The level catalog request was cancelled.', 'AbortError');
}

function normalizePageSize(value) {
    const size = Number(value);
    if (!Number.isInteger(size) || size <= 0) return DEFAULT_PAGE_SIZE;
    return Math.min(size, MAX_PAGE_SIZE);
}

function parseLocalCursor(cursor) {
    if (cursor == null || cursor === '') return 0;
    const offset = Number(cursor);
    if (!Number.isSafeInteger(offset) || offset < 0) {
        throw new TypeError('Invalid local level catalog cursor.');
    }
    return offset;
}

function normalizeReference(reference, defaultSource) {
    if (typeof reference === 'string') return { id: reference, source: defaultSource };
    if (!reference?.id) throw new TypeError('A level catalog reference requires an id.');
    return { id: reference.id, source: reference.source || defaultSource };
}

export function createLevelSummary(record, source = record?.source || 'local') {
    if (!record?.id) throw new TypeError('A catalog record requires an id.');
    return {
        id: record.id,
        source,
        name: record.name || 'Untitled Level',
        description: record.description || '',
        thumbnail: record.thumbnail || '',
        author: record.author || '',
        tags: Array.isArray(record.tags) ? [...record.tags] : [],
        capabilities: {
            play: record.capabilities?.play !== false,
            edit: record.capabilities?.edit !== false
        },
        createdAt: record.createdAt || null,
        updatedAt: record.updatedAt || null,
        objectCount: Number.isInteger(record.objectCount) ? record.objectCount : undefined,
        publishedAt: record.publishedAt || null,
        definitionHash: record.definitionHash || null
    };
}

export class LocalLevelCatalogSource {
    constructor(repository, { id = 'local', label = 'My Levels' } = {}) {
        if (!repository) throw new TypeError('LocalLevelCatalogSource requires a repository.');
        this.repository = repository;
        this.id = id;
        this.label = label;
    }

    async query({ text = '', cursor = null, pageSize = DEFAULT_PAGE_SIZE, signal } = {}) {
        throwIfAborted(signal);
        const normalizedText = String(text).trim().toLocaleLowerCase();
        const offset = parseLocalCursor(cursor);
        const size = normalizePageSize(pageSize);
        const matches = this.repository.list().filter(record => {
            if (!normalizedText) return true;
            const searchable = [record.name, record.description, record.author, ...(record.tags || [])]
                .filter(Boolean)
                .join('\n')
                .toLocaleLowerCase();
            return searchable.includes(normalizedText);
        });
        const page = matches.slice(offset, offset + size);
        const nextOffset = offset + page.length;
        throwIfAborted(signal);
        return {
            items: page.map(record => createLevelSummary(record, this.id)),
            nextCursor: nextOffset < matches.length ? String(nextOffset) : null,
            total: matches.length
        };
    }

    async getDetails(id, { signal } = {}) {
        throwIfAborted(signal);
        const record = this.repository.load(id);
        if (!record) throw new Error(`Level "${id}" was not found.`);
        const summary = createLevelSummary(record, this.id);
        const objects = Array.isArray(record.level?.objects) ? record.level.objects : [];
        throwIfAborted(signal);
        return {
            ...summary,
            objectCount: objects.length,
            rules: clone(record.level?.rules || {}),
            bounds: clone(record.level?.bounds || null)
        };
    }

    async getDefinition(id, { signal } = {}) {
        throwIfAborted(signal);
        const record = this.repository.load(id);
        if (!record?.level) throw new Error(`Playable data for level "${id}" was not found.`);
        throwIfAborted(signal);
        return clone(record.level);
    }
}

export class LevelCatalogService {
    constructor({ sources = [], defaultSource = null } = {}) {
        this.sources = new Map();
        for (const source of sources) this.addSource(source);
        this.defaultSource = defaultSource || sources[0]?.id || null;
    }

    addSource(source) {
        if (!source?.id || typeof source.query !== 'function' ||
            typeof source.getDetails !== 'function' || typeof source.getDefinition !== 'function') {
            throw new TypeError('A level catalog source requires an id, query, getDetails, and getDefinition methods.');
        }
        this.sources.set(source.id, source);
        if (!this.defaultSource) this.defaultSource = source.id;
        return this;
    }

    getSources() {
        return [...this.sources.values()].map(source => ({ id: source.id, label: source.label || source.id }));
    }

    getSource(id = this.defaultSource) {
        const source = this.sources.get(id);
        if (!source) throw new Error(`Unknown level catalog source "${id}".`);
        return source;
    }

    async query(options = {}) {
        const source = this.getSource(options.source);
        const result = await source.query(options);
        return {
            ...result,
            items: (result.items || []).map(item => createLevelSummary(item, source.id))
        };
    }

    async getDetails(reference, options = {}) {
        const normalized = normalizeReference(reference, this.defaultSource);
        return this.getSource(normalized.source).getDetails(normalized.id, options);
    }

    async getDefinition(reference, options = {}) {
        const normalized = normalizeReference(reference, this.defaultSource);
        return this.getSource(normalized.source).getDefinition(normalized.id, options);
    }
}

export { DEFAULT_PAGE_SIZE };
